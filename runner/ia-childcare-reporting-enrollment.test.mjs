import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {loadIaChildcareReportingEnrollment as load,projectIaChildcarePublisherEvidence as project} from './ia-childcare-reporting-enrollment.mjs';

const binding={schema_version:'ia-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};
test('Iowa enrollment distinguishes absent evidence from zero and rejects invalid bindings',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ia-enrollment-test-'));
  try{
    await mkdir(path.join(root,'config'));const file=path.join(root,'config/ia-childcare-reporting-enrollment.json');
    assert.deepEqual(await load({root}),{status:'not-enrolled'});
    await writeFile(file,JSON.stringify(binding));const missing=await load({root});
    assert.equal(missing.status,'unavailable');assert.equal(project(missing,'IA').publisherCohortRows,undefined);
    for(const options of [null,{root,url:'private'},{root,signal:{}},{root:'relative'},Object.create({root})])await assert.rejects(load(options));
    await assert.rejects(load({root,signal:AbortSignal.abort()}));
    for(const changed of [{...binding,extra:true},{...binding,app_receipt_sha256:'bad'},...['data/../escape','data\\receipt.json','data/file:stream','data//receipt.json'].map(app_receipt_path=>({...binding,app_receipt_path}))]){
      await writeFile(file,JSON.stringify(changed));await assert.rejects(load({root}));
    }
    await mkdir(path.join(root,'data/missing'),{recursive:true});await writeFile(path.join(root,binding.app_receipt_path),'{}');
    await writeFile(file,JSON.stringify(binding));await assert.rejects(load({root}));
  }finally{assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});

const fixture=()=>({status:'available',sourceId:'ia-childcare-centers',publisherJurisdiction:'IA',summary:{
  source_candidate_rows:4,source_response_rows:6,excluded_source_rows:2,duplicate_selected_rows:1,accepted_candidate_rows:3,quarantined_candidate_rows:1,
  by_reported_state:[{state:null,candidate_rows:3,percent_of_accepted_cohort:100}],
  by_reported_zip:[{state:null,zip5:'50301',candidate_rows:2,percent_of_accepted_cohort:100*2/3},{state:null,zip5:null,candidate_rows:1,percent_of_accepted_cohort:100/3}],
  quality:{with_zip5:2,with_zip4:0,with_points:2,missing_points:1},
  provenance:{source_updated_at:null,observed_at:'2026-09-09T02:14:36.039Z',processed_at:'2026-09-09T02:14:38.000Z'},
}});
test('Iowa projection conserves publisher cohort without inferring address state or national completeness',()=>{
  const value=fixture(),evidence=project(value,'IA');
  assert.equal(evidence.publisherCohortRows,3);assert.equal(evidence.sourceResponseRows,6);assert.equal(evidence.quarantinedRows,1);
  assert.equal(evidence.reportedAddressState,null);assert.equal(evidence.reportedAddressStateUnavailableRows,3);
  assert.equal(evidence.distinctReportedZIP5Values,1);assert.equal(evidence.nationalIndustryPercent,null);assert.equal(evidence.uniqueActiveBusinessCount,null);
  assert.notEqual(evidence.observedAt,evidence.processedAt);assert.equal(project(value,'UT').status,'outside-publisher-scope');
  for(const mutate of [s=>s.source_response_rows++,s=>s.by_reported_state[0].state='IA',s=>s.by_reported_zip[0].percent_of_accepted_cohort=100,s=>s.quality.with_points++,s=>s.quality.with_zip4=1,s=>s.provenance.source_updated_at='inferred']){
    const changed=fixture();mutate(changed.summary);assert.throws(()=>project(changed,'IA'));
  }
});
test('Iowa installed enrollment verifies retained native evidence offline',{skip:process.env.DATAHUB_TEST_IA_REPORTING!=='1'},async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('no source access');
  try{
    const enrollment=await load(),evidence=project(enrollment,'IA');
    assert.equal(enrollment.status,'available');assert.equal(evidence.publisherCohortRows,1476);assert.equal(evidence.distinctReportedZIP5Values,404);
    assert.equal(evidence.sourceResponseRows,3201);assert.equal(evidence.excludedSourceRows,1725);assert.equal(evidence.rowsWithSourcePoints,1476);assert.equal(evidence.rowsWithZIP4,0);
    assert.equal(evidence.observedAt,'2026-09-09T02:14:36.039Z');assert.equal(evidence.appReceiptSha256,'949da3f49aa4e7e8469114ce926a9cdd82762c66c8156afde8f77865f7f799ec');
  }finally{globalThis.fetch=original;}
});
test('Iowa CLI help and invalid options remain offline and redact supplied values',()=>{
  const options={cwd:APP_ROOT,encoding:'utf8',windowsHide:true,stdio:'pipe'};
  assert.match(execFileSync(process.execPath,['scripts/report-ia-childcare.mjs','--help'],options),/no downloads/);
  assert.throws(()=>execFileSync(process.execPath,['scripts/report-ia-childcare.mjs','--private','secret-value'],options),e=>e.status===1&&!String(e.stderr).includes('secret-value'));
});
