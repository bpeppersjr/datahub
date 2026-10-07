import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {verifyMnConstructionExactZipAdmission} from './mn-construction-exact-zip-evidence.mjs';
import {verifyCmsNppesPharmacyNonprimaryExactZipAdmission} from './cms-nppes-pharmacy-nonprimary-exact-zip-evidence.mjs';
import {verifyCensusZbpAllIndustryExactZipEvidence} from './census-zbp-all-industry-exact-zip-evidence.mjs';
import {verifyCmsRetainedDirectoryZipEvidence} from './cms-retained-directory-zip-evidence.mjs';

const REGISTRATION='config/datasets/adjacent-exact-zip-evidence-catalog-registration.json',SHA=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('Adjacent exact-ZIP evidence catalog rejected.');},check=value=>{if(!value)fail();};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...expected].sort());
const local=value=>typeof value==='string'&&!path.isAbsolute(value)&&!value.includes('\\')&&value.startsWith('config/')&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const CATALOG_CLAIMS={business_count:false,physical_site_count:false,all_business_completeness:false,geocoding_performed:false,current_operations_verified:false,matrix_admission_performed:false,additive_across_entries:false,network_requests:0,production_enrollment:false};
const ENTRY_CLAIMS={business_count:false,physical_site_count:false,all_business_completeness:false,geocoding_performed:false,current_operations_verified:false,matrix_admission_performed:false,nonadditive:true,public_export_authorized:false,production_enrollment:false};
const registrationKeys=['schema_version','dataset_id','catalog_path','catalog_sha256','status','production_enrollment','mutable_pointer'];
const catalogKeys=['schema_version','dataset_id','status','entries','claims'];
const entryKeys=['id','label','jurisdiction','verifier_id','registration_path','registration_sha256','dimension_id','record_unit','export_policy','temporal_status','source_reference_at','expected_counts'];
const countKeys=['source_rows','zip5_bearing_rows','missing_zip5_rows','zip4_rows','positive_zip5_keys','projected_rows'];

async function cmsDirectoryBase(options){
  const registrationPath='config/datasets/cms-retained-directory-zip-evidence.json';
  const registrationBytes=await readFile(path.join(options.root,registrationPath));
  const registration=JSON.parse(registrationBytes);
  const retained=registration.retained_release;
  const verified=await verifyCmsRetainedDirectoryZipEvidence(path.join(options.root,retained.manifest),{signal:options.signal});
  const positiveZip5Keys={hospital:0,nursing_home:0};
  const manifest=JSON.parse(await readFile(path.join(options.root,retained.manifest)));
  for(const artifact of manifest.artifacts){
    options.signal?.throwIfAborted();
    const bytes=await readFile(path.join(options.root,path.posix.dirname(retained.manifest),artifact.path));
    check(bytes.length===artifact.bytes&&hash(bytes)===artifact.sha256);
    for(const row of JSON.parse(bytes))for(const cohort of Object.keys(positiveZip5Keys))if(row[cohort].directory_rows>0)positiveZip5Keys[cohort]++;
  }
  return{registrationBytes,retained,verified,positiveZip5Keys};
}
async function cmsDirectoryAdapter(options,kind){
  const key='cms-retained-directory-zip-evidence';
  let base=options.verificationCache.get(key);
  if(!base){base=cmsDirectoryBase(options);options.verificationCache.set(key,base);}
  const {registrationBytes,retained,verified,positiveZip5Keys}=await base;
  const source=retained.bindings.sources[kind],summary=verified.summary[kind];
  return{verified:{...verified,registration_sha256:hash(registrationBytes),dimension_id:kind==='hospital'?'cms_hospital_directory':'cms_nursing_home_directory'},counts:{source_rows:summary.directory_rows,zip5_bearing_rows:summary.zip_present_rows,missing_zip5_rows:summary.missing_zip_rows,zip4_rows:0,positive_zip5_keys:positiveZip5Keys[kind],projected_rows:summary.zip_present_rows},provenance:{source_dataset_id:kind==='hospital'?'cms-hospital-general-information':'cms-nursing-home-provider-information',source_release_id:source.release_id,source_manifest_sha256:source.manifest_sha256,source_evidence_sha256:source.selected_artifact.sha256},claimChecks:{record_unit:'publisher-directory-row',current_operations_verified:false,geocode_created:false,matrix_admission_performed:false,nonadditive:true,public_export_authorized:false,production_enrollment:false}};
}

async function pinned(root,relative,expected,max){check(local(relative)&&SHA.test(expected));const bytes=await readFile(path.join(root,relative));check(bytes.length<=max&&hash(bytes)===expected);return{bytes,value:JSON.parse(bytes)};}
const adapters={
  'mn-construction-exact-zip-evidence@1.0.0':async ({verificationCache,...options})=>{void verificationCache;const verified=await verifyMnConstructionExactZipAdmission(options);return{verified,counts:{source_rows:verified.summary.source_credential_rows,zip5_bearing_rows:verified.summary.zip5_credential_rows,missing_zip5_rows:verified.summary.missing_reported_zip5_rows,zip4_rows:verified.summary.reported_zip4_rows,positive_zip5_keys:verified.summary.positive_zip5_rows,projected_rows:verified.summary.projected_credential_rows},provenance:{source_dataset_id:verified.source.dataset_id,source_release_id:verified.source.release_id,source_manifest_sha256:verified.source.manifest_sha256,source_evidence_sha256:verified.source.artifact_sha256},claimChecks:verified.claims};},
  'cms-nppes-pharmacy-nonprimary-exact-zip-evidence@1.0.0':async ({verificationCache,...options})=>{void verificationCache;const verified=await verifyCmsNppesPharmacyNonprimaryExactZipAdmission(options);const first=verified.rows[0];return{verified,counts:{source_rows:verified.summary.source_address_rows,zip5_bearing_rows:verified.summary.zip5_address_rows,missing_zip5_rows:verified.summary.missing_reported_zip5_rows,zip4_rows:verified.summary.reported_zip4_rows,positive_zip5_keys:verified.summary.positive_zip5_rows,projected_rows:verified.summary.projected_address_rows},provenance:{source_dataset_id:first.provenance.dataset_id,source_release_id:first.provenance.release_id,source_manifest_sha256:first.provenance.manifest_sha256,source_evidence_sha256:first.provenance.pointer_sha256},claimChecks:verified.claims};},
  'census-zbp-all-industry-exact-zip-evidence@1.0.0':async ({verificationCache,...options})=>{void verificationCache;const verified=await verifyCensusZbpAllIndustryExactZipEvidence(options);return{verified,counts:{source_rows:verified.counts.union_zip_status_rows,zip5_bearing_rows:verified.counts.union_zip_status_rows,missing_zip5_rows:0,zip4_rows:0,positive_zip5_keys:verified.counts.measured_positive,projected_rows:verified.counts.union_zip_status_rows},provenance:{source_dataset_id:verified.dataset_id,source_release_id:verified.source_release_id,source_manifest_sha256:verified.source_manifest_sha256,source_evidence_sha256:verified.source_evidence_sha256},claimChecks:{...verified.claims,geocode_created:verified.claims.geocoding_performed}};},
  'cms-retained-hospital-directory-zip-evidence@1.0.0':options=>cmsDirectoryAdapter(options,'hospital'),
  'cms-retained-nursing-home-directory-zip-evidence@1.0.0':options=>cmsDirectoryAdapter(options,'nursing_home'),
};
function validateEntry(entry){check(keys(entry,entryKeys)&&/^[a-z0-9][a-z0-9-]{2,80}$/.test(entry.id)&&typeof entry.label==='string'&&entry.label.length<=120&&/^(?:[A-Z]{2}|US)$/.test(entry.jurisdiction)&&Object.hasOwn(adapters,entry.verifier_id)&&local(entry.registration_path)&&SHA.test(entry.registration_sha256)&&/^[a-z0-9_]+$/.test(entry.dimension_id)&&typeof entry.record_unit==='string'&&entry.record_unit.length<=80&&typeof entry.export_policy==='string'&&entry.export_policy.length<=80&&typeof entry.temporal_status==='string'&&entry.temporal_status.endsWith('current-operation-unverified')&&new Date(entry.source_reference_at).toISOString()===entry.source_reference_at&&keys(entry.expected_counts,countKeys));for(const value of Object.values(entry.expected_counts))check(Number.isSafeInteger(value)&&value>=0);check(entry.expected_counts.source_rows===entry.expected_counts.zip5_bearing_rows+entry.expected_counts.missing_zip5_rows&&entry.expected_counts.projected_rows===entry.expected_counts.zip5_bearing_rows);}

export async function readAdjacentExactZipEvidenceCatalog({root=APP_ROOT,signal}={}){
  root=path.resolve(root);signal?.throwIfAborted();
  const registration=JSON.parse(await readFile(path.join(root,REGISTRATION),'utf8'));
  check(keys(registration,registrationKeys)&&registration.schema_version==='adjacent-exact-zip-evidence-catalog-registration@1.0.0'&&registration.dataset_id==='adjacent-exact-zip-evidence-catalog'&&registration.status==='registered-local-review-only-read-model'&&registration.production_enrollment===false&&registration.mutable_pointer===false);
  const loaded=await pinned(root,registration.catalog_path,registration.catalog_sha256,100000),catalog=loaded.value;
  check(keys(catalog,catalogKeys)&&catalog.schema_version==='adjacent-exact-zip-evidence-catalog@1.0.0'&&catalog.dataset_id===registration.dataset_id&&catalog.status==='registered-local-review-only-catalog'&&same(catalog.claims,CATALOG_CLAIMS)&&Array.isArray(catalog.entries)&&catalog.entries.length>0&&catalog.entries.length<=100);
  const ids=new Set(),entries=[];
  for(const entry of catalog.entries){signal?.throwIfAborted();validateEntry(entry);check(!ids.has(entry.id));ids.add(entry.id);}
  const verificationCache=new Map();
  for(const entry of catalog.entries){signal?.throwIfAborted();const registrationBytes=await readFile(path.join(root,entry.registration_path));check(hash(registrationBytes)===entry.registration_sha256);const adapted=await adapters[entry.verifier_id]({root,signal,verificationCache}),{verified,counts,provenance,claimChecks}=adapted;check(verified.registration_sha256===entry.registration_sha256&&verified.dimension_id===entry.dimension_id);
    check(same(counts,entry.expected_counts)&&counts.source_rows===counts.zip5_bearing_rows+counts.missing_zip5_rows&&counts.projected_rows===counts.zip5_bearing_rows&&claimChecks.record_unit===entry.record_unit&&claimChecks.current_operations_verified===false&&claimChecks.geocode_created===false&&claimChecks.matrix_admission_performed===false&&claimChecks.nonadditive===true&&claimChecks.public_export_authorized===false&&claimChecks.production_enrollment===false&&Object.values(provenance).every(value=>typeof value==='string'&&value.length>0)&&SHA.test(provenance.source_manifest_sha256)&&SHA.test(provenance.source_evidence_sha256));
    entries.push({id:entry.id,label:entry.label,jurisdiction:entry.jurisdiction,dimension_id:entry.dimension_id,record_unit:entry.record_unit,export_policy:entry.export_policy,temporal_status:{status:entry.temporal_status,source_reference_at:entry.source_reference_at,current_operations_verified:false},counts,provenance:{registration_path:entry.registration_path,registration_sha256:entry.registration_sha256,...provenance},claims:{...ENTRY_CLAIMS}});
  }
  signal?.throwIfAborted();return{schema_version:'adjacent-exact-zip-evidence-catalog-view@1.0.0',available:true,catalog:{dataset_id:catalog.dataset_id,sha256:registration.catalog_sha256,status:catalog.status},entries,claims:{...CATALOG_CLAIMS},verification_scope:'Every catalog entry passed its independently pinned local verifier. Reading this catalog does not change the registered national matrix.'};
}
