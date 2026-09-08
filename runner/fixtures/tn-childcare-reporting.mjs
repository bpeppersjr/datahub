import { readFile } from "node:fs/promises";
import { normalizeTnChildcareFeature, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "../tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "../tn-childcare-preflight.mjs";
import { reconcileTnChildcareCenter } from "../tn-childcare-registry-adapter.mjs";
import { createTnChildcareGeographicEvidence } from "../tn-childcare-geographic-evidence.mjs";
const policyConfig = JSON.parse(await readFile(new URL("../../config/source-policies/tn-childcare-local-review.json", import.meta.url), "utf8"));
function fixture(Zip = "37201-0123", overrides = {}, runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", source = "a", geometry = { x: -86.78, y: 36.16 }) {
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
    Street_Address: "1 Main Street", Street_Address_2: null, City: "Nashville", State: "TN", Zip, County: "Davidson", ...overrides }, geometry };
  const record = normalizeTnChildcareFeature(feature, { runId, sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, outputWkid: 4326, transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION,
    editingInfo: { lastEditDate: 1788460779896, schemaLastEditDate: 1788460779896, dataLastEditDate: 1788460779896 }, itemModifiedEpochMs: 1788460782000 });
  return { record, context: { manifest, manifestSha256: "d".repeat(64) } };
}
/** Synthetic semantic fixture only: no publisher authenticity or acquired-release proof. */
export function createTnChildcareReportingFixture({ zip = "37201-0123", attributes = {}, geometry = { x: -86.78, y: 36.16 }, runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", source = "a" } = {}) {
  const {record, context} = fixture(zip, attributes, runId, source, geometry);
  const contribution = reconcileTnChildcareCenter(record, context);
  return { record, context, contribution, row: createTnChildcareGeographicEvidence(contribution) };
}

