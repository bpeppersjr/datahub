import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import { createManagedOperations } from "./managed-operations.mjs";

const config = { version: 1, max_concurrency: 1, states: ["TX"], industries: { retail: ["source"] }, sources: { source: { script: "scripts/run-industry-segments.mjs", scope: "national", states: "all", state_filter_supported: false, prerequisites: [] } } };
const sha = (text) => createHash("sha256").update(text).digest("hex");
async function fixture(t, options = {}) {
  const relative = `data/managed-operations-test-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const root = path.join(APP_ROOT, relative); await mkdir(root, { recursive: true }); t.after(() => rm(root, { recursive: true, force: true }));
  return createManagedOperations({ root: relative, configLoader: async () => config, ...options });
}
async function finished(service, id) { for (let i = 0; i < 100; i += 1) { const operation = await service.get(id); if (!["QUEUED", "RUNNING"].includes(operation.status)) return operation; await new Promise((resolve) => setTimeout(resolve, 5)); } throw new Error("operation did not finish"); }

test("catalog and plans use allowlisted industry configuration", async (t) => {
  const service = await fixture(t, { executor: async () => ({ code: 0 }) });
  const catalog = await service.catalog(); assert.deepEqual(catalog.industries, [{ id: "retail" }]);
  assert.equal((await service.plan({ industries: ["retail"], states: ["tx"] })).taskCount, 1);
  await assert.rejects(service.plan({ industries: ["other"] }), /Unsupported industry/);
  await assert.rejects(service.startExport({ output: "elsewhere" }), /Unsupported operation option/);
  await assert.rejects(service.startExport({ states: ["Texas"] }), /two-letter/);
  await service.close();
});

test("one global slot rejects concurrent work and cancellation is cooperative", async (t) => {
  let release;
  const service = await fixture(t, { executor: ({ signal }) => new Promise((resolve) => { release = () => resolve({ code: signal.aborted ? 1 : 0 }); signal.addEventListener("abort", release, { once: true }); if (signal.aborted) release(); }) });
  const first = await service.startCollection({ industries: ["retail"] });
  await assert.rejects(service.startExport({}), (error) => error.code === "OPERATION_CONFLICT");
  await service.cancel(first.id); assert.equal((await finished(service, first.id)).status, "CANCELLED");
  release?.(); await service.close();
});

test("simultaneous starts reserve the single global slot", async (t) => {
  let unblock; const service = await fixture(t, { configLoader: () => new Promise((resolve) => { unblock = () => resolve(config); }), executor: async () => ({ code: 0 }) });
  const settled = Promise.allSettled([service.startCollection({}), service.startExport({})]);
  while (!unblock) await new Promise((resolve) => setImmediate(resolve));
  unblock();
  const results = await settled; assert.equal(results.filter((x) => x.status === "fulfilled").length, 1); assert.equal(results.filter((x) => x.status === "rejected" && x.reason.code === "OPERATION_CONFLICT").length, 1); await service.close();
});

test("child failure is durable and sanitized", async (t) => {
  const service = await fixture(t, { executor: async () => ({ code: 7, stderr: "secret" }) });
  const operation = await service.startCollection({}); const done = await finished(service, operation.id);
  assert.equal(done.status, "FAILED"); assert.equal(done.error, "Managed child process failed."); assert.doesNotMatch(JSON.stringify(done), /secret/);
  const receipt = JSON.parse(await readFile(path.join(service.root, operation.id, "receipt.json"), "utf8")); assert.equal(receipt.status, "FAILED");
  await service.close();
});

test("restart marks unowned running receipts unknown", async (t) => {
  const service = await fixture(t, { idFactory: () => "old-run", executor: async () => ({ code: 0 }) }); await service.ready;
  await mkdir(path.join(service.root, "stale")); await writeFile(path.join(service.root, "stale", "receipt.json"), JSON.stringify({ id: "stale", kind: "collection", status: "RUNNING", createdAt: "2026-01-01T00:00:00.000Z", owner: { supervisorPid: process.pid }, artifacts: [], result: {} }));
  const restarted = createManagedOperations({ root: path.relative(APP_ROOT, service.root), configLoader: async () => config });
  const receiptFile = path.join(service.root, "stale", "receipt.json");
  const original = await readFile(receiptFile, "utf8");
  assert.equal((await restarted.get("stale")).status, "UNKNOWN");
  assert.equal(await readFile(receiptFile, "utf8"), original);
  await assert.rejects(restarted.startCollection({}), (error) => error.statusCode === 409);
  await writeFile(receiptFile, JSON.stringify({ ...JSON.parse(original), status: "SUCCEEDED", finishedAt: "2026-01-01T01:00:00.000Z" }));
  assert.equal((await restarted.get("stale")).status, "SUCCEEDED");
  await restarted.close(); await service.close();
});

test("shutdown during selection validation prevents a later child launch", async (t) => {
  let release; let executions = 0;
  const service = await fixture(t, { configLoader: () => new Promise((resolve) => { release = () => resolve(config); }), executor: async () => { executions += 1; return { code: 0 }; } });
  await service.ready;
  const starting = service.startCollection({});
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const stopping = service.close();
  release();
  await assert.rejects(starting, /closed/);
  await stopping;
  assert.equal(executions, 0);
});

test("export artifacts are manifest-declared, contained, and rehashed", async (t) => {
  const executor = async ({ args }) => {
    const output = path.resolve(APP_ROOT, args[args.indexOf("--output") + 1], args[args.indexOf("--output-prefix") + 1]); await mkdir(output, { recursive: true });
    const records = "business_name\nShop\n"; const summary = JSON.stringify({ counts: { rows_written: 1 } });
    await writeFile(path.join(output, "records.csv"), records); await writeFile(path.join(output, "summary.json"), summary);
    const manifest = { dataset_id: "flat-business-export", status: "published-local", policy_mode: "public-only", artifacts: [{ path: "records.csv", bytes: Buffer.byteLength(records), sha256: sha(records) }, { path: "summary.json", bytes: Buffer.byteLength(summary), sha256: sha(summary) }] };
    await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest)); return { code: 0 };
  };
  const service = await fixture(t, { executor }); const started = await service.startExport({ format: "csv" }); const done = await finished(service, started.id);
  assert.equal(done.status, "SUCCEEDED"); assert.deepEqual(done.artifacts.map((x) => x.name).sort(), ["manifest.json", "records.csv", "summary.json"]);
  assert.equal((await service.artifact(started.id, "records.csv")).bytes, Buffer.byteLength("business_name\nShop\n"));
  assert.equal(await service.artifact(started.id, "../receipt.json"), null); assert.equal(await service.artifact(started.id, "receipt.json"), null);
  await writeFile(path.join(service.root, started.id, "output", "export", "records.csv"), "tampered"); await assert.rejects(service.artifact(started.id, "records.csv"), /integrity/);
  await service.close();
});
