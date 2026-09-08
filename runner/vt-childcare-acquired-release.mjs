import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, link, unlink, rmdir, readdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { acquireVtChildcareWithTransport, acquireVtChildcareNative, replayVtChildcareAcquisition, assertVtChildcareAcquisitionConfiguration } from './vt-childcare-acquisition.mjs';

const VERSION='vt-childcare-acquired-release@1.0.0';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAXIMUM=200_000_000;
const bytes=value=>Buffer.from(JSON.stringify(value)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const check=value=>{if(!value)throw Error('Vermont acquired evidence rejected.');};
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Reflect.ownKeys(value).sort(),[...keys].sort());
function optionsOnly(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).every(key=>keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));check(value.signal===undefined||value.signal instanceof AbortSignal);}
const journalName=index=>`journal-${String(index).padStart(4,'0')}.json`;
const descriptor=(name,value)=>({path:name,bytes:bytes(value).length,sha256:hash(bytes(value))});
const claims=()=>({native_execution_independently_verified:false,source_authenticity_verified:false,public_export_authorized:false,national_reporting_integrated:false,app_enrolled:false,scheduled:false,physical_site_verified:false,identity_matching_eligible:false,address_role:'reported-address-role-unspecified',source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,current_operations_verified:false,exact_address_geocodes_verified:false,coordinates_selected:false});
const inspection=()=>Object.assign(Error('Vermont acquisition publication may exist; preserve evidence and inspect before retry.'),{code:'VT_CHILDCARE_PUBLICATION_INCOMPLETE'});
async function derive(prerequisite,evidence,journal,signal){
  const replayed=await replayVtChildcareAcquisition(evidence,{signal});
  check(exact(prerequisite,['preflight','retained_at'])&&same(prerequisite.preflight,evidence.before_preflight)&&time(prerequisite.retained_at)&&prerequisite.retained_at>=evidence.before_preflight.finished_at);
  check(journal.length===evidence.observations.length&&journal.length<=512);
  let prior=prerequisite.retained_at;
  for(const [index,entry]of journal.entries()){
    signal?.throwIfAborted();
    check(exact(entry,['sequence','observation','retained_at'])&&entry.sequence===index&&same(entry.observation,evidence.observations[index])&&time(entry.retained_at)
      &&entry.observation.observed_at>=prior&&entry.retained_at>=entry.observation.observed_at);prior=entry.retained_at;
  }
  check(evidence.after_preflight.started_at>=prior);
  return replayed;
}
function manifestFor(runId,mode,replayed,artifacts){check(replayed.execution_mode===mode);return {schema_version:VERSION,run_id:runId,status:'acquired-evidence-only',execution_mode:mode,source:replayed.source,record_count:replayed.features.length,claims:claims(),artifacts};}

export async function readVtChildcareAcquiredEvidence(manifestPath,options={}){
  optionsOnly(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  await assertVtChildcareAcquisitionConfiguration(signal);
  check(typeof manifestPath==='string'&&manifestPath===path.resolve(manifestPath)&&path.basename(manifestPath)==='manifest.json');
  const directory=path.dirname(manifestPath),runId=path.basename(directory);check(UUID.test(runId)&&path.basename(path.dirname(directory))==='jobs');
  await canonical(directory,{signal});
  const directoryIdentity=await lstat(directory,{bigint:true});check(directoryIdentity.isDirectory());
  const meter={},manifest=await readJson(manifestPath,250000,signal,meter);
  check(exact(manifest,['schema_version','run_id','status','execution_mode','source','record_count','claims','artifacts'])&&manifest.schema_version===VERSION&&manifest.run_id===runId
    &&['fixed-native-fetch','injected-test-transport'].includes(manifest.execution_mode)&&Array.isArray(manifest.artifacts)&&manifest.artifacts.length<=514);
  const retained=new Map();let total=0;
  async function artifact(name,maximum){
    const entry=manifest.artifacts.find(item=>item.path===name);check(exact(entry,['path','bytes','sha256']));
    const seen={},value=await readJson(path.join(directory,name),maximum,signal,seen),raw=bytes(value);
    total+=seen.bytes;check(total<=MAXIMUM*2+4_000_000&&seen.bytes===raw.length&&seen.sha256===hash(raw)&&same(entry,descriptor(name,value)));
    retained.set(name,{value,meter:seen});return value;
  }
  const prerequisite=await artifact('prerequisite.json',4_000_000),evidence=await artifact('acquisition.json',MAXIMUM);
  check(evidence.execution_mode===manifest.execution_mode);
  check(Array.isArray(evidence.observations)&&evidence.observations.length<=512);
  const journal=[];let journalBytes=0;
  for(let index=0;index<evidence.observations.length;index++){
    const entry=await artifact(journalName(index),8_100_000);journalBytes+=bytes(entry).length;check(journalBytes<=MAXIMUM);journal.push(entry);
  }
  const roster=[...retained.keys(),'manifest.json'].sort();check(same((await readdir(directory)).sort(),roster));
  const replayed=await derive(prerequisite,evidence,journal,signal);
  check(same(manifest,manifestFor(runId,manifest.execution_mode,replayed,[...retained].map(([name,{value}])=>descriptor(name,value)))));
  for(const [name,{value,meter:initial}]of retained){const final={};check(same(await readJson(path.join(directory,name),initial.bytes,signal,final),value)&&final.sha256===initial.sha256&&final.identity.ino===initial.identity.ino&&final.identity.dev===initial.identity.dev&&final.identity.ctimeNs===initial.identity.ctimeNs);}
  const final={};check(same(await readJson(manifestPath,250000,signal,final),manifest)&&final.sha256===meter.sha256&&final.identity.ino===meter.identity.ino&&final.identity.dev===meter.identity.dev&&final.identity.ctimeNs===meter.identity.ctimeNs&&same((await readdir(directory)).sort(),roster));
  await canonical(directory,{signal});const finalDirectory=await lstat(directory,{bigint:true});check(finalDirectory.isDirectory()&&finalDirectory.ino===directoryIdentity.ino&&finalDirectory.dev===directoryIdentity.dev);
  await assertVtChildcareAcquisitionConfiguration(signal);
  signal?.throwIfAborted();
  return {evidence,verification:{status:'verified',storage_state:'immutable-acquisition-evidence',run_id:runId,manifest_path:manifestPath,manifest_sha256:meter.sha256,record_count:replayed.features.length,execution_mode:manifest.execution_mode,...claims()}};
}

export const verifyVtChildcareAcquiredEvidence=readVtChildcareAcquiredEvidence;

export async function buildVtChildcareAcquiredReleaseWithTransport(options={}){
  optionsOnly(options,['fetchImpl','outputRoot','signal','now']);check(typeof options.fetchImpl==='function');return build(options,'injected-test-transport');
}
export async function buildVtChildcareAcquiredRelease(options={}){
  optionsOnly(options,['outputRoot','signal']);return build(options,'fixed-native-fetch');
}
async function build(options,mode){
  const {signal,now=()=>new Date(),outputRoot=path.join(APP_ROOT,'data/business-sources/vt-childcare/acquired')}=options;
  check(typeof now==='function'&&typeof outputRoot==='string'&&outputRoot===path.resolve(outputRoot));signal?.throwIfAborted();
  await assertVtChildcareAcquisitionConfiguration(signal);
  await canonical(outputRoot,{output:true,signal});await canonical(outputRoot,{create:true,output:true,signal});
  const disk=await statfs(outputRoot,{bigint:true});check(disk.bavail*disk.bsize>=500_000_000n);
  const lockPath=path.join(outputRoot,'.owner.lock'),lock=await open(lockPath,'wx');let lockIdentity;
  const runId=randomUUID(),lockValue={run_id:runId,pid:process.pid},ownedFiles=new Map(),directory=path.join(outputRoot,'jobs',runId);
  let directoryIdentity,committed=false,failure,prerequisite;const journal=[];let journalBytes=0;const pendingRetention=new Set();
  const retain=work=>{const pending=Promise.resolve().then(work);pendingRetention.add(pending);void pending.finally(()=>pendingRetention.delete(pending)).catch(()=>{});return pending;};
  const stamp=()=>{const at=now().toISOString();check(time(at));return at;};
  async function owned(file,identity){if(!identity)return false;try{await canonical(path.dirname(file));const s=await lstat(file,{bigint:true});return !s.isSymbolicLink()&&s.ino===identity.ino&&s.dev===identity.dev&&(identity.isDirectory()?s.isDirectory():s.isFile()&&s.nlink===1n);}catch{return false;}}
  async function ownLock(){return await owned(lockPath,lockIdentity)&&same(await readJson(lockPath,1000),lockValue);}
  async function assertOwned(){check(await owned(directory,directoryIdentity)&&await ownLock());}
  async function stage(name,value,maximum){
    signal?.throwIfAborted();await assertOwned();const raw=bytes(value);check(raw.length<=maximum);
    const temporary=path.join(directory,`${name}.tmp-${randomUUID()}`),destination=path.join(directory,name),handle=await open(temporary,'wx');let identity;
    try{identity=await handle.stat({bigint:true});ownedFiles.set(temporary,identity);await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const m={};check(same(await readJson(temporary,maximum,signal,m),value)&&m.sha256===hash(raw)&&await owned(temporary,identity));
    await assertOwned();const final=await lstat(temporary,{bigint:true});check(await owned(temporary,identity)&&final.size===m.identity.size&&final.mtimeNs===m.identity.mtimeNs&&final.ctimeNs===m.identity.ctimeNs);signal?.throwIfAborted();await link(temporary,destination);ownedFiles.set(destination,identity);if(name==='manifest.json')committed=true;
    await unlink(temporary);ownedFiles.delete(temporary);check(await owned(destination,identity));
  }
  try{
    lockIdentity=await lock.stat({bigint:true});check(lockIdentity.nlink===1n);await lock.writeFile(bytes(lockValue));await lock.sync();
    await canonical(path.join(outputRoot,'jobs'),{create:true,output:true,signal});await mkdir(directory);directoryIdentity=await lstat(directory,{bigint:true});
    const callbacks={signal,...(mode==='injected-test-transport'?{fetchImpl:options.fetchImpl,now}:{}),
      retainPrerequisite:value=>retain(async()=>{check(prerequisite===undefined);prerequisite={preflight:structuredClone(value),retained_at:stamp()};await stage('prerequisite.json',prerequisite,4_000_000);await assertOwned();}),
      retainObservation:(value,index)=>retain(async()=>{check(prerequisite&&index===journal.length&&index<512);const entry={sequence:index,observation:structuredClone(value),retained_at:stamp()};journalBytes+=bytes(entry).length;check(journalBytes<=MAXIMUM);await stage(journalName(index),entry,8_100_000);journal.push(entry);await assertOwned();})};
    const evidence=await(mode==='fixed-native-fetch'?acquireVtChildcareNative(callbacks):acquireVtChildcareWithTransport(callbacks));
    check(evidence.execution_mode===mode);
    const replayed=await derive(prerequisite,evidence,journal,signal);await stage('acquisition.json',evidence,MAXIMUM);
    const artifacts=[descriptor('prerequisite.json',prerequisite),descriptor('acquisition.json',evidence),...journal.map((entry,index)=>descriptor(journalName(index),entry))];
    // Recheck durable callback receipts before declaring a complete acquisition.
    for(const entry of artifacts){const m={};await readJson(path.join(directory,entry.path),entry.bytes,signal,m);check(m.sha256===entry.sha256);}
    await assertVtChildcareAcquisitionConfiguration(signal);
    await stage('manifest.json',manifestFor(runId,mode,replayed,artifacts),250000);
    const {verification}=await readVtChildcareAcquiredEvidence(path.join(directory,'manifest.json'));
    await assertOwned();return verification;
  }catch(error){
    // Defensively drain all owned filesystem work before cleanup or releasing
    // exclusion, even if a future engine path returns before a sink settles.
    await Promise.allSettled([...pendingRetention]);
    failure=committed?inspection():error;
    if(signal?.aborted&&!committed&&await owned(directory,directoryIdentity)&&await ownLock().catch(()=>false)){
      try{
        for(const [file,identity]of ownedFiles)if(await owned(file,identity))await unlink(file);
        if((await readdir(directory)).length===0&&await owned(directory,directoryIdentity))await rmdir(directory);
      }catch{failure=inspection();}
    }
    throw failure;
  }finally{
    let cleanupFailure;try{await lock.close();}catch(error){cleanupFailure=error;}
    try{check(await ownLock());await unlink(lockPath);}catch(error){cleanupFailure??=error;}
    if(cleanupFailure)throw inspection();
  }
}
