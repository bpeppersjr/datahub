import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionReadLines as readLines,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';

export const COVERAGE_ZIP_VIEW_INDEX_VERSION='coverage-zip-view-index@1.0.0';
const ID=/^coverage-zip-view-index-[a-f0-9]{64}$/,SHA=/^[a-f0-9]{64}$/,MAX_BUCKET=200000,MAX_ROW=65536,MAX_SOURCE=1000000000;
const check=(ok,why='contract')=>{if(!ok)throw Error(`Coverage ZIP index rejected: ${why}.`);};
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

async function loadRegistered(root,signal){
 root=path.resolve(root);const reads=[];
 async function json(relative,max=2000000){check(!path.isAbsolute(relative)&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..')&&!relative.includes('\\'),'metadata path');const file=path.join(root,relative),meter={},value=await readJson(file,max,signal,meter);reads.push({file,...meter});return {value,meter,path:relative};}
 async function current(folder,id){const p=await json(`data/${folder}/current.json`,16000);check(p.value.dataset_id===id&&/^releases\/[a-zA-Z0-9-]+\/manifest\.json$/.test(p.value.manifest),'pointer');const m=await json(`data/${folder}/${p.value.manifest}`);check(m.value.dataset_id===id&&m.value.release_id===p.value.release_id,'manifest identity');return {p,m};}
 const catalog=await json('config/datasets/national-business-coverage-views.json');
 const coverage=await current('business-coverage-views','national-business-coverage-views'),registry=await current('business-registry','national-business-registry'),geography=await current('geography','us-census-geography');
 const m=coverage.m.value,pin=catalog.value.current_verified_release;
 check(catalog.value.dataset_id===m.dataset_id&&pin?.manifest===coverage.m.path&&pin.manifest_sha256===coverage.m.meter.sha256&&pin.release_id===m.release_id&&same(pin.publisher,m.publisher)&&same(pin.dependencies,m.dependencies),'selected catalog pin');
 check(m.schema_version==='1.0.0'&&m.status==='published-partial-local-aggregate'&&m.complete_all_businesses===false&&registry.m.value.complete_national_business_registry===false&&m.authoritative_current_usps_zip_denominator===null,'partial claims');
 for(const item of [registry,geography]){const deps=m.dependencies.filter(d=>d.dataset_id===item.m.value.dataset_id);check(deps.length===1&&deps[0].release_id===item.m.value.release_id&&deps[0].manifest_sha256===item.m.meter.sha256,'dependency pin');}
 const gd=registry.m.value.dependencies.filter(d=>d.dataset_id===geography.m.value.dataset_id);check(gd.length>0&&gd.every(d=>d.release_id===geography.m.value.release_id&&d.manifest_sha256===geography.m.meter.sha256),'registry geography lineage');
 const spatial=m.spatial_zip_polygon_denominator;
 check(spatial?.release_id===geography.m.value.release_id&&spatial.geography_manifest_sha256===geography.m.meter.sha256&&spatial.geography_type==='census-zcta5'&&spatial.zip4_polygon_applicability==='not-applicable','spatial dependency');
 const zcta=geography.m.value.artifacts.filter(a=>a.path===spatial.zcta_index_artifact_path);check(zcta.length===1&&zcta[0].sha256===spatial.zcta_index_artifact_sha256&&zcta[0].record_count===spatial.count,'spatial artifact');
 const artifacts=m.artifacts.filter(a=>a.path==='views/zips.jsonl');check(artifacts.length===1,'ZIP artifact');const artifact=artifacts[0];
 check(artifact.artifact_type==='zip-coverage-view-jsonl'&&count(artifact.bytes)&&artifact.bytes>0&&artifact.bytes<=MAX_SOURCE&&SHA.test(artifact.sha256)&&count(artifact.record_count)&&artifact.record_count<=100000&&['local-review-only','internal'].includes(artifact.export_policy),'ZIP descriptor');
 const sourceDir=path.dirname(path.join(root,coverage.m.path)),file=path.join(sourceDir,artifact.path);
 await canonical(path.dirname(file),{signal});const sourceIdentity=await fs.lstat(file,{bigint:true});check(fileSame(sourceIdentity,sourceIdentity)&&sourceIdentity.size===BigInt(artifact.bytes),'source regular file');
 const stamp=x=>({pointer_path:x.p.path,pointer_sha256:x.p.meter.sha256,manifest_path:x.m.path,manifest_sha256:x.m.meter.sha256,release_id:x.m.value.release_id});
 const binding={coverage_catalog_sha256:catalog.meter.sha256,coverage:stamp(coverage),registry:stamp(registry),geography:stamp(geography),dependencies:m.dependencies,spatial_zip_polygon_denominator:spatial,zip_artifact:artifact};
 const context={root,sourceDir,file,artifact,manifest:m,binding,reads,sourceIdentity,sourceDirectoryIdentity:await fs.lstat(sourceDir,{bigint:true}),projection:{claims:{export_policy:artifact.export_policy}}};
 await checkContext(context,signal);return context;
}
async function checkContext(context,signal){await stableReads(context.reads,signal);await canonical(context.sourceDir,{signal});await canonical(path.dirname(context.file),{signal});check(dirSame(context.sourceDirectoryIdentity,await fs.lstat(context.sourceDir,{bigint:true})),'source directory changed');const now=await fs.lstat(context.file,{bigint:true});check(fileSame(now,now)&&now.size===BigInt(context.artifact.bytes),'source regular size');signal?.throwIfAborted();}
function rowIdentity(row){check(/^\d{5}$/.test(row?.zip_code)&&row.complete_all_businesses===false&&['record-level-source-contribution','denominator-only-no-record-level-contribution'].includes(row.registry_coverage?.status),'row identity/claims');}
async function scan(context,signal){
 const buckets=new Map(),seen=new Set(),meter={},digest=createHash('sha256');let offset=0;
 for await(const row of readLines(context.file,context.artifact.bytes,signal,meter)){
  signal?.throwIfAborted();rowIdentity(row);check(!seen.has(row.zip_code)&&seen.size<100000,'duplicate/row limit');seen.add(row.zip_code);
  const raw=jsonBytes(row);check(raw.length<=MAX_ROW,'row bound');digest.update(raw);
  const prefix=row.zip_code.slice(0,2);if(!buckets.has(prefix))buckets.set(prefix,[]);buckets.get(prefix).push({zip5:row.zip_code,offset,bytes:raw.length,sha256:hash(raw)});offset+=raw.length;
 }
 check(meter.sha256===context.artifact.sha256&&meter.bytes===context.artifact.bytes&&meter.records===context.artifact.record_count&&digest.digest('hex')===context.artifact.sha256,'source checksum/count/canonical encoding');
 const reads=[{file:context.file,...meter}];await checkContext(context,signal);await stableReads(reads,signal);
 return {buckets:new Map([...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,v.sort((a,b)=>a.zip5.localeCompare(b.zip5))])),reads,total:seen.size,zipCount:seen.size};
}
function shape(context,result,createdAt){
 check(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&new Date(createdAt).toISOString()===createdAt&&createdAt>=context.manifest.created_at,'explicit index clock');
 const artifacts=[...result.buckets].map(([prefix,entries])=>{const raw=jsonBytes(entries);check(raw.length<=MAX_BUCKET,'bucket bound');return {path:`zip-${prefix}.json`,bytes:raw.length,sha256:hash(raw),zip_count:entries.length};});
 const body={schema_version:COVERAGE_ZIP_VIEW_INDEX_VERSION,status:'immutable-local-lookup-index',created_at:createdAt,bindings:context.binding,source_zip_rows:result.total,indexed_zip_count:result.zipCount,claims:claims(context.projection.claims.export_policy),artifacts};return {release_id:`coverage-zip-view-index-${hash(JSON.stringify(body))}`,...body};
}
function validateManifest(m){
 check(exact(m,['release_id','schema_version','status','created_at','bindings','source_zip_rows','indexed_zip_count','claims','artifacts'])&&m.schema_version===COVERAGE_ZIP_VIEW_INDEX_VERSION&&m.status==='immutable-local-lookup-index'&&ID.test(m.release_id),'manifest');const {release_id,...body}=m;check(release_id===`coverage-zip-view-index-${hash(JSON.stringify(body))}`,'content identity');
 check(Array.isArray(m.artifacts)&&m.artifacts.length<=100&&count(m.source_zip_rows)&&m.source_zip_rows<=100000&&m.source_zip_rows===m.indexed_zip_count,'index limits');let prior='';for(const a of m.artifacts){check(exact(a,['path','bytes','sha256','zip_count'])&&/^zip-\d{2}\.json$/.test(a.path)&&a.path>prior&&count(a.bytes)&&a.bytes>0&&a.bytes<=MAX_BUCKET&&SHA.test(a.sha256)&&count(a.zip_count)&&a.zip_count>0&&a.zip_count<=1000,'descriptor');prior=a.path;}
}
async function header(directory,context,signal,expectedSha,staging=false){
 await canonical(directory,{signal});const owner=await fs.lstat(directory,{bigint:true}),meter={},manifest=await readJson(path.join(directory,'manifest.json'),100000,signal,meter);validateManifest(manifest);
 check(!expectedSha||meter.sha256===expectedSha,'manifest pin');check(staging||directory===path.join(context.root,'data/coverage-zip-view-index/releases',manifest.release_id),'release directory');check(same(manifest.bindings,context.binding)&&same(manifest.claims,claims(context.projection.claims.export_policy))&&manifest.source_zip_rows===context.artifact.record_count,'bindings');await inventory(directory,['manifest.json',...manifest.artifacts.map(a=>a.path)]);return {manifest,owner,read:{file:path.join(directory,'manifest.json'),...meter}};
}
async function verify(directory,context,signal,{staging=false,expectedSha}={}){
 const head=await header(directory,context,signal,expectedSha,staging),result=await scan(context,signal),expected=shape(context,result,head.manifest.created_at),reads=[head.read];check(same(head.manifest,expected),'independent reconstruction');
 for(const a of head.manifest.artifacts){const file=path.join(directory,a.path),meter={},entries=await readJson(file,MAX_BUCKET,signal,meter);check(meter.sha256===a.sha256&&meter.bytes===a.bytes&&same(entries,result.buckets.get(a.path.slice(4,6))),'bucket reconstruction');reads.push({file,...meter});}
 await stableReads([...reads,...result.reads],signal);await checkContext(context,signal);await inventory(directory,['manifest.json',...head.manifest.artifacts.map(a=>a.path)]);check(dirSame(head.owner,await fs.lstat(directory,{bigint:true})),'index directory changed');signal?.throwIfAborted();return {manifest:head.manifest,manifest_sha256:head.read.sha256,reads,sourceReads:result.reads,owner:head.owner};
}
export async function verifyCoverageZipViewIndex(manifestPath,opts={}){options(opts,['root','signal']);check(typeof manifestPath==='string'&&path.basename(manifestPath)==='manifest.json','manifest path');const context=await loadRegistered(opts.root??APP_ROOT,opts.signal),v=await verify(path.dirname(path.resolve(manifestPath)),context,opts.signal);return {verified:true,release_id:v.manifest.release_id,manifest_sha256:v.manifest_sha256,source_zip_rows:v.manifest.source_zip_rows,indexed_zip_count:v.manifest.indexed_zip_count,network_requests:0,production_pointers_changed:false};}

async function range(context,entry,signal){
 await canonical(path.dirname(context.file),{signal});signal?.throwIfAborted();const before=await fs.lstat(context.file,{bigint:true});check(fileSame(before,before)&&before.size===BigInt(context.artifact.bytes),'source range file');const handle=await fs.open(context.file,'r');
 try{check(stable(before,await handle.stat({bigint:true})),'source open identity');const raw=Buffer.alloc(entry.bytes);let consumed=0;while(consumed<raw.length){signal?.throwIfAborted();const result=await handle.read(raw,consumed,raw.length-consumed,entry.offset+consumed);check(result.bytesRead>0,'truncated range');consumed+=result.bytesRead;}
  check(hash(raw)===entry.sha256&&raw.at(-1)===10,'row range hash');const row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));rowIdentity(row);check(row.zip_code===entry.zip5&&same(raw,jsonBytes(row)),'exact original row');check(stable(before,await handle.stat({bigint:true}))&&stable(before,await fs.lstat(context.file,{bigint:true})),'range changed');signal?.throwIfAborted();return {row,read:{file:context.file,identity:before}};
 }finally{await handle.close();}
}
async function lookup(directory,pin,zip5,context,signal){
 check(SHA.test(pin)&&/^\d{5}$/.test(zip5),'lookup input');const head=await header(directory,context,signal,pin),a=head.manifest.artifacts.find(v=>v.path===`zip-${zip5.slice(0,2)}.json`),reads=[head.read];let entries=[],row=null;
 if(a){const meter={},file=path.join(directory,a.path);entries=await readJson(file,MAX_BUCKET,signal,meter);check(meter.sha256===a.sha256&&meter.bytes===a.bytes&&Array.isArray(entries)&&entries.length===a.zip_count,'bucket integrity');reads.push({file,...meter});}
 let prior='';for(const e of entries){check(exact(e,['zip5','offset','bytes','sha256'])&&/^\d{5}$/.test(e.zip5)&&e.zip5.slice(0,2)===zip5.slice(0,2)&&e.zip5>prior&&count(e.offset)&&count(e.bytes)&&e.bytes>0&&e.bytes<=MAX_ROW&&e.offset+e.bytes<=context.artifact.bytes&&SHA.test(e.sha256),'entry');prior=e.zip5;}
 const entry=entries.find(e=>e.zip5===zip5);if(entry){const found=await range(context,entry,signal);row=found.row;reads.push(found.read);}
 await stableReads(reads,signal);await checkContext(context,signal);await inventory(directory,['manifest.json',...head.manifest.artifacts.map(a=>a.path)]);check(dirSame(head.owner,await fs.lstat(directory,{bigint:true})),'index changed');signal?.throwIfAborted();
 return {zip5,status:entry?'present':'absent-from-selected-coverage',row,index_release_id:head.manifest.release_id,index_manifest_sha256:head.read.sha256,bindings:context.binding,claims:head.manifest.claims,source_payload_bytes_read:entry?.bytes??0,full_source_replay_performed:false};
}
export async function readCoverageZipViewLookup(opts={}){options(opts,['root','signal','manifestPath','manifestSha256','zip5']);check(typeof opts.manifestPath==='string'&&path.basename(opts.manifestPath)==='manifest.json','manifest path');const context=await loadRegistered(opts.root??APP_ROOT,opts.signal);return lookup(path.dirname(path.resolve(opts.manifestPath)),opts.manifestSha256,opts.zip5,context,opts.signal);}
async function clean(stage,owned,owner){try{await canonical(stage);check(dirSame(owner,await fs.lstat(stage,{bigint:true})));check((await fs.readdir(stage)).every(name=>owned.has(path.join(stage,name))));for(const [file,id]of owned){check(fileSame(id,await fs.lstat(file,{bigint:true})));await fs.unlink(file);}await fs.rmdir(stage);return true;}catch{return false;}}
async function unlock(handle,file,id){const issues=[];let closed=false,current;try{await handle.close();closed=true;}catch{issues.push('lock-close-failed');}try{current=await fs.lstat(file,{bigint:true});}catch{issues.push('lock-inspection-failed');}if(current){if(!fileSame(id,current))issues.push('lock-ownership-mismatch');else if(closed)try{await fs.unlink(file);}catch{issues.push('lock-unlink-failed');}}return issues;}
async function publish(context,createdAt,signal){
 const result=await scan(context,signal),manifest=shape(context,result,createdAt),base=path.join(context.root,'data/coverage-zip-view-index'),releases=path.join(base,'releases'),stages=path.join(base,'.staging'),locks=path.join(base,'.locks');
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
 finally{const issues=await unlock(lock,lockPath,lockId);if(issues.length){const recovery={inspection_required:true,release_id:manifest.release_id,publication_state:published?'published':reused?'reused':'not-published',lock_cleanup:{issues}};if(primary){primary.inspection_required=true;primary.recovery=recovery;}else{const error=new Error('Coverage ZIP index lock requires inspection.');error.code='COVERAGE_ZIP_INDEX_INSPECTION_REQUIRED';Object.assign(error,{inspection_required:true,recovery});throw error;}}}
}
export async function publishCoverageZipViewIndex(opts={}){
 options(opts,['root','createdAt','signal']);const context=await loadRegistered(opts.root??APP_ROOT,opts.signal);return publish(context,opts.createdAt,opts.signal);
}
