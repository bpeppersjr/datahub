import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,lstat,link,unlink,rmdir} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionWriter as writer,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {mePreflightSnapshot,mePolicy} from './me-asc-preflight-session.mjs';
import {meCheck as check} from './me-asc-preflight-contract.mjs';
import {validateMeAscReceipt,readMeAscReceipt} from './me-asc-preflight-reader.mjs';

async function persist(receipt,signal,hook){
 const snapshot=mePreflightSnapshot(receipt);validateMeAscReceipt(snapshot);check(snapshot.cleanup_verified);
 if(hook)check(snapshot.execution_mode==='injected-test-transport');await mePolicy();signal?.throwIfAborted();
 const root=path.join(APP_ROOT,snapshot.execution_mode==='native-fetch'?'data/business-sources/me-asc/preflights':'data/tmp/me-asc-receipts');
 await canonical(root,{create:true,output:true,signal});const runId=randomUUID(),directory=path.join(root,runId);await mkdir(directory);
 const owner=await lstat(directory,{bigint:true}),owned=new Map();let active,published=false;
 const stable=async()=>{await canonical(directory);const now=await lstat(directory,{bigint:true});check(now.ino===owner.ino&&now.dev===owner.dev);};
 async function write(name,value){const file=path.join(directory,name);active=await writer(file,100000,signal,owned);await active.write(value);return active.finish();}
 try{
  const receiptDescriptor=await write('receipt.json',snapshot);const meter={};validateMeAscReceipt(await readJson(path.join(directory,'receipt.json'),100000,signal,meter));check(meter.sha256===receiptDescriptor.sha256);
  const descriptor=await write('manifest.tmp',{schema_version:'me-asc-preflight-bundle@1.0.0',run_id:runId,receipt:{name:'receipt.json',bytes:meter.bytes,sha256:meter.sha256}});
  await hook?.('before-publication',{directory});await stable();await mePolicy();signal?.throwIfAborted();
  const rehash={};await readJson(path.join(directory,'receipt.json'),100000,signal,rehash);check(rehash.sha256===meter.sha256);
  const manifestRehash={};await readJson(path.join(directory,'manifest.tmp'),10000,signal,manifestRehash);check(manifestRehash.sha256===descriptor.sha256);
  const manifest=path.join(directory,'manifest.json');await link(path.join(directory,'manifest.tmp'),manifest);published=true;await unlink(path.join(directory,'manifest.tmp'));
  await hook?.('after-publication',{directory});await readMeAscReceipt(manifest,{expectedSha256:descriptor.sha256});
  return {manifest,sha256:descriptor.sha256,status:snapshot.status,execution_mode:snapshot.execution_mode,cancellation_after_publication:Boolean(signal?.aborted)};
 }catch{throw Error(published?'Maine receipt publication uncertain; preserve and inspect output.':'Maine receipt publication failed.');}
 finally{
  await active?.close();
  if(!published)try{await stable();for(const [file,identity]of owned){const now=await lstat(file,{bigint:true}).catch(()=>null);if(now?.isFile()&&!now.isSymbolicLink()&&now.nlink===1n&&now.ino===identity.ino&&now.dev===identity.dev)await unlink(file);}await rmdir(directory);}catch{/* Preserve ownership changes for review. */}
 }
}
export const persistMeAscReceipt=(receipt,{signal}={})=>persist(receipt,signal);
export const persistMeAscReceiptWithTestHook=(receipt,hook,{signal}={})=>persist(receipt,signal,hook);
