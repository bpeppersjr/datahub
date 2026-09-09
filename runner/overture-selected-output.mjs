import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, lstat, readdir, statfs } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';

const LIMITS = Object.freeze({ maxLineBytes: 16 * 1024 ** 2, maxRawBytes: 16 * 1024 ** 3,
  maxCompressedBytes: 4 * 1024 ** 3, maxRows: 20000000, minFreeBytes: 5 * 1024 ** 3, diskCheckBytes: 64 * 1024 ** 2 });
const failed = () => new Error('Overture selected output rejected; preserve partial output for inspection.');
const exactOptions = (value, allowed) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).every(key => allowed.includes(key))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
function method(value, key) {
  let current = value;
  for (let depth = 0; current && depth < 12; depth++, current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'function' ? descriptor.value : null;
  }
  return null;
}
const same = (a, b) => a && b && a.ino === b.ino && a.dev === b.dev && !a.isSymbolicLink() && !b.isSymbolicLink();

async function write(options, synthetic) {
  const allowed = synthetic ? ['rows', 'output', 'signal', 'limits'] : ['rows', 'output', 'signal'];
  if (!exactOptions(options, allowed) || !Object.hasOwn(options, 'rows') || typeof options.output !== 'string'
    || options.output !== path.resolve(options.output) || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw failed();
  const { rows, output, signal } = options;
  const limits = { ...LIMITS };
  if (options.limits !== undefined) {
    if (!exactOptions(options.limits, Object.keys(limits))) throw failed();
    for (const [key, value] of Object.entries(options.limits)) {
      if (!Number.isSafeInteger(value) || value < (key === 'minFreeBytes' ? 0 : 1) || value > limits[key]) throw failed();
      limits[key] = value;
    }
  }
  if (!rows || !['object', 'function'].includes(typeof rows)) throw failed();
  const getIterator = method(rows, Symbol.asyncIterator);
  if (!getIterator) throw failed();
  let iterator, next, returnIterator, framed, file, directory, identity, owner, rawBytes = 0, compressedBytes = 0, recordCount = 0, lastDiskCheck = 0, completed = false;
  let failure = false, result, pendingWrite;
  const hash = createHash('sha256');
  async function disk(where) {
    signal?.throwIfAborted();
    const info = await statfs(where, { bigint: true });
    if (info.bavail * info.bsize < BigInt(limits.minFreeBytes)) throw failed();
  }
  async function stable() {
    await canonical(directory);
    if (!same(owner, await lstat(directory, { bigint: true }))) throw failed();
    const names = await readdir(directory);
    if (names.length !== 1 || names[0] !== 'selected-us-places.jsonl.gz') throw failed();
    const current = await file.stat({ bigint: true }), named = await lstat(path.join(directory, names[0]), { bigint: true });
    for (const value of [current, named]) if (!same(identity, value) || !value.isFile() || value.nlink !== 1n || value.size !== BigInt(compressedBytes)) throw failed();
    if (current.mtimeNs !== named.mtimeNs || current.ctimeNs !== named.ctimeNs) throw failed();
  }
  try {
    signal?.throwIfAborted();
    iterator = getIterator.call(rows);
    if (!iterator || !['object', 'function'].includes(typeof iterator)) throw failed();
    next = method(iterator, 'next'); returnIterator = method(iterator, 'return');
    if (!next) throw failed();
    await canonical(output, { output: true });
    let existing = output;
    while (!await lstat(existing).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) existing = path.dirname(existing);
    await disk(existing);
    await canonical(output, { create: true, output: true, signal });
    directory = path.join(output, randomUUID()); await mkdir(directory);
    owner = await lstat(directory, { bigint: true });
    const filename = path.join(directory, 'selected-us-places.jsonl.gz');
    file = await open(filename, 'wx+'); identity = await file.stat({ bigint: true }); await stable();
    async function* lines() {
      for (;;) {
        signal?.throwIfAborted();
        const part = await next.call(iterator);
        signal?.throwIfAborted();
        if (!exactOptions(part, ['done', 'value']) || typeof part.done !== 'boolean') throw failed();
        if (part.done) { completed = true; break; }
        const value = part.value;
        if (typeof value !== 'string' || value.length > limits.maxLineBytes || /[\r\n]/.test(value)) throw failed();
        const bytes = Buffer.from(value, 'utf8');
        if (bytes.length > limits.maxLineBytes || bytes.toString('utf8') !== value) throw failed();
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw failed();
        if (++recordCount > limits.maxRows || rawBytes + bytes.length + 1 > limits.maxRawBytes) throw failed();
        rawBytes += bytes.length + 1;
        yield Buffer.concat([bytes, Buffer.from('\n')]);
      }
    }
    framed = lines();
    const sink = new Writable({ write(chunk, encoding, callback) {
      pendingWrite = (async () => {
        signal?.throwIfAborted();
        if (compressedBytes + chunk.length > limits.maxCompressedBytes) throw failed();
        if (compressedBytes + chunk.length - lastDiskCheck >= limits.diskCheckBytes) { await disk(directory); lastDiskCheck = compressedBytes; }
        await file.writeFile(chunk); compressedBytes += chunk.length; hash.update(chunk);
      })();
      pendingWrite.then(() => callback(), callback);
    } });
    await pipeline(Readable.from(framed), createGzip(), sink, { signal });
    signal?.throwIfAborted(); await file.sync(); await stable();
    const expectedHash = hash.digest('hex'), verifiedHash = createHash('sha256');
    const beforeRead = await file.stat({ bigint: true });
    let position = 0;
    while (position < compressedBytes) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(65536, compressedBytes - position));
      const part = await file.read(buffer, 0, buffer.length, position);
      if (!part.bytesRead) throw failed();
      verifiedHash.update(buffer.subarray(0, part.bytesRead)); position += part.bytesRead;
    }
    signal?.throwIfAborted(); await stable();
    const afterRead = await file.stat({ bigint: true });
    if (beforeRead.mtimeNs !== afterRead.mtimeNs || beforeRead.ctimeNs !== afterRead.ctimeNs || verifiedHash.digest('hex') !== expectedHash) throw failed();
    result = { directory, artifact: { path: 'selected-us-places.jsonl.gz', bytes: compressedBytes, sha256: expectedHash }, record_count: recordCount,
      uncompressed_bytes: rawBytes, claims: { native_acquisition_verified: false, output_schema_verified: false } };
  } catch { failure = true; }
  finally {
    // Pipeline cancellation is cooperative; drain the owned producer before closing its output handle.
    try { await framed?.return(); } catch { failure = true; }
    if (!completed && returnIterator) try { await returnIterator.call(iterator); } catch { failure = true; }
    if (pendingWrite) try { await pendingWrite; } catch { failure = true; }
    if (file) try { await file.close(); } catch { failure = true; }
  }
  if (failure) throw failed();
  return result;
}

export async function writeOvertureSelectedOutput(options) {
  try { return await write(options, false); } catch { throw failed(); }
}
export async function writeOvertureSelectedOutputForTest(options) {
  try { return await write(options, true); } catch { throw failed(); }
}
