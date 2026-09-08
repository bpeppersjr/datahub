import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {CO_CHILDCARE_FIELDS,CO_CHILDCARE_FILTER} from './co-childcare-preflight.mjs';
import {replayCoChildcareAcquisition} from './co-childcare-acquisition.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
import policy from '../config/source-policies/co-childcare-centers-internal.json' with {type:'json'};

export const CO_CHILDCARE_NORMALIZATION_VERSION='co-childcare-normalization@1.0.0';
const POLICY_SHA256='2995c3c977b942307f24d0719b438602a5419716a8463bb5a966bd8c578c58bc';
export const CO_CHILDCARE_CAPACITY_FIELDS=Object.freeze(['total_licensed_capacity']);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const dataKeys=(v,keys,required=false)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))&&(!required||keys.every(k=>Object.hasOwn(v,k)));
const check=value=>{if(!value)throw Error('Colorado normalization context rejected.');};
const reject=reason=>{throw Object.assign(Error('Colorado source candidate rejected.'),{code:'CO_CHILDCARE_RECORD_REJECTED',reason});};
function contextValues(context,keys){check(dataKeys(context,keys,true));for(const key of ['runId','sourceReleaseId'])check(typeof context[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[key]));for(const key of keys.filter(k=>k.endsWith('At')))check(time(context[key]));check(hash(policy)===POLICY_SHA256);}
function scalar(value){if(value===undefined||value===null)return null;if(typeof value!=='string'||value.length>20000||/[\u0000-\u001f\u007f]/u.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)reject('invalid-selected-scalar');return value;}
const cleaned=value=>value?.trim()||null;
function postal(value){const raw=cleaned(value);if(raw===null)return {zip_code:null,postal_code:null,zip4:null,reason:'missing-source-zip'};const match=/^(\d{5})(?:-?(\d{4}))?$/.exec(raw);if(!match||match[1]==='00000')return {zip_code:null,postal_code:null,zip4:null,reason:'invalid-source-zip-format'};return {zip_code:match[1],postal_code:match[1],zip4:match[2]??null,reason:null};}
function capacity(raw){if(cleaned(raw)===null)return {raw,parsed:null,unavailable_reason:'missing-source-capacity'};const valid=/^(0|[1-9]\d*)$/.test(raw)&&Number.isSafeInteger(Number(raw));return {raw,parsed:valid?Number(raw):null,unavailable_reason:valid?null:'invalid-source-capacity-format'};}
const sourceKey=row=>row.provider_id;
const recordId=(release,key)=>`${release}:row:${hash(key)}`;
const claims=()=>({physical_site_verified:false,identity_matching_eligible:false,unique_business_identity_verified:false,current_operations_verified:false,source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,geographic_boundary_verified:false,coordinates_selected:false,public_export_authorized:false,national_reporting_integrated:false});

/** Source membership is established by acquisition replay, never by projection. */
export function normalizeCoChildcareFeature(feature,context){
  contextValues(context,['runId','sourceReleaseId','observedAt','processedAt','sourceUpdatedAt']);check(context.processedAt>=context.observedAt&&context.sourceUpdatedAt<=context.observedAt);
  if(!dataKeys(feature,CO_CHILDCARE_FIELDS))reject('selected-field-drift');const selected={};for(const key of CO_CHILDCARE_FIELDS){if(Object.hasOwn(feature,key)&&feature[key]===undefined)reject('invalid-selected-scalar');selected[key]=scalar(feature[key]);}
  const key=sourceKey(selected);if(!/^[1-9][0-9]{0,31}$/.test(key??''))reject('invalid-source-key');if(selected.provider_service_type!=='Child Care Center')reject('source-scope-drift');
  const zip=postal(selected.zip),street=cleaned(selected.street_address),rawState=cleaned(selected.state),state=rawState===null?null:/^(CO|Colorado)$/i.test(rawState)?'CO':rawState,capacities={total_licensed_capacity:capacity(selected.total_licensed_capacity)};
  const poBox=street!==null&&/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(street);
  const identifiers=[['provider_id','colorado_cdec_childcare_license_number']];
  const record={schema_version:'1.0.0',dataset_id:'co-cdec-childcare-centers',source_record_id:recordId(context.sourceReleaseId,key),publisher_scope:'CO',business_name:cleaned(selected.provider_name),
    external_identifiers:identifiers.filter(([field])=>cleaned(selected[field])!==null).map(([field,type])=>({type,value:selected[field],source_field:field,identity_verified:false,stability_verified:false})),
    reported_address:{street,city:cleaned(selected.city),state,state_source:selected.state,country:null,county_source:cleaned(selected.county),zip_code:zip.zip_code,postal_code:zip.postal_code,zip4:zip.zip4,address_role:'physical-address-as-reported-in-licensing-application'},
    geocode:{latitude:null,longitude:null,crs:null,status:'not-provided-by-selected-source',inferred:false},industry:{category:'childcare',childcare_type_source:selected.provider_service_type},
    source_status:{status_source:null,status_interpretation:'operating-status-not-provided-by-selected-source',active_business_verified:false},
    capacities,
    source:{selected_fields:structuredClone(feature)},
    provenance:{source_url:'https://data.colorado.gov/resource/a9rr-k8mu.json',source_filter:CO_CHILDCARE_FILTER,source_unique_key:key,source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:context.observedAt,processed_at:context.processedAt,source_updated_at:context.sourceUpdatedAt,transformation_version:CO_CHILDCARE_NORMALIZATION_VERSION,input_feature_sha256:hash(feature),policy_id:policy.policy_id,policy_profile:`${policy.policy_id}@${policy.version}`,policy_sha256:POLICY_SHA256,attribution:policy.attribution,field_lineage:{source_status:'operating-status-not-provided-by-selected-source',external_identifiers:'provider_id-CDEC-issued-license-number','reported_address.state_source':'state','reported_address.address_role':'publisher-street-address-description-not-independent-premises-proof','capacities.total_licensed_capacity':'total_licensed_capacity-strict-safe-nonnegative-integer-or-gap',business_name:'provider_name','reported_address.street':'street_address','reported_address.city':'city','reported_address.county_source':'county-unverified-source-label','reported_address.state':'state-trimmed-source-label-CO-alias-only','reported_address.country':'not-selected-null','reported_address.zip_code':'zip','reported_address.postal_code':'zip','reported_address.zip4':'zip',publisher_scope:'publisher-jurisdiction-not-address-assignment',geocode:'coordinates-not-present-in-current-source-schema',source_unique_key:'provider_id',capacities:[...CO_CHILDCARE_CAPACITY_FIELDS],claims:'conservative-source-candidate-boundary'}},
    quality:{status_unavailable_reason:'source-operating-status-not-provided',name_unavailable_reason:cleaned(selected.provider_name)===null?'missing-source-name':null,address_unavailable_reason:street===null?'missing-source-address':poBox?'source-po-box-or-nonstreet-label':null,city_unavailable_reason:cleaned(selected.city)===null?'missing-source-city':null,state_unavailable_reason:state===null?'missing-source-state':null,state_scope_conflict:state!==null&&state!=='CO',zip_unavailable_reason:zip.reason,point_unavailable_reason:'source-coordinates-not-selected',capacity_unavailable_fields:CO_CHILDCARE_CAPACITY_FIELDS.filter(field=>capacities[field].parsed===null),current_usps_assignment_verified:false,address_role_verified:false},claims:claims(),export_policy:'internal'};
  if(Buffer.byteLength(JSON.stringify(record)+'\n')>=65536)reject('normalized-record-byte-limit');return assertNormalizedUsPostalFieldsDeep(record);
}

export async function normalizeCoChildcareEvidence(evidence,context,options={}){
  check(dataKeys(options,['signal'])&&(options.signal===undefined||options.signal instanceof AbortSignal));const {signal}=options;signal?.throwIfAborted();contextValues(context,['runId','sourceReleaseId','processedAt']);context={...context};
  check(evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&Buffer.byteLength(JSON.stringify(evidence))<=160_000_000);evidence=structuredClone(evidence);const acquired=await replayCoChildcareAcquisition(evidence,{signal});check(context.processedAt>=evidence.finished_at);
  const observations=new Map();for(const page of evidence.observations.filter(o=>o.kind==='page'))for(const feature of page.payload)observations.set(JSON.stringify(sourceKey(feature)),page.observed_at);
  const records=[],quarantine=[];
  for(const [index,feature]of acquired.features.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}const observedAt=observations.get(JSON.stringify(sourceKey(feature)));
    try{records.push(normalizeCoChildcareFeature(feature,{...context,observedAt,sourceUpdatedAt:acquired.source.source_updated_at}));}
    catch(error){if(error.code!=='CO_CHILDCARE_RECORD_REJECTED')throw error;quarantine.push({source_unique_key:sourceKey(feature),source_record_id:recordId(context.sourceReleaseId,sourceKey(feature)),source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:observedAt,processed_at:context.processedAt,source_updated_at:acquired.source.source_updated_at,input_feature_sha256:hash(feature),transformation_version:CO_CHILDCARE_NORMALIZATION_VERSION,policy_sha256:POLICY_SHA256,reason:error.reason,raw_evidence_location:'acquisition-observation-by-provider-id',export_policy:'internal'});}
  }
  check(records.length+quarantine.length===acquired.source.record_count);
  const reasons=property=>records.reduce((result,row)=>{const reason=row.quality[property];if(reason)result[reason]=(result[reason]??0)+1;return result;},{});
  const fieldGaps=(roster,property,predicate)=>Object.fromEntries(roster.map(field=>[field,records.filter(row=>predicate(row[property][field])).length]));
  signal?.throwIfAborted();return {records,quarantine,summary:{source_records:acquired.source.record_count,accepted_records:records.length,quarantined_records:quarantine.length,accepted_with_zip5:records.filter(row=>row.reported_address.zip_code!==null).length,accepted_with_zip4:records.filter(row=>row.reported_address.zip4!==null).length,accepted_with_points:0,status_unavailable_reasons:reasons('status_unavailable_reason'),name_unavailable_reasons:reasons('name_unavailable_reason'),address_unavailable_reasons:reasons('address_unavailable_reason'),city_unavailable_reasons:reasons('city_unavailable_reason'),state_unavailable_reasons:reasons('state_unavailable_reason'),zip_unavailable_reasons:reasons('zip_unavailable_reason'),point_unavailable_reasons:reasons('point_unavailable_reason'),accepted_with_state_scope_conflict:records.filter(row=>row.quality.state_scope_conflict).length,capacity_unavailable_counts:fieldGaps(CO_CHILDCARE_CAPACITY_FIELDS,'capacities',v=>v.parsed===null),transformation_version:CO_CHILDCARE_NORMALIZATION_VERSION,acquisition_evidence_sha256:hash(evidence),normalized_records_sha256:hash(records),quarantine_sha256:hash(quarantine),...claims(),release_published:false}};
}
export const normalizeCoChildcareAcquisition=normalizeCoChildcareEvidence;
