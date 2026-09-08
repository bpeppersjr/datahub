import { lstat, realpath, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import v8 from "node:v8";
import { APP_ROOT } from "./paths.mjs";

const DISK = 4n * 1024n ** 3n;
const RAM = 1024 ** 3;
const HEAP = 512 * 1024 ** 2;
const error = () => Object.assign(new Error("Delaware resource prerequisite failed."), { code: "DE_RESOURCE_PREFLIGHT" });

async function nativeProbe(directory) {
  const disk = await statfs(directory, { bigint: true });
  if (typeof disk.bavail !== "bigint" || typeof disk.bsize !== "bigint" || disk.bavail <= 0n || disk.bsize <= 0n) throw error();
  return { availableDiskBytes: disk.bavail * disk.bsize, freeMemoryBytes: os.freemem(), heapLimitBytes: v8.getHeapStatistics().heap_size_limit };
}

function abortable(work, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal?.throwIfAborted(); return work(); }).then(
      (value) => { cleanup(); resolve(value); },
      (failure) => { cleanup(); reject(failure); },
    );
  });
}

/** Point-in-time prerequisites only: no reservation or guarantee against later exhaustion. */
export async function preflightDeResources({ outputRoot, signal, probe = nativeProbe } = {}) {
  signal?.throwIfAborted();
  try {
    if (typeof outputRoot !== "string" || !outputRoot || typeof probe !== "function") throw error();
    const directory = path.resolve(APP_ROOT, outputRoot);
    const relative = path.relative(APP_ROOT, directory);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw error();
    const observed = await abortable(async () => {
      const info = await lstat(directory);
      const [canonical, canonicalRoot] = await Promise.all([realpath(directory), realpath(APP_ROOT)]);
      const contained = path.relative(canonicalRoot, canonical);
      if (!info.isDirectory() || info.isSymbolicLink() || contained.startsWith("..") || path.isAbsolute(contained) || path.relative(directory, canonical) !== "") throw error();
      signal?.throwIfAborted();
      return probe(directory);
    }, signal);
    if (!observed || typeof observed !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(observed))) throw error();
    const keys = ["availableDiskBytes", "freeMemoryBytes", "heapLimitBytes"];
    if (Reflect.ownKeys(observed).length !== keys.length || Reflect.ownKeys(observed).some((key) => !keys.includes(key))) throw error();
    const values = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(observed, key);
      if (!Object.hasOwn(descriptor, "value")) throw error();
      values[key] = descriptor.value;
    }
    if (typeof values.availableDiskBytes !== "bigint" || values.availableDiskBytes < DISK || !Number.isSafeInteger(values.freeMemoryBytes) || values.freeMemoryBytes < RAM || !Number.isSafeInteger(values.heapLimitBytes) || values.heapLimitBytes < HEAP) throw error();
    signal?.throwIfAborted();
    return Object.freeze({
      thresholds: Object.freeze({ availableDiskBytes: String(DISK), freeMemoryBytes: RAM, heapLimitBytes: HEAP }),
      observations: Object.freeze({ ...values, availableDiskBytes: String(values.availableDiskBytes) }),
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw error();
  }
}
