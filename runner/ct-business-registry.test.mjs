import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildCtBusinessRegistry,
  CT_BUSINESS_REGISTRY_FIELDS,
  CT_BUSINESS_REGISTRY_SCHEMA,
  CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  normalizeCtBusinessOrganization,
  requestCtJson,
  schemaFingerprint,
  verifyCtBusinessRegistry,
} from "./ct-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "n7gp-d28j",
    name: "Connecticut Business Registry - Business Master",
    attribution: "Secretary of the State",
    license: { name: "Public Domain" },
    rowsUpdatedAt: 1_788_079_667,
    activeRecordCount: 4,
    columns: CT_BUSINESS_REGISTRY_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    id: "0018y000008a1JIAAY",
    name: "Fixture Connecticut Company LLC",
    business_type: "LLC",
    status: "Active",
    sub_status: "Annual report past due",
    accountnumber: "2732224",
    annual_report_due_date: "2027-03-31T00:00:00",
    began_transacting_in_ct: "2023-03-01T00:00:00",
    billingstreet: "8 Elmcrest Ter",
    billing_unit: "204",
    billingcity: "Norwalk",
    billingcountry: "United States",
    billingpostalcode: "06850-3910",
    billingstate: "CT",
    business_name_in_state_country: "Fixture Company Holdings LLC",
    citizenship: "Domestic",
    country_formation: "United States",
    date_registration: "2023-02-26T00:00:00",
    formation_place: "Connecticut",
    state_or_territory_formation: "Connecticut",
    dissolution_date: null,
    naics_code: "Parking Lots and Garages (812930)",
    naics_sub_code: null,
    create_dt: "2026-08-30 00:09:20.4833333",
    geo_location: { type: "Point", coordinates: [-73.421, 41.117] },
    ...overrides,
  };
}

function context() {
  return {
    runId: "ct-fixture-run",
    retrievedAt: "2026-08-30T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T08:47:47.000Z",
    sourceReleaseId: "ct-fixture-source",
    baselineByZip: new Map([["06850", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:06850", geoid: "06850" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["06103", "06850", "10001", "99999"].map((zipCode) => ({
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

test("pins the 25 selected non-personal Connecticut Business Master fields", () => {
  assert.equal(CT_BUSINESS_REGISTRY_FIELDS.length, 25);
  assert.equal(sha256(CT_BUSINESS_REGISTRY_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["business_email_address", "category_survey_email_address", "woman_owned_organization", "mailing_address", "record_address"]) {
    assert.equal(CT_BUSINESS_REGISTRY_FIELDS.includes(excluded), false);
  }
});

test("normalizes registration evidence without inferring a physical site", () => {
  const normalized = normalizeCtBusinessOrganization(organization({
    business_email_address: "private@example.invalid",
    woman_owned_organization: true,
  }), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:ct_sots_record_0018y000008a1JIAAY");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_business_address.postal_code, "06850");
  assert.equal(normalized.reported_business_address.zip4, "3910");
  assert.equal(normalized.reported_business_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.reported_address_coordinate.coordinate_scope, "source-geocoded-reported-business-address-not-verified-physical-operating-site");
  assert.equal(normalized.registration_profile.naics.code, "812930");
  assert.equal(normalized.source_status.sub_status, "Annual report past due");
  assert.equal(JSON.stringify(normalized).includes("private@example.invalid"), false);
  const placeholder = normalizeCtBusinessOrganization(organization({ accountnumber: "0000000", billingcountry: "CANADA", billingstate: "ON" }), context());
  assert.equal(placeholder.external_identifiers.some((item) => item.type === "ct_authoritative_legal_entity_identifier"), false);
  assert.equal(placeholder.reported_business_address.eligible_for_us_zip_coverage, false);
  assert.throws(() => normalizeCtBusinessOrganization(organization({ status: "Forfeited" }), context()), /not-active/);
});

test("retries transient source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestCtJson("https://data.ct.gov/api/views/n7gp-d28j", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestCtJson("https://data.ct.gov/api/views/n7gp-d28j", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies a complete selected-field Connecticut release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ct-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    organization(),
    organization({ id: "0018y000008a1VBAAY", accountnumber: "2732225", name: "Second Connecticut LLC", billingstreet: "1 Main St", billing_unit: null, billingcity: "Hartford", billingpostalcode: "06103", geo_location: null, sub_status: null }),
    organization({ id: "0018y000008a2zvAAA", accountnumber: "2732265", name: "New York Foreign Company", citizenship: "Foreign", billingstreet: "50 Broadway", billingcity: "New York", billingstate: "NY", billingpostalcode: "10001", sub_status: "Admin Dissolution Initiated", dissolution_date: "2026-01-01T00:00:00", geo_location: null }),
    organization({ id: "0018y000008a3AAAAY", accountnumber: "0000000", name: "Incomplete Address Company", billingstreet: null, billingcity: null, billingstate: null, billingpostalcode: null, billingcountry: null, geo_location: null }),
  ];
  const result = await buildCtBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T20:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_records, 4);
  assert.equal(result.manifest.coverage.active_organizations_published, 4);
  assert.equal(result.manifest.coverage.eligible_reported_us_business_addresses, 3);
  assert.equal(result.manifest.coverage.placeholder_alei_0000000_records, 1);
  assert.equal(result.manifest.coverage.physical_sites, null);
  const verified = await verifyCtBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ct-business-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 4);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "ct-business-registry-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks schema drift, duplicate identity, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ct-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "status" ? { ...column, dataTypeName: "number" } : column), activeRecordCount: 1 });
  await assert.rejects(() => buildCtBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [organization()], minimumOrganizations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildCtBusinessRegistry({
    outputRoot: path.join(root, "duplicate"),
    zbpPointer,
    catalogMetadata: metadata({ activeRecordCount: 2 }),
    sourceRecords: [organization(), organization({ id: "0018y000008a1VBAAY" })],
    minimumOrganizations: 1,
    logger: () => {},
  }), /Duplicate non-placeholder.*ALEI/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildCtBusinessRegistry({
    outputRoot: path.join(root, "cancelled"),
    zbpPointer,
    catalogMetadata: metadata({ activeRecordCount: 1 }),
    sourceRecords: [organization()],
    minimumOrganizations: 1,
    signal: controller.signal,
    logger: () => {},
  }), { name: "AbortError" });
});
