import { createHash } from 'node:crypto';
import { Readable, addAbortSignal } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { validateMnConstructionPreflight } from './mn-construction-preflight.mjs';
import { mnConstructionFailure } from './mn-construction-diagnostics.mjs';

const check = (value, reason) => { if (!value) throw new Error(`Minnesota export transport rejected: ${reason}.`); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cancel = response => { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); };
function bounded(promise, signal, late) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) { settled = true; reject(new Error('Minnesota request cancelled or timed out.')); } };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort); if (settled) { late?.(value); return; } settled = true; resolve(value);
    }, () => { signal.removeEventListener('abort', abort); if (!settled) { settled = true; reject(new Error('Minnesota request failed.')); } });
  });
}

/** Injected transport only: no default native fetch, source-use permission,
 * filesystem persistence or app enrollment. The consumer must stage until EOF.
 * EOF is withheld until post-transfer identity and the trusted finish hook pass.
 */
export function createMnConstructionExportStream(options = {}) {
  check(options && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).every(key => ['preflight','cohort','fetchImpl','signal','now','sleep','headerTimeoutMs','bodyTimeoutMs','beforeTransfer','afterTransfer'].includes(key)), 'options');
  const { cohort, fetchImpl, signal, now = () => new Date(), sleep = (ms, opts) => delay(ms, undefined, opts),
    headerTimeoutMs = 15000, bodyTimeoutMs = 120000, beforeTransfer = async () => {}, afterTransfer = async () => {} } = options;
  check(['registrations','residential'].includes(cohort) && [fetchImpl, now, sleep, beforeTransfer, afterTransfer].every(value => typeof value === 'function')
    && (signal === undefined || signal instanceof AbortSignal) && Number.isInteger(headerTimeoutMs) && headerTimeoutMs > 0 && headerTimeoutMs <= 15000
    && Number.isInteger(bodyTimeoutMs) && bodyTimeoutMs > 0 && bodyTimeoutMs <= 120000, 'runtime configuration');
  validateMnConstructionPreflight(options.preflight);
  const preflight = structuredClone(options.preflight), observation = preflight.observations[cohort === 'registrations' ? 0 : 1];
  const expected = observation.source_identity, url = observation.url;
  check(expected.file_bytes <= 50000000, '50 MB source ceiling');
  const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const clock = () => { const value = now().toISOString(); check(time(value), 'clock'); return value; };
  const fresh = at => { const current = Date.parse(at); check([preflight.started_at, preflight.finished_at, observation.observed_at].every(value => Date.parse(value) <= current && current - Date.parse(value) <= 900000), 'fresh schema prerequisite required'); };
  fresh(clock()); combined.throwIfAborted();
  let completed = null, startedAt, priorAt, calls = 0;
  const stamp = () => { const at = clock(); check(!priorAt || at >= priorAt, 'clock regressed'); priorAt = at; return at; };
  const sameIdentity = response => {
    check(response instanceof Response && !response.redirected && (!response.url || response.url === url) && response.status === 200, 'HTTP identity');
    const headers = response.headers;
    check(headers.get('content-length') === String(expected.file_bytes) && headers.get('etag') === expected.etag
      && headers.get('last-modified') === expected.last_modified && headers.get('content-type') === expected.content_type
      && (!headers.get('content-encoding') || headers.get('content-encoding') === 'identity') && !headers.has('content-range'), 'source identity drift');
  };
  async function request(method, failureCode='transport-request-failed') {
    // Pace even the first request after the caller's notice/schema prerequisites.
    await bounded(Promise.resolve().then(() => sleep(1000, { signal: combined })), combined);
    combined.throwIfAborted();
    if (method === 'GET') { await bounded(Promise.resolve().then(() => beforeTransfer({ signal: combined })), combined); combined.throwIfAborted(); fresh(stamp()); }
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), headerTimeoutMs);
    const requestSignal = AbortSignal.any([combined, deadline.signal]); let response;
    try {
      calls++;
      response = await bounded(Promise.resolve().then(() => { requestSignal.throwIfAborted(); return fetchImpl(url, {
        method, redirect: 'error', credentials: 'omit', signal: requestSignal,
        headers: { 'Accept-Encoding': 'identity', 'If-Match': expected.etag, Accept: 'text/csv, application/octet-stream' },
      }); }), requestSignal, cancel);
      requestSignal.throwIfAborted(); sameIdentity(response); return response;
    } catch(error) { cancel(response); throw mnConstructionFailure(error,failureCode); }
    finally { clearTimeout(timer); }
  }
  async function *generate() {
    let reader, response, bodyTimer, phase='transport-body-failed';
    try {
      startedAt = stamp(); fresh(startedAt);
      response = await request('HEAD'); cancel(response); response = null;
      response = await request('GET'); check(response.body, 'CSV body missing');
      bodyTimer = setTimeout(() => controller.abort(), bodyTimeoutMs);
      const bodySignal = combined;
      // Recheck after response headers: a valid pre-request decision may expire
      // while waiting for the server. No CSV bytes reach the consumer before this.
      await bounded(Promise.resolve().then(() => beforeTransfer({ signal: combined })), combined);
      combined.throwIfAborted(); fresh(stamp());
      reader = response.body.getReader(); const digest = createHash('sha256'); let size = 0;
      for (;;) {
        bodySignal.throwIfAborted(); const next = await bounded(reader.read(), bodySignal); bodySignal.throwIfAborted();
        if (next.done) break;
        check(next.value instanceof Uint8Array, 'byte body'); size += next.value.byteLength;
        check(size <= expected.file_bytes && size <= 50000000, 'consumed source ceiling');
        // Copy the view: an injected producer cannot mutate bytes already handed to the sink.
        const bytes = Buffer.from(next.value); digest.update(bytes); yield bytes;
      }
      clearTimeout(bodyTimer); bodyTimer = null;
      reader.releaseLock(); reader = null; response = null;
      check(size === expected.file_bytes, 'truncated source');
      const sourceSha256 = digest.digest('hex'), bodyFinishedAt = stamp();
      phase='transport-final-check-failed';
      response = await request('HEAD','transport-final-check-failed'); cancel(response); response = null;
      await bounded(Promise.resolve().then(() => afterTransfer({ signal: combined })), combined); combined.throwIfAborted();
      completed = Object.freeze({ schema_version: 'mn-construction-export-transport@1.0.0', cohort, url,
        started_at: startedAt, body_finished_at: bodyFinishedAt, finished_at: stamp(),
        preflight_sha256: hash(preflight), source_identity: Object.freeze({ ...expected }),
        source_bytes: size, source_file_sha256: sourceSha256, request_count: calls,
        execution_mode: 'injected-transport', native_acquisition_verified: false, source_authenticity_verified: false,
        source_use_authorized: false, app_job_enrolled: false, public_export_authorized: false });
    } catch(error) { throw mnConstructionFailure(error,phase); }
    finally { clearTimeout(bodyTimer); if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } else cancel(response); }
  }
  const stream = Readable.from(generate(), { objectMode: false, highWaterMark: 65536 });
  // Destroying the Node consumer must interrupt an ignored fetch/read, not wait
  // for an async generator's pending await before calling its return method.
  const destroy = stream._destroy.bind(stream);
  stream._destroy = (error, callback) => { controller.abort(); destroy(error, callback); };
  addAbortSignal(combined, stream);
  return Object.freeze({ stream, receipt() { check(completed && stream.readableEnded, 'transfer not successfully consumed through EOF'); return completed; } });
}
