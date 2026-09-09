import assert from 'node:assert/strict';
import test from 'node:test';
import { createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';

const url = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-00000-11111111-1111-4111-8111-111111111111-c000.zstd.parquet';
const limits = { minIntervalMs: 0, requestTimeoutMs: 1000, deadlineMs: 10000 };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const head = () => new Response(null, { headers: { 'content-length': '16', etag: '"fixture"' } });

test('close owns a late fetch and waits for its response cancellation', { timeout: 5000 }, async () => {
  const entered = deferred(), response = deferred(), cancelling = deferred(), cancelled = deferred();
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits,
    fetchImpl: async () => { entered.resolve(); return response.promise; },
  });
  let closing;
  try {
    const active = assert.rejects(transport.head(0));
    await entered.promise;
    const queued = assert.rejects(transport.head(0));
    let finished = false;
    closing = transport.close().then(() => { finished = true; });
    await tick();
    assert.equal(finished, false);
    assert.equal(transport.snapshot().active_request, true);
    response.resolve(new Response(new ReadableStream({ cancel: async () => { cancelling.resolve(); await cancelled.promise; } })));
    await cancelling.promise;
    await tick();
    assert.equal(finished, false);
    cancelled.resolve();
    await Promise.all([active, queued, closing]);
    assert.equal(transport.snapshot().active_request, false);
    assert.equal(transport.snapshot().fetch_calls, 1);
  } finally {
    response.resolve(head()); cancelled.resolve();
    await closing; await transport.close();
  }
});

test('cancellation during the reservation callback drains it without starting fetch', { timeout: 5000 }, async () => {
  const entered = deferred(), release = deferred(), controller = new AbortController();
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits, signal: controller.signal,
    onEvent: async () => { entered.resolve(); await release.promise; }, fetchImpl: () => assert.fail('fetch forbidden'),
  });
  try {
    const pending = assert.rejects(transport.head(0));
    await entered.promise; controller.abort(); release.resolve();
    await pending; await transport.close();
    assert.equal(transport.snapshot().requests_reserved, 1);
    assert.equal(transport.snapshot().fetch_calls, 0);
  } finally { release.resolve(); await transport.close(); }
});

test('request timeout aborts the active fetch and rejects queued work without retry', { timeout: 5000 }, async () => {
  const entered = deferred();
  let aborted = false;
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits: { ...limits, requestTimeoutMs: 20 },
    fetchImpl: (unused, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(Error('PRIVATE_NETWORK_FAILURE')); }, { once: true });
      entered.resolve();
    }),
  });
  try {
    const pending = assert.rejects(transport.head(0), error => !error.message.includes('PRIVATE_NETWORK_FAILURE'));
    await entered.promise;
    const queued = assert.rejects(transport.head(0));
    await Promise.all([pending, queued]); await transport.close();
    assert.equal(aborted, true);
    assert.equal(transport.snapshot().fetch_calls, 1);
  } finally { await transport.close(); }
});

test('session deadline closes admission while an accounting callback is still draining', { timeout: 5000 }, async () => {
  const entered = deferred(), release = deferred();
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits: { ...limits, deadlineMs: 15 },
    onEvent: async () => { entered.resolve(); await release.promise; }, fetchImpl: () => assert.fail('fetch forbidden'),
  });
  try {
    const pending = assert.rejects(transport.head(0));
    await entered.promise;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(transport.snapshot().state, 'closed');
    assert.equal(transport.snapshot().active_request, true);
    release.resolve(); await pending; await transport.close();
    assert.equal(transport.snapshot().fetch_calls, 0);
  } finally { release.resolve(); await transport.close(); }
});

test('queue overflow closes the instance and does not dispatch queued work', { timeout: 5000 }, async () => {
  const entered = deferred(), release = deferred();
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits: { ...limits, maxQueued: 1 },
    fetchImpl: async () => { entered.resolve(); await release.promise; return head(); },
  });
  try {
    const first = assert.rejects(transport.head(0)); await entered.promise;
    const second = assert.rejects(transport.head(0));
    const overflow = assert.rejects(transport.head(0));
    release.resolve(); await Promise.all([first, second, overflow]); await transport.close();
    assert.equal(transport.snapshot().fetch_calls, 1);
    assert.equal(transport.snapshot().queued_requests, 0);
  } finally { release.resolve(); await transport.close(); }
});

test('owned allowlist and snapshot copies cannot be changed by the caller', async () => {
  const assets = [url];
  const transport = createOvertureAssetTransportForTest({ assetUrls: assets, limits, fetchImpl: async received => { assert.equal(received, url); return head(); } });
  try {
    assets[0] = 'https://private.invalid';
    const copy = transport.snapshot(); copy.limits.maxRequests = 0; copy.claims.wire_byte_cap_enforced = true;
    await transport.head(0);
    assert.equal(transport.snapshot().fetch_calls, 1);
    assert.equal(transport.snapshot().claims.wire_byte_cap_enforced, false);
    assert.notEqual(transport.snapshot().limits.maxRequests, 0);
  } finally { await transport.close(); }
});

test('repeated HEAD rejects source mutation and invalid ranges never start GET', async () => {
  let calls = 0;
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits, fetchImpl: async () => {
    calls++; return new Response(null, { headers: { 'content-length': '16', etag: calls === 1 ? '"fixture"' : '"changed"' } });
  } });
  try { await transport.head(0); await assert.rejects(transport.head(0)); assert.equal(calls, 2); }
  finally { await transport.close(); }
  for (const range of [{ start: -1, end: 3 }, { start: 2, end: 1 }, { start: 0, end: 16 }, { start: 0, end: Infinity }, { start: 0, end: 3, extra: true }, { get start() { assert.fail('getter forbidden'); }, end: 3 }]) {
    let fetches = 0;
    const item = createOvertureAssetTransportForTest({ assetUrls: [url], limits, fetchImpl: async () => { fetches++; return head(); } });
    try { await item.head(0); await assert.rejects(item.read(0, range, async () => {})); assert.equal(fetches, 1); }
    finally { await item.close(); }
  }
});

test('healthy queued requests are serialized and paced between fetch starts', async () => {
  const starts = []; let active = 0, maximum = 0;
  const transport = createOvertureAssetTransportForTest({ assetUrls: [url], limits: { ...limits, minIntervalMs: 40 }, fetchImpl: async () => {
    starts.push(performance.now()); active++; maximum = Math.max(maximum, active);
    await tick(); active--; return head();
  } });
  try {
    await Promise.all([transport.head(0), transport.head(0)]);
    assert.equal(maximum, 1);
    assert.ok(starts[1] - starts[0] >= 35);
  } finally { await transport.close(); }
});
