import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, lstat, readdir, statfs } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';

const MAX_ROWS = 20_000_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure = () => new Error('Overture identity check failed; preserve run storage for inspection.');
const duplicate = () => new Error('Overture identity check found duplicate source identities; normalization must not publish.');
const same = (a, b) => a.ino === b.ino && a.dev === b.dev && !b.isSymbolicLink();
function method(value, key) {
  for (let current = value; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'function' ? descriptor.value : null;
  }
  return null;
}

// A bounded local component for the managed normalizer, not an acquisition or publication endpoint.
export async function checkOvertureIdentities(options) {
  const keys = ['output', 'ids']; for (const key of ['signal', 'rowLimit']) if (options && Object.hasOwn(options, key)) keys.push(key);
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).length !== keys.length
    || !keys.every(key => Object.hasOwn(options, key)) || Object.values(Object.getOwnPropertyDescriptors(options)).some(d => !Object.hasOwn(d, 'value'))
    || typeof options.output !== 'string' || options.output !== path.resolve(options.output)
    || (options.signal !== undefined && !(options.signal instanceof AbortSignal))
    || (options.rowLimit !== undefined && (!Number.isSafeInteger(options.rowLimit) || options.rowLimit < 1 || options.rowLimit > MAX_ROWS))) throw failure();
  const { output, ids, signal } = options, rowLimit = options.rowLimit ?? MAX_ROWS, iteratorMethod = method(ids, Symbol.asyncIterator);
  if (!iteratorMethod) throw failure();
  const check = () => signal?.throwIfAborted();
  let instance, connection, appender, iterator, next, finishIterator, directory, count = 0, duplicateFound = false, failed = false;
  let exhausted = false, interrupted = false, inspectOwned;
  const interrupt = () => { try { connection?.interrupt(); } catch { interrupted = true; } };
  try {
    check(); await canonical(output, { create: true, output: true, signal });
    const disk = await statfs(output, { bigint: true });
    if (disk.bavail * disk.bsize < 8n * 1024n ** 3n) throw failure();
    directory = path.join(output, randomUUID()); await mkdir(directory);
    const owners = new Map([['', await lstat(directory, { bigint: true })]]);
    for (const name of ['home', 'extensions', 'spill']) { await mkdir(path.join(directory, name)); owners.set(name, await lstat(path.join(directory, name), { bigint: true })); }
    let databaseOwner;
    inspectOwned = async () => {
      await canonical(directory);
      for (const [name, owner] of owners) {
        const stat = await lstat(path.join(directory, name), { bigint: true });
        if (!stat.isDirectory() || !same(owner, stat)) throw failure();
      }
      const names = await readdir(directory);
      if (names.some(name => !['home', 'extensions', 'spill', 'identity.duckdb', 'identity.duckdb.wal'].includes(name))) throw failure();
      let bytes = 0n;
      for (const name of names.filter(name => name.startsWith('identity.'))) {
        const stat = await lstat(path.join(directory, name), { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw failure();
        if (name === 'identity.duckdb') { if (databaseOwner && !same(databaseOwner, stat)) throw failure(); databaseOwner ??= stat; }
        bytes += stat.size;
      }
      if (bytes > 2n * 1024n ** 3n) throw failure();
      const available = await statfs(directory, { bigint: true });
      if (available.bavail * available.bsize < 5n * 1024n ** 3n) throw failure();
    };
    const config = { threads: '1', memory_limit: '512MiB', max_temp_directory_size: '4GiB',
      home_directory: path.join(directory, 'home'), extension_directory: path.join(directory, 'extensions'), temp_directory: path.join(directory, 'spill'),
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false',
      enable_external_access: 'false', preserve_insertion_order: 'false', checkpoint_threshold: '32MiB' };
    instance = await DuckDBInstance.create(path.join(directory, 'identity.duckdb'), config); check();
    connection = await instance.connect(); signal?.addEventListener('abort', interrupt, { once: true }); check();
    const settings = (await connection.runAndReadAll("SELECT name,value FROM duckdb_settings() WHERE name IN ('threads','memory_limit','max_temp_directory_size','enable_external_access','autoinstall_known_extensions','autoload_known_extensions','allow_unsigned_extensions','allow_community_extensions','preserve_insertion_order')")).getRowObjectsJson();
    const expected = { threads: '1', memory_limit: '512.0MiB', max_temp_directory_size: '4.0GiB', enable_external_access: 'false',
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false', allow_community_extensions: 'false', preserve_insertion_order: 'false' };
    if (settings.length !== Object.keys(expected).length || new Set(settings.map(row => row.name)).size !== settings.length
      || settings.some(row => row.value.replaceAll(' ', '') !== expected[row.name])) throw failure();
    await connection.run('CREATE TABLE identities (id VARCHAR NOT NULL)'); check(); await inspectOwned();
    appender = await connection.createAppender('identities'); check();
    iterator = iteratorMethod.call(ids); next = method(iterator, 'next'); finishIterator = method(iterator, 'return');
    if (!next) throw failure();
    for (;;) {
      check(); const item = await next.call(iterator); check();
      if (!item || typeof item !== 'object' || typeof item.done !== 'boolean') throw failure();
      if (item.done) { exhausted = true; break; }
      if (typeof item.value !== 'string' || !UUID.test(item.value) || count >= rowLimit) throw failure();
      appender.appendVarchar(item.value); appender.endRow(); count++;
      if (count % 8192 === 0) { appender.flushSync(); check(); await inspectOwned(); }
    }
    appender.closeSync(); appender = null; check(); await inspectOwned();
    // No primary-key index: the aggregate can spill instead of retaining a global JS Set or ART index.
    const duplicates = (await connection.runAndReadAll('SELECT 1 AS duplicate FROM identities GROUP BY id HAVING count(*) > 1 LIMIT 1')).getRowObjectsJson(); check();
    const total = (await connection.runAndReadAll('SELECT count(*)::DOUBLE AS count FROM identities')).getRowObjectsJson(); check();
    if (total.length !== 1 || total[0].count !== count) throw failure();
    duplicateFound = duplicates.length !== 0;
    await connection.run('CHECKPOINT'); check(); await inspectOwned();
  } catch { failed = true; }
  finally {
    signal?.removeEventListener('abort', interrupt);
    if (!exhausted && finishIterator) try { await finishIterator.call(iterator); } catch { failed = true; }
    for (const handle of [appender, connection, instance]) if (handle) try { handle.closeSync(); } catch { failed = true; }
  }
  if (failed || interrupted || signal?.aborted) throw failure();
  try { await inspectOwned(); } catch { throw failure(); }
  if (duplicateFound) throw duplicate();
  return { directory, record_count: count, unique: true, limits: { rows: rowLimit, engine_memory_bytes: 512 * 1024 ** 2, spill_bytes: 4 * 1024 ** 3 },
    claims: { normalized_businesses_published: false, persistent_resume_supported: false, process_memory_cap_enforced: false } };
}
