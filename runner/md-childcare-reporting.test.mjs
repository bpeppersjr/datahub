import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {runMdChildcareAppJobWithTransport,runMdChildcareAppJob} from './md-childcare-app.mjs';
import {summarizeMdChildcareAppJob} from './md-childcare-reporting.mjs';
import {createMdChildcareFixture} from './md-childcare-test-fixtures.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
test('MD reporting rejects unsupported options and cancellation before reading',async()=>{
 await assert.rejects(summarizeMdChildcareAppJob('missing',{signal:AbortSignal.abort()}),{name:'AbortError'});
 await assert.rejects(summarizeMdChildcareAppJob('missing',{nationalTotal:1000}));
});
test('MD dated candidate reporting conserves gaps, license repetitions and source lineage offline',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/md-reporting-test-'));
 try{
  const fixture=createMdChildcareFixture({count:4,mutate:(payload,kind)=>{if(kind==='page'){
   const rows=payload.features;rows[0].attributes.State=null;rows[0].attributes.Zip_Code=null;
   rows[1].attributes.Zip_Code=1234;
   rows[2].attributes.State='VA';rows[2].attributes.License_Number=null;rows[2].geometry={x:0,y:0};
   rows[3].attributes.Zip_Code=-1;rows[3].attributes.License_Number='same-credential';rows[3].geometry={x:999,y:999};
  }}});
  const job=await runMdChildcareAppJobWithTransport({outputRoot:path.join(root,'app'),fetchImpl:fixture.fetchImpl});const requests=fixture.calls.length;
  const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Reporting must not fetch');
  try{
   const summary=await summarizeMdChildcareAppJob(job.receiptPath);
   assert.equal(summary.source_candidate_rows,4);assert.equal(summary.accepted_candidate_rows,4);assert.equal(summary.quarantined_candidate_rows,0);
   assert.equal(summary.distinct_accepted_license_ids,1);assert.equal(summary.accepted_rows_with_license,3);assert.equal(summary.repeated_accepted_license_rows,2);
   for(const group of [summary.by_reported_state,summary.by_reported_zip]){assert.equal(group.reduce((n,r)=>n+r.candidate_rows,0),4);assert.equal(group.reduce((n,r)=>n+r.percent_of_accepted_cohort,0),100);}
   assert.equal(summary.by_reported_state.find(r=>r.state===null).percent_of_accepted_cohort,25);assert.equal(summary.by_reported_state.find(r=>r.state==='MD').candidate_rows,2);assert.equal(summary.by_reported_state.find(r=>r.state==='VA').candidate_rows,1);
   assert.equal(summary.by_reported_zip.find(r=>r.zip5==='01234').candidate_rows,1);assert.equal(summary.by_reported_zip.filter(r=>r.zip5===null).reduce((n,r)=>n+r.candidate_rows,0),2);
   assert.equal(summary.quality.with_zip5,2);assert.equal(summary.quality.with_zip4,0);assert.equal(summary.quality.with_points,1);assert.equal(summary.quality.missing_points,3);assert.equal(summary.quality.state_scope_conflicts,1);
   assert.deepEqual(summary.quality.zip_unavailable_reasons,{'missing-source-zip':1,'invalid-source-zip-range':1});assert.deepEqual(summary.quality.zip4_unavailable_reasons,{'source-zip4-not-provided':4});assert.deepEqual(summary.quality.license_unavailable_reasons,{'missing-source-license':1});
   assert.equal(summary.provenance.publisher_cohort_date,'2026-02-13');assert.equal(summary.provenance.item_modified_at,summary.provenance.source_updated_at);assert.equal(Object.keys(summary.provenance.source_editing_info).length,3);
   assert.equal(summary.provenance.app_receipt_sha256,hash(await readFile(job.receiptPath)));assert.equal(summary.provenance.acquired_manifest_sha256,job.receipt.acquired.manifest_sha256);
   assert.equal(summary.claims.national_completeness_percent,null);assert.equal(summary.claims.unique_active_business_count,null);assert.equal(summary.claims.current_operations_verified,false);assert.equal(summary.claims.credential_deduplication_applied,false);
   assert.equal(JSON.stringify(summary).includes('123 Synthetic Street'),false);assert.equal(JSON.stringify(summary).includes('same-credential'),false);
   const reused=await runMdChildcareAppJob({outputRoot:path.join(root,'reuse'),acquiredManifestPath:job.receipt.acquired.manifest_path});const again=await summarizeMdChildcareAppJob(reused.receiptPath);assert.deepEqual(again.by_reported_zip,summary.by_reported_zip);assert.equal(fixture.calls.length,requests);
   const controller=new AbortController(),pending=summarizeMdChildcareAppJob(job.receiptPath,{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(pending,{name:'AbortError'});
   const manifestPath=job.receipt.normalized.manifest_path,manifestBytes=await readFile(manifestPath),rowsPath=path.join(path.dirname(manifestPath),'normalized.jsonl'),rowsBytes=await readFile(rowsPath),checkpointPath=path.join(path.dirname(job.receiptPath),'normalized.json'),checkpointBytes=await readFile(checkpointPath),receiptBytes=await readFile(job.receiptPath);
   for(const mutate of [rows=>{rows[0].reported_address.state='MD';},rows=>{rows[0].reported_address.zip_code='21201';rows[0].reported_address.postal_code='21201';},rows=>{rows[1].source_record_id=rows[0].source_record_id;},rows=>{rows[0].provenance.publisher_cohort_date='2026-09-08';}]){
    const rows=rowsBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);mutate(rows);const replacement=Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),manifest=JSON.parse(manifestBytes),entry=manifest.artifacts.find(a=>a.path==='normalized.jsonl');entry.bytes=replacement.length;entry.sha256=hash(replacement);const changedManifest=Buffer.from(JSON.stringify(manifest)+'\n'),checkpoint=JSON.parse(checkpointBytes),receipt=JSON.parse(receiptBytes);checkpoint.verification.manifest_sha256=hash(changedManifest);receipt.normalized.manifest_sha256=hash(changedManifest);
    try{await writeFile(rowsPath,replacement);await writeFile(manifestPath,changedManifest);await writeFile(checkpointPath,JSON.stringify(checkpoint)+'\n');await writeFile(job.receiptPath,JSON.stringify(receipt)+'\n');await assert.rejects(summarizeMdChildcareAppJob(job.receiptPath));}
    finally{await writeFile(rowsPath,rowsBytes);await writeFile(manifestPath,manifestBytes);await writeFile(checkpointPath,checkpointBytes);await writeFile(job.receiptPath,receiptBytes);}
   }
   assert.deepEqual(await summarizeMdChildcareAppJob(job.receiptPath),summary);
  }finally{globalThis.fetch=originalFetch;}
 }finally{await rm(root,{recursive:true,force:true});}
});
