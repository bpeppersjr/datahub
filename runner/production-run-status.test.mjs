import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir,mkdtemp,writeFile,readFile,rm,link,symlink } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { listProductionRunStatus } from './production-run-status.mjs';

const time='2026-09-08T09:46:24.268Z';
const receipt=(runId='run-a')=>({schemaVersion:1,mode:'production',runId,status:'RUNNING',startedAt:time,finishedAt:null,
  stopRequested:false,owner:{pid:1234,token:'SECRET'},error:'SECRET private source detail',
  outputs:{registry:{releaseId:'registry-release',manifestPath:'C:/SECRET/manifest.json'}},
  stages:[{id:'registry-build',status:'RUNNING',pid:4567,startedAt:time,finishedAt:null,log:'SECRET'}]});
async function fixture(t){const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/production-status-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function save(root,id,value){const dir=path.join(root,'data/reconciliations/production-runs',id);await mkdir(dir,{recursive:true});const file=path.join(dir,'receipt.json');await writeFile(file,JSON.stringify(value));return file;}

test('production status projects bounded receipt fields without writes or workflow actions',async t=>{
  const root=await fixture(t),file=await save(root,'run-a',receipt()),before=await readFile(file),pids=[];
  const result=await listProductionRunStatus({root,now:()=>time,inspectProcess:pid=>{pids.push(pid);return 'present';}});
  assert.deepEqual(pids,[1234]);assert.equal(result.runs.length,1);assert.equal(result.runs[0].completedStages,0);
  assert.equal(result.runs[0].controllerPresence,'present');assert.equal(result.runs[0].processIdentityVerified,false);
  assert.equal(result.runs[0].hasError,true);assert.doesNotMatch(JSON.stringify(result),/SECRET|1234|4567|manifestPath/);
  assert.deepEqual(await readFile(file),before);
  for(const inspectProcess of [()=> 'missing',()=>{throw Error('SECRET');},()=> 'untrusted']){
    const value=await listProductionRunStatus({root,inspectProcess});assert.equal(value.runs[0].status,'RUNNING');
    assert.ok(['missing','unknown'].includes(value.runs[0].controllerPresence));
  }
});
test('production status distinguishes empty, unreadable and truncated histories',async t=>{
  const root=await fixture(t);assert.equal((await listProductionRunStatus({root})).runs.length,0);
  for(const [id,date] of [['older','2026-09-07T00:00:00.000Z'],['newer',time]])await save(root,id,{...receipt(id),startedAt:date});
  await save(root,'invalid',{...receipt('invalid'),runId:'different'});
  const result=await listProductionRunStatus({root,limit:1,inspectProcess:()=> 'unknown'});
  assert.equal(result.runs[0].runId,'newer');assert.equal(result.omittedRuns,1);assert.equal(result.unavailableRuns,1);
  await assert.rejects(listProductionRunStatus({root,limit:100}));
});
test('production status refuses malformed, oversized, linked and mismatched evidence',async t=>{
  const root=await fixture(t);
  const bad=[{...receipt(),schemaVersion:2},{...receipt(),status:'SUCCESS'}, {...receipt(),startedAt:'not-a-time'},
    {...receipt(),stages:[...receipt().stages,...receipt().stages]}, {...receipt(),outputs:{registry:{releaseId:'../private'}}}];
  for(let i=0;i<bad.length;i++)await save(root,`bad-${i}`,{...bad[i],runId:`bad-${i}`});
  const oversized=await save(root,'oversized',receipt('oversized'));await writeFile(oversized,' '.repeat(262145));
  const invalid=await save(root,'invalid',receipt('invalid'));await writeFile(invalid,Buffer.from([255]));
  const hard=await save(root,'hard',receipt('hard'));await link(hard,path.join(root,'hard-copy'));
  const target=path.join(root,'alias-target');await mkdir(target);await writeFile(path.join(target,'receipt.json'),JSON.stringify(receipt('alias')));
  await symlink(target,path.join(root,'data/reconciliations/production-runs/alias'),'junction');
  const result=await listProductionRunStatus({root});assert.equal(result.runs.length,0);assert.equal(result.unavailableRuns,9);
});
test('production status retains terminal history without presenting it as a current release',async t=>{
  const root=await fixture(t),r=receipt();r.status='SUCCEEDED';r.error=null;r.finishedAt=time;r.stages[0].status='SUCCEEDED';r.stages[0].finishedAt=time;
  await save(root,'run-a',r);const result=await listProductionRunStatus({root,inspectProcess:()=>assert.fail('terminal must not probe PID')});
  assert.equal(result.runs[0].controllerPresence,'not-checked');assert.equal(result.runs[0].completedStages,1);
  assert.deepEqual(result.runs[0].outputs,[{group:'registry',releaseId:'registry-release'}]);
  assert.equal(Object.hasOwn(result.runs[0],'currentRelease'),false);
});
test('production status marks contradictory states and chronology unreadable',async t=>{
  const root=await fixture(t),cases=[
    r=>{r.status='SUCCEEDED';r.finishedAt=time;},
    r=>{r.stages[0].finishedAt=time;},
    r=>{r.stages[0].startedAt='2026-09-07T00:00:00.000Z';},
    r=>{r.status='FAILED';r.finishedAt='2026-09-07T00:00:00.000Z';r.stages[0].status='FAILED';r.stages[0].finishedAt=time;},
    r=>{r.stages[0].status='PENDING';r.stages[0].startedAt=null;r.stages.push({id:'registry-verify',status:'RUNNING',startedAt:time,finishedAt:null});}
  ];
  for(let i=0;i<cases.length;i++){const r=receipt(`case-${i}`);cases[i](r);await save(root,r.runId,r);}
  const result=await listProductionRunStatus({root});assert.equal(result.runs.length,0);assert.equal(result.unavailableRuns,cases.length);
});
