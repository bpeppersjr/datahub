import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { OK_NE_VT_ME_REASSESSMENT_STATES, loadOkNeVtMeBusinessSourceReassessment, loadOkNeVtMeBusinessSourceReassessments, validateOkNeVtMeBusinessSourceReassessment } from "./ok-ne-vt-me-business-source-reassessment.mjs";

test("OK/NE/VT/ME observations retain zero-action HOLD", async () => {
  const rows = await loadOkNeVtMeBusinessSourceReassessments();
  assert.deepEqual(rows.map(row => row.state.abbreviation), OK_NE_VT_ME_REASSESSMENT_STATES);
  for (const row of rows) {
    assert.equal(row.decision, "hold");
    assert.equal(row.connector_candidate, false);
    for (const [key, value] of Object.entries(row.controls)) assert.equal(value, key === "official_primary_sources_only" ? true : key === "portal_automation" ? false : 0);
  }
});

test("product contracts remain distinct and migration does not imply current free acquisition", async () => {
  const [ok, ne, vt, me] = await loadOkNeVtMeBusinessSourceReassessments();
  assert.match(ok.strongest_next_action, /Reuse the existing offline\/app implementation/);
  assert.match(ok.fields.summary, /18 type counts/);
  assert.match(ne.fields.summary, /documentation conflict/);
  assert.match(ne.fields.summary, /Neither establishes a batch schema/);
  assert.match(ne.access.fees, /\$500 per delivery twice monthly/);
  assert.match(ne.automation_terms_fees, /a new account is required/);
  assert.match(ne.reassessment_reason, /does not prove that route is live or free/);
  assert.match(vt.active_status_semantics, /current and historic/);
  assert.match(vt.access.fees, /not a price schedule/);
  assert.match(me.access.bulk, /Corporate and UCC Records/);
  assert.match(me.redistribution, /neither a corporate-specific redistribution grant nor a blanket ban/);
});

test("dated earlier source evidence remains linked and unmodified", async () => {
  const old = JSON.parse(await readFile(path.join(APP_ROOT, "config", "state-business-source-revalidation-2026-09-03.json"), "utf8"));
  const queue = JSON.parse(await readFile(path.join(APP_ROOT, "config", "state-business-source-discovery-queue-4.json"), "utf8"));
  for (const state of ["OK", "NE", "VT"]) assert.equal((await loadOkNeVtMeBusinessSourceReassessment(state)).supersedes_assessment_id, old.revalidation_id);
  assert.equal((await loadOkNeVtMeBusinessSourceReassessment("ME")).supersedes_assessment_id, queue.queue_id);
});

test("immutable evidence rejects authority expansion, provenance drift and missing evidence", async () => {
  for (const state of OK_NE_VT_ME_REASSESSMENT_STATES) {
    const row = await loadOkNeVtMeBusinessSourceReassessment(state);
    const mutations = [
      value => { value.decision = "proceed-to-bounded-connector"; },
      value => { value.connector_candidate = true; },
      value => { value.production_ready = true; },
      value => { value.autonomous_acquisition_authorized = true; },
      value => { value.observed_at = "2026-10-04"; },
      value => { value.citations[0].url = "https://example.com"; },
      value => { value.unresolved_gates = []; },
      value => { value.redistribution = "Unrestricted"; },
      ...Object.keys(row.controls).map(key => value => { value.controls[key] = !value.controls[key]; }),
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(row); mutate(changed);
      assert.throws(() => validateOkNeVtMeBusinessSourceReassessment(changed, state), /reassessment rejected/);
    }
    assert.throws(() => validateOkNeVtMeBusinessSourceReassessment(row, "../OK"), /state identity/);
  }
  await assert.rejects(loadOkNeVtMeBusinessSourceReassessment("OH"), /state identity/);
});

test("validated observations are defensive copies", async () => {
  const original = await loadOkNeVtMeBusinessSourceReassessment("NE");
  const copy = validateOkNeVtMeBusinessSourceReassessment(original);
  copy.unresolved_gates.length = 0;
  assert.ok(original.unresolved_gates.length > 0);
});
