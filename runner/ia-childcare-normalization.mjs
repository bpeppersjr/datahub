import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {replayIaChildcareAcquisition} from './ia-childcare-acquisition.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
import policy from '../config/source-policies/ia-childcare-centers-internal.json' with {type:'json'};

export const IA_CHILDCARE_NORMALIZATION_VERSION='ia-childcare-normalization@1.0.0';
export const IA_CHILDCARE_NORMALIZATION_POLICY_SHA256='be383f1e27ee415cd8018dc77c384149c6c8dda6eaa4b8dce6b828f679170df0';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Error('Iowa normalization rejected.');};
const check=value=>{if(!value)fail();};
const exact=(value,keys)=>value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length&&Reflect.ownKeys(value).every(key=>keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const abort=signal=>{if(signal?.aborted)fail();};
const claims=()=>({physical_site_verified:false,identity_matching_eligible:false,unique_business_identity_verified:false,current_operations_verified:false,source_key_stability_verified:false,credential_deduplication_applied:false,geocodes_inferred:false,geocode_accuracy_verified:false,geographic_boundary_verified:false,source_reported_state_available:false,public_export_authorized:false,national_reporting_integrated:false});
const cleaned=value=>value===null?null:value.trim()||null;
function normalize(row,context,evidence){
  const s=row.source,ordinal=row.source_ordinal,sourceHash=hash(s),recordId=`${context.sourceReleaseId}:row:${ordinal}`;
  const reject=reason=>({quarantine:{source_ordinal:ordinal,source_record_id:recordId,source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:evidence.requests[1].observed_at,processed_at:context.processedAt,input_feature_sha256:sourceHash,source_response_sha256:evidence.requests[1].decoded_sha256,transformation_version:IA_CHILDCARE_NORMALIZATION_VERSION,policy_sha256:IA_CHILDCARE_NORMALIZATION_POLICY_SHA256,reason,raw_evidence_location:'retained-selection-by-source-ordinal',export_policy:'internal'}});
  if(Object.values(s).some(value=>typeof value==='string'&&(/[\u0000-\u001f\u007f-\u009f]/u.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)))return reject('invalid-selected-source-text');
  const name=cleaned(s.businessName),street=cleaned(s.address),city=cleaned(s.city);
  const zipValid=Number.isSafeInteger(s.zipCode)&&s.zipCode>=10000&&s.zipCode<=99999;
  const zip=zipValid?String(s.zipCode):null,zipReason=s.zipCode===null?'missing-source-zip':zipValid?null:'invalid-source-numeric-zip5';
  const missingPoint=s.latitude===null||s.longitude===null;
  const validPoint=!missingPoint&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)&&Math.abs(s.latitude)<=90&&Math.abs(s.longitude)<=180;
  const pointReason=missingPoint?'missing-source-coordinate-pair':validPoint?null:'invalid-source-coordinate-range';
  const poBox=street!==null&&/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(street);
  const record={schema_version:'1.0.0',dataset_id:'ia-childcare-centers',source_record_id:recordId,publisher_scope:'IA',business_name:name,
    external_identifiers:[],reported_address:{street,street2:null,city,state:null,state_source:null,country:null,county_source:null,zip_code:zip,postal_code:zip,zip4:null,address_role:'reported-address-role-unspecified'},
    geocode:{latitude:validPoint?s.latitude:null,longitude:validPoint?s.longitude:null,crs:null,status:validPoint?'source-reported-point-accuracy-unknown':'source-coordinate-pair-unavailable',inferred:false,accuracy_verified:false},
    industry:{category:'childcare',childcare_type_source:s.businessType,interpretation:'publisher-licensed-center-or-preschool-display-class'},
    source_status:{status_source:null,status_interpretation:'map-membership-and-referral-not-current-business-verification',active_business_verified:false},
    source:{selected_fields:{...s}},
    provenance:{source_url:policy.source_dataset,source_filter:'businessType === building',source_ordinal:ordinal,source_unique_key:null,source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:evidence.requests[1].observed_at,processed_at:context.processedAt,source_updated_at:null,source_response_sha256:evidence.requests[1].decoded_sha256,input_feature_sha256:sourceHash,transformation_version:IA_CHILDCARE_NORMALIZATION_VERSION,policy_id:policy.policy_id,policy_profile:`${policy.policy_id}@${policy.version}`,policy_sha256:IA_CHILDCARE_NORMALIZATION_POLICY_SHA256,attribution:policy.attribution,
      field_lineage:{business_name:'businessName-trimmed','reported_address.street':'address-trimmed','reported_address.city':'city-trimmed','reported_address.zip_code':'zipCode-numeric-safe-integer-five-digit-only','reported_address.postal_code':'zipCode-numeric-safe-integer-five-digit-only','reported_address.zip4':'not-provided-null',reported_address_state_country_county:'not-provided-null-not-inferred',publisher_scope:'publisher-jurisdiction-not-address-state',geocode:['latitude','longitude','source-numeric-pair-no-accuracy-or-CRS-inference'],source_status:'not-provided-map-membership-and-referral-not-operating-status',source_record_id:'source-release-and-original-array-ordinal-not-stable-provider-identity',source_selected_fields:'exact-eight-whitelisted-primitives',claims:'source-candidate-boundary'}},
    quality:{name_unavailable_reason:name===null?'missing-source-name':null,address_unavailable_reason:street===null?'missing-source-address':poBox?'source-po-box-or-nonstreet-label':null,city_unavailable_reason:city===null?'missing-source-city':null,state_unavailable_reason:'source-state-not-provided',zip_unavailable_reason:zipReason,zip4_unavailable_reason:'source-zip4-not-provided',point_unavailable_reason:pointReason,point_accuracy_unavailable_reason:'source-point-accuracy-not-verified',source_update_unavailable_reason:'source-update-time-not-provided',current_usps_assignment_verified:false,address_role_verified:false},
    claims:claims(),export_policy:'internal'};
  if(Buffer.byteLength(JSON.stringify(record)+'\n')>65536)return reject('normalized-record-byte-limit');
  return {record:assertNormalizedUsPostalFieldsDeep(record)};
}
export async function normalizeIaChildcareEvidence(evidence,context,options={}){
  try{
    check(exact(context,['runId','sourceReleaseId','processedAt']));
    for(const key of ['runId','sourceReleaseId'])check(typeof context[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[key]));
    check(time(context.processedAt));context={...context};
    check(exact(options,[])||exact(options,['signal']));const {signal}=options;check(signal===undefined||signal instanceof AbortSignal);abort(signal);
    check(hash(policy)===IA_CHILDCARE_NORMALIZATION_POLICY_SHA256);
    const snapshot=structuredClone(evidence);check(Buffer.byteLength(JSON.stringify(snapshot))<=32000000);
    const acquired=await replayIaChildcareAcquisition(snapshot,{signal});check(context.processedAt>=acquired.finished_at);
    const records=[],quarantine=[];
    for(const [index,row]of acquired.selection.rows.entries()){
      if(index%128===0){await yieldLoop();abort(signal);}
      const result=normalize(row,context,acquired);if(result.record)records.push(result.record);else quarantine.push(result.quarantine);
    }
    check(records.length+quarantine.length===acquired.selection.counts.selected_rows);
    const reasons=field=>records.reduce((counts,row)=>{const reason=row.quality[field];if(reason)counts[reason]=(counts[reason]??0)+1;return counts;},{});
    abort(signal);return {records,quarantine,summary:{source_response_rows:acquired.selection.counts.source_rows,source_records:acquired.selection.counts.selected_rows,excluded_source_records:acquired.selection.counts.excluded_rows,duplicate_selected_rows:acquired.selection.counts.duplicate_selected_rows,accepted_records:records.length,quarantined_records:quarantine.length,accepted_with_zip5:records.filter(row=>row.reported_address.zip_code!==null).length,accepted_with_zip4:0,accepted_with_points:records.filter(row=>row.geocode.latitude!==null).length,name_unavailable_reasons:reasons('name_unavailable_reason'),address_unavailable_reasons:reasons('address_unavailable_reason'),city_unavailable_reasons:reasons('city_unavailable_reason'),state_unavailable_reasons:reasons('state_unavailable_reason'),zip_unavailable_reasons:reasons('zip_unavailable_reason'),point_unavailable_reasons:reasons('point_unavailable_reason'),transformation_version:IA_CHILDCARE_NORMALIZATION_VERSION,acquisition_evidence_sha256:hash(acquired),normalized_records_sha256:hash(records),quarantine_sha256:hash(quarantine),...claims(),release_published:false}};
  }catch{fail();}
}
