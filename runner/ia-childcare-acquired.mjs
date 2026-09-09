import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {open, mkdir, lstat, readdir, unlink, rmdir, link, statfs} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {acquireIaChildcare, acquireIaChildcareWithTestTransport, replayIaChildcareAcquisition} from './ia-childcare-acquisition.mjs';

export const IA_CHILDCARE_ACQUIRED_VERSION = 'ia-childcare-acquired@1.0.0';
const ROOT = path.join(APP_ROOT, 'data/business-sources/ia-childcare/acquired');
const TEST_BASE = path.join(APP_ROOT, 'data/tmp/ia-childcare-acquired-test');
export const IA_CHILDCARE_ACQUIRED_TEST_ROOT = path.join(TEST_BASE, String(process.pid));
const TEST_ROOT = IA_CHILDCARE_ACQUIRED_TEST_ROOT;
const LABELS = ['client-before', 'selected-response', 'client-after'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX = 32000000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = value => {if (!value) throw Error('Iowa acquired release rejected.');};
const mode = synthetic => synthetic ? 'injected-test-transport' : 'fixed-native-fetch';
function options(value) {
  check(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every(key =>
    key === 'signal' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
  check(value.signal === undefined || value.signal instanceof AbortSignal);
  value.signal?.throwIfAborted(); return value.signal;
}
const identity = (a, b) => a.ino === b.ino && a.dev === b.dev;
async function snapshot(file, signal, maximum = MAX) {
  const meter = {}, value = await readJson(file, maximum, signal, meter);
  return {value, meter};
}
async function unchanged(file, prior, signal, maximum = MAX) {
  const next = await snapshot(file, signal, maximum);
  check(next.meter.sha256 === prior.meter.sha256 && identity(next.meter.identity, prior.meter.identity));
}
function descriptor(name, snap) {return {path: name, bytes: snap.meter.bytes, sha256: snap.meter.sha256};}
function checkpoint(evidence, index) {
  return index === 1 ? {request: evidence.requests[1], selection: evidence.selection} : evidence.requests[index];
}
async function inspect(manifestPath, signal, temporary = false, includeEvidence = false) {
  signal?.throwIfAborted();
  check(typeof manifestPath === 'string' && manifestPath === path.resolve(manifestPath)
    && path.basename(manifestPath) === (temporary ? 'manifest.tmp' : 'manifest.json'));
  const directory = path.dirname(manifestPath), root = path.dirname(directory), id = path.basename(directory);
  const synthetic = path.dirname(root) === TEST_BASE && /^[1-9][0-9]{0,15}$/.test(path.basename(root));
  check(UUID.test(id) && (root === ROOT || synthetic));
  await canonical(directory, {signal}); const owner = await lstat(directory, {bigint: true});
  const manifest = await snapshot(manifestPath, signal, 100000), evidence = await snapshot(path.join(directory, 'evidence.json'), signal);
  const verified = await replayIaChildcareAcquisition(evidence.value, {signal});
  check(same(verified, evidence.value) && verified.execution_mode === mode(synthetic));
  const artifacts = [], snapshots = [];
  for (const [index, label] of LABELS.entries()) {
    const name = `${label}.json`, item = await snapshot(path.join(directory, name), signal);
    check(same(item.value, checkpoint(verified, index)));
    artifacts.push(descriptor(name, item)); snapshots.push([path.join(directory, name), item]);
  }
  artifacts.push(descriptor('evidence.json', evidence)); snapshots.push([path.join(directory, 'evidence.json'), evidence]);
  check(same(manifest.value, {schema_version: IA_CHILDCARE_ACQUIRED_VERSION, run_id: id,
    execution_mode: verified.execution_mode, status: 'retained-selected-evidence',
    started_at: verified.started_at, finished_at: verified.finished_at, artifacts,
    claims: {raw_mixed_response_retained: false, public_export_authorized: false, app_enrolled: false,
      current_business_status_verified: false, statewide_completeness_verified: false}}));
  const roster = [...artifacts.map(row => row.path), path.basename(manifestPath)].sort();
  check(same((await readdir(directory)).sort(), roster));
  for (const [file, prior] of snapshots) await unchanged(file, prior, signal);
  await unchanged(manifestPath, manifest, signal, 100000); await canonical(directory, {signal});
  check(identity(owner, await lstat(directory, {bigint: true})) && same((await readdir(directory)).sort(), roster));
  signal?.throwIfAborted();
  const verification = {manifest_path: manifestPath, manifest_sha256: manifest.meter.sha256,
    run_id: id, execution_mode: verified.execution_mode};
  return includeEvidence ? {evidence: verified, verification}
    : {manifest_path: manifestPath, manifest_sha256: manifest.meter.sha256, manifest: manifest.value};
}
export async function readIaChildcareAcquiredEvidence(manifestPath, value = {}) {
  const signal = options(value);
  try {return await inspect(manifestPath, signal, false, true);} catch {signal?.throwIfAborted(); throw Error('Iowa acquired evidence verification failed.');}
}
export async function verifyIaChildcareAcquired(manifestPath, value = {}) {
  const signal = options(value);
  try {return await inspect(manifestPath, signal);} catch {signal?.throwIfAborted(); throw Error('Iowa acquired release verification failed.');}
}
async function build(transport, signal, synthetic) {
  const root = synthetic ? TEST_ROOT : ROOT, lockPath = path.join(root, '.publisher.lock');
  let lock, lockOwner, directory, directoryOwner, published = false;
  const owned = new Map();
  async function isOwned(file, prior) {
    try {await canonical(path.dirname(file)); const current = await lstat(file, {bigint: true});
      return identity(current, prior) && !current.isSymbolicLink() && (prior.isDirectory() ? current.isDirectory() : current.isFile() && current.nlink === 1n);
    } catch {return false;}
  }
  async function write(name, value) {
    signal?.throwIfAborted(); check(await isOwned(directory, directoryOwner));
    const file = path.join(directory, name), bytes = Buffer.from(JSON.stringify(value) + '\n'); check(bytes.length <= MAX);
    const handle = await open(file, 'wx');
    try {owned.set(file, await handle.stat({bigint: true})); await handle.writeFile(bytes); await handle.sync();}
    finally {await handle.close();}
    const snap = await snapshot(file, signal);
    check(snap.meter.sha256 === hash(bytes) && identity(snap.meter.identity, owned.get(file))); return snap;
  }
  try {
    signal?.throwIfAborted(); await canonical(root, {create: true, output: true, signal});
    const disk = await statfs(root, {bigint: true}); check(disk.bavail * disk.bsize >= 128000000n);
    lock = await open(lockPath, 'wx'); lockOwner = await lock.stat({bigint: true});
    const id = randomUUID(); await lock.writeFile(JSON.stringify({run_id: id, pid: process.pid}) + '\n'); await lock.sync();
    directory = path.join(root, id); await mkdir(directory); directoryOwner = await lstat(directory, {bigint: true});
    let next = 0; const artifacts = [];
    const onCheckpoint = async (label, value) => {
      check(next < LABELS.length && label === LABELS[next]);
      const name = `${label}.json`, snap = await write(name, value); artifacts.push(descriptor(name, snap)); next++;
    };
    const evidence = synthetic ? await acquireIaChildcareWithTestTransport(transport, {signal, onCheckpoint})
      : await acquireIaChildcare({signal, onCheckpoint});
    check(next === LABELS.length && evidence.execution_mode === mode(synthetic));
    artifacts.push(descriptor('evidence.json', await write('evidence.json', evidence)));
    const manifest = {schema_version: IA_CHILDCARE_ACQUIRED_VERSION, run_id: id, execution_mode: evidence.execution_mode,
      status: 'retained-selected-evidence', started_at: evidence.started_at, finished_at: evidence.finished_at, artifacts,
      claims: {raw_mixed_response_retained: false, public_export_authorized: false, app_enrolled: false,
        current_business_status_verified: false, statewide_completeness_verified: false}};
    await write('manifest.tmp', manifest);
    const temporary = path.join(directory, 'manifest.tmp'); await inspect(temporary, signal, true);
    check(await isOwned(directory, directoryOwner)); signal?.throwIfAborted();
    await link(temporary, path.join(directory, 'manifest.json')); published = true; await unlink(temporary);
    // Publication is the commit boundary. Drain verification without cancellation
    // so the caller can durably record this completed child before cancelling.
    return await inspect(path.join(directory, 'manifest.json'));
  } catch {
    if (!published && directoryOwner && await isOwned(directory, directoryOwner)) {
      for (const [file, prior] of owned) if (await isOwned(file, prior)) await unlink(file);
      if (await isOwned(directory, directoryOwner) && (await readdir(directory)).length === 0) await rmdir(directory);
    }
    signal?.throwIfAborted(); throw Error('Iowa acquisition failed; preserve any committed release for inspection.');
  } finally {
    if (lock) {await lock.close(); check(await isOwned(lockPath, lockOwner)); await unlink(lockPath);}
  }
}
export async function buildIaChildcareAcquired(value = {}) {return build(undefined, options(value), false);}
export async function buildIaChildcareAcquiredWithTestTransport(transport, value = {}) {
  check(typeof transport === 'function'); return build(transport, options(value), true);
}
