import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { loadIndustryConfig, industryPlanFingerprint } from "./industry-segments.mjs";
import { loadAutomaticRefreshAuthorizations } from "./automatic-refresh-authorization.mjs";
import { ManagedOperations } from "./managed-operations.mjs";

test("automatic-refresh contract covers every industry source and authorizes reviewed national, Texas and Washington sources", async () => {
  const config = await loadIndustryConfig(), decisions = await loadAutomaticRefreshAuthorizations(config);
  assert.equal(decisions.length, Object.keys(config.sources).length);
  assert.equal(decisions.filter((item) => item.automaticRefreshAuthorized).length,4);
  assert.equal(decisions.find((item)=>item.sourceId==="state-tx-sales-tax").automaticRefreshAuthorized,true);
  assert.deepEqual(decisions.filter((item) => item.governedSourceId).map((item) => [item.sourceId, item.governedSourceId, item.reasonCode]), [
    ["national-fdic-bankfind", "fdic-bankfind", "REVIEWED_AUTOMATIC_REFRESH"],
    ["national-ncua-quarterly", "ncua-quarterly", "REVIEWED_AUTOMATIC_REFRESH"],
    ["state-tx-sales-tax", "tx-active-sales-tax-permits", "REVIEWED_AUTOMATIC_REFRESH"],
    ["state-wa-contractors", "wa-lni-active-contractor-licenses", "REVIEWED_AUTOMATIC_REFRESH"],
  ]);
});

test("reviewed governed authorization can enable app-owned dispatch while HOLD and unbound claims fail closed", async (t) => {
  const config = await loadIndustryConfig(), root = await mkdtemp(path.join(APP_ROOT, "data/tmp/automatic-refresh-authorization-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = JSON.parse(await readFile(path.join(APP_ROOT, "config/automatic-refresh-authorizations.json"), "utf8"));
  const file = path.join(root, "authorized.json"); await writeFile(file, `${JSON.stringify(source)}\n`);
  const authorizedBinding = async (sourceId) => ["fdic-bankfind","ncua-quarterly","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"].includes(sourceId)
    ? ({ sourceId, status: "AUTHORIZED", dispatchAvailable: true, freshAcquisitionAuthorized: true,
      autonomousAcquisitionAuthorized: true, productionPointerChangeAuthorized: true })
    : ({ sourceId, status: "HOLD", dispatchAvailable: false, freshAcquisitionAuthorized: false,
      autonomousAcquisitionAuthorized: false, productionPointerChangeAuthorized: false });
  const decisions = await loadAutomaticRefreshAuthorizations(config, { file, governedValidator: authorizedBinding });
  assert.equal(decisions.find((item) => item.sourceId === "state-tx-sales-tax").automaticRefreshAuthorized, true);
  const heldBinding=async sourceId=>sourceId==="tx-active-sales-tax-permits"?({sourceId,status:"HOLD",dispatchAvailable:false,freshAcquisitionAuthorized:false,autonomousAcquisitionAuthorized:false,productionPointerChangeAuthorized:false}):authorizedBinding(sourceId);
  await assert.rejects(loadAutomaticRefreshAuthorizations(config, { file, governedValidator: heldBinding }), /authorization binding is invalid/);
  source.sources["state-tx-sales-tax"].governed_source_id = null; await writeFile(file, `${JSON.stringify(source)}\n`);
  await assert.rejects(loadAutomaticRefreshAuthorizations(config, { file, governedValidator: authorizedBinding }), /governed binding is invalid/);
});

test("scheduled plans authorize reviewed Texas and Washington", async (t) => {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/automatic-refresh-plan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const operations = new ManagedOperations({ root }); t.after(() => operations.close()); await operations.ready;
  const washington={industries:["construction"],states:["WA"]},texas={industries:["sales-tax-outlets"],states:["TX"]};
  assert.equal((await operations.plan(washington)).taskCount,1);const scheduledWa=await operations.planScheduled(washington);assert.equal(scheduledWa.taskCount,1);assert.equal(scheduledWa.tasks[0].sourceId,"state-wa-contractors");
  const scheduled=await operations.planScheduled(texas);assert.equal(scheduled.taskCount,1);assert.equal(scheduled.tasks[0].sourceId,"state-tx-sales-tax");
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
