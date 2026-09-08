import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {buildPaChildcareAcquiredReleaseWithTransport} from './pa-childcare-acquired-release.mjs';
import {createPaChildcareFixture,paFixtureOptions} from './pa-childcare-test-fixtures.mjs';
const exec=promisify(execFile);
const cli=(script,args)=>exec(process.execPath,[`scripts/${script}.mjs`,...args],{cwd:APP_ROOT,timeout:60000,maxBuffer:200000});
test('PA CLI rejects malformed arguments without collecting and exposes standalone help',async()=>{
  assert.match((await cli('build-pa-childcare',['--help'])).stdout,/No AI session required/);
  for(const args of [['--output'],['--unknown','x'],['--acquired','relative.json'],['--output','x','--output','y']])await assert.rejects(cli('build-pa-childcare',args),e=>e.code===1&&/PA_CHILDCARE_CLI_FAILED/.test(e.stderr));
  await assert.rejects(cli('verify-pa-childcare-app',['--receipt','relative.json']),e=>e.code===1);
});
test('PA standalone CLI reuses retained evidence, independently verifies receipt, and pins industry run',paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/pa-cli-test-'));
  try{
    const fixture=createPaChildcareFixture({mutate:(v,k)=>{if(k==='page')for(const r of v){r.facility_address='123 Main Street';r.facility_city='Harrisburg';}}});
    const source=await buildPaChildcareAcquiredReleaseWithTransport({outputRoot:path.join(root,'input'),fetchImpl:fixture.fetchImpl});
    const before=await readFile(source.manifest_path);
    const result=await exec(process.execPath,['scripts/build-pa-childcare.mjs','--acquired',source.manifest_path,'--output',path.join(root,'runs','industry-test','state-pa-childcare-centers-PA')],{cwd:APP_ROOT,env:{...process.env,INDUSTRY_SEGMENT_RUN_ID:'pa-cli-test'},timeout:60000,maxBuffer:200000});
    const value=JSON.parse(result.stdout);assert.equal(value.status,'verified');assert.equal(value.receipt.industry_run_id,'pa-cli-test');assert.equal(value.receipt.execution_mode,'retained-local-verification');assert.equal(value.receipt.acquired.manifest_sha256,source.manifest_sha256);
    assert.deepEqual(JSON.parse((await cli('verify-pa-childcare-app',['--receipt',value.receiptPath])).stdout),value);
    assert.deepEqual(await readFile(source.manifest_path),before);
  }finally{await rm(root,{recursive:true,force:true});}
});
