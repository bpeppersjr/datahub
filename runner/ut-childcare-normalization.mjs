import {createHash} from 'node:crypto';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
import policy from '../config/source-policies/ut-childcare-centers-internal.json' with {type:'json'};

export const UT_CHILDCARE_NORMALIZATION_VERSION='ut-childcare-normalization@1.0.0';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const UT_CHILDCARE_POLICY_SHA256='831a2db5b4b1a32dc4b9e99f19c34e9a161f9f68192acf93bb4d66b4dff79b47';
export const UT_CHILDCARE_OBSERVATION_FIELDS=Object.freeze(['source_page','source_row','facility_id','facility_name','address_line_1','address_line_2','city','state','county','zip5','zip4','license_type','capacity','license_expiration_date_source','initial_regulation_date_source','operating_status','address_role','latitude','longitude']);
const CONTEXT=['sourceReleaseId','runId','observedAt','processedAt','sourceUrl','sourceSha256','originReceiptSha256','prerequisiteReceiptSha256'];
const ownData=(value,fields)=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===fields.length&&Reflect.ownKeys(value).every(key=>fields.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const reject=reason=>{throw Object.assign(new Error('Utah selected observation rejected.'),{code:'UT_CHILDCARE_RECORD_REJECTED',reason});};
const validText=value=>typeof value==='string'&&value.length>0&&value.length<=4096&&value===value.trim()&&!/[\p{C}\p{Zl}\p{Zp}]/u.test(value)&&Buffer.from(value,'utf8').toString('utf8')===value;
function validateContext(context){
  const fail=()=>{throw new Error('Utah normalization context rejected.');};
  if(hash(policy)!==UT_CHILDCARE_POLICY_SHA256)fail();
  if(!ownData(context,CONTEXT))fail();
  for(const field of ['sourceReleaseId','runId'])if(typeof context[field]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(context[field]))fail();
  for(const field of ['observedAt','processedAt'])if(typeof context[field]!=='string'||!Number.isFinite(Date.parse(context[field]))||new Date(context[field]).toISOString()!==context[field])fail();
  if(Date.parse(context.processedAt)<Date.parse(context.observedAt)||context.sourceUrl!==policy.source_dataset)fail();
  for(const field of ['sourceSha256','originReceiptSha256','prerequisiteReceiptSha256'])if(typeof context[field]!=='string'||!/^[a-f0-9]{64}$/.test(context[field]))fail();
}
function calendar(raw){
  if(typeof raw!=='string')reject('invalid-source-date');
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if(!match)reject('invalid-source-date');
  const [,month,day,year]=match.map(Number),date=new Date(Date.UTC(year,month-1,day));
  if(year<1900||year>2199||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)reject('invalid-source-date');
  return {raw,calendar_value:`${match[3]}-${match[1]}-${match[2]}`,validity:'valid-floating-calendar'};
}
const claims=()=>({source_evidence_verified:false,source_membership_verified:false,physical_site_verified:false,identity_matching_eligible:false,unique_business_identity_verified:false,current_operations_verified:false,source_key_stability_verified:false,geocodes_inferred:false,geographic_boundary_verified:false,public_export_authorized:false,national_reporting_integrated:false});

/** Projection only: supplied receipt hashes are lineage, not authenticated evidence. */
export function normalizeUtChildcareObservation(observation,context){
  validateContext(context);
  if(!ownData(observation,UT_CHILDCARE_OBSERVATION_FIELDS))reject('selected-field-drift');
  for(const field of ['facility_name','address_line_1','city','county'])if(!validText(observation[field]))reject('invalid-selected-text');
  if(observation.address_line_2!==null&&!validText(observation.address_line_2))reject('invalid-selected-text');
  if(typeof observation.facility_id!=='string'||!/^F\d{2}-\d{1,32}$/.test(observation.facility_id))reject('invalid-source-key');
  if(!Number.isInteger(observation.source_page)||observation.source_page<1||observation.source_page>100||!Number.isInteger(observation.source_row)||observation.source_row<1||observation.source_row>65)reject('invalid-source-location');
  if(observation.state!=='UT'||observation.license_type!=='Child Care Center')reject('source-scope-drift');
  if(typeof observation.zip5!=='string'||!/^\d{5}$/.test(observation.zip5)||observation.zip5==='00000'||observation.zip4!==null&&(typeof observation.zip4!=='string'||!/^\d{4}$/.test(observation.zip4)))reject('invalid-source-zip');
  if(!Number.isSafeInteger(observation.capacity)||observation.capacity<0||Object.is(observation.capacity,-0))reject('invalid-source-capacity');
  for(const field of ['operating_status','address_role','latitude','longitude'])if(observation[field]!==null)reject('unsupported-source-inference');
  const dates=Object.fromEntries(['license_expiration_date_source','initial_regulation_date_source'].map(field=>[field,calendar(observation[field])]));
  const selected=Object.fromEntries(UT_CHILDCARE_OBSERVATION_FIELDS.map(field=>[field,observation[field]]));
  const record={schema_version:'1.0.0',dataset_id:'ut-dlbc-childcare-centers',source_record_id:`${context.sourceReleaseId}:row:${hash(observation.facility_id)}`,publisher_scope:'UT',business_name:observation.facility_name,
    external_identifiers:[{type:'utah_dlbc_childcare_facility_id',value:observation.facility_id,source_field:'facility_id',identity_verified:false,stability_verified:false}],
    reported_address:{street:observation.address_line_1,street2:observation.address_line_2,city:observation.city,state:'UT',state_source:'UT',county_source:observation.county,country:null,zip_code:observation.zip5,postal_code:observation.zip5,zip4:observation.zip4,address_role:null},
    geocode:{latitude:null,longitude:null,crs:null,status:'not-provided-by-selected-source',inferred:false},industry:{category:'childcare',childcare_type_source:observation.license_type},
    source_status:{status_source:null,status_interpretation:'operating-status-not-provided-by-selected-source',active_business_verified:false},
    license_dates_source:dates,date_semantics:'source-license-calendar-facts-not-business-opening-or-operating-dates',capacities:{total_licensed_capacity:{raw:observation.capacity,parsed:observation.capacity,unavailable_reason:null}},
    source:{selected_fields:UT_CHILDCARE_OBSERVATION_FIELDS.map(source_field=>({source_field,value:selected[source_field]}))},
    provenance:{source_url:context.sourceUrl,source_sha256:context.sourceSha256,source_unique_key:observation.facility_id,source_page:observation.source_page,source_row:observation.source_row,source_filter:'License type = Child Care Center',source_release_id:context.sourceReleaseId,ingest_run_id:context.runId,observed_at:context.observedAt,processed_at:context.processedAt,origin_receipt_sha256:context.originReceiptSha256,prerequisite_receipt_sha256:context.prerequisiteReceiptSha256,input_feature_sha256:hash(selected),transformation_version:UT_CHILDCARE_NORMALIZATION_VERSION,policy_id:policy.policy_id,policy_profile:`${policy.policy_id}@${policy.version}`,policy_sha256:UT_CHILDCARE_POLICY_SHA256,attribution:policy.attribution,
      field_lineage:{business_name:'facility_name',external_identifiers:'facility_id-not-canonical-identity',reported_address:['address_line_1','address_line_2','city','state','county','zip5','zip4'],geocode:'not-provided-null',source_status:'not-provided-null',industry:'license_type-exact-center-selection',license_dates_source:['license_expiration_date_source','initial_regulation_date_source'],capacities:'capacity-selected-numeric-observation',source_location:['source_page','source_row'],claims:'conservative-projection-only-no-origin-verification'}},
    quality:{current_usps_assignment_verified:false,address_role_verified:false,status_unavailable_reason:'source-operating-status-not-provided',point_unavailable_reason:'source-coordinates-not-selected',address_role_unavailable_reason:'source-address-role-unspecified',address_unavailable_reason:/^(?:P\.?\s*O\.?\s*BOX|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(observation.address_line_1)?'source-po-box-or-nonstreet-label':null},claims:claims(),export_policy:'internal'};
  if(Buffer.byteLength(JSON.stringify(record)+'\n')>=65536)reject('normalized-record-byte-limit');
  return assertNormalizedUsPostalFieldsDeep(record);
}

/** All-or-nothing projection; origin/layout verification belongs to the caller. */
export async function normalizeUtChildcareObservations(observations,context,options={}){
  if(!ownData(options,[])&&!ownData(options,['signal'])||options.signal!==undefined&&!(options.signal instanceof AbortSignal))throw new Error('Utah normalization options rejected.');
  validateContext(context);context={...context};const {signal}=options;signal?.throwIfAborted();
  if(!Array.isArray(observations)||observations.length>6500||Reflect.ownKeys(observations).length!==observations.length+1)reject('invalid-observation-inventory');
  // Validate and snapshot before yielding; never invoke an accessor or retain a
  // caller-owned mutable object across asynchronous cancellation boundaries.
  const records=[],ids=new Set(),locations=new Set();
  for(let index=0;index<observations.length;index++){
    if(!Object.hasOwn(Object.getOwnPropertyDescriptor(observations,String(index))??{},'value'))reject('invalid-observation-inventory');
    const record=normalizeUtChildcareObservation(observations[index],context),id=record.provenance.source_unique_key,location=`${record.provenance.source_page}:${record.provenance.source_row}`;
    if(ids.has(id)||locations.has(location))reject('duplicate-source-observation');ids.add(id);locations.add(location);records.push(record);
  }
  await yieldLoop();signal?.throwIfAborted();
  return {records,quarantine:[],summary:{source_records:records.length,accepted_records:records.length,quarantined_records:0,accepted_with_zip5:records.length,accepted_with_zip4:records.filter(row=>row.reported_address.zip4!==null).length,accepted_with_points:0,transformation_version:UT_CHILDCARE_NORMALIZATION_VERSION,normalized_records_sha256:hash(records),quarantine_sha256:hash([]),...claims(),release_published:false}};
}
