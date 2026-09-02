import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildPaBusinessRegistry,
  normalizePaBusinessOrganization,
  PA_BUSINESS_REGISTRY_FIELDS,
  PA_BUSINESS_REGISTRY_SCHEMA,
  PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  requestPaJson,
  schemaFingerprint,
  verifyPaBusinessRegistry,
} from "./pa-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "3urc-uaba",
    name: "Filtered View - Distinct Registered Businesses in PA Listing Current by County Department of State",
    attribution: "Department of State",
    license: { name: "Public Domain U.S. Government" },
    rowsUpdatedAt: 1_785_852_754,
    sourceRecordCount: 4,
    distinctFilingCount: 3,
    columns: PA_BUSINESS_REGISTRY_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    socrata_row_id: "row-aaaa-bbbb-cccc",
    business_name: "Fixture Pennsylvania Company LLC",
    filing_number: "0000000001",
    address_line1: "100 Market St",
    address_line2: "Suite 200",
    city: "Harrisburg",
    state: "PA",
    zip: "17101-1234",
    typeofbusinessregistration: "Domestic Limited Liability Company",
    shortcountyname: "Dauphin",
    county_code: "22",
    georeferenced_latitude__longitude: { type: "Point", coordinates: [-76.884, 40.264] },
    ...overrides,
  };
}

function context() {
  return {
    runId: "pa-fixture-run",
    retrievedAt: "2026-08-31T16:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-04T14:12:34.000Z",
    sourceReleaseId: "pa-fixture-source",
    baselineByZip: new Map([["17101", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:17101", geoid: "17101" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["17101", "17856", "19003", "99999"].map((zipCode) => ({
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

test("pins the 11 selected non-personal Pennsylvania fields", () => {
  assert.equal(PA_BUSINESS_REGISTRY_FIELDS.length, 11);
  assert.equal(sha256(PA_BUSINESS_REGISTRY_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["party_type", "last_name", "middle_name", "first_name"]) assert.equal(PA_BUSINESS_REGISTRY_FIELDS.includes(excluded), false);
});

test("normalizes registration evidence, ZIP+4, malformed extensions, and suspect geocodes without inferring a site", () => {
  const normalized = normalizePaBusinessOrganization(organization({ first_name: "PRIVATE" }), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:pa_dos_filing_0000000001");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_business_address.postal_code, "17101");
  assert.equal(normalized.reported_business_address.zip4, "1234");
  assert.equal(normalized.reported_business_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.registration_profile.county_code_semantics, "source-alphabetical-01-through-67-code-not-county-fips");
  assert.equal(JSON.stringify(normalized).includes("PRIVATE"), false);
  const malformed = normalizePaBusinessOrganization(organization({ zip: "17856-0", georeferenced_latitude__longitude: { type: "Point", coordinates: [-94.7985, 30.41016] } }), context());
  assert.equal(malformed.reported_business_address.zip_code, "17856");
  assert.equal(malformed.reported_business_address.postal_code_status, "normalized-zip5-with-malformed-extension-excluded");
  assert.equal(malformed.reported_address_coordinate.plausibility, "reported-pa-address-coordinate-outside-broad-pa-bounds");
});

test("retries transient Pennsylvania source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestPaJson("https://data.pa.gov/api/views/3urc-uaba", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestPaJson("https://data.pa.gov/api/views/3urc-uaba", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds, deduplicates, and independently verifies a complete Pennsylvania release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-pa-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    organization(),
    organization({ socrata_row_id: "row-bbbb-no-geo", business_name: "Duplicate Geocode Fixture Inc.", filing_number: "0000000002", address_line1: "Rd 1 Box 111a", city: "Northumberland", zip: "17856-0", shortcountyname: "Northumberland", county_code: "49", georeferenced_latitude__longitude: undefined }),
    organization({ socrata_row_id: "row-cccc-with-geo", business_name: "Duplicate Geocode Fixture Inc.", filing_number: "0000000002", address_line1: "Rd 1 Box 111a", city: "Northumberland", zip: "17856-0", shortcountyname: "Northumberland", county_code: "49", georeferenced_latitude__longitude: { type: "Point", coordinates: [-94.7985, 30.41016] } }),
    organization({ socrata_row_id: "row-dddd-incomplete", business_name: "Incomplete Address Company", filing_number: "0000000003", address_line1: null, address_line2: null, city: null, state: null, zip: null, shortcountyname: null, county_code: null, georeferenced_latitude__longitude: null }),
  ];
  const result = await buildPaBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T16:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_registration_rows, 4);
  assert.equal(result.manifest.coverage.distinct_active_registration_organizations_published, 3);
  assert.equal(result.manifest.coverage.duplicate_filing_number_groups, 1);
  assert.equal(result.manifest.coverage.duplicate_rows_collapsed, 1);
  assert.equal(result.manifest.coverage.eligible_reported_us_business_addresses, 2);
  assert.equal(result.manifest.coverage.reported_pa_address_geocodes_outside_broad_pa_bounds, 1);
  assert.equal(result.manifest.coverage.physical_sites, null);
  const verified = await verifyPaBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-pa-business-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.find((record) => record.external_identifiers[0].value === "0000000002").reported_address_coordinate.plausibility, "reported-pa-address-coordinate-outside-broad-pa-bounds");
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "pa-business-registry-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks schema drift, unapproved source fields, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-pa-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "zip" ? { ...column, dataTypeName: "number" } : column), sourceRecordCount: 1, distinctFilingCount: 1 });
  await assert.rejects(() => buildPaBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [organization()], minimumOrganizations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildPaBusinessRegistry({
    outputRoot: path.join(root, "private-field"),
    zbpPointer,
    catalogMetadata: metadata({ sourceRecordCount: 1, distinctFilingCount: 1 }),
    sourceRecords: [organization({ first_name: "PRIVATE" })],
    minimumOrganizations: 1,
    logger: () => {},
  }), /Unapproved Pennsylvania source field first_name/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildPaBusinessRegistry({
    outputRoot: path.join(root, "cancelled"),
    zbpPointer,
    catalogMetadata: metadata({ sourceRecordCount: 1, distinctFilingCount: 1 }),
    sourceRecords: [organization()],
    minimumOrganizations: 1,
    signal: controller.signal,
    logger: () => {},
  }), { name: "AbortError" });
});
