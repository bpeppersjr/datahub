import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { loadBroadOfflineConnectorReadinessWave, validateBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";

test("loads the exact six-state zero-row broad connector wave", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.deepEqual(wave.states.map(row => row.state), ["IL", "KY", "MS", "OK", "UT", "MN"]);
  assert.deepEqual(wave.states.map(row => row.required_source_files), [5, 1, 2, 1, 3, 0]);
  assert.equal(wave.states.at(-1).readiness_kind, "documentation-header-only-zero-row");
  assert.equal(wave.broad_layer_gaps_resolved, 0);
  assert.equal(Object.values(wave.controls).every(value => value === 0 || value === false), true);
});

test("rejects omission, substitution and authority widening", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  const bindings = {};
  for (const row of wave.states) {
    const load = async relative => JSON.parse(await readFile(path.join(APP_ROOT, relative), "utf8"));
    bindings[row.state] = { ...row, connector: await load(row.connector_path), policy: await load(row.policy_path), assessment: await load(row.assessment_path) };
    if (row.state === "MN") Object.assign(bindings[row.state], { readinessSha256: row.readiness_sha256, readiness: await load(row.readiness_path), documentationSha256: row.documentation_sha256, documentation: await load(row.documentation_path), validatorSha256: row.validator_sha256 });
  }
  for (const mutate of [
    value => value.states.pop(),
    value => { value.states[0].state = "IN"; },
    value => { value.states[0].connector_path = value.states[1].connector_path; },
    value => { value.controls.acquisition_authorized = true; },
    value => { value.states[0].unresolved_gates.pop(); },
    value => { value.broad_layer_gaps_resolved = 1; },
  ]) {
    const changed = structuredClone(wave); mutate(changed);
    assert.throws(() => validateBroadOfflineConnectorReadinessWave(changed, bindings), /wave is invalid/);
  }
});
