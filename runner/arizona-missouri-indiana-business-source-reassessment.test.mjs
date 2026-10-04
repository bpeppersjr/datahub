import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import {
  loadArizonaBusinessSourceReassessment,
  loadMissouriBusinessSourceReassessment,
  loadIndianaBusinessSourceReassessment,
  validateArizonaMissouriIndianaBusinessSourceReassessment,
} from "./arizona-missouri-indiana-business-source-reassessment.mjs";

const loadAll = () => Promise.all([loadArizonaBusinessSourceReassessment(), loadMissouriBusinessSourceReassessment(), loadIndianaBusinessSourceReassessment()]);

test("AZ/MO/IN evidence narrows ordering, freshness, scope and redaction without authority", async () => {
  const [az, mo, ind] = await loadAll();
  assert.match(az.access.bulk, /online full extraction/);
  assert.match(az.temporal_refresh, /post-migration identifier/);
  assert.match(mo.temporal_refresh, /LLCs have no annual-report duty/);
  assert.match(mo.temporal_refresh, /biennial/);
  assert.match(mo.access.bulk, /could not be fetched/);
  assert.match(ind.statewide_completeness, /all registered.*all active/);
  assert.match(ind.address_zip, /does not say CMRA addresses are categorically withheld/);
  assert.match(ind.automation_terms_fees, /not proof of final adoption/);
  for (const value of [az, mo, ind]) {
    assert.equal(value.decision, "hold");
    assert.equal(value.connector_candidate, false);
    assert.equal(value.fields.published, false);
    assert.ok(Object.values(value.authority).every(v => v === false));
    assert.equal(value.controls.official_primary_sources_only, true);
    for (const [key, count] of Object.entries(value.controls)) {
      if (key !== "official_primary_sources_only") assert.ok(count === 0 || count === false);
    }
  }
});

test("dated evidence rejects changed source facts, authority, counters and identity", async () => {
  for (const original of await loadAll()) {
    const mutations = [
      v => { v.decision = "ready"; },
      v => { v.connector_candidate = true; },
      v => { v.observed_at = "2026-10-04"; },
      v => { v.supersedes_assessment_id = "other"; },
      v => { v.statewide_completeness = "Complete"; },
      v => { v.citations[0].url = "https://example.com/"; },
      v => { v.unresolved_gates = []; },
      ...Object.keys(original.authority).map(key => v => { v.authority[key] = true; }),
      ...Object.keys(original.controls).map(key => v => { v.controls[key] = "unverified"; }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original); mutate(value);
      assert.throws(() => validateArizonaMissouriIndianaBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const validated = validateArizonaMissouriIndianaBusinessSourceReassessment(original);
    validated.authority.acquisition = true;
    assert.equal(original.authority.acquisition, false);
  }
});

test("loaders reject cross-state substitution and malformed identities", async () => {
  await assert.rejects(loadArizonaBusinessSourceReassessment(path.join(APP_ROOT, "config/state-business-source-assessments/mo-2026-10-03.json")), /state substitution/);
  for (const invalid of [null, undefined, {}, { state: { abbreviation: "XX" } }]) {
    assert.throws(() => validateArizonaMissouriIndianaBusinessSourceReassessment(invalid), /reassessment rejected/);
  }
});
