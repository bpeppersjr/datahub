import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip, deflateRawSync } from "node:zlib";
import {
  buildEpaEcho,
  EPA_ECHO_HEADERS,
  EPA_ECHO_SCHEMA_FINGERPRINT,
  normalizeEchoFacility,
  verifyEpaEcho,
} from "./epa-echo.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name, content) {
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
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  const centralOffset = local.length + nameBuffer.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuffer.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuffer, compressed, central, nameBuffer, end]);
}

function csv(headers, rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))].map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

function facility(overrides = {}) {
  return {
    REGISTRY_ID: "110000000001",
    FAC_NAME: "Fixture Manufacturing",
    FAC_STREET: "10 Main St",
    FAC_CITY: "Chicago",
    FAC_STATE: "IL",
    FAC_ZIP: "60601-1234",
    FAC_COUNTY: "Cook",
    FAC_FIPS_CODE: "17031",
    FAC_EPA_REGION: "05",
    FAC_ACTIVE_FLAG: "Y",
    FAC_LAT: "41.885",
    FAC_LONG: "-87.622",
    FAC_COLLECTION_METHOD: "Zip Code Centroid",
    FAC_ACCURACY_METERS: "10000",
    FAC_DERIVED_STCTY_FIPS: "17031",
    FAC_DERIVED_ZIP: "60601",
    AIR_FLAG: "Y",
    AIR_IDS: "IL0001 IL0002",
    NPDES_FLAG: "N",
    FAC_NAICS_CODES: "311111 311119",
    FAC_SIC_CODES: "2048",
    DFR_URL: "https://echo.epa.gov/detailed-facility-report?fid=110000000001",
    ...overrides,
  };
}

function context() {
  return {
    runId: "echo-fixture-run",
    retrievedAt: "2026-08-30T16:00:00.000Z",
    sourceUpdatedAt: "2026-08-30T06:36:03.000Z",
    sourceReleaseId: "echo-fixture-source",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00956", "60601", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the documented 133-column EPA ECHO Exporter schema", () => {
  assert.equal(EPA_ECHO_HEADERS.length, 133);
  assert.equal(sha256(EPA_ECHO_HEADERS.join("\u0000")), EPA_ECHO_SCHEMA_FINGERPRINT);
});

test("normalizes an ECHO-active facility without inferring an organization", () => {
  const normalized = normalizeEchoFacility(facility(), context());
  assert.equal(normalized.entity_candidates.organization_id, undefined);
  assert.equal(normalized.address.postal_code, "60601-1234");
  assert.equal(normalized.reported_location.precision_warning, "source-coordinate-is-a-centroid-not-a-premise-level-location");
  assert.deepEqual(normalized.source_classifications.naics_codes, ["311111", "311119"]);
  assert.deepEqual(normalized.program_associations.air.identifiers, ["IL0001", "IL0002"]);
  assert.equal(normalized.source_status.value, "epa-echo-active-program-facility-as-of-source-release");
  assert.throws(() => normalizeEchoFacility(facility({ FAC_ACTIVE_FLAG: "N" }), context()), /not-echo-active/);
  assert.throws(() => normalizeEchoFacility(facility({ FAC_ZIP: "00000" }), context()), /missing-physical-address/);
});

test("builds and independently verifies a governed EPA ECHO active-facility release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-echo-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    facility(),
    facility({ REGISTRY_ID: "110000000002", FAC_NAME: "Island Utility", FAC_STATE: "PR", FAC_ZIP: "00956", FAC_CITY: "Bayamon", FAC_STREET: "20 Isla Rd", FAC_FIPS_CODE: "72021", FAC_DERIVED_STCTY_FIPS: "72021", FAC_DERIVED_ZIP: "00956" }),
    facility({ REGISTRY_ID: "110000000003", FAC_NAME: "Missing Address", FAC_STREET: "" }),
    facility({ REGISTRY_ID: "110000000004", FAC_ACTIVE_FLAG: "N" }),
    facility({ REGISTRY_ID: "", FAC_ACTIVE_FLAG: "" }),
    facility({ REGISTRY_ID: "110000000001", FAC_NAME: "Duplicate Active ID" }),
  ];
  const archive = zipEntry("ECHO_EXPORTER.csv", csv(EPA_ECHO_HEADERS, rows));
  const archivePath = path.join(root, "echo_exporter.zip");
  await writeFile(archivePath, archive);
  const result = await buildEpaEcho({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    archivePath,
    sourceMetadata: {
      content_length: archive.length,
      last_modified: "Sun, 30 Aug 2026 06:36:03 GMT",
      etag: "fixture",
      content_type: "application/zip",
    },
    minimumActiveFacilities: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_records, 6);
  assert.equal(result.manifest.coverage.source_active_y_records, 4);
  assert.equal(result.manifest.coverage.source_inactive_n_records_excluded, 1);
  assert.equal(result.manifest.coverage.source_unknown_blank_active_flag_records_excluded, 1);
  assert.equal(result.manifest.coverage.source_missing_registry_id_records, 1);
  assert.equal(result.manifest.coverage.source_duplicate_registry_id_records, 1);
  assert.equal(result.manifest.coverage.accepted_active_facilities, 2);
  assert.equal(result.manifest.coverage.quarantined_active_or_unexpected_records, 2);
  const verified = await verifyEpaEcho(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const partition = result.manifest.artifacts.find((artifact) => artifact.path === "derived/facilities/zip-prefix=6.jsonl.gz");
  const records = await gunzipRecords(path.join(result.releaseDirectory, partition.path));
  assert.equal(records.length, 1);
  assert.equal(records[0].entity_candidates.organization_id, undefined);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "epa-echo-source-exporter-zip");
  assert.equal(sourceArtifact.export_policy, "internal");
});

test("blocks unpinned EPA ECHO Exporter schema drift", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-echo-drift-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const headers = [...EPA_ECHO_HEADERS, "UNEXPECTED"];
  const archive = zipEntry("ECHO_EXPORTER.csv", csv(headers, [facility()]));
  const archivePath = path.join(root, "echo_exporter.zip");
  await writeFile(archivePath, archive);
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildEpaEcho({
    outputRoot: path.join(root, "output"),
    zbpPointer,
    archivePath,
    sourceMetadata: {
      content_length: archive.length,
      last_modified: "Sun, 30 Aug 2026 06:36:03 GMT",
      etag: "fixture",
      content_type: "application/zip",
    },
    minimumActiveFacilities: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  }), /schema changed/);
});
