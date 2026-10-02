import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const expected={
 'registry-zip-quality-index':{manifest:'1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c',bytes:22997,artifacts:6051556},
 'coverage-zip-view-index':{manifest:'a10a0ae018d76b3923e7f2a788cfb7611e2c5a8616cf49fc93ea26bcae217b6e',bytes:17267,artifacts:6065062},
};
async function regular(relative){
 assert.ok(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).includes('..'));
 const file=path.join(APP_ROOT,relative),stat=await lstat(file);assert.equal(await realpath(file),file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);return {file,stat};
}
async function read(relative){const {file,stat}=await regular(relative);assert.ok(stat.size<=2000000);const b=await readFile(file);assert.ok(b.length<=2000000);return b;}
async function fixture(id){const c=JSON.parse(await read(`config/datasets/${id}.json`)),bytes=await read(c.retained_release.manifest);return {c,bytes};}
function reconcile(id,c,bytes){
 const m=JSON.parse(bytes),r=c.retained_release,e=expected[id];
 assert.equal(c.dataset_id,id);assert.equal(c.schema_version,'1.0.0');assert.equal(c.status,'registered-local-lookup-index');assert.equal(c.release_only,true);assert.equal(c.runtime_pointer,null);assert.equal(c.export_policy,'local-review-only');
 for(const k of ['production_enrollment','national_reporting_denominator_enrollment','current_pointer_written'])assert.equal(c[k],false);
 assert.equal(r.manifest,`data/${id}/releases/${m.release_id}/manifest.json`);assert.equal(r.manifest_sha256,hash(bytes));assert.equal(r.manifest_sha256,e.manifest);assert.equal(r.manifest_bytes,bytes.length);assert.equal(bytes.length,e.bytes);
 assert.equal(r.manifest_schema_version,m.schema_version);assert.equal(m.schema_version,`${id}@1.0.0`);assert.equal(m.status,'immutable-local-lookup-index');
 for(const k of ['release_id','status','created_at','indexed_zip_count','bindings'])assert.deepEqual(r[k],m[k]);
 assert.equal(r.created_at,'2026-10-02T20:00:00.000Z');assert.equal(r.indexed_zip_count,48194);
 assert.equal(r.artifact_count,m.artifacts.length);assert.equal(r.artifact_count,100);assert.equal(r.artifact_bytes,m.artifacts.reduce((s,a)=>s+a.bytes,0));assert.equal(r.artifact_bytes,e.artifacts);
 assert.equal(r.artifact_inventory_sha256,hash(JSON.stringify(m.artifacts)));assert.equal(r.artifact_inventory_hash_encoding,'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order');assert.equal(m.artifacts.reduce((s,a)=>s+a.zip_count,0),48194);
 for(const [i,a]of m.artifacts.entries()){assert.equal(a.path,`zip-${String(i).padStart(2,'0')}.json`);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=256000);assert.ok(Number.isSafeInteger(a.zip_count)&&a.zip_count>0&&a.zip_count<=1000);}
 assert.deepEqual(c.claims,m.claims);assert.equal(c.claims.export_policy,'local-review-only');assert.equal(c.claims.network_requests,0);assert.equal(c.claims.current_operations_verified,false);
 for(const k of ['active_business_count','all_business_denominator','all_business_completion_percent'])assert.equal(c.claims[k],null);
 if(id==='coverage-zip-view-index'){assert.equal(r.source_zip_rows,m.source_zip_rows);assert.equal(r.source_zip_rows,48194);assert.equal(c.claims.production_pointers_changed,false);assert.equal(c.claims.source_record_status_replayed,false);}
 else{
  assert.equal(r.audit_summary_sha256,hash(JSON.stringify(m.audit_summary)));assert.deepEqual(r.audit_counts,m.audit_summary.counts);assert.equal(r.audit_status,m.audit_summary.audit_status);assert.equal(r.audit_status,'passed-with-unresolved-proof-gaps');
  assert.equal(r.audit_counts.zip5_rows,48194);assert.equal(r.audit_counts.governed_census_zcta_members,33791);assert.equal(r.audit_counts.record_level_source_contribution_zip5,47995);assert.equal(r.audit_counts.denominator_only_zip5,199);assert.equal(r.audit_counts.explicit_placeholder_zip5,1);assert.equal(r.audit_counts.source_reported_zip5_outside_governed_census_zcta,14361);assert.equal(r.audit_counts.denominator_only_zip5_outside_governed_census_zcta,41);assert.equal(r.audit_counts.usps_operational_status_unverified,48194);
  for(const k of ['current_pointer_written','production_enrollment','zip4_is_geometric','build_time_refreshes_source'])assert.equal(c.claims[k],false);assert.equal(m.bindings.usps_reconciliation,null);
 }
 return m;
}
async function pointer(binding){
 const p=await read(binding.pointer_path),m=await read(binding.manifest_path);assert.equal(hash(p),binding.pointer_sha256);assert.equal(hash(m),binding.manifest_sha256);
 assert.equal(JSON.parse(p).release_id,binding.release_id);assert.equal(JSON.parse(m).release_id,binding.release_id);return JSON.parse(m);
}
for(const id of Object.keys(expected)){
 test(`${id} metadata registration exactly reconciles native inventory, policy and source lineage`,async()=>{
  const {c,bytes}=await fixture(id),m=reconcile(id,c,bytes),base=path.posix.dirname(c.retained_release.manifest),b=m.bindings;
  assert.deepEqual((await readdir(path.join(APP_ROOT,base))).sort(),['manifest.json',...m.artifacts.map(a=>a.path)].sort());for(const a of m.artifacts)assert.equal((await regular(`${base}/${a.path}`)).stat.size,a.bytes);
  if(id==='coverage-zip-view-index'){
   assert.equal(hash(await read('config/datasets/national-business-coverage-views.json')),b.coverage_catalog_sha256);
   const coverage=await pointer(b.coverage),registry=await pointer(b.registry),geo=await pointer(b.geography);
   assert.deepEqual(coverage.dependencies,b.dependencies);assert.deepEqual(coverage.spatial_zip_polygon_denominator,b.spatial_zip_polygon_denominator);assert.deepEqual(coverage.artifacts.find(a=>a.path==='views/zips.jsonl'),b.zip_artifact);
   for(const item of [b.registry,b.geography]){const d=b.dependencies.find(d=>d.release_id===item.release_id);assert.equal(d.manifest_sha256,item.manifest_sha256);}
   assert.ok(registry.dependencies.filter(d=>d.dataset_id==='us-census-geography').every(d=>d.release_id===geo.release_id&&d.manifest_sha256===b.geography.manifest_sha256));
   const a=geo.artifacts.find(a=>a.path===b.spatial_zip_polygon_denominator.zcta_index_artifact_path);assert.equal(a.sha256,b.spatial_zip_polygon_denominator.zcta_index_artifact_sha256);assert.equal(a.record_count,33791);assert.equal(coverage.authoritative_current_usps_zip_denominator,null);
  }else{
   const enrollmentBytes=await read('config/zip-quality-view-enrollment.json'),enrollment=JSON.parse(enrollmentBytes);assert.equal(hash(enrollmentBytes),b.enrollment_sha256);assert.equal(enrollment.cohort_id,b.cohort_id);assert.equal(enrollment.zip_artifact_sha256,b.zip_artifact.sha256);
   const registry=await pointer({pointer_path:b.registry_pointer_path,pointer_sha256:b.registry_pointer_sha256,manifest_path:b.registry_manifest_path,manifest_sha256:b.registry_manifest_sha256,release_id:b.registry_release_id});
   assert.equal(registry.publisher.version,b.registry_publisher_version);const a=registry.artifacts.find(a=>a.path===b.zip_artifact.path);for(const [k,v]of Object.entries(b.zip_artifact))assert.deepEqual(a[k],v);
   assert.equal(a.distribution_policy,b.policy_basis.artifact_distribution_policy);assert.equal(a.export_policy??null,b.policy_basis.artifact_export_policy);assert.equal(registry.export_policy??null,b.policy_basis.manifest_description_non_authorizing);assert.equal(hash(await read('runner/zip-denominator-audit.mjs')),b.audit_implementation_sha256);
  }
 });
 test(`${id} registration rejects clocks, pins, source binding, counts and upgraded claims`,async()=>{
  const {c,bytes}=await fixture(id);
  for(const mutate of [v=>{v.retained_release.manifest_sha256='0'.repeat(64);},v=>{v.retained_release.created_at='2026-10-03T00:00:00.000Z';},v=>{v.retained_release.artifact_inventory_sha256='0'.repeat(64);},v=>{v.retained_release.artifact_bytes++;},v=>{v.retained_release.indexed_zip_count++;},v=>{v.retained_release.bindings.zip_artifact.sha256='0'.repeat(64);},v=>{v.runtime_pointer='current.json';},v=>{v.production_enrollment=true;},v=>{v.national_reporting_denominator_enrollment=true;},v=>{v.export_policy='public';},v=>{v.claims.current_operations_verified=true;},v=>{v.claims.all_business_completion_percent=100;},...(id==='registry-zip-quality-index'?[v=>{v.retained_release.audit_counts.denominator_only_zip5++;},v=>{v.retained_release.audit_summary_sha256='0'.repeat(64);}]:[])]){
   const changed=structuredClone(c);mutate(changed);assert.throws(()=>reconcile(id,changed,bytes));
  }
 });
}
