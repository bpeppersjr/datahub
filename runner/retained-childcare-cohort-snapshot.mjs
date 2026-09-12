import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,lstat,open,link,unlink,rmdir,readdir,statfs} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {buildRetainedChildcareCohortView,validateRetainedChildcareCohortView,RETAINED_CHILDCARE_COHORT_VIEW_VERSION,RETAINED_CHILDCARE_COHORT_STATES as STATES} from './retained-childcare-cohort-view.mjs';
import {loadRestrictedChildcareSamples,validateRestrictedChildcareSamples,RESTRICTED_SAMPLE_INPUTS} from './retained-childcare-restricted-samples.mjs';

export const RETAINED_CHILDCARE_COHORT_SNAPSHOT_VERSION='retained-childcare-cohort-snapshot@1.0.0';
export const RETAINED_CHILDCARE_RESTRICTED_SNAPSHOT_VERSION='retained-childcare-cohort-snapshot@2.0.0';
const VIEW_MAX=32000000,MANIFEST_MAX=100000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const check=value=>{if(!value)throw Error('Retained childcare snapshot rejected.');};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const rel=file=>path.relative(APP_ROOT,file).replaceAll('\\','/');
const contained=(base,target)=>{const r=path.relative(base,target);return r!==''&&!r.startsWith('..')&&!path.isAbsolute(r);};
const temporaryPath=target=>target===path.join(APP_ROOT,'data/tmp')||contained(path.join(APP_ROOT,'data/tmp'),target);
const identity=(a,b)=>a.ino===b.ino&&a.dev===b.dev;
const directoryIdentity=(a,b)=>a.isDirectory()&&b.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&identity(a,b);
const fileIdentity=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&b.nlink===1n&&identity(a,b);
function options(value,allowed){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).every(key=>allowed.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));check(value.signal===undefined||value.signal instanceof AbortSignal);value.signal?.throwIfAborted();}
function exact(value,required){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===required.length&&required.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));}
const claims=()=>({source_download_performed:false,national_pointers_changed:false,national_reporting_integrated:false,public_export_authorized:false,source_authenticity_verified:false,atomic_cross_source_snapshot_verified:false,export_policy:'internal'});
function rootIdentity(root,synthetic){
  check(typeof root==='string'&&root===path.resolve(root));
  if(synthetic)check(contained(path.join(APP_ROOT,'data/tmp'),root));else check(root===APP_ROOT);
  return root===APP_ROOT?'.':rel(root);
}
async function bindings(root,signal){
  const entries=[];
  for(const state of STATES){
    signal?.throwIfAborted();const file=path.join(root,`config/${state.toLowerCase()}-childcare-reporting-enrollment.json`),meter={};let value;
    try{value=await readJson(file,10000,signal,meter);}catch(error){if(error.code!=='ENOENT')throw error;entries.push({state,path:rel(file),sha256:null,app_receipt_path:null,app_receipt_sha256:null});continue;}
    exact(value,['schema_version','app_receipt_path','app_receipt_sha256']);check(value.schema_version===`${state.toLowerCase()}-childcare-reporting-enrollment@1.0.0`&&sha(value.app_receipt_sha256));
    check(typeof value.app_receipt_path==='string'&&value.app_receipt_path.startsWith('data/')&&value.app_receipt_path.split('/').every(part=>part&&!['.','..'].includes(part)&&!/[\\:\u0000-\u001f]/u.test(part)));
    entries.push({state,path:rel(file),sha256:meter.sha256,app_receipt_path:rel(path.resolve(root,value.app_receipt_path)),app_receipt_sha256:value.app_receipt_sha256});
  }
  return entries;
}
function checkBindings(entries,view,inputRoot){
  check(Array.isArray(entries)&&entries.length===STATES.length);
  for(const [index,state]of STATES.entries()){
    const item=entries[index],cohort=view.cohorts[state][0];exact(item,['state','path','sha256','app_receipt_path','app_receipt_sha256']);
    check(item.state===state&&item.path===rel(path.join(inputRoot,`config/${state.toLowerCase()}-childcare-reporting-enrollment.json`)));
    if(cohort.status==='not-enrolled')check(item.sha256===null&&item.app_receipt_path===null&&item.app_receipt_sha256===null);
    else{
      check(sha(item.sha256)&&item.sha256===cohort.enrollment_sha256&&sha(item.app_receipt_sha256)&&typeof item.app_receipt_path==='string');
      const receipt=path.resolve(APP_ROOT,item.app_receipt_path);check(contained(path.join(inputRoot,'data'),receipt)&&rel(receipt)===item.app_receipt_path&&!item.app_receipt_path.split('/').some(part=>!part||['.','..'].includes(part)||/[\\:]/u.test(part)));
      if(cohort.status==='available')check(cohort.provenance.app_receipt_sha256===item.app_receipt_sha256);
    }
  }
}
function descriptor(manifestPath,manifestSha256,manifest){return {manifest_path:manifestPath,manifest_sha256:manifestSha256,run_id:manifest.run_id,industry_run_id:manifest.industry_run_id,execution_mode:manifest.execution_mode};}
async function inspect(manifestPath,expectedHash,signal,candidate=false,verifyRestrictedSources=true){
  check(typeof manifestPath==='string'&&manifestPath===path.resolve(manifestPath)&&path.basename(manifestPath)===(candidate?'manifest.tmp':'manifest.json')&&sha(expectedHash));
  const directory=path.dirname(manifestPath),id=path.basename(directory);check(UUID.test(id)&&path.basename(path.dirname(directory))==='jobs'&&contained(path.join(APP_ROOT,'data'),directory));
  await canonical(directory,{signal});const owner=await lstat(directory,{bigint:true}),mm={},vm={};
  const manifest=await readJson(manifestPath,MANIFEST_MAX,signal,mm);check(mm.sha256===expectedHash);
  exact(manifest,['schema_version','run_id','industry_run_id','execution_mode','input_root','started_at','finished_at','view_version','enrollments','available_source_count','unavailable_source_count','not_enrolled_source_count','artifacts','claims']);
  const restricted=manifest.schema_version===RETAINED_CHILDCARE_RESTRICTED_SNAPSHOT_VERSION;
  check((restricted||manifest.schema_version===RETAINED_CHILDCARE_COHORT_SNAPSHOT_VERSION)&&manifest.run_id===id&&['native-root-offline-build','fixture-root-offline-build'].includes(manifest.execution_mode)&&manifest.view_version===RETAINED_CHILDCARE_COHORT_VIEW_VERSION&&same(manifest.claims,claims()));
  if(restricted)check(manifest.execution_mode==='native-root-offline-build');
  check(manifest.industry_run_id===null||typeof manifest.industry_run_id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(manifest.industry_run_id));
  check(time(manifest.started_at)&&time(manifest.finished_at)&&manifest.finished_at>=manifest.started_at);
  check(typeof manifest.input_root==='string');const inputRoot=path.resolve(APP_ROOT,manifest.input_root);check(rootIdentity(inputRoot,manifest.execution_mode==='fixture-root-offline-build')===manifest.input_root);
  if(manifest.execution_mode==='fixture-root-offline-build')check(temporaryPath(directory));else check(!temporaryPath(directory));
  check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length===(restricted?2:1));const artifact=manifest.artifacts[0];exact(artifact,['path','bytes','sha256']);check(artifact.path==='view.json'&&Number.isSafeInteger(artifact.bytes)&&artifact.bytes>0&&artifact.bytes<=VIEW_MAX&&sha(artifact.sha256));
  const rawView=await readJson(path.join(directory,'view.json'),VIEW_MAX,signal,vm);check(vm.bytes===artifact.bytes&&vm.sha256===artifact.sha256);
  const view=validateRetainedChildcareCohortView(rawView);check(same(view,rawView)&&view.claims.evidence_verification==='source-specific-retained-enrollment-replay');
  checkBindings(manifest.enrollments,view,inputRoot);
  const entries=Object.values(view.cohorts).flat();
  for(const [status,key]of [['available','available_source_count'],['unavailable','unavailable_source_count'],['not-enrolled','not_enrolled_source_count']])check(manifest[key]===entries.filter(entry=>entry.status===status).length);
  check(view.claims.artifact_verification_performed===(manifest.available_source_count>0));
  let samples,sampleMeter;
  if(restricted){
    const sampleArtifact=manifest.artifacts[1];exact(sampleArtifact,['path','bytes','sha256']);check(sampleArtifact.path==='restricted-samples.json'&&Number.isSafeInteger(sampleArtifact.bytes)&&sampleArtifact.bytes>0&&sampleArtifact.bytes<=100000&&sha(sampleArtifact.sha256));
    sampleMeter={};samples=validateRestrictedChildcareSamples(await readJson(path.join(directory,sampleArtifact.path),100000,signal,sampleMeter));check(sampleMeter.sha256===sampleArtifact.sha256&&sampleMeter.bytes===sampleArtifact.bytes);
    // This generation is a derivative of one immutable seven-source snapshot, not a new national build.
    const base=await inspect(path.join(APP_ROOT,RESTRICTED_SAMPLE_INPUTS.base_manifest),RESTRICTED_SAMPLE_INPUTS.base_sha256,signal);
    check(base.manifest.schema_version===RETAINED_CHILDCARE_COHORT_SNAPSHOT_VERSION&&same(view,base.view)&&same(manifest.enrollments,base.manifest.enrollments));
    check(manifest.started_at>=base.manifest.finished_at&&samples.groups.every(group=>manifest.started_at>=group.normalized_at));
    // Independently reproduce the projection from pinned, verified normalized inputs; rehashing false content is insufficient.
    if(verifyRestrictedSources)check(same(samples,await loadRestrictedChildcareSamples({signal})));
  }
  const roster=['view.json',...(restricted?['restricted-samples.json']:[]),path.basename(manifestPath)].sort();check(same((await readdir(directory)).sort(),roster));
  const finalView={},finalManifest={};await readJson(path.join(directory,'view.json'),VIEW_MAX,signal,finalView);await readJson(manifestPath,MANIFEST_MAX,signal,finalManifest);
  check(finalView.sha256===vm.sha256&&fileIdentity(vm.identity,finalView.identity)&&finalManifest.sha256===mm.sha256&&fileIdentity(mm.identity,finalManifest.identity));
  if(restricted){const finalSample={};await readJson(path.join(directory,'restricted-samples.json'),100000,signal,finalSample);check(finalSample.sha256===sampleMeter.sha256&&fileIdentity(sampleMeter.identity,finalSample.identity));}
  await canonical(directory,{signal});check(directoryIdentity(owner,await lstat(directory,{bigint:true}))&&same((await readdir(directory)).sort(),roster));signal?.throwIfAborted();
  return {manifest,view:restricted?{...view,restricted_samples:samples}:view,verification:{...descriptor(manifestPath,expectedHash,manifest),snapshot_integrity_verified:true,source_replay_performed_this_read:restricted&&verifyRestrictedSources,recorded_build_verification:{finished_at:manifest.finished_at,scope:restricted?'pinned-seven-source-snapshot-reuse-and-restricted-sample-projection':'historical-source-specific-retained-enrollment-replay',available_source_count:manifest.available_source_count}}};
}
export async function readRetainedChildcareCohortSnapshot(manifestPath,expectedManifestSha256,value={}){
  options(value,['signal','verifyRestrictedSources']);check(value.verifyRestrictedSources===undefined||typeof value.verifyRestrictedSources==='boolean');
  try{return await inspect(manifestPath,expectedManifestSha256,value.signal,false,value.verifyRestrictedSources!==false);}catch{throw Error('Retained childcare snapshot integrity verification failed.');}
}
async function build(value,synthetic){
  options(value,synthetic?['root','outputRoot','industryRunId','signal']:['outputRoot','industryRunId','signal','includeRetainedSamples']);
  check(value.includeRetainedSamples===undefined||value.includeRetainedSamples===true);
  const restricted=value.includeRetainedSamples===true;
  const root=synthetic?value.root:APP_ROOT,inputRoot=rootIdentity(root,synthetic),outputRoot=value.outputRoot??path.join(APP_ROOT,'data/retained-childcare-cohorts'),industryRunId=value.industryRunId??null,signal=value.signal;
  check(typeof outputRoot==='string'&&outputRoot===path.resolve(outputRoot)&&contained(path.join(APP_ROOT,'data'),outputRoot)&&!path.relative(APP_ROOT,outputRoot).split(path.sep).some(part=>part.toLowerCase()==='jobs'));
  if(synthetic)check(contained(path.join(APP_ROOT,'data/tmp'),outputRoot));else check(!temporaryPath(outputRoot));
  check(industryRunId===null||typeof industryRunId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(industryRunId));
  if(root!==APP_ROOT)await canonical(root,{signal});await canonical(outputRoot,{create:true,output:true,signal});
  const disk=await statfs(outputRoot,{bigint:true});check(disk.bavail*disk.bsize>=64000000n);
  const lockPath=path.join(outputRoot,'.owner.lock'),lock=await open(lockPath,'wx');let lockOwner,owner,directory,published=false,committedDescriptor;
  const failure=()=>Object.assign(Error('Retained childcare snapshot build failed; preserve any committed snapshot for inspection.'),published?{code:'RETAINED_CHILDCARE_SNAPSHOT_COMMITTED_REQUIRES_INSPECTION',committed_snapshot:committedDescriptor,committed_snapshot_integrity_verification_required:true}:{});
  const runId=randomUUID(),owned=new Map(),handles=[];const lockValue={run_id:runId,pid:process.pid};
  async function owns(file,prior){if(!prior)return false;try{await canonical(path.dirname(file));const current=await lstat(file,{bigint:true});return prior.isDirectory()?directoryIdentity(prior,current):fileIdentity(prior,current);}catch{return false;}}
  const checkOwner=async()=>check(await owns(lockPath,lockOwner)&&same(await readJson(lockPath,1000),lockValue)&&await owns(directory,owner));
  async function stage(name,data,cap){await checkOwner();const out=await writer(path.join(directory,name),cap,signal,owned);handles.push(out);await out.write(data);const written=await out.finish();return {path:name,bytes:written.bytes,sha256:written.sha256};}
  try{
    lockOwner=await lock.stat({bigint:true});check(lockOwner.nlink===1n);await lock.writeFile(JSON.stringify(lockValue)+'\n');await lock.sync();
    await canonical(path.join(outputRoot,'jobs'),{create:true,output:true,signal});directory=path.join(outputRoot,'jobs',runId);await mkdir(directory);owner=await lstat(directory,{bigint:true});
    const startedAt=new Date().toISOString();
    const base=restricted?await inspect(path.join(APP_ROOT,RESTRICTED_SAMPLE_INPUTS.base_manifest),RESTRICTED_SAMPLE_INPUTS.base_sha256,signal):null;
    const before=base?base.manifest.enrollments:await bindings(root,signal);
    const view=base?base.view:await buildRetainedChildcareCohortView({root,signal});validateRetainedChildcareCohortView(view);checkBindings(before,view,root);
    if(!restricted)check(same(await bindings(root,signal),before));const artifact=await stage('view.json',view,VIEW_MAX),entries=Object.values(view.cohorts).flat();
    const artifacts=[artifact];if(restricted)artifacts.push(await stage('restricted-samples.json',await loadRestrictedChildcareSamples({signal}),100000));
    const manifest={schema_version:restricted?RETAINED_CHILDCARE_RESTRICTED_SNAPSHOT_VERSION:RETAINED_CHILDCARE_COHORT_SNAPSHOT_VERSION,run_id:runId,industry_run_id:industryRunId,execution_mode:synthetic?'fixture-root-offline-build':'native-root-offline-build',input_root:inputRoot,started_at:startedAt,finished_at:new Date().toISOString(),view_version:RETAINED_CHILDCARE_COHORT_VIEW_VERSION,enrollments:before,available_source_count:entries.filter(entry=>entry.status==='available').length,unavailable_source_count:entries.filter(entry=>entry.status==='unavailable').length,not_enrolled_source_count:entries.filter(entry=>entry.status==='not-enrolled').length,artifacts,claims:claims()};
    const staged=await stage('manifest.tmp',manifest,MANIFEST_MAX),temporary=path.join(directory,'manifest.tmp'),manifestPath=path.join(directory,'manifest.json');
    await inspect(temporary,staged.sha256,signal,true);await checkOwner();if(!restricted)check(same(await bindings(root,signal),before));
    // Rehash after enrollment recheck, immediately before the no-overwrite publication.
    await inspect(temporary,staged.sha256,signal,true);signal?.throwIfAborted();
    await link(temporary,manifestPath);published=true;committedDescriptor=descriptor(manifestPath,staged.sha256,manifest);await unlink(temporary);
    // After publication cancellation must not erase the child descriptor needed for parent recovery.
    const verified=await inspect(manifestPath,staged.sha256);return descriptor(manifestPath,staged.sha256,verified.manifest);
  }catch{
    if(!published&&directory&&await owns(directory,owner)){
      for(const out of handles)await out.close();
      for(const [file,prior]of owned)if(await owns(file,prior))await unlink(file);
      if(await owns(directory,owner)&&(await readdir(directory)).length===0)await rmdir(directory);
    }
    throw failure();
  }finally{
    try{for(const out of handles)await out.close();await lock.close();
      check(await owns(lockPath,lockOwner)&&same(await readJson(lockPath,1000),lockValue));await unlink(lockPath);
    }catch{throw failure();}
  }
}
export async function buildRetainedChildcareCohortSnapshot(value={}){return build(value,false);}
export async function buildRetainedChildcareCohortSnapshotForTest(value={}){return build(value,true);}
