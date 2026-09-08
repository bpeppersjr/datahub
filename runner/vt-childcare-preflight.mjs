import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,link,unlink,realpath} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import path from 'node:path';
import connector from '../config/connectors/vt-childcare-preflight.json' with {type:'json'};
import policy from '../config/source-policies/vt-childcare-preflight.json' with {type:'json'};
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical,mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

export const VT_CHILDCARE_PREFLIGHT_VERSION='vt-childcare-preflight@1.0.0';
export const VT_CHILDCARE_FILTER="license_type='Licensed Provider' AND provider_program_type IN('CBCCPP','CBCCPP - Non-Recurring')";
export const VT_CHILDCARE_FIELD_TYPES=Object.freeze({file_name:'text',license_id:'text',provider_name:'text',license_type:'text',provider_program_type:'text',address_1:'text',address_2:'text',provider_town:'text',zip_code:'text',county:'text',current_license_start_date:'calendar_date',current_license_end_date:'calendar_date',total_licensed_capacity:'number',infant_licensed_capacity:'number',toddler_licensed_capacity:'number',preschool_licensed_capacity:'number',school_age_licensed_capacity:'number'});
export const VT_CHILDCARE_FIELDS=Object.freeze(Object.keys(VT_CHILDCARE_FIELD_TYPES).sort());
const descriptions={
 file_name:'Name of the working file. Used in part to track reporting period.',
 license_id:'The distinct license number for each individual provider.',
 provider_name:'',license_type:'Whether the provider is Licensed (afterschool programs, center-based programs, license family homes) or Registered (registered family homes). Different CCFAP rates apply depending on whether the program is Licensed or Registered.',
 provider_program_type:'What specific type of program the provider is.',address_1:'',address_2:'',provider_town:'',zip_code:'',county:'',
 current_license_start_date:'When the current license term began.',current_license_end_date:'When the current license term expires.',
 total_licensed_capacity:'The maximum number of children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 infant_licensed_capacity:'The maximum number of infants a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 toddler_licensed_capacity:'The maximum number of toddlers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 preschool_licensed_capacity:'The maximum number of preschoolers a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.',
 school_age_licensed_capacity:'The maximum number of school age children a provider could theoretically serve at one time, given sufficient staffing, subject to applicable regulations.'
};
const jitter=axis=>axis+' coordinates are generated based on the address fields provided. Coordinates are slightly offset (jittered) to distinguish programs sharing the same location while preserving the overall spatial pattern. Refer to the address fields for the provider\'s exact location.';
const catalogDescription='Vermont Child Care Provider Data including location, capacity, mailing list data and contact information, updated monthly. Data reflects the number of programs in business on the final day of the last complete month prior to the most recent update.';
const license={name:'Open Database License',termsLink:'http://opendatacommons.org/licenses/odbl/1.0/'};
const owner={id:'ihpx-mmkb',displayName:'Child Development Division Data Unit'};
function queryUrl(query,pageSize){const url=new URL('https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json');url.searchParams.set('query',query);url.searchParams.set('pageNumber','1');url.searchParams.set('pageSize',String(pageSize));return String(url);}
export const VT_CHILDCARE_URLS=Object.freeze({
 metadata:'https://data.vermont.gov/api/views/ctdw-tmfz.json',
 groups:queryUrl('SELECT file_name,provider_program_type,license_type,count(*) as source_rows GROUP BY file_name,provider_program_type,license_type ORDER BY file_name,provider_program_type,license_type',201),
 aggregate:queryUrl('SELECT count(*) as source_rows,count(distinct license_id) as distinct_licenses,count(distinct file_name) as reporting_files,count(current_license_start_date) as license_start_count,count(current_license_end_date) as license_end_count WHERE '+VT_CHILDCARE_FILTER,2)
});
const PINS={connector_sha256:'b7f692971fb35d95a165457e7a0dea0c4dbee238abe42d87ba8b71e329e75bcd',policy_sha256:'afaf7f296f07b3eb2461fc5da1502174230bc9650316d27a5aa4537cf60da20e'};
const MAXIMUM=2_000_000,WHOLE=120_000,ORDER=['metadata','groups','aggregate','aggregate','groups','metadata'];
const hash=v=>createHash('sha256').update(v).digest('hex'),jsonHash=v=>hash(JSON.stringify(v));
const check=v=>{if(!v)throw Error('Vermont childcare metadata preflight rejected.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Reflect.ownKeys(v).sort(),[...keys].sort());
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function opts(v,keys){check(v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));check(v.signal===undefined||v.signal instanceof AbortSignal);}
function importedConfiguration(){check(jsonHash(connector)===PINS.connector_sha256&&jsonHash(policy)===PINS.policy_sha256);}
async function configuration(signal){importedConfiguration();for(const [name,pin]of [['config/connectors/vt-childcare-preflight.json',PINS.connector_sha256],['config/source-policies/vt-childcare-preflight.json',PINS.policy_sha256]])check(jsonHash(await readJson(path.join(APP_ROOT,name),100000,signal))===pin);}
function validateMetadata(p){
 check(exact(p,['id','name','description','attribution','owner','licenseId','license','rowsUpdatedAt','viewLastModified','publicationDate','columns','coordinate_notices'])&&p.id==='ctdw-tmfz'&&p.name==='Vermont Child Care Provider Data'&&p.description===catalogDescription&&p.attribution==='Department for Children and Families (DCF), Child Development Division'&&same(p.owner,owner)&&p.licenseId==='OPEN_DATABASE_LICENSE'&&same(p.license,license));
 for(const field of ['rowsUpdatedAt','viewLastModified','publicationDate'])check(Number.isSafeInteger(p[field])&&p[field]>0&&p[field]*1000<=8.64e15);
 check(Array.isArray(p.columns)&&p.columns.length===VT_CHILDCARE_FIELDS.length);
 for(const [i,c]of p.columns.entries())check(exact(c,['fieldName','dataTypeName','description'])&&c.fieldName===VT_CHILDCARE_FIELDS[i]&&c.dataTypeName===VT_CHILDCARE_FIELD_TYPES[c.fieldName]&&c.description===descriptions[c.fieldName]);
 check(same(p.coordinate_notices,[{fieldName:'latitude',dataTypeName:'number',description:jitter('Latitudinal')},{fieldName:'longitude',dataTypeName:'number',description:jitter('Longitudinal')}]));
}
function metadata(raw){
 check(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.columns)&&['error','errors','data','rows','features','attributes','geometry'].every(k=>!Object.hasOwn(raw,k)));
 const column=fieldName=>{const found=raw.columns.filter(c=>c?.fieldName===fieldName);check(found.length===1);return {fieldName,dataTypeName:found[0].dataTypeName,description:found[0].description};};
 const value={id:raw.id,name:raw.name,description:raw.description,attribution:raw.attribution,owner:{id:raw.owner?.id,displayName:raw.owner?.displayName},licenseId:raw.licenseId,license:raw.license,rowsUpdatedAt:raw.rowsUpdatedAt,viewLastModified:raw.viewLastModified,publicationDate:raw.publicationDate,columns:VT_CHILDCARE_FIELDS.map(column),coordinate_notices:['latitude','longitude'].map(column)};
 validateMetadata(value);return value;
}
const number=v=>typeof v==='string'&&/^(0|[1-9]\d{0,4})$/.test(v)&&Number(v)<=20000;
function groups(value){
 check(Array.isArray(value)&&value.length>0&&value.length<=200);const keys=new Set(),files=new Set();let total=0,selected=0;
 const allowed={'Afterschool Child Care Program':'Licensed Provider','CBCCPP':'Licensed Provider','CBCCPP - Non-Recurring':'Licensed Provider','Licensed FCCH':'Licensed Provider','Registered FCCH':'Registered Home'};
 for(const row of value){check(exact(row,['file_name','provider_program_type','license_type','source_rows'])&&typeof row.file_name==='string'&&/^Provider_Report_[0-9]{8}_[0-9]{8}\.xlsx$/.test(row.file_name)&&Object.hasOwn(allowed,row.provider_program_type)&&row.license_type===allowed[row.provider_program_type]&&number(row.source_rows)&&Number(row.source_rows)>0);
 const key=JSON.stringify([row.file_name,row.provider_program_type,row.license_type]);check(!keys.has(key));keys.add(key);files.add(row.file_name);total+=Number(row.source_rows);if(['CBCCPP','CBCCPP - Non-Recurring'].includes(row.provider_program_type))selected+=Number(row.source_rows);
 }check(files.size===1&&total<=20000&&selected>0);return {file:[...files][0],total,selected};
}
function counts(value){
 check(Array.isArray(value)&&value.length===1&&exact(value[0],['source_rows','distinct_licenses','reporting_files','license_start_count','license_end_count']));
 const row=value[0];for(const v of Object.values(row))check(number(v));
 check(Number(row.source_rows)>0&&row.source_rows===row.distinct_licenses&&row.reporting_files==='1'&&Number(row.license_start_count)<=Number(row.source_rows)&&Number(row.license_end_count)<=Number(row.source_rows));
}
function source(meta,groupPayload,countPayload){const group=groups(groupPayload),row=countPayload[0];check(group.selected===Number(row.source_rows));return {dataset_id:'ctdw-tmfz',where:VT_CHILDCARE_FILTER,record_count:Number(row.source_rows),distinct_licenses:Number(row.distinct_licenses),total_source_rows:group.total,reporting_file:group.file,reporting_period:null,reporting_period_verified:false,license_start_count:Number(row.license_start_count),license_end_count:Number(row.license_end_count),source_updated_at:new Date(meta.rowsUpdatedAt*1000).toISOString(),view_last_modified_at:new Date(meta.viewLastModified*1000).toISOString(),publication_at:new Date(meta.publicationDate*1000).toISOString(),status_basis:catalogDescription};}
const claims=()=>({source_records_requested:0,facility_rows_retained:0,source_authenticity_verified:false,native_execution_independently_verified:false,unique_business_identity_verified:false,current_operations_verified:false,public_export_authorized:false,national_reporting_integrated:false,legal_approval:false,agreement_acceptance_performed:false,full_metadata_retained:false,metadata_cached_contents_retained:false,full_http_bodies_replayable:false,coordinates_selected:false,exact_address_geocodes_verified:false,source_use_status:'metadata-and-aggregate-review-only'});
const readiness=()=>({metadata_preflight_passed:true,acquisition_ready:false,acquisition_authorized:false,app_enrolled:false,scheduled:false,unresolved_gates:['record-delivery-and-order-contract','reporting-file-date-semantics','reported-address-role','record-retention-and-export-policy']});
export function validateVtChildcarePreflight(receipt){
 importedConfiguration();check(exact(receipt,['schema_version','status','execution_mode','configuration','started_at','finished_at','observations','source','claims','readiness'])&&receipt.schema_version===VT_CHILDCARE_PREFLIGHT_VERSION&&receipt.status==='metadata-preflight-passed'&&['fixed-native-fetch','injected-test-transport'].includes(receipt.execution_mode)&&same(receipt.configuration,PINS));
 check(time(receipt.started_at)&&time(receipt.finished_at)&&receipt.finished_at>=receipt.started_at&&Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=WHOLE&&Array.isArray(receipt.observations)&&receipt.observations.length===6);let prior=receipt.started_at;
 for(const [index,o]of receipt.observations.entries()){
 check(exact(o,['kind','url','observed_at','http_status','body_bytes','body_sha256','payload','payload_sha256'])&&o.kind===ORDER[index]&&o.url===VT_CHILDCARE_URLS[o.kind]&&time(o.observed_at)&&o.observed_at>=prior&&o.observed_at<=receipt.finished_at&&o.http_status===200&&Number.isSafeInteger(o.body_bytes)&&o.body_bytes>0&&o.body_bytes<=MAXIMUM&&digest(o.body_sha256)&&o.payload_sha256===jsonHash(o.payload));
 if(o.kind==='metadata'){validateMetadata(o.payload);for(const k of ['rowsUpdatedAt','viewLastModified','publicationDate'])check(o.payload[k]*1000<=Date.parse(o.observed_at));}else if(o.kind==='groups')groups(o.payload);else counts(o.payload);prior=o.observed_at;
 }check(same(receipt.observations[0].payload,receipt.observations[5].payload)&&same(receipt.observations[1].payload,receipt.observations[4].payload)&&same(receipt.observations[2].payload,receipt.observations[3].payload));
 check(same(receipt.source,source(receipt.observations[0].payload,receipt.observations[1].payload,receipt.observations[2].payload))&&receipt.source.source_updated_at<=receipt.started_at&&receipt.source.view_last_modified_at<=receipt.started_at&&receipt.source.publication_at<=receipt.started_at&&same(receipt.claims,claims())&&same(receipt.readiness,readiness()));return receipt;
}
function race(promise,signal,onLate=()=>{}){signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{if(settled){onLate(value);return;}settled=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(error);});});}
const cancel=response=>{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});};
export async function acquireVtChildcarePreflight(options={}){
  opts(options,['fetchImpl','signal','now']);const {fetchImpl=fetch,signal,now=()=>new Date()}=options;check(typeof fetchImpl==='function'&&typeof now==='function');signal?.throwIfAborted();
  const whole=new AbortController(),timer=setTimeout(()=>whole.abort(Error('Vermont preflight deadline.')),WHOLE),combined=signal?AbortSignal.any([signal,whole.signal]):whole.signal;let prior;
  const stamp=()=>{const value=now().toISOString();check(time(value)&&(!prior||value>=prior));prior=value;return value;};
  try{
    const started_at=stamp(),observations=[];await configuration(combined);
    for(const kind of ORDER){
      if(observations.length)await delay(1000,undefined,{signal:combined});combined.throwIfAborted();const request=new AbortController(),requestTimer=setTimeout(()=>request.abort(Error('Vermont request deadline.')),30000),requestSignal=AbortSignal.any([combined,request.signal]);let response,reader;
      try{
        response=await race(Promise.resolve().then(()=>{requestSignal.throwIfAborted();return fetchImpl(VT_CHILDCARE_URLS[kind],{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Accept-Encoding':'identity'},signal:requestSignal});}),requestSignal,cancel);
        requestSignal.throwIfAborted();check(response instanceof Response&&!response.redirected);
        if(response.status===429||response.status===503)throw Object.assign(Error('Vermont publisher deferred.'),{code:'VT_CHILDCARE_DEFERRED'});
        check(response.status===200&&(!response.url||response.url===VT_CHILDCARE_URLS[kind])&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''));
        const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding')?.trim().toLowerCase();check(length===null||/^\d+$/.test(length)&&Number(length)<=MAXIMUM);check(response.body);reader=response.body.getReader();let size=0;const chunks=[];
        for(;;){const part=await race(reader.read(),requestSignal);requestSignal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;check(size<=MAXIMUM);chunks.push(part.value);}
        check(length===null||encoding&&encoding!=='identity'||Number(length)===size);const raw=Buffer.concat(chunks,size),decoded=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));const payload=kind==='metadata'?metadata(decoded):decoded;if(kind==='aggregate')counts(payload);else if(kind==='groups')groups(payload);
        observations.push({kind,url:VT_CHILDCARE_URLS[kind],observed_at:stamp(),http_status:200,body_bytes:size,body_sha256:hash(raw),payload,payload_sha256:jsonHash(payload)});
      }finally{clearTimeout(requestTimer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else cancel(response);}
    }
    await configuration(combined);combined.throwIfAborted();return validateVtChildcarePreflight({schema_version:VT_CHILDCARE_PREFLIGHT_VERSION,status:'metadata-preflight-passed',execution_mode:options.fetchImpl===undefined?'fixed-native-fetch':'injected-test-transport',configuration:{...PINS},started_at,finished_at:stamp(),observations,source:source(observations[0].payload,observations[1].payload,observations[2].payload),claims:claims(),readiness:readiness()});
  }catch(error){signal?.throwIfAborted();throw Object.assign(Error('Vermont metadata preflight failed; no facility rows were requested.'),{code:error?.code==='VT_CHILDCARE_DEFERRED'?'VT_CHILDCARE_DEFERRED':'VT_CHILDCARE_PREFLIGHT_FAILED'});}finally{clearTimeout(timer);}
}
export async function writeVtChildcarePreflight(receipt,options={}){
  opts(options,['signal']);const {signal}=options;signal?.throwIfAborted();
  const snapshot=structuredClone(receipt);validateVtChildcarePreflight(snapshot);const raw=Buffer.from(JSON.stringify(snapshot)+'\n');check(raw.length<=4_000_000);await configuration(signal);
  const root=path.join(APP_ROOT,'data/business-sources/vt-childcare/preflights');await canonical(root,{output:true,create:true,signal});const directory=await lstat(root,{bigint:true}),id=randomUUID(),temporary=path.join(root,id+'.tmp'),destination=path.join(root,id+'.json');let identity,published=false;
  const owned=s=>s?.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.ino===identity?.ino&&s.dev===identity?.dev;
  try{
    signal?.throwIfAborted();const handle=await open(temporary,'wx');try{identity=await handle.stat({bigint:true});await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const meter={};check(same(await readJson(temporary,4_000_000,signal,meter),snapshot)&&meter.sha256===hash(raw)&&owned(meter.identity));await configuration(signal);await canonical(root,{output:true,signal});const dir=await lstat(root,{bigint:true});check(dir.ino===directory.ino&&dir.dev===directory.dev);
    const final=await lstat(temporary,{bigint:true});check(owned(final)&&final.size===meter.identity.size&&final.mtimeNs===meter.identity.mtimeNs&&final.ctimeNs===meter.identity.ctimeNs);signal?.throwIfAborted();await link(temporary,destination);published=true;await unlink(temporary);check(owned(await lstat(destination,{bigint:true})));return {path:destination,bytes:raw.length,sha256:hash(raw)};
  }catch(error){if(published)throw Object.assign(Error('Vermont preflight receipt may exist; preserve and inspect output.'),{code:'VT_CHILDCARE_PUBLICATION_INCOMPLETE'});const dir=await lstat(root,{bigint:true}).catch(()=>null);if(dir?.ino===directory.ino&&dir?.dev===directory.dev&&await realpath(root).catch(()=>null)===root&&owned(await lstat(temporary,{bigint:true}).catch(()=>null)))await unlink(temporary);throw error;}
}
