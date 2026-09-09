import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUtChildcareObservation as normalize,normalizeUtChildcareObservations as batch,UT_CHILDCARE_POLICY_SHA256} from './ut-childcare-normalization.mjs';
import {assertNormalizedUsPostalFieldsDeep} from './normalized-us-postal-code.mjs';

const context=()=>({sourceReleaseId:'ut-test-release',runId:'ut-test-run',observedAt:'2026-09-08T22:59:26.309Z',processedAt:'2026-09-09T00:00:00.000Z',sourceUrl:'https://dlbc.utah.gov/wp-content/uploads/All-Child-Care-Licensing-Facilities-Report-September-2026.pdf',sourceSha256:'a'.repeat(64),originReceiptSha256:'b'.repeat(64),prerequisiteReceiptSha256:'c'.repeat(64)});
const observation=()=>({source_page:1,source_row:1,facility_id:'F26-1234',facility_name:'Synthetic Center',address_line_1:'123 Example Street',address_line_2:null,city:'Example City',state:'UT',county:'Example County',zip5:'00123',zip4:'0001',license_type:'Child Care Center',capacity:30,license_expiration_date_source:'02/28/2027',initial_regulation_date_source:'02/29/2024',operating_status:null,address_role:null,latitude:null,longitude:null});

test('Utah selected observation preserves separate postal, provenance and conservative source semantics',()=>{
  const row=normalize(observation(),context());assertNormalizedUsPostalFieldsDeep(row);
  assert.equal(row.dataset_id,'ut-dlbc-childcare-centers');assert.equal(row.reported_address.zip_code,'00123');assert.equal(row.reported_address.postal_code,'00123');assert.equal(row.reported_address.zip4,'0001');
  assert.equal(row.reported_address.address_role,null);assert.equal(row.geocode.latitude,null);assert.equal(row.source_status.active_business_verified,false);assert.equal(row.provenance.source_page,1);assert.equal(row.provenance.source_row,1);
  assert.equal(row.provenance.origin_receipt_sha256,'b'.repeat(64));assert.equal(row.provenance.prerequisite_receipt_sha256,'c'.repeat(64));assert.equal(row.provenance.policy_sha256,UT_CHILDCARE_POLICY_SHA256);
  assert.equal(row.license_dates_source.initial_regulation_date_source.calendar_value,'2024-02-29');assert.equal(row.export_policy,'internal');assert.ok(Object.values(row.claims).every(value=>value===false));assert.equal(row.source.selected_fields.some(field=>field.source_field==='phone'),false);
  assert.equal(normalize({...observation(),zip4:null},context()).reported_address.zip4,null);
});

test('Utah normalization deterministic independent of property insertion and does not mutate input',()=>{
  const input=observation(),before=structuredClone(input),a=normalize(input,context()),b=normalize(Object.fromEntries(Object.entries(input).reverse()),context());assert.deepEqual(a,b);assert.deepEqual(input,before);
  a.source.selected_fields[0].value=99;assert.equal(input.source_page,1);
});

test('Utah rejects unexpected, missing, inherited and accessor selected fields without exposing values',()=>{
  for(const candidate of [{...observation(),phone:'PRIVATE-SECRET'},Object.assign(Object.create({}),observation()),{...observation(),[Symbol('unexpected')]:1}])assert.throws(()=>normalize(candidate,context()),error=>error.code==='UT_CHILDCARE_RECORD_REJECTED'&&!error.message.includes('PRIVATE'));
  const missing=observation();delete missing.county;assert.throws(()=>normalize(missing,context()));
  const getter=observation();Object.defineProperty(getter,'facility_name',{get(){throw new Error('PRIVATE');}});assert.throws(()=>normalize(getter,context()),/Utah selected observation rejected/);
});

test('Utah rejects malformed fields, out-of-scope categories and invented facts',()=>{
  const changes=[['facility_id','123'],['source_page',NaN],['source_page',101],['source_row',0],['source_row',66],['state','CO'],['license_type','Child Care Licensed Family'],['latitude',40],['longitude',Infinity],['operating_status','active'],['address_role','physical'],['capacity',-1],['capacity',-0],['capacity',NaN],['capacity',Infinity],['capacity',1.5],['capacity',Number.MAX_SAFE_INTEGER+1],['facility_name',''],['facility_name',' name'],['facility_name','bad\ntext'],['facility_name','\ud800'],['address_line_1',null],['address_line_2',undefined],['county',42],['zip5',12345],['zip5','00000'],['zip5','12345-6789'],['zip4','123'],['zip4',1234]];
  for(const [field,value]of changes)assert.throws(()=>normalize({...observation(),[field]:value},context()),`${field}=${String(value)}`);
});

test('Utah calendar conversion rejects impossible dates, preserves distinct license semantics',()=>{
  for(const field of ['license_expiration_date_source','initial_regulation_date_source'])for(const value of ['02/29/2025','04/31/2026','13/01/2026','00/01/2026','01/00/2026','01/01/1899','01/01/2200','2026-09-01',null])assert.throws(()=>normalize({...observation(),[field]:value},context()));
  assert.equal(normalize({...observation(),license_expiration_date_source:'02/29/2000'},context()).license_dates_source.license_expiration_date_source.calendar_value,'2000-02-29');
  // Expiration before observation is retained, not converted into an operating-status assertion.
  const expired=normalize({...observation(),license_expiration_date_source:'01/01/2020'},context());assert.equal(expired.source_status.status_source,null);
});

test('Utah context rejects malformed or foreign lineage and incompatible clocks',()=>{
  for(const [field,value]of [['sourceReleaseId','../escape'],['runId',''],['sourceUrl','https://example.com/report.pdf'],['observedAt','2026-09-08'],['processedAt','2026-09-01T00:00:00.000Z'],['sourceSha256','a'.repeat(63)],['originReceiptSha256','G'.repeat(64)],['prerequisiteReceiptSha256',null]])assert.throws(()=>normalize(observation(),{...context(),[field]:value}),/context rejected/);
  assert.throws(()=>normalize(observation(),{...context(),extra:true}));const missing=context();delete missing.observedAt;assert.throws(()=>normalize(observation(),missing));
});

test('Utah batch conserves projected rows without claiming replay or publication',async()=>{
  const result=await batch([observation(),{...observation(),facility_id:'F26-999',source_row:2,zip4:null}],context());assert.equal(result.records.length,2);assert.equal(result.summary.accepted_with_zip4,1);assert.equal(result.summary.source_evidence_verified,false);assert.equal(result.summary.source_membership_verified,false);assert.equal(result.summary.release_published,false);assert.deepEqual(result.quarantine,[]);
  assert.deepEqual(result,await batch([observation(),{...observation(),facility_id:'F26-999',source_row:2,zip4:null}],context()));
});

test('Utah batch rejects duplicates, sparse arrays and unselected payloads atomically',async()=>{
  for(const values of [[observation(),observation()],[observation(),{...observation(),facility_id:'F26-999'}],[observation(),{...observation(),source_row:2}],Array(1),[{...observation(),phone:'PRIVATE'}]])await assert.rejects(batch(values,context()));
  const accessor=[];Object.defineProperty(accessor,'0',{get(){throw new Error('PRIVATE');},enumerable:true});await assert.rejects(batch(accessor,context()),/Utah selected observation rejected/);
  const extra=[observation()];extra.extra=true;await assert.rejects(batch(extra,context()));
});

test('Utah batch observes cancellation, rejects malformed signals and snapshots before yielding',async()=>{
  const aborted=new AbortController();aborted.abort();await assert.rejects(batch([observation()],context(),{signal:aborted.signal}),{name:'AbortError'});
  await assert.rejects(batch([],context(),{signal:{}}));await assert.rejects(batch([],context(),{extra:1}));
  const active=new AbortController(),promise=batch([observation()],context(),{signal:active.signal});active.abort();await assert.rejects(promise,{name:'AbortError'});
  const input=[observation()],pending=batch(input,context());input[0].facility_name='Changed';assert.equal((await pending).records[0].business_name,'Synthetic Center');
});
