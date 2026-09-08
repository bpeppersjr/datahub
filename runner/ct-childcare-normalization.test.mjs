import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {normalizeCtChildcareFeature,normalizeCtChildcareAcquisition} from './ct-childcare-normalization.mjs';
import {acquireCtChildcareWithTransport} from './ct-childcare-acquisition.mjs';
import {createCtChildcareFixture} from './ct-childcare-test-fixtures.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
const context={runId:'ct-fixture-run',sourceReleaseId:'ct-fixture-release',observedAt:'2026-09-08T12:00:00.000Z',processedAt:'2026-09-08T13:00:00.000Z',sourceUpdatedAt:'2026-09-07T00:00:00.000Z'};
const batchContext={runId:context.runId,sourceReleaseId:context.sourceReleaseId,processedAt:context.processedAt};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function feature(){return {uniquekey:'opaque-key-0001',credentialidnt:'00123',licensenumber:'DCCC.0000123',name:' Synthetic Center ',licensetype:'Child Care Center',status:'ACTIVE',address2:'123 Main Street',address3:'Suite 2',city:'Hartford',statecode:'CT',zipcode:'06103-0042',effectivedate:'2025-01-02T00:00:00.000',expirationdate:'2027-01-02T00:00:00.000',firsteffectivedate:'2001-01-02T00:00:00.000',credentiallastmodifieddate:'2026-01-02T00:00:00.000',maximumcapacity:'50'};}
test('CT candidate normalization preserves raw identity, floating dates, postal split and no inferred geometry',()=>{
 const f=feature(),r=normalizeCtChildcareFeature(f,context);assertNormalizedUsPostalFieldsDeep(r);
 assert.equal(r.business_name,'Synthetic Center');assert.equal(r.reported_address.street2,'Suite 2');assert.equal(r.reported_address.zip_code,'06103');assert.equal(r.reported_address.postal_code,'06103');assert.equal(r.reported_address.zip4,'0042');
 assert.equal(r.geocode.latitude,null);assert.equal(r.geocode.longitude,null);assert.equal(Object.hasOwn(r,'geometry'),false);assert.equal(r.export_policy,'internal');
 assert.deepEqual(r.source.selected_fields,f);assert.equal(r.provenance.observed_at,context.observedAt);assert.equal(r.provenance.processed_at,context.processedAt);assert.equal(r.provenance.source_updated_at,context.sourceUpdatedAt);assert.equal(r.provenance.input_feature_sha256,hash(f));
 assert.ok(r.external_identifiers.some(i=>i.value==='00123'));assert.ok(JSON.stringify(r.license_dates_source).includes(f.effectivedate));assert.equal(JSON.stringify(r.license_dates_source).includes(f.effectivedate+'Z'),false);
 const other=normalizeCtChildcareFeature({...f,uniquekey:'opaque-key-0002'},context);assert.notEqual(other.source_record_id,r.source_record_id);
});
test('CT incomplete and non-premises reported addresses remain candidates with explicit gaps',()=>{
 const conflict=normalizeCtChildcareFeature({...feature(),statecode:'NJ'},context);assert.equal(conflict.reported_address.state,'NJ');assert.equal(conflict.quality.state_scope_conflict,true);
 for(const [key,value,reason] of [['name',null,'missing-source-name'],['address2',null,'missing-source-address'],['city',null,'missing-source-city'],['statecode',null,'missing-source-state'],['address2','PO Box 123','source-po-box-or-nonstreet-label']]){const f={...feature(),[key]:value},r=normalizeCtChildcareFeature(f,context);assert.equal(r.geocode.latitude,null);const qualityKey={name:'name',address2:'address',city:'city',statecode:'state'}[key]+'_unavailable_reason';assert.equal(r.quality[qualityKey],reason);assert.equal(r.source.selected_fields[key],value);if(key==='statecode')assert.equal(r.reported_address.state,null);assert.equal(r.claims.physical_site_verified,false);}
});
test('CT invalid postal and capacity text preserve source without fabricated values',()=>{
 for(const [raw,zip,zip4]of [[null,null,null],['',null,null],['00000',null,null],['N/A',null,null],['061030042','06103','0042'],['06103','06103',null]]){const r=normalizeCtChildcareFeature({...feature(),zipcode:raw},context);assert.equal(r.reported_address.zip_code,zip);assert.equal(r.reported_address.zip4,zip4);assertNormalizedUsPostalFieldsDeep(r);}
 for(const field of ['capacityunder3','maximumcapacity','regularcapacity','schoolagecapacity'])for(const raw of ['0','50','01',' 50 ','1e3','-1','9007199254740992']){const r=normalizeCtChildcareFeature({...feature(),[field]:raw},context);assert.deepEqual(r.capacities[field],{raw,parsed:['0','50'].includes(raw)?Number(raw):null,unavailable_reason:['0','50'].includes(raw)?null:'invalid-source-capacity-format'});}
 for(const field of ['effectivedate','expirationdate','firsteffectivedate','credentiallastmodifieddate'])for(const raw of ['2024-02-29','2025-02-29','2025-01-01T00:00:00Z','2025-01-01T25:00:00']){const r=normalizeCtChildcareFeature({...feature(),[field]:raw},context);assert.deepEqual(r.license_dates_source[field],{raw,calendar_value:raw==='2024-02-29'?raw:null,validity:raw==='2024-02-29'?'valid-floating-calendar':'invalid-source-date'});}
});
test('CT strict scope, scalar privacy and chronology reject without source content leakage',async()=>{
 for(const change of [f=>{f.phone='SECRET';},f=>{f.name={owner:'SECRET'};},f=>{f.maximumcapacity=[];},f=>{f.status='INACTIVE';},f=>{f.licensetype='Family Child Care Home';},f=>{f.name='SECRET\u0000';}]){const f=feature();change(f);assert.throws(()=>normalizeCtChildcareFeature(f,context),e=>!e.message.includes('SECRET'));}
 for(const c of [{...context,processedAt:'2000-01-01T00:00:00.000Z'},{...context,sourceUpdatedAt:'2027-01-01T00:00:00.000Z'},{...context,runId:'../escape'}])assert.throws(()=>normalizeCtChildcareFeature(feature(),c));
 await assert.rejects(normalizeCtChildcareAcquisition({},batchContext,{signal:AbortSignal.abort()}),{name:'AbortError'});
});
test('CT batch preserves 501 candidates and repeated credentials with immutable observation lineage',async()=>{
 const fixture=createCtChildcareFixture({count:501});const evidence=await acquireCtChildcareWithTransport(fixture.options);const result=await normalizeCtChildcareAcquisition(evidence,batchContext);
 assert.equal(result.records.length,501);assert.equal(result.quarantine.length,0);assert.equal(result.summary.source_records,501);assert.equal(new Set(result.records.map(r=>r.source_record_id)).size,501);assert.ok(result.records.every(r=>r.geocode.latitude===null&&r.geocode.longitude===null));
 const mutable=structuredClone(evidence),originalHash=hash(mutable);const pending=normalizeCtChildcareAcquisition(mutable,batchContext);for(const o of mutable.observations.filter(o=>o.kind==='page'))o.observed_at='2026-09-08T12:30:00.000Z';const stable=await pending;assert.equal(stable.records[0].provenance.observed_at,context.observedAt);assert.equal(stable.summary.acquisition_evidence_sha256,originalHash);
 const controller=new AbortController();const cancelled=normalizeCtChildcareAcquisition(evidence,batchContext,{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(cancelled,{name:'AbortError'});
});
test('CT oversized scalar candidate quarantines with complete source-row conservation',async()=>{
 const fixture=createCtChildcareFixture({mutate:(rows,kind)=>{if(kind==='page'){rows[0].name='x'.repeat(20000);rows[0].address3='x'.repeat(20000);}}});const evidence=await acquireCtChildcareWithTransport(fixture.options);const result=await normalizeCtChildcareAcquisition(evidence,batchContext);assert.equal(result.records.length,1);assert.equal(result.quarantine.length,1);assert.equal(result.summary.source_records,2);assert.equal(result.quarantine[0].reason,'normalized-record-byte-limit');assert.equal(result.quarantine[0].source_unique_key,fixture.selected[0].uniquekey);assert.equal(JSON.stringify(result.quarantine).includes('x'.repeat(100)),false);
});
