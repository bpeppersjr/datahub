import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,readdir,rename,rmdir,unlink} from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {buildZipActiveEvidenceQualification,ZIP_ACTIVE_EVIDENCE_SCHEMA,ZIP_ACTIVE_EVIDENCE_LIMITS,assertZipActiveEvidencePairCount} from './zip-active-evidence-qualification.mjs';

const VERSION='zip-active-evidence-release@1.0.0',ID=/^zip-active-evidence-[a-f0-9]{64}$/;
const MAX_PART=2_000_000,MAX_RECORDS=ZIP_ACTIVE_EVIDENCE_LIMITS.rowsPerPartition,MAX_METADATA=4_000_000;
const check=(ok,message='ZIP qualification release rejected.')=>{if(!ok)throw Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=value=>Buffer.from(`${JSON.stringify(value)}\n`);
const exact=(value,keys)=>value&&same(Object.keys(value).sort(),[...keys].sort());
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.isFile()&&b.isFile()&&a.nlink===1n&&b.nlink===1n&&!a.isSymbolicLink()&&!b.isSymbolicLink();
const unchanged=(a,b)=>identity(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
function layout(projection){
 assertZipActiveEvidencePairCount(projection.rows.length);
 const {rows,...metadata}=projection,meta=bytes(metadata);check(meta.length<=MAX_METADATA);
 const digest=createHash('sha256').update(meta),artifacts=[{path:'projection.json',bytes:meta.length,sha256:hash(meta),record_count:1}];
 let size=0,count=0,part=0,hasher=createHash('sha256');
 const finish=()=>{if(!count)return;artifacts.push({path:`rows-${String(part++).padStart(4,'0')}.jsonl`,bytes:size,sha256:hasher.digest('hex'),record_count:count});size=0;count=0;hasher=createHash('sha256');};
 for(const row of rows){const line=bytes(row);check(line.length<=65536,'Projection row exceeds bounded JSONL contract.');if(count&&(size+line.length>MAX_PART||count===MAX_RECORDS))finish();hasher.update(line);digest.update(line);size+=line.length;count++;}finish();check(artifacts.length<=ZIP_ACTIVE_EVIDENCE_LIMITS.maxPartitions+1,'Projection exceeds partition bound.');
 return {metadata,meta,artifacts,releaseId:`zip-active-evidence-${digest.digest('hex')}`};
}
async function inventory(directory,manifest){
 await canonical(directory);
 check(same((await readdir(directory)).sort(),['manifest.json',...manifest.artifacts.map(a=>a.path)].sort()),'Unexpected release entries.');
}
async function inspect(directory,root,signal,{staging=false}={}){
 await canonical(directory);const dirIdentity=await lstat(directory,{bigint:true}),manifestMeter={};
 const manifest=await readJson(path.join(directory,'manifest.json'),1_000_000,signal,manifestMeter);
 check(exact(manifest,['schema_version','projection_schema','release_id','status','as_of','created_at','bindings','claims','source_zip_rows','artifacts'])&&manifest.schema_version===VERSION&&manifest.projection_schema===ZIP_ACTIVE_EVIDENCE_SCHEMA&&ID.test(manifest.release_id)&&manifest.status==='immutable-local-derived-release');
 check(staging||directory===path.join(root,'data/zip-active-evidence-qualification/releases',manifest.release_id),'Release directory identity mismatch.');
 assertZipActiveEvidencePairCount(manifest.source_zip_rows);
 check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length>=1&&manifest.artifacts.length<=ZIP_ACTIVE_EVIDENCE_LIMITS.maxPartitions+1);
 manifest.artifacts.forEach((a,index)=>check(exact(a,['path','bytes','sha256','record_count'])&&a.path===(index===0?'projection.json':`rows-${String(index-1).padStart(4,'0')}.jsonl`)&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=(index===0?MAX_METADATA:MAX_PART)&&/^[a-f0-9]{64}$/.test(a.sha256)&&Number.isSafeInteger(a.record_count)&&a.record_count>0&&a.record_count<=(index===0?1:MAX_RECORDS)));
 await inventory(directory,manifest);
 const expected=await buildZipActiveEvidenceQualification({root,asOf:manifest.as_of,createdAt:manifest.created_at,signal}),shape=layout(expected);
 check(manifest.release_id===shape.releaseId&&manifest.source_zip_rows===expected.rows.length&&same(manifest.bindings,expected.bindings)&&same(manifest.claims,expected.claims)&&same(manifest.artifacts,shape.artifacts),'Source replay or content identity mismatch.');
 const reads=[{file:path.join(directory,'manifest.json'),meter:manifestMeter,max:1_000_000}];let rowIndex=0;
 for(const [index,artifact] of manifest.artifacts.entries()){
  signal?.throwIfAborted();const file=path.join(directory,artifact.path),meter={};
  if(index===0)check(same(await readJson(file,MAX_METADATA,signal,meter),shape.metadata),'Projection metadata differs from source replay.');
  else{let records=0;for await(const row of readLines(file,artifact.bytes,signal,meter)){signal?.throwIfAborted();check(same(row,expected.rows[rowIndex++]),'Projection row differs from source replay.');records++;}check(records===artifact.record_count);}
  check(meter.bytes===artifact.bytes&&meter.sha256===artifact.sha256,'Release artifact tampered.');reads.push({file,meter,max:artifact.bytes});
 }
 check(rowIndex===expected.rows.length);
 // Repeat bounded reads and ownership checks after the potentially long replay.
 for(const entry of reads){const meter={};if(entry.file.endsWith('.jsonl'))for await(const row of readLines(entry.file,entry.max,signal,meter)){signal?.throwIfAborted();void row;}else await readJson(entry.file,entry.max,signal,meter);check(meter.sha256===entry.meter.sha256&&unchanged(meter.identity,entry.meter.identity),'Release changed during verification.');}
 await inventory(directory,manifest);const finalDir=await lstat(directory,{bigint:true});check(finalDir.ino===dirIdentity.ino&&finalDir.dev===dirIdentity.dev&&finalDir.isDirectory()&&!finalDir.isSymbolicLink(),'Release directory changed.');signal?.throwIfAborted();
 return {manifest,dirIdentity,files:reads.map(entry=>({file:entry.file,identity:entry.meter.identity})),manifestSha256:manifestMeter.sha256};
}

export async function verifyZipActiveEvidenceRelease(manifestPath,{root=APP_ROOT,signal}={}){
 root=path.resolve(root);check(path.basename(manifestPath)==='manifest.json');
 const result=await inspect(path.dirname(path.resolve(manifestPath)),root,signal);
 return {verified:true,release_id:result.manifest.release_id,manifest_sha256:result.manifestSha256,source_zip_rows:result.manifest.source_zip_rows,export_policy:result.manifest.claims.export_policy,network_requests:0,production_pointers_changed:false};
}
async function ownedWrite(file,data,owned,signal){
 signal?.throwIfAborted();await canonical(path.dirname(file));const handle=await open(file,'wx');const initial=await handle.stat({bigint:true});owned.set(file,initial);
 try{await handle.writeFile(data);await handle.sync();check(identity(initial,await handle.stat({bigint:true}))&&identity(initial,await lstat(file,{bigint:true})),'Output ownership changed.');}finally{await handle.close();}signal?.throwIfAborted();
}
async function cleanOwned(directory,owned,initial){
 try{
  await canonical(directory);const current=await lstat(directory,{bigint:true});check(current.ino===initial.ino&&current.dev===initial.dev);
  check((await readdir(directory)).every(name=>owned.has(path.join(directory,name))));
  for(const [file,id] of owned){check(identity(id,await lstat(file,{bigint:true})));await unlink(file);}
  await rmdir(directory);return true;
 }catch{return false;}
}

// Cleanup is secondary to the publication/cancellation outcome. Never leak a
// cleanup exception from finally or remove a lock whose ownership is uncertain.
async function releaseGuard(lock,lockPath,initial){
 const issues=[];let closed=false,current;
 try{await lock.close();closed=true;}catch{issues.push('lock-close-failed');}
 try{current=await fs.lstat(lockPath,{bigint:true});}catch(error){issues.push(error.code==='ENOENT'?'lock-missing':'lock-inspection-failed');}
 if(current){
  if(!initial||!identity(initial,current))issues.push('lock-ownership-mismatch');
  else if(closed){try{await fs.unlink(lockPath);}catch{issues.push('lock-unlink-failed');}}
 }
 return issues;
}

export async function publishZipActiveEvidenceRelease({root=APP_ROOT,asOf,createdAt,signal}={}){
 root=path.resolve(root);signal?.throwIfAborted();
 let projection=await buildZipActiveEvidenceQualification({root,asOf,createdAt,signal});const shape=layout(projection);
 const base=path.join(root,'data/zip-active-evidence-qualification'),releases=path.join(base,'releases'),stagingBase=path.join(base,'.staging'),locks=path.join(base,'.locks');
 for(const directory of [releases,stagingBase,locks])await canonical(directory,{create:true});
 const directory=path.join(releases,shape.releaseId),lockPath=path.join(locks,`${shape.releaseId}.lock`),lock=await fs.open(lockPath,'wx');
 const stage=path.join(stagingBase,randomUUID()),owned=new Map();let lockIdentity,stageIdentity,published=false,reused=false,primaryError;
 try{
  lockIdentity=await lock.stat({bigint:true});
  signal?.throwIfAborted();
  const exists=await lstat(directory).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  if(exists){projection=null;const verified=await verifyZipActiveEvidenceRelease(path.join(directory,'manifest.json'),{root,signal});reused=true;return {...verified,reused:true,directory};}
  await mkdir(stage);stageIdentity=await lstat(stage,{bigint:true});
  await ownedWrite(path.join(stage,'projection.json'),shape.meta,owned,signal);
  let rowIndex=0;
  for(const artifact of shape.artifacts.slice(1)){
   // Only one bounded partition is serialized at a time, not the whole projection.
   const chunks=[];for(let n=0;n<artifact.record_count;n++)chunks.push(bytes(projection.rows[rowIndex++]));
   const data=Buffer.concat(chunks);check(data.length===artifact.bytes&&hash(data)===artifact.sha256);await ownedWrite(path.join(stage,artifact.path),data,owned,signal);
  }
  const manifest={schema_version:VERSION,projection_schema:ZIP_ACTIVE_EVIDENCE_SCHEMA,release_id:shape.releaseId,status:'immutable-local-derived-release',as_of:asOf,created_at:createdAt,bindings:projection.bindings,claims:projection.claims,source_zip_rows:projection.rows.length,artifacts:shape.artifacts};
  const manifestBytes=bytes(manifest);check(manifestBytes.length<=1_000_000,'Release manifest exceeds bound.');
  await ownedWrite(path.join(stage,'manifest.json'),manifestBytes,owned,signal);
  // The independent replay need not retain a second complete projection array.
  projection=null;
  const verified=await inspect(stage,root,signal,{staging:true});
  await inventory(stage,manifest);const stageNow=await lstat(stage,{bigint:true});check(stageNow.ino===verified.dirIdentity.ino&&stageNow.dev===verified.dirIdentity.dev,'Staging directory changed before publication.');for(const entry of verified.files)check(unchanged(entry.identity,await lstat(entry.file,{bigint:true})),'Staging changed before publication.');
  await canonical(releases);signal?.throwIfAborted();check(!await lstat(directory).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}),'Release target appeared during publication.');
  await rename(stage,directory);published=true;
  await inventory(directory,manifest);const final=await lstat(directory,{bigint:true});check(final.ino===verified.dirIdentity.ino&&final.dev===verified.dirIdentity.dev);
  for(const entry of verified.files)check(unchanged(entry.identity,await lstat(path.join(directory,path.basename(entry.file)),{bigint:true})),'Installed release changed.');signal?.throwIfAborted();
  return {verified:true,reused:false,release_id:shape.releaseId,directory,manifest_sha256:verified.manifestSha256,source_zip_rows:manifest.source_zip_rows,export_policy:manifest.claims.export_policy,network_requests:0,production_pointers_changed:false};
 }catch(error){
  primaryError=error;
  if(published){error.release_id=shape.releaseId;error.inspection_required=true;}
  else if(stageIdentity&&!await cleanOwned(stage,owned,stageIdentity)){error.inspection_required=true;error.staging_id=path.basename(stage);}
  throw error;
 }finally{
  const issues=await releaseGuard(lock,lockPath,lockIdentity);
  if(issues.length){
   const recovery={inspection_required:true,release_id:shape.releaseId,publication_state:published?'published':reused?'reused':'not-published',published,reused,lock_cleanup:{status:'inspection-required',issues}};
   if(primaryError){primaryError.inspection_required=true;primaryError.release_id=shape.releaseId;primaryError.recovery=recovery;}
   else{const error=new Error('ZIP qualification release outcome requires lock inspection.');error.code='ZIP_RELEASE_INSPECTION_REQUIRED';Object.assign(error,{inspection_required:true,release_id:shape.releaseId,recovery});throw error;}
  }
 }
}
