import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BEA_CAGDP1_FIXED_FIELDS,
  buildBeaRegionalGdp,
  normalizeBeaGdpRecord,
  parseBeaCagdp1Csv,
  parseBeaMeasure,
  verifyBeaRegionalGdpRelease,
} from "./bea-regional-gdp.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const LINES = {
  "1": ["Real GDP (thousands of chained 2017 dollars)", "Thousands of chained 2017 dollars"],
  "2": ["Chain-type quantity indexes for real GDP", "Quantity index"],
  "3": ["Current-dollar GDP (thousands of current dollars)", "Thousands of dollars"],
};

function sourceCsv(areas = [
  { fips: "00000", name: "United States", values: { "1": "1000", "2": "100", "3": "1100" } },
  { fips: "01000", name: "Alabama", values: { "1": "100", "2": "101.25", "3": "120" } },
  { fips: "01001", name: "Autauga County, AL", values: { "1": "10", "2": "(NM)", "3": "12" } },
  { fips: "01901", name: "Fixture combined area, AL*", values: { "1": "(NA)", "2": "(NA)", "3": "(NA)" } },
]) {
  const rows = [[...BEA_CAGDP1_FIXED_FIELDS, "2023", "2024"]];
  for (const area of areas) {
    for (const lineCode of ["1", "2", "3"]) {
      rows.push([
        area.fips,
        area.name,
        "",
        "CAGDP1",
        lineCode,
        "...",
        LINES[lineCode][0],
        LINES[lineCode][1],
        area.values[lineCode],
        area.values[lineCode],
      ]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
    + '"Note: See the included footnote file."\r\n'
    + '"CAGDP1: County gross domestic product (GDP) summary "\r\n'
    + '"Last updated: February 5, 2026-- fixture release."\r\n'
    + '"U.S. Bureau of Economic Analysis"\r\n';
}

async function writeGeographyFixture(root) {
  const geographyRoot = path.join(root, "geography");
  const releaseDirectory = path.join(geographyRoot, "releases", "fixture-geography");
  const states = [{
    geo_id: "state:01",
    geo_type: "state",
    geoid: "01",
    name: "Alabama",
    state_fips: "01",
    county_fips: null,
    is_50_states_or_dc: true,
  }];
  const counties = [
    { geo_id: "county:01001", geo_type: "county", geoid: "01001", name: "Autauga County", state_fips: "01", county_fips: "001" },
    { geo_id: "county:01003", geo_type: "county", geoid: "01003", name: "Baldwin County", state_fips: "01", county_fips: "003" },
  ];
  const stateBuffer = Buffer.from(`${states.map(JSON.stringify).join("\n")}\n`);
  const countyBuffer = Buffer.from(`${counties.map(JSON.stringify).join("\n")}\n`);
  await mkdir(path.join(releaseDirectory, "derived", "index"), { recursive: true });
  await writeFile(path.join(releaseDirectory, "derived", "index", "states.jsonl"), stateBuffer);
  await writeFile(path.join(releaseDirectory, "derived", "index", "counties.jsonl"), countyBuffer);
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "us-census-geography",
    release_id: "fixture-geography",
    status: "published",
    complete_national_release: true,
    artifacts: [
      { path: "derived/index/states.jsonl", bytes: stateBuffer.length, sha256: sha256(stateBuffer), record_count: states.length },
      { path: "derived/index/counties.jsonl", bytes: countyBuffer.length, sha256: sha256(countyBuffer), record_count: counties.length },
    ],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(geographyRoot, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({
    dataset_id: "us-census-geography",
    release_id: manifest.release_id,
    manifest: "releases/fixture-geography/manifest.json",
  })}\n`);
  return pointerPath;
}

test("preserves BEA not-available and not-meaningful flags", () => {
  assert.deepEqual(parseBeaMeasure("(NA)", 1_000), { value: null, flag: "(NA)" });
  assert.deepEqual(parseBeaMeasure("(NM)"), { value: null, flag: "(NM)" });
  assert.deepEqual(parseBeaMeasure("", 1_000), { value: null, flag: "missing" });
  assert.deepEqual(parseBeaMeasure("12", 1_000), { value: 12_000, flag: null });
  assert.throws(() => parseBeaMeasure("suppressed"), /Unexpected BEA measure/);
});

test("normalizes exact county GDP without geometry or ZIP allocation", () => {
  const parsed = parseBeaCagdp1Csv(sourceCsv());
  const area = parsed.areas.find((candidate) => candidate.geo_fips === "01001");
  const record = normalizeBeaGdpRecord(area, {
    geo_type: "county",
    geoid: "01001",
    name: "Autauga County",
    state_fips: "01",
    county_fips: "001",
  }, 2024, {
    source_release_id: "fixture-source",
    ingest_run_id: "fixture-run",
    geography_release_id: "fixture-geography",
  });
  assert.equal(record.gdp_current_dollars, 12_000);
  assert.equal(record.quantity_index_2017_100, null);
  assert.equal(record.quantity_index_2017_100_flag, "(NM)");
  assert.equal(record.provenance.source_release_id, "fixture-source");
  assert.equal("geometry" in record, false);
  assert.equal("zip_code" in record, false);
});

test("rejects CAGDP1 header and line-contract schema drift", () => {
  assert.throws(
    () => parseBeaCagdp1Csv(sourceCsv().replace("GeoFIPS", "GeoCode")),
    /fixed fields do not match/,
  );
  assert.throws(
    () => parseBeaCagdp1Csv(sourceCsv().replace(",Quantity index,", ",Wrong unit,")),
    /line contract drift/,
  );
});

test("builds, reconciles, and independently verifies a governed BEA GDP release", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-bea-gdp-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const geographyPointer = await writeGeographyFixture(root);
  const sourcePath = path.join(root, "CAGDP1.zip");
  await writeFile(sourcePath, zipArchive([
    ["CAGDP1__ALL_AREAS_2023_2024.csv", sourceCsv()],
    ["CAGDP1_AK_2023_2024.csv", "official companion fixture\n"],
  ]));
  const result = await buildBeaRegionalGdp({
    outputRoot: path.join(root, "output"),
    geographyPointer,
    sourcePath,
    now: () => new Date("2026-09-03T12:00:00.000Z"),
    logger: () => {},
    qualityMinimums: { state_records: 1, county_records: 1 },
  });
  const verified = await verifyBeaRegionalGdpRelease(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.reference_year, 2024);
  assert.equal(verified.coverage.direct_state_matches, 1);
  assert.equal(verified.coverage.direct_county_matches, 1);
  assert.equal(verified.coverage.governed_county_gaps, 1);
  assert.equal(verified.coverage.source_area_gaps, 2);
  const pointer = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(pointer.release_id, result.manifest.release_id);
  assert.deepEqual(result.manifest.artifacts.map((artifact) => artifact.path).sort(), [
    "derived/county-gdp.jsonl",
    "derived/coverage-gaps.jsonl",
    "derived/state-gdp.jsonl",
    "source/CAGDP1.zip",
  ]);
  const gaps = (await readFile(path.join(result.releaseDirectory, "derived", "coverage-gaps.jsonl"), "utf8"))
    .trim().split("\n").map(JSON.parse);
  assert.equal(gaps.every((gap) => gap.allocation_status === "not-allocated"), true);
  assert.equal(gaps.some((gap) => "zip_code" in gap || "geometry" in gap), false);

  await writeFile(path.join(result.releaseDirectory, "derived", "state-gdp.jsonl"), "{}\n");
  await assert.rejects(
    verifyBeaRegionalGdpRelease(path.join(result.releaseDirectory, "manifest.json")),
    /verification failed/,
  );
});

test("acquires only the official archive endpoint with redirects denied", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-bea-gdp-network-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const geographyPointer = await writeGeographyFixture(root);
  const archive = zipArchive([["CAGDP1__ALL_AREAS_2023_2024.csv", sourceCsv()]]);
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), redirect: options.redirect });
    return new Response(archive, {
      status: 200,
      headers: { "content-length": String(archive.length), "content-type": "application/x-zip-compressed" },
    });
  };
  await buildBeaRegionalGdp({
    outputRoot: path.join(root, "output"),
    geographyPointer,
    fetchImpl,
    logger: () => {},
    qualityMinimums: { state_records: 1, county_records: 1 },
  });
  assert.deepEqual(requests, [{
    url: "https://apps.bea.gov/regional/zip/CAGDP1.zip",
    redirect: "error",
  }]);
});

test("rejects unsafe archive entries before publication", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-bea-gdp-unsafe-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const geographyPointer = await writeGeographyFixture(root);
  const sourcePath = path.join(root, "CAGDP1.zip");
  await writeFile(sourcePath, zipArchive([
    ["CAGDP1__ALL_AREAS_2023_2024.csv", sourceCsv()],
    ["../escape.txt", "unsafe"],
  ]));
  await assert.rejects(buildBeaRegionalGdp({
    outputRoot: path.join(root, "output"),
    geographyPointer,
    sourcePath,
    logger: () => {},
    qualityMinimums: { state_records: 1, county_records: 1 },
  }), /unsafe path/);
});
