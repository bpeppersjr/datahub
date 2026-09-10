import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, appendFile, link } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { streamOvertureGzipRecords as read } from './overture-gzip-records.mjs';

async function fixture(t, raw) {
  const base = path.join(APP_ROOT, 'data/tmp/overture-gzip-tests'), directory = path.join(base, randomUUID());
  await mkdir(directory, { recursive: true });
  t.after(async () => { assert.equal(path.dirname(directory), base); await rm(directory, { recursive: true, force: true }); });
  const filename = path.join(directory, 'records.jsonl.gz');
  await writeFile(filename, gzipSync(raw));
  return filename;
}
async function collect(options) { const rows = []; for await (const row of read(options)) rows.push(row); return rows; }

test('bounded gzip reader preserves JSON objects, UTF8, zero and split postal fields', async t => {
  const expected = [{ name: 'Café 商店', zip_code: '00100', zip4: '0001', latitude: 0 }, { name: 'x'.repeat(90000) }];
  const filename = await fixture(t, expected.map(row => JSON.stringify(row)).join('\n') + '\n');
  assert.deepEqual(await collect({ filename }), expected);
  assert.deepEqual(await collect({ filename: await fixture(t, '') }), []);
});

test('reader rejects malformed frames, UTF8 and gzip without copying source contents into errors', async t => {
  for (const raw of ['{"PRIVATE":', '{}', '\n', 'null\n', '[]\n', '"PRIVATE"\n', Buffer.from([123,34,120,34,58,34,255,34,125,10])]) {
    const filename = await fixture(t, raw);
    await assert.rejects(collect({ filename }), error => !error.message.includes('PRIVATE'));
  }
  const filename = await fixture(t, '{}\n'); await writeFile(filename, 'PRIVATE_INVALID_GZIP');
  await assert.rejects(collect({ filename }), error => !error.message.includes('PRIVATE'));
  await writeFile(filename, gzipSync('{}\n').subarray(0, -3));
  await assert.rejects(collect({ filename }));
});

test('compressed, raw, line and row limits only tighten and fail closed', async t => {
  const filename = await fixture(t, '{"a":1}\n{"a":2}\n');
  for (const limits of [{ maxCompressedBytes: 1 }, { maxRawBytes: 8 }, { maxLineBytes: 6 }, { maxRows: 1 },
    { maxRows: 20000001 }, { maxRows: 0 }, { unknown: 1 }]) await assert.rejects(collect({ filename, limits }));
  assert.equal((await collect({ filename, limits: { maxLineBytes: 7, maxRows: 2, maxRawBytes: 16 } })).length, 2);
});

test('cancellation and early return close the reader without consuming the whole file', async t => {
  const filename = await fixture(t, '{}\n{}\n'), controller = new AbortController();
  const iterator = read({ filename, signal: controller.signal });
  assert.deepEqual((await iterator.next()).value, {}); controller.abort(Error('PRIVATE_ABORT'));
  await assert.rejects(iterator.next(), error => !error.message.includes('PRIVATE_ABORT'));
  const early = read({ filename }); await early.next(); await early.return();
  await assert.rejects(collect({ filename, signal: AbortSignal.abort() }));
  // A fresh complete read remains possible after both cleanup paths.
  assert.equal((await collect({ filename })).length, 2);
});

test('reader rejects changed files, hard links and expanded invocation options', async t => {
  const filename = await fixture(t, '{}\n{}\n');
  const iterator = read({ filename }); await iterator.next(); await appendFile(filename, Buffer.from([0]));
  await assert.rejects(async () => { for await (const row of iterator) void row; });
  const second = await fixture(t, '{}\n'); await link(second, path.join(path.dirname(second), 'alias.gz'));
  await assert.rejects(collect({ filename: second }));
  await assert.rejects(collect({ filename, url: 'PRIVATE' }));
  await assert.rejects(collect({ filename: '../outside.gz' }));
});
