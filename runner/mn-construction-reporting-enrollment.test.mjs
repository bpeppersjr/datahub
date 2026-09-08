import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { loadMnConstructionReportingEnrollment as load, projectMnConstructionStateEvidence as project } from './mn-construction-reporting-enrollment.mjs';
async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/mn-report-enrollment-'));await mkdir(path.join(root,'config'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const binding={schema_version:'mn-construction-reporting-enrollment@1.0.0',app_receipt_path:'data/jobs/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};
test('MN reporting distinguishes absent enrollment from unavailable pinned data without source requests',async t=>{
  const root=await fixture(t);assert.deepEqual(await load({root}),{status:'not-enrolled'});
  await writeFile(path.join(root,'config/mn-construction-reporting-enrollment.json'),JSON.stringify(binding));const result=await load({root});
  assert.equal(result.status,'unavailable');assert.equal(result.reason,'enrolled-receipt-not-installed');assert.equal(project(result,'MN').credentialRows,undefined);
});
test('MN reporting enrollment rejects escaping paths, malformed pins and extra configuration',async t=>{
  const root=await fixture(t),file=path.join(root,'config/mn-construction-reporting-enrollment.json');
  for(const changed of [{...binding,app_receipt_path:'data/../../escape'},{...binding,app_receipt_sha256:'wrong'},{...binding,fetch:'https://example.com'}]){
    await writeFile(file,JSON.stringify(changed));await assert.rejects(load({root}));
  }
});
test('MN local state evidence uses cohort denominator and does not invent state publishers or businesses',()=>{
  const enrolled={status:'available',sourceId:'mn-dli-residential-contractors',publisherJurisdiction:'MN',enrollmentSha256:'a'.repeat(64),summary:{accepted_credential_rows:4,by_reported_state:[{state:'MN',credential_rows:3,percent_of_this_accepted_cohort:75},{state:'WI',credential_rows:1,percent_of_this_accepted_cohort:25}],provenance:{app_receipt_sha256:'b'.repeat(64),source_release_id:'fixture',observed_at:'2026-09-08T12:00:00.000Z'}}};
  const wi=project(enrolled,'WI');assert.equal(wi.publisherJurisdiction,'MN');assert.equal(wi.credentialRows,1);assert.equal(wi.percentOfAcceptedCohort,25);assert.equal(wi.uniqueActiveBusinessCount,null);assert.equal(wi.physicalSiteCount,null);assert.equal(wi.nationalReportingIntegrated,false);
  assert.equal(project(enrolled,'AL').credentialRows,0);assert.equal(project({status:'not-enrolled'},'AL').credentialRows,undefined);
});
