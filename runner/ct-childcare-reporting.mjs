import {setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {verifyCtChildcareAppJob} from './ct-childcare-app.mjs';
import {readCtChildcareNormalizedRelease} from './ct-childcare-normalized-release.mjs';
import {readCtChildcareAcquiredEvidence} from './ct-childcare-acquired-release.mjs';
import {CT_CHILDCARE_CALENDAR_FIELDS,CT_CHILDCARE_CAPACITY_FIELDS} from './ct-childcare-normalization.mjs';

export const CT_CHILDCARE_REPORTING_VERSION='ct-childcare-reporting@1.0.0';
const check=value=>{if(!value)throw Error('Connecticut retained candidate reporting rejected.');};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value)&&Buffer.from(value,'utf8').toString('utf8')===value;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function optionsOnly(value){check(value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).every(key=>key==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')));check(value.signal===undefined||value.signal instanceof AbortSignal);}
function add(map,dimensions){const key=JSON.stringify(dimensions),entry=map.get(key);if(entry)entry.candidate_rows++;else map.set(key,{...dimensions,candidate_rows:1});}
function buckets(map,total){return [...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>({...row,percent_of_accepted_cohort:total===0?null:100*row.candidate_rows/total}));}

/** Verified source-candidate rows, not physical sites or unique businesses. */
export async function summarizeCtChildcareAppJob(receiptPath,options={}){
  optionsOnly(options);const {signal}=options;signal?.throwIfAborted();
  const app=await verifyCtChildcareAppJob(receiptPath,{signal}),receipt=app.receipt;
  const normalized=await readCtChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),acquired=await readCtChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal});
  check(same(normalized.verification,receipt.normalized)&&same(acquired.verification,receipt.acquired)&&same(normalized.manifest.acquired,{manifest_path:acquired.verification.manifest_path,manifest_sha256:acquired.verification.manifest_sha256,run_id:acquired.verification.run_id,execution_mode:acquired.verification.execution_mode}));
  const records=normalized.records,quarantine=normalized.quarantine,summary=normalized.summary,sourceRows=acquired.verification.record_count;
  check(Array.isArray(records)&&Array.isArray(quarantine)&&Number.isSafeInteger(sourceRows)&&sourceRows>0&&sourceRows<=20000&&records.length+quarantine.length===sourceRows);
  const states=new Map(),zips=new Map(),keys=new Set(),recordIds=new Set(),credentials=new Set();
  const reasons=Object.fromEntries(['name','address','city','state','zip','point'].map(name=>[`${name}_unavailable_reasons`,{}]));
  const quality={with_zip5:0,with_zip4:0,with_points:0,missing_points:0,state_scope_conflicts:0,...reasons,date_unavailable_counts:Object.fromEntries(CT_CHILDCARE_CALENDAR_FIELDS.map(field=>[field,0])),capacity_unavailable_counts:Object.fromEntries(CT_CHILDCARE_CAPACITY_FIELDS.map(field=>[field,0]))};
  for(const [index,row]of records.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    check(row&&typeof row==='object'&&Buffer.byteLength(JSON.stringify(row))<65536&&row.dataset_id==='ct-oec-childcare-centers'&&row.export_policy==='internal');
    const address=row.reported_address,provenance=row.provenance,gaps=row.quality;
    check(text(row.source_record_id,2048)&&text(provenance.source_unique_key,256)&&!recordIds.has(row.source_record_id)&&!keys.has(provenance.source_unique_key));keys.add(provenance.source_unique_key);recordIds.add(row.source_record_id);
    check(provenance.ingest_run_id===normalized.verification.run_id&&provenance.source_release_id===normalized.manifest.source_release_id&&timestamp(provenance.observed_at)&&timestamp(provenance.source_updated_at));
    check(address.state===null||text(address.state,20000));check(address.country===null&&address.address_role==='reported-address-unverified');
    check(address.zip_code===null||typeof address.zip_code==='string'&&/^\d{5}$/.test(address.zip_code)&&address.zip_code!=='00000');check(address.postal_code===address.zip_code&&(address.zip4===null||address.zip_code!==null&&typeof address.zip4==='string'&&/^\d{4}$/.test(address.zip4)));
    check(row.geocode.latitude===null&&row.geocode.longitude===null&&row.geocode.crs===null&&row.geocode.inferred===false&&row.claims.physical_site_verified===false&&row.claims.identity_matching_eligible===false&&row.claims.current_operations_verified===false&&row.claims.credential_deduplication_applied===false);
    check((address.zip_code===null)===(gaps.zip_unavailable_reason!==null)&&gaps.point_unavailable_reason==='source-coordinates-not-selected');
    add(states,{state:address.state});add(zips,{state:address.state,zip5:address.zip_code});if(address.zip_code!==null)quality.with_zip5++;if(address.zip4!==null)quality.with_zip4++;quality.missing_points++;if(gaps.state_scope_conflict)quality.state_scope_conflicts++;
    for(const prefix of ['name','address','city','state','zip','point']){const reason=gaps[`${prefix}_unavailable_reason`];if(reason!==null){check(text(reason,128));const group=quality[`${prefix}_unavailable_reasons`];group[reason]=(group[reason]??0)+1;}}
    for(const field of CT_CHILDCARE_CALENDAR_FIELDS)if(row.license_dates_source[field].calendar_value===null)quality.date_unavailable_counts[field]++;
    for(const field of CT_CHILDCARE_CAPACITY_FIELDS)if(row.capacities[field].parsed===null)quality.capacity_unavailable_counts[field]++;
    const credential=row.source.selected_fields.credentialidnt;if(credential!==null&&credential!==undefined){check(text(credential,20000));credentials.add(credential);}
  }
  for(const [index,row]of quarantine.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}check(text(row.source_unique_key,256)&&text(row.source_record_id,2048)&&!keys.has(row.source_unique_key)&&!recordIds.has(row.source_record_id));keys.add(row.source_unique_key);recordIds.add(row.source_record_id);
  }
  check(keys.size===sourceRows&&summary.source_records===sourceRows&&summary.accepted_records===records.length&&summary.quarantined_records===quarantine.length&&summary.accepted_with_zip5===quality.with_zip5&&summary.accepted_with_zip4===quality.with_zip4&&summary.accepted_with_points===0);
  for(const name of [...Object.keys(reasons),'date_unavailable_counts','capacity_unavailable_counts'])check(same(quality[name],summary[name]));
  const byState=buckets(states,records.length),byZip=buckets(zips,records.length);for(const group of [byState,byZip])check(group.reduce((count,row)=>count+row.candidate_rows,0)===records.length);
  const distinctSource=acquired.evidence.before_preflight.source.distinct_credentials;check(Number.isSafeInteger(distinctSource)&&distinctSource>=credentials.size&&distinctSource<=sourceRows);
  const sourceUpdated=acquired.evidence.before_preflight.source.source_updated_at,observed=acquired.evidence.finished_at;check(timestamp(sourceUpdated)&&timestamp(observed));
  const result={schema_version:CT_CHILDCARE_REPORTING_VERSION,source_id:'ct-oec-childcare-centers',publisher_scope:'CT',source_candidate_rows:sourceRows,accepted_candidate_rows:records.length,quarantined_candidate_rows:quarantine.length,distinct_source_credentials:distinctSource,distinct_accepted_credentials:credentials.size,by_reported_state:byState,by_reported_zip:byZip,quality,
    provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:acquired.verification.manifest_sha256,normalized_manifest_sha256:normalized.verification.manifest_sha256,source_updated_at:sourceUpdated,observed_at:observed},
    claims:{denominator:'accepted source-candidate rows in this retained Connecticut ACTIVE Child Care Center credential cohort; not all United States businesses',row_unit:'source-candidate-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,physical_site_verified:false,identity_matching_applied:false,credential_deduplication_applied:false,public_export_authorized:false,source_authenticity_verified:false,native_execution_independently_verified:false,address_role:'reported-address-unverified',state_assignment:'trimmed-source-state-label-or-null-not-publisher-inference',county_assignment:'not-selected-not-inferred',capacity_summation_applied:false,observation_semantics:'acquisition completion; individual page observations remain in normalized records'}};
  check(same(await readCtChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),normalized));check(same(await verifyCtChildcareAppJob(receiptPath,{signal}),app));signal?.throwIfAborted();return result;
}
