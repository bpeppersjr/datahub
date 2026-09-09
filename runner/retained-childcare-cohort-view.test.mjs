import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {buildRetainedChildcareCohortView as build,projectRetainedChildcareCohortView as project,validateRetainedChildcareCohortView as validateView} from './retained-childcare-cohort-view.mjs';

const states=['PA','CT','MD','VT','CO','UT','IA'];
const missing=()=>Object.fromEntries(states.map(state=>[state,{status:'not-enrolled'}]));
function availableCt(){
  const inputs=missing();inputs.CT={status:'available',sourceId:'ct-oec-childcare-centers',publisherJurisdiction:'CT',enrollmentSha256:'a'.repeat(64),summary:{
    schema_version:'ct-childcare-reporting@1.0.0',source_id:'ct-oec-childcare-centers',publisher_scope:'CT',source_candidate_rows:4,accepted_candidate_rows:3,quarantined_candidate_rows:1,
    by_reported_state:[{state:'CT',candidate_rows:2,percent_of_accepted_cohort:200/3},{state:null,candidate_rows:1,percent_of_accepted_cohort:100/3}],
    by_reported_zip:[{state:'CT',zip5:'06001',candidate_rows:2,percent_of_accepted_cohort:200/3},{state:null,zip5:null,candidate_rows:1,percent_of_accepted_cohort:100/3}],
    quality:{with_zip5:2,with_zip4:1,with_points:0,missing_points:3},
    provenance:{app_receipt_sha256:'b'.repeat(64),normalized_manifest_sha256:'c'.repeat(64),acquired_manifest_sha256:'d'.repeat(64),observed_at:'2026-09-09T00:00:00.000Z',source_updated_at:null,app_run_id:'test',industry_run_id:null,execution_mode:'fixed-native-fetch'},
    claims:{export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,public_export_authorized:false,identity_matching_applied:false,denominator:'accepted source cohort rows; not all businesses',row_unit:'source-candidate-row'},
  }};return inputs;
}
test('source comparison preserves unknown address state and validates per-state ZIP conservation',()=>{
  const inputs=availableCt(),view=project(inputs),row=view.cohorts.CT[0];
  assert.equal(row.accepted_candidate_rows,3);assert.equal(row.quarantined_candidate_rows,1);assert.equal(row.by_reported_state.find(r=>r.state===null).candidate_rows,1);
  assert.equal(view.claims.evidence_verification,'supplied-enrollment-structure-only');
  inputs.CT.summary.quality.with_zip5=0;assert.equal(row.quality.with_zip5,2);
  for(const mutate of [
    s=>s.source_candidate_rows++,
    s=>{s.by_reported_zip[0].state=null;s.by_reported_zip[1].state='CT';},
    s=>s.by_reported_zip.push({...s.by_reported_zip[0]}),
    s=>s.by_reported_state[0].percent_of_accepted_cohort=100,
    s=>s.quality.with_points=1,
    s=>s.claims.national_reporting_integrated=true,
    s=>s.provenance.execution_mode='injected-test-transport',
  ]){const changed=availableCt();mutate(changed.CT.summary);assert.throws(()=>project(changed));}
});
test('persisted view validator checks structure without claiming fresh source replay',()=>{
  const view=project(availableCt());assert.deepEqual(validateView(view),view);
  const recorded=structuredClone(view);recorded.claims.evidence_verification='source-specific-retained-enrollment-replay';recorded.claims.artifact_verification_performed=true;
  assert.deepEqual(validateView(recorded),recorded);
  for(const mutate of [v=>v.claims.national_completeness_percent=100,v=>v.cohorts.CT[0].accepted_candidate_rows++,v=>v.cohorts.IA[0].accepted_candidate_rows=0,v=>v.cohorts.CT[0].denominator='all businesses',v=>v.cohorts.CT[0].by_reported_zip[0].extra=true,v=>v.claims.evidence_verification='invented']){
    const altered=structuredClone(view);mutate(altered);assert.throws(()=>validateView(altered));
  }
});
test('accepted credential metrics cannot exceed accepted rows or lose duplicate accounting',()=>{
  const inputs=availableCt(),s=inputs.CT.summary;s.distinct_source_credentials=4;s.distinct_accepted_credentials=3;
  assert.equal(project(inputs).cohorts.CT[0].source_metrics.distinct_accepted_credentials,3);
  s.distinct_accepted_credentials=4;assert.throws(()=>project(inputs));
  s.distinct_accepted_credentials=3;s.distinct_source_credentials=2;assert.throws(()=>project(inputs));
  const md=availableCt(),entry=md.CT;delete md.CT;md.CT={status:'not-enrolled'};md.MD=entry;
  entry.sourceId='md-msde-childcare-centers';entry.publisherJurisdiction='MD';
  Object.assign(entry.summary,{schema_version:'md-childcare-reporting@1.0.0',source_id:entry.sourceId,publisher_scope:'MD',distinct_accepted_license_ids:2,accepted_rows_with_license:3,repeated_accepted_license_rows:1});
  assert.equal(project(md).cohorts.MD[0].source_metrics.accepted_rows_with_license,3);
  entry.summary.repeated_accepted_license_rows=0;assert.throws(()=>project(md));
});

test('retained comparison keeps all seven source gaps without manufacturing zero counts',()=>{
  const inputs=missing();inputs.IA={status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:'a'.repeat(64)};
  const view=project(inputs);assert.equal(view.schema_version,'retained-childcare-cohort-view@1.0.0');
  assert.deepEqual(Object.keys(view.cohorts).sort(),states.toSorted());
  for(const [state,rows] of Object.entries(view.cohorts)){
    assert.equal(rows.length,1);assert.equal(rows[0].publisher_scope,state);assert.equal(rows[0].status,state==='IA'?'unavailable':'not-enrolled');
    assert.equal(rows[0].accepted_candidate_rows,undefined);
  }
});
test('retained comparison rejects unknown, omitted and accessor enrollment inputs',()=>{
  for(const value of [null,{},[],{...missing(),XX:{status:'not-enrolled'}},{...missing(),IA:{status:'verified'}},Object.defineProperty(missing(),'IA',{get(){throw Error('private');}})])assert.throws(()=>project(value));
});
test('retained builder remains offline, validates options and distinguishes unavailable from not-enrolled',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/retained-cohort-test-')),original=globalThis.fetch;
  globalThis.fetch=()=>assert.fail('no source requests');
  try{
    const expected=structuredClone(project(missing()));expected.claims.evidence_verification='source-specific-retained-enrollment-replay';
    assert.deepEqual(await build({root}),expected);
    await mkdir(path.join(root,'config'));
    await writeFile(path.join(root,'config/ia-childcare-reporting-enrollment.json'),JSON.stringify({schema_version:'ia-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)}));
    assert.equal((await build({root})).cohorts.IA[0].status,'unavailable');
    for(const options of [null,{root,url:'private'},{root,signal:{}},{root:'relative'},Object.create({root})])await assert.rejects(build(options));
    await assert.rejects(build({root,signal:AbortSignal.abort()}));
    await writeFile(path.join(root,'config/ia-childcare-reporting-enrollment.json'),'{}');await assert.rejects(build({root}));
  }finally{globalThis.fetch=original;assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});
test('retained comparison CLI help and rejected arguments expose no caller values',()=>{
  const options={cwd:APP_ROOT,encoding:'utf8',windowsHide:true,stdio:'pipe'},script='scripts/report-retained-childcare-cohorts.mjs';
  assert.match(execFileSync(process.execPath,[script,'--help'],options),/no downloads/);
  assert.throws(()=>execFileSync(process.execPath,[script,'--private','secret-value'],options),e=>e.status===1&&!String(e.stderr).includes('secret-value'));
});
test('installed seven-source view retains separate counts and source clocks offline',{skip:process.env.DATAHUB_TEST_RETAINED_COHORTS!=='1'},async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('no source access');
  try{
    const view=await build(),expected={PA:4995,CT:1390,MD:1772,VT:503,CO:1648,UT:422,IA:1476};
    assert.deepEqual(validateView(view),view);
    for(const [state,count] of Object.entries(expected)){
      const row=view.cohorts[state][0];assert.equal(row.status,'available');assert.equal(row.accepted_candidate_rows,count);
      assert.equal(row.by_reported_state.reduce((n,r)=>n+r.candidate_rows,0),count);assert.equal(row.by_reported_zip.reduce((n,r)=>n+r.candidate_rows,0),count);
      assert.match(row.provenance.app_receipt_sha256,/^[a-f0-9]{64}$/);assert.equal(row.source_claims.national_completeness_percent,null);
      if(['VT','IA'].includes(state))assert.ok(row.by_reported_state.every(r=>r.state===null));
    }
    assert.equal(view.cohorts.IA[0].provenance.observed_at,'2026-09-09T02:14:36.039Z');
    assert.notEqual(view.cohorts.UT[0].provenance.observed_at,view.cohorts.UT[0].provenance.adoption_finished_at);
    assert.equal(view.cohorts.PA[0].source_row_unit,'publisher-listed-facility-row');
  }finally{globalThis.fetch=original;}
});
