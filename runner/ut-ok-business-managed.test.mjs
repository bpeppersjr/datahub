import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { createManagedOperations } from "./managed-operations.mjs";
import { COLLECTION_SUPERVISOR_CANCEL_GRACE_MS } from "./collection-cancellation.mjs";

const cases = [
  {
    label: "Utah Business List", method: "startUtahBusinessList", kind: "ut-business-list",
    sourceId: "ut-business-list", script: "scripts/run-utah-business-list-app.mjs",
    selection: "data/imports/utah-business-list/packages/managed-fixture/selection.json",
    verifier: "utahAppVerifier", workerRoot: "utah-business-list",
    receipt: { status:"SUCCEEDED",network_requests:0,purchase_performed:false,account_created:false,source_pointer_changed:false,national_admission_performed:false,admission_eligible:false,export_policy:"local-review-only",release:{release_id:"ut-release",record_count:3} },
    result: { sourceId:"ut-business-list",releaseId:"ut-release",recordCount:3,receiptIntegrityVerified:true,inspectionRequired:false,localReviewOnly:true,networkRequests:0,purchasePerformed:false,accountCreated:false,currentPointerWritten:false,nationalAdmissionPerformed:false,sourceNative:false,sourceAuthenticityVerified:false,reproducibleExtractionVerified:false,admissionEligible:false },
  },
  {
    label: "Oklahoma Business Bulk", method: "startOkBusinessBulk", kind: "ok-business-bulk",
    sourceId: "ok-business-bulk", script: "scripts/run-ok-business-bulk-app.mjs",
    selection: "data/imports/oklahoma-business-bulk/packages/managed-fixture/selection.json",
    verifier: "okBusinessAppVerifier", workerRoot: "oklahoma-business-bulk",
    receipt: { status:"SUCCEEDED",network_requests:0,acquisition_performed:false,purchase_performed:false,account_action_performed:false,source_pointer_changed:false,national_admission_performed:false,physical_site_claim:false,current_operation_claim:false,export_policy:"local-review-only",source:{projected_organization_count:4,process_date:"2026-09-01"} },
    result: { sourceId:"ok-business-bulk",projectedOrganizationCount:4,processDate:"2026-09-01",receiptIntegrityVerified:true,inspectionRequired:false,localReviewOnly:true,networkRequests:0,acquisitionPerformed:false,purchasePerformed:false,accountActionPerformed:false,currentPointerWritten:false,nationalAdmissionPerformed:false,physicalSiteClaim:false,currentOperationClaim:false },
  },
];

for (const [index, fixture] of cases.entries()) {
  test(`${fixture.label} managed operation is fixed, private, cancellable, and independently verified`, async t => {
    const operationId = `${index + 7}1111111-1111-4111-8111-111111111111`;
    const managedDirectory = path.join(APP_ROOT,"data","managed-operations",operationId);
    await rm(managedDirectory,{recursive:true,force:true}); await mkdir(path.dirname(managedDirectory),{recursive:true});
    t.after(()=>rm(managedDirectory,{recursive:true,force:true}));
    const isolated=createManagedOperations({root:`data/managed-operations-${fixture.kind}-test-${process.pid}`});
    t.after(async()=>{await isolated.close();await rm(isolated.root,{recursive:true,force:true});});
    await assert.rejects(isolated[fixture.method]({selection:fixture.selection}),/native operation storage/);

    let dispatched, release, notifyStarted;
    const waiting=new Promise(resolve=>{release=resolve;});
    const childStarted=new Promise(resolve=>{notifyStarted=resolve;});
    const cancelling=createManagedOperations({idFactory:()=>operationId,executor:async options=>{dispatched=options;notifyStarted();await waiting;return {code:1,forcedTerminationRequested:false,stdout:""};}});
    t.after(()=>cancelling.close());
    for(const input of [{},{selection:fixture.selection,url:"https://example.com"},{selection:`data/imports/${fixture.workerRoot}/packages/bad package/selection.json`},{selection:`data/imports/${fixture.workerRoot}/operations/x/selection.json`}]) await assert.rejects(cancelling[fixture.method](input),{statusCode:400});
    const accepted=await cancelling[fixture.method]({selection:fixture.selection});await childStarted;
    assert.equal(accepted.kind,fixture.kind);assert.equal(dispatched.script,fixture.script);assert.deepEqual(dispatched.args,["--selection",fixture.selection]);assert.equal(dispatched.cancelGraceMs,COLLECTION_SUPERVISOR_CANCEL_GRACE_MS);
    await assert.rejects(cancelling[fixture.method]({selection:fixture.selection}),{statusCode:409});
    await cancelling.cancel(accepted.id);release();await cancelling.running.get(accepted.id)?.done;
    assert.equal((await cancelling.get(accepted.id)).status,"CANCELLED");assert.equal(await cancelling.artifact(accepted.id,"receipt.json"),null);

    const successId=`${index + 3}1111111-1111-4111-8111-111111111111`, workerDirectory=path.join(APP_ROOT,"data","imports",fixture.workerRoot,"operations","51111111-1111-4111-8111-111111111111"),receiptPath=path.join(workerDirectory,"receipt.json");
    let verification;
    const successful=createManagedOperations({idFactory:()=>successId,executor:async()=>({code:0,stdout:JSON.stringify({operationDirectory:workerDirectory,receiptPath,receipt:fixture.receipt})}),[fixture.verifier]:async(candidate,{signal})=>{verification={candidate,signal};return {receipt:fixture.receipt};}});
    t.after(async()=>{await successful.close();await rm(path.join(APP_ROOT,"data","managed-operations",successId),{recursive:true,force:true});});
    const started=await successful[fixture.method]({selection:fixture.selection});await successful.running.get(started.id)?.done;
    const final=await successful.get(started.id);assert.equal(final.status,"SUCCEEDED");assert.deepEqual(final.result,fixture.result);assert.deepEqual(final.artifacts,[]);assert.equal(verification.candidate,receiptPath);assert.ok(verification.signal instanceof AbortSignal);

    const restored=createManagedOperations();t.after(()=>restored.close());await restored.ready;
    assert.equal((await restored.get(successId)).status,"SUCCEEDED");assert.deepEqual((await restored.get(successId)).result,fixture.result);
  });
}

test("managed HTTP routes protect the fixed Utah and Oklahoma operation endpoints", async () => {
  const source=await readFile(new URL("./server.mjs",import.meta.url),"utf8"),authorization=source.indexOf("controlPlane.authorize(request)");
  for(const endpoint of ["ut-business-list","ok-business-bulk"]){assert.ok(source.indexOf(`'${endpoint}'`,authorization)>authorization);assert.match(source,new RegExp(`endpoint === '${endpoint}'.*start(?:UtahBusinessList|OkBusinessBulk)\\(input\\)`));}
});

test("managed services retain their zero-network connector and policy bindings", async () => {
  for (const [connector, policy] of [
    ["utah-business-list-app", "config/source-policies/utah-business-list-offline.json"],
    ["ok-business-bulk-app", "config/source-policies/ok-business-entities-bulk.json"],
  ]) {
    const manifest=JSON.parse(await readFile(path.join(APP_ROOT,"config","connectors",`${connector}.json`),"utf8"));
    assert.equal(manifest.connector_id,connector);
    assert.deepEqual(manifest.allowed_hosts,[]);
    assert.equal(manifest.source_policy,policy);
    assert.equal(manifest.execution_limits.max_parallel_requests,0);
  }
});
