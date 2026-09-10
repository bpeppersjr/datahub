import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';

async function fixture(t) {
  const parent = path.join(APP_ROOT, 'data/tmp/managed-overture-normalization-tests'), root = path.join(parent, randomUUID());
  await mkdir(root, { recursive: true });
  const managers = [];
  t.after(async () => { for (const m of managers) await m.close(); assert.equal(path.dirname(root), parent); await rm(root, { recursive: true, force: true }); });
  return { root, manager() { const m = new ManagedOperations({ root, executor: () => assert.fail('no child should execute') }); managers.push(m); return m; } };
}
const input = () => ({ acquisitionOperationId: randomUUID(), baselineReleaseId: 'census-zbp-fixture', baselineSha256: 'a'.repeat(64) });

test('normalization admission rejects overrides, accessors, escaping release IDs and non-native stores without allocation', async t => {
  const f = await fixture(t), m = f.manager(); await m.ready;
  for (const value of [undefined, {}, { ...input(), sourceFile: 'private' }, { ...input(), baselineReleaseId: '../escape' },
    { ...input(), baselineSha256: 'invalid' }, { ...input(), acquisitionOperationId: 'invalid' },
    { ...input(), get baselineSha256() { assert.fail('accessor executed'); } }]) {
    await assert.rejects(m.startOvertureNormalization(value), /requires/);
  }
  await assert.rejects(m.startOvertureNormalization(input()), /native operation store/);
  assert.equal(m.running.size, 0); assert.deepEqual(await readdir(f.root), []);
});

test('missing native acquisition rejects before output allocation and releases admission reservation', async t => {
  const f = await fixture(t), m = f.manager(); await m.ready;
  const original = m.root;
  // Only a read of an absent UUID under the fixed native store; no production receipt is changed.
  m.root = path.join(APP_ROOT, 'data/managed-operations');
  try {
    await assert.rejects(m.startOvertureNormalization(input()), /retained inputs are missing/);
    assert.equal(m.reserved, false); assert.equal(m.operations.size, 0); assert.equal(m.running.size, 0);
  } finally { m.root = original; }
  assert.deepEqual(await readdir(f.root), []);
});

test('normalization history never retries unresolved work or exposes private artifacts/readiness', async t => {
  const f = await fixture(t);
  for (const status of ['RUNNING', 'FAILED', 'CANCELLED']) {
    const id = randomUUID(); await mkdir(path.join(f.root, id));
    await writeFile(path.join(f.root, id, 'receipt.json'), JSON.stringify({ id, kind: 'source-normalization', status,
      createdAt: new Date().toISOString(), owner: {}, details: { sourceId: 'overture-us-places' },
      result: { normalizationReady: true, inspectionRequired: false }, artifacts: [{ name: 'private.jsonl', bytes: 1 }] }));
  }
  const m = f.manager();
  const records = await m.list(); assert.equal(records.length, 3);
  for (const record of records) {
    assert.ok(['UNKNOWN', 'FAILED', 'CANCELLED'].includes(record.status));
    assert.equal(record.result.normalizationReady, false); assert.equal(record.result.inspectionRequired, true);
    assert.deepEqual(record.artifacts, []); assert.equal(await m.artifact(record.id, 'private.jsonl'), null);
  }
  assert.equal(m.running.size, 0);
});

test('normalization child CLI documents local-only behavior and rejects malformed or expanded arguments', () => {
  const script = path.join(APP_ROOT, 'scripts/run-overture-normalization-session.mjs');
  const run = args => spawnSync(process.execPath, [script, ...args], { cwd: APP_ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });
  const help = run(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /No downloads, automatic retries or promotion/);
  for (const args of [[], ['--publish'], ['--output', 'private'], Array(6).fill(['--output', 'private']).flat()]) {
    const result = run(args); assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Invalid retained Overture normalization arguments.');
  }
});
