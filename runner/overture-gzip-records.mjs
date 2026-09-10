import path from 'node:path';
import { lstat, open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';

const LIMITS = Object.freeze({ maxCompressedBytes: 4 * 1024 ** 3, maxRawBytes: 16 * 1024 ** 3,
  maxLineBytes: 16 * 1024 ** 2, maxRows: 20000000 });
const rejected = () => new Error('Overture gzip records rejected; preserve source evidence for inspection.');
const plain = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).every(key => keys.includes(key))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const same = (a, b) => b.isFile() && !b.isSymbolicLink() && b.nlink === 1n && a.ino === b.ino
  && a.dev === b.dev && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

export async function* streamOvertureGzipRecords(options) {
  let handle, source, gunzip, pumping, pipelineFailed = false;
  try {
    if (!plain(options, ['filename', 'signal', 'limits']) || typeof options.filename !== 'string'
      || options.filename !== path.resolve(options.filename)
      || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw rejected();
    const { filename, signal } = options, limits = { ...LIMITS };
    if (options.limits !== undefined) {
      if (!plain(options.limits, Object.keys(LIMITS))) throw rejected();
      for (const [key, value] of Object.entries(options.limits)) {
        if (!Number.isSafeInteger(value) || value < 1 || value > limits[key]) throw rejected();
        limits[key] = value;
      }
    }
    signal?.throwIfAborted();
    await canonical(path.dirname(filename), { signal });
    const initial = await lstat(filename, { bigint: true });
    if (!same(initial, initial) || initial.size < 1n || initial.size > BigInt(limits.maxCompressedBytes)) throw rejected();
    handle = await open(filename, 'r');
    if (!same(initial, await handle.stat({ bigint: true }))) throw rejected();
    signal?.throwIfAborted();
    source = handle.createReadStream({ autoClose: false, start: 0, end: Number(initial.size) - 1, highWaterMark: 65536 });
    gunzip = createGunzip();
    pumping = pipeline(source, gunzip, { signal }).catch(() => { pipelineFailed = true; });
    let rawBytes = 0, lineBytes = 0, count = 0, fragments = [];
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    for await (const chunk of gunzip) {
      signal?.throwIfAborted();
      rawBytes += chunk.length; if (rawBytes > limits.maxRawBytes) throw rejected();
      let offset = 0;
      while (offset < chunk.length) {
        signal?.throwIfAborted();
        const end = chunk.indexOf(10, offset), stop = end === -1 ? chunk.length : end;
        const fragment = chunk.subarray(offset, stop);
        lineBytes += fragment.length; if (lineBytes > limits.maxLineBytes) throw rejected();
        if (fragment.length) fragments.push(fragment);
        if (end === -1) break;
        if (!lineBytes || ++count > limits.maxRows) throw rejected();
        const row = JSON.parse(decoder.decode(Buffer.concat(fragments, lineBytes)));
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw rejected();
        fragments = []; lineBytes = 0; offset = end + 1;
        yield row;
      }
    }
    await pumping; signal?.throwIfAborted();
    if (pipelineFailed || lineBytes) throw rejected();
    await canonical(path.dirname(filename), { signal });
    for (const current of [await handle.stat({ bigint: true }), await lstat(filename, { bigint: true })]) {
      if (!same(initial, current)) throw rejected();
    }
  } catch { throw rejected(); }
  finally {
    // Early iterator return must also release decompression and the owned file.
    source?.destroy(); gunzip?.destroy();
    if (pumping) await pumping;
    if (handle) try { await handle.close(); } catch { throw rejected(); }
  }
}
