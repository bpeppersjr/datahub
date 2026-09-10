import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rm, readdir, lstat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { APP_ROOT } from './paths.mjs';
import { OVERTURE_SELECTED_FIELDS } from './overture-us-places.mjs';
import { runOvertureNormalizationSession as native, readOvertureNormalizationSession as nativeRead, runOvertureNormalizationSessionForTest as run, readOvertureNormalizationSessionForTest as read } from './overture-normalization-session.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
async function fixture(t) {
  const root = path.join(APP_ROOT, 'data/tmp/overture-normalization-session-tests', randomUUID());
  await mkdir(path.join(root, 'baseline/derived'), { recursive: true });
  t.after(async () => { assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp/overture-normalization-session-tests')); await rm(root, { recursive: true, force: true }); });
  const artifacts = [];
  async function artifact(name, bytes, extra) { await writeFile(path.join(root, 'baseline', name), bytes); artifacts.push({ path: name, bytes: bytes.length, sha256: hash(bytes), ...extra }); }
  await artifact('derived/zip-coverage.jsonl', Buffer.from(JSON.stringify({ zip_code: '60601', coverage_status: 'zbp-and-zcta', current_usps_validity: { status: 'unverified' } }) + '\n'), { record_count: 1 });
  await artifact('derived/naics-coverage.jsonl', Buffer.alloc(0), { record_count: 0 });
  for (let i = 0; i < 10; i++) await artifact(`derived/detail-${i}.gz`, gzipSync(''), { record_count: 0, artifact_type: 'normalized-zbp-naics-csv-gzip' });
  const baseline = { dataset_id: 'census-zbp-baseline', release_id: 'synthetic-zbp', status: 'published', complete_national_release: true, reference_year: 2023, artifacts,
    coverage: { union_zip_codes: 1, zbp_and_zcta: 1, zbp_without_zcta: 0, zcta_without_published_zbp: 0, published_naics_codes: 0, industry_detail_rows: 0 } };
  const baselineRaw = JSON.stringify(baseline), baselineFile = path.join(root, 'baseline/manifest.json'); await writeFile(baselineFile, baselineRaw);
  const source = Object.fromEntries(OVERTURE_SELECTED_FIELDS.map(k => [k, null]));
  Object.assign(source, { id: '11111111-1111-4111-8111-111111111111', version: 1, primary_name: 'Synthetic receipt-bound fixture', taxonomy_primary: 'cafe', taxonomy_hierarchy: ['food_and_drink', 'cafe'], address_country: 'US', address_postcode: '60601-1234', latitude: 0, longitude: 0, sources: [{ dataset: 'meta', record_id: 'fixture' }] });
  const raw = gzipSync(JSON.stringify(source) + '\n'), sourceFile = path.join(root, 'selected.gz'); await writeFile(sourceFile, raw);
  const operationId = randomUUID(), acquisitionId = randomUUID();
  const options = { output: path.join(root, operationId, 'output'), operationId, acquisition: { operationId: acquisitionId, receiptSha256: 'a'.repeat(64) }, baseline: { manifest: baselineFile, sha256: hash(baselineRaw) } };
  const input = { sourceFile, metadataReference: { descriptor: {}, output: root, operation_id: randomUUID() }, acquisitionCompletedAt: '2026-09-03T00:00:00.000Z', queryFingerprint: 'b'.repeat(64),
    binding: { schema_version: 'overture-normalization-acquisition-binding@1', validation_mode: 'synthetic-test-only', acquisition_operation_id: acquisitionId, operation_receipt_sha256: options.acquisition.receiptSha256,
      selected_sha256: hash(raw), selected_bytes: raw.length, selected_records: 1, normalized_published: false, source_authenticity_proven: false } };
  let calls = 0;
  const adapters = { readInput: async () => { calls++; return structuredClone(input); }, readMetadata: async () => ({ manifest: { result: { release_id: '2026-08-19.0', assets: [{ datetime: '2026-08-19T00:00:00Z' }], stac_fingerprint: 'c'.repeat(64) } } }) };
  return { root, options, adapters, input, calls: () => calls };
}
test('retained session links acquisition binding to actual copied and replayed normalized output', async t => {
  const f = await fixture(t), descriptor = await run(f.options, f.adapters);
  const result = await read(descriptor, { output: f.options.output, operationId: f.options.operationId }, f.adapters);
  assert.equal(result.normalized.coverage.normalized_places, 1);
  assert.deepEqual(result.receipt.acquisition_binding, f.input.binding);
  assert.equal(result.receipt.published, false);
  assert.ok(f.calls() >= 6);
  await assert.rejects(nativeRead(descriptor, { output: f.options.output, operationId: f.options.operationId }));
  const extra = path.join(path.dirname(descriptor.manifest), 'unlisted'); await writeFile(extra, 'synthetic');
  await assert.rejects(read(descriptor, { output: f.options.output, operationId: f.options.operationId }, f.adapters)); await rm(extra);
  await assert.rejects(lstat(path.join(path.dirname(descriptor.manifest), 'normalization/current.json')), { code: 'ENOENT' });
  const normalizedFile = result.normalizedManifest, manifest = JSON.parse(await readFile(normalizedFile, 'utf8'));
  const artifact = manifest.artifacts.find(a => a.path === 'source/source-metadata.json'), file = path.join(path.dirname(normalizedFile), artifact.path);
  const metadata = JSON.parse(await readFile(file, 'utf8')); metadata.stac_fingerprint = 'd'.repeat(64);
  const altered = JSON.stringify(metadata); await writeFile(file, altered); artifact.bytes = Buffer.byteLength(altered); artifact.sha256 = hash(altered);
  const manifestRaw = JSON.stringify(manifest); await writeFile(normalizedFile, manifestRaw);
  const receipt = result.receipt; receipt.normalized.manifest_sha256 = hash(manifestRaw);
  const receiptRaw = JSON.stringify(receipt); await writeFile(descriptor.manifest, receiptRaw); descriptor.sha256 = hash(receiptRaw);
  await assert.rejects(read(descriptor, { output: f.options.output, operationId: f.options.operationId }, f.adapters), /normalization session rejected/);
});
test('rehashed copied baseline must still match the original pinned Census artifact', async t => {
  const f = await fixture(t), descriptor = await run(f.options, f.adapters);
  const options = { output: f.options.output, operationId: f.options.operationId };
  const result = await read(descriptor, options, f.adapters);
  const manifest = result.normalized;
  const artifact = manifest.artifacts.find(a => a.artifact_type === 'overture-normalization-baseline');
  const file = path.join(path.dirname(result.normalizedManifest), artifact.path);
  const row = JSON.parse(await readFile(file, 'utf8'));
  row.postal_label = { preferred_state: 'AA' };
  const altered = JSON.stringify(row) + '\n'; await writeFile(file, altered);
  artifact.bytes = Buffer.byteLength(altered); artifact.sha256 = hash(altered);
  manifest.replay_context.baseline_coverage_sha256 = artifact.sha256;
  const manifestRaw = JSON.stringify(manifest); await writeFile(result.normalizedManifest, manifestRaw);
  result.receipt.normalized.manifest_sha256 = hash(manifestRaw);
  const receiptRaw = JSON.stringify(result.receipt); await writeFile(descriptor.manifest, receiptRaw);
  descriptor.sha256 = hash(receiptRaw);
  await assert.rejects(read(descriptor, options, f.adapters), /normalization session rejected/);
});

test('native admission rejects overrides and synthetic test mode cannot be selected by callers', async t => {
  const f = await fixture(t);
  await assert.rejects(native({ ...f.options, minimumPlaces: 1 }), /normalization session rejected/);
  await assert.rejects(native({ ...f.options, adapters: f.adapters }), /normalization session rejected/);
  await assert.rejects(run({ ...f.options, signal: AbortSignal.abort() }, f.adapters));
  assert.equal(f.calls(), 0);
});
test('changed acquisition before finalization leaves no successful session manifest', async t => {
  const f = await fixture(t), original = f.adapters.readInput;
  f.adapters.readInput = async (...args) => { const value = await original(...args); if (f.calls() > 1) value.binding.selected_sha256 = '0'.repeat(64); return value; };
  await assert.rejects(run(f.options, f.adapters));
  const jobs = path.join(f.options.output, 'jobs'), [runId] = await readdir(jobs);
  await assert.rejects(lstat(path.join(jobs, runId, 'manifest.json')), { code: 'ENOENT' });
});
test('post-manifest verification failure carries an inspection descriptor, not success', async t => {
  const f = await fixture(t), original = f.adapters.readInput;
  f.adapters.readInput = async (...args) => { const value = await original(...args); if (f.calls() === 3) throw Error('private failure'); return value; };
  await assert.rejects(run(f.options, f.adapters), error => error.message === 'Overture normalization session rejected; preserve retained operation evidence.' && Boolean(error.recovery?.manifest));
});
test('cancellation after normalization retains evidence without a successful session receipt', async t => {
  const f = await fixture(t), controller = new AbortController(), original = f.adapters.readInput;
  f.adapters.readInput = async (...args) => { const value = await original(...args); if (f.calls() === 2) controller.abort('private'); return value; };
  await assert.rejects(run({ ...f.options, signal: controller.signal }, f.adapters));
  const jobs = path.join(f.options.output, 'jobs'), [runId] = await readdir(jobs);
  await assert.rejects(lstat(path.join(jobs, runId, 'manifest.json')), { code: 'ENOENT' });
});
