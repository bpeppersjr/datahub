import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { ManagedOperations } from "./managed-operations.mjs";
import { GOVERNED_SOURCE_REFRESH_DESCRIPTORS, GOVERNED_SOURCE_REFRESH_SOURCE_IDS, governedSourceRefreshPlan, validateGovernedSourceRefreshDescriptor } from "./governed-source-refresh-registry.mjs";

const expected={
  "fdic-bankfind":["US","fdic-bankfind","verifyFdicBankfind"],
  "ncua-quarterly":["US","ncua-quarterly-credit-unions","verifyNcuaQuarterly"],
  "fmcsa-company-census":["US","fmcsa-active-us-company-census","verifyFmcsaCompanyCensus"],
  "usda-snap-retailers":["US","usda-snap-retailers","verifyUsdaSnapRelease","data/business-sources/usda-snap"],
  "cms-nppes-organizations":["US","cms-nppes-organizations","verifyCmsNppesOrganizations"],
  "irs-eo-bmf":["US","irs-eo-bmf-organizations","verifyIrsEoBmf"],
  "co-business-registry":["CO","co-business-registry-good-standing-or-delinquent-organizations","verifyCoBusinessRegistry"],
  "ct-business-registry":["CT","ct-business-registry-active-organizations","verifyCtBusinessRegistry"],
  "de-business-licenses":["DE","de-business-licenses-current","verifyDeBusinessLicenses"],
  "fl-business-registry":["FL","fl-business-registry-quarterly-active-entities","verifyFlBusinessRegistry"],
  "ia-business-registry":["IA","ia-business-registry-active-entities","verifyIaBusinessRegistry"],
  "il-business-registry":["IL","il-business-registry-active-organizations","verifyIllinoisBusinessRegistry"],
  "ny-business-registry":["NY","ny-business-registry-active-entities","verifyNyBusinessRegistry"],
  "or-business-registry":["OR","or-business-registry-active-registrations","verifyOrBusinessRegistry"],
  "pa-business-registry":["PA","pa-business-registry-active-registrations","verifyPaBusinessRegistry"],
  "tx-active-sales-tax-permits":["TX","tx-active-sales-tax-outlets","verifyTxActiveSalesTaxPermits"],
  "wa-lni-active-contractor-licenses":["WA","wa-lni-active-contractor-organizations","verifyWaLniActiveContractors"],
};

test("seventeen governed refresh descriptors bind exact builders, verifiers, datasets, outputs and policies",async()=>{
  assert.deepEqual(GOVERNED_SOURCE_REFRESH_SOURCE_IDS,Object.keys(expected));
  for(const sourceId of GOVERNED_SOURCE_REFRESH_SOURCE_IDS){
    const binding=await validateGovernedSourceRefreshDescriptor(sourceId),[state,datasetId,verifierExport,outputRoot]=expected[sourceId];
    const productionAuthorized=["fdic-bankfind","ncua-quarterly","fmcsa-company-census","usda-snap-retailers","cms-nppes-organizations","irs-eo-bmf","co-business-registry","ct-business-registry","de-business-licenses","ia-business-registry","ny-business-registry","or-business-registry","pa-business-registry","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"].includes(sourceId);
    assert.deepEqual({state:binding.state,datasetId:binding.datasetId,verifierExport:binding.verifierExport,builder:binding.builder,verifier:binding.verifier,outputRoot:binding.outputRoot,connector:binding.connector,policy:binding.policy,dataset:binding.dataset,status:binding.status,dispatchAvailable:binding.dispatchAvailable},
      {state,datasetId,verifierExport,builder:`scripts/build-${sourceId}.mjs`,verifier:`runner/${sourceId}.mjs`,outputRoot:outputRoot??`data/business-sources/${datasetId}`,connector:`config/connectors/${sourceId}.json`,policy:`config/source-policies/${sourceId}.json`,dataset:`config/datasets/${datasetId}.json`,status:productionAuthorized?"AUTHORIZED":"HOLD",dispatchAvailable:productionAuthorized});
    assert.equal(binding.evidence.length,sourceId==="cms-nppes-organizations"?7:["fdic-bankfind","ncua-quarterly","fmcsa-company-census","usda-snap-retailers","irs-eo-bmf","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"].includes(sourceId)?6:5);assert.ok(binding.evidence.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)&&item.bytes>0));
  }
});

async function fixture(t,sourceId){
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-registry-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const d=GOVERNED_SOURCE_REFRESH_DESCRIPTORS[sourceId];for(const relative of [d.builder,d.verifier,d.connector,d.policy,d.dataset,...(d.assessment?[d.assessment]:[]),...(d.dependencies??[])]){const target=path.join(root,...relative.split("/"));await mkdir(path.dirname(target),{recursive:true});await cp(path.join(APP_ROOT,...relative.split("/")),target);}
  await mkdir(path.join(root,"config"),{recursive:true});await writeFile(path.join(root,"config/governed-source-refresh-authorizations.json"),JSON.stringify({schema_version:"governed-source-refresh-authorizations@1.0.0",authorizations:{}}));
  return {root,d};
}

test("a separate reviewed receipt authorizes only the exact governed implementation evidence",async t=>{
  const f=await fixture(t,"co-business-registry"),hold=await validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root});
  assert.equal(hold.status,"HOLD");assert.equal(hold.authorization,null);
  const evidenceSha=createHash("sha256").update(JSON.stringify(hold.evidence)).digest("hex"),receipt={
    schema_version:"governed-source-refresh-authorization@1.0.0",authorization_id:"co-reviewed-fixture",source_id:"co-business-registry",
    approved_at:"2026-11-12T12:00:00.000Z",approved_by:"test-reviewer",mode:"app-owned-automatic-full-snapshot-refresh",
    descriptor_evidence_sha256:evidenceSha,permissions:{fresh_acquisition:true,autonomous_acquisition:true,production_pointer_change:true,terms_reviewed:true,source_access_reviewed:true},
  },registry={schema_version:"governed-source-refresh-authorizations@1.0.0",authorizations:{"co-business-registry":receipt}},file=path.join(f.root,"config/governed-source-refresh-authorizations.json");
  await writeFile(file,JSON.stringify(registry));
  const authorized=await validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root});
  assert.equal(authorized.status,"AUTHORIZED");assert.equal(authorized.dispatchAvailable,true);assert.equal(authorized.autonomousAcquisitionAuthorized,true);assert.equal(authorized.authorization.authorization_id,"co-reviewed-fixture");
  const plan=await governedSourceRefreshPlan("co-business-registry",{appRoot:f.root});
  assert.equal(plan.status,"AUTHORIZED");assert.equal(plan.dispatchAvailable,true);assert.deepEqual(plan.unresolvedGates,[]);assert.equal(plan.authorization.authorizationId,"co-reviewed-fixture");
  await writeFile(path.join(f.root,...f.d.builder.split("/")),`${await readFile(path.join(f.root,...f.d.builder.split("/")),"utf8")}\n`);
  await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root}),/authorization receipt is invalid/);
});

test("governed refresh validation rejects connector, policy and dataset pin drift",async t=>{
  for(const kind of ["connector","policy","dataset"]){await t.test(kind,async t=>{const f=await fixture(t,"co-business-registry"),file=path.join(f.root,...f.d[kind].split("/")),value=JSON.parse(await readFile(file));
    if(kind==="connector")value.connector_id="other";else if(kind==="policy")value.policy_id="other";else value.dataset_id="other";await writeFile(file,JSON.stringify(value));
    await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root}),/binding drifted/);
  });}
});

test("national, Texas and Washington authorizations are bound to their current assessments",async t=>{
  for(const sourceId of ["fdic-bankfind","ncua-quarterly","fmcsa-company-census","usda-snap-retailers","cms-nppes-organizations","irs-eo-bmf","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"]){await t.test(sourceId,async t=>{const f=await fixture(t,sourceId),hold=await validateGovernedSourceRefreshDescriptor(sourceId,{appRoot:f.root}),registryFile=path.join(f.root,"config/governed-source-refresh-authorizations.json");
    await writeFile(registryFile,JSON.stringify({schema_version:"governed-source-refresh-authorizations@1.0.0",authorizations:{[sourceId]:{schema_version:"governed-source-refresh-authorization@1.0.0",authorization_id:`${sourceId}-assessment-test`,source_id:sourceId,approved_at:"2026-11-12T13:00:00.000Z",approved_by:"test-reviewer",mode:"app-owned-automatic-full-snapshot-refresh",descriptor_evidence_sha256:createHash("sha256").update(JSON.stringify(hold.evidence)).digest("hex"),permissions:{fresh_acquisition:true,autonomous_acquisition:true,production_pointer_change:true,terms_reviewed:true,source_access_reviewed:true}}}}));
    assert.equal((await validateGovernedSourceRefreshDescriptor(sourceId,{appRoot:f.root})).status,"AUTHORIZED");
    const file=path.join(f.root,...f.d.assessment.split("/")),value=JSON.parse(await readFile(file,"utf8"));value.observation.aggregate_records+=1;await writeFile(file,JSON.stringify(value));
    await assert.rejects(validateGovernedSourceRefreshDescriptor(sourceId,{appRoot:f.root}),/authorization receipt is invalid/);
  });}
});

test("governed refresh validation rejects escaping and linked paths",async t=>{
  await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:"."}),/absolute and canonical/);
  const f=await fixture(t,"co-business-registry"),outside=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-outside-"));t.after(()=>rm(outside,{recursive:true,force:true}));
  await rm(path.join(f.root,"scripts"),{recursive:true,force:true});await symlink(path.join(APP_ROOT,"scripts"),path.join(f.root,"scripts"),"junction");
  await assert.rejects(validateGovernedSourceRefreshDescriptor("co-business-registry",{appRoot:f.root}),/safe regular file/);
});

test("unauthorized managed plans remain HOLD and allocate nothing before rejecting",async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-managed-"));t.after(()=>rm(root,{recursive:true,force:true}));let executions=0,writes=0;
  const service=new ManagedOperations({root,executor:async()=>{executions++;},receiptWriter:async()=>{writes++;}});t.after(()=>service.close());await service.ready;const before=await readdir(root);
  for(const sourceId of GOVERNED_SOURCE_REFRESH_SOURCE_IDS){const authorized=["fdic-bankfind","ncua-quarterly","fmcsa-company-census","usda-snap-retailers","cms-nppes-organizations","irs-eo-bmf","co-business-registry","ct-business-registry","de-business-licenses","ia-business-registry","ny-business-registry","or-business-registry","pa-business-registry","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"].includes(sourceId),plan=await service.sourceRefreshPlan({sourceId});assert.equal(plan.status,authorized?"AUTHORIZED":"HOLD");assert.equal(plan.operationCreated,false);assert.equal(plan.allocationCount,0);assert.equal(plan.networkRequestCount,0);assert.equal(plan.implementation.builder,`scripts/build-${sourceId}.mjs`);
    if(!authorized)await assert.rejects(service.startSourceRefresh({sourceId}),error=>error.statusCode===409&&error.code==="ACQUISITION_NOT_AUTHORIZED");}
  assert.deepEqual(await readdir(root),before);assert.equal(executions,0);assert.equal(writes,0);assert.deepEqual(await service.list(),[]);
});

test("descriptor-only governed sources are visible and authorization-gated in Data Operations",async()=>{
  const [page,card]=await Promise.all([readFile(new URL("../app/data-operations.tsx",import.meta.url),"utf8"),readFile(new URL("../app/governed-source-refresh-status.tsx",import.meta.url),"utf8")]);
  assert.match(page,/GovernedSourceRefreshStatusCard/);for(const id of ["fdic-bankfind","ncua-quarterly","fmcsa-company-census","usda-snap-retailers","cms-nppes-organizations","irs-eo-bmf","il-business-registry","tx-active-sales-tax-permits","wa-lni-active-contractor-licenses"])assert.match(page,new RegExp(id));
  assert.match(card,/aggregateLabel/);
  assert.match(card,/source-refreshes/);assert.match(card,/disabled=\{!authorized\|\|disabled\|\|busy\}/);assert.match(card,/No current governed assessment bound/);assert.match(card,/not an all-business denominator/);
});

test("an authorized managed source refresh is app-owned and independently verified",async t=>{
  const output=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-output-")),root=await mkdtemp(path.join(APP_ROOT,"data/tmp/governed-refresh-operation-"));
  t.after(()=>Promise.all([rm(output,{recursive:true,force:true}),rm(root,{recursive:true,force:true})]));
  const relativeOutput=path.relative(APP_ROOT,output).replaceAll("\\","/"),authorization={authorization_id:"co-managed-test"};
  const plan={status:"AUTHORIZED",authorization:{authorizationId:authorization.authorization_id},implementation:{builder:"scripts/build-co-business-registry.mjs",outputRoot:relativeOutput,datasetId:"co-business-registry-good-standing-or-delinquent-organizations"}};
  const readiness={sourceId:"co-business-registry",dispatchAvailable:true,plan};let executed=0,verified=0;
  const service=new ManagedOperations({root,sourceRefreshDispatch:new Map([["co-business-registry",{readiness:async()=>readiness,rejection:"held"}]]),executor:async()=>{
    executed++;const release="co-test-release",directory=path.join(output,"releases",release);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,"manifest.json"),"{}\n");await writeFile(path.join(output,"current.json"),JSON.stringify({dataset_id:plan.implementation.datasetId,release_id:release,manifest:`releases/${release}/manifest.json`}));return{code:0,stdout:""};
  },governedSourceValidator:async()=>({sourceId:"co-business-registry",datasetId:plan.implementation.datasetId,outputRoot:relativeOutput,verifier:"runner/co-business-registry.mjs",verifierExport:"verifyCoBusinessRegistry",status:"AUTHORIZED",authorization}),governedSourceVerifier:async()=>{verified++;return{verified:true};}});
  t.after(()=>service.close());const started=await service.startSourceRefresh({sourceId:"co-business-registry"});assert.equal(started.kind,"source-refresh");
  let operation;for(let attempt=0;attempt<100;attempt++){operation=await service.get(started.id);if(["SUCCEEDED","FAILED","CANCELLED"].includes(operation.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(operation.status,"SUCCEEDED");assert.equal(operation.result.releaseId,"co-test-release");assert.equal(operation.result.authorizationId,"co-managed-test");assert.equal(operation.artifacts.length,0);assert.equal(executed,1);assert.equal(verified,1);
});
