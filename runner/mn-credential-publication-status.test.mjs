import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {loadMnCredentialPublicationStatus,loadMnCredentialPublicationStatusWithTestReader as inspect} from './mn-credential-publication-status.mjs';
const HASH='b4e594d2b74058e6519e0e88ca5272247bd87c29c14312940713ade97ffcc3c5',REPORT_HASH='558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75';
const RUN='production-mn-credentials-20260910-01',REPORT='data/credential-reporting/mn-construction/30cd9c0e-0a8d-467c-b416-150453e1513f/manifest.json',PROOF=`data/reconciliations/production-runs/${RUN}/receipt.json`;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
// Deliberately fabricated graph and reader attestations, never native publication evidence.
function fixture(){
 const graph=new Map(),add=(p,value,sha256=hash(value))=>{graph.set(p,{value,bytes:Buffer.byteLength(JSON.stringify(value)),sha256});return graph.get(p);};
 const observed='2026-09-08T13:11:41.678Z',created='2026-09-08T15:34:19.571Z',stamp='2026-09-11T03:00:00.000Z',version='mn-credential-registry-input@1.0.0';
 const app=add('data/app/receipt.json',{status:'SUCCEEDED',cohort:'residential',execution_mode:'fixed-native-fetch'});
 add('config/mn-construction-reporting-enrollment.json',{schema_version:'mn-construction-reporting-enrollment@1.0.0',app_receipt_path:'data/app/receipt.json',app_receipt_sha256:app.sha256});
 add('config/credential-coverage-enrollment.json',{schema_version:'credential-coverage-enrollment@1.0.0',manifest_path:REPORT,manifest_sha256:REPORT_HASH});
 const selected=add('config/mn-credential-registry-selection.json',{schema_version:version,manifest_path:REPORT,manifest_sha256:REPORT_HASH});
 const reporting={release_id:'30cd9c0e-0a8d-467c-b416-150453e1513f',created_at:created,source_app_receipt:'data/app/receipt.json',summary:{accepted_credential_rows:11456,cohort:'residential',app_status:'SUCCEEDED',provenance:{app_receipt_sha256:app.sha256,observed_at:observed,source_release_id:'fixture-source'}},semantics:{record_unit:'publisher-business-credential-row',national_reporting_integrated:false,public_export_authorized:false,physical_site_eligible:false,identity_matching_eligible:false},artifacts:[{path:'credentials.jsonl',artifact_type:'credential-reporting-jsonl',records:11456,bytes:30283070,sha256:'a'.repeat(64),export_policy:'local-review-only'}]};add(REPORT,reporting,REPORT_HASH);
 const declaration={schema_version:version,record_unit:'publisher-business-credential-row',export_policy:'local-review-only',public_export_authorized:false,historical_row_claims_preserved:true,identity_matching_eligible:false,physical_site_eligible:false,geographic_assignment_performed:false,current_operations_verified:false,unique_business_count:null,active_business_count:null,national_completeness_percent:null,selection:{path:'config/mn-credential-registry-selection.json',sha256:selected.sha256},summary:{allAcceptedCohortRows:11456},source:{dataset_id:'mn-construction-credential-reporting',release_id:reporting.release_id,created_at:created,manifest_path:REPORT,manifest_sha256:REPORT_HASH,artifact_sha256:'a'.repeat(64),artifact_path:REPORT.replace('manifest.json','credentials.jsonl'),source_app_receipt:'data/app/receipt.json'}};
 const paths={registry:'data/business-registry',resolution:'data/business-entity-resolution',benchmark:'data/business-entity-resolution-benchmark',coverage:'data/business-coverage-views'},outputs={};
 for(const [id,base]of Object.entries(paths)){
  const dataset_id={registry:'national-business-registry',coverage:'national-business-coverage-views'}[id]??id,release_id='fixture-'+id;
  const manifest={dataset_id,release_id,created_at:stamp,publisher:{version:id==='registry'?'2.15.0':'2.11.0'}};
  if(id==='registry')Object.assign(manifest,{mn_construction_credential_reporting:declaration,coverage:{mn_construction_credential_rows:11456},dependencies:[{dataset_id:'mn-construction-credential-reporting',release_id:reporting.release_id,manifest_sha256:REPORT_HASH}],artifacts:[{...reporting.artifacts[0],path:'reporting/mn-construction/credentials.jsonl',artifact_type:'mn-construction-credential-reporting-jsonl',record_count:11456}]});
  if(id==='coverage')Object.assign(manifest,{mn_construction_credential_reporting:{schema_version:version,selected_cohort_rows:11456,export_policy:'local-review-only',geographic_assignment_performed:false,identity_matching_applied:false,public_export_authorized:false,registry_manifest_path:outputs.registry.manifestPath},dependencies:[{dataset_id:'national-business-registry',release_id:'fixture-registry',manifest_sha256:outputs.registry.manifestSha256}]});
  const manifestPath=`${base}/releases/${release_id}/manifest.json`,m=add(manifestPath,manifest),pointer=add(`${base}/current.json`,{dataset_id,release_id,manifest:`releases/${release_id}/manifest.json`});
  outputs[id]={id,path:`${base}/current.json`,sha256:pointer.sha256,manifestPath,manifestSha256:m.sha256,datasetId:dataset_id,releaseId:release_id};
 }
 add(PROOF,{mode:'production',runId:RUN,status:'SUCCEEDED',stopRequested:false,error:null,startedAt:stamp,finishedAt:stamp,outputs,stages:['registry-build','registry-verify','resolution-build','resolution-verify','benchmark-build','benchmark-verify','coverage-build','coverage-verify'].map(id=>({id,status:'SUCCEEDED',exitCode:0}))},HASH);
 const visits=new Map();return {graph,outputs,visits,reader:async(file,maximum)=>{const relative=path.relative(APP_ROOT,file).replaceAll('\\','/');assert.ok(!relative.endsWith('credentials.jsonl'));assert.ok(!relative.endsWith('.log'));assert.ok(maximum<=4000000);visits.set(relative,(visits.get(relative)??0)+1);const value=graph.get(relative);if(!value)throw Object.assign(Error('SYNTHETIC_PRIVATE_PATH'),{code:'ENOENT'});return structuredClone(value);}};
}
test('bounded graph verifies typed publication separately and synthetic reader never claims native inclusion',async()=>{
 const f=fixture(),result=await inspect(f.reader);assert.equal(result.status,'synthetic-fixture-matched');assert.equal(result.included,null);assert.equal(result.verificationMode,'synthetic-test-reader');assert.equal(result.credentialRows,11456);assert.equal(result.historicalSourceNationalReportingIntegrated,false);assert.equal(result.sourceObservedAt,'2026-09-08T13:11:41.678Z');assert.equal(result.exportPolicy,'local-review-only');assert.equal(result.uniqueBusinessCount,null);assert.equal(result.sourceReplayThisRead,false);assert.equal(result.credentialArtifactRehashedThisRead,false);assert.equal(result.evidenceFilesChecked,14);assert.equal(f.visits.size,14);assert.ok([...f.visits.values()].every(n=>n===2));
 assert.doesNotMatch(JSON.stringify(result),/app\/receipt|SYNTHETIC_PRIVATE|business_name/);
});
test('missing enrollment versus missing proof versus changed proof never becomes absent publication',async()=>{
 for(const [file,status]of [['config/credential-coverage-enrollment.json','not-enrolled'],[PROOF,'evidence-unavailable']]){const f=fixture();f.graph.delete(file);const r=await inspect(f.reader);assert.equal(r.status,status);assert.equal(r.included,null);assert.equal(r.credentialRows,null);}
 const f=fixture();f.graph.get(PROOF).sha256='0'.repeat(64);assert.equal((await inspect(f.reader)).status,'evidence-unverified');
});
test('rehashed semantic drift and current pointer changes fail closed',async()=>{
 const changes=[f=>{f.graph.get(PROOF).value.status='RUNNING';},f=>{f.graph.get(PROOF).value.stages[0].exitCode=1;},f=>{f.graph.get('data/business-registry/current.json').sha256='0'.repeat(64);},f=>{f.graph.get(f.outputs.registry.manifestPath).value.mn_construction_credential_reporting.summary.allAcceptedCohortRows=1;},f=>{f.graph.get(REPORT).value.semantics.national_reporting_integrated=true;},f=>{f.graph.get(REPORT).value.semantics.public_export_authorized=true;},f=>{f.graph.get('config/credential-coverage-enrollment.json').value.manifest_path='data/future/manifest.json';},f=>{f.graph.get(f.outputs.coverage.manifestPath).value.mn_construction_credential_reporting.registry_manifest_path='data/wrong/manifest.json';},f=>{f.graph.get(REPORT).value.summary.provenance.observed_at='2030-01-01T00:00:00.000Z';}];
 for(const change of changes){const f=fixture();change(f);const r=await inspect(f.reader);assert.equal(r.status,'evidence-unverified');assert.equal(r.included,null);assert.equal(r.credentialRows,null);}
});
test('second read detects graph drift; bounds and cancellation remain cooperative',async()=>{
 let f=fixture();const changing=async(...args)=>{const v=await f.reader(...args);if(f.visits.get('config/credential-coverage-enrollment.json')===2)v.sha256='0'.repeat(64);return v;};assert.equal((await inspect(changing)).status,'evidence-unverified');
 f=fixture();assert.equal((await inspect(async(...args)=>({...await f.reader(...args),bytes:4000001}))).status,'evidence-unverified');
 const controller=new AbortController();f=fixture();await assert.rejects(inspect(async(...args)=>{const value=await f.reader(...args);controller.abort();return value;},{signal:controller.signal}),{name:'AbortError'});
});
test('invalid reader options cannot escape the app root or invoke accessors',async()=>{
 await assert.rejects(loadMnCredentialPublicationStatus({root:path.dirname(APP_ROOT)}));
 const options=Object.defineProperty({},'root',{get(){assert.fail('getter forbidden');},enumerable:true});await assert.rejects(loadMnCredentialPublicationStatus(options));
});
test('optional real small chain returns verified publication without row or stage replay',{skip:!process.env.MN_PUBLICATION_REAL_ROOT},async()=>{
 const source=`import {loadMnCredentialPublicationStatus} from ${JSON.stringify(import.meta.url.replace('mn-credential-publication-status.test.mjs','mn-credential-publication-status.mjs'))};console.log(JSON.stringify(await loadMnCredentialPublicationStatus()));`;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{env:{...process.env,DATAHUB_ROOT:process.env.MN_PUBLICATION_REAL_ROOT},windowsHide:true,timeout:10000});const r=JSON.parse(result.stdout);assert.equal(r.status,'verified-downstream-publication');assert.equal(r.included,true);assert.equal(r.credentialRows,11456);assert.equal(r.evidenceFilesChecked,14);assert.equal(r.sourceReplayThisRead,false);assert.equal(r.credentialArtifactRehashedThisRead,false);assert.equal(r.historicalSourceNationalReportingIntegrated,false);
});
