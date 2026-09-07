import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { planProductionReconciliation, runProductionReconciliation, requestProductionReconciliationStop } from './production-reconciliation.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scripts = ['build-business-registry', 'verify-business-registry', 'build-business-entity-resolution', 'verify-business-entity-resolution', 'build-entity-resolution-benchmark', 'verify-entity-resolution-benchmark', 'build-national-business-coverage-views', 'verify-national-business-coverage-views'];
const outputs = { registry: 'data/business-registry', resolution: 'data/business-entity-resolution', benchmark: 'data/business-entity-resolution-benchmark', coverage: 'data/business-coverage-views' };
const datasets = { registry: 'national-business-registry', resolution: 'national-business-entity-resolution', benchmark: 'national-business-entity-resolution-benchmark', coverage: 'national-business-coverage-views' };
async function json(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value)}\n`); }
async function release(root, directory, dataset, id, extra = {}) {
  await json(path.join(root, directory, 'releases', id, 'manifest.json'), { dataset_id: dataset, release_id: id, status: 'published-partial', artifacts: [], ...extra });
  await json(path.join(root, directory, 'current.json'), { dataset_id: dataset, release_id: id, manifest: `releases/${id}/manifest.json` });
}
async function dependency(root, pointer) {
  const file = path.resolve(root, pointer), p = JSON.parse(await readFile(file));
  const bytes = await readFile(path.resolve(path.dirname(file), p.manifest)), m = JSON.parse(bytes);
  return { dataset_id: m.dataset_id, release_id: m.release_id, manifest_sha256: sha(bytes) };
}
async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'production-chain-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const definitionFile = 'config/migrations/normalized-us-postal-fields-v1.json';
  await mkdir(path.join(root, 'config/migrations'), { recursive: true });
  await copyFile(path.join(APP_ROOT, definitionFile), path.join(root, definitionFile));
  const definition = JSON.parse(await readFile(path.join(root, definitionFile)));
  for (const source of definition.sources) {
    await json(path.join(root, source.connector_config), { id: source.source_key, version: source.minimum_connector_version });
    await release(root, path.dirname(source.pointer), source.dataset_id, `fixture-${source.source_key}`);
  }
  for (const [directory, dataset] of [['data/geography', 'us-census-geography'], ['data/zcta-jurisdiction-crosswalk', 'us-census-zcta-jurisdiction-crosswalk'], ['data/business-baselines/census-nonemployer', 'census-nonemployer-baseline'], ['data/business-baselines/census-zbp', 'census-zbp-baseline']]) await release(root, directory, dataset, `fixture-${dataset}`);
  for (const [key, directory] of Object.entries(outputs)) await release(root, directory, datasets[key], `previous-${key}`);
  for (const script of scripts) { const file = path.join(root, 'scripts', `${script}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture exits zero but emits no release.\n'); }
  for (const implementation of ['business-registry', 'business-entity-resolution', 'entity-resolution-benchmark', 'national-business-coverage-views']) { const file = path.join(root, 'runner', `${implementation}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture implementation.\n'); }
  const readinessInspector = async (options) => {
    assert.equal(options.useCandidatePointers, false);
    const sources = [];
    for (const source of definition.sources) {
      const pointer = path.join(root, source.pointer), p = JSON.parse(await readFile(pointer)), manifest = path.resolve(path.dirname(pointer), p.manifest);
      sources.push({ source_key: source.source_key, dataset_id: source.dataset_id, pointer, manifest, current_release_id: p.release_id, pointer_sha256: sha(await readFile(pointer)), manifest_sha256: sha(await readFile(manifest)), connector_config_sha256: sha(await readFile(path.join(root, source.connector_config))), status: 'ready', pointer_scope: 'production' });
    }
    return { ready_for_registry_2_10: true, plan_sha256: sha(JSON.stringify(sources)), counts: { total: 25, ready: 25, blocked: 0, rebuild_required: 0, candidate_pointers_used: 0 }, sources };
  };
  return { root, definition, readinessInspector };
}
async function executeFixture(f, stage, { logPath, onSpawn }) {
  await writeFile(logPath, `${stage.id}\n`); await onSpawn(process.pid);
  if (stage.kind !== 'build') return { exitCode: 0 };
  const value = (flag) => stage.args[stage.args.indexOf(flag) + 1], key = stage.id.split('-')[0];
  let extra;
  if (key === 'registry') extra = { dependencies: await Promise.all(f.definition.sources.map((s) => dependency(f.root, s.pointer))) };
  if (key === 'resolution') extra = { dependency: await dependency(f.root, value('--registry')) };
  if (key === 'benchmark') extra = { dependencies: { registry: await dependency(f.root, value('--registry')), resolution: await dependency(f.root, value('--resolution')) } };
  if (key === 'coverage') extra = { dependencies: await Promise.all(['--registry', '--resolution', '--benchmark', '--geography', '--crosswalk', '--nonemployer'].map((flag) => dependency(f.root, value(flag)))) };
  await release(f.root, value('--output'), datasets[key], `fresh-${key}`, extra);
  return { exitCode: 0 };
}

test('production plan pins 25 production sources, four old outputs, and fixed local-only stages without writes', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'plan-proof' });
  assert.equal(plan.mode, 'production'); assert.equal(plan.sourcePins.length, 25); assert.equal(plan.stages.length, 8);
  assert.equal(plan.stages[0].args.filter((v) => v.endsWith('current.json')).length, 25);
  for (const stage of plan.stages.filter((s) => s.kind === 'build')) assert.equal(stage.args[stage.args.indexOf('--output') + 1], outputs[stage.id.split('-')[0]]);
  await assert.rejects(readdir(path.join(f.root, 'data/reconciliations/production-runs/plan-proof')), /ENOENT/);
});
test('production rejects candidate evidence before launch', async (t) => {
  const f = await fixture(t);
  await assert.rejects(planProductionReconciliation({ ...f, readinessInspector: async (options) => { const report = await f.readinessInspector(options); report.sources[0].pointer_scope = 'candidate'; return report; } }), /production|scope|ready/i);
});
test('production executes ordered local chain and persists release and log evidence', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'success-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); return executeFixture(f, stage, context); } });
  assert.equal(result.receipt.status, 'SUCCEEDED'); assert.deepEqual(calls, plan.stages.map((s) => s.id));
  assert.deepEqual(JSON.parse(await readFile(result.receiptPath)), result.receipt);
  for (const stage of result.receipt.stages) assert.match(stage.log.sha256, /^[a-f0-9]{64}$/);
  for (const [key, directory] of Object.entries(outputs)) assert.equal(JSON.parse(await readFile(path.join(f.root, directory, 'current.json'))).release_id, `fresh-${key}`);
});
test('production real child cannot pass by leaving an old valid pointer unchanged', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'old-pointer-proof' });
  const result = await runProductionReconciliation(plan, f);
  assert.equal(result.receipt.status, 'FAILED'); assert.equal(result.receipt.stages[0].exitCode, 0);
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});
test('production verifier failure stops before dependent builds without deleting retained old releases', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'failure-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); await executeFixture(f, stage, context); return { exitCode: stage.id === 'registry-verify' ? 8 : 0 }; } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build', 'registry-verify']);
  assert.equal(JSON.parse(await readFile(path.join(f.root, outputs.registry, 'releases/previous-registry/manifest.json'))).release_id, 'previous-registry');
});
test('production stage-boundary cancellation finishes current stage but launches no next stage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'stop-proof' }), controller = new AbortController(), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, signal: controller.signal, executor: async (stage, context) => { calls.push(stage.id); controller.abort(); return executeFixture(f, stage, context); } });
  assert.equal(result.receipt.status, 'STOPPED'); assert.deepEqual(calls, ['registry-build']);
});
test('production refuses changed source, implementation, or output before executing', async (t) => {
  for (const kind of ['source', 'implementation', 'output']) {
    const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: `drift-${kind}` }); let calls = 0;
    const target = kind === 'source' ? f.definition.sources[0].pointer : kind === 'implementation' ? 'runner/business-registry.mjs' : `${outputs.coverage}/current.json`;
    await writeFile(path.join(f.root, target), '{}\n');
    await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => { calls += 1; } })); assert.equal(calls, 0);
  }
});
test('production shares candidate lock and never steals stale-looking ownership', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'lock-proof' });
  const lock = path.join(f.root, 'data/reconciliations/controller.lock'); await json(lock, { pid: 99999999, runId: 'retained-owner' });
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('duplicate launch') }), /lock|owns|controller/i);
  assert.equal(JSON.parse(await readFile(lock)).runId, 'retained-owner');
});
test('production refuses junctioned output before any writes to its destination', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'link-proof' });
  const other = path.join(f.root, 'redirected'); await mkdir(other);
  await mkdir(path.join(f.root, 'data/reconciliations'), { recursive: true });
  await symlink(other, path.join(f.root, 'data/reconciliations/production-runs'), 'junction');
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('linked launch') }), /link|junction/i);
  assert.deepEqual(await readdir(other), []);
});

test('production rejects freshly published registry with wrong source lineage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'lineage-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    const file = path.join(f.root, outputs.registry, 'releases/fresh-registry/manifest.json'), manifest = JSON.parse(await readFile(file));
    manifest.dependencies[0].manifest_sha256 = '0'.repeat(64); await json(file, manifest);
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
});
test('production detects source mutation during child execution', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'source-midrun-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    await writeFile(path.join(f.root, f.definition.sources[0].pointer), '{}\n'); return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
});
test('production detects publication mutation during independent verification', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'verify-drift-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    if (stage.id === 'registry-verify') await writeFile(path.join(f.root, outputs.registry, 'current.json'), '{}\n');
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build', 'registry-verify']);
});
test('production never overwrites or resumes an existing run receipt', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'existing-proof' });
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { await writeFile(context.logPath, 'failed\n'); return { exitCode: 7 }; } });
  const before = await readFile(result.receiptPath);
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('must not resume') }), /exist|already|run/i);
  assert.deepEqual(await readFile(result.receiptPath), before);
});
test('production rejects canonical pointer redirected to an isolated candidate manifest', async (t) => {
  const f = await fixture(t), source = f.definition.sources[0];
  const pointerPath = path.join(f.root, source.pointer), pointer = JSON.parse(await readFile(pointerPath));
  const copied = path.join(f.root, 'data/isolated/release/manifest.json');
  await mkdir(path.dirname(copied), { recursive: true }); await copyFile(path.resolve(path.dirname(pointerPath), pointer.manifest), copied);
  pointer.manifest = path.relative(path.dirname(pointerPath), copied); await json(pointerPath, pointer);
  await assert.rejects(planProductionReconciliation({ ...f, runId: 'candidate-pointer-proof' }), /manifest|release|production|canonical/i);
});
test('production rejects unpinned registry dependency but permits inherited source dependencies', async (t) => {
  for (const unexpected of [false, true]) {
    const f = await fixture(t), source = f.definition.sources[0], p = JSON.parse(await readFile(path.join(f.root, source.pointer)));
    const manifestPath = path.resolve(f.root, path.dirname(source.pointer), p.manifest), m = JSON.parse(await readFile(manifestPath));
    const inherited = await dependency(f.root, 'data/geography/current.json'); m.dependencies = [inherited, inherited]; await json(manifestPath, m);
    const plan = await planProductionReconciliation({ ...f, runId: `inherited-${unexpected}` });
    const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
      await executeFixture(f, stage, context);
      if (stage.id === 'registry-build') {
        const file = path.join(f.root, outputs.registry, 'releases/fresh-registry/manifest.json'), emitted = JSON.parse(await readFile(file));
        emitted.dependencies.push(inherited, inherited);
        if (unexpected) emitted.dependencies.push({ ...inherited, dataset_id: 'unplanned-source' });
        await json(file, emitted);
      }
      return { exitCode: 0 };
    } });
    assert.equal(result.receipt.status, unexpected ? 'FAILED' : 'SUCCEEDED');
  }
});

test('production durable stop is visible while a child runs and prevents next stage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'durable-stop-proof' });
  let started, finish; const begun = new Promise((resolve) => { started = resolve; }), gate = new Promise((resolve) => { finish = resolve; });
  const running = runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    await executeFixture(f, stage, context); started(); await gate; return { exitCode: 0 };
  } });
  await begun;
  try {
    await requestProductionReconciliationStop({ root: f.root, runId: plan.runId });
    const receiptPath = path.join(f.root, plan.outputRoot, 'receipt.json');
    let visible = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const receipt = JSON.parse(await readFile(receiptPath));
      if (receipt.stopRequested) { visible = true; assert.equal(receipt.status, 'RUNNING'); break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(visible, true);
  } finally { finish(); }
  const result = await running; assert.equal(result.receipt.status, 'STOPPED');
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});

test('production stop refuses missing run and escaping run IDs', async (t) => {
  const f = await fixture(t);
  await assert.rejects(requestProductionReconciliationStop({ root: f.root, runId: 'missing' }));
  await assert.rejects(requestProductionReconciliationStop({ root: f.root, runId: '../outside' }));
});
