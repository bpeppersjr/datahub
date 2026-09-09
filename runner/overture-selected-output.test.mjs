import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, open } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { writeOvertureSelectedOutput as native, writeOvertureSelectedOutputForTest as write } from './overture-selected-output.mjs';

async function* rows(values) { yield* values; }
async function workspace() { const base = path.join(APP_ROOT, 'data/tmp'); await mkdir(base, { recursive: true }); return mkdtemp(path.join(base, 'overture-output-')); }
async function cleanup(output) { assert.equal(path.dirname(output), path.join(APP_ROOT, 'data/tmp')); assert.ok(path.basename(output).startsWith('overture-output-')); await rm(output, { recursive: true, force: true }); }
test('selected gzip output preserves framing, hashes and isolated runs including empty output', async () => {
  const output = await workspace();
  try {
    for (const values of [['{"id":1}', '{"id":2}'], []]) {
      const result = await write({ output, rows: rows(values), limits: { minFreeBytes: 0 } });
      const compressed = await readFile(path.join(result.directory, result.artifact.path));
      assert.equal(gunzipSync(compressed).toString(), values.map(value => value + '\n').join(''));
      assert.equal(result.artifact.bytes, compressed.length); assert.equal(result.artifact.sha256, createHash('sha256').update(compressed).digest('hex'));
      assert.equal(result.record_count, values.length); assert.deepEqual(result.claims, { native_acquisition_verified: false, output_schema_verified: false });
    }
    assert.equal((await readdir(output)).length, 2);
  } finally { await cleanup(output); }
});
test('framing and tighter resource ceilings fail redacted without success descriptors', async () => {
  const output = await workspace();
  try {
    for (const [values, limits] of [[['PRIVATE_INVALID'], {}], [['[]'], {}], [['{}\n'], {}], [['{"x":1}'], { maxLineBytes: 2 }], [['{}'], { maxRawBytes: 2 }], [['{}', '{}'], { maxRows: 1 }], [['{}'], { maxCompressedBytes: 1 }]]) {
      await assert.rejects(write({ output, rows: rows(values), limits: { minFreeBytes: 0, ...limits } }), error => !error.message.includes('PRIVATE_INVALID'));
    }
  } finally { await cleanup(output); }
});
test('abort drains pending iterator then returns it and releases output handles', { timeout: 5000 }, async () => {
  const output = await workspace(), controller = new AbortController();
  let entered, release, returned = false;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const source = { [Symbol.asyncIterator]() { return this; }, async next() { entered(); await gate; return { done: false, value: '{}' }; }, async return() { returned = true; return { done: true }; } };
  try {
    const pending = write({ output, rows: source, signal: controller.signal, limits: { minFreeBytes: 0 } });
    await ready; controller.abort(Error('PRIVATE_ABORT')); release();
    await assert.rejects(pending, error => !error.message.includes('PRIVATE_ABORT')); assert.equal(returned, true);
  } finally { release(); await cleanup(output); }
});
test('options and iterable accessors cannot run; native limit overrides are rejected', async () => {
  const output = await workspace();
  try {
    await assert.rejects(native({ output, rows: rows([]), limits: { minFreeBytes: 0 } }));
    await assert.rejects(write({ output, rows: { get [Symbol.asyncIterator]() { assert.fail('getter'); } } }));
    await assert.rejects(write({ output, get rows() { assert.fail('getter'); } }));
    assert.deepEqual(await readdir(output), []);
  } finally { await cleanup(output); }
});
test('final owned reread detects same-size mutation during a held iterator', { timeout: 5000 }, async () => {
  const output = await workspace(); let entered, release;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  async function* source() { yield '{}'; entered(); await gate; }
  const pending = write({ output, rows: source(), limits: { minFreeBytes: 0 } });
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  try {
    await ready;
    const directories = await readdir(output);
    const file = path.join(output, directories[0], 'selected-us-places.jsonl.gz');
    let size = 0;
    for (let attempt = 0; attempt < 100 && size === 0; attempt++) {
      size = (await stat(file)).size;
      if (!size) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(size > 0);
    const handle = await open(file, 'r+');
    try { await handle.write(Buffer.from([0]), 0, 1, 0); await handle.sync(); } finally { await handle.close(); }
    release();
    const result = await outcome; assert.ok(result.error); assert.equal(result.value, undefined);
  } finally { release(); await outcome; await cleanup(output); }
});
