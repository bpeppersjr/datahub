import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';
import { buildOkRetainedSearchWithTestTransport } from './ok-childcare-retained-bundle.mjs';
import { okRetainedSyntheticClient } from './ok-childcare-retained-fetch.mjs';
import { OK_RETAINED_CONTRACT as C, okRetainedHash as hash } from './ok-childcare-retained-contract.mjs';
const base = path.join(APP_ROOT, 'data/managed-ok-retained-tests');
async function workspace() { await mkdir(base, { recursive: true }); return mkdtemp(path.join(base, 'case-')); }
async function cleanup(root, manager) { await manager?.close(); assert.equal(path.dirname(root), base); await rm(root, { recursive: true, force: true }); }
const terminal = async (manager, op) => { await manager.running.get(op.id)?.done; return manager.get(op.id); };

// Fabricated native-shaped artifacts exercise the structural reader only.
// They are not evidence of native acquisition and never touch real operations.
async function fixture(args, mutate = () => {}) {
  const d = await buildOkRetainedSearchWithTestTransport(async url => new Response(url === C.client_url
    ? okRetainedSyntheticClient() : `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/providers',
      query: { 'zip-code': '73102', 'facility-type': 'childcare-center' }, props: { pageProps: { childcareProviders: [{ facilityType: 'childcare-center', name: 'Synthetic fixture' }] } } })}</script>`,
  { headers: { 'content-type': 'text/html' } }));
  const output = args[1], operationId = args[3], run = randomUUID(), directory = path.join(output, 'jobs', run);
  await mkdir(directory, { recursive: true });
  const sourceDirectory = path.dirname(d.manifest), m = JSON.parse(await readFile(d.manifest, 'utf8'));
  for (const name of ['selected.jsonl', 'candidates.jsonl']) await copyFile(path.join(sourceDirectory, name), path.join(directory, name));
  const intent = JSON.parse(await readFile(path.join(sourceDirectory, 'intent.json'), 'utf8'));
  Object.assign(intent, { run_id: run, operation_id: operationId, mode: 'native-fetch' });
  const rawIntent = Buffer.from(`${JSON.stringify(intent)}\n`); await writeFile(path.join(directory, 'intent.json'), rawIntent);
  Object.assign(m, { run_id: run, operation_id: operationId, mode: 'native-fetch' });
  Object.assign(m.artifacts[0], { bytes: rawIntent.length, sha256: hash(rawIntent) });
  for (const index of [0, 2]) Object.assign(m.requests[index], { decoded_bytes: C.client_bytes, decoded_sha256: C.client_sha256 });
  mutate(m); const raw = Buffer.from(`${JSON.stringify(m)}\n`), manifest = path.join(directory, 'manifest.json');
  await writeFile(manifest, raw);
  return { run_id: run, operation_id: operationId, manifest, sha256: hash(raw), status: m.status, cancellation_after_publication: false };
}
test('OK managed collection uses a fixed worker, replays private artifacts and preserves completed history on restart', async () => {
  const root = await workspace(); let manager;
  try {
    manager = new ManagedOperations({ root, executor: async ({ script, args, kind }) => {
      assert.equal(script, 'scripts/collect-ok-childcare-retained.mjs'); assert.equal(kind, 'source-acquisition');
      return { code: 0, stdout: JSON.stringify(await fixture(args)) };
    } });
    const done = await terminal(manager, await manager.startOkRetainedCollection({}));
    assert.equal(done.status, 'SUCCEEDED'); assert.equal(done.result.sourceCandidateRows, 1);
    assert.equal(done.result.receiptIntegrityVerified, true); assert.equal(done.result.currentOperationsVerified, false);
    assert.deepEqual(done.artifacts, []); assert.equal(await manager.artifact(done.id, 'selected.jsonl'), null);
    await manager.close();
    manager = new ManagedOperations({ root, executor: () => { throw Error('Must not restart collection'); } });
    assert.equal((await manager.get(done.id)).status, 'SUCCEEDED');
  } finally { await cleanup(root, manager); }
});
test('OK managed collection rejects options, synthetic manifests, unbound descriptors and nonzero exits', async () => {
  for (const mode of ['options', 'synthetic', 'binding', 'exit']) {
    const root = await workspace(); let manager;
    try {
      manager = new ManagedOperations({ root, executor: async ({ args }) => {
        const d = await fixture(args, m => { if (mode === 'synthetic') m.mode = 'synthetic-test-transport'; });
        if (mode === 'binding') d.operation_id = randomUUID();
        return { code: mode === 'exit' ? 1 : 0, stdout: JSON.stringify(d) };
      } });
      if (mode === 'options') await assert.rejects(manager.startOkRetainedCollection({ zip5: 'PRIVATE' }));
      else { const done = await terminal(manager, await manager.startOkRetainedCollection());
        assert.equal(done.status, 'FAILED'); assert.equal(done.result.snapshotReady, false); }
    } finally { await cleanup(root, manager); }
  }
});
test('OK managed cancellation prevents overlap and retains committed output for inspection', async () => {
  const root = await workspace(); let manager, release, entered;
  const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
  try {
    manager = new ManagedOperations({ root, executor: async ({ args }) => {
      const d = await fixture(args); entered(); await gate; return { code: 0, stdout: JSON.stringify(d) };
    } });
    const operation = await manager.startOkRetainedCollection(); await ready;
    await assert.rejects(manager.startOkRetainedCollection(), /already running/);
    await manager.cancel(operation.id); release();
    const done = await terminal(manager, operation); assert.equal(done.status, 'CANCELLED');
    assert.equal(done.result.snapshotReady, false); assert.ok(done.result.retained); assert.equal(done.result.inspectionRequired, true);
  } finally { release(); await cleanup(root, manager); }
});
