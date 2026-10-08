import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { MS_BUSINESS_REPORT_HEADERS, mississippiBusinessReportWarnings } from "./mississippi-business-report-offline.mjs";
import { runMississippiBusinessReportAppJob, verifyMississippiBusinessReportAppJob } from "./mississippi-business-report-app.mjs";

const packagesRoot=path.join(APP_ROOT,"data","imports","mississippi-business-report","packages");
const operationsRoot=path.join(APP_ROOT,"data","imports","mississippi-business-report","operations");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const makeRow=(overrides={})=>Object.fromEntries(MS_BUSINESS_REPORT_HEADERS.map(header=>[header,({"Business Name":"Example Market LLC","Business ID":"1234567","Profile Type":"Limited Liability Company","Domicile Type":"Domestic","Status":"Good Standing","NAICS Code 1":"445110","Principal Address":"100 Main St","City":"Jackson","State":"MS","County":"Hinds","Postal Code":"39201-1234","Formation Date":"01/02/2020",...overrides})[header]??""]));
async function makePackage({rows=[makeRow()],extra=false}={}){
  const id=`test-${randomUUID()}`,directory=path.join(packagesRoot,id);await mkdir(directory,{recursive:true});
  const workbook=Buffer.from("synthetic xlsx fixture, not publisher data"),records=Buffer.from(`${rows.map(JSON.stringify).join("\n")}\n`);
  const selection={schema_version:"mississippi-business-report-package@1.0.0",package_id:id,observed_at:"2026-10-03T12:00:00.000Z",source:"https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3",export:{format:"xlsx",query_description:"Synthetic app fixture.",statewide_complete:false},transformation:{version:"fixture@1.0.0",method:"Synthetic fixture.",performed_by:"test",source_native:false,reproducible_extraction_verified:false},files:{ORIGINAL_WORKBOOK:{path:"original.xlsx",bytes:workbook.length,sha256:sha(workbook)},RECORDS:{path:"records.jsonl",bytes:records.length,sha256:sha(records),row_count:rows.length}},claims:{network_requests:0,acquisition_performed:false,source_authenticity_verified:false,statewide_complete:false,current_operation_verified:false,physical_site_verified:false,redistribution_authorized:false,national_admission_performed:false,production_enrollment:false,source_pointer_changed:false}};
  await writeFile(path.join(directory,"original.xlsx"),workbook);await writeFile(path.join(directory,"records.jsonl"),records);await writeFile(path.join(directory,"selection.json"),`${JSON.stringify(selection)}\n`);if(extra)await writeFile(path.join(directory,"unexpected.txt"),"x");
  return {id,directory};
}

test("runs and independently replays an operation-owned Mississippi local-review release",async t=>{
  const pkg=await makePackage();let operation;t.after(async()=>{await rm(pkg.directory,{recursive:true,force:true});if(operation)await rm(operation,{recursive:true,force:true});});
  const saved=globalThis.fetch;globalThis.fetch=()=>assert.fail("app connector made a network request");
  try{const result=await runMississippiBusinessReportAppJob({packageDirectory:pkg.directory});operation=result.operationDirectory;assert.equal(result.receipt.status,"SUCCEEDED");assert.equal(result.receipt.network_requests,0);assert.equal(result.receipt.acquisition_performed,false);assert.equal(result.receipt.statewide_complete,false);assert.equal(result.receipt.geocode_claim,false);assert.equal(result.receipt.public_export_authorized,false);const proof=await verifyMississippiBusinessReportAppJob(result.receiptPath);assert.equal(proof.receipt.source.record_count,1);const names=await readdir(path.join(operation,"release"));assert.deepEqual(names.sort(),["manifest.json","organizations.jsonl"]);assert.match(await readFile(path.join(operation,"release","organizations.jsonl"),"utf8"),/39201/);}
  finally{globalThis.fetch=saved;}
});

test("post-start cancellation writes CANCELLED and cleans owned snapshot and unpublished release",async t=>{
  const pkg=await makePackage(),controller=new AbortController();let operation,calls=0;const before=new Set(await readdir(operationsRoot).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error)));
  t.after(async()=>{await rm(pkg.directory,{recursive:true,force:true});if(operation)await rm(operation,{recursive:true,force:true});});
  await assert.rejects(runMississippiBusinessReportAppJob({packageDirectory:pkg.directory,signal:controller.signal,now:()=>{calls+=1;if(calls===1)controller.abort();return new Date("2026-10-03T12:00:00.000Z");}}),error=>error.name==="AbortError");
  const added=(await readdir(operationsRoot)).filter(name=>!before.has(name));assert.equal(added.length,1);operation=path.join(operationsRoot,added[0]);const receipt=JSON.parse(await readFile(path.join(operation,"receipt.json"),"utf8"));assert.equal(receipt.status,"CANCELLED");await assert.rejects(readFile(path.join(operation,"input-snapshot")),{code:"ENOENT"});await assert.rejects(readFile(path.join(operation,"release")),{code:"ENOENT"});
});

test("fails before operation creation for invalid inventory, duplicate IDs, and linked packages",async t=>{
  const before=new Set(await readdir(operationsRoot).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error)));
  const extra=await makePackage({extra:true}),duplicate=await makePackage({rows:[makeRow(),makeRow()]}),valid=await makePackage();t.after(()=>Promise.all([rm(extra.directory,{recursive:true,force:true}),rm(duplicate.directory,{recursive:true,force:true}),rm(valid.directory,{recursive:true,force:true})]));
  await assert.rejects(runMississippiBusinessReportAppJob({packageDirectory:extra.directory}),/package inventory/);await assert.rejects(runMississippiBusinessReportAppJob({packageDirectory:duplicate.directory}),/duplicate Business ID/);
  const link=path.join(packagesRoot,`test-link-${randomUUID()}`);try{await symlink(valid.directory,link,"junction");t.after(()=>rm(link,{recursive:true,force:true}));await assert.rejects(runMississippiBusinessReportAppJob({packageDirectory:link}),/Package location|package location/);}catch(error){if(error.code!=="EPERM")throw error;}
  assert.deepEqual(new Set(await readdir(operationsRoot).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error))),before);
});

test("independent verification rejects release tampering and ceiling semantics stay bounded",async t=>{
  assert.match(mississippiBusinessReportWarnings(300000)[0],/truncation is possible/);assert.throws(()=>mississippiBusinessReportWarnings(300001),/published 300,000-row export ceiling/);
  const pkg=await makePackage(),result=await runMississippiBusinessReportAppJob({packageDirectory:pkg.directory});t.after(()=>Promise.all([rm(pkg.directory,{recursive:true,force:true}),rm(result.operationDirectory,{recursive:true,force:true})]));
  await writeFile(path.join(result.operationDirectory,"release","organizations.jsonl"),"{}\n");await assert.rejects(verifyMississippiBusinessReportAppJob(result.receiptPath),/Independent replay/);
});

test("app implementation contains no transport and pins forbidden claims false",async()=>{
  const source=await readFile(new URL("./mississippi-business-report-app.mjs",import.meta.url),"utf8");assert.doesNotMatch(source,/\bfetch\s*\(/);assert.match(source,/network_requests:0/);assert.match(source,/national_admission_performed:false/);assert.match(source,/statewide_complete:false/);assert.match(source,/geocode_claim:false/);assert.match(source,/public_export_authorized:false/);
});

test("offline replay root override accepts only an operation-owned input snapshot",async t=>{
  const pkg=await makePackage();t.after(()=>rm(pkg.directory,{recursive:true,force:true}));
  await assert.rejects(
    import("./mississippi-business-report-offline.mjs").then(({inspectMississippiBusinessReportPackage})=>inspectMississippiBusinessReportPackage(pkg.directory,{packagesRoot:APP_ROOT})),
    /operation-owned snapshot/
  );
});
