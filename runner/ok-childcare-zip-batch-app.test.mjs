import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { validateOkBatchApproval, validateOkBatchAppOutput, runOkBatchApp, OK_BATCH_APP_SOURCE_ID as SOURCE } from './ok-childcare-zip-batch-app.mjs';
import { loadIndustryConfig, validateIndustryConfig, buildIndustryPlan, runIndustryPlan, industrySourceCatalog } from './industry-segments.mjs';

const execute = promisify(execFile);
const approval = () => ({ schema_version: 'ok-childcare-batch-approval@1.0.0', status: 'approved',
  approval_id: randomUUID(), approved_at: '2026-09-10T00:00:00.000Z', scope_sha256: 'a'.repeat(64) });

test('OK app approval validates an exact bounded scope without accepting pending or stale approval', () => {
  const record = approval(); assert.deepEqual(validateOkBatchApproval(record, 'a'.repeat(64)), record);
  for (const changed of [{ status: 'pending' }, { scope_sha256: 'b'.repeat(64) }, { approval_id: '../escape' },
    { approved_at: '2099-01-01T00:00:00.000Z' }, { added: true }]) {
    assert.throws(() => validateOkBatchApproval({ ...record, ...changed }, 'a'.repeat(64)), /not approved/);
  }
  assert.throws(() => validateOkBatchApproval(record, null));
});

test('OK app adapter requires the exact industry output identity', () => {
  const id = randomUUID(), output = path.join(APP_ROOT, 'data/industry-segments/runs', id, `${SOURCE}-OK`);
  validateOkBatchAppOutput(output, id);
  for (const target of [APP_ROOT, path.join(APP_ROOT, 'data'), `${output}/..`, output.replace('-OK', '-TX')]) {
    assert.throws(() => validateOkBatchAppOutput(target, id));
  }
  assert.throws(() => validateOkBatchAppOutput(output, randomUUID()));
});

test('OK manual enrollment is absent from every automatic plan but available for explicit selection', async () => {
  const config = await loadIndustryConfig();
  assert.equal(config.sources[SOURCE].manual_selection_required, true);
  assert.deepEqual(industrySourceCatalog(config).find(source => source.id === SOURCE), {
    id: SOURCE, scope: 'state', states: ['OK'], industries: ['childcare'], manualSelectionRequired: true,
  });
  const defaults = buildIndustryPlan(config, { industries: ['childcare'], states: ['OK'] });
  assert.equal(defaults.taskCount, 0);
  assert.ok(defaults.warnings.some(w => w.includes('manual selection required')));
  assert.ok(defaults.gaps.some(g => g.state === 'OK' && g.reason.includes('not selected')));
  assert.ok(!buildIndustryPlan(config).tasks.some(t => t.sourceId === SOURCE));
  assert.ok(!buildIndustryPlan(config, { industries: ['childcare'], states: ['PA'] }).warnings.some(w => w.includes(SOURCE)));
  const explicit = buildIndustryPlan(config, { industries: ['childcare'], states: ['OK'], sourceIds: [SOURCE] });
  assert.equal(explicit.taskCount, 1); assert.equal(explicit.tasks[0].script, 'scripts/build-ok-childcare-zip-batch.mjs');
  assert.throws(() => buildIndustryPlan(config, { industries: ['childcare'], states: ['TX'], sourceIds: [SOURCE] }));
  assert.throws(() => buildIndustryPlan(config, { industries: ['retail-consumer'], states: ['OK'], sourceIds: [SOURCE] }));
  for (const bad of ['true', 1, null]) {
    const changed = structuredClone(config); changed.sources[SOURCE].manual_selection_required = bad;
    assert.throws(() => validateIndustryConfig(changed), /must be boolean/);
  }
  const automatic = structuredClone(config); automatic.sources[SOURCE].manual_selection_required = false;
  assert.equal(buildIndustryPlan(automatic, { industries: ['childcare'], states: ['OK'] }).taskCount, 1);
});

test('OK manual task cannot be injected into an automatic plan', async () => {
  const config = await loadIndustryConfig();
  const plan = buildIndustryPlan(config, { industries: ['childcare'], states: ['OK'] });
  plan.tasks = buildIndustryPlan(config, { industries: ['childcare'], states: ['OK'], sourceIds: [SOURCE] }).tasks;
  let called = false;
  await assert.rejects(runIndustryPlan(config, plan, { executor: async () => { called = true; } }), /does not match/);
  assert.equal(called, false);
});

test('OK app pending approval stops the actual adapter before output or source work', async () => {
  // Isolated runtime copy: never change or depend on the operator's real approval.
  const root = path.join(APP_ROOT, 'data/tmp/ok-batch-app-gate-tests', randomUUID());
  await mkdir(path.join(root, 'config/source-approvals'), { recursive: true });
  const fixture = path.join(APP_ROOT, 'config/source-approvals/ok-childcare-zip-batch.json');
  const pending = JSON.parse(await readFile(fixture, 'utf8'));
  // This fixture is currently pending; once real approval is recorded, the
  // constant fixture below remains an independent negative test.
  if (pending.status === 'pending') await copyFile(fixture, path.join(root, 'config/source-approvals/ok-childcare-zip-batch.json'));
  else {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(root, 'config/source-approvals/ok-childcare-zip-batch.json'), JSON.stringify({ schema_version: 'ok-childcare-batch-approval@1.0.0', status: 'pending', approval_id: null, approved_at: null, scope_sha256: null }));
  }
  const id = randomUUID(), output = path.join(root, 'data/industry-segments/runs', id, `${SOURCE}-OK`);
  await assert.rejects(execute(process.execPath, ['scripts/build-ok-childcare-zip-batch.mjs', '--output', output], {
    cwd: APP_ROOT, env: { ...process.env, DATAHUB_ROOT: root, INDUSTRY_SEGMENT_RUN_ID: id }, timeout: 15000,
  }), error => error.code === 1 && error.stderr.includes('explicit scope approval'));
  await assert.rejects(access(output), { code: 'ENOENT' });
  await assert.rejects(access(path.join(root, 'data/business-sources')), { code: 'ENOENT' });
});

test('OK app rejects native caller hooks and pre-abort before any work', async () => {
  const id = randomUUID(), outputRoot = path.join(APP_ROOT, 'data/industry-segments/runs', id, `${SOURCE}-OK`);
  await assert.rejects(runOkBatchApp({ outputRoot, industryRunId: id, transport: () => {} }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runOkBatchApp({ outputRoot, industryRunId: id, signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(access(outputRoot), { code: 'ENOENT' });
});
