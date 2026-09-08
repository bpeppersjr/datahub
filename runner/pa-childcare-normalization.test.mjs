import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { normalizePaChildcareFeature, normalizePaChildcareAcquisition, PA_CHILDCARE_NORMALIZATION_VERSION } from "./pa-childcare-normalization.mjs";
import { acquirePaChildcareWithTransport } from "./pa-childcare-acquisition.mjs";
import { createPaChildcareFixture, paFixtureOptions } from "./pa-childcare-test-fixtures.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

const context={runId:"pa-fixture-run",sourceReleaseId:"pa-fixture-release",observedAt:"2026-09-08T12:00:00.000Z",processedAt:"2026-09-08T13:00:00.000Z",sourceUpdatedAt:"2026-08-13T14:32:18.000Z"};
const batchContext={runId:context.runId,sourceReleaseId:context.sourceReleaseId,processedAt:context.processedAt};
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function feature(){return {master_provider_index:"000123-0004",mpi_id:"000123",mpi_location_id:"0004",provider_type:"Child Care Center",facility_name:" Synthetic Center ",facility_address:"123 Main Street",facility_address_continued:" Suite 2 ",facility_city:"Harrisburg",facility_state:"PA",facility_zip_code:"01234-0567",license_number:"000987",license_issue_date:"2025-01-02T00:00:00.000",license_exp_date:"2027-01-02T00:00:00.000",capacity:"50",geocoded_column:{type:"Point",coordinates:[-76.88,40.27]}};}

test("PA normalization preserves source identities, separate postal parts and observation lineage",()=>{
  const f=feature(),r=normalizePaChildcareFeature(f,context);
  assertNormalizedUsPostalFieldsDeep(r);
  assert.equal(r.business_name,"Synthetic Center");assert.equal(r.physical_address.street2,"Suite 2");
  assert.equal(r.physical_address.zip_code,"01234");assert.equal(r.physical_address.postal_code,"01234");assert.equal(r.physical_address.zip4,"0567");
  assert.equal(r.geocode.latitude,40.27);assert.equal(r.geocode.longitude,-76.88);
  assert.equal(r.provenance.observed_at,context.observedAt);assert.equal(r.provenance.processed_at,context.processedAt);
  assert.equal(r.provenance.transformation_version,PA_CHILDCARE_NORMALIZATION_VERSION);
  assert.equal(r.provenance.source_updated_at,context.sourceUpdatedAt);
  assert.deepEqual(r.external_identifiers.map(i=>i.value),["000123-0004","000123","0004","000987"]);
  assert.ok(r.external_identifiers.every(i=>i.type.startsWith("pennsylvania_")&&i.identity_verified===false));
  assert.equal(r.license_dates_source.issue_date,f.license_issue_date);assert.equal(r.license_dates_source.expiration_date,f.license_exp_date);
  assert.equal(r.source_status.valid_from,null);assert.equal(r.source_status.valid_to,null);
  assert.equal(r.quality.identity_matching_eligible,false);assert.equal(r.quality.geographic_boundary_verified,false);
  assert.equal(r.provenance.input_feature_sha256,hash(f));
  assert.equal(Object.hasOwn(r,"geometry"),false);assert.equal(r.export_policy,"internal");
  assert.equal(r.source_status.active_business_verified,false);
});

test("PA nullable points remain explicit; invalid point types, bounds and geometries reject",()=>{
  const missing=normalizePaChildcareFeature({...feature(),geocoded_column:null},context);
  assert.equal(missing.geocode.latitude,null);assert.equal(missing.geocode.longitude,null);assert.equal(missing.quality.point_unavailable_reason,"missing-source-point");
  for(const geo of [{type:"Point",coordinates:[NaN,40]},{type:"Point",coordinates:[-76,Infinity]},{type:"Point",coordinates:[181,40]},{type:"Point",coordinates:[-76,91]},{type:"Point",coordinates:[-76,null]},{type:"Polygon",coordinates:[]},{type:"Point",coordinates:[-76,40],spatialReference:{wkid:4326}}])assert.throws(()=>normalizePaChildcareFeature({...feature(),geocoded_column:geo},context),{code:"PA_CHILDCARE_RECORD_REJECTED"});
  for(const coordinates of [[-180,-90],[180,90]])assert.equal(normalizePaChildcareFeature({...feature(),geocoded_column:{type:"Point",coordinates}},context).geocode.longitude,coordinates[0]);
});

test("PA capacity parsing is strict while malformed source text is retained as a gap",()=>{
  for(const [raw,value,reason] of [["0",0,null],["50",50,null],[String(Number.MAX_SAFE_INTEGER),Number.MAX_SAFE_INTEGER,null],[null,null,"missing-source-capacity"],[" ",null,"missing-source-capacity"],...["01"," 50 ","-1","1.5","1e3","NaN","9007199254740992"].map(raw=>[raw,null,"invalid-source-capacity-format"])]){
    const r=normalizePaChildcareFeature({...feature(),capacity:raw},context);assert.equal(r.industry.capacity_source,raw);assert.equal(r.industry.capacity_parsed,value);assert.equal(r.quality.capacity_unavailable_reason,reason);
  }
});

test("PA leading-zero and compact ZIP extensions split; unavailable ZIPs remain reasoned gaps",()=>{
  for(const [raw,zip,zip4,reason] of [
    ["01234","01234",null,null],["01234-0567","01234","0567",null],["012340567","01234","0567",null],
    [null,null,null,"missing-source-zip"],[" ",null,null,"missing-source-zip"],["00000",null,null,"invalid-source-zip-placeholder"],
    ["N/A",null,null,"invalid-source-zip-format"],["12345-12",null,null,"invalid-source-zip-format"],
  ]){const r=normalizePaChildcareFeature({...feature(),facility_zip_code:raw},context);assert.equal(r.physical_address.zip_code,zip);assert.equal(r.physical_address.postal_code,zip);assert.equal(r.physical_address.zip4,zip4);assert.equal(r.quality.zip_unavailable_reason,reason);}
});

test("PA private fields and invalid premises reject without exposing source content",()=>{
  for(const change of [
    f=>{f.contact_phone="SECRET_PRIVATE";},f=>{f.facility_name=" ";},f=>{delete f.facility_address;},f=>{f.facility_city=null;},
    f=>{f.facility_address="PO Box 123";},f=>{f.facility_address="General Delivery";},f=>{f.facility_state="NJ";},
    f=>{f.provider_type="Family Child Care Home";},f=>{f.facility_name="SECRET_PRIVATE\u0000";},
  ]){const f=feature();change(f);assert.throws(()=>normalizePaChildcareFeature(f,context),e=>e.code==="PA_CHILDCARE_RECORD_REJECTED"&&!e.message.includes("SECRET_PRIVATE"));}
});

test("PA invalid contexts, unknown options and pre-abort stop normalization",async()=>{
  for(const change of [c=>{c.runId="../escape";},c=>{delete c.sourceReleaseId;},c=>{c.secret=true;},c=>{c.processedAt="2020-01-01T00:00:00.000Z";},c=>{c.sourceUpdatedAt="2027-01-01T00:00:00.000Z";}]){const c={...context};change(c);assert.throws(()=>normalizePaChildcareFeature(feature(),c));}
  await assert.rejects(normalizePaChildcareAcquisition({},batchContext,{signal:AbortSignal.abort()}),{name:"AbortError"});
  await assert.rejects(normalizePaChildcareAcquisition({},batchContext,{url:"https://example.invalid"}));
});

let acquired;
test("PA batch conserves accepted and quarantined source rows without fabricating business identity",paFixtureOptions,async()=>{
  const f=createPaChildcareFixture({count:501,mutate:(v,k)=>{
    if(k!=="page")return;
    for(const row of v){row.facility_address="123 Main Street";row.facility_city="Harrisburg";row.capacity="25";}
    if(v[0].master_provider_index==="fixture-0000"){
      v[0].facility_zip_code=null;
      v[1].facility_address="PO Box PRIVATE_ADDRESS";
      v[2].facility_city=null;
      v[3].facility_state="NJ";
      v[4].facility_zip_code="invalid";
      v[5].capacity="not a number";
    }
  }});
  acquired=await acquirePaChildcareWithTransport(f.options);
  const result=await normalizePaChildcareAcquisition(acquired,batchContext);
  assert.equal(result.summary.source_records,501);assert.equal(result.records.length,498);assert.equal(result.quarantine.length,3);
  assert.equal(result.summary.accepted_records+result.summary.quarantined_records,501);
  assert.equal(result.summary.zip_unavailable_reasons["missing-source-zip"],1);assert.equal(result.summary.zip_unavailable_reasons["invalid-source-zip-format"],1);
  assert.equal(result.records[0].provenance.observed_at,acquired.observations.find(o=>o.kind==="page").observed_at);
  assert.equal(result.records[0].provenance.processed_at,context.processedAt);
  assert.equal(JSON.stringify(result.quarantine).includes("PRIVATE_ADDRESS"),false);
  const keys=[...result.records.map(r=>r.provenance.source_master_provider_index),...result.quarantine.map(r=>r.source_master_provider_index)];assert.equal(new Set(keys).size,501);
  assert.equal(result.summary.identity_matching_applied,false);assert.equal(result.summary.release_published,false);assert.equal(result.summary.point_unavailable_reasons["missing-source-point"],1);
  assert.deepEqual(await normalizePaChildcareAcquisition(acquired,batchContext),result);
  const mutable=structuredClone(acquired),beforeHash=hash(mutable);
  const isolated=normalizePaChildcareAcquisition(mutable,batchContext);
  for(const page of mutable.observations.filter(o=>o.kind==="page"))page.observed_at="2026-09-08T12:30:00.000Z";
  const isolatedResult=await isolated;
  assert.equal(isolatedResult.records[0].provenance.observed_at,context.observedAt);
  assert.equal(isolatedResult.summary.acquisition_evidence_sha256,beforeHash);
  const abort=new AbortController();const pending=normalizePaChildcareAcquisition(acquired,batchContext,{signal:abort.signal});
  setImmediate(()=>abort.abort());await assert.rejects(pending,{name:"AbortError"});
});
