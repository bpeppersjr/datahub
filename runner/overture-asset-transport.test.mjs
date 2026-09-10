import assert from 'node:assert/strict';
import test from 'node:test';
import { createOvertureAssetTransport, createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';

const urls = [0, 1].map(index => `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-08-19.0/theme=places/type=place/part-0000${index}-11111111-1111-4111-8111-111111111111-c000.zstd.parquet`);
const limits = { maxRequests: 10, maxBytes: 32, maxRangeBytes: 8, maxAssetBytes: 64, maxQueued: 2, minIntervalMs: 0, requestTimeoutMs: 1000, deadlineMs: 10000 };
const tag = '"fixture-v1"';
const head = (headers = {}) => new Response(null, { headers: { 'content-length': '16', etag: tag, ...headers } });
const range = (body = Uint8Array.of(1, 2, 3, 4), headers = {}, status = 206) => new Response(body, {
  status, headers: { 'content-length': '4', 'content-range': 'bytes 0-3/16', etag: tag, ...headers },
});
async function fixture(options = {}) {
  const calls = [], events = [];
  const transport = await createOvertureAssetTransportForTest({ assetUrls: [...urls], limits,
    onEvent: async event => { events.push(event); },
    fetchImpl: async (url, init) => { calls.push({ url, init }); return init.method === 'HEAD' ? head() : range(); },
    ...options,
  });
  return { transport, calls, events };
}

test('native transport requires separate authorization and rejects expanded or hostile asset lists', async () => {
  await assert.rejects(async () => createOvertureAssetTransport({ assetUrls: urls, onEvent: async () => {} }));
  for (const assetUrls of [[], [urls[0], urls[0]], ['https://private.invalid/asset'], [urls[0], urls[1].replace('2026-08-19.0', '2026-08-20.0')], [urls[0] + '?private=value']]) {
    await assert.rejects(async () => createOvertureAssetTransportForTest({ assetUrls, fetchImpl: () => assert.fail('fetch forbidden'), limits }));
  }
});

test('failure diagnostics distinguish fixed stages without retaining private error details', async () => {
  for (const mode of ['fetch', 'response-validation', 'range-validation', 'consumer-write', 'journal-completion']) {
    const { transport } = await fixture({
      fetchImpl: async (url, init) => {
        if (init.method === 'HEAD') return head();
        if (mode === 'fetch') throw Error('PRIVATE_FETCH');
        if (mode === 'response-validation') return new Response('PRIVATE_BODY', { status: 403 });
        if (mode === 'range-validation') return range(undefined, { etag: '"PRIVATE_ETAG"' });
        return range();
      },
      onEvent: async e => { if (mode === 'journal-completion' && e.method === 'GET' && e.type === 'request-completed') throw Error('PRIVATE_JOURNAL'); },
    });
    try {
      await transport.head(0);
      await assert.rejects(transport.read(0, { start: 0, end: 3 }, async () => { if (mode === 'consumer-write') throw Error('PRIVATE_SINK'); }));
      await transport.close();
      const diagnostic = transport.snapshot().failure;
      assert.equal(diagnostic.phase, mode);
      assert.equal(diagnostic.request_index, 2);
      assert.equal(diagnostic.asset_index, 0);
      assert.equal(diagnostic.method, 'GET');
      assert.equal(diagnostic.http_status, mode === 'fetch' ? null : mode === 'response-validation' ? 403 : 206);
      diagnostic.phase = 'tampered';
      assert.equal(transport.snapshot().failure.phase, mode);
      assert.ok(!JSON.stringify(transport.snapshot()).includes('PRIVATE'));
    } finally { await transport.close(); }
  }
});

test('request timeout is recorded without retaining the fetch rejection', async () => {
  const { transport } = await fixture({ limits: { ...limits, requestTimeoutMs: 20 },
    fetchImpl: async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Error('PRIVATE_TIMEOUT')), { once: true });
    }),
  });
  try {
    await assert.rejects(transport.head(0)); await transport.close();
    assert.equal(transport.snapshot().failure.request_timeout, true);
    assert.equal(transport.snapshot().failure.phase, 'fetch');
    assert.equal(transport.snapshot().failure.http_status, null);
    assert.ok(!JSON.stringify(transport.snapshot()).includes('PRIVATE_TIMEOUT'));
  } finally { await transport.close(); }
});

test('HEAD pins metadata and range GET carries only fixed conditional request headers', async () => {
  const { transport, calls, events } = await fixture();
  try {
    assert.deepEqual(await transport.head(0), { contentLength: 16, etag: tag });
    const chunks = [];
    await transport.read(0, { start: 0, end: 3 }, async chunk => { chunks.push(...chunk); });
    assert.deepEqual(chunks, [1, 2, 3, 4]);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, urls[0]);
      assert.equal(call.init.redirect, 'manual');
      assert.equal(call.init.credentials, 'omit');
      assert.equal(new Headers(call.init.headers).get('accept-encoding'), 'identity');
    }
    assert.equal(new Headers(calls[1].init.headers).get('range'), 'bytes=0-3');
    assert.equal(new Headers(calls[1].init.headers).get('if-match'), tag);
    const snapshot = transport.snapshot();
    assert.equal(snapshot.execution_mode, 'injected-test-transport');
    assert.equal(snapshot.fetch_calls, 2);
    assert.equal(snapshot.bytes_reserved, 4);
    assert.equal(snapshot.bytes_delivered, 4);
    assert.equal(snapshot.claims.wire_byte_cap_enforced, false);
    assert.equal(snapshot.claims.cross_process_budget_enforced, false);
    assert.equal(snapshot.claims.durable_receipt_persisted, false);
    assert.ok(events.some(event => event.type === 'request-reserved'));
    assert.ok(events.some(event => event.type === 'request-completed'));
  } finally { await transport.close(); }
});

test('redirects and invalid HEAD identity fail closed without a follow-up request', async () => {
  const responses = [
    () => new Response(null, { status: 302, headers: { location: 'https://private.invalid' } }),
    () => head({ etag: 'W/"weak"' }),
    () => head({ 'content-length': '0' }),
    () => head({ 'content-length': '65' }),
    () => head({ 'content-length': 'not-a-number' }),
  ];
  for (const response of responses) {
    let calls = 0;
    const { transport } = await fixture({ fetchImpl: async () => { calls++; return response(); } });
    try {
      await assert.rejects(transport.head(0));
      await assert.rejects(transport.head(1));
      assert.equal(calls, 1);
      assert.doesNotMatch(JSON.stringify(transport.snapshot()), /private\.invalid/);
    } finally { await transport.close(); }
  }
});

test('range status, encoding, identity and exact range must pass before the sink receives data', async () => {
  const responses = [
    () => range(undefined, {}, 200),
    () => range(undefined, {}, 412),
    () => range(undefined, { 'content-encoding': 'gzip' }),
    () => range(undefined, { etag: '"changed"' }),
    () => range(undefined, { 'content-range': 'bytes 0-3/17' }),
    () => range(undefined, { 'content-length': '5' }),
  ];
  for (const response of responses) {
    const { transport } = await fixture({ fetchImpl: async (url, init) => init.method === 'HEAD' ? head() : response() });
    try {
      await transport.head(0);
      await assert.rejects(transport.read(0, { start: 0, end: 3 }, () => assert.fail('sink forbidden')));
      assert.equal(transport.snapshot().bytes_delivered, 0);
    } finally { await transport.close(); }
  }
});

test('oversized chunks are not forwarded and truncated bodies cannot report success', async () => {
  for (const length of [5, 3]) {
    const { transport } = await fixture({ fetchImpl: async (url, init) => init.method === 'HEAD' ? head() : range(new Uint8Array(length)) });
    try {
      await transport.head(0);
      let delivered = 0;
      await assert.rejects(transport.read(0, { start: 0, end: 3 }, async chunk => { delivered += chunk.length; }));
      assert.equal(delivered, length === 5 ? 0 : 3);
      assert.equal(transport.snapshot().bytes_observed, length);
      assert.equal(transport.snapshot().state, 'closed');
    } finally { await transport.close(); }
  }
});

test('range and request reservations reject over-budget work before fetching', async () => {
  for (const customLimits of [{ ...limits, maxBytes: 3 }, { ...limits, maxRequests: 1 }]) {
    const { transport, calls } = await fixture({ limits: customLimits });
    try {
      await transport.head(0);
      await assert.rejects(transport.read(0, { start: 0, end: 3 }, async () => {}));
      assert.equal(calls.length, 1);
    } finally { await transport.close(); }
  }
  const { transport, calls } = await fixture();
  try {
    await assert.rejects(transport.read(0, { start: 0, end: 3 }, async () => {}));
    assert.equal(calls.length, 0);
  } finally { await transport.close(); }
});

test('a failed awaited accounting event prevents network activity and closes the transport', async () => {
  const { transport, calls } = await fixture({ onEvent: async () => { throw Error('PRIVATE_CALLBACK_DETAIL'); } });
  try {
    await assert.rejects(transport.head(0), error => !error.message.includes('PRIVATE_CALLBACK_DETAIL'));
    assert.equal(calls.length, 0);
    assert.equal(transport.snapshot().fetch_calls, 0);
    assert.equal(transport.snapshot().state, 'closed');
  } finally { await transport.close(); }
});

test('close drains the active sink and rejects queued requests without another fetch', { timeout: 5000 }, async () => {
  const { transport, calls } = await fixture();
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await transport.head(0);
    const active = assert.rejects(transport.read(0, { start: 0, end: 3 }, async () => { enter(); await gate; }));
    await entered;
    const queued = assert.rejects(transport.head(1));
    let closed = false;
    const closing = Promise.resolve(transport.close()).then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false);
    release();
    await Promise.all([active, queued, closing]);
    assert.equal(calls.length, 2);
    assert.equal(transport.snapshot().state, 'closed');
  } finally { release(); await transport.close(); }
});
