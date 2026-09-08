import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,mkdir,link,unlink,readdir,statfs} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {assertCoChildcareAcquisitionConfiguration} from './co-childcare-acquisition.mjs';
import {buildCoChildcareAcquiredRelease,buildCoChildcareAcquiredReleaseWithTransport,readCoChildcareAcquiredEvidence} from './co-childcare-acquired-release.mjs';
import {buildCoChildcareNormalizedRelease,readCoChildcareNormalizedRelease} from './co-childcare-normalized-release.mjs';

export const CO_CHILDCARE_APP_VERSION='co-childcare-app@1.0.0';
export const CO_CHILDCARE_APP_CONTRACT_SHA256='1579283a2d6eac8681e6d515f0daa9c1afc74cd21f4c10f14320fcb3b66d3955';
const NORMALIZATION='c199eea013611813efa93fd08952592223c904dc8dce3cf6d99fd736fff5b5c8';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=v=>createHash('sha256').update(v).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v)+'\n');
const check=v=>{if(!v)throw Object.assign(Error('Colorado app evidence rejected.'),{code:'CO_CHILDCARE_APP_REJECTED'});};
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const claims=()=>({export_policy:'internal',public_export_authorized:false,national_reporting_integrated:false,native_execution_independently_verified:false,source_authenticity_verified:false,scheduled:false,physical_site_verified:false,identity_matching_eligible:false,address_role:'physical-address-as-reported-in-licensing-application',source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,current_operations_verified:false,coordinates_selected:false});
const incomplete=()=>Object.assign(Error('Colorado app output requires inspection; preserve retained evidence before retry.'),{code:'CO_CHILDCARE_APP_INCOMPLETE'});
function opts(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined||v.signal instanceof AbortSignal);}
async function config(signal){const acquisition=await assertCoChildcareAcquisitionConfiguration(signal);check(hash(JSON.stringify(await readJson(path.join(APP_ROOT,'config/connectors/co-childcare-centers-normalization.json'),100000,signal)))===NORMALIZATION);check(hash(JSON.stringify(await readJson(path.join(APP_ROOT,'config/connectors/co-childcare-centers-app.json'),100000,signal)))===CO_CHILDCARE_APP_CONTRACT_SHA256);return {app_sha256:CO_CHILDCARE_APP_CONTRACT_SHA256,normalization_sha256:NORMALIZATION,...acquisition};}
async function snapshot(file,signal){const meter={};const value=await readJson(file,100000,signal,meter);return {value,meter};}
async function unchanged(file,initial,signal){const final=await snapshot(file,signal);check(same(final.value,initial.value)&&final.meter.sha256===initial.meter.sha256&&final.meter.identity.ino===initial.meter.identity.ino&&final.meter.identity.dev===initial.meter.identity.dev&&final.meter.identity.ctimeNs===initial.meter.identity.ctimeNs);}
async function rejectNestedAppWork(root){
  for(let current=root;current!==APP_ROOT;current=path.dirname(current)){
    check(path.dirname(current)!==current);
    if(UUID.test(path.basename(current))&&path.basename(path.dirname(current))==='runs'){
      const start=path.join(path.dirname(path.dirname(current)),'jobs',path.basename(current),'start.json');
      const exists=await lstat(start).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});check(!exists);
    }
  }
}
async function write(file,value){await canonical(path.dirname(file));const temp=file+'.tmp',h=await open(temp,'wx');let initial;try{initial=await h.stat({bigint:true});await h.writeFile(encode(value));await h.sync();}finally{await h.close();}const read=await snapshot(temp);check(same(read.value,value)&&read.meter.identity.ino===initial.ino&&read.meter.identity.dev===initial.dev);const final=await lstat(temp,{bigint:true});check(final.size===read.meter.identity.size&&final.ctimeNs===read.meter.identity.ctimeNs&&final.mtimeNs===read.meter.identity.mtimeNs);await link(temp,file);await unlink(temp);return read.meter.sha256;}
function terminal(start,startHash,acquired,normalized,finishedAt){return {schema_version:CO_CHILDCARE_APP_VERSION,run_id:start.run_id,industry_run_id:start.industry_run_id,status:'SUCCEEDED',execution_mode:start.execution_mode,started_at:start.started_at,finished_at:finishedAt,start_sha256:startHash,configuration:start.configuration,acquired,normalized,claims:claims()};}
async function inspect(receiptPath,signal,candidate=false){
  const configuration=await config(signal);signal?.throwIfAborted();check(typeof receiptPath==='string'&&receiptPath===path.resolve(receiptPath)&&path.basename(receiptPath)===(candidate?'candidate.json':'receipt.json'));
  const directory=path.dirname(receiptPath),id=path.basename(directory),root=path.dirname(path.dirname(directory));check(UUID.test(id)&&path.basename(path.dirname(directory))==='jobs');await canonical(directory);const identity=await lstat(directory,{bigint:true});
  const receipt=await snapshot(receiptPath,signal),start=await snapshot(path.join(directory,'start.json'),signal),acq=await snapshot(path.join(directory,'acquired.json'),signal),norm=await snapshot(path.join(directory,'normalized.json'),signal);
  const s=start.value;check(s.schema_version===CO_CHILDCARE_APP_VERSION&&s.run_id===id&&same(s.configuration,configuration)&&time(s.started_at)&&['fixed-native-fetch','injected-test-transport','retained-local-verification'].includes(s.execution_mode));
  check(s.industry_run_id===null||typeof s.industry_run_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(s.industry_run_id));
  check(same(Object.keys(s).sort(),['schema_version','run_id','industry_run_id','execution_mode','started_at','configuration','retained_acquired'].sort()));
  const a=await readCoChildcareAcquiredEvidence(acq.value.verification.manifest_path,{signal}),n=await readCoChildcareNormalizedRelease(norm.value.verification.manifest_path,{signal});
  check(same(acq.value.verification,a.verification)&&same(norm.value.verification,n.verification));
  for(const item of [acq.value,norm.value])check(same(Object.keys(item).sort(),['retained_at','verification'])&&time(item.retained_at));
  check(acq.value.retained_at>=s.started_at&&acq.value.retained_at>=a.evidence.finished_at&&n.manifest.processed_at>=acq.value.retained_at&&norm.value.retained_at>=acq.value.retained_at&&norm.value.retained_at>=n.manifest.processed_at);
  check(same(n.manifest.acquired,{manifest_path:a.verification.manifest_path,manifest_sha256:a.verification.manifest_sha256,run_id:a.verification.run_id,execution_mode:a.verification.execution_mode}));
  check(n.verification.manifest_path===path.join(root,'runs',id,'normalized','jobs',n.verification.run_id,'manifest.json'));
  if(s.execution_mode==='retained-local-verification')check(same(s.retained_acquired,a.verification)&&a.evidence.finished_at<=s.started_at);
  else check(s.retained_acquired===null&&a.verification.execution_mode===s.execution_mode&&a.evidence.started_at>=s.started_at&&a.verification.manifest_path===path.join(root,'runs',id,'acquired','jobs',a.verification.run_id,'manifest.json'));
  check(time(receipt.value.finished_at)&&receipt.value.finished_at>=norm.value.retained_at&&same(receipt.value,terminal(s,start.meter.sha256,a.verification,n.verification,receipt.value.finished_at)));
  const roster=['start.json','acquired.json','normalized.json',path.basename(receiptPath)].sort();check(same((await readdir(directory)).sort(),roster));
  for(const [name,value]of [[path.basename(receiptPath),receipt],['start.json',start],['acquired.json',acq],['normalized.json',norm]])await unchanged(path.join(directory,name),value,signal);
  check(same((await readCoChildcareAcquiredEvidence(a.verification.manifest_path,{signal})).verification,a.verification)&&same((await readCoChildcareNormalizedRelease(n.verification.manifest_path,{signal})).verification,n.verification));
  await canonical(directory);const final=await lstat(directory,{bigint:true});check(final.ino===identity.ino&&final.dev===identity.dev&&same((await readdir(directory)).sort(),roster));await config(signal);
  return {status:'verified',receiptPath,receipt:receipt.value,receipt_sha256:receipt.meter.sha256};
}
export async function verifyCoChildcareAppJob(receiptPath,options={}){opts(options,['signal']);return inspect(receiptPath,options.signal);}
export async function runCoChildcareAppJob(options={}){opts(options,['outputRoot','signal','industryRunId','acquiredManifestPath']);return run(options,options.acquiredManifestPath===undefined?'fixed-native-fetch':'retained-local-verification');}
export async function runCoChildcareAppJobWithTransport(options={}){opts(options,['outputRoot','signal','industryRunId','fetchImpl','now','logger']);check(typeof options.fetchImpl==='function'&&(options.now===undefined||typeof options.now==='function')&&(options.logger===undefined||typeof options.logger==='function'));return run(options,'injected-test-transport');}
async function run(options,mode){
  const controller=new AbortController(),deadline=performance.now()+1_800_000,parent=options.signal;const abort=()=>controller.abort(parent.reason);if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
  const expire=()=>controller.abort(Object.assign(Error('Colorado app deadline exceeded.'),{code:'CO_CHILDCARE_APP_DEADLINE'}));const timer=setTimeout(expire,1_800_000),signal=controller.signal;
  const checkpoint=()=>{if(performance.now()>=deadline&&!signal.aborted)expire();signal.throwIfAborted();};
  let lock,lockIdentity,lockPath,lockValue,directory,directoryIdentity,start,startHash,acquired=null,normalized=null,committed=false,publisher,publisherIdentity,publisherValue,publisherPath;
  async function owned(file,identity){if(!identity)return false;try{await canonical(path.dirname(file));const s=await lstat(file,{bigint:true});return s.dev===identity.dev&&s.ino===identity.ino&&!s.isSymbolicLink()&&(identity.isDirectory()?s.isDirectory():s.isFile()&&s.nlink===1n);}catch{return false;}}
  const assertOwned=async()=>check(await owned(directory,directoryIdentity)&&await owned(lockPath,lockIdentity)&&same(await readJson(lockPath,1000),lockValue)&&(!publisher||await owned(publisherPath,publisherIdentity)&&same(await readJson(publisherPath,1000),publisherValue)));
  try{
    checkpoint();const configuration=await config(signal);const industry=options.industryRunId??null;check(industry===null||typeof industry==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(industry));
    const retained=mode==='retained-local-verification'?await readCoChildcareAcquiredEvidence(options.acquiredManifestPath,{signal}):null;
    const root=options.outputRoot??path.join(APP_ROOT,'data/business-sources/co-childcare/app');check(typeof root==='string'&&root===path.resolve(root)&&!path.relative(APP_ROOT,root).split(path.sep).some(p=>p.toLowerCase()==='jobs'));await canonical(root,{output:true,signal});await rejectNestedAppWork(root);await canonical(root,{output:true,create:true,signal});
    const disk=await statfs(root,{bigint:true});check(disk.bavail*disk.bsize>=1_000_000_000n);checkpoint();lockPath=path.join(root,'.owner.lock');lock=await open(lockPath,'wx');lockIdentity=await lock.stat({bigint:true});lockValue={run_id:randomUUID(),pid:process.pid};await lock.writeFile(encode(lockValue));await lock.sync();
    const id=lockValue.run_id;await canonical(path.join(root,'jobs'),{output:true,create:true,signal});directory=path.join(root,'jobs',id);await mkdir(directory);directoryIdentity=await lstat(directory,{bigint:true});
    start={schema_version:CO_CHILDCARE_APP_VERSION,run_id:id,industry_run_id:industry,execution_mode:mode,started_at:new Date().toISOString(),configuration,retained_acquired:retained?.verification??null};await assertOwned();startHash=await write(path.join(directory,'start.json'),start);
    const work=path.join(root,'runs',id);checkpoint();
    if(mode==='fixed-native-fetch'){
      const publisherRoot=path.join(APP_ROOT,'data/business-sources/co-childcare/runtime');await canonical(publisherRoot,{create:true,output:true,signal});publisherPath=path.join(publisherRoot,'publisher.lock');
      try{publisher=await open(publisherPath,'wx');}catch(error){if(error.code==='EEXIST')throw Object.assign(Error('Colorado publisher ownership requires inspection.'),{code:'CO_CHILDCARE_PUBLISHER_BUSY'});throw error;}publisherIdentity=await publisher.stat({bigint:true});publisherValue={run_id:id,pid:process.pid};check(publisherIdentity.isFile()&&publisherIdentity.nlink===1n);await publisher.writeFile(encode(publisherValue));await publisher.sync();checkpoint();
    }
    acquired=retained?.verification??await (mode==='fixed-native-fetch'?buildCoChildcareAcquiredRelease({outputRoot:path.join(work,'acquired'),signal}):buildCoChildcareAcquiredReleaseWithTransport({outputRoot:path.join(work,'acquired'),signal,fetchImpl:options.fetchImpl,...(options.now?{now:options.now}:{})}));
    await assertOwned();await write(path.join(directory,'acquired.json'),{retained_at:new Date().toISOString(),verification:acquired});if(options.logger)await options.logger({phase:'acquired-checkpoint'});checkpoint();
    normalized=await buildCoChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:path.join(work,'normalized'),signal});await assertOwned();await write(path.join(directory,'normalized.json'),{retained_at:new Date().toISOString(),verification:normalized});if(options.logger)await options.logger({phase:'normalized-checkpoint'});checkpoint();
    const receipt=terminal(start,startHash,acquired,normalized,new Date().toISOString());await write(path.join(directory,'candidate.json'),receipt);const candidate=await snapshot(path.join(directory,'candidate.json'),signal);await inspect(path.join(directory,'candidate.json'),signal,true);await config(signal);await assertOwned();await unchanged(path.join(directory,'candidate.json'),candidate,signal);checkpoint();await link(path.join(directory,'candidate.json'),path.join(directory,'receipt.json'));committed=true;await unlink(path.join(directory,'candidate.json'));
    await inspect(path.join(directory,'receipt.json'));return {receiptPath:path.join(directory,'receipt.json'),receipt};
  }catch(error){
    let errorCode;try{const descriptor=Object.getOwnPropertyDescriptor(error??{},'code');if(descriptor&&Object.hasOwn(descriptor,'value'))errorCode=descriptor.value;}catch{/* Untrusted injected failures cannot supply receipt fields. */}
    const codes=['CO_CHILDCARE_PUBLICATION_INCOMPLETE','CO_CHILDCARE_NORMALIZATION_INCOMPLETE','CO_CHILDCARE_APP_DEADLINE','CO_CHILDCARE_APP_REJECTED','CO_CHILDCARE_PUBLISHER_BUSY','CO_CHILDCARE_DEFERRED','CO_CHILDCARE_PREFLIGHT_FAILED','CO_CHILDCARE_ACQUISITION_FAILED'];const code=codes.includes(errorCode)?errorCode:signal.aborted?'CO_CHILDCARE_APP_CANCELLED':'CO_CHILDCARE_APP_FAILED';
    if(committed)throw incomplete();
    if(startHash){try{await assertOwned();const receipt={...terminal(start,startHash,acquired,normalized,new Date().toISOString()),status:signal.aborted?'CANCELLED':'FAILED',error_code:code,output_state:'inspection-required'};await write(path.join(directory,'receipt.json'),receipt);}catch{throw incomplete();}}
    throw Object.assign(Error('Colorado app did not complete; preserve and inspect retained evidence before retry.'),{code});
  }finally{
    clearTimeout(timer);parent?.removeEventListener('abort',abort);
    let cleanupFailed=false;
    for(const [handle,file,identity,value]of [[publisher,publisherPath,publisherIdentity,publisherValue],[lock,lockPath,lockIdentity,lockValue]])if(handle){try{await handle.close();}catch{cleanupFailed=true;}try{check(await owned(file,identity)&&same(await readJson(file,1000),value));await unlink(file);}catch{cleanupFailed=true;}}
    if(cleanupFailed)throw incomplete();
  }
}
