import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildDcBasicBusinessLicenses,
  DC_BASIC_BUSINESS_LICENSE_FIELDS,
  DC_BASIC_BUSINESS_LICENSE_SCHEMA,
  DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  normalizeDcBasicBusinessLicenseSite,
  projectDcMarylandStatePlane,
  requestDcArcGisJson,
  schemaFingerprint,
  verifyDcBasicBusinessLicenses,
} from "./dc-basic-business-licenses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    name: "Basic Business License",
    type: "Table",
    objectIdField: "OBJECTID",
    globalIdField: "GLOBALID",
    maxRecordCount: 2000,
    capabilities: "Query,Extract",
    fields: DC_BASIC_BUSINESS_LICENSE_SCHEMA.map(([name, type, length]) => ({ name, type, ...(length ? { length } : {}) })),
    ...overrides,
  };
}

const REFRESHED_ON = Date.parse("2026-09-01T04:00:00.000Z");

function license(overrides = {}) {
  return {
    CUSTOMERNUMBER: "500526000983",
    LICENSESTATUS: "Active",
    LICENSETYPE: "Business License",
    LICENSESTATUSDATE: Date.parse("2026-08-20T04:00:00.000Z"),
    LICENSESTARTDATE: Date.parse("2026-08-01T04:00:00.000Z"),
    LICENSEENDDATE: Date.parse("2028-07-31T04:00:00.000Z"),
    INITIALISSUEDATE: Date.parse("2020-08-01T04:00:00.000Z"),
    BUSINESSACTIVITY: "Grocery Store",
    PREMISEADDRESS: "100 TEST ST NW, STE 200, Washington, DC, 20001, USA",
    PREMISEINDC: "Yes",
    ENTITYNAME: "FIXTURE DC MARKET LLC",
    ENTITYTRADENAME: "FIXTURE MARKET",
    ENTITYTYPE: "Domestic Limited Liability Company",
    PRIMARYACTIVITYFLAG: "Yes",
    CATEGORYSERVICETYPE: "General Sales and Services",
    DATAREFRESHEDON: REFRESHED_ON,
    WARD: "Ward 2",
    ANC: "ANC 2C",
    SMD: "2C01",
    DISTRICT: "FIRST",
    PSA: "101",
    NEIGHBORHOODCLUSTER: "Cluster 8",
    BUSINESSIMPROVEMENTDISTRICT: "Downtown BID",
    MAINSTREET: null,
    MAR_ID: 300001,
    X_COORDINATE: 397000,
    Y_COORDINATE: 136000,
    GLOBALID: "{11111111-1111-1111-1111-111111111111}",
    OBJECTID: 1001,
    ...overrides,
  };
}

function context() {
  return {
    runId: "dc-fixture-run",
    retrievedAt: "2026-09-01T12:00:00.000Z",
    sourceRefreshedAt: "2026-09-01T04:00:00.000Z",
    sourceReleaseId: "dc-fixture-source",
    baselineByZip: new Map([
      ["20001", { postal_label: { preferred_state: "DC" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:20001", geoid: "20001" } }],
      ["22307", { postal_label: { preferred_state: "VA" }, geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:22307", geoid: "22307" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["20001", "22307", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    postal_label: zipCode === "20001" ? { preferred_state: "DC" } : zipCode === "22307" ? { preferred_state: "VA" } : null,
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

test("pins only the privacy-minimized DC business-license fields", () => {
  assert.equal(DC_BASIC_BUSINESS_LICENSE_FIELDS.length, 29);
  assert.equal(sha256(DC_BASIC_BUSINESS_LICENSE_SCHEMA.map(([field, type, length]) => `${field}:${type}:${length ?? ""}`).join("\0")), DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().fields), DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  for (const excluded of ["BUSINESSOWNERFIRSTNAME", "BUSINESSOWNERLASTNAME", "BILLINGADDRESS", "AGENTFIRSTNAME", "AGENTLASTNAME", "AGENTENTITY", "SSL", "LATITUDE", "LONGITUDE"]) {
    assert.equal(DC_BASIC_BUSINESS_LICENSE_FIELDS.includes(excluded), false);
  }
});

test("projects official DC Maryland State Plane coordinates into WGS84", () => {
  const point = projectDcMarylandStatePlane(393840.52, 137607.99);
  assert.ok(Math.abs(point[0] - -77.071) < 0.01);
  assert.ok(Math.abs(point[1] - 38.91) < 0.01);
});

test("groups active activity rows into one privacy-restricted licensed site", () => {
  const records = [
    license(),
    license({
      BUSINESSACTIVITY: "Delicatessen",
      PRIMARYACTIVITYFLAG: "No",
      GLOBALID: "{22222222-2222-2222-2222-222222222222}",
      OBJECTID: 1002,
    }),
  ];
  const normalized = normalizeDcBasicBusinessLicenseSite(records, context());
  assert.equal(normalized.normalized_record_id, "dc-basic-business-license:customer:500526000983");
  assert.equal(normalized.entity_candidates.organization_id, "organization:dc_dlcp_customer_500526000983");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:dc_dlcp_customer_500526000983");
  assert.equal(normalized.active_license_activities.length, 2);
  assert.equal(normalized.address.zip_code, "20001");
  assert.equal(normalized.location.coordinates.length, 2);
  assert.equal(normalized.source_status.status, "Active Basic Business License (source-defined)");
  assert.equal(normalized.privacy.owner_agent_and_billing_fields, "excluded-at-query-time");
  assert.equal(normalized.export_policy, "local-review-only");
});

test("accepts a complete out-of-District premise but rejects unnamed, PO Box, expired, and conflicting groups", () => {
  const outside = normalizeDcBasicBusinessLicenseSite([license({
    CUSTOMERNUMBER: "500526000984",
    PREMISEADDRESS: "6008 FORT HUNT RD, Alexandria, VA, 22307, USA",
    PREMISEINDC: "No",
    X_COORDINATE: null,
    Y_COORDINATE: null,
    GLOBALID: "{33333333-3333-3333-3333-333333333333}",
  })], context());
  assert.equal(outside.address.state, "VA");
  assert.equal(outside.location, null);
  assert.throws(() => normalizeDcBasicBusinessLicenseSite([license({ ENTITYNAME: null, ENTITYTRADENAME: null })], context()), /missing-publishable-business-name/);
  assert.throws(() => normalizeDcBasicBusinessLicenseSite([license({ PREMISEADDRESS: "PO BOX 1, Washington, DC, 20001, USA" })], context()), /po-box-not-physical-premise/);
  assert.throws(() => normalizeDcBasicBusinessLicenseSite([license({ LICENSEENDDATE: Date.parse("2026-08-31T04:00:00.000Z") })], context()), /source-active-license-expired-at-observation/);
  assert.throws(() => normalizeDcBasicBusinessLicenseSite([license(), license({ PREMISEADDRESS: "200 TEST ST NW, Washington, DC, 20001, USA", GLOBALID: "{44444444-4444-4444-4444-444444444444}" })], context()), /conflicting-license-account/);
});

test("retries transient DC ArcGIS responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestDcArcGisJson("https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0?f=pjson", { fetchImpl, sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestDcArcGisJson("https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0?f=pjson", {
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies a grouped DC license release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-dc-license-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    license(),
    license({ BUSINESSACTIVITY: "Delicatessen", PRIMARYACTIVITYFLAG: "No", GLOBALID: "{22222222-2222-2222-2222-222222222222}", OBJECTID: 1002 }),
    license({ CUSTOMERNUMBER: "500526000984", PREMISEADDRESS: "6008 FORT HUNT RD, Alexandria, VA, 22307, USA", PREMISEINDC: "No", ENTITYNAME: "FIXTURE VIRGINIA VENDOR LLC", ENTITYTRADENAME: null, X_COORDINATE: null, Y_COORDINATE: null, GLOBALID: "{33333333-3333-3333-3333-333333333333}", OBJECTID: 1003 }),
    license({ CUSTOMERNUMBER: "500526000985", ENTITYNAME: null, ENTITYTRADENAME: null, GLOBALID: "{44444444-4444-4444-4444-444444444444}", OBJECTID: 1004 }),
  ];
  const result = await buildDcBasicBusinessLicenses({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    layerMetadata: metadata(),
    sourceRecords: rows,
    sourceCount: rows.length,
    minimumActiveLicenseRecords: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_business_license_rows, 4);
  assert.equal(result.manifest.coverage.accepted_active_business_license_rows, 3);
  assert.equal(result.manifest.coverage.normalized_licensed_sites, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.source_geocoded_sites, 1);
  const verified = await verifyDcBasicBusinessLicenses(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const artifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-dc-basic-business-license-site-jsonl-gzip");
  const normalized = (await Promise.all(artifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.reduce((sum, record) => sum + record.active_license_activities.length, 0), 3);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
});

test("blocks schema drift, unapproved fields, duplicate identities, excess quarantine, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-dc-license-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ fields: metadata().fields.map((field) => field.name === "CUSTOMERNUMBER" ? { ...field, type: "esriFieldTypeInteger" } : field) });
  await assert.rejects(() => buildDcBasicBusinessLicenses({ outputRoot: path.join(root, "drift"), zbpPointer, layerMetadata: drift, sourceRecords: [license()], sourceCount: 1, minimumActiveLicenseRecords: 1, logger: () => {}, now: () => new Date("2026-09-01T12:00:00.000Z") }), /selected schema changed/);
  await assert.rejects(() => buildDcBasicBusinessLicenses({ outputRoot: path.join(root, "private"), zbpPointer, layerMetadata: metadata(), sourceRecords: [license({ BUSINESSOWNERFIRSTNAME: "PRIVATE" })], sourceCount: 1, minimumActiveLicenseRecords: 1, logger: () => {}, now: () => new Date("2026-09-01T12:00:00.000Z") }), /Unapproved DC source field BUSINESSOWNERFIRSTNAME/);
  await assert.rejects(() => buildDcBasicBusinessLicenses({ outputRoot: path.join(root, "duplicate"), zbpPointer, layerMetadata: metadata(), sourceRecords: [license(), license()], sourceCount: 2, minimumActiveLicenseRecords: 1, logger: () => {}, now: () => new Date("2026-09-01T12:00:00.000Z") }), /Duplicate DC GlobalID/);
  await assert.rejects(() => buildDcBasicBusinessLicenses({ outputRoot: path.join(root, "quarantine"), zbpPointer, layerMetadata: metadata(), sourceRecords: [license(), license({ CUSTOMERNUMBER: "500526000985", ENTITYNAME: null, ENTITYTRADENAME: null, GLOBALID: "{55555555-5555-5555-5555-555555555555}" })], sourceCount: 2, minimumActiveLicenseRecords: 1, maximumQuarantineRate: 0.1, logger: () => {}, now: () => new Date("2026-09-01T12:00:00.000Z") }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildDcBasicBusinessLicenses({ outputRoot: path.join(root, "cancelled"), zbpPointer, layerMetadata: metadata(), sourceRecords: [license()], sourceCount: 1, minimumActiveLicenseRecords: 1, signal: controller.signal, logger: () => {}, now: () => new Date("2026-09-01T12:00:00.000Z") }), { name: "AbortError" });
});
