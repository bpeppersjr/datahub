import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { planCandidateReconciliation, runCandidateReconciliation } from './candidate-reconciliation.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const resign = (plan) => { delete plan.planSha256; plan.planSha256 = sha(JSON.stringify(plan)); return plan; };
const scripts = ['build-business-registry', 'verify-business-registry', 'build-business-entity-resolution', 'verify-business-entity-resolution', 'build-entity-resolution-benchmark', 'verify-entity-resolution-benchmark', 'build-national-business-coverage-views', 'verify-national-business-coverage-views'];
const datasets = { registry: 'national-business-registry', resolution: 'national-business-entity-resolution', benchmark: 'national-business-entity-resolution-benchmark', coverage: 'national-business-coverage-views' };

test('candidate benchmark status is exact and cannot authorize unlabelled other datasets',async(t)=>{
  for(const [group,status] of [['benchmark','published-partial'],['registry','awaiting-independent-labels']]){
    const f=await fixture(t),plan=await planCandidateReconciliation({...f,runId:`status-${group}`}),calls=[];
    const result=await runCandidateReconciliation(plan,{...f,executor:async(stage,context)=>{
      calls.push(stage.id);await executorFor(f,stage,context);
      if(stage.id===`${group}-build`){const directory=stage.args[stage.args.indexOf('--output')+1];const file=path.resolve(f.root,directory,`releases/fixture-new-${group}/manifest.json`);const manifest=JSON.parse(await readFile(file));manifest.status=status;await json(file,manifest);}
      return {exitCode:0};
    }});
    assert.equal(result.receipt.status,'FAILED');assert.equal(calls.at(-1),`${group}-build`);assert.match(result.receipt.error,/status/);
  }
});
async function json(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value)}\n`); }
async function release(root, relative, dataset, id, extra = {}) {
  const directory = path.resolve(root, relative);
  const manifest = path.join(directory, 'releases', id, 'manifest.json');
  await json(manifest, { dataset_id: dataset, release_id: id, status: 'published-partial', artifacts: [], ...extra });
  const pointer = path.join(directory, 'current.json');
  await json(pointer, { dataset_id: dataset, release_id: id, manifest: `releases/${id}/manifest.json` });
  return { pointer, manifest };
}
async function dependency(root, pointer) {
  const file = path.resolve(root, pointer);
  const p = JSON.parse(await readFile(file));
  const manifestPath = path.resolve(path.dirname(file), p.manifest);
  const bytes = await readFile(manifestPath); const m = JSON.parse(bytes);
  return { dataset_id: m.dataset_id, release_id: m.release_id, manifest_sha256: sha(bytes) };
}
async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'candidate-chain-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const definitionFile = 'config/migrations/normalized-us-postal-fields-v1.json';
  await mkdir(path.join(root, 'config/migrations'), { recursive: true });
  await copyFile(path.join(APP_ROOT, definitionFile), path.join(root, definitionFile));
  const definition = JSON.parse(await readFile(path.join(root, definitionFile)));
  for (const source of definition.sources) {
    await json(path.join(root, source.connector_config), { id: source.source_key, version: source.minimum_connector_version });
    await release(root, `${definition.candidate_root}/sources/${source.source_key}`, source.dataset_id, `fixture-${source.source_key}`);
  }
  for (const [directory, dataset] of [['data/geography', 'us-census-geography'], ['data/zcta-jurisdiction-crosswalk', 'us-census-zcta-jurisdiction-crosswalk'], ['data/business-baselines/census-nonemployer', 'census-nonemployer-baseline'], ['data/business-baselines/census-zbp', 'census-zbp-baseline']]) await release(root, directory, dataset, `fixture-${dataset}`);
  for (const script of scripts) { const file = path.join(root, 'scripts', `${script}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture exits zero but emits no release.\n'); }
  for (const implementation of ['business-registry', 'business-entity-resolution', 'entity-resolution-benchmark', 'national-business-coverage-views']) { const file = path.join(root, 'runner', `${implementation}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture implementation.\n'); }
  const readinessInspector = async () => {
    const sources = [];
    for (const source of definition.sources) {
      const pointer = path.join(root, definition.candidate_root, 'sources', source.source_key, 'current.json');
      const p = JSON.parse(await readFile(pointer)); const manifest = path.resolve(path.dirname(pointer), p.manifest);
      sources.push({ source_key: source.source_key, dataset_id: source.dataset_id, pointer, manifest, current_release_id: p.release_id, pointer_sha256: sha(await readFile(pointer)), manifest_sha256: sha(await readFile(manifest)), connector_config_sha256: sha(await readFile(path.join(root, source.connector_config))), status: 'ready', pointer_scope: 'candidate' });
    }
    return { ready_for_registry_2_10: true, plan_sha256: sha(JSON.stringify(sources)), counts: { total: 25, ready: 25, blocked: 0, rebuild_required: 0, candidate_pointers_used: 25 }, sources };
  };
  return { root, definition, readinessInspector };
}
async function executorFor(f, stage, { logPath, onSpawn }) {
  await mkdir(path.dirname(logPath), { recursive: true }); await writeFile(logPath, `${stage.id}\n`);
  await onSpawn?.(process.pid);
  if (stage.kind !== 'build') return { exitCode: 0 };
  const value = (flag) => stage.args[stage.args.indexOf(flag) + 1];
  const key = stage.id.split('-')[0];
  let extra;
  if (key === 'registry') extra = { dependencies: await Promise.all(f.definition.sources.map((s) => dependency(f.root, `${f.definition.candidate_root}/sources/${s.source_key}/current.json`))) };
  if (key === 'resolution') extra = { dependency: await dependency(f.root, value('--registry')) };
  if (key === 'benchmark') extra = { status:'awaiting-independent-labels', dependencies: { registry: await dependency(f.root, value('--registry')), resolution: await dependency(f.root, value('--resolution')) } };
  if (key === 'coverage') extra = { dependencies: await Promise.all(['--registry', '--resolution', '--benchmark', '--geography', '--crosswalk', '--nonemployer'].map((flag) => dependency(f.root, value(flag)))) };
  await release(f.root, value('--output'), datasets[key], `fixture-new-${key}`, extra);
  return { exitCode: 0 };
}

test('candidate chain plans all 25 explicit source inputs and eight ordered isolated stages without writes', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'plan-proof' });
  assert.equal(plan.sourcePins.length, 25);
  assert.deepEqual(plan.stages.map((s) => s.id), ['registry-build', 'registry-verify', 'resolution-build', 'resolution-verify', 'benchmark-build', 'benchmark-verify', 'coverage-build', 'coverage-verify']);
  assert.match(plan.outputRoot.replaceAll('\\', '/'), /data\/reconciliations\/runs\/plan-proof$/);
  assert.equal(plan.stages[0].args.filter((a) => String(a).endsWith('current.json')).length, 25);
  await assert.rejects(readdir(path.resolve(f.root, plan.outputRoot)), /ENOENT/);
});

test('candidate chain runs ordered stages and persists linked release hashes and log hashes', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'success-proof' }); const calls = [];
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); return executorFor(f, stage, context); } });
  assert.equal(result.receipt.status, 'SUCCEEDED');
  assert.deepEqual(calls, plan.stages.map((s) => s.id));
  assert.deepEqual(JSON.parse(await readFile(result.receiptPath)), result.receipt);
  assert.deepEqual(Object.keys(result.receipt.outputs).sort(), ['benchmark', 'coverage', 'registry', 'resolution']);
  for (const stage of result.receipt.stages) { assert.equal(stage.status, 'SUCCEEDED'); assert.match(stage.log.sha256, /^[a-f0-9]{64}$/); }
  await assert.rejects(runCandidateReconciliation(plan, { ...f, executor: () => { throw new Error('must not rerun'); } }), /exist|duplicate|already/i);
});

test('candidate chain rejects altered plans and input drift before launching children', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'drift-proof' }); let launched = 0;
  const executor = () => { launched += 1; return { exitCode: 0 }; };
  const altered = structuredClone(plan); altered.stages[0].args = ['--output', 'data/business-registry'];
  delete altered.planSha256; altered.planSha256 = sha(JSON.stringify(altered));
  await assert.rejects(runCandidateReconciliation(altered, { ...f, executor }), /plan|match|hash|alter|stage/i);
  await writeFile(path.join(f.root, 'scripts/build-business-registry.mjs'), '// Changed after planning.');
  await assert.rejects(runCandidateReconciliation(plan, { ...f, executor }), /script|hash|changed|drift|plan/i);
  assert.equal(launched, 0);
});

test('candidate chain stops at a failed verifier and never begins dependent builds', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'failure-proof' }); const calls = [];
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); await executorFor(f, stage, context); return { exitCode: stage.id === 'registry-verify' ? 7 : 0 }; } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build', 'registry-verify']);
  assert.equal(result.receipt.stages.find((s) => s.id === 'registry-verify').exitCode, 7);
});

test('candidate chain stop request waits for the active stage and skips all remaining stages', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'stop-proof' }); const controller = new AbortController(); const calls = [];
  const result = await runCandidateReconciliation(plan, { ...f, signal: controller.signal, executor: async (stage, context) => { calls.push(stage.id); controller.abort(); return executorFor(f, stage, context); } });
  assert.equal(result.receipt.status, 'STOPPED'); assert.equal(result.receipt.stopRequested, true);
  assert.deepEqual(calls, ['registry-build']); assert.equal(result.receipt.stages[0].status, 'SUCCEEDED');
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});

test('candidate chain does not accept zero exit without a published manifest from a real child', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'real-child-proof' });
  const result = await runCandidateReconciliation(plan, f);
  assert.equal(result.receipt.status, 'FAILED'); assert.equal(result.receipt.stages[0].exitCode, 0);
  assert.equal(result.receipt.stages[0].status, 'FAILED');
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});

test('candidate chain rejects a linked output root before writing outside its run tree', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'junction-proof' });
  const redirected = path.join(f.root, 'redirected'); await mkdir(redirected); await mkdir(path.join(f.root, 'data/reconciliations'), { recursive: true });
  await symlink(redirected, path.join(f.root, 'data/reconciliations/runs'), 'junction');
  await assert.rejects(runCandidateReconciliation(plan, f), /link|junction|symlink/i);
  assert.deepEqual(await readdir(redirected), []);
});

test('candidate chain rejects a registry built from a different source cohort despite exit zero', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'lineage-proof' }); const calls = [];
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executorFor(f, stage, context);
    if (stage.id === 'registry-build') {
      const output = stage.args[stage.args.indexOf('--output') + 1];
      const pointerPath = path.resolve(f.root, output, 'current.json'); const p = JSON.parse(await readFile(pointerPath));
      const manifestPath = path.resolve(path.dirname(pointerPath), p.manifest); const m = JSON.parse(await readFile(manifestPath));
      m.dependencies[0].release_id = 'wrong-source-release'; await json(manifestPath, m);
    }
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
  assert.equal(result.receipt.stages[0].status, 'FAILED');
});

test('candidate chain rejects baseline manifest drift even when the pointer remains unchanged', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'baseline-proof' }); const calls = [];
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executorFor(f, stage, context);
    const pointer = path.join(f.root, 'data/geography/current.json'); const p = JSON.parse(await readFile(pointer));
    await writeFile(path.resolve(path.dirname(pointer), p.manifest), '{"modified":true}');
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
});

test('candidate chain checks the final coverage output pin again after verification', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'final-drift-proof' });
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => {
    await executorFor(f, stage, context);
    if (stage.id === 'coverage-verify') {
      const pointer = path.resolve(f.root, stage.args[0]); const p = JSON.parse(await readFile(pointer));
      await writeFile(path.resolve(path.dirname(pointer), p.manifest), '{"modified_after_verification":true}');
    }
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED');
});

test('candidate controller excludes concurrent runs and persists child ownership while active', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'owner-one' });
  const other = await planCandidateReconciliation({ ...f, runId: 'owner-two' });
  let entered; const active = new Promise((resolve) => { entered = resolve; });
  let releaseGate; const gate = new Promise((resolve) => { releaseGate = resolve; });
  const first = runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => {
    await context.onSpawn?.(process.pid);
    if (stage.id === 'registry-build') { entered(); await gate; }
    return executorFor(f, stage, context);
  } });
  await active;
  try {
    const receipt = JSON.parse(await readFile(path.resolve(f.root, plan.outputRoot, 'receipt.json')));
    assert.equal(receipt.stages[0].pid, process.pid);
    await assert.rejects(runCandidateReconciliation(other, { ...f, executor: () => { throw new Error('must not launch'); } }), /lock|owner|active|concurrent/i);
  } finally { releaseGate(); }
  assert.equal((await first).receipt.status, 'SUCCEEDED');
});

test('candidate chain rejects duplicate baseline pins and forged baseline identity before execution', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'canonical-baselines' });
  for (const change of [p => { p.inputPins[1] = structuredClone(p.inputPins[0]); }, p => { p.inputPins[0].datasetId = 'forged'; }]) {
    const altered = structuredClone(plan); change(altered);
    await assert.rejects(runCandidateReconciliation(resign(altered), { ...f, executor: () => { assert.fail('must not execute'); } }), /input|baseline|canonical|identity|pin/i);
  }
});

test('candidate chain rejects implementation drift during the final verifier', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'final-code-drift' });
  const result = await runCandidateReconciliation(plan, { ...f, executor: async (stage, context) => {
    await executorFor(f, stage, context);
    if (stage.id === 'coverage-verify') await writeFile(path.join(f.root, plan.implementationPins[0].path), '// Changed implementation.');
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED');
});

test('candidate controller records a stop request while its active child is still running', async (t) => {
  const f = await fixture(t); const plan = await planCandidateReconciliation({ ...f, runId: 'durable-stop' });
  const controller = new AbortController();
  let entered; const active = new Promise(resolve => { entered = resolve; });
  let releaseGate; const gate = new Promise(resolve => { releaseGate = resolve; });
  const running = runCandidateReconciliation(plan, { ...f, signal: controller.signal, executor: async (stage, context) => {
    await context.onSpawn(process.pid); entered(); await gate;
    return executorFor(f, stage, context);
  } });
  await active;
  try {
    controller.abort(); let receipt;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      receipt = JSON.parse(await readFile(path.resolve(f.root, plan.outputRoot, 'receipt.json')));
      if (receipt.stopRequested) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(receipt.stopRequested, true);
    assert.equal(receipt.stages[0].status, 'RUNNING');
  } finally { releaseGate(); await running; }
});
