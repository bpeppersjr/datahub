import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { summarizeMnConstructionAppJob } from './mn-construction-reporting.mjs';
import { verifyMnConstructionAppJob } from './mn-construction-app.mjs';
import { verifyMnConstructionAcquisitionReceipt } from './mn-construction-acquisition-receipt.mjs';
import { mnSelectionReadJson, mnSelectionReadLines } from './mn-construction-retained-selection.mjs';
import { projectMnConstructionCredential } from './mn-construction-credential-reporting.mjs';

const check=value=>{if(!value)throw Error('Minnesota credential reporting input rejected.');};
export const MN_CREDENTIAL_INPUT_MAXIMUM_BYTES=100_000_000;

/** Offline credential evidence, never a physical-site or identity-matching input. */
export async function loadMnConstructionCredentialReportingInput(receiptPath,options={}) {
  check(options && typeof options==='object' && !Array.isArray(options) && Reflect.ownKeys(options).every(k=>k==='signal'));
  const {signal}=options;check(signal===undefined || signal instanceof AbortSignal);signal?.throwIfAborted();
  const app=await verifyMnConstructionAppJob(receiptPath,{signal});check(app.acquisition!==null);
  const appMeter={},terminal=await mnSelectionReadJson(receiptPath,100000,signal,appMeter);
  check(appMeter.sha256===app.receipt_sha256);
  const parent=await verifyMnConstructionAcquisitionReceipt(path.join(path.dirname(receiptPath),app.acquisition.path),{signal});
  check(parent.receipt_sha256===app.acquisition.sha256 && parent.manifest_sha256===app.acquisition.child_manifest_sha256);
  const filename=parent.receipt.evidence.bundle.manifest_path,manifestMeter={};
  const manifest=await mnSelectionReadJson(filename,100000,signal,manifestMeter);
  check(manifestMeter.sha256===parent.manifest_sha256);
  const artifact=manifest.artifacts.find(a=>a.path==='normalized.jsonl');
  check(artifact && artifact.bytes<=MN_CREDENTIAL_INPUT_MAXIMUM_BYTES && artifact.records>0 && artifact.records<=250000);
  const summary=await summarizeMnConstructionAppJob(receiptPath,{signal});
  check(summary.provenance.app_receipt_sha256===app.receipt_sha256 && summary.provenance.child_manifest_sha256===parent.manifest_sha256);
  const reportingRows=[],identities=new Set(),meter={};
  for await(const record of mnSelectionReadLines(path.join(path.dirname(filename),artifact.path),MN_CREDENTIAL_INPUT_MAXIMUM_BYTES,signal,meter)) {
    if(reportingRows.length%100===0){await yieldLoop();signal?.throwIfAborted();}
    check(record.provenance.source_release_id===parent.source_release_id && record.provenance.observed_at===summary.provenance.observed_at
      && record.provenance.source_file_sha256===summary.provenance.source_file_sha256);
    const row=projectMnConstructionCredential(record);check(!identities.has(row.reporting_id));identities.add(row.reporting_id);reportingRows.push(row);
  }
  check(meter.sha256===artifact.sha256 && meter.bytes===artifact.bytes && meter.records===artifact.records
    && reportingRows.length===parent.counts.accepted_records && reportingRows.length===summary.accepted_credential_rows);
  const after=await verifyMnConstructionAppJob(receiptPath,{signal});
  check(after.receipt_sha256===app.receipt_sha256 && isDeepStrictEqual(after.acquisition,app.acquisition));
  signal?.throwIfAborted();
  return {schema_version:'mn-construction-credential-input@1.0.0',sourceAppFinishedAt:terminal.finished_at,summary,reportingRows,
    semantics:{record_unit:'publisher-business-credential-row',identity_matching_eligible:false,physical_site_eligible:false,
      public_export_authorized:false,national_reporting_integrated:false}};
}
