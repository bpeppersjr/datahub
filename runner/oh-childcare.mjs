import {createHash,randomUUID} from 'node:crypto';
import {lstat,open,readFile,realpath,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {runOhChildcareAppJob,verifyOhChildcareAppJob} from './oh-childcare-app.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const inside=(root,target)=>{const relative=path.relative(root,target);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export {runOhChildcareAppJob};
export async function verifyOhChildcare(receiptPath,options={}){return verifyOhChildcareAppJob(receiptPath,options);}
export async function publishOhChildcareCurrentPointer(outputRoot,verified,{signal}={}){
  signal?.throwIfAborted();
  if(typeof outputRoot!=='string'||outputRoot!==path.resolve(outputRoot)||verified?.status!=='SUCCEEDED'||!UUID.test(verified.run_id)||typeof verified.receipt_path!=='string'||!SHA.test(verified.receipt_sha256))throw Error('Ohio governed publication input is invalid.');
  const root=await realpath(outputRoot);if(root!==outputRoot||!inside(APP_ROOT,root))throw Error('Ohio governed publication root is invalid.');
  const receiptPath=await realpath(verified.receipt_path);if(receiptPath!==verified.receipt_path||!inside(root,receiptPath)||path.relative(root,receiptPath).replaceAll('\\','/')!==`jobs/${verified.run_id}/receipt.json`)throw Error('Ohio governed receipt escapes its output root.');
  const info=await lstat(receiptPath,{bigint:true}),raw=await readFile(receiptPath);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1n||info.size!==BigInt(raw.length)||hash(raw)!==verified.receipt_sha256)throw Error('Ohio governed receipt is unsafe.');
  const receipt=JSON.parse(raw);if(receipt.schema_version!=='oh-childcare-app@1.0.0'||receipt.run_id!==verified.run_id||receipt.status!=='SUCCEEDED'||!time(receipt.finished_at)||receipt.public_export_authorized!==false||receipt.nationalReportingIntegrated!==false)throw Error('Ohio governed receipt claims are invalid.');
  const pointer={dataset_id:'oh-childcare-open-center-candidates',release_id:verified.run_id,manifest:`jobs/${verified.run_id}/receipt.json`,updated_at:receipt.finished_at};
  const bytes=Buffer.from(`${JSON.stringify(pointer)}\n`),temporary=path.join(root,`.current-${randomUUID()}.tmp`),destination=path.join(root,'current.json');
  const prior=await lstat(destination,{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(prior&&(!prior.isFile()||prior.isSymbolicLink()||prior.nlink!==1n||prior.size<=0n||prior.size>100000n))throw Error('Ohio prior governed pointer is unsafe.');
  const handle=await open(temporary,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  try{signal?.throwIfAborted();if(!Buffer.from(await readFile(temporary)).equals(bytes))throw Error('Ohio temporary governed pointer changed.');await rename(temporary,destination);}catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
  const final=await lstat(destination,{bigint:true});if(!final.isFile()||final.isSymbolicLink()||final.nlink!==1n||!Buffer.from(await readFile(destination)).equals(bytes))throw Error('Ohio governed pointer publication requires inspection.');
  return {pointerPath:destination,pointer};
}
