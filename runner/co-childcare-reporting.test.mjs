import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {runCoChildcareAppJobWithTransport,runCoChildcareAppJob} from './co-childcare-app.mjs';
import {summarizeCoChildcareAppJob} from './co-childcare-reporting.mjs';
import {createCoChildcareFixture} from './co-childcare-test-fixtures.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');

test('CO reporting rejects unsupported options and pre-abort',async()=>{
 await assert.rejects(summarizeCoChildcareAppJob('missing',{signal:AbortSignal.abort()}),{name:'AbortError'});
 await assert.rejects(summarizeCoChildcareAppJob('missing',{nationalTotal:1000}));
});
test('CO offline reporting conserves null address states, ZIP4, gaps and source lineage',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/co-reporting-test-'));
 try{
  const fixture=createCoChildcareFixture({count:4});fixture.selected[0].zip=null;fixture.selected[0].state=null;fixture.selected[1].zip='01234-0067';fixture.selected[2].zip='012340068';fixture.selected[2].state='VA';delete fixture.selected[0].provider_name;fixture.selected[3].provider_name='x'.repeat(20000);fixture.selected[3].street_address='x'.repeat(20000);
  const job=await runCoChildcareAppJobWithTransport({outputRoot:path.join(root,'app'),fetchImpl:fixture.fetchImpl}),requests=fixture.calls.length;
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Reporting cannot fetch');
  try{
   const result=await summarizeCoChildcareAppJob(job.receiptPath);
   assert.equal(result.publisher_scope,'CO');assert.equal(result.source_candidate_rows,4);assert.equal(result.accepted_candidate_rows,3);assert.equal(result.quarantined_candidate_rows,1);
   assert.equal(result.accepted_candidate_rows+result.quarantined_candidate_rows,result.source_candidate_rows);
   assert.equal(result.by_reported_state.length,3);assert.ok(result.by_reported_state.every(r=>r.candidate_rows===1&&r.percent_of_accepted_cohort===100/3));
   assert.equal(result.by_reported_zip.filter(r=>r.zip5==='01234').reduce((n,r)=>n+r.candidate_rows,0),2);assert.equal(result.by_reported_zip.find(r=>r.zip5===null).candidate_rows,1);
   assert.equal(result.quality.with_zip5,2);assert.equal(result.quality.with_zip4,2);assert.equal(result.quality.with_points,0);assert.equal(result.quality.missing_points,3);
   assert.deepEqual(result.quality.state_unavailable_reasons,{'missing-source-state':1});assert.deepEqual(result.quality.zip_unavailable_reasons,{'missing-source-zip':1});
   assert.equal(Object.hasOwn(result.provenance,'reporting_period'),false);assert.equal(result.quality.state_scope_conflicts,1);assert.deepEqual(result.quality.status_unavailable_reasons,{'source-operating-status-not-provided':3});assert.equal(result.provenance.execution_mode,'injected-test-transport');
   assert.equal(result.provenance.app_receipt_sha256,hash(await readFile(job.receiptPath)));assert.equal(result.provenance.acquired_manifest_sha256,job.receipt.acquired.manifest_sha256);
   for(const key of ['source_updated_at','view_last_modified_at','publication_at','observed_at'])assert.ok(Number.isFinite(Date.parse(result.provenance[key])));
   assert.equal(result.claims.national_completeness_percent,null);assert.equal(result.claims.current_operations_verified,false);assert.equal(result.claims.public_export_authorized,false);
   const reused=await runCoChildcareAppJob({outputRoot:path.join(root,'reuse'),acquiredManifestPath:job.receipt.acquired.manifest_path});assert.deepEqual((await summarizeCoChildcareAppJob(reused.receiptPath)).by_reported_zip,result.by_reported_zip);assert.equal(fixture.calls.length,requests);
   const controller=new AbortController(),pending=summarizeCoChildcareAppJob(job.receiptPath,{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(pending,{name:'AbortError'});
   const manifestPath=job.receipt.normalized.manifest_path,manifestBytes=await readFile(manifestPath),rowsPath=path.join(path.dirname(manifestPath),'normalized.jsonl'),rowsBytes=await readFile(rowsPath),checkpointPath=path.join(path.dirname(job.receiptPath),'normalized.json'),checkpointBytes=await readFile(checkpointPath),receiptBytes=await readFile(job.receiptPath);
   for(const mutate of [rows=>{rows[0].reported_address.state='CO';},rows=>{rows[1].reported_address.zip4='9999';},rows=>{rows[1].source_record_id=rows[0].source_record_id;},rows=>{rows[0].source_status.status_source='Active';}]){
    const rows=rowsBytes.toString().trimEnd().split('\n').map(JSON.parse);mutate(rows);const changed=Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join('')),manifest=JSON.parse(manifestBytes),entry=manifest.artifacts.find(a=>a.path==='normalized.jsonl');entry.bytes=changed.length;entry.sha256=hash(changed);
    const changedManifest=Buffer.from(JSON.stringify(manifest)+'\n'),checkpoint=JSON.parse(checkpointBytes),receipt=JSON.parse(receiptBytes);checkpoint.verification.manifest_sha256=hash(changedManifest);receipt.normalized.manifest_sha256=hash(changedManifest);
    try{await writeFile(rowsPath,changed);await writeFile(manifestPath,changedManifest);await writeFile(checkpointPath,JSON.stringify(checkpoint)+'\n');await writeFile(job.receiptPath,JSON.stringify(receipt)+'\n');await assert.rejects(summarizeCoChildcareAppJob(job.receiptPath));}finally{await writeFile(rowsPath,rowsBytes);await writeFile(manifestPath,manifestBytes);await writeFile(checkpointPath,checkpointBytes);await writeFile(job.receiptPath,receiptBytes);}
   }
   assert.deepEqual(await summarizeCoChildcareAppJob(job.receiptPath),result);
  }finally{globalThis.fetch=oldFetch;}
 }finally{await rm(root,{recursive:true,force:true});}
});
