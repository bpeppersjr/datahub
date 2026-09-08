import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeTnChildcareFeature, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";
import { reconcileTnChildcareCenter } from "./tn-childcare-registry-adapter.mjs";
import { createTnChildcareGeographicEvidence, validateTnChildcareGeographicEvidence, TN_CHILDCARE_GEOGRAPHIC_VERSION } from "./tn-childcare-geographic-evidence.mjs";
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

function candidate(zip = "37201-0123", overrides = {}) { const f = fixture(zip, overrides); return reconcileTnChildcareCenter(f.record, f.context); }
test("TN reporting rows preserve nullable ZIP and exact source-row point evidence without matching", () => {
  assert.equal(TN_CHILDCARE_GEOGRAPHIC_VERSION, "tn-childcare-geographic-evidence@1.0.0");
  for (const zip of ["37201-0123", null, "0"]) {
    const contribution = candidate(zip), original = structuredClone(contribution), row = createTnChildcareGeographicEvidence(contribution);
    assert.deepEqual(contribution, original); assert.deepEqual(validateTnChildcareGeographicEvidence(row), row);
    assert.equal(row.identity_matching_eligible, false); assert.equal(row.export_policy, "local-review-only"); assert.equal(row.category, "childcare");
    assert.equal(row.zip_code, zip === "37201-0123" ? "37201" : null); assert.equal(row.address.zip4, zip === "37201-0123" ? "0123" : null);
    assert.equal(row.evidence.zip_unavailable_reason, zip === "37201-0123" ? null : zip === "0" ? "invalid-source-zip-placeholder" : "missing-source-zip");
    assert.deepEqual(row.location, { latitude: 36.16, longitude: -86.78 }); assert.equal(Object.hasOwn(row, "geometry"), false); assert.equal(Object.hasOwn(row, "profile_id"), false);
    assert.equal(row.evidence.assertions_sha256, createHash("sha256").update(JSON.stringify([...contribution.assertions].sort((a, b) => a.assertion_id.localeCompare(b.assertion_id)))).digest("hex"));
    row.address.street = "changed"; row.evidence.recovery.original_pins.receipt.path = "changed"; assert.deepEqual(contribution, original);
  }
});
test("TN creator rejects duplicated, invented and misbound contribution records", () => {
  for (const mutate of [
    c => { c.assertions.push(structuredClone(c.assertions[0])); },
    c => { c.assertions[0].subject_entity_id = c.entities[1].entity_id; },
    c => { c.assertions[0].source.source_field = "owner"; },
    c => { c.assertions[0].source.source_release_id = `tn-childcare-${"e".repeat(64)}`; },
    c => { c.assertions[0].confidence = 0.5; },
    c => { c.assertions.find(a => a.predicate === "establishment.source-classification").value.owner = "private"; },
    c => { c.assertions.find(a => a.predicate === "site.source-geography").value.current_usps_validity = "verified"; },
    c => { c.assertions.find(a => a.predicate === "establishment.source-affiliation").value.parent_company = "invented"; },
    c => { c.assertions.find(a => a.predicate === "establishment.external-identifier").value.value = "00123"; },
    c => { c.assertions[0].predicate = "site.owner"; },
    c => { c.assertions.push({ ...structuredClone(c.assertions[0]), predicate: "site.owner", value: "private" }); },
    c => { c.assertions[0].assertion_id = c.assertions[1].assertion_id; },
    c => { c.assertions.pop(); },
    c => { c.relationships[0].status = "inactive"; },
    c => { c.relationships[0].source.policy_id = "public"; },
    c => { c.relationships[0].source.source_record_id += "1"; },
    c => { c.relationships.push(structuredClone(c.relationships[0])); },
    c => { c.entities[0].identity_status = "verified"; },
    c => { c.matchProfiles.push({}); },
    c => { c.exportPolicy = "public"; },
    c => { c.evidence.assertions_sha256 = "a".repeat(64); },
  ]) { const c = candidate(); mutate(c); assert.throws(() => createTnChildcareGeographicEvidence(c)); }
});
test("TN row validator rejects private nested evidence, policy/source drift and inferred postal geography", () => {
  for (const mutate of [
    r => { r.address.owner = "private"; }, r => { r.location.geometry = {}; }, r => { r.source_status.owner = "private"; },
    r => { r.evidence.normalized_provenance.private = {}; }, r => { r.evidence.recovery.original_pins.receipt.path = "../outside"; },
    r => { r.evidence.recovery.original_pins.log.sha256 = "bad"; }, r => { r.evidence.recovery.network_requests = 1; },
    r => { r.evidence.recovery.legacy_normalization.quality_gate_passed = true; },
    r => { r.evidence.recovery.original_pins.receipt.bytes = 1_000_001; }, r => { r.evidence.recovery.legacy_normalization.reasons.owner = 1; },
    r => { r.evidence.recovery.failed_staging_id = r.source.ingest_run_id; }, r => { r.evidence.processed_at = "2020-01-01T00:00:00.000Z"; },
    r => { r.source.source_record_id += "1"; }, r => { r.source.source_id = "nj-licensed-childcare-centers"; },
    r => { r.source.transformation_version = "unknown"; }, r => { r.source.policy_id = "public"; }, r => { r.identity_matching_eligible = true; },
    r => { r.evidence.assertions_sha256 = "bad"; }, r => { r.evidence.confidence_semantics = "verified identity"; },
    r => { r.location.latitude = null; }, r => { r.location.longitude = -100; }, r => { r.site_entity_id = r.site_entity_id.replace(/.$/, "0"); },
    r => { r.address.postal_code = "37201-0123"; }, r => { r.names[0].raw = { owner: "private" }; },
  ]) { const row = createTnChildcareGeographicEvidence(candidate()); mutate(row); assert.throws(() => validateTnChildcareGeographicEvidence(row)); }
  for (const mutate of [r => { r.evidence.zip_unavailable_reason = null; }, r => { r.address.zip4 = "0123"; }, r => { r.zip_code = "37201"; }, r => { r.zip_code = "null"; }]) {
    const row = createTnChildcareGeographicEvidence(candidate(null)); mutate(row); assert.throws(() => validateTnChildcareGeographicEvidence(row));
  }
});
test("TN null point and missing provider ID remain gaps; distinct same-name rows are not merged", () => {
  const f = fixture(null, { Provider_ID: null }); f.record.geocode.latitude = null; f.record.geocode.longitude = null; f.record.geocode.status = "missing-source-point";
  const row = createTnChildcareGeographicEvidence(reconcileTnChildcareCenter(f.record, f.context)); assert.deepEqual(row.location, { latitude: null, longitude: null });
  const first = createTnChildcareGeographicEvidence(candidate()), second = createTnChildcareGeographicEvidence(candidate("37201-0123", { OBJECTID: 2 }));
  assert.deepEqual(first.names, second.names); assert.notEqual(first.site_entity_id, second.site_entity_id);
});
