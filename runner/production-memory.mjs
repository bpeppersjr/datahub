import { freemem, totalmem } from 'node:os';
import { isDeepStrictEqual } from 'node:util';

const POLICY = Object.freeze({ id: 'national-12g', oldSpaceMiB: 12288, minimumFreeMiB: 16384, minimumTotalMiB: 24576 });
export function productionMemoryPolicy(id) {
  if (id === undefined) return undefined;
  if (id !== POLICY.id) throw new Error('Unsupported production memory profile.');
  return { ...POLICY };
}
export function productionMemoryArguments(policy, available = { freeBytes: freemem(), totalBytes: totalmem() }, nodeOptions = process.env.NODE_OPTIONS ?? '') {
  if (policy === undefined) return [];
  if (!isDeepStrictEqual(policy, POLICY)) throw new Error('Production memory policy changed.');
  if (/--max[-_]old[-_]space[-_]size/i.test(nodeOptions)) throw new Error('Inherited heap options conflict with the production memory profile.');
  if (![available.freeBytes, available.totalBytes].every(v => Number.isSafeInteger(v) && v >= 0)
    || available.freeBytes > available.totalBytes
    || available.freeBytes < POLICY.minimumFreeMiB * 1048576
    || available.totalBytes < POLICY.minimumTotalMiB * 1048576) throw new Error('Production memory headroom unavailable; no stage launched.');
  return [`--max-old-space-size=${POLICY.oldSpaceMiB}`];
}
