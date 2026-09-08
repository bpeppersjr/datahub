import {setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {verifyMdChildcareAppJob} from './md-childcare-app.mjs';
import {readMdChildcareNormalizedRelease} from './md-childcare-normalized-release.mjs';
import {readMdChildcareAcquiredEvidence} from './md-childcare-acquired-release.mjs';

export const MD_CHILDCARE_REPORTING_VERSION='md-childcare-reporting@1.0.0';
const check=value=>{if(!value)throw Error('Maryland retained candidate reporting rejected.');};
const text=(v,n)=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u001f\u007f]/u.test(v)&&Buffer.from(v).toString('utf8')===v;
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const prefixes=['name','address','city','state','license','zip','zip4','point'];
function add(map,dimensions){const key=JSON.stringify(dimensions);const row=map.get(key);if(row)row.candidate_rows++;else map.set(key,{...dimensions,candidate_rows:1});}
function buckets(map,total){return [...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>({...row,percent_of_accepted_cohort:total?100*row.candidate_rows/total:null}));}

/** Offline, dated licensed-provider candidate counts; no entity matching. */
export async function summarizeMdChildcareAppJob(receiptPath,options={}){
 check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(k=>k==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
 const {signal}=options;check(signal===undefined||signal instanceof AbortSignal);signal?.throwIfAborted();
 const app=await verifyMdChildcareAppJob(receiptPath,{signal}),receipt=app.receipt;
 const normalized=await readMdChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),acquired=await readMdChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal});
 check(same(normalized.verification,receipt.normalized)&&same(acquired.verification,receipt.acquired)&&same(normalized.manifest.acquired,{manifest_path:acquired.verification.manifest_path,manifest_sha256:acquired.verification.manifest_sha256,run_id:acquired.verification.run_id,execution_mode:acquired.verification.execution_mode}));
 const {records,quarantine,summary}=normalized,sourceRows=acquired.verification.record_count;
 check(Array.isArray(records)&&Array.isArray(quarantine)&&Number.isSafeInteger(sourceRows)&&sourceRows>0&&sourceRows<=20000&&records.length+quarantine.length===sourceRows);
 const source=acquired.evidence.before_preflight.source,editing=acquired.evidence.before_preflight.observations.find(o=>o.kind==='layer').payload.editingInfo;
 check(source.publisher_cohort_date==='2026-02-13'&&timestamp(source.item_modified_at)&&timestamp(acquired.evidence.finished_at));
 const quality={with_zip5:0,with_zip4:0,with_points:0,missing_points:0,state_scope_conflicts:0,...Object.fromEntries(prefixes.map(p=>[`${p}_unavailable_reasons`,{}]))};
 const states=new Map(),zips=new Map(),keys=new Set(),ids=new Set(),licenses=new Set();let licensedRows=0;
 function identity(key,id){check(Number.isSafeInteger(key)&&key>0&&text(id,2048)&&!keys.has(key)&&!ids.has(id));keys.add(key);ids.add(id);}
 for(const [index,row] of records.entries()){
  if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
  check(row.dataset_id==='md-msde-childcare-centers'&&row.export_policy==='internal'&&Buffer.byteLength(JSON.stringify(row))<65536);
  const p=row.provenance,a=row.reported_address,g=row.quality,point=row.geocode;identity(p.source_unique_key,row.source_record_id);
  check(p.ingest_run_id===normalized.verification.run_id&&p.source_release_id===normalized.manifest.source_release_id&&p.publisher_cohort_date===source.publisher_cohort_date&&p.source_updated_at===source.item_modified_at&&same(p.source_editing_info,editing)&&timestamp(p.observed_at));
  check((a.state===null||text(a.state,8000))&&a.country===null&&a.address_role==='reported-address-unverified');
  check((a.zip_code===null||typeof a.zip_code==='string'&&/^\d{5}$/.test(a.zip_code)&&a.zip_code!=='00000')&&a.postal_code===a.zip_code&&a.zip4===null);
  check((a.zip_code===null)===(g.zip_unavailable_reason!==null)&&g.zip4_unavailable_reason==='source-zip4-not-provided');
  check(point.inferred===false&&row.claims.physical_site_verified===false&&row.claims.identity_matching_eligible===false&&row.claims.current_operations_verified===false&&row.claims.credential_deduplication_applied===false);
  if(point.latitude===null){check(point.longitude===null&&point.crs===null&&g.point_unavailable_reason!==null);quality.missing_points++;}
  else{check(Number.isFinite(point.latitude)&&Math.abs(point.latitude)<=90&&Number.isFinite(point.longitude)&&Math.abs(point.longitude)<=180&&point.crs==='EPSG:4326'&&g.point_unavailable_reason===null);quality.with_points++;}
  add(states,{state:a.state});add(zips,{state:a.state,zip5:a.zip_code});if(a.zip_code!==null)quality.with_zip5++;if(g.state_scope_conflict)quality.state_scope_conflicts++;
  for(const prefix of prefixes){const reason=g[`${prefix}_unavailable_reason`];if(reason!==null){check(text(reason,128));const group=quality[`${prefix}_unavailable_reasons`];group[reason]=(group[reason]??0)+1;}}
  const license=row.source.selected_attributes.License_Number;if(license!==null&&license!==undefined&&license.trim()!==''){check(text(license,8000));licensedRows++;licenses.add(license);}
 }
 for(const [index,row] of quarantine.entries()){if(index%128===0){await yieldLoop();signal?.throwIfAborted();}identity(row.source_unique_key,row.source_record_id);}
 check(keys.size===sourceRows&&summary.source_records===sourceRows&&summary.accepted_records===records.length&&summary.quarantined_records===quarantine.length&&summary.accepted_with_zip5===quality.with_zip5&&summary.accepted_with_zip4===0&&summary.accepted_with_points===quality.with_points&&summary.accepted_with_state_scope_conflict===quality.state_scope_conflicts&&quality.with_points+quality.missing_points===records.length);
 for(const prefix of prefixes)check(same(quality[`${prefix}_unavailable_reasons`],summary[`${prefix}_unavailable_reasons`]));
 const byState=buckets(states,records.length),byZip=buckets(zips,records.length);for(const group of [byState,byZip])check(group.reduce((n,row)=>n+row.candidate_rows,0)===records.length);
 const result={schema_version:MD_CHILDCARE_REPORTING_VERSION,source_id:'md-msde-childcare-centers',publisher_scope:'MD',source_candidate_rows:sourceRows,accepted_candidate_rows:records.length,quarantined_candidate_rows:quarantine.length,distinct_accepted_license_ids:licenses.size,accepted_rows_with_license:licensedRows,repeated_accepted_license_rows:licensedRows-licenses.size,by_reported_state:byState,by_reported_zip:byZip,quality,
  provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:acquired.verification.manifest_sha256,normalized_manifest_sha256:normalized.verification.manifest_sha256,publisher_cohort_date:source.publisher_cohort_date,item_modified_at:source.item_modified_at,source_updated_at:source.item_modified_at,source_editing_info:structuredClone(editing),observed_at:acquired.evidence.finished_at},
  claims:{denominator:'accepted source-candidate rows in this retained Maryland licensed-provider center cohort dated 2026-02-13; not current active businesses or all United States businesses',row_unit:'source-candidate-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,physical_site_verified:false,current_operations_verified:false,identity_matching_applied:false,credential_deduplication_applied:false,public_export_authorized:false,source_authenticity_verified:false,native_execution_independently_verified:false,address_role:'reported-address-unverified',state_assignment:'trimmed-source-state-label-or-null-not-publisher-inference',county_assignment:'not-selected-not-inferred',license_count_semantics:'distinct nonblank source license text among accepted rows; repeated source rows remain separate',observation_semantics:'acquisition completion; individual page observations remain in normalized records'}};
 check(same(await readMdChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),normalized));check(same(await verifyMdChildcareAppJob(receiptPath,{signal}),app));signal?.throwIfAborted();return result;
}
