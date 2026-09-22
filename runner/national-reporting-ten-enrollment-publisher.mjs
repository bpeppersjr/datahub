import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {link,lstat,open,unlink} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {readNationalReportingSnapshot} from './national-reporting-snapshot.mjs';
import {validateNationalReportingCatalog} from './national-reporting-catalog.mjs';
import {inspectNationalReportingTenReceiptFixture,validateNationalReportingTenEnrollment} from './national-reporting-ten-projection.mjs';

const RUN=/^[a-zA-Z0-9._-]+$/;
const check=(value,message)=>{if(!value)throw new Error(`Ten-source enrollment publication rejected: ${message}.`);};
const stable=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&a.ino===b.ino&&a.dev===b.dev&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
const digest=value=>createHash('sha256').update(value).digest('hex');

function receiptPath(root,runId){
  check(typeof runId==='string'&&RUN.test(runId)&&runId!=='.'&&runId!=='..','closed run identifier');
  return path.join(root,'data','reconciliations','production-runs',runId,'receipt.json');
}
async function reread(file,maximum,before,signal){
  const meter={};await readJson(file,maximum,signal,meter);
  check(meter.sha256===before.sha256&&stable(before.identity,meter.identity),'evidence changed during validation');
}
async function publish(root,runId,{signal,checkpoint}={}){
  check(typeof root==='string'&&root===path.resolve(root),'absolute application root');
  check(signal===undefined||signal instanceof AbortSignal,'invalid cancellation signal');
  check(checkpoint===undefined||typeof checkpoint==='function','invalid checkpoint');
  signal?.throwIfAborted();
  const config=path.join(root,'config'),target=path.join(config,'national-reporting-ten-enrollment.json');
  await canonical(config,{signal});
  check(!await lstat(target).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}),'enrollment already exists');
  const catalogPath=path.join(config,'national-reporting-sources.json'),catalogMeter={};
  validateNationalReportingCatalog(await readJson(catalogPath,32000,signal,catalogMeter));
  const selectedReceipt=receiptPath(root,runId),receiptMeter={},receipt=await readJson(selectedReceipt,2000000,signal,receiptMeter);
  const snapshot=await readNationalReportingSnapshot({pointerPath:path.join(root,'data','business-coverage-views','current.json'),signal});
  const enrollment=validateNationalReportingTenEnrollment({
    schemaVersion:'national-reporting-ten-enrollment@1.0.0',
    denominatorVersion:'national-reporting-ten@1.0.0',
    predecessorCatalogSha256:catalogMeter.sha256,
    coveragePointerSha256:snapshot.evidence.pointerSha256,
    coverageManifestSha256:snapshot.evidence.manifestSha256,
    productionReceipt:{path:`data/reconciliations/production-runs/${runId}/receipt.json`,sha256:receiptMeter.sha256},
  });
  // This is the same closed receipt proof consumed later, run independently
  // before publication. It rejects non-production, incomplete and crossed outputs.
  inspectNationalReportingTenReceiptFixture(receipt,enrollment,snapshot);
  await checkpoint?.();signal?.throwIfAborted();
  await reread(catalogPath,32000,catalogMeter,signal);
  await reread(selectedReceipt,2000000,receiptMeter,signal);
  const after=await readNationalReportingSnapshot({pointerPath:path.join(root,'data','business-coverage-views','current.json'),signal});
  check(JSON.stringify(after.evidence)===JSON.stringify(snapshot.evidence),'current coverage changed during validation');
  signal?.throwIfAborted();
  const body=Buffer.from(`${JSON.stringify(enrollment,null,2)}\n`),temporary=path.join(config,`.national-reporting-ten-enrollment.${randomUUID()}.tmp`);
  let created=false;
  try{
    const handle=await open(temporary,'wx');
    try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
    const tempStat=await lstat(temporary,{bigint:true});check(tempStat.isFile()&&!tempStat.isSymbolicLink()&&tempStat.nlink===1n&&tempStat.size===BigInt(body.length),'temporary output ownership');
    signal?.throwIfAborted();await link(temporary,target);created=true;await unlink(temporary);
    const finalStat=await lstat(target,{bigint:true});check(finalStat.isFile()&&!finalStat.isSymbolicLink()&&finalStat.nlink===1n&&finalStat.size===BigInt(body.length),'published output ownership');
    return Object.freeze({status:'PUBLISHED',path:'config/national-reporting-ten-enrollment.json',sha256:digest(body),runId});
  }catch(error){
    await unlink(temporary).catch(()=>{});
    if(created)await unlink(target).catch(()=>{});
    if(signal?.aborted)signal.throwIfAborted();throw error;
  }
}

export async function publishNationalReportingTenEnrollment(runId,options={}){return publish(APP_ROOT,runId,options);}
export async function publishNationalReportingTenEnrollmentWithFixtureRoot(root,runId,options={}){
  const base=path.join(APP_ROOT,'data','tmp'),relative=path.relative(base,root);
  check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'fixture root outside data/tmp');
  return publish(root,runId,options);
}
