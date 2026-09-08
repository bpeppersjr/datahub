import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {CT_CHILDCARE_FIELDS,CT_CHILDCARE_FILTER} from './ct-childcare-preflight.mjs';
import {replayCtChildcareAcquisition} from './ct-childcare-acquisition.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
import policy from '../config/source-policies/ct-childcare-centers-internal.json' with {type:'json'};

export const CT_CHILDCARE_NORMALIZATION_VERSION='ct-childcare-normalization@1.0.0';
const POLICY_SHA256='f9af42d865c6575c0bba133c6e34e5fe16b03f11d64cc77411493638898cea60';
export const CT_CHILDCARE_CALENDAR_FIELDS=Object.freeze(['effectivedate','expirationdate','firsteffectivedate','credentiallastmodifieddate']);
export const CT_CHILDCARE_CAPACITY_FIELDS=Object.freeze(['capacityunder3','maximumcapacity','regularcapacity','schoolagecapacity']);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const dataKeys=(v,keys,required=false)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))&&(!required||keys.every(k=>Object.hasOwn(v,k)));
const check=value=>{if(!value)throw Error('Connecticut normalization context rejected.');};
const reject=reason=>{throw Object.assign(Error('Connecticut source candidate rejected.'),{code:'CT_CHILDCARE_RECORD_REJECTED',reason});};
function contextValues(context,keys){check(dataKeys(context,keys,true));for(const key of ['runId','sourceReleaseId'])check(typeof context[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[key]));for(const key of keys.filter(k=>k.endsWith('At')))check(time(context[key]));check(hash(policy)===POLICY_SHA256);}
function scalar(value){if(value===undefined||value===null)return null;if(typeof value!=='string'||value.length>20000||/[\u0000-\u001f\u007f]/u.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)reject('invalid-selected-scalar');return value;}
const cleaned=value=>value?.trim()||null;
function postal(value){const raw=cleaned(value);if(raw===null)return {zip_code:null,postal_code:null,zip4:null,reason:'missing-source-zip'};const match=/^(\d{5})(?:-?(\d{4}))?$/.exec(raw);if(!match||match[1]==='00000')return {zip_code:null,postal_code:null,zip4:null,reason:'invalid-source-zip-format'};return {zip_code:match[1],postal_code:match[1],zip4:match[2]??null,reason:null};}
function calendar(raw){
  if(cleaned(raw)===null)return {raw,calendar_value:null,validity:'missing-source-date'};
  const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?)?$/.exec(raw);
  let valid=false;if(m){const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];valid=year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&(m[4]===undefined||Number(m[4])<=23&&Number(m[5])<=59&&Number(m[6])<=59);}
  return {raw,calendar_value:valid?raw:null,validity:valid?'valid-floating-calendar':'invalid-source-date'};
}
function capacity(raw){if(cleaned(raw)===null)return {raw,parsed:null,unavailable_reason:'missing-source-capacity'};const valid=/^(0|[1-9]\d*)$/.test(raw)&&Number.isSafeInteger(Number(raw));return {raw,parsed:valid?Number(raw):null,unavailable_reason:valid?null:'invalid-source-capacity-format'};}
const recordId=(release,key)=>`${release}:row:${encodeURIComponent(key)}`;
const claims=()=>({physical_site_verified:false,identity_matching_eligible:false,unique_business_identity_verified:false,current_operations_verified:false,source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,geographic_boundary_verified:false,public_export_authorized:false,national_reporting_integrated:false});

/** Source membership is established by acquisition replay, never by projection. */
export function normalizeCtChildcareFeature(feature,context){
  contextValues(context,['runId','sourceReleaseId','observedAt','processedAt','sourceUpdatedAt']);check(context.processedAt>=context.observedAt&&context.sourceUpdatedAt<=context.observedAt);
  if(!dataKeys(feature,CT_CHILDCARE_FIELDS))reject('selected-field-drift');const selected={};for(const key of CT_CHILDCARE_FIELDS){if(Object.hasOwn(feature,key)&&feature[key]===undefined)reject('invalid-selected-scalar');selected[key]=scalar(feature[key]);}
  const key=selected.uniquekey;if(!key||key!==key.trim()||key.length>256)reject('invalid-source-key');if(selected.licensetype!=='Child Care Center'||selected.status!=='ACTIVE')reject('source-scope-drift');
  const zip=postal(selected.zipcode),street=cleaned(selected.address2),state=cleaned(selected.statecode),dates=Object.fromEntries(CT_CHILDCARE_CALENDAR_FIELDS.map(field=>[field,calendar(selected[field])])),capacities=Object.fromEntries(CT_CHILDCARE_CAPACITY_FIELDS.map(field=>[field,capacity(selected[field])]));
  const poBox=street!==null&&/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(street);
  const identifiers=[['credentialidnt','connecticut_oec_credential_identifier'],['licensenumber','connecticut_oec_license_number']];
  const record={schema_version:'1.0.0',dataset_id:'ct-oec-childcare-centers',source_record_id:recordId(context.sourceReleaseId,key),publisher_scope:'CT',business_name:cleaned(selected.name),
    external_identifiers:identifiers.filter(([field])=>cleaned(selected[field])!==null).map(([field,type])=>({type,value:selected[field],source_field:field,identity_verified:false,stability_verified:false})),
    reported_address:{street,street2:cleaned(selected.address3),city:cleaned(selected.city),state,state_source:selected.statecode,country:null,zip_code:zip.zip_code,postal_code:zip.postal_code,zip4:zip.zip4,address_role:'reported-address-unverified'},
    geocode:{latitude:null,longitude:null,crs:null,status:'not-provided-by-selected-source',inferred:false},industry:{category:'childcare',childcare_type_source:selected.licensetype},
    source_status:{status_source:selected.status,status_reason_source:selected.statusreason,status_interpretation:'literal-source-credential-status-not-current-business-verification',active_business_verified:false},
    license_dates_source:dates,date_semantics:'floating-calendar-source-text-no-UTC-or-operating-date-inference',capacities,
    source:{selected_fields:structuredClone(feature)},
    provenance:{source_url:'https://data.ct.gov/resource/h8mr-dn95.json',source_filter:CT_CHILDCARE_FILTER,source_unique_key:key,source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:context.observedAt,processed_at:context.processedAt,source_updated_at:context.sourceUpdatedAt,transformation_version:CT_CHILDCARE_NORMALIZATION_VERSION,input_feature_sha256:hash(feature),policy_id:policy.policy_id,policy_profile:`${policy.policy_id}@${policy.version}`,policy_sha256:POLICY_SHA256,attribution:policy.attribution,field_lineage:{business_name:'name','reported_address.street':'address2','reported_address.street2':'address3','reported_address.city':'city','reported_address.state':'statecode','reported_address.state_source':'statecode','reported_address.zip_code':'zipcode','reported_address.postal_code':'zipcode','reported_address.zip4':'zipcode','reported_address.country':'unverified-country-null-not-inferred-from-publisher','reported_address.address_role':'source-policy-reported-lines-not-verified-premises',publisher_scope:'source-policy-publisher-jurisdiction-not-address-assignment',geocode:'no-selected-coordinate-fields-null-not-inferred',source_status:['status','statusreason'],external_identifiers:identifiers.map(([field])=>field),license_dates_source:[...CT_CHILDCARE_CALENDAR_FIELDS],capacities:[...CT_CHILDCARE_CAPACITY_FIELDS],calendar_validity:'strict-floating-calendar-syntax-and-Gregorian-date-no-timezone',capacity_parsed:'strict-safe-nonnegative-integer-otherwise-gap',claims:'source-policy-conservative-candidate-boundary'}},
    quality:{name_unavailable_reason:cleaned(selected.name)===null?'missing-source-name':null,address_unavailable_reason:street===null?'missing-source-address':poBox?'source-po-box-or-nonstreet-label':null,city_unavailable_reason:cleaned(selected.city)===null?'missing-source-city':null,state_unavailable_reason:state===null?'missing-source-state':null,state_scope_conflict:state!==null&&!['CT','CONNECTICUT'].includes(state.toUpperCase()),zip_unavailable_reason:zip.reason,point_unavailable_reason:'source-coordinates-not-selected',date_unavailable_fields:CT_CHILDCARE_CALENDAR_FIELDS.filter(field=>dates[field].calendar_value===null),capacity_unavailable_fields:CT_CHILDCARE_CAPACITY_FIELDS.filter(field=>capacities[field].parsed===null),current_usps_assignment_verified:false,address_role_verified:false},claims:claims(),export_policy:'internal'};
  if(Buffer.byteLength(JSON.stringify(record)+'\n')>=65536)reject('normalized-record-byte-limit');return assertNormalizedUsPostalFieldsDeep(record);
}

export async function normalizeCtChildcareEvidence(evidence,context,options={}){
  check(dataKeys(options,['signal'])&&(options.signal===undefined||options.signal instanceof AbortSignal));const {signal}=options;signal?.throwIfAborted();contextValues(context,['runId','sourceReleaseId','processedAt']);context={...context};
  check(evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&Buffer.byteLength(JSON.stringify(evidence))<=160_000_000);evidence=structuredClone(evidence);const acquired=await replayCtChildcareAcquisition(evidence,{signal});check(context.processedAt>=evidence.finished_at);
  const observations=new Map();for(const page of evidence.observations.filter(o=>o.kind==='page'))for(const feature of page.payload)observations.set(feature.uniquekey,page.observed_at);
  const records=[],quarantine=[];
  for(const [index,feature]of acquired.features.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}const observedAt=observations.get(feature.uniquekey);
    try{records.push(normalizeCtChildcareFeature(feature,{...context,observedAt,sourceUpdatedAt:acquired.source.source_updated_at}));}
    catch(error){if(error.code!=='CT_CHILDCARE_RECORD_REJECTED')throw error;quarantine.push({source_unique_key:feature.uniquekey,source_record_id:recordId(context.sourceReleaseId,feature.uniquekey),source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:observedAt,processed_at:context.processedAt,source_updated_at:acquired.source.source_updated_at,input_feature_sha256:hash(feature),transformation_version:CT_CHILDCARE_NORMALIZATION_VERSION,policy_sha256:POLICY_SHA256,reason:error.reason,raw_evidence_location:'acquisition-observation-by-uniquekey',export_policy:'internal'});}
  }
  check(records.length+quarantine.length===acquired.source.record_count);
  const reasons=property=>records.reduce((result,row)=>{const reason=row.quality[property];if(reason)result[reason]=(result[reason]??0)+1;return result;},{});
  const fieldGaps=(roster,property,predicate)=>Object.fromEntries(roster.map(field=>[field,records.filter(row=>predicate(row[property][field])).length]));
  signal?.throwIfAborted();return {records,quarantine,summary:{source_records:acquired.source.record_count,accepted_records:records.length,quarantined_records:quarantine.length,accepted_with_zip5:records.filter(row=>row.reported_address.zip_code!==null).length,accepted_with_zip4:records.filter(row=>row.reported_address.zip4!==null).length,accepted_with_points:0,name_unavailable_reasons:reasons('name_unavailable_reason'),address_unavailable_reasons:reasons('address_unavailable_reason'),city_unavailable_reasons:reasons('city_unavailable_reason'),state_unavailable_reasons:reasons('state_unavailable_reason'),zip_unavailable_reasons:reasons('zip_unavailable_reason'),point_unavailable_reasons:reasons('point_unavailable_reason'),date_unavailable_counts:fieldGaps(CT_CHILDCARE_CALENDAR_FIELDS,'license_dates_source',v=>v.calendar_value===null),capacity_unavailable_counts:fieldGaps(CT_CHILDCARE_CAPACITY_FIELDS,'capacities',v=>v.parsed===null),transformation_version:CT_CHILDCARE_NORMALIZATION_VERSION,acquisition_evidence_sha256:hash(evidence),normalized_records_sha256:hash(records),quarantine_sha256:hash(quarantine),...claims(),release_published:false}};
}
export const normalizeCtChildcareAcquisition=normalizeCtChildcareEvidence;
