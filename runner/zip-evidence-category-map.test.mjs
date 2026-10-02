import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateZipEvidenceCategoryMap,readZipEvidenceCategoryMap,ZIP_CATEGORY_MAP_SHA256} from './zip-evidence-category-map.mjs';
const mapping=JSON.parse(await readFile(new URL('../config/zip-evidence-category-map.json',import.meta.url),'utf8'));
function fixture(){const sources=mapping.sources.map(row=>({source_key:row.source_key,profile_source_id:row.profile_source_id,source_kind:row.source_kind,release_metadata:{source_release_id:row.source_release_id},zip_level_counts:{record_count:1},zip_rows_with_contribution:1}));return{sources,projection:{bindings:{coverage:{coverageReleaseId:mapping.bindings.coverage_release_id,manifestSha256:mapping.bindings.coverage_manifest_sha256,artifacts:{sources:{sha256:mapping.bindings.sources_sha256}}}},conservation:sources.map(row=>({source_key:row.source_key,source_release_id:row.release_metadata.source_release_id,counts_by_unit:row.zip_level_counts,positive_zip_members:1}))}};}
test('all thirty source identities map exactly with explicit taxonomy differences and aggregate context',()=>{
 const result=validateZipEvidenceCategoryMap(mapping,fixture());assert.equal(result.source_count,30);assert.equal(result.mapping_sha256,ZIP_CATEGORY_MAP_SHA256);
 const category=key=>result.sources.find(row=>row.source_key===key).category_ids;
 assert.deepEqual(category('epa_echo_active_facilities'),['environmental-facilities']);assert.deepEqual(category('fsis_active_mpi_establishments'),['food-production']);
 assert.deepEqual(category('oh_childcare_centers'),['childcare']);assert.deepEqual(category('wa_lni_active_contractor_organizations'),['registrations-nonprofits']);assert.deepEqual(category('census_nonemployer_statistics'),['aggregate-baseline-context']);
 assert.equal(result.sources.every(row=>row.category_ids.length===1),true);assert.equal(result.national_denominator_changed,false);assert.equal(result.qualification_rows_verified,false);
});
test('rejects missing extra duplicate source keys, aliases and source or conservation drift',()=>{
 for(const mutate of [f=>f.sources.pop(),f=>f.sources.push(f.sources[0]),f=>f.sources[1]=f.sources[0],f=>f.projection.conservation[1]=f.projection.conservation[0],f=>f.sources[0].source_key='renamed',f=>f.sources[0].profile_source_id='forged',f=>f.sources[0].release_metadata.source_release_id='changed',f=>f.sources[0].source_kind='aggregate-baseline',f=>f.projection.conservation[0].positive_zip_members=0,f=>f.sources[0].zip_level_counts={wrong_count:1},f=>f.projection.bindings.coverage.coverageReleaseId='new']){const f=fixture();mutate(f);assert.throws(()=>validateZipEvidenceCategoryMap(mapping,f));}
});
test('authored version rejects reclassification, multicategory and unknown category without reviewed version',()=>{
 for(const mutate of [m=>m.sources[0].category_ids=['retail-consumer'],m=>m.sources[0].category_ids.push('retail-consumer'),m=>m.sources[0].category_ids=['made-up'],m=>m.sources.pop(),m=>m.taxonomy_version='next']){const copy=structuredClone(mapping);mutate(copy);assert.throws(()=>validateZipEvidenceCategoryMap(copy,fixture()));}
});
test('dataset registration pins the authored contract and enables no runtime or production action',async()=>{
 const contract=JSON.parse(await readFile(new URL('../config/datasets/zip-evidence-category-map.json',import.meta.url),'utf8'));assert.equal(contract.mapping_sha256,ZIP_CATEGORY_MAP_SHA256);assert.equal(contract.source_count,30);assert.equal(contract.runtime_pointer,null);assert.equal(contract.production_enrollment,false);assert.equal(contract.api_or_ui_enabled,false);
});
test('installed pinned source metadata matches all thirty qualification conservation identities',{skip:process.env.DATAHUB_TEST_ZIP_CATEGORY_MAPPING!=='1'},async()=>{const result=await readZipEvidenceCategoryMap();assert.equal(result.source_count,30);assert.equal(result.network_requests,0);assert.equal(result.source_replay_performed,false);});
