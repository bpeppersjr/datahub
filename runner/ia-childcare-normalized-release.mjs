import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {lstat, mkdir, open, link, unlink, rmdir, readdir, statfs} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionReadLines as readLines,
  mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {readIaChildcareAcquiredEvidence} from './ia-childcare-acquired.mjs';
import {normalizeIaChildcareEvidence} from './ia-childcare-normalization.mjs';

export const IA_CHILDCARE_NORMALIZED_RELEASE_VERSION = 'ia-childcare-normalized-release@1.0.0';
export const IA_CHILDCARE_NORMALIZATION_CONTRACT_SHA256 = '4a825d1c35bf379ba83b0d40b798574b6037c3c192eedef7cc817e00d948662a';
const POLICY_SHA256 = 'be383f1e27ee415cd8018dc77c384149c6c8dda6eaa4b8dce6b828f679170df0';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMITS = {'normalized.jsonl': 200000000, 'quarantine.jsonl': 30000000, 'summary.json': 1000000};
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const check = value => {if (!value) throw Error('Iowa normalized release rejected.');};
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const identity = (a, b) => a.ino === b.ino && a.dev === b.dev;
function options(value, keys) {
  check(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every(key =>
    keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
  check(value.signal === undefined || value.signal instanceof AbortSignal); value.signal?.throwIfAborted();
}
async function configuration(signal) {
  const value = await readJson(path.join(APP_ROOT, 'config/connectors/ia-childcare-centers-normalization.json'), 100000, signal);
  check(hash(JSON.stringify(value)) === IA_CHILDCARE_NORMALIZATION_CONTRACT_SHA256);
  const policy = await readJson(path.join(APP_ROOT, 'config/source-policies/ia-childcare-centers-internal.json'), 100000, signal);
  check(hash(JSON.stringify(policy)) === POLICY_SHA256);
  return {connector_sha256: IA_CHILDCARE_NORMALIZATION_CONTRACT_SHA256, policy_sha256: POLICY_SHA256};
}
const claims = () => ({export_policy: 'internal', public_export_authorized: false, national_reporting_integrated: false,
  current_operations_verified: false, physical_site_verified: false, exact_address_geocodes_verified: false,
  current_usps_assignment_verified: false, boundary_assignment_verified: false, identity_matching_applied: false,
  source_authenticity_verified: false, app_enrolled: false, scheduled: false, raw_mixed_response_retained: false});
const sourceBinding = input => ({manifest_path: input.verification.manifest_path, manifest_sha256: input.verification.manifest_sha256,
  run_id: input.verification.run_id, execution_mode: input.verification.execution_mode});
const sourceReleaseId = input => `ia-childcare-acquisition-${input.verification.run_id}`;
function manifestFor(runId, processedAt, input, summary, artifacts) {
  return {schema_version: IA_CHILDCARE_NORMALIZED_RELEASE_VERSION, run_id: runId, execution_mode: input.verification.execution_mode,
    status: 'normalized-internal-evidence', source_release_id: sourceReleaseId(input), processed_at: processedAt,
    configuration: {connector_sha256: IA_CHILDCARE_NORMALIZATION_CONTRACT_SHA256, policy_sha256: POLICY_SHA256}, acquired: sourceBinding(input), summary,
    claims: claims(), artifacts};
}
async function replay(input, runId, processedAt, signal) {
  check(time(processedAt) && processedAt >= input.evidence.finished_at);
  return normalizeIaChildcareEvidence(input.evidence, {runId, sourceReleaseId: sourceReleaseId(input), processedAt}, {signal});
}
async function inspect(manifestPath, signal, candidate = false) {
  await configuration(signal); signal?.throwIfAborted();
  check(typeof manifestPath === 'string' && manifestPath === path.resolve(manifestPath)
    && path.basename(manifestPath) === (candidate ? '.manifest.tmp' : 'manifest.json'));
  const directory = path.dirname(manifestPath), runId = path.basename(directory);
  check(UUID.test(runId) && path.basename(path.dirname(directory)) === 'jobs');
  await canonical(directory, {signal}); const owner = await lstat(directory, {bigint: true});
  const meter = {}, manifest = await readJson(manifestPath, 2000000, signal, meter);
  check(manifest && manifest.run_id === runId && manifest.acquired && typeof manifest.acquired.manifest_path === 'string');
  const input = await readIaChildcareAcquiredEvidence(manifest.acquired.manifest_path, {signal});
  check(same(manifest.acquired, sourceBinding(input)));
  const normalized = await replay(input, runId, manifest.processed_at, signal);
  const arrays = {'normalized.jsonl': normalized.records, 'quarantine.jsonl': normalized.quarantine, 'summary.json': [normalized.summary]};
  const artifacts = [], snapshots = [];
  for (const [name, values] of Object.entries(arrays)) {
    check(Array.isArray(values)); const measured = {}, digest = createHash('sha256'); let count = 0, bytes = 0;
    for await (const row of readLines(path.join(directory, name), LIMITS[name], signal, measured)) {
      check(count < values.length && same(row, values[count]));
      const raw = encode(values[count++]); digest.update(raw); bytes += raw.length;
    }
    check(count === values.length && bytes === measured.bytes && digest.digest('hex') === measured.sha256);
    artifacts.push({path: name, bytes, sha256: measured.sha256, records: count}); snapshots.push([name, measured]);
  }
  check(same(manifest, manifestFor(runId, manifest.processed_at, input, normalized.summary, artifacts)));
  const roster = [...Object.keys(LIMITS), path.basename(manifestPath)].sort(); check(same((await readdir(directory)).sort(), roster));
  const finalInput = await readIaChildcareAcquiredEvidence(manifest.acquired.manifest_path, {signal}); check(same(finalInput, input));
  // Rehash, rather than relying only on timestamps, to detect same-size rewrites.
  for (const [name, prior] of snapshots) {
    const measured = {}; for await (const row of readLines(path.join(directory, name), LIMITS[name], signal, measured)) void row;
    check(measured.sha256 === prior.sha256 && measured.bytes === prior.bytes && identity(measured.identity, prior.identity));
  }
  const final = {}; check(same(await readJson(manifestPath, 2000000, signal, final), manifest)
    && final.sha256 === meter.sha256 && identity(final.identity, meter.identity));
  await canonical(directory, {signal}); check(identity(owner, await lstat(directory, {bigint: true})) && same((await readdir(directory)).sort(), roster));
  await configuration(signal); signal?.throwIfAborted();
  return {manifest, verification: {manifest_path: manifestPath, manifest_sha256: meter.sha256, run_id: runId,
    execution_mode: input.verification.execution_mode, counts: normalized.summary, record_count: normalized.records.length,
    quarantine_count: normalized.quarantine.length}, summary: normalized.summary, records: normalized.records, quarantine: normalized.quarantine};
}
export async function readIaChildcareNormalizedRelease(manifestPath, value = {}) {
  options(value, ['signal']);
  try {return await inspect(manifestPath, value.signal);} catch {value.signal?.throwIfAborted(); throw Error('Iowa normalized release verification failed.');}
}
export const verifyIaChildcareNormalizedRelease = readIaChildcareNormalizedRelease;

export async function buildIaChildcareNormalizedRelease(acquiredManifestPath, value = {}) {
  options(value, ['signal', 'outputRoot']);
  const {signal, outputRoot = path.join(APP_ROOT, 'data/business-sources/ia-childcare/normalized')} = value;
  await configuration(signal);
  const input = await readIaChildcareAcquiredEvidence(acquiredManifestPath, {signal}), processedAt = new Date().toISOString();
  check(typeof outputRoot === 'string' && outputRoot === path.resolve(outputRoot)
    && !path.relative(APP_ROOT, outputRoot).split(path.sep).some(part => part.toLowerCase() === 'jobs'));
  const relative = path.relative(path.dirname(acquiredManifestPath), outputRoot); check(relative.startsWith('..') || path.isAbsolute(relative));
  await canonical(outputRoot, {output: true, create: true, signal});
  const disk = await statfs(outputRoot, {bigint: true}); check(disk.bavail * disk.bsize >= 500000000n);
  const lockPath = path.join(outputRoot, '.owner.lock'), lock = await open(lockPath, 'wx'), runId = randomUUID();
  const directory = path.join(outputRoot, 'jobs', runId), ownedFiles = new Map(), lockValue = {run_id: runId, pid: process.pid};
  let lockOwner, directoryOwner, published = false;
  async function owned(file, prior) {
    if (!prior) return false;
    try {await canonical(path.dirname(file)); const current = await lstat(file, {bigint: true});
      return !current.isSymbolicLink() && identity(current, prior) && (prior.isDirectory() ? current.isDirectory() : current.isFile() && current.nlink === 1n);
    } catch {return false;}
  }
  const ownLock = async () => await owned(lockPath, lockOwner) && same(await readJson(lockPath, 1000), lockValue);
  const assertOwned = async () => check(await ownLock() && await owned(directory, directoryOwner));
  async function stage(name, values, maximum) {
    await assertOwned(); const out = await writer(path.join(directory, name), maximum, signal, ownedFiles);
    try {for (const row of values) {signal?.throwIfAborted(); check(encode(row).length <= 65536); await out.write(row);} return await out.finish();}
    finally {await out.close();}
  }
  try {
    lockOwner = await lock.stat({bigint: true}); await lock.writeFile(encode(lockValue)); await lock.sync();
    await canonical(path.join(outputRoot, 'jobs'), {create: true, output: true, signal}); await mkdir(directory); directoryOwner = await lstat(directory, {bigint: true});
    const normalized = await replay(input, runId, processedAt, signal), artifacts = [];
    for (const [name, rows] of [['normalized.jsonl', normalized.records], ['quarantine.jsonl', normalized.quarantine], ['summary.json', [normalized.summary]]])
      artifacts.push(await stage(name, rows, LIMITS[name]));
    const manifest = manifestFor(runId, processedAt, input, normalized.summary, artifacts);
    await stage('.manifest.tmp', [manifest], 2000000);
    const temporary = path.join(directory, '.manifest.tmp'); await inspect(temporary, signal, true);
    await assertOwned(); await configuration(signal);
    // A second complete check at publication includes acquired evidence and artifact hashes.
    const ready = await inspect(temporary, signal, true); check(same(ready.manifest, manifest)); signal?.throwIfAborted();
    await link(temporary, path.join(directory, 'manifest.json')); published = true; await unlink(temporary); ownedFiles.delete(temporary);
    // A committed child must be returned to its parent for checkpointing even
    // when cancellation arrives during the final read-only verification drain.
    const result = await inspect(path.join(directory, 'manifest.json')); await assertOwned(); return result.verification;
  } catch {
    if (!published && await owned(directory, directoryOwner) && await ownLock().catch(() => false)) {
      for (const [file, prior] of ownedFiles) if (await owned(file, prior)) await unlink(file);
      if (await owned(directory, directoryOwner) && (await readdir(directory)).length === 0) await rmdir(directory);
    }
    signal?.throwIfAborted(); throw Error('Iowa normalization failed; preserve any committed release for inspection.');
  } finally {
    await lock.close(); check(await ownLock()); await unlink(lockPath);
  }
}
