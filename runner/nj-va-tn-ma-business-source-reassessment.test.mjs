import assert from "node:assert/strict";
import test from "node:test";
import { loadNjVaTnMaBusinessSourceReassessment, loadNjVaTnMaBusinessSourceReassessments, validateNjVaTnMaBusinessSourceReassessment } from "./nj-va-tn-ma-business-source-reassessment.mjs";

test("four observations retain source-contract and collection boundaries", async () => {
  const values = await loadNjVaTnMaBusinessSourceReassessments();
  assert.deepEqual(values.map(value => value.state.abbreviation), ["NJ", "VA", "TN", "MA"]);
  const [nj, va, tn, ma] = values;
  assert.match(nj.access.bulk, /active-only or ZIP selector is not established/);
  assert.match(nj.automation_terms_fees, /June 27, 2030/);
  assert.match(va.access.bulk, /discretionary creation/);
  assert.match(va.temporal_refresh, /not a database history/);
  assert.match(tn.access.fees, /402 is not evidence of the product price/);
  assert.match(tn.access.bulk, /live product availability was not revalidated/);
  assert.match(ma.automation_terms_fees, /both manual and automated/);
  assert.match(ma.temporal_refresh, /complete snapshot or delta/);
  for (const value of values) {
    assert.match(value.statewide_completeness, /statewide_complete=false/);
    assert.match(value.address_zip, /ZIP5 and ZIP4/);
  }
});

for (const state of ["NJ", "VA", "TN", "MA"]) {
  test(`${state} fails closed on changed evidence, authority and action counters`, async () => {
    const original = await loadNjVaTnMaBusinessSourceReassessment(state);
    const mutations = [
      value => { value.decision = "proceed-to-bounded-connector"; },
      value => { value.connector_candidate = true; },
      value => { value.observed_at = "2026-10-04"; },
      value => { value.supersedes_assessment_id = "wrong"; },
      value => { value.access.api = "verified"; },
      value => { value.statewide_completeness = "complete"; },
      value => { value.citations[0].url = "https://example.com"; },
      value => { value.unresolved_gates = []; },
      value => { value.authorized = true; },
      ...Object.keys(original.controls).map(key => value => { value.controls[key] = key === "official_primary_sources_only" ? false : key === "portal_automation" ? true : 1; }),
      ...Object.keys(original.authority).map(key => value => { value.authority[key] = true; }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original);
      mutate(value);
      assert.throws(() => validateNjVaTnMaBusinessSourceReassessment(value), /reassessment rejected/);
    }
    assert.throws(() => validateNjVaTnMaBusinessSourceReassessment(original, "XX"), /state identity/);
    const clone = validateNjVaTnMaBusinessSourceReassessment(original);
    clone.citations[0].evidence = "changed";
    assert.notEqual(original.citations[0].evidence, "changed");
  });
}

test("loader rejects unknown states before constructing paths", async () => {
  await assert.rejects(loadNjVaTnMaBusinessSourceReassessment("../NJ"), /state identity/);
});
