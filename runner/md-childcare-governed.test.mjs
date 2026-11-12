import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {publishMdChildcareCurrentPointer} from './md-childcare.mjs';

const proof=(root,runId,finishedAt)=>{const receipt={schema_version:'md-childcare-app@1.0.0',run_id:runId,industry_run_id:null,status:'SUCCEEDED',execution_mode:'injected-test-transport',started_at:'2026-11-12T21:00:00.000Z',finished_at:finishedAt,start_sha256:'a'.repeat(64),configuration:{},acquired:{},normalized:{},claims:{}};return{status:'verified',receiptPath:path.join(root,'jobs',runId,'receipt.json'),receipt,receipt_sha256:'b'.repeat(64)};};

test('Maryland governed publication atomically advances only to a verified app receipt',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/md-childcare-governed-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const first=proof(root,crypto.randomUUID(),'2026-11-12T21:01:00.000Z');await mkdir(path.dirname(first.receiptPath),{recursive:true});await writeFile(first.receiptPath,`${JSON.stringify(first.receipt)}\n`);const published=await publishMdChildcareCurrentPointer(root,first);assert.deepEqual(JSON.parse(await readFile(path.join(root,'current.json'),'utf8')),published.pointer);
  const second=proof(root,crypto.randomUUID(),'2026-11-12T21:02:00.000Z');await mkdir(path.dirname(second.receiptPath),{recursive:true});await writeFile(second.receiptPath,`${JSON.stringify(second.receipt)}\n`);await publishMdChildcareCurrentPointer(root,second);assert.equal(JSON.parse(await readFile(path.join(root,'current.json'),'utf8')).release_id,second.receipt.run_id);
  await assert.rejects(publishMdChildcareCurrentPointer(root,{...second,receiptPath:path.join(APP_ROOT,'package.json')}),/escapes/);
});
