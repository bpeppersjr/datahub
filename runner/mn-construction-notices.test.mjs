import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { MN_CONSTRUCTION_NOTICE_URLS, inspectMnConstructionNotice, captureMnConstructionNotices, validateMnConstructionNotices, writeMnConstructionNotices } from './mn-construction-notices.mjs';
import { assertMnConstructionSourceUseConfiguration, bindMnConstructionSourceUse } from './mn-construction-source-use.mjs';

const at = '2026-09-08T11:40:00.000Z';
const html = '<html>OUTSIDE<article><h1>Fixture publisher notice</h1>\r\n<p>Complete fixture terms.</p></article></html>';
function fixture(change = () => {}) {
  const calls = [], waits = [];
  return { calls, waits, options: { now: () => new Date(at), sleep: async ms => { waits.push(ms); },
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); return await change(calls.length) ?? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }); } } };
}

test('MN notice capture retains complete normalized articles with two serial fixed requests', async () => {
  const f = fixture(), receipt = await captureMnConstructionNotices(f.options);
  assert.deepEqual(f.calls.map(c => c.url), MN_CONSTRUCTION_NOTICE_URLS);
  assert.deepEqual(f.waits, [1000]);
  for (const call of f.calls) { assert.equal(call.method, 'GET'); assert.equal(call.redirect, 'error'); assert.equal(call.credentials, 'omit'); assert.equal(call.headers['Accept-Encoding'], 'identity'); }
  assert.equal(receipt.observations[0].body_bytes, Buffer.byteLength(html));
  assert.ok(!JSON.stringify(receipt).includes('OUTSIDE'));
  assert.ok(!receipt.observations[0].article_html.includes('\r'));
  assert.equal(validateMnConstructionNotices(receipt), receipt);
});

test('MN notice inspection rejects missing, multiple, nested, executable and oversized articles', () => {
  for (const input of ['', '<article>unfinished', '<article>a</article><article>b</article>', '<article><article>a</article></article>',
    '<article><script>PRIVATE</script></article>', '<article><iframe></iframe></article>', '<article><form></form></article>', '<article>' + 'x'.repeat(200000) + '</article>', 'x'.repeat(1000001)]) {
    assert.throws(() => inspectMnConstructionNotice(input), error => !error.message.includes('PRIVATE'));
  }
});

test('MN notice transport fails closed without retry or error-body exposure', async () => {
  for (const status of [301, 403, 429, 503]) {
    let cancelled = 0;
    const f = fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status }));
    await assert.rejects(captureMnConstructionNotices(f.options), /no source-use authorization/);
    assert.equal(f.calls.length, 1); assert.equal(cancelled, 1);
  }
  for (const headers of [{ 'content-type': 'application/json' }, { 'content-type': 'text/html', 'content-encoding': 'gzip' },
    { 'content-type': 'text/html', 'content-length': '1000001' }, { 'content-type': 'text/html', 'content-length': '10' }]) {
    const f = fixture(() => new Response(html, { headers }));
    await assert.rejects(captureMnConstructionNotices(f.options)); assert.equal(f.calls.length, 1);
  }
  for (const body of [Buffer.from([255]), Buffer.alloc(1000001)]) {
    const f = fixture(() => new Response(body, { headers: { 'content-type': 'text/html' } }));
    await assert.rejects(captureMnConstructionNotices(f.options)); assert.equal(f.calls.length, 1);
  }
});

test('MN notice deadlines cover ignored signals, stalled bodies, late replies and caller cancellation', async () => {
  const ignored = fixture(() => new Promise(() => {}));
  await assert.rejects(captureMnConstructionNotices({ ...ignored.options, timeoutMs: 20 })); assert.equal(ignored.calls.length, 1);
  let cancelled = 0;
  const stalled = fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(captureMnConstructionNotices({ ...stalled.options, timeoutMs: 20 })); assert.equal(cancelled, 1);
  let reply;
  const late = fixture(() => new Promise(resolve => { reply = resolve; }));
  await assert.rejects(captureMnConstructionNotices({ ...late.options, timeoutMs: 20 }));
  reply(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 2);
  const controller = new AbortController(); controller.abort();
  const f = fixture(); await assert.rejects(captureMnConstructionNotices({ ...f.options, signal: controller.signal })); assert.equal(f.calls.length, 0);
});

test('MN notice replay rejects article, roster, chronology and scope tampering', async () => {
  const receipt = await captureMnConstructionNotices(fixture().options);
  for (const mutate of [r => { r.observations[0].article_html += 'extra'; }, r => { r.observations.reverse(); },
    r => { r.finished_at = '2026-09-07T00:00:00.000Z'; }, r => { r.observations[0].body_bytes = 1; },
    r => { r.observations[0].article_sha256 = '0'.repeat(64); }, r => { r.scope = 'authenticated'; }, r => { r.extra = true; }]) {
    const changed = structuredClone(receipt); mutate(changed); assert.throws(() => validateMnConstructionNotices(changed));
  }
});

test('MN notice writer publishes immutable unique receipts, snapshots input and preserves prior artifacts', async () => {
  const outputRoot = path.join(APP_ROOT, 'data/tmp', 'mn-notices-' + randomUUID());
  const receipt = await captureMnConstructionNotices(fixture().options), original = JSON.stringify(receipt) + '\n';
  const pending = writeMnConstructionNotices(receipt, { outputRoot }); receipt.scope = 'mutated after invocation';
  const first = await pending, second = await writeMnConstructionNotices(JSON.parse(original), { outputRoot });
  assert.notEqual(first.path, second.path); assert.equal(await readFile(first.path, 'utf8'), original);
  assert.equal(first.sha256, second.sha256); assert.equal(first.bytes, Buffer.byteLength(original));
  assert.equal((await readdir(outputRoot)).length, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(writeMnConstructionNotices(JSON.parse(original), { outputRoot, signal: controller.signal }));
  assert.equal((await readdir(outputRoot)).length, 2);
});

test('MN notice writer rejects escapes and reserved publication ancestry', async () => {
  const receipt = await captureMnConstructionNotices(fixture().options);
  for (const outputRoot of [APP_ROOT, path.dirname(APP_ROOT), 'relative', path.join(APP_ROOT, 'data/tmp/releases/x'),
    path.join(APP_ROOT, 'data/tmp/.staging/x'), path.join(APP_ROOT, 'data/tmp/bad. ')]) {
    await assert.rejects(writeMnConstructionNotices(receipt, { outputRoot }));
  }
  const base = path.join(APP_ROOT, 'data/tmp', 'mn-notices-ancestor-' + randomUUID()); await mkdir(base, { recursive: true });
  const saved = await writeMnConstructionNotices(receipt, { outputRoot: base });
  await assert.rejects(writeMnConstructionNotices(receipt, { outputRoot: path.join(saved.path, 'child') }));
});

test('MN source-use policy is pinned and bindings reject missing time, drift, future or stale evidence', async () => {
  assertMnConstructionSourceUseConfiguration();
  const receipt = await captureMnConstructionNotices(fixture().options);
  for (const options of [{}, { checkedAt: 'bad' }, { checkedAt: at, extra: true }, null]) assert.throws(() => bindMnConstructionSourceUse(receipt, options));
  assert.throws(() => bindMnConstructionSourceUse(receipt, { checkedAt: at }), /article changed/);
  assert.throws(() => bindMnConstructionSourceUse(receipt, { checkedAt: '2026-09-08T11:39:59.999Z' }), /fresh notice/);
  assert.throws(() => bindMnConstructionSourceUse(receipt, { checkedAt: '2026-09-08T11:55:00.001Z' }), /fresh notice/);
  assert.throws(() => bindMnConstructionSourceUse(receipt, { checkedAt: '2026-09-07T23:59:59.999Z' }), /precedes policy/);
});
