import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,copyFile,realpath,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from './paths.mjs';
const execute=promisify(execFile);
// Each test file owns a separate APP_ROOT. Intentional same-provider contention
// inside each child still uses the unchanged hospital/nursing shared lock.
export function isolatedCmsAcquisitionFixture(file,marker,expectedTests){
 test(`isolated ${marker} acquisition lifecycle (${expectedTests} child tests)`,async t=>{
  const base=path.join(APP_ROOT,'data/tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,`${marker}-suite-`));
  assert.equal(await realpath(root),root);assert.equal(path.dirname(root),base);
  const policy=path.join(root,'config/source-policies');await mkdir(policy,{recursive:true});await copyFile(new URL('../config/source-policies/cms-nursing-home-acquisition.json',import.meta.url),path.join(policy,'cms-nursing-home-acquisition.json'));
  const env={...process.env,DATAHUB_ROOT:root,DATAHUB_CMS_ACQUISITION_SUITE:marker};delete env.NODE_TEST_CONTEXT;
  let result;try{result=await execute(process.execPath,['--test',file],{cwd:APP_ROOT,env,windowsHide:true,timeout:180000,maxBuffer:2000000});}catch(error){assert.fail(`Isolated fixture failed; preserved ${root}\n${error.stdout??''}\n${error.stderr??''}`);}
  assert.doesNotMatch(result.stdout,/skipping running files/);assert.match(result.stdout,new RegExp(`tests ${expectedTests}\\b`));assert.match(result.stdout,/fail 0\b/);assert.match(result.stdout,/skipped 0\b/);t.diagnostic(result.stdout);
  assert.equal(await realpath(root),root);assert.equal(path.dirname(root),base);await rm(root,{recursive:true});
 });
}
