import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {classifySourceNativeStatus,readZipSourceStatus,readZipSourceStatusEnvelope,ZIP_SOURCE_STATUS_LIMITS} from './zip-source-status-index.mjs';

test('source-native status canonicalization separates missing, null, empty, and present',()=>{
 const missing=classifySourceNativeStatus({}),nil=classifySourceNativeStatus({source_status:null}),empty=classifySourceNativeStatus({source_status:{}});
 const left=classifySourceNativeStatus({source_status:{b:2,a:{d:4,c:3}}});
 const right=classifySourceNativeStatus({source_status:{a:{c:3,d:4},b:2}});
 assert.equal(missing.kind,'missing');assert.equal(nil.kind,'null');assert.equal(empty.kind,'empty-object');
 assert.equal(left.kind,'present');assert.equal(left.digest,right.digest);
 assert.equal(new Set([missing.digest,nil.digest,empty.digest,left.digest]).size,4);
});

test('installed registered lookup is bounded and exposes no raw status or record identifier',async()=>{const value=await readZipSourceStatus({zip5:'10001'});assert.equal(value.available,true);assert.equal(value.claims.general_current_operation_verified,false);assert.ok(value.rows.length<=ZIP_SOURCE_STATUS_LIMITS.rowsPerZip);assert.ok(value.rows.every(row=>Object.keys(row).sort().join(',')==='count,count_unit,source_id,source_release_id,status_kind,status_sha256,zip5'));assert.doesNotMatch(JSON.stringify(value),/source_record_id|profile_id|source_status/);});

test('runtime distinguishes missing enrollment from corrupt registration without leaking details',async()=>{const missing=await readZipSourceStatusEnvelope({registrationPath:path.join(APP_ROOT,'data/tmp/no-such-status-registration.json'),zip5:'10001'});assert.equal(missing.status,'not-enrolled');const dir=await mkdtemp(path.join(APP_ROOT,'data/tmp/status-registration-test-')),file=path.join(dir,'registration.json');try{await writeFile(file,'{"dataset_id":"wrong"}\n');const corrupt=await readZipSourceStatusEnvelope({registrationPath:file,zip5:'10001'});assert.equal(corrupt.status,'corrupt-release');assert.equal(corrupt.available,false);assert.deepEqual(corrupt.rows,[]);assert.doesNotMatch(JSON.stringify(corrupt),/registration\.json|data\/tmp/);}finally{await rm(dir,{recursive:true,force:true});}});

test('source-native status canonicalization enforces its byte bound',()=>{
 assert.throws(()=>classifySourceNativeStatus({source_status:{value:'x'.repeat(ZIP_SOURCE_STATUS_LIMITS.statusBytes)}}),/exceeds bound/);
});
