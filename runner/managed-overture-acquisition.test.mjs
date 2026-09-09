import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C } from './overture-httpfs-runtime.mjs';
import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION as authorization } from './overture-us-places.mjs';
import { probeOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { OVERTURE_SELECTED_FIELDS, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';

const BASE = path.join(APP_ROOT, 'data/managed-overture-acquisition-tests');
const digest = value => createHash('sha256').update(value).digest('hex');
async function workspace() { await mkdir(BASE, { recursive: true }); return mkdtemp(path.join(BASE, 'operation-')); }
async function cleanup(root, ...managers) {
  for (const manager of managers) await manager?.close();
  assert.equal(path.dirname(path.resolve(root)), BASE); assert.match(path.basename(root), /^operation-/);
  await rm(root, { recursive: true, force: true });
}
async function terminal(manager, op) { await manager.running.get(op.id)?.done; return manager.get(op.id); }
// All prerequisite fixtures below are fabricated native-shaped structural evidence.
// No extension is loaded, no remote request occurs, and no acquisition executor is native.
async function prerequisites(root) {
  const refs = {};
  for (const metadata of [true, false]) {
    const operationId = randomUUID(), output = path.join(root, operationId, 'output'), startedAt = new Date().toISOString();
    const sourceId = metadata ? 'overture-source-preflight' : 'overture-httpfs-runtime';
    let descriptor;
    if (metadata) {
      const release = '2026-08-19.0', base = `https://stac.overturemaps.org/${release}/places/place`;
      const responses = new Map([
        ['https://stac.overturemaps.org/catalog.json', { type: 'Catalog', stac_version: '1.1.0', links: [{ rel: 'child', latest: true, href: `https://stac.overturemaps.org/${release}/catalog.json` }] }],
        [`${base}/collection.json`, { type: 'Collection', id: 'place', stac_version: '1.1.0', links: [{ rel: 'item', href: `${base}/00000/00000.json` }] }],
        [`${base}/00000/00000.json`, { type: 'Feature', id: '00000', properties: { num_rows: 1, num_row_groups: 1 }, assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet` } } }],
      ]);
      descriptor = await probeOvertureSourcePreflightForTest({ output, operationId, limits: { minIntervalMs: 0 }, fetchImpl: async url => {
        assert.ok(responses.has(url)); return new Response(JSON.stringify(responses.get(url)));
      } });
      const manifest = JSON.parse(await readFile(descriptor.manifest, 'utf8')); manifest.execution_mode = 'native-metadata-only';
      const raw = JSON.stringify(manifest); await writeFile(descriptor.manifest, raw); descriptor.sha256 = digest(raw);
    } else {
      const run = randomUUID(), directory = path.join(output, 'jobs', run); await mkdir(directory, { recursive: true });
      for (const name of ['extensions', 'home', 'spill']) await mkdir(path.join(directory, name));
      const artifacts = [];
      for (const name of ['httpfs.duckdb_extension.gz', 'httpfs.duckdb_extension']) {
        const bytes = Buffer.from(`FABRICATED STRUCTURAL ONLY ${name}`); await writeFile(path.join(directory, name), bytes);
        artifacts.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
      }
      const now = new Date().toISOString();
      const raw = JSON.stringify({ schema_version: C.version, run_id: run, operation_id: operationId,
        execution_mode: 'native-core-signature-checked-local-load', status: C.status, started_at: now, completed_at: now,
        source_url: C.url, package_version: C.package_version, engine_version: C.engine_version, platform: C.platform, artifacts,
        claims: { acquisitionReady: false, place_acquisition_performed: false, public_export_authorized: false, hard_process_deadline_enforced: false, engine_memory_is_process_ram_cap: false } });
      const manifest = path.join(directory, 'manifest.json'); await writeFile(manifest, raw);
      descriptor = { run_id: run, operation_id: operationId, manifest, sha256: digest(raw), status: C.status, cancellation_after_publication: false };
    }
    const receipt = { id: operationId, kind: 'source-prerequisite', status: 'SUCCEEDED', createdAt: startedAt, startedAt,
      details: { sourceId }, result: { sourceId, prerequisite: descriptor, receiptIntegrityVerified: true, inspectionRequired: false,
        acquisitionReady: false, [metadata ? 'metadataReady' : 'runtimeReady']: true } };
    await writeFile(path.join(root, operationId, 'receipt.json'), JSON.stringify(receipt));
    refs[metadata ? 'metadataOperationId' : 'runtimeOperationId'] = operationId;
  }
  return { ...refs, authorization };
}
function missing(args) {
  const run = randomUUID(); return { run_id: run, operation_id: args[3], manifest: path.join(args[1], 'jobs', run, 'manifest.json'),
    sha256: 'a'.repeat(64), status: 'selected-source-retained-not-published', cancellation_after_publication: false };
}

// Fabricated native-shaped session bookkeeping only: no native engine or network request.
async function sessionFixture(root, args) {
  const descriptor = missing(args), directory = path.dirname(descriptor.manifest), operationId = args[3];
  const engineId = randomUUID(), selectedId = randomUUID();
  for (const child of ['home', 'extensions', 'spill', `selected/${selectedId}`]) await mkdir(path.join(directory, 'engine', engineId, child), { recursive: true });
  const refs = {};
  for (const [name, operation_id] of [['metadata', args[5]], ['runtime', args[7]]]) {
    const record = JSON.parse(await readFile(path.join(root, operation_id, 'receipt.json'), 'utf8'));
    refs[`${name}_reference`] = { output: path.join(root, operation_id, 'output'), operation_id, descriptor: record.result.prerequisite };
  }
  const metadata = JSON.parse(await readFile(refs.metadata_reference.descriptor.manifest, 'utf8'));
  // Resolve the fixed fixture asset from the already retained metadata result.
  const asset = `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet`;
  assert.equal(metadata.execution_mode, 'native-metadata-only');
  const journal = await createOvertureAcquisitionJournal({ output: path.join(directory, 'journal'), operationId, executionMode: 'native-fetch', assetCount: 1 });
  try {
    for (const [index, method] of ['HEAD', 'GET'].entries()) for (const type of ['request-reserved', 'request-completed']) {
      await journal.onEvent({ type, execution_mode: 'native-fetch', request_index: index + 1, asset_index: 0, method,
        reserved_bytes: index, observed_bytes: type === 'request-completed' ? index : 0, delivered_bytes: type === 'request-completed' ? index : 0 });
    }
  } finally { await journal.close(); }
  const journalRead = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
  const row = Object.fromEntries(OVERTURE_SELECTED_FIELDS.map(k => [k, null])); row.address_country = 'US';
  const rawRow = JSON.stringify(row) + '\n', gzip = gzipSync(rawRow), selectedPath = `engine/${engineId}/selected/${selectedId}/selected-us-places.jsonl.gz`;
  await writeFile(path.join(directory, selectedPath), gzip);
  const now = new Date().toISOString();
  const manifest = { schema_version: 'overture-acquisition-session@1.0.0', run_id: descriptor.run_id, operation_id: operationId,
    status: descriptor.status, execution_mode: 'native-fetch', started_at: now, completed_at: now, ...refs,
    engine: { directory: `engine/${engineId}`, query_fingerprint: overtureStreamingQueryFingerprint(1), engine_settings: {
      threads: '1', memory_limit: '2GiB', max_temp_directory_size: '4GiB', home_directory: 'owned-run-directory', extension_directory: 'owned-run-directory', temp_directory: 'owned-run-directory',
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false', enable_external_access: 'true',
      http_retries: '0', auto_fallback_to_full_download: 'false', force_download: 'false', force_download_threshold: '0', http_timeout: '30', enable_server_cert_verification: 'true', enable_curl_server_cert_verification: 'true' } },
    selected: { path: selectedPath, bytes: gzip.length, sha256: digest(gzip), record_count: 1, uncompressed_bytes: Buffer.byteLength(rawRow) },
    journal: { directory: 'journal/' + path.basename(journal.directory), sha256: journalRead.sha256, counters: journalRead.counters },
    transport: { requests_reserved: 2, fetch_calls: 2, bytes_reserved: 1, bytes_observed: 1, bytes_delivered: 1 },
    heads: [{ asset_index: 0, content_length: 100, etag: '"fixture"' }], claims: { native_acquisition_verified: false, normalized_businesses_published: false,
      complete_us_business_coverage: false, restart_resume_supported: false, process_memory_cap_enforced: false, hard_deadline_enforced: false, public_export_authorized: false }, plan_sha256: '' };
  const plan = Object.fromEntries(['schema_version', 'run_id', 'operation_id', 'execution_mode', 'started_at', 'metadata_reference', 'runtime_reference'].map(k => [k, manifest[k]]));
  plan.asset_urls = [asset]; plan.query_fingerprint = manifest.engine.query_fingerprint;
  const planRaw = JSON.stringify(plan); await writeFile(path.join(directory, 'plan.json'), planRaw); manifest.plan_sha256 = digest(planRaw);
  const raw = JSON.stringify(manifest); await writeFile(descriptor.manifest, raw); descriptor.sha256 = digest(raw);
  return descriptor;
}

test('acquisition rejects implicit authorization, expanded caller input and absent prerequisites before allocation', async () => {
  const root = await workspace(); let manager;
  try {
    manager = new ManagedOperations({ root, executor: () => assert.fail('no invalid input may execute') }); await manager.ready;
    const valid = { metadataOperationId: randomUUID(), runtimeOperationId: randomUUID(), authorization };
    const getter = { ...valid }; Object.defineProperty(getter, 'authorization', { get() { assert.fail('getter executed'); } });
    for (const input of [undefined, null, {}, [], getter, Object.create(valid), { ...valid, authorization: true }, { ...valid, authorization: '' },
      { ...valid, url: 'https://private.invalid' }, { ...valid, runtimeOperationId: valid.metadataOperationId }, { ...valid, metadataOperationId: '../escape' }, valid]) {
      await assert.rejects(manager.startOvertureAcquisition(input)); assert.equal(manager.operations.size, 0); assert.deepEqual(await readdir(root), []);
    }
  } finally { await cleanup(root, manager); }
});

test('acquisition verifies retained prerequisites, dispatches fixed pinned arguments and retains missing recovery evidence', async () => {
  const root = await workspace(); let manager;
  try {
    const input = await prerequisites(root);
    for (const recovery of [false, true]) {
      let descriptor;
      manager = new ManagedOperations({ root, executor: async ({ script, args, kind }) => {
        assert.equal(script, 'scripts/run-overture-acquisition-session.mjs'); assert.equal(kind, 'source-acquisition'); assert.equal(args.length, 14);
        assert.deepEqual(args.filter((_, i) => i % 2 === 0), ['--output', '--operation-id', '--metadata-operation-id', '--runtime-operation-id', '--metadata-sha256', '--runtime-sha256', '--authorization']);
        assert.equal(args[5], input.metadataOperationId); assert.equal(args[7], input.runtimeOperationId); assert.equal(args[13], authorization);
        for (const [id, hash] of [[args[5], args[9]], [args[7], args[11]]]) assert.equal(JSON.parse(await readFile(path.join(root, id, 'receipt.json'), 'utf8')).result.prerequisite.sha256, hash);
        descriptor = missing(args); return { code: recovery ? 1 : 0, stdout: JSON.stringify(recovery ? { recovery: descriptor } : descriptor) };
      } });
      const done = await terminal(manager, await manager.startOvertureAcquisition(input));
      assert.equal(done.status, 'FAILED'); assert.deepEqual(done.result.snapshot, descriptor); assert.equal(done.result.snapshotReady, false);
      assert.equal(done.result.receiptIntegrityVerified, false); assert.equal(done.result.inspectionRequired, true); assert.deepEqual(done.artifacts, []);
      assert.equal(await manager.artifact(done.id, 'manifest.json'), null); await manager.close();
    }
  } finally { await cleanup(root, manager); }
});

test('acquisition revalidates on-disk prerequisite flags and retained bytes without allocating or executing', async () => {
  const root = await workspace(); let manager;
  try {
    const input = await prerequisites(root); manager = new ManagedOperations({ root, executor: () => assert.fail('bad evidence executed') }); await manager.ready;
    const file = path.join(root, input.metadataOperationId, 'receipt.json'), original = await readFile(file, 'utf8');
    for (const modify of [r => { r.status = 'FAILED'; }, r => { r.result.inspectionRequired = true; }, r => { r.result.metadataReady = false; },
      r => { r.result.prerequisite.cancellation_after_publication = true; }, r => { r.result.acquisitionReady = true; }, r => { r.details.sourceId = 'wrong'; },
      r => { r.result.prerequisite.sha256 = '0'.repeat(64); }]) {
      const changed = JSON.parse(original); modify(changed); await writeFile(file, JSON.stringify(changed));
      await assert.rejects(manager.startOvertureAcquisition(input), /prerequisites/); assert.equal(manager.operations.size, 2); assert.equal((await readdir(root)).length, 2);
    }
  } finally { await cleanup(root, manager); }
});

test('acquisition shares one operation slot, cancellation remains failed evidence and restart never retries', async () => {
  const root = await workspace(); let manager, reloaded, release, enter;
  const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { enter = resolve; });
  try {
    const input = await prerequisites(root);
    manager = new ManagedOperations({ root, executor: async ({ args, signal }) => { enter(); await gate; assert.equal(signal.aborted, true); return { code: 0, stdout: JSON.stringify(missing(args)) }; } });
    const op = await manager.startOvertureAcquisition(input); await entered;
    await assert.rejects(manager.startOvertureAcquisition(input), /already running/);
    await assert.rejects(manager.startSourcePrerequisite({ sourceId: 'overture-source-preflight' }), /already running/);
    await manager.cancel(op.id); release(); const done = await terminal(manager, op);
    assert.equal(done.status, 'CANCELLED'); assert.equal(done.result.snapshotReady, false); assert.equal(done.result.cancellation.requested, true);
    await manager.close(); reloaded = new ManagedOperations({ root, executor: () => assert.fail('restart must not acquire') });
    assert.equal((await reloaded.get(op.id)).status, 'CANCELLED'); assert.equal(reloaded.running.size, 0);
  } finally { release(); await cleanup(root, manager, reloaded); }
});

test('acquisition unresolved ownership survives reload without retry, readiness or artifact exposure', async () => {
  const root = await workspace(); let manager;
  try {
    const input = await prerequisites(root), id = randomUUID(); await mkdir(path.join(root, id));
    await writeFile(path.join(root, id, 'receipt.json'), JSON.stringify({ id, kind: 'source-acquisition', status: 'RUNNING',
      createdAt: new Date().toISOString(), owner: {}, details: { sourceId: 'overture-us-places' },
      result: { snapshotReady: true, inspectionRequired: false }, artifacts: [{ name: 'private.jsonl', bytes: 1 }] }));
    manager = new ManagedOperations({ root, executor: () => assert.fail('unresolved acquisition must never retry') });
    const done = await manager.get(id); assert.equal(done.status, 'UNKNOWN'); assert.equal(done.result.snapshotReady, false);
    assert.equal(done.result.inspectionRequired, true); assert.deepEqual(done.artifacts, []); assert.equal(await manager.artifact(id, 'private.jsonl'), null);
    await assert.rejects(manager.startOvertureAcquisition(input), /unresolved ownership/); assert.equal(manager.running.size, 0);
  } finally { await cleanup(root, manager); }
});

test('acquisition rejects temporary operation storage before prerequisite reads or allocation', async () => {
  const root = await workspace(); let manager;
  try {
    // Storage path intentionally need not exist; validation must reject it before ready/reservation.
    const unsafe = path.join(APP_ROOT, 'data/tmp', `overture-acquisition-${randomUUID()}`);
    manager = new ManagedOperations({ root, executor: () => assert.fail('unsafe storage executed') }); await manager.ready;
    manager.root = unsafe;
    await assert.rejects(manager.startOvertureAcquisition({ metadataOperationId: randomUUID(), runtimeOperationId: randomUUID(), authorization }), /native operation storage/);
    assert.equal(manager.operations.size, 0); assert.deepEqual(await readdir(root), []); manager.root = root;
  } finally { await cleanup(root, manager); }
});

test('clean structurally verified acquisition exposes internal readiness and survives restart without download', async () => {
  const root = await workspace(); let manager, reloaded;
  try {
    const input = await prerequisites(root);
    manager = new ManagedOperations({ root, executor: async ({ args }) => ({ code: 0, stdout: JSON.stringify(await sessionFixture(root, args)) }) });
    const done = await terminal(manager, await manager.startOvertureAcquisition(input));
    assert.equal(done.status, 'SUCCEEDED'); assert.equal(done.result.receiptIntegrityVerified, true); assert.equal(done.result.snapshotReady, true);
    assert.equal(done.result.inspectionRequired, false); assert.equal(done.result.normalizedPublished, false); assert.equal(done.result.completeUsBusinessCoverage, false);
    assert.equal(done.result.exportPolicy, 'internal'); assert.deepEqual(done.artifacts, []); assert.equal(await manager.artifact(done.id, 'selected-us-places.jsonl.gz'), null);
    await manager.close(); reloaded = new ManagedOperations({ root, executor: () => assert.fail('completed snapshot must not redownload') });
    assert.deepEqual(await reloaded.get(done.id), done); assert.equal(reloaded.running.size, 0);
  } finally { await cleanup(root, manager, reloaded); }
});

test('verified acquisition with nonzero exit, recovery or late cancellation retains evidence but cannot advertise readiness', async () => {
  const root = await workspace(); let manager;
  try {
    const input = await prerequisites(root);
    for (const mode of ['nonzero', 'recovery', 'late-cancel', 'cancelled']) {
      manager = new ManagedOperations({ root, executor: async ({ args }) => {
        const descriptor = await sessionFixture(root, args);
        if (mode === 'late-cancel') descriptor.cancellation_after_publication = true;
        if (mode === 'cancelled') await manager.cancel(args[3]);
        return { code: mode === 'nonzero' ? 1 : 0, stdout: JSON.stringify(mode === 'recovery' ? { recovery: descriptor } : descriptor) };
      } });
      const done = await terminal(manager, await manager.startOvertureAcquisition(input));
      assert.equal(done.status, mode === 'cancelled' ? 'CANCELLED' : 'FAILED', mode);
      assert.equal(done.result.receiptIntegrityVerified, true, mode); assert.equal(done.result.snapshotReady, false, mode);
      assert.equal(done.result.inspectionRequired, true, mode); assert.ok(done.result.snapshot); assert.deepEqual(done.artifacts, []);
      if (mode === 'cancelled') assert.equal(done.result.cancellation.requested, true);
      await manager.close();
    }
  } finally { await cleanup(root, manager); }
});
