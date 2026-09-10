import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildOkRetainedSearchWithTestTransport as build, buildOkRetainedSearch as native, readOkRetainedSearch as verify,
  readOkRetainedSearchWithTestHook } from './ok-childcare-retained-bundle.mjs';
import { okRetainedSyntheticClient } from './ok-childcare-retained-fetch.mjs';
import { okRetainedHash as hash } from './ok-childcare-retained-contract.mjs';
function transport(options = {}) {
  const calls = [];
  const run = async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    if (calls.length === options.denyAt) return new Response('PRIVATE', { status: 403 });
    if (calls.length !== 2) return new Response(options.changedClient ? 'PRIVATE' : okRetainedSyntheticClient());
    options.cancel?.abort();
    const rows = options.rows ?? [{ name: 'Synthetic', vendorId: '001', facilityType: 'childcare-center', addressLines: ['1 Test', 'Test City, OK 73102-0001'] }];
    return new Response(`<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({ page: '/providers', query: { 'zip-code': '73102', 'facility-type': 'childcare-center' }, props: { pageProps: { childcareProviders: rows } } })}</script>`, { headers: { 'content-type': 'text/html' } });
  };
  return { calls, run };
}
test('OK retained bundle journals intent, preserves rows and verifies offline without another request', async () => {
  const t = transport(), descriptor = await build(t.run); assert.equal(t.calls.length, 3);
  const checked = await verify(descriptor.manifest, descriptor.sha256);
  assert.equal(checked.manifest.status, 'accepted-internal-source-candidates'); assert.equal(checked.manifest.mode, 'synthetic-test-transport');
  assert.equal(checked.candidates.length, 1); assert.equal(checked.candidates[0].address.zip4, '0001');
  assert.equal(t.calls.length, 3); assert.equal(checked.discardedHtmlReplayed, false);
  await assert.rejects(verify(descriptor.manifest, descriptor.sha256, { requireNative: true, operationId: 'fake' }));
});
test('OK retained replay rejects rehashed derived rows, inflated coverage claims and additional private artifacts', async () => {
  const t = transport(), d = await build(t.run), directory = path.dirname(d.manifest);
  const m = JSON.parse(await readFile(d.manifest, 'utf8'));
  const candidates = JSON.parse(await readFile(path.join(directory, 'candidates.jsonl'), 'utf8'));
  candidates.address.zip_code = '90210'; const bytes = Buffer.from(`${JSON.stringify(candidates)}\n`);
  await writeFile(path.join(directory, 'candidates.jsonl'), bytes);
  Object.assign(m.artifacts[2], { bytes: bytes.length, sha256: hash(bytes) });
  const changed = Buffer.from(`${JSON.stringify(m)}\n`); await writeFile(d.manifest, changed);
  await assert.rejects(verify(d.manifest, hash(changed)));
  const other = await build(transport().run), clean = JSON.parse(await readFile(other.manifest, 'utf8'));
  clean.delivery.zip_coverage_completeness = 'complete'; const bad = Buffer.from(JSON.stringify(clean)); await writeFile(other.manifest, bad);
  await assert.rejects(verify(other.manifest, hash(bad)));
  const extra = await build(transport().run); await writeFile(path.join(path.dirname(extra.manifest), 'PRIVATE.txt'), 'PRIVATE');
  await assert.rejects(verify(extra.manifest, extra.sha256));
});
test('OK rejected and cancelled collections retain failed evidence, do not retry, and cannot become candidate releases', async () => {
  for (const options of [{ denyAt: 1 }, { changedClient: true }, { rows: [{ facilityType: 'childcare-home' }] }]) {
    const t = transport(options), d = await build(t.run), result = await verify(d.manifest, d.sha256);
    assert.equal(result.manifest.status, 'rejected'); assert.equal(result.candidates.length, 0); assert.ok(t.calls.length <= 2);
  }
  const controller = new AbortController(), t = transport({ cancel: controller });
  const d = await build(t.run, { signal: controller.signal }); assert.equal(d.cancellation_after_publication, true);
  assert.equal((await verify(d.manifest, d.sha256)).manifest.status, 'rejected'); assert.equal(t.calls.length, 2);
  const pre = transport(); await assert.rejects(build(pre.run, { signal: AbortSignal.abort() })); assert.equal(pre.calls.length, 0);
});
test('OK native builder rejects unknown transport/URL/path overrides before any work', async () => {
  for (const value of [{ transport: () => {} }, { output: 'C:/PRIVATE', operationId: 'bad' }, { url: 'PRIVATE' }])
    await assert.rejects(native(value), error => !error.message.includes('PRIVATE'));
});
test('OK cancellation during accepted writes or immediately before publication leaves no accepted manifest', async () => {
  for (const phase of ['selected-written', 'before-publication']) {
    const controller = new AbortController(); let directory;
    await assert.rejects(build(transport().run, { signal: controller.signal, hook: async event => {
      if (event.phase === phase) { directory = event.directory; controller.abort(); }
    } }));
    assert.ok(directory); await assert.rejects(stat(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
    assert.ok(await stat(path.join(directory, 'intent.json')));
  }
});
test('OK replay rejects mutation of an already-read artifact before later artifacts finish', async () => {
  const d = await build(transport().run);
  await assert.rejects(readOkRetainedSearchWithTestHook(d.manifest, d.sha256, async event => {
    if (event.name === 'selected.jsonl') await writeFile(event.file, '[]\n');
  }));
});
