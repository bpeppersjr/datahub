import assert from "node:assert/strict";
import test from "node:test";

import {
  indexStateBusinessSourceAssessments,
  loadStateBusinessSourceAssessmentCatalog,
  summarizeLegacyStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceAssessments,
  validateStateBusinessSourceAssessmentCatalog,
} from "./state-business-source-assessment.mjs";

test("loads a non-overlapping governed catalog across revalidation and Queue 5", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  assert.deepEqual(catalog.states.map((state) => state.state_abbreviation), ["CA", "GA", "OK", "NE", "VT", "OH", "NC", "NJ", "VA"]);
  assert.equal(indexStateBusinessSourceAssessments(catalog).size, 9);
  assert.deepEqual(summarizeStateBusinessSourceAssessments(catalog, catalog.coverage_release_id), {
    schema_version: "1.0.0",
    assessment_catalog_id: "state-business-source-assessment-catalog-2026-09-03",
    revalidation_id: "state-business-source-revalidation-2026-09-03",
    observed_at: "2026-09-03",
    coverage_release_id: catalog.coverage_release_id,
    current_coverage_release_id: catalog.coverage_release_id,
    coverage_release_matches_current: true,
    source_artifact_ids: ["state-business-source-revalidation-2026-09-03", "state-business-source-discovery-queue-5-wave-1-2026-09-03"],
    jurisdictions_assessed: 9,
    jurisdictions_revalidated: 5,
    jurisdictions_discovered: 4,
    hold_decisions: 9,
    bounded_connector_decisions: 0,
    changed_decisions: 0,
    autonomous_acquisitions_authorized: 0,
    production_ready_jurisdictions: 0,
  });
  assert.deepEqual(summarizeLegacyStateBusinessSourceRevalidation(catalog, catalog.coverage_release_id), {
    schema_version: "1.0.0",
    revalidation_id: "state-business-source-revalidation-2026-09-03",
    observed_at: "2026-09-03",
    coverage_release_id: catalog.coverage_release_id,
    current_coverage_release_id: catalog.coverage_release_id,
    coverage_release_matches_current: true,
    jurisdictions_revalidated: 5,
    hold_decisions: 5,
    bounded_connector_decisions: 0,
    changed_decisions: 0,
    autonomous_acquisitions_authorized: 0,
    production_ready_jurisdictions: 0,
  });
});

test("rejects overlapping provenance, decision escalation, and source-artifact drift", async () => {
  const overlapping = await loadStateBusinessSourceAssessmentCatalog();
  overlapping.states[5].state_abbreviation = "CA";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(overlapping), /state scope or order drifted|overlap/);

  const authority = await loadStateBusinessSourceAssessmentCatalog();
  authority.states[7].complete_source_acquisition_authorized = true;
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(authority), /NJ authorization boundary drifted/);

  const provenance = await loadStateBusinessSourceAssessmentCatalog();
  provenance.source_artifacts[1].coverage_release_id = "different-release";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(provenance), /source artifact descriptors drifted/);

  const descriptorKind = await loadStateBusinessSourceAssessmentCatalog();
  [descriptorKind.source_artifacts[0].artifact_kind, descriptorKind.source_artifacts[1].artifact_kind] = [
    descriptorKind.source_artifacts[1].artifact_kind,
    descriptorKind.source_artifacts[0].artifact_kind,
  ];
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(descriptorKind), /source artifact descriptors drifted/);

  const stateProvenance = await loadStateBusinessSourceAssessmentCatalog();
  stateProvenance.states[5].assessment_id = "state-business-source-revalidation-2026-09-03";
  stateProvenance.states[5].assessment_kind = "revalidation";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(stateProvenance), /OH assessment provenance is invalid/);
});

test("rejects every aggregate authority escalation", async () => {
  for (const field of [
    "bounded_connector_implementation_authorized",
    "autonomous_acquisition_authorized",
    "paid_acquisition_authorized",
    "complete_source_acquisition_authorized",
    "row_bearing_preflight_authorized",
    "offline_fixture_connector_authorized",
    "production_ready",
    "broad_layer_production_ready",
  ]) {
    const catalog = await loadStateBusinessSourceAssessmentCatalog();
    catalog.states[5][field] = true;
    assert.throws(() => validateStateBusinessSourceAssessmentCatalog(catalog), /OH authorization boundary drifted/);
  }
});

test("returns defensive assessment-index copies", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  const first = indexStateBusinessSourceAssessments(catalog);
  first.get("OH").candidate.product = "mutated";
  const second = indexStateBusinessSourceAssessments(catalog);
  assert.equal(second.get("OH").candidate.product, "Business Filing Data");
});
