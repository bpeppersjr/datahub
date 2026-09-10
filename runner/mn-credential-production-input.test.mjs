import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {pinMnCredentialProductionInput,mnCredentialImplementationFiles} from './mn-credential-production-input.mjs';
import {planProductionReconciliation} from './production-reconciliation.mjs';

async function safe(root,value){
  const file=path.resolve(root,value),relative=path.relative(root,file);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  assert.equal(await realpath(file),file);return file;
}
async function fileHash(file){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
  return {sha256:hash.digest('hex'),bytes};
}
test('MN production helper rejects non-native roots before reading evidence',async()=>{
  let reads=0;
  await assert.rejects(pinMnCredentialProductionInput(path.join(APP_ROOT,'data/tmp'),'selection.json',{
    safe:()=>{reads++;throw Error('unexpected read');},fileHash}));
  assert.equal(reads,0);
});
test('MN production selection rejects either historical recovery before readiness inspection',async()=>{
  let reads=0;
  for(const mode of ['recoverBenchmarkFrom','recoverResolutionFrom']){
    await assert.rejects(planProductionReconciliation({mnCredentialSelection:'config/mn-credential-registry-selection.json',
      [mode]:'historical-run',readinessInspector:()=>{reads++;throw Error('unexpected readiness');}}),/fresh plan/);
  }
  assert.equal(reads,0);
});
test('MN implementation inventory includes runtime closure and dependency manifests',async()=>{
  const files=await mnCredentialImplementationFiles();
  assert.equal(new Set(files).size,files.length);
  assert.deepEqual(files,[...files].sort());
  for(const file of ['package.json','package-lock.json','runner/mn-credential-production-input.mjs',
    'runner/mn-construction-selected-stream.mjs','runner/mn-construction-app.mjs'])assert.ok(files.includes(file));
  assert.ok(files.every(file=>!file.startsWith('data/')));
});
test('MN production pins replay the exact retained 16-file lineage without fetching',{
  skip:process.env.DATAHUB_TEST_RETAINED_COHORTS!=='1',timeout:600000,
},async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden');};
  try{
    const pin=await pinMnCredentialProductionInput(APP_ROOT,'config/mn-credential-registry-selection.json',{safe,fileHash});
    const job='data/industry-segments/runs/a01b1819-420b-4036-a5fb-40f9c29ba861/state-mn-residential-contractors-MN/jobs/ebfad910-440e-46bb-b42b-2fc44b6d32f3';
    const selected=`${job}/selected/fcbfe10a-745b-4f8f-96e3-56116414f77f`;
    const cohort='data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f';
    const expected=['config/mn-credential-registry-selection.json','config/mn-construction-app-enrollment.json',
      'config/source-policies/mn-construction-internal-acquisition.json',`${cohort}/manifest.json`,`${cohort}/credentials.jsonl`,
      ...['start.json','receipt.json','acquisition-checkpoint.json','notices-before.json','schema-preflight.json','publisher-wait.json',
        'acquisitions/c1135a10-c551-4f23-a260-7f132721be43.json'].map(file=>`${job}/${file}`),
      ...['manifest.json','selected.jsonl','selection-receipt.json','normalized.jsonl'].map(file=>`${selected}/${file}`)].sort();
    assert.deepEqual(pin.evidencePins.map(p=>p.path),expected);
    assert.equal(pin.declaration.summary.allAcceptedCohortRows,11456);
    assert.equal(pin.declaration.physical_site_eligible,false);
    for(const evidence of pin.evidencePins)assert.deepEqual({sha256:evidence.sha256,bytes:evidence.bytes},await fileHash(path.join(APP_ROOT,evidence.path)));
    assert.equal(pin.evidencePins.find(p=>p.path===`${cohort}/credentials.jsonl`).sha256,'286e5c798bb39671291d3db8e20c48f6f9778f17e62aa2a0f1312ca574654edb');
  }finally{globalThis.fetch=original;}
});
