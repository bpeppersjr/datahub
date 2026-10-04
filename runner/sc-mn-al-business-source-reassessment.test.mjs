import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { SC_MN_AL_REASSESSMENT_STATES, loadScMnAlBusinessSourceReassessment, loadScMnAlBusinessSourceReassessments, validateScMnAlBusinessSourceReassessment } from "./sc-mn-al-business-source-reassessment.mjs";

test("SC/MN/AL preserve zero-action HOLD observations", async () => {
  const rows = await loadScMnAlBusinessSourceReassessments();
  assert.deepEqual(rows.map(row => row.state.abbreviation), SC_MN_AL_REASSESSMENT_STATES);
  for (const row of rows) {
    assert.equal(row.decision, "hold");
    assert.equal(row.connector_candidate, false);
    assert.ok(Object.values(row.authority).every(flag => flag === false));
    for (const [key, value] of Object.entries(row.controls)) assert.equal(value, key === "official_primary_sources_only" ? true : key === "portal_automation" ? false : 0);
  }
});

test("product and requester boundaries prevent unsupported gate closure", async () => {
  const [sc, mn, al] = await loadScMnAlBusinessSourceReassessments();
  assert.match(sc.access.bulk, /not evidence of a complete baseline/);
  assert.match(sc.access.search, /September 10, 2026/);
  assert.match(sc.access.api, /UCC filing/);
  assert.match(mn.fields.summary, /must not be attributed to Active Business Data/);
  assert.match(mn.redistribution, /Which license governs Active Business Data remains unresolved/);
  assert.ok(mn.citations.some(row => row.url.includes("/d3skshdo/")));
  assert.match(al.automation_terms_fees, /Alabama citizens; project eligibility is unverified/);
  assert.match(al.access.fees, /not corporate export prices/);
});

test("dated source queues remain linked", async () => {
  for (const row of await loadScMnAlBusinessSourceReassessments()) {
    const old = JSON.parse(await readFile(path.join(APP_ROOT, row.local_evidence[0]), "utf8"));
    assert.equal(row.supersedes_assessment_id, old.queue_id);
  }
});

test("immutable evidence rejects authority escalation, content substitution and traversal", async () => {
  for (const row of await loadScMnAlBusinessSourceReassessments()) {
    const mutations = [
      value => { value.decision = "ready"; },
      value => { value.connector_candidate = true; },
      value => { value.observed_at = "2026-10-04"; },
      value => { value.citations[0].url = "https://example.com"; },
      value => { value.unresolved_gates = []; },
      value => { value.production_ready = true; },
      ...Object.keys(row.authority).map(key => value => { value.authority[key] = true; }),
      ...Object.keys(row.controls).map(key => value => { value.controls[key] = !value.controls[key]; }),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(row); mutate(changed);
      assert.throws(() => validateScMnAlBusinessSourceReassessment(changed), /reassessment rejected/);
    }
    assert.throws(() => validateScMnAlBusinessSourceReassessment(row, "../SC"), /state identity/);
    assert.throws(() => validateScMnAlBusinessSourceReassessment(row, row.state.abbreviation === "SC" ? "MN" : "SC"), /state identity/);
    const copy = validateScMnAlBusinessSourceReassessment(row);
    copy.unresolved_gates.length = 0;
    assert.ok(row.unresolved_gates.length > 0);
  }
  await assert.rejects(loadScMnAlBusinessSourceReassessment("WI"), /state identity/);
});
