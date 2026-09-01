import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildChicagoActiveBusinessLicenses,
  CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS,
  CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA,
  CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  normalizeChicagoLicensedSite,
  requestChicagoJson,
  schemaFingerprint,
  verifyChicagoActiveBusinessLicenses,
} from "./chicago-active-business-licenses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "uupf-x98q",
    name: "Business Licenses - Current Active",
    attribution: "City of Chicago",
    licenseId: "SEE_TERMS_OF_USE",
    provenance: "official",
    modifyingViewUid: "r5kz-chrr",
    queryString: 'SELECT `id` WHERE (`expiration_date` > "2026-08-31T00:00:00" :: floating_timestamp) AND (upper(`license_status`) = "AAI") ORDER BY `license_start_date` DESC NULL LAST',
    rowsUpdatedAt: 1_787_997_507,
    sourceRecordCount: 5,
    columns: CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function license(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    id: "1001001-20260801",
    license_id: "1001001",
    account_number: "100100",
    site_number: "1",
    legal_name: "FIXTURE CHICAGO MARKET LLC",
    doing_business_as_name: "FIXTURE MARKET",
    address: "100 N STATE ST",
    city: "CHICAGO",
    state: "IL",
    zip_code: "60601",
    ward: "42",
    precinct: "1",
    police_district: "1",
    community_area: "32",
    community_area_name: "LOOP",
    neighborhood: "THE LOOP",
    license_code: "1010",
    license_description: "Limited Business License",
    business_activity_id: "894 | 904",
    business_activity: "Hair Services | Retail Sales of General Merchandise",
    license_number: "1001001",
    application_type: "RENEW",
    license_start_date: "2026-08-01T00:00:00",
    expiration_date: "2028-07-31T00:00:00",
    date_issued: "2026-07-20T00:00:00",
    license_status: "AAI",
    license_status_change_date: null,
    latitude: "41.8837",
    longitude: "-87.6278",
    ...overrides,
  };
}

function context() {
  return {
    runId: "chicago-fixture-run",
    retrievedAt: "2026-08-31T22:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-29T08:38:27.000Z",
    sourceReleaseId: "chicago-fixture-source",
    sourceFilterDate: "2026-08-31",
    baselineByZip: new Map([
      ["60601", { postal_label: { preferred_state: "IL" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }],
      ["60611", { postal_label: { preferred_state: "IL" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60611", geoid: "60611" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["60601", "60611", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode.startsWith("606") ? { preferred_state: "IL" } : null,
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

test("pins the selected Chicago fields and current-active view semantics", () => {
  assert.equal(CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS.length, 29);
  assert.equal(sha256(CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  for (const excluded of ["owner_name", "officer_name", "contact_email", "payment_date", "conditional_approval", "location"]) {
    assert.equal(CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS.includes(excluded), false);
  }
});

test("groups multiple active license rows into one provisional licensed site", () => {
  const records = [
    license(),
    license({ socrata_row_id: "row-bbbb", id: "1001002-20260801", license_id: "1001002", license_number: "1001002", license_code: "1006", license_description: "Retail Food Establishment", business_activity_id: "775", business_activity: "Retail Sale of Food" }),
  ];
  const normalized = normalizeChicagoLicensedSite(records, context());
  assert.equal(normalized.normalized_record_id, "chicago-active-business:account:100100:site:1");
  assert.equal(normalized.entity_candidates.organization_id, "organization:chicago_bacp_account_100100");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:chicago_bacp_account_100100_site_1");
  assert.equal(normalized.active_licenses.length, 2);
  assert.equal(normalized.address.zip_code, "60601");
  assert.deepEqual(normalized.location.coordinates, [-87.6278, 41.8837]);
  assert.equal(normalized.source_status.status, "Active license (source-defined)");
  assert.equal(normalized.export_policy, "local-review-only");
});

test("rejects publisher-redacted, conflicting, expired, and non-AAI site groups", () => {
  assert.throws(() => normalizeChicagoLicensedSite([license({ address: "[REDACTED FOR PRIVACY]" })], context()), /publisher-redacted-address/);
  assert.throws(() => normalizeChicagoLicensedSite([license(), license({ socrata_row_id: "row-bbbb", address: "200 N STATE ST" })], context()), /conflicting-site-addresses/);
  assert.throws(() => normalizeChicagoLicensedSite([license({ license_status: "AAC" })], context()), /source-row-not-current-active/);
  assert.throws(() => normalizeChicagoLicensedSite([license({ expiration_date: "2026-08-31T00:00:00" })], context()), /source-row-not-current-active/);
  assert.throws(() => normalizeChicagoLicensedSite([license({ zip_code: "00000" })], context()), /invalid-or-unmapped-us-zip/);
});

test("retries transient Chicago responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestChicagoJson("https://data.cityofchicago.org/api/views/uupf-x98q", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestChicagoJson("https://data.cityofchicago.org/api/views/uupf-x98q", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds grouped sites, quarantines invalid groups, and independently verifies a complete release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-chicago-active-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    license(),
    license({ socrata_row_id: "row-bbbb", id: "1001002-20260801", license_id: "1001002", license_number: "1001002", license_code: "1006", license_description: "Retail Food Establishment" }),
    license({ socrata_row_id: "row-cccc", id: "2002001-20260729", license_id: "2002001", license_number: "2002001", account_number: "200200", site_number: "2", address: "1037 N RUSH ST", zip_code: "60611", legal_name: "SECOND FIXTURE LLC", doing_business_as_name: "SECOND FIXTURE", latitude: null, longitude: null }),
    license({ socrata_row_id: "row-dddd", id: "3003001-20260516", license_id: "3003001", license_number: "3003001", account_number: "300300", address: "[REDACTED FOR PRIVACY]" }),
    license({ socrata_row_id: "row-eeee", id: "4004001-20260516", license_id: "4004001", license_number: "4004001", account_number: "400400", zip_code: "00000" }),
  ];
  const result = await buildChicagoActiveBusinessLicenses({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumLicenseRecords: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-08-31T22:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_license_records, 5);
  assert.equal(result.manifest.coverage.accepted_active_license_records, 3);
  assert.equal(result.manifest.coverage.normalized_licensed_sites, 2);
  assert.equal(result.manifest.coverage.organizations, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 2);
  assert.equal(result.manifest.coverage.quarantined_site_groups, 2);
  assert.equal(result.manifest.coverage.source_geocoded_sites, 1);
  const verified = await verifyChicagoActiveBusinessLicenses(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-chicago-active-business-license-site-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.reduce((sum, record) => sum + record.active_licenses.length, 0), 3);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks source-filter drift, schema drift, unapproved fields, duplicate rows, excess quarantine, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-chicago-active-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({ outputRoot: path.join(root, "filter"), zbpPointer, catalogMetadata: metadata({ queryString: "SELECT id" }), sourceRecords: [license()], minimumLicenseRecords: 1, logger: () => {} }), /current-active view semantics/);
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "zip_code" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1 });
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [license()], minimumLicenseRecords: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({
    outputRoot: path.join(root, "private-field"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [license({ owner_name: "PRIVATE" })], minimumLicenseRecords: 1, logger: () => {},
  }), /Unapproved Chicago source field owner_name/);
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({
    outputRoot: path.join(root, "duplicate"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [license(), license()], minimumLicenseRecords: 1, logger: () => {},
  }), /Duplicate Chicago Socrata row/);
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({
    outputRoot: path.join(root, "quarantine"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [license(), license({ socrata_row_id: "row-bbbb", account_number: "200200", address: "[REDACTED FOR PRIVACY]" })],
    minimumLicenseRecords: 1, maximumQuarantineRate: 0.1, logger: () => {},
  }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildChicagoActiveBusinessLicenses({
    outputRoot: path.join(root, "cancelled"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [license()], minimumLicenseRecords: 1, signal: controller.signal, logger: () => {},
  }), { name: "AbortError" });
});
