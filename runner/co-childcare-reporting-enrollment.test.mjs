import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {loadCoChildcareReportingEnrollment as load,projectCoChildcareStateEvidence as project} from './co-childcare-reporting-enrollment.mjs';
import {runCoChildcareAppJobWithTransport} from './co-childcare-app.mjs';
import {createCoChildcareFixture} from './co-childcare-test-fixtures.mjs';

async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/co-report-enrollment-'));await mkdir(path.join(root,'config'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const binding={schema_version:'co-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/jobs/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};

test('CO enrollment distinguishes absent and unavailable from measured zero and rejects early cancellation',async t=>{
  const root=await fixture(t),original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must remain offline');
  try{
    assert.deepEqual(await load({root}),{status:'not-enrolled'});
    await assert.rejects(load({root,signal:AbortSignal.abort()}));
    await writeFile(path.join(root,'config/co-childcare-reporting-enrollment.json'),JSON.stringify(binding));
    const unavailable=await load({root});assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.reason,'enrolled-receipt-not-installed');
    for(const value of [unavailable,{status:'not-enrolled'}]){const projected=project(value,'CO');assert.equal(projected.candidateRows,undefined);assert.equal(projected.percentOfAcceptedCohort,undefined);}
  }finally{globalThis.fetch=original;}
});

test('CO enrollment rejects a fully verified injected app receipt rather than trusting its pinned hash',async t=>{
  const root=await fixture(t),f=createCoChildcareFixture();
  const app=await runCoChildcareAppJobWithTransport({outputRoot:path.join(root,'data/app'),fetchImpl:f.fetchImpl});
  const raw=await readFile(app.receiptPath);
  await writeFile(path.join(root,'config/co-childcare-reporting-enrollment.json'),JSON.stringify({...binding,app_receipt_path:path.relative(root,app.receiptPath).split(path.sep).join('/'),app_receipt_sha256:createHash('sha256').update(raw).digest('hex')}));
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must not fetch');
  try{await assert.rejects(load({root}),/enrollment rejected/);}finally{globalThis.fetch=original;}
});

test('CO installed native enrollment independently replays retained evidence offline when installed',async t=>{
  let installed;
  try{installed=JSON.parse(await readFile(path.join(APP_ROOT,'config/co-childcare-reporting-enrollment.json'),'utf8'));await lstat(path.join(APP_ROOT,installed.app_receipt_path));}
  catch(error){if(error.code==='ENOENT'){t.skip('Native enrollment or retained receipt not installed; no network fallback.');return;}throw error;}
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must not fetch');
  try{
    const enrollment=await load(),co=project(enrollment,'CO');
    assert.equal(enrollment.status,'available');assert.equal(enrollment.summary.provenance.execution_mode,'fixed-native-fetch');assert.equal(co.appReceiptSha256,installed.app_receipt_sha256);
    assert.equal(co.publisherCohortRows,enrollment.summary.accepted_candidate_rows);assert.ok(co.candidateRows<=co.publisherCohortRows);assert.equal(co.nationalIndustryPercent,null);assert.equal(co.physicalSiteVerified,false);
  }finally{globalThis.fetch=original;}
});

test('CO enrollment rejects malformed options, paths, hashes, aliases and unauthenticated receipt claims',async t=>{
  const root=await fixture(t),file=path.join(root,'config/co-childcare-reporting-enrollment.json');
  for(const options of [null,{root,fetchImpl:()=>{}},{root,signal:{}},{root:'relative-root'}])await assert.rejects(load(options));
  for(const changed of [
    {...binding,schema_version:'co-childcare-reporting-enrollment@2.0.0'},
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

test('CO projection preserves source-row denominators, missing ZIPs, and outside-publisher scope without business claims',()=>{
  const enrolled={status:'available',sourceId:'co-cdec-childcare-centers',publisherJurisdiction:'CO',enrollmentSha256:'a'.repeat(64),summary:{
    accepted_candidate_rows:4,source_candidate_rows:5,quarantined_candidate_rows:1,
    by_reported_state:[{state:'CO',candidate_rows:3,percent_of_accepted_cohort:75},{state:null,candidate_rows:1,percent_of_accepted_cohort:25}],
    by_reported_zip:[{state:'CO',zip5:'06101',candidate_rows:2},{state:'CO',zip5:null,candidate_rows:1},{state:null,zip5:null,candidate_rows:1}],
    quality:{with_zip5:3,with_zip4:1,with_points:0,missing_points:4},
    provenance:{app_receipt_sha256:'b'.repeat(64),app_run_id:'fixture',industry_run_id:'managed',normalized_manifest_sha256:'c'.repeat(64),acquired_manifest_sha256:'d'.repeat(64),observed_at:'2026-09-08T12:00:00.000Z',source_updated_at:'2026-09-07T08:15:33.000Z'},
  }};
  const ct=project(enrolled,'CO');assert.equal(ct.candidateRows,3);assert.equal(ct.publisherCohortRows,4);assert.equal(ct.reportedAddressStateUnavailableRows,1);assert.equal(ct.acceptedCohortRows,4);assert.equal(ct.sourceRows,5);assert.equal(ct.quarantinedRows,1);
  assert.equal(ct.percentOfAcceptedCohort,75);assert.equal(ct.reportedZIP5Count,1);assert.equal(ct.nationalIndustryPercent,null);assert.equal(ct.uniqueActiveBusinessCount,null);
  assert.equal(ct.nationalReportingIntegrated,false);assert.equal(ct.boundaryAssignmentVerified,false);assert.equal(ct.physicalSiteVerified,false);assert.equal(ct.industryRunId,'managed');assert.equal(ct.facilityRows,undefined);assert.equal(ct.qualityScope,'entire-retained-cohort-not-state-filtered');
  assert.deepEqual(project(enrolled,'NY'),{status:'outside-publisher-scope',sourceId:enrolled.sourceId,publisherJurisdiction:'CO'});
  const empty=structuredClone(enrolled);empty.summary.accepted_candidate_rows=0;empty.summary.source_candidate_rows=0;empty.summary.quarantined_candidate_rows=0;empty.summary.by_reported_state=[];empty.summary.by_reported_zip=[];
  assert.equal(project(empty,'CO').candidateRows,0);assert.equal(project(empty,'CO').percentOfAcceptedCohort,null);
});
