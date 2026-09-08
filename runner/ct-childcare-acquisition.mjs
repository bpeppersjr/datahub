import { createHash } from 'node:crypto';
import { setTimeout as delay, setImmediate as yieldLoop } from 'node:timers/promises';
import { isDeepStrictEqual as equal } from 'node:util';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { acquireCtChildcarePreflight, validateCtChildcarePreflight, CT_CHILDCARE_FIELDS, CT_CHILDCARE_URLS, CT_CHILDCARE_FILTER } from './ct-childcare-preflight.mjs';

export const CT_CHILDCARE_ACQUISITION_VERSION='ct-childcare-acquisition@1.0.0';
export {CT_CHILDCARE_FIELDS};
export const CT_CHILDCARE_PAGE_SIZE=500;
export const CT_CHILDCARE_ACQUISITION_LIMITS=Object.freeze({records:20000,requests:80,decoded_body_bytes:150_000_000,page_bytes:8_000_000,other_bytes:2_000_000,request_timeout_ms:30000,whole_timeout_ms:900000,request_spacing_ms:1000});
const LIMIT=CT_CHILDCARE_ACQUISITION_LIMITS;
const pins=()=>({connector_sha256:'264968f32996a2f5a3f50caf5f5f04ce0006520592f9595da93fb9954a94cec6',policy_sha256:'f9af42d865c6575c0bba133c6e34e5fe16b03f11d64cc77411493638898cea60'});
const hash=value=>createHash('sha256').update(value).digest('hex');
const jsonHash=value=>hash(JSON.stringify(value));
const check=(value,label)=>{if(!value)throw new Error(`Connecticut childcare acquisition rejected: ${label}.`);};
const exact=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && equal(Reflect.ownKeys(v).sort(),[...keys].sort()) && keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const time=v=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const hex=v=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const text=(v,max)=>typeof v==='string' && v.length<=max && Buffer.from(v,'utf8').toString('utf8')===v && !/[\u0000-\u001f\u007f]/u.test(v);
function optionsOnly(v,keys){check(v && typeof v==='object' && !Array.isArray(v) && Reflect.ownKeys(v).every(k=>keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'options');check(v.signal===undefined || v.signal instanceof AbortSignal,'signal');}
function url(parameters){return 'https://data.ct.gov/resource/h8mr-dn95.json?'+new URLSearchParams({$where:CT_CHILDCARE_FILTER,...parameters});}
export const ctChildcareIdsUrl=()=>url({$select:'uniquekey',$order:'uniquekey ASC',$limit:'20001'});
export function ctChildcarePageUrl(offset){check(Number.isSafeInteger(offset) && offset>=0 && offset<LIMIT.records && offset%CT_CHILDCARE_PAGE_SIZE===0,'page offset');return url({$select:CT_CHILDCARE_FIELDS.join(','),$order:'uniquekey ASC',$limit:String(CT_CHILDCARE_PAGE_SIZE),$offset:String(offset)});}
async function configuration(signal){
  for(const [file,pin] of [['config/connectors/ct-childcare-centers-acquisition.json',pins().connector_sha256],['config/source-policies/ct-childcare-centers-internal.json',pins().policy_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,file),100000,signal))===pin,'configuration');
}
export async function assertCtChildcareAcquisitionConfiguration(signal){check(signal===undefined || signal instanceof AbortSignal,'signal');signal?.throwIfAborted();await configuration(signal);return pins();}
function ids(payload,count){
  check(Array.isArray(payload) && payload.length===count && count>0 && count<=LIMIT.records,'ID count');const seen=new Set();
  for(const row of payload){check(exact(row,['uniquekey']) && text(row.uniquekey,256) && row.uniquekey.length>0 && row.uniquekey===row.uniquekey.trim() && !seen.has(row.uniquekey),'ID roster');seen.add(row.uniquekey);}
  return payload.map(row=>row.uniquekey);
}
function page(payload,expected){
  check(Array.isArray(payload) && payload.length===expected.length && payload.length<=CT_CHILDCARE_PAGE_SIZE,'page count');
  for(const [index,row] of payload.entries()){
    check(row && typeof row==='object' && !Array.isArray(row) && Reflect.ownKeys(row).every(k=>CT_CHILDCARE_FIELDS.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(row,k),'value')) && row.uniquekey===expected[index] && row.licensetype==='Child Care Center' && row.status==='ACTIVE','private fields, active center or membership');
    for(const [key,value] of Object.entries(row)){
      if(value===null)continue;
      check(text(value,key==='uniquekey'?256:20000),'selected scalar');
    }
  }
}
const claims=()=>({record_scope:'publisher-ACTIVE-child-care-center-credential-rows',source_authenticity_verified:false,native_authenticated:false,current_operations_verified:false,atomic_snapshot_verified:false,public_export_authorized:false,national_reporting_integrated:false,full_http_body_hashes_independently_replayable:false,retention_hooks_independently_verified:false,physical_site_verified:false,identity_matching_eligible:false,address_role:'reported-address-unverified',source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false});
function matchingPreflights(a,b){
  validateCtChildcarePreflight(a);validateCtChildcarePreflight(b);
  check(equal(a.source,b.source) && equal(a.configuration,b.configuration) && a.observations.every((o,i)=>equal(o.payload,b.observations[i].payload)),'preflight drift');
}

export async function replayCtChildcareAcquisition(evidence,options={}){
  optionsOnly(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  // Bound typed payloads before cloning. These are retained serialization caps,
  // separate from the observed HTTP byte totals, not proof of original bytes.
  check(exact(evidence,['schema_version','execution_mode','configuration','started_at','finished_at','before_preflight','after_preflight','observations','transport','claims']),'evidence keys');
  matchingPreflights(evidence.before_preflight,evidence.after_preflight);
  const initialCount=evidence.before_preflight.source.record_count;
  check(Array.isArray(evidence.observations) && evidence.observations.length===Math.ceil(initialCount/500)+2,'bounded observation roster');
  let retainedBytes=Buffer.byteLength(JSON.stringify(evidence.before_preflight))+Buffer.byteLength(JSON.stringify(evidence.after_preflight));
  const initialIds=ids(evidence.observations[0]?.payload,initialCount);
  for(const [index,o] of evidence.observations.entries()){
    check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256']),'observation fields');
    const isPage=index>0 && index<evidence.observations.length-1;
    if(isPage)page(o.payload,initialIds.slice((index-1)*500,index*500));else ids(o.payload,initialCount);
    const size=Buffer.byteLength(JSON.stringify(o.payload));check(size<=(isPage?LIMIT.page_bytes:LIMIT.other_bytes),'retained payload ceiling');retainedBytes+=size;
    check(retainedBytes<=LIMIT.decoded_body_bytes,'retained serialization ceiling');
    check(typeof o.url==='string' && o.url.length<=3000 && typeof o.kind==='string' && o.kind.length<=20 && time(o.observed_at) && hex(o.body_sha256) && hex(o.payload_sha256)
      && o.http_status===200 && Number.isSafeInteger(o.body_bytes) && o.body_bytes>0 && o.body_bytes<=(isPage?LIMIT.page_bytes:LIMIT.other_bytes),'bounded observation scalars');
  }
  check(evidence.schema_version===CT_CHILDCARE_ACQUISITION_VERSION && ['fixed-native-fetch','injected-test-transport'].includes(evidence.execution_mode) && equal(evidence.configuration,pins()) && equal(evidence.claims,claims()) && time(evidence.started_at) && time(evidence.finished_at)
    && exact(evidence.transport,['requests','decoded_body_bytes']) && Number.isSafeInteger(evidence.transport.requests) && evidence.transport.requests<=LIMIT.requests && evidence.transport.requests>0
    && Number.isSafeInteger(evidence.transport.decoded_body_bytes) && evidence.transport.decoded_body_bytes>0 && evidence.transport.decoded_body_bytes<=LIMIT.decoded_body_bytes,'bounded envelope');
  evidence=structuredClone(evidence);
  check(exact(evidence,['schema_version','execution_mode','configuration','started_at','finished_at','before_preflight','after_preflight','observations','transport','claims']) && evidence.schema_version===CT_CHILDCARE_ACQUISITION_VERSION
    && equal(evidence.configuration,pins()) && equal(evidence.claims,claims()) && time(evidence.started_at) && time(evidence.finished_at) && evidence.finished_at>=evidence.started_at
    && Date.parse(evidence.finished_at)-Date.parse(evidence.started_at)<=LIMIT.whole_timeout_ms,'evidence');
  matchingPreflights(evidence.before_preflight,evidence.after_preflight);
  const before=evidence.before_preflight,after=evidence.after_preflight,count=before.source.record_count;
  check(before.started_at>=evidence.started_at && after.finished_at<=evidence.finished_at && Array.isArray(evidence.observations) && evidence.observations.length===Math.ceil(count/CT_CHILDCARE_PAGE_SIZE)+2,'sequence');
  let prior=before.finished_at,bodyBytes=[...before.observations,...after.observations].reduce((sum,o)=>sum+o.body_bytes,0),baseline,features=[];
  for(const [index,o] of evidence.observations.entries()){
    signal?.throwIfAborted();const last=index===evidence.observations.length-1,kind=index===0?'baseline-ids':last?'final-ids':'page';
    const expectedUrl=kind==='page'?ctChildcarePageUrl(features.length):ctChildcareIdsUrl();
    check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256']) && o.kind===kind && o.url===expectedUrl && o.http_status===200
      && time(o.observed_at) && o.observed_at>=prior && o.observed_at<=after.started_at && Number.isSafeInteger(o.body_bytes) && o.body_bytes>0 && o.body_bytes<=(kind==='page'?LIMIT.page_bytes:LIMIT.other_bytes)
      && hex(o.body_sha256) && o.payload_sha256===jsonHash(o.payload),'observation');
    bodyBytes+=o.body_bytes;check(bodyBytes<=LIMIT.decoded_body_bytes,'cumulative bytes');prior=o.observed_at;
    if(index===0)baseline=ids(o.payload,count);else if(last)check(equal(ids(o.payload,count),baseline),'final ID drift');
    else{page(o.payload,baseline.slice(features.length,features.length+CT_CHILDCARE_PAGE_SIZE));for(const row of o.payload){if(features.length%128===0){await yieldLoop();signal?.throwIfAborted();}features.push(structuredClone(row));}}
  }
  // Preserve numeric source serialization. Different strings for numerically
  // equivalent credentials fail this gate rather than silently coercing IDs.
  check(features.length===count && new Set(features.filter(r=>r.credentialidnt!=null).map(r=>r.credentialidnt)).size===before.source.distinct_credentials && features.filter(r=>r.address2!=null).length===before.source.address_count && features.filter(r=>r.zipcode!=null).length===before.source.zip_count,'selected count reconciliation');
  check(exact(evidence.transport,['requests','decoded_body_bytes']) && evidence.transport.requests===8+evidence.observations.length && evidence.transport.requests<=LIMIT.requests && evidence.transport.decoded_body_bytes===bodyBytes,'transport totals');
  signal?.throwIfAborted();return {features,source:{...before.source,observed_at:evidence.finished_at},claims:claims(),execution_mode:evidence.execution_mode};
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
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(new Error('Connecticut acquisition deadline.')),LIMIT.whole_timeout_ms),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;
  let previous,requests=0,totalBytes=0,lastEnd=null;
  const stamp=()=>{const value=now().toISOString();check(time(value) && (!previous || value>=previous),'clock');previous=value;return value;};
  async function request(target,kind,externalSignal){
    const requestScope=externalSignal?AbortSignal.any([combined,externalSignal]):combined;
    check(target===CT_CHILDCARE_URLS.metadata || target===CT_CHILDCARE_URLS.aggregate || target===ctChildcareIdsUrl() || kind==='page' && Array.from({length:40},(_,i)=>ctChildcarePageUrl(i*500)).includes(target),'fixed URL');
    if(lastEnd!==null){const wait=Math.max(0,1000-(performance.now()-lastEnd));if(wait)await delay(wait,undefined,{signal:requestScope});}
    requestScope.throwIfAborted();check(++requests<=LIMIT.requests,'request ceiling');
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(new Error('Connecticut request deadline.')),LIMIT.request_timeout_ms),active=AbortSignal.any([requestScope,controller.signal]);let response,reader;
    try{
      response=await race(Promise.resolve().then(()=>{active.throwIfAborted();return fetchImpl(target,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:active});}),active,cancel);
      active.throwIfAborted();check(response instanceof Response && !response.redirected && (!response.url || response.url===target),'response URL');
      if(response.status===429 || response.status===503)throw Object.assign(new Error('Connecticut publisher deferred; no retry performed.'),{code:'CT_CHILDCARE_DEFERRED'});
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
    const kind=Object.keys(CT_CHILDCARE_URLS).find(k=>CT_CHILDCARE_URLS[k]===target);check(kind && settings.method==='GET' && settings.redirect==='error' && settings.credentials==='omit','preflight request');
    const result=await request(target,kind,settings.signal);return new Response(result.raw,{status:200,headers:{'content-type':'application/json','content-length':String(result.body_bytes)}});
  };
  try{
    const started_at=stamp();await configuration(combined);
    const before_preflight=await acquireCtChildcarePreflight({fetchImpl:preflightFetch,signal:combined,now:()=>new Date(stamp())});
    await retainPrerequisite(structuredClone(before_preflight));combined.throwIfAborted();
    const observations=[];let baseline;
    async function observe(kind,target,expected){
      const result=await request(target,kind),payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.raw));
      if(kind==='page')page(payload,expected);else{const roster=ids(payload,before_preflight.source.record_count);if(kind==='baseline-ids')baseline=roster;else check(equal(roster,baseline),'final IDs');}
      const observation={kind,url:target,observed_at:stamp(),http_status:200,body_bytes:result.body_bytes,body_sha256:result.body_sha256,payload,payload_sha256:jsonHash(payload)};
      await retainObservation(structuredClone(observation),observations.length);combined.throwIfAborted();observations.push(observation);
    }
    await observe('baseline-ids',ctChildcareIdsUrl());
    for(let offset=0;offset<baseline.length;offset+=CT_CHILDCARE_PAGE_SIZE)await observe('page',ctChildcarePageUrl(offset),baseline.slice(offset,offset+CT_CHILDCARE_PAGE_SIZE));
    await observe('final-ids',ctChildcareIdsUrl());
    const after_preflight=await acquireCtChildcarePreflight({fetchImpl:preflightFetch,signal:combined,now:()=>new Date(stamp())});
    await configuration(combined);
    const evidence={schema_version:CT_CHILDCARE_ACQUISITION_VERSION,execution_mode:executionMode,configuration:pins(),started_at,finished_at:stamp(),before_preflight,after_preflight,observations,transport:{requests,decoded_body_bytes:totalBytes},claims:claims()};
    await replayCtChildcareAcquisition(evidence,{signal:combined});combined.throwIfAborted();return evidence;
  }catch(error){signal?.throwIfAborted();throw Object.assign(new Error('Connecticut childcare acquisition failed; preserve retained prerequisites and observations before any retry.'),{code:error?.code==='CT_CHILDCARE_DEFERRED'?'CT_CHILDCARE_DEFERRED':'CT_CHILDCARE_ACQUISITION_FAILED'});}
  finally{clearTimeout(timer);}
}
export async function acquireCtChildcareWithTransport(options={}){optionsOnly(options,['fetchImpl','signal','now','retainPrerequisite','retainObservation']);check(typeof options.fetchImpl==='function','explicit injected transport');return acquire(options,'injected-test-transport');}
export async function acquireCtChildcareNative(options={}){optionsOnly(options,['signal','now','retainPrerequisite','retainObservation']);return acquire({...options,fetchImpl:globalThis.fetch},'fixed-native-fetch');}
export const acquireCtChildcareAcquisition=acquireCtChildcareNative;
