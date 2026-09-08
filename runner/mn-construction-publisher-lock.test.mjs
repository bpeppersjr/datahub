import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';

const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'runner/mn-construction-publisher-lock.mjs')).href;
async function scenario(code) {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/mn-publisher-lock-'));
  const prefix = `import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import path from 'node:path';
    import { withMnConstructionPublisherLock as lock } from ${JSON.stringify(moduleUrl)};
    const root=process.env.DATAHUB_ROOT; const file=path.join(root,'data/business-sources/mn-dli-construction/runtime/publisher.lock');
    const options={runId:'fixture-run',cohort:'registrations'};`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', prefix + code], { cwd: APP_ROOT, windowsHide: true,
    env: { ...process.env, DATAHUB_ROOT: root, TEMP: root, TMP: root }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(status, 0, output); return output;
}

test('MN publisher lock persists ownership before work and enforces a real handover gap', async () => {
  await scenario(`let finished; const result=await lock(options,async({lease,assertHeld})=>{
    const stored=JSON.parse(await fs.readFile(file,'utf8')); assert.equal(stored.lease_id,lease.lease_id); assert.equal(stored.publisher_budget,'mn-dli-construction');
    await assertHeld(); finished=performance.now(); return 42;
  }); assert.ok(performance.now()-finished>=950); assert.equal(result.result,42); assert.equal(result.lock_released,true);
  await assert.rejects(fs.stat(file),{code:'ENOENT'});`);
});

test('MN cohorts share one gate and a competing callback never starts', async () => {
  await scenario(`let release,entered; const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
    const running=lock(options,async()=>{entered();await gate;}); await ready;
    await assert.rejects(lock({...options,cohort:'residential'},()=>assert.fail('Competing work started')),e=>e.code==='MN_PUBLISHER_BUSY');
    release();await running;
    const next=await lock({...options,cohort:'residential'},async()=> 'next');assert.equal(next.result,'next');`);
});

test('MN cancellation waits for cooperative work and clears only its own gate', async () => {
  await scenario(`const controller=new AbortController(); let acknowledged=false;
    await assert.rejects(lock({...options,signal:controller.signal},async({signal})=>{
      controller.abort();await new Promise(r=>setTimeout(r,30));acknowledged=true;signal.throwIfAborted();
    }),e=>e.name==='AbortError');assert.equal(acknowledged,true);await assert.rejects(fs.stat(file),{code:'ENOENT'});`);
});

test('MN callback failure is redacted and releases its gate after pacing', async () => {
  await scenario(`await assert.rejects(lock(options,async()=>{throw new Error('PRIVATE SOURCE CONTACT');}),e=>!e.message.includes('PRIVATE'));
    await assert.rejects(fs.stat(file),{code:'ENOENT'});`);
});

test('MN invalid and pre-cancelled requests do not create lock directories', async () => {
  await scenario(`const controller=new AbortController();controller.abort();
    await assert.rejects(lock({...options,signal:controller.signal},()=>assert.fail('Cancelled work')));
    for(const changed of [{cohort:'other'},{runId:'../escape'},{lockRoot:root},{signal:{}}])await assert.rejects(lock({...options,...changed},()=>assert.fail('Invalid work')));
    await assert.rejects(fs.stat(path.dirname(file)),{code:'ENOENT'});`);
});

test('MN occupied or crash-left gates are preserved without PID-based takeover', async () => {
  await scenario(`await fs.mkdir(path.dirname(file),{recursive:true});const raw='crash-left evidence';await fs.writeFile(file,raw);
    await assert.rejects(lock(options,()=>assert.fail('No takeover')),e=>e.code==='MN_PUBLISHER_BUSY');assert.equal(await fs.readFile(file,'utf8'),raw);`);
});

test('MN substituted locks are preserved and cannot produce successful release', async () => {
  await scenario(`await assert.rejects(lock(options,async()=>{
      await fs.rename(file,file+'.original');await fs.writeFile(file,'foreign replacement');
    }),/release failed/);assert.equal(await fs.readFile(file,'utf8'),'foreign replacement');assert.ok((await fs.stat(file+'.original')).isFile());`);
});

test('MN added hardlinks prevent unsafe cleanup', async () => {
  await scenario(`await assert.rejects(lock(options,async()=>{await fs.link(file,file+'.linked');}),/release failed/);
    assert.equal((await fs.stat(file)).nlink,2);assert.ok((await fs.stat(file+'.linked')).isFile());`);
});

test('MN modified lock bytes are preserved for inspection', async () => {
  await scenario(`await assert.rejects(lock(options,async()=>{await fs.writeFile(file,'modified evidence');}),/release failed/);
    assert.equal(await fs.readFile(file,'utf8'),'modified evidence');`);
});

test('MN publisher exclusion holds across separate worker processes', async () => {
  const contender = `import { withMnConstructionPublisherLock as lock } from ${JSON.stringify(moduleUrl)};
    try { await lock({runId:'other-process',cohort:'residential'},async()=>{}); process.exitCode=2; }
    catch(error) { if(error.code==='MN_PUBLISHER_BUSY')process.stdout.write('busy');else process.exitCode=3; }`;
  await scenario(`await lock(options,async()=>{
    const {execFileSync}=await import('node:child_process');
    const result=execFileSync(process.execPath,['--input-type=module','-e',${JSON.stringify(contender)}],{encoding:'utf8',windowsHide:true});
    assert.equal(result,'busy');
  });`);
});

test('MN initialization corruption cannot run work or be deleted as a partial lock', async () => {
  await scenario(`const {syncBuiltinESMExports}=await import('node:module');const original=fs.open;let ran=false;
    fs.open=async function(filename,flags,...args){const handle=await original.call(this,filename,flags,...args);
      if(filename===file&&flags==='wx+'){const sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();await fs.writeFile(file,'initial corruption');};}
      return handle;
    };syncBuiltinESMExports();
    await assert.rejects(lock(options,async()=>{ran=true;}),/release failed/);
    assert.equal(ran,false);assert.equal(await fs.readFile(file,'utf8'),'initial corruption');`);
});
