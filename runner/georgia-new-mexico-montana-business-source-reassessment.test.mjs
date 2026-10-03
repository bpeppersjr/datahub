import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import {
  loadGeorgiaBusinessSourceReassessment,
  loadNewMexicoBusinessSourceReassessment,
  loadMontanaBusinessSourceReassessment,
  validateGeorgiaNewMexicoMontanaBusinessSourceReassessment,
} from "./georgia-new-mexico-montana-business-source-reassessment.mjs";

const loadAll = () => Promise.all([loadGeorgiaBusinessSourceReassessment(), loadNewMexicoBusinessSourceReassessment(), loadMontanaBusinessSourceReassessment()]);

test("dated GA/NM/MT evidence preserves product distinctions and zero source authority", async () => {
  const [ga, nm, mt] = await loadAll();
  assert.match(ga.access.bulk, /\$500 one-time and \$5,000 annual/);
  assert.match(ga.access.bulk, /\$1,000 one-time or \$100 setup plus \$500 monthly/);
  assert.match(ga.unresolved_gates.join(" "), /product-route-reconciliation/);
  assert.match(nm.access.search, /campaign finance, not the business registry/);
  assert.match(nm.access.api, /HTTP 403/);
  assert.equal(mt.fields.published, true);
  assert.match(mt.fields.summary, /April 26, 2017/);
  assert.match(mt.temporal_refresh, /not source-release freshness/);
  for (const value of [ga, nm, mt]) {
    assert.equal(value.decision, "hold");
    assert.equal(value.connector_candidate, false);
    assert.ok(Object.values(value.authority).every(v => v === false));
    assert.equal(value.controls.official_primary_sources_only, true);
    for (const [key, count] of Object.entries(value.controls)) {
      if (key !== "official_primary_sources_only") assert.ok(count === 0 || count === false);
    }
  }
});

test("immutable evidence rejects changed authority, action counters, facts, identity and citations", async () => {
  for (const original of await loadAll()) {
    const mutations = [
      v => { v.decision = "ready"; },
      v => { v.connector_candidate = true; },
      v => { v.observed_at = "2026-10-04"; },
      v => { v.supersedes_assessment_id = "other"; },
      v => { v.access.bulk = "A free unrestricted API exists."; },
      v => { v.fields.published = !v.fields.published; },
      v => { v.citations[0].url = "https://example.com/"; },
      v => { v.unresolved_gates = []; },
      ...Object.keys(original.authority).map(key => v => { v.authority[key] = true; }),
      ...Object.keys(original.controls).map(key => v => { v.controls[key] = "unverified"; }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original); mutate(value);
      assert.throws(() => validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const validated = validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(original);
    validated.authority.acquisition = true;
    assert.equal(original.authority.acquisition, false);
  }
});

test("loader rejects cross-state substitution and missing evidence", async () => {
  await assert.rejects(loadGeorgiaBusinessSourceReassessment(path.join(APP_ROOT, "config/state-business-source-assessments/nm-2026-10-03.json")), /state substitution/);
  for (const invalid of [null, undefined, {}, {state:{abbreviation:"XX"}}]) {
    assert.throws(() => validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(invalid), /reassessment rejected/);
  }
});
