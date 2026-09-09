import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {buildRetainedChildcareCohortSnapshot as build,buildRetainedChildcareCohortSnapshotForTest as fixtureBuild,readRetainedChildcareCohortSnapshot as read} from './retained-childcare-cohort-snapshot.mjs';

async function fixture(t){
  const base=await mkdtemp(path.join(APP_ROOT,'data/tmp/cohort-snapshot-test-')),root=path.join(base,'input'),outputRoot=path.join(base,'output');
  await mkdir(root);t.after(async()=>{assert.equal(path.dirname(base),path.join(APP_ROOT,'data/tmp'));await rm(base,{recursive:true,force:true});});
  return {root,outputRoot};
}
test('snapshot publication is isolated, immutable and readable without source replay',async t=>{
  const options=await fixture(t),previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('no downloads');
  try{
    const result=await fixtureBuild({...options,industryRunId:'snapshot-test'});
    assert.equal(result.execution_mode,'fixture-root-offline-build');
    const readback=await read(result.manifest_path,result.manifest_sha256);
    assert.equal(readback.verification.snapshot_integrity_verified,true);assert.equal(readback.verification.source_replay_performed_this_read,false);
    assert.ok(Object.values(readback.view.cohorts).every(rows=>rows[0].status==='not-enrolled'));
    assert.deepEqual((await readdir(path.dirname(result.manifest_path))).sort(),['manifest.json','view.json']);
    const second=await fixtureBuild(options);assert.notEqual(second.manifest_path,result.manifest_path);
    assert.deepEqual(await read(result.manifest_path,result.manifest_sha256),readback);
    await assert.rejects(read(result.manifest_path,'0'.repeat(64)));
    const viewPath=path.join(path.dirname(result.manifest_path),'view.json');await writeFile(viewPath,'{}');
    await assert.rejects(read(result.manifest_path,result.manifest_sha256));
  }finally{globalThis.fetch=previous;}
});
test('snapshot rejects invalid roots, caller injection, missing hashes and pre-cancellation',async t=>{
  const options=await fixture(t);
  for(const supplied of [null,{...options,fetchImpl:()=>{}},{...options,signal:{}},{...options,root:APP_ROOT},{...options,outputRoot:APP_ROOT}])await assert.rejects(fixtureBuild(supplied));
  await assert.rejects(build({root:options.root}));await assert.rejects(build({view:{}}));
  await assert.rejects(fixtureBuild({...options,signal:AbortSignal.abort()}));
  await assert.rejects(read(path.join(options.outputRoot,'manifest.json'),undefined));
});
test('snapshot records unavailable evidence separately from zero and cheap reads need no input files',async t=>{
  const options=await fixture(t);await mkdir(path.join(options.root,'config'));
  const config=path.join(options.root,'config/ia-childcare-reporting-enrollment.json');
  await writeFile(config,JSON.stringify({schema_version:'ia-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)}));
  const result=await fixtureBuild(options);await writeFile(config,'{}');
  const view=(await read(result.manifest_path,result.manifest_sha256)).view;
  assert.equal(view.cohorts.IA[0].status,'unavailable');assert.equal(view.cohorts.IA[0].accepted_candidate_rows,undefined);
  const bytes=await readFile(result.manifest_path);assert.equal(createHash('sha256').update(bytes).digest('hex'),result.manifest_sha256);
});
test('snapshot CLI help and invalid inputs stay redacted',()=>{
  const options={cwd:APP_ROOT,encoding:'utf8',windowsHide:true,stdio:'pipe'};
  for(const script of ['scripts/build-retained-childcare-cohort-snapshot.mjs','scripts/verify-retained-childcare-cohort-snapshot.mjs']){
    assert.match(execFileSync(process.execPath,[script,'--help'],options),/no .*downloads/);
    assert.throws(()=>execFileSync(process.execPath,[script,'--private','secret-value'],options),e=>e.status===1&&!String(e.stderr).includes('secret-value'));
  }
  for(const args of [['--operation-id','../secret-value'],['--operation-id','a','--operation-id','b'],['--operation-id'],['--output','relative'],['--operation-id','other']]){
    assert.throws(()=>execFileSync(process.execPath,['scripts/build-retained-childcare-cohort-snapshot.mjs',...args],{...options,env:{...process.env,INDUSTRY_SEGMENT_RUN_ID:'bound'}}),e=>e.status===1&&!String(e.stderr).includes('secret-value'));
  }
});
test('CLI preserves committed descriptor when its final integrity read fails',()=>{
  const code=`import {mock} from 'node:test';
    const descriptor={manifest_path:'retained-manifest',manifest_sha256:'a'.repeat(64),run_id:'retained-run',industry_run_id:null,execution_mode:'native-root-offline-build'};
    mock.module(new URL('./runner/retained-childcare-cohort-snapshot.mjs',import.meta.url).href,{namedExports:{buildRetainedChildcareCohortSnapshot:async()=>descriptor,readRetainedChildcareCohortSnapshot:async()=>{throw Error('PRIVATE verification fault');}}});
    process.argv=['node','script'];delete process.env.INDUSTRY_SEGMENT_RUN_ID;
    await import('./scripts/build-retained-childcare-cohort-snapshot.mjs');`;
  assert.throws(()=>execFileSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',code],{cwd:APP_ROOT,encoding:'utf8',windowsHide:true,stdio:'pipe'}),error=>{
    assert.equal(error.status,1);const result=JSON.parse(error.stdout);
    assert.equal(result.status,'COMMITTED_REQUIRES_INSPECTION');assert.equal(result.committed_snapshot.run_id,'retained-run');
    assert.equal(result.committed_snapshot_integrity_verification_required,true);assert.ok(!String(error.stderr).includes('PRIVATE'));return true;
  });
});
test('rehashed snapshot inconsistencies cannot bypass structural validation',async t=>{
  const options=await fixture(t),result=await fixtureBuild(options),directory=path.dirname(result.manifest_path),viewPath=path.join(directory,'view.json');
  const manifest=JSON.parse(await readFile(result.manifest_path,'utf8')),view=JSON.parse(await readFile(viewPath,'utf8'));
  view.cohorts.IA[0].accepted_candidate_rows=0;
  const changed=Buffer.from(JSON.stringify(view)+'\n');await writeFile(viewPath,changed);
  manifest.artifacts[0].bytes=changed.length;manifest.artifacts[0].sha256=createHash('sha256').update(changed).digest('hex');
  const manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n');await writeFile(result.manifest_path,manifestBytes);
  await assert.rejects(read(result.manifest_path,createHash('sha256').update(manifestBytes).digest('hex')));
});
test('snapshot concurrent ownership prevents overlap and cancellation releases owned lock',async t=>{
  const options=await fixture(t),results=await Promise.allSettled([fixtureBuild(options),fixtureBuild(options)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const controller=new AbortController(),pending=fixtureBuild({...options,signal:controller.signal});setImmediate(()=>controller.abort());
  await assert.rejects(pending);assert.ok(!(await readdir(options.outputRoot)).includes('.owner.lock'));
  const next=await fixtureBuild(options);assert.equal((await read(next.manifest_path,next.manifest_sha256)).verification.snapshot_integrity_verified,true);
});
test('fixture snapshot cannot be relabeled as a native output even with changed manifest pin',async t=>{
  const options=await fixture(t),result=await fixtureBuild(options),manifest=JSON.parse(await readFile(result.manifest_path,'utf8'));
  manifest.execution_mode='native-root-offline-build';manifest.input_root='.';
  for(const entry of manifest.enrollments)entry.path=`config/${entry.state.toLowerCase()}-childcare-reporting-enrollment.json`;
  const raw=Buffer.from(JSON.stringify(manifest)+'\n');await writeFile(result.manifest_path,raw);
  await assert.rejects(read(result.manifest_path,createHash('sha256').update(raw).digest('hex')));
});
test('cancellation immediately after commit preserves a verified descriptor',async t=>{
  const options=await fixture(t),controller=new AbortController(),original=fsPromises.link;let committed=false;
  fsPromises.link=async(from,to)=>{const value=await original(from,to);if(path.basename(to)==='manifest.json'){committed=true;controller.abort();}return value;};syncBuiltinESMExports();
  let result;try{result=await fixtureBuild({...options,signal:controller.signal});}finally{fsPromises.link=original;syncBuiltinESMExports();}
  assert.equal(committed,true);assert.equal(controller.signal.aborted,true);
  assert.equal((await read(result.manifest_path,result.manifest_sha256)).verification.snapshot_integrity_verified,true);
  assert.ok(!(await readdir(options.outputRoot)).includes('.owner.lock'));
});
test('postcommit temporary unlink failure retains inspectable evidence rather than reporting success',async t=>{
  const options=await fixture(t),controller=new AbortController(),original=fsPromises.unlink;let failure,triggered=false;
  fsPromises.unlink=async file=>{if(path.basename(file)==='manifest.tmp'){triggered=true;controller.abort();throw Error('PRIVATE injected failure');}return original(file);};syncBuiltinESMExports();
  try{await fixtureBuild({...options,signal:controller.signal});assert.fail('expected failure');}catch(error){failure=error;}finally{fsPromises.unlink=original;syncBuiltinESMExports();}
  assert.equal(triggered,true);assert.equal(failure.code,'RETAINED_CHILDCARE_SNAPSHOT_COMMITTED_REQUIRES_INSPECTION');
  assert.equal(failure.committed_snapshot_integrity_verification_required,true);assert.ok(!failure.message.includes('PRIVATE'));
  const result=failure.committed_snapshot,dir=path.dirname(result.manifest_path);
  assert.deepEqual((await readdir(dir)).sort(),['manifest.json','manifest.tmp','view.json']);
  assert.equal(createHash('sha256').update(await readFile(result.manifest_path)).digest('hex'),result.manifest_sha256);
  // A leftover hard-linked temporary is incomplete publication cleanup, not a valid readable snapshot.
  await assert.rejects(read(result.manifest_path,result.manifest_sha256));
  assert.ok(!(await readdir(options.outputRoot)).includes('.owner.lock'));
});
test('postcommit lock cleanup failure preserves descriptor and blocks automatic takeover',async t=>{
  const options=await fixture(t),original=fsPromises.unlink;let failure;
  fsPromises.unlink=async file=>{if(path.basename(file)==='.owner.lock')throw Error('PRIVATE lock fault');return original(file);};syncBuiltinESMExports();
  try{await fixtureBuild(options);assert.fail('expected failure');}catch(error){failure=error;}finally{fsPromises.unlink=original;syncBuiltinESMExports();}
  assert.equal(failure.code,'RETAINED_CHILDCARE_SNAPSHOT_COMMITTED_REQUIRES_INSPECTION');
  const result=failure.committed_snapshot;
  assert.equal((await read(result.manifest_path,result.manifest_sha256)).verification.snapshot_integrity_verified,true);
  assert.ok((await readdir(options.outputRoot)).includes('.owner.lock'));
  await assert.rejects(fixtureBuild(options));
});
test('enrollment drift during snapshot publication rejects and cleans only unpublished output',async t=>{
  const options=await fixture(t),config=path.join(options.root,'config/ia-childcare-reporting-enrollment.json');
  await mkdir(path.dirname(config));
  const binding={schema_version:'ia-childcare-reporting-enrollment@1.0.0',app_receipt_path:'data/missing/receipt.json',app_receipt_sha256:'a'.repeat(64)};
  await writeFile(config,JSON.stringify(binding));
  const original=fsPromises.open;let changed=false;
  fsPromises.open=async(file,...args)=>{
    if(path.basename(file)==='manifest.tmp'&&!changed){changed=true;await writeFile(config,JSON.stringify({...binding,app_receipt_sha256:'b'.repeat(64)}));}
    return original(file,...args);
  };syncBuiltinESMExports();
  try{await assert.rejects(fixtureBuild(options));}finally{fsPromises.open=original;syncBuiltinESMExports();}
  assert.equal(changed,true);assert.deepEqual(await readdir(path.join(options.outputRoot,'jobs')),[]);
  assert.ok(!(await readdir(options.outputRoot)).includes('.owner.lock'));
  assert.equal(JSON.parse(await readFile(config,'utf8')).app_receipt_sha256,'b'.repeat(64));
});
