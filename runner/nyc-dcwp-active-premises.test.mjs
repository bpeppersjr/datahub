import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildNycDcwpActivePremises,
  normalizeNycDcwpLicensedSite,
  NYC_DCWP_ACTIVE_PREMISE_FIELDS,
  NYC_DCWP_ACTIVE_PREMISE_SCHEMA,
  NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT,
  NYC_DCWP_ACTIVE_PREMISE_WHERE,
  requestNycDcwpJson,
  schemaFingerprint,
  verifyNycDcwpActivePremises,
} from "./nyc-dcwp-active-premises.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "w7w3-xahh",
    name: "Issued Licenses",
    attribution: "Department of Consumer and Worker Protection (DCWP)",
    provenance: "official",
    assetType: "dataset",
    viewType: "tabular",
    rowsUpdatedAt: 1_787_232_293,
    metadata: { custom_fields: { Update: { Automation: "Yes", "Update Frequency": "Weekly" }, "Dataset Information": { Agency: "Department of Consumer and Worker Protection (DCWP)" } } },
    sourceRecordCount: 5,
    columns: NYC_DCWP_ACTIVE_PREMISE_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function license(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    license_nbr: "1373079-DCA",
    business_name: "HUDSON GROUP (HG) RETAIL, LLC",
    dba_trade_name: "HUDSON STORE 1152",
    business_unique_id: "BA-1305489-2022",
    business_category: "Tobacco Retail Dealer",
    license_type: "Premises",
    license_status: "Active",
    license_creation_date: "2010-10-01T00:00:00",
    lic_expir_dd: "2027-12-31T00:00:00",
    address_type: "Complete Address",
    address_building: "625",
    address_street_name: "8TH AVE",
    address_street_name_2: null,
    street3: null,
    unit_type: "STE",
    apt_suite: "101",
    address_city: "NEW YORK",
    address_state: "NY",
    address_zip: "10018",
    address_borough: "Manhattan",
    community_board: "104",
    council_district: "03",
    bin: "1083268",
    bbl: "1010320029",
    nta: "MN15",
    census_block_2010_: "1001",
    census_tract: "115",
    latitude: "40.7561920718278",
    longitude: "-73.99056478174674",
    ...overrides,
  };
}

function context() {
  return {
    runId: "nyc-dcwp-fixture-run",
    retrievedAt: "2026-08-31T23:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-20T13:24:53.000Z",
    sourceReleaseId: "nyc-dcwp-fixture-source",
    baselineByZip: new Map([
      ["10018", { postal_label: { preferred_state: "NY" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:10018", geoid: "10018" } }],
      ["11201", { postal_label: { preferred_state: "NY" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:11201", geoid: "11201" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["10018", "11201", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode === "99999" ? null : { preferred_state: "NY" },
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

test("pins the selected NYC DCWP fields and Active/Premises query", () => {
  assert.equal(NYC_DCWP_ACTIVE_PREMISE_FIELDS.length, 29);
  assert.equal(NYC_DCWP_ACTIVE_PREMISE_WHERE, "upper(license_status)='ACTIVE' AND upper(license_type)='PREMISES'");
  assert.equal(sha256(NYC_DCWP_ACTIVE_PREMISE_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT);
  for (const excluded of ["contact_phone", "detail", "owner_name", "officer_name"]) assert.equal(NYC_DCWP_ACTIVE_PREMISE_FIELDS.includes(excluded), false);
});

test("groups multiple active premise licenses by Business Unique ID", () => {
  const records = [
    license(),
    license({ socrata_row_id: "row-bbbb", license_nbr: "2072476-1-DCA", business_category: "Electronic Cigarette Dealer", lic_expir_dd: "2027-11-30T00:00:00" }),
  ];
  const normalized = normalizeNycDcwpLicensedSite(records, context());
  assert.equal(normalized.normalized_record_id, "nyc-dcwp-active-business:business:BA-1305489-2022");
  assert.equal(normalized.entity_candidates.organization_id, "organization:nyc_dcwp_business_ba_1305489_2022");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:nyc_dcwp_business_ba_1305489_2022");
  assert.equal(normalized.active_licenses.length, 2);
  assert.equal(normalized.address.zip_code, "10018");
  assert.deepEqual(normalized.location.coordinates, [-73.99056478174674, 40.7561920718278]);
  assert.equal(normalized.source_status.status, "Active premise license (source-defined)");
  assert.equal(normalized.export_policy, "local-review-only");
});

test("rejects non-premise, inactive, non-complete, conflicting, and invalid-address groups", () => {
  assert.throws(() => normalizeNycDcwpLicensedSite([license({ license_type: "Individual" })], context()), /source-row-not-active-premises/);
  assert.throws(() => normalizeNycDcwpLicensedSite([license({ license_status: "Expired" })], context()), /source-row-not-active-premises/);
  assert.throws(() => normalizeNycDcwpLicensedSite([license({ address_type: "Cross Street \(Intersection\)" })], context()), /non-complete-address-type/);
  assert.throws(() => normalizeNycDcwpLicensedSite([license(), license({ socrata_row_id: "row-bbbb", address_building: "626" })], context()), /conflicting-business-addresses/);
  assert.throws(() => normalizeNycDcwpLicensedSite([license({ address_zip: "00000" })], context()), /invalid-or-unmapped-us-zip/);
});

test("retries transient NYC responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestNycDcwpJson("https://data.cityofnewyork.us/api/views/w7w3-xahh", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestNycDcwpJson("https://data.cityofnewyork.us/api/views/w7w3-xahh", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds grouped sites, quarantines invalid groups, and independently verifies a complete release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-nyc-dcwp-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    license(),
    license({ socrata_row_id: "row-bbbb", license_nbr: "2072476-1-DCA", business_category: "Electronic Cigarette Dealer" }),
    license({ socrata_row_id: "row-cccc", license_nbr: "2130503-DCWP", business_unique_id: "BA-1776495-2026", business_name: "SECOND FIXTURE LLC", dba_trade_name: "SECOND FIXTURE", address_building: "10", address_street_name: "COURT ST", apt_suite: null, unit_type: null, address_city: "BROOKLYN", address_zip: "11201", address_borough: "Brooklyn", latitude: null, longitude: null }),
    license({ socrata_row_id: "row-dddd", license_nbr: "2130504-DCWP", business_unique_id: "BA-1776500-2026", address_type: "Cross Street (Intersection)" }),
    license({ socrata_row_id: "row-eeee", license_nbr: "2130505-DCWP", business_unique_id: "BA-1776501-2026", address_zip: "00000" }),
  ];
  const result = await buildNycDcwpActivePremises({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumLicenseRecords: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-08-31T23:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_premise_license_records, 5);
  assert.equal(result.manifest.coverage.accepted_active_premise_license_records, 3);
  assert.equal(result.manifest.coverage.normalized_licensed_sites, 2);
  assert.equal(result.manifest.coverage.organizations, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 2);
  assert.equal(result.manifest.coverage.quarantined_business_groups, 2);
  assert.equal(result.manifest.coverage.source_geocoded_sites, 1);
  const verified = await verifyNycDcwpActivePremises(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-nyc-dcwp-active-license-site-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.reduce((sum, record) => sum + record.active_licenses.length, 0), 3);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks selected-filter drift, schema drift, unapproved fields, duplicate rows, excess quarantine, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-nyc-dcwp-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildNycDcwpActivePremises({ outputRoot: path.join(root, "filter"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }), sourceRecords: [license({ license_status: "Expired" })], minimumLicenseRecords: 1, logger: () => {} }), /source-row-not-active-premises/);
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "address_zip" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1 });
  await assert.rejects(() => buildNycDcwpActivePremises({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [license()], minimumLicenseRecords: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildNycDcwpActivePremises({
    outputRoot: path.join(root, "private-field"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [license({ contact_phone: "2125550100" })], minimumLicenseRecords: 1, logger: () => {},
  }), /Unapproved NYC DCWP source field contact_phone/);
  await assert.rejects(() => buildNycDcwpActivePremises({
    outputRoot: path.join(root, "duplicate"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [license(), license()], minimumLicenseRecords: 1, logger: () => {},
  }), /Duplicate NYC DCWP Socrata row/);
  await assert.rejects(() => buildNycDcwpActivePremises({
    outputRoot: path.join(root, "quarantine"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 2 }),
    sourceRecords: [license(), license({ socrata_row_id: "row-bbbb", business_unique_id: "BA-1776500-2026", address_type: "Place (Landmark)" })],
    minimumLicenseRecords: 1, maximumQuarantineRate: 0.1, logger: () => {},
  }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildNycDcwpActivePremises({
    outputRoot: path.join(root, "cancelled"), zbpPointer, catalogMetadata: metadata({ sourceRecordCount: 1 }),
    sourceRecords: [license()], minimumLicenseRecords: 1, signal: controller.signal, logger: () => {},
  }), { name: "AbortError" });
});
