import assert from "node:assert/strict";
import test from "node:test";
import {
  loadIllinoisBusinessSourceReassessment,
  loadMississippiBusinessSourceReassessment,
  validateIllinoisMississippiBusinessSourceReassessment,
} from "./illinois-mississippi-business-source-reassessment.mjs";

test("Illinois reconciles published full-snapshot controls without granting source access", async () => {
  const value = await loadIllinoisBusinessSourceReassessment();
  assert.equal(value.supersedes_assessment_id, "state-business-source-il-20260922-v1");
  assert.match(value.temporal_refresh, /daily full snapshots/);
  assert.match(value.fields.summary, /160\/197\/126/);
  assert.match(value.active_status_semantics, /00 Goodstanding and 01 Reinstated/);
  assert.match(value.address_zip, /records-office/);
  assert.match(value.access.automation, /prohibits automated website queries/);
  assert.match(value.offline_implementation, /no operation was dispatched/);
  assert.equal(value.decision, "hold");
  assert.equal(value.connector_candidate, false);
});

test("Mississippi preserves capped and unverified export boundaries while correcting address semantics", async () => {
  const value = await loadMississippiBusinessSourceReassessment();
  assert.match(value.address_zip, /principal address/);
  assert.match(value.fields.summary, /six- or seven-digit Business ID/);
  assert.match(value.access.bulk, /300,000/);
  assert.match(value.statewide_completeness, /statewide_complete=false/);
  assert.match(value.offline_implementation, /does not parse the workbook/);
  assert.match(value.active_status_semantics, /dissolved records/);
});

for (const load of [loadIllinoisBusinessSourceReassessment, loadMississippiBusinessSourceReassessment]) {
  test(`${load.name} rejects authority, provenance, evidence and privacy drift`, async () => {
    const original = await load();
    const mutations = [
      (value) => { value.decision = "proceed-to-bounded-connector"; },
      (value) => { value.connector_candidate = true; },
      (value) => { value.authorized = true; },
      (value) => { value.observed_at = "2026-10-04"; },
      (value) => { value.supersedes_assessment_id = "wrong"; },
      (value) => { value.offline_implementation = "production-ready"; },
      (value) => { value.address_zip = "verified physical site"; },
      (value) => { value.citations[0].url = "https://example.com"; },
      (value) => { value.unresolved_gates = []; },
      ...Object.keys(original.controls).map((key) => (value) => {
        value.controls[key] = key === "official_primary_sources_only" ? false : key === "portal_automation" ? true : 1;
      }),
    ];
    for (const mutate of mutations) {
      const value = structuredClone(original);
      mutate(value);
      assert.throws(() => validateIllinoisMississippiBusinessSourceReassessment(value), /reassessment rejected/);
    }
    const clone = validateIllinoisMississippiBusinessSourceReassessment(original);
    clone.citations[0].evidence = "mutated";
    assert.notEqual(original.citations[0].evidence, "mutated");
  });
}
