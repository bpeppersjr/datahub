import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
const check=value=>{if(!value)throw Error('Retained childcare snapshot enrollment rejected.');};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

/** Cheap read of a pinned successful app snapshot; the parent verified v2 source projection before success. */
export async function loadRetainedChildcareSnapshotEnrollment(options={}){
  check(options&&Object.getPrototypeOf(options)===Object.prototype&&Reflect.ownKeys(options).every(k=>['root','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value')));
  const {root=APP_ROOT,signal}=options;check(typeof root==='string'&&root===path.resolve(root)&&(signal===undefined||signal instanceof AbortSignal));signal?.throwIfAborted();
  if(root!==APP_ROOT)await canonical(root,{signal});
  const config=path.join(root,'config/retained-childcare-snapshot-enrollment.json'),meter={};let binding;
  try{binding=await readJson(config,10000,signal,meter);}catch(error){if(error.code==='ENOENT')return {status:'not-enrolled'};throw error;}
  check(binding&&Object.keys(binding).length===3&&binding.schema_version==='retained-childcare-snapshot-enrollment@1.0.0'&&uuid(binding.operation_id)&&sha(binding.operation_receipt_sha256));
  const unchanged=async()=>{const final={};await readJson(config,10000,signal,final);check(final.sha256===meter.sha256);signal?.throwIfAborted();};
  const receiptPath=path.join(root,'data/managed-operations',binding.operation_id,'receipt.json'),receiptMeter={};let receipt;
  try{receipt=await readJson(receiptPath,100000,signal,receiptMeter);}catch(error){if(error.code!=='ENOENT')throw error;await unchanged();return {status:'unavailable',reason:'enrolled-operation-not-installed',enrollment_sha256:meter.sha256};}
  check(receiptMeter.sha256===binding.operation_receipt_sha256&&receipt.id===binding.operation_id&&receipt.kind==='cohort-snapshot'&&receipt.status==='SUCCEEDED'&&receipt.error===null);
  const r=receipt.result,d=r?.snapshot;
  check(r&&r.snapshotIntegrityVerified===true&&r.inspectionRequired===false&&r.sourceReplayPerformedThisRead===(receipt.details?.includeRetainedSamples===true)&&r.exportPolicy==='internal');
  check(d&&Object.keys(d).length===5&&uuid(d.run_id)&&sha(d.manifest_sha256)&&d.industry_run_id===receipt.id&&d.execution_mode==='native-root-offline-build'
    &&d.manifest_path===path.join(root,'data/managed-operations',receipt.id,'output/jobs',d.run_id,'manifest.json'));
  check(timestamp(receipt.createdAt)&&timestamp(receipt.startedAt)&&timestamp(receipt.finishedAt)&&receipt.createdAt<=receipt.startedAt&&receipt.startedAt<=receipt.finishedAt);
  const receiptUnchanged=async()=>{const final={};await readJson(receiptPath,100000,signal,final);check(final.sha256===receiptMeter.sha256);await unchanged();};
  try{await lstat(d.manifest_path);}catch(error){if(error.code!=='ENOENT')throw error;await receiptUnchanged();return {status:'unavailable',reason:'enrolled-snapshot-not-installed',enrollment_sha256:meter.sha256};}
  const {readRetainedChildcareCohortSnapshot}=await import('./retained-childcare-cohort-snapshot.mjs');
  // The successful parent receipt pins the independently verified derivative; UI reads rehash it without replaying sources.
  const snapshot=await readRetainedChildcareCohortSnapshot(d.manifest_path,d.manifest_sha256,{signal,verifyRestrictedSources:false}),m=snapshot.manifest;
  check(m.schema_version===(receipt.details?.includeRetainedSamples===true?'retained-childcare-cohort-snapshot@2.0.0':'retained-childcare-cohort-snapshot@1.0.0'));
  check(m.industry_run_id===receipt.id&&m.run_id===d.run_id&&m.execution_mode===d.execution_mode&&m.started_at>=receipt.startedAt&&m.finished_at<=receipt.finishedAt);
  for(const [receiptKey,manifestKey]of [['availableSourceCount','available_source_count'],['unavailableSourceCount','unavailable_source_count'],['notEnrolledSourceCount','not_enrolled_source_count']])check(r[receiptKey]===m[manifestKey]);
  await receiptUnchanged();
  return {status:'available',enrollment_sha256:meter.sha256,operation_id:receipt.id,operation_receipt_sha256:receiptMeter.sha256,operation_finished_at:receipt.finishedAt,
    view:snapshot.view,verification:snapshot.verification,claims:{source_replay_performed_this_read:snapshot.verification.source_replay_performed_this_read,new_operation_submitted:false,national_reporting_integrated:false,national_completeness_percent:null,public_export_authorized:false}};
}
