import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {classifyExactZipEvidenceDisposition,readExactZipIndustryEvidenceWithTemporalQualification,readExactZipIndustryTemporalQualification} from './exact-zip-industry-temporal-qualification.mjs';

test('evidence disposition is conservative and exhaustive across cell states',()=>{
 const statuses=['positive','measured-zero','outside-source-denominator','absent-from-retained-source-rows','unavailable'];
 for(const cell_status of statuses)for(const [semantic_class,review_qualification,expected]of[['source-defined-current','within-review-window',cell_status==='positive'?'source-defined-current-positive-within-review-window':'source-defined-current-without-positive-evidence'],['non-active-reporting','within-review-window',cell_status==='positive'?'non-active-reporting-positive':'non-active-reporting-without-positive-evidence'],['source-defined-current','stale','stale'],['source-defined-current','unmeasured','unmeasured'],['unmapped','unmapped','unmapped']]){const value=classifyExactZipEvidenceDisposition({cell_status,semantic_class,review_qualification});assert.deepEqual(value,{cell_status,lifecycle_status:expected,label:`${cell_status.replaceAll('-',' ')} · ${expected.replaceAll('-',' ')}`,current_operations_verified:false});}
 assert.throws(()=>classifyExactZipEvidenceDisposition({cell_status:'positive',semantic_class:'unmapped',review_qualification:'within-review-window'}));
});

test('exact ZIP view adds one joined disposition per dimension without current-operation uplift',async()=>{const view=await readExactZipIndustryEvidenceWithTemporalQualification({zip5:'10001'}),lifecycles=new Set(view.temporal_qualification.rows.map(row=>row.evidence_disposition.lifecycle_status));assert.equal(view.temporal_qualification.schema_version,'exact-zip-industry-temporal-qualification-view@1.1.0');assert.equal(view.temporal_qualification.rows.length,39);assert.ok(view.temporal_qualification.rows.every(row=>row.evidence_disposition.current_operations_verified===false&&row.current_operations_verified===false));assert.ok(lifecycles.has('source-defined-current-positive-within-review-window'));assert.ok(lifecycles.has('non-active-reporting-positive'));const unmapped=view.temporal_qualification.rows.find(row=>row.dimension_id==='cms_hospital_directory').evidence_disposition;assert.equal(unmapped.lifecycle_status,'unmapped');assert.equal(unmapped.cell_status,view.row.cells.cms_hospital_directory.status);});

test('registered temporal qualification exhaustively binds 39 dimensions without current-operation uplift',async()=>{
 const view=await readExactZipIndustryTemporalQualification({zip5:'10000'}), rows=view.rows;
 assert.equal(rows.length,39);assert.equal(view.claims.current_operations_verified,false);assert.equal(view.claims.active_business_count,null);assert.equal(view.claims.all_business_denominator,null);assert.equal(view.claims.all_business_completion_percent,null);
 assert.deepEqual(view.summary.qualification_dimension_counts,{'within-review-window':25,stale:1,unmeasured:4,unmapped:9});
 assert.deepEqual(view.summary.qualification_cell_counts,{'within-review-window':1204850,stale:48194,unmeasured:192776,unmapped:433746});
 assert.deepEqual(view.summary.semantic_dimension_counts,{'source-defined-current':22,'non-active-reporting':8,unmapped:9});
 assert.deepEqual(view.summary.semantic_cell_counts,{'source-defined-current':1060268,'non-active-reporting':385552,unmapped:433746});
 assert.equal(view.summary.qualification_cell_total,48194*39);assert.equal(view.summary.semantic_cell_total,48194*39);
 const byId=new Map(rows.map(row=>[row.dimension_id,row]));
 assert.equal(byId.get('ny_retail_food_location_profiles').review_qualification,'stale');
 for(const id of ['childcare_ma_reporting_centers','childcare_nj_reporting_centers','childcare_tn_reporting_centers','childcare_oh_reporting_centers'])assert.equal(byId.get(id).review_qualification,'unmeasured');
 for(const id of ['cms_hospital_directory','cms_nursing_home_directory','childcare_pa_candidates','childcare_ct_candidates','childcare_md_candidates','childcare_vt_candidates','childcare_co_candidates','childcare_ut_candidates','childcare_ia_candidates']){assert.equal(byId.get(id).source_key,null);assert.equal(byId.get(id).review_qualification,'unmapped');}
 assert.equal(byId.get('healthcare_organizations').source_key,byId.get('pharmacy').source_key);
 assert.equal(byId.get('broad_org_or_legal_registration_addresses').source_key,byId.get('broad_org_or_brand_registration_addresses').source_key);
 assert.equal(byId.get('healthcare_organizations').source_release_id,'NPPES_Data_Dissemination_August_2026_V2');
 assert.equal(byId.get('broad_org_or_legal_registration_addresses').source_release_id,'or-business-registry-2026-09-01-c58ca37fef13c0e9');
 assert.ok(rows.every(row=>row.current_operations_verified===false&&row.assessment_as_of===view.assessment_as_of));
 assert.deepEqual(view.provenance.bindings.matrix,{release_id:'national-exact-zip-industry-evidence-matrix-ada7e938a0bfa31a51b4cc165b0a3e357f025704eff853fb88a4ccadf2c9ceb6',manifest_sha256:'743d1bad94a7e8b122969cbb0cb9618e20b820b4b1b5afb46285bd70458d9ffe',artifact_inventory_sha256:view.provenance.bindings.matrix.artifact_inventory_sha256,registration_sha256:view.provenance.bindings.matrix.registration_sha256});
 assert.equal(view.provenance.bindings.temporal.artifact_sha256,'d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0');
 assert.equal(view.provenance.bindings.qualification.projection_sha256,'bb4314e0d76a6d0507093bd00992dd29a4caa28e34e43d1d2b5e1b9ea58ee4c8');
});

test('rejects tampered derivative bytes before attempting source replay',async()=>{
 const sourceReg=JSON.parse(await fs.readFile(path.join(APP_ROOT,'config/datasets/exact-zip-industry-temporal-qualification.json'),'utf8'));
 const temp=await fs.mkdtemp(path.join(APP_ROOT,'data','.zip-temporal-qualification-test-'));
 try{
  await fs.mkdir(path.join(temp,'config/datasets'),{recursive:true});
  await fs.copyFile(path.join(APP_ROOT,'config/datasets/exact-zip-industry-temporal-qualification.json'),path.join(temp,'config/datasets/exact-zip-industry-temporal-qualification.json'));
  const rel=sourceReg.retained_release.manifest.replaceAll('/','\\');
  const manifestPath=path.join(APP_ROOT,sourceReg.retained_release.manifest), manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const directory=path.dirname(path.join(temp,rel));await fs.mkdir(directory,{recursive:true});
  await fs.copyFile(manifestPath,path.join(directory,'manifest.json'));
  const artifactPath=path.join(path.dirname(manifestPath),manifest.artifact.path), tampered=JSON.parse(await fs.readFile(artifactPath,'utf8'));tampered.claims.current_operations_verified=true;
  await fs.writeFile(path.join(directory,manifest.artifact.path),JSON.stringify(tampered)+'\n');
  await assert.rejects(readExactZipIndustryTemporalQualification({root:temp,zip5:'10000'}));
 } finally {await fs.rm(temp,{recursive:true,force:true});}
});

test('honors cancellation and rejects malformed ZIP input',async()=>{
 await assert.rejects(readExactZipIndustryTemporalQualification({zip5:'1000'}));
 const controller=new AbortController();controller.abort();
 await assert.rejects(readExactZipIndustryTemporalQualification({zip5:'10000',signal:controller.signal}),error=>error.name==='AbortError');
});
