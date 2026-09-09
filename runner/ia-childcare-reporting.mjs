import {setImmediate as yieldLoop} from 'node:timers/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {createHash} from 'node:crypto';
import {verifyIaChildcareAppJob} from './ia-childcare-app.mjs';
import {readIaChildcareNormalizedRelease} from './ia-childcare-normalized-release.mjs';
import {readIaChildcareAcquiredEvidence} from './ia-childcare-acquired.mjs';

export const IA_CHILDCARE_REPORTING_VERSION='ia-childcare-reporting@1.0.0';
const check=value=>{if(!value)throw Error('Iowa retained candidate reporting rejected.');};
const prefixes=['name','address','city','state','zip','point'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function add(map,key){const token=JSON.stringify(key),row=map.get(token);if(row)row.candidate_rows++;else map.set(token,{...key,candidate_rows:1});}
const buckets=(map,total)=>[...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>({...row,percent_of_accepted_cohort:total?100*row.candidate_rows/total:null}));

/** Counts retained source rows, never unique active businesses or inferred address-state membership. */
export async function summarizeIaChildcareAppJob(receiptPath,options={}){
 try{
  check(options&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).every(key=>key==='signal'&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')));
  const {signal}=options;check(signal===undefined||signal instanceof AbortSignal);signal?.throwIfAborted();
  const app=await verifyIaChildcareAppJob(receiptPath,{signal}),receipt=app.receipt;
  const normalized=await readIaChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),acquired=await readIaChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal});
  check(same(normalized.verification,receipt.normalized)&&same(acquired.verification,receipt.acquired)&&same(normalized.manifest.acquired,acquired.verification));
  const {records,quarantine,summary}=normalized,selection=acquired.evidence.selection,counts=selection.counts,observedAt=acquired.evidence.requests[1].observed_at,responseHash=acquired.evidence.requests[1].decoded_sha256;
  check(Number.isSafeInteger(counts.selected_rows)&&counts.selected_rows>=0&&counts.selected_rows<=10000&&records.length+quarantine.length===counts.selected_rows&&counts.selected_rows+counts.excluded_rows===counts.source_rows);
  const quality={with_zip5:0,with_zip4:0,with_points:0,missing_points:0,...Object.fromEntries(prefixes.map(prefix=>[`${prefix}_unavailable_reasons`,{}])),with_unverified_point_accuracy:0,geocode_accuracy_verified:false,source_update_time_known:false,source_update_unavailable_rows:records.length,source_reported_state_available:false};
  const states=new Map(),zips=new Map(),ordinals=new Set(),ids=new Set(),selected=new Map(selection.rows.map(row=>[row.source_ordinal,row.source]));
  function identity(ordinal,id,inputHash){
    check(Number.isSafeInteger(ordinal)&&ordinal>=1&&ordinal<=counts.source_rows&&selected.has(ordinal)&&!ordinals.has(ordinal));
    check(id===`${normalized.manifest.source_release_id}:row:${ordinal}`&&!ids.has(id)&&hash(selected.get(ordinal))===inputHash);ordinals.add(ordinal);ids.add(id);
  }
  for(const [index,row]of records.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    const p=row.provenance,a=row.reported_address,g=row.geocode;
    identity(p.source_ordinal,row.source_record_id,p.input_feature_sha256);
    check(row.dataset_id==='ia-childcare-centers'&&row.publisher_scope==='IA'&&row.export_policy==='internal'&&p.ingest_run_id===normalized.verification.run_id&&p.source_release_id===normalized.manifest.source_release_id&&p.observed_at===observedAt&&p.processed_at===normalized.manifest.processed_at&&p.source_updated_at===null&&p.source_response_sha256===responseHash&&same(row.source.selected_fields,selected.get(p.source_ordinal)));
    check(a.state===null&&a.state_source===null&&a.country===null&&a.county_source===null&&a.address_role==='reported-address-role-unspecified'&&a.postal_code===a.zip_code&&(a.zip_code===null||typeof a.zip_code==='string'&&/^[1-9][0-9]{4}$/.test(a.zip_code))&&a.zip4===null);
    check(g.crs===null&&g.inferred===false&&g.accuracy_verified===false&&row.claims.current_operations_verified===false&&row.claims.identity_matching_eligible===false&&row.claims.physical_site_verified===false&&row.external_identifiers.length===0);
    if(g.latitude===null||g.longitude===null){check(g.latitude===null&&g.longitude===null);quality.missing_points++;}
    else{check(Number.isFinite(g.latitude)&&Number.isFinite(g.longitude)&&Math.abs(g.latitude)<=90&&Math.abs(g.longitude)<=180);quality.with_points++;quality.with_unverified_point_accuracy++;}
    add(states,{state:null});add(zips,{state:null,zip5:a.zip_code});if(a.zip_code!==null)quality.with_zip5++;
    for(const prefix of prefixes){const reason=row.quality[`${prefix}_unavailable_reason`];if(reason!==null){check(typeof reason==='string');const group=quality[`${prefix}_unavailable_reasons`];group[reason]=(group[reason]??0)+1;}}
  }
  for(const [index,row]of quarantine.entries()){
    if(index%128===0){await yieldLoop();signal?.throwIfAborted();}
    identity(row.source_ordinal,row.source_record_id,row.input_feature_sha256);
    check(row.source_release_id===normalized.manifest.source_release_id&&row.ingest_run_id===normalized.verification.run_id&&row.observed_at===observedAt&&row.processed_at===normalized.manifest.processed_at&&row.source_response_sha256===responseHash&&row.export_policy==='internal');
  }
  check(ordinals.size===selected.size&&ordinals.size===counts.selected_rows&&summary.source_records===counts.selected_rows&&summary.source_response_rows===counts.source_rows&&summary.excluded_source_records===counts.excluded_rows&&summary.duplicate_selected_rows===counts.duplicate_selected_rows&&summary.accepted_records===records.length&&summary.quarantined_records===quarantine.length&&summary.accepted_with_zip5===quality.with_zip5&&summary.accepted_with_zip4===quality.with_zip4&&summary.accepted_with_points===quality.with_points&&quality.with_points+quality.missing_points===records.length);
  for(const prefix of prefixes)check(same(summary[`${prefix}_unavailable_reasons`],quality[`${prefix}_unavailable_reasons`]));
  const byState=buckets(states,records.length),byZip=buckets(zips,records.length);for(const group of [byState,byZip])check(group.reduce((n,row)=>n+row.candidate_rows,0)===records.length);
  const result={schema_version:IA_CHILDCARE_REPORTING_VERSION,source_id:'ia-childcare-centers',publisher_scope:'IA',source_candidate_rows:counts.selected_rows,source_response_rows:counts.source_rows,excluded_source_rows:counts.excluded_rows,duplicate_selected_rows:counts.duplicate_selected_rows,accepted_candidate_rows:records.length,quarantined_candidate_rows:quarantine.length,by_reported_state:byState,by_reported_zip:byZip,quality,
    provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:acquired.verification.manifest_sha256,normalized_manifest_sha256:normalized.verification.manifest_sha256,observed_at:observedAt,source_updated_at:null,processed_at:normalized.manifest.processed_at},
    claims:{denominator:'accepted source-candidate rows in this retained Iowa center/preschool publisher cohort, not state-addressed businesses, unique active businesses, or all United States businesses',row_unit:'source-candidate-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,physical_site_verified:false,current_operations_verified:false,identity_matching_applied:false,credential_deduplication_applied:false,public_export_authorized:false,source_authenticity_verified:false,native_execution_independently_verified:false,address_role:'reported-address-role-unspecified',state_assignment:'not-provided-not-inferred',exact_address_geocodes_verified:false,geocode_accuracy_verified:false,source_update_time_known:false,observation_semantics:'middle map response observation; not source update or operating validity'}};
  check(same(await readIaChildcareAcquiredEvidence(receipt.acquired.manifest_path,{signal}),acquired));check(same(await readIaChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal}),normalized));check(same(await verifyIaChildcareAppJob(receiptPath,{signal}),app));signal?.throwIfAborted();return result;
 }catch{throw Error('Iowa retained candidate reporting rejected.');}
}
