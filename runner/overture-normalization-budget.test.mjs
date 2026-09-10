import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { createOvertureNormalizationBudget as native, createOvertureNormalizationBudgetForTest as create } from './overture-normalization-budget.mjs';

async function fixture(t, limits = {}) {
  const base = path.join(APP_ROOT, 'data/tmp/overture-output-budget-tests'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'run-'));
  t.after(async () => { assert.equal(path.dirname(directory), base); await rm(directory, { recursive: true, force: true }); });
  return create({ directory, limits: { minFreeBytes: 0, ...limits } });
}

test('shared reservations enforce combined and per-file limits before accepting bytes', async t => {
  const b = await fixture(t, { maxRawBytes: 10, maxFileRawBytes: 8, maxLineBytes: 8, maxCompressedBytes: 10, maxFileCompressedBytes: 8 });
  b.register('a'); b.register('b');
  b.reserveRaw('a', 6); b.reserveRaw('b', 4);
  b.reserveCompressed('a', 6); b.reserveCompressed('b', 4);
  assert.equal(b.snapshot().raw_bytes_reserved, 10); assert.equal(b.fileUsage('a').compressed_bytes_reserved, 6);
  assert.throws(() => b.reserveRaw('b', 1));
  assert.throws(() => b.reserveCompressed('b', 1));
});

test('line, file, row and file-count ceilings fail closed without exposing keys', async t => {
  for (const limits of [{ maxLineBytes: 2 }, { maxFileRawBytes: 2 }, { maxRawBytes: 2 }]) {
    const b = await fixture(t, limits); b.register('PRIVATE_KEY');
    assert.throws(() => b.reserveRaw('PRIVATE_KEY', 4), error => !error.message.includes('PRIVATE_KEY'));
    assert.throws(() => b.reserveRaw('PRIVATE_KEY', 1));
  }
  const compressed = await fixture(t, { maxFileCompressedBytes: 2 }); compressed.register('a'); assert.throws(() => compressed.reserveCompressed('a', 3));
  const rows = await fixture(t, { maxRows: 1 }); rows.register('a'); rows.reserveRaw('a', 1); assert.throws(() => rows.reserveRaw('a', 1));
  const files = await fixture(t, { maxFiles: 1 }); files.register('a'); assert.throws(() => files.register('b'));
});

test('invalid limits, registrations and cancellation cannot expand the budget', async t => {
  const b = await fixture(t); b.register('a'); assert.throws(() => b.register('a'));
  for (const limits of [{ maxFiles: 18 }, { maxRows: 0 }, { maxRawBytes: Number.MAX_SAFE_INTEGER }, { unknown: 1 }]) {
    await assert.rejects(fixture(t, limits));
  }
  await assert.rejects(create({ directory: path.join(APP_ROOT, 'data/tmp'), signal: AbortSignal.abort() }));
  await assert.rejects(native({ directory: path.join(APP_ROOT, 'data/tmp'), limits: { minFreeBytes: 0 } }));
  const valid = await fixture(t); await valid.checkDisk(true);
  const snapshot = valid.snapshot(); snapshot.raw_bytes_reserved = 42;
  assert.equal(valid.snapshot().raw_bytes_reserved, 0);
});
