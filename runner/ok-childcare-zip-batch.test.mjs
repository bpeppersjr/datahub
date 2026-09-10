import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { selectOkQueryPage, deriveOkQueryCandidates, okQueryUrl } from './ok-childcare-query-contract.mjs';
import { collectOkZipQueryWithTestTransport, okQuerySyntheticClient, collectOkZipQuery } from './ok-childcare-query-fetch.mjs';
import { runOkZipBatchWithTestTransport, createOkZipBatchPlan, runOkZipBatch } from './ok-childcare-zip-batch.mjs';
import { OK_PUBLISHER_LOCK_TASK } from './ok-childcare-publisher-lock.mjs';
import { acquireIndustrySourceLocks } from './industry-source-locks.mjs';
import { collectOkRetainedSearch } from './ok-childcare-retained-fetch.mjs';

const html = (zip5, rows = [], extra = {}) => Buffer.from(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/providers',
  query: { 'zip-code': zip5, 'facility-type': 'childcare-center' }, props: { pageProps: { childcareProviders: rows, ...extra } } })}</script>`);
const root = () => path.join(APP_ROOT, 'data/tmp/ok-zip-batch-tests', randomUUID());
const sourceRow = zip5 => ({ vendorId: '123', name: 'Test center', facilityType: 'childcare-center',
  addressLines: ['1 Main St', `Test City, OK ${zip5}-1234`], privateContact: 'DO-NOT-RETAIN', coordinates: { latitude: 35, longitude: -97, private: 'DO-NOT-RETAIN' } });
function transportFor(seen, rows = true) {
  return async url => {
    seen.push(url);
    const zip5 = new URL(url).searchParams.get('zip-code');
    return zip5 ? new Response(html(zip5, rows ? [sourceRow(zip5)] : []), { headers: { 'content-type': 'text/html' } }) : new Response(okQuerySyntheticClient());
  };
}

test('OK successor validates the requested ZIP, strips private fields, and derives address ZIP4 separately', () => {
  const selected = selectOkQueryPage(html('73001', [sourceRow('73001')]), '73001');
  assert.ok(!JSON.stringify(selected).includes('DO-NOT-RETAIN'));
  const result = deriveOkQueryCandidates(selected.selected, { response_sha256: 'a'.repeat(64), observed_at: '2026-09-10T12:00:00.000Z' }, '73001');
  assert.equal(result.counts.query_zip_matches, 1);
  assert.equal(result.counts.query_zip_differs, 0);
  assert.equal(result.candidates[0].query_zip5, '73001');
  assert.equal(result.candidates[0].source_url, okQueryUrl('73001'));
  assert.equal(result.candidates[0].address.zip_code, '73001');
  assert.equal(result.candidates[0].address.zip4, '1234');
  assert.throws(() => selectOkQueryPage(html('73102'), '73001'));
  assert.throws(() => selectOkQueryPage(html('73001', [{ facilityType: 'childcare-home' }]), '73001'));
  for (const invalid of [73001, '73001-1234', '73001&x=y', '1234', null]) assert.throws(() => okQueryUrl(invalid));
});

test('OK successor preserves query/address disagreement and explicit capped/empty uncertainty', () => {
  const projection = selectOkQueryPage(html('73001', [sourceRow('73102')]), '73001');
  const result = deriveOkQueryCandidates(projection.selected, { response_sha256: 'b'.repeat(64), observed_at: '2026-09-10T12:00:00.000Z' }, '73001');
  assert.equal(result.counts.query_zip_differs, 1);
  assert.equal(result.candidates[0].address.zip_code, '73102');
  assert.equal(selectOkQueryPage(html('73001'), '73001').delivery.selected_search_completeness, 'unknown');
  const capped = selectOkQueryPage(html('73001', Array.from({ length: 100 }, () => sourceRow('73001')), { total: 105 }), '73001');
  assert.equal(capped.delivery.at_client_row_ceiling, true);
  assert.equal(capped.delivery.pagination_metadata_detected, true);
  assert.throws(() => selectOkQueryPage(html('73001', Array.from({ length: 101 }, () => sourceRow('73001'))), '73001'));
});

test('OK batch executes multiple ZIPs serially then replays completed output without requests', async () => {
  const outputRoot = root(), seen = [], zip5 = ['73001', '73002'];
  const result = await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, transportFor(seen));
  assert.equal(result.completed_queries, 2); assert.equal(seen.length, 6);
  assert.deepEqual(seen.filter(s => s.includes('/providers?')).map(s => new URL(s).searchParams.get('zip-code')), zip5);
  const replay = await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, () => { throw Error('No new source call allowed'); });
  assert.equal(replay.sha256, result.sha256);
  for (const file of await readdir(outputRoot)) assert.ok(!(await readFile(path.join(outputRoot, file), 'utf8')).includes('DO-NOT-RETAIN'));
});

test('OK batch retains a rejected query and refuses to retry or move to the next ZIP', async () => {
  const outputRoot = root(), seen = [], zip5 = ['73001', '73002'];
  const good = transportFor(seen);
  await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5 }, async url => {
    if (url.includes('/providers?')) { seen.push(url); return new Response('private failure', { status: 429 }); }
    return good(url);
  }), /inspection/);
  assert.equal(seen.length, 2);
  assert.ok((await readdir(outputRoot)).includes('73001.result.json'));
  await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5 }, () => { throw Error('must not request'); }), /inspection/);
  assert.ok(!(await readdir(outputRoot)).includes('73002.intent.json'));
});

test('OK batch rejects output tampering and interrupted intents instead of reacquiring', async () => {
  for (const kind of ['tamper', 'missing-result', 'pending']) {
    const outputRoot = root(), zip5 = ['73001'];
    await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, transportFor([]));
    if (kind === 'tamper') {
      const file = path.join(outputRoot, '73001.result.json'), result = JSON.parse(await readFile(file, 'utf8'));
      result.derived.candidates[0].name = 'changed'; await writeFile(file, JSON.stringify(result));
    } else if (kind === 'missing-result') await unlink(path.join(outputRoot, '73001.result.json'));
    else await writeFile(path.join(outputRoot, '73002.intent.json.pending'), '{}');
    let calls = 0;
    await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5 }, () => { calls++; throw Error(); }));
    assert.equal(calls, 0);
  }
});

test('OK batch cancellation preserves rejected evidence and prevents another query', async () => {
  const outputRoot = root(), controller = new AbortController(); let calls = 0;
  await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5: ['73001', '73002'], signal: controller.signal }, async () => {
    calls++; controller.abort(); return new Promise(() => {});
  }));
  assert.equal(calls, 1);
  const result = JSON.parse(await readFile(path.join(outputRoot, '73001.result.json'), 'utf8'));
  assert.equal(result.query.status, 'rejected');
  assert.deepEqual(result.query.selected, []);
  assert.ok(!(await readdir(outputRoot)).includes('73002.intent.json'));
});

test('OK batch resumes only a never-issued suffix and excludes simultaneous execution', async () => {
  const outputRoot = root(), zip5 = ['73001', '73002'];
  await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, transportFor([]));
  const first = await readFile(path.join(outputRoot, '73001.result.json'), 'utf8');
  // Fixture simulates a stop between ZIPs: completed prefix, no second intent.
  for (const name of ['receipt.json', '73002.result.json', '73002.intent.json']) await unlink(path.join(outputRoot, name));
  const seen = []; let checked = false;
  const ordinary = transportFor(seen);
  await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, async url => {
    if (!checked) {
      checked = true;
      await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5 }, () => { throw Error('no concurrent request'); }), /already reserved/);
    }
    return ordinary(url);
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.some(s => s === okQueryUrl('73002')));
  assert.equal(await readFile(path.join(outputRoot, '73001.result.json'), 'utf8'), first);
});

test('OK batch rejects a result changed during prefix inspection before any resume request', async () => {
  const outputRoot = root(), zip5 = ['73001', '73002'];
  await runOkZipBatchWithTestTransport({ outputRoot, zip5 }, transportFor([]));
  for (const name of ['receipt.json', '73002.result.json', '73002.intent.json']) await unlink(path.join(outputRoot, name));
  let calls = 0;
  await assert.rejects(runOkZipBatchWithTestTransport({ outputRoot, zip5, hook: async ({ file }) => {
    await writeFile(file, (await readFile(file, 'utf8')) + ' ');
  } }, () => { calls++; throw Error(); }), /inspection/);
  assert.equal(calls, 0);
  assert.ok(!(await readdir(outputRoot)).includes('73002.intent.json'));
});

test('OK successor rejects drift, overflow, partial bodies and stale query echoes without retry', async () => {
  for (const kind of ['drift', 'overflow', 'partial', 'stale']) {
    let calls = 0;
    const result = await collectOkZipQueryWithTestTransport({ zip5: '73001' }, async url => {
      calls++;
      if (!url.includes('/providers?')) return new Response(kind === 'drift' ? 'wrong client' : okQuerySyntheticClient());
      const body = kind === 'overflow' ? new Uint8Array(1000001) : kind === 'partial'
        ? new ReadableStream({ start(c) { c.error(Error('PRIVATE')); } }) : html('73102');
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    });
    assert.equal(result.status, 'rejected'); assert.ok(calls <= 2); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('OK publisher lock excludes both native entry points before any request', async () => {
  const held = await acquireIndustrySourceLocks([OK_PUBLISHER_LOCK_TASK], { runId: randomUUID() });
  try {
    await assert.rejects(collectOkRetainedSearch(), /already reserved/);
    await assert.rejects(collectOkZipQuery({ zip5: '73001' }), /already reserved/);
  } finally { await held.release(); }
});

test('OK native batch plan verifies retained inventory and refuses an unapproved scope', {
  skip: process.env.DATAHUB_TEST_OK_SPATIAL_INVENTORY !== '1',
}, async () => {
  const { plan, budget } = await createOkZipBatchPlan();
  assert.equal(plan.zip5.length, 666); assert.ok(!plan.zip5.includes('73102'));
  assert.equal(plan.reuse[0].zip5, '73102'); assert.equal(budget.maximum_requests, 1998);
  await assert.rejects(runOkZipBatch({ outputRoot: path.join(APP_ROOT, 'data/unused-ok-batch-test'), approvedScopeSha256: 'wrong' }), /inspection/);
});
