import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, lstat, readdir, link, unlink } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import packageInfo from '../node_modules/@duckdb/node-api/package.json' with { type: 'json' };
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

export const OVERTURE_HTTPFS_RUNTIME = Object.freeze({
  version: 'overture-httpfs-runtime@1.0.0',
  url: 'https://extensions.duckdb.org/v1.5.5/windows_amd64/httpfs.duckdb_extension.gz',
  engine_version: 'v1.5.5', platform: 'windows_amd64', package_version: '1.5.5-r.4',
  compressed_cap: 16 * 1024 * 1024, decompressed_cap: 64 * 1024 * 1024, deadline_ms: 60000,
  status: 'runtime-verified-no-place-acquisition',
});
const C = OVERTURE_HTTPFS_RUNTIME;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const artifactNames = ['httpfs.duckdb_extension.gz', 'httpfs.duckdb_extension'];
const directoryNames = ['extensions', 'home', 'spill'];
const fail = () => { throw Error('Overture httpfs runtime evidence rejected.'); };
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const same = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino && !a.isSymbolicLink() && !b.isSymbolicLink();
const claims = () => ({ acquisitionReady: false, place_acquisition_performed: false, public_export_authorized: false,
  hard_process_deadline_enforced: false, engine_memory_is_process_ram_cap: false });

function options(value, signalAllowed) {
  const keys = ['output', 'operationId'];
  if (signalAllowed && value && Object.hasOwn(value, 'signal')) keys.push('signal');
  if (!signalAllowed && value && Object.hasOwn(value, 'startedAt')) keys.push('startedAt');
  if (!exact(value, keys) || typeof value.output !== 'string' || value.output !== path.resolve(value.output)
    || !UUID.test(value.operationId) || path.basename(value.output) !== 'output'
    || path.basename(path.dirname(value.output)) !== value.operationId
    || (value.signal !== undefined && !(value.signal instanceof AbortSignal))
    || (value.startedAt !== undefined && (typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt)) || new Date(value.startedAt).toISOString() !== value.startedAt))) fail();
  return value;
}

async function hashBinary(filename, maximum, signal) {
  await canonical(path.dirname(filename), { signal });
  const initial = await lstat(filename, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1n || initial.size < 1n || initial.size > BigInt(maximum)) fail();
  const file = await open(filename, 'r');
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    if (!same(initial, await file.stat({ bigint: true }))) fail();
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(65536);
      const chunk = await file.read(buffer, 0, buffer.length, null);
      if (!chunk.bytesRead) break;
      bytes += chunk.bytesRead;
      if (bytes > maximum) fail();
      hash.update(buffer.subarray(0, chunk.bytesRead));
    }
    const after = await file.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    for (const value of [after, named]) if (!same(initial, value) || value.nlink !== 1n || value.size !== initial.size || value.mtimeNs !== initial.mtimeNs || value.ctimeNs !== initial.ctimeNs) fail();
    if (BigInt(bytes) !== initial.size) fail();
    return { path: path.basename(filename), bytes, sha256: hash.digest('hex') };
  } finally { await file.close(); }
}

async function writeCompressed(body, filename, signal) {
  const file = await open(filename, 'wx');
  const reader = body.getReader();
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > C.compressed_cap) fail();
      await file.writeFile(chunk.value);
    }
    if (!bytes) fail();
    await file.sync();
    return bytes;
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close();
  }
}

// This pure stream helper does not create a receipt or claim extension authenticity.
export async function decompressOvertureHttpfsForTest(compressed, { signal } = {}) {
  if (!(compressed instanceof Uint8Array) || compressed.byteLength > C.compressed_cap) fail();
  const chunks = [];
  let bytes = 0;
  await pipeline(Readable.from([compressed]), createGunzip(), new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > C.decompressed_cap) callback(Error('Overture httpfs decompression ceiling exceeded.'));
      else { chunks.push(chunk); callback(); }
    },
  }), { signal });
  if (!bytes) fail();
  return Buffer.concat(chunks);
}

async function decompressFile(source, destination, signal) {
  let input, output;
  const errors = [];
  let bytes = 0;
  try {
    await canonical(path.dirname(source), { signal });
    await canonical(path.dirname(destination), { signal });
    const identity = await lstat(source, { bigint: true });
    if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1n || identity.size > BigInt(C.compressed_cap)) fail();
    input = await open(source, 'r');
    if (!same(identity, await input.stat({ bigint: true }))) fail();
    output = await open(destination, 'wx');
    async function* chunks() {
      for (;;) {
        signal?.throwIfAborted();
        const buffer = Buffer.alloc(65536), part = await input.read(buffer, 0, buffer.length, null);
        if (!part.bytesRead) break;
        yield buffer.subarray(0, part.bytesRead);
      }
    }
    await pipeline(Readable.from(chunks()), createGunzip(), new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(bytes > C.decompressed_cap ? Error('Overture httpfs decompression ceiling exceeded.') : null, chunk);
      },
    }), new Writable({ write(chunk, encoding, callback) { output.writeFile(chunk).then(() => callback(), callback); } }), { signal });
    if (!bytes) fail();
    await output.sync();
  } catch (error) { errors.push(error); }
  finally {
    for (const handle of [input, output]) if (handle) try { await handle.close(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Overture httpfs decompression or cleanup failed.');
}

export async function decompressOvertureHttpfsFileForTest(source, destination, { signal } = {}) {
  if (typeof source !== 'string' || typeof destination !== 'string' || !source.includes(`${path.sep}data${path.sep}tmp${path.sep}`)
    || !destination.includes(`${path.sep}data${path.sep}tmp${path.sep}`)) fail();
  return decompressFile(source, destination, signal);
}

async function verifyEngine(directory, binary, signal, owner) {
  let instance, connection;
  const errors = [];
  const abort = () => { try { connection?.interrupt(); } catch (error) { errors.push(error); } };
  const literal = value => `'${value.replaceAll('\\', '/').replaceAll("'", "''")}'`;
  try {
    signal.throwIfAborted();
    await canonical(directory, { signal });
    if (!same(owner, await lstat(directory, { bigint: true }))) fail();
    for (const name of directoryNames) await canonical(path.join(directory, name), { signal });
    instance = await DuckDBInstance.create(':memory:', { threads: '1', memory_limit: '512MiB', max_temp_directory_size: '1GiB',
      home_directory: path.join(directory, 'home'), temp_directory: path.join(directory, 'spill'), extension_directory: path.join(directory, 'extensions'),
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false', enable_external_access: 'true' });
    signal.throwIfAborted();
    connection = await instance.connect();
    signal.addEventListener('abort', abort, { once: true });
    signal.throwIfAborted();
    const versions = (await connection.runAndReadAll('SELECT version() AS version')).getRowObjectsJson();
    const platforms = (await connection.runAndReadAll('PRAGMA platform')).getRowObjectsJson();
    if (versions.length !== 1 || versions[0].version !== C.engine_version || platforms.length !== 1 || platforms[0].platform !== C.platform) fail();
    if (binary !== null) {
      await connection.run(`LOAD ${literal(binary)}`);
      signal.throwIfAborted();
      const extensions = (await connection.runAndReadAll("SELECT extension_name, loaded FROM duckdb_extensions() WHERE extension_name = 'httpfs'")).getRowObjectsJson();
      if (extensions.length !== 1 || extensions[0].extension_name !== 'httpfs' || extensions[0].loaded !== true) fail();
    }
  } catch (error) { errors.unshift(error); }
  finally {
    signal.removeEventListener('abort', abort);
    for (const handle of [connection, instance]) if (handle) try { handle.closeSync(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw Error('Overture httpfs engine verification failed.');
}

async function inventory(directory) {
  await canonical(directory);
  const names = await readdir(directory);
  if (JSON.stringify(names.sort()) !== JSON.stringify([...artifactNames, ...directoryNames, 'manifest.json'].sort())) fail();
  for (const name of directoryNames) {
    await canonical(path.join(directory, name));
    if ((await readdir(path.join(directory, name))).length) fail();
  }
}

export async function readOvertureHttpfsRuntime(descriptor, value) {
  const { output, operationId, startedAt } = options(value, false);
  if (!exact(descriptor, ['run_id', 'operation_id', 'manifest', 'sha256', 'status', 'cancellation_after_publication'])
    || !UUID.test(descriptor.run_id) || descriptor.operation_id !== operationId || !SHA.test(descriptor.sha256)
    || descriptor.status !== C.status || typeof descriptor.cancellation_after_publication !== 'boolean') fail();
  const directory = path.join(output, 'jobs', descriptor.run_id);
  if (descriptor.manifest !== path.join(directory, 'manifest.json')) fail();
  await inventory(directory);
  const meter = {}, manifest = await readJson(descriptor.manifest, 16384, undefined, meter);
  if (meter.sha256 !== descriptor.sha256 || !exact(manifest, ['schema_version','run_id','operation_id','execution_mode','status','started_at','completed_at','source_url','package_version','engine_version','platform','artifacts','claims'])
    || manifest.schema_version !== C.version || manifest.run_id !== descriptor.run_id || manifest.operation_id !== operationId
    || manifest.execution_mode !== 'native-core-signature-checked-local-load' || manifest.status !== C.status
    || manifest.source_url !== C.url || manifest.package_version !== C.package_version || manifest.engine_version !== C.engine_version || manifest.platform !== C.platform
    || !Number.isFinite(Date.parse(manifest.started_at)) || !Number.isFinite(Date.parse(manifest.completed_at))
    || new Date(manifest.started_at).toISOString() !== manifest.started_at || new Date(manifest.completed_at).toISOString() !== manifest.completed_at
    || manifest.completed_at < manifest.started_at || (startedAt && manifest.started_at < startedAt) || Date.parse(manifest.completed_at) > Date.now() + 5000
    || !exact(manifest.claims, Object.keys(claims())) || Object.values(manifest.claims).some(value => value !== false)
    || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) fail();
  for (let index = 0; index < 2; index++) {
    const artifact = manifest.artifacts[index];
    if (!exact(artifact, ['path','bytes','sha256']) || artifact.path !== artifactNames[index]) fail();
    const actual = await hashBinary(path.join(directory, artifact.path), index === 0 ? C.compressed_cap : C.decompressed_cap);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) fail();
  }
  await inventory(directory);
  const final = {}; await readJson(descriptor.manifest, 16384, undefined, final);
  if (final.sha256 !== descriptor.sha256 || !same(meter.identity, final.identity)) fail();
  return { manifest, sha256: descriptor.sha256, verification: { artifact_integrity_verified: true, extension_executed_this_read: false, signature_verified_this_read: false } };
}

export async function prepareOvertureHttpfsRuntime(value) {
  const { output, operationId, signal } = options(value, true);
  if (process.platform !== 'win32' || process.arch !== 'x64' || packageInfo.version !== C.package_version) fail();
  const whole = new AbortController(), abort = () => whole.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, C.deadline_ms);
  let published = false, descriptor, manifestWriter;
  try {
    whole.signal.throwIfAborted();
    await canonical(output, { create: true, output: true, signal: whole.signal });
    const jobs = path.join(output, 'jobs'); await canonical(jobs, { create: true, output: true, signal: whole.signal });
    const run = randomUUID(), directory = path.join(jobs, run); await mkdir(directory);
    const owner = await lstat(directory, { bigint: true });
    for (const name of directoryNames) await mkdir(path.join(directory, name));
    const started = new Date().toISOString();
    // Engine/package/platform admission must precede the sole network request.
    await verifyEngine(directory, null, whole.signal, owner);
    whole.signal.throwIfAborted();
    const response = await fetch(C.url, { redirect: 'error', credentials: 'omit', headers: { 'Accept-Encoding': 'identity' }, signal: whole.signal });
    if (response.status !== 200 || response.redirected || !response.body || (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')) { await response.body?.cancel(); fail(); }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > C.compressed_cap)) { await response.body.cancel(); fail(); }
    const compressed = path.join(directory, artifactNames[0]), binary = path.join(directory, artifactNames[1]);
    const downloadedBytes = await writeCompressed(response.body, compressed, whole.signal);
    if (length !== null && downloadedBytes !== Number(length)) fail();
    await decompressFile(compressed, binary, whole.signal);
    const artifacts = [await hashBinary(compressed, C.compressed_cap, whole.signal), await hashBinary(binary, C.decompressed_cap, whole.signal)];
    await verifyEngine(directory, binary, whole.signal, owner);
    whole.signal.throwIfAborted(); await canonical(directory);
    if (!same(owner, await lstat(directory, { bigint: true }))) fail();
    for (let index = 0; index < 2; index++) if (JSON.stringify(await hashBinary(path.join(directory, artifactNames[index]), index === 0 ? C.compressed_cap : C.decompressed_cap, whole.signal)) !== JSON.stringify(artifacts[index])) fail();
    const manifest = { schema_version: C.version, run_id: run, operation_id: operationId, execution_mode: 'native-core-signature-checked-local-load', status: C.status,
      started_at: started, completed_at: new Date().toISOString(), source_url: C.url, package_version: C.package_version, engine_version: C.engine_version, platform: C.platform, artifacts, claims: claims() };
    const temporary = path.join(directory, 'manifest.tmp'), final = path.join(directory, 'manifest.json');
    manifestWriter = await writer(temporary, 16384, whole.signal, new Map()); await manifestWriter.write(manifest); const receipt = await manifestWriter.finish();
    descriptor = { run_id: run, operation_id: operationId, manifest: final, sha256: receipt.sha256, status: C.status, cancellation_after_publication: false };
    whole.signal.throwIfAborted(); await link(temporary, final); published = true; await unlink(temporary);
    descriptor.cancellation_after_publication = whole.signal.aborted;
    await readOvertureHttpfsRuntime(descriptor, { output, operationId });
    descriptor.cancellation_after_publication = whole.signal.aborted;
    return descriptor;
  } catch {
    const error = Error('Overture httpfs runtime prerequisite failed; preserve run outputs for inspection.');
    if (published) error.recovery = descriptor;
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); await manifestWriter?.close(); }
}
