import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, link, unlink, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';

export const PA_CHILDCARE_FIELDS = Object.freeze(['mpi_id','mpi_location_id','master_provider_index','provider_type','facility_name','facility_address','facility_address_continued','facility_city','facility_state','facility_state_fips_code','facility_zip_code','facility_county','facility_county_fips_code','license_number','license_issue_date','license_exp_date','capacity','geocoded_column']);
export const PA_CHILDCARE_DESCRIPTION = 'This list contains each open certified Child Care facility and other early learning programs in Pennsylvania as of the last day of the month. \nClick here: http://www.findchildcare.pa.gov/ if you wish to search for a child care provider. \n\nDISCLAIMER: OCDEL is not representing that this information is current or accurate beyond the day it was posted. OCDEL shall not be held liable for any improper or incorrect use of the information described and/or contained herein and assumes no responsibility for anyone\'s use of the information.';
export const PA_CHILDCARE_POLICY_SHA256 = 'a250152c4dbaab52a3e1047bb57bf4346261bd7d9d6d40d2a1922147b3c7edf3';
const aggregate = new URL('https://data.pa.gov/resource/ajn5-kaxt.json');
aggregate.searchParams.set('$select','count(*) as source_count,count(distinct master_provider_index) as distinct_location_keys,count(geocoded_column) as point_count,count(license_number) as license_count');
aggregate.searchParams.set('$where',"provider_type='Child Care Center'");
aggregate.searchParams.set('$limit','1');
export const PA_CHILDCARE_URLS = Object.freeze({policy:'https://data.pa.gov/data-policy',metadata:'https://data.pa.gov/api/views/ajn5-kaxt.json',aggregate:String(aggregate)});
const VERSION='pa-childcare-preflight@1.0.0', MAXIMUM=2_000_000, WHOLE=120_000;
const configurationPins=()=>({connector_sha256:'5912a62ad0deec453e354d447db7a609d8659d2591acba0e5fdc7385c5cf57c7',policy_sha256:'510d5666859e4cd6c6c0e84518e02bce98d9d2b44e3a5b2e59c90e0b32b4da0f'});
const ORDER=['policy','metadata','aggregate','aggregate','metadata','policy'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const jsonHash=value=>hash(JSON.stringify(value));
const check=(value,label)=>{if(!value)throw new Error(`Pennsylvania childcare preflight rejected: ${label}.`);};
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && equal(Reflect.ownKeys(value).sort(),[...keys].sort());
const time=value=>typeof value==='string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const digest=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
function optionsCheck(options,keys){check(options && typeof options==='object' && !Array.isArray(options) && Reflect.ownKeys(options).every(k=>keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')),'options');check(options.signal===undefined || options.signal instanceof AbortSignal,'signal');}
const fieldType=name=>['license_issue_date','license_exp_date'].includes(name)?'calendar_date':name==='geocoded_column'?'point':'text';
async function configuration(signal){
  const pins=configurationPins();
  for(const [file,pin] of [['config/connectors/pa-childcare-preflight.json',pins.connector_sha256],['config/source-policies/pa-childcare-preflight.json',pins.policy_sha256]])
    check(jsonHash(await readJson(path.join(APP_ROOT,file),100000,signal))===pin,'configuration drift');
}

function policy(html){
  check(typeof html==='string' && Buffer.byteLength(html)<=MAXIMUM,'notice size');
  const start=/<section>\s*<h1>PA Data Policy<\/h1>/g;
  const matches=[...html.matchAll(start)];check(matches.length===1,'notice start');
  const end=html.indexOf('</div>',matches[0].index);check(end!==-1,'notice end');
  const fragment=html.slice(matches[0].index,end).trim();
  check((fragment.match(/<section\b/g)||[]).length===6 && (fragment.match(/<\/section>/g)||[]).length===6
    && !/<\s*(?:script|iframe|object|form|div)\b/i.test(fragment) && hash(fragment)===PA_CHILDCARE_POLICY_SHA256,'complete pinned notice');
  return {fragment_html:fragment,fragment_sha256:PA_CHILDCARE_POLICY_SHA256};
}
function validatePolicy(payload){
  check(exact(payload,['fragment_html','fragment_sha256']) && payload.fragment_sha256===PA_CHILDCARE_POLICY_SHA256,'notice fields');
  check(equal(policy(payload.fragment_html+'</div>'),payload),'notice replay');
}
function validateMetadata(payload){
  check(exact(payload,['id','name','attribution','license','description','rowsUpdatedAt','columns']) && payload.id==='ajn5-kaxt'
    && payload.name==='Child Care Providers including Early Learning Programs Listing Current Monthly Facility County Human Services'
    && payload.attribution==='Department of Human Services' && payload.description===PA_CHILDCARE_DESCRIPTION
    && exact(payload.license,['name','termsLink']) && payload.license.name==='Public Domain U.S. Government' && payload.license.termsLink==='https://www.usa.gov/government-works'
    && Number.isSafeInteger(payload.rowsUpdatedAt) && payload.rowsUpdatedAt>0 && time(new Date(payload.rowsUpdatedAt*1000).toISOString()),'publisher identity, terms or update clock');
  check(Array.isArray(payload.columns) && payload.columns.length===PA_CHILDCARE_FIELDS.length,'selected schema');
  for(const [index,column] of payload.columns.entries())check(exact(column,['fieldName','dataTypeName','description']) && column.fieldName===PA_CHILDCARE_FIELDS[index]
    && column.dataTypeName===fieldType(column.fieldName) && typeof column.description==='string' && column.description.length<=20000 && !/[\u0000\u0008\u000b\u000c\u000e-\u001f]/u.test(column.description),'selected column');
}
function metadata(raw){
  check(raw && typeof raw==='object' && !raw.error && Array.isArray(raw.columns),'metadata response');
  const columns=PA_CHILDCARE_FIELDS.map(fieldName=>{
    const found=raw.columns.filter(c=>c?.fieldName===fieldName);check(found.length===1,'selected column uniqueness');
    const c=found[0];return {fieldName:c.fieldName,dataTypeName:c.dataTypeName,description:c.description??''};
  });
  const selected={id:raw.id,name:raw.name,attribution:raw.attribution,license:{name:raw.license?.name,termsLink:raw.license?.termsLink},description:raw.description,rowsUpdatedAt:raw.rowsUpdatedAt,columns};
  validateMetadata(selected);return selected;
}
function validateCounts(payload){
  check(Array.isArray(payload) && payload.length===1 && exact(payload[0],['source_count','distinct_location_keys','point_count','license_count']),'aggregate fields');
  const row=payload[0];for(const value of Object.values(row))check(typeof value==='string' && /^(0|[1-9]\d{0,4})$/.test(value) && Number(value)<=20000,'aggregate integer');
  check(Number(row.source_count)>0 && row.distinct_location_keys===row.source_count && Number(row.point_count)<=Number(row.source_count) && Number(row.license_count)<=Number(row.source_count),'aggregate conservation');
}
function source(metadataPayload,countPayload){
  const c=countPayload[0];return {dataset_id:'ajn5-kaxt',where:"provider_type='Child Care Center'",record_count:Number(c.source_count),distinct_location_keys:Number(c.distinct_location_keys),point_count:Number(c.point_count),license_count:Number(c.license_count),
    source_updated_at:new Date(metadataPayload.rowsUpdatedAt*1000).toISOString(),status_basis:'listed-center-subset-of-publisher-monthly-open-certified-facility-and-early-learning-list; not independently verified active operations'};
}
const claims=()=>({source_records_requested:0,facility_rows_retained:0,native_authenticated:false,source_authenticity_verified:false,unique_business_identity_verified:false,current_operations_verified:false,source_snapshot_date_verified:false,source_use_status:'reviewed-public-portal-policy-not-legal-approval',legal_approval:false,agreement_acceptance_performed:false,public_export_authorized:false,national_reporting_integrated:false,full_metadata_retained:false,metadata_cached_contents_retained:false,full_http_bodies_replayable:false});
const readiness=()=>({metadata_preflight_passed:true,connector_ready:false,acquisition_authorized:false,app_enrolled:false,scheduled:false});

export function validatePaChildcarePreflight(receipt){
  check(exact(receipt,['schema_version','status','configuration','started_at','finished_at','observations','source','claims','readiness']) && receipt.schema_version===VERSION && receipt.status==='metadata-preflight-passed' && equal(receipt.configuration,configurationPins())
    && time(receipt.started_at) && time(receipt.finished_at) && receipt.finished_at>=receipt.started_at && Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=WHOLE
    && Array.isArray(receipt.observations) && receipt.observations.length===6,'receipt envelope');
  let prior=receipt.started_at;
  for(const [index,o] of receipt.observations.entries()){
    const kind=ORDER[index];check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256']) && o.kind===kind && o.url===PA_CHILDCARE_URLS[kind]
      && o.http_status===200 && time(o.observed_at) && o.observed_at>=prior && o.observed_at<=receipt.finished_at && Number.isSafeInteger(o.body_bytes) && o.body_bytes>0 && o.body_bytes<=MAXIMUM
      && digest(o.body_sha256) && o.payload_sha256===jsonHash(o.payload),'observation');
    if(kind==='policy'){validatePolicy(o.payload);check(Buffer.byteLength(o.payload.fragment_html)<=o.body_bytes,'notice bytes');}
    else if(kind==='metadata')validateMetadata(o.payload);else validateCounts(o.payload);
    prior=o.observed_at;
  }
  for(const [a,b] of [[0,5],[1,4],[2,3]])check(equal(receipt.observations[a].payload,receipt.observations[b].payload),'source drift');
  check(equal(receipt.source,source(receipt.observations[1].payload,receipt.observations[2].payload)) && receipt.source.source_updated_at<=receipt.started_at
    && equal(receipt.claims,claims()) && equal(receipt.readiness,readiness()),'source or claims');
  return receipt;
}

function race(promise,signal,onLate=()=>{}){
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});
  });
}
const cancel=response=>{if(response?.body && !response.body.locked)void response.body.cancel().catch(()=>{});};
export async function acquirePaChildcarePreflight(options={}){
  optionsCheck(options,['fetchImpl','signal','now']);const {fetchImpl=fetch,signal,now=()=>new Date()}=options;
  check(typeof fetchImpl==='function' && typeof now==='function','transport or clock');signal?.throwIfAborted();
  const whole=new AbortController(),wholeTimer=setTimeout(()=>whole.abort(new Error('Pennsylvania preflight deadline.')),WHOLE),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;
  let prior;const stamp=()=>{const value=now().toISOString();check(time(value) && (!prior || value>=prior),'clock');prior=value;return value;};
  try{
    const started_at=stamp(),observations=[];
    await configuration(combined);
    for(const kind of ORDER){
      if(observations.length)await delay(1000,undefined,{signal:combined});combined.throwIfAborted();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Pennsylvania request deadline.')),30000),requestSignal=AbortSignal.any([combined,controller.signal]);let response,reader;
      try{
        response=await race(Promise.resolve().then(()=>{requestSignal.throwIfAborted();return fetchImpl(PA_CHILDCARE_URLS[kind],{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:kind==='policy'?'text/html':'application/json','Accept-Encoding':'identity'},signal:requestSignal});}),requestSignal,cancel);
        requestSignal.throwIfAborted();check(response instanceof Response && !response.redirected,'response identity');
        if(response.status===429 || response.status===503)throw Object.assign(new Error('Pennsylvania publisher deferred; no retry attempted.'),{code:'PA_CHILDCARE_DEFERRED'});
        check(response.status===200 && (!response.url || response.url===PA_CHILDCARE_URLS[kind]),'HTTP status or URL');
        check((kind==='policy'?/^text\/html(?:;|$)/i:/^application\/json(?:;|$)/i).test(response.headers.get('content-type')??''),'content type');
        const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();check(length===null || /^\d+$/.test(length) && Number(length)<=MAXIMUM,'declared bound');
        check(response.body,'body');reader=response.body.getReader();let size=0;const chunks=[];
        for(;;){const part=await race(reader.read(),requestSignal);requestSignal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;check(size<=MAXIMUM,'body bound');chunks.push(part.value);}
        check(length===null || encoding && encoding!=='identity' || Number(length)===size,'body completeness');
        const raw=Buffer.concat(chunks,size),text=new TextDecoder('utf-8',{fatal:true}).decode(raw);let payload;
        if(kind==='policy')payload=policy(text);else if(kind==='metadata')payload=metadata(JSON.parse(text));else{payload=JSON.parse(text);validateCounts(payload);}
        observations.push({kind,url:PA_CHILDCARE_URLS[kind],observed_at:stamp(),http_status:200,body_bytes:size,body_sha256:hash(raw),payload,payload_sha256:jsonHash(payload)});
      }finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
    }
    await configuration(combined);
    combined.throwIfAborted();return validatePaChildcarePreflight({schema_version:VERSION,status:'metadata-preflight-passed',configuration:configurationPins(),started_at,finished_at:stamp(),observations,source:source(observations[1].payload,observations[2].payload),claims:claims(),readiness:readiness()});
  }catch(error){signal?.throwIfAborted();throw Object.assign(new Error('Pennsylvania childcare preflight failed; no facility acquisition or approval.'),{code:error?.code==='PA_CHILDCARE_DEFERRED'?'PA_CHILDCARE_DEFERRED':'PA_CHILDCARE_PREFLIGHT_FAILED'});}
  finally{clearTimeout(wholeTimer);}
}

export async function writePaChildcarePreflight(receipt,options={}){
  optionsCheck(options,['signal','outputRoot']);const {signal,outputRoot=path.join(APP_ROOT,'data/business-sources/pa-childcare-centers/preflights')}=options;
  const snapshot=structuredClone(receipt);validatePaChildcarePreflight(snapshot);const raw=Buffer.from(JSON.stringify(snapshot)+'\n');check(raw.length<=4_000_000,'receipt ceiling');signal?.throwIfAborted();
  await configuration(signal);
  await canonical(outputRoot,{output:true,signal});await canonical(outputRoot,{create:true,output:true,signal});
  const directory=await lstat(outputRoot,{bigint:true}),id=randomUUID(),temporary=path.join(outputRoot,id+'.tmp'),destination=path.join(outputRoot,id+'.json');let identity,published=false;
  const owned=s=>s?.isFile() && !s.isSymbolicLink() && s.nlink===1n && s.ino===identity?.ino && s.dev===identity?.dev;
  const dirOwned=async()=>{await canonical(outputRoot,{output:true});const s=await lstat(outputRoot,{bigint:true});check(s.ino===directory.ino && s.dev===directory.dev,'directory ownership');};
  try{
    signal?.throwIfAborted();const handle=await open(temporary,'wx');try{identity=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const meter={};const reread=await readJson(temporary,4_000_000,signal,meter);validatePaChildcarePreflight(reread);check(equal(reread,snapshot) && meter.sha256===hash(raw) && owned(meter.identity),'written receipt');
    await configuration(signal);await dirOwned();const final=await lstat(temporary,{bigint:true});check(owned(final) && final.size===meter.identity.size && final.mtimeNs===meter.identity.mtimeNs && final.ctimeNs===meter.identity.ctimeNs,'temporary ownership');signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);
    check(owned(await lstat(destination,{bigint:true})),'published ownership');return {path:destination,bytes:raw.length,sha256:hash(raw)};
  }catch(error){const current=await lstat(outputRoot,{bigint:true}).catch(()=>null);if(!published && current?.ino===directory.ino && current?.dev===directory.dev && await realpath(outputRoot).catch(()=>null)===outputRoot && owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);
    if(published)throw Object.assign(new Error('Pennsylvania preflight receipt may already be published; preserve output and inspect before retry.'),{code:'PA_CHILDCARE_PUBLICATION_INCOMPLETE',path:destination});throw error;}
}
