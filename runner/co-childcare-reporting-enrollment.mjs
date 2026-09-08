import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {summarizeCoChildcareAppJob} from './co-childcare-reporting.mjs';
const check=value=>{if(!value)throw Error('Colorado reporting enrollment rejected.');};

export async function loadCoChildcareReportingEnrollment(options={}) {
  check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(k=>['root','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
  const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));
  signal?.throwIfAborted();const config=path.join(root,'config/co-childcare-reporting-enrollment.json'),meter={};let binding;
  try{binding=await readJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='co-childcare-reporting-enrollment@1.0.0'&&/^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)
    &&typeof binding.app_receipt_path==='string'&&binding.app_receipt_path.startsWith('data/')&&binding.app_receipt_path.split('/').every(part=>part&&!['.','..'].includes(part)&&!part.includes('\\')));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(root,receipt);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  try{await lstat(receipt);}catch(error){if(error.code==='ENOENT'){const finalMeter={};await readJson(config,10000,signal,finalMeter);check(meter.sha256===finalMeter.sha256);signal?.throwIfAborted();return {status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};}throw error;}
  const receiptMeter={};await readJson(receipt,100000,signal,receiptMeter);check(receiptMeter.sha256===binding.app_receipt_sha256);
  const summary=await summarizeCoChildcareAppJob(receipt,{signal});
  check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256&&summary.provenance.execution_mode==='fixed-native-fetch');
  const finalMeter={};await readJson(config,10000,signal,finalMeter);check(meter.sha256===finalMeter.sha256);signal?.throwIfAborted();
  return {status:'available',sourceId:'co-cdec-childcare-centers',publisherJurisdiction:'CO',enrollmentSha256:meter.sha256,summary};
}

export function projectCoChildcareStateEvidence(enrollment,state) {
  if(enrollment.status!=='available')return {status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};
  if(state!=='CO')return {status:'outside-publisher-scope',sourceId:enrollment.sourceId,publisherJurisdiction:'CO'};
  const s=enrollment.summary,entry=s.by_reported_state.find(item=>item.state===state);
  return {status:'verified-retained-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:'CO',reportedAddressState:state,
    evidenceBasis:'publisher-cohort-with-reported-address-state-subset',publisherCohortRows:s.accepted_candidate_rows,reportedAddressStateUnavailableRows:s.by_reported_state.filter(row=>row.state===null).reduce((sum,row)=>sum+row.candidate_rows,0),
    candidateRows:entry?.candidate_rows??0,acceptedCohortRows:s.accepted_candidate_rows,sourceRows:s.source_candidate_rows,quarantinedRows:s.quarantined_candidate_rows,
    percentOfAcceptedCohort:entry?.percent_of_accepted_cohort??(s.accepted_candidate_rows?0:null),
    denominator:'accepted source candidate rows in this retained Colorado cohort; not unique facilities or all U.S. businesses',
    reportedZIP5Count:s.by_reported_zip.filter(row=>row.state===state&&row.zip5!==null).length,
    quality:s.quality,qualityScope:'entire-retained-cohort-not-state-filtered',appReceiptSha256:s.provenance.app_receipt_sha256,appRunId:s.provenance.app_run_id,industryRunId:s.provenance.industry_run_id,
    normalizedManifestSha256:s.provenance.normalized_manifest_sha256,acquiredManifestSha256:s.provenance.acquired_manifest_sha256,
    observedAt:s.provenance.observed_at,sourceUpdatedAt:s.provenance.source_updated_at,enrollmentSha256:enrollment.enrollmentSha256,
    nationalReportingIntegrated:false,nationalIndustryPercent:null,uniqueActiveBusinessCount:null,currentUspsAssignmentVerified:false,boundaryAssignmentVerified:false,physicalSiteVerified:false};
}
