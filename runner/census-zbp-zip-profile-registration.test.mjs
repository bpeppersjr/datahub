import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function regular(relative){assert.ok(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).includes('..'));const file=path.join(APP_ROOT,relative),stat=await lstat(file);assert.equal(await realpath(file),file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);return {file,stat};}
async function read(relative){const {file,stat}=await regular(relative);assert.ok(stat.size<=2000000);const bytes=await readFile(file);assert.ok(bytes.length<=2000000);return bytes;}
async function fixture(){const catalog=JSON.parse(await read('config/datasets/census-zbp-zip-profile-index.json')),bytes=await read(catalog.retained_release.manifest);return {catalog,bytes};}
function reconcile(catalog,bytes){
 const m=JSON.parse(bytes),r=catalog.retained_release;
 assert.equal(catalog.dataset_id,'census-zbp-zip-profile-index');assert.equal(catalog.schema_version,'1.0.0');assert.equal(catalog.status,'registered-local-lookup-index');assert.equal(catalog.release_only,true);assert.equal(catalog.runtime_pointer,null);assert.equal(catalog.export_policy,'local-review-only');
 for(const key of ['production_enrollment','national_reporting_denominator_enrollment','current_pointer_written'])assert.equal(catalog[key],false);
 assert.equal(r.manifest,`data/census-zbp-zip-profile-index/releases/${m.release_id}/manifest.json`);assert.equal(r.manifest_sha256,hash(bytes));assert.equal(r.manifest_sha256,'485f19b9715eb3807ef4d6dfa5a98c353645690f47c3b55a52b16487933e316d');assert.equal(r.manifest_bytes,bytes.length);assert.equal(bytes.length,7236);
 assert.equal(r.manifest_schema_version,m.schema_version);assert.equal(m.schema_version,'census-zbp-zip-profile-index@1.0.0');assert.equal(m.status,'immutable-local-lookup-index');
 for(const key of ['release_id','status','created_at','source_rows','indexed_zip_count','bindings','artifacts'])assert.deepEqual(r[key],m[key]);
 assert.equal(r.created_at,'2026-10-02T21:30:00.000Z');assert.equal(r.source_rows,2974116);assert.equal(r.indexed_zip_count,37828);assert.equal(r.artifact_count,m.artifacts.length);assert.equal(r.artifact_count,20);
 assert.equal(r.artifact_bytes,m.artifacts.reduce((s,a)=>s+a.bytes,0));assert.equal(r.artifact_bytes,2015507248);assert.equal(r.artifact_inventory_sha256,hash(JSON.stringify(m.artifacts)));assert.equal(r.artifact_inventory_hash_encoding,'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order');
 for(let i=0;i<10;i++){
  const p=m.artifacts[i*2],ix=m.artifacts[i*2+1];assert.equal(p.path,`profiles-${i}.jsonl`);assert.equal(ix.path,`index-${i}.json`);assert.equal(p.profiles,ix.profiles);for(const a of [p,ix]){assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(a.bytes)&&a.bytes>0);assert.ok(Number.isSafeInteger(a.profiles)&&a.profiles>0);}assert.ok(p.bytes<=512000000&&ix.bytes<=2000000);
 }
 assert.equal(m.artifacts.filter(a=>a.path.startsWith('profiles-')).reduce((s,a)=>s+a.profiles,0),37828);assert.equal(m.artifacts.filter(a=>a.path.startsWith('profiles-')).reduce((s,a)=>s+a.industry_rows,0),2974116);
 assert.deepEqual(catalog.claims,m.claims);assert.deepEqual(catalog.claims,{export_policy:'local-review-only',reference_year:2023,hierarchical_aggregation_permitted:false,zip4:null,current_operations_verified:false,current_operating_business_count:null,gdp:null,all_business_completion_percent:null,network_requests:0,current_pointer_written:false,production_enrollment:false});return m;
}
test('ZBP profile registration reconciles exact retained metadata, inventory, year, source and geography policy pins',async()=>{
 const {catalog,bytes}=await fixture(),m=reconcile(catalog,bytes),b=m.bindings,base=path.posix.dirname(catalog.retained_release.manifest);
 assert.deepEqual((await readdir(path.join(APP_ROOT,base))).sort(),['manifest.json',...m.artifacts.map(a=>a.path)].sort());for(const a of m.artifacts)assert.equal((await regular(`${base}/${a.path}`)).stat.size,a.bytes);
 const pointerBytes=await read(b.pointer_path),manifestBytes=await read(b.manifest_path),pointer=JSON.parse(pointerBytes),source=JSON.parse(manifestBytes);assert.equal(hash(pointerBytes),b.pointer_sha256);assert.equal(hash(manifestBytes),b.manifest_sha256);assert.equal(pointer.release_id,b.release_id);assert.equal(source.release_id,b.release_id);assert.equal(source.reference_year,b.reference_year);assert.equal(b.reference_year,2023);assert.equal(source.coverage.industry_detail_rows,m.source_rows);assert.equal(source.coverage.union_zip_codes,m.indexed_zip_count);
 assert.equal(b.artifacts.length,12);for(const a of b.artifacts)assert.deepEqual(a,source.artifacts.find(s=>s.path===a.path));assert.equal(b.artifacts.filter(a=>a.partition!==undefined).reduce((s,a)=>s+a.record_count,0),2974116);
 const gpBytes=await read('data/geography/current.json'),gp=JSON.parse(gpBytes),gmBytes=await read(`data/geography/${gp.manifest}`);assert.equal(hash(gpBytes),b.geography.pointer_sha256);assert.equal(hash(gmBytes),b.geography.manifest_sha256);assert.equal(gp.release_id,b.geography.release_id);assert.equal(JSON.parse(gmBytes).release_id,gp.release_id);assert.deepEqual(source.geography_dependency,b.geography.dependency);assert.equal(b.geography.dependency.manifest_sha256,b.geography.manifest_sha256);
 const policyBytes=await read('config/source-policies/us-census-zbp.json'),policy=JSON.parse(policyBytes);assert.equal(hash(policyBytes),b.policy.sha256);assert.equal(policy.policy_id,b.policy.id);assert.equal(policy.version,b.policy.version);
});
test('ZBP registration rejects metadata drift, changed source bindings and semantic upgrades',async()=>{
 const {catalog,bytes}=await fixture();
 for(const mutate of [c=>{c.retained_release.manifest_sha256='0'.repeat(64);},c=>{c.retained_release.created_at='2026-10-03T00:00:00.000Z';},c=>{c.retained_release.artifact_inventory_sha256='0'.repeat(64);},c=>{c.retained_release.artifact_bytes++;},c=>{c.retained_release.indexed_zip_count++;},c=>{c.retained_release.source_rows++;},c=>{c.retained_release.bindings.policy.sha256='0'.repeat(64);},c=>{c.retained_release.bindings.geography.manifest_sha256='0'.repeat(64);},c=>{c.runtime_pointer='current.json';},c=>{c.production_enrollment=true;},c=>{c.national_reporting_denominator_enrollment=true;},c=>{c.export_policy='public';},c=>{c.claims.current_operations_verified=true;},c=>{c.claims.hierarchical_aggregation_permitted=true;},c=>{c.claims.gdp=1;},c=>{c.claims.all_business_completion_percent=100;},c=>{c.claims.zip4='1234';}]){const changed=structuredClone(catalog);mutate(changed);assert.throws(()=>reconcile(changed,bytes));}
});
