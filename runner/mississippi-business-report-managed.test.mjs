import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { createManagedOperations } from "./managed-operations.mjs";

const operationId="99111111-1111-4111-8111-111111111111";
const packagePath="data/imports/mississippi-business-report/packages/managed-fixture";
const workerDirectory=path.join(APP_ROOT,"data","imports","mississippi-business-report","operations","98111111-1111-4111-8111-111111111111");
const receiptPath=path.join(workerDirectory,"receipt.json");
const receipt={status:"SUCCEEDED",network_requests:0,acquisition_performed:false,purchase_performed:false,account_action_performed:false,source_pointer_changed:false,national_admission_performed:false,statewide_complete:false,current_operation_claim:false,geocode_claim:false,physical_site_claim:false,public_export_authorized:false,export_policy:"local-review-only",source:{record_count:2}};

test("Mississippi managed operation dispatches fixed private offline work and independently verifies it",async t=>{
  await rm(path.join(APP_ROOT,"data","managed-operations",operationId),{recursive:true,force:true});await mkdir(path.join(APP_ROOT,"data","managed-operations"),{recursive:true});
  let dispatched,verified;
  const managed=createManagedOperations({idFactory:()=>operationId,executor:async options=>{dispatched=options;return {code:0,stdout:JSON.stringify({operationDirectory:workerDirectory,receiptPath,receipt})};},mississippiBusinessAppVerifier:async(candidate,{signal})=>{verified={candidate,signal};return {receipt};}});
  t.after(async()=>{await managed.close();await rm(path.join(APP_ROOT,"data","managed-operations",operationId),{recursive:true,force:true});});
  for(const input of [{},{package:packagePath,url:"https://example.com"},{package:"data/imports/mississippi-business-report/packages/bad package"},{package:"data/imports/mississippi-business-report/operations/x"}])await assert.rejects(managed.startMississippiBusinessReport(input),{statusCode:400});
  const started=await managed.startMississippiBusinessReport({package:packagePath});await managed.running.get(started.id)?.done;const final=await managed.get(started.id);
  assert.equal(dispatched.script,"scripts/run-mississippi-business-report-app.mjs");assert.deepEqual(dispatched.args,["--package",packagePath]);assert.equal(final.status,"SUCCEEDED");assert.deepEqual(final.artifacts,[]);assert.equal(final.result.recordCount,2);assert.equal(final.result.independentReplayVerified,true);assert.equal(final.result.statewideComplete,false);assert.equal(final.result.publicExportAuthorized,false);assert.equal(verified.candidate,receiptPath);assert.ok(verified.signal instanceof AbortSignal);
  const restored=createManagedOperations();t.after(()=>restored.close());await restored.ready;assert.equal((await restored.get(operationId)).status,"SUCCEEDED");
});

test("managed HTTP route and connector preserve the Mississippi authority boundary",async()=>{
  const server=await readFile(new URL("./server.mjs",import.meta.url),"utf8"),authorization=server.indexOf("controlPlane.authorize(request)");assert.ok(server.indexOf("'ms-business-report'",authorization)>authorization);assert.match(server,/endpoint === 'ms-business-report'.*startMississippiBusinessReport\(input\)/);
  const connector=JSON.parse(await readFile(path.join(APP_ROOT,"config","connectors","mississippi-business-report-app.json"),"utf8"));assert.deepEqual(connector.allowed_hosts,[]);assert.equal(connector.execution_limits.network_requests,0);assert.equal(connector.execution_limits.max_parallel_requests,0);assert.equal(connector.source_policy,"config/source-policies/mississippi-business-report-offline.json");
});

test("restart recovery fails a Mississippi operation whose prior owners are gone",async t=>{
  const root=`data/managed-operations-ms-restart-${process.pid}`,id="97111111-1111-4111-8111-111111111111",directory=path.join(APP_ROOT,root,id);await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,"receipt.json"),`${JSON.stringify({id,kind:"ms-business-report",status:"RUNNING",createdAt:"2026-10-03T00:00:00.000Z",owner:{supervisorPid:2147483647,childPid:2147483646},details:{sourceId:"mississippi-business-report",package:packagePath},artifacts:[],result:{}})}\n`);
  const restored=createManagedOperations({root});t.after(async()=>{await restored.close();await rm(path.join(APP_ROOT,root),{recursive:true,force:true});});await restored.ready;const recovered=await restored.get(id);assert.equal(recovered.status,"FAILED");assert.match(recovered.error,/interrupted before service restart/);
});
