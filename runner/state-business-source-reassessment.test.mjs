import assert from "node:assert/strict";
import test from "node:test";
import { loadKansasBusinessSourceReassessment, validateKansasBusinessSourceReassessment } from "./state-business-source-reassessment.mjs";
import { loadStateBusinessSourceAssessmentWave } from "./state-business-source-assessment-wave.mjs";

test("Kansas reassessment corrects UCC conflation without widening authority", async () => {
  const value = await loadKansasBusinessSourceReassessment();
  assert.equal(value.supersedes_assessment_id, "ks-business-source-2026-09-22");
  assert.equal(value.access.classification, "one-time-paid-request");
  assert.match(value.access.bulk, /\$150/);
  assert.match(value.access.bulk, /\$200/);
  assert.doesNotMatch(value.access.bulk, /\$1,500/);
  assert.equal(value.decision, "hold");
  assert.equal(value.controls.downloads, 0);
});

test("historical September Kansas assessment remains independently loadable", async () => {
  const wave = await loadStateBusinessSourceAssessmentWave();
  const historical = wave.states.find(({ state }) => state.abbreviation === "KS");
  assert.equal(historical.assessment_id, "ks-business-source-2026-09-22");
  assert.equal(historical.observed_at, "2026-09-22");
  assert.match(historical.automation_terms_fees, /\$1,500 per month/);
});

test("Kansas reassessment rejects a recurring corporate or authority escalation", async () => {
  const original = await loadKansasBusinessSourceReassessment();
  for (const mutate of [
    value => { value.access.bulk += " Corporate price is $1,500 monthly."; },
    value => { value.connector_candidate = true; },
    value => { value.controls.record_requests = 1; },
    value => { value.supersedes_assessment_id = "other"; },
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.throws(() => validateKansasBusinessSourceReassessment(value));
  }
});
