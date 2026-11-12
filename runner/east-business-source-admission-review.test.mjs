import assert from "node:assert/strict";
import test from "node:test";
import {
  EAST_ADMISSION_REVIEW_STATES,
  loadEastBusinessSourceAdmissionReview,
  validateEastBusinessSourceAdmissionReviewConfig,
} from "./east-business-source-admission-review.mjs";

test("East admission review composes four pinned HOLD assessments without new authority", async () => {
  const wave = await loadEastBusinessSourceAdmissionReview();
  assert.deepEqual(wave.scope, [...EAST_ADMISSION_REVIEW_STATES]);
  assert.deepEqual(wave.decisions, { hold: 4, connector_candidate: 0 });
  assert.deepEqual(wave.controls, {
    record_requests: 0,
    datasets_acquired: 0,
    accounts_created: 0,
    terms_accepted: 0,
    fees_paid: 0,
    publisher_contacts: 0,
    portal_automation: false,
    production_changes: 0,
  });
  assert.equal(wave.claims.observations_refreshed_by_wave, false);
  assert.ok(Object.entries(wave.claims).filter(([key]) => key !== "observations_refreshed_by_wave").every(([, value]) => value === false));
  assert.equal(wave.states.length, 4);
  for (const row of wave.states) {
    assert.equal(row.decision, "hold");
    assert.equal(row.assessment.state.abbreviation, row.state);
    assert.equal(row.assessment.connector_candidate, false);
    assert.ok(Object.values(row.assessment.authority).every(value => value === false));
    assert.ok(row.unresolved_gates.length >= 8);
  }
});

test("East admission review config rejects scope, path, identity and authority widening", async () => {
  const wave = await loadEastBusinessSourceAdmissionReview();
  const base = {
    schema_version: "state-business-source-admission-review-wave-config@1.0.0",
    wave_id: wave.wave_id,
    assembled_at: wave.assembled_at,
    scope: [...EAST_ADMISSION_REVIEW_STATES],
    inputs: Object.fromEntries(wave.states.map(row => [row.state, {
      path: `config/state-business-source-assessments/${row.state.toLowerCase()}-2026-10-03.json`,
      sha256: row.input_sha256,
      assessment_id: row.assessment_id,
    }])),
  };
  for (const mutate of [
    value => value.scope.pop(),
    value => { value.inputs.AL.path = "config/state-business-source-assessments/ga-2026-10-03.json"; },
    value => { value.inputs.NC.assessment_id = value.inputs.SC.assessment_id; },
    value => { value.extra = true; },
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.throws(() => validateEastBusinessSourceAdmissionReviewConfig(changed));
  }
  const widened = structuredClone(wave.states[0].assessment);
  const authorityKey = Object.keys(widened.authority)[0];
  widened.authority[authorityKey] = true;
  assert.equal(Object.values(widened.authority).every(value => value === false), false);
});
