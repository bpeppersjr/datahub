import {randomUUID} from 'node:crypto';
import {lstat, open, readFile, realpath, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {runMdChildcareAppJob, verifyMdChildcareAppJob} from './md-childcare-app.mjs';

export {runMdChildcareAppJob};
export async function verifyMdChildcare(receiptPath, options = {}) {return verifyMdChildcareAppJob(receiptPath, options);}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const inside=(root,target)=>{const relative=path.relative(root,target);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};

export async function publishMdChildcareCurrentPointer(outputRoot, verified, {signal} = {}) {
  signal?.throwIfAborted();
  if(typeof outputRoot!=='string'||outputRoot!==path.resolve(outputRoot)||!exact(verified,['status','receiptPath','receipt','receipt_sha256'])||verified.status!=='verified'||!exact(verified.receipt,['schema_version','run_id','industry_run_id','status','execution_mode','started_at','finished_at','start_sha256','configuration','acquired','normalized','claims'])||verified.receipt.schema_version!=='md-childcare-app@1.0.0'||verified.receipt.status!=='SUCCEEDED'||!UUID.test(verified.receipt.run_id))throw Error('Maryland governed publication input is invalid.');
  const root=await realpath(outputRoot);if(root!==outputRoot||!inside(APP_ROOT,root))throw Error('Maryland governed publication root is invalid.');
  const receiptPath=await realpath(verified.receiptPath);if(receiptPath!==verified.receiptPath||!inside(root,receiptPath))throw Error('Maryland governed receipt escapes its output root.');
  const receiptInfo=await lstat(receiptPath,{bigint:true});if(!receiptInfo.isFile()||receiptInfo.isSymbolicLink()||receiptInfo.nlink!==1n||receiptInfo.size<=0n)throw Error('Maryland governed receipt is unsafe.');
  const relative=path.relative(root,receiptPath).replaceAll('\\','/');if(relative!==`jobs/${verified.receipt.run_id}/receipt.json`)throw Error('Maryland governed receipt path is invalid.');
  const pointer={dataset_id:'md-childcare-licensed-center-candidates',release_id:verified.receipt.run_id,manifest:relative,updated_at:verified.receipt.finished_at};
  const bytes=Buffer.from(`${JSON.stringify(pointer)}\n`),temporary=path.join(root,`.current-${randomUUID()}.tmp`),destination=path.join(root,'current.json');
  const prior=await lstat(destination,{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(prior&&(!prior.isFile()||prior.isSymbolicLink()||prior.nlink!==1n||prior.size<=0n||prior.size>100000n))throw Error('Maryland prior governed pointer is unsafe.');
  const handle=await open(temporary,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  try{signal?.throwIfAborted();if(!Buffer.from(await readFile(temporary)).equals(bytes))throw Error('Maryland temporary governed pointer changed.');await rename(temporary,destination);}catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
  const final=await lstat(destination,{bigint:true});if(!final.isFile()||final.isSymbolicLink()||final.nlink!==1n||!Buffer.from(await readFile(destination)).equals(bytes))throw Error('Maryland governed pointer publication requires inspection.');
  return {pointerPath:destination,pointer};
}
