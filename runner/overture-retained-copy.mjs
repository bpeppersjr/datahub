import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { open, lstat, link, unlink, statfs } from 'node:fs/promises';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';
const failure = () => new Error('Overture retained copy rejected; preserve staging evidence.');
const regular = s => s.isFile() && !s.isSymbolicLink() && s.nlink === 1n;
const owner = (a, b) => regular(b) && a.dev === b.dev && a.ino === b.ino;
const stable = (a, b) => owner(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

export async function copyOvertureRetainedSource(options) {
  let input, output;
  try {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).some(k => !['source', 'destination', 'bytes', 'sha256', 'signal'].includes(k))
      || Object.values(Object.getOwnPropertyDescriptors(options)).some(d => !Object.hasOwn(d, 'value'))) throw failure();
    const { source, destination, bytes, sha256, signal } = options;
    if ([source, destination].some(v => typeof v !== 'string' || v !== path.resolve(v)) || source === destination
      || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 4 * 1024 ** 3 || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)
      || (signal !== undefined && !(signal instanceof AbortSignal))) throw failure();
    const check = () => signal?.throwIfAborted();
    check(); await canonical(path.dirname(source), { signal }); await canonical(path.dirname(destination), { signal });
    const exists = await lstat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (exists) throw failure();
    const disk = async remaining => { check(); const s = await statfs(path.dirname(destination), { bigint: true }); if (s.bavail * s.bsize < BigInt(remaining) + 10n * 1024n ** 3n) throw failure(); };
    await disk(bytes);
    const initial = await lstat(source, { bigint: true });
    if (!regular(initial) || initial.size !== BigInt(bytes)) throw failure();
    input = await open(source, 'r'); if (!stable(initial, await input.stat({ bigint: true }))) throw failure();
    const temporary = destination + '.tmp-' + randomUUID();
    output = await open(temporary, 'wx+'); const targetOwner = await output.stat({ bigint: true });
    const buffer = Buffer.alloc(65536), digest = createHash('sha256'); let copied = 0, sampled = 0;
    while (copied < bytes) {
      check(); const result = await input.read(buffer, 0, Math.min(buffer.length, bytes - copied), copied);
      if (!result.bytesRead) throw failure();
      digest.update(buffer.subarray(0, result.bytesRead));
      let written = 0;
      while (written < result.bytesRead) {
        check(); const part = await output.write(buffer, written, result.bytesRead - written, copied + written);
        if (!part.bytesWritten) throw failure(); written += part.bytesWritten;
      }
      copied += result.bytesRead;
      if (copied - sampled >= 64 * 1024 ** 2) { await disk(bytes - copied); sampled = copied; }
    }
    if (digest.digest('hex') !== sha256) throw failure();
    await canonical(path.dirname(source), { signal });
    for (const s of [await input.stat({ bigint: true }), await lstat(source, { bigint: true })]) if (!stable(initial, s)) throw failure();
    await output.sync(); check(); const sealed = await output.stat({ bigint: true });
    const retained = createHash('sha256'); let read = 0;
    while (read < bytes) {
      check(); const part = await output.read(buffer, 0, Math.min(buffer.length, bytes - read), read);
      if (!part.bytesRead) throw failure(); retained.update(buffer.subarray(0, part.bytesRead)); read += part.bytesRead;
    }
    if (retained.digest('hex') !== sha256) throw failure();
    await canonical(path.dirname(destination), { signal });
    for (const s of [await output.stat({ bigint: true }), await lstat(temporary, { bigint: true })]) if (!owner(targetOwner, s) || !stable(sealed, s) || s.size !== BigInt(bytes)) throw failure();
    await disk(0); check();
    await output.close(); output = null; await input.close(); input = null;
    // Exclusive publication: an existing destination is never replaced.
    await link(temporary, destination); await unlink(temporary); check();
    await canonical(path.dirname(destination), { signal });
    const final = await lstat(destination, { bigint: true });
    if (!owner(targetOwner, final) || final.size !== sealed.size || final.mtimeNs !== sealed.mtimeNs) throw failure();
    return { bytes, sha256 };
  } catch { throw failure(); }
  finally {
    const results = await Promise.allSettled([input, output].filter(Boolean).map(handle => handle.close()));
    if (results.some(result => result.status === 'rejected')) throw failure();
  }
}
