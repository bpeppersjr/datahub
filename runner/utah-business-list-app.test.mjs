import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { UTAH_BUSINESS_LIST_SHEETS } from "./utah-business-list-offline.mjs";
import { readUtahBusinessListImportSelection, runUtahBusinessListAppJob, verifyUtahBusinessListAppJob } from "./utah-business-list-app.mjs";

const packageRoot = path.join(APP_ROOT,"data","imports","utah-business-list","packages");
const operationsRoot = path.join(APP_ROOT,"data","imports","utah-business-list","operations");
const NOW = new Date("2026-10-03T12:00:00.000Z");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const row = (headers, values={}) => Object.fromEntries(headers.map(header=>[header,values[header]??""]));
const entity = overrides => row(UTAH_BUSINESS_LIST_SHEETS.BUSENTITY,{"Entity No.":"1234567-0142","Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Address":"100 Main St","City":"Salt Lake City","State":"UT","ZipCode":"84101-1234","Reg. Date":"01/02/2020","Exp. Date":"01/02/2027","Home State":"UT","License Status":"Active","Status Reason":"Current","Date Status Changed":"01/02/2026","Last Renewal Date":"01/02/2026","Applicant Name":"PRIVATE PERSON","NAICS Code":"4451",...overrides});
const info = () => row(UTAH_BUSINESS_LIST_SHEETS.BUSINFO,{"Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Information Type":"Agent","Information":"PRIVATE"});
const principal = () => row(UTAH_BUSINESS_LIST_SHEETS.PRINCIPAL,{"Entity ID":"42","Entity Type":"Domestic LLC","License Type":"LLC","Business Name":"Example Market LLC","Member Position":"Member","Full Name":"PRIVATE PERSON","Address":"PRIVATE","City":"Salt Lake City","State":"UT","ZipCode":"84101"});
const jsonl = rows => Buffer.from(`${rows.map(JSON.stringify).join("\n")}\n`);

async function fixture(t,{invalid=false}={}) {
  await mkdir(packageRoot,{recursive:true}); const directory=await mkdtemp(path.join(packageRoot,"app-test-")); t.after(()=>rm(directory,{recursive:true,force:true}));
  const files={BUSENTITY:jsonl([entity(invalid?{ZipCode:"invalid"}: {})]),BUSINFO:jsonl([info()]),PRINCIPAL:jsonl([principal()])}, workbook=Buffer.from("synthetic fixture only");
  const selection={schema_version:"utah-business-list-package@1.0.0",package_id:path.basename(directory),observed_at:NOW.toISOString(),updated_through:"2026-09-28",source:"https://secure.utah.gov/datarequest/businesses/index.html",transformation:{version:"fixture-export@1.0.0",method:"Synthetic fixture.",performed_by:"test-fixture",source_native:false,reproducible_extraction_verified:false},files:{ORIGINAL_WORKBOOK:{path:"original.xlsx",bytes:workbook.length,sha256:sha(workbook)},...Object.fromEntries(Object.entries(files).map(([name,value])=>[name,{path:`${name}.jsonl`,bytes:value.length,sha256:sha(value),row_count:1}]))},claims:{network_requests:0,purchase_performed:false,account_created:false,source_authenticity_verified:false,physical_site_verified:false,current_operation_verified:false,national_admission_performed:false,source_pointer_changed:false}};
  for(const [name,value] of Object.entries(files)) await writeFile(path.join(directory,`${name}.jsonl`),value); await writeFile(path.join(directory,"original.xlsx"),workbook); await writeFile(path.join(directory,"selection.json"),`${JSON.stringify(selection)}\n`); return path.join(directory,"selection.json");
}

test("runs and independently verifies one operation-scoped local-review release",async t=>{
  const selectionPath=await fixture(t); let operation; t.after(()=>operation&&rm(operation,{recursive:true,force:true}));
  const pointer=path.join(APP_ROOT,"data","business-sources","utah-business-list-organizations","current.json"), before=await readFile(pointer).catch(error=>error.code==="ENOENT"?null:Promise.reject(error));
  const saved=globalThis.fetch; globalThis.fetch=()=>assert.fail("offline app made a request");
  try { const result=await runUtahBusinessListAppJob({selectionPath,now:()=>NOW}); operation=result.operationDirectory; assert.equal(result.receipt.status,"SUCCEEDED"); assert.equal(result.receipt.export_policy,"local-review-only"); assert.equal(result.receipt.admission_eligible,false); assert.equal(result.receipt.network_requests,0); await rm(path.dirname(selectionPath),{recursive:true,force:true}); const verified=await verifyUtahBusinessListAppJob(result.receiptPath); assert.equal(verified.receipt.release.release_id,result.receipt.release.release_id); assert.deepEqual(await readFile(pointer).catch(error=>error.code==="ENOENT"?null:Promise.reject(error)),before); await assert.rejects(readFile(path.join(operation,"input-snapshot")),{code:"ENOENT"}); }
  finally {globalThis.fetch=saved;}
});

test("fails closed on open receipt shapes and external manifest paths",async t=>{
  const selectionPath=await fixture(t); let operation; t.after(()=>operation&&rm(operation,{recursive:true,force:true})); const result=await runUtahBusinessListAppJob({selectionPath,now:()=>NOW}); operation=result.operationDirectory; const original=JSON.parse(await readFile(result.receiptPath)); await writeFile(result.receiptPath,`${JSON.stringify({...original,unexpected:true})}\n`); await assert.rejects(verifyUtahBusinessListAppJob(result.receiptPath),/shape|envelope/); original.release.manifest="config/source-policies/utah-business-list-offline.json"; await writeFile(result.receiptPath,`${JSON.stringify(original)}\n`); await assert.rejects(verifyUtahBusinessListAppJob(result.receiptPath),/outside its operation release/);
});

test("rejects invalid package paths, hardlinks, and pre-cancelled work",async t=>{
  const selectionPath=await fixture(t),directory=path.dirname(selectionPath); await assert.rejects(readUtahBusinessListImportSelection(path.join(APP_ROOT,"config","connectors","utah-business-list-offline.json")),/fixed package/); await rm(path.join(directory,"BUSINFO.jsonl")); await link(path.join(directory,"BUSENTITY.jsonl"),path.join(directory,"BUSINFO.jsonl")); await assert.rejects(readUtahBusinessListImportSelection(selectionPath),/unsafe|single regular file/); const controller=new AbortController(); controller.abort(); await assert.rejects(runUtahBusinessListAppJob({selectionPath,signal:controller.signal}),{name:"AbortError"});
});

test("records failure and removes only operation-owned work",async t=>{
  const selectionPath=await fixture(t),directory=path.dirname(selectionPath); let operation; t.after(()=>operation&&rm(operation,{recursive:true,force:true})); const before=new Set(await readdir(operationsRoot).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error))); let reads=0; await assert.rejects(runUtahBusinessListAppJob({selectionPath,now:()=>{reads++; return reads===2?new Date("invalid"):NOW;}}),/offline app operation rejected/); const added=(await readdir(operationsRoot)).filter(name=>!before.has(name)); assert.equal(added.length,1); operation=path.join(operationsRoot,added[0]); const terminal=JSON.parse(await readFile(path.join(operation,"receipt.json"))); assert.equal(terminal.status,"FAILED"); assert.equal(terminal.inspection_required,true); await verifyUtahBusinessListAppJob(path.join(operation,"receipt.json")); await assert.rejects(readFile(path.join(operation,"input-snapshot")),{code:"ENOENT"}); await assert.rejects(readFile(path.join(operation,"release")),{code:"ENOENT"}); assert.match(await readFile(path.join(directory,"BUSENTITY.jsonl"),"utf8"),/Example Market/);
});

test("records cooperative cancellation and removes only operation-owned work",async t=>{
  const selectionPath=await fixture(t),directory=path.dirname(selectionPath); let operation; t.after(()=>operation&&rm(operation,{recursive:true,force:true})); const before=new Set(await readdir(operationsRoot).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error))); const controller=new AbortController(); let reads=0; await assert.rejects(runUtahBusinessListAppJob({selectionPath,signal:controller.signal,now:()=>{reads++; if(reads===2) controller.abort(); return NOW;}}),{name:"AbortError"}); const added=(await readdir(operationsRoot)).filter(name=>!before.has(name)); assert.equal(added.length,1); operation=path.join(operationsRoot,added[0]); const terminal=JSON.parse(await readFile(path.join(operation,"receipt.json"))); assert.equal(terminal.status,"CANCELLED"); await verifyUtahBusinessListAppJob(path.join(operation,"receipt.json")); await assert.rejects(readFile(path.join(operation,"input-snapshot")),{code:"ENOENT"}); await assert.rejects(readFile(path.join(operation,"release")),{code:"ENOENT"}); assert.match(await readFile(path.join(directory,"BUSENTITY.jsonl"),"utf8"),/Example Market/);
});

test("connector pins zero-network and admission-ineligible boundaries",async()=>{
  const contract=JSON.parse(await readFile(path.join(APP_ROOT,"config","connectors","utah-business-list-app.json"))); assert.deepEqual(contract.allowed_hosts,[]); assert.equal(contract.execution_limits.max_parallel_requests,0); const source=await readFile(new URL("./utah-business-list-app.mjs",import.meta.url),"utf8"); assert.doesNotMatch(source,/\bfetch\s*\(|https?:\/\//); assert.match(source,/source_authenticity_verified: false/); assert.match(source,/reproducible_extraction_verified: false/); assert.match(source,/admission_eligible: false/); assert.match(source,/source_pointer_changed: false/); assert.match(source,/national_admission_performed: false/);
});
