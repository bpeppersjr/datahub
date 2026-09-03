import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  indexStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceRevalidation,
  validateStateBusinessSourceRevalidation,
} from "./state-business-source-revalidation.mjs";

const BASE_DOCUMENT = JSON.parse(await readFile(DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH, "utf8"));

function fixture() {
  return structuredClone(BASE_DOCUMENT);
}

test("validates, indexes, and summarizes the exact non-acquiring parallel source revalidation", () => {
  const document = fixture();
  assert.equal(validateStateBusinessSourceRevalidation(document), document);
  assert.deepEqual([...indexStateBusinessSourceRevalidation(document).keys()], ["CA", "GA", "OK", "NE", "VT"]);
  assert.equal(indexStateBusinessSourceRevalidation(document).get("OK").decision, "hold");
  assert.deepEqual(summarizeStateBusinessSourceRevalidation(document, document.coverage_release_id), {
    schema_version: "1.0.0",
    revalidation_id: "state-business-source-revalidation-2026-09-03",
    observed_at: "2026-09-03",
    coverage_release_id: "national-business-coverage-views-20260902-115337634Z-ba689784",
    current_coverage_release_id: "national-business-coverage-views-20260902-115337634Z-ba689784",
    coverage_release_matches_current: true,
    jurisdictions_revalidated: 5,
    hold_decisions: 5,
    bounded_connector_decisions: 0,
    changed_decisions: 0,
    autonomous_acquisitions_authorized: 0,
    production_ready_jurisdictions: 0,
  });
});

test("rejects decision escalation and every acquisition or publication authority flag", () => {
  for (const field of [
    "autonomous_acquisition_authorized",
    "paid_acquisition_authorized",
    "complete_source_acquisition_authorized",
    "row_bearing_preflight_authorized",
    "offline_fixture_connector_authorized",
    "bounded_connector_implementation_authorized",
    "production_ready",
  ]) {
    const document = fixture();
    document.states[0][field] = true;
    assert.throws(() => validateStateBusinessSourceRevalidation(document), /authorization boundary drifted/, field);
  }
  const decision = fixture();
  decision.states[0].prior_decision = "proceed-to-bounded-connector";
  decision.states[0].decision = "proceed-to-bounded-connector";
  decision.states[0].bounded_connector_implementation_authorized = true;
  assert.throws(() => validateStateBusinessSourceRevalidation(decision), /decision is invalid/);
});

test("rejects global control, forbidden-operation, privacy, scope, parallel-wave, URL, and gate drift", () => {
  const control = fixture();
  control.controls.purchases_made = 1;
  assert.throws(() => validateStateBusinessSourceRevalidation(control), /purchases_made must remain zero/);

  const operation = fixture();
  operation.forbidden_operations = operation.forbidden_operations.filter((value) => value !== "purchase");
  assert.throws(() => validateStateBusinessSourceRevalidation(operation), /forbidden operation boundary drifted/);

  const privacyClass = fixture();
  privacyClass.required_excluded_data_classes[0] = "none";
  assert.throws(() => validateStateBusinessSourceRevalidation(privacyClass), /privacy boundary drifted/);

  const scope = fixture();
  scope.states[0].state_abbreviation = "TX";
  assert.throws(() => validateStateBusinessSourceRevalidation(scope), /state rank 1 is invalid/);

  const wave = fixture();
  wave.parallel_execution.waves[0].concurrent_state_abbreviations = ["VT"];
  assert.throws(() => validateStateBusinessSourceRevalidation(wave), /parallel wave-1 evidence drifted/);

  const workstreamLimit = fixture();
  workstreamLimit.parallel_execution.maximum_active_workstreams = 2;
  assert.throws(() => validateStateBusinessSourceRevalidation(workstreamLimit), /parallel workstream limit drifted/);

  const waveEvidence = fixture();
  waveEvidence.parallel_execution.waves[0].overlap_evidence = "No concurrent work occurred.";
  assert.throws(() => validateStateBusinessSourceRevalidation(waveEvidence), /parallel wave-1 evidence drifted/);

  const url = fixture();
  url.states[0].official_urls[0] = "https://example.com/not-official";
  assert.throws(() => validateStateBusinessSourceRevalidation(url), /official evidence URLs drifted/);

  const gate = fixture();
  gate.states[0].unresolved_gates = ["rights"];
  assert.throws(() => validateStateBusinessSourceRevalidation(gate), /unresolved gates are invalid/);
});

test("rejects coherent coverage, subset, ordering, percentage, candidate, date, and prose tampering", () => {
  const coherentCoverage = fixture();
  coherentCoverage.states[0].current_coverage.reported_profiles -= 1;
  coherentCoverage.states[0].current_coverage.baseline_minus_profiles += 1;
  coherentCoverage.states[0].current_coverage.diagnostic_profile_percent = 49.8;
  assert.throws(() => validateStateBusinessSourceRevalidation(coherentCoverage), /pinned coverage evidence drifted/);

  const subset = fixture();
  subset.states[0].current_coverage.zctas_with_record_level_evidence = subset.states[0].current_coverage.material_zctas + 1;
  assert.throws(() => validateStateBusinessSourceRevalidation(subset), /coverage subset exceeds its denominator/);

  const ordering = fixture();
  ordering.states[1].current_coverage.baseline_minus_profiles = 2000000;
  ordering.states[1].current_coverage.nonemployer_baseline_2023 = ordering.states[1].current_coverage.reported_profiles + 2000000;
  ordering.states[1].current_coverage.diagnostic_profile_percent = Number(((ordering.states[1].current_coverage.reported_profiles / ordering.states[1].current_coverage.nonemployer_baseline_2023) * 100).toFixed(1));
  assert.throws(() => validateStateBusinessSourceRevalidation(ordering), /states are not ranked/);

  const percentage = fixture();
  percentage.states[0].current_coverage.diagnostic_profile_percent = 99;
  assert.throws(() => validateStateBusinessSourceRevalidation(percentage), /diagnostic percent does not reconcile/);

  const candidate = fixture();
  candidate.states[0].candidate.product = "Different source";
  assert.throws(() => validateStateBusinessSourceRevalidation(candidate), /candidate identity drifted/);

  const date = fixture();
  date.revalidation_id = "state-business-source-revalidation-2026-02-31";
  date.observed_at = "2026-02-31";
  assert.throws(() => validateStateBusinessSourceRevalidation(date), /invalid revalidation identity|observation date is invalid/);

  const prose = fixture();
  prose.states[0].strongest_bounded_next_action = "Do not delay; purchase and publish immediately.";
  assert.throws(() => validateStateBusinessSourceRevalidation(prose), /not a written preflight/);
});
