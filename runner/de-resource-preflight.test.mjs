import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { preflightDeResources } from "./de-resource-preflight.mjs";

const valid = { availableDiskBytes: 4294967296n, freeMemoryBytes: 1073741824, heapLimitBytes: 536870912 };
const rejected = (work) => assert.rejects(work, (e) => e.code === "DE_RESOURCE_PREFLIGHT" && e.message === "Delaware resource prerequisite failed.");

test("Delaware resource exact thresholds and immutable serializable snapshot", async () => {
  const result = await preflightDeResources({ outputRoot: APP_ROOT, probe: async () => ({ ...valid }) });
  assert.deepEqual(result.observations, result.thresholds);
  assert.equal(JSON.parse(JSON.stringify(result)).observations.availableDiskBytes, "4294967296");
  assert.throws(() => { result.observations.freeMemoryBytes = 0; }, TypeError);
  for (const key of Object.keys(valid)) await rejected(preflightDeResources({ outputRoot: APP_ROOT, probe: () => ({ ...valid, [key]: valid[key] - (typeof valid[key] === "bigint" ? 1n : 1) }) }));
});

test("Delaware resource rejects malformed and unknown observations without payload leakage", async () => {
  for (const value of [null, {}, [], { ...valid, extra: "private" }, { ...valid, availableDiskBytes: 4294967296 }, { ...valid, availableDiskBytes: -1n }]) await rejected(preflightDeResources({ outputRoot: APP_ROOT, probe: () => value }));
  for (const key of ["freeMemoryBytes", "heapLimitBytes"]) for (const value of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "private", null, undefined]) await rejected(preflightDeResources({ outputRoot: APP_ROOT, probe: () => ({ ...valid, [key]: value }) }));
  await rejected(preflightDeResources({ outputRoot: APP_ROOT, probe: () => { throw new Error("private native path"); } }));
});

test("Delaware resource early and pending probe cancellation", async () => {
  const early = new AbortController(); early.abort(); let called = false;
  await assert.rejects(preflightDeResources({ outputRoot: APP_ROOT, signal: early.signal, probe: () => { called = true; } }), { name: "AbortError" });
  assert.equal(called, false);
  const controller = new AbortController();
  await assert.rejects(preflightDeResources({ outputRoot: APP_ROOT, signal: controller.signal, probe: () => { controller.abort(); return new Promise(() => {}); } }), { name: "AbortError" });
});

test("Delaware resource rejects missing, outside and symlink directory before probe", async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/de-resource-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = path.join(root, "link"); await symlink(root, link, "junction");
  let calls = 0;
  for (const outputRoot of [undefined, path.join(root, "missing"), path.dirname(APP_ROOT), link]) await rejected(preflightDeResources({ outputRoot, probe: () => { calls++; return valid; } }));
  assert.equal(calls, 0);
});
