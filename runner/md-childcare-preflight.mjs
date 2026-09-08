import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,link,unlink,realpath} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

import contract from '../config/connectors/md-childcare-preflight.json' with {type:'json'};
const C=contract.source_contract;
export const MD_CHILDCARE_FIELDS=Object.freeze(C.fields.map(f=>f.name));
export const MD_CHILDCARE_FILTER=C.where;
export const MD_CHILDCARE_URLS=Object.freeze({item:`https://www.arcgis.com/sharing/rest/content/items/${C.item_id}?f=json`,layer:C.layer_url+'?f=json',count:C.layer_url+'/query?'+new URLSearchParams({f:'json',where:C.where,returnCountOnly:'true',returnGeometry:'false'})});
export const MD_CHILDCARE_PREFLIGHT_VERSION='md-childcare-preflight@1.0.0';
const PINS={connector_sha256:'13a854a6c8b0dd6e79172abd66720f40dfaf4d80340b637dcf4f4ea4deb5a8e3',policy_sha256:'6c42441dfbfe3ef054f0cea600f0361263476560baab3435f8e3fe4d8c192b72'};
const MAXIMUM=2_000_000,WHOLE=120_000,ORDER=['item','layer','count','count','layer','item'];
const hash=v=>createHash('sha256').update(v).digest('hex'),jsonHash=v=>hash(JSON.stringify(v));
const check=v=>{if(!v)throw Error('Maryland childcare metadata preflight rejected.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Reflect.ownKeys(v).sort(),[...keys].sort());
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function opts(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined||v.signal instanceof AbortSignal);}
async function configuration(signal){for(const [name,pin]of [['config/connectors/md-childcare-preflight.json',PINS.connector_sha256],['config/source-policies/md-childcare-preflight.json',PINS.policy_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,name),100000,signal))===pin);}
const ITEM_KEYS='id owner ownerId orgId created modified guid name title type typeKeywords description tags snippet thumbnail documentation extent categories spatialReference accessInformation classification licenseInfo culture properties advancedSettings url proxyFilter access size subInfo appCategories industries languages largeThumbnail banner screenshots listed commentsEnabled numComments numRatings avgRating numViews scoreCompleteness groupDesignations apiToken1ExpirationDate apiToken2ExpirationDate lastViewed'.split(' ');
function item(p){
 check(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>ITEM_KEYS.includes(k))&&Buffer.byteLength(JSON.stringify(p))<=MAXIMUM);
 check(p.id===C.item_id&&p.owner===C.owner&&p.orgId===C.organization_id&&p.title===C.title&&p.name===C.item_name&&p.type===C.item_type&&p.access===C.access&&p.url===C.service_url);
 check(p.licenseInfo===C.licenseInfo&&p.description===C.description);
 check(Number.isSafeInteger(p.created)&&Number.isSafeInteger(p.modified)&&p.created>0&&p.modified>=p.created);
 for(const key of Object.keys(p)){const v=p[key];check(v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean'||Array.isArray(v)&&v.every(x=>typeof x==='string'||Array.isArray(x)&&x.every(Number.isFinite))||['properties','advancedSettings','classification'].includes(key)&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0);}
 return p;
}
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
function layer(raw){
 check(raw&&typeof raw==='object'&&!['error','features','objectIds','attributes','geometry'].some(k=>Object.hasOwn(raw,k))&&Array.isArray(raw.fields)&&new Set(raw.fields.map(f=>f.name)).size===raw.fields.length);
 const p=pick(raw,['id','name','type','description','serviceItemId','objectIdField','geometryType','capabilities','maxRecordCount','editingInfo']);
 p.spatialReference=raw.extent?.spatialReference??raw.spatialReference;
 p.advancedQueryCapabilities=pick(raw.advancedQueryCapabilities??{},['supportsPagination','supportsStatistics','supportsOrderBy']);
 p.fields=C.fields.map(expected=>{const f=raw.fields.find(f=>f.name===expected.name);check(f);return pick(f,['name','type','length','nullable','domain']);});
 check(p.id===0&&p.name===C.layer_name&&p.type==='Feature Layer'&&p.description===''&&p.serviceItemId===C.item_id&&p.objectIdField==='OBJECTID'&&p.geometryType==='esriGeometryPoint'&&p.capabilities==='Query'&&p.maxRecordCount===2000);
 check(same(p.spatialReference,{wkid:102100,latestWkid:3857})&&same(p.advancedQueryCapabilities,{supportsPagination:true,supportsStatistics:true,supportsOrderBy:true})&&same(p.fields,C.fields));
 check(exact(p.editingInfo,['lastEditDate','schemaLastEditDate','dataLastEditDate'])&&Object.values(p.editingInfo).every(v=>Number.isSafeInteger(v)&&v>0));return p;
}
function counts(p){check(exact(p,['count'])&&Number.isSafeInteger(p.count)&&p.count>0&&p.count<=20000);return p;}
function source(p,count){return {dataset_id:C.item_id,where:C.where,record_count:count.count,publisher_cohort_date:C.publisher_cohort_date,item_modified_at:new Date(p.modified).toISOString(),status_basis:'publisher licensed-provider cohort dated February 13 2026, literal center category; not current operation verification'};}
const claims=()=>({source_records_requested:0,facility_rows_retained:0,source_authenticity_verified:false,native_execution_independently_verified:false,unique_business_identity_verified:false,current_operations_verified:false,public_export_authorized:false,national_reporting_integrated:false,legal_approval:false,agreement_acceptance_performed:false,full_item_metadata_retained:true,full_layer_metadata_retained:false,full_http_bodies_replayable:false});
const readiness=()=>({metadata_preflight_passed:true,acquisition_ready:false,app_enrolled:false,scheduled:false,remaining_implementation:['selected-row-acquisition','coordinate-basis-and-postal-normalization','immutable-source-release-and-app-worker']});
function stableItem(p){const copy=structuredClone(p);delete copy.numViews;delete copy.lastViewed;return copy;}
export function validateMdChildcarePreflight(receipt){
 check(jsonHash(contract)===PINS.connector_sha256);
 check(exact(receipt,['schema_version','status','execution_mode','configuration','started_at','finished_at','observations','source','claims','readiness'])&&receipt.schema_version===MD_CHILDCARE_PREFLIGHT_VERSION&&receipt.status==='metadata-preflight-passed'&&['fixed-native-fetch','injected-test-transport'].includes(receipt.execution_mode)&&same(receipt.configuration,PINS));
 check(time(receipt.started_at)&&time(receipt.finished_at)&&receipt.finished_at>=receipt.started_at&&Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=WHOLE&&Array.isArray(receipt.observations)&&receipt.observations.length===6);
 let prior=receipt.started_at;
 for(const [index,o]of receipt.observations.entries()){
 check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256'])&&o.kind===ORDER[index]&&o.url===MD_CHILDCARE_URLS[o.kind]&&time(o.observed_at)&&o.observed_at>=prior&&o.observed_at<=receipt.finished_at&&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=MAXIMUM&&digest(o.body_sha256)&&Buffer.byteLength(JSON.stringify(o.payload))<=MAXIMUM&&o.payload_sha256===jsonHash(o.payload));
 if(o.kind==='item')item(o.payload);else if(o.kind==='layer'){check(same(layer(o.payload),o.payload));check(Object.values(o.payload.editingInfo).every(v=>v<=Date.parse(o.observed_at)));}else counts(o.payload);prior=o.observed_at;
 }
 check(same(stableItem(receipt.observations[0].payload),stableItem(receipt.observations[5].payload))&&same(receipt.observations[1].payload,receipt.observations[4].payload)&&same(receipt.observations[2].payload,receipt.observations[3].payload));
 check(same(receipt.source,source(receipt.observations[0].payload,receipt.observations[2].payload))&&receipt.source.item_modified_at<=receipt.started_at&&same(receipt.claims,claims())&&same(receipt.readiness,readiness()));return receipt;
}
function race(promise,signal,onLate=()=>{}){signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});});}
const cancel=response=>{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});};
export async function acquireMdChildcarePreflight(options={}){
  opts(options,['fetchImpl','signal','now']);const {fetchImpl=fetch,signal,now=()=>new Date()}=options;check(typeof fetchImpl==='function'&&typeof now==='function');signal?.throwIfAborted();
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(Error('Maryland preflight deadline.')),WHOLE),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;let prior;
  const stamp=()=>{const value=now().toISOString();check(time(value)&&(!prior||value>=prior));prior=value;return value;};
  try{
    const started_at=stamp(),observations=[];await configuration(combined);
    for(const kind of ORDER){
      if(observations.length)await delay(1000,undefined,{signal:combined});combined.throwIfAborted();const request=new AbortController(),requestTimer=setTimeout(()=>request.abort(Error('Maryland request deadline.')),30000),requestSignal=AbortSignal.any([combined,request.signal]);let response,reader;
      try{
        response=await race(Promise.resolve().then(()=>{requestSignal.throwIfAborted();return fetchImpl(MD_CHILDCARE_URLS[kind],{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:requestSignal});}),requestSignal,cancel);
        requestSignal.throwIfAborted();check(response instanceof Response&&!response.redirected);
        if(response.status===429||response.status===503)throw Object.assign(Error('Maryland publisher deferred.'),{code:'MD_CHILDCARE_DEFERRED'});
        check(response.status===200&&(!response.url||response.url===MD_CHILDCARE_URLS[kind])&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''));
        const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();check(length===null||/^\d+$/.test(length)&&Number(length)<=MAXIMUM);check(response.body);reader=response.body.getReader();let size=0;const chunks=[];
        for(;;){const part=await race(reader.read(),requestSignal);requestSignal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;check(size<=MAXIMUM);chunks.push(part.value);}
        check(length===null||encoding&&encoding!=='identity'||Number(length)===size);const raw=Buffer.concat(chunks,size),decoded=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));const payload=kind==='item'?item(decoded):kind==='layer'?layer(decoded):counts(decoded);
        observations.push({kind,url:MD_CHILDCARE_URLS[kind],observed_at:stamp(),http_status:200,body_bytes:size,body_sha256:hash(raw),payload,payload_sha256:jsonHash(payload)});
      }finally{clearTimeout(requestTimer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
    }
    await configuration(combined);combined.throwIfAborted();return validateMdChildcarePreflight({schema_version:MD_CHILDCARE_PREFLIGHT_VERSION,status:'metadata-preflight-passed',execution_mode:options.fetchImpl===undefined?'fixed-native-fetch':'injected-test-transport',configuration:{...PINS},started_at,finished_at:stamp(),observations,source:source(observations[0].payload,observations[2].payload),claims:claims(),readiness:readiness()});
  }catch(error){signal?.throwIfAborted();throw Object.assign(Error('Maryland metadata preflight failed; no facility rows were requested.'),{code:error?.code==='MD_CHILDCARE_DEFERRED'?'MD_CHILDCARE_DEFERRED':'MD_CHILDCARE_PREFLIGHT_FAILED'});}finally{clearTimeout(timer);}
}
export async function writeMdChildcarePreflight(receipt,options={}){
  opts(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  const snapshot=structuredClone(receipt);validateMdChildcarePreflight(snapshot);const raw=Buffer.from(JSON.stringify(snapshot)+'\n');check(raw.length<=4_000_000);await configuration(signal);
  const root=path.join(APP_ROOT,'data/business-sources/md-childcare/preflights');await canonical(root,{output:true,create:true,signal});const directory=await lstat(root,{bigint:true}),id=randomUUID(),temporary=path.join(root,id+'.tmp'),destination=path.join(root,id+'.json');let identity,published=false;
  const owned=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino===identity?.ino&&s.dev===identity?.dev;
  try{
    signal?.throwIfAborted();const handle=await open(temporary,'wx');try{identity=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const meter={};check(same(await readJson(temporary,4_000_000,signal,meter),snapshot)&&meter.sha256===hash(raw)&&owned(meter.identity));await configuration(signal);await canonical(root,{output:true,signal});const dir=await lstat(root,{bigint:true});check(dir.ino===directory.ino&&dir.dev===directory.dev);
    const final=await lstat(temporary,{bigint:true});check(owned(final)&&final.size===meter.identity.size&&final.mtimeNs===meter.identity.mtimeNs&&final.ctimeNs===meter.identity.ctimeNs);signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);check(owned(await lstat(destination,{bigint:true})));return {path:destination,bytes:raw.length,sha256:hash(raw)};
  }catch(error){if(published)throw Object.assign(Error('Maryland preflight receipt may exist; preserve and inspect output.'),{code:'MD_CHILDCARE_PUBLICATION_INCOMPLETE'});const dir=await lstat(root,{bigint:true}).catch(()=>null);if(dir?.ino===directory.ino&&dir?.dev===directory.dev&&await realpath(root).catch(()=>null)===root&&owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);throw error;}
}
