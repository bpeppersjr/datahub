import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readCoChildcareNormalizedRelease} from "./co-childcare-normalized-release.mjs";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { runCoChildcareAppJob, runCoChildcareAppJobWithTransport, verifyCoChildcareAppJob } from "./co-childcare-app.mjs";
import { createCoChildcareFixture } from "./co-childcare-test-fixtures.mjs";
import { buildCoChildcareAcquiredReleaseWithTransport } from "./co-childcare-acquired-release.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
function fixture(mutate=()=>{}){return createCoChildcareFixture({mutate:async(v,k,c)=>{
  return mutate(v,k,c);
}});}
test("CO app rejects caller role/transport overrides, unsafe output and pre-abort before requests",async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error("unexpected request");};
  await assert.rejects(runCoChildcareAppJob({fetchImpl}));
  await assert.rejects(runCoChildcareAppJobWithTransport({fetchImpl,role:"approved"}));
  await assert.rejects(runCoChildcareAppJobWithTransport({fetchImpl,outputRoot:APP_ROOT}));
  await assert.rejects(runCoChildcareAppJobWithTransport({fetchImpl,signal:AbortSignal.abort()}));
  assert.equal(calls,0);
});

test("CO app durable lifecycle links real synthetic acquisition and normalization, with offline retained reuse",async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/co-app-test-"));
  try{
    const outputRoot=path.join(root,"success");
    let entered,release;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const f=fixture(async(_v,k)=>{if(k==="baseline-ids"){entered();await gate;}});
    const running=runCoChildcareAppJobWithTransport({outputRoot,fetchImpl:f.fetchImpl,industryRunId:"co-test-industry"});
    const arrived=await Promise.race([ready.then(()=>true),running.then(()=>false)]);assert.equal(arrived,true);
    try{let duplicates=0;await assert.rejects(runCoChildcareAppJobWithTransport({outputRoot,fetchImpl:async()=>{duplicates++;throw Error("duplicate");}}));assert.equal(duplicates,0);}
    finally{release();}
    const result=await running;
    assert.equal(result.receipt.status,"SUCCEEDED");
    assert.equal(result.receipt.claims.address_role,"physical-address-as-reported-in-licensing-application");assert.equal(result.receipt.claims.coordinates_selected,false);assert.equal(result.receipt.claims.current_operations_verified,false);
    assert.equal(result.receipt.industry_run_id,"co-test-industry");
    const originalReceipt=await readFile(result.receiptPath);
    const job=path.dirname(result.receiptPath),startPath=path.join(job,"start.json"),startBytes=await readFile(startPath);
    assert.equal(result.receipt.start_sha256,hash(startBytes));
    const acquiredCheckpoint=JSON.parse(await readFile(path.join(job,"acquired.json")));
    const normalizedCheckpoint=JSON.parse(await readFile(path.join(job,"normalized.json")));
    assert.deepEqual(acquiredCheckpoint.verification,result.receipt.acquired);
    assert.deepEqual(normalizedCheckpoint.verification,result.receipt.normalized);
    const projected=await readCoChildcareNormalizedRelease(result.receipt.normalized.manifest_path);assert.equal(projected.records.length,2);assert.equal(projected.quarantine.length,0);assert.equal(projected.records[0].reported_address.street,"123 Synthetic Street");assert.equal(projected.records[0].quality.address_unavailable_reason,null);assert.equal(projected.manifest.acquired.execution_mode,"injected-test-transport");
    const sourceManifest=result.receipt.acquired.manifest_path,sourceBytes=await readFile(sourceManifest);
    const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail("retained verification must not fetch");
    let reused;
    try{
      await verifyCoChildcareAppJob(result.receiptPath);
      reused=await runCoChildcareAppJob({outputRoot:path.join(root,"industry-segments","runs","managed-test","source-CO"),acquiredManifestPath:sourceManifest});
      await verifyCoChildcareAppJob(reused.receiptPath);
    }finally{globalThis.fetch=oldFetch;}
    assert.deepEqual(await readFile(sourceManifest),sourceBytes);
    assert.equal(reused.receipt.acquired.manifest_sha256,result.receipt.acquired.manifest_sha256);
    const execute=promisify(execFile);
    const cli=await execute(process.execPath,["scripts/build-co-childcare.mjs","--acquired",sourceManifest,"--output",path.join(root,"cli-reuse")],{cwd:APP_ROOT,windowsHide:true});
    const cliResult=JSON.parse(cli.stdout);assert.equal(cliResult.receipt.execution_mode,"retained-local-verification");assert.equal(cliResult.receipt.acquired.manifest_sha256,result.receipt.acquired.manifest_sha256);
    const cliVerified=JSON.parse((await execute(process.execPath,["scripts/verify-co-childcare-app.mjs","--receipt",cliResult.receiptPath],{cwd:APP_ROOT,windowsHide:true})).stdout);
    assert.equal(cliVerified.receipt_sha256,cliResult.receipt_sha256);assert.deepEqual(await readFile(sourceManifest),sourceBytes);
    const normPath=path.join(job,"normalized.json"),normBytes=await readFile(normPath);
    const borrowedCheckpoint=JSON.parse(normBytes),borrowedReceipt=JSON.parse(originalReceipt);
    borrowedCheckpoint.verification=reused.receipt.normalized;borrowedReceipt.normalized=reused.receipt.normalized;
    await writeFile(normPath,JSON.stringify(borrowedCheckpoint)+"\n");await writeFile(result.receiptPath,JSON.stringify(borrowedReceipt)+"\n");
    await assert.rejects(verifyCoChildcareAppJob(result.receiptPath));
    await writeFile(normPath,normBytes);await writeFile(result.receiptPath,originalReceipt);
    for(const change of [r=>{r.claims.public_export_authorized=true;},r=>{r.acquired.execution_mode="fixed-native-fetch";},r=>{r.acquired=structuredClone(reused.receipt.acquired);r.acquired.manifest_path=reused.receipt.normalized.manifest_path;}]){
      const changed=JSON.parse(originalReceipt);change(changed);await writeFile(result.receiptPath,JSON.stringify(changed)+"\n");await assert.rejects(verifyCoChildcareAppJob(result.receiptPath));await writeFile(result.receiptPath,originalReceipt);
    }
    const changedStart=JSON.parse(startBytes);changedStart.industry_run_id="forged";const altered=Buffer.from(JSON.stringify(changedStart)+"\n");
    await writeFile(startPath,altered);const changedReceipt=JSON.parse(originalReceipt);changedReceipt.start_sha256=hash(altered);
    await writeFile(result.receiptPath,JSON.stringify(changedReceipt)+"\n");await assert.rejects(verifyCoChildcareAppJob(result.receiptPath));
    await writeFile(startPath,startBytes);await writeFile(result.receiptPath,originalReceipt);
    const checkpointPath=path.join(job,"acquired.json"),checkpointBytes=await readFile(checkpointPath),badCheckpoint=JSON.parse(checkpointBytes);
    badCheckpoint.verification.record_count++;await writeFile(checkpointPath,JSON.stringify(badCheckpoint)+"\n");await assert.rejects(verifyCoChildcareAppJob(result.receiptPath));await writeFile(checkpointPath,checkpointBytes);
    await verifyCoChildcareAppJob(result.receiptPath);
    await assert.rejects(runCoChildcareAppJob({outputRoot:path.join(outputRoot,"runs",result.receipt.run_id,"nested"),acquiredManifestPath:sourceManifest}));
    await mkdir(path.join(root,"target"));await symlink(path.join(root,"target"),path.join(root,"alias"),"junction");
    await assert.rejects(runCoChildcareAppJobWithTransport({outputRoot:path.join(root,"alias"),fetchImpl:f.fetchImpl}));
  }finally{await rm(root,{recursive:true,force:true});}
});

test("CO app writes durable failed/cancelled outcomes and retains completed acquisition checkpoints",async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/co-app-failure-test-"));
  try{
    const outcomes=await Promise.allSettled(["source","cancel","checkpoint-failure","checkpoint-cancel","normalized-cancel"].map(async kind=>{
      const outputRoot=path.join(root,kind),controller=new AbortController();
      const f=fixture((v,k)=>{
        if(kind==="source"&&k==="page")return new Response(null,{status:503});
        if(kind==="cancel"&&k==="metadata"){controller.abort();return new Promise(()=>{});}
      });
      await assert.rejects(runCoChildcareAppJobWithTransport({outputRoot,fetchImpl:f.fetchImpl,signal:controller.signal,logger:async event=>{
        if(kind==="normalized-cancel"&&event.phase==="normalized-checkpoint")controller.abort();
        if(event.phase!=="acquired-checkpoint")return;
        if(kind==="checkpoint-cancel")controller.abort();
        if(kind==="checkpoint-failure")throw Error("synthetic checkpoint failure");
      }}));
      const [id]=await readdir(path.join(outputRoot,"jobs"));const receipt=JSON.parse(await readFile(path.join(outputRoot,"jobs",id,"receipt.json")));
      assert.equal(receipt.status,kind.includes("cancel")?"CANCELLED":"FAILED");
      assert.equal(receipt.output_state,"inspection-required");
      if(kind.startsWith("checkpoint"))assert.ok(await readFile(path.join(outputRoot,"jobs",id,"acquired.json")));
      if(kind==="normalized-cancel"){assert.ok(receipt.normalized);assert.ok(await readFile(path.join(outputRoot,"jobs",id,"normalized.json")));await readCoChildcareNormalizedRelease(receipt.normalized.manifest_path);}
    }));
    for(const outcome of outcomes)if(outcome.status==="rejected")throw outcome.reason;
  }finally{await rm(root,{recursive:true,force:true});}
});

test("CO fixed native entry and historical retained acquisition both use the real pipeline",async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/co-app-native-test-"));
  const originalFetch=globalThis.fetch;
  try{
    let entered,release;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const nativeFixture=fixture(async(_v,k)=>{if(k==="baseline-ids"){entered();await gate;}}),historicalFixture=fixture();
    globalThis.fetch=nativeFixture.fetchImpl;
    const nativeRun=runCoChildcareAppJob({outputRoot:path.join(root,"native")});
    const arrived=await Promise.race([ready.then(()=>true),nativeRun.then(()=>false)]);assert.equal(arrived,true);
    let gateError;
    try{
      const lockPath=path.join(APP_ROOT,"data/business-sources/co-childcare/runtime/publisher.lock"),lockBytes=await readFile(lockPath);
      await assert.rejects(runCoChildcareAppJob({outputRoot:path.join(root,"native-other")}),{code:"CO_CHILDCARE_PUBLISHER_BUSY"});
      assert.deepEqual(await readFile(lockPath),lockBytes);
      assert.equal(nativeFixture.calls.filter(c=>c.kind==="baseline-ids").length,1);
    }catch(error){gateError=error;}finally{release();}
    const results=await Promise.allSettled([
      nativeRun,
      buildCoChildcareAcquiredReleaseWithTransport({outputRoot:path.join(root,"historic-source"),fetchImpl:historicalFixture.fetchImpl,now:()=>new Date("2026-09-07T12:00:00.000Z")}),
    ]);
    if(gateError)throw gateError;
    for(const result of results)if(result.status==="rejected")throw result.reason;
    const [native,oldSource]=results.map(result=>result.value);
    assert.equal(native.receipt.execution_mode,"fixed-native-fetch");
    assert.equal(native.receipt.claims.native_execution_independently_verified,false);
    assert.ok(nativeFixture.calls.some(c=>c.kind==="page"));
    const bytes=await readFile(oldSource.manifest_path);
    globalThis.fetch=()=>assert.fail("historical reuse has no source transport");
    const retained=await runCoChildcareAppJob({outputRoot:path.join(root,"historic-reuse"),acquiredManifestPath:oldSource.manifest_path});
    assert.equal(retained.receipt.execution_mode,"retained-local-verification");
    assert.deepEqual(await readFile(oldSource.manifest_path),bytes);
    await verifyCoChildcareAppJob(retained.receiptPath);
  }finally{globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
});


test("CO app CLI rejects wrong state, scope and unknown options without acquisition",async()=>{const execute=promisify(execFile);for(const args of [["--state","PA"],["--states","CO,PA"],["--url","https://example.invalid"],["--unknown"],["--acquired"],["--output","data/tmp/co-cli-rejected","--output","data/tmp/co-cli-rejected"]])await assert.rejects(execute(process.execPath,["scripts/build-co-childcare.mjs",...args],{cwd:APP_ROOT,windowsHide:true}));assert.match((await execute(process.execPath,["scripts/build-co-childcare.mjs","--help"],{cwd:APP_ROOT,windowsHide:true})).stdout,/Usage:/);for(const args of [[],["--receipt","relative"],["--receipt",APP_ROOT,"--extra"]])await assert.rejects(execute(process.execPath,["scripts/verify-co-childcare-app.mjs",...args],{cwd:APP_ROOT,windowsHide:true}));});
