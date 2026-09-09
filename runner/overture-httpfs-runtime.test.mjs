import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile, rm, link } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C, decompressOvertureHttpfsFileForTest as decompressFile, decompressOvertureHttpfsForTest as decompress, readOvertureHttpfsRuntime as read, prepareOvertureHttpfsRuntime as prepare } from './overture-httpfs-runtime.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  const base = path.join(APP_ROOT, 'data/tmp');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'httpfs-reader-'));
  const operationId = randomUUID(), run = randomUUID(), output = path.join(root, operationId, 'output');
  const directory = path.join(output, 'jobs', run);
  for (const name of ['extensions','home','spill']) await mkdir(path.join(directory, name), { recursive: true });
  const binary = Buffer.from('FABRICATED NONEXECUTABLE FIXTURE'), compressed = gzipSync(binary);
  const artifacts = [];
  for (const [name, bytes] of [['httpfs.duckdb_extension.gz', compressed], ['httpfs.duckdb_extension', binary]]) {
    await writeFile(path.join(directory, name), bytes);
    artifacts.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const now = new Date().toISOString();
  // Native-shaped structural fixture is NOT acquisition or signature verification evidence.
  const manifest = { schema_version: C.version, run_id: run, operation_id: operationId, execution_mode: 'native-core-signature-checked-local-load', status: C.status,
    started_at: now, completed_at: now, source_url: C.url, package_version: C.package_version, engine_version: C.engine_version, platform: C.platform, artifacts,
    claims: { acquisitionReady: false, place_acquisition_performed: false, public_export_authorized: false, hard_process_deadline_enforced: false, engine_memory_is_process_ram_cap: false } };
  const filename = path.join(directory, 'manifest.json');
  const descriptor = { run_id: run, operation_id: operationId, manifest: filename, sha256: '', status: C.status, cancellation_after_publication: false };
  async function rewrite() { const raw = JSON.stringify(manifest); await writeFile(filename, raw); descriptor.sha256 = hash(raw); }
  await rewrite();
  return { root, output, operationId, directory, manifest, descriptor, rewrite };
}
async function cleanup(f) {
  assert.equal(path.dirname(f.root), path.join(APP_ROOT, 'data/tmp'));
  assert.ok(path.basename(f.root).startsWith('httpfs-reader-'));
  await rm(f.root, { recursive: true, force: true });
}

test('offline decompression rejects corruption, bounds and cancellation without receipts', async () => {
  assert.equal((await decompress(gzipSync('fixture'))).toString(), 'fixture');
  await assert.rejects(decompress(Buffer.from('invalid')));
  await assert.rejects(decompress(new Uint8Array(C.compressed_cap + 1)));
  await assert.rejects(decompress(gzipSync(Buffer.alloc(C.decompressed_cap + 1))));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(decompress(gzipSync('fixture'), { signal: controller.signal }));
});

test('reader verifies bounded structural hashes but does not execute or authenticate fixture', async () => {
  const f = await fixture();
  try {
    const checked = await read(f.descriptor, { output: f.output, operationId: f.operationId });
    assert.equal(checked.manifest.claims.acquisitionReady, false);
    assert.equal(checked.verification.extension_executed_this_read, false);
    assert.equal(checked.verification.signature_verified_this_read, false);
    await assert.rejects(read({ ...f.descriptor, sha256: '0'.repeat(64) }, { output: f.output, operationId: f.operationId }));
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: randomUUID() }));
    await writeFile(path.join(f.directory, 'httpfs.duckdb_extension'), 'changed');
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: f.operationId }));
  } finally { await cleanup(f); }
});

test('reader rejects rehashed false claims, extra files, chronology and hardlinks', async () => {
  const f = await fixture();
  try {
    f.manifest.claims.acquisitionReady = true; await f.rewrite();
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: f.operationId }));
    f.manifest.claims.acquisitionReady = false; await f.rewrite();
    await writeFile(path.join(f.directory, 'unexpected.txt'), 'fixture');
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: f.operationId }));
    await rm(path.join(f.directory, 'unexpected.txt'));
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: f.operationId, startedAt: new Date(Date.now() + 10000).toISOString() }));
    await link(path.join(f.directory, 'httpfs.duckdb_extension'), path.join(f.root, 'linked-binary'));
    await assert.rejects(read(f.descriptor, { output: f.output, operationId: f.operationId }));
  } finally { await cleanup(f); }
});

test('native preparation rejects arbitrary inputs before any request', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('network forbidden'));
  for (const input of [null, {}, { output: APP_ROOT, operationId: randomUUID() }, { output: 'relative', operationId: randomUUID() }, { get output() { assert.fail('getter'); }, operationId: randomUUID() }]) await assert.rejects(prepare(input));
});
test('actual file decompression pipeline finishes and releases handles on success and failure', { timeout: 10000 }, async () => {
  const f = await fixture();
  const source = path.join(f.root, 'compressed.gz'), destination = path.join(f.root, 'uncompressed');
  try {
    for (const [bytes, valid] of [[gzipSync('small fixture'), true], [Buffer.from('not gzip'), false], [gzipSync(Buffer.alloc(C.decompressed_cap + 1)), false]]) {
      await writeFile(source, bytes);
      if (valid) { await decompressFile(source, destination); assert.equal((await readFile(destination)).toString(), 'small fixture'); }
      else await assert.rejects(decompressFile(source, destination));
      await rm(source); await rm(destination, { force: true });
    }
    await writeFile(source, gzipSync('small')); await writeFile(destination, 'existing');
    await assert.rejects(decompressFile(source, destination));
    await rm(source); await rm(destination);
  } finally { await cleanup(f); }
});
