import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadLines} from './mn-construction-retained-selection.mjs';
import {createZipActiveEvidenceProjection,buildZipActiveEvidenceQualification,verifyZipActiveEvidenceQualification,ZIP_ACTIVE_EVIDENCE_LIMITS,assertZipActiveEvidencePairCount} from './zip-active-evidence-qualification.mjs';
const asOf='2026-10-02T12:00:00.000Z',createdAt='2026-10-03T12:00:00.000Z';
const sha=value=>createHash('sha256').update(value).digest('hex');
function source(key='usda_snap_retailers',metadata={source_updated_at:'2026-09-20'},counts={retailer_count:2}){return {source_key:key,source_kind:'record-level-evidence',complete_source_for_all_businesses:false,release_metadata:{source_release_id:`release-${key}`,...metadata},zip_level_counts:counts,zip_rows_with_contribution:1};}
const zip=(sources,code='00501')=>({zip_code:code,complete_all_businesses:false,source_contributions:Object.fromEntries(sources.map(row=>[row.source_key,{...row.release_metadata,...row.zip_level_counts}]))});
function project(sources,options={}){const p=createZipActiveEvidenceProjection({sources,asOf,createdAt,...options});p.add(zip(sources));return p.finish();}

test('shared pair admission accepts exact supported bound and rejects over-bound without huge allocation',()=>{
 assert.equal(ZIP_ACTIVE_EVIDENCE_LIMITS.sourceZipPairs,1_500_000);
 assert.equal(ZIP_ACTIVE_EVIDENCE_LIMITS.sourceZipPairs,ZIP_ACTIVE_EVIDENCE_LIMITS.rowsPerPartition*ZIP_ACTIVE_EVIDENCE_LIMITS.maxPartitions);
 for(const value of [0,1_397_626,1_500_000])assert.doesNotThrow(()=>assertZipActiveEvidencePairCount(value));
 for(const value of [1_500_001,-1,0.5,NaN,Infinity])assert.throws(()=>assertZipActiveEvidencePairCount(value),/pair limit/);
 assert.equal(Object.isFrozen(ZIP_ACTIVE_EVIDENCE_LIMITS),true);
});

test('per-source temporal and provenance objects share immutable storage without changing serialized rows',()=>{
 const s=source();s.zip_rows_with_contribution=2;s.zip_level_counts.retailer_count=4;s.release_metadata.nested={basis:['source-native']};
 const p=createZipActiveEvidenceProjection({sources:[s],asOf,createdAt});
 const first=zip([s]);first.source_contributions[s.source_key].retailer_count=2;p.add(first);
 const second=structuredClone(first);second.zip_code='00502';p.add(second);
 s.release_metadata.nested.basis[0]='caller-mutated';
 const rows=p.finish().rows;
 assert.equal(rows[0].source_reference_metadata,rows[1].source_reference_metadata);assert.equal(rows[0].temporal_status,rows[1].temporal_status);
 assert.deepEqual(rows[0].source_reference_metadata.nested,{basis:['source-native']});
 assert.throws(()=>{rows[0].source_reference_metadata.nested.basis[0]='mutated';},TypeError);
 assert.throws(()=>{rows[0].temporal_status.status='fake';},TypeError);
 assert.deepEqual(JSON.parse(JSON.stringify(rows[0])),{...JSON.parse(JSON.stringify(rows[1])),zip5:'00501'});
});

test('temporal source qualification preserves mixed units, overlaps and unknown operation',()=>{
 const sources=[source(),source('fdic_bankfind',{source_updated_at:'2025-01-01'},{branch_count:3,head_office_count:1}),source('oh_childcare_centers',{observed_at:'2026-10-02'},{reported_center_count:4}),source('unknown_source',{source_updated_at:'2026-10-01'},{record_count:5})];
 const value=project(sources),byKey=new Map(value.rows.map(row=>[row.source_key,row]));
 assert.deepEqual(byKey.get('usda_snap_retailers').eligible_evidence_counts_by_unit,{retailer_count:2});
 assert.equal(byKey.get('fdic_bankfind').qualification,'measured-stale-review-due');assert.deepEqual(byKey.get('fdic_bankfind').eligible_evidence_counts_by_unit,{branch_count:0,head_office_count:0});
 assert.deepEqual(byKey.get('fdic_bankfind').evidence_counts_by_unit,{branch_count:3,head_office_count:1});
 for(const key of ['oh_childcare_centers','unknown_source']){assert.equal(byKey.get(key).qualification,'unmeasured');assert.ok(Object.values(byKey.get(key).eligible_evidence_counts_by_unit).every(value=>value===null));}
 assert.equal(byKey.get('oh_childcare_centers').temporal_status.source_reference_at,null);
 assert.equal(value.rows.length,4);assert.equal(value.zip_members,1);assert.equal(value.claims.active_business_count,null);assert.equal(value.claims.overlapping_units_additive,false);
 for(const row of value.rows){assert.equal(row.current_operations_verified,false);assert.equal(row.all_business_denominator,null);assert.equal(row.all_business_completion_percent,null);}
});
test('build clocks cannot refresh source dates; future, missing and invalid clocks fail closed',()=>{
 const s=source('fdic_bankfind',{source_updated_at:'2026-01-01'}),first=project([s]),later=project([s],{createdAt:'2027-01-01T00:00:00.000Z'});
 assert.deepEqual(first.rows,later.rows);assert.equal(first.rows[0].qualification,'measured-stale-review-due');
 assert.equal(project([source('fdic_bankfind',{source_updated_at:'2027-01-01'})]).rows[0].qualification,'unmeasured');
 assert.equal(project([source('fdic_bankfind',{})]).rows[0].qualification,'unmeasured');
 assert.throws(()=>project([s],{asOf:undefined}),/clocks/);assert.throws(()=>project([s],{createdAt:'2025-01-01T00:00:00.000Z'}),/clocks/);
});
test('zero and absent pairs remain different; count/membership/metadata drift rejects',()=>{
 const s=source();s.zip_rows_with_contribution=0;s.zip_level_counts.retailer_count=0;
 const p=createZipActiveEvidenceProjection({sources:[s],asOf,createdAt});p.add(zip([s]));p.add(zip([],'00502'));const value=p.finish();assert.equal(value.zip_members,2);assert.equal(value.rows.length,1);assert.equal(value.rows[0].eligible_evidence_counts_by_unit.retailer_count,0);
 for(const mutate of [row=>row.source_contributions.usda_snap_retailers.retailer_count=-1,row=>row.source_contributions.usda_snap_retailers.source_release_id='wrong',row=>row.source_contributions.usda_snap_retailers.source_updated_at='2026-10-01',row=>row.source_contributions.usda_snap_retailers.unapproved_count=1]){
  const original=source(),builder=createZipActiveEvidenceProjection({sources:[original],asOf,createdAt}),row=zip([original]);mutate(row);assert.throws(()=>{builder.add(row);builder.finish();});
 }
 const missing=createZipActiveEvidenceProjection({sources:[source()],asOf,createdAt});assert.throws(()=>missing.finish(),/conservation/);
 const duplicate=createZipActiveEvidenceProjection({sources:[source()],asOf,createdAt});duplicate.add(zip([source()]));assert.throws(()=>duplicate.add(zip([source()])),/Duplicate/);
 assert.throws(()=>createZipActiveEvidenceProjection({sources:[source(),source()],asOf,createdAt}));
});

async function fixture(t){
 await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/zip-qualification-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});const bytes=typeof value==='string'?value:JSON.stringify(value);await writeFile(file,bytes);return {sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};};
 const registry={dataset_id:'national-business-registry',release_id:'registry-fixture',schema_version:'1.0.0',status:'published-partial',publisher:{id:'national-business-registry',version:'2.15.0'},coverage:{resolution_location_profiles:2}};
 const rp=path.join(root,'data/business-registry/current.json'),rmf=path.join(root,'data/business-registry/releases/registry-fixture/manifest.json');const registryHash=await put(rmf,registry);await put(rp,{dataset_id:registry.dataset_id,release_id:registry.release_id,manifest:'releases/registry-fixture/manifest.json'});
 const dependencies=[['national-business-registry','registry_release_id'],['us-census-geography','geography_release_id'],['us-census-zcta-jurisdiction-crosswalk','zcta_jurisdiction_crosswalk_release_id'],['national-business-entity-resolution','entity_resolution_release_id'],['national-business-entity-resolution-benchmark','entity_resolution_benchmark_release_id'],['census-nonemployer-baseline','census_nonemployer_release_id']];
 const lineage={transformation_version:'national-business-coverage-views@2.11.0',...Object.fromEntries(dependencies.map(([id,key])=>[key,id===registry.dataset_id?registry.release_id:`${id}-fixture`]))};
 const s={...source(),schema_version:'1.0.0',view_type:'source',lineage},z={...zip([s]),schema_version:'1.0.0',view_type:'zip',lineage};
 const dir=path.join(root,'data/business-coverage-views/releases/coverage-fixture'),artifacts=[];
 for(const [name,type,rows]of [['states','state-coverage-view-jsonl',[{schema_version:'1.0.0',view_type:'state',postal_abbreviation:'NY',complete_all_businesses:false,registry_evidence:{source_profile_counts_by_reported_address_state:{}},lineage}]],['sources','source-coverage-view-jsonl',[s]],['zips','zip-coverage-view-jsonl',[z]]]){const info=await put(path.join(dir,`${name}.jsonl`),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');artifacts.push({path:`${name}.jsonl`,artifact_type:type,record_count:rows.length,export_policy:'local-review-only',...info});}
 const manifest={schema_version:'1.0.0',dataset_id:'national-business-coverage-views',release_id:'coverage-fixture',status:'published-partial-local-aggregate',coverage:{location_profiles_assessed:2},dependencies:dependencies.map(([id,key])=>({dataset_id:id,release_id:lineage[key],...(id===registry.dataset_id?{manifest_sha256:registryHash.sha256,publisher_version:'2.15.0'}:{})})),artifacts};
 await put(path.join(dir,'manifest.json'),manifest);await put(path.join(root,'data/business-coverage-views/current.json'),{dataset_id:manifest.dataset_id,release_id:manifest.release_id,manifest:'releases/coverage-fixture/manifest.json'});
 return {root,dir,manifest,put,rp};
}
test('file-backed build pins published chain and independently replays projection forgery',async t=>{
 const {root,dir}=await fixture(t),value=await buildZipActiveEvidenceQualification({root,asOf,createdAt});
 assert.equal(value.rows.length,1);assert.equal(value.bindings.registry.release_id,'registry-fixture');assert.equal((await verifyZipActiveEvidenceQualification(value,{root})).verified,true);
 const forged=structuredClone(value);forged.rows[0].eligible_evidence_counts_by_unit.retailer_count=99;await assert.rejects(verifyZipActiveEvidenceQualification(forged,{root}),/replay mismatch/);
 await writeFile(path.join(dir,'zips.jsonl'),(await readFile(path.join(dir,'zips.jsonl'),'utf8')).replace('retailer_count":2','retailer_count":1'));
 await assert.rejects(buildZipActiveEvidenceQualification({root,asOf,createdAt}),/integrity|conservation/);
});
test('file-backed builder rejects unbound registry, rehashed counts and cancellation',async t=>{
 const {root,dir,manifest,put,rp}=await fixture(t),controller=new AbortController();controller.abort();await assert.rejects(buildZipActiveEvidenceQualification({root,asOf,createdAt,signal:controller.signal}),/abort/i);
 const zipPath=path.join(dir,'zips.jsonl'),modified=(await readFile(zipPath,'utf8')).replace('retailer_count":2','retailer_count":1');const changed=await put(zipPath,modified);Object.assign(manifest.artifacts.find(a=>a.path==='zips.jsonl'),changed);await put(path.join(dir,'manifest.json'),manifest);await assert.rejects(buildZipActiveEvidenceQualification({root,asOf,createdAt}),/conservation/);
 await put(rp,{dataset_id:'national-business-registry',release_id:'another',manifest:'releases/another/manifest.json'});await assert.rejects(buildZipActiveEvidenceQualification({root,asOf,createdAt}));
});
test('in-flight cancellation rejects before returning any projection',async t=>{
 const {root}=await fixture(t),controller=new AbortController();
 const pending=buildZipActiveEvidenceQualification({root,asOf,createdAt,signal:controller.signal});
 setImmediate(()=>controller.abort());await assert.rejects(pending,/abort/i);
});
test('internal snapshot or source policy cannot be relabeled by a local-review-only ZIP artifact',async t=>{
 for(const mode of ['snapshot','source']){
  const {root,dir,manifest,put}=await fixture(t);
  if(mode==='snapshot')manifest.artifacts.find(row=>row.path==='sources.jsonl').export_policy='internal';
  else{
   const sourcePath=path.join(dir,'sources.jsonl'),row=JSON.parse(await readFile(sourcePath,'utf8'));row.export_policy='internal';
   Object.assign(manifest.artifacts.find(item=>item.path==='sources.jsonl'),await put(sourcePath,`${JSON.stringify(row)}\n`));
  }
  await put(path.join(dir,'manifest.json'),manifest);
  const value=await buildZipActiveEvidenceQualification({root,asOf,createdAt});
  assert.equal(value.bindings.zip_artifact.export_policy,'local-review-only');assert.equal(value.claims.export_policy,'internal');assert.equal(value.bindings.export_policy.effective,'internal');
  assert.equal(value.bindings.export_policy.upstream[mode==='snapshot'?'coverage_snapshot':'source:usda_snap_retailers'],'internal');
  assert.equal((await verifyZipActiveEvidenceQualification(value,{root})).verified,true);
  value.claims.export_policy='local-review-only';value.bindings.export_policy.effective='local-review-only';
  await assert.rejects(verifyZipActiveEvidenceQualification(value,{root}),/replay mismatch/);
 }
 assert.throws(()=>project([source()],{upstreamExportPolicies:{coverage_snapshot:'public'}}),/Unsupported upstream export policy/);
});
test('shared ZIP reader cancellation after an emitted row closes the iterator and permits fixture cleanup',async t=>{
 const {dir,put}=await fixture(t),file=path.join(dir,'cancellation.jsonl');
 const row={padding:'x'.repeat(60000)},body=`${JSON.stringify(row)}\n${JSON.stringify(row)}\n`;await put(file,body);
 const controller=new AbortController(),iterator=mnSelectionReadLines(file,Buffer.byteLength(body),controller.signal,{});
 assert.deepEqual((await iterator.next()).value,row);controller.abort();
 await assert.rejects(iterator.next(),/abort/i);assert.equal((await iterator.next()).done,true);
 await rm(file);await put(file,'{}\n');assert.equal(await readFile(file,'utf8'),'{}\n');
});
