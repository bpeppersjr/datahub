import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';

// Reviewed completed production proof, not a latest-release or acquisition selector.
const RUN='production-mn-credentials-20260910-01';
const RECEIPT=`data/reconciliations/production-runs/${RUN}/receipt.json`;
const RECEIPT_HASH='b4e594d2b74058e6519e0e88ca5272247bd87c29c14312940713ade97ffcc3c5';
const REPORTING='data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json';
const REPORTING_HASH='558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75';
const POINTERS={registry:'data/business-registry/current.json',resolution:'data/business-entity-resolution/current.json',benchmark:'data/business-entity-resolution-benchmark/current.json',coverage:'data/business-coverage-views/current.json'};
const STAGES=['registry-build','registry-verify','resolution-build','resolution-verify','benchmark-build','benchmark-verify','coverage-build','coverage-verify'];
const check=v=>{if(!v)throw Error('Credential publication evidence differs.');};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),keys.split(' ').sort());
const safe=v=>typeof v==='string'&&v.startsWith('data/')&&!v.includes('\\')&&!v.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\u0000-\u001f:]/u.test(v);
const base=(synthetic)=>({schemaVersion:'mn-credential-publication-status@1.0.0',verificationMode:synthetic?'synthetic-test-reader':'retained-metadata-read',included:null,credentialRows:null,recordUnit:'publisher-business-credential-row',historicalSourceNationalReportingIntegrated:false,uniqueBusinessCount:null,activeBusinessCount:null,physicalSiteCount:null,nationalCompletenessPercent:null,geographicAssignmentPerformed:false,publicExportAuthorized:false,exportPolicy:'local-review-only',sourceReplayThisRead:false,stageLogsReplayedThisRead:false,credentialArtifactRehashedThisRead:false});

async function inspect(reader,root,signal,synthetic){
 const common=base(synthetic),seen=new Map();let total=0,phase='enrollment';
 async function read(relative,maximum=4000000){
  signal?.throwIfAborted();check(relative.startsWith('config/')||safe(relative));check(!relative.includes('..')&&!relative.includes('\\'));
  const item=await reader(path.join(root,relative),maximum,signal);check(item&&digest(item.sha256)&&Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=maximum);total+=item.bytes;check(total<=32000000);
  seen.set(relative,{maximum,sha256:item.sha256,bytes:item.bytes});return item;
 }
 try{
  const enrollment=await read('config/credential-coverage-enrollment.json',10000);phase='proof';
  check(exact(enrollment.value,'schema_version manifest_path manifest_sha256')&&enrollment.value.schema_version==='credential-coverage-enrollment@1.0.0'&&enrollment.value.manifest_path===REPORTING&&enrollment.value.manifest_sha256===REPORTING_HASH);
  const proof=await read(RECEIPT,1000000),p=proof.value;check(proof.sha256===RECEIPT_HASH&&p.mode==='production'&&p.runId===RUN&&p.status==='SUCCEEDED'&&p.stopRequested===false&&p.error===null&&iso(p.startedAt)&&iso(p.finishedAt)&&p.finishedAt>=p.startedAt);
  check(Array.isArray(p.stages)&&same(p.stages.map(s=>s.id),STAGES)&&p.stages.every(s=>s.status==='SUCCEEDED'&&s.exitCode===0));
  check(exact(p.outputs,'registry resolution benchmark coverage'));const releases={};
  for(const [key,pointerPath]of Object.entries(POINTERS)){
   const d=p.outputs[key];check(d.id===key&&d.path===pointerPath&&safe(d.manifestPath)&&d.manifestPath.startsWith(path.posix.dirname(pointerPath)+'/releases/')&&path.posix.basename(d.manifestPath)==='manifest.json'&&digest(d.sha256)&&digest(d.manifestSha256));
   const pointer=await read(pointerPath,10000),manifest=await read(d.manifestPath);
   check(pointer.sha256===d.sha256&&manifest.sha256===d.manifestSha256&&pointer.value.dataset_id===d.datasetId&&pointer.value.release_id===d.releaseId&&path.posix.join(path.posix.dirname(pointerPath),pointer.value.manifest)===d.manifestPath);
   check(manifest.value.dataset_id===d.datasetId&&manifest.value.release_id===d.releaseId);releases[key]={...manifest,path:d.manifestPath};
  }
  const registry=releases.registry.value,coverage=releases.coverage.value,decl=registry.mn_construction_credential_reporting;
  check(registry.dataset_id==='national-business-registry'&&coverage.dataset_id==='national-business-coverage-views'&&registry.publisher?.version==='2.15.0'&&coverage.publisher?.version==='2.11.0'&&decl?.schema_version==='mn-credential-registry-input@1.0.0');
  check(decl.record_unit===common.recordUnit&&decl.export_policy==='local-review-only'&&decl.public_export_authorized===false&&decl.historical_row_claims_preserved===true&&decl.identity_matching_eligible===false&&decl.physical_site_eligible===false&&decl.geographic_assignment_performed===false&&decl.current_operations_verified===false&&decl.unique_business_count===null&&decl.active_business_count===null&&decl.national_completeness_percent===null);
  const selection=await read('config/mn-credential-registry-selection.json',10000);
  check(exact(selection.value,'schema_version manifest_path manifest_sha256')&&selection.value.schema_version===decl.schema_version&&selection.value.manifest_path===REPORTING&&selection.value.manifest_sha256===REPORTING_HASH&&decl.selection.path==='config/mn-credential-registry-selection.json'&&decl.selection.sha256===selection.sha256);
  const reporting=await read(REPORTING),m=reporting.value,source=decl.source;
  check(reporting.sha256===REPORTING_HASH&&source.manifest_path===REPORTING&&source.manifest_sha256===reporting.sha256&&source.release_id===m.release_id&&source.created_at===m.created_at&&source.source_app_receipt===m.source_app_receipt&&source.dataset_id==='mn-construction-credential-reporting');
  const dep=registry.dependencies.filter(d=>d.dataset_id===source.dataset_id);check(dep.length===1&&dep[0].release_id===m.release_id&&dep[0].manifest_sha256===REPORTING_HASH);
  const a=registry.artifacts.filter(a=>a.artifact_type==='mn-construction-credential-reporting-jsonl');check(a.length===1&&a[0].path==='reporting/mn-construction/credentials.jsonl'&&a[0].record_count===11456&&a[0].export_policy==='local-review-only');
  check(m.artifacts.length===1&&m.artifacts[0].path==='credentials.jsonl'&&m.artifacts[0].artifact_type==='credential-reporting-jsonl'&&m.artifacts[0].records===11456&&m.artifacts[0].export_policy==='local-review-only'&&m.artifacts[0].bytes===a[0].bytes&&m.artifacts[0].sha256===a[0].sha256&&source.artifact_sha256===a[0].sha256&&source.artifact_path===path.posix.join(path.posix.dirname(REPORTING),'credentials.jsonl'));
  check(registry.coverage.mn_construction_credential_rows===11456&&decl.summary.allAcceptedCohortRows===11456&&m.summary.accepted_credential_rows===11456&&m.summary.cohort==='residential'&&m.summary.app_status==='SUCCEEDED');
  check(m.semantics.record_unit===common.recordUnit&&m.semantics.national_reporting_integrated===false&&m.semantics.public_export_authorized===false&&m.semantics.physical_site_eligible===false&&m.semantics.identity_matching_eligible===false);
  const appBinding=await read('config/mn-construction-reporting-enrollment.json',10000);
  check(exact(appBinding.value,'schema_version app_receipt_path app_receipt_sha256')&&appBinding.value.schema_version==='mn-construction-reporting-enrollment@1.0.0'&&appBinding.value.app_receipt_path===m.source_app_receipt&&appBinding.value.app_receipt_sha256===m.summary.provenance.app_receipt_sha256&&safe(m.source_app_receipt));
  const app=await read(m.source_app_receipt,1000000);check(app.sha256===appBinding.value.app_receipt_sha256&&app.value.status==='SUCCEEDED'&&app.value.cohort==='residential'&&app.value.execution_mode==='fixed-native-fetch');
  const cd=coverage.mn_construction_credential_reporting,registryDeps=coverage.dependencies.filter(d=>d.dataset_id==='national-business-registry');
  check(cd?.schema_version===decl.schema_version&&cd.selected_cohort_rows===11456&&cd.export_policy==='local-review-only'&&cd.geographic_assignment_performed===false&&cd.identity_matching_applied===false&&cd.public_export_authorized===false&&cd.registry_manifest_path===releases.registry.path&&registryDeps.length===1&&registryDeps[0].release_id===registry.release_id&&registryDeps[0].manifest_sha256===releases.registry.sha256);
  const observed=m.summary.provenance.observed_at;check(iso(observed)&&iso(m.created_at)&&iso(registry.created_at)&&iso(coverage.created_at)&&observed<=m.created_at&&m.created_at<=registry.created_at&&registry.created_at<=coverage.created_at&&coverage.created_at<=p.finishedAt);
  // Re-read the same bounded graph. No stage logs, row artifacts or huge views are opened.
  for(const [relative,prior]of seen){signal?.throwIfAborted();const next=await reader(path.join(root,relative),prior.maximum,signal);total+=next.bytes;check(total<=32000000&&next.sha256===prior.sha256&&next.bytes===prior.bytes);}
  return {...common,status:synthetic?'synthetic-fixture-matched':'verified-downstream-publication',included:synthetic?null:true,credentialRows:11456,
   sourceObservedAt:observed,sourceReleaseId:m.summary.provenance.source_release_id,reportingReleaseId:m.release_id,reportingManifestSha256:reporting.sha256,
   productionRunId:RUN,productionReceiptSha256:RECEIPT_HASH,productionFinishedAt:p.finishedAt,
   registryReleaseId:registry.release_id,registryManifestSha256:releases.registry.sha256,coverageReleaseId:coverage.release_id,coverageManifestSha256:releases.coverage.sha256,
   evidenceFilesChecked:seen.size,evidenceBytesRead:total};
 }catch(error){signal?.throwIfAborted();return {...common,status:error?.code==='ENOENT'?(phase==='enrollment'?'not-enrolled':'evidence-unavailable'):'evidence-unverified'};}
}
function options(value){check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).every(k=>['root','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')));check(value.signal===undefined||value.signal instanceof AbortSignal);const root=value.root??APP_ROOT;check(typeof root==='string'&&root===path.resolve(root));return {root,signal:value.signal};}
export async function loadMnCredentialPublicationStatus(value={}){
 const {root,signal}=options(value);if(root!==APP_ROOT)await canonical(root);signal?.throwIfAborted();
 return inspect(async(file,maximum,s)=>{const meter={};const parsed=await readJson(file,maximum,s,meter);return {value:parsed,bytes:meter.bytes,sha256:meter.sha256};},root,signal,false);
}
// Synthetic graph testing cannot produce included:true/native verification evidence.
export async function loadMnCredentialPublicationStatusWithTestReader(reader,value={}){check(typeof reader==='function');const {root,signal}=options(value);return inspect(reader,root,signal,true);}
