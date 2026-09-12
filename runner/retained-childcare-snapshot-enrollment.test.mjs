import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {loadRetainedChildcareSnapshotEnrollment as load} from './retained-childcare-snapshot-enrollment.mjs';
const id='bafb683b-f4ae-4355-983a-d2a3c85e7d9b',run='ef5c1cef-a2c2-4854-9092-7e1e60e409ea';
const binding={schema_version:'retained-childcare-snapshot-enrollment@1.0.0',operation_id:id,operation_receipt_sha256:'a'.repeat(64)};
test('snapshot enrollment treats missing artifacts as unavailable, not zero',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/snapshot-enrollment-test-'));
  try{
    assert.deepEqual(await load({root}),{status:'not-enrolled'});await mkdir(path.join(root,'config'));
    const config=path.join(root,'config/retained-childcare-snapshot-enrollment.json');await writeFile(config,JSON.stringify(binding));
    const missing=await load({root});assert.equal(missing.status,'unavailable');assert.equal(missing.reason,'enrolled-operation-not-installed');assert.equal(missing.view,undefined);
    for(const changed of [{...binding,extra:true},{...binding,operation_id:'../outside'},{...binding,operation_receipt_sha256:'bad'}]){await writeFile(config,JSON.stringify(changed));await assert.rejects(load({root}));}
    const receiptPath=path.join(root,'data/managed-operations',id,'receipt.json');await mkdir(path.dirname(receiptPath),{recursive:true});
    const receipt={id,kind:'cohort-snapshot',status:'SUCCEEDED',error:null,createdAt:'2026-09-09T03:17:47.737Z',startedAt:'2026-09-09T03:17:47.739Z',finishedAt:'2026-09-09T03:18:24.701Z',result:{snapshotIntegrityVerified:true,inspectionRequired:false,sourceReplayPerformedThisRead:false,exportPolicy:'internal',snapshot:{manifest_path:path.join(root,'data/managed-operations',id,'output/jobs',run,'manifest.json'),manifest_sha256:'b'.repeat(64),run_id:run,industry_run_id:id,execution_mode:'native-root-offline-build'}}};
    const publish=async()=>{const raw=JSON.stringify(receipt);await writeFile(receiptPath,raw);await writeFile(config,JSON.stringify({...binding,operation_receipt_sha256:createHash('sha256').update(raw).digest('hex')}));};
    await publish();assert.equal((await load({root})).reason,'enrolled-snapshot-not-installed');
    receipt.status='FAILED';await publish();await assert.rejects(load({root}));
    receipt.status='SUCCEEDED';receipt.result.snapshot.industry_run_id=run;await publish();await assert.rejects(load({root}));
    for(const options of [null,{root,url:'private'},{root,signal:{}},{root:'relative'}])await assert.rejects(load(options));
    await assert.rejects(load({root,signal:AbortSignal.abort()}));
  }finally{assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});
test('installed enrollment reads the completed app snapshot without source replay',{skip:process.env.DATAHUB_TEST_RETAINED_COHORTS!=='1'},async()=>{
  const previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('no source access');
  try{
    const current=JSON.parse(await readFile(path.join(APP_ROOT,'config/retained-childcare-snapshot-enrollment.json'),'utf8'));
    const result=await load();assert.equal(result.status,'available');assert.equal(result.operation_id,current.operation_id);
    assert.equal(result.operation_receipt_sha256,current.operation_receipt_sha256);
    assert.equal(result.verification.snapshot_integrity_verified,true);assert.equal(result.verification.source_replay_performed_this_read,false);
    for(const [state,count]of Object.entries({PA:4995,CT:1390,MD:1772,VT:503,CO:1648,UT:422,IA:1476}))assert.equal(result.view.cohorts[state][0].accepted_candidate_rows,count);
  }finally{globalThis.fetch=previous;}
});
