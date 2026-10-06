import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {loadMnCredentialRegistryInput} from './mn-credential-registry-input.mjs';
import {validateMnConstructionCredentialReporting} from './mn-construction-credential-reporting.mjs';

export const VERSION='mn-construction-exact-zip-evidence@1.0.0';
const REGISTRATION='config/datasets/mn-construction-exact-zip-evidence.json';
const SHA=/^[a-f0-9]{64}$/;
const check=v=>{if(!v)throw Error('Minnesota construction exact-ZIP admission rejected.');};
const hash=b=>createHash('sha256').update(b).digest('hex');
const local=v=>typeof v==='string'&&!path.isAbsolute(v)&&!v.includes('\\')&&(v.startsWith('config/')||v.startsWith('data/'))&&!v.split('/').some(x=>!x||x==='.'||x==='..');
const CLAIMS={unique_business_count:null,physical_site_count:null,current_operations_verified:false,all_business_completeness_percent:null,geographic_assignment_performed:false,geocode_created:false,zip4_aggregated:false,network_requests:0,acquisition_performed:false,current_pointer_written:false};

async function jsonPinned(root,relative,expected,max){check(local(relative));const bytes=await readFile(path.join(root,relative));check(bytes.length<=max&&hash(bytes)===expected);return JSON.parse(bytes);}

export function projectMnConstructionExactZipEvidence(records,{source,dimension_id='mn_residential_construction_credential_reported_address_rows',measure='publisher_business_credential_rows',source_reference_at}={}){
  check(Array.isArray(records)&&records.length<=250000&&source&&SHA.test(source.manifest_sha256)&&SHA.test(source.artifact_sha256)&&typeof source.release_id==='string'&&Number.isFinite(Date.parse(source_reference_at)));
  const counts=new Map(),categories=new Map(),ids=new Set();let missing=0,zip4Rows=0;
  for(const row of records){validateMnConstructionCredentialReporting(row);check(!ids.has(row.reporting_id));ids.add(row.reporting_id);
    const a=row.record.reported_address,q=row.record.quality,c=row.record.credential.category;
    check(row.claims.current_operations_verified!==true&&row.claims.physical_site_eligible===false&&q.physical_site_eligible===false&&q.matching_eligible===false&&row.record.geocode.latitude===null&&row.record.geocode.longitude===null&&row.record.export_policy==='local-review-only');
    if(a.zip4!==null)zip4Rows++;if(a.zip_code===null){missing++;continue}check(/^\d{5}$/.test(a.zip_code)&&a.postal_code===a.zip_code);counts.set(a.zip_code,(counts.get(a.zip_code)??0)+1);if(!categories.has(a.zip_code))categories.set(a.zip_code,new Map());categories.get(a.zip_code).set(c,(categories.get(a.zip_code).get(c)??0)+1);
  }
  const rows=[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([zip5,count])=>({schema_version:VERSION,dimension_id,zip5,zip4:null,status:'positive',count,measure,category_counts:Object.fromEntries([...categories.get(zip5)].sort(([a],[b])=>a.localeCompare(b))),temporal_status:{status:'publisher-issued-at-observation-current-operation-unverified',source_reference_at},provenance:{...source},claims:{...CLAIMS,record_unit:'publisher-business-credential-row',address_role:'publisher-reported-role-unresolved',usps_validity:null,nonadditive:true,public_export_authorized:false}}));
  return{rows,summary:{source_credential_rows:records.length,zip5_credential_rows:records.length-missing,missing_reported_zip5_rows:missing,reported_zip4_rows:zip4Rows,positive_zip5_rows:rows.length,projected_credential_rows:rows.reduce((n,r)=>n+r.count,0)},claims:{...CLAIMS,record_unit:'publisher-business-credential-row',nonadditive:true,public_export_authorized:false,production_enrollment:false,matrix_admission_performed:false}};
}

export async function verifyMnConstructionExactZipAdmission({root=APP_ROOT,signal}={}){
  root=path.resolve(root);signal?.throwIfAborted();const registrationBytes=await readFile(path.join(root,REGISTRATION)),registration=JSON.parse(registrationBytes);
  check(registration.schema_version==='mn-construction-exact-zip-evidence-registration@1.0.0'&&registration.dataset_id==='mn-construction-exact-zip-evidence'&&registration.status==='registered-local-review-only-projection'&&registration.production_enrollment===false&&registration.matrix_admission_performed===false&&same(registration.claims,CLAIMS)&&SHA.test(registration.selection_sha256)&&SHA.test(registration.policy_sha256));
  const policy=await jsonPinned(root,registration.policy_path,registration.policy_sha256,100000);check(policy.policy_id==='mn-construction-internal-acquisition'&&policy.field_export_policy?.normalized_records==='local-review-only'&&policy.redistribution.includes('not authorized')&&policy.prohibited_use.includes('inferring physical sites, geocodes, ZIP assignments, closure, parent company, ownership, NAICS or unique business identity without evidence'));
  await jsonPinned(root,registration.selection_path,registration.selection_sha256,10000);const input=await loadMnCredentialRegistryInput(path.join(root,registration.selection_path),{signal});
  check(input.source.release_id===registration.source_release_id&&input.source.manifest_sha256===registration.source_manifest_sha256&&input.source.artifact_sha256===registration.source_artifact_sha256);
  const projection=projectMnConstructionExactZipEvidence(input.records,{source:{dataset_id:input.source.dataset_id,release_id:input.source.release_id,manifest_sha256:input.source.manifest_sha256,artifact_sha256:input.source.artifact_sha256,selection_sha256:input.selection.sha256},dimension_id:registration.dimension_id,measure:registration.measure,source_reference_at:registration.source_reference_at});
  check(projection.summary.source_credential_rows===11456&&projection.summary.zip5_credential_rows===11455&&projection.summary.missing_reported_zip5_rows===1&&projection.summary.reported_zip4_rows===0&&projection.summary.projected_credential_rows===11455&&projection.summary.positive_zip5_rows===961);
  signal?.throwIfAborted();return{schema_version:VERSION,status:'admission-ready-local-review-only',registration_sha256:hash(registrationBytes),dimension_id:registration.dimension_id,source:input.source,summary:projection.summary,claims:projection.claims,rows:projection.rows};
}

export async function readMnConstructionExactZipEvidenceStatus({root=APP_ROOT,signal}={}){
  const verified=await verifyMnConstructionExactZipAdmission({root,signal});
  signal?.throwIfAborted();
  return{
    schema_version:'mn-construction-exact-zip-evidence-status@1.0.0',
    available:true,
    dimension_id:verified.dimension_id,
    source_reference_at:'2026-09-08T13:11:41.678Z',
    source:{dataset_id:verified.source.dataset_id,release_id:verified.source.release_id,manifest_sha256:verified.source.manifest_sha256,artifact_sha256:verified.source.artifact_sha256},
    registration_sha256:verified.registration_sha256,
    summary:{...verified.summary},
    claims:{...verified.claims},
    verification_scope:'Full retained credential replay; exact ZIP5 projection only. No matrix admission was performed.'
  };
}
