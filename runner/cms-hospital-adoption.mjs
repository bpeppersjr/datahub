import path from 'node:path';
import {mkdir,lstat,link,unlink} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson,mnSelectionReadLines as readLines,mnSelectionWriter as writer} from './mn-construction-retained-selection.mjs';
import {verifyCmsHospitalAcquisition,verifyCmsHospitalAcquisitionWithTestInput} from './cms-hospital-acquisition.mjs';

const SOURCE='cms-hospital-general-information',RUN='7140acea-6dfb-478e-8769-5dd991bc1875',HASH='856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239';
const VERSION='cms-hospital-retained-adoption@1.0.0';
export const CMS_ADOPTION_DEADLINE_MS=180000;
const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '),TERRITORIES=['AS','GU','MP','PR','VI'];
const check=value=>{if(!value)throw Error('CMS hospital retained adoption evidence rejected.');};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function exact(value,keys){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)??{},'value')));}
const nativeSource=()=>({manifestPath:path.join(APP_ROOT,'data/business-sources',SOURCE,'jobs',RUN,'manifest.json'),manifestSha256:HASH});
export const CMS_HOSPITAL_RETAINED_ADOPTION=Object.freeze({sourceId:SOURCE,runId:RUN,manifestSha256:HASH,action:'inspect-and-adopt-retained',acquisition:false,downloads:false});
const claims=()=>({networkRequestsPerformed:0,newAcquisitionPerformed:false,sourceReceiptRewritten:false,fullSourceReplayAtAdoption:true,rawExportPolicy:'internal',selectedExportPolicy:'local-review-only',publicExportAuthorized:false,uniqueBusinessCount:null,currentOperationsVerified:false,geographicAssignmentPerformed:false,allHospitalCompletenessPercent:null,nationalReportingIntegrated:false});
function binding(value,synthetic){exact(value,['operationId']);check(uuid(value.operationId));return path.join(APP_ROOT,synthetic?'data/tmp/cms-hospital-adoption':'data/managed-operations',value.operationId,'output');}
async function sourceSummary(source,synthetic,signal){
  const manifest=await (synthetic?verifyCmsHospitalAcquisitionWithTestInput:verifyCmsHospitalAcquisition)(source.manifestPath,source.manifestSha256,{signal});
  const artifact=manifest.artifacts.find(a=>a.path==='selected.jsonl'),meter={},states=Object.fromEntries(STATES.map(state=>[state,0])),territories=Object.fromEntries(TERRITORIES.map(state=>[state,0]));let unknownStateRows=0,rows=0;
  for await(const row of readLines(path.join(path.dirname(source.manifestPath),'selected.jsonl'),80000000,signal,meter)){
    check(++rows<=25000);const state=row.reportedAddress?.state;if(Object.hasOwn(states,state))states[state]++;else if(Object.hasOwn(territories,state))territories[state]++;else unknownStateRows++;
  }
  check(rows===manifest.sourceRows&&meter.sha256===artifact.sha256&&meter.bytes===artifact.bytes);
  const again={};await readJson(source.manifestPath,1000000,signal,again);check(again.sha256===source.manifestSha256);signal?.throwIfAborted();
  return {sourceId:SOURCE,sourceRunId:manifest.runId,sourceManifestSha256:source.manifestSha256,selectedSha256:artifact.sha256,selectedBytes:artifact.bytes,sourceDates:manifest.sourceDates,acquisitionStartedAt:manifest.createdAt,acquisitionCompletedAt:manifest.completedAt,recordUnit:'publisher-hospital-facility-directory-row',directoryRows:rows,states,territories,unknownStateRows,statesDcRows:Object.values(states).reduce((n,x)=>n+x,0),territoryRows:Object.values(territories).reduce((n,x)=>n+x,0)};
}
async function build(input,source,synthetic,{signal,hook}={}){
  const directory=binding(input,synthetic),startedAt=new Date().toISOString();signal?.throwIfAborted();
  const summary=await sourceSummary(source,synthetic,signal);check(startedAt>=summary.acquisitionCompletedAt);
  await canonical(path.dirname(directory),{signal});await mkdir(directory);await canonical(directory,{signal});
  const owned=new Map(),pending=path.join(directory,'adoption.pending'),final=path.join(directory,'cms-hospital-adoption.json');let output,published=false,descriptor;
  try {
    const receipt={schemaVersion:VERSION,operationId:input.operationId,executionMode:synthetic?'synthetic-test-input':'verified-retained-source',startedAt,finishedAt:new Date().toISOString(),summary,claims:claims()};
    output=await writer(pending,50000,signal,owned);await output.write(receipt);const artifact=await output.finish();
    descriptor={operationId:input.operationId,manifestPath:final,manifestSha256:artifact.sha256,inspectionRequired:false};
    await hook?.('before-publication');signal?.throwIfAborted();await canonical(directory,{signal});await link(pending,final);published=true;await unlink(pending);
    await hook?.('after-publication');signal?.throwIfAborted();return descriptor;
  } catch {
    await output?.close();
    if(!published){const id=owned.get(pending),now=await lstat(pending,{bigint:true}).catch(()=>null);if(id&&now?.isFile()&&!now.isSymbolicLink()&&now.nlink===1n&&now.ino===id.ino&&now.dev===id.dev)await unlink(pending);}
    const error=Error('CMS hospital adoption did not finish; retained output requires inspection.');if(published)error.recovery={...descriptor,inspectionRequired:true};throw error;
  }
}
async function readAdoption(descriptor,input,synthetic,signal){
  const directory=binding(input,synthetic);exact(descriptor,['operationId','manifestPath','manifestSha256','inspectionRequired']);
  check(descriptor.operationId===input.operationId&&descriptor.manifestPath===path.join(directory,'cms-hospital-adoption.json')&&sha(descriptor.manifestSha256)&&descriptor.inspectionRequired===false);
  const meter={},receipt=await readJson(descriptor.manifestPath,50000,signal,meter);check(meter.sha256===descriptor.manifestSha256);
  exact(receipt,['schemaVersion','operationId','executionMode','startedAt','finishedAt','summary','claims']);check(receipt.schemaVersion===VERSION&&receipt.operationId===input.operationId&&receipt.executionMode===(synthetic?'synthetic-test-input':'verified-retained-source')&&same(receipt.claims,claims()));
  for(const clock of [receipt.startedAt,receipt.finishedAt])check(typeof clock==='string'&&new Date(clock).toISOString()===clock);check(receipt.finishedAt>=receipt.startedAt);
  return receipt;
}
async function verify(descriptor,input,source,synthetic,{signal}={}){
  const receipt=await readAdoption(descriptor,input,synthetic,signal),summary=await sourceSummary(source,synthetic,signal);
  check(same(receipt.summary,summary)&&receipt.startedAt>=summary.acquisitionCompletedAt);
  const after=await readAdoption(descriptor,input,synthetic,signal);check(same(receipt,after));return receipt;
}
function nativeOptions(options){check(options&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).every(key=>key==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value'))&&(options.signal===undefined||options.signal instanceof AbortSignal));return options;}
async function deadline(action,options,milliseconds=CMS_ADOPTION_DEADLINE_MS){
  check(Number.isSafeInteger(milliseconds)&&milliseconds>0&&milliseconds<=CMS_ADOPTION_DEADLINE_MS);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('CMS adoption deadline expired.')),milliseconds);
  const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
  try{return await action({...options,signal});}finally{clearTimeout(timer);}
}
export const buildCmsHospitalAdoption=(input,options={})=>{nativeOptions(options);return deadline(o=>build(input,nativeSource(),false,o),options);};
export const verifyCmsHospitalAdoption=(descriptor,input,options={})=>{nativeOptions(options);return deadline(o=>verify(descriptor,input,nativeSource(),false,o),options);};
// Explicit synthetic entry points cannot produce a native receipt.
export const buildCmsHospitalAdoptionWithTestInput=(input,source,options={})=>deadline(o=>build(input,source,true,o),options,options.testDeadlineMs);
export const verifyCmsHospitalAdoptionWithTestInput=(descriptor,input,source,options={})=>deadline(o=>verify(descriptor,input,source,true,o),options,options.testDeadlineMs);
