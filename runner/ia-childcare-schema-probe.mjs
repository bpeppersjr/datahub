import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

export const IA_CHILDCARE_SCHEMA_PROBE_VERSION = 'ia-childcare-schema-probe@1.0.0';
export const IA_CHILDCARE_SCHEMA_PROBE_CONTRACT = Object.freeze({
  client_url: 'https://search.iachildcareconnect.org/js/bundle.js?v=%3C%=%20new%20Date().getTime()%20%%3E',
  client_bytes: 84473, client_sha256: 'ac4732c23c25983148de71876f4a50201bd58032d942325fd71694b7fc2df9cc',
  pins_url: 'https://search.iachildcareconnect.org/Map/pins',
  request_timeout_ms: 20000, deadline_ms: 90000, client_max_bytes: 1000000, pins_max_bytes: 10000000, max_rows: 10000,
});
const C = IA_CHILDCARE_SCHEMA_PROBE_CONTRACT;
const digest = value => createHash('sha256').update(value).digest('hex');
const CONFIG_PINS = Object.freeze({
  'config/connectors/ia-childcare-schema-probe.json': '5df37f348904ab6944a5f8c21dd40326b1225dc475d2af6816d626d64688906c',
  'config/source-policies/ia-childcare-schema-probe.json': 'b88c3b18cbf731710086f7f8acdf1e735456aac82e5221e06e66f14d949a7bdf',
});
const issuedReceipts = new WeakMap();
export function iaChildcareSchemaReceiptSnapshot(receipt) {
  const original = issuedReceipts.get(receipt);
  if (!original || JSON.stringify(receipt) !== original) throw new Error('Iowa schema receipt was not issued unchanged by this process.');
  return JSON.parse(original);
}
async function verifyConfiguration(signal) {
  for (const [relative, expected] of Object.entries(CONFIG_PINS)) {
    const value = await mnSelectionReadJson(path.join(APP_ROOT, relative), 100000, signal);
    if (digest(JSON.stringify(value)) !== expected) throw new Error('Configuration mismatch.');
  }
}
const TEST_CLIENT = Buffer.from('Iowa schema probe synthetic client fixture v1');
const knownFields = new Set(['businessType','businessName','address','city','zipCode','latitude','longitude','referral']);
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
function options(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(k => k !== 'signal')
      || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
      || (value.signal !== undefined && !(value.signal instanceof AbortSignal))) throw new Error('Invalid Iowa schema probe options.');
  return value.signal;
}
function checkAbort(signal) { if (signal.aborted) throw new Error('Iowa schema probe cancelled or timed out.'); }
async function guarded(promise, signal) {
  checkAbort(signal);
  let listener;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    listener = () => reject(new Error('Iowa schema probe cancelled or timed out.'));
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  })]); } finally { if (listener) signal.removeEventListener('abort', listener); }
}
async function cancelBody(body) {
  let timer;
  try { await Promise.race([Promise.resolve().then(() => body.cancel()).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); }
  finally { clearTimeout(timer); }
}
async function aggregate(rows, signal) {
  if (!Array.isArray(rows) || rows.length > C.max_rows) throw new Error('shape');
  const fields = new Map();
  const counts = { rows: rows.length, center_display_class: 0, other_display_class: 0, missing_display_class: 0,
    zip_missing: 0, zip5_string: 0, zip_other: 0, point_missing: 0, numeric_point_in_range: 0, point_other: 0 };
  let index = 0;
  for (const row of rows) {
    if (index++ % 256 === 0) { await yieldImmediate(); checkAbort(signal); }
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length > 128) throw new Error('shape');
    for (const [key, value] of Object.entries(row)) {
      // Unknown keys can themselves contain names or identifiers: retain only their hash, never the spelling.
      const label = knownFields.has(key) ? key : `unknown_${digest(key)}`;
      if (!fields.has(label)) fields.set(label, { field: label, present: 0, types: {} });
      if (fields.size > 128) throw new Error('field ceiling');
      const field = fields.get(label), kind = type(value);
      field.present++; field.types[kind] = (field.types[kind] || 0) + 1;
    }
    if (row.businessType === 'building') counts.center_display_class++;
    else if (row.businessType === null || row.businessType === undefined) counts.missing_display_class++;
    else counts.other_display_class++;
    if (row.zipCode === null || row.zipCode === undefined || row.zipCode === '') counts.zip_missing++;
    else if (typeof row.zipCode === 'string' && /^[0-9]{5}$/.test(row.zipCode) && row.zipCode !== '00000') counts.zip5_string++;
    else counts.zip_other++;
    if (row.latitude === null || row.latitude === undefined || row.longitude === null || row.longitude === undefined) counts.point_missing++;
    else if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180) counts.numeric_point_in_range++;
    else counts.point_other++;
  }
  return { counts, fields: [...fields.values()].sort((a,b) => a.field.localeCompare(b.field)) };
}
async function execute(transport, signal, synthetic) {
  const whole = new AbortController();
  const cancel = () => whole.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, C.deadline_ms);
  const receipt = { schema_version: IA_CHILDCARE_SCHEMA_PROBE_VERSION, execution_mode: synthetic ? 'injected-test-transport' : 'native-fetch',
    started_at: new Date().toISOString(), finished_at: null, status: 'rejected', requests: [], schema: null,
    configuration: CONFIG_PINS, claims: { collection_ready: false, source_authority_verified: false, current_business_status_verified: false,
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
        headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
        ...(method === 'POST' ? { body: '' } : {}), signal: local.signal })).then(async result => {
          if (local.signal.aborted && result?.body) await cancelBody(result.body);
          return result;
        }), local.signal);
      if (!response || !Number.isInteger(response.status)) throw new Error('response');
      entry.status = response.status;
      if (response.status !== 200 || response.redirected || !response.body?.getReader) throw new Error('status');
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
      return await aggregate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),local.signal);
    } finally {
      local.abort(); clearTimeout(timeout); whole.signal.removeEventListener('abort', abort);
      // Cancellation closes the native response; no retries, background reader, or unbounded drain.
      if (reader) { await cancelBody(reader); reader.releaseLock(); }
      else if (response?.body) await cancelBody(response.body);
    }
  }
  try {
    await verifyConfiguration(whole.signal);
    await request(C.client_url, 'GET', C.client_max_bytes, true);
    const schema = await request(C.pins_url, 'POST', C.pins_max_bytes, false);
    await request(C.client_url, 'GET', C.client_max_bytes, true);
    await verifyConfiguration(whole.signal);
    checkAbort(whole.signal); receipt.schema = schema; receipt.status = 'schema-observed-not-collection-ready';
  } catch { receipt.failure = 'Prerequisite rejected: source response, schema, limit, cancellation, or client continuity was not verified.';
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); receipt.finished_at = new Date().toISOString(); }
  issuedReceipts.set(receipt, JSON.stringify(receipt));
  return receipt;
}
export async function runIaChildcareSchemaProbe(value = {}) {
  return execute(globalThis.fetch, options(value), false);
}
// Deliberately separate API and fixed synthetic client prevent test evidence being labelled native acquisition.
export async function runIaChildcareSchemaProbeWithTestTransport(transport, value = {}) {
  if (typeof transport !== 'function') throw new Error('Invalid Iowa test transport.');
  return execute(transport, options(value), true);
}
