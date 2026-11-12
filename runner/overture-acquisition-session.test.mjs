import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { gunzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C } from './overture-httpfs-runtime.mjs';
import { probeOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { runOvertureAcquisitionSession as native, runOvertureAcquisitionSessionForTest as run } from './overture-acquisition-session.mjs';
import { inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { runCheckpointedAcquisitionForTest as runCheckpointed } from './overture-checkpointed-acquisition.mjs';
import { readOvertureAcquisitionSessionForTest, OVERTURE_ENGINE_RECEIPT_SETTINGS as SETTINGS } from './overture-acquisition-receipt.mjs';
import { OVERTURE_SELECTED_FIELDS, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';
import { writeOvertureSelectedOutputForTest } from './overture-selected-output.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t, assetCount = 1) {
  const base = path.join(APP_ROOT, 'data/tmp/overture-session-tests'), root = path.join(base, randomUUID());
  await mkdir(root, { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), base); await rm(root, { recursive: true, force: true }); });
  const metadataId = randomUUID(), metadataOutput = path.join(root, metadataId, 'output'), release = '2026-08-19.0';
  const items = Array.from({ length: assetCount }, (_, index) => String(index).padStart(5, '0'));
  const documents = [
    { type: 'Catalog', stac_version: '1.1.0', links: [{ rel: 'child', latest: true, href: `https://stac.overturemaps.org/${release}/catalog.json` }] },
    { type: 'Collection', id: 'place', stac_version: '1.1.0', links: items.map(id => ({ rel: 'item', href: `https://stac.overturemaps.org/${release}/places/place/${id}/${id}.json` })) },
    ...items.map(id => ({ type: 'Feature', id, properties: { num_rows: 1, num_row_groups: 1 },
      assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-${id}-abcdef-c000.zstd.parquet` } } })),
  ];
  const metadataDescriptor = await probeOvertureSourcePreflightForTest({ output: metadataOutput, operationId: metadataId, limits: { minIntervalMs: 0 }, fetchImpl: async () => Response.json(documents.shift()) });
  const runtimeId = randomUUID(), runtimeRun = randomUUID(), runtimeOutput = path.join(root, runtimeId, 'output'), directory = path.join(runtimeOutput, 'jobs', runtimeRun);
  for (const name of ['home', 'extensions', 'spill']) await mkdir(path.join(directory, name), { recursive: true });
  // Structural nonexecuting fixture: fake bytes are only read for integrity, never loaded by these unit tests.
  const artifacts = [];
  for (const name of ['httpfs.duckdb_extension.gz', 'httpfs.duckdb_extension']) {
    const bytes = Buffer.from('FABRICATED UNIT TEST ONLY ' + name); await writeFile(path.join(directory, name), bytes);
    artifacts.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const now = new Date().toISOString(), manifest = { schema_version: C.version, run_id: runtimeRun, operation_id: runtimeId,
    execution_mode: 'native-core-signature-checked-local-load', status: C.status, started_at: now, completed_at: now, source_url: C.url,
    package_version: C.package_version, engine_version: C.engine_version, platform: C.platform, artifacts,
    claims: { acquisitionReady: false, place_acquisition_performed: false, public_export_authorized: false, hard_process_deadline_enforced: false, engine_memory_is_process_ram_cap: false } };
  const raw = JSON.stringify(manifest), filename = path.join(directory, 'manifest.json'); await writeFile(filename, raw);
  const operationId = randomUUID(), output = path.join(root, operationId, 'output');
  return { output, operationId, metadata: { output: metadataOutput, operation_id: metadataId, descriptor: metadataDescriptor },
    runtime: { output: runtimeOutput, operation_id: runtimeId, descriptor: { run_id: runtimeRun, operation_id: runtimeId, manifest: filename, sha256: hash(raw), status: C.status, cancellation_after_publication: false } },
    fetchImpl: async () => assert.fail('unexpected source request'), runEngine: async () => assert.fail('unexpected engine') };
}

test('session admission rejects unauthorized native calls and expanded or cancelled test calls before acquisition', async t => {
  const options = await fixture(t); let calls = 0; options.fetchImpl = async () => { calls++; assert.fail('invalid admission fetched'); };
  for (const input of [{}, { ...options, authorization: 'not-approved' }, { ...options, authorization: undefined }]) await assert.rejects(native(input));
  for (const input of [{ ...options, url: 'https://private.invalid' }, { ...options, metadata: { ...options.metadata, descriptor: { ...options.metadata.descriptor, cancellation_after_publication: true } } },
    { ...options, operationId: options.metadata.operation_id }, { ...options, signal: AbortSignal.abort() }]) await assert.rejects(run(input));
  assert.equal(calls, 0); await assert.rejects(readdir(options.output), { code: 'ENOENT' });
});

test('source failure retains source-bound plan and incomplete accounting without a final manifest', async t => {
  const options = await fixture(t); let calls = 0;
  options.fetchImpl = async () => { calls++; return new Response('PRIVATE_SOURCE_ERROR', { status: 403 }); };
  await assert.rejects(run(options), error => !error.message.includes('PRIVATE_SOURCE_ERROR') && error.recovery === undefined);
  assert.equal(calls, 1);
  const jobs = path.join(options.output, 'jobs'), runs = await readdir(jobs); assert.equal(runs.length, 1);
  const directory = path.join(jobs, runs[0]);
  const plan = JSON.parse(await readFile(path.join(directory, 'plan.json'), 'utf8'));
  assert.equal(plan.metadata_reference.descriptor.sha256, options.metadata.descriptor.sha256);
  assert.equal(plan.asset_urls.length, 1); await assert.rejects(readFile(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
  const journals = await readdir(path.join(directory, 'journal'));
  const accounting = await inspectOvertureAcquisitionJournal(path.join(directory, 'journal', journals[0]), { operationId: options.operationId });
  assert.equal(accounting.counters.requests_reserved, 1); assert.equal(accounting.counters.requests_completed, 0); assert.equal(accounting.pending_request, 1);
  const diagnostic = JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8'));
  assert.equal(diagnostic.schema_version, 'overture-acquisition-failure@1.0.0');
  assert.equal(diagnostic.operation_id, options.operationId);
  assert.equal(diagnostic.phase, 'asset-heads');
  assert.equal(diagnostic.transport.failure.phase, 'response-validation');
  assert.equal(diagnostic.transport.failure.http_status, 403);
  assert.equal(diagnostic.snapshot_ready, false);
  assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_SOURCE_ERROR'));
});

test('engine failure closes bridge and transport and preserves only non-success evidence', async t => {
  const options = await fixture(t); let privateUrl, calls = 0;
  options.fetchImpl = async () => { calls++; return new Response(null, { headers: { etag: '"fixture"', 'content-length': '1' } }); };
  options.runEngine = async ({ bridgeUrls }) => { privateUrl = bridgeUrls[0]; throw Error('PRIVATE_CAPABILITY ' + privateUrl); };
  await assert.rejects(run(options), error => !error.message.includes('PRIVATE_CAPABILITY') && !error.message.includes(privateUrl));
  assert.equal(calls, 1);
  await assert.rejects(fetch(privateUrl));
  const jobs = path.join(options.output, 'jobs'), runs = await readdir(jobs);
  const directory = path.join(jobs, runs[0]); await assert.rejects(readFile(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
  const journals = await readdir(path.join(directory, 'journal'));
  const accounting = await inspectOvertureAcquisitionJournal(path.join(directory, 'journal', journals[0]), { operationId: options.operationId });
  assert.equal(accounting.pending_request, null); assert.equal(accounting.counters.requests_completed, 1);
  const diagnostic = JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8'));
  assert.equal(diagnostic.phase, 'engine');
  assert.equal(diagnostic.bridge.state, 'closed');
  assert.equal(diagnostic.transport.failure, null);
  assert.ok(!JSON.stringify(diagnostic).includes(privateUrl));
  assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_CAPABILITY'));
});

test('session cancellation drains late source fetch before releasing the worker', { timeout: 5000 }, async t => {
  const options = await fixture(t), controller = new AbortController(); let release, entered, cancelled = false, settled = false;
  const gate = new Promise(resolve => { release = resolve; }), ready = new Promise(resolve => { entered = resolve; });
  options.signal = controller.signal;
  options.fetchImpl = async () => { entered(); await gate; return new Response(new ReadableStream({ cancel() { cancelled = true; } })); };
  const pending = run(options).finally(() => { settled = true; }), rejected = assert.rejects(pending);
  try { await ready; controller.abort(); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false); }
  finally { release(); }
  await rejected; assert.equal(cancelled, true);
  const jobs = path.join(options.output, 'jobs'), [runId] = await readdir(jobs);
  const diagnostic = JSON.parse(await readFile(path.join(jobs, runId, 'failure.json'), 'utf8'));
  assert.equal(diagnostic.cancellation_requested, true);
  assert.equal(diagnostic.transport.active_request, false);
});

test('failure diagnostic cannot overwrite existing evidence or mask the original fixed failure', async t => {
  const options = await fixture(t); let file;
  options.fetchImpl = async () => new Response(null, { headers: { etag: '"fixture"', 'content-length': '1' } });
  options.runEngine = async ({ output }) => {
    file = path.join(path.dirname(output), 'failure.json');
    await writeFile(file, 'EXISTING_EVIDENCE', { flag: 'wx' });
    throw Error('PRIVATE_PROCESSING_FAILURE');
  };
  await assert.rejects(run(options), error => !error.message.includes('PRIVATE_PROCESSING_FAILURE') && error.recovery === undefined);
  assert.equal(await readFile(file, 'utf8'), 'EXISTING_EVIDENCE');
  await assert.rejects(readFile(path.join(path.dirname(file), 'manifest.json')), { code: 'ENOENT' });
});

test('acquisition CLI help and malformed authorization cannot start a download', () => {
  const script = path.join(APP_ROOT, 'scripts/run-overture-acquisition-session.mjs');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /No automatic prerequisite downloads/);
  for (const args of [[], ['--authorization', 'PRIVATE'], ['--output', 'PRIVATE', '--output', 'PRIVATE']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('PRIVATE'));
  }
});

async function fakeEngine({ output, bridgeUrls, signal }) {
  const directory = path.join(output, randomUUID());
  for (const name of ['home', 'extensions', 'spill', 'selected']) await mkdir(path.join(directory, name), { recursive: true });
  const head = await fetch(bridgeUrls[0], { method: 'HEAD', signal });
  if (head.status !== 200) throw Error('fixture HEAD failed');
  const response = await fetch(bridgeUrls[0], { headers: { Range: 'bytes=0-0' }, signal });
  if (response.status !== 206) throw Error('fixture range failed');
  const row = Object.fromEntries(OVERTURE_SELECTED_FIELDS.map(field => [field, null]));
  row.address_country = 'US';
  row.id = await response.text();
  const selected = await writeOvertureSelectedOutputForTest({ output: path.join(directory, 'selected'), signal,
    limits: { minFreeBytes: 0 }, rows: (async function* () { yield JSON.stringify(row); })() });
  return { directory, selected, query_fingerprint: overtureStreamingQueryFingerprint(1), engine_settings: SETTINGS };
}

function fakeFetch(url, { method, headers }, etag = '"fixture"') {
  const index = Number(/part-(\d+)-/.exec(url)[1]);
  if (method === 'HEAD') return new Response(null, { headers: { etag, 'content-length': '1' } });
  if (headers.Range !== 'bytes=0-0' || headers['If-Match'] !== etag) throw Error('fixture identity not pinned');
  return new Response(String(index), { status: 206, headers: { etag, 'content-length': '1', 'content-range': 'bytes 0-0/1' } });
}

function newAttempt(options, extra = {}) {
  const operationId = randomUUID();
  return { ...options, output: path.join(path.dirname(path.dirname(options.output)), operationId, 'output'), operationId, ...extra };
}

async function failedAttempt(options, status = 'FAILED') {
  const raw = JSON.stringify({ id: options.operationId, kind: 'source-acquisition', status,
    details: { sourceId: 'overture-us-places', metadata: options.metadata, runtime: options.runtime, ...(options.resume ? { resume: options.resume } : {}) },
    result: { snapshotReady: false } });
  await writeFile(path.join(path.dirname(options.output), 'receipt.json'), raw);
  return { operationId: options.operationId, receiptSha256: hash(raw) };
}

async function runDirectory(options) {
  const jobs = path.join(options.output, 'jobs'), runs = await readdir(jobs);
  assert.equal(runs.length, 1);
  return path.join(jobs, runs[0]);
}

test('checkpointed recovery verifies retained bytes before any fetch and preserves pinned identity across a torn journal tail', async t => {
  const options = await fixture(t, 3), calls = [];
  options.runEngine = fakeEngine;
  options.fetchImpl = async (url, request) => {
    const index = Number(/part-(\d+)-/.exec(url)[1]);
    calls.push([index, request.method]);
    if (index === 1 && request.method === 'GET') return new Response(null, { status: 503 });
    return fakeFetch(url, request);
  };
  await assert.rejects(runCheckpointed(options));
  assert.deepEqual(calls, [[0, 'HEAD'], [0, 'GET'], [1, 'HEAD'], [1, 'GET']]);
  const directory = await runDirectory(options), asset = path.join(directory, 'assets', '00');
  const checkpoint = JSON.parse(await readFile(path.join(asset, 'checkpoint.json'), 'utf8'));
  const selectedPath = path.join(asset, checkpoint.selected.path), selected = await readFile(selectedPath);
  const incomplete = path.join(directory, 'assets', '01', 'journal'), [journal] = await readdir(incomplete);
  await appendFile(path.join(incomplete, journal, 'events.jsonl'), '{"type":"request-completed"');
  const resume = await failedAttempt(options);

  calls.length = 0;
  await writeFile(selectedPath, Buffer.alloc(selected.length));
  const damaged = newAttempt(options, { resume, fetchImpl: async () => assert.fail('corrupt checkpoint fetched') });
  await assert.rejects(runCheckpointed(damaged));
  await assert.rejects(readdir(damaged.output), { code: 'ENOENT' });
  await writeFile(selectedPath, selected);

  const changed = newAttempt(options, { resume, fetchImpl: async (url, request) => {
    calls.push(request.method); return fakeFetch(url, request, '"changed"');
  } });
  await assert.rejects(runCheckpointed(changed));
  assert.deepEqual(calls, ['HEAD']);
  const successor = await failedAttempt(changed);
  await assert.rejects(runCheckpointed(newAttempt(options, { resume, fetchImpl: async () => assert.fail('branched recovery fetched') })));

  calls.length = 0;
  const recovered = newAttempt(options, { resume: successor, fetchImpl: async (url, request) => {
    calls.push([Number(/part-(\d+)-/.exec(url)[1]), request.method]); return fakeFetch(url, request);
  } });
  const descriptor = await runCheckpointed(recovered);
  assert.deepEqual(calls, [[1, 'HEAD'], [1, 'GET'], [2, 'HEAD'], [2, 'GET']]);
  const verified = await readOvertureAcquisitionSessionForTest(descriptor, { output: recovered.output, operationId: recovered.operationId });
  assert.equal(verified.manifest.journal.checkpoints[0].operation_id, options.operationId);
  assert.deepEqual(verified.manifest.journal.lineage_budget, { requests_reserved: 9, bytes_reserved: 4 });
  const final = await readFile(path.join(path.dirname(descriptor.manifest), verified.manifest.selected.path));
  assert.deepEqual(gunzipSync(final).toString().trim().split('\n').map(line => JSON.parse(line).id), ['0', '1', '2']);
  assert.deepEqual(await readFile(selectedPath), selected);

  // A cancellation after the last checkpoint can be recovered entirely from
  // the private lineage, even if the manager did not admit the final manifest.
  const allRetained = await failedAttempt(recovered, 'CANCELLED');
  const local = newAttempt(options, { resume: allRetained, fetchImpl: async () => assert.fail('completed recovery fetched') });
  const localDescriptor = await runCheckpointed(local);
  const localProof = await readOvertureAcquisitionSessionForTest(localDescriptor, { output: local.output, operationId: local.operationId });
  assert.deepEqual(localProof.manifest.journal, verified.manifest.journal);
  assert.deepEqual(localProof.manifest.selected, verified.manifest.selected);
});

test('a killed worker releases the cross-process lock and its verified asset is reused after restart', { timeout: 20000 }, async t => {
  const options = await fixture(t, 2);
  const script = `
    import path from 'node:path';
    import { randomUUID } from 'node:crypto';
    import { mkdir } from 'node:fs/promises';
    import { OVERTURE_ENGINE_RECEIPT_SETTINGS as SETTINGS } from './runner/overture-acquisition-receipt.mjs';
    import { OVERTURE_SELECTED_FIELDS, overtureStreamingQueryFingerprint } from './runner/overture-us-places.mjs';
    import { writeOvertureSelectedOutputForTest } from './runner/overture-selected-output.mjs';
    import { runCheckpointedAcquisitionForTest as run } from './runner/overture-checkpointed-acquisition.mjs';
    const fakeFetch = ${fakeFetch.toString()}, fakeEngine = ${fakeEngine.toString()};
    const options = JSON.parse(process.argv[1]);
    await run({ ...options, runEngine: fakeEngine, fetchImpl: async (url, request) => {
      if (url.includes('part-00001-')) {
        process.send('second-head');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
      return fakeFetch(url, request);
    } });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(options)],
    { cwd: APP_ROOT, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  const message = await Promise.race([once(child, 'message').then(([value]) => value), exited.then(() => assert.fail(stderr))]);
  assert.equal(message, 'second-head');
  const competing = newAttempt(options, { fetchImpl: async () => assert.fail('parallel worker fetched') });
  await assert.rejects(runCheckpointed(competing));
  await assert.rejects(readdir(competing.output), { code: 'ENOENT' });
  assert.equal(child.kill('SIGKILL'), true); await exited;
  const resume = await failedAttempt(options);
  const requests = [], recovered = newAttempt(options, { resume, runEngine: fakeEngine, fetchImpl: async (url, request) => {
    requests.push(url);
    return fakeFetch(url, request);
  } });
  const descriptor = await runCheckpointed(recovered);
  const verified = await readOvertureAcquisitionSessionForTest(descriptor, { output: recovered.output, operationId: recovered.operationId });
  assert.equal(verified.manifest.journal.checkpoints[0].operation_id, options.operationId);
  assert.equal(verified.manifest.journal.lineage_budget.requests_reserved, 5);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => url.includes('part-00001-')));
});

test('checkpointed cancellation drains the source and retains only the completed asset', { timeout: 15000 }, async t => {
  const options = await fixture(t, 2), controller = new AbortController();
  let enter, release, lateResponseClosed = false;
  const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
  options.signal = controller.signal;
  options.runEngine = fakeEngine;
  options.fetchImpl = async (url, request) => {
    if (url.includes('part-00000-')) return fakeFetch(url, request);
    enter();
    await gate;
    return new Response(new ReadableStream({ cancel() { lateResponseClosed = true; } }));
  };
  const rejected = assert.rejects(runCheckpointed(options));
  try {
    await entered;
    controller.abort();
    const competing = newAttempt(options, { signal: undefined, fetchImpl: async () => assert.fail('cancelled worker released its lock early') });
    await assert.rejects(runCheckpointed(competing));
    await assert.rejects(readdir(competing.output), { code: 'ENOENT' });
  } finally { release(); }
  await rejected;
  assert.equal(lateResponseClosed, true);
  const directory = await runDirectory(options);
  await readFile(path.join(directory, 'assets', '00', 'checkpoint.json'));
  await assert.rejects(readFile(path.join(directory, 'assets', '01', 'checkpoint.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
  const diagnostic = JSON.parse(await readFile(path.join(directory, 'failure.json'), 'utf8'));
  assert.equal(diagnostic.cancellation_requested, true);
  assert.equal(diagnostic.transport.active_request, false);
});
