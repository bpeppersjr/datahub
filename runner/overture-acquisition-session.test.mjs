import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_HTTPFS_RUNTIME as C } from './overture-httpfs-runtime.mjs';
import { probeOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { runOvertureAcquisitionSession as native, runOvertureAcquisitionSessionForTest as run } from './overture-acquisition-session.mjs';
import { inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const base = path.join(APP_ROOT, 'data/tmp/overture-session-tests'), root = path.join(base, randomUUID());
  await mkdir(root, { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), base); await rm(root, { recursive: true, force: true }); });
  const metadataId = randomUUID(), metadataOutput = path.join(root, metadataId, 'output'), release = '2026-08-19.0';
  const documents = [
    { type: 'Catalog', stac_version: '1.1.0', links: [{ rel: 'child', latest: true, href: `https://stac.overturemaps.org/${release}/catalog.json` }] },
    { type: 'Collection', id: 'place', stac_version: '1.1.0', links: [{ rel: 'item', href: `https://stac.overturemaps.org/${release}/places/place/00000/00000.json` }] },
    { type: 'Feature', id: '00000', properties: { num_rows: 1, num_row_groups: 1 }, assets: { aws: { href: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${release}/theme=places/type=place/part-00000-abcdef-c000.zstd.parquet` } } },
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
