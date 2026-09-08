import path from 'node:path';
import { verifyMnConstructionAppJob } from './mn-construction-app.mjs';
import { verifyMnConstructionAcquisitionReceipt } from './mn-construction-acquisition-receipt.mjs';
import { mnSelectionReadJson, mnSelectionReadLines } from './mn-construction-retained-selection.mjs';

const states=new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI AA AE AP'.split(' '));
const check=(value)=>{if(!value)throw Error('Minnesota reporting evidence rejected.');};
const bump=(map,key)=>map.set(key,(map.get(key)??0)+1);
const sorted=map=>[...map].sort(([a],[b])=>a.localeCompare(b,'en'));

/** Aggregate credential rows, never infer businesses/sites or USPS membership. */
export async function aggregateMnConstructionReporting(records,{signal}={}) {
  let total=0,zipMissing=0,zip4Present=0;const stateCounts=new Map(),zipCounts=new Map(),credentialCounts=new Map();
  for await(const row of records){
    signal?.throwIfAborted();check(++total<=250000);
    check(row?.dataset_id==='mn-dli-construction-business-credentials' && row.export_policy==='local-review-only'
      && row.credential?.active_business_verified===false && row.quality?.matching_eligible===false && row.quality?.physical_site_eligible===false);
    const address=row.reported_address, state=states.has(address?.state)?address.state:'UNRESOLVED',zip=address?.zip_code;
    check(zip===null || typeof zip==='string' && /^\d{5}$/.test(zip) && zip!=='00000');
    check(address.zip4===null || zip!==null && typeof address.zip4==='string' && /^\d{4}$/.test(address.zip4));
    check(['construction-contractor-registration','residential-building-contractor','residential-remodeler','residential-roofer','manufactured-home-installer'].includes(row.credential.category));
    bump(stateCounts,state);bump(credentialCounts,row.credential.category);
    if(zip===null)zipMissing++;else bump(zipCounts,`${state}:${zip}`);if(address.zip4!==null)zip4Present++;
  }
  return {accepted_credential_rows:total,rows_without_reported_zip5:zipMissing,rows_with_zip4:zip4Present,
    by_reported_state:sorted(stateCounts).map(([state,count])=>({state,credential_rows:count,percent_of_this_accepted_cohort:total?count/total*100:null})),
    by_reported_zip5:sorted(zipCounts).map(([key,count])=>({state:key.split(':')[0],zip5:key.split(':')[1],credential_rows:count})),
    by_credential_category:sorted(credentialCounts).map(([category,count])=>({category,credential_rows:count}))};
}

/** Offline-only input: the original completed app acquisition, not a new pull. */
export async function summarizeMnConstructionAppJob(receiptPath,{signal}={}) {
  const app=await verifyMnConstructionAppJob(receiptPath,{signal});check(app.acquisition!==null);
  const parent=await verifyMnConstructionAcquisitionReceipt(path.join(path.dirname(receiptPath),app.acquisition.path),{signal});
  check(parent.receipt_sha256===app.acquisition.sha256 && parent.manifest_sha256===app.acquisition.child_manifest_sha256);
  const manifestPath=parent.receipt.evidence.bundle.manifest_path;
  const manifestMeter={},manifest=await mnSelectionReadJson(manifestPath,100000,signal,manifestMeter);check(manifestMeter.sha256===parent.manifest_sha256);
  const artifact=manifest.artifacts.find(a=>a.path==='normalized.jsonl');check(artifact);
  const meter={};const aggregates=await aggregateMnConstructionReporting(mnSelectionReadLines(path.join(path.dirname(manifestPath),artifact.path),1000000000,signal,meter),{signal});
  check(meter.sha256===artifact.sha256 && meter.bytes===artifact.bytes && meter.records===artifact.records
    && aggregates.accepted_credential_rows===parent.counts.accepted_records);
  const after=await verifyMnConstructionAppJob(receiptPath,{signal});check(after.receipt_sha256===app.receipt_sha256 && JSON.stringify(after.acquisition)===JSON.stringify(app.acquisition));
  return {schema_version:'mn-construction-reporting-summary@1.0.0',cohort:app.cohort,app_status:app.status,
    provenance:{app_receipt_path:receiptPath,app_receipt_sha256:app.receipt_sha256,acquisition_receipt_sha256:parent.receipt_sha256,
      child_manifest_sha256:parent.manifest_sha256,normalized_sha256:artifact.sha256,source_release_id:parent.source_release_id,
      source_file_sha256:parent.receipt.evidence.transport.source_file_sha256,observed_at:parent.receipt.evidence.transport.started_at},
    source_row_dispositions:parent.counts,...aggregates,
    semantics:{record_unit:'publisher-business-credential-row',percentage_denominator:'accepted rows in this source cohort only, not all US businesses',
      address_basis:'publisher-reported address, not verified physical location',zip5_basis:'format-validated reported value, not verified current USPS assignment',
      unique_business_count:null,active_business_count:null,national_completeness_percent:null,public_export_authorized:false,national_reporting_integrated:false}};
}
