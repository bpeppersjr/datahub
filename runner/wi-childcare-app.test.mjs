import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { payload } from './fixtures/wi-childcare.mjs';
import { batch } from './fixtures/wi-childcare-acquisition.mjs';
import { wiInventoryUrl } from './wi-childcare-acquisition.mjs';
import { wiPreflightUrl } from './wi-childcare-preflight.mjs';
import { buildWiChildcareRelease, verifyWiChildcareRelease } from './wi-childcare-release.mjs';
import { runWiChildcareAppJob as run, runWiChildcareAppJobWithTransport as injected, verifyWiChildcareAppJob as verify, WI_CHILDCARE_APP_CONTRACT } from './wi-childcare-app.mjs';
const root = () => path.join(APP_ROOT, 'data/tmp/wi-app', randomUUID());
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const execute = promisify(execFile), cli = path.join(APP_ROOT, 'scripts/run-wi-childcare-app.mjs');
async function fixture(reviewed = false) {
  const notices = new Map(), calls = [];
  if (reviewed) {
    const preflight = await read(path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/preflights/b868758e-3ff7-429c-8625-57bac5367a9e.json'));
    for (const kind of ['service-item', 'layer-item', 'iteminfo', 'notice-data', 'xml']) notices.set(wiPreflightUrl(kind), preflight.observations.find(o => o.kind === kind).payload);
  }
  return { calls, options: { outputRoot: root(), sleep: async (_, { signal } = {}) => signal?.throwIfAborted(),
    // Fixture time is in the past so native-clock retained reprocessing is valid.
    now: () => new Date('2026-09-09T21:00:00.000Z'), fetchImpl: async url => {
      calls.push(url); const ids = new URL(url).searchParams.get('objectIds');
      const value = url === wiInventoryUrl() ? { objectIdFieldName: 'OBJECTID', objectIds: [1, 2] }
        : ids ? batch(ids.split(',').map(Number)) : structuredClone(notices.get(url) ?? payload(url));
      if (value.count) value.count = 2;
      if (url.endsWith('/metadata') && typeof value !== 'string') return new Response(Buffer.from(value.base64, 'base64'));
      return typeof value === 'string' ? new Response(value) : Response.json(value);
    } } };
}

test('WI native app is closed before I/O and rejects caller transport or policy overrides', async () => {
  const outputRoot = root();
  await assert.rejects(run({ outputRoot }), { code: 'WI_CHILDCARE_LIVE_NOT_ENROLLED' });
  await assert.rejects(run({ outputRoot, fetchImpl() {} })); await assert.rejects(run({ outputRoot, policy: { approved: true } }));
  await assert.rejects(lstat(outputRoot), { code: 'ENOENT' });
  assert.equal(WI_CHILDCARE_APP_CONTRACT.native_dispatch_enabled, false);
  assert.throws(() => { WI_CHILDCARE_APP_CONTRACT.execution_limits.max_parallel_requests = 50; });
  assert.match((await execute(process.execPath, [cli, '--help'], { cwd: APP_ROOT })).stdout, /Native acquisition is disabled/);
  await assert.rejects(execute(process.execPath, [cli, '--acquire'], { cwd: APP_ROOT }));
});

test('WI app persists failure identity without promoting unreviewed notices or losing child evidence', async () => {
  const f = await fixture(); let recovery;
  await assert.rejects(injected(f.options), error => { recovery = error.recovery; return !!recovery; });
  assert.equal(f.calls.length, 18); assert.equal(recovery.retry_authorized, false);
  const result = await verify(recovery.receipt); assert.equal(result.receipt.status, 'FAILED'); assert.equal(result.receipt.acquired, null); assert.equal(result.receipt.normalized, null);
  const children = await readdir(path.join(recovery.work_directory, 'acquired/jobs')); assert.equal(children.length, 1);
  assert.equal((await read(path.join(recovery.work_directory, 'acquired/jobs', children[0], 'receipt.json'))).request_intents, 18);
  await assert.rejects(lstat(path.join(f.options.outputRoot, '.owner.lock')), { code: 'ENOENT' });
});

test('WI app pre-cancellation, unsafe roots and failed retained inputs never acquire', async () => {
  const f = await fixture(); await assert.rejects(injected({ ...f.options, signal: AbortSignal.abort() }));
  for (const outputRoot of [APP_ROOT, path.join(APP_ROOT, 'data'), path.join(APP_ROOT, 'data/tmp/runs/new')]) await assert.rejects(injected({ ...f.options, outputRoot }));
  await assert.rejects(run({ outputRoot: f.options.outputRoot, retainedJournalReceipt: path.join(APP_ROOT, 'data/tmp/missing/receipt.json') }));
  assert.equal(f.calls.length, 0); await assert.rejects(lstat(f.options.outputRoot), { code: 'ENOENT' });
});

test('WI app shared source lock excludes different roots until a pending intent drains', async () => {
  const f = await fixture(), other = await fixture(), controller = new AbortController(); let entered, release, settled = false, recovery;
  const started = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
  const pending = injected({ ...f.options, signal: controller.signal, beforePersist: async ({ name }) => { if (name === 'request-000000.json') { entered(); await held; } } })
    .catch(error => { recovery = error.recovery; }).finally(() => { settled = true; });
  await started; await assert.rejects(injected(other.options)); assert.equal(other.calls.length, 0); assert.equal(settled, false);
  controller.abort(); release(); await pending; assert.equal(f.calls.length, 0);
  assert.equal((await verify(recovery.receipt)).receipt.status, 'CANCELLED');
  await assert.rejects(lstat(path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/development-runtime/publisher.lock')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(other.options.outputRoot, '.owner.lock')), { code: 'ENOENT' });
});

test('WI app preserves injected lineage, explicit no-fetch reuse and cancellation checkpoints', { skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY }, async () => {
  const f = await fixture(true), result = await injected(f.options);
  assert.equal(f.calls.length, 39); assert.equal(result.receipt.status, 'SUCCEEDED'); assert.equal(result.receipt.acquired.record_count, 2);
  assert.deepEqual(result.receipt.normalized.counts, { selected: 2, accepted: 2, quarantined: 0 });
  assert.equal(result.receipt.claims.source_use_authorized, false); assert.equal(result.receipt.execution_mode, 'injected-test-transport');
  const prior = await readFile(result.receiptPath), journal = result.receipt.acquired.receipt;
  const reused = await run({ retainedJournalReceipt: journal, outputRoot: root() });
  assert.equal(reused.receipt.execution_mode, 'retained-local-verification'); assert.deepEqual(reused.receipt.acquired, result.receipt.acquired); assert.equal(f.calls.length, 39);
  assert.notEqual(reused.receipt.normalized.manifest_path, result.receipt.normalized.manifest_path); assert.deepEqual(await readFile(result.receiptPath), prior);
  assert.equal(JSON.parse((await execute(process.execPath, [cli, '--verify', reused.receiptPath], { cwd: APP_ROOT })).stdout).receipt.status, 'SUCCEEDED');
  for (const phase of ['acquired-checkpoint', 'normalized-checkpoint']) {
    const next = await fixture(true), controller = new AbortController(); let recovery;
    await assert.rejects(injected({ ...next.options, signal: controller.signal, logger: event => { if (event.phase === phase) controller.abort(); } }), error => { recovery = error.recovery; return !!recovery; });
    const cancelled = await verify(recovery.receipt); assert.equal(cancelled.receipt.status, 'CANCELLED'); assert.equal(cancelled.receipt.acquired.record_count, 2);
    if (phase === 'normalized-checkpoint') { assert(cancelled.receipt.normalized); assert.equal(recovery.published_normalization.manifest_path, cancelled.receipt.normalized.manifest_path); }
    else assert.equal(cancelled.receipt.normalized, null);
  }
  const invalid = await fixture(); let failed;
  await assert.rejects(injected(invalid.options), error => { failed = error.recovery; return true; });
  const jobs = await readdir(path.join(failed.work_directory, 'acquired/jobs'));
  await assert.rejects(run({ outputRoot: root(), retainedJournalReceipt: path.join(failed.work_directory, 'acquired/jobs', jobs[0], 'receipt.json') }));
});

test('WI app verifier rejects self-rehashed lineage, chronology and authority changes', { skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY }, async () => {
  const result = await injected((await fixture(true)).options), file = result.receiptPath, original = await readFile(file), directory = path.dirname(file);
  for (const alter of [r => { r.claims.source_authenticity_verified = true; }, r => { r.finished_at = '2020-01-01T00:00:00.000Z'; }, r => { r.acquired.receipt_sha256 = '0'.repeat(64); }]) {
    const r = JSON.parse(original); alter(r); await writeFile(file, JSON.stringify(r) + '\n'); await assert.rejects(verify(file)); await writeFile(file, original);
  }
  const startFile = path.join(directory, 'start.json'), start = await read(startFile); start.execution_mode = 'fixed-native-fetch';
  const raw = JSON.stringify(start) + '\n'; await writeFile(startFile, raw); const r = JSON.parse(original); r.execution_mode = start.execution_mode; r.start_sha256 = sha(raw);
  await writeFile(file, JSON.stringify(r) + '\n'); await assert.rejects(verify(file));
});

test('WI child throw after publication preserves inspection-required normalization identity without retry', { skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY }, async () => {
  const f = await fixture(true); let published, attempts = 0, recovery;
  await assert.rejects(injected({ ...f.options, buildRelease: async options => {
    attempts++; published = await buildWiChildcareRelease(options); throw Error('Injected failure after immutable child publication');
  } }), error => { recovery = error.recovery; return !!recovery; });
  assert.equal(attempts, 1); assert.equal(recovery.normalization_state, 'inspection-required'); assert.equal(recovery.published_normalization, null);
  const failed = await verify(recovery.receipt); assert.equal(failed.receipt.status, 'FAILED'); assert.equal(failed.receipt.normalized, null);
  assert.equal(failed.receipt.normalization_state, 'inspection-required'); assert.equal(failed.receipt.normalization_attempt.output_root, path.dirname(path.dirname(path.dirname(published.manifest_path))));
  assert.equal((await verifyWiChildcareRelease(published.manifest_path)).manifest_sha256, published.manifest_sha256);
  await assert.rejects(lstat(path.join(f.options.outputRoot, '.owner.lock')), { code: 'ENOENT' });
});

test('WI app refuses a preexisting child root and a valid unrelated normalized release with matching counts', { skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY }, async () => {
  const f = await fixture(true); let recovery;
  await assert.rejects(injected({ ...f.options, logger: async ({ work, phase }) => {
    if (phase === 'acquired-checkpoint') { const { mkdir } = await import('node:fs/promises'); await mkdir(path.join(work, 'normalized')); }
  } }), error => { recovery = error.recovery; return !!recovery; });
  assert.equal((await verify(recovery.receipt)).receipt.normalization_state, 'not-started');
  const good = await injected((await fixture(true)).options), app = good.receipt, directory = path.dirname(good.receiptPath);
  const evidence = await read(path.join(path.dirname(app.acquired.receipt), 'acquisition.json'));
  evidence.observations[1].payload.features[0].attributes.FacilityName = 'Different test establishment';
  evidence.observations[1].payload_sha256 = sha(JSON.stringify(evidence.observations[1].payload));
  const alternate = await buildWiChildcareRelease({ evidence, outputRoot: app.normalization_attempt.output_root, now: () => new Date(app.finished_at) });
  const checked = await verifyWiChildcareRelease(alternate.manifest_path); assert.deepEqual(checked.counts, app.normalized.counts);
  app.normalized = checked; const checkpointFile = path.join(directory, 'normalized.json'), checkpoint = await read(checkpointFile); checkpoint.verification = checked;
  await writeFile(checkpointFile, JSON.stringify(checkpoint) + '\n'); await writeFile(good.receiptPath, JSON.stringify(app) + '\n');
  await assert.rejects(verify(good.receiptPath));
});
