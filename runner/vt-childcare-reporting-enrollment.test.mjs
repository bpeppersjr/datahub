import test from 'node:test';
import {runVtChildcareAppJobWithTransport} from './vt-childcare-app.mjs';
import {createVtChildcareFixture} from './vt-childcare-test-fixtures.mjs';
import {summarizeVtChildcareAppJob} from './vt-childcare-reporting.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {loadVtChildcareReportingEnrollment as load,projectVtChildcarePublisherEvidence as project} from './vt-childcare-reporting-enrollment.mjs';

async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/vt-report-enrollment-'));await mkdir(path.join(root,'config'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
const binding={schema_version:'vt-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/jobs/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};

test('VT reporting CLI rejects overrides and malformed receipt arguments without acquisition',()=>{
 for(const args of [['--url','https://private.invalid'],['--receipt'],['--receipt','relative'],['--receipt',APP_ROOT,'--receipt',APP_ROOT]]){
  const result=spawnSync(process.execPath,['scripts/report-vt-childcare.mjs',...args],{cwd:APP_ROOT,encoding:'utf8',timeout:5000,windowsHide:true});assert.equal(result.status,1);assert.equal(result.stderr.includes('private.invalid'),false);assert.match(result.stderr,/No acquisition was performed/);
 }
});

test('VT enrollment distinguishes absent and unavailable from measured zero and rejects early cancellation',async t=>{
  const root=await fixture(t),original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must remain offline');
  try{
    assert.deepEqual(await load({root}),{status:'not-enrolled'});
    await assert.rejects(load({root,signal:AbortSignal.abort()}));
    await writeFile(path.join(root,'config/vt-childcare-reporting-enrollment.json'),JSON.stringify(binding));
    const unavailable=await load({root});assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.reason,'enrolled-receipt-not-installed');
    for(const value of [unavailable,{status:'not-enrolled'}]){const projected=project(value,'VT');assert.equal(projected.candidateRows,undefined);assert.equal(projected.percentOfAcceptedCohort,undefined);}
  }finally{globalThis.fetch=original;}
});

test('VT enrollment rejects malformed options, paths, hashes, aliases and unauthenticated receipt claims',async t=>{
  const root=await fixture(t),file=path.join(root,'config/vt-childcare-reporting-enrollment.json');
  for(const options of [null,{root,fetchImpl:()=>{}},{root,signal:{}},{root:'relative-root'}])await assert.rejects(load(options));
  for(const changed of [
    {...binding,schema_version:'vt-childcare-reporting-enrollment@2.0.0'},
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

test('VT publisher projection conserves null address states without inventing state coverage',()=>{
 const enrolled={status:'available',sourceId:'vt-cdd-childcare-centers',publisherJurisdiction:'VT',enrollmentSha256:'a'.repeat(64),summary:{
 accepted_candidate_rows:4,source_candidate_rows:5,quarantined_candidate_rows:1,
 by_reported_state:[{state:null,candidate_rows:4,percent_of_accepted_cohort:100}],
 by_reported_zip:[{state:null,zip5:'05001',candidate_rows:3},{state:null,zip5:null,candidate_rows:1}],
 quality:{with_zip5:3,with_zip4:1,with_points:0,missing_points:4},
 provenance:{app_receipt_sha256:'b'.repeat(64),app_run_id:'fixture',industry_run_id:'managed',normalized_manifest_sha256:'c'.repeat(64),acquired_manifest_sha256:'d'.repeat(64),observed_at:'2026-09-08T12:00:00.000Z',source_updated_at:'2026-08-14T16:48:56.000Z',view_last_modified_at:'2026-08-14T16:48:53.000Z',publication_at:'2026-08-13T19:15:21.000Z',reporting_file:'Provider_Report_07012026_08012026.xlsx',reporting_period:null,reporting_period_verified:false}
 }};
 const vt=project(enrolled,'VT');
 assert.equal(vt.publisherCohortRows,4);assert.equal(vt.reportedAddressStateUnavailableRows,4);assert.equal(vt.reportedAddressState,null);assert.equal(vt.evidenceBasis,'publisher-scope-not-reported-address-state');assert.equal(vt.sourceRows,5);assert.equal(vt.quarantinedRows,1);
 assert.equal(vt.percentOfAcceptedCohort,100);assert.equal(vt.distinctReportedZIP5Values,1);assert.equal(vt.rowsWithZIP5,3);assert.equal(vt.rowsWithZIP4,1);assert.equal(vt.nationalIndustryPercent,null);assert.equal(vt.uniqueActiveBusinessCount,null);assert.equal(vt.currentOperationsVerified,false);
 assert.equal(vt.reportingPeriod,null);assert.equal(vt.reportingPeriodVerified,false);assert.equal(vt.reportingFile,enrolled.summary.provenance.reporting_file);assert.equal(vt.sourceUpdatedAt,enrolled.summary.provenance.source_updated_at);assert.equal(vt.viewLastModifiedAt,enrolled.summary.provenance.view_last_modified_at);assert.equal(vt.publicationAt,enrolled.summary.provenance.publication_at);
 assert.equal(vt.candidateRows,undefined);assert.equal(vt.physicalSiteVerified,false);assert.equal(vt.nationalReportingIntegrated,false);
 assert.deepEqual(project(enrolled,'NY'),{status:'outside-publisher-scope',sourceId:enrolled.sourceId,publisherJurisdiction:'VT'});
 for(const mutate of [s=>{s.by_reported_state[0].state='VT';},s=>{s.by_reported_zip[0].state='VT';},s=>{s.provenance.reporting_period='2026-07';},s=>{s.quality.with_points=4;},s=>{s.by_reported_zip[0].candidate_rows=2;}]){const changed=structuredClone(enrolled);mutate(changed.summary);assert.throws(()=>project(changed,'VT'));}
 const empty=structuredClone(enrolled);Object.assign(empty.summary,{accepted_candidate_rows:0,source_candidate_rows:0,quarantined_candidate_rows:0,by_reported_state:[],by_reported_zip:[],quality:{with_zip5:0,with_zip4:0,with_points:0,missing_points:0}});assert.equal(project(empty,'VT').percentOfAcceptedCohort,null);
});
test('VT installed native enrollment independently replays retained evidence offline',async t=>{
  let installed;try{installed=JSON.parse(await readFile(path.join(APP_ROOT,'config/vt-childcare-reporting-enrollment.json'),'utf8'));}catch(error){if(error.code==='ENOENT'){t.skip('Native VT enrollment not installed; no network fallback.');return;}throw error;}
  try{await lstat(path.join(APP_ROOT,installed.app_receipt_path));}catch(error){if(error.code==='ENOENT'){t.skip('Pinned native VT app receipt is not installed; no network fallback.');return;}throw error;}
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('native retained reporting must not fetch');
  try{
    const enrollment=await load(),md=project(enrollment,'VT');assert.equal(enrollment.status,'available');assert.equal(enrollment.summary.provenance.execution_mode,'fixed-native-fetch');
    assert.equal(md.appReceiptSha256,installed.app_receipt_sha256);assert.equal(md.publisherCohortRows,503);assert.equal(md.sourceRows,503);assert.equal(md.acceptedCohortRows,503);assert.equal(md.quarantinedRows,0);
    assert.ok(md.distinctReportedZIP5Values>0);assert.equal(md.percentOfAcceptedCohort,100);assert.equal(md.nationalIndustryPercent,null);assert.equal(md.physicalSiteVerified,false);
  }finally{globalThis.fetch=original;}
});


test('VT enrollment rejects a fully verified injected app receipt while explicit reporting remains valid',async t=>{
 const root=await fixture(t),f=createVtChildcareFixture();const job=await runVtChildcareAppJobWithTransport({outputRoot:path.join(root,'data/app'),fetchImpl:f.fetchImpl});
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('enrollment must not fetch');
 try{const summary=await summarizeVtChildcareAppJob(job.receiptPath);await writeFile(path.join(root,'config/vt-childcare-reporting-enrollment.json'),JSON.stringify({schema_version:'vt-childcare-reporting-enrollment@1.0.0',app_receipt_path:path.relative(root,job.receiptPath).split(path.sep).join('/'),app_receipt_sha256:summary.provenance.app_receipt_sha256}));await assert.rejects(load({root}),/Vermont reporting enrollment rejected/);assert.deepEqual(await summarizeVtChildcareAppJob(job.receiptPath),summary);}finally{globalThis.fetch=original;}
});
