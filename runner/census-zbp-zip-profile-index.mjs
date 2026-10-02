import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {parse} from 'csv-parse';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionReadLines as readLines,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';

export const CENSUS_ZBP_ZIP_PROFILE_INDEX_VERSION='census-zbp-zip-profile-index@1.0.0';
export const CENSUS_ZBP_ZIP_PROFILE_LIMITS=Object.freeze({compressed:32000000,decoded:128000000,partitionRows:600000,totalRows:4000000,zipRows:50000,codes:2500,profileBytes:4000000,shardBytes:512000000,indexBytes:2000000,manifestBytes:100000});
export const CENSUS_ZBP_ZIP_PROFILE_ADMISSION=Object.freeze({freeDiskBytes:12*1024**3,totalMemoryBytes:8*1024**3,freeMemoryBytes:6*1024**3});
const L=CENSUS_ZBP_ZIP_PROFILE_LIMITS,BASE='data/census-zbp-zip-profile-index',SOURCE='data/business-baselines/census-zbp',SHA=/^[a-f0-9]{64}$/,ID=/^census-zbp-zip-profile-index-[a-f0-9]{64}$/;
const sizes=['size_1_4','size_5_9','size_10_19','size_20_49','size_50_99','size_100_249','size_250_499','size_500_999','size_1000_plus'];
const columns=['zip_code','naics_code','establishments',...sizes.flatMap(k=>[k,`${k}_suppression_code`]),'preferred_city','preferred_state','county_name'];
const check=(v,why='contract')=>{if(!v)throw Error(`ZBP ZIP profile index rejected: ${why}.`);};
const hash=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>Buffer.from(`${JSON.stringify(v)}\n`),count=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort());
const regular=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n;
const identity=(a,b)=>regular(a)&&regular(b)&&a.ino===b.ino&&a.dev===b.dev;
const stable=(a,b)=>identity(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const directorySame=(a,b)=>a?.isDirectory()&&b?.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.ino===b.ino&&a.dev===b.dev;
const claims=()=>({export_policy:'local-review-only',reference_year:2023,hierarchical_aggregation_permitted:false,zip4:null,current_operations_verified:false,current_operating_business_count:null,gdp:null,all_business_completion_percent:null,network_requests:0,current_pointer_written:false,production_enrollment:false});
function options(o,keys){check(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k)),'options');}
async function resourceAdmission(root,signal){
 // The installed tree cannot opt out. Only distinct canonical app-contained
 // fixture trees skip native host floors; no public resource override exists.
 await canonical(path.join(root,'data'),{signal});
 if(root!==APP_ROOT)return;
 let volume=path.join(root,BASE);
 try{await fs.lstat(volume);}catch(error){if(error.code!=='ENOENT')throw error;volume=path.join(root,'data');}
 await canonical(volume,{signal});
 const stat=await fs.statfs(volume,{bigint:true}),limits=CENSUS_ZBP_ZIP_PROFILE_ADMISSION;
 check(stat.bavail>=0n&&stat.bsize>0n&&stat.bavail*stat.bsize>=BigInt(limits.freeDiskBytes),'insufficient free disk');
 const total=os.totalmem(),free=os.freemem();
 check(Number.isSafeInteger(total)&&Number.isSafeInteger(free)&&total>=limits.totalMemoryBytes&&free>=limits.freeMemoryBytes&&free<=total,'insufficient memory');
 signal?.throwIfAborted();
}
function decodedCeiling(){let consumed=0;return new Transform({transform(chunk,encoding,done){consumed+=chunk.length;if(consumed>L.decoded)done(Error('ZBP decoded ceiling.'));else done(null,chunk);}});}
async function inventory(dir,names,signal){await canonical(dir,{signal});check(same((await fs.readdir(dir)).sort(),[...names].sort()),'closed inventory');}
async function recheck(reads,signal){for(const r of reads){signal?.throwIfAborted();await canonical(path.dirname(r.file),{signal});check(stable(r.identity,await fs.lstat(r.file,{bigint:true})),'input drift');}}
async function bounded(file,maximum,signal,expected){
 await canonical(path.dirname(file),{signal});signal?.throwIfAborted();const before=await fs.lstat(file,{bigint:true});check(regular(before)&&before.size>0n&&before.size<=BigInt(maximum)&&(!expected||before.size===BigInt(expected.bytes)),'file bounds');
 const h=await fs.open(file,'r');try{check(stable(before,await h.stat({bigint:true})),'open identity');const raw=Buffer.alloc(Number(before.size));let n=0;while(n<raw.length){signal?.throwIfAborted();const r=await h.read(raw,n,Math.min(65536,raw.length-n),n);check(r.bytesRead>0,'truncated file');n+=r.bytesRead;}check(stable(before,await h.stat({bigint:true}))&&stable(before,await fs.lstat(file,{bigint:true})),'file changed');const sha=hash(raw);check(!expected||sha===expected.sha256,'file hash');return{raw,file,identity:before,sha256:sha,bytes:raw.length};}finally{await h.close();}
}
async function context(root,signal){
 root=path.resolve(root);const reads=[];
 async function json(relative,max=2000000){const meter={},file=path.join(root,relative),value=await readJson(file,max,signal,meter);reads.push({file,...meter});return{value,sha256:meter.sha256,path:relative};}
 const p=await json(`${SOURCE}/current.json`,16000);check(p.value.dataset_id==='census-zbp-baseline'&&/^releases\/[A-Za-z0-9-]+\/manifest.json$/.test(p.value.manifest),'source pointer');
 const m=await json(`${SOURCE}/${p.value.manifest}`);check(m.value.schema_version==='1.0.0'&&m.value.dataset_id===p.value.dataset_id&&m.value.release_id===p.value.release_id&&m.value.reference_year===2023&&m.value.complete_national_release===true,'source manifest');
 const policy=await json('config/source-policies/us-census-zbp.json',32000);check(policy.value.policy_id==='us-census-zbp'&&policy.value.version==='1.0.0'&&policy.value.allowed_use?.includes('derived aggregate datasets')&&policy.value.prohibited_use?.includes('converting suppressed or unpublished values to zero'),'source policy');
 const gp=await json('data/geography/current.json',16000);check(gp.value.dataset_id==='us-census-geography'&&/^releases\/[A-Za-z0-9-]+\/manifest.json$/.test(gp.value.manifest),'geography pointer');const gm=await json(`data/geography/${gp.value.manifest}`);
 check(gm.value.dataset_id===gp.value.dataset_id&&gm.value.release_id===gp.value.release_id&&m.value.geography_dependency?.release_id===gm.value.release_id&&m.value.geography_dependency?.manifest_sha256===gm.sha256,'geography dependency');
 const names=['derived/zip-coverage.jsonl','derived/naics-coverage.jsonl',...Array.from({length:10},(_,i)=>`derived/zip-naics/prefix=${i}.csv.gz`)];
 const artifacts=names.map((name,i)=>{const a=m.value.artifacts.filter(v=>v.path===name);check(a.length===1,'artifact uniqueness');const v=a[0],maximum=i===0?100000000:i===1?1000000:L.compressed;check(count(v.bytes)&&v.bytes>0&&v.bytes<=maximum&&SHA.test(v.sha256)&&count(v.record_count)&&v.record_count<=(i===0?L.zipRows:i===1?L.codes:L.partitionRows),'artifact limits');check(v.artifact_type===(i===0?'zip-coverage-union-jsonl':i===1?'naics-coverage-jsonl':'normalized-zbp-naics-csv-gzip')&&(i<2||v.partition===String(i-2)),'artifact type');return v;});
 check(m.value.artifacts.filter(v=>v.artifact_type==='normalized-zbp-naics-csv-gzip').length===10&&artifacts.slice(2).reduce((n,a)=>n+a.record_count,0)===m.value.coverage.industry_detail_rows&&m.value.coverage.industry_detail_rows<=L.totalRows,'source conservation');
 const sourceDir=path.dirname(path.join(root,m.path));for(const a of artifacts){const file=path.join(sourceDir,a.path);await canonical(path.dirname(file),{signal});const stat=await fs.lstat(file,{bigint:true});check(regular(stat)&&stat.size===BigInt(a.bytes),'source identity');reads.push({file,identity:stat});}
 const binding={pointer_path:p.path,pointer_sha256:p.sha256,manifest_path:m.path,manifest_sha256:m.sha256,release_id:m.value.release_id,reference_year:2023,artifacts,geography:{pointer_sha256:gp.sha256,manifest_sha256:gm.sha256,release_id:gm.value.release_id,dependency:m.value.geography_dependency},policy:{id:policy.value.policy_id,version:policy.value.version,sha256:policy.sha256}};
 await recheck(reads,signal);return{root,reads,sourceDir,artifacts,manifest:m.value,binding};
}
function normalize(row,prefix,codes){
 check(exact(row,columns)&&/^\d{5}$/.test(row.zip_code)&&row.zip_code[0]===prefix&&codes.has(row.naics_code),'detail row identity');
 const result={zip_code:row.zip_code,naics_code:row.naics_code};
 for(const k of ['establishments',...sizes]){check(row[k]===''||/^\d+$/.test(row[k])&&count(Number(row[k])),'count');result[k]=row[k]===''?null:Number(row[k]);}
 for(const k of sizes){const key=`${k}_suppression_code`;check(typeof row[key]==='string'&&row[key].length<=32,'suppression');result[key]=row[key]||null;check(result[key]===null||result[k]===null,'suppressed count');}
 result.publisher_place_labels={};for(const k of ['preferred_city','preferred_state','county_name']){check(typeof row[k]==='string'&&row[k].length<=256,'publisher label');result.publisher_place_labels[k]=row[k]||null;}
 return result;
}
async function replay(c,signal,emit){
 const coverage=new Map(),codes=new Set();
 for(const [i,a]of c.artifacts.slice(0,2).entries()){const meter={};for await(const row of readLines(path.join(c.sourceDir,a.path),a.bytes,signal,meter)){if(i===0){check(/^\d{5}$/.test(row.zip_code)&&!coverage.has(row.zip_code)&&coverage.size<L.zipRows,'coverage key');coverage.set(row.zip_code,row);}else{check(typeof row.naics_code==='string'&&/^[0-9/-]{6}$/.test(row.naics_code)&&!codes.has(row.naics_code)&&codes.size<L.codes,'NAICS key');codes.add(row.naics_code);}}check(meter.bytes===a.bytes&&meter.sha256===a.sha256&&meter.records===a.record_count,'coverage/catalog checksum');}
 const artifacts=[];let total=0,zips=0;
 for(const a of c.artifacts.slice(2)){
  const input=await bounded(path.join(c.sourceDir,a.path),L.compressed,signal,a),groups=new Map();let rows=0;
  const parser=parse({columns:header=>{check(same(header,columns),'CSV header');return header;},max_record_size:8192});
  const cap=decodedCeiling();
  const pumping=pipeline(Readable.from([input.raw]),createGunzip(),cap,parser,{signal});pumping.catch(()=>{});
  try{for await(const raw of parser){signal?.throwIfAborted();check(++rows<=a.record_count&&rows<=L.partitionRows,'partition row ceiling');const row=normalize(raw,a.partition,codes);check(coverage.has(row.zip_code),'detail ZIP missing coverage');if(!groups.has(row.zip_code))groups.set(row.zip_code,new Map());const group=groups.get(row.zip_code);check(!group.has(row.naics_code)&&group.size<L.codes,'duplicate ZIP/NAICS');group.set(row.naics_code,row);}await pumping;}finally{parser.destroy();cap.destroy();await pumping.catch(()=>{});}
  check(rows===a.record_count,'partition row conservation');total+=rows;check(total<=L.totalRows,'total ceiling');
  const entries=[],digest=createHash('sha256');let offset=0;
  for(const zip of [...coverage.keys()].filter(zip=>zip[0]===a.partition).sort()){
   const industry_rows=[...(groups.get(zip)?.values()??[])].sort((x,y)=>x.naics_code.localeCompare(y.naics_code));
   const profile={schema_version:'census-zbp-zip-profile@1.0.0',zip5:zip,zip4:null,reference_year:2023,status:industry_rows.length?'published-industry-rows':'no-published-industry-rows',zip_coverage:coverage.get(zip),industry_rows};
   const raw=bytes(profile);check(raw.length<=L.profileBytes&&offset+raw.length<=L.shardBytes,'profile/shard ceiling');entries.push({zip5:zip,offset,bytes:raw.length,sha256:hash(raw),industry_rows:industry_rows.length});digest.update(raw);offset+=raw.length;zips++;if(emit)await emit(`profiles-${a.partition}.jsonl`,profile);
  }
  const index=bytes(entries);check(index.length<=L.indexBytes,'index ceiling');if(emit)await emit(`index-${a.partition}.json`,entries);
  artifacts.push({path:`profiles-${a.partition}.jsonl`,bytes:offset,sha256:digest.digest('hex'),profiles:entries.length,industry_rows:rows},{path:`index-${a.partition}.json`,bytes:index.length,sha256:hash(index),profiles:entries.length});
  await recheck(c.reads,signal);
 }
 check(total===c.manifest.coverage.industry_detail_rows&&zips===coverage.size,'full conservation');return{artifacts,total,zips};
}
function manifest(c,r,createdAt){check(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&new Date(createdAt).toISOString()===createdAt&&createdAt>=c.manifest.retrieved_at,'clock');const body={schema_version:CENSUS_ZBP_ZIP_PROFILE_INDEX_VERSION,status:'immutable-local-lookup-index',created_at:createdAt,bindings:c.binding,source_rows:r.total,indexed_zip_count:r.zips,claims:claims(),artifacts:r.artifacts};return{release_id:`census-zbp-zip-profile-index-${hash(JSON.stringify(body))}`,...body};}
async function header(dir,c,signal,pin,staging=false){
 await canonical(dir,{signal});const owner=await fs.lstat(dir,{bigint:true}),meter={},m=await readJson(path.join(dir,'manifest.json'),L.manifestBytes,signal,meter);
 check(exact(m,['release_id','schema_version','status','created_at','bindings','source_rows','indexed_zip_count','claims','artifacts'])&&ID.test(m.release_id)&&m.schema_version===CENSUS_ZBP_ZIP_PROFILE_INDEX_VERSION&&m.status==='immutable-local-lookup-index','manifest');const{release_id,...body}=m;check(release_id===`census-zbp-zip-profile-index-${hash(JSON.stringify(body))}`&&(!pin||meter.sha256===pin),'manifest identity');
 check(staging||dir===path.join(c.root,BASE,'releases',m.release_id),'release path');check(same(m.bindings,c.binding)&&same(m.claims,claims())&&m.source_rows===c.manifest.coverage.industry_detail_rows&&m.indexed_zip_count===c.artifacts[0].record_count,'bindings/claims');
 check(Array.isArray(m.artifacts)&&m.artifacts.length===20,'artifact roster');for(let i=0;i<20;i++){const a=m.artifacts[i],index=i%2===1,prefix=Math.floor(i/2);check(exact(a,index?['path','bytes','sha256','profiles']:['path','bytes','sha256','profiles','industry_rows'])&&a.path===`${index?'index':'profiles'}-${prefix}.${index?'json':'jsonl'}`&&count(a.bytes)&&a.bytes<=(index?L.indexBytes:L.shardBytes)&&SHA.test(a.sha256)&&count(a.profiles)&&a.profiles<=10000&&(index||count(a.industry_rows)&&a.industry_rows<=L.partitionRows),'artifact descriptor');}
 await inventory(dir,['manifest.json',...m.artifacts.map(a=>a.path)],signal);return{m,owner,read:{file:path.join(dir,'manifest.json'),...meter}};
}
async function artifactHash(file,a,signal){await canonical(path.dirname(file),{signal});const initial=await fs.lstat(file,{bigint:true});check(regular(initial)&&initial.size===BigInt(a.bytes),'artifact identity');const h=await fs.open(file,'r'),digest=createHash('sha256');let n=0;try{check(stable(initial,await h.stat({bigint:true})),'artifact open');while(n<a.bytes){signal?.throwIfAborted();const raw=Buffer.alloc(Math.min(65536,a.bytes-n)),r=await h.read(raw,0,raw.length,n);check(r.bytesRead>0,'artifact truncated');n+=r.bytesRead;digest.update(raw.subarray(0,r.bytesRead));}check(stable(initial,await h.stat({bigint:true}))&&stable(initial,await fs.lstat(file,{bigint:true}))&&digest.digest('hex')===a.sha256,'artifact checksum/drift');return{file,identity:initial};}finally{await h.close();}}
async function verify(dir,c,signal,pin,staging=false){
 const head=await header(dir,c,signal,pin,staging),reads=[head.read];
 const r=await replay(c,signal);check(same(head.m,manifest(c,r,head.m.created_at)),'complete independent reconstruction');
 for(const a of head.m.artifacts)reads.push(await artifactHash(path.join(dir,a.path),a,signal));
 await recheck([...c.reads,...reads],signal);await inventory(dir,['manifest.json',...head.m.artifacts.map(a=>a.path)],signal);check(directorySame(head.owner,await fs.lstat(dir,{bigint:true})),'directory changed');return{...head,reads};
}
export async function verifyCensusZbpZipProfileIndex(manifestPath,opts={}){options(opts,['root','signal']);check(path.basename(manifestPath)==='manifest.json','manifest path');const c=await context(opts.root??APP_ROOT,opts.signal),v=await verify(path.dirname(path.resolve(manifestPath)),c,opts.signal);return{verified:true,release_id:v.m.release_id,manifest_sha256:v.read.sha256,source_rows:v.m.source_rows,indexed_zip_count:v.m.indexed_zip_count};}
export async function readCensusZbpZipProfile(opts={}){
 options(opts,['root','signal','manifestPath','manifestSha256','zip5']);const{signal,zip5}=opts;check(/^\d{5}$/.test(zip5)&&SHA.test(opts.manifestSha256)&&path.basename(opts.manifestPath)==='manifest.json','lookup input');const c=await context(opts.root??APP_ROOT,signal),dir=path.dirname(path.resolve(opts.manifestPath)),head=await header(dir,c,signal,opts.manifestSha256),prefix=Number(zip5[0]),a=head.m.artifacts[prefix*2+1],shard=head.m.artifacts[prefix*2],index=await bounded(path.join(dir,a.path),L.indexBytes,signal,a),entries=JSON.parse(index.raw);check(Array.isArray(entries)&&entries.length===a.profiles,'entries');let prior='',offset=0;
 for(const e of entries){check(exact(e,['zip5','offset','bytes','sha256','industry_rows'])&&/^\d{5}$/.test(e.zip5)&&e.zip5[0]===zip5[0]&&e.zip5>prior&&e.offset===offset&&count(e.bytes)&&e.bytes>0&&e.bytes<=L.profileBytes&&e.offset+e.bytes<=shard.bytes&&SHA.test(e.sha256)&&count(e.industry_rows)&&e.industry_rows<=L.codes,'entry');prior=e.zip5;offset+=e.bytes;}check(offset===shard.bytes,'range conservation');
 const entry=entries.find(e=>e.zip5===zip5),reads=[head.read,index];let profile=null;
 if(entry){const file=path.join(dir,shard.path);await canonical(path.dirname(file),{signal});const initial=await fs.lstat(file,{bigint:true});check(regular(initial)&&initial.size===BigInt(shard.bytes),'shard');const h=await fs.open(file,'r');try{check(stable(initial,await h.stat({bigint:true})),'range ownership');const raw=Buffer.alloc(entry.bytes);let n=0;while(n<raw.length){signal?.throwIfAborted();const r=await h.read(raw,n,raw.length-n,entry.offset+n);check(r.bytesRead>0,'range truncated');n+=r.bytesRead;}check(hash(raw)===entry.sha256,'range hash');profile=JSON.parse(raw);check(profile.schema_version==='census-zbp-zip-profile@1.0.0'&&profile.zip5===zip5&&profile.zip4===null&&profile.industry_rows.length===entry.industry_rows&&same(raw,bytes(profile)),'profile');check(stable(initial,await h.stat({bigint:true}))&&stable(initial,await fs.lstat(file,{bigint:true})),'range drift');reads.push({file,identity:initial});}finally{await h.close();}}
 await recheck([...reads,...c.reads],signal);await inventory(dir,['manifest.json',...head.m.artifacts.map(a=>a.path)],signal);check(directorySame(head.owner,await fs.lstat(dir,{bigint:true})),'lookup directory drift');return{zip5,status:entry?'present':'absent-from-selected-zbp-zip-union',profile,index_release_id:head.m.release_id,index_manifest_sha256:head.read.sha256,bindings:c.binding,claims:head.m.claims,source_payload_bytes_read:0,profile_payload_bytes_read:entry?.bytes??0,full_source_replay_performed:false};
}
async function cleanup(stage,owner,owned){try{await canonical(stage);check(directorySame(owner,await fs.lstat(stage,{bigint:true})));check((await fs.readdir(stage)).every(name=>owned.has(path.join(stage,name))));for(const[file,id]of owned){check(identity(id,await fs.lstat(file,{bigint:true})));await fs.unlink(file);}await fs.rmdir(stage);return true;}catch{return false;}}
async function unlock(h,file,id){const issues=[];let closed=false;try{await h.close();closed=true;}catch{issues.push('lock-close-failed');}try{const current=await fs.lstat(file,{bigint:true});if(!identity(id,current))issues.push('lock-ownership-mismatch');else if(closed)try{await fs.unlink(file);}catch{issues.push('lock-unlink-failed');}}catch{issues.push('lock-inspection-failed');}return issues;}
export async function publishCensusZbpZipProfileIndex(opts={}){
 options(opts,['root','signal','createdAt']);const{signal,createdAt}=opts,c=await context(opts.root??APP_ROOT,signal);check(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt))&&new Date(createdAt).toISOString()===createdAt&&createdAt>=c.manifest.retrieved_at,'clock');
 await resourceAdmission(c.root,signal);
 const base=path.join(c.root,BASE);for(const name of ['releases','.staging','.locks'])await canonical(path.join(base,name),{create:true,signal});
 const lockPath=path.join(base,'.locks',`${hash(JSON.stringify({bindings:c.binding,createdAt}))}.lock`),lock=await fs.open(lockPath,'wx'),owned=new Map(),stage=path.join(base,'.staging',randomUUID());let lockId,owner,primary,published=false,reused=false,releaseId=null;const outputs=new Map();
 try{lockId=await lock.stat({bigint:true});await fs.mkdir(stage);owner=await fs.lstat(stage,{bigint:true});
  const r=await replay(c,signal,async(name,value)=>{if(!outputs.has(name))outputs.set(name,await writer(path.join(stage,name),name.startsWith('index')?L.indexBytes:L.shardBytes,signal,owned));await outputs.get(name).write(value);});
  // Empty source partitions still have a declared empty profile shard.
  for(const a of r.artifacts){if(!outputs.has(a.path))outputs.set(a.path,await writer(path.join(stage,a.path),L.shardBytes,signal,owned));const actual=await outputs.get(a.path).finish();check(actual.bytes===a.bytes&&actual.sha256===a.sha256,'written artifact');}
  const m=manifest(c,r,createdAt);releaseId=m.release_id;const out=await writer(path.join(stage,'manifest.json'),L.manifestBytes,signal,owned);outputs.set('manifest.json',out);await out.write(m);await out.finish();const checked=await verify(stage,c,signal,undefined,true),target=path.join(base,'releases',releaseId);
  if(await fs.lstat(target).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;})){const v=await verify(target,c,signal);check(same(v.m,m),'existing release differs');reused=true;check(await cleanup(stage,owner,owned),'reuse staging cleanup');owner=null;return{verified:true,reused,release_id:releaseId,manifest_path:path.join(target,'manifest.json'),manifest_sha256:v.read.sha256};}
  await recheck([...checked.reads,...c.reads],signal);await canonical(path.dirname(target),{signal});check(directorySame(owner,await fs.lstat(stage,{bigint:true})),'staging ownership');signal?.throwIfAborted();await fs.rename(stage,target);published=true;
  await inventory(target,['manifest.json',...m.artifacts.map(a=>a.path)],signal);check(directorySame(owner,await fs.lstat(target,{bigint:true})),'published identity');await recheck(checked.reads.map(r=>({...r,file:path.join(target,path.basename(r.file))})),signal);await recheck(c.reads,signal);
  return{verified:true,reused:false,release_id:releaseId,manifest_path:path.join(target,'manifest.json'),manifest_sha256:checked.read.sha256,source_rows:r.total,indexed_zip_count:r.zips};
 }catch(error){primary=error;for(const out of outputs.values())await out.close().catch(()=>{});if(published){error.inspection_required=true;error.release_id=releaseId;}else if(owner&&!await cleanup(stage,owner,owned)){error.inspection_required=true;error.staging_id=path.basename(stage);}throw error;
 }finally{const issues=await unlock(lock,lockPath,lockId);if(issues.length){const recovery={inspection_required:true,release_id:releaseId,staging_id:path.basename(stage),publication_state:published?'published':reused?'reused':'not-published',lock_cleanup:{issues}};if(primary){primary.inspection_required=true;primary.recovery=recovery;}else throw Object.assign(Error('ZBP ZIP index lock requires inspection.'),{inspection_required:true,recovery});}}
}
