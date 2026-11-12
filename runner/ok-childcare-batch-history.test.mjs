import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';

const execute = promisify(execFile);
const approvalId = '78ec4fe1-dac0-40e9-aac7-e5672f67f7fe';
const operationId = 'c12cb298-a6be-4493-811b-0196d7905488';
const batch = `data/business-sources/ok-childcare/approved-zip-batches/${approvalId}`;
const journal = ['plan.json', '66778.intent.json', '66778.result.json'].map(name => `${batch}/${name}`);
const dispatch = `data/industry-segments/runs/${operationId}/state-ok-childcare-spatial-batch-OK/intent.json`;
const terminal = `data/managed-operations/${operationId}/receipt.json`;
const baseline = 'data/managed-operations/a5f5ca7d-89b7-450a-9278-3430b436aff6/output/jobs/4acdd407-ae61-43fb-ba66-6464f3a5a2a4';
const files = [...journal, dispatch, terminal, ...['manifest.json', 'intent.json', 'selected.jsonl', 'candidates.jsonl'].map(name => `${baseline}/${name}`)];

async function fixture(t) {
  try {
    await access(path.join(APP_ROOT, journal[0]));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Operator-retained September 10 journal is absent.');
    return null;
  }
  const parent = path.join(APP_ROOT, 'data', 'tmp');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'ok-childcare-batch-history-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.match(path.basename(root), /^ok-childcare-batch-history-[\w-]+$/);
    await rm(root, { recursive: true, force: true });
  });
  for (const name of files) {
    const destination = path.join(root, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(APP_ROOT, name), destination);
  }
  return root;
}

async function inspect(root, outputRoot = path.join(root, batch), showOperation = false) {
  const script = `
    import { inspectOkChildcareBatchStatus } from './runner/ok-childcare-batch-status.mjs';
    globalThis.fetch = async () => { process.exit(98); };
    const status = await inspectOkChildcareBatchStatus(process.argv[1]);
    let operation = null;
    if (process.argv[2]) {
      const { ManagedOperations } = await import('./runner/managed-operations.mjs');
      const manager = new ManagedOperations();
      try { operation = await manager.get(process.argv[2]); }
      finally { await manager.close(); }
    }
    console.log(JSON.stringify({status, operation}));
  `;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', script, outputRoot, ...(showOperation ? [operationId] : [])], {
    cwd: APP_ROOT, env: { ...process.env, DATAHUB_ROOT: root }, windowsHide: true, timeout: 15000,
  });
  return JSON.parse(stdout);
}

test('historical inspection binds the terminal app operation to the original approved query journal', async t => {
  const root = await fixture(t);
  if (!root) return;
  const { status, operation } = await inspect(root, undefined, true);
  assert.equal(status.available, true);
  assert.equal(status.verification_mode, 'historical-digest-pinned-retained-inspector');
  assert.equal(status.status, 'inspection-required');
  assert.equal(status.plan_sha256, 'e92b31b9dc94ff2a3ebbdbdab60afbc9e4e84637ff7f916400427a279beaf122');
  assert.equal(status.failure_http_status, 502);
  assert.equal(status.rejected_zip5, '66778');
  assert.equal(status.planned_new_queries, 666);
  assert.equal(status.terminal_queries, 1);
  assert.equal(status.rejected_queries, 1);
  assert.equal(status.accepted_queries, 0);
  assert.equal(status.never_issued_queries, 665);
  assert.equal(status.unresolved_intent_queries, 0);
  assert.equal(status.reused_baseline_queries, 1);
  assert.equal(status.reused_baseline_source_rows, 4);
  assert.equal(status.public_export_authorized, false);
  assert.equal(status.automatic_retry_authorized, false);
  assert.equal(status.statewide_completeness, 'unknown');
  assert.equal(status.unique_business_count, null);
  assert.equal(operation.status, 'FAILED');
  assert.deepEqual(operation.result.okChildcareBatch, status);
  assert.deepEqual(operation.artifacts, []);
  assert.doesNotMatch(JSON.stringify(operation.result.okChildcareBatch), /https?:|batch_root|selected\.jsonl|candidates\.jsonl/);
});

test('historical status rejects altered bytes, missing approval binding, unexpected journal entries and alternate roots', async t => {
  const root = await fixture(t);
  if (!root) return;
  for (const file of [...journal, dispatch, terminal, `${baseline}/selected.jsonl`]) {
    const destination = path.join(root, file);
    await writeFile(destination, ' ' , { flag: 'a' });
    assert.equal((await inspect(root)).status.available, false, file);
    await copyFile(path.join(APP_ROOT, file), destination);
  }
  await rename(path.join(root, dispatch), path.join(root, `${dispatch}.missing`));
  assert.equal((await inspect(root)).status.available, false);
  await rename(path.join(root, `${dispatch}.missing`), path.join(root, dispatch));
  await writeFile(path.join(root, batch, '71937.intent.json'), '{}');
  assert.equal((await inspect(root)).status.available, false);
  await rm(path.join(root, batch, '71937.intent.json'));
  const alternate = path.join(root, batch + '-other');
  await rename(path.join(root, batch), alternate);
  assert.equal((await inspect(root, alternate)).status.available, false);
});
