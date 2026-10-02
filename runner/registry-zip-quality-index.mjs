import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {auditRegistryZipRows,ZIP_DENOMINATOR_AUDIT_SCHEMA_VERSION} from './zip-denominator-audit.mjs';

export const REGISTRY_ZIP_QUALITY_INDEX_VERSION='registry-zip-quality-index@1.0.0';
export const REGISTRY_ZIP_QUALITY_INDEX_LIMITS=Object.freeze({sourceBytes:1_000_000_000,sourceRows:100000,rowBytes:1_048_576,bucketBytes:256000,manifestBytes:100000});
const L=REGISTRY_ZIP_QUALITY_INDEX_LIMITS,SHA=/^[a-f0-9]{64}$/,ID=/^registry-zip-quality-index-[a-f0-9]{64}$/;
// Reviewed code identity, not a digest invented from whatever happens to be on disk.
// Updating the audit requires explicit review of these pins and its schema version.
const AUDIT_CONTRACT=Object.freeze({schema:'1.3.0',moduleSha256:'e53b1a9ea6bab6b83a0321fb2f467ac44f5abf790617a049932993aad99c1099',functionSha256:'aa15037e0239c657be5dd795d3a61ed608f8031aecc11603bc4af56b55be3e2a',maxBytes:128000});
const AUDIT_FILE=fileURLToPath(new URL('./zip-denominator-audit.mjs',import.meta.url));
const hash=raw=>createHash('sha256').update(raw).digest('hex'),bytes=value=>Buffer.from(`${JSON.stringify(value)}\n`);
const check=(ok,why='contract')=>{if(!ok)throw Error(`Registry ZIP index rejected: ${why}.`);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort());
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const fileSame=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&a.dev===b.dev&&a.ino===b.ino;
const stable=(a,b)=>fileSame(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const dirSame=(a,b)=>a&&b&&a.isDirectory()&&b.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino;
const exists=file=>fs.lstat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
function options(opts,keys){check(opts&&Object.keys(opts).every(key=>keys.includes(key)),'unsupported option');}
const claims=policy=>({export_policy:policy,network_requests:0,current_pointer_written:false,production_enrollment:false,current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,zip4_is_geometric:false,build_time_refreshes_source:false});
async function inventory(dir,names,signal){await canonical(dir,{signal});check(same((await fs.readdir(dir)).sort(),[...names].sort()),'closed inventory');}
async function stableReads(reads,signal){for(const r of reads){signal?.throwIfAborted();await canonical(path.dirname(r.file),{signal});check(stable(r.identity,await fs.lstat(r.file,{bigint:true})),'input identity changed');}}
async function auditCode(file,signal){
 check(ZIP_DENOMINATOR_AUDIT_SCHEMA_VERSION===AUDIT_CONTRACT.schema&&hash(auditRegistryZipRows.toString())===AUDIT_CONTRACT.functionSha256,'loaded audit contract');
 await canonical(path.dirname(file),{signal});const initial=await fs.lstat(file,{bigint:true});check(fileSame(initial,initial)&&initial.size<=BigInt(AUDIT_CONTRACT.maxBytes),'audit code bounds');
 const handle=await fs.open(file,'r'),digest=createHash('sha256');let consumed=0;
 try{check(stable(initial,await handle.stat({bigint:true})),'audit code ownership');for(;;){signal?.throwIfAborted();const buffer=Buffer.alloc(Math.min(65536,AUDIT_CONTRACT.maxBytes-consumed||1)),r=await handle.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;consumed+=r.bytesRead;check(consumed<=AUDIT_CONTRACT.maxBytes&&consumed<=Number(initial.size),'audit code ceiling');digest.update(buffer.subarray(0,r.bytesRead));}
  const sha256=digest.digest('hex');check(stable(initial,await handle.stat({bigint:true}))&&stable(initial,await fs.lstat(file,{bigint:true}))&&consumed===Number(initial.size)&&sha256===AUDIT_CONTRACT.moduleSha256,'reviewed audit code drift');return {file,kind:'audit',identity:initial,bytes:consumed,sha256};
 }finally{await handle.close();}
}

// All public operations resolve the same fixed enrollment. No arbitrary source path or verifier injection.
async function context(root,signal){
 root=path.resolve(root);const reads=[];
 async function json(relative,max){const file=path.join(root,relative),meter={},value=await readJson(file,max,signal,meter);reads.push({file,...meter});return {value,meter};}
 const {value:e,meter:em}=await json('config/zip-quality-view-enrollment.json',16000);
 check(e.schema_version==='1.0.0'&&e.cohort_id==='production-current'&&e.pointer_path==='data/business-registry/current.json'&&[e.pointer_sha256,e.manifest_sha256,e.zip_artifact_sha256].every(v=>SHA.test(v))&&/^[a-zA-Z0-9._-]+$/.test(e.release_id),'enrollment');
 const {value:p,meter:pm}=await json(e.pointer_path,16000);
 check(pm.sha256===e.pointer_sha256&&p.dataset_id==='national-business-registry'&&p.release_id===e.release_id&&p.manifest===`releases/${e.release_id}/manifest.json`,'pointer binding');
 const manifestRelative=`data/business-registry/${p.manifest}`,{value:m,meter:mm}=await json(manifestRelative,2_000_000);
 check(mm.sha256===e.manifest_sha256&&m.dataset_id===p.dataset_id&&m.release_id===p.release_id&&m.status==='published-partial'&&m.complete_national_business_registry===false&&/^\d+\.\d+\.\d+$/.test(m.publisher?.version),'manifest binding');
 const selected=m.artifacts?.filter(a=>a.artifact_type==='registry-zip-coverage-jsonl');
 check(selected?.length===1,'unique ZIP artifact');const a=selected[0];
 check(a.path==='derived/zip-coverage.jsonl'&&a.sha256===e.zip_artifact_sha256&&integer(a.bytes)&&a.bytes>0&&a.bytes<=L.sourceBytes&&integer(a.record_count)&&a.record_count>0&&a.record_count<=L.sourceRows,'ZIP artifact binding or bounds');
 check(['internal','local-review-only'].includes(a.distribution_policy)&&[undefined,null,'internal','local-review-only'].includes(a.export_policy),'artifact export policy');
 const policy=[m.export_policy,a.export_policy,a.distribution_policy].includes('internal')?'internal':'local-review-only';
 const sourceFile=path.join(root,path.dirname(manifestRelative),a.path);await canonical(path.dirname(sourceFile),{signal});
 const sourceIdentity=await fs.lstat(sourceFile,{bigint:true});check(fileSame(sourceIdentity,sourceIdentity)&&sourceIdentity.size===BigInt(a.bytes),'source file identity');
 const auditRead=await auditCode(AUDIT_FILE,signal);reads.push(auditRead);
 const reconciliations=m.artifacts.filter(a=>a.artifact_type==='registry-zip5-evidence-reconciliation-json');check(reconciliations.length<=1,'duplicate USPS reconciliation');let reconciliation=null,reconciliationBinding=null;
 if(reconciliations.length){const r=reconciliations[0];check(typeof r.path==='string'&&/^derived\/[a-z0-9-]+\.json$/.test(r.path)&&SHA.test(r.sha256)&&integer(r.bytes)&&r.bytes<=1_000_000,'reconciliation descriptor');const document=await json(`${path.dirname(manifestRelative).replaceAll('\\','/')}/${r.path}`,1_000_000);check(document.meter.sha256===r.sha256&&document.meter.bytes===r.bytes,'reconciliation integrity');reconciliation=document.value;reconciliationBinding={path:r.path,sha256:r.sha256,bytes:r.bytes};}
 const binding={enrollment_sha256:em.sha256,cohort_id:e.cohort_id,registry_pointer_path:e.pointer_path,registry_pointer_sha256:pm.sha256,registry_release_id:e.release_id,registry_manifest_path:manifestRelative,registry_manifest_sha256:mm.sha256,registry_publisher_version:m.publisher.version,zip_artifact:{path:a.path,sha256:a.sha256,bytes:a.bytes,record_count:a.record_count},usps_reconciliation:reconciliationBinding,audit_schema_version:AUDIT_CONTRACT.schema,audit_implementation_sha256:AUDIT_CONTRACT.moduleSha256,audit_function_sha256:AUDIT_CONTRACT.functionSha256,policy_basis:{manifest_description_non_authorizing:m.export_policy??null,artifact_distribution_policy:a.distribution_policy,artifact_export_policy:a.export_policy??null},export_policy:policy};
 const c={root,reads,sourceFile,sourceIdentity,artifact:a,manifest:m,binding,policy,reconciliation};await stableContext(c,signal);return c;
}
async function stableContext(c,signal){
 await stableReads(c.reads,signal);await canonical(path.dirname(c.sourceFile),{signal});check(stable(c.sourceIdentity,await fs.lstat(c.sourceFile,{bigint:true})),'source changed');
 // Metadata is small: rehash, not merely compare retained timestamps.
 for(const r of c.reads){const meter=r.kind==='audit'?await auditCode(r.file,signal):{};if(r.kind!=='audit')await readJson(r.file,r.bytes,signal,meter);check(meter.sha256===r.sha256&&stable(r.identity,meter.identity),'metadata drift');}
 signal?.throwIfAborted();
}
function decode(raw){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
function compact(row){return {zip_code:row.zip_code,...(Object.hasOwn(row,'postal_code')?{postal_code:row.postal_code}:{}),...(Object.hasOwn(row,'zip4')?{zip4:row.zip4}:{}),registry_coverage:row.registry_coverage,geography:row.geography,current_usps_validity:row.current_usps_validity};}
// Preserve exact UTF-8 line bytes, including CRLF or an unterminated final line.
async function scan(c,signal){
 const handle=await fs.open(c.sourceFile,'r'),digest=createHash('sha256'),buckets=new Map(),auditRows=[];let tail=Buffer.alloc(0),offset=0,total=0,consumed=0;
 function consume(raw){
  signal?.throwIfAborted();check(raw.length>0&&raw.length<=L.rowBytes,'row byte bound');check(offset+raw.length<=c.artifact.bytes&&offset+raw.length<=L.sourceBytes,'source byte ceiling');const row=decode(raw),zip=row.zip_code;
  check(/^\d{5}$/.test(zip)&&total<L.sourceRows,'ZIP5 or row bound');
  const prefix=zip.slice(0,2);if(!buckets.has(prefix))buckets.set(prefix,[]);
  buckets.get(prefix).push({zip5:zip,offset,bytes:raw.length,sha256:hash(raw)});offset+=raw.length;total++;
  auditRows.push(compact(row));
 }
 try{
  check(stable(c.sourceIdentity,await handle.stat({bigint:true})),'source open changed');
  for(;;){signal?.throwIfAborted();const remaining=Math.min(c.artifact.bytes,L.sourceBytes)-consumed;check(remaining>=0,'source byte ceiling');if(remaining===0){check((await handle.stat({bigint:true})).size<=BigInt(c.artifact.bytes),'source byte ceiling');break;}const buffer=Buffer.alloc(Math.min(65536,remaining)),r=await handle.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;consumed+=r.bytesRead;check(consumed<=c.artifact.bytes&&consumed<=L.sourceBytes,'source byte ceiling');const chunk=buffer.subarray(0,r.bytesRead);digest.update(chunk);let start=0;
   for(let i=0;i<chunk.length;i++)if(chunk[i]===10){consume(Buffer.concat([tail,chunk.subarray(start,i+1)]));tail=Buffer.alloc(0);start=i+1;}
   tail=Buffer.concat([tail,chunk.subarray(start)]);check(tail.length<=L.rowBytes,'row byte bound');
  }
  if(tail.length)consume(tail);
  check(stable(c.sourceIdentity,await handle.stat({bigint:true}))&&offset===c.artifact.bytes&&total===c.artifact.record_count&&digest.digest('hex')===c.artifact.sha256,'full source integrity');
 }finally{await handle.close();}
 signal?.throwIfAborted();const audit=auditRegistryZipRows(auditRows,{registryPublisherVersion:c.binding.registry_publisher_version,includeRows:false,includeZipLists:false});
 check(audit.audit_status!=='failed-contract','ZIP audit contract');
 if(c.reconciliation){const r=c.reconciliation,listed=audit._audit_sets.listedUspsZip5,memberHash=hash(listed.length?`${listed.join('\n')}\n`:''),d=c.manifest.coverage?.authoritative_current_usps_zip_denominator;check(r.schema_version==='zip5-evidence-reconciliation@1.0.0'&&r.exact_usps_member_set_match===true&&r.registry_listed_members?.count===listed.length&&r.registry_listed_members.member_set_sha256===memberHash&&r.source?.assignment_members?.count===d?.count&&r.source.assignment_members.member_set_sha256===d?.member_set_sha256&&memberHash===r.source.assignment_members.member_set_sha256,'USPS member reconciliation');}
 for(const rows of buckets.values()){rows.sort((a,b)=>a.zip5.localeCompare(b.zip5));check(rows.length<=1000,'bucket count');}
 const sorted=new Map([...buckets].sort(([a],[b])=>a.localeCompare(b)));
 await stableContext(c,signal);return {buckets:sorted,total,audit};
}
function shape(c,result,createdAt){
 check(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&new Date(createdAt).toISOString()===createdAt,'explicit build clock');
 const artifacts=[...result.buckets].map(([prefix,entries])=>{const raw=bytes(entries);check(raw.length<=L.bucketBytes,'bucket byte bound');return {path:`zip-${prefix}.json`,bytes:raw.length,sha256:hash(raw),zip_count:entries.length};});
 const body={schema_version:REGISTRY_ZIP_QUALITY_INDEX_VERSION,status:'immutable-local-lookup-index',created_at:createdAt,bindings:c.binding,indexed_zip_count:result.total,audit_summary:result.audit,claims:claims(c.policy),artifacts};
 return {release_id:`registry-zip-quality-index-${hash(JSON.stringify(body))}`,...body};
}
function validate(m){
 check(exact(m,['release_id','schema_version','status','created_at','bindings','indexed_zip_count','audit_summary','claims','artifacts'])&&ID.test(m.release_id)&&m.schema_version===REGISTRY_ZIP_QUALITY_INDEX_VERSION&&m.status==='immutable-local-lookup-index','index manifest');
 const {release_id,...body}=m;check(release_id===`registry-zip-quality-index-${hash(JSON.stringify(body))}`,'content identity');
 check(integer(m.indexed_zip_count)&&m.indexed_zip_count>0&&m.indexed_zip_count<=L.sourceRows&&Array.isArray(m.artifacts)&&m.artifacts.length>0&&m.artifacts.length<=100,'index bounds');let last='';
 for(const a of m.artifacts){check(exact(a,['path','bytes','sha256','zip_count'])&&/^zip-\d{2}\.json$/.test(a.path)&&a.path>last&&SHA.test(a.sha256)&&integer(a.bytes)&&a.bytes>0&&a.bytes<=L.bucketBytes&&integer(a.zip_count)&&a.zip_count>0&&a.zip_count<=1000,'bucket descriptor');last=a.path;}
 check(m.artifacts.reduce((n,a)=>n+a.zip_count,0)===m.indexed_zip_count,'bucket conservation');
}
async function header(dir,c,signal,pin,staging=false){
 await canonical(dir,{signal});const owner=await fs.lstat(dir,{bigint:true}),meter={},manifest=await readJson(path.join(dir,'manifest.json'),L.manifestBytes,signal,meter);validate(manifest);
 check(!pin||pin===meter.sha256,'pinned manifest');check(staging||dir===path.join(c.root,'data/registry-zip-quality-index/releases',manifest.release_id),'release directory');
 check(same(manifest.bindings,c.binding)&&same(manifest.claims,claims(c.policy))&&manifest.indexed_zip_count===c.artifact.record_count,'input bindings');
 await inventory(dir,['manifest.json',...manifest.artifacts.map(a=>a.path)],signal);return {manifest,owner,read:{file:path.join(dir,'manifest.json'),...meter}};
}
async function bucket(dir,a,c,signal){
 const meter={},file=path.join(dir,a.path),entries=await readJson(file,L.bucketBytes,signal,meter);check(meter.sha256===a.sha256&&meter.bytes===a.bytes&&Array.isArray(entries)&&entries.length===a.zip_count,'bucket integrity');let last='';
 for(const e of entries){check(exact(e,['zip5','offset','bytes','sha256'])&&/^\d{5}$/.test(e.zip5)&&e.zip5.slice(0,2)===a.path.slice(4,6)&&e.zip5>last&&integer(e.offset)&&integer(e.bytes)&&e.bytes>0&&e.bytes<=L.rowBytes&&e.offset+e.bytes<=c.artifact.bytes&&SHA.test(e.sha256),'entry contract');last=e.zip5;}
 return {entries,read:{file,...meter}};
}
async function verify(dir,c,signal,{staging=false,pin}={}){
 const head=await header(dir,c,signal,pin,staging),result=await scan(c,signal),expected=shape(c,result,head.manifest.created_at),reads=[head.read];check(same(head.manifest,expected),'independent reconstruction');
 for(const a of head.manifest.artifacts){const b=await bucket(dir,a,c,signal);check(same(b.entries,result.buckets.get(a.path.slice(4,6))),'complete ZIP entry replay');reads.push(b.read);}
 await stableReads(reads,signal);await stableContext(c,signal);await inventory(dir,['manifest.json',...head.manifest.artifacts.map(a=>a.path)],signal);check(dirSame(head.owner,await fs.lstat(dir,{bigint:true})),'directory changed');return {...head,reads};
}
export async function verifyRegistryZipQualityIndex(manifestPath,opts={}){
 options(opts,['root','signal']);check(typeof manifestPath==='string'&&path.basename(manifestPath)==='manifest.json','manifest path');const c=await context(opts.root??APP_ROOT,opts.signal),v=await verify(path.dirname(path.resolve(manifestPath)),c,opts.signal);
 return {verified:true,release_id:v.manifest.release_id,manifest_sha256:v.read.sha256,indexed_zip_count:v.manifest.indexed_zip_count,bindings:c.binding,network_requests:0,current_pointer_written:false};
}
export async function readRegistryZipQualityLookup(opts={}){
 options(opts,['root','signal','manifestPath','manifestSha256','zip5']);const {signal,manifestPath,manifestSha256,zip5}=opts;
 check(typeof manifestPath==='string'&&path.basename(manifestPath)==='manifest.json'&&SHA.test(manifestSha256)&&/^\d{5}$/.test(zip5),'lookup options');
 const c=await context(opts.root??APP_ROOT,signal),dir=path.dirname(path.resolve(manifestPath)),head=await header(dir,c,signal,manifestSha256),reads=[head.read],a=head.manifest.artifacts.find(a=>a.path===`zip-${zip5.slice(0,2)}.json`);let entry,raw=null,row=null,quality=null;
 if(a){const b=await bucket(dir,a,c,signal);reads.push(b.read);entry=b.entries.find(e=>e.zip5===zip5);}
 if(entry){
  const handle=await fs.open(c.sourceFile,'r');try{check(stable(c.sourceIdentity,await handle.stat({bigint:true})),'range ownership');raw=Buffer.alloc(entry.bytes);let n=0;
   while(n<raw.length){signal?.throwIfAborted();const r=await handle.read(raw,n,Math.min(65536,raw.length-n),entry.offset+n);check(r.bytesRead>0,'truncated range');n+=r.bytesRead;}
   check(hash(raw)===entry.sha256&&stable(c.sourceIdentity,await handle.stat({bigint:true})),'range integrity');row=decode(raw);check(row.zip_code===zip5,'range ZIP identity');
   quality=auditRegistryZipRows([row],{registryPublisherVersion:c.binding.registry_publisher_version,includeRows:true,includeZipLists:false}).rows[0];
  }finally{await handle.close();}
 }
 await stableReads(reads,signal);await stableContext(c,signal);await inventory(dir,['manifest.json',...head.manifest.artifacts.map(a=>a.path)],signal);check(dirSame(head.owner,await fs.lstat(dir,{bigint:true})),'lookup directory changed');signal?.throwIfAborted();
 return {schema_version:REGISTRY_ZIP_QUALITY_INDEX_VERSION,zip5,status:entry?'present':'absent-from-selected-artifact',row,raw_jsonl_utf8:raw?.toString('utf8')??null,quality,index_release_id:head.manifest.release_id,index_manifest_sha256:head.read.sha256,bindings:c.binding,claims:head.manifest.claims,source_bytes_read:raw?.length??0,full_source_replay_performed:false};
}
async function clean(dir,owned,owner){try{await canonical(dir);check(dirSame(owner,await fs.lstat(dir,{bigint:true})));check((await fs.readdir(dir)).every(name=>owned.has(path.join(dir,name))));for(const [file,id]of owned){check(fileSame(id,await fs.lstat(file,{bigint:true})));await fs.unlink(file);}await fs.rmdir(dir);return true;}catch{return false;}}
async function unlock(handle,file,id){const issues=[];let closed=false,named;try{await handle.close();closed=true;}catch{issues.push('lock-close-failed');}try{named=await fs.lstat(file,{bigint:true});}catch{issues.push('lock-inspection-failed');}if(named){if(!fileSame(id,named))issues.push('lock-ownership-mismatch');else if(closed)try{await fs.unlink(file);}catch{issues.push('lock-unlink-failed');}}return issues;}
export async function publishRegistryZipQualityIndex(opts={}){
 options(opts,['root','signal','createdAt']);const {signal,createdAt}=opts,c=await context(opts.root??APP_ROOT,signal),result=await scan(c,signal),m=shape(c,result,createdAt),base=path.join(c.root,'data/registry-zip-quality-index'),releases=path.join(base,'releases'),stages=path.join(base,'.staging'),locks=path.join(base,'.locks');
 for(const dir of [releases,stages,locks])await canonical(dir,{create:true,signal});
 const dir=path.join(releases,m.release_id),stage=path.join(stages,randomUUID()),lockPath=path.join(locks,`${m.release_id}.lock`),lock=await fs.open(lockPath,'wx');let lockId,owner,published=false,reused=false,primary;const owned=new Map();
 try{
  lockId=await lock.stat({bigint:true});signal?.throwIfAborted();
  if(await exists(dir)){const v=await verify(dir,c,signal);reused=true;return {verified:true,reused,release_id:m.release_id,manifest_path:path.join(dir,'manifest.json'),manifest_sha256:v.read.sha256};}
  await fs.mkdir(stage);owner=await fs.lstat(stage,{bigint:true});
  for(const a of [...m.artifacts,{path:'manifest.json',bytes:L.manifestBytes}]){const w=await writer(path.join(stage,a.path),a.bytes,signal,owned);try{await w.write(a.path==='manifest.json'?m:result.buckets.get(a.path.slice(4,6)));const actual=await w.finish();if(a.sha256)check(actual.sha256===a.sha256&&actual.bytes===a.bytes,'written bucket');}finally{await w.close();}}
  const v=await verify(stage,c,signal,{staging:true});await stableReads(v.reads,signal);await stableContext(c,signal);check(dirSame(owner,await fs.lstat(stage,{bigint:true})),'staging changed');await canonical(releases,{signal});check(!await exists(dir),'target appeared');signal?.throwIfAborted();await fs.rename(stage,dir);published=true;
  await inventory(dir,['manifest.json',...m.artifacts.map(a=>a.path)],signal);check(dirSame(owner,await fs.lstat(dir,{bigint:true})),'installed directory changed');for(const r of v.reads)check(stable(r.identity,await fs.lstat(path.join(dir,path.basename(r.file)),{bigint:true})),'installed bytes changed');await stableContext(c,signal);
  return {verified:true,reused:false,release_id:m.release_id,manifest_path:path.join(dir,'manifest.json'),manifest_sha256:v.read.sha256,indexed_zip_count:m.indexed_zip_count,bindings:c.binding,network_requests:0,current_pointer_written:false};
 }catch(error){primary=error;if(published){error.inspection_required=true;error.release_id=m.release_id;}else if(owner&&!await clean(stage,owned,owner)){error.inspection_required=true;error.staging_id=path.basename(stage);}throw error;}
 finally{const issues=await unlock(lock,lockPath,lockId);if(issues.length){const recovery={inspection_required:true,release_id:m.release_id,publication_state:published?'published':reused?'reused':'not-published',lock_cleanup:{issues}};if(primary){primary.inspection_required=true;primary.recovery=recovery;}else{const error=Error('Registry ZIP index cleanup requires inspection.');error.code='REGISTRY_ZIP_INDEX_INSPECTION_REQUIRED';Object.assign(error,recovery,{recovery});throw error;}}}
}
