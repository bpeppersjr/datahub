import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C } from './overture-httpfs-runtime.mjs';

const BASE = path.join(APP_ROOT, 'data/managed-overture-tests');
const sourceId = 'overture-httpfs-runtime';
async function workspace() { await mkdir(BASE, { recursive: true }); return mkdtemp(path.join(BASE, 'operation-')); }
async function cleanup(root, ...managers) {
  for (const manager of managers) await manager?.close();
  assert.equal(path.dirname(path.resolve(root)), BASE);
  assert.match(path.basename(root), /^operation-/);
  await rm(root, { recursive: true, force: true });
}
async function terminal(manager, operation) { await manager.running.get(operation.id)?.done; return manager.get(operation.id); }
function missingDescriptor(args) {
  const run = randomUUID();
  return { run_id: run, manifest: path.join(args[1], 'jobs', run, 'manifest.json'), sha256: 'a'.repeat(64),
    status: 'runtime-verified-no-place-acquisition', cancellation_after_publication: false, operation_id: args[3] };
}
// Deliberately fabricated native-shaped artifacts prove only manager/reader structural bookkeeping.
// These bytes are not an extension and are never loaded, installed or fetched.
async function fixture(args) {
  const descriptor = missingDescriptor(args), directory = path.dirname(descriptor.manifest);
  await mkdir(directory, { recursive: true });
  for (const name of ['extensions', 'home', 'spill']) await mkdir(path.join(directory, name));
  const digest = value => createHash('sha256').update(value).digest('hex');
  const artifacts = [];
  for (const name of ['httpfs.duckdb_extension.gz', 'httpfs.duckdb_extension']) {
    const bytes = Buffer.from(`FABRICATED STRUCTURAL TEST ONLY: ${name}`);
    await writeFile(path.join(directory, name), bytes);
    artifacts.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
  }
  const now = new Date().toISOString();
  const manifest = { schema_version: C.version, run_id: descriptor.run_id, operation_id: descriptor.operation_id,
    execution_mode: 'native-core-signature-checked-local-load', status: C.status,
    started_at: now, completed_at: now, source_url: C.url, package_version: C.package_version,
    engine_version: C.engine_version, platform: C.platform, artifacts,
    claims: { acquisitionReady: false, place_acquisition_performed: false, public_export_authorized: false,
      hard_process_deadline_enforced: false, engine_memory_is_process_ram_cap: false } };
  const raw = JSON.stringify(manifest); await writeFile(descriptor.manifest, raw);
  return { ...descriptor, sha256: digest(raw) };
}

test('Overture prerequisite rejects caller expansion before operation allocation', async () => {
  const root = await workspace(); let manager, calls = 0;
  try {
    manager = new ManagedOperations({ root, executor: () => { calls++; assert.fail('invalid input reached executor'); } });
    await manager.ready;
    const getter = {}; Object.defineProperty(getter, 'sourceId', { get() { assert.fail('input getter executed'); } });
    for (const input of [null, [], {}, getter, Object.create({ sourceId }), { sourceId: 'unknown' },
      { sourceId, url: 'https://invalid.example/private' }, { sourceId, output: root },
      { sourceId, operationId: randomUUID() }, { sourceId, force: true },
      Object.assign({ sourceId }, { [Symbol('extra')]: true })]) {
      await assert.rejects(manager.startSourcePrerequisite(input));
      assert.equal(manager.operations.size, 0);
      assert.equal(manager.running.size, 0);
      assert.deepEqual(await readdir(root), []);
    }
    assert.equal(calls, 0);
  } finally { await cleanup(root, manager); }
});

test('Overture dispatch uses fixed managed script and rejects fake successful child output', async () => {
  const root = await workspace(); let manager, calls = 0;
  try {
    manager = new ManagedOperations({ root, executor: async ({ script, args, kind }) => {
      calls++;
      assert.equal(kind, 'source-prerequisite');
      assert.equal(script, 'scripts/prepare-overture-httpfs-runtime.mjs');
      assert.equal(args.length, 4); assert.equal(args[0], '--output'); assert.equal(args[2], '--operation-id');
      assert.equal(args[1], path.join(root, args[3], 'output'));
      return { code: 0, stdout: JSON.stringify({ status: 'SUCCEEDED', private: 'DO_NOT_PUBLISH' }) };
    } });
    const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
    assert.equal(calls, 1); assert.equal(done.status, 'FAILED');
    assert.equal(done.result.inspectionRequired, true);
    assert.deepEqual(done.artifacts, []);
    assert.equal(await manager.artifact(done.id, 'manifest.json'), null);
    assert.doesNotMatch(JSON.stringify(done), /DO_NOT_PUBLISH/);
  } finally { await cleanup(root, manager); }
});

test('Overture runtime dispatch shares one slot and cancellation cannot become success', async () => {
  const root = await workspace(); let manager, release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  try {
    manager = new ManagedOperations({ root, executor: async ({ signal, args }) => {
      const descriptor = await fixture(args);
      entered(); await gate; assert.equal(signal.aborted, true);
      return { code: 0, stdout: JSON.stringify(descriptor) };
    } });
    const op = await manager.startSourcePrerequisite({ sourceId }); await ready;
    await assert.rejects(manager.startSourcePrerequisite({ sourceId }), /already running/);
    await assert.rejects(manager.startSourcePrerequisite({ sourceId: 'ok-childcare-schema' }), /already running/);
    await manager.cancel(op.id); release();
    const done = await terminal(manager, op);
    assert.equal(done.status, 'CANCELLED'); assert.equal(done.result.inspectionRequired, true);
    assert.ok(done.result.prerequisite); assert.equal(done.result.receiptIntegrityVerified, true);
    assert.equal(done.result.runtimeReady, false); assert.equal(done.result.acquisitionReady, false);
    assert.deepEqual(done.artifacts, []);
  } finally { release(); await cleanup(root, manager); }
});

test('Overture structurally valid fabricated runtime is verified and clean receipt survives restart', async () => {
  const root = await workspace(); let manager, reloaded;
  try {
    manager = new ManagedOperations({ root, executor: async ({ args }) => ({ code: 0, stdout: JSON.stringify(await fixture(args)) }) });
    const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
    assert.equal(done.status, 'SUCCEEDED'); assert.equal(done.result.receiptIntegrityVerified, true);
    assert.equal(done.result.runtimeReady, true); assert.equal(done.result.acquisitionReady, false);
    assert.equal(done.result.inspectionRequired, false); assert.deepEqual(done.artifacts, []);
    assert.equal(await manager.artifact(done.id, 'httpfs.duckdb_extension'), null);
    await manager.close();
    reloaded = new ManagedOperations({ root, executor: () => assert.fail('completed runtime must not redownload') });
    const retained = await reloaded.get(done.id);
    assert.equal(retained.status, 'SUCCEEDED'); assert.deepEqual(retained.result, done.result);
    assert.deepEqual(retained.artifacts, []);
  } finally { await cleanup(root, manager, reloaded); }
});

test('Overture valid receipt with child failure, late cancellation or recovery never advertises ready', async () => {
  const root = await workspace(); let manager;
  try {
    for (const mode of ['nonzero', 'late-cancellation', 'recovery']) {
      manager = new ManagedOperations({ root, executor: async ({ args }) => {
        const descriptor = await fixture(args);
        if (mode === 'late-cancellation') descriptor.cancellation_after_publication = true;
        return { code: mode === 'nonzero' ? 1 : 0, stdout: JSON.stringify(mode === 'recovery' ? { recovery: descriptor } : descriptor) };
      } });
      const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
      assert.equal(done.status, 'FAILED', mode); assert.equal(done.result.receiptIntegrityVerified, true);
      assert.equal(done.result.inspectionRequired, true); assert.equal(done.result.runtimeReady, false);
      assert.equal(done.result.acquisitionReady, false); assert.ok(done.result.prerequisite);
      assert.deepEqual(done.artifacts, []); await manager.close();
    }
  } finally { await cleanup(root, manager); }
});

test('Overture interrupted managed ownership becomes UNKNOWN without automatic retry or artifacts', async () => {
  const root = await workspace(), id = randomUUID(); let manager;
  try {
    await mkdir(path.join(root, id));
    await writeFile(path.join(root, id, 'receipt.json'), JSON.stringify({
      id, kind: 'source-prerequisite', status: 'RUNNING', createdAt: new Date().toISOString(), owner: {},
      details: { sourceId }, result: {}, artifacts: [{ name: 'private.extension', bytes: 1 }],
    }));
    manager = new ManagedOperations({ root, executor: () => assert.fail('restart must not retry runtime download') });
    const interrupted = await manager.get(id);
    assert.equal(interrupted.status, 'UNKNOWN'); assert.equal(manager.running.size, 0);
    assert.deepEqual(interrupted.artifacts, []); assert.equal(await manager.artifact(id, 'private.extension'), null);
    await assert.rejects(manager.startSourcePrerequisite({ sourceId }), /unresolved ownership/);
  } finally { await cleanup(root, manager); }
});

test('Overture valid-shaped missing and recovery manifests remain inspection references, never ready', async () => {
  const root = await workspace(); let manager;
  try {
    for (const recovery of [false, true]) {
      let descriptor;
      manager = new ManagedOperations({ root, executor: async ({ args }) => {
        descriptor = missingDescriptor(args);
        return { code: recovery ? 1 : 0, stdout: JSON.stringify(recovery ? { recovery: descriptor } : descriptor) };
      } });
      const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
      assert.equal(done.status, 'FAILED');
      assert.deepEqual(done.result.prerequisite, descriptor);
      assert.equal(done.result.receiptIntegrityVerified, false);
      assert.equal(done.result.inspectionRequired, true);
      assert.equal(done.result.runtimeReady, false); assert.equal(done.result.acquisitionReady, false);
      assert.deepEqual(done.artifacts, []);
      await manager.close();
    }
  } finally { await cleanup(root, manager); }
});

test('Overture malformed recovery or wrong operation binding cannot become trusted references', async () => {
  const root = await workspace(); let manager;
  try {
    for (const mutate of [d => ({ ...d, operation_id: randomUUID() }), d => ({ ...d, manifest: path.join(root, 'escape.json') }),
      d => ({ ...d, extra: 'DO_NOT_PUBLISH' }), d => ({ ...d, sha256: 'bad' })]) {
      manager = new ManagedOperations({ root, executor: async ({ args }) => ({ code: 0,
        stdout: JSON.stringify({ recovery: mutate(missingDescriptor(args)) }) }) });
      const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
      assert.equal(done.status, 'FAILED'); assert.equal(done.result.inspectionRequired, true);
      assert.equal(done.result.prerequisite, undefined);
      assert.doesNotMatch(JSON.stringify(done), /DO_NOT_PUBLISH/);
      await manager.close();
    }
  } finally { await cleanup(root, manager); }
});
