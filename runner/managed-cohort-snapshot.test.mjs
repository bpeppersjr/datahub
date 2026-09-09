import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {ManagedOperations} from './managed-operations.mjs';
import {projectRetainedChildcareCohortView,RETAINED_CHILDCARE_COHORT_STATES as STATES} from './retained-childcare-cohort-view.mjs';
import {COLLECTION_SUPERVISOR_CANCEL_GRACE_MS} from './collection-cancellation.mjs';

const BASE=path.join(APP_ROOT,'data/managed-snapshot-tests');
const digest=value=>createHash('sha256').update(value).digest('hex');
async function workspace(){await mkdir(BASE,{recursive:true});return mkdtemp(path.join(BASE,'operation-'));}
async function cleanup(root,...managers){for(const manager of managers)await manager?.close();assert.equal(path.dirname(root),BASE);await rm(root,{recursive:true,force:true});}
async function terminal(manager,operation){await manager.running.get(operation.id)?.done;return manager.get(operation.id);}
// Explicit fabricated zero-source artifact exercises the same reader; no native source replay is claimed by this fixture.
async function snapshot(args,mutate=()=>{}){
  const output=args[1],operationId=args[3],run=randomUUID(),directory=path.join(output,'jobs',run);await mkdir(directory,{recursive:true});
  const view=structuredClone(projectRetainedChildcareCohortView(Object.fromEntries(STATES.map(state=>[state,{status:'not-enrolled'}]))));
  view.claims.evidence_verification='source-specific-retained-enrollment-replay';
  const bytes=Buffer.from(JSON.stringify(view)+'\n');await writeFile(path.join(directory,'view.json'),bytes);
  const now=new Date().toISOString();
  const manifest={schema_version:'retained-childcare-cohort-snapshot@1.0.0',run_id:run,industry_run_id:operationId,execution_mode:'native-root-offline-build',input_root:'.',started_at:now,finished_at:now,view_version:view.schema_version,
    enrollments:STATES.map(state=>({state,path:`config/${state.toLowerCase()}-childcare-reporting-enrollment.json`,sha256:null,app_receipt_path:null,app_receipt_sha256:null})),available_source_count:0,unavailable_source_count:0,not_enrolled_source_count:7,
    artifacts:[{path:'view.json',bytes:bytes.length,sha256:digest(bytes)}],claims:{source_download_performed:false,national_pointers_changed:false,national_reporting_integrated:false,public_export_authorized:false,source_authenticity_verified:false,atomic_cross_source_snapshot_verified:false,export_policy:'internal'}};
  mutate(manifest);const raw=JSON.stringify(manifest)+'\n',file=path.join(directory,'manifest.json');await writeFile(file,raw);
  return {manifest_path:file,manifest_sha256:digest(raw),run_id:run,industry_run_id:operationId,execution_mode:manifest.execution_mode};
}
test('managed cohort snapshot executes fixed worker, verifies even injected executor, hides artifacts and survives reload',async()=>{
  const root=await workspace();let manager,reloaded;
  try{
    manager=new ManagedOperations({root,executor:async request=>{
      assert.equal(request.script,'scripts/build-retained-childcare-cohort-snapshot.mjs');assert.equal(request.kind,'cohort-snapshot');assert.equal(request.args[0],'--output');assert.equal(request.args[2],'--operation-id');assert.equal(request.cancelGraceMs,COLLECTION_SUPERVISOR_CANCEL_GRACE_MS);
      return {code:0,stdout:JSON.stringify(await snapshot(request.args))};
    }});
    const operation=await manager.startCohortSnapshot();const done=await terminal(manager,operation);
    assert.equal(done.status,'SUCCEEDED');assert.equal(done.result.snapshotIntegrityVerified,true);assert.equal(done.result.sourceReplayPerformedThisRead,false);assert.equal(done.result.notEnrolledSourceCount,7);assert.equal(done.result.inspectionRequired,false);assert.deepEqual(done.artifacts,[]);
    assert.equal(await manager.artifact(done.id,'view.json'),null);assert.ok(!Object.hasOwn(done.result,'view'));
    reloaded=new ManagedOperations({root,executor:()=>assert.fail('reload must not execute')});assert.equal((await reloaded.get(done.id)).kind,'cohort-snapshot');assert.equal((await reloaded.get(done.id)).status,'SUCCEEDED');
  }finally{await cleanup(root,manager,reloaded);}
});
test('managed cohort snapshot rejects all caller options and never bypasses descriptor integrity or fixture isolation',async()=>{
  const root=await workspace();let manager;
  try{
    manager=new ManagedOperations({root,executor:()=>assert.fail('invalid input must not execute')});
    for(const input of [null,{outputRoot:'PRIVATE'},{operationId:'PRIVATE'},Object.create({}),{[Symbol('PRIVATE')]:true}])await assert.rejects(manager.startCohortSnapshot(input),/no caller options/);
    await manager.close();
    const badCases=[async args=>({...await snapshot(args),manifest_sha256:'0'.repeat(64)}),async args=>({...await snapshot(args),industry_run_id:'other-operation'}),async args=>({...await snapshot(args),execution_mode:'fixture-root-offline-build'}),async args=>({...await snapshot(args),manifest_path:path.join(root,'borrowed','manifest.json')})];
    for(const produce of badCases){manager=new ManagedOperations({root,executor:async({args})=>({code:0,stdout:JSON.stringify(await produce(args))})});const done=await terminal(manager,await manager.startCohortSnapshot());assert.equal(done.status,'FAILED');assert.equal(done.result.inspectionRequired,true);assert.ok(done.result.snapshotIntegrityVerified!==true);await manager.close();}
  }finally{await cleanup(root,manager);}
});
test('managed cohort snapshot preserves CLI postcommit recovery envelope without declaring success',async()=>{
  const root=await workspace();let manager;
  try{
    manager=new ManagedOperations({root,executor:async({args})=>({code:1,stdout:JSON.stringify({status:'COMMITTED_REQUIRES_INSPECTION',committed_snapshot:await snapshot(args),committed_snapshot_integrity_verification_required:true})})});
    const done=await terminal(manager,await manager.startCohortSnapshot());assert.equal(done.status,'FAILED');assert.equal(done.result.snapshotIntegrityVerified,true);assert.equal(done.result.inspectionRequired,true);assert.ok(done.result.snapshot.manifest_path);
    const receipt=JSON.parse(await readFile(path.join(root,done.id,'receipt.json')));assert.deepEqual(receipt.result.snapshot,done.result.snapshot);
  }finally{await cleanup(root,manager);}
});
test('managed cohort snapshot cancellation retains committed descriptor, blocks overlap and leaves terminal cancelled',async()=>{
  const root=await workspace();let manager,release;const gate=new Promise(resolve=>{release=resolve;});let entered;const ready=new Promise(resolve=>{entered=resolve;});
  try{
    manager=new ManagedOperations({root,executor:async({args})=>{const value=await snapshot(args);entered();await gate;return {code:0,stdout:JSON.stringify(value)};}});
    const operation=await manager.startCohortSnapshot();await ready;await assert.rejects(manager.startCohortSnapshot(),/already running/);await manager.cancel(operation.id);release();
    const done=await terminal(manager,operation);assert.equal(done.status,'CANCELLED');assert.equal(done.result.snapshotIntegrityVerified,true);assert.equal(done.result.inspectionRequired,true);assert.ok(done.result.snapshot);assert.equal(done.result.cancellation.requested,true);
  }finally{release();await cleanup(root,manager);}
});
test('managed cohort snapshot restart does not rerun interrupted ownership',async()=>{
  const root=await workspace();let manager;
  try{
    const id=randomUUID();await mkdir(path.join(root,id));await writeFile(path.join(root,id,'receipt.json'),JSON.stringify({id,kind:'cohort-snapshot',status:'RUNNING',createdAt:new Date().toISOString(),owner:{supervisorPid:process.pid,childPid:process.pid},details:{},result:{},artifacts:[]}));
    manager=new ManagedOperations({root,executor:()=>assert.fail('unknown must not execute')});assert.equal((await manager.get(id)).status,'UNKNOWN');await assert.rejects(manager.startCohortSnapshot(),/unresolved ownership/);
  }finally{await cleanup(root,manager);}
});
