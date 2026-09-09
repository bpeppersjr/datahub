import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {runUtChildcareAppJob, verifyUtChildcareAppJob} from './ut-childcare-app.mjs';
const parent = path.join(APP_ROOT, 'data/tmp');
async function temp() { await mkdir(parent, {recursive: true}); return mkdtemp(path.join(parent, 'ut-app-test-')); }
const hash = value => createHash('sha256').update(value).digest('hex');
test('UT app rejects unknown, inherited, accessor options, bad paths and pre-cancel before outputs', async () => {
  for (const options of [{url: 'secret'}, [], Object.create({outputRoot: parent}), {get signal() { throw Error('secret'); }}, {signal: {}}, {industryRunId: '../secret'}, {outputRoot: 'relative'}, {outputRoot: path.dirname(APP_ROOT)}])
    await assert.rejects(runUtChildcareAppJob(options), error => !error.message.includes('secret'));
  await assert.rejects(runUtChildcareAppJob({signal: AbortSignal.abort(Error('secret'))}), /cancelled/);
  await assert.rejects(verifyUtChildcareAppJob('relative'), /verification failed/);
});
test('UT app preserves unknown ownership lock without starting a run', async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, '.owner.lock'), 'operator-owned\n');
    await assert.rejects(runUtChildcareAppJob({outputRoot: root}), /failed/);
    assert.equal(await readFile(path.join(root, '.owner.lock'), 'utf8'), 'operator-owned\n');
    assert.deepEqual(await readdir(root), ['.owner.lock']);
  } finally { await rm(root, {recursive: true, force: true}); }
});
test('UT app CLI help is offline and malformed arguments fail redacted', () => {
  const script = path.join(APP_ROOT, 'scripts/build-ut-childcare-app.mjs');
  const help = spawnSync(process.execPath, [script, '--help'], {cwd: APP_ROOT, encoding: 'utf8', windowsHide: true});
  assert.equal(help.status, 0); assert.match(help.stdout, /no downloads/);
  for (const args of [['--output'], ['--secret', 'private-value'], ['--output', 'x', '--output', 'y']]) {
    const result = spawnSync(process.execPath, [script, ...args], {cwd: APP_ROOT, encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 1); assert.ok(!result.stderr.includes('private-value'));
  }
});
test('UT retained app adoption verifies semantic source without rewriting it and rejects receipt tamper', {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
  const root = await temp(), originalFetch = globalThis.fetch;
  const retained = path.join(APP_ROOT, 'data/business-sources/ut-childcare/normalized/6aaca68b-f0cc-4ada-a301-0ada860574b8');
  const before = new Map();
  for (const file of ['manifest.json', 'normalized.jsonl', 'summary.json']) before.set(file, hash(await readFile(path.join(retained, file))));
  globalThis.fetch = () => { throw Error('Network forbidden'); };
  try {
    const result = await runUtChildcareAppJob({outputRoot: root, industryRunId: 'test-ut-industry'});
    assert.equal(result.receipt.status, 'SUCCEEDED'); assert.equal(result.receipt.normalized.summary.accepted_records, 422);
    assert.equal(result.receipt.normalized.claims.app_enrolled, false);
    assert.equal(result.receipt.claims.normalization_rebuilt, false);
    assert.equal(result.receipt.industry_run_id, 'test-ut-industry');
    assert.equal((await verifyUtChildcareAppJob(result.receiptPath)).receipt_sha256, result.receipt_sha256);
    assert.deepEqual(await readdir(root), ['jobs']);
    const tamper = {...result.receipt, claims: {...result.receipt.claims, current_operations_verified: true}};
    await writeFile(result.receiptPath, JSON.stringify(tamper) + '\n');
    await assert.rejects(verifyUtChildcareAppJob(result.receiptPath), /verification failed/);
    for (const [file, expected] of before) assert.equal(hash(await readFile(path.join(retained, file))), expected);
  } finally { globalThis.fetch = originalFetch; await rm(root, {recursive: true, force: true}); }
});
test('UT app cancels active replay, persists redacted failure and releases only owned lock', {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
  const root = await temp(), controller = new AbortController();
  const running = runUtChildcareAppJob({outputRoot: root, signal: controller.signal});
  // Attach a handler immediately, even if readiness polling fails first.
  const outcome = running.then(value => ({value}), error => ({error}));
  try {
    const deadline = performance.now() + 15000;
    let ready = false;
    while (performance.now() < deadline && !ready) {
      const jobs = await readdir(path.join(root, 'jobs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const job of jobs) {
        ready = await readFile(path.join(root, 'jobs', job, 'start.json'), 'utf8').then(raw => JSON.parse(raw).schema_version === 'ut-childcare-app@1.0.0',
          error => { if (error.code === 'ENOENT') return false; throw error; });
        if (ready) break;
      }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(ready, 'durable app start must exist before cancellation');
    controller.abort(Error('private cancellation reason'));
    assert.match((await outcome).error?.message ?? '', /cancelled/);
    const jobs = await readdir(path.join(root, 'jobs')); assert.equal(jobs.length, 1);
    const raw = await readFile(path.join(root, 'jobs', jobs[0], 'receipt.json'), 'utf8');
    assert.equal(JSON.parse(raw).status, 'CANCELLED'); assert.ok(!raw.includes('private cancellation'));
    assert.deepEqual(await readdir(root), ['jobs']);
  } finally { controller.abort(); await outcome; await rm(root, {recursive: true, force: true}); }
});
