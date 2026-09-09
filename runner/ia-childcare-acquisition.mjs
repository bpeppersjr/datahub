import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { selectIaChildcareRows, validateIaChildcareSelection } from './ia-childcare-selection.mjs';
import { IA_CHILDCARE_SCHEMA_PROBE_CONTRACT as C } from './ia-childcare-schema-probe.mjs';

export const IA_CHILDCARE_TEST_CLIENT = 'Iowa schema probe synthetic client fixture v1';
export const IA_CHILDCARE_URLS = Object.freeze({client:C.client_url,pins:C.pins_url});
export const IA_CHILDCARE_LIMITS = Object.freeze({requests:3,request_timeout_ms:20000,whole_timeout_ms:120000,client_bytes:1000000,response_bytes:10000000,rows:10000,selected_bytes:5000000});
const VERSION='ia-childcare-acquisition@1.0.0', L=IA_CHILDCARE_LIMITS;
const pins=Object.freeze({
  'config/connectors/ia-childcare-centers-acquisition.json':'6fe87d1d02009c2f9f7cb827820d3a487bb98d191c94c8ffb1cacc4a1edadb53',
  'config/source-policies/ia-childcare-centers-internal.json':'be383f1e27ee415cd8018dc77c384149c6c8dda6eaa4b8dce6b828f679170df0',
});
const hash=v=>createHash('sha256').update(v).digest('hex');
const check=(v)=>{if(!v)throw new Error('Iowa acquisition evidence rejected.');};
const exact=(v,keys)=>v && Object.getPrototypeOf(v)===Object.prototype && equal(Reflect.ownKeys(v).sort(),[...keys].sort()) && keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const time=v=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const claims=()=>({scope:'licensed-center-or-preschool-display-class',current_operations_verified:false,stable_provider_identity_verified:false,atomic_snapshot_verified:false,statewide_completeness_verified:false,public_export_authorized:false,full_response_replayable:false,geocode_accuracy_verified:false,source_update_time_known:false,app_enrolled:false});
function options(v,keys){check(v && Object.getPrototypeOf(v)===Object.prototype && Reflect.ownKeys(v).every(k=>keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined || v.signal instanceof AbortSignal);check(v.onCheckpoint===undefined || typeof v.onCheckpoint==='function');return v;}
async function configuration(signal){for(const [file,pin] of Object.entries(pins)){signal?.throwIfAborted();check(hash(JSON.stringify(await mnSelectionReadJson(path.join(APP_ROOT,file),100000,signal)))===pin);}}
export async function replayIaChildcareAcquisition(evidence,value={}) {
  const {signal}=options(value,['signal']);signal?.throwIfAborted();await configuration(signal);
  check(exact(evidence,['schema_version','execution_mode','started_at','finished_at','configuration','requests','selection','claims']));
  check(evidence.schema_version===VERSION && ['fixed-native-fetch','injected-test-transport'].includes(evidence.execution_mode) && equal(evidence.configuration,pins) && equal(evidence.claims,claims()));
  check(time(evidence.started_at) && time(evidence.finished_at) && evidence.finished_at>=evidence.started_at && Date.parse(evidence.finished_at)-Date.parse(evidence.started_at)<=L.whole_timeout_ms);
  check(Array.isArray(evidence.requests) && evidence.requests.length===3);
  let prior=evidence.started_at;
  for(const [i,r] of evidence.requests.entries()){
    check(exact(r,['url','method','status','observed_at','decoded_bytes','decoded_sha256']));
    check(r.url===(i===1?IA_CHILDCARE_URLS.pins:IA_CHILDCARE_URLS.client) && r.method===(i===1?'POST':'GET') && r.status===200 && time(r.observed_at) && r.observed_at>=prior && r.observed_at<=evidence.finished_at);
    check(Number.isSafeInteger(r.decoded_bytes) && r.decoded_bytes>0 && r.decoded_bytes<=(i===1?L.response_bytes:L.client_bytes) && typeof r.decoded_sha256==='string' && /^[a-f0-9]{64}$/.test(r.decoded_sha256));
    if(i!==1)check(r.decoded_bytes===(evidence.execution_mode==='fixed-native-fetch'?C.client_bytes:Buffer.byteLength(IA_CHILDCARE_TEST_CLIENT)) && r.decoded_sha256===(evidence.execution_mode==='fixed-native-fetch'?C.client_sha256:hash(IA_CHILDCARE_TEST_CLIENT)));
    prior=r.observed_at;
  }
  const snapshot={schema_version:VERSION,execution_mode:evidence.execution_mode,started_at:evidence.started_at,finished_at:evidence.finished_at,configuration:{...pins},requests:structuredClone(evidence.requests),selection:null,claims:claims()};
  snapshot.selection=await validateIaChildcareSelection(evidence.selection,{signal});
  signal?.throwIfAborted();return snapshot;
}
async function race(promise,signal){
  signal.throwIfAborted();let abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(new Error('Iowa acquisition cancelled.'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
  finally{if(abort)signal.removeEventListener('abort',abort);}
}
async function drain(body){let timer;try{await Promise.race([Promise.resolve().then(()=>body.cancel()).catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally{clearTimeout(timer);}}
async function acquire(transport,value,synthetic){
  const {signal,onCheckpoint}=options(value,['signal','onCheckpoint']);
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const whole=controller.signal,timer=setTimeout(abort,L.whole_timeout_ms);
  const evidence={schema_version:VERSION,execution_mode:synthetic?'injected-test-transport':'fixed-native-fetch',started_at:new Date().toISOString(),finished_at:null,configuration:pins,requests:[],selection:null,claims:claims()};
  async function request(index){
    whole.throwIfAborted();const isPins=index===1,url=isPins?IA_CHILDCARE_URLS.pins:IA_CHILDCARE_URLS.client;
    const local=new AbortController(),stop=()=>local.abort();whole.addEventListener('abort',stop,{once:true});if(whole.aborted)stop();
    const deadline=setTimeout(stop,L.request_timeout_ms);let response,reader;
    try{
      response=await race(Promise.resolve().then(()=>transport(url,{method:isPins?'POST':'GET',redirect:'error',credentials:'omit',headers:isPins?{'Content-Type':'application/x-www-form-urlencoded'}:{},...(isPins?{body:''}:{}),signal:local.signal})).then(async r=>{if(local.signal.aborted && r?.body)await drain(r.body);return r;}),local.signal);
      check(response?.status===200 && !response.redirected && response.body?.getReader);
      const cap=isPins?L.response_bytes:L.client_bytes,len=response.headers?.get('content-length');
      check(len===undefined || len===null || (/^[0-9]+$/.test(len) && Number(len)<=cap));
      reader=response.body.getReader();let bytes=0;const chunks=[],digest=createHash('sha256');
      for(;;){const part=await race(reader.read(),local.signal);if(part.done)break;check(part.value instanceof Uint8Array);bytes+=part.value.byteLength;check(bytes<=cap);digest.update(part.value);chunks.push(Buffer.from(part.value));}
      const raw=Buffer.concat(chunks),metadata={url,method:isPins?'POST':'GET',status:200,observed_at:new Date().toISOString(),decoded_bytes:bytes,decoded_sha256:digest.digest('hex')};
      if(!isPins)check(bytes===(synthetic?Buffer.byteLength(IA_CHILDCARE_TEST_CLIENT):C.client_bytes) && metadata.decoded_sha256===(synthetic?hash(IA_CHILDCARE_TEST_CLIENT):C.client_sha256));
      else evidence.selection=await selectIaChildcareRows(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),{signal:local.signal});
      local.signal.throwIfAborted();evidence.requests.push(metadata);
    }finally{stop();clearTimeout(deadline);whole.removeEventListener('abort',stop);if(reader){await drain(reader);reader.releaseLock();}else if(response?.body)await drain(response.body);}
    // Drain checkpoint work before proceeding or returning: cancellation must never leave writes in flight.
    whole.throwIfAborted();await onCheckpoint?.(['client-before','selected-response','client-after'][index],structuredClone(index===1?{request:evidence.requests[index],selection:evidence.selection}:evidence.requests[index]));whole.throwIfAborted();
  }
  try{
    await configuration(whole);
    for(let i=0;i<3;i++)await request(i);
    await configuration(whole);whole.throwIfAborted();evidence.finished_at=new Date().toISOString();
    return await replayIaChildcareAcquisition(evidence,{signal:whole});
  }catch{throw new Error('Iowa childcare acquisition failed: configuration, source, selection, checkpoint, deadline or cancellation requires review.');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function acquireIaChildcare(value={}){return acquire(globalThis.fetch,value,false);}
export async function acquireIaChildcareWithTestTransport(transport,value={}){check(typeof transport==='function');return acquire(transport,value,true);}
