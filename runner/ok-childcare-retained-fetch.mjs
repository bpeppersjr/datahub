import { OK_RETAINED_CONTRACT as C, selectOkRetainedPage, okRetainedHash } from './ok-childcare-retained-contract.mjs';

const TEST_CLIENT = Buffer.from('Oklahoma retained collector synthetic client v1');
const issued = new WeakMap();
export function okRetainedFetchSnapshot(result) {
  if (issued.get(result) !== JSON.stringify(result)) throw Error('Oklahoma retained collection was not issued unchanged.');
  return JSON.parse(issued.get(result));
}
const failure = () => new Error('Oklahoma retained collection did not complete.');
async function abortable(promise, signal) {
  signal.throwIfAborted(); let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(failure()); signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  })]); } finally { signal.removeEventListener('abort', listener); }
}
async function cancel(body) {
  if (!body) return;
  let timer;
  try { await Promise.race([Promise.resolve().then(() => body.cancel()).catch(() => {}),
    new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); } finally { clearTimeout(timer); }
}
function options(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(k => k !== 'signal')
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
    || value.signal !== undefined && !(value.signal instanceof AbortSignal)) throw failure();
  return value.signal;
}
async function execute(transport, callerSignal, synthetic) {
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), C.deadline_ms);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
  const result = { mode: synthetic ? 'synthetic-test-transport' : 'native-fetch', started_at: new Date().toISOString(),
    finished_at: null, status: 'rejected', requests: [], selected: [], delivery: null, observed_at: null };
  async function get(url, isClient) {
    signal.throwIfAborted();
    const requestTimeout = new AbortController(), requestTimer = setTimeout(() => requestTimeout.abort(), C.request_timeout_ms);
    const local = AbortSignal.any([signal, requestTimeout.signal]);
    const entry = { url, method: 'GET', status: null, decoded_bytes: 0, decoded_sha256: null, complete: false };
    result.requests.push(entry); let response, reader;
    try {
      response = await abortable(Promise.resolve().then(() => transport(url, {
        method: 'GET', redirect: 'error', credentials: 'omit', headers: {}, signal: local,
      })).then(async value => { if (local.aborted) await cancel(value?.body); return value; }), local);
      if (response && Number.isInteger(response.status)) entry.status = response.status;
      if (!response || response.status !== 200 || response.redirected || !response.body?.getReader) throw failure();
      if (!isClient && !/^text\/html(?:\s*;|$)/i.test(response.headers?.get('content-type') ?? '')) throw failure();
      const length = response.headers?.get('content-length');
      if (length != null && (!/^\d+$/.test(length) || Number(length) > C.html_max_bytes)) throw failure();
      const chunks = []; reader = response.body.getReader();
      for (;;) {
        const next = await abortable(reader.read(), local); if (next.done) break;
        if (!(next.value instanceof Uint8Array)) throw failure();
        if (entry.decoded_bytes + next.value.length > C.html_max_bytes) throw failure();
        entry.decoded_bytes += next.value.length;
        chunks.push(Buffer.from(next.value));
      }
      const bytes = Buffer.concat(chunks); entry.decoded_sha256 = okRetainedHash(bytes); entry.complete = true;
      if (isClient && (bytes.length !== (synthetic ? TEST_CLIENT.length : C.client_bytes)
        || entry.decoded_sha256 !== (synthetic ? okRetainedHash(TEST_CLIENT) : C.client_sha256))) throw failure();
      return bytes;
    } finally { requestTimeout.abort(); clearTimeout(requestTimer);
      if (reader) { await cancel(reader); reader.releaseLock(); } else await cancel(response?.body); }
  }
  try {
    await get(C.client_url, true);
    const bytes = await get(C.results_url, false), observed = new Date().toISOString();
    const parsed = selectOkRetainedPage(bytes);
    await get(C.client_url, true); signal.throwIfAborted();
    result.selected = parsed.selected; result.delivery = parsed.delivery; result.observed_at = observed;
    result.status = 'accepted-internal-source-candidates';
  } catch { result.failure = signal.aborted ? 'cancelled-or-deadline' : 'source-contract-not-satisfied';
  } finally { clearTimeout(timer); result.finished_at = new Date().toISOString(); }
  issued.set(result, JSON.stringify(result)); return result;
}
export async function collectOkRetainedSearch(value = {}) { return execute(globalThis.fetch, options(value), false); }
export async function collectOkRetainedSearchWithTestTransport(transport, value = {}) {
  if (typeof transport !== 'function') throw failure();
  return execute(transport, options(value), true);
}
export function okRetainedSyntheticClient() { return Buffer.from(TEST_CLIENT); }
