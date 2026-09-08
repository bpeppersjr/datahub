import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { runPaChildcareAppJobWithTransport, runPaChildcareAppJob } from "./pa-childcare-app.mjs";
import { summarizePaChildcareAppJob } from "./pa-childcare-reporting.mjs";
import { createPaChildcareFixture, paFixtureOptions } from "./pa-childcare-test-fixtures.mjs";
import { loadPaChildcareReportingEnrollment } from "./pa-childcare-reporting-enrollment.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
const runFile=promisify(execFile);
test("PA reporting rejects unsupported options and pre-abort",async()=>{
  await assert.rejects(summarizePaChildcareAppJob("missing",{signal:AbortSignal.abort()}),{name:"AbortError"});
  await assert.rejects(summarizePaChildcareAppJob("missing",{nationalTotal:1000}));
});

test("PA reporting verifies a real injected app cohort and conserves reported geography gaps offline",paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,"data/tmp/pa-reporting-test-"));
  try{
    const f=createPaChildcareFixture({count:501,mutate:(rows,kind)=>{
      if(kind!=="page")return;
      for(const row of rows){
        const index=Number(row.master_provider_index.slice(-4));
        row.facility_address=index===1?"PO Box 1":"123 Main Street";row.facility_city="Harrisburg";
        row.facility_county=index===2?null:"Dauphin";row.facility_county_fips_code=index===2?null:"043";
        row.capacity=index%11===0?"invalid":"25";
        if(index%100===0)row.facility_zip_code=null;
        if(index===3)row.facility_zip_code="012340567";
        if(index===4||index===5)row.license_number="SAME-LICENSE-DIFFERENT-SOURCE-ROWS";
      }
    }});
    const job=await runPaChildcareAppJobWithTransport({outputRoot:path.join(root,"data","app"),fetchImpl:f.fetchImpl,industryRunId:"reporting-fixture"});
    const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail("reporting and retained reuse must remain offline");
    try{
      const summary=await summarizePaChildcareAppJob(job.receiptPath);
      assert.equal(summary.source_rows,501);assert.equal(summary.accepted_facility_rows,500);assert.equal(summary.quarantined_rows,1);
      assert.deepEqual(summary.by_reported_state,[{state:"PA",facility_rows:500,percent_of_accepted_cohort:100}]);
      for(const group of [summary.by_reported_state,summary.by_reported_county,summary.by_reported_zip])assert.equal(group.reduce((n,r)=>n+r.facility_rows,0),500);
      assert.deepEqual(summary.by_reported_zip.find(r=>r.zip5===null),{state:"PA",zip5:null,facility_rows:6,percent_of_accepted_cohort:1.2});
      assert.deepEqual(summary.by_reported_zip.find(r=>r.zip5==="01234"),{state:"PA",zip5:"01234",facility_rows:1,percent_of_accepted_cohort:0.2});
      assert.equal(summary.by_reported_zip.find(r=>r.zip5==="17101").facility_rows,493);
      assert.equal(summary.by_reported_county.find(r=>r.county_source===null).facility_rows,1);
      assert.deepEqual(summary.quality,{with_zip5:494,with_zip4:494,with_points:499,missing_points:1,capacity_unavailable:46});
      assert.equal(summary.provenance.execution_mode,"injected-test-transport");assert.equal(summary.provenance.app_run_id,job.receipt.run_id);
      assert.equal(summary.provenance.acquired_manifest_sha256,job.receipt.acquired.manifest_sha256);assert.equal(summary.provenance.normalized_manifest_sha256,job.receipt.normalized.manifest_sha256);
      assert.equal(summary.provenance.app_receipt_sha256,hash(await readFile(job.receiptPath)));
      assert.equal(summary.claims.national_completeness_percent,null);assert.equal(summary.claims.unique_active_business_count,null);assert.equal(summary.claims.source_authenticity_verified,false);assert.equal(summary.claims.public_export_authorized,false);
      assert.equal(JSON.stringify(summary).includes("17101-0123"),false);
      const cli=await runFile(process.execPath,["scripts/report-pa-childcare.mjs","--receipt",job.receiptPath],{cwd:APP_ROOT,windowsHide:true,maxBuffer:2_000_000});
      assert.deepEqual(JSON.parse(cli.stdout),summary);
      await assert.rejects(runFile(process.execPath,["scripts/report-pa-childcare.mjs","--invalid",job.receiptPath],{cwd:APP_ROOT,windowsHide:true}),error=>error.code===1&&error.stderr.includes("No acquisition was performed"));
      await mkdir(path.join(root,"config"));
      await writeFile(path.join(root,"config/pa-childcare-reporting-enrollment.json"),JSON.stringify({schema_version:"pa-childcare-reporting-enrollment@1.0.0",app_receipt_path:path.relative(root,job.receiptPath).split(path.sep).join("/"),app_receipt_sha256:summary.provenance.app_receipt_sha256})+"\n");
      await assert.rejects(loadPaChildcareReportingEnrollment({root}),/reporting enrollment rejected/);
      assert.equal(JSON.stringify(summary).includes("123 Main Street"),false);assert.equal(JSON.stringify(summary).includes("Synthetic center"),false);
      const retained=await runPaChildcareAppJob({outputRoot:path.join(root,"reuse"),acquiredManifestPath:job.receipt.acquired.manifest_path});
      const repeated=await summarizePaChildcareAppJob(retained.receiptPath);
      assert.deepEqual(repeated.by_reported_zip,summary.by_reported_zip);
      assert.deepEqual(repeated.by_reported_county,summary.by_reported_county);
      assert.equal(repeated.accepted_facility_rows,summary.accepted_facility_rows);
      const normalizedPath=job.receipt.normalized.manifest_path,normalizedBytes=await readFile(normalizedPath);
      const rowsPath=path.join(path.dirname(normalizedPath),"normalized.jsonl"),rowsBytes=await readFile(rowsPath);
      const checkpointPath=path.join(path.dirname(job.receiptPath),"normalized.json"),checkpointBytes=await readFile(checkpointPath),appBytes=await readFile(job.receiptPath);
      for(const mutate of [rows=>{rows[0].physical_address.state="NJ";},rows=>{rows[0].physical_address.zip_code="not-a-ZIP";},rows=>{rows[1].source_record_id=rows[0].source_record_id;rows[1].provenance.source_master_provider_index=rows[0].provenance.source_master_provider_index;}]){
        const records=rowsBytes.toString("utf8").trimEnd().split("\n").map(line=>JSON.parse(line));mutate(records);
        const changedRows=Buffer.from(records.map(row=>JSON.stringify(row)).join("\n")+"\n"),manifest=JSON.parse(normalizedBytes),artifact=manifest.artifacts.find(a=>a.path==="normalized.jsonl");
        artifact.bytes=changedRows.length;artifact.sha256=hash(changedRows);
        const changedManifest=Buffer.from(JSON.stringify(manifest)+"\n"),checkpoint=JSON.parse(checkpointBytes),receipt=JSON.parse(appBytes);
        checkpoint.verification.manifest_sha256=hash(changedManifest);receipt.normalized.manifest_sha256=hash(changedManifest);
        try{
          await writeFile(rowsPath,changedRows);await writeFile(normalizedPath,changedManifest);await writeFile(checkpointPath,JSON.stringify(checkpoint)+"\n");await writeFile(job.receiptPath,JSON.stringify(receipt)+"\n");
          await assert.rejects(summarizePaChildcareAppJob(job.receiptPath));
        }finally{await writeFile(rowsPath,rowsBytes);await writeFile(normalizedPath,normalizedBytes);await writeFile(checkpointPath,checkpointBytes);await writeFile(job.receiptPath,appBytes);}
      }
      const sourcePath=job.receipt.acquired.manifest_path,sourceBytes=await readFile(sourcePath);
      const altered=JSON.parse(sourceBytes);altered.claims.public_export_authorized=true;
      await writeFile(sourcePath,JSON.stringify(altered)+"\n");await assert.rejects(summarizePaChildcareAppJob(job.receiptPath));await writeFile(sourcePath,sourceBytes);
      const receiptBytes=await readFile(job.receiptPath),changed=JSON.parse(receiptBytes);
      changed.acquired.manifest_sha256=hash("unrelated");await writeFile(job.receiptPath,JSON.stringify(changed)+"\n");await assert.rejects(summarizePaChildcareAppJob(job.receiptPath));await writeFile(job.receiptPath,receiptBytes);
      assert.deepEqual(await summarizePaChildcareAppJob(job.receiptPath),summary);
    }finally{globalThis.fetch=originalFetch;}
  }finally{await rm(root,{recursive:true,force:true});}
});
