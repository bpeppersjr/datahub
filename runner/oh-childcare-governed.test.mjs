import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {publishOhChildcareCurrentPointer} from './oh-childcare.mjs';

async function proof(root,finishedAt){
  const runId=randomUUID(),receiptPath=path.join(root,'jobs',runId,'receipt.json');
  const receipt={schema_version:'oh-childcare-app@1.0.0',run_id:runId,status:'SUCCEEDED',execution_mode:'injected-test-transport',started_at:'2026-11-12T23:20:00.000Z',finished_at:finishedAt,enrollment_sha256:'a'.repeat(64),start_sha256:'b'.repeat(64),acquisition_checkpoint_sha256:'c'.repeat(64),acquisition:{},normalized:{},source_use_authorized:true,native_execution_independently_verified:true,source_authenticity_verified:true,public_export_authorized:false,nationalReportingIntegrated:false,limitations:[]};
  const raw=Buffer.from(`${JSON.stringify(receipt)}\n`);await mkdir(path.dirname(receiptPath),{recursive:true});await writeFile(receiptPath,raw);
  return {status:'SUCCEEDED',run_id:runId,execution_mode:receipt.execution_mode,receipt_path:receiptPath,receipt_sha256:createHash('sha256').update(raw).digest('hex'),acquisition:{},normalized:{},nationalReportingIntegrated:false,public_export_authorized:false};
}

test('Ohio governed publication advances only to a safe verified app receipt',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/oh-childcare-governed-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const first=await proof(root,'2026-11-12T23:21:00.000Z'),published=await publishOhChildcareCurrentPointer(root,first);
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'current.json'),'utf8')),published.pointer);
  const second=await proof(root,'2026-11-12T23:22:00.000Z');await publishOhChildcareCurrentPointer(root,second);
  assert.equal(JSON.parse(await readFile(path.join(root,'current.json'),'utf8')).release_id,second.run_id);
  await assert.rejects(publishOhChildcareCurrentPointer(root,{...second,receipt_path:path.join(APP_ROOT,'package.json')}),/escapes/);
});
