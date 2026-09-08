import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp,readFile,rm,access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { APP_ROOT } from './paths.mjs';
import { executeManagedChild } from './managed-operations.mjs';
import { COLLECTION_CHILD_CANCEL_GRACE_MS as CHILD, COLLECTION_SUPERVISOR_CANCEL_GRACE_MS as SUPERVISOR } from './collection-cancellation.mjs';
import { verifyDeBusinessLicenses } from './de-business-licenses.mjs';

test('collection cancellation nests explicit grace while exports retain their default',async()=>{
  assert.equal(CHILD,60000);assert.equal(SUPERVISOR,75000);assert.ok(SUPERVISOR>CHILD);
  const industry=await readFile(new URL('./industry-segments.mjs',import.meta.url),'utf8');
  const managed=await readFile(new URL('./managed-operations.mjs',import.meta.url),'utf8');
  assert.match(industry,/COLLECTION_CHILD_CANCEL_GRACE_MS/);assert.match(managed,/COLLECTION_SUPERVISOR_CANCEL_GRACE_MS/);
  await assert.rejects(async()=>executeManagedChild({script:'unused',args:[],signal:new AbortController().signal,cancelGraceMs:1}),/grace|cancel|Invalid/i);
});

test('real nested collection lets Delaware finish 16 seconds of postcommit work after IPC cancel', {timeout:45000},async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/nested-collection-')),controller=new AbortController();
  let supervisorPid,childPid,settled=false;
  const execution=executeManagedChild({script:'runner/fixtures/collection-cancellation-supervisor.mjs',args:[root],signal:controller.signal,cancelGraceMs:SUPERVISOR,onSpawn:pid=>{supervisorPid=pid;}});
  void execution.finally(()=>{settled=true;}).catch(()=>{});
  t.after(async()=>{
    controller.abort();
    if(!childPid)try{childPid=JSON.parse(await readFile(path.join(root,'child-pid.json'),'utf8')).pid;}catch{}
    // A prematurely exited supervisor does not prove its worker has exited.
    for(const pid of [childPid,supervisorPid])if(pid)try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    await execution.catch(()=>{});
    await rm(root,{recursive:true,force:true});
  });
  const deadline=Date.now()+15000;let ready;
  while(Date.now()<deadline){try{ready=JSON.parse(await readFile(path.join(root,'ready.json'),'utf8'));break;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}if(settled)break;await delay(25);}
  assert.ok(ready,'child must reach commit marker before cancellation');childPid=ready.pid;
  const started=Date.now();controller.abort();const result=await execution;
  assert.equal(result.code,0);assert.equal(result.forcedTerminationRequested,false);assert.ok(Date.now()-started>=16000);
  const completed=JSON.parse(await readFile(path.join(root,'completed.json'),'utf8'));
  assert.equal(completed.cancelled,true);await verifyDeBusinessLicenses(completed.manifest);
  await assert.rejects(access(path.join(completed.outputRoot,'.publish.lock')),{code:'ENOENT'});
  const supervisor=JSON.parse(await readFile(path.join(root,'supervisor.json'),'utf8'));assert.equal(supervisor.cancelled,true);
  const receipt=JSON.parse(await readFile(supervisor.receipt,'utf8'));assert.equal(receipt.tasks.length,1);assert.equal(receipt.tasks[0].signal,null);
  assert.equal(receipt.status,'cancelled');assert.equal(receipt.tasks[0].code,0);assert.equal(receipt.tasks[0].forcedTerminationRequested,false);
  assert.equal(receipt.tasks[0].cancellation.child_exit_succeeded,true);assert.equal(receipt.tasks[0].cancellation.output_state,'inspection-required');
  for(const pid of [childPid,supervisorPid])assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
