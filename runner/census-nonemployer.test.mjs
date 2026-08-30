import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCensusNonemployerBaseline,
  discoverLatestNonemployer,
  NONEMPLOYER_SOURCE_FIELDS,
  nonemployerGeographyTotal,
  normalizeNonemployerRecord,
  verifyCensusNonemployerRelease,
} from "./census-nonemployer.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBuffer);
    localOffset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function sourceRow(overrides = {}) {
  return {
    GEOTYPE: "01",
    ST: "00",
    COUNTY: "000",
    CSA: "000",
    MSA: "00000",
    GEO_ID: "0100000US",
    GEO_LABEL: "United States",
    GEO_ID_F: "",
    NAICS2022: "00",
    NAICS2022_LABEL: "Total for all sectors",
    NAICS2022_F: "",
    LFO: "001",
    LFO_LABEL: "All establishments",
    RCPSZES: "001",
    RCPSZES_LABEL: "All establishments",
    YEAR: "2023",
    NESTAB: "5",
    NESTAB_F: "",
    NRCPTOT: "100",
    NRCPTOT_F: "",
    NRCPTOT_N: "0",
    NRCPTOT_N_F: "G",
    INDLEVEL: "2",
    SECTOR: "00",
    SUBSECTOR: "",
    ...overrides,
  };
}

function sourceArchive(rows, sourceFields = NONEMPLOYER_SOURCE_FIELDS) {
  const data = `#${sourceFields.join("|")}\n${rows.map((row) => sourceFields.map((field) => row[field] ?? "").join("|")).join("\n")}\n`;
  const fields = `Field_Name|Label|Field_Type|Field_Length|Number_of_Decimals\n${sourceFields.map((field) => `${field}|Fixture|CHARACTER|20|0`).join("\n")}\n`;
  return zipArchive([
    ["NS2300NONEMP.dat", data],
    ["NS2300NONEMP_FIELDS.txt", fields],
    ["NS2300NONEMP_README.txt", "Fixture Census Nonemployer source.\n"],
  ]);
}

test("normalizes Census Nonemployer totals with exact geography and source flags", () => {
  const normalized = normalizeNonemployerRecord(sourceRow({
    GEOTYPE: "03",
    ST: "01",
    COUNTY: "001",
    GEO_ID: "0500000US01001",
    GEO_LABEL: "Fixture County, Alabama",
    NRCPTOT: "0",
    NRCPTOT_F: "N",
  }), 2023, { source_release_id: "fixture-release", ingest_run_id: "fixture-run" });
  assert.equal(normalized.geography_type, "county");
  assert.equal(normalized.geoid, "01001");
  assert.equal(normalized.measures.receipts_thousands_usd, 0);
  assert.equal(normalized.measures.receipts_flag, "N");
  assert.equal(normalized.provenance.source_release_id, "fixture-release");
  const total = nonemployerGeographyTotal(normalized);
  assert.equal(total.nonemployer_establishments, 5);
  assert.match(total.universe, /no-paid-employees/);
});

test("discovers the newest complete Census Nonemployer archive", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/data/")) return new Response('<a href="2022/">2022</a><a href="2023/">2023</a>');
    if (String(url).endsWith("/2023/NS2300NONEMP.zip")) return new Response(null, { status: 200, headers: { "content-length": "123" } });
    return new Response(null, { status: 404 });
  };
  const discovered = await discoverLatestNonemployer({ fetchImpl });
  assert.equal(discovered.referenceYear, 2023);
  assert.match(discovered.archiveUrl, /NS2300NONEMP\.zip$/);
  assert.equal(requests.filter((request) => request.method === "HEAD").length, 1);
});

test("builds and independently verifies a governed Nonemployer baseline", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-nonemployer-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const rows = [
    sourceRow(),
    sourceRow({ NAICS2022: "54", NAICS2022_LABEL: "Professional services", INDLEVEL: "2", SECTOR: "54" }),
    sourceRow({ GEOTYPE: "02", ST: "01", GEO_ID: "0400000US01", GEO_LABEL: "Alabama" }),
    sourceRow({ GEOTYPE: "03", ST: "01", COUNTY: "001", GEO_ID: "0500000US01001", GEO_LABEL: "Fixture County", NESTAB: "4", NRCPTOT: "80" }),
    sourceRow({ GEOTYPE: "09", ST: "01", COUNTY: "000", MSA: "12345", GEO_ID: "310M700US12345", GEO_LABEL: "Fixture Metro" }),
  ];
  const archive = sourceArchive(rows);
  const fetchImpl = async (url, options = {}) => {
    if ((options.method ?? "GET") === "HEAD") return new Response(null, { status: 200, headers: { "content-length": String(archive.length) } });
    return new Response(archive, { status: 200, headers: { "content-type": "application/zip", "content-length": String(archive.length) } });
  };
  const result = await buildCensusNonemployerBaseline({
    outputRoot: root,
    year: 2023,
    fetchImpl,
    now: () => new Date("2026-08-30T12:00:00.000Z"),
    logger: () => {},
    qualityMinimums: {
      national_rows: 2,
      state_rows: 1,
      county_rows: 1,
      national_totals: 1,
      state_totals: 1,
      county_totals: 1,
    },
  });
  const verified = await verifyCensusNonemployerRelease(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.source_rows_all_geographies, 5);
  assert.equal(verified.coverage.national_nonemployer_establishments, 5);
  assert.equal(verified.coverage.county_nonemployer_establishments, 4);
  assert.equal(verified.coverage.nonemployer_establishments_not_allocated_to_county, 1);
  const pointer = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(pointer.release_id, result.manifest.release_id);
});

test("rejects a Census Nonemployer archive with schema drift", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-nonemployer-drift-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const archive = sourceArchive([sourceRow()], NONEMPLOYER_SOURCE_FIELDS.slice(0, -1));
  const fetchImpl = async (url, options = {}) => (options.method === "HEAD"
    ? new Response(null, { status: 200 })
    : new Response(archive, { status: 200 }));
  await assert.rejects(buildCensusNonemployerBaseline({
    outputRoot: root,
    year: 2023,
    fetchImpl,
    logger: () => {},
    qualityMinimums: {},
  }), /companion field list does not match the pinned schema/);
});
