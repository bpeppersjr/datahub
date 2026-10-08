import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { SC_CHILDCARE_SEARCH_PAGE_URL, SC_CHILDCARE_STATIC_SCRIPT_URL, assessScChildcareStaticInterface, preflightScChildcareInterface, validateScChildcareInterfaceReceipt, writeScChildcareInterfaceReceipt, verifyScChildcareInterfaceReceiptFile, readRegisteredScChildcareInterface } from './sc-childcare-interface-assessment.mjs';

// Synthetic interface fixture, not an official export schema or retained live receipt.
const names = ['city', 'county', 'location', 'name', 'number', 'operator', 'q', 'query', 'zip'];
const ids = ['adv-city', 'adv-county', 'adv-name', 'adv-number', 'adv-operator', 'adv-zip', 'rbAll', 'rbCity', 'rbCounty', 'rbZip', 'search'];
const functions = ['applyChecks', 'createUrl', 'getSearchParameters', 'search', 'selectedValues', 'updateFilters'];
const page = () => `<html><form id="advanced-search">${names.map(name => `<input name="${name}">`).join('')}${ids.map(id => `<div id="${id}"></div>`).join('')}</form><script src="/js/providerSearch.js?v=2"></script><p>PRIVATE_SYNTHETIC_NAME</p></html>`;
const script = () => `${functions.map(name => `function ${name}() {}`).join('\n')}const searchPath = '/provider-search/?';const allPath = '/provider-search/?all=1';`;
const response = (text, kind) => new Response(text, { headers: { 'content-type': kind === 'page' ? 'text/html' : 'text/javascript' } });
const good = () => preflightScChildcareInterface({ fetchImpl: async (url, options) => {
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  assert.ok([SC_CHILDCARE_SEARCH_PAGE_URL, SC_CHILDCARE_STATIC_SCRIPT_URL].includes(url));
  return url === SC_CHILDCARE_SEARCH_PAGE_URL ? response(page(), 'page') : response(script(), 'script');
}, now: () => new Date('2026-10-07T20:00:00.000Z') });

test('SC assessment retains search markers, never presents search fields as Excel schema', async () => {
  const receipt = await good(); validateScChildcareInterfaceReceipt(receipt);
  assert.equal(receipt.responses.length, 2);
  assert.deepEqual(receipt.interface.search_control_names, names);
  assert.equal(receipt.interface.export_headers, null);
  assert.equal(receipt.interface.export_row_limit, null);
  assert.equal(receipt.claims.manual_export_schema_verified, false);
  assert.equal(receipt.claims.all_results_requests, 0);
  assert.equal(receipt.claims.provider_rows_parsed, 0);
  assert.equal(receipt.claims.portal_automation_authorized, false);
  assert.equal(JSON.stringify(receipt).includes('PRIVATE_SYNTHETIC_NAME'), false);
  assert.ok(receipt.unresolved_gates.includes('zip5-and-zip4-separation'));
});

test('SC source drift fails closed rather than following route or inventing contract', () => {
  for (const [html, js] of [
    [page().replace('advanced-search', 'other'), script()],
    [page().replace('name="county"', 'name="other"'), script()],
    [page().replace('id="rbZip"', 'id="other"'), script()],
    [page().replace('providerSearch.js?v=2', 'providerSearch.js?v=3'), script()],
    [page(), script().replace('function search()', 'function other()')],
    [page(), script().replace('/provider-search/?all=1', '/alternate/')],
    [page() + '<a>Excel</a>', script()],
    [page(), script() + 'const pageSize = 500;'],
    [' '.repeat(131073), script()],
  ]) assert.throws(() => assessScChildcareStaticInterface(html, js));
});

test('SC receipt rejects injected records, forged claims, routes and schema', async () => {
  const receipt = await good();
  for (const mutate of [
    v => { v.claims.production_admission = true; },
    v => { v.claims.provider_rows_retained = 1; },
    v => { v.claims.manual_export_schema_verified = true; },
    v => { v.interface.export_headers = names; },
    v => { v.interface.search_control_names.push('person'); },
    v => { v.responses[0].url += '?all=1'; },
    v => { v.responses[0].body = 'PRIVATE_SYNTHETIC_NAME'; },
    v => { v.unresolved_gates = []; },
  ]) { const changed = structuredClone(receipt); mutate(changed); assert.throws(() => validateScChildcareInterfaceReceipt(changed)); }
});

test('SC transport rejects caller routes before request and never retries deferred pages', async () => {
  let calls = 0;
  for (const options of [{ url: SC_CHILDCARE_SEARCH_PAGE_URL + '?all=1' }, { export: true }, { providerRows: true }]) await assert.rejects(preflightScChildcareInterface({ ...options, fetchImpl: () => { calls++; } }));
  assert.equal(calls, 0);
  await assert.rejects(preflightScChildcareInterface({ fetchImpl: () => { calls++; return new Response(null, { status: 429 }); } }), { code: 'SC_CHILDCARE_INTERFACE_DEFERRED' });
  assert.equal(calls, 1);
  await assert.rejects(preflightScChildcareInterface({ fetchImpl: async () => response(page().replace('providerSearch.js?v=2', 'providerSearch.js?v=3'), 'page') }), { code: 'SC_CHILDCARE_INTERFACE_FAILED' });
});

test('SC rejects redirects, returned JSON, malformed UTF8 and incomplete or oversized responses', async () => {
  for (const result of [
    new Response(null, { status: 302 }), Response.json({ PRIVATE_SYNTHETIC_NAME: true }),
    new Response(page(), { headers: { 'content-type': 'text/html', 'content-length': '131073' } }),
    response(' '.repeat(131073), 'page'),
    new Response(new Uint8Array([255]), { headers: { 'content-type': 'text/html' } }),
    new Response(page(), { headers: { 'content-type': 'text/html', 'content-length': String(Buffer.byteLength(page()) + 1), 'content-encoding': 'IDENTITY' } }),
  ]) await assert.rejects(preflightScChildcareInterface({ fetchImpl: async () => result }), { code: 'SC_CHILDCARE_INTERFACE_FAILED' });
});

test('SC transport cancels early, pending requests and late response without retained evidence', async () => {
  const early = new AbortController(); early.abort();
  await assert.rejects(preflightScChildcareInterface({ signal: early.signal, fetchImpl: () => assert.fail('request') }), { name: 'AbortError' });
  const controller = new AbortController(); let resolve, cancelled = 0;
  const pending = preflightScChildcareInterface({ signal: controller.signal, fetchImpl: () => new Promise(done => { resolve = done; controller.abort(); }) });
  await assert.rejects(pending, { name: 'AbortError' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, 1);
  const bodyController = new AbortController(); let bodyCancelled = 0;
  await assert.rejects(preflightScChildcareInterface({ signal: bodyController.signal, fetchImpl: async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('<html>')); setImmediate(() => bodyController.abort()); },
    cancel() { bodyCancelled++; },
  }), { headers: { 'content-type': 'text/html' } }) }), { name: 'AbortError' });
  await new Promise(done => setImmediate(done)); assert.equal(bodyCancelled, 1);
});

test('SC immutable writer permits concurrent assessments, rejects aliases and pre-abort', async () => {
  const receipt = await good(), root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/sc-interface-test-'));
  try {
    const outputRoot = path.join(root, 'receipts');
    const [first, second] = await Promise.all([writeScChildcareInterfaceReceipt(receipt, { outputRoot }), writeScChildcareInterfaceReceipt(receipt, { outputRoot })]);
    assert.notEqual(first.path, second.path); assert.deepEqual(JSON.parse(await readFile(first.path)), receipt); assert.equal((await readdir(outputRoot)).length, 2);
    await assert.rejects(writeScChildcareInterfaceReceipt(receipt, { outputRoot: APP_ROOT }));
    await assert.rejects(writeScChildcareInterfaceReceipt(receipt, { outputRoot: path.dirname(APP_ROOT) }));
    await mkdir(path.join(root, 'target')); await symlink(path.join(root, 'target'), path.join(root, 'alias'), 'junction');
    await assert.rejects(writeScChildcareInterfaceReceipt(receipt, { outputRoot: path.join(root, 'alias') }));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(writeScChildcareInterfaceReceipt(receipt, { outputRoot, signal: controller.signal }), { name: 'AbortError' });
    assert.equal((await readdir(outputRoot)).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('SC verifier checks descriptor, configuration, immutable bytes and conservative semantics', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/sc-interface-verifier-test-'));
  try {
    const receipt = await good(), saved = await writeScChildcareInterfaceReceipt(receipt, { outputRoot: path.join(root, 'receipts') });
    const expected = { path: path.relative(APP_ROOT, saved.path).split(path.sep).join('/'), bytes: saved.bytes, sha256: saved.sha256 };
    assert.equal((await verifyScChildcareInterfaceReceiptFile(saved.path, { expected })).verified, true);
    for (const changed of [{ ...expected, path: '../outside.json' }, { ...expected, bytes: expected.bytes + 1 }, { ...expected, sha256: '0'.repeat(64) }]) await assert.rejects(verifyScChildcareInterfaceReceiptFile(saved.path, { expected: changed }));
    for (const mutate of [v => { v.claims.acquisition_authorized = true; }, v => { v.configuration['config/connectors/sc-childcare-interface-assessment.json'] = '0'.repeat(64); }]) {
      const forged = structuredClone(receipt); mutate(forged);
      const file = path.join(root, `forged-${Math.random()}.json`), raw = Buffer.from(JSON.stringify(forged) + '\n');
      await writeFile(file, raw, { flag: 'wx' });
      await assert.rejects(verifyScChildcareInterfaceReceiptFile(file, { expected: { path: path.relative(APP_ROOT, file).split(path.sep).join('/'), bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') } }));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('SC registered live receipt verifies exact observation offline and keeps export held', async () => {
  const result = await readRegisteredScChildcareInterface();
  assert.equal(result.verified, true);
  assert.equal(result.receipt_bytes, 2475);
  assert.equal(result.receipt_sha256, '4dbac7dc6b19c83ed6676fc7703eb2cabc9e9d316d319c2112eadce391028bbd');
  assert.equal(result.receipt.responses[0].body_bytes, 49084);
  assert.equal(result.receipt.responses[0].body_sha256, '8f528398e60095153c6c8f46ce6beb2d1f1c20014d83469bbd407339c8c43945');
  assert.equal(result.receipt.responses[1].body_bytes, 12870);
  assert.equal(result.receipt.responses[1].body_sha256, 'ecdd323eb79b0c93b3e3f5c98b6d68fc24837037e9cfcc470d04cd067e469b63');
  assert.equal(result.registration.current_pointer, null);
  assert.equal(result.registration.production_enrollment, false);
  assert.equal(result.receipt.interface.export_headers, null);
  assert.equal(result.receipt.claims.export_requests, 0);
});

test('SC offline registration rejects modified policy, path, permissions and aborted verification', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/sc-interface-registration-test-'));
  try {
    for (const mutate of [v => { v.acquisition_authorized = true; }, v => { v.receipt.path = '../outside.json'; }, v => { v.source_responses[0].sha256 = '0'.repeat(64); }]) {
      const registration = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/sc-childcare-interface-assessment.json'))); mutate(registration);
      const registrationPath = path.join(root, `forged-${Math.random()}.json`); await writeFile(registrationPath, JSON.stringify(registration), { flag: 'wx' });
      await assert.rejects(readRegisteredScChildcareInterface({ registrationPath }));
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(readRegisteredScChildcareInterface({ signal: controller.signal }), { name: 'AbortError' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
