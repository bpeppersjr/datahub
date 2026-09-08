import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {normalizeVtChildcareFeature,normalizeVtChildcareAcquisition,VT_CHILDCARE_CALENDAR_FIELDS,VT_CHILDCARE_CAPACITY_FIELDS} from './vt-childcare-normalization.mjs';
import {createVtChildcareFixture} from './vt-childcare-test-fixtures.mjs';
import {acquireVtChildcareWithTransport} from './vt-childcare-acquisition.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';
const c={runId:'vt-test',sourceReleaseId:'vt-test-release',observedAt:'2026-09-08T21:00:00.000Z',processedAt:'2026-09-08T22:00:00.000Z',sourceUpdatedAt:'2026-08-14T16:48:56.000Z'};
const bulk={runId:c.runId,sourceReleaseId:c.sourceReleaseId,processedAt:c.processedAt};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const feature=()=>({...createVtChildcareFixture().selected[0],address_1:'123 Example Street',address_2:'Suite 2',zip_code:'05001-0042'});
test('VT preserves sparse source, postal split, composite release identity and unknown semantics',()=>{
 const f=feature(),r=normalizeVtChildcareFeature(f,c);assertNormalizedUsPostalFieldsDeep(r);assert.deepEqual(r.source.selected_fields,f);assert.equal(r.reported_address.zip_code,'05001');assert.equal(r.reported_address.postal_code,'05001');assert.equal(r.reported_address.zip4,'0042');assert.equal(r.reported_address.street2,'Suite 2');
 assert.equal(r.reported_address.state,null);assert.equal(r.reported_address.country,null);assert.equal(r.reported_address.address_role,'reported-address-role-unspecified');assert.equal(r.publisher_scope,'VT');assert.equal(r.geocode.latitude,null);assert.equal(r.geocode.longitude,null);assert.equal(Object.hasOwn(r,'geometry'),false);
 assert.equal(r.provenance.reporting_period,null);assert.equal(r.provenance.reporting_period_verified,false);assert.deepEqual(r.provenance.source_unique_key,[f.file_name,f.license_id]);assert.equal(r.provenance.input_feature_sha256,hash(f));assert.equal(r.provenance.observed_at,c.observedAt);assert.equal(r.provenance.processed_at,c.processedAt);assert.equal(r.provenance.source_updated_at,c.sourceUpdatedAt);
 assert.notEqual(normalizeVtChildcareFeature({...f,file_name:'Provider_Report_06012026_07012026.xlsx'},c).source_record_id,r.source_record_id);assert.notEqual(normalizeVtChildcareFeature({...f,license_id:f.license_id+':x'},c).source_record_id,r.source_record_id);assert.notEqual(normalizeVtChildcareFeature(f,{...c,sourceReleaseId:'other-release'}).source_record_id,r.source_record_id);
 assert.ok(Object.values(r.claims).every(v=>v===false));assert.equal(r.export_policy,'internal');
});
test('VT postal and address gaps retain candidates without state or premises invention',()=>{
 for(const [raw,zip,zip4]of [[null,null,null],['',null,null],['00000',null,null],['bad',null,null],['050010042','05001','0042'],['05001','05001',null]]){const r=normalizeVtChildcareFeature({...feature(),zip_code:raw},c);assert.equal(r.reported_address.zip_code,zip);assert.equal(r.reported_address.zip4,zip4);assert.equal(r.quality.zip_unavailable_reason,zip?null:raw===null||raw===''?'missing-source-zip':'invalid-source-zip-format');}
 for(const [field,value,reason,key]of [['provider_name',null,'missing-source-name','name'],['address_1',null,'missing-source-address','address'],['address_1','PO Box 42','source-po-box-or-nonstreet-label','address'],['provider_town',null,'missing-source-city','city']]){const r=normalizeVtChildcareFeature({...feature(),[field]:value},c);assert.equal(r.quality[key+'_unavailable_reason'],reason);assert.equal(r.source.selected_fields[field],value);assert.equal(r.quality.state_unavailable_reason,'source-state-not-provided');}
 const sparse=feature();delete sparse.address_2;assert.equal(Object.hasOwn(normalizeVtChildcareFeature(sparse,c).source.selected_fields,'address_2'),false);
});
test('VT all dates and capacities preserve raw strings and distinguish malformed gaps',()=>{
 for(const field of VT_CHILDCARE_CAPACITY_FIELDS)for(const raw of ['0','25','01',' 25 ','-1','1e3','9007199254740992',null]){const r=normalizeVtChildcareFeature({...feature(),[field]:raw},c),valid=['0','25'].includes(raw);assert.deepEqual(r.capacities[field],{raw,parsed:valid?Number(raw):null,unavailable_reason:valid?null:raw===null?'missing-source-capacity':'invalid-source-capacity-format'});}
 for(const field of VT_CHILDCARE_CALENDAR_FIELDS)for(const raw of ['2024-02-29','2025-02-29','2026-01-01T00:00:00.000','2026-01-01T00:00:00Z','2026-01-01T24:00:00',null]){const r=normalizeVtChildcareFeature({...feature(),[field]:raw},c),valid=['2024-02-29','2026-01-01T00:00:00.000'].includes(raw);assert.deepEqual(r.license_dates_source[field],{raw,calendar_value:valid?raw:null,validity:valid?'valid-floating-calendar':raw===null?'missing-source-date':'invalid-source-date'});}
});
test('VT privacy, scalar shape, exact center scope and chronology fail closed',async()=>{
 for(const patch of [{phone_number:'PRIVATE'},{latitude:'44'},{provider_name:{owner:'PRIVATE'}},{total_licensed_capacity:[]},{zip_code:5001},{provider_name:'PRIVATE\n'},{license_type:'Registered Home'},{provider_program_type:'Licensed FCCH'},{license_id:''},{file_name:'unknown'}])assert.throws(()=>normalizeVtChildcareFeature({...feature(),...patch},c),e=>e.code==='VT_CHILDCARE_RECORD_REJECTED'&&!e.message.includes('PRIVATE'));
 const f=feature();Object.defineProperty(f,'email',{value:'PRIVATE'});assert.throws(()=>normalizeVtChildcareFeature(f,c));
 for(const context of [{...c,processedAt:'2020-01-01T00:00:00.000Z'},{...c,sourceUpdatedAt:'2027-01-01T00:00:00.000Z'},{...c,runId:'../escape'}])assert.throws(()=>normalizeVtChildcareFeature(feature(),context));
 await assert.rejects(normalizeVtChildcareAcquisition({},bulk,{signal:AbortSignal.abort()}),{name:'AbortError'});
});
test('VT acquired batch conserves rows and redacted quarantine with snapshot/cancel protection',async()=>{
 const fixture=createVtChildcareFixture({count:501,mutate:(rows,kind)=>{if(kind==='page')for(const r of rows){if(r.license_id==='SYNTHETIC-00001'){r.provider_name='x'.repeat(20000);r.address_1='x'.repeat(20000);}if(r.license_id==='SYNTHETIC-00002'){r.zip_code='bad';r.total_licensed_capacity='bad';r.current_license_end_date='bad';}}}});
 const e=await acquireVtChildcareWithTransport(fixture.options),r=await normalizeVtChildcareAcquisition(e,bulk);assert.equal(r.records.length,500);assert.equal(r.quarantine.length,1);assert.equal(r.summary.source_records,501);assert.equal(r.quarantine[0].reason,'normalized-record-byte-limit');assert.equal(JSON.stringify(r.quarantine).includes('x'.repeat(100)),false);assert.equal(r.summary.accepted_with_points,0);assert.equal(r.summary.accepted_with_zip5,499);assert.equal(r.summary.zip_unavailable_reasons['invalid-source-zip-format'],1);assert.equal(r.summary.capacity_unavailable_counts.total_licensed_capacity,1);assert.equal(r.summary.date_unavailable_counts.current_license_end_date,1);assert.equal(new Set([...r.records,...r.quarantine].map(v=>v.source_record_id)).size,501);
 const originalHash=hash(e),pending=normalizeVtChildcareAcquisition(e,bulk);e.observations.find(o=>o.kind==='page').observed_at='2026-09-08T21:30:00.000Z';const stable=await pending;assert.equal(stable.summary.acquisition_evidence_sha256,originalHash);assert.equal(stable.records[0].provenance.observed_at,c.observedAt);e.observations.find(o=>o.kind==='page').observed_at=c.observedAt;
 const abort=new AbortController(),cancelled=normalizeVtChildcareAcquisition(e,bulk,{signal:abort.signal});setImmediate(()=>abort.abort());await assert.rejects(cancelled,{name:'AbortError'});
});
