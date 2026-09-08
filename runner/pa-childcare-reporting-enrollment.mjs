import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {summarizePaChildcareAppJob} from './pa-childcare-reporting.mjs';
const check=value=>{if(!value)throw Error('Pennsylvania reporting enrollment rejected.');};

export async function loadPaChildcareReportingEnrollment({root=APP_ROOT,signal}={}) {
  signal?.throwIfAborted();const config=path.join(root,'config/pa-childcare-reporting-enrollment.json'),meter={};let binding;
  try{binding=await readJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='pa-childcare-reporting-enrollment@1.0.0'&&/^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)
    &&typeof binding.app_receipt_path==='string'&&binding.app_receipt_path.startsWith('data/')&&binding.app_receipt_path.split('/').every(part=>part&&!['.','..'].includes(part)&&!part.includes('\\')));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(path.resolve(root),receipt);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  try{await lstat(receipt);}catch(error){if(error.code==='ENOENT')return {status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};throw error;}
  const receiptMeter={};await readJson(receipt,100000,signal,receiptMeter);check(receiptMeter.sha256===binding.app_receipt_sha256);
  const summary=await summarizePaChildcareAppJob(receipt,{signal});
  check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256&&summary.provenance.execution_mode==='fixed-native-fetch');
  const finalMeter={};await readJson(config,10000,signal,finalMeter);check(meter.sha256===finalMeter.sha256);
  return {status:'available',sourceId:'pa-dhs-childcare-centers',publisherJurisdiction:'PA',enrollmentSha256:meter.sha256,summary};
}

export function projectPaChildcareStateEvidence(enrollment,state) {
  if(enrollment.status!=='available')return {status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};
  if(state!=='PA')return {status:'outside-publisher-scope',sourceId:enrollment.sourceId,publisherJurisdiction:'PA'};
  const s=enrollment.summary,entry=s.by_reported_state.find(item=>item.state===state);
  return {status:'verified-retained-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:'PA',reportedAddressState:state,
    facilityRows:entry?.facility_rows??0,acceptedCohortRows:s.accepted_facility_rows,sourceRows:s.source_rows,quarantinedRows:s.quarantined_rows,
    percentOfAcceptedCohort:entry?.percent_of_accepted_cohort??(s.accepted_facility_rows?0:null),
    denominator:'accepted facility rows in this retained Pennsylvania Child Care Center cohort; not all U.S. businesses',
    reportedZIP5Count:s.by_reported_zip.filter(row=>row.state===state&&row.zip5!==null).length,
    quality:s.quality,appReceiptSha256:s.provenance.app_receipt_sha256,appRunId:s.provenance.app_run_id,industryRunId:s.provenance.industry_run_id,
    normalizedManifestSha256:s.provenance.normalized_manifest_sha256,acquiredManifestSha256:s.provenance.acquired_manifest_sha256,
    observedAt:s.provenance.observed_at,sourceUpdatedAt:s.provenance.source_updated_at,enrollmentSha256:enrollment.enrollmentSha256,
    nationalReportingIntegrated:false,nationalIndustryPercent:null,uniqueActiveBusinessCount:null,currentUspsAssignmentVerified:false,boundaryAssignmentVerified:false};
}
