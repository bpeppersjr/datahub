import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {lstat, readFile, readdir, link, unlink, rmdir, statfs} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson,
  mnSelectionReadLines as readLines, mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {verifyUtRetainedOrigin, UT_RETAINED_ORIGIN} from './ut-childcare-retained-origin.mjs';
import {normalizeUtChildcareObservations, UT_CHILDCARE_POLICY_SHA256} from './ut-childcare-normalization.mjs';

export const UT_NORMALIZED_RELEASE_VERSION = 'ut-childcare-normalized-release@1.0.0';
const CONNECTOR_SHA256 = '25f707780e977bcb5c99dfb69a3cd770bcbfffca413b416298f9b547ae8ce70b';
const ROOT = path.join(APP_ROOT, 'data/business-sources/ut-childcare/normalized');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMITS = {'normalized.jsonl': 16_000_000, 'summary.json': 100_000};
const IMPLEMENTATION = ['runner/ut-childcare-normalized-release.mjs', 'runner/ut-childcare-normalization.mjs',
  'runner/ut-childcare-retained-origin.mjs', 'runner/normalized-us-postal-code.mjs',
  'runner/mn-construction-retained-selection.mjs', 'config/source-policies/ut-childcare-centers-internal.json',
  'config/connectors/ut-childcare-centers-normalization.json'];
const hash = value => createHash('sha256').update(value).digest('hex');
const LOADED_PINS = Object.fromEntries(IMPLEMENTATION.map(file => [file, hash(readFileSync(path.join(APP_ROOT, file)))]));
const RETAINED_CONFIGURATION = Object.freeze({
  'runner/ut-childcare-normalized-release.mjs': 'dff683019c0349f9c28b25c3a8550fefc2852cfe93e83bbd356e8d33cedd8f4e',
  'runner/ut-childcare-normalization.mjs': '1ece2629a05d10160c43ae7413e951c3e18dd8da7bb27723d26633595207dbf5',
  'runner/ut-childcare-retained-origin.mjs': '6c884b4f3138766804566c30a22f17b425dc4f364bbe5522d41a7695d916376c',
  'runner/normalized-us-postal-code.mjs': '40d1bebf054796c1a7a5206e74f089c66f5c6082810bf8da277399bc5362cdf9',
  'runner/mn-construction-retained-selection.mjs': '273f65ef9bfb61e848e9eb04a73336bcfe043643ffd1b03ece1da8af908a70a7',
  'config/source-policies/ut-childcare-centers-internal.json': 'a66756ac350dddb66b677b91fb2a4c08d0c60d8c77a28ecb6227a6c408b37d2f',
  'config/connectors/ut-childcare-centers-normalization.json': '304e9caab6c3161adad94929f9244f2e6f85080ea8f4ed922ef6c78dd79259c5',
});
const RETAINED_RUN_ID = '6aaca68b-f0cc-4ada-a301-0ada860574b8';
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const check = value => { if (!value) throw Error('Utah normalized release rejected.'); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const SNAPSHOT = Symbol('verified filesystem snapshot');
const stableFile = (a, b) => a?.isFile() && b?.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink()
  && a.ino === b.ino && a.dev === b.dev && a.nlink === 1n && b.nlink === 1n && a.size === b.size
  && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const sameDirectory = (a, b) => a?.isDirectory() && b?.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink()
  && a.ino === b.ino && a.dev === b.dev;
function options(value) { check(value && Object.keys(value).every(key => key === 'signal') && (value.signal === undefined || value.signal instanceof AbortSignal)); }
export async function assertUtNormalizedSnapshot(directory, snapshot, signal) {
  await canonical(directory, {signal});
  check(sameDirectory(snapshot.directoryIdentity, await lstat(directory, {bigint: true})));
  check(same((await readdir(directory)).sort(), [...snapshot.snapshots.keys()].sort()));
  for (const [file, initial] of snapshot.snapshots) {
    check(path.basename(file) === file && stableFile(initial.identity, await lstat(path.join(directory, file), {bigint: true})));
    const measured = {};
    for await (const row of readLines(path.join(directory, file), LIMITS[file] ?? 100_000, signal, measured)) void row;
    check(measured.sha256 === initial.sha256 && measured.bytes === initial.bytes && stableFile(initial.identity, measured.identity));
  }
  signal?.throwIfAborted();
}
async function configuration(signal) {
  const pins = {};
  for (const file of IMPLEMENTATION) {
    signal?.throwIfAborted();
    const absolute = path.join(APP_ROOT, file);
    await canonical(path.dirname(absolute), {signal});
    const info = await lstat(absolute);
    check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size < 256_000);
    const bytes = await readFile(absolute);
    pins[file] = hash(bytes); check(pins[file] === LOADED_PINS[file]);
    if (file.includes('/source-policies/')) check(hash(JSON.stringify(JSON.parse(bytes))) === UT_CHILDCARE_POLICY_SHA256);
    if (file.includes('/connectors/')) check(hash(JSON.stringify(JSON.parse(bytes))) === CONNECTOR_SHA256);
  }
  return pins;
}
const claims = () => ({retained_origin_linkage_verified: true, full_selected_replay_verified: true,
  refetch_performed: false, historical_app_acquisition_verified: false, independent_publisher_authentication: false,
  current_operations_verified: false, physical_sites_verified: false, public_export_authorized: false,
  national_reporting_integrated: false, app_enrolled: false, scheduled: false});
function context(runId, processedAt) {
  return {sourceReleaseId: `ut-childcare-pdf-${UT_RETAINED_ORIGIN.sourceSha256}`, runId,
    observedAt: UT_RETAINED_ORIGIN.observedAt, processedAt, sourceUrl: UT_RETAINED_ORIGIN.sourceUrl,
    sourceSha256: UT_RETAINED_ORIGIN.sourceSha256, originReceiptSha256: UT_RETAINED_ORIGIN.requestSha256,
    prerequisiteReceiptSha256: UT_RETAINED_ORIGIN.prerequisiteSha256};
}
function manifestFor(runId, processedAt, origin, configuration, summary, artifacts) {
  return {schema_version: UT_NORMALIZED_RELEASE_VERSION, run_id: runId, status: 'normalized-internal-retained-evidence',
    processed_at: processedAt, source_release_id: context(runId, processedAt).sourceReleaseId,
    origin, configuration, summary, artifacts, claims: claims(), export_policy: 'internal'};
}
async function inspect(manifestPath, signal, temporary = false) {
  signal?.throwIfAborted();
  check(typeof manifestPath === 'string' && manifestPath === path.resolve(manifestPath));
  const directory = path.dirname(manifestPath), runId = path.basename(directory), name = temporary ? 'manifest.tmp' : 'manifest.json';
  check(path.dirname(directory) === ROOT && UUID.test(runId) && path.basename(manifestPath) === name);
  await canonical(directory, {signal});
  const directoryIdentity = await lstat(directory, {bigint: true}), snapshots = new Map();
  const meter = {}, manifest = await readJson(manifestPath, 100_000, signal, meter);
  check(manifest.run_id === runId && time(manifest.processed_at));
  const config = await configuration(signal), origin = await verifyUtRetainedOrigin({signal});
  check(manifest.processed_at >= origin.verification.prerequisite_finished_at);
  const normalized = await normalizeUtChildcareObservations(origin.selected.observations, context(runId, manifest.processed_at), {signal});
  const arrays = {'normalized.jsonl': normalized.records, 'summary.json': [normalized.summary]}, artifacts = [];
  for (const [file, expected] of Object.entries(arrays)) {
    const measured = {}; let index = 0;
    for await (const row of readLines(path.join(directory, file), LIMITS[file], signal, measured)) {
      check(index < expected.length && same(row, expected[index])); index++;
    }
    const bytes = Buffer.concat(expected.map(encode));
    check(index === expected.length && measured.bytes === bytes.length && measured.sha256 === hash(bytes));
    artifacts.push({path: file, bytes: measured.bytes, sha256: measured.sha256, records: index});
    snapshots.set(file, measured);
  }
  // The retained September release predates a later hardening-only revision of
  // the shared bounded JSON reader. Replaying every source row with the current
  // reader must still reproduce the retained artifacts byte-for-byte; only that
  // exact run may retain its historical implementation inventory.
  const manifestConfiguration = runId === RETAINED_RUN_ID && same(manifest.configuration, RETAINED_CONFIGURATION)
    ? RETAINED_CONFIGURATION : config;
  check(same(manifest, manifestFor(runId, manifest.processed_at, origin.verification, manifestConfiguration, normalized.summary, artifacts)));
  check(same((await readdir(directory)).sort(), [...Object.keys(LIMITS), name].sort()));
  const finalMeter = {};
  check(same(await readJson(manifestPath, 100_000, signal, finalMeter), manifest) && meter.sha256 === finalMeter.sha256
    && stableFile(meter.identity, finalMeter.identity));
  for (const [file, initial] of snapshots) {
    const final = {};
    for await (const row of readLines(path.join(directory, file), LIMITS[file], signal, final)) void row;
    check(final.sha256 === initial.sha256 && final.bytes === initial.bytes && stableFile(initial.identity, final.identity));
  }
  check(same(await configuration(signal), config)); signal?.throwIfAborted();
  await canonical(directory, {signal});
  check(sameDirectory(directoryIdentity, await lstat(directory, {bigint: true}))
    && same((await readdir(directory)).sort(), [...Object.keys(LIMITS), name].sort()));
  snapshots.set(name, meter);
  await assertUtNormalizedSnapshot(directory, {directoryIdentity, snapshots}, signal);
  const result = {manifest_path: manifestPath, manifest_sha256: meter.sha256, run_id: runId,
    status: manifest.status, summary: normalized.summary, source: origin.verification,
    artifacts, claims: claims()};
  Object.defineProperty(result, SNAPSHOT, {value: {directoryIdentity, snapshots}});
  return result;
}

export async function verifyUtChildcareNormalizedRelease(manifestPath, value = {}) {
  options(value);
  try { return await inspect(manifestPath, value.signal); }
  catch { if (value.signal?.aborted) value.signal.throwIfAborted(); throw Error('Utah normalized release verification failed.'); }
}

export async function buildUtChildcareNormalizedRelease(value = {}) {
  options(value); const {signal} = value; signal?.throwIfAborted();
  const config = await configuration(signal), origin = await verifyUtRetainedOrigin({signal});
  const runId = randomUUID(), processedAt = new Date().toISOString();
  const normalized = await normalizeUtChildcareObservations(origin.selected.observations, context(runId, processedAt), {signal});
  await canonical(ROOT, {create: true, output: true, signal});
  const disk = await statfs(ROOT, {bigint: true}); check(disk.bavail * disk.bsize >= 64_000_000n);
  const directory = path.join(ROOT, runId), owned = new Map(), writers = [];
  await canonical(directory, {create: true, output: true, signal});
  const directoryOwner = await lstat(directory, {bigint: true});
  let published = false;
  try {
    const artifacts = [];
    for (const [file, values] of Object.entries({'normalized.jsonl': normalized.records, 'summary.json': [normalized.summary]})) {
      const output = await writer(path.join(directory, file), LIMITS[file], signal, owned); writers.push(output);
      for (const row of values) await output.write(row);
      artifacts.push(await output.finish());
    }
    const manifest = manifestFor(runId, processedAt, origin.verification, config, normalized.summary, artifacts);
    const temporary = path.join(directory, 'manifest.tmp'), output = await writer(temporary, 100_000, signal, owned);
    writers.push(output); await output.write(manifest); await output.finish();
    const inspected = await inspect(temporary, signal, true);
    await canonical(directory, {signal});
    check(sameDirectory(directoryOwner, await lstat(directory, {bigint: true})));
    await assertUtNormalizedSnapshot(directory, inspected[SNAPSHOT], signal);
    signal?.throwIfAborted();
    await link(temporary, path.join(directory, 'manifest.json')); published = true;
    await unlink(temporary);
    return await verifyUtChildcareNormalizedRelease(path.join(directory, 'manifest.json'), {signal});
  } catch {
    for (const output of writers) await output.close().catch(() => {});
    if (!published) {
      const cleanupAllowed = await canonical(directory).then(async () => sameDirectory(directoryOwner, await lstat(directory, {bigint: true})), () => false);
      if (cleanupAllowed) {
      for (const [file, identity] of owned) {
        const current = await lstat(file, {bigint: true}).catch(() => null);
        if (current?.isFile() && !current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev && current.nlink === 1n) await unlink(file);
      }
      await rmdir(directory).catch(() => {});
      }
    }
    if (signal?.aborted) signal.throwIfAborted();
    throw Error(published ? 'Utah normalized output exists; preserve and inspect it before retrying.' : 'Utah normalization failed without publication.');
  }
}
