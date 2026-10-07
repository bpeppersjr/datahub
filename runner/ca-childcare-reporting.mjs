import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {verifyCaChildcareAppReceipt} from './ca-childcare-app.mjs';
import {verifyCaChildcareNormalizedRelease} from './ca-childcare-normalized-release.mjs';
import {qualifyCaChildcareLifecycle} from './ca-childcare-lifecycle-qualification.mjs';

export const CA_CHILDCARE_REPORTING_VERSION='ca-childcare-reporting@1.1.0';
const check=(value,message)=>{if(!value)throw Error(`California childcare reporting rejected: ${message}`)};
const add=(map,dimensions)=>{const key=JSON.stringify(dimensions),existing=map.get(key);if(existing)existing.candidate_rows++;else map.set(key,{...dimensions,candidate_rows:1})};
const buckets=(map,total)=>[...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>({...row,percent_of_accepted_cohort:total?Number((row.candidate_rows/total*100).toFixed(6)):null}));
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');

export async function summarizeCaChildcareAppReceipt(receiptPath,{signal}={}){
  check(signal===undefined||signal instanceof AbortSignal,'signal');signal?.throwIfAborted();
  const app=await verifyCaChildcareAppReceipt(receiptPath,{signal}),receipt=app.receipt,normalized=await verifyCaChildcareNormalizedRelease(receipt.normalized.manifest_path,{signal});
  check(normalized.verification.manifest_sha256===receipt.normalized.manifest_sha256&&normalized.manifest.acquired.manifest_sha256===receipt.acquired.manifest_sha256,'receipt lineage');
  const recordsFile=path.join(path.dirname(normalized.verification.manifest_path),normalized.manifest.artifacts.records.path),states=new Map(),zips=new Map(),resources=new Map(),statuses=new Map(),lifecycles=new Map(),seen=new Set();
  let accepted=0,withZip5=0,withZip4=0,missingZip5=0,stateConflicts=0;
  const input=createReadStream(recordsFile,{encoding:'utf8'}),lines=createInterface({input,crlfDelay:Infinity});
  try{for await(const line of lines){signal?.throwIfAborted();check(line.length>0&&Buffer.byteLength(line)<=65536,'record framing');const row=JSON.parse(line);accepted++;if(accepted%128===0)await yieldLoop();
    check(row.schema_version==='ca-childcare-normalized-record@1.0.0'&&row.dataset_id==='ca-cdss-childcare-selected-facilities'&&row.publisher_scope==='CA'&&row.export_policy==='internal','record boundary');
    check(!seen.has(row.source_record_id)&&typeof row.source_record_id==='string');seen.add(row.source_record_id);
    const address=row.reported_address,provenance=row.provenance,claims=row.claims,status=row.source_status?.status_source??null;
    check(address&&address.address_role==='publisher-reported-facility-address-not-independently-verified'&&address.country==='US'&&address.postal_code===address.zip_code,'address semantics');
    check(address.zip_code===null||/^\d{5}$/.test(address.zip_code));check(address.zip4===null||/^\d{4}$/.test(address.zip4));
    check(row.geocode?.latitude===null&&row.geocode?.longitude===null&&row.geocode?.inferred===false&&row.geocode?.status==='not-provided-by-selected-source','geocode boundary');
    check(exact(claims,['publisher_listed_candidate','current_operations_verified','physical_site_verified','unique_business_identity_verified','identity_matching_eligible','geocodes_inferred','coordinates_selected','zip_validity_verified','zcta_membership_verified','ownership_inferred','network_affiliation_inferred','public_export_authorized','production_admission'])&&claims.publisher_listed_candidate===true&&Object.entries(claims).every(([key,value])=>key==='publisher_listed_candidate'||value===false),'claims');
    check(provenance?.ingest_run_id===normalized.verification.run_id&&provenance.source_release_id===`ca-childcare-acquired-${receipt.acquired.run_id}`&&typeof provenance.source_resource_id==='string','provenance');
    const lifecycle=qualifyCaChildcareLifecycle(row);
    add(states,{state:address.state});add(zips,{state:address.state,zip5:address.zip_code});add(resources,{source_resource_id:provenance.source_resource_id});add(statuses,{status_source:status});add(lifecycles,{qualification:lifecycle.qualification,file_date_quality:lifecycle.date_quality.file_date,license_first_date_quality:lifecycle.date_quality.license_first_date,closed_date_quality:lifecycle.date_quality.closed_date});
    if(address.zip_code===null)missingZip5++;else withZip5++;if(address.zip4!==null)withZip4++;if(row.quality?.state_scope_conflict)stateConflicts++;
  }}finally{lines.close();input.destroy()}
  check(accepted===normalized.verification.accepted_record_count&&accepted===normalized.summary.accepted_records&&withZip5===normalized.summary.accepted_with_zip5&&withZip4===normalized.summary.accepted_with_zip4&&missingZip5+withZip5===accepted,'conservation');
  const byState=buckets(states,accepted),byZip=buckets(zips,accepted),byResource=buckets(resources,accepted),byStatus=buckets(statuses,accepted),byLifecycle=buckets(lifecycles,accepted);for(const group of [byState,byZip,byResource,byStatus,byLifecycle])check(group.reduce((sum,row)=>sum+row.candidate_rows,0)===accepted,'bucket conservation');
  signal?.throwIfAborted();return{schema_version:CA_CHILDCARE_REPORTING_VERSION,source_id:'ca-cdss-childcare-selected-facilities',publisher_scope:'CA',source_candidate_rows:normalized.verification.source_record_count,accepted_candidate_rows:accepted,quarantined_candidate_rows:normalized.verification.quarantine_count,by_reported_state:byState,by_reported_zip:byZip,by_source_resource:byResource,by_source_status:byStatus,by_lifecycle_qualification:byLifecycle,quality:{with_zip5:withZip5,with_zip4:withZip4,missing_zip5:missingZip5,with_points:0,state_scope_conflicts:stateConflicts},provenance:{app_receipt_sha256:app.receipt_sha256,app_run_id:receipt.run_id,industry_run_id:receipt.industry_run_id,execution_mode:receipt.execution_mode,acquired_manifest_sha256:receipt.acquired.manifest_sha256,normalized_manifest_sha256:receipt.normalized.manifest_sha256,processed_at:normalized.manifest.processed_at,normalization_version:normalized.manifest.normalization_version},claims:{denominator:'accepted publisher-listed rows in this retained California childcare cohort; not current active businesses, unique facilities, or all United States businesses',row_unit:'publisher-listed-source-candidate-row',export_policy:'internal',national_reporting_integrated:false,national_completeness_percent:null,unique_active_business_count:null,current_usps_assignment_verified:false,boundary_assignment_verified:false,zcta_membership_verified:false,physical_site_verified:false,current_operations_verified:false,identity_matching_applied:false,geocodes_present:false,public_export_authorized:false,address_role:'publisher-reported-facility-address-not-independently-verified',state_assignment:'trimmed-source-state-label-or-null-not-boundary-assignment',county_assignment:'source-text-only-not-boundary-assignment',observation_semantics:'page-level source observations retained in the acquired and normalized releases'}};
}
