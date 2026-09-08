import {createHash} from 'node:crypto';
import {setTimeout as delay,setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import path from 'node:path';
import connector from '../config/connectors/vt-childcare-centers-acquisition.json' with {type:'json'};
import policy from '../config/source-policies/vt-childcare-centers-internal.json' with {type:'json'};
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {acquireVtChildcarePreflight,validateVtChildcarePreflight,VT_CHILDCARE_FIELDS,VT_CHILDCARE_URLS,VT_CHILDCARE_FILTER} from './vt-childcare-preflight.mjs';

export const VT_CHILDCARE_ACQUISITION_VERSION='vt-childcare-acquisition@1.0.0';
export {VT_CHILDCARE_FIELDS};
export const VT_CHILDCARE_PAGE_SIZE=500;
export const VT_CHILDCARE_ACQUISITION_LIMITS=Object.freeze({records:20000,requests:135,decoded_body_bytes:150_000_000,page_bytes:8_000_000,other_bytes:2_000_000,request_timeout_ms:30000,whole_timeout_ms:900000,request_spacing_ms:1000});
const LIMIT=VT_CHILDCARE_ACQUISITION_LIMITS;
const pins=()=>({connector_sha256:'0555dd8125e587f4bd963ae7069f87a76e57eb0c93221ccd414f6b70e39a97e8',policy_sha256:'7c4ec65ca5b61260cf0cb52e30c2755aefcf8523db0ca3217b21bd464f7271ff'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const jsonHash=v=>hash(JSON.stringify(v));
const check=(v,label)=>{if(!v)throw Error('Vermont childcare acquisition rejected: '+label+'.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Reflect.ownKeys(v).sort(),[...keys].sort())&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const text=(v,max)=>typeof v==='string'&&v.length<=max&&Buffer.from(v).toString('utf8')===v&&!/[\u0000-\u001f\u007f]/u.test(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function optionsOnly(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'options');check(v.signal===undefined||v.signal instanceof AbortSignal,'signal');}
const ENDPOINT='https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json';
export function vtChildcareRequest(kind,pageNumber){
 check(['baseline-ids','page','final-ids'].includes(kind)&&Number.isSafeInteger(pageNumber)&&pageNumber>=1&&pageNumber<=41,'page request');
 return {url:ENDPOINT,request:{method:'POST',body:{query:'SELECT '+(kind==='page'?VT_CHILDCARE_FIELDS.join(','):'file_name,license_id')+' WHERE '+VT_CHILDCARE_FILTER+' ORDER BY file_name,license_id',page:{pageNumber,pageSize:500},includeSystem:false,includeSynthetic:false}}};
}
function itinerary(count){
 check(Number.isSafeInteger(count)&&count>0&&count<=LIMIT.records,'source count');const pages=Math.ceil(count/500),steps=[];
 for(const kind of ['baseline-ids','page','final-ids'])for(let pageNumber=1;pageNumber<=pages+1;pageNumber++)steps.push({kind,pageNumber,offset:(pageNumber-1)*500,length:Math.max(0,Math.min(500,count-(pageNumber-1)*500)),...vtChildcareRequest(kind,pageNumber)});
 return steps;
}
function importedConfiguration(){check(jsonHash(connector)===pins().connector_sha256&&jsonHash(policy)===pins().policy_sha256,'imported configuration');}
async function configuration(signal){
 importedConfiguration();
 for(const [file,pin]of [['config/connectors/vt-childcare-centers-acquisition.json',pins().connector_sha256],['config/source-policies/vt-childcare-centers-internal.json',pins().policy_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,file),100000,signal))===pin,'configuration');
}
export async function assertVtChildcareAcquisitionConfiguration(signal){check(signal===undefined||signal instanceof AbortSignal,'signal');signal?.throwIfAborted();await configuration(signal);return pins();}
function validateRows(payload,step,file,baseline){
 check(Array.isArray(payload)&&payload.length===step.length&&payload.length<=500,'page length including terminal');
 for(const [i,row]of payload.entries()){
  check(row&&typeof row==='object'&&!Array.isArray(row),'row');
  if(step.kind!=='page')check(exact(row,['file_name','license_id']),'roster fields');
  else check(Reflect.ownKeys(row).every(k=>VT_CHILDCARE_FIELDS.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(row,k),'value'))&&['file_name','license_id','license_type','provider_program_type'].every(k=>Object.hasOwn(row,k))&&row.license_type==='Licensed Provider'&&['CBCCPP','CBCCPP - Non-Recurring'].includes(row.provider_program_type),'private fields or center scope');
  check(row.file_name===file&&text(row.license_id,256)&&row.license_id.trim().length>0,'release-scoped source key');
  for(const [key,value]of Object.entries(row))if(value!==null)check(text(value,key==='license_id'?256:20000),'selected scalar');
  if(baseline)check(equal([row.file_name,row.license_id],baseline[step.offset+i]),'ordered membership');
 }
}
const claims=()=>({record_scope:'publisher-monthly-licensed-center-source-candidates',source_authenticity_verified:false,native_authenticated:false,current_operations_verified:false,atomic_snapshot_verified:false,public_export_authorized:false,national_reporting_integrated:false,full_http_body_hashes_independently_replayable:false,retention_hooks_independently_verified:false,physical_site_verified:false,identity_matching_eligible:false,address_role:'reported-address-role-unspecified',source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,coordinates_selected:false,source_reported_state_available:false,reporting_period_verified:false});
function matchingPreflights(a,b){
 validateVtChildcarePreflight(a);validateVtChildcarePreflight(b);check(equal(a.source,b.source)&&equal(a.configuration,b.configuration)&&a.observations.every((o,i)=>equal(o.payload,b.observations[i].payload)),'preflight drift');
}
export async function replayVtChildcareAcquisition(evidence,options={}){
 optionsOnly(options,['signal']);const {signal}=options;signal?.throwIfAborted();importedConfiguration();
 check(exact(evidence,['schema_version','execution_mode','configuration','started_at','finished_at','before_preflight','after_preflight','observations','transport','claims']),'evidence shape');
 matchingPreflights(evidence.before_preflight,evidence.after_preflight);
 const steps=itinerary(evidence.before_preflight.source.record_count);
 check(Array.isArray(evidence.observations)&&evidence.observations.length===steps.length,'exact itinerary');
 let retained=Buffer.byteLength(JSON.stringify(evidence.before_preflight))+Buffer.byteLength(JSON.stringify(evidence.after_preflight));
 for(const [i,o]of evidence.observations.entries()){
  check(exact(o,['kind','url','request','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256'])&&o.kind===steps[i].kind&&o.url===ENDPOINT&&exact(o.request,['method','body'])&&exact(o.request.body,['query','page','includeSystem','includeSynthetic'])&&exact(o.request.body.page,['pageNumber','pageSize'])&&equal(o.request,steps[i].request),'observation/request fields');
  validateRows(o.payload,steps[i],evidence.before_preflight.source.reporting_file);
  const maximum=o.kind==='page'?LIMIT.page_bytes:LIMIT.other_bytes;
  retained+=Buffer.byteLength(JSON.stringify(o.payload));check(Buffer.byteLength(JSON.stringify(o.payload))<=maximum&&retained<=LIMIT.decoded_body_bytes,'retained serialization ceilings');
  check(time(o.observed_at)&&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=maximum&&hex(o.body_sha256)&&o.payload_sha256===jsonHash(o.payload),'bounded observation');
 }
 check(evidence.schema_version===VT_CHILDCARE_ACQUISITION_VERSION&&['fixed-native-fetch','injected-test-transport'].includes(evidence.execution_mode)&&equal(evidence.configuration,pins())&&equal(evidence.claims,claims())&&time(evidence.started_at)&&time(evidence.finished_at)&&evidence.finished_at>=evidence.started_at&&Date.parse(evidence.finished_at)-Date.parse(evidence.started_at)<=LIMIT.whole_timeout_ms,'evidence claims/clocks');
 check(exact(evidence.transport,['requests','decoded_body_bytes'])&&evidence.transport.requests===12+steps.length&&evidence.transport.requests<=LIMIT.requests&&Number.isSafeInteger(evidence.transport.decoded_body_bytes)&&evidence.transport.decoded_body_bytes>0&&evidence.transport.decoded_body_bytes<=LIMIT.decoded_body_bytes,'transport');
 // Snapshot before first await, so later caller mutation cannot affect replay.
 evidence=structuredClone(evidence);await configuration(signal);
 const before=evidence.before_preflight,after=evidence.after_preflight;
 check(before.started_at>=evidence.started_at&&after.finished_at<=evidence.finished_at,'preflight chronology');
 let prior=before.finished_at,bodyBytes=[...before.observations,...after.observations].reduce((n,o)=>n+o.body_bytes,0);
 const baseline=[],seen=new Set(),features=[];
 for(const [i,o]of evidence.observations.entries()){
  signal?.throwIfAborted();const step=steps[i];check(o.observed_at>=prior&&o.observed_at<=after.started_at,'observation chronology');prior=o.observed_at;bodyBytes+=o.body_bytes;
  validateRows(o.payload,step,before.source.reporting_file,step.kind==='baseline-ids'?undefined:baseline);
  for(const row of o.payload){
   if(step.kind==='baseline-ids'){const key=JSON.stringify([row.file_name,row.license_id]);check(!seen.has(key),'duplicate license');seen.add(key);baseline.push([row.file_name,row.license_id]);}
   else if(step.kind==='page'){if(features.length%128===0){await yieldLoop();signal?.throwIfAborted();}features.push(structuredClone(row));}
  }
 }
 check(baseline.length===before.source.record_count&&features.length===baseline.length&&bodyBytes===evidence.transport.decoded_body_bytes,'count and observed byte conservation');
 for(const program of ['CBCCPP','CBCCPP - Non-Recurring']){
  const group=before.observations[1].payload.find(g=>g.provider_program_type===program);
  check(features.filter(r=>r.provider_program_type===program).length===(group?Number(group.source_rows):0),'program count');
 }
 check(features.filter(r=>r.current_license_start_date!=null).length===before.source.license_start_count&&features.filter(r=>r.current_license_end_date!=null).length===before.source.license_end_count,'calendar availability counts');
 await configuration(signal);signal?.throwIfAborted();return {features,source:{...before.source,observed_at:evidence.finished_at},claims:claims(),execution_mode:evidence.execution_mode};
}
function race(promise,signal,onLate=()=>{}){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});});
}
const cancel=response=>{if(response?.body && !response.body.locked)void response.body.cancel().catch(()=>{});};

/** Hooks are trusted cooperative durable sinks and are drained before return,
 * including cancellation. The deadline cannot safely interrupt their OS I/O.
 * Completion is not independent proof of retention; the app verifies files. */
async function acquire(options,executionMode){
  optionsOnly(options,['fetchImpl','signal','now','retainPrerequisite','retainObservation']);
  const {fetchImpl,signal,now=()=>new Date(),retainPrerequisite,retainObservation}=options;
  check([fetchImpl,now,retainPrerequisite,retainObservation].every(v=>typeof v==='function'),'explicit transport and retention hooks');signal?.throwIfAborted();
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(new Error('Vermont acquisition deadline.')),LIMIT.whole_timeout_ms),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;
  let previous,requests=0,totalBytes=0,lastEnd=null;
  const stamp=()=>{const value=now().toISOString();check(time(value) && (!previous || value>=previous),'clock');previous=value;return value;};
  async function request(target,kind,externalSignal,postRequest){
    const requestScope=externalSignal?AbortSignal.any([combined,externalSignal]):combined;
    check(postRequest?target===ENDPOINT&&Array.from({length:41},(_,i)=>vtChildcareRequest(kind,i+1)).some(r=>equal(r.request,postRequest)):Object.values(VT_CHILDCARE_URLS).includes(target),'fixed URL and POST body');
    if(lastEnd!==null){const wait=Math.max(0,1000-(performance.now()-lastEnd));if(wait)await delay(wait,undefined,{signal:requestScope});}
    requestScope.throwIfAborted();check(++requests<=LIMIT.requests,'request ceiling');
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(new Error('Vermont request deadline.')),LIMIT.request_timeout_ms),active=AbortSignal.any([requestScope,controller.signal]);let response,reader;
    try{
      response=await race(Promise.resolve().then(()=>{active.throwIfAborted();return fetchImpl(target,{method:postRequest?'POST':'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity',...(postRequest?{'Content-Type':'application/json'}:{})},...(postRequest?{body:JSON.stringify(postRequest.body)}:{}),signal:active});}),active,cancel);
      active.throwIfAborted();check(response instanceof Response && !response.redirected && (!response.url || response.url===target),'response URL');
      if(response.status===429 || response.status===503)throw Object.assign(new Error('Vermont publisher deferred; no retry performed.'),{code:'VT_CHILDCARE_DEFERRED'});
      check(response.status===200 && /^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'HTTP status/type');
      const maximum=kind==='page'?LIMIT.page_bytes:LIMIT.other_bytes,length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();
      check(length===null || /^\d+$/.test(length) && Number(length)<=maximum,'declared bytes');check(response.body,'body');reader=response.body.getReader();const chunks=[];let size=0;
      for(;;){const part=await race(reader.read(),active);active.throwIfAborted();if(part.done)break;size+=part.value.byteLength;totalBytes+=part.value.byteLength;check(size<=maximum && totalBytes<=LIMIT.decoded_body_bytes,'body ceiling');chunks.push(part.value);}
      check(length===null || encoding && encoding!=='identity' || Number(length)===size,'complete body');
      const raw=Buffer.concat(chunks,size),decoded=new TextDecoder('utf-8',{fatal:true}).decode(raw);JSON.parse(decoded);
      return {raw,body_bytes:size,body_sha256:hash(raw)};
    }finally{lastEnd=performance.now();clearTimeout(deadline);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
  }
  const preflightFetch=async(target,settings)=>{
    const kind=Object.keys(VT_CHILDCARE_URLS).find(k=>VT_CHILDCARE_URLS[k]===target);check(kind && settings.method==='GET' && settings.redirect==='error' && settings.credentials==='omit','preflight request');
    const result=await request(target,kind,settings.signal);return new Response(result.raw,{status:200,headers:{'content-type':'application/json','content-length':String(result.body_bytes)}});
  };
  try{
    const started_at=stamp();await configuration(combined);
    const before_preflight=await acquireVtChildcarePreflight({fetchImpl:preflightFetch,signal:combined,now:()=>new Date(stamp())});
    await retainPrerequisite(structuredClone(before_preflight));combined.throwIfAborted();
    const observations=[],baseline=[],seen=new Set();
    for(const step of itinerary(before_preflight.source.record_count)){
      const result=await request(step.url,step.kind,undefined,step.request),payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.raw));
      validateRows(payload,step,before_preflight.source.reporting_file,step.kind==='baseline-ids'?undefined:baseline);
      if(step.kind==='baseline-ids')for(const row of payload){const key=JSON.stringify([row.file_name,row.license_id]);check(!seen.has(key),'duplicate license');seen.add(key);baseline.push([row.file_name,row.license_id]);}
      const observation={kind:step.kind,url:step.url,request:step.request,observed_at:stamp(),http_status:200,body_bytes:result.body_bytes,body_sha256:result.body_sha256,payload,payload_sha256:jsonHash(payload)};
      await retainObservation(structuredClone(observation),observations.length);combined.throwIfAborted();observations.push(observation);
    }
    const after_preflight=await acquireVtChildcarePreflight({fetchImpl:preflightFetch,signal:combined,now:()=>new Date(stamp())});
    await configuration(combined);
    const evidence={schema_version:VT_CHILDCARE_ACQUISITION_VERSION,execution_mode:executionMode,configuration:pins(),started_at,finished_at:stamp(),before_preflight,after_preflight,observations,transport:{requests,decoded_body_bytes:totalBytes},claims:claims()};
    await replayVtChildcareAcquisition(evidence,{signal:combined});combined.throwIfAborted();return evidence;
  }catch(error){signal?.throwIfAborted();throw Object.assign(new Error('Vermont childcare acquisition failed; preserve retained prerequisites and observations before any retry.'),{code:error?.code==='VT_CHILDCARE_DEFERRED'?'VT_CHILDCARE_DEFERRED':'VT_CHILDCARE_ACQUISITION_FAILED'});}
  finally{clearTimeout(timer);}
}
export async function acquireVtChildcareWithTransport(options={}){optionsOnly(options,['fetchImpl','signal','now','retainPrerequisite','retainObservation']);check(typeof options.fetchImpl==='function','explicit injected transport');return acquire(options,'injected-test-transport');}
export async function acquireVtChildcareNative(options={}){optionsOnly(options,['signal','retainPrerequisite','retainObservation']);return acquire({...options,fetchImpl:globalThis.fetch},'fixed-native-fetch');}
export const acquireVtChildcareCenters=acquireVtChildcareNative;
