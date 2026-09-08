import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, link, unlink, rmdir, readdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionReadLines as readLines, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';
import { readVtChildcareAcquiredEvidence } from './vt-childcare-acquired-release.mjs';
import { normalizeVtChildcareAcquisition } from './vt-childcare-normalization.mjs';

export const VT_CHILDCARE_NORMALIZED_RELEASE_VERSION='vt-childcare-normalized-release@1.0.0';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMITS={'normalized.jsonl':200_000_000,'quarantine.jsonl':30_000_000,'summary.json':1_000_000};
const PINS={connector_sha256:'0dc5abfd7adc46e1cc872ce1bbfed05b019b986699efb7b1367e48f6192bad8c',policy_sha256:'7c4ec65ca5b61260cf0cb52e30c2755aefcf8523db0ca3217b21bd464f7271ff'};
const encode=value=>Buffer.from(JSON.stringify(value)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const check=value=>{if(!value)throw Error('Vermont normalized release rejected.');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Reflect.ownKeys(value).sort(),[...keys].sort());
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function optionsOnly(options,keys){check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(key=>keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')));check(options.signal===undefined||options.signal instanceof AbortSignal);}
async function configuration(signal){
  for(const [file,pin]of [['config/connectors/vt-childcare-centers-normalization.json',PINS.connector_sha256],['config/source-policies/vt-childcare-centers-internal.json',PINS.policy_sha256]])check(hash(JSON.stringify(await readJson(path.join(APP_ROOT,file),100000,signal)))===pin);
}
const claims=()=>({export_policy:'internal',source_authenticity_verified:false,native_execution_independently_verified:false,public_export_authorized:false,national_reporting_integrated:false,app_enrolled:false,scheduled:false,physical_site_verified:false,identity_matching_eligible:false,address_role:'reported-address-role-unspecified',source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,current_operations_verified:false,exact_address_geocodes_verified:false,source_state_inferred:false,reporting_period_verified:false});
const inspection=()=>Object.assign(Error('Vermont normalization output may exist; preserve and inspect retained evidence before retry.'),{code:'VT_CHILDCARE_NORMALIZATION_INCOMPLETE'});
const sourceBinding=input=>({manifest_path:input.verification.manifest_path,manifest_sha256:input.verification.manifest_sha256,run_id:input.verification.run_id,execution_mode:input.verification.execution_mode});
function manifestFor(runId,processedAt,input,summary,artifacts){return {schema_version:VT_CHILDCARE_NORMALIZED_RELEASE_VERSION,run_id:runId,status:'normalized-internal-evidence',source_release_id:`vt-childcare-acquisition-${input.verification.run_id}`,processed_at:processedAt,configuration:{...PINS},acquired:sourceBinding(input),summary,claims:claims(),artifacts};}
async function replay(input,runId,processedAt,signal){
  check(time(processedAt)&&processedAt>=input.evidence.finished_at);
  return normalizeVtChildcareAcquisition(input.evidence,{runId,sourceReleaseId:`vt-childcare-acquisition-${input.verification.run_id}`,processedAt},{signal});
}
async function inspect(manifestPath,signal,candidate=false){
  await configuration(signal);signal?.throwIfAborted();
  check(typeof manifestPath==='string'&&manifestPath===path.resolve(manifestPath)&&path.basename(manifestPath)===(candidate?'.manifest.tmp':'manifest.json'));
  const directory=path.dirname(manifestPath),runId=path.basename(directory);check(UUID.test(runId)&&path.basename(path.dirname(directory))==='jobs');
  await canonical(directory,{signal});const identity=await lstat(directory,{bigint:true});check(identity.isDirectory());
  const meter={},manifest=await readJson(manifestPath,2_000_000,signal,meter);
  check(exact(manifest,['schema_version','run_id','status','source_release_id','processed_at','configuration','acquired','summary','claims','artifacts'])&&manifest.run_id===runId&&exact(manifest.acquired,['manifest_path','manifest_sha256','run_id','execution_mode'])&&Array.isArray(manifest.artifacts)&&manifest.artifacts.length===3);
  const input=await readVtChildcareAcquiredEvidence(manifest.acquired.manifest_path,{signal});check(same(manifest.acquired,sourceBinding(input)));
  const normalized=await replay(input,runId,manifest.processed_at,signal);
  const arrays={'normalized.jsonl':normalized.records,'quarantine.jsonl':normalized.quarantine,'summary.json':[normalized.summary]},artifacts=[],snapshots=new Map();
  for(const [name,values]of Object.entries(arrays)){
    check(Array.isArray(values));const m={};let index=0;
    for await(const value of readLines(path.join(directory,name),LIMITS[name],signal,m)){check(index<values.length&&same(value,values[index]));index++;}
    check(index===values.length);const expected=Buffer.concat(values.map(encode));check(expected.length===m.bytes&&hash(expected)===m.sha256);
    artifacts.push({path:name,bytes:m.bytes,sha256:m.sha256,records:index});snapshots.set(name,m);
  }
  check(same(manifest,manifestFor(runId,manifest.processed_at,input,normalized.summary,artifacts)));
  const roster=[...Object.keys(LIMITS),path.basename(manifestPath)].sort();check(same((await readdir(directory)).sort(),roster));
  const finalInput=await readVtChildcareAcquiredEvidence(manifest.acquired.manifest_path,{signal});check(same(finalInput.verification,input.verification)&&same(finalInput.evidence,input.evidence));
  for(const [name,initial]of snapshots){const m={};for await(const value of readLines(path.join(directory,name),LIMITS[name],signal,m))void value;check(m.sha256===initial.sha256&&m.bytes===initial.bytes&&m.identity.ino===initial.identity.ino&&m.identity.dev===initial.identity.dev&&m.identity.ctimeNs===initial.identity.ctimeNs);}
  const final={};check(same(await readJson(manifestPath,2_000_000,signal,final),manifest)&&final.sha256===meter.sha256&&final.identity.ino===meter.identity.ino&&final.identity.dev===meter.identity.dev&&final.identity.ctimeNs===meter.identity.ctimeNs);
  await canonical(directory,{signal});const after=await lstat(directory,{bigint:true});check(after.isDirectory()&&after.ino===identity.ino&&after.dev===identity.dev&&same((await readdir(directory)).sort(),roster));
  await configuration(signal);signal?.throwIfAborted();
  return {manifest,verification:{status:'verified',storage_state:candidate?'unpublished-candidate':'immutable-normalized-evidence',run_id:runId,manifest_path:manifestPath,manifest_sha256:meter.sha256,acquired_manifest_sha256:input.verification.manifest_sha256,record_count:normalized.records.length,quarantine_count:normalized.quarantine.length,...claims()},records:normalized.records,quarantine:normalized.quarantine,summary:normalized.summary};
}
export async function readVtChildcareNormalizedRelease(manifestPath,options={}){optionsOnly(options,['signal']);return inspect(manifestPath,options.signal);}
export const verifyVtChildcareNormalizedRelease=readVtChildcareNormalizedRelease;

export async function buildVtChildcareNormalizedRelease(acquiredManifestPath,options={}){
  optionsOnly(options,['outputRoot','signal','processedAt']);const {signal,outputRoot=path.join(APP_ROOT,'data/business-sources/vt-childcare/normalized')}=options;
  signal?.throwIfAborted();await configuration(signal);
  const input=await readVtChildcareAcquiredEvidence(acquiredManifestPath,{signal}),processedAt=options.processedAt??new Date().toISOString();check(time(processedAt)&&processedAt>=input.evidence.finished_at);
  check(typeof outputRoot==='string'&&outputRoot===path.resolve(outputRoot)&&!path.relative(APP_ROOT,outputRoot).split(path.sep).some(part=>part.toLowerCase()==='jobs'));
  const relative=path.relative(path.dirname(acquiredManifestPath),outputRoot);check(relative.startsWith('..')||path.isAbsolute(relative));
  await canonical(outputRoot,{output:true,signal});await canonical(outputRoot,{create:true,output:true,signal});
  const disk=await statfs(outputRoot,{bigint:true});check(disk.bavail*disk.bsize>=500_000_000n);
  const lockPath=path.join(outputRoot,'.owner.lock'),lock=await open(lockPath,'wx'),runId=randomUUID(),directory=path.join(outputRoot,'jobs',runId),ownedFiles=new Map();
  let lockIdentity,directoryIdentity,committed=false,failure;const lockValue={run_id:runId,pid:process.pid};
  async function owned(file,identity){if(!identity)return false;try{await canonical(path.dirname(file));const s=await lstat(file,{bigint:true});return !s.isSymbolicLink()&&s.ino===identity.ino&&s.dev===identity.dev&&(identity.isDirectory()?s.isDirectory():s.isFile()&&s.nlink===1n);}catch{return false;}}
  const ownLock=async()=>await owned(lockPath,lockIdentity)&&same(await readJson(lockPath,1000),lockValue);
  const assertOwned=async()=>check(await owned(directory,directoryIdentity)&&await ownLock());
  async function stage(name,values,maximum){
    await assertOwned();const out=await writer(path.join(directory,name),maximum,signal,ownedFiles);
    try{for(const value of values){signal?.throwIfAborted();check(encode(value).length<=65536);await out.write(value);}return await out.finish();}finally{await out.close();}
  }
  try{
    lockIdentity=await lock.stat({bigint:true});check(lockIdentity.nlink===1n);await lock.writeFile(encode(lockValue));await lock.sync();
    await canonical(path.join(outputRoot,'jobs'),{create:true,output:true,signal});await mkdir(directory);directoryIdentity=await lstat(directory,{bigint:true});
    const normalized=await replay(input,runId,processedAt,signal);
    const artifacts=[];for(const [name,values]of [['normalized.jsonl',normalized.records],['quarantine.jsonl',normalized.quarantine],['summary.json',[normalized.summary]]])artifacts.push(await stage(name,values,LIMITS[name]));
    const manifest=manifestFor(runId,processedAt,input,normalized.summary,artifacts);await stage('.manifest.tmp',[manifest],2_000_000);
    await inspect(path.join(directory,'.manifest.tmp'),signal,true);await configuration(signal);await assertOwned();
    const candidate={},reread=await readJson(path.join(directory,'.manifest.tmp'),2_000_000,signal,candidate);check(same(reread,manifest));
    const final=await lstat(path.join(directory,'.manifest.tmp'),{bigint:true});check(await owned(path.join(directory,'.manifest.tmp'),ownedFiles.get(path.join(directory,'.manifest.tmp')))&&final.size===candidate.identity.size&&final.mtimeNs===candidate.identity.mtimeNs&&final.ctimeNs===candidate.identity.ctimeNs);
    signal?.throwIfAborted();await link(path.join(directory,'.manifest.tmp'),path.join(directory,'manifest.json'));committed=true;
    await unlink(path.join(directory,'.manifest.tmp'));ownedFiles.delete(path.join(directory,'.manifest.tmp'));
    const result=await inspect(path.join(directory,'manifest.json'));await assertOwned();return result.verification;
  }catch(error){
    failure=committed?inspection():error;
    if(signal?.aborted&&!committed&&await owned(directory,directoryIdentity)&&await ownLock().catch(()=>false))try{
      for(const [file,identity]of ownedFiles)if(await owned(file,identity))await unlink(file);
      if((await readdir(directory)).length===0&&await owned(directory,directoryIdentity))await rmdir(directory);
    }catch{failure=inspection();}
    throw failure;
  }finally{
    let cleanupFailure;try{await lock.close();}catch(error){cleanupFailure=error;}
    try{check(await ownLock());await unlink(lockPath);}catch(error){cleanupFailure??=error;}
    if(cleanupFailure)throw inspection();
  }
}
