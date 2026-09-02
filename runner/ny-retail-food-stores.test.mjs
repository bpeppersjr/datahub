import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  NY_RETAIL_FOOD_SCHEMA,
  NY_RETAIL_FOOD_SCHEMA_FINGERPRINT,
  buildNyRetailFoodStores,
  normalizeNyRetailFoodStore,
  requestNyRetailFoodJson,
  schemaFingerprint,
  verifyNyRetailFoodStores,
} from "./ny-retail-food-stores.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "9a8c-vfzj",
    name: "Retail Food Stores",
    attribution: "New York State Department of Agriculture and Markets",
    provenance: "official",
    publicationStage: "published",
    license: null,
    rowsUpdatedAt: 1759245315,
    columns: NY_RETAIL_FOOD_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    metadata: { custom_fields: { "Dataset Summary": { Organization: "Division of Food Safety & Inspection", "Time Period": "Current", "Posting Frequency": "Annually", Coverage: "Statewide", Granularity: "Licensed entity" } } },
    selectedRecordCount: 3,
    distinctLicenseCount: 3,
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    county: "ALBANY",
    license_number: "010008",
    operation_type: "Store",
    estab_type: "AC",
    entity_name: "FIXTURE MARKET LLC",
    dba_name: "FIXTURE MARKET",
    street_number: "624",
    street_name: "DELAWARE AVE",
    city: "DELMAR",
    state: "NY",
    zip_code: "12054",
    square_footage: "2800",
    georeference: { type: "Point", coordinates: [-73.85206, 42.61512] },
    ...overrides,
  };
}

function context() {
  return {
    runId: "fixture-run",
    retrievedAt: "2026-09-02T12:00:00.000Z",
    sourceRowsUpdatedAt: "2025-09-30T15:15:15.000Z",
    sourceReleaseId: "fixture-source",
    baselineByZip: new Map([["12054", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:12054", geoid: "12054" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["12054", "12207", "99999"].map((zipCode) => ({ zip_code: zipCode, coverage_status: "zbp-and-zcta", current_usps_validity: { status: "unverified" }, geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode } }));
  const buffer = Buffer.from(`${rows.map(JSON.stringify).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = { dataset_id: "census-zbp-baseline", release_id: "zbp-fixture", complete_national_release: true, geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" }, artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }] };
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

test("pins the selected Socrata schema", () => {
  assert.equal(schemaFingerprint(metadata().columns), NY_RETAIL_FOOD_SCHEMA_FINGERPRINT);
});

test("normalizes license, site, source geocode, and documented and undocumented codes conservatively", () => {
  const normalized = normalizeNyRetailFoodStore(row({ estab_type: "ACY" }), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:ny_agm_retail_food_license_010008");
  assert.equal(normalized.entity_candidates.physical_site_id, "site:ny_agm_retail_food_license_010008");
  assert.equal(normalized.physical_address.zip_coverage_eligible, true);
  assert.equal(normalized.physical_address.postal_code, normalized.physical_address.zip_code);
  assert.equal(normalized.physical_address.zip4, null);
  assert.equal(normalized.geography.zcta_geoid, "12054");
  assert.equal(normalized.reported_coordinate.premise_coordinate_claim_permitted, false);
  assert.equal(normalized.retail_food_store_license_profile.square_footage_source_reported, 2800);
  assert.equal(normalized.retail_food_store_license_profile.establishment_codes.at(-1).definition_status, "undocumented-in-current-source-code-reference");
  assert.equal(normalized.export_policy, "local-review-only");
});

test("retains ZIP evidence without inventing a site when the street number is missing", () => {
  const normalized = normalizeNyRetailFoodStore(row({ street_number: undefined, georeference: undefined }), context());
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.physical_address.zip_coverage_eligible, true);
  assert.equal(normalized.physical_address.site_inference_eligible, false);
  assert.equal(normalized.reported_coordinate, null);
});

test("retries transient responses and rejects redirects and off-allowlist paths", async () => {
  let attempts = 0;
  const result = await requestNyRetailFoodJson("https://data.ny.gov/resource/9a8c-vfzj.json?$limit=1", {
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1 ? new Response("temporary", { status: 503 }) : new Response("[]", { status: 200 });
    },
    sleep: async () => {},
  });
  assert.deepEqual(result, []);
  assert.equal(attempts, 2);
  await assert.rejects(() => requestNyRetailFoodJson("https://data.ny.gov/resource/9a8c-vfzj.json", { fetchImpl: async () => new Response("", { status: 302 }) }), /redirect rejected/);
  await assert.rejects(() => requestNyRetailFoodJson("https://example.invalid/resource/9a8c-vfzj.json"), /outside the allowlist/);
});

test("builds and independently verifies a privacy-scoped retail-food release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ny-retail-food-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    row(),
    row({ license_number: "010009", entity_name: null, dba_name: "NO NUMBER MARKET", street_number: undefined, city: "ALBANY", zip_code: "12207", estab_type: "AY" }),
    row({ license_number: "010010", entity_name: null, dba_name: null, city: null, zip_code: "12207" }),
  ];
  const result = await buildNyRetailFoodStores({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumRows: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-09-02T12:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_license_records, 3);
  assert.equal(result.manifest.coverage.organizations_published, 2);
  assert.equal(result.manifest.coverage.provisional_physical_sites, 1);
  assert.equal(result.manifest.coverage.zip_evidence_addresses, 2);
  assert.equal(result.manifest.coverage.rows_with_undocumented_establishment_codes, 1);
  assert.equal(result.manifest.coverage.quarantined_source_records, 1);
  const verified = await verifyNyRetailFoodStores(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.organizations_published, 2);
  const normalizedArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "normalized-ny-retail-food-store-license-jsonl-gzip");
  const normalized = await gunzipRecords(path.join(result.releaseDirectory, normalizedArtifact.path));
  assert.equal(normalized.length, 2);
  assert.equal(normalized.every((record) => record.export_policy === "local-review-only"), true);
});

test("blocks schema drift, duplicate license numbers, source filter drift, and cancellation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ny-retail-food-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const base = { zbpPointer, catalogMetadata: metadata({ selectedRecordCount: 1, distinctLicenseCount: 1 }), minimumRows: 1, logger: () => {} };
  await assert.rejects(() => buildNyRetailFoodStores({ ...base, outputRoot: path.join(root, "schema"), sourceRecords: [row()], schemaFingerprintExpected: "bad" }), /selected schema changed/);
  await assert.rejects(() => buildNyRetailFoodStores({ ...base, outputRoot: path.join(root, "duplicate"), catalogMetadata: metadata({ selectedRecordCount: 2, distinctLicenseCount: 2 }), sourceRecords: [row(), row()] }), /not strictly increasing/);
  await assert.rejects(() => buildNyRetailFoodStores({ ...base, outputRoot: path.join(root, "filter"), sourceRecords: [row({ operation_type: "Warehouse" })], maximumQuarantineRate: 0 }), /quarantine rate/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildNyRetailFoodStores({ ...base, outputRoot: path.join(root, "cancel"), sourceRecords: [row()], signal: controller.signal }), /aborted/i);
});
