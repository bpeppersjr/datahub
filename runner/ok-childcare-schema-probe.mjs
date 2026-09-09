import { createHash } from 'node:crypto';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

export const OK_CHILDCARE_SCHEMA_PROBE_VERSION = 'ok-childcare-schema-probe@1.0.0';
export const OK_CHILDCARE_SCHEMA_PROBE_CONTRACT = Object.freeze({
  client_url: 'https://childcarefind.okdhs.org/_next/static/chunks/521-358ba3d28809db82.js',
  client_bytes: 34517, client_sha256: '62305f4dac2fa558c7961faabbb5a074b245d8e73f85069029df76bf4693e217',
  results_url: 'https://childcarefind.okdhs.org/providers?zip-code=73102&facility-type=childcare-center',
  request_timeout_ms: 20000, deadline_ms: 90000, client_max_bytes: 1000000, html_max_bytes: 1000000, max_rows: 100,
});
const C = OK_CHILDCARE_SCHEMA_PROBE_CONTRACT;
const digest = value => createHash('sha256').update(value).digest('hex');
const issuedReceipts = new WeakMap();
export function okChildcareSchemaReceiptSnapshot(receipt) {
  const original = issuedReceipts.get(receipt);
  if (!original || JSON.stringify(receipt) !== original) throw new Error('Oklahoma schema receipt was not issued unchanged by this process.');
  return JSON.parse(original);
}
const TEST_CLIENT = Buffer.from('Oklahoma schema probe synthetic client fixture v1');
const knownFields = new Set(['address','addressLines','coordinates','distance','hours','facilityType','isSubsidyAccepted','name','officialDoingBusinessAs','vendorId']);
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
function options(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(k => k !== 'signal')
      || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
      || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new Error('Invalid Oklahoma schema probe options.');
  return value.signal;
}
function checkAbort(signal) { if (signal.aborted) throw new Error('Oklahoma schema probe cancelled or timed out.'); }
async function guarded(promise, signal) {
  checkAbort(signal);
  let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(new Error('Oklahoma schema probe cancelled or timed out.'));
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  })]); } finally { if (listener) signal.removeEventListener('abort', listener); }
}
async function cancelBody(body) {
  let timer;
  try { await Promise.race([Promise.resolve().then(() => body.cancel()).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); }
  finally { clearTimeout(timer); }
}
function parsePage(html) {
  const matches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(match => /(?:^|\s)id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__')/i.test(match[1]));
  if (matches.length !== 1 || !/(?:^|\s)type\s*=\s*(?:"application\/json"|'application\/json')/i.test(matches[0][1])) throw new Error('shape');
  const data = JSON.parse(matches[0][2]);
  if (!data || data.page !== '/providers' || !data.props?.pageProps || typeof data.props.pageProps !== 'object') throw new Error('shape');
  if (!data.query || Object.keys(data.query).length !== 2 || data.query['zip-code'] !== '73102' || data.query['facility-type'] !== 'childcare-center') throw new Error('query');
  return data.props.pageProps;
}
async function aggregate(html, signal) {
  const page = parsePage(html), rows = page.childcareProviders;
  if (!Array.isArray(rows) || rows.length > C.max_rows || Object.keys(page).length > 128) throw new Error('shape');
  const fields = new Map();
  const counts = { rows: rows.length, center_rows: 0, home_rows: 0, unknown_type_rows: 0, missing_type_rows: 0, unknown_field_occurrences: 0, point_missing: 0, numeric_point_in_range: 0, point_other: 0 };
  let index = 0;
  for (const row of rows) {
    if (index++ % 16 === 0) { await yieldImmediate(); checkAbort(signal); }
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length > 128) throw new Error('shape');
    for (const [key,value] of Object.entries(row)) {
      if (!knownFields.has(key)) { counts.unknown_field_occurrences++; continue; }
      if (!fields.has(key)) fields.set(key,{field:key,present:0,types:{}});
      const field = fields.get(key), kind = type(value); field.present++; field.types[kind] = (field.types[kind] || 0) + 1;
    }
    if (row.facilityType === 'childcare-center') counts.center_rows++;
    else if (row.facilityType === 'childcare-home') counts.home_rows++;
    else if (row.facilityType === undefined || row.facilityType === null) counts.missing_type_rows++;
    else counts.unknown_type_rows++;
    const point = row.coordinates;
    if (point === null || point === undefined) counts.point_missing++;
    else if (typeof point === 'object' && !Array.isArray(point) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude)<=90 && Math.abs(point.longitude)<=180) counts.numeric_point_in_range++;
    else counts.point_other++;
  }
  return {counts,fields:[...fields.values()].sort((a,b)=>a.field.localeCompare(b.field)),unknown_page_field_count:Object.keys(page).filter(key=>!['childcareProviders','mapCenter','route'].includes(key)).length,pagination:'unknown',zip_field_semantics:'unverified',center_filter_verified:rows.length>0 && counts.center_rows===rows.length};
}
async function execute(transport, signal, synthetic) {
  const whole = new AbortController();
  const cancel = () => whole.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, C.deadline_ms);
  const receipt = { schema_version: OK_CHILDCARE_SCHEMA_PROBE_VERSION, execution_mode: synthetic ? 'injected-test-transport' : 'native-fetch',
    started_at: new Date().toISOString(), finished_at: null, status: 'rejected', requests: [], schema: null,
    claims: { collection_ready: false, source_authority_verified: false, current_business_status_verified: false,
      statewide_completeness_verified: false, public_export_authorized: false, provider_values_retained: false, app_enrolled: false } };
  async function request(url, method, cap, isClient) {
    checkAbort(whole.signal);
    const local = new AbortController(), abort = () => local.abort();
    whole.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, C.request_timeout_ms);
    const entry = { method, url, status: null, decoded_bytes: 0, decoded_sha256: null, complete: false };
    receipt.requests.push(entry);
    let response, reader;
    try {
      response = await guarded(Promise.resolve().then(() => transport(url, { method, redirect: 'error', credentials: 'omit',
        headers: {}, signal: local.signal })).then(async result => {
          if (local.signal.aborted && result?.body) await cancelBody(result.body);
          return result;
        }), local.signal);
      if (!response || !Number.isInteger(response.status)) throw new Error('response');
      entry.status = response.status;
      if (response.status !== 200 || response.redirected || !response.body?.getReader) throw new Error('status');
      if (!isClient && !/^text\/html(?:\s*;|$)/i.test(response.headers?.get('content-type') ?? '')) throw new Error('content type');
      const length = response.headers?.get('content-length');
      if (length !== null && length !== undefined && (!/^[0-9]+$/.test(length) || Number(length) > cap)) throw new Error('length');
      reader = response.body.getReader();
      const chunks = [], hash = createHash('sha256');
      for (;;) {
        const part = await guarded(reader.read(), local.signal);
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) throw new Error('chunk');
        entry.decoded_bytes += part.value.byteLength;
        if (entry.decoded_bytes > cap) throw new Error('byte ceiling');
        hash.update(part.value); chunks.push(Buffer.from(part.value));
      }
      entry.decoded_sha256 = hash.digest('hex'); entry.complete = true;
      const bytes = Buffer.concat(chunks);
      if (isClient) {
        if (entry.decoded_bytes !== (synthetic ? TEST_CLIENT.length : C.client_bytes)
          || entry.decoded_sha256 !== (synthetic ? digest(TEST_CLIENT) : C.client_sha256)) throw new Error('client changed');
        return null;
      }
      return await aggregate(new TextDecoder('utf-8', { fatal: true }).decode(bytes),local.signal);
    } finally {
      local.abort(); clearTimeout(timeout); whole.signal.removeEventListener('abort', abort);
      // Cancellation closes the native response; no retries, background reader, or unbounded drain.
      if (reader) { await cancelBody(reader); reader.releaseLock(); }
      else if (response?.body) await cancelBody(response.body);
    }
  }
  try {
    await request(C.client_url, 'GET', C.client_max_bytes, true);
    const schema = await request(C.results_url, 'GET', C.html_max_bytes, false);
    await request(C.client_url, 'GET', C.client_max_bytes, true);
    checkAbort(whole.signal); receipt.schema = schema; receipt.status = 'schema-observed-not-collection-ready';
  } catch { receipt.failure = 'Prerequisite rejected: source response, schema, limit, cancellation, or client continuity was not verified.';
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); receipt.finished_at = new Date().toISOString(); }
  issuedReceipts.set(receipt, JSON.stringify(receipt));
  return receipt;
}
export async function runOkChildcareSchemaProbe(value = {}) {
  return execute(globalThis.fetch, options(value), false);
}
// Deliberately separate API and fixed synthetic client prevent test evidence being labelled native acquisition.
export async function runOkChildcareSchemaProbeWithTestTransport(transport, value = {}) {
  if (typeof transport !== 'function') throw new Error('Invalid Oklahoma test transport.');
  return execute(transport, options(value), true);
}
