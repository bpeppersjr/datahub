import assert from "node:assert/strict";
import test from "node:test";
import { CA_ID_NH_OH_REASSESSMENT_IDS, loadCaIdNhOhBusinessSourceReassessment, loadCaIdNhOhBusinessSourceReassessments, validateCaIdNhOhBusinessSourceReassessment } from "./ca-id-nh-oh-business-source-reassessment.mjs";

test("four-state reassessment narrows evidence gaps without granting source actions", async () => {
  const values = await loadCaIdNhOhBusinessSourceReassessments();
  assert.deepEqual(values.map((value) => value.state.abbreviation), ["CA", "ID", "NH", "OH"]);
  const [ca, id, nh, oh] = values;
  assert.match(ca.redistribution, /places no restriction on use of filing data/);
  assert.match(ca.fields.summary, /not a verified bulk layout/);
  assert.match(ca.citations[1].evidence, /no complete PDF inspection claimed/);
  assert.match(id.access.api, /not business-entity retrieval/);
  assert.match(nh.active_status_semantics, /Active for trade names/);
  assert.match(nh.fields.summary, /differ from federal EIN/);
  assert.match(oh.candidate.price, /62\.50/);
  assert.match(oh.temporal_refresh, /Weekly\/monthly/);
  assert.match(oh.active_status_semantics, /exclusive use of a name/);
});

for (const state of Object.keys(CA_ID_NH_OH_REASSESSMENT_IDS)) {
  test(`${state} rejects evidence and source-action drift`, async () => {
    const original = await loadCaIdNhOhBusinessSourceReassessment(state);
    const mutations = [
      (value) => { value.state.abbreviation = "XX"; },
      (value) => { value.decision = "proceed"; },
      (value) => { value.connector_candidate = true; },
      (value) => { value.observed_at = "2026-10-04"; },
      (value) => { value.citations[0].evidence = "verified source rows"; },
      (value) => { value.redistribution = "unrestricted automatic download"; },
      (value) => { value.unresolved_gates = []; },
      ...Object.keys(original.authority).map((key) => (value) => { value.authority[key] = true; }),
      ...Object.keys(original.controls).map((key) => (value) => { value.controls[key] = key === "official_primary_sources_only" ? false : key === "portal_automation" ? true : 1; }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original);
      mutate(value);
      assert.throws(() => validateCaIdNhOhBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const clone = validateCaIdNhOhBusinessSourceReassessment(original);
    clone.authority.production_ready = true;
    assert.equal(original.authority.production_ready, false);
  });
}

test("loader rejects unknown states and a mismatched state file", async () => {
  await assert.rejects(loadCaIdNhOhBusinessSourceReassessment("XX"), /reassessment rejected/);
  await assert.rejects(loadCaIdNhOhBusinessSourceReassessment("CA", new URL("../config/state-business-source-assessments/id-2026-10-03.json", import.meta.url)), /reassessment rejected/);
});
