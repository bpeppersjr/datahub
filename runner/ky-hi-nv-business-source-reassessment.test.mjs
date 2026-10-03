import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { KY_HI_NV_REASSESSMENT_STATES, loadKyHiNvBusinessSourceReassessment, loadKyHiNvBusinessSourceReassessments, validateKyHiNvBusinessSourceReassessment } from "./ky-hi-nv-business-source-reassessment.mjs";

test("KY/HI/NV current evidence retains HOLD and zero external action", async () => {
  const states = await loadKyHiNvBusinessSourceReassessments();
  assert.deepEqual(states.map(value => value.state.abbreviation), KY_HI_NV_REASSESSMENT_STATES);
  for (const value of states) {
    assert.equal(value.decision, "hold");
    assert.equal(value.connector_candidate, false);
    assert.equal(value.observed_at, "2026-10-03");
    for (const [key, count] of Object.entries(value.controls)) assert.equal(count, key === "official_primary_sources_only" ? true : key === "portal_automation" ? false : 0);
  }
});

test("corrections distinguish local KY schema proof, HI restrictions, and NV bulk mentions", async () => {
  const [ky, hi, nv] = await loadKyHiNvBusinessSourceReassessments();
  assert.match(ky.fields.summary, /42 tab-delimited fields/);
  assert.match(ky.fields.summary, /did not reparse the current workbook/);
  assert.match(ky.access.fees, /\$2,000\/month/);
  assert.match(ky.redistribution, /local-review-only/);
  assert.match(hi.automation_terms_fees, /prohibit automated service access/);
  assert.match(hi.redistribution, /restrict commercial reuse\/resale/);
  assert.match(hi.reassessment_reason, /404/);
  assert.equal(nv.access.classification, "bulk-service-mentioned-contract-unverified");
  assert.match(nv.access.bulk, /not a validated broad-business extract contract/);
  assert.match(nv.automation_terms_fees, /access-protection iframe/);
  assert.equal(nv.fields.published, false);
});

test("dated September source evidence remains present and unchanged in meaning", async () => {
  for (const [state, relative] of [["KY", "config/state-business-source-assessments/ky-2026-09-22.json"], ["HI", "config/state-business-source-hi-2026-09-22.json"], ["NV", "config/state-business-source-nv-2026-09-22.json"]]) {
    const old = JSON.parse(await readFile(path.join(APP_ROOT, relative), "utf8"));
    const current = await loadKyHiNvBusinessSourceReassessment(state);
    assert.equal(current.supersedes_assessment_id, old.assessment_id);
    assert.equal(old.observed_at, "2026-09-22");
    assert.equal(old.decision, "hold");
  }
});

test("rejects authority, evidence, source, privacy and unsupported-state drift", async () => {
  for (const state of KY_HI_NV_REASSESSMENT_STATES) {
    const original = await loadKyHiNvBusinessSourceReassessment(state);
    const mutations = [
      value => { value.decision = "connector-candidate"; },
      value => { value.connector_candidate = true; },
      value => { value.production_ready = true; },
      value => { value.citations[0].url = "https://example.com/unsupported"; },
      value => { value.redistribution = "Unrestricted public export."; },
      value => { value.unresolved_gates = []; },
      value => { value.fields.summary = "Verified current production extract."; },
      value => { value.observed_at = "2026-10-04"; },
      ...Object.keys(original.controls).map(key => value => { value.controls[key] = !value.controls[key]; }),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(original); mutate(changed);
      assert.throws(() => validateKyHiNvBusinessSourceReassessment(changed, state), /reassessment rejected/);
    }
    assert.throws(() => validateKyHiNvBusinessSourceReassessment(original, "OH"), /state identity/);
  }
  await assert.rejects(loadKyHiNvBusinessSourceReassessment("../KY"), /state identity/);
});

test("validator returns defensive copies", async () => {
  const original = await loadKyHiNvBusinessSourceReassessment("HI");
  const copy = validateKyHiNvBusinessSourceReassessment(original);
  copy.citations[0].evidence = "changed";
  assert.notEqual(copy.citations[0].evidence, original.citations[0].evidence);
});
