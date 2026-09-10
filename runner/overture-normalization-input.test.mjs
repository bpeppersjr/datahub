import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { readOvertureNormalizationInput as native, readOvertureNormalizationInputForTest as read } from './overture-normalization-input.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
async function fixture(t) {
  const root = path.join(APP_ROOT, 'data/tmp/overture-input-tests', randomUUID()), operationId = randomUUID(), run = randomUUID();
  await mkdir(path.join(root, operationId), { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp/overture-input-tests')); await rm(root, { recursive: true, force: true }); });
  const descriptor = { operation_id: operationId, run_id: run, manifest: path.join(root, operationId, 'output/jobs', run, 'manifest.json'), sha256: 'a'.repeat(64), status: 'selected-source-retained-not-published', cancellation_after_publication: false };
  const metadata = { operation_id: randomUUID(), descriptor: { sha256: 'b'.repeat(64) } }, runtime = { operation_id: randomUUID(), descriptor: { sha256: 'c'.repeat(64) } };
  const record = { id: operationId, kind: 'source-acquisition', status: 'SUCCEEDED', startedAt: '2026-09-03T00:00:00.000Z', details: { sourceId: 'overture-us-places', metadata, runtime },
    result: { sourceId: 'overture-us-places', snapshot: descriptor, receiptIntegrityVerified: true, inspectionRequired: false, snapshotReady: true, normalizedPublished: false, completeUsBusinessCoverage: false, exportPolicy: 'internal' } };
  const manifest = { operation_id: operationId, run_id: run, execution_mode: 'injected-test-transport', metadata_reference: structuredClone(metadata), runtime_reference: structuredClone(runtime), plan_sha256: 'd'.repeat(64), journal: { sha256: 'e'.repeat(64) },
    selected: { path: `engine/${randomUUID()}/selected/${randomUUID()}/selected-us-places.jsonl.gz`, bytes: 20, sha256: 'f'.repeat(64), record_count: 0 } };
  const filename = path.join(root, operationId, 'receipt.json'); let calls = 0;
  const options = { root, operationId, receiptSha256: '', readSnapshot: async (d, o) => { calls++; assert.deepEqual(d, descriptor); assert.equal(o.operationId, operationId); return { manifest, sha256: descriptor.sha256 }; } };
  async function save() { const raw = JSON.stringify(record); await writeFile(filename, raw); options.receiptSha256 = hash(raw); }
  await save(); return { root, filename, options, record, manifest, save, calls: () => calls };
}
test('synthetic binding preserves every dependency hash with no publication claim', async t => {
  const f = await fixture(t), resolved = await read(f.options);
  assert.equal(f.calls(), 1);
  assert.equal(resolved.binding.operation_receipt_sha256, f.options.receiptSha256);
  assert.equal(resolved.binding.plan_sha256, f.manifest.plan_sha256);
  assert.equal(resolved.binding.journal_sha256, f.manifest.journal.sha256);
  assert.equal(resolved.binding.metadata_manifest_sha256, 'b'.repeat(64));
  assert.equal(resolved.binding.runtime_manifest_sha256, 'c'.repeat(64));
  assert.equal(resolved.binding.selected_sha256, 'f'.repeat(64));
  assert.equal(resolved.binding.validation_mode, 'synthetic-test-only');
  assert.equal(resolved.binding.source_authenticity_proven, false);
  assert.equal(resolved.binding.normalized_published, false);
  assert.equal(resolved.sourceFile, path.join(path.dirname(f.record.result.snapshot.manifest), f.manifest.selected.path));
});
test('failed, cancelled, incomplete or wrong-source receipts reject before snapshot inspection', async t => {
  const f = await fixture(t), original = structuredClone(f.record);
  for (const mutate of [r => r.status = 'FAILED', r => r.result.snapshotReady = false, r => r.result.inspectionRequired = true,
    r => r.result.receiptIntegrityVerified = false, r => r.result.snapshot.cancellation_after_publication = true,
    r => r.kind = 'source-prerequisite', r => r.details.sourceId = 'other']) {
    Object.assign(f.record, structuredClone(original)); mutate(f.record); await f.save();
    await assert.rejects(read(f.options), /normalization acquisition input rejected/);
  }
  assert.equal(f.calls(), 0);
});
test('receipt mutation, dependency mismatch and escaping selected artifact reject', async t => {
  const f = await fixture(t);
  f.manifest.metadata_reference.descriptor.sha256 = '0'.repeat(64); await assert.rejects(read(f.options));
  f.manifest.metadata_reference = structuredClone(f.record.details.metadata);
  const original = f.manifest.selected.path; f.manifest.selected.path = '../../private'; await assert.rejects(read(f.options)); f.manifest.selected.path = original;
  const inspect = f.options.readSnapshot;
  f.options.readSnapshot = async (...args) => { const result = await inspect(...args); await writeFile(f.filename, JSON.stringify({ changed: true })); return result; };
  await assert.rejects(read(f.options));
});
test('native entry refuses injected roots/hooks; stale hash, accessors and preabort reject', async t => {
  const f = await fixture(t);
  await assert.rejects(native(f.options));
  await assert.rejects(read({ ...f.options, receiptSha256: '0'.repeat(64) }));
  await assert.rejects(read({ ...f.options, signal: AbortSignal.abort('private') }));
  await assert.rejects(read({ ...f.options, get operationId() { throw Error('private'); } }));
  assert.equal(f.calls(), 0);
});
