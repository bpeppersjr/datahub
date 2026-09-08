import path from 'node:path';
import process from 'node:process';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';

const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const releaseId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const stages = ['registry-build','registry-verify','resolution-build','resolution-verify','benchmark-build','benchmark-verify','coverage-build','coverage-verify'];
const states = new Set(['PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED']);
const terminal = new Set(['SUCCEEDED','FAILED','STOPPED']);
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const check = (ok) => { if (!ok) throw new Error('Production status evidence is unavailable or invalid.'); };
const same = (a,b) => ['dev','ino','size','mtimeMs','ctimeMs','nlink'].every(k=>a[k]===b[k]);

async function canonical(root, file) {
  const relative=path.relative(root,file);check(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  let current=root;
  for(const piece of relative.split(path.sep)){current=path.join(current,piece);check(path.resolve(await realpath(current))===current);}
  return file;
}
async function readReceipt(root,file) {
  await canonical(root,file);
  const before=await lstat(file);check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size<=262144);
  const handle=await open(file,'r');
  try {
    check(same(before,await handle.stat()));
    const bytes=Buffer.alloc(262145);let size=0;
    while(size<bytes.length){const read=await handle.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
    check(size<=262144&&size===before.size&&same(before,await handle.stat())&&same(before,await lstat(file)));
    await canonical(root,file);
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
  } finally {await handle.close();}
}
function presence(pid) {
  if(!Number.isSafeInteger(pid)||pid<1)return 'unknown';
  try {process.kill(pid,0);return 'present';} catch(error){return error.code==='ESRCH'?'missing':'unknown';}
}
function summary(value,runId,inspectProcess) {
  check(value?.schemaVersion===1&&value.mode==='production'&&value.runId===runId&&id.test(runId)
    &&(value.status==='RUNNING'||terminal.has(value.status))&&timestamp(value.startedAt)
    &&(value.status==='RUNNING'?value.finishedAt===null:timestamp(value.finishedAt))
    &&typeof value.stopRequested==='boolean'&&Array.isArray(value.stages)&&value.stages.length>=1&&value.stages.length<=8);
  let prior=-1;
  let boundary=false,previousFinish=value.startedAt;
  const steps=value.stages.map(s=>{
    const index=stages.indexOf(s.id);check(index>prior&&states.has(s.status));prior=index;
    check((s.startedAt===null||timestamp(s.startedAt))&&(s.finishedAt===null||timestamp(s.finishedAt)));
    if(s.status==='PENDING'||s.status==='SKIPPED')check(s.startedAt===null&&s.finishedAt===null);
    else {
      check(!boundary&&timestamp(s.startedAt)&&s.startedAt>=previousFinish);
      if(s.status==='RUNNING')check(s.finishedAt===null);
      else {check(timestamp(s.finishedAt)&&s.finishedAt>=s.startedAt);previousFinish=s.finishedAt;}
    }
    if(s.status!=='SUCCEEDED')boundary=true;
    return {id:s.id,status:s.status,startedAt:s.startedAt,finishedAt:s.finishedAt};
  });
  if(value.status==='RUNNING')check(steps.every(s=>['SUCCEEDED','RUNNING','PENDING'].includes(s.status)));
  else {
    check(value.finishedAt>=previousFinish&&steps.every(s=>!['RUNNING','PENDING'].includes(s.status)));
    if(value.status==='SUCCEEDED')check(steps.every(s=>s.status==='SUCCEEDED')&&!value.error);
    if(value.status==='STOPPED')check(steps.every(s=>s.status!=='FAILED'));
  }
  const outputs=[];
  for(const group of ['registry','resolution','benchmark','coverage']){
    const output=value.outputs?.[group];if(!output)continue;
    check(releaseId.test(output.releaseId??''));outputs.push({group,releaseId:output.releaseId});
  }
  let controllerPresence='not-checked';
  if(value.status==='RUNNING'){
    try {controllerPresence=inspectProcess(value.owner?.pid);} catch{controllerPresence='unknown';}
    if(!['present','missing','unknown'].includes(controllerPresence))controllerPresence='unknown';
  }
  return {runId,status:value.status,startedAt:value.startedAt,finishedAt:value.finishedAt,stopRequested:value.stopRequested,
    completedStages:steps.filter(s=>s.status==='SUCCEEDED').length,totalStages:steps.length,stages:steps,outputs,
    hasError:typeof value.error==='string'&&value.error.length>0,controllerPresence,processIdentityVerified:false};
}

/** Small receipt-only projection. Never follows output paths, reads logs, changes
 * receipts, retries jobs, or treats PID presence as verified process identity. */
export async function listProductionRunStatus({root=APP_ROOT,limit=20,inspectProcess=presence,now=()=>new Date().toISOString()}={}) {
  root=path.resolve(root);check(path.resolve(await realpath(root))===root&&Number.isInteger(limit)&&limit>=1&&limit<=50);
  const directory=path.join(root,'data/reconciliations/production-runs');
  const runs=[];let unavailableRuns=0,scanned=0;
  try {await canonical(root,directory);} catch(error){if(error.code==='ENOENT')return {inspectedAt:now(),runs,unavailableRuns:0,omittedRuns:0};throw error;}
  for await(const entry of await opendir(directory)){
    check(++scanned<=500);
    if(!id.test(entry.name)||!entry.isDirectory()){unavailableRuns++;continue;}
    try {runs.push(summary(await readReceipt(root,path.join(directory,entry.name,'receipt.json')),entry.name,inspectProcess));}
    catch {unavailableRuns++;}
  }
  await canonical(root,directory);
  runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||a.runId.localeCompare(b.runId));
  return {inspectedAt:now(),runs:runs.slice(0,limit),unavailableRuns,omittedRuns:Math.max(0,runs.length-limit)};
}
