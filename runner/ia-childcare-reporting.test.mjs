import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,readdir,unlink,rmdir,rm,readFile,writeFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {runIaChildcareAppJobWithTransport} from './ia-childcare-app.mjs';
import {IA_CHILDCARE_URLS as U,IA_CHILDCARE_TEST_CLIENT as client} from './ia-childcare-acquisition.mjs';
import {IA_CHILDCARE_ACQUIRED_TEST_ROOT} from './ia-childcare-acquired.mjs';
import {summarizeIaChildcareAppJob as summarize} from './ia-childcare-reporting.mjs';
const center=extra=>({businessType:'building',businessName:'Test center',address:'1 Test',city:'Test',zipCode:50301,latitude:41,longitude:-93,referral:false,...extra});
test('Iowa reporting reconciles duplicates, quarantine, ZIP/point gaps and full source bindings offline',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ia-reporting-test-'));let app;
  try{
    const rows=[{businessType:'home',businessName:'PRIVATE_HOME'},center(),center(),center({zipCode:null,latitude:null}),center({businessName:'PRIVATE_BAD\u0001'})];
    app=await runIaChildcareAppJobWithTransport({outputRoot:root,industryRunId:'reporting-test',fetchImpl:async url=>new Response(url===U.client?client:JSON.stringify(rows))});
    const previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('reporting must remain offline');
    let result;try{result=await summarize(app.receiptPath);}finally{globalThis.fetch=previous;}
    assert.equal(result.source_candidate_rows,4);assert.equal(result.source_response_rows,5);assert.equal(result.excluded_source_rows,1);assert.equal(result.duplicate_selected_rows,1);assert.equal(result.accepted_candidate_rows,3);assert.equal(result.quarantined_candidate_rows,1);
    assert.deepEqual(result.by_reported_state,[{state:null,candidate_rows:3,percent_of_accepted_cohort:100}]);
    assert.equal(result.by_reported_zip.reduce((n,row)=>n+row.candidate_rows,0),3);assert.equal(result.by_reported_zip.find(row=>row.zip5==='50301').candidate_rows,2);
    assert.equal(result.quality.with_points,2);assert.equal(result.quality.missing_points,1);assert.equal(result.quality.with_unverified_point_accuracy,2);assert.equal(result.quality.with_zip4,0);assert.equal(result.provenance.source_updated_at,null);assert.equal(result.provenance.execution_mode,'injected-test-transport');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.equal(result.claims.unique_active_business_count,null);assert.equal(result.claims.national_completeness_percent,null);
    await assert.rejects(summarize(app.receiptPath,{signal:AbortSignal.abort('PRIVATE')}),/reporting rejected/);
    const controller=new AbortController(),pending=summarize(app.receiptPath,{signal:controller.signal});controller.abort();await assert.rejects(pending,/reporting rejected/);
    const raw=await readFile(app.receiptPath);const changed=JSON.parse(raw);changed.claims.current_operations_verified=true;await writeFile(app.receiptPath,JSON.stringify(changed));await assert.rejects(summarize(app.receiptPath),/reporting rejected/);await writeFile(app.receiptPath,raw);
  }finally{
    if(app){const directory=path.dirname(app.receipt.acquired.manifest_path);assert.equal(path.dirname(directory),IA_CHILDCARE_ACQUIRED_TEST_ROOT);for(const name of await readdir(directory))await unlink(path.join(directory,name));await rmdir(directory);}
    assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});
  }
});
test('Iowa reporting rejects unsupported options and missing receipt without source access',async()=>{
  for(const options of [null,{signal:1},{fetchImpl:()=>{}},{root:APP_ROOT}])await assert.rejects(summarize('missing',options),/reporting rejected/);
  await assert.rejects(summarize(path.join(APP_ROOT,'data/tmp/nonexistent-ia-receipt.json')),/reporting rejected/);
});
test('Iowa installed native retained reporting conserves 1476 rows and 404 ZIP5 values',{skip:process.env.DATAHUB_TEST_IA_REPORTING!=='1'},async()=>{
  const receipt=path.join(APP_ROOT,'data/industry-segments/runs/8681405a-0034-435a-bbe9-96263816381d/state-ia-childcare-centers-IA/jobs/f2086679-2638-4fef-8749-42ae95979e7d/receipt.json');
  const result=await summarize(receipt);assert.equal(result.provenance.app_receipt_sha256,'949da3f49aa4e7e8469114ce926a9cdd82762c66c8156afde8f77865f7f799ec');
  assert.equal(result.accepted_candidate_rows,1476);assert.equal(result.by_reported_zip.filter(row=>row.zip5!==null).length,404);assert.equal(result.provenance.execution_mode,'fixed-native-fetch');
});
