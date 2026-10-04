import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {readZipActiveEvidenceLookup,ZIP_ACTIVE_EVIDENCE_INDEX_VERSION} from './zip-active-evidence-index.mjs';
import {ZIP_CATEGORY_MAP_SHA256,ZIP_CATEGORY_MAP_VERSION,ZIP_CATEGORY_TAXONOMY_VERSION} from './zip-evidence-category-map.mjs';
import {projectZipEvidenceQualification} from './zip-evidence-qualification-http.mjs';
import {readNationalBusinessTemporalClaimRows} from './national-business-temporal-claim-matrix-reader.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const check=ok=>{if(!ok)throw Error('Qualification registration or binding rejected.');};
const claims={current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,overlapping_units_additive:false};
const reviewScopeSummary={assessment_as_of:'2026-10-02T16:30:00.000Z',qualification_sources:29,zip_cohort_members:48194,source_zip_pair_unit:'one retained source row for one ZIP5; source rows and counts are overlapping and nonadditive',within_review_window:{source_count:24,source_zip_pairs:1156656,positive_source_zip_pairs:301657,positive_zip_union:47989},stale_review_due:{source_count:1,source_zip_pairs:48194,positive_source_zip_pairs:1500,positive_zip_union:1500},unmeasured:{source_count:4,source_zip_pairs:192776,positive_source_zip_pairs:1964,positive_zip_union:1964},within_window_semantics:{source_defined_current_membership:{source_count:20,positive_source_zip_pairs:209117,positive_zip_union:45845},non_active_reporting_membership:{source_count:4,positive_source_zip_pairs:92540,positive_zip_union:39106}},claims:{current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,source_zip_counts_additive:false}};
const unavailable=(zip,categoryId,status)=>projectZipEvidenceQualification({zip5:zip,category_id:categoryId,available:false,status},{zip,categoryId});

function selection(lookup,mapping,source,zip,categoryId,semantic){
 check(lookup.zip5===zip&&lookup.source_release_id===source.release_id&&['present','absent-from-source-rows'].includes(lookup.status));
 const supported=categoryId==='all'||mapping.sources.some(row=>row.category_ids.includes(categoryId));
 const eligible=new Map(mapping.sources.filter(row=>categoryId==='all'||row.category_ids.includes(categoryId)).map(row=>[row.source_key,row]));
 const rows=lookup.rows.filter(row=>eligible.has(row.source_key));
 for(const row of lookup.rows){const mapped=mapping.sources.find(s=>s.source_key===row.source_key);check(mapped&&row.source_release_id===mapped.source_release_id&&same(lookup.categories_by_source[row.source_key],mapped.category_ids));}
 check(['internal','local-review-only'].includes(lookup.claims.export_policy));
 const policy=[lookup.claims.export_policy,source.bindings.export_policy.effective,mapping.export_policy].includes('internal')?'internal':'local-review-only';
 const value={zip5:zip,category_id:categoryId,available:true,status:'verified-immutable-projection',selection_status:!supported?'unsupported':rows.length?'matched':'absent',export_policy:policy,
  release:{id:source.release_id,manifest_sha256:source.manifest_sha256,as_of:source.as_of,created_at:source.created_at,temporal_policy_version:source.temporal_policy_version},
  bindings:{coverage_release_id:source.bindings.coverage.coverageReleaseId,coverage_manifest_sha256:source.bindings.coverage.manifestSha256,registry_release_id:source.bindings.registry.release_id,registry_manifest_sha256:source.bindings.registry.manifest_sha256,mapping_version:ZIP_CATEGORY_MAP_VERSION,mapping_sha256:ZIP_CATEGORY_MAP_SHA256,taxonomy_version:ZIP_CATEGORY_TAXONOMY_VERSION},
  assessment_as_of:source.as_of,semantic_compatibility:'exact-registry-and-coverage-lineage-match',
  review_scope_summary:reviewScopeSummary,
  semantic_provenance:{release_id:semantic.provenance.release_id,manifest_sha256:semantic.provenance.manifest_sha256,artifact_sha256:semantic.provenance.artifact_sha256,registry_release_id:semantic.provenance.registry_release_id,registry_manifest_sha256:semantic.provenance.registry_manifest_sha256,coverage_release_id:semantic.provenance.coverage_release_id,coverage_manifest_sha256:semantic.provenance.coverage_manifest_sha256},rows:rows.map(row=>{
   const meaning=semantic.bySource.get(row.source_key);check(meaning&&meaning.source_release_id===row.source_release_id);
   const clock=row.temporal_status,window=clock.normalized_record_observation_window??{};
   return {...row,source_semantics:{classification:meaning.classification,source_status_term:meaning.source_status_term,cohort_scope:meaning.cohort_scope,jurisdiction_scope:meaning.jurisdiction_scope,policy_sha256:meaning.policy_sha256},
    review_clock:{source_reference_at:clock.source_reference_at??null,age_days:clock.age_days??null,review_after_days:clock.review_after_days??null,cadence_class:clock.cadence_class??'unconfigured'},
    observation_window:{first_seen:window.first_seen??null,last_seen:window.last_seen??null,meaning:window.meaning??'No normalized record observation window is retained for this source.'},
    retained_source_observation:clock.retained_source_observation??null};
  }),claims};
 return projectZipEvidenceQualification(value,{zip,categoryId});
}
async function compatible(root,source,read){
 for(const [directory,dataset,binding]of [['business-coverage-views','national-business-coverage-views',source.bindings.coverage],['business-registry','national-business-registry',source.bindings.registry]]){
  const pointer=await read(`data/${directory}/current.json`,16000),id=binding.coverageReleaseId??binding.release_id;
  check(pointer.value.dataset_id===dataset&&pointer.value.release_id===id&&pointer.value.manifest===`releases/${id}/manifest.json`&&pointer.meter.sha256===(binding.pointerSha256??binding.pointer_sha256));
  const manifest=await read(`data/${directory}/${pointer.value.manifest}`,2000000);
  check(manifest.value.dataset_id===dataset&&manifest.value.release_id===id&&manifest.meter.sha256===(binding.manifestSha256??binding.manifest_sha256));
 }
 void root;
}

function validateSemanticBindings(semantic,source,mapping){
 check(semantic.provenance.registry_release_id===source.bindings.registry.release_id&&semantic.provenance.registry_manifest_sha256===source.bindings.registry.manifest_sha256&&semantic.provenance.coverage_release_id===source.bindings.coverage.coverageReleaseId&&semantic.provenance.coverage_manifest_sha256===source.bindings.coverage.manifestSha256);
 check(semantic.rows.length===30&&new Set(semantic.rows.map(row=>row.source_key)).size===30&&mapping.sources.length===30);
 const bySource=new Map(semantic.rows.map(row=>[row.source_key,row]));
 for(const mapped of mapping.sources){const meaning=bySource.get(mapped.source_key);check(meaning&&meaning.source_release_id===mapped.source_release_id);}
 return bySource;
}

/** Bounded, uncached read only. A missing registration never triggers discovery/build. */
export async function readZipEvidenceQualification(opts={}){
 check(opts&&Object.keys(opts).every(key=>['zip','categoryId','root','signal'].includes(key)));
 const {zip,categoryId='all',signal}=opts,root=path.resolve(opts.root??APP_ROOT);check(/^\d{5}$/.test(zip)&&typeof categoryId==='string');signal?.throwIfAborted();
 const reads=[];async function read(relative,max){const file=path.join(root,relative),meter={},value=await readJson(file,max,signal,meter);reads.push({file,max,meter});return {value,meter};}
 let registration;
 try{registration=(await read('config/datasets/zip-active-evidence-index.json',100000)).value;}catch(error){signal?.throwIfAborted();return unavailable(zip,categoryId,error.code==='ENOENT'?'not-enrolled':'unavailable');}
 let status='corrupt-release';
 try{
  check(registration.dataset_id==='zip-active-evidence-index'&&registration.schema_version==='1.0.0'&&registration.status==='registered-local-lookup-index'&&registration.release_only===true&&registration.runtime_pointer===null&&registration.production_enrollment===false&&registration.national_reporting_denominator_enrollment===false&&registration.current_pointer_written===false&&['internal','local-review-only'].includes(registration.export_policy));
  const r=registration.retained_release;check(r&&/^zip-active-evidence-index-[a-f0-9]{64}$/.test(r.release_id)&&r.manifest===`data/zip-active-evidence-index/releases/${r.release_id}/manifest.json`&&/^[a-f0-9]{64}$/.test(r.manifest_sha256));
  const index=await read(r.manifest,100000);
  check(index.meter.sha256===r.manifest_sha256&&index.meter.bytes===r.manifest_bytes&&index.value.schema_version===ZIP_ACTIVE_EVIDENCE_INDEX_VERSION&&r.manifest_schema_version===index.value.schema_version);
  for(const key of ['release_id','status','created_at','source_zip_rows','indexed_zip_count','bindings'])check(same(index.value[key],r[key]));
  check(Array.isArray(index.value.artifacts)&&index.value.artifacts.length===r.artifact_count&&index.value.artifacts.reduce((n,a)=>n+a.bytes,0)===r.artifact_bytes&&hash(JSON.stringify(index.value.artifacts))===r.artifact_inventory_sha256&&same(index.value.claims,registration.claims)&&index.value.claims.export_policy===registration.export_policy);
  const registeredSource=await read('config/datasets/zip-active-evidence-qualification.json',1000000),source=registeredSource.value.retained_release;
  check(registeredSource.meter.sha256===r.bindings.registration_sha256&&source.release_id===r.bindings.source_release_id&&source.manifest_sha256===r.bindings.source_manifest_sha256&&source.artifact_inventory_sha256===r.bindings.source_inventory_sha256);
  const semantic=await readNationalBusinessTemporalClaimRows({root,signal});
  const {value:mapping}=await read('config/zip-evidence-category-map.json',32000);
  check(hash(JSON.stringify(mapping))===ZIP_CATEGORY_MAP_SHA256&&mapping.schema_version===ZIP_CATEGORY_MAP_VERSION&&mapping.taxonomy_version===ZIP_CATEGORY_TAXONOMY_VERSION&&r.bindings.mapping_sha256===ZIP_CATEGORY_MAP_SHA256);
  const semanticBySource=validateSemanticBindings(semantic,source,mapping);
  check(categoryId==='all'||mapping.categories.some(category=>category.id===categoryId));
  status='incompatible-bindings';await compatible(root,source,read);status='corrupt-release';
  const lookup=await readZipActiveEvidenceLookup({root,signal,manifestPath:path.join(root,r.manifest),manifestSha256:r.manifest_sha256,zip5:zip});
  check(lookup.index_release_id===r.release_id&&lookup.index_manifest_sha256===r.manifest_sha256&&same(lookup.bindings,r.bindings));
  const view=selection(lookup,mapping,source,zip,categoryId,{...semantic,bySource:semanticBySource});
  // Recheck current compatibility and every bounded file after shard reads.
  status='incompatible-bindings';await compatible(root,source,read);status='corrupt-release';
  for(const entry of reads){const meter={};await readJson(entry.file,entry.max,signal,meter);check(meter.sha256===entry.meter.sha256&&meter.identity.ino===entry.meter.identity.ino&&meter.identity.dev===entry.meter.identity.dev&&meter.identity.mtimeNs===entry.meter.identity.mtimeNs&&meter.identity.ctimeNs===entry.meter.identity.ctimeNs);}
  signal?.throwIfAborted();return view;
 }catch{signal?.throwIfAborted();return unavailable(zip,categoryId,status);}
}
