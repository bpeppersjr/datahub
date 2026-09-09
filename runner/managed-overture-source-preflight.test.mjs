import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';
import { probeOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { getSourcePrerequisiteGates } from './source-acquisition-gates.mjs';

const BASE = path.join(APP_ROOT, 'data/managed-overture-metadata-tests');
const sourceId = 'overture-source-preflight';
async function workspace() { await mkdir(BASE, { recursive: true }); return mkdtemp(path.join(BASE, 'operation-')); }
async function cleanup(root, ...managers) {
  for (const manager of managers) await manager?.close();
  assert.equal(path.dirname(path.resolve(root)), BASE);
  assert.match(path.basename(root), /^operation-/);
  await rm(root, { recursive: true, force: true });
}
async function terminal(manager, op) { await manager.running.get(op.id)?.done; return manager.get(op.id); }
async function fixture(args, nativeShape = true) {
  const release = '2026-08-19.0', base = `https://stac.overturemaps.org/${release}/places/place`;
  const responses = new Map([
    ['https://stac.overturemaps.org/catalog.json', { type: 'Catalog', stac_version: '1.1.0', links: [{ rel: 'child', latest: true, href: `https://stac.overturemaps.org/${release}/catalog.json` }] }],
    [`${base}/collection.json`, { type: 'Collection', id: 'place', stac_version: '1.1.0', links: [{ rel: 'item', href: `${base}/00000/00000.json` }] }],
    [`${base}/00000/00000.json`, { type: 'Feature', id: '00000', properties: { num_rows: 1, num_row_groups: 1, datetime: '2026-08-19T00:00:00Z' }, assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet` } } }],
  ]);
  const descriptor = await probeOvertureSourcePreflightForTest({ output: args[1], operationId: args[3], limits: { minIntervalMs: 0 },
    fetchImpl: async url => { assert.ok(responses.has(url)); return new Response(JSON.stringify(responses.get(url))); } });
  if (!nativeShape) return descriptor;
  // Fabricated native-shaped metadata tests structural verification only, not network acquisition.
  const manifest = JSON.parse(await readFile(descriptor.manifest, 'utf8'));
  manifest.execution_mode = 'native-metadata-only';
  const raw = JSON.stringify(manifest); await writeFile(descriptor.manifest, raw);
  return { ...descriptor, sha256: createHash('sha256').update(raw).digest('hex') };
}

test('metadata prerequisite gate never authorizes collection and rejects expanded inputs', async () => {
  const gate = getSourcePrerequisiteGates().find(g => g.sourceId === sourceId);
  assert.equal(gate.collectionReady, false); assert.equal(gate.metadataPrerequisiteImplemented, true);
  const root = await workspace(); let manager;
  try {
    manager = new ManagedOperations({ root, executor: () => assert.fail('invalid input executed') });
    for (const input of [{ sourceId, url: 'https://invalid.example' }, { sourceId, requestedRelease: '2026-08-19.0' }, { sourceId, force: true }]) await assert.rejects(manager.startSourcePrerequisite(input));
    assert.equal(manager.operations.size, 0);
  } finally { await cleanup(root, manager); }
});

test('metadata fixed app dispatch, structural replay, internal artifacts and restart without repull', async () => {
  const root = await workspace(); let manager, reloaded;
  try {
    manager = new ManagedOperations({ root, executor: async ({ script, args, kind }) => {
      assert.equal(script, 'scripts/probe-overture-source-preflight.mjs'); assert.equal(kind, 'source-prerequisite');
      assert.equal(args.length, 4); assert.equal(args[0], '--output'); assert.equal(args[2], '--operation-id');
      assert.equal(args[1], path.join(root, args[3], 'output'));
      return { code: 0, stdout: JSON.stringify(await fixture(args)) };
    } });
    const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
    assert.equal(done.status, 'SUCCEEDED'); assert.equal(done.result.metadataReady, true);
    assert.equal(done.result.receiptIntegrityVerified, true); assert.equal(done.result.acquisitionReady, false);
    assert.deepEqual(done.artifacts, []); assert.equal(await manager.artifact(done.id, 'manifest.json'), null);
    await manager.close();
    reloaded = new ManagedOperations({ root, executor: () => assert.fail('restart must not redownload') });
    assert.deepEqual((await reloaded.get(done.id)).result, done.result);
  } finally { await cleanup(root, manager, reloaded); }
});

test('metadata malformed, injected, failed, cancelled and recovery evidence cannot advertise readiness', async () => {
  const root = await workspace(); let manager;
  try {
    for (const mode of ['malformed', 'injected', 'failed', 'late-cancel', 'recovery', 'wrong-binding']) {
      manager = new ManagedOperations({ root, executor: async ({ args }) => {
        const d = await fixture(args, mode !== 'injected');
        if (mode === 'late-cancel') d.cancellation_after_publication = true;
        if (mode === 'wrong-binding') d.operation_id = randomUUID();
        return { code: mode === 'failed' ? 1 : 0, stdout: mode === 'malformed' ? 'PRIVATE_ERROR' : JSON.stringify(mode === 'recovery' ? { recovery: d } : d) };
      } });
      const done = await terminal(manager, await manager.startSourcePrerequisite({ sourceId }));
      assert.equal(done.status, 'FAILED', mode); assert.equal(done.result.metadataReady, false, mode);
      assert.equal(done.result.acquisitionReady, false); assert.equal(done.result.inspectionRequired, true);
      assert.deepEqual(done.artifacts, []); assert.doesNotMatch(JSON.stringify(done), /PRIVATE_ERROR/);
      await manager.close();
    }
  } finally { await cleanup(root, manager); }
});

test('metadata occupies shared prerequisite slot; cancellation retains evidence without readiness', async () => {
  const root = await workspace(); let manager, release, entered;
  const blocked = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
  try {
    manager = new ManagedOperations({ root, executor: async ({ args, signal }) => {
      const descriptor = await fixture(args); entered(); await blocked; assert.equal(signal.aborted, true);
      return { code: 0, stdout: JSON.stringify(descriptor) };
    } });
    const op = await manager.startSourcePrerequisite({ sourceId }); await ready;
    await assert.rejects(manager.startSourcePrerequisite({ sourceId: 'overture-httpfs-runtime' }), /already running/);
    await manager.cancel(op.id); release();
    const done = await terminal(manager, op);
    assert.equal(done.status, 'CANCELLED'); assert.equal(done.result.metadataReady, false);
    assert.equal(done.result.receiptIntegrityVerified, true); assert.equal(done.result.inspectionRequired, true);
  } finally { release(); await cleanup(root, manager); }
});
