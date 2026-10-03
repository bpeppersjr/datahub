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

test("loads a non-overlapping governed catalog with current source reassessments", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  assert.deepEqual(catalog.states.map((state) => state.state_abbreviation), ["CA", "GA", "OK", "NE", "VT", "ID", "NM", "ME", "WY", "NH", "MT", "RI", "SD", "WV", "ND", "DC", "AK", "OH", "NC", "NJ", "VA", "MI", "TN", "MA", "AZ", "MD", "MO", "IN", "SC", "LA", "MN", "AL", "WI", "AR", "HI", "IL", "MS", "NV", "KS", "KY", "TX", "UT", "WA", "CO", "CT", "DE", "FL", "IA", "NY", "OR", "PA"]);
  assert.equal(indexStateBusinessSourceAssessments(catalog).size, 51);
  assert.equal(stateAssessment(catalog, "MI").offline_fixture_connector_authorized, false);
  assert.equal(stateAssessment(catalog, "MI").authorized_next_action_type, "written-preflight-inquiry");
  for (const stateAbbreviation of ["DC", "AK"]) {
    assert.equal(stateAssessment(catalog, stateAbbreviation).offline_fixture_connector_authorized, true);
    assert.equal(stateAssessment(catalog, stateAbbreviation).authorized_next_action_type, "bounded-connector-implementation");
  }
  assert.deepEqual(summarizeStateBusinessSourceAssessments(catalog, catalog.coverage_release_id), {
    schema_version: "1.2.0",
    assessment_catalog_id: "state-business-source-assessment-catalog-51-2026-10-03",
    revalidation_id: "state-business-source-revalidation-2026-09-03",
    observed_at: "2026-10-03",
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
      "state-business-source-discovery-queue-7-wave-1-2026-09-03",
      "state-business-source-discovery-queue-8-wave-1-2026-09-03",
      "state-business-source-validation-wave-ar-hi-il-ms-nv-2026-09-22",
      "state-business-source-assessment-wave-ks-ky-tx-ut-wa-2026-09-22",
      "state-business-source-existing-wave-co-ct-de-fl-ia-ny-or-pa-2026-09-22",
      "ks-business-source-reassessment-2026-10-03",
      "ar-business-source-reassessment-2026-10-03",
      "ca-business-source-reassessment-2026-10-03",
      "id-business-source-reassessment-2026-10-03",
      "nh-business-source-reassessment-2026-10-03",
      "oh-business-source-reassessment-2026-10-03",
      "mi-business-source-reassessment-2026-10-03",
      "md-business-source-reassessment-2026-10-03",
      "la-business-source-reassessment-2026-10-03",
      "ga-business-source-reassessment-2026-10-03",
      "nm-business-source-reassessment-2026-10-03",
      "mt-business-source-reassessment-2026-10-03",
      "ok-business-source-reassessment-2026-10-03",
      "ne-business-source-reassessment-2026-10-03",
      "vt-business-source-reassessment-2026-10-03",
      "me-business-source-reassessment-2026-10-03",
      "wy-business-source-reassessment-2026-10-03",
      "ri-business-source-reassessment-2026-10-03",
      "sd-business-source-reassessment-2026-10-03",
      "wv-business-source-reassessment-2026-10-03",
      "nd-business-source-reassessment-2026-10-03",
      "nc-business-source-reassessment-2026-10-03",
      "il-business-source-reassessment-2026-10-03",
      "ms-business-source-reassessment-2026-10-03",
      "ky-business-source-reassessment-2026-10-03",
      "hi-business-source-reassessment-2026-10-03",
      "nv-business-source-reassessment-2026-10-03",
      "ut-business-source-reassessment-2026-10-03",
      "wa-business-source-reassessment-2026-10-03",
    ],
    jurisdictions_assessed: 51,
    jurisdictions_revalidated: 0,
    jurisdictions_discovered: 13,
    jurisdictions_official_source_validated: 30,
    jurisdictions_existing_governed_source_validated: 8,
    hold_decisions: 41,
    bounded_connector_decisions: 2,
    changed_decisions: 0,
    autonomous_acquisitions_authorized: 0,
    production_ready_jurisdictions: 8,
  });
  assert.deepEqual(summarizeLegacyStateBusinessSourceRevalidation(catalog, catalog.coverage_release_id), {
    schema_version: "1.2.0",
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
  const kansas = stateAssessment(catalog, "KS");
  assert.equal(kansas.assessment_id, "ks-business-source-reassessment-2026-10-03");
  assert.equal(kansas.assessment_kind, "official-source-correction");
  assert.equal(kansas.observed_at, "2026-10-03");
  assert.equal(kansas.candidate.availability, "one-time-paid-request");
  assert.equal(kansas.candidate.price, "$150-$200 by email or CD; entire-database contract and price unknown");
  assert.doesNotMatch(kansas.candidate.price, /1,500/);
  assert.equal(kansas.decision, "hold");
  assert.equal(kansas.autonomous_acquisition_authorized, false);
  const arkansas = stateAssessment(catalog, "AR");
  assert.equal(arkansas.assessment_id, "ar-business-source-reassessment-2026-10-03");
  assert.equal(arkansas.assessment_kind, "official-source-reassessment");
  assert.equal(arkansas.observed_at, "2026-10-03");
  assert.equal(arkansas.candidate.availability, "paid-subscriber-bulk-or-list-builder");
  assert.match(arkansas.candidate.price, /\$2,000\/month/);
  assert.equal(arkansas.decision, "hold");
  assert.equal(arkansas.autonomous_acquisition_authorized, false);
  assert.equal(arkansas.paid_acquisition_authorized, false);
  assert.equal(arkansas.offline_fixture_connector_authorized, false);
  assert.equal(arkansas.production_ready, false);
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

test("rejects every Arkansas reassessment authority escalation", async () => {
  for (const field of ["bounded_connector_implementation_authorized","autonomous_acquisition_authorized","paid_acquisition_authorized","complete_source_acquisition_authorized","row_bearing_preflight_authorized","offline_fixture_connector_authorized","production_ready","broad_layer_production_ready"]) {
    const catalog = await loadStateBusinessSourceAssessmentCatalog(); stateAssessment(catalog,"AR")[field]=true;
    assert.throws(()=>validateStateBusinessSourceAssessmentCatalog(catalog),/AR authorization boundary drifted/);
  }
});

test("current reassessments correct evidence without granting any new authority", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  for (const abbreviation of ["IL", "MS", "KY", "HI", "NV", "UT", "WA"]) {
    const state = stateAssessment(catalog, abbreviation);
    assert.equal(state.assessment_id, `${abbreviation.toLowerCase()}-business-source-reassessment-2026-10-03`);
    assert.equal(state.assessment_kind, "official-source-reassessment");
    assert.equal(state.observed_at, "2026-10-03");
    assert.equal(state.decision, "hold");
    assert.equal(state.changed_since_prior_review, false);
    assert.match(state.supersedes_assessment_id, /2026-?09-?22/);
    for (const field of ["bounded_connector_implementation_authorized", "autonomous_acquisition_authorized", "paid_acquisition_authorized", "complete_source_acquisition_authorized", "row_bearing_preflight_authorized", "offline_fixture_connector_authorized", "production_ready", "broad_layer_production_ready"]) {
      const changed = structuredClone(catalog);
      stateAssessment(changed, abbreviation)[field] = true;
      assert.throws(() => validateStateBusinessSourceAssessmentCatalog(changed), new RegExp(`${abbreviation} authorization boundary drifted`));
    }
    const altered = structuredClone(catalog);
    stateAssessment(altered, abbreviation).observed_evidence[0] = "invented permission";
    assert.throws(() => validateStateBusinessSourceAssessmentCatalog(altered), /content digest drifted/);
  }
  assert.match(stateAssessment(catalog, "IL").observed_evidence.join(" "), /daily full snapshots/);
  assert.match(stateAssessment(catalog, "MS").observed_evidence.join(" "), /principal address/);
  assert.match(stateAssessment(catalog, "MS").observed_evidence.join(" "), /does not parse the workbook/);
  assert.match(stateAssessment(catalog, "KY").observed_evidence.join(" "), /42 tab-delimited fields/);
  assert.match(stateAssessment(catalog, "HI").observed_evidence.join(" "), /Commercial use or resale/);
  assert.equal(stateAssessment(catalog, "NV").candidate.availability, "bulk-service-mentioned-contract-unverified");
  assert.equal(stateAssessment(catalog, "UT").candidate.availability, "paid-subscriber-bulk");
  assert.match(stateAssessment(catalog, "UT").observed_evidence.join(" "), /\$0.01 per record/);
  assert.match(stateAssessment(catalog, "WA").observed_evidence.join(" "), /columns: \[\]/);
  assert.match(stateAssessment(catalog, "WA").observed_evidence.join(" "), /noncommercial-purpose declaration/);
});

test("rejects aggregate evidence, source, privacy, and candidate drift", async () => {
  for (const mutate of [
    (catalog) => { stateAssessment(catalog, "MI").observed_evidence[0] = "fabricated"; },
    (catalog) => { stateAssessment(catalog, "TN").official_urls[0] = "https://example.gov/altered"; },
    (catalog) => { stateAssessment(catalog, "MA").required_exclusions[0] = "allow personal records"; },
    (catalog) => { stateAssessment(catalog, "AZ").candidate.product = "Altered product"; },
    (catalog) => { stateAssessment(catalog, "MD").observed_evidence[0] = "fabricated"; },
    (catalog) => { stateAssessment(catalog, "SC").candidate.price = "$0"; },
    (catalog) => { stateAssessment(catalog, "LA").observed_evidence[0] = "fabricated"; },
    (catalog) => { stateAssessment(catalog, "MN").candidate.price = "$0"; },
    (catalog) => { stateAssessment(catalog, "AL").official_urls[0] = "https://example.gov/altered"; },
    (catalog) => { stateAssessment(catalog, "WI").required_exclusions[0] = "allow all contacts"; },
  ]) {
    const catalog = await loadStateBusinessSourceAssessmentCatalog();
    mutate(catalog);
    assert.throws(() => validateStateBusinessSourceAssessmentCatalog(catalog), /catalog content digest drifted/);
  }
});

test("Queue 8 assessments retain either historical or explicit successor provenance and cannot authorize acquisition", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  for (const abbreviation of ["LA", "MN", "AL", "WI"]) {
    const state = stateAssessment(catalog, abbreviation);
    assert.equal(state.assessment_id, abbreviation === "LA" ? "la-business-source-reassessment-2026-10-03" : "state-business-source-discovery-queue-8-wave-1-2026-09-03");
    assert.equal(state.observed_at, abbreviation === "LA" ? "2026-10-03" : "2026-09-03");
    assert.equal(state.decision, "hold");
    assert.equal(state.authorized_next_action_type, "written-preflight-inquiry");
    for (const field of ["autonomous_acquisition_authorized", "paid_acquisition_authorized", "complete_source_acquisition_authorized", "row_bearing_preflight_authorized", "offline_fixture_connector_authorized", "production_ready"]) {
      const changed = structuredClone(catalog);
      stateAssessment(changed, abbreviation)[field] = true;
      assert.throws(() => validateStateBusinessSourceAssessmentCatalog(changed), new RegExp(`${abbreviation} authorization boundary drifted`));
    }
  }
});

test("returns defensive assessment-index copies", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  const first = indexStateBusinessSourceAssessments(catalog);
  first.get("OH").candidate.product = "mutated";
  const second = indexStateBusinessSourceAssessments(catalog);
  assert.equal(second.get("OH").candidate.product, "Business Filing Data");
});
