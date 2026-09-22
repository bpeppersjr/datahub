import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { ManagedOperations } from "./managed-operations.mjs";
import { GOVERNED_SOURCE_REFRESH_DESCRIPTORS, GOVERNED_SOURCE_REFRESH_SOURCE_IDS, validateGovernedSourceRefreshDescriptor } from "./governed-source-refresh-registry.mjs";

const expected={
  "co-business-registry":["CO","co-business-registry-good-standing-or-delinquent-organizations","verifyCoBusinessRegistry"],
  "ct-business-registry":["CT","ct-business-registry-active-organizations","verifyCtBusinessRegistry"],
  "fl-business-registry":["FL","fl-business-registry-quarterly-active-entities","verifyFlBusinessRegistry"],
  "ia-business-registry":["IA","ia-business-registry-active-entities","verifyIaBusinessRegistry"],
  "il-business-registry":["IL","il-business-registry-active-organizations","verifyIllinoisBusinessRegistry"],
  "ny-business-registry":["NY","ny-business-registry-active-entities","verifyNyBusinessRegistry"],
  "or-business-registry":["OR","or-business-registry-active-registrations","verifyOrBusinessRegistry"],
  "pa-business-registry":["PA","pa-business-registry-active-registrations","verifyPaBusinessRegistry"],
  "tx-active-sales-tax-permits":["TX","tx-active-sales-tax-outlets","verifyTxActiveSalesTaxPermits"],
  "wa-lni-active-contractor-licenses":["WA","wa-lni-active-contractor-organizations","verifyWaLniActiveContractors"],
};

test("ten governed refresh descriptors bind exact builders, verifiers, datasets, outputs and policies",async()=>{
  assert.deepEqual(GOVERNED_SOURCE_REFRESH_SOURCE_IDS,Object.keys(expected));
  for(const sourceId of GOVERNED_SOURCE_REFRESH_SOURCE_IDS){
    const binding=await validateGovernedSourceRefreshDescriptor(sourceId),[state,datasetId,verifierExport]=expected[sourceId];
    assert.deepEqual({state:binding.state,datasetId:binding.datasetId,verifierExport:binding.verifierExport,builder:binding.builder,verifier:binding.verifier,outputRoot:binding.outputRoot,connector:binding.connector,policy:binding.policy,dataset:binding.dataset,status:binding.status,dispatchAvailable:binding.dispatchAvailable},
      {state,datasetId,verifierExport,builder:`scripts/build-${sourceId}.mjs`,verifier:`runner/${sourceId}.mjs`,outputRoot:`data/business-sources/${datasetId}`,connector:`config/connectors/${sourceId}.json`,policy:`config/source-policies/${sourceId}.json`,dataset:`config/datasets/${datasetId}.json`,status:"HOLD",dispatchAvailable:false});
    assert.equal(binding.evidence.length,5);assert.ok(binding.evidence.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)&&item.bytes>0));
  }
});

async function fixture(t,sourceId){
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-registry-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const d=GOVERNED_SOURCE_REFRESH_DESCRIPTORS[sourceId];for(const relative of [d.builder,d.verifier,d.connector,d.policy,d.dataset]){const target=path.join(root,...relative.split("/"));await mkdir(path.dirname(target),{recursive:true});await cp(path.join(APP_ROOT,...relative.split("/")),target);}
  return {root,d};
}

test("governed refresh validation rejects connector, policy and dataset pin drift",async t=>{
  for(const kind of ["connector","policy","dataset"]){await t.test(kind,async t=>{const f=await fixture(t,"co-business-registry"),file=path.join(f.root,...f.d[kind].split("/")),value=JSON.parse(await readFile(file));
    if(kind==="connector")value.connector_id="other";else if(kind==="policy")value.policy_id="other";else value.dataset_id="other";await writeFile(file,JSON.stringify(value));
    await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root}),/binding drifted/);
  });}
});

test("governed refresh validation rejects escaping and linked paths",async t=>{
  await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:"."}),/absolute and canonical/);
  const f=await fixture(t,"co-business-registry"),outside=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-outside-"));t.after(()=>rm(outside,{recursive:true,force:true}));
  await rm(path.join(f.root,"scripts"),{recursive:true,force:true});await symlink(path.join(APP_ROOT,"scripts"),path.join(f.root,"scripts"),"junction");
  await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root}),/safe regular file/);
});

test("all ten managed plans remain HOLD and starts allocate nothing before rejecting",async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-managed-"));t.after(()=>rm(root,{recursive:true,force:true}));let executions=0,writes=0;
  const service=new ManagedOperations({root,executor:async()=>{executions++;},receiptWriter:async()=>{writes++;}});t.after(()=>service.close());await service.ready;const before=await readdir(root);
  for(const sourceId of GOVERNED_SOURCE_REFRESH_SOURCE_IDS){const plan=await service.sourceRefreshPlan({sourceId});assert.equal(plan.status,"HOLD");assert.equal(plan.operationCreated,false);assert.equal(plan.allocationCount,0);assert.equal(plan.networkRequestCount,0);assert.equal(plan.implementation.builder,`scripts/build-${sourceId}.mjs`);
    await assert.rejects(service.startSourceRefresh({sourceId}),error=>error.statusCode===409&&error.code==="ACQUISITION_NOT_AUTHORIZED");}
  assert.deepEqual(await readdir(root),before);assert.equal(executions,0);assert.equal(writes,0);assert.deepEqual(await service.list(),[]);
});
