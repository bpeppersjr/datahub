import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {ManagedOperations} from './managed-operations.mjs';
import {ME_ASC_VERSION,ME_ASC_LIMITS,meClaims,meHash} from './me-asc-preflight-contract.mjs';
import {ME_POLICY_SHA256} from './me-asc-preflight-session.mjs';
const BASE=path.join(APP_ROOT,'data/managed-me-asc-tests');
async function workspace(){await mkdir(BASE,{recursive:true});return mkdtemp(path.join(BASE,'operation-'));}
async function cleanup(root,...managers){for(const m of managers)await m?.close();assert.equal(path.dirname(root),BASE);await rm(root,{recursive:true,force:true});}
async function terminal(manager,operation){await manager.running.get(operation.id)?.done;return manager.get(operation.id);}
// Fabricated native-shaped metadata tests binding/structure only, never source execution.
async function fixture(args,mutate=()=>{}){
 const page=(name=null,checkboxes=0,hidden=0)=>({labels:[],label_counts:{},known_label_occurrences:0,form_count:name?1:0,form_structure:name?[{known_name:name,post:true,controls:checkboxes+hidden+1,unnamed_controls:1,hidden_controls:hidden,checkbox_controls:checkboxes}]:[],table_count:1,structure_sha256:meHash('fixture structure')});
 const stamp=new Date().toISOString(),run=randomUUID(),directory=path.join(args[1],'jobs',run);
 const receipt={schema_version:ME_ASC_VERSION,execution_mode:'native-fetch',status:'schema-observed-not-collection-ready',started_at:stamp,finished_at:stamp,policy_sha256:ME_POLICY_SHA256,limits:ME_ASC_LIMITS,claims:meClaims(),requests:['initial','category','county','list','details','export'].map((step,index)=>({step,method:index<3?'GET':'POST',status:index===1?302:200,bytes:10,sha256:meHash('fixture body'),complete:true})),pages:{initial:page(),county:page('county_city',6,1),list:page('facility_list',2,2),details:{...page('get_excel'),labels:['Provider Type'],label_counts:{'Provider Type':2},known_label_occurrences:2},export:page()},counts:{list_rows:2,details_rows:2,export_rows:2,list_details_match:true,list_export_match:true},export_schema:{format:'html-table',rows:2,columns:2,known_labels:['Provider','City'],unknown_label_count:0,conservation_verified:false},session_controls:{csrf_forms:2,export_named_fields:0,unnamed_controls_omitted:true},cleanup_verified:true};
 mutate(receipt);await mkdir(directory,{recursive:true});const raw=JSON.stringify(receipt)+'\n';await writeFile(path.join(directory,'receipt.json'),raw);
 const manifest={schema_version:'me-asc-preflight-bundle@1.0.0',run_id:run,operation_id:args[3],receipt:{name:'receipt.json',bytes:Buffer.byteLength(raw),sha256:meHash(raw)}};
 const mr=JSON.stringify(manifest)+'\n',file=path.join(directory,'manifest.json');await writeFile(file,mr);
 return {run_id:run,operation_id:args[3],manifest:file,sha256:meHash(mr),status:receipt.status,execution_mode:receipt.execution_mode,cancellation_after_publication:false};
}
test('fixed managed Maine dispatch verifies metadata and keeps all readiness false and artifacts hidden',async()=>{
 const root=await workspace();let manager;
 try{manager=new ManagedOperations({root,executor:async({script,args,kind,cancelGraceMs})=>{assert.equal(kind,'source-prerequisite');assert.equal(script,'scripts/preflight-me-asc.mjs');assert.deepEqual([args[0],args[2]],['--output','--operation-id']);assert.equal(cancelGraceMs,75000);return {code:0,stdout:JSON.stringify(await fixture(args))};}});
  const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(done.status,'SUCCEEDED');assert.equal(done.result.receiptIntegrityVerified,true);
  for(const key of ['collectionReady','acquisitionReady','conservationVerified','publicExportAuthorized','statewideCompletenessVerified','currentOperationsVerified'])assert.equal(done.result[key],false);
  assert.deepEqual(done.artifacts,[]);assert.equal(await manager.artifact(done.id,'manifest.json'),null);assert.equal((await manager.catalog()).sourcePrerequisites.find(g=>g.sourceId==='me-asc-preflight').collectionReady,false);
 }finally{await cleanup(root,manager);}
});
test('wrong descriptors, synthetic mode, stale times and rehashed impossible metadata fail',async()=>{
 const root=await workspace();let manager;
 try{for(const change of [d=>({...d,operation_id:randomUUID()}),d=>({...d,run_id:randomUUID()}),d=>({...d,sha256:'0'.repeat(64)}),d=>({...d,manifest:path.join(root,'elsewhere.json')}),d=>({...d,extra:'PRIVATE'})]){
   manager=new ManagedOperations({root,executor:async({args})=>({code:0,stdout:JSON.stringify(change(await fixture(args)))})});const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(done.status,'FAILED');assert.equal(done.result.inspectionRequired,true);await manager.close();
  }
  for(const change of [r=>{r.execution_mode='injected-test-transport';},r=>{r.started_at='2020-01-01T00:00:00.000Z';r.finished_at=r.started_at;},r=>{r.requests[0].status=500;},r=>{delete r.pages.county;},r=>{r.cleanup_verified=false;}]){
   manager=new ManagedOperations({root,executor:async({args})=>{const d=await fixture(args,change);d.execution_mode='native-fetch';return {code:0,stdout:JSON.stringify(d)};}});const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(done.status,'FAILED');assert.equal(done.result.inspectionRequired,true);assert.ok(done.result.prerequisite);assert.equal(done.result.receiptIntegrityVerified,false);await manager.close();
  }
 }finally{await cleanup(root,manager);}
});
test('cancelled committed evidence, recovery, unresolved schema and nonzero child cannot succeed',async()=>{
 const root=await workspace();let manager,release;const gate=new Promise(resolve=>{release=resolve;});let entered;const ready=new Promise(resolve=>{entered=resolve;});
 try{
  manager=new ManagedOperations({root,executor:async({args})=>{const d=await fixture(args);entered();await gate;return {code:0,stdout:JSON.stringify(d)};}});
  const op=await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'});await ready;await assert.rejects(manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}),/already running/);await manager.cancel(op.id);release();const done=await terminal(manager,op);assert.equal(done.status,'CANCELLED');assert.ok(done.result.prerequisite);assert.equal(done.result.receiptIntegrityVerified,true);assert.equal(done.result.inspectionRequired,true);await manager.close();
  for(const mode of ['recovery','nonzero','late-cancel','unresolved','interrupted','mismatch']){manager=new ManagedOperations({root,executor:async({args})=>{const d=await fixture(args,r=>{if(['unresolved','interrupted','mismatch'].includes(mode))r.status='inspection-required';if(mode==='interrupted'){r.requests=r.requests.slice(0,1);r.pages={initial:r.pages.initial};r.counts={list_rows:null,details_rows:null,export_rows:null,list_details_match:false,list_export_match:false};r.export_schema=null;r.session_controls.csrf_forms=0;}});if(mode==='late-cancel')d.cancellation_after_publication=true;if(mode==='mismatch')d.status='schema-observed-not-collection-ready';return {code:mode==='nonzero'?1:0,stdout:JSON.stringify(mode==='recovery'?{recovery:d}:d)};}});
   const rejected=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(rejected.status,'FAILED');assert.equal(rejected.result.inspectionRequired,true);assert.ok(rejected.result.prerequisite);assert.deepEqual(rejected.artifacts,[]);assert.equal(await manager.artifact(rejected.id,'receipt.json'),null);if(mode==='interrupted'){assert.equal(rejected.result.status,'inspection-required');assert.equal(rejected.result.receiptIntegrityVerified,true);}await manager.close();}
 }finally{release();await cleanup(root,manager);}
});
test('worker failure and invalid options preserve false readiness without source fallback',async()=>{
 const root=await workspace();let manager;
 try{manager=new ManagedOperations({root,executor:async()=>{throw Error('SYNTHETIC_PRIVATE_ERROR');}});
  await assert.rejects(manager.startSourcePrerequisite({sourceId:'me-asc-preflight',url:'https://example.invalid/'}));
  const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(done.status,'FAILED');assert.equal(done.result.collectionReady,false);assert.equal(done.result.acquisitionReady,false);assert.equal(done.result.receiptIntegrityVerified,false);assert.deepEqual(done.artifacts,[]);assert.doesNotMatch(done.error,/SYNTHETIC_PRIVATE_ERROR/);
 }finally{await cleanup(root,manager);}
});
test('restart retains completed metadata and never retries interrupted ownership',async()=>{
 const root=await workspace();let manager,reloaded;
 try{manager=new ManagedOperations({root,executor:async({args})=>({code:0,stdout:JSON.stringify(await fixture(args))})});const done=await terminal(manager,await manager.startSourcePrerequisite({sourceId:'me-asc-preflight'}));assert.equal(done.status,'SUCCEEDED');await manager.close();
  const interrupted=randomUUID();await mkdir(path.join(root,interrupted));await writeFile(path.join(root,interrupted,'receipt.json'),JSON.stringify({id:interrupted,kind:'source-prerequisite',status:'RUNNING',createdAt:new Date().toISOString(),owner:{},details:{sourceId:'me-asc-preflight'},result:{},artifacts:[]}));
  reloaded=new ManagedOperations({root,executor:()=>assert.fail('no automatic retry')});assert.deepEqual((await reloaded.get(done.id)).result,done.result);assert.equal((await reloaded.get(interrupted)).status,'UNKNOWN');assert.equal(reloaded.running.size,0);await assert.rejects(reloaded.startSourcePrerequisite({sourceId:'me-asc-preflight'}),/unresolved ownership/);
 }finally{await cleanup(root,manager,reloaded);}
});
