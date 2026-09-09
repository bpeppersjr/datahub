import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {summarizeIaChildcareAppJob} from './ia-childcare-reporting.mjs';
const check=v=>{if(!v)throw Error('Iowa reporting enrollment rejected.');};
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000;

export async function loadIaChildcareReportingEnrollment(options={}) {
  check(options&&[Object.prototype,null].includes(Object.getPrototypeOf(options))&&Reflect.ownKeys(options).every(k=>['root','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
  const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));signal?.throwIfAborted();
  const config=path.join(root,'config/ia-childcare-reporting-enrollment.json'),meter={};let binding;
  try{binding=await readJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='ia-childcare-reporting-enrollment@1.0.0'&&typeof binding.app_receipt_sha256==='string'&&/^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)
    &&typeof binding.app_receipt_path==='string'&&binding.app_receipt_path.startsWith('data/')&&binding.app_receipt_path.split('/').every(p=>p&&!['.','..'].includes(p)&&!p.includes('\\')&&!p.includes(':')));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(root,receipt);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  const unchanged=async()=>{const final={};await readJson(config,10000,signal,final);check(final.sha256===meter.sha256);signal?.throwIfAborted();};
  try{await lstat(receipt);}catch(error){if(error.code!=='ENOENT')throw error;await unchanged();return {status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};}
  const receiptMeter={};await readJson(receipt,100000,signal,receiptMeter);check(receiptMeter.sha256===binding.app_receipt_sha256);
  const summary=await summarizeIaChildcareAppJob(receipt,{signal});
  check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256&&summary.provenance.execution_mode==='fixed-native-fetch');await unchanged();
  return {status:'available',sourceId:'ia-childcare-centers',publisherJurisdiction:'IA',enrollmentSha256:meter.sha256,summary};
}

export function projectIaChildcarePublisherEvidence(enrollment,state) {
  if(enrollment.status!=='available')return {status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};
  if(state!=='IA')return {status:'outside-publisher-scope',sourceId:enrollment.sourceId,publisherJurisdiction:'IA'};
  const s=enrollment.summary,n=s.accepted_candidate_rows,q=s.quality;
  check(enrollment.sourceId==='ia-childcare-centers'&&enrollment.publisherJurisdiction==='IA');
  check([n,s.quarantined_candidate_rows,s.source_candidate_rows,s.source_response_rows,s.excluded_source_rows,s.duplicate_selected_rows].every(count));
  check(s.source_candidate_rows===n+s.quarantined_candidate_rows&&s.source_response_rows===s.source_candidate_rows+s.excluded_source_rows&&s.duplicate_selected_rows<=s.source_candidate_rows);
  check(Array.isArray(s.by_reported_state)&&s.by_reported_state.length===(n?1:0)&&s.by_reported_state.every(r=>r.state===null&&r.candidate_rows===n&&r.percent_of_accepted_cohort===100));
  check(Array.isArray(s.by_reported_zip)&&s.by_reported_zip.every(r=>r.state===null&&(r.zip5===null||typeof r.zip5==='string'&&/^[1-9][0-9]{4}$/.test(r.zip5))&&count(r.candidate_rows)&&r.candidate_rows>0&&r.percent_of_accepted_cohort===100*r.candidate_rows/n)
    &&s.by_reported_zip.reduce((a,r)=>a+r.candidate_rows,0)===n&&new Set(s.by_reported_zip.map(r=>r.zip5)).size===s.by_reported_zip.length);
  check([q.with_zip5,q.with_zip4,q.with_points,q.missing_points].every(count)&&q.with_zip4===0&&q.with_points+q.missing_points===n&&q.with_zip5===s.by_reported_zip.filter(r=>r.zip5!==null).reduce((a,r)=>a+r.candidate_rows,0));
  check(s.provenance.source_updated_at===null);
  return {status:'verified-retained-publisher-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:'IA',evidenceBasis:'publisher-scope-not-reported-address-state',reportedAddressState:null,
    publisherCohortRows:n,reportedAddressStateUnavailableRows:n,acceptedCohortRows:n,sourceRows:s.source_candidate_rows,sourceResponseRows:s.source_response_rows,excludedSourceRows:s.excluded_source_rows,duplicateSelectedRows:s.duplicate_selected_rows,quarantinedRows:s.quarantined_candidate_rows,
    percentOfAcceptedCohort:n?100:null,denominator:'accepted center/preschool candidate rows in this retained Iowa publisher cohort; not Iowa address-state coverage, unique active businesses or all U.S. businesses',
    distinctReportedZIP5Values:s.by_reported_zip.filter(r=>r.zip5!==null).length,rowsWithZIP5:q.with_zip5,rowsWithZIP4:q.with_zip4,rowsWithSourcePoints:q.with_points,quality:q,qualityScope:'entire-retained-publisher-cohort-not-address-state-filtered',
    appReceiptSha256:s.provenance.app_receipt_sha256,appRunId:s.provenance.app_run_id,industryRunId:s.provenance.industry_run_id,normalizedManifestSha256:s.provenance.normalized_manifest_sha256,acquiredManifestSha256:s.provenance.acquired_manifest_sha256,
    observedAt:s.provenance.observed_at,sourceUpdatedAt:null,processedAt:s.provenance.processed_at,enrollmentSha256:enrollment.enrollmentSha256,
    nationalReportingIntegrated:false,nationalIndustryPercent:null,uniqueActiveBusinessCount:null,currentUspsAssignmentVerified:false,boundaryAssignmentVerified:false,physicalSiteVerified:false,currentOperationsVerified:false,geocodeAccuracyVerified:false};
}
