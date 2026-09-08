import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson } from './mn-construction-retained-selection.mjs';
import { verifyMnConstructionAppJob } from './mn-construction-app.mjs';
import { summarizeMnConstructionAppJob } from './mn-construction-reporting.mjs';
const check=value=>{if(!value)throw Error('Minnesota reporting enrollment rejected.');};

export async function loadMnConstructionReportingEnrollment({root=APP_ROOT,signal}={}) {
  const config=path.join(root,'config/mn-construction-reporting-enrollment.json'),meter={};let binding;
  try{binding=await mnSelectionReadJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding && Object.keys(binding).length===3 && binding.schema_version==='mn-construction-reporting-enrollment@1.0.0'
    && typeof binding.app_receipt_sha256==='string' && /^[a-f0-9]{64}$/.test(binding.app_receipt_sha256)
    && typeof binding.app_receipt_path==='string' && binding.app_receipt_path.startsWith('data/') && !binding.app_receipt_path.includes('\\'));
  const receipt=path.resolve(root,binding.app_receipt_path),relative=path.relative(path.resolve(root),receipt);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  try{await lstat(receipt);}catch(error){if(error.code==='ENOENT')return {status:'unavailable',reason:'enrolled-receipt-not-installed',enrollmentSha256:meter.sha256};throw error;}
  const app=await verifyMnConstructionAppJob(receipt,{signal});
  check(app.status==='SUCCEEDED' && app.cohort==='residential' && app.execution_mode==='fixed-native-fetch' && app.receipt_sha256===binding.app_receipt_sha256);
  const summary=await summarizeMnConstructionAppJob(receipt,{signal});check(summary.provenance.app_receipt_sha256===binding.app_receipt_sha256);
  const finalMeter={};await mnSelectionReadJson(config,10000,signal,finalMeter);check(meter.sha256===finalMeter.sha256);
  return {status:'available',sourceId:'mn-dli-residential-contractors',publisherJurisdiction:'MN',enrollmentSha256:meter.sha256,summary};
}

export function projectMnConstructionStateEvidence(enrollment,state) {
  if(enrollment.status!=='available')return {status:enrollment.status,...(enrollment.reason?{reason:enrollment.reason}:{})};
  const summary=enrollment.summary,entry=summary.by_reported_state.find(item=>item.state===state),count=entry?.credential_rows??0;
  return {status:'verified-retained-cohort',sourceId:enrollment.sourceId,publisherJurisdiction:enrollment.publisherJurisdiction,
    reportedAddressState:state,credentialRows:count,acceptedCohortRows:summary.accepted_credential_rows,
    percentOfAcceptedCohort:entry?.percent_of_this_accepted_cohort??(summary.accepted_credential_rows?0:null),
    denominator:'accepted credential rows in this retained MN residential cohort; not all businesses',
    appReceiptSha256:summary.provenance.app_receipt_sha256,sourceReleaseId:summary.provenance.source_release_id,observedAt:summary.provenance.observed_at,
    enrollmentSha256:enrollment.enrollmentSha256,nationalReportingIntegrated:false,uniqueActiveBusinessCount:null,physicalSiteCount:null,
    currentUspsAssignmentVerified:false,registrationsCohortIncluded:false};
}
