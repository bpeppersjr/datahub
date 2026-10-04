import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {readZipEvidenceQualification} from './zip-evidence-qualification-reader.mjs';
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';
const moduleUrl=new URL('./zip-evidence-qualification-reader.mjs',import.meta.url),code=(await readFile(moduleUrl,'utf8')).replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,moduleUrl).href}'`);
const {internals}=await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport const internals={selection,compatible,validateSemanticBindings};`).toString('base64')}`);
function fixture(){const view=qualificationFixture(),source={release_id:view.release.id,manifest_sha256:view.release.manifest_sha256,as_of:view.release.as_of,created_at:view.release.created_at,temporal_policy_version:view.release.temporal_policy_version,bindings:{coverage:{coverageReleaseId:view.bindings.coverage_release_id,manifestSha256:view.bindings.coverage_manifest_sha256,pointerSha256:'b'.repeat(64)},registry:{release_id:view.bindings.registry_release_id,manifest_sha256:view.bindings.registry_manifest_sha256,pointer_sha256:'c'.repeat(64)},export_policy:{effective:'local-review-only'}}};
 const mapping={export_policy:'local-review-only',sources:[{source_key:'source-fixture',source_release_id:'source-release',category_ids:['childcare']}]};
 const lookup={zip5:'00501',source_release_id:source.release_id,status:'present',rows:view.rows,categories_by_source:{'source-fixture':['childcare']},claims:{export_policy:'internal'}},semantic={provenance:view.semantic_provenance,bySource:new Map([['source-fixture',{...view.rows[0].source_semantics,source_release_id:'source-release'}]])};return {source,mapping,lookup,semantic};}
test('reader selection preserves all and exact authored category filtering, restrictions and truthful absence',()=>{
 const {source,mapping,lookup,semantic}=fixture();for(const category of ['all','childcare']){const v=internals.selection(lookup,mapping,source,'00501',category,semantic);assert.equal(v.selection_status,'matched');assert.equal(v.export_policy,'internal');assert.equal(v.claims.active_business_count,null);assert.equal(v.rows.length,1);assert.equal(v.rows[0].source_reference_metadata,undefined);assert.equal(v.rows[0].source_semantics.classification,'source-defined-current-membership');assert.equal(v.assessment_as_of,'2026-10-02T16:30:00.000Z');}
 assert.equal(internals.selection(lookup,mapping,source,'00501','health-care',semantic).selection_status,'unsupported');
 const absent={...lookup,status:'absent-from-source-rows',rows:[],categories_by_source:{}};assert.equal(internals.selection(absent,mapping,source,'00501','childcare',semantic).selection_status,'absent');
 lookup.rows[0].evidence_counts_by_unit.retailer_count=0;lookup.rows[0].eligible_evidence_counts_by_unit.retailer_count=0;assert.equal(internals.selection(lookup,mapping,source,'00501','all',semantic).selection_status,'matched');
 lookup.categories_by_source['source-fixture']=['health-care'];assert.throws(()=>internals.selection(lookup,mapping,source,'00501','all'));
});
test('current coverage and registry compatibility reject pointer, manifest and release drift',async()=>{
 const {source}=fixture();
 const read=async relative=>{const coverage=relative.includes('coverage'),b=coverage?source.bindings.coverage:source.bindings.registry,id=b.coverageReleaseId??b.release_id,dataset=coverage?'national-business-coverage-views':'national-business-registry';return relative.endsWith('current.json')?{value:{dataset_id:dataset,release_id:id,manifest:`releases/${id}/manifest.json`},meter:{sha256:b.pointerSha256??b.pointer_sha256}}:{value:{dataset_id:dataset,release_id:id},meter:{sha256:b.manifestSha256??b.manifest_sha256}};};
 await internals.compatible(APP_ROOT,source,read);
 for(const mode of ['release','pointer','manifest'])await assert.rejects(internals.compatible(APP_ROOT,source,async relative=>{const result=await read(relative);if(mode==='release')result.value.release_id='changed';else if(relative.endsWith('current.json')===(mode==='pointer'))result.meter.sha256='0'.repeat(64);return result;}));
});
test('semantic classification join rejects registry, coverage and exact source-release drift',()=>{
 const {source}=fixture(),rows=Array.from({length:30},(_,index)=>({source_key:`source-${index}`,source_release_id:`release-${index}`})),mapping={sources:rows.map(row=>({...row}))};
 const semantic={provenance:{registry_release_id:source.bindings.registry.release_id,registry_manifest_sha256:source.bindings.registry.manifest_sha256,coverage_release_id:source.bindings.coverage.coverageReleaseId,coverage_manifest_sha256:source.bindings.coverage.manifestSha256},rows};
 assert.equal(internals.validateSemanticBindings(semantic,source,mapping).size,30);
 for(const mutate of [v=>v.provenance.registry_manifest_sha256='0'.repeat(64),v=>v.provenance.coverage_release_id='other',v=>v.rows[0].source_release_id='other']){const changed=structuredClone(semantic);mutate(changed);assert.throws(()=>internals.validateSemanticBindings(changed,source,mapping));}
});
test('missing tracked registration is not-enrolled; malformed registration is corrupt with no discovery or overrides',async t=>{
 await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/zip-reader-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let view=await readZipEvidenceQualification({root,zip:'00501'});assert.equal(view.status,'not-enrolled');assert.equal(view.release,null);assert.deepEqual(view.rows,[]);
 await mkdir(path.join(root,'config/datasets'),{recursive:true});await writeFile(path.join(root,'config/datasets/zip-active-evidence-index.json'),'{}');view=await readZipEvidenceQualification({root,zip:'00501'});assert.equal(view.status,'corrupt-release');assert.doesNotMatch(JSON.stringify(view),/zip-reader|datahub/);
 await assert.rejects(readZipEvidenceQualification({root,zip:'00501',lookup:()=>{}}));const controller=new AbortController();controller.abort();await assert.rejects(readZipEvidenceQualification({root,zip:'00501',signal:controller.signal}),/abort/i);
});
test('registered native reader is bounded and filters exact authored categories',{skip:process.env.DATAHUB_TEST_ZIP_QUALIFICATION_READER!=='1'},async()=>{
 const all=await readZipEvidenceQualification({zip:'00501'});assert.equal(all.available,true);assert.equal(all.rows.length,29);assert.equal(all.claims.all_business_completion_percent,null);
 assert.equal(all.semantic_compatibility,'exact-registry-and-coverage-lineage-match');assert.equal(all.assessment_as_of,'2026-10-02T16:30:00.000Z');assert.equal(all.semantic_provenance.artifact_sha256,'d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0');assert.equal(all.review_scope_summary.within_review_window.positive_source_zip_pairs,301657);assert.equal(Buffer.byteLength(JSON.stringify(all))<262144,true);
 const ny=all.rows.find(row=>row.source_key==='ny_retail_food_store_license_sites');assert.equal(ny.temporal_status.source_reference_date,'2025-09-30');assert.equal(ny.observation_window.last_seen,'2026-09-07T13:43:03.353Z');assert.equal(ny.qualification,'measured-stale-review-due');
 for(const [zip,status] of [['01065','unknown-only'],['01385','unknown-only'],['02363','unknown-only'],['45730','unknown-only'],['12141','stale-only'],['12228','stale-only']]){const view=await readZipEvidenceQualification({zip});assert.equal(view.review_qualification_gap?.status,status);assert.equal(view.claims.current_operations_verified,false);assert.equal(view.claims.active_business_count,null);}
 for(const row of all.rows.filter(row=>row.source_key.endsWith('_childcare_centers'))){assert.equal(row.qualification,'unmeasured');assert.equal(row.review_clock.age_days,null);assert.equal(row.source_semantics.source_status_term.length>0,true);assert.ok(row.retained_source_observation?.observed_at);}
 const oh=all.rows.find(row=>row.source_key==='oh_childcare_centers');assert.equal(oh.source_semantics.source_status_term,'publisher Open status');assert.equal(oh.qualification,'unmeasured');
 const childcare=await readZipEvidenceQualification({zip:'00501',categoryId:'childcare'});assert.equal(childcare.available,true);assert.equal(childcare.selection_status,'matched');assert.equal(childcare.rows.length,4);assert.ok(childcare.rows.every(row=>row.source_key.endsWith('childcare_centers')));
});
