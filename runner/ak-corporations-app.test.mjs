import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { AK_CORPORATIONS_HEADERS } from "./ak-corporations.mjs";
import { readAkCorporationsImportSelection, runAkCorporationsAppJob, verifyAkCorporationsAppJob } from "./ak-corporations-app.mjs";

const packages = path.join(APP_ROOT, "data/imports/ak-corporations/packages");
const operations = path.join(APP_ROOT, "data/imports/ak-corporations/operations");
const NOW = () => new Date("2026-10-08T12:00:00.000Z");
const execute = promisify(execFile);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const quote = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const row = overrides => Object.fromEntries(AK_CORPORATIONS_HEADERS.map(name => [name, overrides[name] ?? ""]));
const csv = (overrides = {}) => {
  const value = row({ CORPTYPE:"Business Corporation", ENTITYNUMBER:"100001D", LEGALNAME:"ARCTIC EXAMPLE INC", STATUS:"Good Standing", ENTITYMAILINGADDRESS1:"PO BOX 1", ENTITYMAILINGCITY:"ANCHORAGE", ENTITYMAILINGSTATEPROVINCE:"AK", ENTITYMAILINGZIP:"99501-1234", ENTITYMAILINGCOUNTRY:"US", ENTITYPHYSADDRESS1:"1 TEST ST", ENTITYPHYSCITY:"ANCHORAGE", ENTITYPHYSSTATEPROVINCE:"AK", ENTITYPHYSZIP:"99501", ENTITYPHYSCOUNTRY:"US", REGISTEREDAGENT:"PRIVATE", ...overrides });
  return Buffer.from(`${AK_CORPORATIONS_HEADERS.join(",")}\n${AK_CORPORATIONS_HEADERS.map(name => quote(value[name])).join(",")}\n`);
};

async function packageFixture(id, bytes = csv()) {
  const directory = path.join(packages, id); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "CorporationsDownload.csv"), bytes);
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify({ schema_version:"ak-corporations-import-selection@1.0.0", package_id:id, source:{ file:"CorporationsDownload.csv", sha256:digest(bytes) } })}\n`);
  return { directory, selection: path.join(directory, "selection.json") };
}

test("runs and independently verifies a zero-network Alaska operation after package and transient snapshot removal", async t => {
  const fixture = await packageFixture(`success-${Date.now()}-${process.pid}`); let operation;
  t.after(async () => { await rm(fixture.directory, { recursive:true, force:true }); if (operation) await rm(operation, { recursive:true, force:true }); });
  const pointer = path.join(APP_ROOT, "data/business-sources/ak-corporations-local-review/current.json");
  const before = await readFile(pointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  const result = await runAkCorporationsAppJob({ selectionPath:fixture.selection, now:NOW }); operation = result.operationDirectory;
  assert.equal(result.receipt.status, "SUCCEEDED"); assert.equal(result.receipt.network_requests, 0); assert.equal(result.receipt.production_authorized, false);
  await rm(fixture.directory, { recursive:true, force:true });
  const verified = await verifyAkCorporationsAppJob(result.receiptPath);
  assert.equal(verified.receipt.source.release_id, result.receipt.source.release_id);
  await assert.rejects(readFile(path.join(operation, "input-snapshot/CorporationsDownload.csv")), { code:"ENOENT" });
  const cli = await execute(process.execPath, [path.join(APP_ROOT,"scripts/verify-ak-corporations-app.mjs"), "--receipt", path.relative(APP_ROOT,result.receiptPath)], { cwd:APP_ROOT });
  assert.equal(JSON.parse(cli.stdout).receipt.source.release_id,result.receipt.source.release_id);
  assert.deepEqual(await readFile(pointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)), before);
});

test("rejects escape, hash drift, closed-inventory violations, symlinks, and hardlinks before operation creation", async t => {
  const fixture = await packageFixture(`invalid-${Date.now()}-${process.pid}`); t.after(() => rm(fixture.directory, { recursive:true, force:true }));
  const count = async () => (await readdir(operations).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error))).length;
  const before = await count();
  await assert.rejects(readAkCorporationsImportSelection(path.join(APP_ROOT, "config/connectors/ak-corporations.json")), /fixed Alaska package/);
  const selection = JSON.parse(await readFile(fixture.selection)); selection.source.sha256 = "0".repeat(64); await writeFile(fixture.selection, JSON.stringify(selection));
  await assert.rejects(runAkCorporationsAppJob({ selectionPath:fixture.selection }), /SHA-256/); assert.equal(await count(), before);
  selection.source.sha256 = digest(await readFile(path.join(fixture.directory,"CorporationsDownload.csv"))); await writeFile(fixture.selection, JSON.stringify(selection));
  await writeFile(path.join(fixture.directory,"extra.txt"), "x"); await assert.rejects(readAkCorporationsImportSelection(fixture.selection), /exactly/); await rm(path.join(fixture.directory,"extra.txt"));
  const source = path.join(fixture.directory,"CorporationsDownload.csv"), outsideHard=path.join(APP_ROOT,"data/imports/ak-corporations/hard-source.csv"), hard = path.join(fixture.directory,"hard.csv"); await writeFile(outsideHard,await readFile(source)); await link(outsideHard, hard); selection.source.file="hard.csv"; selection.source.sha256=digest(await readFile(hard)); await writeFile(fixture.selection,JSON.stringify(selection)); await rm(source);
  await assert.rejects(readAkCorporationsImportSelection(fixture.selection), /single regular file/);
  await rm(hard); await rm(outsideHard); const outside=path.join(APP_ROOT,"data/imports/ak-corporations/outside.csv"); await writeFile(outside,csv());
  try { await symlink(outside,source); selection.source.file="CorporationsDownload.csv"; selection.source.sha256=digest(await readFile(outside)); await writeFile(fixture.selection,JSON.stringify(selection)); await assert.rejects(readAkCorporationsImportSelection(fixture.selection), /Links/); }
  catch (error) { if (error.code !== "EPERM") throw error; }
  await rm(outside,{force:true});
});

test("records cancellation and failure, cleaning only operation-owned unpublished data", async t => {
  for (const mode of ["cancel", "failure"]) {
    const bytes = mode === "failure" ? csv({ CORPTYPE:"Unknown Type" }) : csv(), fixture = await packageFixture(`${mode}-${Date.now()}-${process.pid}` , bytes); let operation;
    t.after(async()=>{await rm(fixture.directory,{recursive:true,force:true});if(operation)await rm(operation,{recursive:true,force:true});});
    const before = new Set(await readdir(operations).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error)));
    const controller = new AbortController(); let reads=0;
    await assert.rejects(runAkCorporationsAppJob({ selectionPath:fixture.selection, signal:controller.signal, now:()=>{ if(mode==="cancel" && ++reads===2) controller.abort(); return NOW(); } }), mode === "cancel" ? { name:"AbortError" } : /operation rejected/);
    const added=(await readdir(operations)).filter(name=>!before.has(name)); assert.equal(added.length,1); operation=path.join(operations,added[0]);
    const receipt=JSON.parse(await readFile(path.join(operation,"receipt.json"))); assert.equal(receipt.status,mode==="cancel"?"CANCELLED":"FAILED");
    await verifyAkCorporationsAppJob(path.join(operation,"receipt.json"));
    await assert.rejects(readFile(path.join(operation,"input-snapshot/CorporationsDownload.csv")),{code:"ENOENT"});
    assert.ok((await readFile(path.join(fixture.directory,"CorporationsDownload.csv"))).length>0);
  }
});

test("independent verification rejects receipt and release tampering", async t => {
  const fixture=await packageFixture(`tamper-${Date.now()}-${process.pid}`); const result=await runAkCorporationsAppJob({selectionPath:fixture.selection,now:NOW});
  t.after(()=>Promise.all([rm(fixture.directory,{recursive:true,force:true}),rm(result.operationDirectory,{recursive:true,force:true})]));
  const originalReceipt=await readFile(result.receiptPath); const receipt=JSON.parse(originalReceipt); receipt.unexpected=true; await writeFile(result.receiptPath,`${JSON.stringify(receipt)}\n`);
  await assert.rejects(verifyAkCorporationsAppJob(result.receiptPath),/receipt shape/i); await writeFile(result.receiptPath,originalReceipt);
  const manifest=path.resolve(APP_ROOT,...result.receipt.source.manifest.split("/")); await writeFile(manifest,Buffer.concat([await readFile(manifest),Buffer.from(" ")]));
  await assert.rejects(verifyAkCorporationsAppJob(result.receiptPath),/Manifest hash changed/);
});

test("concurrent replay of one package remains isolated by operation and release identity", async t => {
  const fixture=await packageFixture(`parallel-${Date.now()}-${process.pid}`); const results=await Promise.all([runAkCorporationsAppJob({selectionPath:fixture.selection,now:NOW}),runAkCorporationsAppJob({selectionPath:fixture.selection,now:NOW})]);
  t.after(()=>Promise.all([rm(fixture.directory,{recursive:true,force:true}),...results.map(result=>rm(result.operationDirectory,{recursive:true,force:true}))]));
  assert.notEqual(results[0].operationDirectory,results[1].operationDirectory); assert.notEqual(results[0].receipt.source.release_id,results[1].receipt.source.release_id);
  await Promise.all(results.map(result=>verifyAkCorporationsAppJob(result.receiptPath)));
});

test("contract and implementation pin zero-network local-review boundaries", async () => {
  const contract=JSON.parse(await readFile(path.join(APP_ROOT,"config/connectors/ak-corporations-app.json"))); const dataset=JSON.parse(await readFile(path.join(APP_ROOT,"config/datasets/ak-corporations-local-review.json")));
  assert.deepEqual(contract.allowed_hosts,[]); assert.equal(contract.execution_limits.network_requests,0); assert.equal(dataset.admission_eligible,false); assert.equal(dataset.current_pointer,null);
  const source=await readFile(new URL("./ak-corporations-app.mjs",import.meta.url),"utf8"); assert.doesNotMatch(source,/\bfetch\s*\(|https?:\/\//); assert.match(source,/national_admission_performed: false/);
});
