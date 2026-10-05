import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { candidateStages, runProductionCandidateReconciliation, validateProductionCandidateEnvelope } from './production-candidate-reconciliation.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const fixturePlan = { path: 'data/reconciliations/production-plans/production-cms-directories-20261005-189.json', confirmationSha256: 'fb6a6aff59e1d9460f15d72f2bf3546ff51939990f31f8bb6ba80cb58de27d29', fileSha256: '17b0802dc5b77339c3ed84aa75d5a11c4de8489b8fd97648094d89e661eba8ac' };
const canonicalBytes = await readFile(path.join(repo, fixturePlan.path));
const canonicalPlan = JSON.parse(canonicalBytes);
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cotive-candidate-'));
  const planPath = path.join(root, fixturePlan.path);
  await mkdir(path.dirname(planPath), { recursive: true }); await writeFile(planPath, canonicalBytes);
  const pointer = path.join(root, 'production-current.json'); await writeFile(pointer, '{"release":"unchanged"}\n');
  const bytes = await readFile(pointer);
  return { root, pointer, snapshotter: async () => ({ 'data/example/current.json': { absolute: pointer, bytes, sha256: 'fixture' } }) };
}
const base = f => ({ root: f.root, planPath: fixturePlan.path, confirmationSha256: fixturePlan.confirmationSha256, planFileSha256: fixturePlan.fileSha256, validator: async () => ({ status: 'READY' }), pointerSnapshotter: f.snapshotter });
async function successfulStage(stage, context, { exitCode = 0 } = {}) {
  await context.onSpawn(4321); await writeFile(context.logPath, `local ${stage.id}\n`);
  if (exitCode === 0) {
    const outputRoot = stage.args.includes('--output') ? stage.args[stage.args.indexOf('--output') + 1] : path.dirname(stage.args[0]);
    const releaseId = `candidate-${stage.id}`, datasetId = `candidate-${path.basename(outputRoot)}`;
    const manifest = path.join(outputRoot, 'releases', releaseId, 'manifest.json');
    await mkdir(path.dirname(manifest), { recursive: true });
    await writeFile(manifest, `${JSON.stringify({ dataset_id: datasetId, release_id: releaseId, production_enrollment: false })}\n`);
    await writeFile(path.join(outputRoot, 'current.json'), `${JSON.stringify({ dataset_id: datasetId, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  }
  return { exitCode, pid: 4321 };
}

test('exact production plan envelope and all eight stages are isolated', async () => {
  assert.equal(validateProductionCandidateEnvelope(canonicalPlan, canonicalBytes, { confirmationSha256: fixturePlan.confirmationSha256, fileSha256: fixturePlan.fileSha256 }), true);
  const rewritten = candidateStages(canonicalPlan, 'C:/candidate');
  assert.equal(rewritten.length, 8);
  assert.ok(rewritten.flatMap(x => x.args).some(x => String(x).includes('candidate/outputs/business-registry')));
  const canonicalOutputs = [...['business-registry', 'business-entity-resolution', 'business-entity-resolution-benchmark', 'business-coverage-views'].flatMap(name => [`data/${name}`, `data/${name}/current.json`])];
  assert.ok(canonicalOutputs.every(value => !rewritten.flatMap(x => x.args).includes(value)));
  assert.equal(rewritten.filter(stage => stage.args.some(arg => String(arg).includes('/candidate/outputs/'))).length, 8);
});

test('generic envelope rejects roster drift and plan paths remain contained', async () => {
  const drifted = structuredClone(canonicalPlan); drifted.stages[0].script = 'scripts/not-canonical.mjs';
  const bytes = Buffer.from(JSON.stringify(drifted)), fileSha256 = createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => validateProductionCandidateEnvelope(drifted, bytes, { confirmationSha256: drifted.planSha256, fileSha256 }), /roster changed/);
  const f = await fixture();
  await assert.rejects(runProductionCandidateReconciliation({ ...base(f), planPath: '../outside.json', candidateRunId: 'candidate-outside' }), /Unsafe candidate path|escapes/);
});

test('successful rehearsal executes eight stages and preserves production pointer bytes', async () => {
  const f = await fixture(); let calls = 0;
  const receipt = await runProductionCandidateReconciliation({ ...base(f), candidateRunId: 'candidate-success', executor: async (stage, context) => { calls++; return successfulStage(stage, context); } });
  assert.equal(calls, 8); assert.equal(receipt.status, 'SUCCEEDED'); assert.equal(receipt.production_enrollment, false);
  assert.equal(receipt.network_requests, 0); assert.deepEqual(await readFile(f.pointer), Buffer.from('{"release":"unchanged"}\n'));
  assert.ok(Object.values(receipt.production_pointers).every(x => x.unchanged));
  assert.ok(receipt.stages.every(x => x.status === 'SUCCEEDED' && x.pid === 4321 && x.log.sha256.length === 64 && x.output_release.manifest_sha256.length === 64));
});

test('failure and cancellation preserve production pointer bytes', async () => {
  const failed = await fixture(); let calls = 0;
  await assert.rejects(runProductionCandidateReconciliation({ ...base(failed), candidateRunId: 'candidate-failure', executor: async (stage, context) => successfulStage(stage, context, { exitCode: ++calls === 2 ? 1 : 0 }) }), /stage failed/);
  assert.equal((await readFile(failed.pointer, 'utf8')), '{"release":"unchanged"}\n');
  const failedReceipt = JSON.parse(await readFile(path.join(failed.root, 'data/reconciliations/production-candidate-runs/candidate-failure/receipt.json')));
  assert.equal(failedReceipt.status, 'FAILED'); assert.ok(Object.values(failedReceipt.production_pointers).every(x => x.unchanged));
  const cancelled = await fixture(), controller = new AbortController(); calls = 0;
  const receipt = await runProductionCandidateReconciliation({ ...base(cancelled), candidateRunId: 'candidate-cancelled', signal: controller.signal, executor: async (stage, context) => { calls++; const result = await successfulStage(stage, context); controller.abort(); return result; } });
  assert.equal(calls, 1); assert.equal(receipt.status, 'CANCELLED');
  assert.equal((await readFile(cancelled.pointer, 'utf8')), '{"release":"unchanged"}\n');
  assert.ok(Object.values(receipt.production_pointers).every(x => x.unchanged));
});

test('pointer mutation, hash drift, traversal, and linked plan inputs fail closed', async () => {
  const changed = await fixture();
  await assert.rejects(runProductionCandidateReconciliation({ ...base(changed), candidateRunId: 'candidate-mutates', executor: async (stage, context) => { await successfulStage(stage, context); await writeFile(changed.pointer, 'changed'); return { exitCode: 0 }; } }), /pointer bytes changed/);
  const drift = await fixture(); await writeFile(path.join(drift.root, fixturePlan.path), Buffer.concat([canonicalBytes, Buffer.from(' ')]));
  await assert.rejects(runProductionCandidateReconciliation({ ...base(drift), candidateRunId: 'candidate-drift', executor: async () => ({ exitCode: 0 }) }), /confirmation or file SHA/);
  const traversal = await fixture(); await assert.rejects(runProductionCandidateReconciliation({ ...base(traversal), candidateRunId: '../escape', executor: async () => ({ exitCode: 0 }) }), /Invalid candidate/);
  if (process.platform !== 'win32') {
    const linked = await fixture(), target = path.join(linked.root, 'plan-target.json'); await writeFile(target, canonicalBytes);
    const planPath = path.join(linked.root, fixturePlan.path); await writeFile(planPath, 'x');
    const { unlink } = await import('node:fs/promises'); await unlink(planPath); await symlink(target, planPath);
    await assert.rejects(runProductionCandidateReconciliation({ ...base(linked), candidateRunId: 'candidate-linked', executor: async () => ({ exitCode: 0 }) }), /Symbolic links/);
  }
});

test('durable receipt excludes concurrent or crashed same-ID ownership', async () => {
  const f = await fixture(); let entered; const hasEntered = new Promise(resolve => { entered = resolve; });
  const run = runProductionCandidateReconciliation({ ...base(f), candidateRunId: 'candidate-owned', executor: async (stage, context) => { const persisted = JSON.parse(await readFile(path.join(f.root, 'data/reconciliations/production-candidate-runs/candidate-owned/receipt.json'))); assert.equal(persisted.status, 'RUNNING'); assert.equal(persisted.stages.at(-1).status, 'RUNNING'); entered(); return successfulStage(stage, context); } });
  await hasEntered;
  await assert.rejects(runProductionCandidateReconciliation({ ...base(f), candidateRunId: 'candidate-owned', executor: successfulStage }), /already exists/);
  await run;
  await assert.rejects(runProductionCandidateReconciliation({ ...base(f), candidateRunId: 'candidate-owned', executor: successfulStage }), /already exists \(SUCCEEDED\)/);
  const crashed = await fixture();
  await assert.rejects(runProductionCandidateReconciliation({ ...base(crashed), candidateRunId: 'candidate-crash', executor: async () => { throw new Error('secret executor detail'); } }), /secret executor detail/);
  const receipt = JSON.parse(await readFile(path.join(crashed.root, 'data/reconciliations/production-candidate-runs/candidate-crash/receipt.json'), 'utf8'));
  assert.equal(receipt.status, 'FAILED'); assert.deepEqual(receipt.failure, { code: 'candidate_rehearsal_failed', stage_id: 'registry-build' });
  assert.doesNotMatch(JSON.stringify(receipt), /secret executor detail/);
  const interrupted = await fixture(), interruptedRoot = path.join(interrupted.root, 'data/reconciliations/production-candidate-runs/candidate-interrupted');
  await mkdir(interruptedRoot, { recursive: true }); await writeFile(path.join(interruptedRoot, 'receipt.json'), '{"status":"RUNNING"}\n');
  await assert.rejects(runProductionCandidateReconciliation({ ...base(interrupted), candidateRunId: 'candidate-interrupted', executor: successfulStage }), /already exists \(INCOMPLETE\)/);
});
