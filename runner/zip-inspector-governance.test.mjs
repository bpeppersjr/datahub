import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {compatibleZipQualification,readZipOperationalAdmission} from './zip-inspector-governance.mjs';
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';
import {createZipInspectorView} from './zip-inspector-view.mjs';

test('composition preserves qualification schema, zero/null and exact release hashes; mismatches remain unavailable',()=>{
 const value=qualificationFixture({qualification:'unmeasured'}),catalog={...value.bindings};
 const opts={zip:'00501',categoryId:'all',catalog};
 const result=compatibleZipQualification(value,opts);
 assert.equal(result.available,true);assert.deepEqual(result.rows,value.rows);
 for(const field of ['coverage_release_id','registry_release_id','coverage_manifest_sha256','registry_manifest_sha256'])assert.equal(compatibleZipQualification(value,{...opts,catalog:{...catalog,[field]:'wrong'}}).status,'incompatible-bindings');
 assert.equal(compatibleZipQualification(value,{...opts,zip:'12345'}).available,false);
 assert.equal(compatibleZipQualification(value,{...opts,categoryId:'childcare'}).available,false);
});

test('server composes one ZIP while retaining original counts and rechecking base after qualification',async()=>{
 const q=qualificationFixture(),order=[];
 const catalog={available:true,...q.bindings,categories:[{id:'all',label:'All',source_ids:[]}]};
 const view=createZipInspectorView({indexedEvidence:async()=>({catalog,quality:{found:false,bindings:{release_id:catalog.registry_release_id,manifest_sha256:catalog.registry_manifest_sha256}},coverage:{available:true,release_id:catalog.coverage_release_id,records:[]},recheck:async()=>order.push('recheck')}),qualificationReader:async({zip,categoryId,signal})=>{assert.equal(zip,'00501');assert.equal(categoryId,'all');assert.ok(signal);order.push('qualification');return q;}});
 const result=await view({zip:'00501',signal:new AbortController().signal});
 assert.equal(result.counts,null);assert.deepEqual(result.contributions,[]);assert.equal(result.qualification.rows.length,q.rows.length);assert.deepEqual(order,['qualification','recheck']);
 const controller=new AbortController();controller.abort();await assert.rejects(view({zip:'00501',signal:controller.signal}),{name:'AbortError'});
});

test('tracked USPS candidate is explicitly not admitted; missing metadata is unknown, never a zero',async()=>{
 const result=await readZipOperationalAdmission();assert.equal(result.value.production_admission,false);assert.equal(result.value.operational_status,null);assert.equal(result.value.status,'candidate-not-admitted');assert.match(result.value.bindings.registration_sha256,/^[a-f0-9]{64}$/);await result.recheck();
 const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/zip-admission-'));
 try{const missing=await readZipOperationalAdmission({root});assert.equal(missing.value.status,'scope-comparison-unavailable');assert.equal(missing.value.production_admission,null);}finally{await rm(root,{recursive:true,force:true});}
});

test('authenticated inspector route supplies both bounded readers; standalone route remains compatible',async()=>{
 const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(server,/createZipInspectorView\(\{ indexedEvidence: readIndexedZipInspectorEvidence, qualificationReader: readZipEvidenceQualification, sourceNativeStatusReader: readZipSourceStatusEnvelope, operationalAdmission: readZipOperationalAdmission/);
 assert.match(server,/zipEvidenceQualificationHttp\(request,response,url/);
});
