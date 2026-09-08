import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { MN_CONSTRUCTION_COLUMNS, MN_CONSTRUCTION_EXPORTS, preflightMnConstruction } from './mn-construction-preflight.mjs';
import { createMnConstructionExportStream } from './mn-construction-transport.mjs';
import { buildMnConstructionAcquiredSelection } from './mn-construction-acquired-selection.mjs';
import { buildMnConstructionRetainedSelection, verifyMnConstructionRetainedSelection } from './mn-construction-retained-selection.mjs';
import { captureMnConstructionNotices } from './mn-construction-notices.mjs';

const at = '2026-09-08T12:00:00.000Z', sha = value => createHash('sha256').update(value).digest('hex');
const context = { runId: 'fixture-transport', sourceReleaseId: 'fixture-mn', cohort: 'residential', observedAt: at };
const row = overrides => ({ ...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(key => [key, ''])), Bus_Pers: 'Business', Status: 'Issued',
  Name: 'Fixture contractor', Lic_Number: 'BC123456', St: 'MN', Zip: '55001-1234', Phone_No: 'PRIVATE CONTACT', ...overrides });
const encodeRow = value => MN_CONSTRUCTION_COLUMNS.map(key => `"${value[key].replaceAll('"', '""')}"`).join(',') + '\r\n';
const csv = Buffer.from(MN_CONSTRUCTION_COLUMNS.join(',') + '\r\n' + Array.from({ length: 60 }, (_, index) => encodeRow(row(index % 2 ? { Bus_Pers: 'Person', Name: 'PRIVATE PERSON' } : {}))).join(''));
const headers = { 'content-length': String(csv.length), 'content-type': 'application/octet-stream', etag: '"fixture-v1"', 'last-modified': 'Tue, 08 Sep 2026 11:00:00 GMT' };
async function fixture(change = () => {}, observedAt = at) {
  const preflight = await preflightMnConstruction({ now: () => new Date(observedAt), sleep: async () => {}, fetchImpl: async (_url, options) => options.method === 'HEAD'
    ? new Response(null, { headers }) : new Response(csv.subarray(0, 4096), { status: 206, headers: { ...headers, 'content-length': '4096', 'content-range': `bytes 0-4095/${csv.length}` } }) });
  const calls = [], waits = [];
  const options = { preflight, cohort: 'residential', now: () => new Date(observedAt), sleep: async ms => { waits.push(ms); },
    fetchImpl: async (url, opts) => { calls.push({ url, ...opts }); return await change(calls.length, opts) ?? new Response(opts.method === 'HEAD' ? null : csv, { headers }); } };
  return { calls, waits, options };
}
async function consume(transport) { const chunks = []; for await (const chunk of transport.stream) chunks.push(chunk); return Buffer.concat(chunks); }

test('MN transport snapshots schema, measures bytes and gates EOF on fixed HEAD GET HEAD and finish hook', async () => {
  const f = await fixture(); let before = 0, after = 0;
  const transfer = createMnConstructionExportStream({ ...f.options, beforeTransfer: async () => { before++; }, afterTransfer: async () => { after++; } });
  assert.throws(() => transfer.receipt(), /not successfully consumed/);
  f.options.preflight.observations[1].source_identity.etag = '"caller-mutation"';
  const output = await consume(transfer); assert.deepEqual(output, csv);
  assert.deepEqual(f.calls.map(call => call.method), ['HEAD', 'GET', 'HEAD']); assert.deepEqual(f.waits, [1000, 1000, 1000]);
  for (const call of f.calls) { assert.equal(call.url, MN_CONSTRUCTION_EXPORTS[1]); assert.equal(call.redirect, 'error'); assert.equal(call.credentials, 'omit'); assert.equal(call.headers['If-Match'], headers.etag); assert.equal(call.headers['Accept-Encoding'], 'identity'); }
  assert.deepEqual([before, after], [2, 1]); const receipt = transfer.receipt();
  assert.equal(receipt.source_bytes, csv.length); assert.equal(receipt.source_file_sha256, sha(csv));
  assert.equal(receipt.native_acquisition_verified, false); assert.equal(receipt.source_use_authorized, false); assert.ok(Object.isFrozen(receipt.source_identity));
});

test('MN transport rejects invalid configuration and stale/future schema before any source request', async () => {
  const f = await fixture();
  for (const changed of [{ cohort: 'other' }, { fetchImpl: undefined }, { bodyTimeoutMs: 120001 }, { headerTimeoutMs: 15001 }, { unknown: true },
    { now: () => new Date('2026-09-08T12:15:00.001Z') }, { now: () => new Date('2026-09-08T11:59:59.999Z') }]) {
    assert.throws(() => createMnConstructionExportStream({ ...f.options, ...changed }));
  }
  assert.equal(f.calls.length, 0);
  const delayed = createMnConstructionExportStream({ ...f.options, now: (() => { let calls = 0; return () => new Date(calls++ ? '2026-09-08T12:16:00.000Z' : at); })() });
  await assert.rejects(consume(delayed)); assert.equal(f.calls.length, 0);
});

test('MN metadata failures cancel unread responses without retry or raw error-body exposure', async () => {
  for (const status of [302, 403, 412, 429, 500]) {
    let cancelled = 0;
    const f = await fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status }));
    const transfer = createMnConstructionExportStream(f.options);
    await assert.rejects(consume(transfer), error => !error.message.includes('PRIVATE')); assert.equal(f.calls.length, 1); assert.equal(cancelled, 1);
    assert.throws(() => transfer.receipt());
  }
  for (const changed of [{ etag: '"changed"' }, { 'content-length': '1' }, { 'content-type': 'text/html' }, { 'content-encoding': 'gzip' },
    { 'last-modified': 'Tue, 08 Sep 2026 10:00:00 GMT' }, { 'content-range': 'bytes 0-1/2' }]) {
    const f = await fixture(call => call === 2 ? new Response(csv, { headers: { ...headers, ...changed } }) : undefined);
    await assert.rejects(consume(createMnConstructionExportStream(f.options))); assert.equal(f.calls.length, 2);
  }
});

test('MN byte truncation, excess and final source drift withhold a completed receipt', async () => {
  for (const body of [csv.subarray(0, csv.length - 1), Buffer.concat([csv, Buffer.from('x')])]) {
    const f = await fixture(call => call === 2 ? new Response(body, { headers }) : undefined), transfer = createMnConstructionExportStream(f.options);
    await assert.rejects(consume(transfer)); assert.equal(f.calls.length, 2); assert.throws(() => transfer.receipt());
  }
  const f = await fixture(call => call === 3 ? new Response(null, { headers: { ...headers, etag: '"changed"' } }) : undefined);
  const transfer = createMnConstructionExportStream(f.options); await assert.rejects(consume(transfer)); assert.throws(() => transfer.receipt());
});

test('MN ignored requests, late responses and stalled bodies respect deadlines', async () => {
  let resolve, cancelled = 0;
  const f = await fixture(() => new Promise(done => { resolve = done; }));
  await assert.rejects(consume(createMnConstructionExportStream({ ...f.options, headerTimeoutMs: 20 })));
  resolve(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, 1);
  const b = await fixture(call => call === 2 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers }) : undefined);
  await assert.rejects(consume(createMnConstructionExportStream({ ...b.options, bodyTimeoutMs: 20 }))); assert.equal(cancelled, 2); assert.equal(b.calls.length, 2);
});

test('MN consumer destruction interrupts an ignored request and cancellation cannot issue the next request', async () => {
  let entered; const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(() => { entered(); return new Promise(() => {}); });
  const transfer = createMnConstructionExportStream(f.options), consuming = consume(transfer);
  await ready; transfer.stream.destroy(); await assert.rejects(consuming); assert.equal(f.calls.length, 1);
  const controller = new AbortController(); controller.abort();
  const b = await fixture(); assert.throws(() => createMnConstructionExportStream({ ...b.options, signal: controller.signal })); assert.equal(b.calls.length, 0);
});

test('MN before-transfer and after-transfer failures cannot become completed transport receipts', async () => {
  for (const hook of ['beforeTransfer', 'afterTransfer']) {
    const f = await fixture(), transfer = createMnConstructionExportStream({ ...f.options, [hook]: async () => { throw new Error('PRIVATE SOURCE ERROR'); } });
    await assert.rejects(consume(transfer), error => !error.message.includes('PRIVATE')); assert.equal(f.calls.length, hook === 'beforeTransfer' ? 1 : 3); assert.throws(() => transfer.receipt());
  }
});

test('MN transport produces reusable selected-only bundles with independently matching source measurements', async () => {
  const f = await fixture(), transfer = createMnConstructionExportStream(f.options), outputRoot = path.join(APP_ROOT, 'data/tmp', 'mn-transport-' + randomUUID());
  const bundle = await buildMnConstructionRetainedSelection(transfer.stream, { context, outputRoot });
  const measured = transfer.receipt(), verified = await verifyMnConstructionRetainedSelection(bundle.manifest_path);
  assert.equal(verified.selection_receipt.source_file_sha256, measured.source_file_sha256);
  assert.equal(verified.selection_receipt.source_bytes, measured.source_bytes);
  assert.equal(bundle.counts.source_records, 60); assert.equal(bundle.counts.accepted_records, 30); assert.equal(bundle.counts.rejected_records, 30);
  const directory = path.dirname(bundle.manifest_path);
  for (const name of await readdir(directory)) { assert.ok(!name.endsWith('.csv')); assert.ok(!(await readFile(path.join(directory, name), 'utf8')).includes('PRIVATE')); }
  await verifyMnConstructionRetainedSelection(bundle.manifest_path); assert.equal(f.calls.length, 3);
});

test('MN late validation failure never publishes a selected manifest and prior bundles remain intact', async () => {
  const outputRoot = path.join(APP_ROOT, 'data/tmp', 'mn-transport-failure-' + randomUUID());
  const prior = await buildMnConstructionRetainedSelection(Readable.from([csv]), { context, outputRoot });
  const f = await fixture(), transfer = createMnConstructionExportStream({ ...f.options, afterTransfer: async () => { throw new Error('notice changed'); } });
  await assert.rejects(buildMnConstructionRetainedSelection(transfer.stream, { context, outputRoot }));
  await verifyMnConstructionRetainedSelection(prior.manifest_path);
  for (const directory of await readdir(outputRoot)) if (directory !== prior.bundle_id) assert.ok(!(await readdir(path.join(outputRoot, directory))).includes('manifest.json'));
});

test('MN integrated acquisition rejects unreviewed notices without opening the CSV or creating output', async () => {
  const notices = await captureMnConstructionNotices({ now: () => new Date(at), sleep: async () => {}, fetchImpl: async () => new Response('<article>Unreviewed fixture</article>', { headers: { 'content-type': 'text/html' } }) });
  const f = await fixture();
  await assert.rejects(buildMnConstructionAcquiredSelection({ notices, preflight: f.options.preflight, context, fetchImpl: f.options.fetchImpl, now: f.options.now }), /article changed/);
  assert.equal(f.calls.length, 0);
});

test('MN retained-notice integration covers success, changed final notice and cross-stage clock regression without network', async t => {
  // Do not rehost full publisher pages in public fixtures. Use only the exact
  // internally retained receipt, if available; absence is an explicit skip.
  let raw;
  try { raw = await readFile(path.join(APP_ROOT, 'data/business-sources/mn-dli-construction/source-use/4326f062-55dd-4469-9d4b-0631b9eefe67.json')); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('Requires internally retained reviewed Minnesota notices; never downloads a fixture.'); return; } throw error; }
  assert.equal(sha(raw), 'e7e0f8f7a4c3b9098c8c79fbae18cebd236bdb704e119aeb5673e629170445b8');
  const notices = JSON.parse(raw), observedAt = notices.finished_at;
  for (const mode of ['success', 'changed-notice', 'clock-regression']) {
    const f = await fixture(undefined, observedAt), outputRoot = path.join(APP_ROOT, 'data/tmp', 'mn-policy-transport-' + randomUUID());
    let backwards = false, noticeRequests = 0;
    const fetchImpl = async (url, options) => {
      const notice = notices.observations.find(item => item.url === url);
      if (!notice) return f.options.fetchImpl(url, options);
      noticeRequests++; if (mode === 'clock-regression') backwards = true;
      return new Response(mode === 'changed-notice' ? notice.article_html.replace('Disclaimer', 'DisclaiMer') : notice.article_html, { headers: { 'content-type': 'text/html' } });
    };
    const invoke = () => buildMnConstructionAcquiredSelection({ notices, preflight: f.options.preflight, context: { ...context, observedAt }, outputRoot,
      fetchImpl, sleep: f.options.sleep, now: () => new Date(Date.parse(observedAt) - (backwards ? 1 : 0)) });
    if (mode === 'success') {
      const result = await invoke(); assert.equal(result.bundle.counts.accepted_records, 30); assert.equal(result.before_binding.source_use_authorized, true);
      assert.equal(result.after_binding.source_use_authorized, true); assert.equal(result.native_acquisition_verified, false); assert.equal(result.evidence_persisted, false);
      assert.equal(result.transport.source_file_sha256, sha(csv)); assert.equal(noticeRequests, 2);
    } else {
      await assert.rejects(invoke());
      for (const directory of await readdir(outputRoot)) assert.ok(!(await readdir(path.join(outputRoot, directory))).includes('manifest.json'));
      assert.equal(noticeRequests, mode === 'clock-regression' ? 1 : 2);
    }
    assert.equal(f.calls.length, 3);
  }
});
