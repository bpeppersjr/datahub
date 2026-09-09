import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION } from './overture-us-places.mjs';

const NATIVE_LIMITS = Object.freeze({ maxRequests: 100000, maxBytes: 32 * 1024 ** 3, maxRangeBytes: 64 * 1024 ** 2,
  maxAssetBytes: 32 * 1024 ** 3, maxQueued: 32, minIntervalMs: 250, requestTimeoutMs: 30000, deadlineMs: 4 * 60 * 60 * 1000 });
const ERROR_MESSAGE = 'Overture asset transport rejected; inspect bounded transport counters.';
const error = () => Object.assign(new Error(ERROR_MESSAGE), { code: 'OVERTURE_ASSET_TRANSPORT_REJECTED' });
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
function fields(value, allowed, required) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(value, key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw error();
}
function urls(values) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype || values.length < 1 || values.length > 32) throw error();
  const descriptors = Object.getOwnPropertyDescriptors(values);
  if (Reflect.ownKeys(descriptors).length !== values.length + 1) throw error();
  let release;
  const result = [];
  for (let index = 0; index < values.length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') throw error();
    let url;
    try { url = new URL(descriptor.value); } catch { throw error(); }
    const match = /^\/release\/(20\d{2}-\d{2}-\d{2}\.\d+)\/theme=places\/type=place\/part-\d{5}-[0-9a-f-]+-c000\.zstd\.parquet$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
      || url.port || url.username || url.password || url.search || url.hash || url.href !== descriptor.value || !match
      || (release && release !== match[1]) || result.includes(url.href)) throw error();
    release = match[1]; result.push(url.href);
  }
  return result;
}

export function createOvertureAssetTransport(options) {
  fields(options, ['assetUrls', 'authorization', 'onEvent', 'signal'], ['assetUrls', 'authorization', 'onEvent']);
  if (options.authorization !== OVERTURE_LARGE_ACQUISITION_CONFIRMATION || typeof options.onEvent !== 'function') throw error();
  return create({ assetUrls: options.assetUrls, fetchImpl: globalThis.fetch, onEvent: options.onEvent, signal: options.signal }, false);
}

export function createOvertureAssetTransportForTest(options) {
  fields(options, ['assetUrls', 'fetchImpl', 'onEvent', 'signal', 'limits'], ['assetUrls', 'fetchImpl']);
  return create(options, true);
}

function create(options, synthetic) {
  const assets = urls(options.assetUrls);
  if (typeof options.fetchImpl !== 'function' || (options.onEvent !== undefined && typeof options.onEvent !== 'function')
    || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw error();
  const limits = { ...NATIVE_LIMITS };
  if (options.limits !== undefined) {
    if (!synthetic) throw error();
    fields(options.limits, Object.keys(limits), []);
    for (const [key, value] of Object.entries(options.limits)) {
      if (!Number.isSafeInteger(value) || value < (key === 'minIntervalMs' ? 0 : 1) || value > limits[key]) throw error();
      limits[key] = value;
    }
  }
  const executionMode = synthetic ? 'injected-test-transport' : 'native-fetch';
  const whole = new AbortController();
  const heads = new Map(), queue = [];
  let closed = false, active = null, requests = 0, fetchCalls = 0, reserved = 0, observed = 0, delivered = 0, lastStart = null;
  let closePromise = Promise.resolve();
  const snapshot = () => ({ execution_mode: executionMode, state: closed ? 'closed' : 'open', requests_reserved: requests,
    fetch_calls: fetchCalls, bytes_reserved: reserved, bytes_observed: observed, bytes_delivered: delivered, queued_requests: queue.length,
    active_request: active !== null, limits: { ...limits }, claims: { wire_byte_cap_enforced: false,
      cross_process_budget_enforced: false, durable_receipt_persisted: false, hard_process_deadline_enforced: false } });
  const check = signal => { if (closed || signal?.aborted) throw error(); };
  const onEvent = options.onEvent ?? (async () => {});
  let deadline;
  function shut() {
    if (!closed) {
      closed = true; clearTimeout(deadline); whole.abort();
      options.signal?.removeEventListener('abort', shut);
      for (const item of queue.splice(0)) item.reject(error());
    }
  }
  deadline = setTimeout(shut, limits.deadlineMs); deadline.unref?.();
  options.signal?.addEventListener('abort', shut, { once: true });
  if (options.signal?.aborted) shut();

  async function guarded(promise, signal) {
    check(signal);
    let listener;
    try {
      return await Promise.race([promise, new Promise((resolve, reject) => {
        listener = () => reject(error()); signal.addEventListener('abort', listener, { once: true });
        if (signal.aborted) listener();
      })]);
    } finally { signal.removeEventListener('abort', listener); }
  }
  async function pause(milliseconds, signal) {
    if (milliseconds <= 0) return;
    let timer;
    try { await guarded(new Promise(resolve => { timer = setTimeout(resolve, milliseconds); }), signal); }
    finally { clearTimeout(timer); }
  }
  async function cancel(body) { try { await body?.cancel(); } catch { /* No response values or remote failures escape. */ } }
  function index(value) { if (!Number.isSafeInteger(value) || value < 0 || value >= assets.length) throw error(); }
  function length(value) { if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw error(); const number = Number(value); if (!Number.isSafeInteger(number)) throw error(); return number; }
  function etag(value) { if (typeof value !== 'string' || !/^"[\x21\x23-\x7e]{1,254}"$/.test(value)) throw error(); return value; }
  async function event(type, item) {
    await onEvent({ type, execution_mode: executionMode, request_index: item.requestIndex, asset_index: item.index,
      method: item.method, reserved_bytes: item.bytes, observed_bytes: item.observed, delivered_bytes: item.delivered });
  }
  async function request(item) {
    check(whole.signal);
    if (requests >= limits.maxRequests || reserved + item.bytes > limits.maxBytes) throw error();
    requests++; reserved += item.bytes; item.requestIndex = requests;
    await event('request-reserved', item); check(whole.signal);
    if (lastStart !== null) await pause(Math.max(0, limits.minIntervalMs - (performance.now() - lastStart)), whole.signal);
    check(whole.signal);
    const local = new AbortController(), abort = () => local.abort();
    whole.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => { abort(); shut(); }, limits.requestTimeoutMs);
    let response, reader, pendingFetch, pendingRead;
    try {
      lastStart = performance.now();
      const headers = { 'Accept-Encoding': 'identity' };
      if (item.method === 'GET') { headers.Range = `bytes=${item.start}-${item.end}`; headers['If-Match'] = item.head.etag; }
      pendingFetch = Promise.resolve().then(() => { check(local.signal); fetchCalls++; return options.fetchImpl(assets[item.index], {
        method: item.method, redirect: 'manual', credentials: 'omit', headers, signal: local.signal,
      }); }).then(async value => { if (local.signal.aborted) await cancel(value?.body); return value; });
      response = await guarded(pendingFetch, local.signal);
      check(local.signal);
      if (!response || response.redirected || response.status !== (item.method === 'HEAD' ? 200 : 206)
        || (response.headers?.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')) throw error();
      const size = length(response.headers.get('content-length')), tag = etag(response.headers.get('etag'));
      if (item.method === 'HEAD') {
        if (size > limits.maxAssetBytes) throw error();
        const previous = heads.get(item.index);
        if (previous && (previous.contentLength !== size || previous.etag !== tag)) throw error();
        await cancel(response.body); response = null;
        await event('request-completed', item); check(local.signal);
        const metadata = { contentLength: size, etag: tag };
        heads.set(item.index, metadata); return { ...metadata };
      }
      if (size !== item.bytes || tag !== item.head.etag
        || response.headers.get('content-range') !== `bytes ${item.start}-${item.end}/${item.head.contentLength}`
        || !response.body?.getReader) throw error();
      reader = response.body.getReader();
      for (;;) {
        pendingRead = reader.read();
        const part = await guarded(pendingRead, local.signal); pendingRead = null; check(local.signal);
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) throw error();
        observed += part.value.byteLength; item.observed += part.value.byteLength;
        if (item.observed > item.bytes || observed > limits.maxBytes) throw error();
        // Count bytes exposed to the consumer, even when its callback subsequently fails.
        delivered += part.value.byteLength; item.delivered += part.value.byteLength;
        await item.onChunk(part.value); check(local.signal);
      }
      if (item.observed !== item.bytes) throw error();
      await event('request-completed', item); check(local.signal);
      return { start: item.start, end: item.end, bytes_observed: item.observed, bytes_delivered: item.delivered };
    } finally {
      local.abort(); clearTimeout(timeout); whole.signal.removeEventListener('abort', abort);
      if (reader) {
        await cancel(reader);
        if (pendingRead) await pendingRead.catch(() => {});
        reader.releaseLock();
      } else await cancel(response?.body);
      // Abort ends admission immediately, but the owned fetch (including any late
      // response cancellation) must settle before releasing the serial slot.
      if (pendingFetch) await pendingFetch.catch(() => {});
    }
  }
  function pump() {
    if (active || closed || !queue.length) return;
    const item = queue.shift();
    active = item;
    closePromise = request(item).then(item.resolve, () => { shut(); item.reject(error()); }).finally(() => { active = null; pump(); });
  }
  function enqueue(item) {
    if (closed) return Promise.reject(error());
    if (active && queue.length >= limits.maxQueued) { shut(); return Promise.reject(error()); }
    return new Promise((resolve, reject) => { queue.push({ ...item, observed: 0, delivered: 0, resolve, reject }); pump(); });
  }
  function invalidCall(action) {
    try { check(whole.signal); return action(); }
    catch { shut(); return Promise.reject(error()); }
  }
  return {
    head: assetIndex => invalidCall(() => { index(assetIndex); return enqueue({ method: 'HEAD', index: assetIndex, bytes: 0 }); }),
    read: (assetIndex, range, onChunk) => invalidCall(() => {
      index(assetIndex); fields(range, ['start', 'end'], ['start', 'end']);
      const head = heads.get(assetIndex), { start, end } = range;
      if (!head || typeof onChunk !== 'function' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start
        || end >= head.contentLength || end - start + 1 > limits.maxRangeBytes || end - start + 1 > limits.maxBytes) throw error();
      return enqueue({ method: 'GET', index: assetIndex, start, end, head: { ...head }, bytes: end - start + 1, onChunk });
    }),
    snapshot,
    close: async () => { shut(); await closePromise; },
  };
}
