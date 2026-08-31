import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildOrBusinessRegistry,
  normalizeOrBusinessRegistration,
  OR_BUSINESS_REGISTRY_FIELDS,
  OR_BUSINESS_REGISTRY_SCHEMA,
  OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  requestOrJson,
  schemaFingerprint,
  verifyOrBusinessRegistry,
} from "./or-business-registry.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "tckn-sxa6",
    name: "Active Businesses - ALL",
    description: "All Active businesses - Principal Place of Business address, Mailing address, Registered Agent, Authorized Representative.",
    license: null,
    rowsUpdatedAt: 1_787_665_382,
    selectedSourceRowCount: 5,
    distinctRegistrationCount: 4,
    columns: OR_BUSINESS_REGISTRY_SCHEMA.filter(([field]) => field !== ":id").map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    ":id": "row-100-a",
    registry_number: "100",
    business_name: "Fixture Oregon Company LLC",
    entity_type: "DOMESTIC LIMITED LIABILITY COMPANY",
    registry_date: "2020-06-16T00:00:00",
    associated_name_type: "PRINCIPAL PLACE OF BUSINESS",
    address: "6101 SE Clatsop St",
    address_continued: "Unit 204",
    city: "Portland",
    state: "OR",
    zip: "97206",
    jurisdiction: "OR",
    ...overrides,
  };
}

function context() {
  return {
    runId: "or-fixture-run",
    retrievedAt: "2026-08-31T12:00:00.000Z",
    sourceRowsUpdatedAt: "2026-08-25T13:43:02.000Z",
    sourceReleaseId: "or-fixture-source",
    baselineByZip: new Map([
      ["97206", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:97206", geoid: "97206" } }],
      ["98625", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:98625", geoid: "98625" } }],
    ]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["97206", "97603", "98625", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((item) => JSON.stringify(item)).join("\n")}\n`);
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

test("pins only the Oregon principal-place registration fields", () => {
  assert.equal(OR_BUSINESS_REGISTRY_FIELDS.length, 12);
  assert.equal(sha256(OR_BUSINESS_REGISTRY_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT);
  for (const excluded of ["first_name", "middle_name", "last_name", "suffix", "entity_of_record_name", "entity_of_record_reg_number", "business_details"]) {
    assert.equal(OR_BUSINESS_REGISTRY_FIELDS.includes(excluded), false);
  }
});

test("normalizes legal entities and assumed names without inferring sites or owners", () => {
  const legal = normalizeOrBusinessRegistration([row({ first_name: "Private", last_name: "Person" })], context());
  assert.equal(legal.registration_kind, "legal-entity-registration");
  assert.equal(legal.entity_candidates.organization_id, "organization:or_sos_registry_100");
  assert.equal(legal.entity_candidates.brand_id, null);
  assert.equal(legal.entity_candidates.physical_site_id, null);
  assert.equal(legal.principal_place_addresses[0].eligible_for_us_zip_coverage, true);
  assert.equal(JSON.stringify(legal).includes("Private"), false);

  const assumedName = normalizeOrBusinessRegistration([row({ registry_number: "101", ":id": "row-101-a", entity_type: "ASSUMED BUSINESS NAME", business_name: "Fixture DBA" })], context());
  assert.equal(assumedName.registration_kind, "assumed-business-name-registration");
  assert.equal(assumedName.entity_candidates.organization_id, null);
  assert.equal(assumedName.entity_candidates.brand_id, "brand:or_sos_assumed_name_101");

  const multiple = normalizeOrBusinessRegistration([
    row({ registry_number: "102", ":id": "row-102-a" }),
    row({ registry_number: "102", ":id": "row-102-b", address: "157 N 1st St", address_continued: null, city: "Kalama", state: "WA", zip: "98625", jurisdiction: "OR" }),
  ], context());
  assert.equal(multiple.principal_place_addresses.length, 2);
  assert.deepEqual(multiple.principal_place_addresses.map((address) => address.zip_code), ["97206", "98625"]);

  const canadian = normalizeOrBusinessRegistration([row({ state: "BRITISH COLUMBIA", zip: "V1V 1V1" })], context());
  assert.equal(canadian.principal_place_addresses[0].eligible_for_us_zip_coverage, false);
});

test("retries transient Oregon source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await requestOrJson("https://data.oregon.gov/api/views/tckn-sxa6", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestOrJson("https://data.oregon.gov/api/views/tckn-sxa6", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies grouped Oregon registrations", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-or-business-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    row(),
    row({ registry_number: "101", ":id": "row-101-a", business_name: "Fixture DBA", entity_type: "ASSUMED BUSINESS NAME", address: "1 Main St", address_continued: null, city: "Klamath Falls", zip: "97603" }),
    row({ registry_number: "102", ":id": "row-qdw2~qdxs-xeji", business_name: "Two Address Corporation", entity_type: "DOMESTIC BUSINESS CORPORATION" }),
    row({ registry_number: "102", ":id": "row-3fam.mykj~n4ee", business_name: "Two Address Corporation", entity_type: "DOMESTIC BUSINESS CORPORATION", address: "157 N 1st St", address_continued: null, city: "Kalama", state: "WA", zip: "98625" }),
    row({ registry_number: "103", ":id": "row-103-a", business_name: null, address: "5 Missing Name Rd", address_continued: null }),
  ];
  const result = await buildOrBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumRegistrations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_principal_place_rows, 5);
  assert.equal(result.manifest.coverage.distinct_source_registrations, 4);
  assert.equal(result.manifest.coverage.active_registrations_published, 3);
  assert.equal(result.manifest.coverage.legal_entity_registrations, 2);
  assert.equal(result.manifest.coverage.assumed_business_name_registrations, 1);
  assert.equal(result.manifest.coverage.quarantined_registration_groups, 1);
  assert.equal(result.manifest.coverage.quarantined_source_rows, 1);
  assert.equal(result.manifest.coverage.registrations_with_multiple_principal_place_rows, 1);
  assert.equal(result.manifest.coverage.registrations_with_eligible_us_principal_place_address, 3);
  assert.equal(result.manifest.coverage.eligible_us_registration_zip_contributions, 4);
  assert.equal(result.manifest.coverage.physical_sites, null);
  const verified = await verifyOrBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-or-business-registration-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === null), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "or-business-registry-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);

  const resumed = await buildOrBusinessRegistry({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp-resume")),
    catalogMetadata: metadata(),
    sourceSnapshotPath: path.join(result.releaseDirectory, sourceArtifact.path),
    minimumRegistrations: 1,
    logger: () => {},
    now: () => new Date("2026-08-31T13:00:00.000Z"),
  });
  assert.equal(resumed.manifest.coverage.source_principal_place_rows, 5);
  assert.equal(resumed.manifest.coverage.active_registrations_published, 3);
  assert.equal(resumed.manifest.source_release_id, result.manifest.source_release_id);
});

test("blocks Oregon schema drift, duplicate source-row identity, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-or-business-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "entity_type" ? { ...column, dataTypeName: "number" } : column), selectedSourceRowCount: 1, distinctRegistrationCount: 1 });
  await assert.rejects(() => buildOrBusinessRegistry({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [row()], minimumRegistrations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildOrBusinessRegistry({
    outputRoot: path.join(root, "duplicate"),
    zbpPointer,
    catalogMetadata: metadata({ selectedSourceRowCount: 2, distinctRegistrationCount: 1 }),
    sourceRecords: [row(), row()],
    minimumRegistrations: 1,
    logger: () => {},
  }), /strictly increasing/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildOrBusinessRegistry({
    outputRoot: path.join(root, "cancelled"),
    zbpPointer,
    catalogMetadata: metadata({ selectedSourceRowCount: 1, distinctRegistrationCount: 1 }),
    sourceRecords: [row()],
    minimumRegistrations: 1,
    signal: controller.signal,
    logger: () => {},
  }), { name: "AbortError" });
});
