import { createHash } from 'node:crypto';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { PA_CHILDCARE_FIELDS } from './pa-childcare-preflight.mjs';
import { replayPaChildcareAcquisition } from './pa-childcare-acquisition.mjs';
import { assertNormalizedUsPostalFieldsDeep } from './normalized-us-postal-code.mjs';
import policy from '../config/source-policies/pa-childcare-centers-internal.json' with {type:'json'};

export const PA_CHILDCARE_NORMALIZATION_VERSION='pa-childcare-normalization@1.0.0';
const POLICY_SHA256='421da74613a3390c16e29e921854c563be83030bdaaa0c949a8f3f1aa0955f06';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const controls=/[\u0000-\u001f\u007f]/u;
const time=v=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const object=v=>v && typeof v==='object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
function dataKeys(v,keys,required=false){return object(v) && Reflect.ownKeys(v).every(k=>keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')) && (!required || keys.every(k=>Object.hasOwn(v,k)));}
function reject(reason){throw Object.assign(new Error(`Pennsylvania childcare record rejected: ${reason}.`),{code:'PA_CHILDCARE_RECORD_REJECTED',reason});}
function invariant(v,label){if(!v)throw new Error(`Pennsylvania childcare normalization rejected: ${label}.`);}
function text(value,maximum,required=false){
  if(value==null){if(required)reject('missing-required-text');return null;}
  if(typeof value!=='string' || value.length>maximum || controls.test(value) || Buffer.from(value,'utf8').toString('utf8')!==value)reject('invalid-selected-text');
  if(required && !value.trim())reject('missing-required-text');return value;
}
function contextValues(context,keys){
  invariant(dataKeys(context,keys,true),'context');
  for(const k of ['runId','sourceReleaseId'])invariant(typeof context[k]==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[k]),'run/release identity');
  for(const k of keys.filter(k=>k.endsWith('At')))invariant(time(context[k]),'canonical UTC timestamp');
  invariant(hash(policy)===POLICY_SHA256,'policy configuration');
}
function postal(raw){
  const value=raw?.trim() || null;
  if(value===null)return {zip_code:null,postal_code:null,zip4:null,reason:'missing-source-zip'};
  if(/^0+$/.test(value) || /^00000(?:-?\d{4})?$/.test(value))return {zip_code:null,postal_code:null,zip4:null,reason:'invalid-source-zip-placeholder'};
  const match=/^(\d{5})(?:-?(\d{4}))?$/.exec(value);
  if(!match)return {zip_code:null,postal_code:null,zip4:null,reason:'invalid-source-zip-format'};
  return {zip_code:match[1],postal_code:match[1],zip4:match[2]??null,reason:null};
}
function point(value){
  if(value==null)return {latitude:null,longitude:null,reason:'missing-source-point'};
  if(!dataKeys(value,['type','coordinates'],true) || value.type!=='Point' || !Array.isArray(value.coordinates) || value.coordinates.length!==2
    || Reflect.ownKeys(value.coordinates).length!==3 || ![0,1].every(i=>Object.hasOwn(Object.getOwnPropertyDescriptor(value.coordinates,String(i))??{},'value'))
    || !value.coordinates.every(v=>typeof v==='number' && Number.isFinite(v)) || Math.abs(value.coordinates[0])>180 || Math.abs(value.coordinates[1])>90)reject('invalid-source-point');
  return {latitude:value.coordinates[1],longitude:value.coordinates[0],reason:null};
}
const sourceId=(release,key)=>`${release}:provider:${encodeURIComponent(key)}`;
const lengths={facility_name:1000,facility_address:1000,facility_address_continued:1000,facility_city:256,facility_state:32,facility_state_fips_code:16,facility_zip_code:128,facility_county:256,facility_county_fips_code:16,license_issue_date:128,license_exp_date:128,capacity:20000};

/** Membership is established by acquisition replay, not by this pure projection. */
export function normalizePaChildcareFeature(feature,context){
  contextValues(context,['runId','sourceReleaseId','observedAt','processedAt','sourceUpdatedAt']);
  invariant(context.processedAt>=context.observedAt && context.sourceUpdatedAt<=context.observedAt,'source/observation/processing chronology');
  if(!dataKeys(feature,PA_CHILDCARE_FIELDS))reject('selected-field-drift');
  const key=text(feature.master_provider_index,256,true);
  if(key!==key.trim())reject('invalid-source-key');
  if(feature.provider_type!=='Child Care Center')reject('source-scope-drift');
  const selected={};
  for(const field of PA_CHILDCARE_FIELDS.filter(k=>k!=='geocoded_column'))selected[field]=text(feature[field],lengths[field]??256,['facility_name','facility_address','facility_city','facility_state'].includes(field));
  if(!['PA','Pennsylvania'].includes(selected.facility_state.trim()))reject('source-state-drift');
  const street=selected.facility_address.trim();
  if(/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(street))reject('nonphysical-address');
  const zip=postal(selected.facility_zip_code),geo=point(feature.geocoded_column),capacitySource=selected.capacity;
  let capacity=null,capacityReason=null;
  if(capacitySource===null || capacitySource.trim()==='')capacityReason='missing-source-capacity';
  else if(/^(0|[1-9]\d*)$/.test(capacitySource) && Number.isSafeInteger(Number(capacitySource)))capacity=Number(capacitySource);
  else capacityReason='invalid-source-capacity-format';
  const identifiers=[['master_provider_index','pennsylvania_dhs_master_provider_index'],['mpi_id','pennsylvania_dhs_mpi_id'],['mpi_location_id','pennsylvania_dhs_mpi_location_id'],['license_number','pennsylvania_childcare_license_number']];
  const record={
    schema_version:'1.0.0',dataset_id:'pa-dhs-childcare-centers',source_record_id:sourceId(context.sourceReleaseId,key),business_name:selected.facility_name.trim(),
    external_identifiers:identifiers.filter(([field])=>selected[field]!==null && selected[field].trim()!=='').map(([field,type])=>({type,value:selected[field],source_field:field,identity_verified:false,stability_verified:false})),
    physical_address:{street,street2:selected.facility_address_continued?.trim() || null,city:selected.facility_city.trim(),state:'PA',state_source:selected.facility_state,country:'US',
      county_source:selected.facility_county,county_fips_source:selected.facility_county_fips_code,state_fips_source:selected.facility_state_fips_code,
      state_country_basis:'publisher-record-label-not-boundary-verification',zip_code:zip.zip_code,postal_code:zip.postal_code,zip4:zip.zip4},
    geocode:{latitude:geo.latitude,longitude:geo.longitude,crs:'EPSG:4326',source:'publisher-facility-geocoded_column',status:geo.reason??'publisher-point-unverified'},
    industry:{category:'childcare',childcare_type_source:selected.provider_type,capacity_source:capacitySource,capacity_parsed:capacity},
    source_status:{status_source:null,status_interpretation:'listed-center-subset-of-publisher-monthly-open-certified-facility-and-early-learning-list',active_business_verified:false,valid_from:null,valid_to:null},
    license_dates_source:{issue_date:selected.license_issue_date,expiration_date:selected.license_exp_date,semantics:'unparsed-source-calendar-dates-no-timezone-or-operating-date-inference'},
    affiliation:{parent_company:null,ownership_verified:false},
    provenance:{source_url:'https://data.pa.gov/resource/ajn5-kaxt.json',source_filter:"provider_type='Child Care Center'",source_master_provider_index:key,
      source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:context.observedAt,processed_at:context.processedAt,source_updated_at:context.sourceUpdatedAt,
      timestamp_interpretation:'selected-page-observation-and-catalog-update-separate-not-source-snapshot-date',transformation_version:PA_CHILDCARE_NORMALIZATION_VERSION,input_feature_sha256:hash(feature),
      attribution:'Pennsylvania Department of Human Services; Office of Child Development and Early Learning',policy_id:policy.policy_id,policy_profile:`${policy.policy_id}@${policy.version}`,policy_sha256:POLICY_SHA256,
      publisher_metadata_required:true,publisher_notices_required:true,
      field_lineage:{business_name:'facility_name',external_identifiers:identifiers.map(([field])=>field),street:'facility_address',street2:'facility_address_continued',city:'facility_city',state:'facility_state',country:'recognized-PA-source-state-label',
        county_source:'facility_county',county_fips_source:'facility_county_fips_code',state_fips_source:'facility_state_fips_code','physical_address.zip_code':'facility_zip_code','physical_address.postal_code':'facility_zip_code','physical_address.zip4':'facility_zip_code',
        latitude:'geocoded_column.coordinates[1]',longitude:'geocoded_column.coordinates[0]',capacity_source:'capacity',capacity_parsed:'capacity-strict-nonnegative-integer',license_issue_date:'license_issue_date',license_exp_date:'license_exp_date'}},
    quality:{zip_unavailable_reason:zip.reason,point_unavailable_reason:geo.reason,capacity_unavailable_reason:capacityReason,
      missing_identifier_fields:identifiers.filter(([field])=>selected[field]===null || selected[field].trim()==='').map(([field])=>field),current_usps_validity:'unverified',
      unique_business_identity_verified:false,identifier_stability_verified:false,geographic_boundary_verified:false,source_county_fips_verified:false,address_geocoding_accuracy_verified:false,identity_matching_eligible:false,
      state_fips_conflict:selected.facility_state_fips_code!==null && selected.facility_state_fips_code.trim()!=='' && selected.facility_state_fips_code.trim()!=='42'},
    export_policy:'internal',
  };
  if(Buffer.byteLength(JSON.stringify(record)+'\n')>=65536)reject('normalized-record-byte-limit');
  return assertNormalizedUsPostalFieldsDeep(record);
}

export async function normalizePaChildcareAcquisition(evidence,context,options={}){
  invariant(dataKeys(options,['signal']) && (options.signal===undefined || options.signal instanceof AbortSignal),'options');const {signal}=options;signal?.throwIfAborted();
  contextValues(context,['runId','sourceReleaseId','processedAt']);context={...context};
  // Synchronously bound and snapshot caller evidence before replay yields. The
  // replay applies its tighter typed per-response and cumulative payload caps.
  invariant(evidence && typeof evidence==='object' && !Array.isArray(evidence),'evidence');
  invariant(Buffer.byteLength(JSON.stringify(evidence))<=160_000_000,'retained evidence byte ceiling');
  evidence=structuredClone(evidence);
  const acquired=await replayPaChildcareAcquisition(evidence,{signal});
  invariant(context.processedAt>=evidence.finished_at,'processing precedes acquisition completion');
  const observations=new Map();for(const page of evidence.observations.filter(o=>o.kind==='page'))for(const row of page.payload)observations.set(row.master_provider_index,page.observed_at);
  const records=[],quarantine=[];
  for(const [index,feature] of acquired.features.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    const key=feature.master_provider_index,observedAt=observations.get(key);
    try{records.push(normalizePaChildcareFeature(feature,{...context,observedAt,sourceUpdatedAt:acquired.source.source_updated_at}));}
    catch(error){
      if(error.code!=='PA_CHILDCARE_RECORD_REJECTED')throw error;
      quarantine.push({source_master_provider_index:key,source_record_id:sourceId(context.sourceReleaseId,key),source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,
        observed_at:observedAt,processed_at:context.processedAt,source_updated_at:acquired.source.source_updated_at,input_feature_sha256:hash(feature),transformation_version:PA_CHILDCARE_NORMALIZATION_VERSION,
        policy_sha256:POLICY_SHA256,reason:error.reason,raw_evidence_location:'acquisition-observation-by-master-provider-index',export_policy:'internal'});
    }
  }
  invariant(records.length+quarantine.length===acquired.source.record_count,'source conservation');
  const reasons=property=>records.reduce((result,row)=>{const reason=row.quality[property];if(reason)result[reason]=(result[reason]??0)+1;return result;},{});
  signal?.throwIfAborted();return {records,quarantine,summary:{source_records:acquired.source.record_count,accepted_records:records.length,quarantined_records:quarantine.length,
    accepted_with_zip5:records.filter(r=>r.physical_address.zip_code!==null).length,accepted_with_zip4:records.filter(r=>r.physical_address.zip4!==null).length,accepted_with_points:records.filter(r=>r.geocode.latitude!==null).length,
    zip_unavailable_reasons:reasons('zip_unavailable_reason'),point_unavailable_reasons:reasons('point_unavailable_reason'),capacity_unavailable_reasons:reasons('capacity_unavailable_reason'),
    transformation_version:PA_CHILDCARE_NORMALIZATION_VERSION,acquisition_evidence_sha256:hash(evidence),normalized_records_sha256:hash(records),quarantine_sha256:hash(quarantine),
    identity_matching_applied:false,export_authorized:false,national_reporting_integrated:false,release_published:false}};
}
