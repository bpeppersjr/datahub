import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { buildDeBusinessLicenses, DE_BUSINESS_LICENSE_SCHEMA } from "./de-business-licenses.mjs";
import { runDeBusinessAppJob, verifyDeBusinessAppJob } from "./de-business-app.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/de-app-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = path.join(root, "baseline"); await mkdir(path.join(base, "derived"), { recursive: true });
  const bytes = Buffer.from(JSON.stringify({ zip_code: "19801", geography: {}, employer_baseline: {} }) + "\n");
  await writeFile(path.join(base, "derived/zip-coverage.jsonl"), bytes);
  await writeFile(path.join(base, "manifest.json"), JSON.stringify({ dataset_id: "census-zbp-baseline", complete_national_release: true, release_id: "fixture", artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] }));
  await writeFile(path.join(base, "current.json"), JSON.stringify({ manifest: "manifest.json" }));
  const built = await buildDeBusinessLicenses({ outputRoot: path.join(root, "source"), zbpPointer: path.join(base, "current.json"), minimumLicenseRows: 1, logger: () => {}, sourceRecords: [{ socrata_row_id: "one", business_name: "Fixture LLC", license_number: "2026000001", category: "RETAIL", current_license_valid_from: "2026-01-01T00:00:00.000", current_license_valid_to: "2026-12-31T00:00:00.000", address_1: "100 Market St", city: "Wilmington", state: "DE", zip: "19801", country: "UNITED STATES" }], catalogMetadata: { id: "5zy2-grhr", name: "Delaware Business Licenses", attribution: "Department of Finance, Division of Revenue", description: "Information for businesses currently licensed in Delaware.", license: { name: "Public Domain" }, rowsUpdatedAt: 1788175917, sourceRecordCount: 1, distinctLicenseCount: 1, columns: DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })) } });
  return { root, built, retainedManifest: path.join(built.releaseDirectory, "manifest.json"), outputRoot: path.join(root, "app") };
}

test("Delaware retained app job verifies offline without rewriting source pointer; receipt tamper rejected", async (t) => {
  const f = await fixture(t), pointer = await readFile(f.built.pointerPath);
  const original = globalThis.fetch; globalThis.fetch = () => { throw new Error("No network allowed"); };
  try {
    const result = await runDeBusinessAppJob({ outputRoot: f.outputRoot, retainedManifest: f.retainedManifest, industryRunId: null });
    const verified = await verifyDeBusinessAppJob(result.receiptPath);
    assert.equal(verified.receipt.execution_mode, "retained-local-verification");
    assert.equal(verified.receipt.source.counts.distinct_licenses_published, 1);
    assert.equal(verified.receipt.source.counts.physical_sites, null);
    assert.deepEqual(await readFile(f.built.pointerPath), pointer);
    const raw = await readFile(result.receiptPath);
    const changed = JSON.parse(raw); changed.native_execution_independently_verified = true;
    await writeFile(result.receiptPath, JSON.stringify(changed));
    await assert.rejects(verifyDeBusinessAppJob(result.receiptPath), { code: "DE_APP_JOB" });
    await writeFile(result.receiptPath, raw);
    await verifyDeBusinessAppJob(result.receiptPath);
  } finally { globalThis.fetch = original; }
});

test("Delaware app rejects option overrides and unsafe paths, preserves foreign lock", async (t) => {
  const f = await fixture(t);
  for (const extra of [{ fetchImpl: () => {} }, { now: () => new Date() }, { industryRunId: {} }]) await assert.rejects(runDeBusinessAppJob({ outputRoot: f.outputRoot, retainedManifest: f.retainedManifest, ...extra }), { code: "DE_APP_JOB" });
  for (const outputRoot of [APP_ROOT, path.dirname(APP_ROOT), path.join(f.built.releaseDirectory, "nested")]) await assert.rejects(runDeBusinessAppJob({ outputRoot, retainedManifest: f.retainedManifest }), { code: "DE_APP_JOB" });
  await mkdir(f.outputRoot); await writeFile(path.join(f.outputRoot, ".app.lock"), "foreign");
  await assert.rejects(runDeBusinessAppJob({ outputRoot: f.outputRoot, retainedManifest: f.retainedManifest }), { code: "DE_APP_JOB" });
  assert.equal(await readFile(path.join(f.outputRoot, ".app.lock"), "utf8"), "foreign");
});

test("Delaware app failed retained verification emits terminal failure without source mutation", async (t) => {
  const f = await fixture(t);
  const original = await readFile(f.retainedManifest);
  const value = JSON.parse(original); value.coverage.distinct_licenses_published++;
  await writeFile(f.retainedManifest, JSON.stringify(value));
  await assert.rejects(runDeBusinessAppJob({ outputRoot: f.outputRoot, retainedManifest: f.retainedManifest }), { code: "DE_APP_JOB" });
  const [job] = await readdir(path.join(f.outputRoot, "jobs"));
  const receipt = JSON.parse(await readFile(path.join(f.outputRoot, "jobs", job, "receipt.json")));
  assert.equal(receipt.status, "FAILED"); assert.equal(receipt.output_state, "inspection-required");
  await assert.rejects(readFile(path.join(f.outputRoot, ".app.lock")), { code: "ENOENT" });
  await writeFile(f.retainedManifest, original);
});

test("Delaware app cancellation after start retains terminal receipt and no borrowed source changes", async (t) => {
  const f = await fixture(t); const controller = new AbortController();
  const original = fs.promises.rename;
  fs.promises.rename = async (from, to) => { const result = await original(from, to); if (String(to).endsWith("start.json")) controller.abort(); return result; };
  syncBuiltinESMExports();
  try { await assert.rejects(runDeBusinessAppJob({ outputRoot: f.outputRoot, retainedManifest: f.retainedManifest, signal: controller.signal }), { name: "AbortError" }); }
  finally { fs.promises.rename = original; syncBuiltinESMExports(); }
  const [job] = await readdir(path.join(f.outputRoot, "jobs"));
  assert.equal(JSON.parse(await readFile(path.join(f.outputRoot, "jobs", job, "receipt.json"))).status, "CANCELLED");
});

test("Delaware fixed fresh entry builds 60000 synthetic rows in isolated app root without network", async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, "config/connectors"), { recursive: true });
  await mkdir(path.join(f.root, "config/source-policies"), { recursive: true });
  for (const file of ["config/connectors/de-business-licenses-app.json", "config/source-policies/de-business-licenses.json"]) await writeFile(path.join(f.root, file), await readFile(path.join(APP_ROOT, file)));
  const baseline = path.join(f.root, "data/business-baselines/census-zbp"); await mkdir(path.join(baseline, "derived"), { recursive: true });
  for (const file of ["current.json", "manifest.json", "derived/zip-coverage.jsonl"]) await writeFile(path.join(baseline, file), await readFile(path.join(f.root, "baseline", file)));
  const moduleUrl = new URL("./de-business-app.mjs", import.meta.url).href;
  const coreUrl = new URL("./de-business-licenses.mjs", import.meta.url).href;
  const code = `
    import {runDeBusinessAppJob,verifyDeBusinessAppJob} from ${JSON.stringify(moduleUrl)};
    import {DE_BUSINESS_LICENSE_SCHEMA} from ${JSON.stringify(coreUrl)};
    import path from 'node:path';
    let calls=0;
    globalThis.fetch=async(url)=>{
      calls++; const parsed=new URL(url);
      if(parsed.pathname.startsWith('/api/views/'))return Response.json({id:'5zy2-grhr',name:'Delaware Business Licenses',attribution:'Department of Finance, Division of Revenue',description:'Information for businesses currently licensed in Delaware.',license:{name:'Public Domain'},rowsUpdatedAt:1788175917,columns:DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName,dataTypeName])=>({fieldName,dataTypeName}))});
      if(parsed.searchParams.get('$select').startsWith('count('))return Response.json([{records:'60000',distinct_licenses:'1'}]);
      const offset=Number(parsed.searchParams.get('$offset')), limit=Number(parsed.searchParams.get('$limit'));
      return Response.json(Array.from({length:Math.min(limit,60000-offset)},(_,i)=>({socrata_row_id:String(offset+i).padStart(8,'0'),business_name:'Synthetic Fixture LLC',license_number:'2026000001',category:'RETAIL',current_license_valid_from:'2026-01-01T00:00:00.000',current_license_valid_to:'2026-12-31T00:00:00.000',address_1:'100 Market St',city:'Wilmington',state:'DE',zip:'19801',country:'UNITED STATES'})));
    };
    const built=await runDeBusinessAppJob({outputRoot:path.join(process.env.DATAHUB_ROOT,'fresh')});
    globalThis.fetch=()=>{throw Error('offline verifier attempted network')};
    const verified=await verifyDeBusinessAppJob(built.receiptPath);
    if(calls!==6||verified.receipt.source.counts.source_current_license_rows!==60000||verified.receipt.execution_mode!=='fixed-native-fetch')throw Error('fixture mismatch');
    const fs=await import('node:fs/promises'),crypto=await import('node:crypto');
    const receipt=JSON.parse(await fs.readFile(built.receiptPath));
    const priorDirectory=path.dirname(built.receiptPath), otherId=crypto.randomUUID(), other=path.join(path.dirname(priorDirectory),otherId);
    await fs.mkdir(other);const start=JSON.parse(await fs.readFile(path.join(priorDirectory,'start.json')));start.run_id=otherId;
    const startRaw=Buffer.from(JSON.stringify(start)+'\\n');await fs.writeFile(path.join(other,'start.json'),startRaw);
    receipt.run_id=otherId;receipt.start_sha256=crypto.createHash('sha256').update(startRaw).digest('hex');
    await fs.writeFile(path.join(other,'receipt.json'),JSON.stringify(receipt));
    let rejected=false;try{await verifyDeBusinessAppJob(path.join(other,'receipt.json'))}catch{rejected=true}if(!rejected)throw Error('fresh cross-job borrow accepted');
    const contractPath=path.join(process.env.DATAHUB_ROOT,'config/connectors/de-business-licenses-app.json');
    const contract=JSON.parse(await fs.readFile(contractPath));contract.version='99';await fs.writeFile(contractPath,JSON.stringify(contract));
    rejected=false;try{await runDeBusinessAppJob({outputRoot:path.join(process.env.DATAHUB_ROOT,'invalid-config')})}catch{rejected=true}if(!rejected)throw Error('config drift accepted');
    console.log('DE_FRESH_FIXTURE_OK');
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], { cwd: APP_ROOT, windowsHide: true, timeout: 120000, maxBuffer: 1000000, env: { ...process.env, DATAHUB_ROOT: f.root, TEMP: f.root, TMP: f.root } });
  assert.match(stdout, /DE_FRESH_FIXTURE_OK/);
});
