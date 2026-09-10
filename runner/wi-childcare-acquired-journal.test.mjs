import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { payload } from './fixtures/wi-childcare.mjs';
import { batch } from './fixtures/wi-childcare-acquisition.mjs';
import { wiInventoryUrl } from './wi-childcare-acquisition.mjs';
import { wiPreflightUrl } from './wi-childcare-preflight.mjs';
import { buildWiChildcareAcquiredJournalWithTransport as build, inspectWiChildcareAcquiredJournal as inspect } from './wi-childcare-acquired-journal.mjs';
const root = () => path.join(APP_ROOT, 'data/tmp/wi-acquired-journal', randomUUID());
const json = v => JSON.stringify(v) + '\n';
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const exec = promisify(execFile), cli = path.join(APP_ROOT, 'scripts/inspect-wi-childcare-acquired-journal.mjs');
async function fixture(reviewed = false) {
  const notices = new Map();
  if (reviewed) {
    const saved = await read(path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/preflights/b868758e-3ff7-429c-8625-57bac5367a9e.json'));
    for (const kind of ['service-item', 'layer-item', 'iteminfo', 'notice-data', 'xml']) notices.set(wiPreflightUrl(kind), saved.observations.find(o => o.kind === kind).payload);
  }
  const calls = [], outputRoot = root();
  return { calls, options: { outputRoot, now: () => new Date('2026-09-10T20:30:00.000Z'), sleep: async (_, { signal } = {}) => signal?.throwIfAborted(),
    fetchImpl: async url => {
      calls.push(url); const directories = await readdir(path.join(outputRoot, 'jobs')); assert.equal(directories.length, 1);
      const directory = path.join(outputRoot, 'jobs', directories[0]);
      const files = (await readdir(directory)).filter(name => /^request-\d+\.json$/.test(name)).sort();
      const intent = await read(path.join(directory, files.at(-1))); assert.equal(intent.url, url); assert.equal(intent.delivery, 'possible-not-proven');
      const ids = new URL(url).searchParams.get('objectIds');
      const value = url === wiInventoryUrl() ? { objectIdFieldName: 'OBJECTID', objectIds: [1, 2] }
        : ids ? batch(ids.split(',').map(Number)) : structuredClone(notices.get(url) ?? payload(url));
      if (value.count) value.count = 2;
      if (url.endsWith('/metadata') && typeof value !== 'string') return new Response(Buffer.from(value.base64, 'base64'));
      return typeof value === 'string' ? new Response(value) : Response.json(value);
    },
  } };
}
test('unreviewed notices retain possible-attempt evidence but cannot become acquired records', async () => {
  const f = await fixture(); let recovery;
  await assert.rejects(build(f.options), error => { recovery = error.recovery; return !!recovery; });
  assert.equal(f.calls.length, 18); assert.equal(recovery.retry_authorized, false);
  const result = await inspect(recovery.receipt); assert.equal(result.status, 'FAILED'); assert.equal(result.request_intents, 18);
  assert.equal(result.record_count, null); assert.equal(result.retained_observations, 0); assert.equal(result.source_use_authorized, false);
  await assert.rejects(lstat(path.join(f.options.outputRoot, '.owner.lock')), { code: 'ENOENT' });
});
test('invalid inputs and pre-cancellation do not create roots or call transport', async () => {
  const f = await fixture();
  for (const options of [{}, { ...f.options, outputRoot: APP_ROOT }, { ...f.options, outputRoot: path.join(APP_ROOT, 'data') },
    { ...f.options, outputRoot: path.join(APP_ROOT, 'data/tmp/jobs/nested') }, { ...f.options, policy: {} }]) await assert.rejects(build(options));
  await assert.rejects(build({ ...f.options, signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(lstat(f.options.outputRoot), { code: 'ENOENT' }); assert.equal(f.calls.length, 0);
  assert.match((await exec(process.execPath, [cli, '--help'], { cwd: APP_ROOT })).stdout, /No acquisition/);
  await assert.rejects(exec(process.execPath, [cli, '--run'], { cwd: APP_ROOT }), error => error.code === 1);
});
test('failed intent persistence stops before fetch and leaves terminal inspection evidence', async () => {
  const f = await fixture(); let recovery;
  await assert.rejects(build({ ...f.options, beforePersist: ({ name }) => { if (name.startsWith('request-')) throw Error('Injected private storage error'); } }), error => {
    recovery = error.recovery; assert(!error.message.includes('private')); return !!recovery;
  });
  assert.equal(f.calls.length, 0); const result = await inspect(recovery.receipt); assert.equal(result.request_intents, 0); assert.equal(result.status, 'FAILED');
});
test('timeout during intent retention drains writes before sealing and never dispatches late', async () => {
  const f = await fixture(), controller = new AbortController(); let entered, release, settled = false, recovery;
  const started = new Promise(resolve => { entered = resolve; }), hold = new Promise(resolve => { release = resolve; });
  const operation = build({ ...f.options, signal: controller.signal, timeoutMs: 5, beforePersist: async ({ name }) => { if (name === 'request-000000.json') { entered(); await hold; } } })
    .catch(error => { recovery = error.recovery; }).finally(() => { settled = true; });
  await started; await delay(40); assert.equal(settled, false); assert.equal(f.calls.length, 0);
  assert((await lstat(path.join(f.options.outputRoot, '.owner.lock'))).isFile()); controller.abort(); release(); await operation;
  assert(recovery); const before = await readFile(recovery.receipt); await delay(20); assert.deepEqual(await readFile(recovery.receipt), before);
  assert.equal(f.calls.length, 0);
  const terminal = await inspect(recovery.receipt);
  // The timeout may already have failed the transport before cancellation is
  // requested during drain. Preserve that first outcome instead of relabeling it.
  assert(['FAILED', 'CANCELLED'].includes(terminal.status)); assert.equal(terminal.record_count, null);
});
test('concurrent owner cannot be stolen while a retained intent is pending', async () => {
  const f = await fixture(); let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), hold = new Promise(resolve => { release = resolve; });
  const operation = build({ ...f.options, beforePersist: async ({ name }) => { if (name === 'run.json') { entered(); await hold; } } }).catch(error => error);
  await started; const original = await readFile(path.join(f.options.outputRoot, '.owner.lock'));
  await assert.rejects(build(f.options), { code: 'EEXIST' }); assert.deepEqual(await readFile(path.join(f.options.outputRoot, '.owner.lock')), original);
  release(); assert((await operation).recovery);
});
test('reviewed-notice injected lifecycle replays records, retry intents, cancellation and tamper detection', { skip: !process.env.DATAHUB_TEST_WI_RETAINED_POLICY }, async () => {
  const f = await fixture(true); const success = await build(f.options);
  assert.equal(success.status, 'SUCCEEDED'); assert.equal(success.request_intents, 39); assert.equal(success.retained_observations, 3); assert.equal(success.record_count, 2);
  assert.equal(success.source_authenticity_verified, false); assert.equal(success.source_requests_this_inspection, 0);
  const inspected = JSON.parse((await exec(process.execPath, [cli, '--receipt', success.receipt], { cwd: APP_ROOT })).stdout);
  assert.equal(inspected.status, 'SUCCEEDED'); assert.equal(inspected.record_count, 2); assert.equal(inspected.native_app_enrolled, false);
  const directory = path.dirname(success.receipt), receipt = await read(success.receipt), request = path.join(directory, 'request-000000.json');
  const original = await readFile(request); await writeFile(request, '{}'); await assert.rejects(inspect(success.receipt)); await writeFile(request, original);
  await writeFile(path.join(directory, 'extra.json'), '{}'); await assert.rejects(inspect(success.receipt));
  // A separate synthetic release tests self-rehashed ordering changes.
  const second = await build((await fixture(true)).options), secondReceipt = await read(second.receipt), secondDirectory = path.dirname(second.receipt);
  const changedPath = path.join(secondDirectory, 'request-000001.json'), changed = await read(changedPath); changed.sequence = 7;
  const raw = json(changed); await writeFile(changedPath, raw); const descriptor = secondReceipt.artifacts.find(a => a.path === 'request-000001.json');
  descriptor.bytes = Buffer.byteLength(raw); descriptor.sha256 = createHash('sha256').update(raw).digest('hex'); await writeFile(second.receipt, json(secondReceipt)); await assert.rejects(inspect(second.receipt));
  assert.equal(receipt.record_count, 2);
  for (const mode of ['late-intents', 'artifact-order', 'outside-run']) {
    const target = await build((await fixture(true)).options), saved = await read(target.receipt), dir = path.dirname(target.receipt);
    if (mode === 'late-intents') {
      saved.finished_at = '2026-09-10T20:31:00.000Z';
      for (const artifact of saved.artifacts.filter(a => a.path.startsWith('request-'))) {
        const file = path.join(dir, artifact.path), intent = await read(file); intent.intended_at = '2026-09-10T20:30:01.000Z';
        const raw = json(intent); await writeFile(file, raw); artifact.bytes = Buffer.byteLength(raw); artifact.sha256 = createHash('sha256').update(raw).digest('hex');
      }
    } else if (mode === 'artifact-order') {
      const intents = saved.artifacts.filter(a => a.path.startsWith('request-'));
      saved.artifacts = [...saved.artifacts.filter(a => !a.path.startsWith('request-') && a.path !== 'acquisition.json'), ...intents, saved.artifacts.at(-1)];
    } else {
      saved.started_at = '2026-09-10T20:29:59.000Z';
      const artifact = saved.artifacts.find(a => a.path === 'run.json'), file = path.join(dir, 'run.json'), run = await read(file);
      run.started_at = saved.started_at; const raw = json(run); await writeFile(file, raw); artifact.bytes = Buffer.byteLength(raw); artifact.sha256 = createHash('sha256').update(raw).digest('hex');
      // Move acquisition start outside the enclosing run without changing source observations.
      const acquiredArtifact = saved.artifacts.find(a => a.path === 'acquisition.json'), acquiredFile = path.join(dir, 'acquisition.json'), acquired = await read(acquiredFile);
      acquired.started_at = '2026-09-10T20:29:58.000Z'; const acquiredRaw = json(acquired); await writeFile(acquiredFile, acquiredRaw);
      acquiredArtifact.bytes = Buffer.byteLength(acquiredRaw); acquiredArtifact.sha256 = createHash('sha256').update(acquiredRaw).digest('hex');
    }
    await writeFile(target.receipt, json(saved)); await assert.rejects(inspect(target.receipt));
  }
  const retry = await fixture(true); let first = true; const transport = retry.options.fetchImpl;
  retry.options.fetchImpl = async (url, options) => { if (url === wiInventoryUrl() && first) { first = false; return new Response('', { status: 503 }); } return transport(url, options); };
  const retried = await build(retry.options); assert.equal(retried.request_intents, 40); assert.equal(retried.retained_observations, 3);
  const cancelled = await fixture(true), controller = new AbortController(); let recovery;
  await assert.rejects(build({ ...cancelled.options, signal: controller.signal, beforePersist: ({ name }) => { if (name === 'observation-000000.json') controller.abort(); } }), error => { recovery = error.recovery; return !!recovery; });
  const partial = await inspect(recovery.receipt); assert.equal(partial.status, 'CANCELLED'); assert.equal(partial.record_count, null);
  assert.equal(partial.request_intents, 19); assert.equal(partial.retained_observations, 1);
  const retention = await fixture(true); let retainedFailure;
  await assert.rejects(build({ ...retention.options, beforePersist: ({ name }) => { if (name === 'observation-000000.json') throw Error('Failed retention'); } }), error => { retainedFailure = error.recovery; return !!retainedFailure; });
  assert.equal((await inspect(retainedFailure.receipt)).request_intents, 19); assert.equal(retention.calls.length, 19);
});
