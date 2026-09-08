import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {loadPaChildcareReportingEnrollment as load,projectPaChildcareStateEvidence as project} from './pa-childcare-reporting-enrollment.mjs';
async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/pa-report-enrollment-'));await mkdir(path.join(root,'config'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const binding={schema_version:'pa-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/jobs/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};
test('PA reporting distinguishes absent enrollment, missing local data, and early cancellation without fetching',async t=>{
  const root=await fixture(t),original=globalThis.fetch;globalThis.fetch=()=>assert.fail('reporting must not fetch');
  try{assert.deepEqual(await load({root}),{status:'not-enrolled'});await assert.rejects(load({root,signal:AbortSignal.abort()}));
    await writeFile(path.join(root,'config/pa-childcare-reporting-enrollment.json'),JSON.stringify(binding));const value=await load({root});
    assert.equal(value.status,'unavailable');assert.equal(value.reason,'enrolled-receipt-not-installed');assert.equal(project(value,'PA').facilityRows,undefined);
  }finally{globalThis.fetch=original;}
});
test('PA reporting enrollment rejects escaping paths, malformed pins, injected options, aliases and mismatched bytes',async t=>{
  const root=await fixture(t),file=path.join(root,'config/pa-childcare-reporting-enrollment.json');
  for(const changed of [{...binding,app_receipt_path:'data/../../escape'},{...binding,app_receipt_path:'data/./receipt.json'},{...binding,app_receipt_path:'data//receipt.json'},{...binding,app_receipt_sha256:'bad'},{...binding,fetch:'https://example.com'}]){await writeFile(file,JSON.stringify(changed));await assert.rejects(load({root}));}
  const directory=path.join(root,'data/jobs/missing');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'receipt.json'),'{}');await writeFile(file,JSON.stringify(binding));await assert.rejects(load({root}));
  await symlink(path.join(root,'data'),path.join(root,'alias'),'junction');await writeFile(file,JSON.stringify({...binding,app_receipt_path:'data/../alias/jobs/missing/receipt.json'}));await assert.rejects(load({root}));
});
test('PA local state projection distinguishes cohort percentages from national coverage and outside scope',()=>{
  const enrolled={status:'available',sourceId:'pa-dhs-childcare-centers',enrollmentSha256:'a'.repeat(64),summary:{accepted_facility_rows:4,source_rows:5,quarantined_rows:1,by_reported_state:[{state:'PA',facility_rows:4,percent_of_accepted_cohort:100}],by_reported_zip:[{state:'PA',zip5:'17101',facility_rows:3},{state:'PA',zip5:null,facility_rows:1}],quality:{with_zip5:3,with_zip4:1,with_points:2,missing_points:2,capacity_unavailable:1},provenance:{app_receipt_sha256:'b'.repeat(64),app_run_id:'fixture',industry_run_id:'managed',normalized_manifest_sha256:'c'.repeat(64),acquired_manifest_sha256:'d'.repeat(64),observed_at:'2026-09-08T12:00:00.000Z',source_updated_at:'2026-08-13T00:00:00.000Z'}}};
  const pa=project(enrolled,'PA');assert.equal(pa.facilityRows,4);assert.equal(pa.percentOfAcceptedCohort,100);assert.equal(pa.reportedZIP5Count,1);assert.equal(pa.nationalIndustryPercent,null);assert.equal(pa.uniqueActiveBusinessCount,null);assert.equal(pa.nationalReportingIntegrated,false);assert.equal(pa.boundaryAssignmentVerified,false);assert.equal(pa.industryRunId,'managed');
  assert.deepEqual(project(enrolled,'NC'),{status:'outside-publisher-scope',sourceId:'pa-dhs-childcare-centers',publisherJurisdiction:'PA'});assert.equal(project({status:'not-enrolled'},'PA').facilityRows,undefined);
});
