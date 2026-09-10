import { setTimeout as delay } from 'node:timers/promises';
import { OK_RETAINED_CONTRACT as C, okRetainedHash } from './ok-childcare-retained-contract.mjs';
import { okQueryUrl, selectOkQueryPage, OK_QUERY_VERSION } from './ok-childcare-query-contract.mjs';
import { withOkPublisherLock } from './ok-childcare-publisher-lock.mjs';

export const OK_QUERY_LIMITS = Object.freeze({ request_count: 3, request_spacing_ms: 2000,
  request_timeout_ms: C.request_timeout_ms, deadline_ms: C.deadline_ms, decoded_response_bytes: C.html_max_bytes,
  retries: 0, concurrency: 1, source_row_ceiling: C.max_rows });
const TEST_CLIENT = Buffer.from('Oklahoma multi ZIP collector synthetic client v1');
export const okQuerySyntheticClient = () => Buffer.from(TEST_CLIENT);
const fail = () => Error('Oklahoma ZIP query did not complete.');
async function guard(promise, signal) {
  signal.throwIfAborted(); let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(fail()); signal.addEventListener('abort', listener, { once: true });
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
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).some(k => !['zip5', 'signal'].includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
    || value.signal !== undefined && !(value.signal instanceof AbortSignal)) throw fail();
  okQueryUrl(value.zip5); return value;
}
async function execute(value, transport, synthetic) {
  const { zip5, signal: callerSignal } = options(value);
  callerSignal?.throwIfAborted();
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), C.deadline_ms);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
  const result = { schema_version: OK_QUERY_VERSION, zip5, mode: synthetic ? 'synthetic-test-transport' : 'native-fetch',
    started_at: new Date().toISOString(), finished_at: null, status: 'rejected', requests: [],
    selected: [], delivery: null, observed_at: null };
  async function get(url, isClient) {
    signal.throwIfAborted();
    // A gap after each completed response is stricter than start-to-start pacing.
    if (result.requests.length) await delay(synthetic ? 0 : OK_QUERY_LIMITS.request_spacing_ms, undefined, { signal });
    const timeout = new AbortController(), requestTimer = setTimeout(() => timeout.abort(), C.request_timeout_ms);
    const local = AbortSignal.any([signal, timeout.signal]);
    const entry = { url, method: 'GET', started_at: new Date().toISOString(), status: null, decoded_bytes: 0, decoded_sha256: null, complete: false };
    result.requests.push(entry); let response, reader;
    try {
      response = await guard(Promise.resolve().then(() => transport(url, {
        method: 'GET', redirect: 'error', credentials: 'omit', headers: {}, signal: local,
      })).then(async r => { if (local.aborted) await cancel(r?.body); return r; }), local);
      if (Number.isInteger(response?.status)) entry.status = response.status;
      if (!response || response.status !== 200 || response.redirected || !response.body?.getReader) throw fail();
      if (!isClient && !/^text\/html(?:\s*;|$)/i.test(response.headers?.get('content-type') ?? '')) throw fail();
      const length = response.headers?.get('content-length');
      if (length != null && (!/^\d+$/.test(length) || Number(length) > C.html_max_bytes)) throw fail();
      reader = response.body.getReader(); const chunks = [];
      for (;;) {
        const next = await guard(reader.read(), local); if (next.done) break;
        if (!(next.value instanceof Uint8Array) || entry.decoded_bytes + next.value.length > C.html_max_bytes) throw fail();
        entry.decoded_bytes += next.value.length; chunks.push(Buffer.from(next.value));
      }
      const bytes = Buffer.concat(chunks); entry.decoded_sha256 = okRetainedHash(bytes); entry.complete = true;
      if (isClient && (bytes.length !== (synthetic ? TEST_CLIENT.length : C.client_bytes)
        || entry.decoded_sha256 !== (synthetic ? okRetainedHash(TEST_CLIENT) : C.client_sha256))) throw fail();
      return bytes;
    } finally {
      timeout.abort(); clearTimeout(requestTimer);
      if (reader) { await cancel(reader); reader.releaseLock(); } else await cancel(response?.body);
    }
  }
  try {
    await get(C.client_url, true);
    const bytes = await get(okQueryUrl(zip5), false), observed = new Date().toISOString();
    const parsed = selectOkQueryPage(bytes, zip5);
    await get(C.client_url, true); signal.throwIfAborted();
    result.selected = parsed.selected; result.delivery = parsed.delivery; result.observed_at = observed;
    result.status = 'accepted-internal-source-candidates';
  } catch { result.failure = signal.aborted ? 'cancelled-or-deadline' : 'source-contract-not-satisfied';
  } finally { clearTimeout(timer); result.finished_at = new Date().toISOString(); }
  return result;
}
export async function collectOkZipQuery(value) {
  const parsed = options(value);
  return withOkPublisherLock(parsed.signal, () => execute(parsed, globalThis.fetch, false));
}
export async function collectOkZipQueryWithTestTransport(value, transport) {
  if (typeof transport !== 'function') throw fail();
  return execute(value, transport, true);
}
