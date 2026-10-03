import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { inspectMississippiBusinessReportPackage, mississippiBusinessReportWarnings, MS_BUSINESS_REPORT_HEADERS, normalizeMississippiBusinessReportRow } from "./mississippi-business-report-offline.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const row = overrides => Object.fromEntries(MS_BUSINESS_REPORT_HEADERS.map(header => [header, ({"Business Name":"Example Market LLC","Business ID":"1234567","Other Business Name 1":"Example Market","Profile Type":"Limited Liability Company","Domicile Type":"Domestic","Status":"Good Standing","NAICS Code 1":"445110","Principal Address":"100 Main St","City":"Jackson","State":"MS","County":"Hinds","Postal Code":"39201-1234","Formation Date":"01/02/2020",...overrides})[header] ?? ""]));
const bytes = rows => Buffer.from(rows.map(JSON.stringify).join("\n") + "\n");
async function fixture(t, mutate) {
  const packages = path.join(APP_ROOT, "data", "imports", "mississippi-business-report", "packages"); await mkdir(packages, { recursive: true });
  const directory = await mkdtemp(path.join(packages, "test-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const workbook = Buffer.from("synthetic xlsx fixture, not publisher data"), records = bytes([row()]);
  const selection = { schema_version:"mississippi-business-report-package@1.0.0", package_id:path.basename(directory), observed_at:"2026-10-03T12:00:00.000Z", source:"https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3", export:{format:"xlsx",query_description:"Synthetic one-row test export.",statewide_complete:false}, transformation:{version:"fixture-export@1.0.0",method:"Synthetic fixture modeled on published standard export columns.",performed_by:"test-fixture",source_native:false,reproducible_extraction_verified:false}, files:{ORIGINAL_WORKBOOK:{path:"original.xlsx",bytes:workbook.length,sha256:sha(workbook)},RECORDS:{path:"records.jsonl",bytes:records.length,sha256:sha(records),row_count:1}}, claims:{network_requests:0,acquisition_performed:false,source_authenticity_verified:false,statewide_complete:false,current_operation_verified:false,physical_site_verified:false,redistribution_authorized:false,national_admission_performed:false,production_enrollment:false,source_pointer_changed:false} };
  const state={selection,workbook,records}; mutate?.(state);
  await writeFile(path.join(directory,"original.xlsx"),state.workbook); await writeFile(path.join(directory,"records.jsonl"),state.records); await writeFile(path.join(directory,"selection.json"),`${JSON.stringify(selection)}\n`); return directory;
}

test("strict offline package emits partial administrative evidence and separate ZIP5/ZIP4", async t => {
  const directory=await fixture(t), saved=globalThis.fetch; globalThis.fetch=()=>assert.fail("offline connector made a request");
  try { const result=await inspectMississippiBusinessReportPackage(directory); assert.equal(result.records.length,1); assert.deepEqual(result.records[0].principal_administrative_address,{address_line:"100 Main St",city:"Jackson",state:"MS",county:"Hinds",zip5:"39201",zip4:"1234"}); assert.equal(result.records[0].export_policy,"local-review-only"); assert.equal(result.records[0].claims.source_authenticity_verified,false); assert.equal(result.records[0].claims.statewide_complete,false); assert.equal(result.records[0].claims.current_operation_verified,false); assert.equal(result.records[0].claims.admission_eligible,false); assert.equal(result.records[0].claims.production_enrollment,false); assert.equal(result.records[0].claims.current_pointer_written,false); assert.deepEqual(result.warnings,[]); }
  finally { globalThis.fetch=saved; }
});

test("normalizer is deterministic and rejects joined or malformed ZIP", () => {
  const context={package_id:"fixture",observed_at:"2026-10-03T12:00:00.000Z",original_workbook_sha256:"a".repeat(64),derived_records_sha256:"b".repeat(64),transformation_version:"fixture@1"};
  assert.deepEqual(normalizeMississippiBusinessReportRow(row(),context),normalizeMississippiBusinessReportRow(row(),context));
  assert.throws(()=>normalizeMississippiBusinessReportRow(row({"Postal Code":"3920112345"}),context),/Postal Code/);
});

test("package fails closed on schema, identity, hashes, duplicate IDs, and authority escalation", async t => {
  for (const mutate of [
    s=>{s.selection.claims.statewide_complete=true;}, s=>{s.selection.claims.source_authenticity_verified=true;}, s=>{s.selection.export.statewide_complete=true;}, s=>{s.selection.files.ORIGINAL_WORKBOOK.sha256="0".repeat(64);},
    s=>{s.records=bytes([{...row(),Unexpected:"x"}]);s.selection.files.RECORDS={...s.selection.files.RECORDS,bytes:s.records.length,sha256:sha(s.records)};},
    s=>{s.records=bytes([row(),row()]);s.selection.files.RECORDS={...s.selection.files.RECORDS,bytes:s.records.length,sha256:sha(s.records),row_count:2};},
  ]) await assert.rejects(inspectMississippiBusinessReportPackage(await fixture(t,mutate)),/Mississippi business-report package rejected/);
});

test("row ceiling is enforced and cancellation is observed", async t => {
  assert.match(mississippiBusinessReportWarnings(300000)[0], /truncation is possible/);
  assert.throws(()=>mississippiBusinessReportWarnings(300001), /published 300,000-row export ceiling/);
  const directory=await fixture(t), controller=new AbortController(); controller.abort(); await assert.rejects(inspectMississippiBusinessReportPackage(directory,{signal:controller.signal}),error=>error.name==="AbortError");
  await assert.rejects(inspectMississippiBusinessReportPackage(directory,{maximumRows:300001}),/published ceiling/);
});
