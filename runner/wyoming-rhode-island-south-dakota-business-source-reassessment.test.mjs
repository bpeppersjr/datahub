import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import {
  loadWyomingBusinessSourceReassessment,
  loadRhodeIslandBusinessSourceReassessment,
  loadSouthDakotaBusinessSourceReassessment,
  validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment,
} from "./wyoming-rhode-island-south-dakota-business-source-reassessment.mjs";

const loadAll = () => Promise.all([loadWyomingBusinessSourceReassessment(), loadRhodeIslandBusinessSourceReassessment(), loadSouthDakotaBusinessSourceReassessment()]);

test("WY/RI/SD evidence distinguishes delivery, status and schema without granting authority", async () => {
  const [wy, ri, sd] = await loadAll();
  assert.match(wy.temporal_refresh, /seven calendar days/);
  assert.match(wy.access.bulk, /maximum two per year/);
  assert.match(ri.reassessment_reason, /12\/2025/);
  assert.match(ri.access.api, /static IP/);
  assert.match(ri.active_status_semantics, /revoked less than one year/);
  assert.match(ri.fields.summary, /2007-08-15/);
  assert.equal(ri.fields.published, false);
  assert.match(sd.reassessment_reason, /20250807/);
  assert.match(sd.access.api, /FTP.*password-protected/);
  assert.match(sd.address_zip, /subscriber ZIP\+4 boxes are not evidence/);
  for (const value of [wy, ri, sd]) {
    assert.equal(value.decision, "hold");
    assert.equal(value.connector_candidate, false);
    assert.ok(Object.values(value.authority).every(v => v === false));
    assert.equal(value.controls.official_primary_sources_only, true);
    for (const [key, count] of Object.entries(value.controls)) {
      if (key !== "official_primary_sources_only") assert.ok(count === 0 || count === false);
    }
  }
});

test("dated evidence rejects changed facts, controls, identity and source authority", async () => {
  for (const original of await loadAll()) {
    const mutations = [
      v => { v.decision = "ready"; },
      v => { v.connector_candidate = true; },
      v => { v.observed_at = "2026-10-04"; },
      v => { v.supersedes_assessment_id = "other"; },
      v => { v.access.bulk = "A public unrestricted API exists."; },
      v => { v.fields.published = true; },
      v => { v.citations[0].url = "https://example.com/"; },
      v => { v.unresolved_gates = []; },
      ...Object.keys(original.authority).map(key => v => { v.authority[key] = true; }),
      ...Object.keys(original.controls).map(key => v => { v.controls[key] = "unverified"; }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original); mutate(value);
      assert.throws(() => validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const validated = validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment(original);
    validated.authority.acquisition = true;
    assert.equal(original.authority.acquisition, false);
  }
});

test("loaders reject cross-state substitution and missing evidence", async () => {
  await assert.rejects(loadWyomingBusinessSourceReassessment(path.join(APP_ROOT, "config/state-business-source-assessments/ri-2026-10-03.json")), /state substitution/);
  for (const invalid of [null, undefined, {}, { state: { abbreviation: "XX" } }]) {
    assert.throws(() => validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment(invalid), /reassessment rejected/);
  }
});
