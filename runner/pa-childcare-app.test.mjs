import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { runPaChildcareAppJob, runPaChildcareAppJobWithTransport, verifyPaChildcareAppJob } from "./pa-childcare-app.mjs";
import { createPaChildcareFixture, paFixtureOptions } from "./pa-childcare-test-fixtures.mjs";
import { buildPaChildcareAcquiredReleaseWithTransport } from "./pa-childcare-acquired-release.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
function fixture(mutate=()=>{}){return createPaChildcareFixture({mutate:async(v,k,c)=>{
  if(k==="page")for(const row of v){row.facility_address="123 Main Street";row.facility_city="Harrisburg";}
  return mutate(v,k,c);
}});}
test("PA app rejects caller role/transport overrides, unsafe output and pre-abort before requests",async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error("unexpected request");};
  await assert.rejects(runPaChildcareAppJob({fetchImpl}));
  await assert.rejects(runPaChildcareAppJobWithTransport({fetchImpl,role:"approved"}));
  await assert.rejects(runPaChildcareAppJobWithTransport({fetchImpl,outputRoot:APP_ROOT}));
  await assert.rejects(runPaChildcareAppJobWithTransport({fetchImpl,signal:AbortSignal.abort()}));
  assert.equal(calls,0);
});

test("PA app durable lifecycle links real synthetic acquisition and normalization, with offline retained reuse",paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/pa-app-test-"));
  try{
    const outputRoot=path.join(root,"success");
    let entered,release;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const f=fixture(async(_v,k)=>{if(k==="baseline-ids"){entered();await gate;}});
    const running=runPaChildcareAppJobWithTransport({outputRoot,fetchImpl:f.fetchImpl,industryRunId:"pa-test-industry"});
    const arrived=await Promise.race([ready.then(()=>true),running.then(()=>false)]);assert.equal(arrived,true);
    try{let duplicates=0;await assert.rejects(runPaChildcareAppJobWithTransport({outputRoot,fetchImpl:async()=>{duplicates++;throw Error("duplicate");}}));assert.equal(duplicates,0);}
    finally{release();}
    const result=await running;
    assert.equal(result.receipt.status,"SUCCEEDED");
    assert.equal(result.receipt.industry_run_id,"pa-test-industry");
    const originalReceipt=await readFile(result.receiptPath);
    const job=path.dirname(result.receiptPath),startPath=path.join(job,"start.json"),startBytes=await readFile(startPath);
    assert.equal(result.receipt.start_sha256,hash(startBytes));
    const acquiredCheckpoint=JSON.parse(await readFile(path.join(job,"acquired.json")));
    const normalizedCheckpoint=JSON.parse(await readFile(path.join(job,"normalized.json")));
    assert.deepEqual(acquiredCheckpoint.verification,result.receipt.acquired);
    assert.deepEqual(normalizedCheckpoint.verification,result.receipt.normalized);
    const sourceManifest=result.receipt.acquired.manifest_path,sourceBytes=await readFile(sourceManifest);
    const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail("retained verification must not fetch");
    let reused;
    try{
      await verifyPaChildcareAppJob(result.receiptPath);
      reused=await runPaChildcareAppJob({outputRoot:path.join(root,"industry-segments","runs","managed-test","source-PA"),acquiredManifestPath:sourceManifest});
      await verifyPaChildcareAppJob(reused.receiptPath);
    }finally{globalThis.fetch=oldFetch;}
    assert.deepEqual(await readFile(sourceManifest),sourceBytes);
    assert.equal(reused.receipt.acquired.manifest_sha256,result.receipt.acquired.manifest_sha256);
    const normPath=path.join(job,"normalized.json"),normBytes=await readFile(normPath);
    const borrowedCheckpoint=JSON.parse(normBytes),borrowedReceipt=JSON.parse(originalReceipt);
    borrowedCheckpoint.verification=reused.receipt.normalized;borrowedReceipt.normalized=reused.receipt.normalized;
    await writeFile(normPath,JSON.stringify(borrowedCheckpoint)+"\n");await writeFile(result.receiptPath,JSON.stringify(borrowedReceipt)+"\n");
    await assert.rejects(verifyPaChildcareAppJob(result.receiptPath));
    await writeFile(normPath,normBytes);await writeFile(result.receiptPath,originalReceipt);
    for(const change of [r=>{r.claims.public_export_authorized=true;},r=>{r.acquired=structuredClone(reused.receipt.acquired);r.acquired.manifest_path=reused.receipt.normalized.manifest_path;}]){
      const changed=JSON.parse(originalReceipt);change(changed);await writeFile(result.receiptPath,JSON.stringify(changed)+"\n");await assert.rejects(verifyPaChildcareAppJob(result.receiptPath));await writeFile(result.receiptPath,originalReceipt);
    }
    const changedStart=JSON.parse(startBytes);changedStart.industry_run_id="forged";const altered=Buffer.from(JSON.stringify(changedStart)+"\n");
    await writeFile(startPath,altered);const changedReceipt=JSON.parse(originalReceipt);changedReceipt.start_sha256=hash(altered);
    await writeFile(result.receiptPath,JSON.stringify(changedReceipt)+"\n");await assert.rejects(verifyPaChildcareAppJob(result.receiptPath));
    await writeFile(startPath,startBytes);await writeFile(result.receiptPath,originalReceipt);
    const checkpointPath=path.join(job,"acquired.json"),checkpointBytes=await readFile(checkpointPath),badCheckpoint=JSON.parse(checkpointBytes);
    badCheckpoint.verification.record_count++;await writeFile(checkpointPath,JSON.stringify(badCheckpoint)+"\n");await assert.rejects(verifyPaChildcareAppJob(result.receiptPath));await writeFile(checkpointPath,checkpointBytes);
    await verifyPaChildcareAppJob(result.receiptPath);
    await assert.rejects(runPaChildcareAppJob({outputRoot:path.join(outputRoot,"runs",result.receipt.run_id,"nested"),acquiredManifestPath:sourceManifest}));
    await mkdir(path.join(root,"target"));await symlink(path.join(root,"target"),path.join(root,"alias"),"junction");
    await assert.rejects(runPaChildcareAppJobWithTransport({outputRoot:path.join(root,"alias"),fetchImpl:f.fetchImpl}));
  }finally{await rm(root,{recursive:true,force:true});}
});

test("PA app writes durable failed/cancelled outcomes and retains completed acquisition checkpoints",paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/pa-app-failure-test-"));
  try{
    const outcomes=await Promise.allSettled(["source","cancel","checkpoint-failure","checkpoint-cancel"].map(async kind=>{
      const outputRoot=path.join(root,kind),controller=new AbortController();
      const f=fixture((v,k)=>{
        if(kind==="source"&&k==="page")return new Response(null,{status:503});
        if(kind==="cancel"&&k==="policy"){controller.abort();return new Promise(()=>{});}
      });
      await assert.rejects(runPaChildcareAppJobWithTransport({outputRoot,fetchImpl:f.fetchImpl,signal:controller.signal,logger:async event=>{
        if(event.phase!=="acquired-checkpoint")return;
        if(kind==="checkpoint-cancel")controller.abort();
        if(kind==="checkpoint-failure")throw Error("synthetic checkpoint failure");
      }}));
      const [id]=await readdir(path.join(outputRoot,"jobs"));const receipt=JSON.parse(await readFile(path.join(outputRoot,"jobs",id,"receipt.json")));
      assert.equal(receipt.status,kind.includes("cancel")?"CANCELLED":"FAILED");
      assert.equal(receipt.output_state,"inspection-required");
      if(kind.startsWith("checkpoint"))assert.ok(await readFile(path.join(outputRoot,"jobs",id,"acquired.json")));
    }));
    for(const outcome of outcomes)if(outcome.status==="rejected")throw outcome.reason;
  }finally{await rm(root,{recursive:true,force:true});}
});

test("PA fixed native entry and historical retained acquisition both use the real pipeline",paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/pa-app-native-test-"));
  const originalFetch=globalThis.fetch;
  try{
    let entered,release;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const nativeFixture=fixture(async(_v,k)=>{if(k==="baseline-ids"){entered();await gate;}}),historicalFixture=fixture();
    globalThis.fetch=nativeFixture.fetchImpl;
    const nativeRun=runPaChildcareAppJob({outputRoot:path.join(root,"native")});
    const arrived=await Promise.race([ready.then(()=>true),nativeRun.then(()=>false)]);assert.equal(arrived,true);
    let gateError;
    try{
      const lockPath=path.join(APP_ROOT,"data/business-sources/pa-childcare-centers/runtime/publisher.lock"),lockBytes=await readFile(lockPath);
      await assert.rejects(runPaChildcareAppJob({outputRoot:path.join(root,"native-other")}),{code:"PA_CHILDCARE_PUBLISHER_BUSY"});
      assert.deepEqual(await readFile(lockPath),lockBytes);
      assert.equal(nativeFixture.calls.filter(c=>c.kind==="baseline-ids").length,1);
    }catch(error){gateError=error;}finally{release();}
    const results=await Promise.allSettled([
      nativeRun,
      buildPaChildcareAcquiredReleaseWithTransport({outputRoot:path.join(root,"historic-source"),fetchImpl:historicalFixture.fetchImpl,now:()=>new Date("2026-08-20T12:00:00.000Z")}),
    ]);
    if(gateError)throw gateError;
    for(const result of results)if(result.status==="rejected")throw result.reason;
    const [native,oldSource]=results.map(result=>result.value);
    assert.equal(native.receipt.execution_mode,"fixed-native-fetch");
    assert.equal(native.receipt.claims.native_execution_independently_verified,false);
    assert.ok(nativeFixture.calls.some(c=>c.kind==="page"));
    const bytes=await readFile(oldSource.manifest_path);
    globalThis.fetch=()=>assert.fail("historical reuse has no source transport");
    const retained=await runPaChildcareAppJob({outputRoot:path.join(root,"historic-reuse"),acquiredManifestPath:oldSource.manifest_path});
    assert.equal(retained.receipt.execution_mode,"retained-local-verification");
    assert.deepEqual(await readFile(oldSource.manifest_path),bytes);
    await verifyPaChildcareAppJob(retained.receiptPath);
  }finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
});
