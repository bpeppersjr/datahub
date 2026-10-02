import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {APP_ROOT} from './paths.mjs';
import {publishCensusZbpZipProfileIndex as publish} from './census-zbp-zip-profile-index.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),raw=v=>Buffer.from(`${JSON.stringify(v)}\n`),clock='2026-10-02T00:00:00.000Z';
const sizes=['size_1_4','size_5_9','size_10_19','size_20_49','size_50_99','size_100_249','size_250_499','size_500_999','size_1000_plus'];
const columns=['zip_code','naics_code','establishments',...sizes.flatMap(k=>[k,`${k}_suppression_code`]),'preferred_city','preferred_state','county_name'];
async function fixture(t,{duplicate=false}={}){
 const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zbp-zip-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 async function write(relative,value){const file=path.join(root,relative),b=Buffer.isBuffer(value)?value:raw(value);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);return b;}
 const geo={schema_version:'1.0.0',dataset_id:'us-census-geography',release_id:'geo-fixture',artifacts:[]},gb=await write('data/geography/releases/geo-fixture/manifest.json',geo);
 await write('data/geography/current.json',{dataset_id:geo.dataset_id,release_id:geo.release_id,manifest:'releases/geo-fixture/manifest.json'});
 await write('config/source-policies/us-census-zbp.json',JSON.parse(await fs.readFile(path.join(APP_ROOT,'config/source-policies/us-census-zbp.json'))));
 const base='data/business-baselines/census-zbp/releases/zbp-fixture',artifacts=[];
 async function artifact(p,b,type,n,partition){await write(`${base}/${p}`,b);artifacts.push({path:p,bytes:b.length,sha256:sha(b),record_count:n,artifact_type:type,...(partition!==undefined?{partition}: {})});}
 const cover=['00501','00502','99999'].map(zip=>({zip_code:zip,reference_year:2023,geography:{status:zip==='99999'?'not-observed':'2020-zcta-polygon-available',geoid:zip==='99999'?null:zip},baseline:{establishments:zip==='00502'?null:0}}));
 await artifact('derived/zip-coverage.jsonl',Buffer.concat(cover.map(raw)),'zip-coverage-union-jsonl',3);
 await artifact('derived/naics-coverage.jsonl',Buffer.concat(['23----','236---'].map(naics_code=>raw({naics_code}))),'naics-coverage-jsonl',2);
 function row(zip,code){const r=Object.fromEntries(columns.map(k=>[k,'']));Object.assign(r,{zip_code:zip,naics_code:code,establishments:'0',size_1_4:'0',size_5_9_suppression_code:'D',preferred_city:'Publisher label',preferred_state:'NY',county_name:'Not an assignment'});return columns.map(k=>r[k]).join(',');}
 for(let i=0;i<10;i++){const rows=i===0?[row('00501','23----'),row('00501',duplicate?'23----':'236---')]:i===9?[row('99999','23----')]:[];await artifact(`derived/zip-naics/prefix=${i}.csv.gz`,gzipSync(`${columns.join(',')}\n${rows.length?`${rows.join('\n')}\n`:''}`),'normalized-zbp-naics-csv-gzip',rows.length,String(i));}
 const manifest={schema_version:'1.0.0',dataset_id:'census-zbp-baseline',release_id:'zbp-fixture',reference_year:2023,retrieved_at:'2026-01-01T00:00:00.000Z',complete_national_release:true,coverage:{industry_detail_rows:3},geography_dependency:{release_id:geo.release_id,manifest_sha256:sha(gb)},artifacts};await write(`${base}/manifest.json`,manifest);await write('data/business-baselines/census-zbp/current.json',{dataset_id:manifest.dataset_id,release_id:manifest.release_id,manifest:'releases/zbp-fixture/manifest.json'});
 return{root,write,base,manifest,source:path.join(root,base,artifacts[2].path)};
}

import {readRegisteredCensusZbpZipProfile as read} from './census-zbp-zip-profile-reader.mjs';
import {createZipInspectorView} from './zip-inspector-view.mjs';
import {zipInspectorHttp} from './zip-inspector-http.mjs';
import {readIndexedZipInspectorEvidence} from './zip-inspector-indexed-reader.mjs';
import {readZipEvidenceQualification} from './zip-evidence-qualification-reader.mjs';
import {readZipOperationalAdmission} from './zip-inspector-governance.mjs';
async function enrolled(t){
 const f=await fixture(t),r=await publish({root:f.root,createdAt:clock}),rawManifest=await fs.readFile(r.manifest_path),m=JSON.parse(rawManifest);
 const registration={dataset_id:'census-zbp-zip-profile-index',schema_version:'1.0.0',status:'registered-local-lookup-index',release_only:true,runtime_pointer:null,production_enrollment:false,national_reporting_denominator_enrollment:false,current_pointer_written:false,export_policy:'local-review-only',retained_release:{release_id:m.release_id,manifest:path.relative(f.root,r.manifest_path).replaceAll('\\','/'),manifest_sha256:sha(rawManifest),manifest_bytes:rawManifest.length,manifest_schema_version:m.schema_version,status:m.status,created_at:m.created_at,source_rows:m.source_rows,indexed_zip_count:m.indexed_zip_count,bindings:m.bindings,artifact_count:m.artifacts.length,artifact_bytes:m.artifacts.reduce((n,a)=>n+a.bytes,0),artifact_inventory_sha256:sha(JSON.stringify(m.artifacts)),artifact_inventory_hash_encoding:'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order',artifacts:m.artifacts},claims:m.claims,limitations:[],documentation:'fixture'};
 await f.write('config/datasets/census-zbp-zip-profile-index.json',registration);
 const registry={dataset_id:'national-business-registry',release_id:'registry-fixture',dependencies:[{dataset_id:'census-zbp-baseline',release_id:m.bindings.release_id,manifest_sha256:m.bindings.manifest_sha256}]};
 const rb=await f.write('data/business-registry/releases/registry-fixture/manifest.json',registry);
 await f.write('data/business-registry/current.json',{dataset_id:registry.dataset_id,release_id:registry.release_id,manifest:'releases/registry-fixture/manifest.json'});
 return {...f,r,registration,catalog:{registry_release_id:registry.release_id,registry_manifest_sha256:sha(rb),geography_release_id:m.bindings.geography.release_id,geography_manifest_sha256:m.bindings.geography.manifest_sha256}};
}
test('registered bounded reader preserves zero, suppression, absent and denominator-only profiles',async t=>{
 const f=await enrolled(t);
 for(const [zip,status]of [['00501','published-industry-rows'],['00502','no-published-industry-rows'],['00001',null]]){
  const r=await read({root:f.root,zip,catalog:f.catalog});assert.equal(r.value.available,true);assert.equal(r.value.profile?.status??null,status);await r.recheck();
  if(zip==='00501'){assert.equal(r.value.profile.industry_rows[0].establishments,0);assert.equal(r.value.profile.industry_rows[0].size_5_9,null);assert.equal(r.value.profile.industry_rows[0].size_5_9_suppression_code,'D');}
 }
});
test('registration tamper, category override, selected registry mismatch and abort reject',async t=>{
 const f=await enrolled(t);
 await assert.rejects(read({root:f.root,zip:'00501',categoryId:'all'}));
 await assert.rejects(read({root:f.root,zip:'00501',catalog:{...f.catalog,registry_manifest_sha256:'f'.repeat(64)}}));
 const controller=new AbortController();controller.abort();await assert.rejects(read({root:f.root,zip:'00501',signal:controller.signal}),{name:'AbortError'});
 f.registration.retained_release.artifact_bytes++;await f.write('config/datasets/census-zbp-zip-profile-index.json',f.registration);await assert.rejects(read({root:f.root,zip:'00501'}));
});
test('post-auxiliary registration and source policy drift is rejected by recheck',async t=>{
 const f=await enrolled(t),r=await read({root:f.root,zip:'00501'});await fs.appendFile(path.join(f.root,'config/source-policies/us-census-zbp.json'),' ');await assert.rejects(r.recheck());
});
test('missing registration and profile tamper fail without scans; cancellation drains positional handle',async t=>{
 const f=await enrolled(t),registrationPath=path.join(f.root,'config/datasets/census-zbp-zip-profile-index.json');await fs.rename(registrationPath,`${registrationPath}.saved`);await assert.rejects(read({root:f.root,zip:'00501'}));await fs.rename(`${registrationPath}.saved`,registrationPath);
 const file=path.join(path.dirname(f.r.manifest_path),'profiles-0.jsonl'),original=fs.open,controller=new AbortController();let closed=false;
 t.mock.method(fs,'open',async function(name,...args){const h=await original.call(this,name,...args);if(String(name)===file){const read=h.read.bind(h),close=h.close.bind(h);h.read=async(...a)=>{const result=await read(...a);controller.abort();return result;};h.close=async()=>{closed=true;await close();};}return h;});
 await assert.rejects(read({root:f.root,zip:'00501',signal:controller.signal}),{name:'AbortError'});assert.equal(closed,true);t.mock.restoreAll();
 const raw=await fs.readFile(file);raw[20]=32;await fs.writeFile(file,raw);await assert.rejects(read({root:f.root,zip:'00501'}));
});
test('view nests ZIP-wide profile; late drift becomes unavailable without changing ordinary counts',async t=>{
 const f=await enrolled(t),catalog={...f.catalog,available:true,coverage_release_id:'coverage-fixture',categories:[{id:'all',label:'All'}]};
 const base=()=>({catalog,quality:{found:false,bindings:{release_id:catalog.registry_release_id,manifest_sha256:catalog.registry_manifest_sha256}},coverage:{available:true,release_id:catalog.coverage_release_id,records:[]},recheck:async()=>{}});
 const view=createZipInspectorView({indexedEvidence:async()=>base(),censusZbpProfile:opts=>read({...opts,root:f.root})});
 const result=await view({zip:'00501'});assert.equal(result.counts,null);assert.equal(result.census_zbp_industry_profile.profile.industry_rows.length,2);
 const failed=createZipInspectorView({indexedEvidence:async()=>base(),censusZbpProfile:async opts=>{const r=await read({...opts,root:f.root});return {...r,recheck:async()=>{throw Error('drift');}};}});
 const unavailable=await failed({zip:'00501'});assert.equal(unavailable.census_zbp_industry_profile.available,false);assert.equal(unavailable.counts,null);
 let response;await zipInspectorHttp({method:'GET'},{},new URL('http://local/?zip=00501'),async()=>result,(_r,status,body)=>response={status,body});assert.equal(response.status,200);assert.deepEqual(response.body.census_zbp_industry_profile,result.census_zbp_industry_profile);
});
test('native maximum profile fits existing response ceiling without full replay',{skip:process.env.DATAHUB_TEST_ZBP_ZIP_PROFILE!=='1'},async()=>{
 const registration=JSON.parse(await fs.readFile(path.join(APP_ROOT,'config/datasets/census-zbp-zip-profile-index.json'))),p=registration.retained_release,dir=path.dirname(path.join(APP_ROOT,p.manifest));let maximum=null;
 for(let i=0;i<10;i++){const bucket=JSON.parse(await fs.readFile(path.join(dir,`index-${i}.json`)));for(const row of bucket)if(!maximum||row.bytes>maximum.bytes)maximum=row;}
 const r=await read({zip:maximum.zip5});assert.equal(r.value.available,true);assert.equal(r.value.profile.industry_rows.length,maximum.industry_rows);await r.recheck();
 const view=createZipInspectorView({indexedEvidence:readIndexedZipInspectorEvidence,qualificationReader:readZipEvidenceQualification,operationalAdmission:readZipOperationalAdmission,censusZbpProfile:read});
 let status,body;await zipInspectorHttp({method:'GET'},{},new URL(`http://local/?zip=${maximum.zip5}`),view,(_r,s,b)=>{status=s;body=b;});assert.equal(status,200);assert.equal(body.census_zbp_industry_profile.available,true);assert.ok(Buffer.byteLength(JSON.stringify(body))<2000000);console.log(JSON.stringify({maximumNativeZip:maximum.zip5,profileBytes:maximum.bytes,envelopeBytes:Buffer.byteLength(JSON.stringify(body)),industryRows:maximum.industry_rows}));
});

