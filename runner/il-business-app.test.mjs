import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { readIllinoisImportSelection, runIllinoisBusinessAppJob, verifyIllinoisBusinessAppJob } from "./il-business-app.mjs";

const packageRoot = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "packages");
const operationsRoot = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "operations");
const fixed = (width, fields) => { const chars = Array(width).fill(" "); for (const [start, value] of fields) for (let i = 0; i < String(value).length; i += 1) chars[start + i] = String(value)[i]; return chars.join(""); };
const doc = (name, rows) => [`RUN DATE = 20260901 FILE:${name}`, ...rows, `END OF FILE RECORD COUNT= ${String(rows.length).padStart(7, "0")}`].join("\r\n") + "\r\n";
function sources() {
  const id = "12345678";
  return {
    corporation_master: doc("CORPMASTER", [fixed(160, [[0,id],[8,"20010102"],[16,"00000000"],[24,"17"],[26,"GEN"],[29,"00"],[31,"4"],[32,"20260831"]])]),
    corporation_name: doc("CORPNAME", [fixed(197, [[0,id],[8,"Fixture Illinois Corporation"]])]),
    corporation_annual: doc("CORPANNUAL", [fixed(126, [[0,id],[43,"20260801"],[59,"00000000"]])]),
    llc_master: doc("LLCMASTER", [fixed(136, [[0,id],[8,"RETAIL"],[14,"01"],[16,"20260830"],[24,"20190506"],[32,"00000000"],[40,"M"],[41,"17"],[43,"100 CAPITAL AVENUE"],[88,"SPRINGFIELD"],[118,"627011234"],[127,"IL"],[129,"FLAG001"]])]),
    llc_name: doc("LLCNAME", [fixed(128, [[0,id],[8,"Fixture Illinois LLC"]])]),
  };
}
async function makePackage(id) {
  const directory = path.join(packageRoot, id); await mkdir(directory, { recursive: true });
  const files = {}, content = sources();
  for (const [key, value] of Object.entries(content)) { files[key] = `${key}.txt`; await writeFile(path.join(directory, files[key]), value, "latin1"); }
  const selection = { schema_version: "il-business-import-selection@1.0.0", package_id: id, files };
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify(selection)}\n`);
  return path.join(directory, "selection.json");
}

test("runs and independently verifies one operation-scoped offline Illinois package", async t => {
  const id = `test-${Date.now()}-${process.pid}`, selectionPath = await makePackage(id); let operation;
  t.after(async () => { await rm(path.dirname(selectionPath), { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  const productionPointer = path.join(APP_ROOT, "data", "business-sources", "il-business-registry-active-organizations", "current.json");
  const pointerBefore = await readFile(productionPointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  const result = await runIllinoisBusinessAppJob({ selectionPath, minimumOrganizations: 1 }); operation = result.operationDirectory;
  assert.equal(result.receipt.status, "SUCCEEDED"); assert.equal(result.receipt.network_requests, 0); assert.equal(result.receipt.source_pointer_changed, false); assert.equal(result.receipt.national_admission_performed, false);
  assert.match(result.receipt.source.manifest, new RegExp(`data/imports/illinois-business-registry/operations/${path.basename(operation)}/release/releases/`));
  const verified = await verifyIllinoisBusinessAppJob(result.receiptPath); assert.equal(verified.receipt.source.release_id, result.receipt.source.release_id);
  const pointerAfter = await readFile(productionPointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)); assert.deepEqual(pointerAfter, pointerBefore);
});

test("rejects non-package paths, duplicate files, links, and pre-cancelled work", async t => {
  const id = `invalid-${Date.now()}-${process.pid}`, selectionPath = await makePackage(id); t.after(() => rm(path.dirname(selectionPath), { recursive: true, force: true }));
  const selection = JSON.parse(await readFile(selectionPath, "utf8")); selection.files.llc_name = selection.files.llc_master; await writeFile(selectionPath, `${JSON.stringify(selection)}\n`);
  await assert.rejects(readIllinoisImportSelection(selectionPath), /distinct file/);
  await assert.rejects(readIllinoisImportSelection(path.join(APP_ROOT, "config", "connectors", "il-business-registry.json")), /fixed package/);
  selection.files.llc_name = "linked.txt"; await link(path.join(path.dirname(selectionPath), selection.files.llc_master), path.join(path.dirname(selectionPath), "linked.txt")); await writeFile(selectionPath, `${JSON.stringify(selection)}\n`);
  await assert.rejects(readIllinoisImportSelection(selectionPath), /single regular file/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runIllinoisBusinessAppJob({ selectionPath, minimumOrganizations: 1, signal: controller.signal }), { name: "AbortError" });
});

test("records failure and removes only the operation-scoped release", async t => {
  const id = `failure-${Date.now()}-${process.pid}`, selectionPath = await makePackage(id); let operation;
  t.after(async () => { await rm(path.dirname(selectionPath), { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  const selection = JSON.parse(await readFile(selectionPath, "utf8")); await writeFile(path.join(path.dirname(selectionPath), selection.files.corporation_master), "not an official fixed-width file\n");
  const before = new Set(await readdir(operationsRoot).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error)));
  await assert.rejects(runIllinoisBusinessAppJob({ selectionPath, minimumOrganizations: 1 }), /offline app operation rejected/);
  const added = (await readdir(operationsRoot)).filter(name => !before.has(name)); assert.equal(added.length, 1); operation = path.join(operationsRoot, added[0]);
  const receipt = JSON.parse(await readFile(path.join(operation, "receipt.json"), "utf8")); assert.equal(receipt.status, "FAILED"); assert.equal(receipt.inspection_required, true);
  await assert.rejects(readFile(path.join(operation, "release", "current.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code: "ENOENT" });
  assert.equal((await readFile(path.join(path.dirname(selectionPath), selection.files.corporation_master), "utf8")).startsWith("not an official"), true);
});

test("verification rejects receipts outside the fixed operations root and input identity rewrites", async t => {
  const fake = path.join(APP_ROOT, "tmp", "operations", randomUUID());
  await mkdir(fake, { recursive: true });
  await writeFile(path.join(fake, "receipt.json"), "{}\n");
  t.after(() => rm(path.join(APP_ROOT, "tmp", "operations"), { recursive: true, force: true }));
  await assert.rejects(verifyIllinoisBusinessAppJob(path.join(fake, "receipt.json")), /Receipt path is invalid/);

  const id = `identity-${Date.now()}-${process.pid}`, selectionPath = await makePackage(id);
  const result = await runIllinoisBusinessAppJob({ selectionPath, minimumOrganizations: 1 });
  t.after(async () => { await rm(path.dirname(selectionPath), { recursive: true, force: true }); await rm(result.operationDirectory, { recursive: true, force: true }); });
  const startPath = path.join(result.operationDirectory, "start.json"), receiptPath = result.receiptPath;
  const start = JSON.parse(await readFile(startPath, "utf8"));
  start.inputs[0].sha256 = "0".repeat(64);
  const startBytes = `${JSON.stringify(start)}\n`;
  await writeFile(startPath, startBytes);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.start_sha256 = createHash("sha256").update(startBytes).digest("hex");
  await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`);
  await assert.rejects(verifyIllinoisBusinessAppJob(receiptPath), /Release inputs differ/);
});

test("contract and docs pin the zero-network, no-admission boundary", async () => {
  const contract = JSON.parse(await readFile(path.join(APP_ROOT, "config", "connectors", "il-business-registry-app.json"), "utf8"));
  assert.deepEqual(contract.allowed_hosts, []); assert.equal(contract.execution_limits.max_parallel_requests, 0); assert.equal(contract.execution_limits.required_source_files, 5);
  const source = await readFile(new URL("./il-business-app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//); assert.match(source, /source_pointer_changed: false/); assert.match(source, /national_admission_performed: false/);
});
