import {setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {verifyVtChildcareAppJob} from './vt-childcare-app.mjs';
import {readVtChildcareNormalizedRelease} from './vt-childcare-normalized-release.mjs';
import {readVtChildcareAcquiredEvidence} from './vt-childcare-acquired-release.mjs';
import {VT_CHILDCARE_CALENDAR_FIELDS,VT_CHILDCARE_CAPACITY_FIELDS} from './vt-childcare-normalization.mjs';

export const VT_CHILDCARE_REPORTING_VERSION='vt-childcare-reporting@1.0.0';
const check=v=>{if(!v)throw Error('Vermont retained candidate reporting rejected.');};
const prefixes=['name','address','city','state','zip','point'];
function add(map,key){const token=JSON.stringify(key),row=map.get(token);if(row)row.candidate_rows++;else map.set(token,{...key,candidate_rows:1});}
const buckets=(map,total)=>[...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>({...row,percent_of_accepted_cohort:total?100*row.candidate_rows/total:null}));

/** Retained source-candidate counts only; publisher scope never assigns an address state. */
export async function summarizeVtChildcareAppJob(receiptPath,options={}){
 check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(k=>k==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
 const {signal}=options;check(signal===undefined||signal instanceof AbortSignal);signal?.throwIfAborted();
 const app=await verifyVtChildcareAppJob(receiptPath,{signal}),receipt=app.receipt;
 const normalized=await readVtChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),acquired=await readVtChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal});
 check(same(normalized.verification,receipt.normalized)&&same(acquired.verification,receipt.acquired)&&same(normalized.manifest.acquired,{manifest_path:acquired.verification.manifest_path,manifest_sha256:acquired.verification.manifest_sha256,run_id:acquired.verification.run_id,execution_mode:acquired.verification.execution_mode}));
 const {records,quarantine,summary}=normalized,source=acquired.evidence.before_preflight.source,sourceRows=acquired.verification.record_count;
 check(Number.isSafeInteger(sourceRows)&&sourceRows>0&&sourceRows<=20000&&records.length+quarantine.length===sourceRows&&source.reporting_period===null&&source.reporting_period_verified===false);
 const quality={with_zip5:0,with_zip4:0,with_points:0,missing_points:0,...Object.fromEntries(prefixes.map(p=>[`${p}_unavailable_reasons`,{}])),date_unavailable_counts:Object.fromEntries(VT_CHILDCARE_CALENDAR_FIELDS.map(f=>[f,0])),capacity_unavailable_counts:Object.fromEntries(VT_CHILDCARE_CAPACITY_FIELDS.map(f=>[f,0]))};
 const states=new Map(),zips=new Map(),keys=new Set(),ids=new Set();
 function identity(row){const key=JSON.stringify(row.source_unique_key);check(Array.isArray(row.source_unique_key)&&row.source_unique_key.length===2&&!keys.has(key)&&typeof row.source_record_id==='string'&&!ids.has(row.source_record_id));keys.add(key);ids.add(row.source_record_id);}
 for(const [index,row]of records.entries()){
  if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
  const p=row.provenance,a=row.reported_address,g=row.quality;
  identity({source_unique_key:p.source_unique_key,source_record_id:row.source_record_id});
  check(row.dataset_id==='vt-cdd-childcare-centers'&&row.publisher_scope==='VT'&&row.export_policy==='internal'&&p.ingest_run_id===normalized.verification.run_id&&p.source_release_id===normalized.manifest.source_release_id&&p.source_updated_at===source.source_updated_at&&p.reporting_file===source.reporting_file&&p.reporting_period===null&&p.reporting_period_verified===false);
  check(a.state===null&&a.country===null&&a.address_role==='reported-address-role-unspecified'&&a.postal_code===a.zip_code&&(a.zip_code===null||/^\d{5}$/.test(a.zip_code)&&a.zip_code!=='00000')&&(a.zip4===null||a.zip_code!==null&&/^\d{4}$/.test(a.zip4)));
  check(row.geocode.latitude===null&&row.geocode.longitude===null&&row.geocode.crs===null&&row.geocode.inferred===false&&row.claims.current_operations_verified===false&&row.claims.identity_matching_eligible===false&&row.claims.physical_site_verified===false);
  add(states,{state:null});add(zips,{state:null,zip5:a.zip_code});if(a.zip_code!==null)quality.with_zip5++;if(a.zip4!==null)quality.with_zip4++;quality.missing_points++;
  for(const prefix of prefixes){const reason=g[`${prefix}_unavailable_reason`];if(reason!==null){check(typeof reason==='string');const group=quality[`${prefix}_unavailable_reasons`];group[reason]=(group[reason]??0)+1;}}
  for(const field of VT_CHILDCARE_CALENDAR_FIELDS)if(row.license_dates_source[field].calendar_value===null)quality.date_unavailable_counts[field]++;
  for(const field of VT_CHILDCARE_CAPACITY_FIELDS)if(row.capacities[field].parsed===null)quality.capacity_unavailable_counts[field]++;
 }
 for(const [index,row]of quarantine.entries()){if(index%128===0){await yieldLoop();signal?.throwIfAborted();}identity(row);}
 check(keys.size===sourceRows&&summary.source_records===sourceRows&&summary.accepted_records===records.length&&summary.quarantined_records===quarantine.length&&summary.accepted_with_zip5===quality.with_zip5&&summary.accepted_with_zip4===quality.with_zip4&&summary.accepted_with_points===0);
 for(const key of [...prefixes.map(p=>`${p}_unavailable_reasons`),'date_unavailable_counts','capacity_unavailable_counts'])check(same(summary[key],quality[key]));
 const byState=buckets(states,records.length),byZip=buckets(zips,records.length);for(const group of [byState,byZip])check(group.reduce((n,row)=>n+row.candidate_rows,0)===records.length);
 const result={schema_version:VT_CHILDCARE_REPORTING_VERSION,source_id:'vt-cdd-childcare-centers',publisher_scope:'VT',source_candidate_rows:sourceRows,accepted_candidate_rows:records.length,quarantined_candidate_rows:quarantine.length,by_reported_state:byState,by_reported_zip:byZip,quality,
  provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:acquired.verification.manifest_sha256,normalized_manifest_sha256:normalized.verification.manifest_sha256,source_updated_at:source.source_updated_at,view_last_modified_at:source.view_last_modified_at,publication_at:source.publication_at,reporting_file:source.reporting_file,reporting_period:null,reporting_period_verified:false,observed_at:acquired.evidence.finished_at},
  claims:{denominator:'accepted source-candidate rows in this retained Vermont publisher cohort, not state-addressed businesses or all United States businesses',row_unit:'source-candidate-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,physical_site_verified:false,current_operations_verified:false,identity_matching_applied:false,credential_deduplication_applied:false,public_export_authorized:false,source_authenticity_verified:false,native_execution_independently_verified:false,address_role:'reported-address-role-unspecified',state_assignment:'not-selected-not-inferred',reporting_period_verified:false,exact_address_geocodes_verified:false,observation_semantics:'acquisition completion; individual page observations remain in normalized records'}};
 check(same(await readVtChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal}),acquired));check(same(await readVtChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),normalized));check(same(await verifyVtChildcareAppJob(receiptPath,{signal}),app));signal?.throwIfAborted();return result;
}
