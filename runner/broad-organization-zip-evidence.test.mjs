import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGzip } from "node:zlib";
import { BROAD_ORGANIZATION_ZIP_SOURCES as SOURCES, BROAD_ORGANIZATION_REGISTRY_RELEASE } from "./broad-organization-zip-descriptors.mjs";
import { buildBroadOrganizationZipEvidence, verifyBroadOrganizationZipEvidence } from "./broad-organization-zip-evidence.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => `${JSON.stringify(value)}\n`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "broad-org-zip-evidence-")); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/business-registry/releases", BROAD_ORGANIZATION_REGISTRY_RELEASE, "derived"), { recursive: true });
  const dependencies = [], contributions = {};
  for (const [state, spec] of Object.entries(SOURCES)) {
    const policyTarget = path.join(root, "config/source-policies", spec.policy); await mkdir(path.dirname(policyTarget), { recursive: true });
    await copyFile(new URL(`../config/source-policies/${spec.policy}`, import.meta.url), policyTarget);
    const sourceRoot = path.join(root, path.dirname(spec.sourcePointer)); const releaseRoot = path.join(sourceRoot, "releases", spec.releaseId); await mkdir(path.join(releaseRoot, "derived"), { recursive: true });
    let address = state === "AK"
      ? { street: "1 Example Way", city: "Example", state: "AK", country: "US", zip_code: "99501", zip4: "1234" }
      : { street: "1 Example Way", city: "Example", state_code: state, zip_code: "01234", zip4: "5678", eligible_for_us_zip_coverage: true };
    let record = { schema_version: "1.0.0", normalized_record_id: `${state.toLowerCase()}:record:1`, [spec.nameField]: `Example ${state}`, source_status: { status: "source-native status; not current operations" }, provenance: { source_id: spec.normalizedSourceId, source_release_id: spec.sourceReleaseId, transformation_version: spec.transformation }, export_policy: state === "DE" || state === "AK" ? "local-review-only" : "public" };
    if (state === "OR") { record.registration_kind = "legal-entity-registration"; record.principal_place_addresses = [address, { ...address, zip_code: null, eligible_for_us_zip_coverage: false }]; }
    else record[spec.addressField] = address;
    if (state === "DE" || state === "AK") record.privacy = { record_level_distribution: "local-review-only" };
    if (state === "AK") { address.site_inference_eligible = false; record.license_profile = { provisional_site_asserted: false }; record.entity_candidates = { organization_id: "organization:ak_fixture_1", identity_status: "provisional" }; }
    if (state === "OR") {
      const brand = { ...record, normalized_record_id: "or:brand:1", registration_kind: "assumed-business-name-registration", business_name: "Example Brand", principal_place_addresses: [address] };
      record._extraFixtureBrand = brand;
    }
    const rows = [record, ...(record._extraFixtureBrand ? [record._extraFixtureBrand] : [])]; delete record._extraFixtureBrand;
    const gz = await new Promise((resolve, reject) => { const stream = createGzip(); const chunks = []; stream.on("data", chunk => chunks.push(chunk)); stream.on("end", () => resolve(Buffer.concat(chunks))); stream.on("error", reject); stream.end(rows.map(json).join("")); });
    const artifactPath = "derived/fixture.jsonl.gz"; await writeFile(path.join(releaseRoot, artifactPath), gz);
    const sourceManifest = { dataset_id: spec.datasetId, release_id: spec.releaseId, ...(state === "IA" ? { complete_source_snapshot: true } : { status: "published" }), ...(state === "AK" ? { complete_active_license_snapshot: true } : {}), artifacts: [{ artifact_type: spec.artifactType, path: artifactPath, bytes: gz.length, sha256: digest(gz), record_count: rows.length }] };
    const manifestBytes = Buffer.from(json(sourceManifest)); await writeFile(path.join(releaseRoot, "manifest.json"), manifestBytes);
    const pointer = { dataset_id: spec.datasetId, release_id: spec.releaseId, manifest: `releases/${spec.releaseId}/manifest.json`, status: "published", manifest_sha256: digest(manifestBytes) };
    await writeFile(path.join(sourceRoot, "current.json"), json(pointer));
    dependencies.push({ dataset_id: spec.datasetId, release_id: spec.releaseId, manifest_sha256: digest(manifestBytes) });
    contributions[spec.registryKey] = { dataset_id: spec.datasetId, dataset_release_id: spec.releaseId, source_id: spec.registryContributionSourceId, source_release_id: spec.sourceReleaseId, identity_resolution: "one source-specific provisional administrative record; no physical site or cross-source merge" };
  }
  const registryRoot = path.join(root, "data/business-registry"); const registryRelease = path.join(registryRoot, "releases", BROAD_ORGANIZATION_REGISTRY_RELEASE); const summaryBytes = Buffer.from(json(contributions));
  const registryManifest = { dataset_id: "national-business-registry", release_id: BROAD_ORGANIZATION_REGISTRY_RELEASE, status: "published-partial", dependencies, artifacts: [{ artifact_type: "registry-source-contribution-summary", path: "derived/source-contributions.json", bytes: summaryBytes.length, sha256: digest(summaryBytes) }] };
  const registryBytes = Buffer.from(json(registryManifest)); await writeFile(path.join(registryRelease, "manifest.json"), registryBytes); await writeFile(path.join(registryRelease, "derived/source-contributions.json"), summaryBytes);
  await writeFile(path.join(registryRoot, "current.json"), json({ dataset_id: "national-business-registry", release_id: BROAD_ORGANIZATION_REGISTRY_RELEASE, manifest: `releases/${BROAD_ORGANIZATION_REGISTRY_RELEASE}/manifest.json`, status: "published", manifest_sha256: digest(registryBytes) }));
  return root;
}

test("immutable ZIP derivative adds AK organization-address evidence while preserving eight sources, ZIP+4, Oregon brands, and DE restrictions", async t => {
  const root = await fixture(t); const built = await buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-22T00:00:00.000Z") });
  assert.equal(built.manifest.source_contract.OR.record_kind, "registration"); assert.equal(built.manifest.source_contract.DE.field_export_policy.normalized_record_level_organizations_addresses_assertions_and_match_profiles, "local-review-only");
  assert.equal(built.manifest.source_contract.FL.normalized_source_id, "florida-sunbiz-quarterly-corporate-data");
  assert.equal(built.manifest.source_contract.FL.registry_contribution_source_id, "florida-division-of-corporations-quarterly-corporate-file");
  assert.equal(built.manifest.source_contract.NY.normalized_source_id, "new-york-active-corporations-monthly-extract");
  assert.equal(built.manifest.source_contract.NY.registry_contribution_source_id, "new-york-active-corporations");
  assert.deepEqual(built.manifest.source_contract.IA.publication_contract, { status: null, status_field_absent: true, complete_source_snapshot: true });
  assert.deepEqual(built.manifest.source_contract.CO.publication_contract, { status: "published" });
  assert.equal(built.manifest.schema_version, "broad-organization-zip-evidence@1.1.0");
  assert.equal(built.manifest.source_contract.AK.profile_source_id, "alaska-dcced-active-business-licenses");
  assert.equal(built.manifest.source_contract.AK.source_release_id, "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc");
  assert.match(built.manifest.source_contract.AK.identity_and_record_unit_semantics, /organization-address evidence/);
  const iaManifest = JSON.parse(await readFile(path.join(root, "data/business-sources/ia-business-registry-active-entities/releases", SOURCES.IA.releaseId, "manifest.json"), "utf8"));
  assert.equal(Object.hasOwn(iaManifest, "status"), false); assert.equal(iaManifest.complete_source_snapshot, true);
  assert.equal(built.manifest.conservation.input_record_total, 10); assert.equal(built.manifest.conservation.eligible_zip_row_total, 10); assert.equal(built.manifest.conservation.missing_or_ineligible_row_total, 1);
  const verified = await verifyBroadOrganizationZipEvidence(built.releaseDirectory, { root }); assert.equal(verified.status, "verified"); assert.equal(verified.source_count, 9);
  await assert.rejects(buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-22T00:00:00.000Z") }), /already exists/);
  const { createGunzip } = await import("node:zlib"); const readRows = async prefix => { const bytes = await readFile(path.join(built.releaseDirectory, `derived/organizations/zip-prefix=${prefix}.jsonl.gz`)); return new Promise((resolve, reject) => { const gunzip = createGunzip(), chunks = []; gunzip.on("data", chunk => chunks.push(chunk)); gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim().split("\n").map(JSON.parse))); gunzip.on("error", reject); gunzip.end(bytes); }); }; const rows = [...await readRows("01"), ...await readRows("99")];
  assert.equal(rows.find(row => row.state === "DE").export_policy, "local-review-only"); assert.equal(rows.find(row => row.state === "CO").zip_fields.zip4, "5678");
  const ak = rows.find(row => row.state === "AK");
  assert.equal(ak.zip_fields.zip5, "99501"); assert.equal(ak.zip_fields.zip4, "1234"); assert.equal(ak.zip_fields.eligible_for_zip_partition, true);
  assert.equal(ak.export_policy, "local-review-only"); assert.equal(ak.claims.source_reported_license_physical_address, true); assert.equal(ak.claims.provisional_site_asserted, false); assert.equal(ak.claims.physical_site, false);
  assert.equal(rows.filter(row => row.state === "OR" && row.record_kind === "brand").length, 1);
  assert.deepEqual(rows.find(row => row.state === "CO").source_record.source_status, { status: "source-native status; not current operations" });
  assert.equal(rows.every(row => row.claims.physical_site === false && row.claims.current_operation === false && row.claims.unique_business === false && row.claims.usps_validity === false), true);
  const missingPaths = built.manifest.artifacts.filter(item => item.path.includes("zip-prefix=missing/state=")).map(item => item.path);
  assert.equal(missingPaths.length, 9, "each publisher gets a bounded missing/ineligible shard, including empty shards");
  assert.ok(missingPaths.includes("derived/organizations/zip-prefix=missing/state=OR.jsonl.gz"));
  const missingBytes = await readFile(path.join(built.releaseDirectory, "derived/organizations/zip-prefix=missing/state=OR.jsonl.gz"));
  const missingRows = await new Promise((resolve, reject) => { const gunzip = createGunzip(), chunks = []; gunzip.on("data", chunk => chunks.push(chunk)); gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim().split("\n").map(JSON.parse))); gunzip.on("error", reject); gunzip.end(missingBytes); });
  assert.equal(missingRows.length, 1); assert.equal(missingRows[0].zip_partition, "missing-or-ineligible");
  assert.equal(await readFile(path.join(root, "data/business-sources/broad-organization-zip-evidence/current.json")).then(() => true, () => false), false, "builder does not change or create a current pointer");
});

test("builder and verifier reject mixed source releases and policy drift", async t => {
  const root = await fixture(t); const built = await buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-22T00:00:00.000Z") });
  const ct = SOURCES.CT; const pointerPath = path.join(root, ct.sourcePointer); const pointer = JSON.parse(await readFile(pointerPath, "utf8")); pointer.release_id = "wrong-release"; await writeFile(pointerPath, json(pointer));
  await assert.rejects(verifyBroadOrganizationZipEvidence(built.releaseDirectory, { root }), /pointer identity drifted/);
  const secondRoot = await fixture(t); const second = await buildBroadOrganizationZipEvidence({ root: secondRoot, asOf: new Date("2026-09-22T00:00:00.000Z") });
  const policyPath = path.join(secondRoot, "config/source-policies", SOURCES.CO.policy); const policy = JSON.parse(await readFile(policyPath, "utf8")); policy.redistribution += " Policy pin drift."; await writeFile(policyPath, json(policy));
  await assert.rejects(verifyBroadOrganizationZipEvidence(second.releaseDirectory, { root: secondRoot }), /policy.*drifted/);
});

test("verifier rejects output tampering and builder cleans only its owned staging directory on cancellation", async t => {
  const root = await fixture(t); const built = await buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-22T00:00:00.000Z") });
  const shard = path.join(built.releaseDirectory, "derived/organizations/zip-prefix=01.jsonl.gz"); await writeFile(shard, "tampered");
  await assert.rejects(verifyBroadOrganizationZipEvidence(built.releaseDirectory, { root }), /bytes\/hash mismatch/);
  const controller = new AbortController();
  await assert.rejects(buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-23T00:00:00.000Z"), signal: controller.signal, onProgress: () => controller.abort() }), { name: "AbortError" });
  const stages = await import("node:fs/promises").then(fs => fs.readdir(path.join(root, "data/business-sources/broad-organization-zip-evidence/releases")));
  assert.equal(stages.some(name => name.startsWith(".staging-")), false);
});

test("verifier rejects AK source semantic or lineage substitution", async t => {
  const root = await fixture(t); const built = await buildBroadOrganizationZipEvidence({ root, asOf: new Date("2026-09-22T00:00:00.000Z") });
  const manifestPath = path.join(built.releaseDirectory, "manifest.json"); const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.source_contract.AK.profile_source_id = "substituted-profile"; await writeFile(manifestPath, json(manifest));
  await assert.rejects(verifyBroadOrganizationZipEvidence(built.releaseDirectory, { root }), /source descriptor, status, or policy contract drifted/);
});
