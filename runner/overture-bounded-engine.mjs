import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { mkdir, lstat, statfs } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import packageInfo from '../node_modules/@duckdb/node-api/package.json' with { type: 'json' };
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';
import { readOvertureHttpfsRuntime, OVERTURE_HTTPFS_RUNTIME } from './overture-httpfs-runtime.mjs';
import { overtureStreamingSql, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';
import { streamOvertureJsonRows } from './overture-json-stream.mjs';
import { writeOvertureSelectedOutput } from './overture-selected-output.mjs';

const failure = () => new Error('Overture bounded engine failed; preserve run outputs for inspection.');
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const literal = value => `'${value.replaceAll('\\', '/').replaceAll("'", "''")}'`;
const SAME = (a, b) => a.ino === b.ino && a.dev === b.dev && a.isDirectory() && b.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink();
const FLAGS = Object.freeze({ http_retries: '0', auto_fallback_to_full_download: 'false', force_download: 'false',
  force_download_threshold: '0', http_timeout: '30', enable_server_cert_verification: 'true', enable_curl_server_cert_verification: 'true' });

function validate(options) {
  const keys = ['output','runtimeDescriptor','runtimeOutput','runtimeOperationId','bridgeUrls'];
  if (options && Object.hasOwn(options, 'signal')) keys.push('signal');
  if (!exact(options, keys) || typeof options.output !== 'string' || options.output !== path.resolve(options.output)
    || typeof options.runtimeOutput !== 'string' || options.runtimeOutput !== path.resolve(options.runtimeOutput)
    || typeof options.runtimeOperationId !== 'string' || !UUID.test(options.runtimeOperationId)
    || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw failure();
  const descriptor = options.runtimeDescriptor;
  if (!exact(descriptor, ['run_id','operation_id','manifest','sha256','status','cancellation_after_publication'])
    || typeof descriptor.run_id !== 'string' || !UUID.test(descriptor.run_id) || descriptor.operation_id !== options.runtimeOperationId
    || typeof descriptor.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
    || descriptor.status !== OVERTURE_HTTPFS_RUNTIME.status || descriptor.cancellation_after_publication !== false
    || typeof descriptor.manifest !== 'string' || descriptor.manifest !== path.join(options.runtimeOutput, 'jobs', descriptor.run_id, 'manifest.json')) throw failure();
  const query = overtureStreamingSql(options.bridgeUrls);
  return { output: options.output, runtimeOutput: options.runtimeOutput, runtimeOperationId: options.runtimeOperationId,
    runtimeDescriptor: { ...descriptor }, signal: options.signal, query, queryFingerprint: overtureStreamingQueryFingerprint(options.bridgeUrls.length) };
}

async function run(value) {
  const { output, runtimeDescriptor, runtimeOutput, runtimeOperationId, signal, query, queryFingerprint } = validate(value);
  signal?.throwIfAborted();
  if (process.platform !== 'win32' || process.arch !== 'x64' || packageInfo.version !== OVERTURE_HTTPFS_RUNTIME.package_version) throw failure();
  await readOvertureHttpfsRuntime(runtimeDescriptor, { output: runtimeOutput, operationId: runtimeOperationId });
  signal?.throwIfAborted();
  await canonical(output, { output: true, signal });
  let ancestor = output;
  while (!await lstat(ancestor).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) ancestor = path.dirname(ancestor);
  const disk = await statfs(ancestor, { bigint: true });
  if (disk.bavail * disk.bsize < 10n * 1024n ** 3n) throw failure();
  await canonical(output, { output: true, create: true, signal });
  const directory = path.join(output, randomUUID()); await mkdir(directory);
  const owner = await lstat(directory, { bigint: true });
  const childOwners = new Map();
  for (const name of ['home','extensions','spill','selected']) {
    await mkdir(path.join(directory, name));
    childOwners.set(name, await lstat(path.join(directory, name), { bigint: true }));
  }
  async function owned() {
    signal?.throwIfAborted(); await canonical(directory, { signal });
    if (!SAME(owner, await lstat(directory, { bigint: true }))) throw failure();
    for (const [name, identity] of childOwners) {
      await canonical(path.join(directory, name), { signal });
      if (!SAME(identity, await lstat(path.join(directory, name), { bigint: true }))) throw failure();
    }
  }
  const config = { threads: '1', memory_limit: '2GiB', max_temp_directory_size: '4GiB',
    home_directory: path.join(directory, 'home'), extension_directory: path.join(directory, 'extensions'), temp_directory: path.join(directory, 'spill'),
    autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false', enable_external_access: 'true' };
  let instance, connection, selected, engineSettings, interrupted = false, failed = false;
  const interrupt = () => { try { connection?.interrupt(); } catch { interrupted = true; } };
  const check = () => { signal?.throwIfAborted(); if (interrupted) throw failure(); };
  try {
    await owned();
    instance = await DuckDBInstance.create(':memory:', config); check();
    connection = await instance.connect();
    signal?.addEventListener('abort', interrupt, { once: true }); check();
    const version = (await connection.runAndReadAll('SELECT version() AS version')).getRowObjectsJson(); check();
    const platform = (await connection.runAndReadAll('PRAGMA platform')).getRowObjectsJson(); check();
    if (version.length !== 1 || version[0].version !== OVERTURE_HTTPFS_RUNTIME.engine_version || platform.length !== 1 || platform[0].platform !== OVERTURE_HTTPFS_RUNTIME.platform) throw failure();
    await owned();
    await connection.run(`LOAD ${literal(path.join(path.dirname(runtimeDescriptor.manifest), 'httpfs.duckdb_extension'))}`); check();
    for (const [name, setting] of Object.entries(FLAGS)) { await connection.run(`SET ${name}=${setting}`); check(); }
    const names = [...Object.keys(config), ...Object.keys(FLAGS)];
    const settings = (await connection.runAndReadAll(`SELECT name,value FROM duckdb_settings() WHERE name IN (${names.map(literal).join(',')})`)).getRowObjectsJson(); check();
    if (settings.length !== names.length || new Set(settings.map(row => row.name)).size !== names.length) throw failure();
    engineSettings = {};
    for (const row of settings) {
      if (!names.includes(row.name) || typeof row.value !== 'string') throw failure();
      const expected = config[row.name] ?? FLAGS[row.name];
      if (['home_directory','extension_directory','temp_directory'].includes(row.name)) {
        if (path.resolve(row.value) !== path.resolve(expected)) throw failure();
        engineSettings[row.name] = 'owned-run-directory';
      } else if (row.name === 'memory_limit' || row.name === 'max_temp_directory_size') {
        const match = /^(\d+(?:\.\d+)?)\s*GiB$/.exec(row.value);
        if (!match || Number(match[1]) !== (row.name === 'memory_limit' ? 2 : 4)) throw failure();
        engineSettings[row.name] = expected;
      } else {
        if (row.value !== expected) throw failure();
        engineSettings[row.name] = expected;
      }
    }
    selected = await writeOvertureSelectedOutput({ output: path.join(directory, 'selected'), rows: streamOvertureJsonRows({ connection, query, signal }), signal });
    check(); await owned();
    await readOvertureHttpfsRuntime(runtimeDescriptor, { output: runtimeOutput, operationId: runtimeOperationId }); check();
  } catch { failed = true; }
  finally {
    signal?.removeEventListener('abort', interrupt);
    for (const handle of [connection, instance]) if (handle) try { handle.closeSync(); } catch { failed = true; }
  }
  if (failed || interrupted || signal?.aborted) throw failure();
  await owned();
  return { directory, selected, query_fingerprint: queryFingerprint, engine_settings: engineSettings,
    runtime_reference: { operation_id: runtimeOperationId, run_id: runtimeDescriptor.run_id, manifest_sha256: runtimeDescriptor.sha256 },
    claims: { native_acquisition_verified: false, process_memory_cap_enforced: false, hard_deadline_enforced: false } };
}

export async function runOvertureBoundedEngine(options) {
  try { return await run(options); } catch { throw failure(); }
}
