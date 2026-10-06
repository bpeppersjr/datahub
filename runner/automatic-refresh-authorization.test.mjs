import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { loadIndustryConfig, industryPlanFingerprint } from "./industry-segments.mjs";
import { loadAutomaticRefreshAuthorizations } from "./automatic-refresh-authorization.mjs";
import { ManagedOperations } from "./managed-operations.mjs";

test("automatic-refresh contract covers every industry source and canonically binds WA/TX aliases to governed HOLDs", async () => {
  const config = await loadIndustryConfig(), decisions = await loadAutomaticRefreshAuthorizations(config);
  assert.equal(decisions.length, Object.keys(config.sources).length);
  assert.ok(decisions.every((item) => item.automaticRefreshAuthorized === false));
  assert.deepEqual(decisions.filter((item) => item.governedSourceId).map((item) => [item.sourceId, item.governedSourceId, item.reasonCode]), [
    ["state-tx-sales-tax", "tx-active-sales-tax-permits", "GOVERNED_SOURCE_HOLD"],
    ["state-wa-contractors", "wa-lni-active-contractor-licenses", "GOVERNED_SOURCE_HOLD"],
  ]);
});

test("scheduled plans reject HOLD aliases while manual collection planning remains available", async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/automatic-refresh-plan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const operations = new ManagedOperations({ root }); t.after(() => operations.close()); await operations.ready;
  for (const selection of [
    { industries: ["construction"], states: ["WA"] },
    { industries: ["sales-tax-outlets"], states: ["TX"] },
  ]) {
    const manual = await operations.plan(selection); assert.equal(manual.taskCount, 1);
    await assert.rejects(operations.planScheduled(selection), (error) => error.code === "AUTOMATIC_REFRESH_NOT_AUTHORIZED" && error.statusCode === 409);
  }
});

test("scheduled dispatch revalidates authorization after a previously reviewed plan", async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/automatic-refresh-dispatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let authorized = true;
  const loader = async (config) => Object.entries(config.sources).map(([sourceId, source]) => ({ sourceId, script: source.script,
    automaticRefreshAuthorized: authorized, reasonCode: authorized ? "REVIEWED_TEST_FIXTURE" : "AUTOMATIC_REFRESH_NOT_REVIEWED", governedSourceId: null }));
  const operations = new ManagedOperations({ root, automaticRefreshLoader: loader, executor: async () => ({ code: 0 }) });
  t.after(() => operations.close()); await operations.ready;
  const selection = { industries: ["sales-tax-outlets"], states: ["TX"] }, reviewed = await operations.planScheduled(selection);
  authorized = false;
  await assert.rejects(operations.startScheduledCollection(selection, { operationId: "refresh-" + "a".repeat(48), expectedPlanHash: industryPlanFingerprint(reviewed) }),
    (error) => error.code === "AUTOMATIC_REFRESH_NOT_AUTHORIZED" && error.statusCode === 409);
  assert.deepEqual(await readdir(root), []);
});
