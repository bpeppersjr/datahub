import assert from 'node:assert/strict';
import test from 'node:test';
import { productionMemoryPolicy, productionMemoryArguments } from './production-memory.mjs';
import { executeProductionStage } from './production-reconciliation.mjs';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import path from 'node:path';
const policy=productionMemoryPolicy('national-12g');
const plenty={freeBytes:32*1024**3,totalBytes:64*1024**3};
test('Production memory profile is fixed and rejects malformed or insufficient capacity',()=>{
  assert.deepEqual(productionMemoryArguments(policy,plenty),['--max-old-space-size=12288']);
  assert.deepEqual(productionMemoryArguments(undefined,{freeBytes:0,totalBytes:0}),[]);
  assert.equal(productionMemoryPolicy(undefined),undefined);
  assert.throws(()=>productionMemoryPolicy('unlimited'));
  for(const options of ['--max-old-space-size=2048','--max_old_space_size_percentage=90','"--max-old-space-size-percentage=90"'])assert.throws(()=>productionMemoryArguments(policy,plenty,options),/Inherited heap options/);
  for(const change of [{oldSpaceMiB:65536},{minimumFreeMiB:0},{extra:true}])assert.throws(()=>productionMemoryArguments({...policy,...change},plenty));
  for(const available of [{...plenty,freeBytes:16*1024**3-1},{...plenty,totalBytes:16*1024**3},{...plenty,freeBytes:NaN},{...plenty,totalBytes:Infinity}])assert.throws(()=>productionMemoryArguments(policy,available));
  assert.deepEqual(productionMemoryArguments(policy,{freeBytes:16*1024**3,totalBytes:24*1024**3}),['--max-old-space-size=12288']);
});
test('Native production child receives explicit heap flag without allocating that much memory',async t=>{
  // Mock only capacity observation; the tiny child uses the actual native launcher.
  const os=await import('node:os');
  t.mock.method(os.default,'freemem',()=>plenty.freeBytes);
  t.mock.method(os.default,'totalmem',()=>plenty.totalBytes);
  (await import('node:module')).syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();return import('node:module').then(m=>m.syncBuiltinESMExports());});
  const temp=path.join(APP_ROOT,'data/tmp');await mkdir(temp,{recursive:true});const root=await mkdtemp(path.join(temp,'production-memory-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const script=path.join(root,'child.mjs'),logPath=path.join(root,'child.log');
  await writeFile(script,"import v8 from 'node:v8'; console.log(JSON.stringify({args:process.execArgv,heap:v8.getHeapStatistics().heap_size_limit}));");
  let pid;const result=await executeProductionStage({script,args:[]},{cwd:root,logPath,memoryPolicy:policy,onSpawn:value=>{pid=value;}});
  assert.equal(result.exitCode,0);assert.ok(pid>0);
  const emitted=JSON.parse(await readFile(logPath,'utf8'));assert.deepEqual(emitted.args,['--max-old-space-size=12288']);assert.ok(emitted.heap>=12288*1048576);
  const priorOptions=process.env.NODE_OPTIONS;
  try {
    process.env.NODE_OPTIONS='--max_old_space_size_percentage=90';
    assert.throws(()=>executeProductionStage({script,args:[]},{cwd:root,logPath:path.join(root,'conflict.log'),memoryPolicy:policy,onSpawn:()=>assert.fail('No conflicting child')}),/Inherited heap options/);
    await assert.rejects(readFile(path.join(root,'conflict.log')), {code:'ENOENT'});
    assert.deepEqual(productionMemoryArguments(policy,plenty,'--no-warnings'),['--max-old-space-size=12288']);
  } finally { if(priorOptions===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=priorOptions; }
  t.mock.method(os.default,'freemem',()=>0);(await import('node:module')).syncBuiltinESMExports();
  assert.throws(()=>executeProductionStage({script,args:[]},{cwd:root,logPath:path.join(root,'denied.log'),memoryPolicy:policy,onSpawn:()=>assert.fail('No child allowed')}),/headroom/);
  await assert.rejects(readFile(path.join(root,'denied.log')), {code:'ENOENT'});
});
