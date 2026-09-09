import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {watch, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {IA_CHILDCARE_URLS, IA_CHILDCARE_TEST_CLIENT} from './ia-childcare-acquisition.mjs';
import {buildIaChildcareAcquiredWithTestTransport, IA_CHILDCARE_ACQUIRED_TEST_ROOT} from './ia-childcare-acquired.mjs';
import {buildIaChildcareNormalizedRelease as build, readIaChildcareNormalizedRelease as read,
  verifyIaChildcareNormalizedRelease as verify} from './ia-childcare-normalized-release.mjs';

const center = {businessType: 'building', businessName: 'Test Center', address: '1 Test St', city: 'Des Moines',
  zipCode: 50301, latitude: 41, longitude: -93, referral: true};
const payload = [center, {...center}, {...center, businessName: 'Invalid\u0000Name'},
  {businessType: 'home', businessName: 'EXCLUDED_PRIVATE_NAME', address: 'EXCLUDED_PRIVATE_ADDRESS'}];
const transport = async url => new Response(url === IA_CHILDCARE_URLS.client ? IA_CHILDCARE_TEST_CLIENT : JSON.stringify(payload));
async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ia-normalized-test-'));
  t.after(async () => {assert.equal(path.dirname(root), path.join(APP_ROOT, 'data/tmp')); await rm(root, {recursive: true, force: true});});
  const acquired = await buildIaChildcareAcquiredWithTestTransport(transport), acquiredDirectory = path.dirname(acquired.manifest_path);
  t.after(async () => {assert.equal(path.dirname(acquiredDirectory), IA_CHILDCARE_ACQUIRED_TEST_ROOT); await rm(acquiredDirectory, {recursive: true, force: true});});
  return {root, acquired};
}
test('Iowa normalized release conserves selected rows, quarantine, provenance and synthetic mode without a refetch', async t => {
  const {root, acquired} = await fixture(t), outputRoot = path.join(root, 'normalized'), originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('Normalization cannot fetch');
  try {
    const verification = await build(acquired.manifest_path, {outputRoot}), result = await read(verification.manifest_path);
    assert.deepEqual(result.verification, verification); assert.deepEqual(await verify(verification.manifest_path), result);
    assert.equal(result.manifest.execution_mode, 'injected-test-transport');
    assert.deepEqual(result.manifest.acquired, {manifest_path: acquired.manifest_path, manifest_sha256: acquired.manifest_sha256,
      run_id: acquired.manifest.run_id, execution_mode: 'injected-test-transport'});
    assert.equal(result.summary.source_records, 3); assert.equal(result.summary.source_response_rows, 4);
    assert.equal(result.summary.accepted_records, 2); assert.equal(result.summary.quarantined_records, 1);
    assert.equal(result.summary.excluded_source_records, 1); assert.equal(result.summary.duplicate_selected_rows, 1);
    assert.equal(result.records.length, 2); assert.equal(result.quarantine.length, 1);
    for (const row of result.records) {
      assert.equal(row.provenance.ingest_run_id, verification.run_id); assert.equal(row.provenance.processed_at, result.manifest.processed_at);
      assert.equal(row.reported_address.zip_code, '50301'); assert.equal(row.reported_address.zip4, null);
      assert.equal(row.claims.current_operations_verified, false);
    }
    assert.doesNotMatch(JSON.stringify(result), /EXCLUDED_PRIVATE_NAME|EXCLUDED_PRIVATE_ADDRESS/);
    assert.equal(result.manifest.claims.national_reporting_integrated, false);
    assert.ok(result.manifest.processed_at >= acquired.manifest.finished_at);
    assert.deepEqual((await readdir(path.dirname(verification.manifest_path))).sort(), ['manifest.json', 'normalized.jsonl', 'quarantine.jsonl', 'summary.json']);
    const second = await build(acquired.manifest_path, {outputRoot});
    assert.notEqual(second.run_id, verification.run_id); assert.deepEqual(await read(verification.manifest_path), result);
  } finally {globalThis.fetch = originalFetch;}
});

test('Iowa semantic replay rejects changed rows even with rewritten artifact checksums and mode claims', async t => {
  const {root, acquired} = await fixture(t), v = await build(acquired.manifest_path, {outputRoot: path.join(root, 'normalized')});
  const file = path.join(path.dirname(v.manifest_path), 'normalized.jsonl'), original = await readFile(file), manifestBytes = await readFile(v.manifest_path);
  const changed = Buffer.from(original.toString().replace('Test Center', 'Fake Center'));
  assert.equal(changed.length, original.length); await writeFile(file, changed);
  await assert.rejects(read(v.manifest_path), /verification failed/);
  const manifest = JSON.parse(manifestBytes), artifact = manifest.artifacts.find(row => row.path === 'normalized.jsonl');
  artifact.sha256 = createHash('sha256').update(changed).digest('hex');
  await writeFile(v.manifest_path, JSON.stringify(manifest) + '\n'); await assert.rejects(read(v.manifest_path), /verification failed/);
  await writeFile(file, original); await writeFile(v.manifest_path, manifestBytes);
  const relabelled = JSON.parse(manifestBytes); relabelled.execution_mode = 'fixed-native-fetch';
  await writeFile(v.manifest_path, JSON.stringify(relabelled)); await assert.rejects(read(v.manifest_path), /verification failed/);
  await writeFile(v.manifest_path, manifestBytes); assert.deepEqual((await read(v.manifest_path)).verification, v);
});

test('Iowa normalized API rejects unsafe output paths, caller overrides and cancellation', async t => {
  const {root, acquired} = await fixture(t);
  for (const options of [null, {processedAt: new Date().toISOString()}, {signal: {}}, {outputRoot: 'relative'},
    {outputRoot: path.dirname(acquired.manifest_path)}, {outputRoot: path.join(root, 'jobs/nested')},
    Object.defineProperty({}, 'signal', {get() {assert.fail('accessor');}})]) await assert.rejects(build(acquired.manifest_path, options));
  await assert.rejects(build(acquired.manifest_path, {signal: AbortSignal.abort()}), {name: 'AbortError'});
  const controller = new AbortController(), pending = build(acquired.manifest_path, {outputRoot: path.join(root, 'cancelled'), signal: controller.signal});
  setImmediate(() => controller.abort()); await assert.rejects(pending);
  await assert.rejects(read(path.join(root, 'manifest.json')));
});

test('Iowa offline CLIs build and verify synthetic retained input in a separate process', async t => {
  const {root, acquired} = await fixture(t), outputRoot = path.join(root, 'cli');
  const execute = args => JSON.parse(execFileSync(process.execPath, args, {cwd: APP_ROOT, encoding: 'utf8', windowsHide: true}));
  const result = execute(['scripts/reprocess-ia-childcare.mjs', '--acquired', acquired.manifest_path, '--output', outputRoot]);
  const manifestPath = result.manifest_path ?? result.verification?.manifest_path;
  assert.equal(typeof manifestPath, 'string');
  const verified = execute(['scripts/verify-ia-childcare-normalized.mjs', '--manifest', manifestPath]);
  assert.equal(verified.execution_mode ?? verified.verification?.execution_mode, 'injected-test-transport');
  const reread = execute(['scripts/reprocess-ia-childcare.mjs', '--verify', manifestPath]);
  assert.equal(reread.execution_mode ?? reread.verification?.execution_mode, 'injected-test-transport');
});

test('Iowa normalized commit returns its verified descriptor despite cancellation during publication', async t => {
  const {root, acquired} = await fixture(t), outputRoot = path.join(root, 'commit-cancel'); await mkdir(outputRoot);
  const controller = new AbortController(); let observed = false;
  const watcher = watch(outputRoot, {recursive: true}, (_event, filename) => {
    const relative = String(filename);
    if (path.basename(relative) === 'manifest.json' && existsSync(path.join(outputRoot, relative))) {
      observed = true; controller.abort();
    }
  });
  try {
    const verification = await build(acquired.manifest_path, {outputRoot, signal: controller.signal});
    assert.equal(observed, true); assert.equal(controller.signal.aborted, true);
    assert.deepEqual((await read(verification.manifest_path)).verification, verification);
  } finally {watcher.close();}
});
