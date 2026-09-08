import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, link, unlink, readdir, rmdir, realpath } from 'node:fs/promises';
import { isDeepStrictEqual as equal } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionReadLines as readLines, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';
import { loadMnConstructionCredentialReportingInput } from './mn-construction-credential-input.mjs';

const VERSION='mn-construction-credential-release@1.0.0',MAXIMUM=150_000_000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const check=value=>{if(!value)throw Error('Minnesota credential reporting release rejected.');};
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && equal(Reflect.ownKeys(value).sort(),[...keys].sort());
const same=(a,b)=>a && b && a.ino===b.ino && a.dev===b.dev && !b.isSymbolicLink();
const fileSame=(a,b)=>same(a,b) && b.isFile() && b.nlink===1n;
const stable=(a,b)=>fileSame(a,b) && a.size===b.size && a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs;
function optionsCheck(options,keys){check(options && typeof options==='object' && !Array.isArray(options) && Reflect.ownKeys(options).every(k=>keys.includes(k)));check(options.signal===undefined || options.signal instanceof AbortSignal);}
function envelope(id,at,sourceReceipt,input,artifact){return {schema_version:VERSION,release_id:id,created_at:at,
  source_app_receipt:sourceReceipt,summary:input.summary,semantics:input.semantics,
  artifacts:[{...artifact,artifact_type:'credential-reporting-jsonl',export_policy:'local-review-only'}]};}

async function inspect(manifestPath,signal,candidate=false){
  check(typeof manifestPath==='string' && path.isAbsolute(manifestPath) && path.basename(manifestPath)===(candidate?'manifest.tmp':'manifest.json'));
  const directory=path.dirname(manifestPath);await canonical(directory,{signal});
  const owner=await lstat(directory,{bigint:true});check(UUID.test(path.basename(directory)));
  check(equal((await readdir(directory)).sort(),['credentials.jsonl',path.basename(manifestPath)].sort()));
  const meter={},manifest=await readJson(manifestPath,2_000_000,signal,meter);
  check(exact(manifest,['schema_version','release_id','created_at','source_app_receipt','summary','semantics','artifacts'])
    && manifest.schema_version===VERSION && manifest.release_id===path.basename(directory)
    && typeof manifest.created_at==='string' && Number.isFinite(Date.parse(manifest.created_at)) && new Date(manifest.created_at).toISOString()===manifest.created_at);
  check(typeof manifest.source_app_receipt==='string' && !path.isAbsolute(manifest.source_app_receipt) && !manifest.source_app_receipt.includes('\\')
    && manifest.source_app_receipt.startsWith('data/') && !manifest.source_app_receipt.split('/').some(p=>!p || p==='.' || p==='..'));
  const input=await loadMnConstructionCredentialReportingInput(path.resolve(APP_ROOT,manifest.source_app_receipt),{signal});
  check(manifest.created_at>=input.sourceAppFinishedAt);
  const rowMeter={},rows=readLines(path.join(directory,'credentials.jsonl'),MAXIMUM,signal,rowMeter);
  let index=0;
  for await(const row of rows){check(index<input.reportingRows.length && equal(row,input.reportingRows[index++]));}
  check(index===input.reportingRows.length);
  const artifact={path:'credentials.jsonl',bytes:rowMeter.bytes,sha256:rowMeter.sha256,records:rowMeter.records};
  check(equal(manifest,envelope(manifest.release_id,manifest.created_at,manifest.source_app_receipt,input,artifact)));
  const after={};await readJson(manifestPath,2_000_000,signal,after);
  check(meter.sha256===after.sha256 && stable(meter.identity,after.identity)
    && stable(rowMeter.identity,await lstat(path.join(directory,'credentials.jsonl'),{bigint:true}))
    && same(owner,await lstat(directory,{bigint:true})));
  return {manifest_path:manifestPath,manifest_sha256:meter.sha256,manifest,...(candidate?{snapshots:{manifest:meter.identity,rows:rowMeter.identity}}:{})};
}
export async function verifyMnConstructionCredentialRelease(manifestPath,options={}){
  optionsCheck(options,['signal']);
  try{return await inspect(manifestPath,options.signal);}catch{options.signal?.throwIfAborted();throw Error('Minnesota credential reporting verification failed.');}
}

/** Derive immutable local-review input without network, current-pointer edits or AI. */
export async function buildMnConstructionCredentialRelease(receiptPath,options={}){
  optionsCheck(options,['signal','outputRoot']);const {signal}=options;signal?.throwIfAborted();
  const root=options.outputRoot??path.join(APP_ROOT,'data/credential-reporting/mn-construction');
  check(typeof root==='string' && path.isAbsolute(root) && typeof receiptPath==='string' && path.isAbsolute(receiptPath));
  // App jobs have exact artifact rosters, even though they lack manifest.json.
  // Never create a reporting child inside any source job or reserved job tree.
  check(!path.relative(APP_ROOT,root).split(path.sep).some(p=>p.toLowerCase()==='jobs'));
  const relativeSource=path.relative(path.dirname(receiptPath),root);
  check(relativeSource && (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)));
  for(let ancestor=root;ancestor!==APP_ROOT;ancestor=path.dirname(ancestor)){
    check(path.relative(APP_ROOT,ancestor) && !path.relative(APP_ROOT,ancestor).startsWith('..'));
    for(const name of ['receipt.json','start.json']){
      const exists=await lstat(path.join(ancestor,name)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});check(!exists);
    }
  }
  await canonical(root,{output:true,signal});
  const input=await loadMnConstructionCredentialReportingInput(receiptPath,{signal});
  const source=path.relative(APP_ROOT,receiptPath).replaceAll('\\','/');
  check(source.startsWith('data/') && !source.split('/').includes('..'));
  await canonical(root,{create:true,output:true,signal});
  const directory=path.join(root,randomUUID());await mkdir(directory);
  const owner=await lstat(directory,{bigint:true}),owned=new Map(),writers=[];let published=false;
  try{
    const rows=await writer(path.join(directory,'credentials.jsonl'),MAXIMUM,signal,owned);writers.push(rows);
    for(const row of input.reportingRows)await rows.write(row);
    const artifact=await rows.finish();
    const manifest=envelope(path.basename(directory),new Date().toISOString(),source,input,artifact);
    const temporary=path.join(directory,'manifest.tmp'),final=path.join(directory,'manifest.json');
    const output=await writer(temporary,2_000_000,signal,owned);writers.push(output);await output.write(manifest);await output.finish();
    const inspected=await inspect(temporary,signal,true);
    const beforeCommit={};for await(const row of readLines(path.join(directory,'credentials.jsonl'),MAXIMUM,signal,beforeCommit))void row;
    const manifestMeter={};await readJson(temporary,2_000_000,signal,manifestMeter);
    check(beforeCommit.sha256===artifact.sha256 && beforeCommit.bytes===artifact.bytes && beforeCommit.records===artifact.records
      && manifestMeter.sha256===inspected.manifest_sha256 && stable(inspected.snapshots.manifest,manifestMeter.identity)
      && stable(inspected.snapshots.rows,beforeCommit.identity));
    for(const [file,identity]of owned)check(fileSame(identity,await lstat(file,{bigint:true})));
    check(same(owner,await lstat(directory,{bigint:true})));await canonical(directory,{signal});signal?.throwIfAborted();
    // No-overwrite commit. Never cancellation-clean after the manifest is linked.
    await link(temporary,final);published=true;await unlink(temporary);
    return await verifyMnConstructionCredentialRelease(final);
  }catch{
    for(const output of writers)await output.close().catch(()=>{});
    if(signal?.aborted && !published && same(owner,await lstat(directory,{bigint:true}).catch(()=>null)) && await realpath(directory).catch(()=>null)===directory){
      for(const [file,identity]of owned)if(fileSame(identity,await lstat(file,{bigint:true}).catch(()=>null)))await unlink(file);
      if((await readdir(directory)).length===0)await rmdir(directory);
    }
    if(published)throw Object.assign(Error('Credential reporting publication requires inspection; preserve output before retry.'),{code:'MN_CREDENTIAL_PUBLICATION_INCOMPLETE',releaseId:path.basename(directory)});
    signal?.throwIfAborted();throw Error('Credential reporting build failed; preserve incomplete evidence before retry.');
  }
}
