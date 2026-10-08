import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { inspectKentuckyBusinessEntityPackage, KY_BUSINESS_FIELDS, normalizeKentuckyBusinessEntity } from "./kentucky-business-entity-bulk-offline.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const company = overrides => Object.fromEntries(KY_BUSINESS_FIELDS.map(field => [field, ({ID:"0000123",comptype:"06",compseq:"00001",Name:"Synthetic Market LLC",Standing:"G",Status:"A",Country:"US",State:"KY",Type:"LLC",raname:"PRIVATE PERSON",raaddr1:"PRIVATE",racity:"Frankfort",restate:"KY",razip:"40601",poaddr1:"100 Main St",pocity:"Cincinnati",postate:"OH",pozip:"45202-1234",filedate:"01/02/2020",recorddate:"10/03/2026",numofcr:"999",numofshr:"888",mangnum:"777",applname:"PRIVATE APPLICANT",appltitl:"PRIVATE TITLE",parpre:"PRIVATE",parcomno:"PRIVATE",parcom:"PRIVATE",parpreno:"PRIVATE",profit:"",recordnumber:"0000042",...overrides})[field] ?? ""]));
const tsv = (rows, header = false) => Buffer.from(`${header ? `${KY_BUSINESS_FIELDS.join("\t")}\n` : ""}${rows.map(row => KY_BUSINESS_FIELDS.map(field => row[field]).join("\t")).join("\n")}${rows.length ? "\n" : ""}`);
const claims = () => ({network_requests:0,acquisition_performed:false,account_created:false,payment_made:false,terms_accepted:false,publisher_contacted:false,officer_files_included:false,source_authenticity_verified:false,statewide_complete:false,current_operation_verified:false,physical_site_verified:false,redistribution_authorized:false,national_admission_performed:false,production_enrollment:false,source_pointer_changed:false});

async function fixture(t, mutate, header = false) {
  const packages = path.join(APP_ROOT,"data","imports","kentucky-business-entity-bulk","packages"); await mkdir(packages,{recursive:true});
  const directory = await mkdtemp(path.join(packages,"test-")); t.after(()=>rm(directory,{recursive:true,force:true}));
  const state = { source:tsv([company()],header) };
  const selection = {schema_version:"kentucky-business-entity-package@1.0.0",package_id:path.basename(directory),observed_at:"2026-10-03T12:00:00.000Z",temporal_scope:"all-companies-monthly",source:"https://www.sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx",source_file_has_header:header,transformation:{version:"synthetic-fixture@1.0.0",method:"Synthetic company-family fixture.",performed_by:"test-fixture"},raw_source_classification:"person-bearing-internal",files:{COMPANIES:{path:"companies.txt",bytes:state.source.length,sha256:sha(state.source),row_count:1}},claims:claims()};
  mutate?.({selection,state});
  if (selection.files.COMPANIES.sha256 !== "0".repeat(64)) selection.files.COMPANIES={...selection.files.COMPANIES,bytes:state.source.length,sha256:sha(state.source)};
  await writeFile(path.join(directory,"companies.txt"),state.source); await writeFile(path.join(directory,"selection.json"),`${JSON.stringify(selection)}\n`); return directory;
}

test("strict 42-field fixture emits minimized local-review evidence", async t => {
  const directory=await fixture(t,undefined,true), saved=globalThis.fetch; globalThis.fetch=()=>assert.fail("offline connector made a request");
  try {
    const result=await inspectKentuckyBusinessEntityPackage(directory), record=result.records[0], text=JSON.stringify(record);
    assert.deepEqual(record.source_identity,{id:"0000123",company_type:"06",company_sequence:"00001"}); assert.equal(record.record_number,"0000042");
    assert.deepEqual(record.principal_administrative_address,{address_lines:["100 Main St"],city:"Cincinnati",state:"OH",postal_raw:"45202-1234",zip5:"45202",zip4:"1234",postal_parse_status:"parsed",role:"administrative-only",may_be_residential:true,may_be_out_of_state:true});
    assert.equal(record.profit,null); assert.equal(record.raw_source_classification,"person-bearing-internal"); assert.equal(record.export_policy,"local-review-only");
    assert.doesNotMatch(text,/PRIVATE|registered.agent|applicant|numofcr|numofshr|mangnum|parent/i); assert.ok(Object.values(record.claims).every(value=>value===false));
  } finally { globalThis.fetch=saved; }
});

test("header presence is explicit and exact, while headerless delivery is supported", async t => {
  assert.equal((await inspectKentuckyBusinessEntityPackage(await fixture(t))).counts.company_rows,1);
  const bad=await fixture(t,({state})=>{state.source=Buffer.from(`wrong\t${KY_BUSINESS_FIELDS.slice(1).join("\t")}\n${KY_BUSINESS_FIELDS.map(field=>company()[field]).join("\t")}\n`);},true);
  await assert.rejects(inspectKentuckyBusinessEntityPackage(bad),/header does not exactly match/);
});

test("malformed postal text is retained unresolved without coercion", () => {
  const context={package_id:"fixture",observed_at:"2026-10-03T12:00:00.000Z",temporal_scope:"company-changes-daily",source_file_sha256:"a".repeat(64),selection_sha256:"b".repeat(64),transformation_version:"synthetic-fixture@1.0.0"};
  const record=normalizeKentuckyBusinessEntity(company({pozip:"ZIP?"}),context);
  assert.deepEqual({raw:record.principal_administrative_address.postal_raw,zip5:record.principal_administrative_address.zip5,zip4:record.principal_administrative_address.zip4,status:record.principal_administrative_address.postal_parse_status},{raw:"ZIP?",zip5:null,zip4:null,status:"unresolved-format"});
});

test("fails closed on schema, status, standing, date, identity, hash, inventory, and authority drift", async t => {
  const mutations=[
    ({state})=>{state.source=tsv([company({Status:"ACTIVE"})]);},
    ({state})=>{state.source=tsv([company({comptype:"01",Standing:"G"})]);},
    ({state})=>{state.source=tsv([company({filedate:"2020-01-02"})]);},
    ({state})=>{state.source=tsv([company({filedate:"02/30/2020"})]);},
    ({state})=>{state.source=tsv([company({ID:"123"})]);},
    ({state})=>{state.source=tsv([company({pozip:"12345678901"})]);},
    ({state})=>{state.source=tsv([company({profit:"P"})]);},
    ({state})=>{state.source=Buffer.from(`${KY_BUSINESS_FIELDS.slice(0,-1).map(field=>company()[field]).join("\t")}\n`);},
    ({state,selection})=>{state.source=tsv([company(),company()]); selection.files.COMPANIES.row_count=2;},
    ({selection})=>{selection.files.COMPANIES.sha256="0".repeat(64);},
    ({selection})=>{selection.claims.terms_accepted=true;},
  ];
  for (const mutate of mutations) await assert.rejects(inspectKentuckyBusinessEntityPackage(await fixture(t,mutate)),/Kentucky business-entity package rejected/);
  const extra=await fixture(t); await writeFile(path.join(extra,"officers.txt"),"forbidden\n"); await assert.rejects(inspectKentuckyBusinessEntityPackage(extra),/officer files are forbidden/);
});

test("observes cooperative cancellation before any output exists", async t => {
  const directory=await fixture(t), controller=new AbortController(); controller.abort();
  await assert.rejects(inspectKentuckyBusinessEntityPackage(directory,{signal:controller.signal}),error=>error.name==="AbortError");
});

test("offline replay root override accepts only an operation-owned snapshot", async t => {
  const directory=await fixture(t);
  await assert.rejects(inspectKentuckyBusinessEntityPackage(directory,{packagesRoot:path.dirname(directory)}),/operation-owned snapshot/);
  await assert.rejects(inspectKentuckyBusinessEntityPackage(directory,{packagesRoot:APP_ROOT}),/operation-owned snapshot/);
});
