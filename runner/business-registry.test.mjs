import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  buildNationalBusinessRegistry,
  reconcileSnapRecord,
  SNAP_SERVICE_ENTITY_ID,
  verifyNationalBusinessRegistry,
} from "./business-registry.mjs";
import { normalizeSnapFeature } from "./usda-snap-retailers.mjs";

function sourceFeature(recordId, zipCode, overrides = {}) {
  return {
    attributes: {
      Record_ID: recordId,
      Store_Name: `Fixture Store ${recordId}`,
      Store_Street_Address: `${recordId} Main St`,
      Additonal_Address: null,
      City: "Fixture City",
      State: "IL",
      Zip_Code: zipCode,
      Zip4: "1234",
      County: "FIXTURE",
      Store_Type: "Supermarket",
      Latitude: 41.88,
      Longitude: -87.63,
      Incentive_Program: null,
      Grantee_Name: null,
      ObjectId: recordId,
      ...overrides,
    },
    geometry: { x: -87.63, y: 41.88 },
  };
}

function normalizedRecord(recordId = 101, zipCode = "60601", overrides = {}) {
  return normalizeSnapFeature(sourceFeature(recordId, zipCode, overrides), {
    runId: "source-ingest-fixture",
    retrievedAt: "2026-08-30T15:00:00.000Z",
    sourceUpdatedAt: "2026-08-19T17:40:09.953Z",
    sourceReleaseId: "usda-snap-20260819T174009953Z",
    zipCoverage: {
      geography: {
        status: "2020-zcta-polygon-available",
        geo_id: `zcta:${zipCode}`,
        geoid: zipCode,
        geometry_file: `source/zctas/prefix=${zipCode[0]}.geojson`,
      },
    },
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeFixtureSnapRelease(root) {
  const releaseId = "usda-snap-retailers-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const records = [normalizedRecord(101, "60601"), normalizedRecord(202, "01760", { State: "MA" })];
  const artifacts = [];
  for (const prefix of "0123456789") {
    const partitionRecords = records.filter((record) => record.address.zip_code.startsWith(prefix));
    const buffer = gzipSync(partitionRecords.map((record) => JSON.stringify(record)).join("\n") + (partitionRecords.length ? "\n" : ""));
    const relativePath = `derived/retailers/prefix=${prefix}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      record_count: partitionRecords.length,
      artifact_type: "normalized-snap-retailer-jsonl-gzip",
    });
  }
  const zipRows = [
    {
      zip_code: "01760",
      snap_retailer_snapshot: { retailer_count: 1 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:01760" },
      employer_baseline: { status: "published", establishments: 100 },
      baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "60601",
      snap_retailer_snapshot: { retailer_count: 1 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601" },
      employer_baseline: { status: "published", establishments: 1000 },
      baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "99999",
      snap_retailer_snapshot: { retailer_count: 0 },
      current_usps_validity: { status: "unverified" },
      geography: { status: "no-2020-zcta-polygon", geo_id: null },
      employer_baseline: null,
      baseline_coverage_status: "zcta-only",
    },
  ];
  const zipBuffer = Buffer.from(`${zipRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const zipPath = "derived/zip-coverage.jsonl";
  await writeFile(path.join(releaseDirectory, zipPath), zipBuffer);
  artifacts.push({
    path: zipPath,
    bytes: zipBuffer.length,
    sha256: sha256(zipBuffer),
    record_count: zipRows.length,
    artifact_type: "snap-zip-coverage-jsonl",
  });
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "usda-snap-retailers",
    release_id: releaseId,
    status: "published",
    complete_source_snapshot: true,
    source_release_id: "usda-snap-20260819T174009953Z",
    source_updated_at: "2026-08-19T17:40:09.953Z",
    coverage: { accepted_records: records.length },
    dependencies: [],
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

test("reconciles source-specific SNAP evidence without inferring an owner or general open status", () => {
  const result = reconcileSnapRecord(normalizedRecord());
  assert.deepEqual(result.entities.map((entity) => entity.entity_type), ["physical_site", "establishment"]);
  assert(result.entities.every((entity) => entity.identity_status === "provisional"));
  assert.deepEqual(result.relationships.map((item) => item.relationship_type), ["located_at", "provides_service"]);
  assert.equal(result.relationships[1].object_entity_id, SNAP_SERVICE_ENTITY_ID);
  assert.equal(result.assertions.find((item) => item.predicate === "establishment.source-status").value.value, "snap-authorized-as-of-source-update");
  assert(!result.assertions.some((item) => item.predicate.includes("owner") || item.predicate.includes("open")));
  assert(result.assertions.every((item) => item.source.source_record_id === "101" && item.export_policy === "public"));
});

test("publishes and verifies a partial registry while retaining denominator-only ZIPs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-registry-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const snapPointer = await writeFixtureSnapRelease(path.join(root, "snap"));
  const outputRoot = path.join(root, "registry");
  const result = await buildNationalBusinessRegistry({
    outputRoot,
    snapPointer,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.complete_national_business_registry, false);
  assert.equal(result.manifest.coverage.physical_sites, 2);
  assert.equal(result.manifest.coverage.establishments, 2);
  assert.equal(result.manifest.coverage.relationships, 4);
  assert.equal(result.manifest.coverage.zip_union_records, 3);
  assert.equal(result.manifest.coverage.authoritative_current_usps_zip_denominator, null);

  const verification = await verifyNationalBusinessRegistry(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verification.status, "published-partial");
  const zipArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "registry-zip-coverage-jsonl");
  const zipRows = (await readFile(path.join(result.releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
  const uncovered = zipRows.find((row) => row.zip_code === "99999");
  assert.equal(uncovered.registry_coverage.status, "denominator-only-no-record-level-contribution");
  assert.equal(uncovered.registry_coverage.complete_all_businesses, false);
});

test("verifier rejects a completeness claim", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-registry-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const snapPointer = await writeFixtureSnapRelease(path.join(root, "snap"));
  const result = await buildNationalBusinessRegistry({ outputRoot: path.join(root, "registry"), snapPointer, logger: () => {} });
  const manifestPath = path.join(result.releaseDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.complete_national_business_registry = true;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(
    () => verifyNationalBusinessRegistry(manifestPath),
    (error) => error.failures?.some((failure) => failure.reason === "release is not explicitly marked partial"),
  );
});
