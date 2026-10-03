import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { WV_ND_NC_REASSESSMENT_STATES, loadWvNdNcBusinessSourceReassessment, loadWvNdNcBusinessSourceReassessments, validateWvNdNcBusinessSourceReassessment } from "./wv-nd-nc-business-source-reassessment.mjs";

test("current state evidence preserves HOLD and historical source provenance", async () => {
  const records = await loadWvNdNcBusinessSourceReassessments();
  assert.deepEqual(records.map(record => record.state.abbreviation), WV_ND_NC_REASSESSMENT_STATES);
  for (const record of records) {
    const old = JSON.parse(await readFile(path.join(APP_ROOT, record.local_evidence[0]), "utf8"));
    assert.equal(record.supersedes_assessment_id, old.queue_id);
    assert.equal(old.states.find(row => row.state_abbreviation === record.state.abbreviation).decision, "hold");
    assert.equal(record.decision, "hold");
    assert.ok(Object.values(record.authority).every(value => value === false));
  }
});

test("review preserves operationally significant distinctions", async () => {
  const [wv, nd, nc] = await loadWvNdNcBusinessSourceReassessments();
  assert.match(wv.active_status_semantics, /biennial/);
  assert.match(wv.access.bulk, /not documented all-change streams/);
  assert.match(wv.access.fees, /not inspectable/);
  assert.match(nd.active_status_semantics, /cannot establish later closures or corrections/);
  assert.equal(nd.fields.published, false);
  assert.match(nc.access.search, /explicitly prohibited/);
  assert.match(nc.fields.summary, /Direct PDF retrieval failed/);
});

test("authority grants and unsupported evidence edits fail validation", async () => {
  for (const state of WV_ND_NC_REASSESSMENT_STATES) {
    const record = await loadWvNdNcBusinessSourceReassessment(state);
    const mutations = [
      value => { value.citations[0].url = "https://example.com"; },
      value => { value.unresolved_gates = []; },
      value => { value.decision = "production-ready"; },
      value => { value.observed_at = "2026-10-04"; },
      ...Object.keys(record.authority).map(key => value => { value.authority[key] = true; }),
      ...Object.keys(record.controls).map(key => value => { value.controls[key] = !value.controls[key]; }),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(record); mutate(changed);
      assert.throws(() => validateWvNdNcBusinessSourceReassessment(changed), /reassessment rejected/);
    }
    assert.throws(() => validateWvNdNcBusinessSourceReassessment(record, "IL"), /state identity/);
  }
  await assert.rejects(loadWvNdNcBusinessSourceReassessment("../WV"), /state identity/);
});

test("returned assessments are defensive copies", async () => {
  const original = await loadWvNdNcBusinessSourceReassessment("WV");
  const copy = validateWvNdNcBusinessSourceReassessment(original);
  copy.citations[0].evidence = "changed";
  assert.notEqual(copy.citations[0].evidence, original.citations[0].evidence);
});
