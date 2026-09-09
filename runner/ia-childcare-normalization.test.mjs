import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireIaChildcareWithTestTransport as acquire,IA_CHILDCARE_URLS as U,IA_CHILDCARE_TEST_CLIENT as client} from './ia-childcare-acquisition.mjs';
import {normalizeIaChildcareEvidence as normalize} from './ia-childcare-normalization.mjs';
const row=extra=>({businessType:'building',businessName:'  Center  ',address:'  1 Main  ',city:' City ',zipCode:50301,latitude:41,longitude:-93,referral:false,...extra});
const evidence=rows=>acquire(async url=>new Response(url===U.client?client:JSON.stringify(rows)));
const context=e=>({runId:'test-run',sourceReleaseId:'ia-release',processedAt:e.finished_at});
test('Iowa normalization preserves source, duplicates, ordinal identity and unknown facts',async()=>{
  const input=await evidence([{businessType:'home'},row(),row()]),result=await normalize(input,context(input));
  assert.deepEqual(result.records.map(r=>r.source_record_id),['ia-release:row:2','ia-release:row:3']);
  const r=result.records[0];assert.equal(r.business_name,'Center');assert.equal(r.source.selected_fields.businessName,'  Center  ');assert.equal(r.reported_address.street,'1 Main');
  assert.equal(r.reported_address.zip_code,'50301');assert.equal(r.reported_address.postal_code,'50301');assert.equal(r.reported_address.zip4,null);
  assert.equal(r.reported_address.state,null);assert.equal(r.publisher_scope,'IA');assert.deepEqual(r.external_identifiers,[]);
  assert.equal(r.geocode.latitude,41);assert.equal(r.geocode.crs,null);assert.equal(r.geocode.accuracy_verified,false);
  assert.equal(r.provenance.observed_at,input.requests[1].observed_at);assert.equal(r.provenance.source_response_sha256,input.requests[1].decoded_sha256);assert.equal(r.provenance.source_updated_at,null);
  assert.equal(result.summary.duplicate_selected_rows,1);assert.equal(result.summary.source_response_rows,3);assert.equal(result.summary.source_records,2);assert.equal(result.summary.accepted_with_points,2);
  assert.ok(Object.values(r.claims).every(value=>value===false));assert.equal(r.source.selected_fields.referral,false);
  assert.deepEqual(await normalize(input,context(input)),result);
});
test('Iowa missing and invalid quality facts remain accepted gaps rather than artificial gates',async()=>{
  const input=await evidence([row({zipCode:null,latitude:null,businessName:' ',address:null,city:null}),row({zipCode:123.4,latitude:91}),row({zipCode:99999,longitude:180,latitude:-90}),row({zipCode:9999}),row({zipCode:100000})]);
  const result=await normalize(input,context(input));assert.equal(result.records.length,5);assert.equal(result.quarantine.length,0);
  assert.equal(result.records[0].geocode.longitude,null);assert.equal(result.records[0].quality.zip_unavailable_reason,'missing-source-zip');assert.equal(result.records[1].quality.zip_unavailable_reason,'invalid-source-numeric-zip5');
  assert.equal(result.records[1].geocode.latitude,null);assert.equal(result.records[2].reported_address.zip_code,'99999');assert.equal(result.records[2].geocode.longitude,180);
  assert.equal(result.summary.accepted_with_zip5,1);assert.equal(result.summary.accepted_with_points,3);
});
test('Iowa quarantines malformed text without raw diagnostic leakage and conserves selection',async()=>{
  const input=await evidence([row({businessName:'PRIVATE_CANARY\u0001'}),row({city:'PRIVATE_CANARY\ud800'}),row()]);
  const result=await normalize(input,context(input));assert.equal(result.records.length,1);assert.equal(result.quarantine.length,2);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_CANARY'));assert.deepEqual(result.quarantine.map(q=>q.source_ordinal),[1,2]);
  assert.equal(result.summary.accepted_records+result.summary.quarantined_records,result.summary.source_records);
});
test('Iowa normalization rejects context/evidence drift and cooperatively cancels',async()=>{
  const input=await evidence([row()]);
  for(const c of [{...context(input),extra:'PRIVATE'},{...context(input),processedAt:'bad'},{...context(input),runId:'../escape'},{...context(input),processedAt:'2000-01-01T00:00:00.000Z'}])await assert.rejects(normalize(input,c),/Iowa normalization rejected/);
  const bad=structuredClone(input);bad.selection.counts.selected_rows++;await assert.rejects(normalize(bad,context(input)),/Iowa normalization rejected/);
  await assert.rejects(normalize(input,context(input),{signal:AbortSignal.abort('PRIVATE')}),/Iowa normalization rejected/);
  const controller=new AbortController(),pending=normalize(input,context(input),{signal:controller.signal});controller.abort();await assert.rejects(pending,/Iowa normalization rejected/);
  await assert.rejects(normalize(input,context(input),{fetchImpl:()=>{}}),/Iowa normalization rejected/);
});
