import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {runCtChildcareAppJobWithTransport,runCtChildcareAppJob} from './ct-childcare-app.mjs';
import {summarizeCtChildcareAppJob} from './ct-childcare-reporting.mjs';
import {loadCtChildcareReportingEnrollment} from './ct-childcare-reporting-enrollment.mjs';
import {createCtChildcareFixture} from './ct-childcare-test-fixtures.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
test('CT reporting rejects unsupported options and pre-abort',async()=>{
 await assert.rejects(summarizeCtChildcareAppJob('missing',{signal:AbortSignal.abort()}),{name:'AbortError'});await assert.rejects(summarizeCtChildcareAppJob('missing',{nationalTotal:1000}));
});
test('CT reporting conserves nullable reported geography and duplicate credentials entirely offline',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ct-reporting-test-'));
 try{
  const fixture=createCtChildcareFixture({count:3,mutate:(rows,kind)=>{
   if(kind==='aggregate')rows[0].zip_count='2';
   if(kind==='page'){rows[0].zipcode=null;rows[0].statecode=null;rows[0].maximumcapacity='invalid';rows[1].zipcode='06103-0042';rows[1].maximumcapacity='25';rows[2].maximumcapacity='25';}
  }});
  const job=await runCtChildcareAppJobWithTransport({outputRoot:path.join(root,'data','app'),fetchImpl:fixture.fetchImpl});const requests=fixture.calls.length;
  const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Reporting must not fetch');
  try{
   const summary=await summarizeCtChildcareAppJob(job.receiptPath);
   assert.equal(summary.source_candidate_rows,3);assert.equal(summary.accepted_candidate_rows,3);assert.equal(summary.quarantined_candidate_rows,0);assert.equal(summary.distinct_source_credentials,2);assert.equal(summary.distinct_accepted_credentials,2);
   for(const group of [summary.by_reported_state,summary.by_reported_zip])assert.equal(group.reduce((n,r)=>n+r.candidate_rows,0),3);
   assert.equal(summary.by_reported_state.find(r=>r.state===null).candidate_rows,1);assert.equal(summary.by_reported_state.find(r=>r.state==='CT').candidate_rows,2);
   assert.equal(summary.by_reported_zip.find(r=>r.zip5===null).candidate_rows,1);assert.equal(summary.by_reported_zip.find(r=>r.zip5==='06103').candidate_rows,2);
   assert.equal(summary.provenance.app_receipt_sha256,hash(await readFile(job.receiptPath)));assert.equal(summary.provenance.acquired_manifest_sha256,job.receipt.acquired.manifest_sha256);assert.equal(summary.provenance.normalized_manifest_sha256,job.receipt.normalized.manifest_sha256);
   assert.equal(summary.claims.national_completeness_percent,null);assert.equal(summary.claims.unique_active_business_count,null);assert.equal(summary.claims.public_export_authorized,false);
   assert.equal(summary.claims.capacity_summation_applied,false);assert.equal(summary.claims.credential_deduplication_applied,false);assert.equal(summary.claims.physical_site_verified,false);
   await mkdir(path.join(root,'config'));await writeFile(path.join(root,'config/ct-childcare-reporting-enrollment.json'),JSON.stringify({schema_version:'ct-childcare-reporting-enrollment@1.0.0',app_receipt_path:path.relative(root,job.receiptPath).split(path.sep).join('/'),app_receipt_sha256:summary.provenance.app_receipt_sha256})+'\n');
   await assert.rejects(loadCtChildcareReportingEnrollment({root}),/Connecticut reporting enrollment rejected/);assert.deepEqual(await summarizeCtChildcareAppJob(job.receiptPath),summary);
   assert.equal(summary.quality.with_zip5,2);assert.equal(summary.quality.with_zip4,1);assert.equal(summary.quality.with_points,0);assert.equal(summary.quality.missing_points,3);
   assert.deepEqual(summary.quality.address_unavailable_reasons,{'missing-source-address':1});assert.deepEqual(summary.quality.state_unavailable_reasons,{'missing-source-state':1});assert.deepEqual(summary.quality.zip_unavailable_reasons,{'missing-source-zip':1});
   assert.deepEqual(summary.quality.capacity_unavailable_counts,{capacityunder3:3,maximumcapacity:1,regularcapacity:3,schoolagecapacity:3});
   assert.equal(JSON.stringify(summary).includes('123 Synthetic Street'),false);assert.equal(JSON.stringify(summary).includes('Synthetic center'),false);assert.equal(JSON.stringify(summary).includes('06103-0042'),false);
   const reused=await runCtChildcareAppJob({outputRoot:path.join(root,'reuse'),acquiredManifestPath:job.receipt.acquired.manifest_path});const again=await summarizeCtChildcareAppJob(reused.receiptPath);assert.deepEqual(again.by_reported_zip,summary.by_reported_zip);assert.equal(again.accepted_candidate_rows,3);assert.equal(fixture.calls.length,requests);
   const manifestPath=job.receipt.normalized.manifest_path,manifestBytes=await readFile(manifestPath),rowsPath=path.join(path.dirname(manifestPath),'normalized.jsonl'),rowsBytes=await readFile(rowsPath),checkpointPath=path.join(path.dirname(job.receiptPath),'normalized.json'),checkpointBytes=await readFile(checkpointPath),receiptBytes=await readFile(job.receiptPath);
   for(const mutate of [rows=>{rows[0].reported_address.state='CT';},rows=>{rows[0].reported_address.zip_code='06103';rows[0].reported_address.postal_code='06103';},rows=>{rows[1].source_record_id=rows[0].source_record_id;}]){
    const rows=rowsBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);mutate(rows);const replacement=Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),manifest=JSON.parse(manifestBytes),entry=manifest.artifacts.find(a=>a.path==='normalized.jsonl');entry.bytes=replacement.length;entry.sha256=hash(replacement);const changedManifest=Buffer.from(JSON.stringify(manifest)+'\n'),checkpoint=JSON.parse(checkpointBytes),receipt=JSON.parse(receiptBytes);checkpoint.verification.manifest_sha256=hash(changedManifest);receipt.normalized.manifest_sha256=hash(changedManifest);
    try{await writeFile(rowsPath,replacement);await writeFile(manifestPath,changedManifest);await writeFile(checkpointPath,JSON.stringify(checkpoint)+'\n');await writeFile(job.receiptPath,JSON.stringify(receipt)+'\n');await assert.rejects(summarizeCtChildcareAppJob(job.receiptPath));}
    finally{await writeFile(rowsPath,rowsBytes);await writeFile(manifestPath,manifestBytes);await writeFile(checkpointPath,checkpointBytes);await writeFile(job.receiptPath,receiptBytes);}
   }
   assert.deepEqual(await summarizeCtChildcareAppJob(job.receiptPath),summary);
  }finally{globalThis.fetch=originalFetch;}
 }finally{await rm(root,{recursive:true,force:true});}
});
