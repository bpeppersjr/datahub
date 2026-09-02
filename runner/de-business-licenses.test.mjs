import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildDeBusinessLicenses,
  DE_BUSINESS_LICENSE_FIELDS,
  DE_BUSINESS_LICENSE_SCHEMA,
  DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  normalizeDeBusinessLicense,
  requestDeJson,
  schemaFingerprint,
  verifyDeBusinessLicenses,
} from "./de-business-licenses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "5zy2-grhr",
    name: "Delaware Business Licenses",
    attribution: "Department of Finance, Division of Revenue",
    description: "Information for businesses currently licensed in Delaware.",
    license: { name: "Public Domain" },
    rowsUpdatedAt: 1_788_175_917,
    sourceRecordCount: 5,
    distinctLicenseCount: 3,
    columns: DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function license(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    business_name: "Fixture Delaware Company LLC",
    trade_name: "Fixture Market",
    category: "RETAILER  GENERAL",
    current_license_valid_from: "2026-01-01T00:00:00.000",
    current_license_valid_to: "2026-12-31T00:00:00.000",
    address_1: "100 Market St",
    address_2: "Suite 200",
    city: "Wilmington",
    state: "DE",
    zip: "198011234",
    country: "UNITED STATES",
    license_number: "2026000001",
    geocoded_location: {
      latitude: "39.7391",
      longitude: "-75.5398",
      human_address: "{\"address\":\"\",\"city\":\"Wilmington\",\"state\":\"DE\",\"zip\":\"198011234\"}",
    },
    ...overrides,
  };
}

function context() {
  return {
    runId: "de-fixture-run",
    retrievedAt: "2026-09-01T12:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-31T09:31:57.000Z",
    sourceReleaseId: "de-fixture-source",
    baselineByZip: new Map([["19801", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:19801", geoid: "19801" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["19720", "19801", "19901", "99999"].map((zipCode) => ({
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
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the 13 selected Delaware license fields", () => {
  assert.equal(DE_BUSINESS_LICENSE_FIELDS.length, 13);
  assert.equal(sha256(DE_BUSINESS_LICENSE_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT);
  for (const excluded of ["owner_name", "phone", "email", "registered_agent"]) assert.equal(DE_BUSINESS_LICENSE_FIELDS.includes(excluded), false);
});

test("groups license evidence, preserves trade names, and never infers a physical site", () => {
  const normalized = normalizeDeBusinessLicense([
    license(),
    license({ socrata_row_id: "row-bbbb-cccc-dddd", trade_name: "Fixture Pharmacy", category: "RETAILER  GENERAL" }),
  ], context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:de_dor_license_2026000001");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.deepEqual(normalized.other_names.map((item) => item.name), ["Fixture Market", "Fixture Pharmacy"]);
  assert.deepEqual(normalized.license_profile.business_activities, ["RETAILER  GENERAL"]);
  assert.equal(normalized.reported_business_address.postal_code, "19801");
  assert.equal(normalized.reported_business_address.zip4, "1234");
  assert.equal(normalized.reported_business_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.reported_address_coordinate.plausibility, "within-broad-delaware-bounds");
  assert.equal(normalized.export_policy, "local-review-only");
  assert.equal(normalized.privacy.classification, "possible-natural-person-name-or-residential-business-address");
  assert.throws(() => normalizeDeBusinessLicense([
    license(),
    license({ socrata_row_id: "row-conflict", address_1: "200 Other St" }),
  ], context()), /conflicting-license-addresses/);
});

test("excludes foreign addresses from U.S. ZIP coverage and flags implausible Delaware geocodes", () => {
  const foreign = normalizeDeBusinessLicense([license({ country: "CANADA", state: "ON", zip: "A1A 1A1", geocoded_location: null })], context());
  assert.equal(foreign.reported_business_address.eligible_for_us_zip_coverage, false);
  assert.equal(foreign.geography.zcta_match_status, "not-evaluated-without-eligible-us-address");
  const suspect = normalizeDeBusinessLicense([license({ geocoded_location: { latitude: "34.0522", longitude: "-118.2437" } })], context());
  assert.equal(suspect.reported_address_coordinate.plausibility, "reported-de-address-coordinate-outside-broad-delaware-bounds");
});

test("retries transient Delaware responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestDeJson("https://data.delaware.gov/api/views/5zy2-grhr", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestDeJson("https://data.delaware.gov/api/views/5zy2-grhr", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds, quarantines conflicts, and independently verifies a complete Delaware release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-de-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    license(),
    license({ socrata_row_id: "row-bbbb-trade-name", trade_name: "Fixture Pharmacy" }),
    license({ socrata_row_id: "row-cccc-second", license_number: "2026000002", business_name: "Second Delaware LLC", trade_name: null, address_1: "1 Innovation Way", address_2: null, city: "Newark", zip: "19720", geocoded_location: null }),
    license({ socrata_row_id: "row-dddd-conflict-a", license_number: "2026000003", business_name: "Conflict LLC", trade_name: null, address_1: "10 Main St", city: "Dover", zip: "19901", geocoded_location: null }),
    license({ socrata_row_id: "row-eeee-conflict-b", license_number: "2026000003", business_name: "Conflict LLC", trade_name: null, address_1: "20 Main St", city: "Dover", zip: "19901", geocoded_location: null }),
  ];
  const result = await buildDeBusinessLicenses({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumLicenseRows: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_current_license_rows, 5);
  assert.equal(result.manifest.coverage.accepted_current_license_rows, 3);
  assert.equal(result.manifest.coverage.distinct_licenses_published, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 2);
  assert.equal(result.manifest.coverage.quarantined_license_groups, 1);
  assert.equal(result.manifest.coverage.eligible_reported_us_business_addresses, 2);
  assert.equal(result.manifest.coverage.physical_sites, null);
  assert.equal(result.manifest.policy.record_level_distribution, "local-review-only");
  const verified = await verifyDeBusinessLicenses(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-de-business-license-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined), true);
  const quarantineArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "de-business-license-quarantine-jsonl-gzip");
  assert.equal((await gunzipRecords(path.join(result.releaseDirectory, quarantineArtifact.path)))[0].reason, "conflicting-license-addresses");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks metadata drift, unapproved fields, and excessive quarantine", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-de-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "zip" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1, distinctLicenseCount: 1 });
  await assert.rejects(() => buildDeBusinessLicenses({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [license()], minimumLicenseRows: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildDeBusinessLicenses({
    outputRoot: path.join(root, "private-field"),
    zbpPointer,
    catalogMetadata: metadata({ sourceRecordCount: 1, distinctLicenseCount: 1 }),
    sourceRecords: [license({ owner_name: "PRIVATE" })],
    minimumLicenseRows: 1,
    logger: () => {},
  }), /Unapproved Delaware source field owner_name/);
  await assert.rejects(() => buildDeBusinessLicenses({
    outputRoot: path.join(root, "quarantine"),
    zbpPointer,
    catalogMetadata: metadata({ sourceRecordCount: 2, distinctLicenseCount: 1 }),
    sourceRecords: [license(), license({ socrata_row_id: "row-conflict", address_1: "Other" })],
    minimumLicenseRows: 1,
    maximumQuarantineRate: 0.1,
    logger: () => {},
  }), /quarantine rate/);
});
