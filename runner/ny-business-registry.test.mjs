import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildNyBusinessRegistry,
  NY_BUSINESS_REGISTRY_FIELDS,
  NY_BUSINESS_REGISTRY_SCHEMA,
  NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  normalizeNyBusinessOrganization,
  requestNyJson,
  schemaFingerprint,
  verifyNyBusinessRegistry,
} from "./ny-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "n9v6-gdp6",
    name: "Active Corporations:  Beginning 1800",
    attribution: "New York State Department of State",
    description: "The Department of State keeps a record of every filing for every incorporated business in the state of New York. This dataset contains information on all active corporations as of the last business day of the specified month and year.",
    category: "Economic Development",
    provenance: "official",
    publicationStage: "published",
    license: null,
    rowsUpdatedAt: 1_788_092_947,
    selectedRecordCount: 3,
    distinctDosIdCount: 3,
    metadata: { custom_fields: { "Dataset Summary": { "Posting Frequency": "Monthly", "Organization": "Division of Corporations" } } },
    columns: NY_BUSINESS_REGISTRY_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    dos_id: "1000006",
    current_entity_name: "Fixture New York Company LLC",
    initial_dos_filing_date: "1985-05-28T00:00:00.000",
    county: "New York",
    jurisdiction: "Delaware",
    entity_type: "FOREIGN BUSINESS CORPORATION",
    location_address_1: "50 Broadway",
    location_address_2: "Suite 204",
    location_city: "New York",
    location_state: "NY",
    location_zip: "10001-1234",
    ...overrides,
  };
}

function context() {
  return {
    runId: "ny-fixture-run",
    retrievedAt: "2026-08-31T08:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-30T12:29:07.000Z",
    sourceReleaseId: "ny-fixture-source",
    baselineByZip: new Map([["10001", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:10001", geoid: "10001" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["10001", "11201", "99999"].map((zipCode) => ({
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

test("pins 11 business and reported-location fields while excluding process, CEO, agent, and location-name data", () => {
  assert.equal(NY_BUSINESS_REGISTRY_FIELDS.length, 11);
  assert.equal(sha256(NY_BUSINESS_REGISTRY_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["dos_process_name", "dos_process_address_1", "chairman_name", "chairman_address_1", "registered_agent_name", "registered_agent_address_1", "location_name"]) {
    assert.equal(NY_BUSINESS_REGISTRY_FIELDS.includes(excluded), false);
  }
});

test("normalizes active-extract evidence without inferring a physical site, legal status, owner, or relationship", () => {
  const normalized = normalizeNyBusinessOrganization(organization({
    dos_process_name: "Private Process Recipient",
    chairman_name: "Private CEO",
    registered_agent_name: "Private Agent",
    location_name: "Unneeded Name Line",
  }), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:ny_dos_id_1000006");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_location_address.postal_code, "10001-1234");
  assert.equal(normalized.reported_location_address.eligible_for_us_zip_coverage, true);
  assert.equal(normalized.reported_address_coordinate, null);
  assert.equal(normalized.registration_profile.entity_type, "FOREIGN BUSINESS CORPORATION");
  assert.equal(normalized.source_status.status_class, "active-only-monthly-extract-membership");
  assert.match(normalized.source_status.semantics, /not-proof-of-current-legal-status/);
  const serialized = JSON.stringify(normalized);
  for (const forbidden of ["Private Process Recipient", "Private CEO", "Private Agent", "Unneeded Name Line"]) assert.equal(serialized.includes(forbidden), false);
  const noAddress = normalizeNyBusinessOrganization(organization({ location_address_1: null, location_city: null, location_state: null, location_zip: null }), context());
  assert.equal(noAddress.reported_location_address.eligible_for_us_zip_coverage, false);
});

test("retries transient New York API responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestNyJson("https://data.ny.gov/api/views/n9v6-gdp6", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestNyJson("https://data.ny.gov/api/views/n9v6-gdp6", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds, independently verifies, and resumes a complete selected-field New York release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ny-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    organization({ dos_id: "10", current_entity_name: "First New York Entity", location_address_1: null, location_address_2: null, location_city: null, location_state: null, location_zip: null }),
    organization(),
    organization({ dos_id: "1000007", current_entity_name: null, location_address_1: null, location_address_2: null, location_city: null, location_state: null, location_zip: null }),
  ];
  const result = await buildNyBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T08:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_extract_records, 3);
  assert.equal(result.manifest.coverage.organizations_published, 2);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  assert.equal(result.manifest.coverage.eligible_reported_us_location_addresses, 1);
  assert.equal(result.manifest.coverage.physical_sites, null);
  assert.equal(result.manifest.coverage.establishments, null);
  const verified = await verifyNyBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ny-business-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 2);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "ny-business-registry-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
  const resumed = await buildNyBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp-resume")),
    catalogMetadata: metadata(),
    sourceSnapshotPath: path.join(result.releaseDirectory, sourceArtifact.path),
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T09:00:00.000Z"),
  });
  assert.equal(resumed.manifest.coverage.source_active_extract_records, 3);
  assert.equal(resumed.manifest.coverage.organizations_published, 2);
  assert.equal(resumed.manifest.source_release_id, result.manifest.source_release_id);
});

test("blocks schema drift, duplicate DOS identity, count drift, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ny-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "entity_type" ? { ...column, dataTypeName: "number" } : column), selectedRecordCount: 1, distinctDosIdCount: 1 });
  await assert.rejects(() => buildNyBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [organization()], minimumOrganizations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildNyBusinessRegistry({
    outputRoot: path.join(root, "duplicate"),
    zbpPointer,
    catalogMetadata: metadata({ selectedRecordCount: 2, distinctDosIdCount: 2 }),
    sourceRecords: [organization(), organization()],
    minimumOrganizations: 1,
    logger: () => {},
  }), /strictly increasing/);
  await assert.rejects(() => buildNyBusinessRegistry({
    outputRoot: path.join(root, "count-drift"),
    zbpPointer,
    catalogMetadata: metadata({ selectedRecordCount: 2, distinctDosIdCount: 1 }),
    sourceRecords: [organization(), organization({ dos_id: "1000007" })],
    minimumOrganizations: 1,
    logger: () => {},
  }), /distinct DOS-ID count/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildNyBusinessRegistry({
    outputRoot: path.join(root, "cancelled"),
    zbpPointer,
    catalogMetadata: metadata({ selectedRecordCount: 1, distinctDosIdCount: 1 }),
    sourceRecords: [organization()],
    minimumOrganizations: 1,
    signal: controller.signal,
    logger: () => {},
  }), { name: "AbortError" });
});
