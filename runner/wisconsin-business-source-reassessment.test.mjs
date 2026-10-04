import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { loadWisconsinBusinessSourceReassessment, validateWisconsinBusinessSourceReassessment } from "./wisconsin-business-source-reassessment.mjs";

test("Wisconsin observation preserves zero-action HOLD and historical linkage", async () => {
  const row = await loadWisconsinBusinessSourceReassessment();
  assert.equal(row.decision, "hold");
  assert.equal(row.connector_candidate, false);
  assert.ok(Object.values(row.authority).every(flag => flag === false));
  for (const [key, value] of Object.entries(row.controls)) assert.equal(value, key === "official_primary_sources_only" ? true : key === "portal_automation" ? false : 0);
  const old = JSON.parse(await readFile(path.join(APP_ROOT, row.local_evidence[0]), "utf8"));
  assert.equal(row.supersedes_assessment_id, old.queue_id);
  assert.ok(old.states.some(value => value.state_abbreviation === row.state.abbreviation));
});

test("Wisconsin aggregate and product boundaries prevent unsupported completion claims", async () => {
  const row = await loadWisconsinBusinessSourceReassessment();
  assert.equal(row.aggregate_observation.active_entity_count, 639593);
  assert.equal(row.aggregate_observation.as_of, "2026-08-31");
  assert.equal(row.aggregate_observation.bulk_control_total, false);
  assert.equal(row.aggregate_observation.business_completion_denominator, false);
  assert.equal(row.aggregate_observation.excludes.length, 2);
  assert.match(row.access.bulk, /not a replacement baseline or general update feed/);
  assert.match(row.address_zip, /does not prove that field is supplied/);
  assert.match(row.fields.summary, /their serialization.*remains unverified/);
  assert.match(row.strongest_next_action, /organization layer/);
});

test("Wisconsin evidence rejects authority escalation, counters and denominator substitution", async () => {
  const row = await loadWisconsinBusinessSourceReassessment();
  const mutations = [
    value => { value.state.abbreviation = "TX"; },
    value => { value.decision = "ready"; },
    value => { value.connector_candidate = true; },
    value => { value.observed_at = "2026-10-04"; },
    value => { value.aggregate_observation.business_completion_denominator = true; },
    value => { value.aggregate_observation.active_entity_count = 635017; },
    value => { value.citations[0].url = "https://example.com"; },
    value => { value.unresolved_gates = []; },
    ...Object.keys(row.authority).map(key => value => { value.authority[key] = true; }),
    ...Object.keys(row.controls).map(key => value => { value.controls[key] = !value.controls[key]; }),
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(row); mutate(changed);
    assert.throws(() => validateWisconsinBusinessSourceReassessment(changed), /reassessment rejected/);
  }
  const copy = validateWisconsinBusinessSourceReassessment(row);
  copy.unresolved_gates.length = 0;
  assert.ok(row.unresolved_gates.length > 0);
});
