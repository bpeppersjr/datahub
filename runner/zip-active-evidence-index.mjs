import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionReadLines as readLines,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {readZipEvidenceCategoryMap,ZIP_CATEGORY_MAP_SHA256,ZIP_CATEGORY_MAP_VERSION,ZIP_CATEGORY_TAXONOMY_VERSION} from './zip-evidence-category-map.mjs';
import {ZIP_ACTIVE_EVIDENCE_LIMITS,ZIP_ACTIVE_EVIDENCE_SCHEMA} from './zip-active-evidence-qualification.mjs';

export const ZIP_ACTIVE_EVIDENCE_INDEX_VERSION='zip-active-evidence-index@1.0.0';
const ID=/^zip-active-evidence-index-[a-f0-9]{64}$/,SHA=/^[a-f0-9]{64}$/,MAX_BUCKET=2_000_000,MAX_SEGMENTS=8;
const check=(ok,message='contract')=>{if(!ok)throw Error(`ZIP index rejected: ${message}.`);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort());
const hash=value=>createHash('sha256').update(value).digest('hex'),jsonBytes=value=>Buffer.from(`${JSON.stringify(value)}\n`);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const fileSame=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&a.ino===b.ino&&a.dev===b.dev;
const stable=(a,b)=>fileSame(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const dirSame=(a,b)=>a&&b&&a.isDirectory()&&b.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.ino===b.ino&&a.dev===b.dev;
const claims=policy=>({export_policy:policy,current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,source_record_status_replayed:false,network_requests:0,production_pointers_changed:false});
function options(value,keys){check(exact(value,Object.keys(value))&&Object.keys(value).every(key=>keys.includes(key)),'unsupported option');}
async function inventory(directory,names){await canonical(directory);check(same((await fs.readdir(directory)).sort(),[...names].sort()),'closed inventory');}
async function stableReads(reads,signal){for(const r of reads){signal?.throwIfAborted();await canonical(path.dirname(r.file),{signal});check(stable(r.identity,await fs.lstat(r.file,{bigint:true})),'input changed');}}

// Production entry points have no injectable contract/loader or alternate-map switch.
async function loadRegistered(root,signal){
 root=path.resolve(root);const reads=[];
 async function json(relative,max){const file=path.join(root,relative),meter={};const value=await readJson(file,max,signal,meter);reads.push({file,...meter});return {value,meter};}
 const {value:registration,meter:registrationMeter}=await json('config/datasets/zip-active-evidence-qualification.json',1000000);
 const {value:mapRegistration,meter:mapRegistrationMeter}=await json('config/datasets/zip-evidence-category-map.json',32000);
 const {value:mapping,meter:mapMeter}=await json('config/zip-evidence-category-map.json',32000);
 check(hash(JSON.stringify(mapping))===ZIP_CATEGORY_MAP_SHA256&&mapping.schema_version===ZIP_CATEGORY_MAP_VERSION&&mapping.taxonomy_version===ZIP_CATEGORY_TAXONOMY_VERSION,'authored mapping');
 check(mapRegistration.dataset_id==='zip-evidence-category-map'&&mapRegistration.schema_version==='1.0.0'&&mapRegistration.mapping==='config/zip-evidence-category-map.json'&&mapRegistration.mapping_sha256===ZIP_CATEGORY_MAP_SHA256&&mapRegistration.mapping_version===ZIP_CATEGORY_MAP_VERSION&&mapRegistration.taxonomy_version===ZIP_CATEGORY_TAXONOMY_VERSION&&mapRegistration.source_count===30&&mapRegistration.runtime_pointer===null&&mapRegistration.production_enrollment===false&&mapRegistration.national_reporting_denominator_enrollment===false&&mapRegistration.api_or_ui_enabled===false&&mapRegistration.export_policy==='local-review-only','mapping registration');
 check(registration.dataset_id==='zip-active-evidence-qualification'&&registration.schema_version==='1.0.0'&&registration.status==='registered-local-derived-evidence'&&registration.release_only===true&&registration.runtime_pointer===null&&registration.production_enrollment===false&&registration.national_reporting_denominator_enrollment===false&&registration.current_pointer_written===false&&registration.export_policy==='local-review-only','qualification registration');
 const r=registration.retained_release;
 check(r?.release_id===mapping.bindings.qualification_release_id&&r.manifest===`data/zip-active-evidence-qualification/releases/${r.release_id}/manifest.json`&&r.manifest_sha256===mapping.bindings.qualification_manifest_sha256,'registered release identity');
 const {value:manifest,meter:manifestMeter}=await json(r.manifest,1000000),sourceDir=path.dirname(path.join(root,r.manifest));
 check(manifestMeter.sha256===r.manifest_sha256&&manifestMeter.bytes===r.manifest_bytes&&manifest.schema_version==='zip-active-evidence-release@1.0.0'&&manifest.projection_schema===ZIP_ACTIVE_EVIDENCE_SCHEMA&&manifest.status==='immutable-local-derived-release','registered manifest');
 for(const key of ['release_id','projection_schema','status','as_of','created_at','source_zip_rows','bindings'])check(same(manifest[key],r[key]),'registration metadata');
 check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length===r.artifact_count&&manifest.artifacts.length<=ZIP_ACTIVE_EVIDENCE_LIMITS.maxPartitions+1&&hash(JSON.stringify(manifest.artifacts))===r.artifact_inventory_sha256&&manifest.artifacts.reduce((n,a)=>n+a.bytes,0)===r.artifact_bytes,'registered inventory');
 manifest.artifacts.forEach((a,i)=>check(exact(a,['path','bytes','sha256','record_count'])&&a.path===(i===0?'projection.json':`rows-${String(i-1).padStart(4,'0')}.jsonl`)&&count(a.bytes)&&a.bytes>0&&a.bytes<=(i===0?4000000:2000000)&&SHA.test(a.sha256)&&count(a.record_count)&&a.record_count>0&&a.record_count<=(i===0?1:ZIP_ACTIVE_EVIDENCE_LIMITS.rowsPerPartition),'source artifact descriptor'));
 const {value:projection,meter:projectionMeter}=await json(`${path.dirname(r.manifest)}/projection.json`,4000000);
 check(same(r.projection_artifact,manifest.artifacts[0])&&projectionMeter.sha256===r.projection_artifact.sha256&&projectionMeter.bytes===r.projection_artifact.bytes&&projectionMeter.sha256===mapping.bindings.projection_sha256,'projection identity');
 for(const key of ['as_of','created_at','bindings','claims'])check(same(manifest[key],projection[key]),'projection metadata');
 check(projection.schema_version===ZIP_ACTIVE_EVIDENCE_SCHEMA&&projection.temporal_policy_version===r.temporal_policy_version&&projection.zip_members===r.zip_members&&projection.conservation.length===r.source_conservation_entries&&same(registration.claims,projection.claims)&&same(registration.limitations,projection.limitations),'projection registration');
 check(projection.claims.export_policy===registration.export_policy&&projection.claims.current_operations_verified===false&&projection.claims.active_business_count===null&&projection.claims.all_business_denominator===null&&projection.claims.all_business_completion_percent===null,'qualification claims');
 await readZipEvidenceCategoryMap({root,signal});
 const binding={registration_sha256:registrationMeter.sha256,source_release_id:manifest.release_id,source_manifest_sha256:manifestMeter.sha256,source_inventory_sha256:r.artifact_inventory_sha256,projection_sha256:projectionMeter.sha256,map_registration_sha256:mapRegistrationMeter.sha256,map_file_sha256:mapMeter.sha256,mapping_sha256:ZIP_CATEGORY_MAP_SHA256,mapping_version:ZIP_CATEGORY_MAP_VERSION,taxonomy_version:ZIP_CATEGORY_TAXONOMY_VERSION};
 const context={root,sourceDir,manifest,projection,mapping,binding,reads,sourceDirectoryIdentity:await fs.lstat(sourceDir,{bigint:true})};
 await checkContext(context,signal);return context;
}
async function checkContext(context,signal){
 await stableReads(context.reads,signal);await inventory(context.sourceDir,['manifest.json',...context.manifest.artifacts.map(a=>a.path)]);
 check(dirSame(context.sourceDirectoryIdentity,await fs.lstat(context.sourceDir,{bigint:true})),'source directory changed');signal?.throwIfAborted();
}

async function shard(context,index,signal){
 const descriptor=context.manifest.artifacts[index+1];check(descriptor,'source shard');
 const file=path.join(context.sourceDir,descriptor.path),meter={},rows=[];let offset=0;const digest=createHash('sha256');
 for await(const row of readLines(file,descriptor.bytes,signal,meter)){
  signal?.throwIfAborted();const raw=jsonBytes(row);digest.update(raw);check(raw.length<=65536,'row byte bound');rows.push({row,offset,bytes:raw.length});offset+=raw.length;
 }
 check(meter.sha256===descriptor.sha256&&meter.bytes===descriptor.bytes&&meter.records===descriptor.record_count&&digest.digest('hex')===descriptor.sha256,'source shard integrity or canonical encoding');
 return {rows,read:{file,...meter}};
}
function sourceMap(context){return new Map(context.mapping.sources.map(source=>[source.source_key,source]));}
function rowIdentity(row,sources){
 const source=sources.get(row.source_key);check(/^\d{5}$/.test(row.zip5)&&source&&row.source_release_id===source.source_release_id&&row.source_kind===source.source_kind,'row source identity');
 check(row.current_operations_verified===false&&row.current_operating_business_count===null&&row.all_business_denominator===null&&row.all_business_completion_percent===null,'row claims');
 return source;
}
// Pure index construction over an already bound context. Not a production export.
async function scan(context,signal){
 const buckets=new Map(),sources=sourceMap(context),totals=new Map(),members=new Map(),reads=[];let previous,entry,total=0;
 for(const source of context.projection.conservation){totals.set(source.source_key,Object.fromEntries(Object.keys(source.counts_by_unit).map(key=>[key,0])));members.set(source.source_key,0);}
 for(let index=0;index<context.manifest.artifacts.length-1;index++){
  const data=await shard(context,index,signal);reads.push(data.read);
  for(const {row,offset,bytes} of data.rows){
   signal?.throwIfAborted();rowIdentity(row,sources);
   check(!previous||row.zip5>previous.zip5||(row.zip5===previous.zip5&&row.source_key.localeCompare(previous.source_key)>0),'source row ordering or duplicate');
   const counts=totals.get(row.source_key);check(counts&&exact(row.evidence_counts_by_unit,Object.keys(counts)),'source count units');
   for(const [unit,value] of Object.entries(row.evidence_counts_by_unit)){check(count(value)&&count(counts[unit]+value),'typed count');counts[unit]+=value;}
   if(Object.values(row.evidence_counts_by_unit).some(value=>value>0))members.set(row.source_key,members.get(row.source_key)+1);
   if(!previous||row.zip5!==previous.zip5){entry={zip5:row.zip5,row_count:0,segments:[]};const prefix=row.zip5.slice(0,2);if(!buckets.has(prefix))buckets.set(prefix,[]);buckets.get(prefix).push(entry);}
   let segment=entry.segments.at(-1);if(!segment||segment.shard!==index){segment={shard:index,offset,bytes:0,rows:0};entry.segments.push(segment);}
   check(segment.offset+segment.bytes===offset,'noncontiguous ZIP segment');segment.bytes+=bytes;segment.rows++;entry.row_count++;total++;
   check(entry.row_count<=1000&&entry.segments.length<=MAX_SEGMENTS&&total<=ZIP_ACTIVE_EVIDENCE_LIMITS.sourceZipPairs,'index resource bound');previous=row;
  }
 }
 check(total===context.manifest.source_zip_rows,'source row total');
 for(const source of context.projection.conservation)check(same(totals.get(source.source_key),source.counts_by_unit)&&members.get(source.source_key)===source.positive_zip_members,'source conservation');
 await checkContext(context,signal);await stableReads(reads,signal);
 return {buckets,reads,total,zipCount:[...buckets.values()].reduce((n,rows)=>n+rows.length,0)};
}
function shape(context,result,createdAt){
 check(typeof createdAt==='string'&&new Date(createdAt).toISOString()===createdAt&&createdAt>=context.manifest.created_at,'explicit index clock');
 const artifacts=[...result.buckets].map(([prefix,entries])=>{const raw=jsonBytes(entries);check(raw.length<=MAX_BUCKET,'bucket bound');return {path:`zip-${prefix}.json`,bytes:raw.length,sha256:hash(raw),zip_count:entries.length};});
 const body={schema_version:ZIP_ACTIVE_EVIDENCE_INDEX_VERSION,status:'immutable-local-lookup-index',created_at:createdAt,bindings:context.binding,source_zip_rows:result.total,indexed_zip_count:result.zipCount,claims:claims(context.projection.claims.export_policy),artifacts};
 return {release_id:`zip-active-evidence-index-${hash(JSON.stringify(body))}`,...body};
}
function validateManifest(manifest){
 check(exact(manifest,['release_id','schema_version','status','created_at','bindings','source_zip_rows','indexed_zip_count','claims','artifacts'])&&manifest.schema_version===ZIP_ACTIVE_EVIDENCE_INDEX_VERSION&&manifest.status==='immutable-local-lookup-index'&&ID.test(manifest.release_id),'index manifest');
 const {release_id,...body}=manifest;check(release_id===`zip-active-evidence-index-${hash(JSON.stringify(body))}`,'index content identity');
 check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length<=100&&count(manifest.source_zip_rows)&&manifest.source_zip_rows<=ZIP_ACTIVE_EVIDENCE_LIMITS.sourceZipPairs&&count(manifest.indexed_zip_count)&&manifest.indexed_zip_count<=100000,'index bounds');
 let last='';for(const a of manifest.artifacts){check(exact(a,['path','bytes','sha256','zip_count'])&&/^zip-\d{2}\.json$/.test(a.path)&&a.path>last&&count(a.bytes)&&a.bytes>0&&a.bytes<=MAX_BUCKET&&SHA.test(a.sha256)&&count(a.zip_count)&&a.zip_count>0&&a.zip_count<=1000,'index artifact');last=a.path;}
}
async function header(directory,context,signal,expectedSha,staging=false){
 await canonical(directory,{signal});const owner=await fs.lstat(directory,{bigint:true}),meter={};
 const manifest=await readJson(path.join(directory,'manifest.json'),100000,signal,meter);validateManifest(manifest);
 check(!expectedSha||meter.sha256===expectedSha,'pinned index manifest');
 check(staging||directory===path.join(context.root,'data/zip-active-evidence-index/releases',manifest.release_id),'index directory');
 check(same(manifest.bindings,context.binding)&&same(manifest.claims,claims(context.projection.claims.export_policy))&&manifest.source_zip_rows===context.manifest.source_zip_rows,'index input binding');
 await inventory(directory,['manifest.json',...manifest.artifacts.map(a=>a.path)]);
 return {manifest,owner,read:{file:path.join(directory,'manifest.json'),...meter}};
}
async function verify(directory,context,signal,{staging=false,expectedSha}={}){
 const head=await header(directory,context,signal,expectedSha,staging),result=await scan(context,signal),expected=shape(context,result,head.manifest.created_at),reads=[head.read];
 check(same(head.manifest,expected),'independent index reconstruction');
 for(const a of head.manifest.artifacts){const file=path.join(directory,a.path),meter={},entries=await readJson(file,MAX_BUCKET,signal,meter);check(meter.sha256===a.sha256&&meter.bytes===a.bytes&&same(entries,result.buckets.get(a.path.slice(4,6))),'index entry replay');reads.push({file,...meter});}
 await stableReads([...reads,...result.reads],signal);await checkContext(context,signal);await inventory(directory,['manifest.json',...head.manifest.artifacts.map(a=>a.path)]);check(dirSame(head.owner,await fs.lstat(directory,{bigint:true})),'index directory changed');
 signal?.throwIfAborted();return {manifest:head.manifest,manifest_sha256:head.read.sha256,reads,sourceReads:result.reads,owner:head.owner};
}
export async function verifyZipActiveEvidenceIndex(manifestPath,opts={}){
 options(opts,['root','signal']);check(path.basename(manifestPath)==='manifest.json','manifest path');
 const context=await loadRegistered(opts.root??APP_ROOT,opts.signal),result=await verify(path.dirname(path.resolve(manifestPath)),context,opts.signal);
 return {verified:true,release_id:result.manifest.release_id,manifest_sha256:result.manifest_sha256,source_zip_rows:result.manifest.source_zip_rows,indexed_zip_count:result.manifest.indexed_zip_count,network_requests:0,production_pointers_changed:false};
}

async function lookup(directory,expectedSha,zip5,context,signal){
 check(SHA.test(expectedSha)&&/^\d{5}$/.test(zip5),'lookup pin or ZIP5');
 const head=await header(directory,context,signal,expectedSha),descriptor=head.manifest.artifacts.find(a=>a.path===`zip-${zip5.slice(0,2)}.json`),reads=[head.read];let entries=[];
 if(descriptor){const meter={},file=path.join(directory,descriptor.path);entries=await readJson(file,MAX_BUCKET,signal,meter);check(meter.sha256===descriptor.sha256&&meter.bytes===descriptor.bytes&&Array.isArray(entries)&&entries.length===descriptor.zip_count,'lookup bucket');reads.push({file,...meter});}
 let prior='';for(const e of entries){check(exact(e,['zip5','row_count','segments'])&&/^\d{5}$/.test(e.zip5)&&e.zip5.slice(0,2)===zip5.slice(0,2)&&e.zip5>prior&&count(e.row_count)&&e.row_count>0&&e.row_count<=1000&&Array.isArray(e.segments)&&e.segments.length>0&&e.segments.length<=MAX_SEGMENTS,'bucket entry');prior=e.zip5;}
 const entry=entries.find(e=>e.zip5===zip5),rows=[],sources=sourceMap(context);let lastShard=-1;
 for(const s of entry?.segments??[]){
  check(exact(s,['shard','offset','bytes','rows'])&&count(s.shard)&&s.shard>lastShard&&count(s.offset)&&count(s.bytes)&&s.bytes>0&&count(s.rows)&&s.rows>0,'ZIP segment');lastShard=s.shard;
  const data=await shard(context,s.shard,signal);reads.push(data.read);const selected=data.rows.filter(r=>r.offset>=s.offset&&r.offset<s.offset+s.bytes);
  check(selected.length===s.rows&&selected[0]?.offset===s.offset&&selected.at(-1).offset+selected.at(-1).bytes===s.offset+s.bytes,'ZIP range boundary');
  for(const item of selected){rowIdentity(item.row,sources);check(item.row.zip5===zip5&&(!rows.length||item.row.source_key.localeCompare(rows.at(-1).source_key)>0),'ZIP lookup row identity');rows.push(item.row);}
 }
 check(rows.length===(entry?.row_count??0),'lookup row count');await stableReads(reads,signal);await checkContext(context,signal);await inventory(directory,['manifest.json',...head.manifest.artifacts.map(a=>a.path)]);check(dirSame(head.owner,await fs.lstat(directory,{bigint:true})),'lookup directory changed');
 signal?.throwIfAborted();return {zip5,status:entry?'present':'absent-from-source-rows',source_zip_rows:rows.length,rows,categories_by_source:Object.fromEntries(rows.map(row=>[row.source_key,[...sources.get(row.source_key).category_ids]])),mapping_version:context.binding.mapping_version,taxonomy_version:context.binding.taxonomy_version,index_release_id:head.manifest.release_id,index_manifest_sha256:head.read.sha256,source_release_id:context.manifest.release_id,bindings:context.binding,source_as_of:context.manifest.as_of,source_created_at:context.manifest.created_at,claims:head.manifest.claims,source_shards_read:entry?.segments.length??0,full_source_replay_performed:false};
}
export async function readZipActiveEvidenceLookup(opts={}){
 options(opts,['root','signal','manifestPath','manifestSha256','zip5']);check(typeof opts.manifestPath==='string'&&path.basename(opts.manifestPath)==='manifest.json','manifest path');
 const context=await loadRegistered(opts.root??APP_ROOT,opts.signal);return lookup(path.dirname(path.resolve(opts.manifestPath)),opts.manifestSha256,opts.zip5,context,opts.signal);
}

async function clean(stage,owned,owner){try{await canonical(stage);check(dirSame(owner,await fs.lstat(stage,{bigint:true})));check((await fs.readdir(stage)).every(name=>owned.has(path.join(stage,name))));for(const [file,id]of owned){check(fileSame(id,await fs.lstat(file,{bigint:true})));await fs.unlink(file);}await fs.rmdir(stage);return true;}catch{return false;}}
async function unlock(handle,file,id){const issues=[];let closed=false,current;try{await handle.close();closed=true;}catch{issues.push('lock-close-failed');}try{current=await fs.lstat(file,{bigint:true});}catch{issues.push('lock-inspection-failed');}if(current){if(!fileSame(id,current))issues.push('lock-ownership-mismatch');else if(closed)try{await fs.unlink(file);}catch{issues.push('lock-unlink-failed');}}return issues;}
async function publish(context,createdAt,signal){
 const result=await scan(context,signal),manifest=shape(context,result,createdAt),base=path.join(context.root,'data/zip-active-evidence-index'),releases=path.join(base,'releases'),stages=path.join(base,'.staging'),locks=path.join(base,'.locks');
 for(const dir of [releases,stages,locks])await canonical(dir,{create:true,signal});
 const directory=path.join(releases,manifest.release_id),lockPath=path.join(locks,`${manifest.release_id}.lock`),lock=await fs.open(lockPath,'wx');let lockId,owner,published=false,reused=false,primary;const owned=new Map(),stage=path.join(stages,randomUUID());
 try{
  lockId=await lock.stat({bigint:true});signal?.throwIfAborted();
  if(await fs.lstat(directory).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;})){const checked=await verify(directory,context,signal);reused=true;return {verified:true,reused,release_id:manifest.release_id,directory,manifest_sha256:checked.manifest_sha256};}
  await fs.mkdir(stage);owner=await fs.lstat(stage,{bigint:true});
  for(const a of manifest.artifacts){const output=await writer(path.join(stage,a.path),MAX_BUCKET,signal,owned);try{await output.write(result.buckets.get(a.path.slice(4,6)));const actual=await output.finish();check(actual.bytes===a.bytes&&actual.sha256===a.sha256,'written index');}finally{await output.close();}}
  const output=await writer(path.join(stage,'manifest.json'),100000,signal,owned);try{await output.write(manifest);await output.finish();}finally{await output.close();}
  const checked=await verify(stage,context,signal,{staging:true});await stableReads(checked.reads,signal);await stableReads(result.reads,signal);await checkContext(context,signal);check(dirSame(owner,await fs.lstat(stage,{bigint:true})),'staging changed');
  await canonical(releases,{signal});check(!await fs.lstat(directory).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),'target appeared');signal?.throwIfAborted();await fs.rename(stage,directory);published=true;
  await inventory(directory,['manifest.json',...manifest.artifacts.map(a=>a.path)]);check(dirSame(owner,await fs.lstat(directory,{bigint:true})),'installed directory changed');
  for(const r of checked.reads)check(stable(r.identity,await fs.lstat(path.join(directory,path.basename(r.file)),{bigint:true})),'installed file changed');await checkContext(context,signal);await stableReads(checked.sourceReads,signal);signal?.throwIfAborted();
  return {verified:true,reused:false,release_id:manifest.release_id,directory,manifest_sha256:checked.manifest_sha256,source_zip_rows:result.total,indexed_zip_count:result.zipCount,network_requests:0,production_pointers_changed:false};
 }catch(error){primary=error;if(published){error.inspection_required=true;error.release_id=manifest.release_id;}else if(owner&&!await clean(stage,owned,owner)){error.inspection_required=true;error.staging_id=path.basename(stage);}throw error;}
 finally{const issues=await unlock(lock,lockPath,lockId);if(issues.length){const recovery={inspection_required:true,release_id:manifest.release_id,publication_state:published?'published':reused?'reused':'not-published',lock_cleanup:{issues}};if(primary){primary.inspection_required=true;primary.recovery=recovery;}else{const error=new Error('ZIP index lock requires inspection.');error.code='ZIP_INDEX_INSPECTION_REQUIRED';Object.assign(error,{inspection_required:true,recovery});throw error;}}}
}
export async function publishZipActiveEvidenceIndex(opts={}){
 options(opts,['root','createdAt','signal']);const context=await loadRegistered(opts.root??APP_ROOT,opts.signal);return publish(context,opts.createdAt,opts.signal);
}
