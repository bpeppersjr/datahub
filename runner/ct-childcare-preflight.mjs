import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,link,unlink,realpath} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

export const CT_CHILDCARE_FIELD_TYPES=Object.freeze({uniquekey:'text',credentialidnt:'number',licensenumber:'text',name:'text',licensetype:'text',status:'text',statusreason:'text',address2:'text',address3:'text',city:'text',statecode:'text',zipcode:'text',effectivedate:'calendar_date',expirationdate:'calendar_date',firsteffectivedate:'calendar_date',credentiallastmodifieddate:'calendar_date',capacityunder3:'number',maximumcapacity:'number',regularcapacity:'number',schoolagecapacity:'number'});
export const CT_CHILDCARE_FIELDS=Object.freeze(Object.keys(CT_CHILDCARE_FIELD_TYPES).sort());
export const CT_CHILDCARE_FILTER="licensetype='Child Care Center' AND status='ACTIVE'";
const aggregate=new URL('https://data.ct.gov/resource/h8mr-dn95.json');
aggregate.searchParams.set('$select','count(*) as source_count,count(distinct uniquekey) as distinct_source_keys,count(distinct credentialidnt) as distinct_credentials,count(address2) as address_count,count(zipcode) as zip_count');
aggregate.searchParams.set('$where',CT_CHILDCARE_FILTER);aggregate.searchParams.set('$limit','1');
export const CT_CHILDCARE_URLS=Object.freeze({metadata:'https://data.ct.gov/api/views/h8mr-dn95.json',aggregate:String(aggregate)});
export const CT_CHILDCARE_PREFLIGHT_VERSION='ct-childcare-preflight@1.0.0';
const PINS={connector_sha256:'456f3066531f96a8332eb8c68f09dde58115dc72b22cd0f55bcac591034c8a3f',policy_sha256:'fc940d88ac1d601f5ff1a702973e3fa7f2783d3ed12bc64fef58185da39da5d3'};
const MAXIMUM=2_000_000,WHOLE=120_000,ORDER=['metadata','aggregate','aggregate','metadata'];
const hash=v=>createHash('sha256').update(v).digest('hex'),jsonHash=v=>hash(JSON.stringify(v));
const check=v=>{if(!v)throw Error('Connecticut childcare metadata preflight rejected.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Reflect.ownKeys(v).sort(),[...keys].sort());
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function opts(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined||v.signal instanceof AbortSignal);}
async function configuration(signal){for(const [name,pin]of [['config/connectors/ct-childcare-preflight.json',PINS.connector_sha256],['config/source-policies/ct-childcare-preflight.json',PINS.policy_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,name),100000,signal))===pin);}
function validateMetadata(p){
  check(exact(p,['id','name','description','attribution','license','rowsUpdatedAt','semantics','columns'])&&p.id==='h8mr-dn95'&&p.name==='Child Care & Youth Camp Licensing Program Data'&&p.description===p.name&&p.attribution==='DAS/BEST - eLicensing'&&same(p.license,{name:'Public Domain'}));
  check(Number.isSafeInteger(p.rowsUpdatedAt)&&p.rowsUpdatedAt>0&&Number.isFinite(p.rowsUpdatedAt*1000)&&p.rowsUpdatedAt*1000<=8.64e15);
  check(same(p.semantics,{agency:'Office of Early Childhood',update_frequency:'Daily',address_semantics:'Street address'}));
  check(Array.isArray(p.columns)&&p.columns.length===CT_CHILDCARE_FIELDS.length);
  for(const [index,column]of p.columns.entries())check(exact(column,['fieldName','dataTypeName'])&&column.fieldName===CT_CHILDCARE_FIELDS[index]&&column.dataTypeName===CT_CHILDCARE_FIELD_TYPES[column.fieldName]);
}
function metadata(raw){
  check(raw&&typeof raw==='object'&&!raw.error&&Array.isArray(raw.columns)&&same(raw.license,{name:'Public Domain'}));
  const columns=CT_CHILDCARE_FIELDS.map(fieldName=>{const found=raw.columns.filter(c=>c?.fieldName===fieldName);check(found.length===1);return {fieldName,dataTypeName:found[0].dataTypeName};});
  const value={id:raw.id,name:raw.name,description:raw.description,attribution:raw.attribution,license:{name:raw.license?.name},rowsUpdatedAt:raw.rowsUpdatedAt,semantics:{agency:raw.metadata?.custom_fields?.Agency?.Agency,update_frequency:raw.metadata?.custom_fields?.Details?.['Update Frequency'],address_semantics:raw.metadata?.custom_fields?.Details?.['Geographic Unit']},columns};validateMetadata(value);return value;
}
function counts(value){
  check(Array.isArray(value)&&value.length===1&&exact(value[0],['source_count','distinct_source_keys','distinct_credentials','address_count','zip_count']));
  for(const v of Object.values(value[0]))check(typeof v==='string'&&/^(0|[1-9]\d{0,4})$/.test(v)&&Number(v)<=20000);
  const row=value[0];check(Number(row.source_count)>0&&row.source_count===row.distinct_source_keys&&['distinct_credentials','address_count','zip_count'].every(k=>Number(row[k])<=Number(row.source_count)));
}
function source(metadataPayload,countPayload){const row=countPayload[0];return {dataset_id:'h8mr-dn95',where:CT_CHILDCARE_FILTER,record_count:Number(row.source_count),distinct_source_keys:Number(row.distinct_source_keys),distinct_credentials:Number(row.distinct_credentials),address_count:Number(row.address_count),zip_count:Number(row.zip_count),source_updated_at:new Date(metadataPayload.rowsUpdatedAt*1000).toISOString(),status_basis:'literal ACTIVE source credential status, not independently verified operating businesses'};}
const claims=()=>({source_records_requested:0,facility_rows_retained:0,source_authenticity_verified:false,native_execution_independently_verified:false,unique_business_identity_verified:false,current_operations_verified:false,public_export_authorized:false,national_reporting_integrated:false,legal_approval:false,agreement_acceptance_performed:false,full_metadata_retained:false,metadata_cached_contents_retained:false,full_http_bodies_replayable:false,source_use_status:'metadata-and-count-review-only'});
const readiness=()=>({metadata_preflight_passed:true,acquisition_ready:false,acquisition_authorized:false,app_enrolled:false,scheduled:false,unresolved_gates:['address2-premises-semantics','source-key-versus-credential-identity']});
export function validateCtChildcarePreflight(receipt){
  check(exact(receipt,['schema_version','status','execution_mode','configuration','started_at','finished_at','observations','source','claims','readiness'])&&receipt.schema_version===CT_CHILDCARE_PREFLIGHT_VERSION&&receipt.status==='metadata-preflight-passed'&&['fixed-native-fetch','injected-test-transport'].includes(receipt.execution_mode)&&same(receipt.configuration,PINS));
  check(time(receipt.started_at)&&time(receipt.finished_at)&&receipt.finished_at>=receipt.started_at&&Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=WHOLE&&Array.isArray(receipt.observations)&&receipt.observations.length===4);
  let prior=receipt.started_at;
  for(const [index,o]of receipt.observations.entries()){
    check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256'])&&o.kind===ORDER[index]&&o.url===CT_CHILDCARE_URLS[o.kind]&&time(o.observed_at)&&o.observed_at>=prior&&o.observed_at<=receipt.finished_at&&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=MAXIMUM&&digest(o.body_sha256)&&o.payload_sha256===jsonHash(o.payload));
    if(o.kind==='metadata')validateMetadata(o.payload);else counts(o.payload);prior=o.observed_at;
  }
  check(same(receipt.observations[0].payload,receipt.observations[3].payload)&&same(receipt.observations[1].payload,receipt.observations[2].payload));
  check(same(receipt.source,source(receipt.observations[0].payload,receipt.observations[1].payload))&&receipt.source.source_updated_at<=receipt.started_at&&same(receipt.claims,claims())&&same(receipt.readiness,readiness()));return receipt;
}
function race(promise,signal,onLate=()=>{}){signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});});}
const cancel=response=>{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});};
export async function acquireCtChildcarePreflight(options={}){
  opts(options,['fetchImpl','signal','now']);const {fetchImpl=fetch,signal,now=()=>new Date()}=options;check(typeof fetchImpl==='function'&&typeof now==='function');signal?.throwIfAborted();
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(Error('Connecticut preflight deadline.')),WHOLE),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;let prior;
  const stamp=()=>{const value=now().toISOString();check(time(value)&&(!prior||value>=prior));prior=value;return value;};
  try{
    const started_at=stamp(),observations=[];await configuration(combined);
    for(const kind of ORDER){
      if(observations.length)await delay(1000,undefined,{signal:combined});combined.throwIfAborted();const request=new AbortController(),requestTimer=setTimeout(()=>request.abort(Error('Connecticut request deadline.')),30000),requestSignal=AbortSignal.any([combined,request.signal]);let response,reader;
      try{
        response=await race(Promise.resolve().then(()=>{requestSignal.throwIfAborted();return fetchImpl(CT_CHILDCARE_URLS[kind],{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:requestSignal});}),requestSignal,cancel);
        requestSignal.throwIfAborted();check(response instanceof Response&&!response.redirected);
        if(response.status===429||response.status===503)throw Object.assign(Error('Connecticut publisher deferred.'),{code:'CT_CHILDCARE_DEFERRED'});
        check(response.status===200&&(!response.url||response.url===CT_CHILDCARE_URLS[kind])&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''));
        const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();check(length===null||/^\d+$/.test(length)&&Number(length)<=MAXIMUM);check(response.body);reader=response.body.getReader();let size=0;const chunks=[];
        for(;;){const part=await race(reader.read(),requestSignal);requestSignal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;check(size<=MAXIMUM);chunks.push(part.value);}
        check(length===null||encoding&&encoding!=='identity'||Number(length)===size);const raw=Buffer.concat(chunks,size),decoded=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));const payload=kind==='metadata'?metadata(decoded):decoded;if(kind==='aggregate')counts(payload);
        observations.push({kind,url:CT_CHILDCARE_URLS[kind],observed_at:stamp(),http_status:200,body_bytes:size,body_sha256:hash(raw),payload,payload_sha256:jsonHash(payload)});
      }finally{clearTimeout(requestTimer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
    }
    await configuration(combined);combined.throwIfAborted();return validateCtChildcarePreflight({schema_version:CT_CHILDCARE_PREFLIGHT_VERSION,status:'metadata-preflight-passed',execution_mode:options.fetchImpl===undefined?'fixed-native-fetch':'injected-test-transport',configuration:{...PINS},started_at,finished_at:stamp(),observations,source:source(observations[0].payload,observations[1].payload),claims:claims(),readiness:readiness()});
  }catch(error){signal?.throwIfAborted();throw Object.assign(Error('Connecticut metadata preflight failed; no facility rows were requested.'),{code:error?.code==='CT_CHILDCARE_DEFERRED'?'CT_CHILDCARE_DEFERRED':'CT_CHILDCARE_PREFLIGHT_FAILED'});}finally{clearTimeout(timer);}
}
export async function writeCtChildcarePreflight(receipt,options={}){
  opts(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  const snapshot=structuredClone(receipt);validateCtChildcarePreflight(snapshot);const raw=Buffer.from(JSON.stringify(snapshot)+'\n');check(raw.length<=4_000_000);await configuration(signal);
  const root=path.join(APP_ROOT,'data/business-sources/ct-childcare/preflights');await canonical(root,{output:true,create:true,signal});const directory=await lstat(root,{bigint:true}),id=randomUUID(),temporary=path.join(root,id+'.tmp'),destination=path.join(root,id+'.json');let identity,published=false;
  const owned=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino===identity?.ino&&s.dev===identity?.dev;
  try{
    signal?.throwIfAborted();const handle=await open(temporary,'wx');try{identity=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const meter={};check(same(await readJson(temporary,4_000_000,signal,meter),snapshot)&&meter.sha256===hash(raw)&&owned(meter.identity));await configuration(signal);await canonical(root,{output:true,signal});const dir=await lstat(root,{bigint:true});check(dir.ino===directory.ino&&dir.dev===directory.dev);
    const final=await lstat(temporary,{bigint:true});check(owned(final)&&final.size===meter.identity.size&&final.mtimeNs===meter.identity.mtimeNs&&final.ctimeNs===meter.identity.ctimeNs);signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);check(owned(await lstat(destination,{bigint:true})));return {path:destination,bytes:raw.length,sha256:hash(raw)};
  }catch(error){if(published)throw Object.assign(Error('Connecticut preflight receipt may exist; preserve and inspect output.'),{code:'CT_CHILDCARE_PUBLICATION_INCOMPLETE'});const dir=await lstat(root,{bigint:true}).catch(()=>null);if(dir?.ino===directory.ino&&dir?.dev===directory.dev&&await realpath(root).catch(()=>null)===root&&owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);throw error;}
}
