import test from 'node:test';
import assert from 'node:assert/strict';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { normalizeMnConstructionRecord as normalize } from './mn-construction-normalization.mjs';
const context = { runId:'fixture-run',sourceReleaseId:'fixture-release',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential',sourceFileSha256:'a'.repeat(64),rowNumber:1 };
const row = (overrides={}) => ({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Lic_Number:'BC123456',Status:'Issued',Name:'Fixture Contractor',Addr1:'PO Box 12',City:'Fixture City',St:'MN',Zip:'00501-0012',Phone_No:'SECRET PHONE',Email_Address:'SECRET EMAIL',...overrides});
test('MN business credential normalization separates ZIP4, roles, identity and temporal assertions',()=>{
  const out=normalize(row(),context);
  assert.equal(out.reported_address.zip_code,'00501');assert.equal(out.reported_address.postal_code,'00501');assert.equal(out.reported_address.zip4,'0012');
  assert.equal(out.reported_address.physical_location_verified,false);assert.equal(out.quality.physical_site_eligible,false);assert.equal(out.quality.matching_eligible,false);
  assert.equal(out.geocode.latitude,null);assert.equal(out.geocode.longitude,null);assert.equal(out.credential.active_business_verified,false);
  assert.equal(out.credential.kind,'license');assert.equal(out.provenance.source_file_sha256,context.sourceFileSha256);
  assert.ok(!JSON.stringify(out).includes('SECRET'));assert.ok(!Object.hasOwn(out,'physical_address'));assert.ok(!Object.hasOwn(out,'geometry'));
});
test('MN finite credential and cohort rules exclude personal, unknown and non-Issued records before private fields',()=>{
  for(const mutation of [{Bus_Pers:'Person'},{Bus_Pers:'B'},{Status:'Expired'},{Status:'issued'},{Lic_Number:'QB123456'},{Lic_Number:'XX123456'},{Lic_Number:'BC12345'},{Lic_Number:'IR123456'}]){
    const input=row(mutation);Object.defineProperty(input,'Name',{enumerable:true,get:()=>assert.fail('Private name should not be read')});assert.throws(()=>normalize(input,context),e=>e.code==='MN_CONSTRUCTION_RECORD_REJECTED');
  }
  for(const prefix of ['BC','CR','RR','MI'])assert.equal(normalize(row({Lic_Number:prefix+'123456'}),context).credential.kind,'license');
  assert.equal(normalize(row({Lic_Number:'IR123456'}),{...context,cohort:'registrations'}).credential.kind,'registration');
});
test('MN omitted contacts and administrative fields never enter selected hashes or normalized output',()=>{
  const original=normalize(row(),context),input=row();
  for(const k of ['Phone_No','Email_Address','Enforcement_Action','Renewal_in_Progress','License_Type','License_Subtype'])Object.defineProperty(input,k,{enumerable:true,get:()=>assert.fail('Excluded field read')});
  assert.deepEqual(normalize(input,context),original);
  assert.notEqual(normalize(row({Name:'Other fixture'}),context).provenance.selected_fields_sha256,original.provenance.selected_fields_sha256);
});
test('MN missing or non-US address fields stay unresolved without losing the business credential',()=>{
  for(const postal of ['', '00000','ABCDE','1234']){const out=normalize(row({Zip:postal}),context);assert.equal(out.reported_address.zip_code,null);assert.equal(out.reported_address.zip4,null);}
  assert.equal(normalize(row({Zip:'005010012'}),context).reported_address.zip4,'0012');
  const other=normalize(row({St:'ON',Zip:'M5V 1A1'}),context);assert.equal(other.reported_address.country,null);assert.equal(other.reported_address.state,'ON');assert.equal(other.reported_address.zip_code,null);
  assert.equal(normalize(row({St:'WI'}),context).reported_address.state,'WI');
  assert.equal(normalize(row({Addr1:'',City:'',Zip:''}),context).reported_address.street,null);
});
test('MN rejects schema, provenance and unsafe text with redacted reasons; multiple credentials remain distinct',()=>{
  for(const input of [row({extra:'SECRET'}),row({Name:''}),row({Name:'SECRET\nNAME'}),row({Addr1:'x'.repeat(501)})])assert.throws(()=>normalize(input,context),e=>!e.message.includes('SECRET'));
  for(const changed of [{observedAt:'today'},{sourceFileSha256:'bad'},{sourceFileSha256:['a'.repeat(64)]},{sourceFileSha256:{toString:()=> 'a'.repeat(64),private:'SECRET'}},{rowNumber:0},{cohort:'other'},{runId:'../bad'},{extra:true}])assert.throws(()=>normalize(row(),{...context,...changed}),/invalid-provenance/);
  const first=normalize(row(),context),second=normalize(row({Lic_Number:'RR123456'}),{...context,rowNumber:2});
  assert.notEqual(first.source_record_id,second.source_record_id);assert.equal(first.business_name,second.business_name);assert.equal(second.quality.unique_business_identity_verified,false);
});
