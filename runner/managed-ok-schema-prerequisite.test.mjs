import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { randomUUID,createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { ManagedOperations } from './managed-operations.mjs';
import { OK_CHILDCARE_SCHEMA_PROBE_CONTRACT as C,runOkChildcareSchemaProbeWithTestTransport } from './ok-childcare-schema-probe.mjs';
const BASE=path.join(APP_ROOT,'data/managed-ok-schema-tests');
const digest=x=>createHash('sha256').update(x).digest('hex');
async function workspace(){await mkdir(BASE,{recursive:true});return mkdtemp(path.join(BASE,'operation-'));}
async function cleanup(root,...managers){for(const manager of managers)await manager?.close();assert.equal(path.dirname(root),BASE);await rm(root,{recursive:true,force:true});}
async function terminal(manager,operation){await manager.running.get(operation.id)?.done;return manager.get(operation.id);}
// Deliberately native-shaped fabricated aggregate tests structural receipt validation, NOT native acquisition.
async function fixture(args,mutate=()=>{}){
  const payload={page:'/providers',query:{'zip-code':'73102','facility-type':'childcare-center'},props:{pageProps:{childcareProviders:[{facilityType:'childcare-center'}],mapCenter:null,route:[]}}};
  const receipt=await runOkChildcareSchemaProbeWithTestTransport(async url=>new Response(url===C.client_url?'Oklahoma schema probe synthetic client fixture v1':`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`,{headers:{'content-type':'text/html'}}));
  receipt.execution_mode='native-fetch';for(const request of [receipt.requests[0],receipt.requests[2]]){request.decoded_bytes=C.client_bytes;request.decoded_sha256=C.client_sha256;}
  const run=randomUUID(),directory=path.join(args[1],'jobs',run);await mkdir(directory,{recursive:true});
  const manifest={run_id:run,operation_id:args[3],...receipt};mutate(manifest);const raw=JSON.stringify(manifest),file=path.join(directory,'manifest.json');await writeFile(file,raw);
  return {run_id:run,manifest:file,sha256:digest(raw),status:receipt.status,cancellation_after_publication:false,operation_id:args[3]};
}
test('managed OK fixed dispatch independently verifies structural aggregate and hides artifacts',async()=>{
  const root=await workspace();let manager;
  try{manager=new ManagedOperations({root,executor:async({script,args,kind})=>{assert.equal(kind,'source-prerequisite');assert.equal(script,'scripts/probe-ok-childcare-schema.mjs');assert.deepEqual([args[0],args[2]],['--output','--operation-id']);return {code:0,stdout:JSON.stringify(await fixture(args))};}});
    const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}));assert.equal(done.status,'SUCCEEDED');assert.equal(done.result.receiptIntegrityVerified,true);assert.equal(done.result.collectionReady,false);assert.deepEqual(done.artifacts,[]);assert.equal(await manager.artifact(done.id,'manifest.json'),null);
  }finally{await cleanup(root,manager);}
});
test('wrong operation, fake hash and injected paths cannot bypass reader',async()=>{
  const root=await workspace();let manager;
  try{for(const mutate of [x=>({...x,operation_id:'wrong'}),x=>({...x,sha256:'0'.repeat(64)}),x=>({...x,manifest:path.join(root,'other.json')}),x=>({...x,extra:'PRIVATE'})]){manager=new ManagedOperations({root,executor:async({args})=>({code:0,stdout:JSON.stringify(mutate(await fixture(args)))})});const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}));assert.equal(done.status,'FAILED');assert.equal(done.result.inspectionRequired,true);await manager.close();}}
  finally{await cleanup(root,manager);}
});
test('cancellation preserves committed descriptor and nonzero child never succeeds',async()=>{
  const root=await workspace();let manager,release;const gate=new Promise(resolve=>{release=resolve;});let entered;const ready=new Promise(resolve=>{entered=resolve;});
  try{manager=new ManagedOperations({root,executor:async({args})=>{const d=await fixture(args);entered();await gate;return {code:0,stdout:JSON.stringify(d)};}});const op=await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'});await ready;await assert.rejects(manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}),/already running/);await manager.cancel(op.id);release();const done=await terminal(manager,op);assert.equal(done.status,'CANCELLED');assert.ok(done.result.prerequisite);assert.equal(done.result.inspectionRequired,true);await manager.close();
    manager=new ManagedOperations({root,executor:async({args})=>({code:1,stdout:JSON.stringify(await fixture(args))})});assert.equal((await terminal(manager,await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}))).status,'FAILED');
  }finally{release();await cleanup(root,manager);}
});
test('synthetic execution mode and recovered corrupt receipt fail with retained reference',async()=>{
  const root=await workspace();let manager;
  try{for(const recovery of [false,true]){manager=new ManagedOperations({root,executor:async({args})=>{const descriptor=await fixture(args,m=>{m.execution_mode='injected-test-transport';});return {code:recovery?1:0,stdout:JSON.stringify(recovery?{recovery:descriptor}:descriptor)};}});const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}));assert.equal(done.status,'FAILED');assert.ok(done.result.prerequisite);assert.equal(done.result.receiptIntegrityVerified,false);assert.equal(done.result.inspectionRequired,true);await manager.close();}}
  finally{await cleanup(root,manager);}
});
test('restart preserves completed prerequisite and never retries interrupted ownership',async()=>{
  const root=await workspace();let manager,reloaded;
  try{
    manager=new ManagedOperations({root,executor:async({args})=>({code:0,stdout:JSON.stringify(await fixture(args))})});
    const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'ok-childcare-schema'}));assert.equal(done.status,'SUCCEEDED');await manager.close();
    const interrupted=randomUUID();await mkdir(path.join(root,interrupted));await writeFile(path.join(root,interrupted,'receipt.json'),JSON.stringify({id:interrupted,kind:'source-prerequisite',status:'RUNNING',createdAt:new Date().toISOString(),owner:{},details:{sourceId:'ok-childcare-schema'},result:{},artifacts:[]}));
    reloaded=new ManagedOperations({root,executor:()=>assert.fail('restart must not retry source')});
    const retained=await reloaded.get(done.id);assert.equal(retained.status,'SUCCEEDED');assert.deepEqual(retained.result,done.result);assert.deepEqual(retained.artifacts,[]);
    const abandoned=await reloaded.get(interrupted);assert.equal(abandoned.status,'UNKNOWN');assert.equal(reloaded.running.size,0);await assert.rejects(reloaded.startSourcePrerequisite({sourceId:'ok-childcare-schema'}),/unresolved ownership/);
  }finally{await cleanup(root,manager,reloaded);}
});
