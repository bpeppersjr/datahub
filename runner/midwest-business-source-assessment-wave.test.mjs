import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadMidwestBusinessSourceAssessmentWave, MIDWEST_SOURCE_ASSESSMENT_STATES, validateMidwestBusinessSourceAssessmentWave } from "./midwest-business-source-assessment-wave.mjs";

test("Midwest wave binds four retained HOLD assessments to current broad-layer gaps", async () => {
  const wave = await loadMidwestBusinessSourceAssessmentWave();
  assert.deepEqual(wave.states, MIDWEST_SOURCE_ASSESSMENT_STATES);
  assert.equal(wave.source_assessments.length, 4);
  assert.equal(wave.controls.source_assessments_reused, 4);
  assert.equal(wave.controls.network_requests, 0);
  assert.equal(wave.controls.acquisition_authorized, false);
  assert.equal(wave.controls.broad_layer_admitted, false);
  assert.equal(wave.outcomes.MI, "written-scope-and-contract-required");
});

test("Midwest wave rejects roster, lineage, outcomes and authority drift", async () => {
  const original = await loadMidwestBusinessSourceAssessmentWave();
  const mutations = [
    (value) => { value.states.reverse(); },
    (value) => { value.source_assessments[0].assessment_id = "invented"; },
    (value) => { value.source_assessments[1].file_sha256 = "0".repeat(64); },
    (value) => { value.national_gap_binding.federation_release_id = "other"; },
    (value) => { value.outcomes.IL = "ready"; },
    (value) => { value.controls.network_requests = 1; },
    (value) => { value.controls.acquisition_authorized = true; },
    (value) => { value.controls.broad_layer_admitted = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => validateMidwestBusinessSourceAssessmentWave(changed), /wave rejected/);
  }
});

test("Midwest wave loader rejects a changed source binding before any action", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "cot-mw-wave-"));
  try {
    const original = JSON.parse(await readFile(new URL("../config/state-business-source-assessment-waves/midwest-il-in-mi-oh-2026-11-12.json", import.meta.url), "utf8"));
    original.source_assessments[2].file_sha256 = "f".repeat(64);
    const file = path.join(temporary, "wave.json");
    await writeFile(file, `${JSON.stringify(original, null, 2)}\n`);
    await assert.rejects(loadMidwestBusinessSourceAssessmentWave(file), /must stay inside APP_ROOT/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
