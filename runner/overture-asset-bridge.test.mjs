import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startOvertureAssetBridge } from './overture-asset-bridge.mjs';

function fixture() {
  const calls = [];
  const transport = {
    head: async index => { calls.push(['head', index]); return { contentLength: 8, etag: '"fixture"' }; },
    read: async (index, range, sink) => { calls.push(['read', index, range]); await sink(Buffer.from('abcdefgh').subarray(range.start, range.end + 1)); },
    close: async () => { calls.push(['close']); },
    snapshot: () => ({}),
  };
  return { calls, transport };
}
function request(url, { method = 'HEAD', headers = {}, pathname } = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: parsed.port, path: pathname ?? parsed.pathname, method, headers, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
}

test('complete-body client close waits for upstream receipt finalization', { timeout: 5000 }, async () => {
  for (const chunks of [['a'], ['ab', '', 'cdefgh']]) {
    const f = fixture();
    const expected = chunks.join('');
    f.transport.read = async (index, range, sink) => {
      for (const chunk of chunks) await sink(Buffer.from(chunk));
      // Model the durable request-completed journal write after the last chunk.
      await new Promise(resolve => setTimeout(resolve, 100));
    };
    const bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
    try {
      await request(bridge.urls[0]);
      const result = await request(bridge.urls[0], { method: 'GET', headers: { Range: `bytes=0-${expected.length - 1}`, Connection: 'close' } });
      assert.equal(result.body, expected);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(bridge.snapshot().state, 'open');
      assert.equal(bridge.snapshot().completed_requests, 2);
      assert.equal(bridge.snapshot().bytes_written, expected.length);
    } finally { await bridge.close(); }
  }
});

test('bridge caches HEAD and streams exact ranges with safe headers and aggregate snapshots', async () => {
  const f = fixture(), bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
  try {
    assert.equal((await request(bridge.urls[0])).status, 200);
    assert.equal((await request(bridge.urls[0])).headers.etag, '"fixture"');
    assert.equal(f.calls.filter(call => call[0] === 'head').length, 1);
    const result = await request(bridge.urls[0], { method: 'GET', headers: { Range: 'bytes=2-5' } });
    assert.equal(result.status, 206); assert.equal(result.body, 'cdef'); assert.equal(result.headers['content-range'], 'bytes 2-5/8');
    const snapshot = bridge.snapshot(); assert.equal(snapshot.bytes_written, 4); assert.equal(snapshot.claims.acquisition_ready, false);
    assert.ok(!JSON.stringify(snapshot).includes(new URL(bridge.urls[0]).pathname));
  } finally { await bridge.close(); await bridge.close(); }
  assert.equal(f.calls.filter(call => call[0] === 'close').length, 1);
});

test('malformed and unauthorized requests never access upstream', async () => {
  const f = fixture(), bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
  try {
    for (const options of [
      { method: 'POST' }, { pathname: '/wrong/0' }, { pathname: new URL(bridge.urls[0]).pathname + '?x=1' },
      { headers: { Host: 'localhost' } }, { headers: { Origin: 'http://example.com' } }, { headers: { Cookie: 'private' } },
      { headers: { Authorization: 'private' } }, { method: 'GET' }, { method: 'GET', headers: { Range: 'bytes=0-1' } },
      { headers: { 'Content-Length': '1' } },
    ]) assert.equal((await request(bridge.urls[0], options)).status, 400);
    assert.deepEqual(f.calls, []);
    await request(bridge.urls[0]);
    for (const range of ['bytes=0-', 'bytes=-2', 'bytes=0-1,3-4', 'bytes=0-8', 'bytes=01-2']) assert.equal((await request(bridge.urls[0], { method: 'GET', headers: { Range: range } })).status, 400);
    assert.equal(f.calls.filter(call => call[0] === 'read').length, 0);
  } finally { await bridge.close(); }
});

test('close aborts local sockets and waits for active transport handlers', { timeout: 5000 }, async () => {
  const f = fixture(); let entered, release;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  f.transport.head = async () => { entered(); await gate; return { contentLength: 8, etag: '"fixture"' }; };
  const bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
  try {
    const pending = request(bridge.urls[0]).catch(() => null);
    await ready;
    let closed = false; const closing = bridge.close().then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
    release(); await closing; await pending;
    assert.equal(bridge.snapshot().state, 'closed'); assert.equal(bridge.snapshot().active_handlers, 0);
  } finally { release(); await bridge.close(); }
});

test('client disconnect closes whole session without sink reentrancy deadlock', { timeout: 5000 }, async () => {
  const f = fixture(); let entered, release;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  f.transport.read = async (index, range, sink) => { entered(); await gate; await sink(Buffer.from('ab')); };
  const bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
  try {
    await request(bridge.urls[0]);
    const req = http.get(bridge.urls[0], { headers: { Range: 'bytes=0-1' }, agent: false }); req.on('error', () => {});
    await ready; req.destroy(); await new Promise(resolve => setTimeout(resolve, 20)); release(); await bridge.close();
    assert.equal(bridge.snapshot().state, 'closed');
  } finally { release(); await bridge.close(); }
});
test('preabort has fixed error and does not expose arbitrary cancellation reason', async () => {
  const controller = new AbortController(); controller.abort(Error('PRIVATE_REASON'));
  await assert.rejects(startOvertureAssetBridge({ transport: fixture().transport, assetCount: 1, signal: controller.signal }), error => !error.message.includes('PRIVATE_REASON'));
});
test('close releases a sink awaiting local socket backpressure', { timeout: 5000 }, async () => {
  const f = fixture(), size = 8 * 1024 * 1024;
  f.transport.head = async () => ({ contentLength: size, etag: '"fixture"' });
  let sinkSettled = false;
  f.transport.read = async (index, range, sink) => { try { await sink(Buffer.alloc(size)); } finally { sinkSettled = true; } };
  const bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
  try {
    await request(bridge.urls[0]);
    let received;
    const ready = new Promise(resolve => { received = resolve; });
    const req = http.get(bridge.urls[0], { headers: { Range: `bytes=0-${size - 1}` }, agent: false }, res => { res.on('error', () => {}); res.pause(); received(); });
    req.on('error', () => {});
    await ready; await bridge.close(); req.destroy();
    assert.equal(sinkSettled, true); assert.equal(bridge.snapshot().active_handlers, 0);
  } finally { await bridge.close(); }
});
test('invalid upstream metadata or overlong and short sink deliveries close the session', { timeout: 5000 }, async () => {
  for (const mode of ['metadata', 'oversize', 'short', 'finalization']) {
    const f = fixture();
    if (mode === 'metadata') f.transport.head = async () => ({ contentLength: 8, etag: 'PRIVATE_INVALID_ETAG' });
    else f.transport.read = async (index, range, sink) => {
      await sink(Buffer.from(mode === 'oversize' ? 'abc' : mode === 'finalization' ? 'ab' : 'a'));
      if (mode === 'finalization') throw Error('Synthetic journal finalization failure');
    };
    const bridge = await startOvertureAssetBridge({ transport: f.transport, assetCount: 1 });
    try {
      if (mode === 'metadata') await assert.rejects(request(bridge.urls[0]));
      else {
        await request(bridge.urls[0]);
        await assert.rejects(request(bridge.urls[0], { method: 'GET', headers: { Range: 'bytes=0-1' } }));
      }
      await bridge.close(); assert.equal(bridge.snapshot().state, 'closed');
    } finally { await bridge.close(); }
  }
});
