import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { runOkBusinessBulkAppJob, verifyOkBusinessBulkAppJob } from "./ok-business-bulk-app.mjs";

const packagesRoot = path.join(APP_ROOT, "data", "imports", "oklahoma-business-bulk", "packages");
const operationsRoot = path.join(APP_ROOT, "data", "imports", "oklahoma-business-bulk", "operations");
const sha = value => createHash("sha256").update(value).digest("hex");
const types = Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(2, "0"));
const fields = { "01":23,"02":9,"03":12,"04":14,"05":14,"06":13,"07":7,"08":7,"09":3,"10":3,"11":3,"12":3,"13":3,"14":3,"15":3,"16":3,"17":10,"18":9 };
const line = (type, values = {}) => Array.from({ length: fields[type] }, (_, index) => values[index] ?? (index === 0 ? type : "")).join("~");

async function makePackage({ duplicate = false } = {}) {
  const id = `test-${randomUUID()}`, directory = path.join(packagesRoot, id);
  await mkdir(directory, { recursive: true });
  const entity = line("01", { 1:"1234567890", 2:"A", 3:"LL", 4:"ADDR1", 5:"TEST ORGANIZATION", 8:"20200101", 10:"20200101" });
  const rows = [entity, ...(duplicate ? [entity] : []), line("02", { 1:"ADDR1", 2:"100 MAIN ST", 4:"OKLAHOMA CITY", 5:"OK", 6:"73102", 7:"1234", 8:"US" }), line("03", { 1:"1234567890", 3:"PRIVATE PERSON" }), line("11", { 1:"A", 2:"ACTIVE" }), line("12", { 1:"LL", 2:"LIMITED LIABILITY COMPANY" })];
  const counts = Object.fromEntries(types.map(type => [type, rows.filter(row => row.startsWith(`${type}~`)).length]));
  const bytes = Buffer.from(`${rows.join("\n")}\n${["99", "9999999999", "20261003", ...types.map(type => String(counts[type]))].join("~")}\n`);
  await writeFile(path.join(directory, "business-bulk.txt"), bytes);
  const selection = { schema_version:"ok-business-bulk-selection@1.0.0", package_id:id, observed_at:"2026-10-03T00:00:00.000Z", source_file:"business-bulk.txt", source_sha256:sha(bytes), authorization:{ operator_supplied:true, network_acquisition_authorized:false, purchase_authorized:false, production_admission_authorized:false, source_pointer_change_authorized:false } };
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify(selection)}\n`);
  return { directory, selectionPath:path.join(directory, "selection.json") };
}

test("runs and independently verifies an operation-owned Oklahoma offline release", async t => {
  const pkg = await makePackage(); let operation;
  t.after(async () => { await rm(pkg.directory, { recursive:true, force:true }); if (operation) await rm(operation, { recursive:true, force:true }); });
  const result = await runOkBusinessBulkAppJob({ selectionPath:pkg.selectionPath }); operation = result.operationDirectory;
  assert.equal(result.receipt.status, "SUCCEEDED"); assert.equal(result.receipt.network_requests, 0); assert.equal(result.receipt.purchase_performed, false);
  assert.equal(result.receipt.physical_site_claim, false); assert.equal(result.receipt.current_operation_claim, false); assert.equal(result.receipt.national_admission_performed, false);
  await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code:"ENOENT" });
  const verified = await verifyOkBusinessBulkAppJob(result.receiptPath);
  assert.equal(verified.receipt.source.projected_organization_count, 1);
  assert.doesNotMatch(await readFile(path.join(operation, "release", "organizations.jsonl"), "utf8"), /PRIVATE PERSON/);
});

test("post-start failure retains a terminal receipt and cleans only owned artifacts", async t => {
  const pkg = await makePackage({ duplicate:true });
  const before = new Set(await readdir(operationsRoot).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error)));
  let operation;
  t.after(async () => { await rm(pkg.directory, { recursive:true, force:true }); if (operation) await rm(operation, { recursive:true, force:true }); });
  await assert.rejects(runOkBusinessBulkAppJob({ selectionPath:pkg.selectionPath }), /offline app operation rejected/);
  const added = (await readdir(operationsRoot)).filter(name => !before.has(name)); assert.equal(added.length, 1); operation = path.join(operationsRoot, added[0]);
  const receipt = JSON.parse(await readFile(path.join(operation, "receipt.json"), "utf8")); assert.equal(receipt.status, "FAILED"); assert.equal(receipt.inspection_required, true);
  await assert.rejects(readFile(path.join(operation, "release")), { code:"ENOENT" }); await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code:"ENOENT" });
  assert.match(await readFile(path.join(pkg.directory, "business-bulk.txt"), "utf8"), /TEST ORGANIZATION/);
});

test("post-start cancellation records CANCELLED and removes its owned snapshot and release", async t => {
  const pkg = await makePackage(), controller = new AbortController(); let operation, calls = 0;
  const before = new Set(await readdir(operationsRoot).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error)));
  t.after(async () => { await rm(pkg.directory, { recursive:true, force:true }); if (operation) await rm(operation, { recursive:true, force:true }); });
  await assert.rejects(runOkBusinessBulkAppJob({ selectionPath:pkg.selectionPath, signal:controller.signal, now:() => { calls += 1; if (calls === 1) controller.abort(); return new Date("2026-10-03T00:00:00.000Z"); } }), { name:"AbortError" });
  const added = (await readdir(operationsRoot)).filter(name => !before.has(name)); assert.equal(added.length, 1); operation = path.join(operationsRoot, added[0]);
  const receipt = JSON.parse(await readFile(path.join(operation, "receipt.json"), "utf8")); assert.equal(receipt.status, "CANCELLED");
  await assert.rejects(readFile(path.join(operation, "release")), { code:"ENOENT" }); await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code:"ENOENT" });
});

test("verification rejects paths outside the fixed root and tampered no-site claims", async t => {
  const pkg = await makePackage(), result = await runOkBusinessBulkAppJob({ selectionPath:pkg.selectionPath });
  t.after(async () => { await rm(pkg.directory, { recursive:true, force:true }); await rm(result.operationDirectory, { recursive:true, force:true }); });
  const receipt = JSON.parse(await readFile(result.receiptPath, "utf8")); receipt.physical_site_claim = true; await writeFile(result.receiptPath, `${JSON.stringify(receipt)}\n`);
  await assert.rejects(verifyOkBusinessBulkAppJob(result.receiptPath), /Receipt envelope/);
  const fake = path.join(APP_ROOT, "tmp", randomUUID()); await mkdir(fake); await writeFile(path.join(fake, "receipt.json"), "{}\n"); t.after(() => rm(fake, { recursive:true, force:true }));
  await assert.rejects(verifyOkBusinessBulkAppJob(path.join(fake, "receipt.json")), /Receipt path is invalid/);
});

test("app source contains no transport and pins zero-network governance claims", async () => {
  const source = await readFile(new URL("./ok-business-bulk-app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//); assert.match(source, /network_requests: 0/); assert.match(source, /national_admission_performed: false/); assert.match(source, /current_operation_claim: false/);
});
