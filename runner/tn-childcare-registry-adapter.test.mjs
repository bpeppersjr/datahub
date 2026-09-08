import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import addFormats from "ajv-formats";
import { normalizeTnChildcareFeature, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";
import { reconcileTnChildcareCenter } from "./tn-childcare-registry-adapter.mjs";
const policyConfig = JSON.parse(await readFile(new URL("../config/source-policies/tn-childcare-local-review.json", import.meta.url), "utf8"));
function fixture(Zip = "37201-0123", overrides = {}, runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", source = "a") {
  const failedRun = "tn-fixture-failed", failedStage = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", root = `data/industry-segments/runs/${failedRun}`, staging = `${root}/state-tn-childcare-TN/.staging/${failedStage}`;
  const pins = Object.fromEntries(Object.entries({ receipt: `${root}/receipt.json`, log: `${root}/logs/state-tn-childcare-TN.log`, selectedFeatures: `${staging}/selected-features.jsonl`, sourceObservation: `${staging}/source-observation.json`, publisherMetadata: `${staging}/publisher-metadata.xml` }).map(([key, path]) => [key, { path, bytes: 100, sha256: "c".repeat(64) }]));
  const manifest = { schema_version: "1.0.0", dataset_id: "tn-dhs-active-childcare-centers", connector_id: "tn-dhs-active-childcare-centers", connector_version: "1.0.1",
    transformation_version: TN_CHILDCARE_REPROCESS_TRANSFORMATION, recovery_version: "tn-childcare-failed-acquisition-recovery@1.0.0", run_id: runId,
    release_id: `tn-childcare-recovered-${runId}`, source_release_id: `tn-childcare-${source.repeat(64)}`, status: "complete", observed_at: "2026-09-08T00:00:01.000Z", processed_at: "2026-09-09T00:00:00.000Z",
    source_url: TN_CHILDCARE_LAYER, source_filter: TN_CHILDCARE_WHERE, policy: { profile: "tn-childcare-local-review@1.0.0", configuration_sha256: "a5f642f28fba1a3ba80cf31b3b080011c96cc7bc201a043c981bea46090cee2f", ...structuredClone(policyConfig) },
    counts: { selected: 20, accepted: 20, quarantined: 0 }, postal_coverage: { available: 18, missing_source_zip: 1, invalid_source_zip_placeholder: 1 }, quarantine_max_fraction: 0.05,
    claims: { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false, national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false, zip_inferred_from_geometry: false },
    recovery: { mode: "offline-failed-acquisition-recovery", network_requests: 0, failed_run_id: failedRun, failed_staging_id: failedStage, original_pins: pins,
      legacy_normalization: { transformation_version: "tn-childcare-normalization@1.0.0", accepted: 18, quarantined: 2, reasons: { "missing-required-text": 1, "invalid-postal-code": 1 }, quality_gate_passed: false, maximum_quarantine_fraction: 0.05 } } };
  const feature = { attributes: { OBJECTID: 1, Provider_ID: 123, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center", Provider_Name: "Fixture Center",
    Street_Address: "1 Main Street", Street_Address_2: null, City: "Nashville", State: "TN", Zip, County: "Davidson", ...overrides }, geometry: { x: -86.78, y: 36.16 } };
  const record = normalizeTnChildcareFeature(feature, { runId, sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, outputWkid: 4326, transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION,
    editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 }, itemModifiedEpochMs: 1788460782000 });
  return { record, context: { manifest, manifestSha256: "d".repeat(64) } };
}
test("TN pure candidates preserve split ZIP source evidence and recovered provenance without matching", () => {
  for (const zip of ["37201-0123", null, "", "0"]) {
    const { record, context } = fixture(zip), before = structuredClone({ record, context }), result = reconcileTnChildcareCenter(record, context);
    assert.deepEqual(result, reconcileTnChildcareCenter(record, context)); assert.deepEqual({ record, context }, before);
    assert.deepEqual(result.entities.map((r) => r.entity_type), ["physical_site", "establishment"]); assert.deepEqual(result.matchProfiles, []);
    assert.equal(result.exportPolicy, "local-review-only"); assert.equal(result.relationships[0].relationship_type, "located_at");
    assert.equal(result.zipCode, zip === "37201-0123" ? "37201" : null);
    const zipAssertion = result.assertions.find((r) => r.predicate === "site.zip-code"); assert.equal(Boolean(zipAssertion), zip === "37201-0123");
    assert.equal(result.evidence.zip_unavailable_reason, record.quality.zip_unavailable_reason);
    assert.deepEqual(result.evidence.normalized_provenance, record.provenance); assert.deepEqual(result.evidence.recovery, context.manifest.recovery);
    assert.equal(result.evidence.processed_at, context.manifest.processed_at); assert.match(result.evidence.confidence_semantics, /not verified operation, identity/);
    assert.ok(result.assertions.every((r) => r.observed_at === context.manifest.observed_at && r.first_seen === context.manifest.observed_at && r.value_type !== "geometry"));
    result.evidence.recovery.original_pins.receipt.path = "changed"; assert.deepEqual({ record, context }, before);
  }
});
test("TN source-release-row identities stay stable across recovery runs and distinguish other rows/releases", () => {
  const a = fixture(), b = fixture("37201-0123", {}, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"), c = fixture("37201-0123", { OBJECTID: 2 }), d = fixture("37201-0123", {}, undefined, "e");
  const results = [a, b, c, d].map(({ record, context }) => reconcileTnChildcareCenter(record, context));
  assert.deepEqual(results[0].entities, results[1].entities); assert.equal(new Set([results[0], results[2], results[3]].map((r) => r.entities[0].entity_id)).size, 3);
  const missing = fixture(null, { Provider_ID: null }); const r = reconcileTnChildcareCenter(missing.record, missing.context);
  assert.equal(r.assertions.some((a) => a.predicate.endsWith("external-identifier")), false); assert.equal(r.assertions.some((a) => a.predicate === "site.zip-code"), false);
});
test("TN adapter rejects normalized private fields postal alias coercion and invented assertions", () => {
  for (const mutate of [r => { r.owner = "private"; }, r => { r.business_name = { owner: "private" }; }, r => { r.geocode.private = "private"; }, r => { r.affiliation.parent_company = "invented"; },
    r => { r.physical_address.postal_code = "37201-0123"; }, r => { r.physical_address.zip4 = "00000"; }, r => { r.source_status.active_business_verified = true; }, r => { r.quality.zip_unavailable_reason = "missing-source-zip"; },
    r => { r.provenance.source_filter = "1=1"; }, r => { r.provenance.input_feature_sha256 = "bad"; }, r => { r.external_identifiers.push({ type: "owner", value: "private" }); },
    r => { r.external_identifiers.push(structuredClone(r.external_identifiers[0])); }, r => { r.external_identifiers[0].value = "00123"; }, r => { r.external_identifiers[0].value = " 123 "; }]) {
    const f = fixture(); mutate(f.record); assert.throws(() => reconcileTnChildcareCenter(f.record, f.context), /candidate rejected/);
  }
  for (const mutate of [r => { r.quality.zip_unavailable_reason = null; }, r => { r.physical_address.postal_code = "null"; }, r => { r.physical_address.zip4 = "0123"; }]) {
    const f = fixture(null); mutate(f.record); assert.throws(() => reconcileTnChildcareCenter(f.record, f.context));
  }
});
test("TN adapter rejects unsupported release policy claims recovery pins and legacy failure drift", () => {
  for (const mutate of [m => { m.connector_version = "1.0.0"; }, m => { m.transformation_version = "tn-childcare-normalization@1.0.0"; }, m => { m.policy.allowed_use.push("public export"); },
    m => { m.claims.export_authorized = true; }, m => { m.recovery.original_pins.receipt.path = "../outside"; }, m => { m.recovery.original_pins.log.sha256 = "bad"; },
    m => { m.recovery.original_pins.extra = {}; }, m => { m.recovery.failed_staging_id = m.run_id; }, m => { m.recovery.network_requests = 1; },
    m => { m.recovery.legacy_normalization.accepted = 20; }, m => { m.recovery.legacy_normalization.reasons.owner = { private: true }; }, m => { m.processed_at = "2020-01-01T00:00:00.000Z"; },
    m => { m.postal_coverage.available++; }]) { const f = fixture(); mutate(f.context.manifest); assert.throws(() => reconcileTnChildcareCenter(f.record, f.context)); }
  const f = fixture(); f.context.manifestSha256 = "bad"; assert.throws(() => reconcileTnChildcareCenter(f.record, f.context)); assert.throws(() => reconcileTnChildcareCenter(f.record));
});
test("TN candidates including missing ZIPs satisfy real entity assertion relationship schemas", async () => {
  const require = createRequire(import.meta.url), Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  for (const zip of ["37201-0123", null, "0"]) {
    const f = fixture(zip), result = reconcileTnChildcareCenter(f.record, f.context);
    for (const [name, rows] of [["business-entity", result.entities], ["business-assertion", result.assertions], ["business-relationship", result.relationships]]) {
      const schema = JSON.parse(await readFile(new URL(`../config/schemas/${name}.schema.json`, import.meta.url), "utf8")), validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
      for (const row of rows) assert.ok(validate(row), JSON.stringify(validate.errors));
    }
  }
});
