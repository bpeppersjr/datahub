import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {readZipEvidenceQualification} from './zip-evidence-qualification-reader.mjs';
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';
const moduleUrl=new URL('./zip-evidence-qualification-reader.mjs',import.meta.url),code=(await readFile(moduleUrl,'utf8')).replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,moduleUrl).href}'`);
const {internals}=await import(`data:text/javascript;base64,${Buffer.from(`${code}\nexport const internals={selection,compatible};`).toString('base64')}`);
function fixture(){const view=qualificationFixture(),source={release_id:view.release.id,manifest_sha256:view.release.manifest_sha256,as_of:view.release.as_of,created_at:view.release.created_at,temporal_policy_version:view.release.temporal_policy_version,bindings:{coverage:{coverageReleaseId:view.bindings.coverage_release_id,manifestSha256:view.bindings.coverage_manifest_sha256,pointerSha256:'b'.repeat(64)},registry:{release_id:view.bindings.registry_release_id,manifest_sha256:view.bindings.registry_manifest_sha256,pointer_sha256:'c'.repeat(64)},export_policy:{effective:'local-review-only'}}};
 const mapping={export_policy:'local-review-only',sources:[{source_key:'source-fixture',source_release_id:'source-release',category_ids:['childcare']}]};
 const lookup={zip5:'00501',source_release_id:source.release_id,status:'present',rows:view.rows,categories_by_source:{'source-fixture':['childcare']},claims:{export_policy:'internal'}};return {source,mapping,lookup};}
test('reader selection preserves all and exact authored category filtering, restrictions and truthful absence',()=>{
 const {source,mapping,lookup}=fixture();for(const category of ['all','childcare']){const v=internals.selection(lookup,mapping,source,'00501',category);assert.equal(v.selection_status,'matched');assert.equal(v.export_policy,'internal');assert.equal(v.claims.active_business_count,null);assert.equal(v.rows.length,1);assert.equal(v.rows[0].source_reference_metadata,undefined);}
 assert.equal(internals.selection(lookup,mapping,source,'00501','health-care').selection_status,'unsupported');
 const absent={...lookup,status:'absent-from-source-rows',rows:[],categories_by_source:{}};assert.equal(internals.selection(absent,mapping,source,'00501','childcare').selection_status,'absent');
 lookup.rows[0].evidence_counts_by_unit.retailer_count=0;lookup.rows[0].eligible_evidence_counts_by_unit.retailer_count=0;assert.equal(internals.selection(lookup,mapping,source,'00501','all').selection_status,'matched');
 lookup.categories_by_source['source-fixture']=['health-care'];assert.throws(()=>internals.selection(lookup,mapping,source,'00501','all'));
});
test('current coverage and registry compatibility reject pointer, manifest and release drift',async()=>{
 const {source}=fixture();
 const read=async relative=>{const coverage=relative.includes('coverage'),b=coverage?source.bindings.coverage:source.bindings.registry,id=b.coverageReleaseId??b.release_id,dataset=coverage?'national-business-coverage-views':'national-business-registry';return relative.endsWith('current.json')?{value:{dataset_id:dataset,release_id:id,manifest:`releases/${id}/manifest.json`},meter:{sha256:b.pointerSha256??b.pointer_sha256}}:{value:{dataset_id:dataset,release_id:id},meter:{sha256:b.manifestSha256??b.manifest_sha256}};};
 await internals.compatible(APP_ROOT,source,read);
 for(const mode of ['release','pointer','manifest'])await assert.rejects(internals.compatible(APP_ROOT,source,async relative=>{const result=await read(relative);if(mode==='release')result.value.release_id='changed';else if(relative.endsWith('current.json')===(mode==='pointer'))result.meter.sha256='0'.repeat(64);return result;}));
});
test('missing tracked registration is not-enrolled; malformed registration is corrupt with no discovery or overrides',async t=>{
 await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/zip-reader-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let view=await readZipEvidenceQualification({root,zip:'00501'});assert.equal(view.status,'not-enrolled');assert.equal(view.release,null);assert.deepEqual(view.rows,[]);
 await mkdir(path.join(root,'config/datasets'),{recursive:true});await writeFile(path.join(root,'config/datasets/zip-active-evidence-index.json'),'{}');view=await readZipEvidenceQualification({root,zip:'00501'});assert.equal(view.status,'corrupt-release');assert.doesNotMatch(JSON.stringify(view),/zip-reader|datahub/);
 await assert.rejects(readZipEvidenceQualification({root,zip:'00501',lookup:()=>{}}));const controller=new AbortController();controller.abort();await assert.rejects(readZipEvidenceQualification({root,zip:'00501',signal:controller.signal}),/abort/i);
});
test('registered native reader is bounded and filters exact authored categories',{skip:process.env.DATAHUB_TEST_ZIP_QUALIFICATION_READER!=='1'},async()=>{
 const all=await readZipEvidenceQualification({zip:'00501'});assert.equal(all.available,true);assert.equal(all.rows.length,29);assert.equal(all.claims.all_business_completion_percent,null);
 const childcare=await readZipEvidenceQualification({zip:'00501',categoryId:'childcare'});assert.equal(childcare.available,true);assert.equal(childcare.selection_status,'matched');assert.equal(childcare.rows.length,4);assert.ok(childcare.rows.every(row=>row.source_key.endsWith('childcare_centers')));
});
