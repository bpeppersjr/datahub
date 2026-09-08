import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,access,rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
const invoke=(script,args)=>promisify(execFile)(process.execPath,[`scripts/${script}-ak-business-app.mjs`,...args],{cwd:APP_ROOT,windowsHide:true,timeout:10000});
test('AK app CLI help and malformed input do not acquire or create outputs',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ak-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));const output=path.join(root,'absent');
  for(const script of ['run','verify'])assert.match((await invoke(script,['--help'])).stdout,/Usage:/);
  for(const args of [['--output'],['--output',output,'--output',output],['--retained-manifest','one','--retained-manifest','two'],['--output',output,'--url','PRIVATE_URL'],['--help','--output',output]]){
    await assert.rejects(invoke('run',args),error=>{assert.doesNotMatch(error.stderr,/PRIVATE_URL/);return true;});await assert.rejects(access(output),{code:'ENOENT'});
  }
  for(const args of [[],['--receipt'],['--receipt','one','--receipt','two'],['--unknown','PRIVATE']])await assert.rejects(invoke('verify',args),error=>{assert.doesNotMatch(error.stderr,/PRIVATE/);return true;});
});
