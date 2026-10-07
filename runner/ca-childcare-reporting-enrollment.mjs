import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {summarizeCaChildcareAppReceipt} from './ca-childcare-reporting.mjs';
const check=value=>{if(!value)throw Error('California reporting enrollment rejected.')};

export async function loadCaChildcareReportingEnrollment(options={}){
  check(options&&typeof options==='object'&&!Array.isArray(options)&&Reflect.ownKeys(options).every(key=>['root','signal'].includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')));
  const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));signal?.throwIfAborted();
  const file=path.join(root,'config/ca-childcare-reporting-enrollment.json'),meter={};let binding;try{binding=await readJson(file,10000,signal,meter)}catch(error){if(error.code==='ENOENT')return{status:'not-enrolled'};throw error}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='ca-childcare-reporting-enrollment@1.0.0'&&/^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)&&typeof binding.app_receipt_path==='string'&&binding.app_receipt_path.startsWith('data/')&&binding.app_receipt_path.split('/').every(part=>part&&!['.','..'].includes(part)&&!part.includes('\\')));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(root,receipt);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));try{await lstat(receipt)}catch(error){if(error.code==='ENOENT')return{status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};throw error}
  const receiptMeter={};await readJson(receipt,100000,signal,receiptMeter);check(receiptMeter.sha256===binding.app_receipt_sha256);const summary=await summarizeCaChildcareAppReceipt(receipt,{signal});check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256&&summary.provenance.execution_mode==='fixed-native-fetch');const final={};await readJson(file,10000,signal,final);check(final.sha256===meter.sha256);
  return{status:'available',sourceId:'ca-cdss-childcare-selected-facilities',publisherJurisdiction:'CA',enrollmentSha256:meter.sha256,summary};
}

export function projectCaChildcareStateEvidence(enrollment,state){
  if(enrollment.status!=='available')return{status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};if(state!=='CA')return{status:'outside-publisher-scope',sourceId:enrollment.sourceId,publisherJurisdiction:'CA'};
  const summary=enrollment.summary,row=summary.by_reported_state.find(item=>item.state===state);return{status:'verified-retained-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:'CA',reportedAddressState:state,candidateRows:row?.candidate_rows??0,acceptedCohortRows:summary.accepted_candidate_rows,sourceRows:summary.source_candidate_rows,quarantinedRows:summary.quarantined_candidate_rows,percentOfAcceptedCohort:row?.percent_of_accepted_cohort??(summary.accepted_candidate_rows?0:null),reportedZIP5Count:summary.by_reported_zip.filter(item=>item.state===state&&item.zip5!==null).length,quality:summary.quality,qualityScope:'entire-retained-cohort-not-state-filtered',appReceiptSha256:summary.provenance.app_receipt_sha256,appRunId:summary.provenance.app_run_id,industryRunId:summary.provenance.industry_run_id,normalizedManifestSha256:summary.provenance.normalized_manifest_sha256,acquiredManifestSha256:summary.provenance.acquired_manifest_sha256,processedAt:summary.provenance.processed_at,enrollmentSha256:enrollment.enrollmentSha256,nationalReportingIntegrated:false,nationalIndustryPercent:null,uniqueActiveBusinessCount:null,currentUspsAssignmentVerified:false,boundaryAssignmentVerified:false,zctaMembershipVerified:false,physicalSiteVerified:false,currentOperationsVerified:false};
}
