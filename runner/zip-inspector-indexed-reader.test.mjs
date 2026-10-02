import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {publishRegistryZipQualityIndex} from './registry-zip-quality-index.mjs';
import {publishCoverageZipViewIndex} from './coverage-zip-view-index.mjs';
import {readIndexedZipInspectorEvidence as read} from './zip-inspector-indexed-reader.mjs';
import {createZipInspectorView} from './zip-inspector-view.mjs';
import {businessMapCategoryMetadata} from './business-map-store.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex'),bytes=x=>Buffer.from(`${JSON.stringify(x)}\n`),createdAt='2026-10-02T20:00:00.000Z';
async function fixture(t){
 await fs.mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zip-inspector-indexed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 async function put(relative,value){const raw=Buffer.isBuffer(value)?value:bytes(value),file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,raw);return {file,sha:hash(raw),bytes:raw.length};}
 async function current(folder,m){const relative=`data/${folder}/releases/${m.release_id}/manifest.json`,manifest=await put(relative,m),p={dataset_id:m.dataset_id,release_id:m.release_id,manifest:`releases/${m.release_id}/manifest.json`},pointer=await put(`data/${folder}/current.json`,p);return {relative,manifest,pointer};}
 const gm={dataset_id:'us-census-geography',release_id:'geo-1',artifacts:[{path:'zcta.jsonl',sha256:'a'.repeat(64),record_count:1}]},g=await current('geography',gm);
 const rows=['00000','00501','00601'].map(zip=>({zip_code:zip,postal_code:zip,zip4:null,registry_coverage:{status:'record-level-source-contribution'},geography:zip==='00601'?{status:'2020-zcta-polygon-available',geo_id:'zcta:00601',geoid:'00601',provenance:{source_release_id:'geo-1'}}:{status:'not-observed-in-integrated-census-coverage-union'},current_usps_validity:{status:'unverified',reason:'Unverified retained evidence.'},source_contributions:{'usda-snap-current-retailers':{records:zip==='00501'?0:2,source_release_id:'snap-1'}}}));
 const raw=Buffer.concat(rows.map(bytes)),ra=await put('data/business-registry/releases/registry-1/derived/zip-coverage.jsonl',raw);
 const rm={dataset_id:'national-business-registry',release_id:'registry-1',status:'published-partial',complete_national_business_registry:false,publisher:{version:'2.15.0'},export_policy:'Mixed source description.',dependencies:[{dataset_id:gm.dataset_id,release_id:gm.release_id,manifest_sha256:g.manifest.sha}],artifacts:[{path:'derived/zip-coverage.jsonl',artifact_type:'registry-zip-coverage-jsonl',bytes:raw.length,record_count:rows.length,sha256:ra.sha,distribution_policy:'local-review-only'}]},r=await current('business-registry',rm);
 await put('config/zip-quality-view-enrollment.json',{schema_version:'1.0.0',cohort_id:'production-current',pointer_path:'data/business-registry/current.json',release_id:rm.release_id,pointer_sha256:r.pointer.sha,manifest_sha256:r.manifest.sha,zip_artifact_sha256:ra.sha});
 const crows=rows.map((row,i)=>({...row,complete_all_businesses:false,registry_coverage:{...row.registry_coverage,physical_site_count:i,establishment_count:i,organization_primary_location_count:0},spatial_zip_polygon_membership:{status:row.zip_code==='00601'?'included':'not-in-denominator'},employer_baseline:{status:'unavailable',establishments:null},jurisdiction_overlay:{relationships:[]},coverage_gap_codes:['unverified']})),craw=Buffer.concat(crows.map(bytes)),ca=await put('data/business-coverage-views/releases/coverage-1/views/zips.jsonl',craw);
 const cm={dataset_id:'national-business-coverage-views',release_id:'coverage-1',schema_version:'1.0.0',status:'published-partial-local-aggregate',created_at:'2026-10-01T00:00:00.000Z',complete_all_businesses:false,authoritative_current_usps_zip_denominator:null,publisher:{version:'2.15.0'},dependencies:[...rm.dependencies,{dataset_id:rm.dataset_id,release_id:rm.release_id,manifest_sha256:r.manifest.sha}],spatial_zip_polygon_denominator:{release_id:gm.release_id,geography_manifest_sha256:g.manifest.sha,geography_type:'census-zcta5',zip4_polygon_applicability:'not-applicable',zcta_index_artifact_path:'zcta.jsonl',zcta_index_artifact_sha256:'a'.repeat(64),count:1},artifacts:[{path:'views/zips.jsonl',artifact_type:'zip-coverage-view-jsonl',sha256:ca.sha,bytes:craw.length,record_count:crows.length,export_policy:'local-review-only'}]},c=await current('business-coverage-views',cm);
 await put('config/datasets/national-business-coverage-views.json',{dataset_id:cm.dataset_id,current_verified_release:{manifest:c.relative,manifest_sha256:c.manifest.sha,release_id:cm.release_id,publisher:cm.publisher,dependencies:cm.dependencies}});
 for(const [id,published]of [['registry-zip-quality-index',await publishRegistryZipQualityIndex({root,createdAt})],['coverage-zip-view-index',await publishCoverageZipViewIndex({root,createdAt})]]){
  const manifestPath=published.manifest_path??path.join(published.directory,'manifest.json'),raw=await fs.readFile(manifestPath),m=JSON.parse(raw),retained={release_id:m.release_id,manifest:path.relative(root,manifestPath).replaceAll('\\','/'),manifest_sha256:hash(raw),manifest_bytes:raw.length,manifest_schema_version:m.schema_version,status:m.status,created_at:m.created_at,indexed_zip_count:m.indexed_zip_count,bindings:m.bindings,artifact_count:m.artifacts.length,artifact_bytes:m.artifacts.reduce((n,a)=>n+a.bytes,0),artifact_inventory_sha256:hash(JSON.stringify(m.artifacts)),artifact_inventory_hash_encoding:'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order'};
  if(id==='coverage-zip-view-index')retained.source_zip_rows=m.source_zip_rows;else Object.assign(retained,{audit_summary_sha256:hash(JSON.stringify(m.audit_summary)),audit_counts:m.audit_summary.counts,audit_status:m.audit_summary.audit_status});
  await put(`config/datasets/${id}.json`,{dataset_id:id,schema_version:'1.0.0',status:'registered-local-lookup-index',release_only:true,runtime_pointer:null,production_enrollment:false,national_reporting_denominator_enrollment:false,current_pointer_written:false,export_policy:m.claims.export_policy,claims:m.claims,retained_release:retained});
 }
 return {root,put,r,c,g,ra,ca};
}
test('registered real fixture indexes preserve inspector response and complete taxonomy without full reads',async t=>{
 const f=await fixture(t),base=await read({root:f.root,zip:'00501'});assert.equal(base.coverage.records[0].physical_site_count,1);assert.equal(base.quality.usps_operational_evidence.operational_status,null);
 const legacy=createZipInspectorView({businessMap:{getCatalog:async()=>base.catalog},zipQualityView:async()=>base.quality,businessCoverageViews:{listDimension:async()=>base.coverage}}),indexed=createZipInspectorView({indexedEvidence:opts=>read({...opts,root:f.root}),businessMap:{getCatalog:()=>{throw Error('full map scan');}},businessCoverageViews:{listDimension:()=>{throw Error('full coverage scan');}},zipQualityView:()=>{throw Error('full registry audit');}});
 assert.deepEqual(await indexed({zip:'00501',categoryId:'childcare'}),await legacy({zip:'00501',categoryId:'childcare'}));
 const original=fs.open;let payload=0;const mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(![f.ra.file,f.ca.file].includes(file))return h;return {stat:h.stat.bind(h),close:h.close.bind(h),read:async(...args)=>{assert.equal(typeof args[3],'number');const r=await h.read(...args);payload+=r.bytesRead;return r;}};});
 try{const result=await read({root:f.root,zip:'00000'});assert.equal(result.quality.classification.class,'explicit-placeholder');await result.recheck();assert.ok(payload<65536);}finally{mock.mock.restore();}
 const absent=await read({root:f.root,zip:'00001'});assert.equal(absent.quality.found,false);assert.deepEqual(absent.coverage.records,[]);
 const categories=businessMapCategoryMetadata();assert.equal(Object.isFrozen(categories),true);assert.throws(()=>categories[1].source_ids.push('forged'));assert.deepEqual(base.catalog.categories,categories);
});
test('missing/corrupt registrations and exact current catalog, geography, registry drift never fall back',async t=>{
 for(const relative of ['config/datasets/registry-zip-quality-index.json','config/datasets/coverage-zip-view-index.json','config/datasets/national-business-coverage-views.json','data/business-registry/current.json','data/geography/current.json']){
  const f=await fixture(t);await fs.appendFile(path.join(f.root,relative),' ');if(relative.includes('-index.json'))await fs.writeFile(path.join(f.root,relative),'{}');await assert.rejects(read({root:f.root,zip:'00501'}));
 }
 const f=await fixture(t);await fs.unlink(path.join(f.root,'config/datasets/coverage-zip-view-index.json'));await assert.rejects(read({root:f.root,zip:'00501'}));
 await assert.rejects(read({root:f.root,zip:'00501',categoryId:'aggregate-baseline-context'}),e=>e.statusCode===400);
});
test('post-auxiliary recheck rejects late drift and all auxiliary loaders receive the request signal',async t=>{
 const f=await fixture(t),controller=new AbortController();let observed;
 const view=createZipInspectorView({indexedEvidence:opts=>read({...opts,root:f.root}),pharmacyCoverage:async({signal})=>{observed=signal;await fs.appendFile(f.r.pointer.file,' ');return null;}});
 await assert.rejects(view({zip:'00501',signal:controller.signal}));assert.equal(observed,controller.signal);
});
test('bounded base cancellation closes source handles and never calls legacy readers',async t=>{
 const f=await fixture(t),controller=new AbortController(),original=fs.open;let closed=false;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(file!==f.ra.file)return h;return {stat:h.stat.bind(h),close:async()=>{closed=true;await h.close();},read:async(...args)=>{const result=await h.read(...args);controller.abort();return result;}};});
 try{await assert.rejects(read({root:f.root,zip:'00501',signal:controller.signal}),/abort/i);}finally{mock.mock.restore();}assert.equal(closed,true);
});
test('installed indexed base remains bounded and compatible',{skip:process.env.DATAHUB_TEST_ZIP_INSPECTOR_INDEXED!=='1'},async()=>{
 const result=await read({zip:'00501',categoryId:'childcare'});assert.equal(result.quality.found,true);assert.equal(result.coverage.records.length,1);await result.recheck();assert.equal((await read({zip:'00001'})).quality.found,false);
});
