import assert from "node:assert/strict";
import test from "node:test";

import {
  indexStateBusinessSourceAssessments,
  loadStateBusinessSourceAssessmentCatalog,
  summarizeLegacyStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceAssessments,
  validateStateBusinessSourceAssessmentCatalog,
} from "./state-business-source-assessment.mjs";

function stateAssessment(catalog, stateAbbreviation) {
  return catalog.states.find((state) => state.state_abbreviation === stateAbbreviation);
}

test("loads a non-overlapping governed catalog across revalidation and Queues 4 through 6", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  assert.deepEqual(catalog.states.map((state) => state.state_abbreviation), ["CA", "GA", "OK", "NE", "VT", "ID", "NM", "ME", "WY", "NH", "MT", "RI", "SD", "WV", "ND", "DC", "AK", "OH", "NC", "NJ", "VA", "MI", "TN", "MA", "AZ"]);
  assert.equal(indexStateBusinessSourceAssessments(catalog).size, 25);
  assert.equal(stateAssessment(catalog, "MI").offline_fixture_connector_authorized, false);
  assert.equal(stateAssessment(catalog, "MI").authorized_next_action_type, "written-preflight-inquiry");
  for (const stateAbbreviation of ["DC", "AK"]) {
    assert.equal(stateAssessment(catalog, stateAbbreviation).offline_fixture_connector_authorized, true);
    assert.equal(stateAssessment(catalog, stateAbbreviation).authorized_next_action_type, "bounded-connector-implementation");
  }
  assert.deepEqual(summarizeStateBusinessSourceAssessments(catalog, catalog.coverage_release_id), {
    schema_version: "1.0.0",
    assessment_catalog_id: "state-business-source-assessment-catalog-queue-6-2026-09-03",
    revalidation_id: "state-business-source-revalidation-2026-09-03",
    observed_at: "2026-09-03",
    coverage_release_id: catalog.coverage_release_id,
    current_coverage_release_id: catalog.coverage_release_id,
    coverage_release_matches_current: true,
    source_artifact_ids: [
      "state-business-source-revalidation-2026-09-03",
      "state-business-source-discovery-queue-4-wave-1-2026-09-03",
      "state-business-source-discovery-queue-4-wave-2-2026-09-03",
      "state-business-source-discovery-queue-4-wave-3-2026-09-03",
      "state-business-source-discovery-queue-5-wave-1-2026-09-03",
      "state-business-source-discovery-queue-6-wave-1-2026-09-03",
    ],
    jurisdictions_assessed: 25,
    jurisdictions_revalidated: 5,
    jurisdictions_discovered: 20,
    hold_decisions: 23,
    bounded_connector_decisions: 2,
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
  stateAssessment(authority, "MI").complete_source_acquisition_authorized = true;
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(authority), /MI authorization boundary drifted/);

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
  stateAssessment(stateProvenance, "MI").assessment_id = "state-business-source-revalidation-2026-09-03";
  stateAssessment(stateProvenance, "MI").assessment_kind = "revalidation";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(stateProvenance), /MI assessment provenance is invalid/);

  const stateDate = await loadStateBusinessSourceAssessmentCatalog();
  stateAssessment(stateDate, "MI").observed_at = "2026-09-02";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(stateDate), /MI assessment date or coverage pin is invalid/);

  const boundedDecision = await loadStateBusinessSourceAssessmentCatalog();
  stateAssessment(boundedDecision, "DC").bounded_connector_implementation_authorized = false;
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(boundedDecision), /DC authorization boundary drifted/);

  const holdAction = await loadStateBusinessSourceAssessmentCatalog();
  stateAssessment(holdAction, "MI").authorized_next_action_type = "bounded-connector-implementation";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(holdAction), /MI authorization boundary drifted/);

  const boundedAction = await loadStateBusinessSourceAssessmentCatalog();
  stateAssessment(boundedAction, "AK").authorized_next_action_type = "written-preflight-inquiry";
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(boundedAction), /AK authorization boundary drifted/);

  const offlineFixture = await loadStateBusinessSourceAssessmentCatalog();
  stateAssessment(offlineFixture, "DC").offline_fixture_connector_authorized = false;
  assert.throws(() => validateStateBusinessSourceAssessmentCatalog(offlineFixture), /DC authorization boundary drifted/);
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
    stateAssessment(catalog, "MI")[field] = true;
    assert.throws(() => validateStateBusinessSourceAssessmentCatalog(catalog), /MI authorization boundary drifted/);
  }
});

test("rejects aggregate evidence, source, privacy, and candidate drift", async () => {
  for (const mutate of [
    (catalog) => { stateAssessment(catalog, "MI").observed_evidence[0] = "fabricated"; },
    (catalog) => { stateAssessment(catalog, "TN").official_urls[0] = "https://example.gov/altered"; },
    (catalog) => { stateAssessment(catalog, "MA").required_exclusions[0] = "allow personal records"; },
    (catalog) => { stateAssessment(catalog, "AZ").candidate.product = "Altered product"; },
  ]) {
    const catalog = await loadStateBusinessSourceAssessmentCatalog();
    mutate(catalog);
    assert.throws(() => validateStateBusinessSourceAssessmentCatalog(catalog), /catalog content digest drifted/);
  }
});

test("returns defensive assessment-index copies", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  const first = indexStateBusinessSourceAssessments(catalog);
  first.get("OH").candidate.product = "mutated";
  const second = indexStateBusinessSourceAssessments(catalog);
  assert.equal(second.get("OH").candidate.product, "Business Filing Data");
});
