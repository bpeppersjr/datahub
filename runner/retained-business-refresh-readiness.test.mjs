import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ManagedOperations } from "./managed-operations.mjs";
import { APP_ROOT } from "./paths.mjs";
import { getRetainedBusinessRefreshReadiness, RETAINED_BUSINESS_REFRESH_DESCRIPTORS, RETAINED_BUSINESS_REFRESH_SOURCE_IDS } from "./retained-business-refresh-readiness.mjs";

const expected={
  "co-business-registry":{release:"co-business-registry-20260903-002916547Z-ed08beca",metrics:[2164812,2164811,1],artifacts:21},
  "ct-business-registry":{release:"ct-business-registry-20260903-003855102Z-e8cabffc",metrics:[458892,458892,13],artifacts:20},
  "de-business-licenses":{release:"de-business-licenses-20260903-002309163Z-f955c045",metrics:[67829,66667,27],artifacts:21},
  "fl-business-registry":{release:"fl-business-registry-20260903-020111292Z-fbdce156",metrics:[12808196,4109230,8698964],artifacts:23},
  "pa-business-registry":{release:"pa-business-registry-20260903-011928723Z-b4cbfaf4",metrics:[2360829,2360829,0],artifacts:20},
};

test("five retained business refresh contracts are deterministic, pointer-bound and held",async()=>{
  for(const sourceId of RETAINED_BUSINESS_REFRESH_SOURCE_IDS){
    const first=await getRetainedBusinessRefreshReadiness(sourceId),second=await getRetainedBusinessRefreshReadiness(sourceId),want=expected[sourceId];
    assert.deepEqual(first,second);assert.equal(first.readinessStatus,"HOLD");assert.equal(first.dispatchAvailable,false);assert.equal(first.freshAcquisitionAuthorized,false);assert.equal(first.plan.networkRequestCount,0);assert.equal(first.plan.allocationCount,0);assert.equal(first.plan.operationCreated,false);assert.equal(first.plan.evidence.length,6);assert.ok(first.plan.evidence.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)));
    assert.equal(first.observedAssessment.catalogRetainedReleaseMatchesAssessment,false);assert.equal(first.observedAssessment.currentRetainedReleaseMatchesAssessment,true);assert.equal(first.retainedRelease.releaseId,want.release);assert.equal(first.retainedRelease.artifactCount,want.artifacts);assert.deepEqual(first.retainedRelease.metrics.map(item=>item.value),want.metrics);
  }
});

async function fixture(sourceId){
  const d=RETAINED_BUSINESS_REFRESH_DESCRIPTORS[sourceId],root=await mkdtemp(path.join(APP_ROOT,"data/tmp/retained-refresh-"));
  const relatives=[`config/source-policies/${sourceId}.json`,`config/connectors/${sourceId}.json`,`config/datasets/${d.datasetId}.json`,`config/state-business-source-existing-assessments/${d.state.toLowerCase()}-2026-09-22.json`,`data/business-sources/${d.datasetId}/current.json`];
  const pointer=JSON.parse(await readFile(path.join(APP_ROOT,relatives[4]),"utf8"));relatives.push(`data/business-sources/${d.datasetId}/${pointer.manifest}`);
  for(const relative of relatives){await mkdir(path.dirname(path.join(root,relative)),{recursive:true});await cp(path.join(APP_ROOT,relative),path.join(root,relative));}
  return {root,d,pointerPath:path.join(root,relatives[4]),manifestPath:path.join(root,relatives[5])};
}

test("copied pointer and manifest fixtures fail closed on identity and count drift",async t=>{
  for(const sourceId of RETAINED_BUSINESS_REFRESH_SOURCE_IDS){
    await t.test(sourceId,async t=>{
      const f=await fixture(sourceId);t.after(()=>rm(f.root,{recursive:true,force:true}));
      assert.equal((await getRetainedBusinessRefreshReadiness(sourceId,{appRoot:f.root})).sourceId,sourceId);
      const pointer=JSON.parse(await readFile(f.pointerPath,"utf8"));pointer.manifest="releases/not-the-retained-release/manifest.json";await writeFile(f.pointerPath,JSON.stringify(pointer));
      await assert.rejects(getRetainedBusinessRefreshReadiness(sourceId,{appRoot:f.root}),/current pointer/);
      await cp(path.join(APP_ROOT,`data/business-sources/${f.d.datasetId}/current.json`),f.pointerPath);
      const manifest=JSON.parse(await readFile(f.manifestPath,"utf8"));manifest.coverage[Object.keys(manifest.coverage).find(key=>Number.isInteger(manifest.coverage[key]))]++;await writeFile(f.manifestPath,JSON.stringify(manifest));
      await assert.rejects(getRetainedBusinessRefreshReadiness(sourceId,{appRoot:f.root}),/count contract/);
    });
  }
});

test("managed previews allocate nothing and starts validate before rejecting",async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/retained-refresh-managed-"));t.after(()=>rm(root,{recursive:true,force:true}));let executions=0,writes=0;
  const service=new ManagedOperations({root,executor:async()=>{executions++;},receiptWriter:async()=>{writes++;}});t.after(()=>service.close());await service.ready;const before=await readdir(root);
  for(const sourceId of RETAINED_BUSINESS_REFRESH_SOURCE_IDS){const plan=await service.sourceRefreshPlan({sourceId});assert.equal(plan.operationCreated,false);await assert.rejects(service.startSourceRefresh({sourceId}),error=>error.statusCode===409&&error.code==="ACQUISITION_NOT_AUTHORIZED");}
  assert.deepEqual(await readdir(root),before);assert.equal(executions,0);assert.equal(writes,0);assert.deepEqual(await service.list(),[]);
  const managedSource=await readFile(new URL("./managed-operations.mjs",import.meta.url),"utf8"),start=managedSource.slice(managedSource.indexOf("async startSourceRefresh"),managedSource.indexOf("async plan",managedSource.indexOf("async startSourceRefresh")));
  assert.ok(start.indexOf("await dispatch.readiness()")<start.indexOf("ACQUISITION_NOT_AUTHORIZED"));
});

test("five-state UI is reusable and remains closed",async()=>{
  const [page,card,config]=await Promise.all([readFile(new URL("../app/data-operations.tsx",import.meta.url),"utf8"),readFile(new URL("../app/retained-business-refresh-status.tsx",import.meta.url),"utf8"),readFile(new URL("../config/industry-segments.json",import.meta.url),"utf8")]);
  assert.match(page,/RetainedBusinessRefreshStatusCard/);assert.match(card,/Preview refresh plan/);assert.match(card,/<button className="primary-button" disabled/);assert.doesNotMatch(card,/source-refreshes/);for(const sourceId of RETAINED_BUSINESS_REFRESH_SOURCE_IDS)assert.doesNotMatch(config,new RegExp(`"${sourceId}"`));
});
