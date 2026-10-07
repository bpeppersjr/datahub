import{createHash}from'node:crypto';
import{readFile}from'node:fs/promises';
import path from'node:path';
import registration from'../config/datasets/ca-childcare-status-readiness.json' with{type:'json'};
import{APP_ROOT}from'./paths.mjs';
import{verifyCaChildcareStatusPreflight}from'./ca-childcare-status-preflight.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),check=(value,message)=>{if(!value)throw Error(`California childcare status readiness rejected: ${message}`)};
export async function readCaChildcareStatusReadiness({root=APP_ROOT}={}){
  check(root===path.resolve(root),'root');const manifest=path.resolve(root,registration.manifest_path),relative=path.relative(root,manifest);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'path');const bytes=await readFile(manifest);check(sha(bytes)===registration.manifest_sha256,'manifest identity');const verified=await verifyCaChildcareStatusPreflight(manifest,{appRoot:root});
  const statuses=Object.fromEntries(['CLOSED','INACTIVE','LICENSED','ON PROBATION','PENDING'].map(status=>[status,0]));let publisherRows=0,currentCandidates=0;
  for(const resource of verified.resources){publisherRows+=resource.schema_preflight_row_total;currentCandidates+=resource.publisher_current_candidate_count;for(const row of resource.status_counts){check(Object.hasOwn(statuses,row.facility_status),'status vocabulary');statuses[row.facility_status]+=row.row_count}}
  check(publisherRows===39184&&Object.values(statuses).reduce((sum,value)=>sum+value,0)===publisherRows&&currentCandidates===statuses.LICENSED+statuses['ON PROBATION'],'conservation');
  return{schema_version:'ca-childcare-status-readiness-view@1.1.0',state:'CA',industry:'childcare',status:'verified-aggregate-publisher-readiness',publisher_rows:publisherRows,publisher_status_counts:statuses,publisher_open_status_candidate_rows:currentCandidates,temporal:{publisher_file_date:'2025-05-25',preflight_observed_at:verified.observed_at,posture:'publisher-file-date-retained-catalog-backend-disagreement-unresolved',current_operation_verified:false},source:{run_id:verified.run_id,manifest_sha256:registration.manifest_sha256},claims:registration.claims,semantics:verified.publisher_status_semantics.meaning};
}
