import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getIaBusinessRegistryRefreshReadiness } from "./ia-business-registry-refresh-readiness.mjs";
import { ManagedOperations } from "./managed-operations.mjs";
import { APP_ROOT } from "./paths.mjs";

test("Iowa refresh readiness is deterministic, evidence-bound, and held", async () => {
  const first = await getIaBusinessRegistryRefreshReadiness();
  const second = await getIaBusinessRegistryRefreshReadiness();
  assert.deepEqual(first, second);
  assert.equal(first.readinessStatus, "HOLD");
  assert.equal(first.dispatchAvailable, false);
  assert.equal(first.freshAcquisitionAuthorized, false);
  assert.equal(first.plan.networkRequestCount, 0);
  assert.equal(first.plan.allocationCount, 0);
  assert.equal(first.plan.operationCreated, false);
  assert.equal(first.plan.evidence.length, 4);
  assert.ok(first.plan.evidence.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
});

test("managed Iowa preview allocates no operation and start fails closed before executor or receipt writer", async t => {
  await mkdir(path.join(APP_ROOT, "data/tmp"), { recursive: true });
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/ia-refresh-readiness-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  let executions = 0;
  let writes = 0;
  const service = new ManagedOperations({ root, executor: async () => { executions += 1; throw new Error("forbidden"); }, receiptWriter: async () => { writes += 1; throw new Error("forbidden"); } });
  t.after(() => service.close());
  await service.ready;
  const before = await readdir(root);
  const plan = await service.sourceRefreshPlan({ sourceId: "ia-business-registry" });
  assert.equal(plan.operationCreated, false);
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(service.startSourceRefresh({ sourceId: "ia-business-registry" }), error => error.statusCode === 409 && error.code === "ACQUISITION_NOT_AUTHORIZED");
  assert.equal(executions, 0);
  assert.equal(writes, 0);
  assert.deepEqual(await service.list(), []);
  for (const input of [{}, { sourceId: "other" }, { sourceId: "ia-business-registry", extra: true }]) await assert.rejects(service.startSourceRefresh(input), error => error.statusCode === 400);
});

test("Iowa refresh API and UI remain closed and separate from generic industry sources", async () => {
  const [server, page, card, config] = await Promise.all([
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/data-operations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ia-business-registry-refresh-status.tsx", import.meta.url), "utf8"),
    readFile(new URL("../config/industry-segments.json", import.meta.url), "utf8"),
  ]);
  assert.match(server, /source-refresh-plans/);
  assert.match(server, /startSourceRefresh/);
  assert.match(card, /Preview refresh plan/);
  assert.match(card, /<button className="primary-button" disabled/);
  assert.doesNotMatch(card, /source-refreshes/);
  assert.match(page, /IaBusinessRegistryRefreshStatusCard/);
  assert.doesNotMatch(config, /ia-business-registry/);
});
