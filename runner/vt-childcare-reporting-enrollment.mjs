import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {summarizeVtChildcareAppJob} from './vt-childcare-reporting.mjs';
const check=value=>{if(!value)throw Error('Vermont reporting enrollment rejected.');};

export async function loadVtChildcareReportingEnrollment(options={}) {
  check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(k=>['root','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
  const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));
  signal?.throwIfAborted();const config=path.join(root,'config/vt-childcare-reporting-enrollment.json'),meter={};let binding;
  try{binding=await readJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='vt-childcare-reporting-enrollment@1.0.0'&&/^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)
    &&typeof binding.app_receipt_path==='string'&&binding.app_receipt_path.startsWith('data/')&&binding.app_receipt_path.split('/').every(part=>part&&!['.','..'].includes(part)&&!part.includes('\\')));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(root,receipt);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  try{await lstat(receipt);}catch(error){if(error.code==='ENOENT')return {status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};throw error;}
  const receiptMeter={};await readJson(receipt,100000,signal,receiptMeter);check(receiptMeter.sha256===binding.app_receipt_sha256);
  const summary=await summarizeVtChildcareAppJob(receipt,{signal});
  check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256&&summary.provenance.execution_mode==='fixed-native-fetch');
  const finalMeter={};await readJson(config,10000,signal,finalMeter);check(meter.sha256===finalMeter.sha256);
  return {status:'available',sourceId:'vt-cdd-childcare-centers',publisherJurisdiction:'VT',enrollmentSha256:meter.sha256,summary};
}

export function projectVtChildcarePublisherEvidence(enrollment,state) {
  if(enrollment.status!=='available')return {status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};
  if(state!=='VT')return {status:'outside-publisher-scope',sourceId:enrollment.sourceId,publisherJurisdiction:'VT'};
  const s=enrollment.summary,accepted=s.accepted_candidate_rows;
  check(enrollment.sourceId==='vt-cdd-childcare-centers'&&enrollment.publisherJurisdiction==='VT');
  check(Number.isSafeInteger(accepted)&&accepted>=0&&Number.isSafeInteger(s.quarantined_candidate_rows)&&s.quarantined_candidate_rows>=0&&s.source_candidate_rows===accepted+s.quarantined_candidate_rows);
  check(Array.isArray(s.by_reported_state)&&s.by_reported_state.length===(accepted?1:0)&&s.by_reported_state.every(row=>row.state===null&&row.candidate_rows===accepted));
  check(Array.isArray(s.by_reported_zip)&&s.by_reported_zip.every(row=>row.state===null&&(row.zip5===null||typeof row.zip5==='string'&&/^\d{5}$/.test(row.zip5))&&Number.isSafeInteger(row.candidate_rows)&&row.candidate_rows>0)&&s.by_reported_zip.reduce((n,row)=>n+row.candidate_rows,0)===accepted&&new Set(s.by_reported_zip.map(row=>row.zip5)).size===s.by_reported_zip.length);
  check(s.quality.with_points===0&&s.quality.missing_points===accepted&&s.quality.with_zip5===s.by_reported_zip.filter(row=>row.zip5!==null).reduce((n,row)=>n+row.candidate_rows,0));
  check(s.provenance.reporting_period===null&&s.provenance.reporting_period_verified===false);
  return {status:'verified-retained-publisher-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:'VT',evidenceBasis:'publisher-scope-not-reported-address-state',reportedAddressState:null,
    publisherCohortRows:accepted,reportedAddressStateUnavailableRows:accepted,acceptedCohortRows:accepted,sourceRows:s.source_candidate_rows,quarantinedRows:s.quarantined_candidate_rows,
    percentOfAcceptedCohort:accepted?100:null,
    denominator:'accepted source candidate rows in this retained Vermont publisher cohort; not Vermont address-state coverage, verified facilities or all U.S. businesses',
    distinctReportedZIP5Values:s.by_reported_zip.filter(row=>row.zip5!==null).length,rowsWithZIP5:s.quality.with_zip5,rowsWithZIP4:s.quality.with_zip4,
    quality:s.quality,qualityScope:'entire-retained-publisher-cohort-not-address-state-filtered',
    appReceiptSha256:s.provenance.app_receipt_sha256,appRunId:s.provenance.app_run_id,industryRunId:s.provenance.industry_run_id,normalizedManifestSha256:s.provenance.normalized_manifest_sha256,acquiredManifestSha256:s.provenance.acquired_manifest_sha256,
    reportingFile:s.provenance.reporting_file,reportingPeriod:null,reportingPeriodVerified:false,observedAt:s.provenance.observed_at,sourceUpdatedAt:s.provenance.source_updated_at,viewLastModifiedAt:s.provenance.view_last_modified_at,publicationAt:s.provenance.publication_at,enrollmentSha256:enrollment.enrollmentSha256,
    nationalReportingIntegrated:false,nationalIndustryPercent:null,uniqueActiveBusinessCount:null,currentUspsAssignmentVerified:false,boundaryAssignmentVerified:false,physicalSiteVerified:false,currentOperationsVerified:false};
}
