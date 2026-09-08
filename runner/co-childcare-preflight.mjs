import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,link,unlink,realpath} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import path from 'node:path';
import contract from '../config/co-childcare-source-contract.json' with {type:'json'};
import connector from '../config/connectors/co-childcare-preflight.json' with {type:'json'};
import policy from '../config/source-policies/co-childcare-preflight.json' with {type:'json'};
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

export const CO_CHILDCARE_PREFLIGHT_VERSION='co-childcare-preflight@1.0.0';
export const CO_CHILDCARE_FILTER="provider_service_type='Child Care Center'";
export const CO_CHILDCARE_FIELD_TYPES=Object.freeze({...contract.fieldTypes});
export const CO_CHILDCARE_FIELDS=Object.freeze([...contract.selectedFields]);
export const CO_CHILDCARE_CATEGORIES=Object.freeze(['3 under 18 Months Family Child Care Home','Child Care Center','Experienced Family Child Care Home','Family Child Care Home','Infant/Toddler Home','Large Family Child Care Home','Neighborhood Youth Organization','Preschool Program','Resident Camp','School-Age Child Care Center']);
const identity=Object.fromEntries(['id','name','description','attribution','owner','licenseId','license'].map(k=>[k,contract[k]]));
function queryUrl(select,group){const url=new URL('https://data.colorado.gov/resource/a9rr-k8mu.json');url.searchParams.set('$select',select);if(group){url.searchParams.set('$group',group);url.searchParams.set('$order',group);}else url.searchParams.set('$where',CO_CHILDCARE_FILTER);url.searchParams.set('$limit',group?'31':'2');return String(url);}
export const CO_CHILDCARE_URLS=Object.freeze({
 metadata:'https://data.colorado.gov/api/views/a9rr-k8mu.json',
 groups:queryUrl('provider_service_type,count(*) as source_rows','provider_service_type'),
 aggregate:queryUrl('count(*) as source_rows,count(distinct provider_id) as distinct_licenses,count(street_address) as address_count,count(zip) as zip_count,count(state) as state_count')
});
const PINS={connector_sha256:'dc8fd195d0e147942f17392aaa557458347ee23fcc096c0b0f3d51c0ee654e7c',policy_sha256:'cc0ce2a2915eff37f0077b6226fb6f45f2d7ef450ba764de0ee93676661e14c4',source_contract_sha256:'0093268d1148b81254fc571d5c568dfc56fc7aa3597fe786c91d1d12e957c700'};
const MAXIMUM=2_000_000,WHOLE=120_000,ORDER=['metadata','groups','aggregate','aggregate','groups','metadata'];
const hash=v=>createHash('sha256').update(v).digest('hex'),jsonHash=v=>hash(JSON.stringify(v));
const check=v=>{if(!v)throw Error('Colorado childcare metadata preflight rejected.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Reflect.ownKeys(v).sort(),[...keys].sort());
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function opts(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined||v.signal instanceof AbortSignal);}
function importedConfiguration(){check(jsonHash(connector)===PINS.connector_sha256&&jsonHash(policy)===PINS.policy_sha256&&jsonHash(contract)===PINS.source_contract_sha256);}
async function configuration(signal){importedConfiguration();for(const [name,pin]of [['config/connectors/co-childcare-preflight.json',PINS.connector_sha256],['config/source-policies/co-childcare-preflight.json',PINS.policy_sha256],['config/co-childcare-source-contract.json',PINS.source_contract_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,name),100000,signal))===pin);}
function validateMetadata(p){
 check(exact(p,['id','name','description','attribution','owner','licenseId','license','rowsUpdatedAt','viewLastModified','publicationDate','columns','custom']));
 for(const [key,value]of Object.entries(identity))check(same(p[key],value));
 for(const field of ['rowsUpdatedAt','viewLastModified','publicationDate'])check(Number.isSafeInteger(p[field])&&p[field]>0&&p[field]*1000<=8.64e15);
 const fields=Object.keys(CO_CHILDCARE_FIELD_TYPES).sort();check(Array.isArray(p.columns)&&p.columns.length===fields.length);
 for(const [i,c]of p.columns.entries()){check(exact(c,['fieldName','dataTypeName','description'])&&c.fieldName===fields[i]&&c.dataTypeName===CO_CHILDCARE_FIELD_TYPES[c.fieldName]);check(c.description===(contract.descriptions[c.fieldName]??null));}
 check(same(p.custom,contract.custom));
}
function metadata(raw){
 check(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.columns)&&['error','errors','data','rows','features','attributes','geometry'].every(k=>!Object.hasOwn(raw,k)));
 check(raw.columns.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.fieldName==='string'&&c.fieldName.length>0));
 const native=raw.columns.filter(c=>typeof c?.fieldName==='string'&&!c.fieldName.startsWith(':'));check(native.length===Object.keys(CO_CHILDCARE_FIELD_TYPES).length);
 const columns=Object.keys(CO_CHILDCARE_FIELD_TYPES).sort().map(fieldName=>{const found=native.filter(c=>c.fieldName===fieldName);check(found.length===1);return {fieldName,dataTypeName:found[0].dataTypeName,description:Object.hasOwn(contract.descriptions,fieldName)?found[0].description:null};});
 const custom=Object.fromEntries(Object.keys(contract.custom).map(k=>[k,raw.metadata?.custom_fields?.[k]]));
 const value={id:raw.id,name:raw.name,description:raw.description,attribution:raw.attribution,owner:{id:raw.owner?.id,displayName:raw.owner?.displayName},licenseId:raw.licenseId,license:raw.license,rowsUpdatedAt:raw.rowsUpdatedAt,viewLastModified:raw.viewLastModified,publicationDate:raw.publicationDate,columns,custom};
 validateMetadata(value);return value;
}
const number=v=>typeof v==='string'&&/^(0|[1-9]\d{0,4})$/.test(v)&&Number(v)<=20000;
function groups(value){
 check(Array.isArray(value)&&value.length>0&&value.length<=30);const keys=new Set();let total=0,selected=0;
 for(const row of value){check(exact(row,['provider_service_type','source_rows'])&&CO_CHILDCARE_CATEGORIES.includes(row.provider_service_type)&&!keys.has(row.provider_service_type)&&number(row.source_rows)&&Number(row.source_rows)>0);keys.add(row.provider_service_type);total+=Number(row.source_rows);if(row.provider_service_type==='Child Care Center')selected=Number(row.source_rows);}
 check(total<=20000&&selected>0);return {total,selected};
}
function counts(value){
 check(Array.isArray(value)&&value.length===1&&exact(value[0],['source_rows','distinct_licenses','address_count','zip_count','state_count']));
 const row=value[0];for(const v of Object.values(row))check(number(v));
 check(Number(row.source_rows)>0&&row.source_rows===row.distinct_licenses&&['address_count','zip_count','state_count'].every(k=>Number(row[k])<=Number(row.source_rows)));
}
function source(meta,groupPayload,countPayload){const group=groups(groupPayload),row=countPayload[0];check(group.selected===Number(row.source_rows));return {dataset_id:'a9rr-k8mu',where:CO_CHILDCARE_FILTER,record_count:Number(row.source_rows),distinct_licenses:Number(row.distinct_licenses),total_source_rows:group.total,address_count:Number(row.address_count),zip_count:Number(row.zip_count),state_count:Number(row.state_count),source_updated_at:new Date(meta.rowsUpdatedAt*1000).toISOString(),view_last_modified_at:new Date(meta.viewLastModified*1000).toISOString(),publication_at:new Date(meta.publicationDate*1000).toISOString(),status_basis:contract.description};}
const claims=()=>({source_records_requested:0,facility_rows_retained:0,source_authenticity_verified:false,native_execution_independently_verified:false,unique_business_identity_verified:false,current_operations_verified:false,public_export_authorized:false,national_reporting_integrated:false,legal_approval:false,agreement_acceptance_performed:false,full_metadata_retained:false,metadata_cached_contents_retained:false,full_http_bodies_replayable:false,coordinates_selected:false,exact_address_geocodes_verified:false,source_use_status:'metadata-and-aggregate-review-only'});
const readiness=()=>({metadata_preflight_passed:true,acquisition_ready:false,acquisition_authorized:false,app_enrolled:false,scheduled:false,unresolved_gates:['record-delivery-and-membership-contract','selected-record-retention-policy','normalization-and-quality-contract','managed-app-enrollment']});
export function validateCoChildcarePreflight(receipt){
 importedConfiguration();check(exact(receipt,['schema_version','status','execution_mode','configuration','started_at','finished_at','observations','source','claims','readiness'])&&receipt.schema_version===CO_CHILDCARE_PREFLIGHT_VERSION&&receipt.status==='metadata-preflight-passed'&&['fixed-native-fetch','injected-test-transport'].includes(receipt.execution_mode)&&same(receipt.configuration,PINS));
 check(time(receipt.started_at)&&time(receipt.finished_at)&&receipt.finished_at>=receipt.started_at&&Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=WHOLE&&Array.isArray(receipt.observations)&&receipt.observations.length===6);let prior=receipt.started_at;
 for(const [index,o]of receipt.observations.entries()){
 check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256'])&&o.kind===ORDER[index]&&o.url===CO_CHILDCARE_URLS[o.kind]&&time(o.observed_at)&&o.observed_at>=prior&&o.observed_at<=receipt.finished_at&&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=MAXIMUM&&digest(o.body_sha256)&&o.payload_sha256===jsonHash(o.payload));
 if(o.kind==='metadata'){validateMetadata(o.payload);for(const k of ['rowsUpdatedAt','viewLastModified','publicationDate'])check(o.payload[k]*1000<=Date.parse(o.observed_at));}else if(o.kind==='groups')groups(o.payload);else counts(o.payload);prior=o.observed_at;
 }check(same(receipt.observations[0].payload,receipt.observations[5].payload)&&same(receipt.observations[1].payload,receipt.observations[4].payload)&&same(receipt.observations[2].payload,receipt.observations[3].payload));
 check(same(receipt.source,source(receipt.observations[0].payload,receipt.observations[1].payload,receipt.observations[2].payload))&&receipt.source.source_updated_at<=receipt.started_at&&receipt.source.view_last_modified_at<=receipt.started_at&&receipt.source.publication_at<=receipt.started_at&&same(receipt.claims,claims())&&same(receipt.readiness,readiness()));return receipt;
}
function race(promise,signal,onLate=()=>{}){signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});});}
const cancel=response=>{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});};
export async function assertCoChildcarePreflightConfiguration(options={}){opts(options,['signal']);options.signal?.throwIfAborted();await configuration(options.signal);}
export async function acquireCoChildcarePreflight(options={}){
  opts(options,['fetchImpl','signal','now']);const {fetchImpl=fetch,signal,now=()=>new Date()}=options;check(typeof fetchImpl==='function'&&typeof now==='function');signal?.throwIfAborted();
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(Error('Colorado preflight deadline.')),WHOLE),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;let prior;
  const stamp=()=>{const value=now().toISOString();check(time(value)&&(!prior||value>=prior));prior=value;return value;};
  try{
    const started_at=stamp(),observations=[];await configuration(combined);
    for(const kind of ORDER){
      if(observations.length)await delay(1000,undefined,{signal:combined});combined.throwIfAborted();const request=new AbortController(),requestTimer=setTimeout(()=>request.abort(Error('Colorado request deadline.')),30000),requestSignal=AbortSignal.any([combined,request.signal]);let response,reader;
      try{
        response=await race(Promise.resolve().then(()=>{requestSignal.throwIfAborted();return fetchImpl(CO_CHILDCARE_URLS[kind],{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:requestSignal});}),requestSignal,cancel);
        requestSignal.throwIfAborted();check(response instanceof Response&&!response.redirected);
        if(response.status===429||response.status===503)throw Object.assign(Error('Colorado publisher deferred.'),{code:'CO_CHILDCARE_DEFERRED'});
        check(response.status===200&&(!response.url||response.url===CO_CHILDCARE_URLS[kind])&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''));
        const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();check(length===null||/^\d+$/.test(length)&&Number(length)<=MAXIMUM);check(response.body);reader=response.body.getReader();let size=0;const chunks=[];
        for(;;){const part=await race(reader.read(),requestSignal);requestSignal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;check(size<=MAXIMUM);chunks.push(part.value);}
        check(length===null||encoding&&encoding!=='identity'||Number(length)===size);const raw=Buffer.concat(chunks,size),decoded=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));const payload=kind==='metadata'?metadata(decoded):decoded;if(kind==='aggregate')counts(payload);else if(kind==='groups')groups(payload);
        observations.push({kind,url:CO_CHILDCARE_URLS[kind],observed_at:stamp(),http_status:200,body_bytes:size,body_sha256:hash(raw),payload,payload_sha256:jsonHash(payload)});
      }finally{clearTimeout(requestTimer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
    }
    await configuration(combined);combined.throwIfAborted();return validateCoChildcarePreflight({schema_version:CO_CHILDCARE_PREFLIGHT_VERSION,status:'metadata-preflight-passed',execution_mode:options.fetchImpl===undefined?'fixed-native-fetch':'injected-test-transport',configuration:{...PINS},started_at,finished_at:stamp(),observations,source:source(observations[0].payload,observations[1].payload,observations[2].payload),claims:claims(),readiness:readiness()});
  }catch(error){signal?.throwIfAborted();throw Object.assign(Error('Colorado metadata preflight failed; no facility rows were requested.'),{code:error?.code==='CO_CHILDCARE_DEFERRED'?'CO_CHILDCARE_DEFERRED':'CO_CHILDCARE_PREFLIGHT_FAILED'});}finally{clearTimeout(timer);}
}
export async function writeCoChildcarePreflight(receipt,options={}){
  opts(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  const snapshot=structuredClone(receipt);validateCoChildcarePreflight(snapshot);const raw=Buffer.from(JSON.stringify(snapshot)+'\n');check(raw.length<=4_000_000);await configuration(signal);
  const root=path.join(APP_ROOT,'data/business-sources/co-childcare/preflights');await canonical(root,{output:true,create:true,signal});const directory=await lstat(root,{bigint:true}),id=randomUUID(),temporary=path.join(root,id+'.tmp'),destination=path.join(root,id+'.json');let identity,published=false;
  const owned=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino===identity?.ino&&s.dev===identity?.dev;
  try{
    signal?.throwIfAborted();const handle=await open(temporary,'wx');try{identity=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const meter={};check(same(await readJson(temporary,4_000_000,signal,meter),snapshot)&&meter.sha256===hash(raw)&&owned(meter.identity));await configuration(signal);await canonical(root,{output:true,signal});const dir=await lstat(root,{bigint:true});check(dir.ino===directory.ino&&dir.dev===directory.dev);
    const final=await lstat(temporary,{bigint:true});check(owned(final)&&final.size===meter.identity.size&&final.mtimeNs===meter.identity.mtimeNs&&final.ctimeNs===meter.identity.ctimeNs);signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);check(owned(await lstat(destination,{bigint:true})));return {path:destination,bytes:raw.length,sha256:hash(raw)};
  }catch(error){if(published)throw Object.assign(Error('Colorado preflight receipt may exist; preserve and inspect output.'),{code:'CO_CHILDCARE_PUBLICATION_INCOMPLETE'});const dir=await lstat(root,{bigint:true}).catch(()=>null);if(dir?.ino===directory.ino&&dir?.dev===directory.dev&&await realpath(root).catch(()=>null)===root&&owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);throw error;}
}
