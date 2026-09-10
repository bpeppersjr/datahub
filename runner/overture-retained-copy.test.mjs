import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, rm, link, lstat } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { copyOvertureRetainedSource as copy } from './overture-retained-copy.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
async function fixture(t, raw = Buffer.from('retained test data')) {
  const root = path.join(APP_ROOT, 'data/tmp/overture-copy-tests', randomUUID()); await mkdir(root, { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp/overture-copy-tests')); await rm(root, { recursive: true, force: true }); });
  const source = path.join(root, 'source.gz'), destination = path.join(root, 'destination.gz'); await writeFile(source, raw);
  return { root, raw, options: { source, destination, bytes: raw.length, sha256: hash(raw) } };
}
test('retained copy verifies source and retained bytes and never overwrites destination', async t => {
  const f = await fixture(t);
  assert.deepEqual(await copy(f.options), { bytes: f.raw.length, sha256: hash(f.raw) });
  assert.deepEqual(await readFile(f.options.destination), f.raw);
  assert.equal((await lstat(f.options.destination)).nlink, 1);
  await assert.rejects(copy(f.options), /Overture retained copy rejected/);
  assert.deepEqual(await readFile(f.options.destination), f.raw);
});
test('copy rejects mismatched hash or size, hardlinks, unsafe paths and unsupported options', async t => {
  const f = await fixture(t);
  for (const change of [{ sha256: '0'.repeat(64) }, { bytes: f.raw.length + 1 }, { bytes: 4 * 1024 ** 3 + 1 }, { source: '../outside' }, { destination: f.options.source }, { extra: true }]) {
    await assert.rejects(copy({ ...f.options, ...change }), /Overture retained copy rejected/);
  }
  await assert.rejects(lstat(f.options.destination), { code: 'ENOENT' });
  await link(f.options.source, path.join(f.root, 'alias'));
  await assert.rejects(copy(f.options), /Overture retained copy rejected/);
  assert.deepEqual(await readFile(f.options.source), f.raw);
});
test('copy cancels after staging opens, closes handles and preserves partial evidence', async t => {
  const f = await fixture(t, Buffer.alloc(32 * 1024 ** 2, 7)), controller = new AbortController();
  const pending = copy({ ...f.options, signal: controller.signal });
  const rejected = assert.rejects(pending, /Overture retained copy rejected/);
  let staged;
  for (let n = 0; n < 1000; n++) {
    staged = (await readdir(f.root)).find(name => name.startsWith('destination.gz.tmp-'));
    if (staged) break;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  controller.abort('private cancellation detail'); await rejected;
  assert.ok(staged); await assert.rejects(lstat(f.options.destination), { code: 'ENOENT' });
  // Retained staging evidence remains accessible for cleanup after cancellation.
  await rm(path.join(f.root, staged));
  assert.equal(hash(await readFile(f.options.source)), f.options.sha256);
});
test('preabort and accessors fail without creating a destination', async t => {
  const f = await fixture(t);
  await assert.rejects(copy({ ...f.options, signal: AbortSignal.abort('private') }), /Overture retained copy rejected/);
  await assert.rejects(copy({ ...f.options, get bytes() { throw Error('private'); } }), /Overture retained copy rejected/);
  assert.deepEqual((await readdir(f.root)), ['source.gz']);
});
