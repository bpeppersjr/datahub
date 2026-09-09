import http from 'node:http';
import { randomBytes } from 'node:crypto';

const failure = () => new Error('Overture loopback bridge rejected or closed.');

export async function startOvertureAssetBridge(options) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype
    || Reflect.ownKeys(options).some(key => !['transport', 'assetCount', 'signal'].includes(key))
    || Object.values(Object.getOwnPropertyDescriptors(options)).some(d => !Object.hasOwn(d, 'value'))) throw failure();
  const { transport, assetCount, signal } = options;
  if (!Number.isSafeInteger(assetCount) || assetCount < 1 || assetCount > 32
    || !transport || ['head', 'read', 'close', 'snapshot'].some(key => typeof transport[key] !== 'function')
    || (signal !== undefined && !(signal instanceof AbortSignal))) throw failure();
  if (signal?.aborted) throw failure();
  const capability = randomBytes(32).toString('hex');
  const sockets = new Set(), handlers = new Set(), metadata = new Map();
  let closed = false, closePromise, host, admitted = 0, rejected = 0, completed = 0, bytes = 0;
  const server = http.createServer({ maxHeaderSize: 8192, headersTimeout: 10000, requestTimeout: 30000 }, (request, response) => {
    if (closed || handlers.size >= 32) {
      rejected++; response.writeHead(503, { Connection: 'close', 'Content-Length': '0' }); response.end(); return;
    }
    const task = handle(request, response).catch(() => { response.destroy(); void close(); });
    handlers.add(task); void task.finally(() => handlers.delete(task));
  });
  server.maxHeadersCount = 32;
  server.maxConnections = 32;
  server.keepAliveTimeout = 1000;
  server.on('connection', socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(30000, () => { socket.destroy(); void close(); });
  });
  server.on('clientError', (error, socket) => { rejected++; socket.destroy(); });
  server.on('upgrade', (request, socket) => { rejected++; socket.destroy(); });
  function close() {
    if (closePromise) return closePromise;
    closed = true; signal?.removeEventListener('abort', onAbort);
    const stopped = new Promise(resolve => server.close(() => resolve()));
    for (const socket of sockets) socket.destroy();
    // Start transport cancellation without awaiting it inside any sink callback.
    const drainedTransport = Promise.resolve().then(() => transport.close());
    closePromise = Promise.allSettled([stopped, drainedTransport, ...handlers]).then(results => {
      if (results.some(result => result.status === 'rejected')) throw failure();
    });
    // Event-triggered shutdown has no caller, so attach a rejection observer.
    void closePromise.catch(() => {});
    return closePromise;
  }
  function onAbort() { void close(); }
  function validRequest(request) {
    if (request.headers.host !== host || !['HEAD', 'GET'].includes(request.method)
      || ['origin', 'cookie', 'authorization', 'proxy-authorization', 'transfer-encoding', 'expect'].some(key => request.headers[key] !== undefined)
      || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) return null;
    const names = request.rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
    if (new Set(names).size !== names.length) return null;
    const match = new RegExp(`^/${capability}/(0|[1-9][0-9]*)$`).exec(request.url ?? '');
    if (!match) return null;
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index) || index >= assetCount) return null;
    if (request.method === 'HEAD') return request.headers.range === undefined ? { index } : null;
    const range = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/.exec(request.headers.range ?? '');
    const head = metadata.get(index);
    if (!range || !head) return null;
    const start = Number(range[1]), end = Number(range[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end >= head.contentLength) return null;
    return { index, start, end, head };
  }
  function sendHeaders(response, status, size, etag, contentRange) {
    response.writeHead(status, { 'Content-Length': String(size), ETag: etag, 'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store',
      ...(contentRange ? { 'Content-Range': contentRange } : {}) });
  }
  async function write(response, chunk) {
    if (closed || response.destroyed) throw failure();
    if (response.write(chunk)) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => { response.off('drain', drain); response.off('close', stop); response.off('error', stop); };
      const drain = () => { cleanup(); resolve(); };
      const stop = () => { cleanup(); reject(failure()); };
      response.once('drain', drain); response.once('close', stop); response.once('error', stop);
      if (closed || response.destroyed) stop();
    });
  }
  async function handle(request, response) {
    const selected = validRequest(request);
    if (!selected) { rejected++; response.writeHead(400, { Connection: 'close', 'Content-Length': '0' }); response.end(); return; }
    admitted++;
    const disconnected = () => { if (!response.writableFinished) void close(); };
    request.once('aborted', disconnected); response.once('close', disconnected);
    try {
      if (request.method === 'HEAD') {
        // Cached HEAD is session metadata, not a freshness recheck. The upstream
        // transport must validate each GET against this HEAD's pinned identity.
        const head = metadata.get(selected.index) ?? await transport.head(selected.index);
        if (closed || !Number.isSafeInteger(head.contentLength) || head.contentLength < 1 || head.contentLength > 32 * 1024 ** 3
          || typeof head.etag !== 'string' || !/^"[\x21\x23-\x7e]{1,254}"$/.test(head.etag)) throw failure();
        metadata.set(selected.index, { contentLength: head.contentLength, etag: head.etag });
        sendHeaders(response, 200, head.contentLength, head.etag);
      } else {
        const size = selected.end - selected.start + 1;
        let delivered = 0;
        await transport.read(selected.index, { start: selected.start, end: selected.end }, async chunk => {
          if (!(chunk instanceof Uint8Array) || delivered + chunk.byteLength > size) throw failure();
          if (!response.headersSent) sendHeaders(response, 206, size, selected.head.etag, `bytes ${selected.start}-${selected.end}/${selected.head.contentLength}`);
          await write(response, chunk); delivered += chunk.byteLength; bytes += chunk.byteLength;
        });
        if (closed || delivered !== size) throw failure();
      }
      await new Promise((resolve, reject) => {
        const stop = () => { cleanup(); reject(failure()); };
        const done = () => { cleanup(); resolve(); };
        const cleanup = () => { response.off('error', stop); response.off('close', stop); response.off('finish', done); };
        response.once('error', stop); response.once('close', stop); response.once('finish', done); response.end();
      });
      completed++;
    } finally { request.off('aborted', disconnected); response.off('close', disconnected); }
  }
  try {
    await new Promise((resolve, reject) => {
      const failed = () => { server.off('listening', ready); reject(failure()); };
      const ready = () => { server.off('error', failed); resolve(); };
      server.once('error', failed); server.once('listening', ready); server.listen(0, '127.0.0.1');
    });
    host = `127.0.0.1:${server.address().port}`;
    server.on('error', () => { void close(); });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { await close(); throw failure(); }
    return { urls: Array.from({ length: assetCount }, (_, index) => `http://${host}/${capability}/${index}`), close,
      snapshot: () => ({ state: closed ? 'closed' : 'open', admitted_requests: admitted, rejected_requests: rejected, completed_requests: completed,
        active_handlers: handlers.size, open_sockets: sockets.size, bytes_written: bytes,
        claims: { acquisition_ready: false, upstream_authenticity_verified: false, durable_receipt_persisted: false, wire_byte_cap_enforced: false } }) };
  } catch { await close(); throw failure(); }
}
