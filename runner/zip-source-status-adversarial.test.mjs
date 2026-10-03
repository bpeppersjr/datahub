import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cp,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {publishZipSourceStatusIndex,readValidatedZipSourceStatus,readZipSourceStatusEnvelope,ZIP_SOURCE_STATUS_TEST_HOOKS} from './zip-source-status-index.mjs';

const release='zip-source-native-status-f6ae96364838baab402d8bcd487cac04059f910af1b71bb9da6bf19424d50640';
const sourceDir=path.join(APP_ROOT,'data/zip-source-native-status-distribution/releases',release);
const sha=b=>createHash('sha256').update(b).digest('hex');
const row=(overrides={})=>({id:'profile-1',source_id:'source-a',release_id:'release-a',kind:'present',status:'{"value":"native"}',observed:'2026-01-01T00:00:00.000Z',...overrides});
async function* values(items){for(const item of items)yield item;}

test('spill-backed conservation rejects duplicate profiles and preserves source/release/status clocks',async()=>{
 const good=await ZIP_SOURCE_STATUS_TEST_HOOKS.diskConservation(APP_ROOT,values([row(),row({id:'profile-2',kind:'null',status:'',observed:''})]));
 assert.equal(good.count,2);assert.equal(good.sources.length,1);assert.equal(good.sources[0].source_release_id,'release-a');assert.equal(good.sources[0].records,2);assert.equal(good.sources[0].status_present,1);assert.equal(good.sources[0].status_null,1);assert.equal(good.sources[0].observed_at_present,1);assert.equal(good.sources[0].observed_at_missing,1);
 await assert.rejects(ZIP_SOURCE_STATUS_TEST_HOOKS.diskConservation(APP_ROOT,values([row(),row()])),/Duplicate profile ID/);
});

test('profile contract rejects malformed ZIP, provenance, policy and resource bounds',()=>{
 const valid={zip_code:'00501',profile_id:'profile',source:{source_id:'source',source_release_id:'release'},export_policy:'local-review-only'};
 assert.equal(ZIP_SOURCE_STATUS_TEST_HOOKS.validateProfileForTest(valid),true);
 for(const mutation of [v=>v.zip_code='501',v=>v.profile_id='x'.repeat(513),v=>delete v.source.source_id,v=>delete v.source.source_release_id,v=>v.export_policy='public-export']){const value=structuredClone(valid);mutation(value);assert.throws(()=>ZIP_SOURCE_STATUS_TEST_HOOKS.validateProfileForTest(value));}
});

test('spill path propagates cancellation and removes owned scratch storage',async()=>{
 const before=new Set((await readdir(path.join(APP_ROOT,'data/tmp'))).filter(x=>x.startsWith('zip-status-db-'))),controller=new AbortController();controller.abort(new Error('cancelled'));
 await assert.rejects(ZIP_SOURCE_STATUS_TEST_HOOKS.diskConservation(APP_ROOT,values([row()]),controller.signal));
 const after=(await readdir(path.join(APP_ROOT,'data/tmp'))).filter(x=>x.startsWith('zip-status-db-')&&!before.has(x));assert.deepEqual(after,[]);
});

async function fixture(){const dir=await mkdtemp(path.join(APP_ROOT,'data/tmp/status-runtime-'));for(const name of ['manifest.json','index-10.json','zip-10.jsonl'])await cp(path.join(sourceDir,name),path.join(dir,name));const manifestBytes=await readFile(path.join(dir,'manifest.json')),manifest=JSON.parse(manifestBytes);const registration={dataset_id:'zip-source-native-status-distribution',schema_version:'1.0.0',status:'registered-local-derived-evidence',release_only:true,runtime_pointer:null,production_enrollment:false,current_pointer_written:false,export_policy:'local-review-only',retained_release:{release_id:manifest.release_id,manifest:path.relative(APP_ROOT,path.join(dir,'manifest.json')).replaceAll('\\','/'),manifest_sha256:sha(manifestBytes),profiles:manifest.counts.profiles,sources:manifest.counts.sources,status_groups:manifest.counts.status_groups,buckets:manifest.counts.buckets,created_at:manifest.created_at},claims:{source_native_status_only:true,general_current_operation_verified:false,active_business_count:null,authoritative_usps_zip_denominator:null,zcta_assignment_performed:false,all_business_completion_percent:null}};const registrationPath=path.join(dir,'registration.json');await writeFile(registrationPath,`${JSON.stringify(registration)}\n`);return{dir,manifest,registration,registrationPath};}
async function rewrite(f,value){const bytes=Buffer.from(`${JSON.stringify(value)}\n`);await writeFile(path.join(f.dir,'manifest.json'),bytes);f.registration.retained_release.manifest_sha256=sha(bytes);await writeFile(f.registrationPath,`${JSON.stringify(f.registration)}\n`);}

test('runtime rejects exact artifact-roster and source-conservation drift',async()=>{for(const mutate of [m=>m.artifacts.pop(),m=>m.artifacts[0].path=m.artifacts[1].path,m=>m.source_conservation[0].records++,m=>m.source_conservation[0].source_id=m.source_conservation[1].source_id]){const f=await fixture();try{mutate(f.manifest);await rewrite(f,f.manifest);const value=await readZipSourceStatusEnvelope({root:APP_ROOT,registrationPath:f.registrationPath,zip5:'10001'});assert.equal(value.status,'corrupt-release');}finally{await rm(f.dir,{recursive:true,force:true});}}});

test('runtime rejects index and selected byte-range tampering',async()=>{for(const name of ['index-10.json','zip-10.jsonl']){const f=await fixture();try{const file=path.join(f.dir,name),bytes=await readFile(file);if(name.startsWith('index'))bytes[Math.floor(bytes.length/2)]^=1;else{const index=JSON.parse(await readFile(path.join(f.dir,'index-10.json'),'utf8')),range=index.find(x=>x.zip5==='10001');bytes[range.offset+Math.floor(range.bytes/2)]^=1;}await writeFile(file,bytes);await assert.rejects(readValidatedZipSourceStatus({root:APP_ROOT,registrationPath:f.registrationPath,zip5:'10001'}),/integrity|range|Unexpected token|JSON/);}finally{await rm(f.dir,{recursive:true,force:true});}}});

test('publication validation and cancellation leave no orphan staging directory',async()=>{const releases=path.join(APP_ROOT,'data/zip-source-native-status-distribution/releases'),before=new Set(await readdir(releases));await assert.rejects(publishZipSourceStatusIndex({createdAt:'invalid'}),/createdAt/);const controller=new AbortController();controller.abort(new Error('cancelled'));await assert.rejects(publishZipSourceStatusIndex({createdAt:'2026-10-03T05:00:00.000Z',signal:controller.signal}));const after=(await readdir(releases)).filter(x=>!before.has(x));assert.deepEqual(after,[]);});
