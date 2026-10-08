import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { lstat, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';

export const SC_CHILDCARE_SEARCH_PAGE_URL = 'https://scchildcare.org/provider-search/';
export const SC_CHILDCARE_STATIC_SCRIPT_URL = 'https://scchildcare.org/js/providerSearch.js?v=2';
export const SC_CHILDCARE_INTERFACE_VERSION = 'sc-childcare-interface-assessment@1.0.0';
export const SC_CHILDCARE_INTERFACE_REGISTRATION_SHA256 = '2f35dfa930a700d842b8bb515c5d7697befff9f5681d6a1928bcc5113fbd117e';
const MAXIMUM = 131072;
const CONFIG_FILES = ['config/connectors/sc-childcare-interface-assessment.json', 'config/source-policies/sc-childcare-interface-assessment.json'];
const CONTROLS = ['city', 'county', 'location', 'name', 'number', 'operator', 'q', 'query', 'zip'];
const IDS = ['adv-city', 'adv-county', 'adv-name', 'adv-number', 'adv-operator', 'adv-zip', 'rbAll', 'rbCity', 'rbCounty', 'rbZip', 'search'];
const FUNCTIONS = ['applyChecks', 'createUrl', 'getSearchParameters', 'search', 'selectedValues', 'updateFilters'];
const ROUTES = ['/provider-search/?', '/provider-search/?all=1'];
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (value, reason) => { if (!value) throw Object.assign(new Error(`SC childcare interface rejected: ${reason}.`), { code: 'SC_CHILDCARE_INTERFACE_REJECTED' }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && equal(Object.keys(value).sort(), [...keys].sort());
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const claims = () => ({ network_requests: 2, provider_search_submissions: 0, all_results_requests: 0, export_requests: 0, provider_detail_requests: 0, provider_rows_parsed: 0, provider_rows_retained: 0, downloaded_script_executed: false, manual_export_schema_verified: false, row_limit_verified: false, provider_types_verified: false, snapshot_date_verified: false, current_operations_verified: false, acquisition_authorized: false, portal_automation_authorized: false, automatic_refresh_authorized: false, production_admission: false, current_pointer_written: false });
const gates = () => ['human-inspected-export-delivery-and-schema', 'manual-export-row-limit-and-selection-scope', 'automated-bulk-access-contract', 'provider-type-cohort-separation', 'family-home-address-privacy', 'publisher-snapshot-date-and-status-semantics', 'provider-number-and-row-conservation', 'zip5-and-zip4-separation', 'usage-terms-and-redistribution', 'production-admission'];

function optionsCheck(options, keys) {
  check(options && typeof options === 'object' && !Array.isArray(options) && Reflect.ownKeys(options).every(key => keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value')), 'options');
  check(options.signal === undefined || options.signal instanceof AbortSignal, 'signal');
}

async function configuration(signal) {
  return Object.fromEntries(await Promise.all(CONFIG_FILES.map(async file => [file, sha(JSON.stringify(await readJson(path.join(APP_ROOT, file), 100000, signal)))])));
}

function attributes(text, tag, key) {
  return [...text.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))].flatMap(match => {
    const attribute = new RegExp(`\\s${key}\\s*=\\s*(["'])([^"']+)\\1`, 'i').exec(match[0]);
    return attribute ? [attribute[2]] : [];
  });
}

// Only exact known interface markers survive. These are search controls, never
// Excel column names, field types, provider records or proof of export access.
export function assessScChildcareStaticInterface(page, script) {
  check(typeof page === 'string' && typeof script === 'string' && Buffer.byteLength(page) > 0 && Buffer.byteLength(page) <= MAXIMUM && Buffer.byteLength(script) > 0 && Buffer.byteLength(script) <= MAXIMUM, 'source bounds');
  check(attributes(page, 'form', 'id').includes('advanced-search'), 'advanced search form');
  const scriptSources = attributes(page, 'script', 'src');
  check(scriptSources.some(value => value === '/js/providerSearch.js?v=2' || value === SC_CHILDCARE_STATIC_SCRIPT_URL), 'fixed static script link');
  const names = [...attributes(page, 'input', 'name'), ...attributes(page, 'select', 'name')];
  const ids = attributes(page, '[a-z][a-z0-9:-]*', 'id');
  check(CONTROLS.every(value => names.includes(value)) && IDS.every(value => ids.includes(value)), 'known search controls');
  check(FUNCTIONS.every(value => new RegExp(`\\bfunction\\s+${value}\\s*\\(`).test(script)), 'known search functions');
  check(ROUTES.every(value => script.includes(value)), 'known nonexecuted search routes');
  // Finding no keyword in these two resources is only a bounded observation;
  // it cannot prove that a human-triggered result page lacks an export control.
  check(!/excel|xlsx|export|download|saveResults|pageSize|\btake\b|\blimit\b/i.test(page + '\n' + script), 'export or paging marker requires review');
  return { form_id: 'advanced-search', search_control_names: [...CONTROLS], search_element_ids: [...IDS], static_script_functions: [...FUNCTIONS], nonexecuted_search_route_literals: [...ROUTES], export_or_paging_marker_found_in_fixed_resources: false, export_headers: null, field_types: null, export_row_limit: null, provider_type_vocabulary: null, publisher_snapshot_date: null, zip5_field: null, zip4_field: null };
}

export function validateScChildcareInterfaceReceipt(receipt) {
  check(exact(receipt, ['schema_version', 'status', 'observed_at', 'configuration', 'responses', 'interface', 'unresolved_gates', 'claims']) && receipt.schema_version === SC_CHILDCARE_INTERFACE_VERSION && receipt.status === 'static-interface-assessed-manual-export-contract-unverified' && time(receipt.observed_at), 'receipt identity');
  check(exact(receipt.configuration, CONFIG_FILES) && Object.values(receipt.configuration).every(digest), 'receipt configuration');
  check(Array.isArray(receipt.responses) && receipt.responses.length === 2, 'response roster');
  for (const [index, response] of receipt.responses.entries()) check(exact(response, ['url', 'method', 'http_status', 'body_bytes', 'body_sha256']) && response.url === [SC_CHILDCARE_SEARCH_PAGE_URL, SC_CHILDCARE_STATIC_SCRIPT_URL][index] && response.method === 'GET' && response.http_status === 200 && Number.isSafeInteger(response.body_bytes) && response.body_bytes > 0 && response.body_bytes <= MAXIMUM && digest(response.body_sha256), 'response descriptor');
  const expected = { form_id: 'advanced-search', search_control_names: CONTROLS, search_element_ids: IDS, static_script_functions: FUNCTIONS, nonexecuted_search_route_literals: ROUTES, export_or_paging_marker_found_in_fixed_resources: false, export_headers: null, field_types: null, export_row_limit: null, provider_type_vocabulary: null, publisher_snapshot_date: null, zip5_field: null, zip4_field: null };
  check(equal(receipt.interface, expected) && equal(receipt.unresolved_gates, gates()) && equal(receipt.claims, claims()), 'receipt evidence or claims');
  return receipt;
}

function race(promise, signal, late = () => {}) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) { settled = true; signal.removeEventListener('abort', abort); reject(signal.reason); } };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { if (settled) { late(value); return; } settled = true; signal.removeEventListener('abort', abort); resolve(value); }, error => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); reject(error); });
  });
}
const cancel = response => { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); };

async function fixedGet(url, kind, fetchImpl, signal) {
  let response, reader;
  try {
    response = await race(Promise.resolve().then(() => { signal.throwIfAborted(); return fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: kind === 'page' ? 'text/html' : 'text/javascript, application/javascript', 'Accept-Encoding': 'identity' }, signal }); }), signal, cancel);
    check(response instanceof Response && !response.redirected && (!response.url || response.url === url), 'response identity');
    if ([429, 503].includes(response.status)) throw Object.assign(new Error('Publisher deferred.'), { code: 'SC_CHILDCARE_INTERFACE_DEFERRED' });
    const type = response.headers.get('content-type') ?? '';
    check(response.status === 200 && (kind === 'page' ? /^text\/html(?:;|$)/i : /^(?:text|application)\/javascript(?:;|$)/i).test(type), 'status or content type');
    const length = response.headers.get('content-length');
    check(length === null || /^\d+$/.test(length) && Number(length) <= MAXIMUM, 'declared response bound');
    check(response.body, 'body'); reader = response.body.getReader();
    const chunks = []; let size = 0;
    for (;;) { const item = await race(reader.read(), signal); signal.throwIfAborted(); if (item.done) break; size += item.value.byteLength; check(size <= MAXIMUM, 'streamed response bound'); chunks.push(item.value); }
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    check(length === null || encoding && encoding !== 'identity' || Number(length) === size, 'response completeness');
    const raw = Buffer.concat(chunks, size);
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(raw), descriptor: { url, method: 'GET', http_status: 200, body_bytes: size, body_sha256: sha(raw) } };
  } finally { if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } else cancel(response); }
}

export async function preflightScChildcareInterface(options = {}) {
  optionsCheck(options, ['fetchImpl', 'signal', 'now']);
  const { fetchImpl = fetch, signal, now = () => new Date() } = options;
  check(typeof fetchImpl === 'function' && typeof now === 'function', 'transport or clock'); signal?.throwIfAborted();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error('SC interface deadline.')), 30000);
  const active = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const config = await configuration(active);
    const page = await fixedGet(SC_CHILDCARE_SEARCH_PAGE_URL, 'page', fetchImpl, active);
    // Inspect only the pinned publisher script. Do not follow page links.
    check(attributes(page.text, 'script', 'src').some(value => value === '/js/providerSearch.js?v=2' || value === SC_CHILDCARE_STATIC_SCRIPT_URL), 'fixed script link');
    const script = await fixedGet(SC_CHILDCARE_STATIC_SCRIPT_URL, 'script', fetchImpl, active);
    const evidence = assessScChildcareStaticInterface(page.text, script.text);
    check(equal(config, await configuration(active)), 'configuration drift'); active.throwIfAborted();
    return validateScChildcareInterfaceReceipt({ schema_version: SC_CHILDCARE_INTERFACE_VERSION, status: 'static-interface-assessed-manual-export-contract-unverified', observed_at: now().toISOString(), configuration: config, responses: [page.descriptor, script.descriptor], interface: evidence, unresolved_gates: gates(), claims: claims() });
  } catch (error) {
    signal?.throwIfAborted();
    throw Object.assign(new Error('SC childcare interface assessment failed. Inspect the fixed public resources; manual export contract remains unverified.'), { code: error?.code === 'SC_CHILDCARE_INTERFACE_DEFERRED' ? error.code : 'SC_CHILDCARE_INTERFACE_FAILED' });
  } finally { clearTimeout(timer); }
}

export async function writeScChildcareInterfaceReceipt(receipt, options = {}) {
  optionsCheck(options, ['signal', 'outputRoot']);
  const { signal, outputRoot = path.join(APP_ROOT, 'data/business-sources/sc-childcare/interface-assessments') } = options;
  const snapshot = structuredClone(receipt); validateScChildcareInterfaceReceipt(snapshot);
  check(equal(snapshot.configuration, await configuration(signal)), 'receipt configuration drift');
  const raw = Buffer.from(JSON.stringify(snapshot) + '\n'); check(raw.length <= 100000, 'receipt bound'); signal?.throwIfAborted();
  await canonical(outputRoot, { output: true, signal }); await canonical(outputRoot, { create: true, output: true, signal });
  const directory = await lstat(outputRoot, { bigint: true }), id = randomUUID(), temporary = path.join(outputRoot, `${id}.tmp`), destination = path.join(outputRoot, `${id}.json`);
  let identity, published = false;
  const owned = value => value?.isFile() && !value.isSymbolicLink() && value.nlink === 1n && value.ino === identity?.ino && value.dev === identity?.dev;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { identity = await handle.stat({ bigint: true }); await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
    const meter = {}, reread = await readJson(temporary, 100000, signal, meter);
    validateScChildcareInterfaceReceipt(reread); check(equal(snapshot, reread) && meter.sha256 === sha(raw) && owned(meter.identity), 'written receipt');
    check(equal(snapshot.configuration, await configuration(signal)), 'publication configuration drift'); await canonical(outputRoot, { output: true, signal });
    const current = await lstat(outputRoot, { bigint: true }), file = await lstat(temporary, { bigint: true });
    check(current.ino === directory.ino && current.dev === directory.dev && owned(file) && file.size === meter.identity.size && file.mtimeNs === meter.identity.mtimeNs && file.ctimeNs === meter.identity.ctimeNs, 'publication ownership');
    signal?.throwIfAborted(); await link(temporary, destination); published = true; await unlink(temporary); check(owned(await lstat(destination, { bigint: true })), 'published receipt');
    return { path: destination, bytes: raw.length, sha256: sha(raw) };
  } catch (error) {
    if (published) throw Object.assign(new Error('SC assessment receipt may already exist; inspect before repeating.'), { code: 'SC_CHILDCARE_INTERFACE_PUBLICATION_INCOMPLETE', path: destination });
    const current = await lstat(outputRoot, { bigint: true }).catch(() => null);
    if (current?.ino === directory.ino && current?.dev === directory.dev && owned(await lstat(temporary, { bigint: true }).catch(() => null))) { await canonical(outputRoot, { output: true }); await unlink(temporary); }
    throw error;
  }
}

export async function verifyScChildcareInterfaceReceiptFile(file, options = {}) {
  optionsCheck(options, ['signal', 'expected']);
  const { signal, expected } = options;
  check(typeof file === 'string' && file === path.resolve(file) && exact(expected, ['path', 'bytes', 'sha256']) && expected.path === path.relative(APP_ROOT, file).split(path.sep).join('/') && !expected.path.startsWith('../') && Number.isSafeInteger(expected.bytes) && expected.bytes > 0 && expected.bytes <= 100000 && digest(expected.sha256), 'receipt descriptor');
  const config = await configuration(signal), meter = {}, receipt = await readJson(file, 100000, signal, meter);
  check(meter.bytes === expected.bytes && meter.sha256 === expected.sha256, 'receipt integrity'); validateScChildcareInterfaceReceipt(receipt);
  check(equal(receipt.configuration, config) && equal(config, await configuration(signal)), 'retained configuration drift'); signal?.throwIfAborted();
  return { verified: true, receipt, receipt_path: file, receipt_bytes: meter.bytes, receipt_sha256: meter.sha256 };
}

export async function readRegisteredScChildcareInterface(options = {}) {
  optionsCheck(options, ['signal', 'registrationPath']);
  const { signal, registrationPath = path.join(APP_ROOT, 'config/datasets/sc-childcare-interface-assessment.json') } = options;
  const before = {}, registration = await readJson(registrationPath, 10000, signal, before);
  check(sha(JSON.stringify(registration)) === SC_CHILDCARE_INTERFACE_REGISTRATION_SHA256, 'registered configuration pin');
  const result = await verifyScChildcareInterfaceReceiptFile(path.resolve(APP_ROOT, registration.receipt.path), { expected: registration.receipt, signal });
  check(result.receipt.observed_at === registration.observed_at && equal(result.receipt.responses.map(response => ({ url: response.url, bytes: response.body_bytes, sha256: response.body_sha256 })), registration.source_responses), 'registered observation');
  const after = {}, reread = await readJson(registrationPath, 10000, signal, after);
  check(before.sha256 === after.sha256 && equal(registration, reread), 'registration changed'); signal?.throwIfAborted();
  return { ...result, registration };
}
