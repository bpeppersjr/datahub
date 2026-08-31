import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildLaActiveBusinesses,
  LA_ACTIVE_BUSINESS_FIELDS,
  LA_ACTIVE_BUSINESS_SCHEMA,
  LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT,
  normalizeLaActiveBusinessLocation,
  requestLaJson,
  schemaFingerprint,
  verifyLaActiveBusinesses,
} from "./la-active-businesses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "6rrh-rzua",
    name: "Listing of Active Businesses",
    attribution: "Office of Finance",
    licenseId: "CC0_10",
    rowsUpdatedAt: 1_786_808_242,
    sourceRecordCount: 4,
    columns: LA_ACTIVE_BUSINESS_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function locationAccount(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    location_account: "0000000108-0001-3",
    business_name: "Fixture Los Angeles Company LLC",
    dba_name: "Fixture Market|Fixture Shop",
    street_address: "1727 CRENSHAW BLVD",
    city: "LOS ANGELES",
    zip_code: "90019-6037",
    naics: "445110",
    primary_naics_description: "Supermarkets and other grocery stores",
    council_district: "10",
    location_start_date: "1991-05-15T00:00:00.000",
    location_end_date: null,
    location_1: { latitude: "34.0425", longitude: "-118.3295", human_address: "{}" },
    ...overrides,
  };
}

function context() {
  return {
    runId: "la-fixture-run",
    retrievedAt: "2026-08-31T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-15T14:17:22.000Z",
    sourceReleaseId: "la-fixture-source",
    baselineByZip: new Map([
      ["90019", { postal_label: { preferred_state: "CA" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:90019", geoid: "90019" } }],
      ["90026", { postal_label: { preferred_state: "CA" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:90026", geoid: "90026" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["90019", "90026", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode.startsWith("9") && zipCode !== "99999" ? { preferred_state: "CA" } : null,
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
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the 12 selected Los Angeles fields and excludes mailing and computed fields", () => {
  assert.equal(LA_ACTIVE_BUSINESS_FIELDS.length, 12);
  assert.equal(sha256(LA_ACTIVE_BUSINESS_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT);
  for (const excluded of ["mailing_address", "mailing_city", "mailing_zip_code", "location_description", ":@computed_region_qz3q_ghft"]) {
    assert.equal(LA_ACTIVE_BUSINESS_FIELDS.includes(excluded), false);
  }
});

test("normalizes a source-defined active location, ZIP+4, DBAs, NAICS, and coordinates conservatively", () => {
  const normalized = normalizeLaActiveBusinessLocation(locationAccount({ mailing_address: "PRIVATE" }), context());
  assert.equal(normalized.entity_candidates.physical_site_id, "site:la_finance_location_0000000108_0001_3");
  assert.equal(normalized.entity_candidates.establishment_id, "establishment:la_finance_location_0000000108_0001_3");
  assert.equal(normalized.address.postal_code, "90019-6037");
  assert.equal(normalized.address.state, "CA");
  assert.deepEqual(normalized.other_names, ["Fixture Market", "Fixture Shop"]);
  assert.equal(normalized.industry_profile.naics_code, "445110");
  assert.deepEqual(normalized.location.coordinates, [-118.3295, 34.0425]);
  assert.equal(normalized.source_status.status, "Active (source-defined)");
  assert.equal(normalized.export_policy, "local-review-only");
  assert.equal(JSON.stringify(normalized).includes("PRIVATE"), false);
});

test("accepts source ZIP values with a blank extension but rejects non-US or incomplete locations", () => {
  const normalized = normalizeLaActiveBusinessLocation(locationAccount({ zip_code: "90026-" }), context());
  assert.equal(normalized.address.zip_code, "90026");
  assert.equal(normalized.address.postal_code_status, "normalized-zip5-with-blank-extension");
  assert.throws(() => normalizeLaActiveBusinessLocation(locationAccount({ zip_code: "V8X1R-1" }), context()), /invalid-or-unmapped-us-zip/);
  assert.throws(() => normalizeLaActiveBusinessLocation(locationAccount({ zip_code: "10001" }), context()), /invalid-or-unmapped-us-zip/);
  assert.throws(() => normalizeLaActiveBusinessLocation(locationAccount({ street_address: null }), context()), /missing-business-location-address/);
});

test("retries transient Los Angeles source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestLaJson("https://data.lacity.org/api/views/6rrh-rzua", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestLaJson("https://data.lacity.org/api/views/6rrh-rzua", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds, quarantines invalid locations, and independently verifies a complete Los Angeles release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-la-active-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    locationAccount(),
    locationAccount({ socrata_row_id: "row-bbbb", location_account: "0000000109-0001-1", zip_code: "90026-", council_district: "13", location_1: null }),
    locationAccount({ socrata_row_id: "row-cccc", location_account: "0000000110-0001-9", business_name: "Fixture Remote Company", city: "VICTORIA", zip_code: "V8X1R-1", council_district: "0", location_1: null }),
    locationAccount({ socrata_row_id: "row-dddd", location_account: "0000000111-0001-7", street_address: null, city: null, zip_code: "90019-", council_district: "10", location_1: null }),
  ];
  const result = await buildLaActiveBusinesses({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumLocationAccounts: 1,
    maximumQuarantineRate: 0.75,
    logger: () => {},
    now: () => new Date("2026-08-31T20:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_location_accounts, 4);
  assert.equal(result.manifest.coverage.normalized_us_location_accounts, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 2);
  assert.equal(result.manifest.coverage.source_geocoded_locations, 1);
  assert.equal(result.manifest.coverage.physical_sites, 2);
  assert.equal(result.manifest.coverage.establishments, 2);
  const verified = await verifyLaActiveBusinesses(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-la-active-business-location-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "la-active-business-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks schema drift, unapproved source fields, duplicate identities, excess quarantine, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-la-active-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "zip_code" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1 });
  await assert.rejects(() => buildLaActiveBusinesses({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [locationAccount()], minimumLocationAccounts: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildLaActiveBusinesses({
    outputRoot: path.join(root, "private-field"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [locationAccount({ mailing_address: "PRIVATE" })], minimumLocationAccounts: 1, logger: () => {},
  }), /Unapproved Los Angeles source field mailing_address/);
  await assert.rejects(() => buildLaActiveBusinesses({
    outputRoot: path.join(root, "duplicate"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [locationAccount(), locationAccount({ socrata_row_id: "row-bbbb" })], minimumLocationAccounts: 1, logger: () => {},
  }), /Duplicate Los Angeles location account/);
  await assert.rejects(() => buildLaActiveBusinesses({
    outputRoot: path.join(root, "quarantine"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [locationAccount(), locationAccount({ socrata_row_id: "row-bbbb", location_account: "0000000109-0001-1", zip_code: "FOREIGN" })],
    minimumLocationAccounts: 1, maximumQuarantineRate: 0.1, logger: () => {},
  }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildLaActiveBusinesses({
    outputRoot: path.join(root, "cancelled"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [locationAccount()], minimumLocationAccounts: 1, signal: controller.signal, logger: () => {},
  }), { name: "AbortError" });
});
