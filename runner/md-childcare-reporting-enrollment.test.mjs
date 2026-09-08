import test from 'node:test';
import {runMdChildcareAppJobWithTransport} from './md-childcare-app.mjs';
import {createMdChildcareFixture} from './md-childcare-test-fixtures.mjs';
import {summarizeMdChildcareAppJob} from './md-childcare-reporting.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {loadMdChildcareReportingEnrollment as load,projectMdChildcareStateEvidence as project} from './md-childcare-reporting-enrollment.mjs';

async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/md-report-enrollment-'));await mkdir(path.join(root,'config'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const binding={schema_version:'md-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/jobs/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};

test('MD enrollment distinguishes absent and unavailable from measured zero and rejects early cancellation',async t=>{
  const root=await fixture(t),original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must remain offline');
  try{
    assert.deepEqual(await load({root}),{status:'not-enrolled'});
    await assert.rejects(load({root,signal:AbortSignal.abort()}));
    await writeFile(path.join(root,'config/md-childcare-reporting-enrollment.json'),JSON.stringify(binding));
    const unavailable=await load({root});assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.reason,'enrolled-receipt-not-installed');
    for(const value of [unavailable,{status:'not-enrolled'}]){const projected=project(value,'MD');assert.equal(projected.candidateRows,undefined);assert.equal(projected.percentOfAcceptedCohort,undefined);}
  }finally{globalThis.fetch=original;}
});

test('MD enrollment rejects malformed options, paths, hashes, aliases and unauthenticated receipt claims',async t=>{
  const root=await fixture(t),file=path.join(root,'config/md-childcare-reporting-enrollment.json');
  for(const options of [null,{root,fetchImpl:()=>{}},{root,signal:{}},{root:'relative-root'}])await assert.rejects(load(options));
  for(const changed of [
    {...binding,schema_version:'md-childcare-reporting-enrollment@2.0.0'},
    {...binding,app_receipt_path:'data/../../escape'},
    {...binding,app_receipt_path:'data/./receipt.json'},
    {...binding,app_receipt_path:'data//receipt.json'},
    {...binding,app_receipt_path:'data\\receipt.json'},
    {...binding,app_receipt_sha256:'bad'},
    {...binding,app_receipt_sha256:'A'.repeat(64)},
    {...binding,fetch:'https://example.invalid'},
  ]){await writeFile(file,JSON.stringify(changed));await assert.rejects(load({root}));}
  const directory=path.join(root,'data/jobs/missing');await mkdir(directory,{recursive:true});const receipt=path.join(directory,'receipt.json');
  await writeFile(receipt,'{}');await writeFile(file,JSON.stringify(binding));await assert.rejects(load({root}));
  for(const execution_mode of ['injected-test-transport','retained-local-verification','fixed-native-fetch']){
    const bytes=JSON.stringify({status:'SUCCEEDED',execution_mode});await writeFile(receipt,bytes);
    await writeFile(file,JSON.stringify({...binding,app_receipt_sha256:createHash('sha256').update(bytes).digest('hex')}));
    await assert.rejects(load({root}),'a hash-correct assertion is not independently verified app evidence');
  }
  await symlink(directory,path.join(root,'data/alias'),'junction');
  await writeFile(file,JSON.stringify({...binding,app_receipt_path:'data/alias/receipt.json'}));await assert.rejects(load({root}));
});

test('MD projection preserves source-row denominators, missing ZIPs, and outside-publisher scope without business claims',()=>{
  const enrolled={status:'available',sourceId:'md-msde-childcare-centers',publisherJurisdiction:'MD',enrollmentSha256:'a'.repeat(64),summary:{
    accepted_candidate_rows:4,source_candidate_rows:5,quarantined_candidate_rows:1,
    by_reported_state:[{state:'MD',candidate_rows:3,percent_of_accepted_cohort:75},{state:'NY',candidate_rows:1,percent_of_accepted_cohort:25}],
    by_reported_zip:[{state:'MD',zip5:'06101',candidate_rows:2},{state:'MD',zip5:null,candidate_rows:1},{state:'NY',zip5:'10001',candidate_rows:1}],
    quality:{with_zip5:3,with_zip4:0,with_points:0,missing_points:4},
    provenance:{app_receipt_sha256:'b'.repeat(64),app_run_id:'fixture',industry_run_id:'managed',normalized_manifest_sha256:'c'.repeat(64),acquired_manifest_sha256:'d'.repeat(64),observed_at:'2026-09-08T12:00:00.000Z',source_updated_at:'2026-05-27T18:28:49.000Z',publisher_cohort_date:'2026-02-13',source_editing_info:{lastEditDate:1779911324252,schemaLastEditDate:1779911324252,dataLastEditDate:1779911324252}},
  }};
  const md=project(enrolled,'MD');assert.equal(md.candidateRows,3);assert.equal(md.acceptedCohortRows,4);assert.equal(md.sourceRows,5);assert.equal(md.quarantinedRows,1);
  assert.equal(md.percentOfAcceptedCohort,75);assert.equal(md.reportedZIP5Count,1);assert.equal(md.nationalIndustryPercent,null);assert.equal(md.uniqueActiveBusinessCount,null);
  assert.equal(md.publisherCohortDate,'2026-02-13');assert.deepEqual(md.sourceEditingInfo,enrolled.summary.provenance.source_editing_info);
  assert.equal(md.nationalReportingIntegrated,false);assert.equal(md.boundaryAssignmentVerified,false);assert.equal(md.physicalSiteVerified,false);assert.equal(md.industryRunId,'managed');assert.equal(md.facilityRows,undefined);assert.equal(md.qualityScope,'entire-retained-cohort-not-state-filtered');
  assert.deepEqual(project(enrolled,'NY'),{status:'outside-publisher-scope',sourceId:enrolled.sourceId,publisherJurisdiction:'MD'});
  const empty=structuredClone(enrolled);empty.summary.accepted_candidate_rows=0;empty.summary.source_candidate_rows=0;empty.summary.quarantined_candidate_rows=0;empty.summary.by_reported_state=[];empty.summary.by_reported_zip=[];
  assert.equal(project(empty,'MD').candidateRows,0);assert.equal(project(empty,'MD').percentOfAcceptedCohort,null);
});

test('MD installed native enrollment independently replays retained evidence offline',async t=>{
  const installed=JSON.parse(await readFile(path.join(APP_ROOT,'config/md-childcare-reporting-enrollment.json'),'utf8'));
  try{await lstat(path.join(APP_ROOT,installed.app_receipt_path));}catch(error){if(error.code==='ENOENT'){t.skip('Pinned native MD app receipt is not installed; no network fallback.');return;}throw error;}
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('native retained reporting must not fetch');
  try{
    const enrollment=await load(),md=project(enrollment,'MD');assert.equal(enrollment.status,'available');assert.equal(enrollment.summary.provenance.execution_mode,'fixed-native-fetch');
    assert.equal(md.appReceiptSha256,installed.app_receipt_sha256);assert.equal(md.candidateRows,1772);assert.equal(md.sourceRows,1772);assert.equal(md.acceptedCohortRows,1772);assert.equal(md.quarantinedRows,0);
    assert.ok(md.reportedZIP5Count>0);assert.equal(md.percentOfAcceptedCohort,100);assert.equal(md.nationalIndustryPercent,null);assert.equal(md.physicalSiteVerified,false);
  }finally{globalThis.fetch=original;}
});


test('MD enrollment rejects a fully verified injected app receipt while explicit reporting remains valid',async t=>{
 const root=await fixture(t),f=createMdChildcareFixture();const job=await runMdChildcareAppJobWithTransport({outputRoot:path.join(root,'data/app'),fetchImpl:f.fetchImpl});
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must not fetch');
 try{const summary=await summarizeMdChildcareAppJob(job.receiptPath);await writeFile(path.join(root,'config/md-childcare-reporting-enrollment.json'),JSON.stringify({schema_version:'md-childcare-reporting-enrollment@1.0.0',app_receipt_path:path.relative(root,job.receiptPath).split(path.sep).join('/'),app_receipt_sha256:summary.provenance.app_receipt_sha256}));await assert.rejects(load({root}),/Maryland reporting enrollment rejected/);assert.deepEqual(await summarizeMdChildcareAppJob(job.receiptPath),summary);}finally{globalThis.fetch=original;}
});
