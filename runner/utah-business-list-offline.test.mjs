import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { inspectUtahBusinessListPackage, normalizeUtahBusinessEntity, UTAH_BUSINESS_LIST_SHEETS } from "./utah-business-list-offline.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const row = (headers, values = {}) => Object.fromEntries(headers.map(header => [header, values[header] ?? ""]));
const entity = overrides => row(UTAH_BUSINESS_LIST_SHEETS.BUSENTITY, {"Entity No.":"1234567-0142","Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Address":"100 Main St","City":"Salt Lake City","State":"UT","ZipCode":"84101-1234","Reg. Date":"01/02/2020","Exp. Date":"01/02/2027","Home State":"UT","License Status":"Active","Status Reason":"Current","Date Status Changed":"01/02/2026","Last Renewal Date":"01/02/2026","Applicant Name":"PRIVATE PERSON","NAICS Code":"4451",...overrides});
const info = overrides => row(UTAH_BUSINESS_LIST_SHEETS.BUSINFO, {"Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Information Type":"Agent","Information":"PRIVATE",...overrides});
const principal = overrides => row(UTAH_BUSINESS_LIST_SHEETS.PRINCIPAL, {"Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Member Position":"Member","Full Name":"PRIVATE PERSON","Address":"PRIVATE","City":"Salt Lake City","State":"UT","ZipCode":"84101",...overrides});
const bytes = rows => Buffer.from(rows.map(JSON.stringify).join("\n") + (rows.length ? "\n" : ""));

async function fixture(t, mutate) {
  const packages = path.join(APP_ROOT,"data","imports","utah-business-list","packages"); await mkdir(packages,{recursive:true});
  const directory = await mkdtemp(path.join(packages,"test-")); t.after(()=>rm(directory,{recursive:true,force:true}));
  const files = {BUSENTITY:bytes([entity()]),BUSINFO:bytes([info()]),PRINCIPAL:bytes([principal()])};
  const workbook=Buffer.from("synthetic non-source workbook fixture");
  const selection = {schema_version:"utah-business-list-package@1.0.0",package_id:path.basename(directory),observed_at:"2026-10-03T12:00:00.000Z",updated_through:"2026-09-28",source:"https://secure.utah.gov/datarequest/businesses/index.html",transformation:{version:"fixture-export@1.0.0",method:"Synthetic fixture rows modeled on the published three-sheet example.",performed_by:"test-fixture",source_native:false,reproducible_extraction_verified:false},files:{ORIGINAL_WORKBOOK:{path:"original.xlsx",bytes:workbook.length,sha256:sha(workbook)},...Object.fromEntries(Object.entries(files).map(([name,value])=>[name,{path:`${name}.jsonl`,bytes:value.length,sha256:sha(value),row_count:1}]))},claims:{network_requests:0,purchase_performed:false,account_created:false,source_authenticity_verified:false,physical_site_verified:false,current_operation_verified:false,national_admission_performed:false,source_pointer_changed:false}};
  const originalDescriptors=structuredClone(selection.files);
  mutate?.({selection,files});
  for(const [name,value] of Object.entries(files)) if(selection.files[name].sha256===originalDescriptors[name].sha256) selection.files[name]={...selection.files[name],bytes:value.length,sha256:sha(value),row_count:value.length?value.toString("utf8").trimEnd().split("\n").length:0};
  for(const [name,value] of Object.entries(files)) await writeFile(path.join(directory,`${name}.jsonl`),value);
  await writeFile(path.join(directory,"original.xlsx"),workbook);
  await writeFile(path.join(directory,"selection.json"),`${JSON.stringify(selection)}\n`);
  return directory;
}

test("closed Utah package validates all sheets and emits only person-free organization evidence",async t=>{
  const directory=await fixture(t), saved=globalThis.fetch; globalThis.fetch=()=>assert.fail("offline contract made a request");
  try { const result=await inspectUtahBusinessListPackage(directory); assert.deepEqual(result.counts,{business_entities:1,business_info_rows_validated_not_retained:1,principal_rows_validated_not_retained:1}); assert.equal(result.records[0].administrative_address.zip5,"84101"); assert.equal(result.records[0].administrative_address.zip4,"1234"); assert.deepEqual({representation:result.records[0].provenance.representation,sourceNative:result.records[0].claims.source_native,authenticity:result.records[0].claims.source_authenticity_verified,replay:result.records[0].claims.reproducible_extraction_verified,eligible:result.records[0].claims.admission_eligible},{representation:"operator-derived-jsonl",sourceNative:false,authenticity:false,replay:false,eligible:false}); const text=JSON.stringify(result.records); assert.doesNotMatch(text,/PRIVATE|Applicant|Principal|Full Name/); }
  finally { globalThis.fetch=saved; }
});

test("normalizer is deterministic and keeps ZIP5 and ZIP4 separate",()=>{
  const context={package_id:"fixture",observed_at:"2026-10-03T12:00:00.000Z",updated_through:"2026-09-28",original_workbook_sha256:"a".repeat(64),derived_sheets_sha256:"b".repeat(64),transformation_version:"fixture-export@1.0.0"};
  assert.deepEqual(normalizeUtahBusinessEntity(entity(),context),normalizeUtahBusinessEntity(entity(),context));
  const value=normalizeUtahBusinessEntity(entity({ZipCode:"84101"}),context); assert.equal(value.administrative_address.zip5,"84101"); assert.equal(value.administrative_address.zip4,null);
});

test("package fails closed on tampering, schema drift, orphan private rows, and authority escalation",async t=>{
  for(const mutate of [
    ({selection})=>{selection.claims.network_requests=1;},
    ({selection})=>{selection.transformation.source_native=true;},
    ({selection})=>{selection.files.ORIGINAL_WORKBOOK.sha256="0".repeat(64);},
    ({files})=>{files.BUSENTITY=bytes([{...entity(),Extra:"x"}]);},
    ({files})=>{files.PRINCIPAL=bytes([principal({"Entity ID":"99"})]);},
    ({selection})=>{selection.files.BUSENTITY.sha256="0".repeat(64);},
  ]) { const directory=await fixture(t,mutate); await assert.rejects(inspectUtahBusinessListPackage(directory),/Utah business-list package rejected/); }
});

test("package rejects joined/malformed postal values and observes cancellation",async t=>{
  const bad=await fixture(t,({files})=>{files.BUSENTITY=bytes([entity({ZipCode:"8410112345"})]);}); await assert.rejects(inspectUtahBusinessListPackage(bad),/postal/);
  const good=await fixture(t), controller=new AbortController(); controller.abort(); await assert.rejects(inspectUtahBusinessListPackage(good,{signal:controller.signal}),error=>error.name==="AbortError");
});
