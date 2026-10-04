import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadTexasBusinessSourceReassessment, validateTexasBusinessSourceReassessment } from "./texas-business-source-reassessment.mjs";

test("Texas current SOS JSON contract narrows HOLD independently of Comptroller sources", async () => {
  const value = await loadTexasBusinessSourceReassessment();
  assert.equal(value.decision, "hold");
  assert.equal(value.connector_candidate, false);
  assert.equal(value.fields.published, true);
  assert.match(value.fields.summary, /JSON specification v1\.2/);
  assert.match(value.access.bulk, /\$1,350.*\$60.*30 days.*\$20.*eight weeks/);
  assert.match(value.active_status_semantics, /Status 4.*status 5/);
  assert.match(value.address_zip, /masterZipCode and masterZipExtension/);
  assert.match(value.temporal_refresh, /weekly updates only new formations/);
  assert.match(value.existing_governed_sources.franchise_tax, /does not authorize automated row acquisition/);
  assert.match(value.existing_governed_sources.sales_tax, /cannot establish universal organization coverage/);
  assert.ok(Object.values(value.authority).every(v => v === false));
  for (const [key, count] of Object.entries(value.controls)) {
    assert.equal(count, key === "official_primary_sources_only" ? true : key === "portal_automation" ? false : 0);
  }
});

test("Texas dated evidence rejects changed source facts, counters and authority", async () => {
  const original = await loadTexasBusinessSourceReassessment();
  const mutations = [
    v => { v.fields.published = false; },
    v => { v.access.bulk = "free API"; },
    v => { v.unresolved_gates = []; },
    v => { v.citations[0].url = "https://example.com/"; },
    v => { v.state.abbreviation = "WI"; },
    v => { v.observed_at = "2026-10-04"; },
    v => { v.decision = "ready"; },
    ...Object.keys(original.authority).map(key => v => { v.authority[key] = true; }),
    ...Object.keys(original.controls).map(key => v => { v.controls[key] = "changed"; }),
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original); mutate(changed);
    assert.throws(() => validateTexasBusinessSourceReassessment(changed), /reassessment rejected/);
  }
  const validated = validateTexasBusinessSourceReassessment(original);
  validated.authority.acquisition = true;
  assert.equal(original.authority.acquisition, false);
});

test("Texas loader rejects historical or cross-state substitution", async () => {
  for (const file of ["tx-2026-09-22.json", "va-2026-10-03.json"]) {
    await assert.rejects(loadTexasBusinessSourceReassessment(path.join(APP_ROOT, "config/state-business-source-assessments", file)), /reassessment rejected/);
  }
  for (const invalid of [null, undefined, {}, { state: { abbreviation: "TX" } }]) {
    assert.throws(() => validateTexasBusinessSourceReassessment(invalid), /reassessment rejected/);
  }
});
