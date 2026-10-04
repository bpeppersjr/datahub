import assert from "node:assert/strict";
import test from "node:test";
import { loadAkDcBusinessSourceReassessment, loadAkDcBusinessSourceReassessments, validateAkDcBusinessSourceReassessment } from "./alaska-dc-business-source-reassessment.mjs";

test("AK/DC preserve bounded implementation without refreshing historical row evidence", async () => {
  const [ak, dc] = await loadAkDcBusinessSourceReassessments();
  for (const value of [ak, dc]) {
    assert.equal(value.decision, "proceed-to-bounded-connector");
    assert.deepEqual(value.authority, { source_access: false, acquisition: false, connector_implementation: true, production: false });
    assert.equal(value.controls.record_requests, 0);
    assert.equal(value.controls.datasets_acquired, 0);
    assert.equal(value.supersedes_assessment_id, "state-business-source-discovery-queue-4-wave-3-2026-09-03");
  }
  assert.match(ak.redistribution, /Copyright Notice/);
  assert.match(ak.fields.summary, /historical.*35-column/);
  assert.match(ak.offline_implementation, /unparsed row bytes/);
  assert.match(dc.fields.summary, /32 fields/);
  assert.match(dc.access.search, /BOSS/);
  assert.match(dc.temporal_refresh, /biennial filing obligation is not a data publication cadence/);
  assert.match(dc.redistribution, /was not re-established/);
});

test("immutable reassessments reject acquisition, production and evidence substitution", async () => {
  for (const original of await loadAkDcBusinessSourceReassessments()) {
    for (const change of [
      value => { value.authority.acquisition = true; },
      value => { value.authority.source_access = true; },
      value => { value.authority.production = true; },
      value => { value.authority.network_execution = true; },
      value => { value.decision = "existing-governed-source"; },
      value => { value.controls.record_requests = 1; },
      value => { value.fields.summary = "Current transport schema fully verified."; },
      value => { value.temporal_refresh = "Fresh October count receipt exists."; },
      value => { value.citations[0].url = "https://example.com/"; },
      value => { value.supersedes_assessment_id = "other"; },
    ]) {
      const altered = structuredClone(original);
      change(altered);
      assert.throws(() => validateAkDcBusinessSourceReassessment(altered));
    }
    const other = original.state.abbreviation === "AK" ? "DC" : "AK";
    assert.throws(() => validateAkDcBusinessSourceReassessment(original, other));
  }
  await assert.rejects(loadAkDcBusinessSourceReassessment("CA"), /state identity/);
});

test("callers cannot mutate subsequent loaded evidence", async () => {
  const value = await loadAkDcBusinessSourceReassessment("AK");
  value.authority.production = true;
  assert.equal((await loadAkDcBusinessSourceReassessment("AK")).authority.production, false);
});
