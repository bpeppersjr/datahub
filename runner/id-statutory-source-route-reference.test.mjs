import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { loadIdStatutorySourceRouteReference, validateIdStatutorySourceRouteReference, verifyIdStatutorySourceRouteReferenceBytes } from "./id-statutory-source-route-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("Idaho observations preserve the documentary and zero-authority boundaries", async () => {
  const ref = await loadIdStatutorySourceRouteReference();
  assert.equal(ref.decision, "hold");
  assert.ok(Object.values(ref.authority).every(value => value === false));
  assert.equal(ref.source_records_acquired, 0);
  assert.equal(ref.controls.source_files_retained, 0);
  assert.equal(ref.observations.statute.http_status, 200);
  assert.match(ref.observations.statute.boundary, /does not establish a current product/);
  assert.match(ref.observations.sosbiz_lists.finding, /inconclusive/);
  assert.match(ref.observations.public_records.redirect_url, /justfoia/);
  assert.equal(ref.observations.historical_ucc_guides.implementation_status, 404);
  assert.equal(ref.observations.historical_ucc_guides.quick_start_status, 404);
  assert.equal(ref.observations.registered_agent_report.body_requested, false);
  assert.equal(ref.observations.registered_agent_report.cohort_included, false);
});

test("Idaho remains outside the readiness wave and the October assessment is byte-identical", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "ID"));
  const prior = await readFile(path.join(APP_ROOT, "config/state-business-source-assessments/id-2026-10-03.json"));
  assert.equal(createHash("sha256").update(prior).digest("hex"), "a6ebcefdb6c7d37d59e326a149cc714cd878bd84bd698f7c1340497b08901077");
});

test("validator rejects authorization, evidence and arbitrary drift", async () => {
  const ref = await loadIdStatutorySourceRouteReference();
  const mutations = [
    value => { value.state = "IA"; },
    value => { value.decision = "ready"; },
    value => { value.connector_ready = true; },
    value => { value.source_records_acquired = 1; },
    ...Object.keys(ref.authority).map(key => value => { value.authority[key] = true; }),
    value => { delete value.authority.source_query; },
    value => { value.controls.source_files_retained = 1; },
    value => { value.observations.statute.http_status = 404; },
    value => { value.observations.registered_agent_report.body_requested = true; },
    value => { value.observations.historical_ucc_guides.quick_start_status = 200; },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(ref);
    mutate(changed);
    assert.throws(() => validateIdStatutorySourceRouteReference(changed), /ID statutory source-route reference rejected/);
  }
  for (const invalid of [null, [], {}, "ID"]) assert.throws(() => validateIdStatutorySourceRouteReference(invalid), /ID statutory source-route reference rejected/);
  assert.throws(() => verifyIdStatutorySourceRouteReferenceBytes(Buffer.from(JSON.stringify(ref))), /file bytes drifted/);
  assert.throws(() => verifyIdStatutorySourceRouteReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadIdStatutorySourceRouteReference({ root: `${APP_ROOT}/missing-id-reference` }), /ENOENT/);
});
