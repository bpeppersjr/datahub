import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,readFile,readdir,rm,unlink,rmdir,writeFile,mkdir} from 'node:fs/promises';
import {watch} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {IA_CHILDCARE_URLS,IA_CHILDCARE_TEST_CLIENT} from './ia-childcare-acquisition.mjs';
import {IA_CHILDCARE_ACQUIRED_TEST_ROOT} from './ia-childcare-acquired.mjs';
import {runIaChildcareAppJob as run,runIaChildcareAppJobWithTransport as synthetic,verifyIaChildcareAppJob as verify} from './ia-childcare-app.mjs';
const execute=promisify(execFile);
const fixture=url=>Promise.resolve(new Response(url===IA_CHILDCARE_URLS.client?IA_CHILDCARE_TEST_CLIENT:JSON.stringify([{businessType:'building',businessName:'Synthetic Center',address:'1 Test St',city:'Test',zipCode:50301,latitude:41,longitude:-93,referral:true},{businessType:'home',businessName:'PRIVATE_HOME'}])));
async function cleanAcquired(file){const dir=path.dirname(file);assert.equal(path.dirname(dir),IA_CHILDCARE_ACQUIRED_TEST_ROOT);for(const name of await readdir(dir))await unlink(path.join(dir,name));await rmdir(dir);}

test('Iowa app rejects overrides and unsafe paths before requests',async()=>{
 let calls=0;const fetchImpl=()=>{calls++;throw Error('no');};
 for(const options of [null,{fetchImpl},{signal:{}},Object.create({}),{outputRoot:APP_ROOT},{industryRunId:'../bad'},{signal:AbortSignal.abort()}])await assert.rejects(run(options));
 await assert.rejects(synthetic({fetchImpl,outputRoot:APP_ROOT}));assert.equal(calls,0);
});

test('Iowa app persists linked lifecycle, excludes overlapping roots, verifies offline CLI reuse and rejects tampering',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ia-app-test-'));let result;
 try{
  let entered,release;const ready=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});let first=true;
  const running=synthetic({outputRoot:path.join(root,'first'),industryRunId:'ia-test',fetchImpl:async url=>{if(first){first=false;entered();await gate;}return fixture(url);}});
  await Promise.race([ready,running.then(()=>assert.fail('did not enter'))]);
  try{await assert.rejects(synthetic({outputRoot:path.join(root,'second'),fetchImpl:()=>assert.fail('overlap must not fetch')}));}finally{release();}
  result=await running;assert.equal(result.receipt.status,'SUCCEEDED');assert.equal(result.receipt.claims.export_policy,'internal');assert.equal(result.receipt.industry_run_id,'ia-test');
  await verify(result.receiptPath);
  const original=await readFile(result.receiptPath),source=await readFile(result.receipt.acquired.manifest_path);
  const cli=JSON.parse((await execute(process.execPath,['scripts/build-ia-childcare.mjs','--acquired',result.receipt.acquired.manifest_path,'--output',path.join(root,'reuse')],{cwd:APP_ROOT,windowsHide:true,env:{...process.env,INDUSTRY_SEGMENT_RUN_ID:'ia-cli-test'}})).stdout);
  assert.equal(cli.receipt.execution_mode,'retained-local-verification');assert.equal(cli.receipt.industry_run_id,'ia-cli-test');assert.equal(cli.receipt.claims.export_policy,'internal');assert.deepEqual(await readFile(result.receipt.acquired.manifest_path),source);
  const checked=JSON.parse((await execute(process.execPath,['scripts/verify-ia-childcare-app.mjs','--receipt',cli.receiptPath],{cwd:APP_ROOT,windowsHide:true})).stdout);assert.equal(checked.receipt_sha256,cli.receipt_sha256);
  const bad=JSON.parse(original);bad.claims.current_operations_verified=true;await writeFile(result.receiptPath,JSON.stringify(bad));await assert.rejects(verify(result.receiptPath));await writeFile(result.receiptPath,original);
  const job=path.dirname(result.receiptPath),normPath=path.join(job,'normalized.json'),norm=await readFile(normPath);const borrowed=JSON.parse(norm);borrowed.verification=cli.receipt.normalized;const receipt=JSON.parse(original);receipt.normalized=cli.receipt.normalized;await writeFile(normPath,JSON.stringify(borrowed));await writeFile(result.receiptPath,JSON.stringify(receipt));await assert.rejects(verify(result.receiptPath));await writeFile(normPath,norm);await writeFile(result.receiptPath,original);await verify(result.receiptPath);
 }finally{if(result)await cleanAcquired(result.receipt.acquired.manifest_path);assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});

test('Iowa app persists cancellation after acquired checkpoint and releases ownership',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ia-app-cancel-'));let source;
 try{
  const controller=new AbortController();await assert.rejects(synthetic({outputRoot:root,fetchImpl:fixture,signal:controller.signal,logger:async event=>{if(event.phase==='acquired-checkpoint')controller.abort();}}));
  const ids=await readdir(path.join(root,'jobs'));assert.equal(ids.length,1);const receipt=JSON.parse(await readFile(path.join(root,'jobs',ids[0],'receipt.json')));source=receipt.acquired.manifest_path;assert.equal(receipt.status,'CANCELLED');assert.equal(receipt.normalized,null);assert.ok(!(await readdir(root)).includes('.owner.lock'));
 }finally{if(source)await cleanAcquired(source);assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});

test('Iowa CLI rejects unknown options and offers help without acquisition',async()=>{
 assert.match((await execute(process.execPath,['scripts/build-ia-childcare.mjs','--help'],{cwd:APP_ROOT,windowsHide:true})).stdout,/Usage:/);
 for(const args of [['--url','https://example.invalid'],['--acquired'],['--output','a','--output','b']])await assert.rejects(execute(process.execPath,['scripts/build-ia-childcare.mjs',...args],{cwd:APP_ROOT,windowsHide:true}));
});

test('Iowa cancellation at child publication retains the committed acquisition and supports offline reuse',async()=>{
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ia-app-commit-cancel-'));let source,watcher;
 try{
  await mkdir(IA_CHILDCARE_ACQUIRED_TEST_ROOT,{recursive:true});
  const controller=new AbortController();let calls=0,observed=false;
  watcher=watch(IA_CHILDCARE_ACQUIRED_TEST_ROOT,{recursive:true},(_event,file)=>{if(file&&path.basename(String(file))==='manifest.json'){source=path.join(IA_CHILDCARE_ACQUIRED_TEST_ROOT,String(file));observed=true;controller.abort();}});
  await assert.rejects(synthetic({outputRoot:path.join(root,'cancel'),fetchImpl:async url=>{calls++;return fixture(url);},signal:controller.signal}));
  watcher.close();watcher=null;assert.equal(observed,true);assert.equal(calls,3);
  const [id]=await readdir(path.join(root,'cancel/jobs'));const receipt=JSON.parse(await readFile(path.join(root,'cancel/jobs',id,'receipt.json')));assert.equal(receipt.status,'CANCELLED');assert.ok(receipt.acquired);assert.equal(receipt.normalized,null);source=receipt.acquired.manifest_path;
  const saved=globalThis.fetch;globalThis.fetch=()=>assert.fail('offline reuse must not fetch');
  try{const reused=await run({outputRoot:path.join(root,'reuse'),acquiredManifestPath:source});await verify(reused.receiptPath);assert.equal(reused.receipt.acquired.manifest_sha256,receipt.acquired.manifest_sha256);}finally{globalThis.fetch=saved;}
 }finally{watcher?.close();if(source)await cleanAcquired(source);assert.equal(path.dirname(root),path.join(APP_ROOT,'data/tmp'));await rm(root,{recursive:true,force:true});}
});
