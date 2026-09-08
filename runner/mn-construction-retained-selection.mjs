import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath, mkdir, open, readdir, link, unlink, rmdir, statfs } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { validateMnConstructionSelectionContext, processMnConstructionSelectedStream, replayMnConstructionSelectedStream } from './mn-construction-selected-stream.mjs';

const VERSION='mn-construction-retained-selection@1.0.0';
const FILES={'selected.jsonl':200_000_000,'selection-receipt.json':100_000,'normalized.jsonl':1_000_000_000};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=()=>createHash('sha256'), bytes=v=>Buffer.from(`${JSON.stringify(v)}\n`);
const check=(v,why)=>{if(!v)throw new Error(`Minnesota retained selection rejected: ${why}.`);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const sameFile=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.ino===b.ino&&a.dev===b.dev&&a.nlink===1n&&b.nlink===1n;
const stableFile=(a,b)=>sameFile(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const sameDirectory=(a,b)=>a&&b&&a.isDirectory()&&b.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.ino===b.ino&&a.dev===b.dev;
const claims=()=>({native_acquisition_verified:false,source_authenticity_verified:false,discarded_rejection_values_replayed:false,public_export_authorized:false,national_reporting_integrated:false});
// Shared by the acquisition receipt layer; preserve the same app-contained,
// bounded, ownership-checked I/O rather than introducing an unchecked reread.
export { canonical as mnSelectionCanonical, readJson as mnSelectionReadJson, writer as mnSelectionWriter };
async function canonical(target,{create=false,output=false,signal}={}) {
  check(typeof target==='string'&&target===path.resolve(target),'absolute path');
  const relative=path.relative(APP_ROOT,target),segments=relative.split(path.sep);
  check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&await realpath(APP_ROOT)===APP_ROOT,'app-contained path');
  check(segments.every(s=>s&&!/[ .]$|[<>:"|?*\u0000-\u001f]/u.test(s)&&(!output||!['releases','.staging'].includes(s.toLowerCase()))),'path segments');
  let current=APP_ROOT;
  for(const segment of segments){
    signal?.throwIfAborted();current=path.join(current,segment);
    if(create)try{await mkdir(current);}catch(e){if(e.code!=='EEXIST')throw e;}
    const stat=await lstat(current,{bigint:true}).catch(e=>{if(e.code==='ENOENT'&&!create)return null;throw e;});
    if(stat)check(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(current)===current,'directory alias');
    if(output)check(!await lstat(path.join(current,'manifest.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),'manifest-bearing output');
  }
  return target;
}
async function *readChunks(file,maximum,signal,meter={}) {
  await canonical(path.dirname(file),{signal});signal?.throwIfAborted();
  const initial=await lstat(file,{bigint:true});check(initial.isFile()&&!initial.isSymbolicLink()&&initial.nlink===1n&&initial.size<=BigInt(maximum),'bounded single-link input');
  const handle=await open(file,'r');const digest=hash();let consumed=0;
  try{
    check(sameFile(initial,await handle.stat({bigint:true})),'read ownership');
    for(;;){signal?.throwIfAborted();const buffer=Buffer.alloc(65536),result=await handle.read(buffer,0,buffer.length,null);if(!result.bytesRead)break;
      consumed+=result.bytesRead;check(consumed<=maximum,'read byte ceiling');const chunk=buffer.subarray(0,result.bytesRead);digest.update(chunk);yield chunk;}
    const after=await handle.stat({bigint:true}),named=await lstat(file,{bigint:true});
    check(stableFile(initial,after)&&stableFile(initial,named)&&BigInt(consumed)===initial.size,'read changed');
    meter.bytes=consumed;meter.sha256=digest.digest('hex');meter.identity=after;
  }finally{await handle.close();}
}
async function readJson(file,maximum,signal,meter={}){const chunks=[];for await(const chunk of readChunks(file,maximum,signal,meter))chunks.push(chunk);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
async function *readLines(file,maximum,signal,meter={}) {
  let tail=Buffer.alloc(0);meter.records=0;
  for await(const chunk of readChunks(file,maximum,signal,meter)){
    let start=0;
    for(let i=0;i<chunk.length;i++)if(chunk[i]===10){const line=Buffer.concat([tail,chunk.subarray(start,i)]);check(line.length>0&&line.length<=65536,'line ceiling or empty line');
      meter.records++;yield JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));tail=Buffer.alloc(0);start=i+1;}
    tail=Buffer.concat([tail,chunk.subarray(start)]);check(tail.length<=65536,'line ceiling');
  }
  check(tail.length===0,'unterminated retained line');
}
async function writer(file,maximum,signal,owned) {
  await canonical(path.dirname(file),{signal});signal?.throwIfAborted();const handle=await open(file,'wx');
  let identity;try{identity=await handle.stat({bigint:true});check(identity.isFile()&&identity.nlink===1n,'new file ownership');owned.set(file,identity);}catch(error){await handle.close();throw error;}
  let size=0,records=0,closed=false;const digest=hash();
  return {async write(value){signal?.throwIfAborted();const raw=bytes(value);size+=raw.length;check(size<=maximum,'artifact byte ceiling');digest.update(raw);records++;await handle.writeFile(raw);},
    async close(){if(closed)return;closed=true;await handle.close();},
    async finish(){signal?.throwIfAborted();await handle.sync();const named=await lstat(file,{bigint:true});check(sameFile(identity,named)&&named.size===BigInt(size),'written ownership');await this.close();return {path:path.basename(file),bytes:size,sha256:digest.digest('hex'),records};}};
}
function validateManifest(manifest,id){
  check(exact(manifest,['schema_version','bundle_id','status','created_at','artifacts','counts','claims'])&&manifest.schema_version===VERSION&&manifest.bundle_id===id&&UUID.test(id)
    &&manifest.status==='verified-caller-supplied-selection'&&typeof manifest.created_at==='string'&&Number.isFinite(Date.parse(manifest.created_at))&&new Date(manifest.created_at).toISOString()===manifest.created_at
    &&JSON.stringify(manifest.claims)===JSON.stringify(claims()),'manifest identity or claims');
  check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length===3,'artifact roster');
  for(const [index,name]of Object.keys(FILES).entries()){const a=manifest.artifacts[index];check(exact(a,['path','bytes','sha256','records'])&&a.path===name&&Number.isSafeInteger(a.bytes)&&a.bytes>=0&&a.bytes<=FILES[name]
    &&typeof a.sha256==='string'&&/^[a-f0-9]{64}$/.test(a.sha256)&&Number.isSafeInteger(a.records)&&a.records>=0&&a.records<=250000,'artifact descriptor');}
}
async function inspect(directory,manifest,signal,manifestName) {
  await canonical(directory,{signal});validateManifest(manifest,path.basename(directory));
  check(JSON.stringify((await readdir(directory)).sort())===JSON.stringify([...Object.keys(FILES),manifestName].sort()),'undeclared or missing artifact');
  const frameMeter={},normalizedMeter={},receiptMeter={};
  const receipt=await readJson(path.join(directory,'selection-receipt.json'),FILES['selection-receipt.json'],signal,receiptMeter);
  const normalized=readLines(path.join(directory,'normalized.jsonl'),FILES['normalized.jsonl'],signal,normalizedMeter);
  let result;
  try{
    result=await replayMnConstructionSelectedStream(Readable.from(readLines(path.join(directory,'selected.jsonl'),FILES['selected.jsonl'],signal,frameMeter)),receipt,{signal,emit:async record=>{
      const next=await normalized.next();check(!next.done&&JSON.stringify(next.value)===JSON.stringify(record),'normalized replay differs');}});
    check((await normalized.next()).done,'extra normalized records');
  }finally{await normalized.return();}
  receiptMeter.records=1;
  for(const [index,m]of [frameMeter,receiptMeter,normalizedMeter].entries()){const expected=manifest.artifacts[index];check(m.bytes===expected.bytes&&m.sha256===expected.sha256&&m.records===expected.records,'artifact checksum or count');}
  check(JSON.stringify(manifest.counts)===JSON.stringify(result.counts),'manifest conservation');
  const snapshots=Object.fromEntries(Object.keys(FILES).map((name,index)=>[path.join(directory,name),[frameMeter,receiptMeter,normalizedMeter][index].identity]));
  for(const [file,identity]of Object.entries(snapshots))check(stableFile(identity,await lstat(file,{bigint:true})),'cross-file stability');
  return {manifest,verification:result,snapshots,selection_receipt:receipt};
}
export async function verifyMnConstructionRetainedSelection(manifestPath,{signal}={}) {
  try{check(typeof manifestPath==='string'&&path.basename(manifestPath)==='manifest.json','manifest path');const directory=path.dirname(manifestPath);
    const owner=await lstat(await canonical(directory,{signal}),{bigint:true}),before={},after={};
    const manifest=await readJson(manifestPath,100000,signal,before);const result=await inspect(directory,manifest,signal,'manifest.json');
    await readJson(manifestPath,100000,signal,after);check(before.sha256===after.sha256&&stableFile(before.identity,after.identity)&&sameDirectory(owner,await lstat(directory,{bigint:true})),'manifest or directory changed');
    for(const [file,identity]of Object.entries(result.snapshots))check(stableFile(identity,await lstat(file,{bigint:true})),'final artifact stability');
    return {manifest:result.manifest,manifest_sha256:before.sha256,verification:result.verification,selection_receipt:result.selection_receipt};
  }catch{signal?.throwIfAborted();throw new Error('Minnesota retained selection verification failed.');}
}
export async function buildMnConstructionRetainedSelection(source,{context,signal,outputRoot=path.join(APP_ROOT,'data/business-sources/mn-dli-construction/retained')}={}) {
  validateMnConstructionSelectionContext(context);check(source instanceof Readable&&(signal===undefined||signal instanceof AbortSignal),'source or signal');signal?.throwIfAborted();context={...context};
  await canonical(outputRoot,{output:true,signal});
  let ancestor=outputRoot;while(!await lstat(ancestor).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))ancestor=path.dirname(ancestor);
  const capacity=await statfs(ancestor,{bigint:true});check(capacity.bavail*capacity.bsize>=1_500_000_000n,'disk headroom');
  await canonical(outputRoot,{create:true,output:true,signal});
  const directory=path.join(outputRoot,randomUUID());await mkdir(directory);const directoryOwner=await lstat(directory,{bigint:true});
  const owned=new Map(),writers=[];let published=false;
  try{
    const selected=await writer(path.join(directory,'selected.jsonl'),FILES['selected.jsonl'],signal,owned);writers.push(selected);
    const receipt=await processMnConstructionSelectedStream(source,{context,signal,emit:frame=>selected.write(frame)});const selectedArtifact=await selected.finish();
    const receiptWriter=await writer(path.join(directory,'selection-receipt.json'),FILES['selection-receipt.json'],signal,owned);writers.push(receiptWriter);await receiptWriter.write(receipt);const receiptArtifact=await receiptWriter.finish();
    const normalized=await writer(path.join(directory,'normalized.jsonl'),FILES['normalized.jsonl'],signal,owned);writers.push(normalized);
    await replayMnConstructionSelectedStream(Readable.from(readLines(path.join(directory,'selected.jsonl'),FILES['selected.jsonl'],signal)),receipt,{signal,emit:record=>normalized.write(record)});
    const normalizedArtifact=await normalized.finish();
    const manifest={schema_version:VERSION,bundle_id:path.basename(directory),status:'verified-caller-supplied-selection',created_at:new Date().toISOString(),artifacts:[selectedArtifact,receiptArtifact,normalizedArtifact],counts:receipt.counts,claims:claims()};
    const temporary=path.join(directory,'manifest.tmp'),final=path.join(directory,'manifest.json');
    const manifestWriter=await writer(temporary,100000,signal,owned);writers.push(manifestWriter);await manifestWriter.write(manifest);await manifestWriter.finish();
    const stored=await readJson(temporary,100000,signal);check(JSON.stringify(stored)===JSON.stringify(manifest),'written manifest changed');
    const inspected=await inspect(directory,stored,signal,'manifest.tmp');
    check(JSON.stringify(await readJson(temporary,100000,signal))===JSON.stringify(manifest),'manifest changed before commit');
    // Rehash as well as comparing timestamps: some filesystems can preserve or
    // defer same-size write timestamps. Ownership alone is not byte integrity.
    for(const artifact of manifest.artifacts){const measured={};for await(const chunk of readChunks(path.join(directory,artifact.path),FILES[artifact.path],signal,measured))void chunk;
      check(measured.bytes===artifact.bytes&&measured.sha256===artifact.sha256,'publication bytes changed');}
    for(const [file,identity]of owned)check(sameFile(identity,await lstat(file,{bigint:true})),'publication file ownership');
    for(const [file,identity]of Object.entries(inspected.snapshots))check(stableFile(identity,await lstat(file,{bigint:true})),'publication artifact stability');
    check(sameDirectory(directoryOwner,await lstat(directory,{bigint:true})),'publication directory ownership');
    await canonical(directory,{signal});signal?.throwIfAborted();
    // Manifest-last, no-overwrite commit. Once linked, never cancellation-clean
    // this bundle; a crash between link/unlink requires later inspection.
    await link(temporary,final);published=true;await unlink(temporary);
    await verifyMnConstructionRetainedSelection(final);
    return {manifest_path:final,bundle_id:manifest.bundle_id,counts:receipt.counts,native_acquisition_verified:false};
  }catch{
    for(const w of writers)await w.close().catch(()=>{});
    if(signal?.aborted&&!published&&sameDirectory(directoryOwner,await lstat(directory,{bigint:true}).catch(()=>null))&&await realpath(directory).catch(()=>null)===directory){
      for(const [file,identity]of owned)if(sameFile(identity,await lstat(file,{bigint:true}).catch(()=>null)))await unlink(file);
      if((await readdir(directory)).length===0)await rmdir(directory);
    }
    signal?.throwIfAborted();throw new Error('Minnesota retained selection build failed; incomplete evidence retained.');
  }
}
