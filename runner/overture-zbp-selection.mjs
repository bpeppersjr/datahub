import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { verifyCensusZbpRelease } from './census-zbp.mjs';

const failure = () => new Error('Pinned Overture Census baseline rejected; preserve retained evidence.');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
export function validateOvertureZbpSelection(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 2
    || !Object.hasOwn(value, 'manifest') || !Object.hasOwn(value, 'sha256')
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))
    || typeof value.manifest !== 'string' || value.manifest !== path.resolve(value.manifest)
    || path.basename(value.manifest) !== 'manifest.json' || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) throw failure();
  return { ...value };
}

export async function verifyOvertureZbpSelection(value, { signal } = {}) {
  try {
    const selected = validateOvertureZbpSelection(value);
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw failure();
    signal?.throwIfAborted();
    const meter = {}, manifest = await readJson(selected.manifest, 4 * 1024 ** 2, signal, meter);
    if (meter.sha256 !== selected.sha256 || manifest.dataset_id !== 'census-zbp-baseline' || manifest.status !== 'published'
      || manifest.complete_national_release !== true || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length || manifest.artifacts.length > 64) throw failure();
    const root = path.dirname(selected.manifest), files = new Map(); let total = 0;
    for (const artifact of manifest.artifacts) {
      if (typeof artifact.path !== 'string' || artifact.path.includes('\\') || artifact.path.split('/').some(p => !p || p === '.' || p === '..')
        || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || artifact.bytes > 128 * 1024 ** 2
        || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw failure();
      const filename = path.resolve(root, artifact.path), relative = path.relative(root, filename);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || files.has(filename)) throw failure();
      total += artifact.bytes; if (total > 1024 ** 3) throw failure();
      await canonical(path.dirname(filename), { signal });
      const stat = await lstat(filename, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size !== BigInt(artifact.bytes)) throw failure();
      files.set(filename, stat);
    }
    signal?.throwIfAborted();
    const verification = await verifyCensusZbpRelease(selected.manifest);
    signal?.throwIfAborted();
    for (const [filename, before] of files) {
      await canonical(path.dirname(filename), { signal });
      const after = await lstat(filename, { bigint: true });
      if (!same(before, after) || !after.isFile() || after.isSymbolicLink() || after.nlink !== 1n) throw failure();
    }
    const end = {}; await readJson(selected.manifest, 4 * 1024 ** 2, signal, end);
    if (end.sha256 !== selected.sha256 || !same(meter.identity, end.identity)) throw failure();
    return { selection: selected, manifest, verification };
  } catch { throw failure(); }
}
