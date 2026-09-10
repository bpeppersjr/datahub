import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';

const LIMITS = Object.freeze({ maxFiles: 17, maxRows: 20000000, maxLineBytes: 16 * 1024 ** 2,
  maxFileRawBytes: 16 * 1024 ** 3, maxRawBytes: 32 * 1024 ** 3,
  maxFileCompressedBytes: 4 * 1024 ** 3, maxCompressedBytes: 8 * 1024 ** 3,
  minFreeBytes: 10 * 1024 ** 3, diskCheckBytes: 64 * 1024 ** 2 });
const failure = () => new Error('Overture normalization output budget rejected; preserve staging evidence.');
const plain = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => keys.includes(k))
  && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value'));

async function create(options, synthetic) {
  if (!plain(options, synthetic ? ['directory', 'signal', 'limits'] : ['directory', 'signal']) || typeof options.directory !== 'string'
    || options.directory !== path.resolve(options.directory) || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw failure();
  const limits = { ...LIMITS }, { directory, signal } = options;
  if (options.limits !== undefined) {
    if (!plain(options.limits, Object.keys(limits))) throw failure();
    for (const [key, value] of Object.entries(options.limits)) {
      if (!Number.isSafeInteger(value) || value < (key === 'minFreeBytes' ? 0 : 1) || value > limits[key]) throw failure();
      limits[key] = value;
    }
  }
  const files = new Map(); let raw = 0, compressed = 0, rows = 0, checkedAt = 0, closed = false;
  function guarded(action) { try { if (closed || signal?.aborted) throw failure(); return action(); } catch { closed = true; throw failure(); } }
  function file(key) { const value = files.get(key); if (!value) throw failure(); return value; }
  function amount(bytes) { if (!Number.isSafeInteger(bytes) || bytes < 1) throw failure(); }
  async function checkDisk(force = false) {
    try {
      guarded(() => {});
      if (!force && raw - checkedAt < limits.diskCheckBytes) return;
      await canonical(directory, { signal });
      const info = await statfs(directory, { bigint: true });
      if (info.bavail * info.bsize < BigInt(limits.minFreeBytes)) throw failure();
      guarded(() => {}); checkedAt = raw;
    } catch { closed = true; throw failure(); }
  }
  await checkDisk(true);
  return {
    register(key) { return guarded(() => {
      if (typeof key !== 'string' || !key.length || key.length > 256 || files.has(key) || files.size >= limits.maxFiles) throw failure();
      files.set(key, { raw_bytes_reserved: 0, compressed_bytes_reserved: 0, records_reserved: 0 });
    }); },
    reserveRaw(key, bytes) { return guarded(() => {
      amount(bytes); const f = file(key);
      if (bytes > limits.maxLineBytes + 1 || raw + bytes > limits.maxRawBytes || f.raw_bytes_reserved + bytes > limits.maxFileRawBytes || rows >= limits.maxRows) throw failure();
      raw += bytes; rows++; f.raw_bytes_reserved += bytes; f.records_reserved++;
    }); },
    reserveCompressed(key, bytes) { return guarded(() => {
      amount(bytes); const f = file(key);
      if (compressed + bytes > limits.maxCompressedBytes || f.compressed_bytes_reserved + bytes > limits.maxFileCompressedBytes) throw failure();
      compressed += bytes; f.compressed_bytes_reserved += bytes;
    }); },
    fileUsage(key) { return { ...file(key) }; },
    snapshot() { return { raw_bytes_reserved: raw, compressed_bytes_reserved: compressed, records_reserved: rows, registered_files: files.size, closed, limits: { ...limits } }; },
    checkDisk,
  };
}

export async function createOvertureNormalizationBudget(options) { return create(options, false); }
export async function createOvertureNormalizationBudgetForTest(options) { return create(options, true); }
