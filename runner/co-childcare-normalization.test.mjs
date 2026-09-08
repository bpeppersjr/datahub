import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {normalizeCoChildcareFeature,normalizeCoChildcareAcquisition} from './co-childcare-normalization.mjs';
import {createCoChildcareFixture} from './co-childcare-test-fixtures.mjs';
import {acquireCoChildcareWithTransport} from './co-childcare-acquisition.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
const c={runId:'co-test',sourceReleaseId:'co-test-release',observedAt:'2026-09-08T22:10:00.000Z',processedAt:'2026-09-08T23:00:00.000Z',sourceUpdatedAt:'2026-09-01T15:56:30.000Z'},bulk={runId:c.runId,sourceReleaseId:c.sourceReleaseId,processedAt:c.processedAt};
const feature=()=>createCoChildcareFixture().selected[0],hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('CO preserves exact large license IDs, sparse fields, postal split and conservative provenance',()=>{
 const f=feature();delete f.county;const r=normalizeCoChildcareFeature(f,c);assertNormalizedUsPostalFieldsDeep(r);assert.deepEqual(r.source.selected_fields,f);assert.equal(r.external_identifiers[0].value,'9007199254740993');assert.equal(r.provenance.source_unique_key,f.provider_id);
 assert.equal(r.reported_address.zip_code,'01234');assert.equal(r.reported_address.zip4,'0067');assert.equal(r.reported_address.state,'CO');assert.equal(r.reported_address.country,null);assert.equal(r.reported_address.address_role,'physical-address-as-reported-in-licensing-application');assert.equal(r.geocode.latitude,null);assert.equal(r.geocode.longitude,null);
 for(const key of ['geometry','license_dates_source'])assert.equal(Object.hasOwn(r,key),false);assert.equal(Object.hasOwn(r.provenance,'reporting_file'),false);assert.equal(r.provenance.observed_at,c.observedAt);assert.equal(r.provenance.source_updated_at,c.sourceUpdatedAt);assert.equal(r.provenance.input_feature_sha256,hash(f));assert.ok(Object.values(r.claims).every(v=>v===false));
 assert.equal(normalizeCoChildcareFeature(f,c).source_record_id,r.source_record_id);assert.notEqual(normalizeCoChildcareFeature(f,{...c,sourceReleaseId:'other'}).source_record_id,r.source_record_id);
 assert.equal(r.source_status.status_source,null);assert.equal(r.source_status.status_interpretation,'operating-status-not-provided-by-selected-source');assert.equal(r.industry.childcare_type_source,'Child Care Center');assert.equal(r.quality.status_unavailable_reason,'source-operating-status-not-provided');
 for(const key of ['source_status','external_identifiers','reported_address.state_source','reported_address.address_role','capacities.total_licensed_capacity'])assert.equal(typeof r.provenance.field_lineage[key],'string');
});
test('CO postal, state, missing address and capacity gaps never discard valid source candidates',()=>{
 for(const [raw,zip,zip4]of [[null,null,null],['',null,null],['00000',null,null],['bad',null,null],['012340067','01234','0067'],['01234','01234',null]]){const r=normalizeCoChildcareFeature({...feature(),zip:raw},c);assert.equal(r.reported_address.zip_code,zip);assert.equal(r.reported_address.zip4,zip4);}
 for(const raw of ['0','25','01',' 25 ','-1','1e3','9007199254740992',null]){const r=normalizeCoChildcareFeature({...feature(),total_licensed_capacity:raw},c),valid=['0','25'].includes(raw);assert.deepEqual(r.capacities.total_licensed_capacity,{raw,parsed:valid?Number(raw):null,unavailable_reason:valid?null:raw===null?'missing-source-capacity':'invalid-source-capacity-format'});}
 for(const [state,expected,conflict]of [[null,null,false],[' Colorado ','CO',false],['VA','VA',true]]){const r=normalizeCoChildcareFeature({...feature(),state,street_address:null,provider_name:null},c);assert.equal(r.reported_address.state,expected);assert.equal(r.reported_address.state_source,state);assert.equal(r.quality.state_scope_conflict,conflict);assert.equal(r.quality.address_unavailable_reason,'missing-source-address');}
 assert.equal(normalizeCoChildcareFeature({...feature(),street_address:'PO Box 42'},c).quality.address_unavailable_reason,'source-po-box-or-nonstreet-label');
});
test('CO malformed fields, private extras, chronology and early abort fail closed',async()=>{
 for(const patch of [{email:'PRIVATE'},{geometry:{}},{provider_name:42},{provider_id:'01'},{provider_id:'1'.repeat(33)},{provider_service_type:'Family Child Care Home'},{zip:1234},{total_licensed_capacity:undefined}])assert.throws(()=>normalizeCoChildcareFeature({...feature(),...patch},c),e=>e.code==='CO_CHILDCARE_RECORD_REJECTED'&&!e.message.includes('PRIVATE'));
 assert.throws(()=>normalizeCoChildcareFeature(feature(),{...c,processedAt:'2020-01-01T00:00:00.000Z'}));await assert.rejects(normalizeCoChildcareAcquisition({},bulk,{signal:AbortSignal.abort()}),{name:'AbortError'});await assert.rejects(normalizeCoChildcareAcquisition({},bulk,{unknown:true}));
});
test('CO full replay conserves accepted and quarantined rows with snapshot/cancellation protection',async()=>{
 const f=createCoChildcareFixture({count:501});f.selected[0].provider_name='x'.repeat(20000);f.selected[0].street_address='x'.repeat(20000);f.selected[1].zip='invalid';f.selected[1].state='VA';f.selected[1].total_licensed_capacity='invalid';
 const e=await acquireCoChildcareWithTransport(f.options),r=await normalizeCoChildcareAcquisition(e,bulk);assert.equal(r.records.length,500);assert.equal(r.quarantine.length,1);assert.equal(r.summary.source_records,501);assert.equal(r.summary.accepted_with_zip5,499);assert.equal(r.summary.accepted_with_state_scope_conflict,1);assert.equal(r.summary.capacity_unavailable_counts.total_licensed_capacity,1);assert.equal(r.quarantine[0].reason,'normalized-record-byte-limit');assert.equal(JSON.stringify(r.quarantine).includes('x'.repeat(100)),false);
 assert.equal(r.records[0].provenance.observed_at,c.observedAt);assert.equal(new Set([...r.records,...r.quarantine].map(v=>v.source_record_id)).size,501);
 const copy=structuredClone(e),pending=normalizeCoChildcareAcquisition(copy,bulk);copy.observations.find(o=>o.kind==='page').payload[1].provider_name='changed';assert.equal((await pending).summary.acquisition_evidence_sha256,hash(e));await assert.rejects(normalizeCoChildcareAcquisition(copy,bulk));
 const controller=new AbortController(),cancelled=normalizeCoChildcareAcquisition(e,bulk,{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(cancelled,{name:'AbortError'});
});
