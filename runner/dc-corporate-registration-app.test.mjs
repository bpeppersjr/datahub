import assert from "node:assert/strict";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import {
  DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES,
  DC_CORPORATE_REGISTRATION_LAYER_URL,
  DC_CORPORATE_REGISTRATION_MODEL_TYPES,
  DC_CORPORATE_REGISTRATION_QUERY_URL,
  DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA,
  DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY,
  preflightDcCorporateRegistration,
} from "./dc-corporate-registration.mjs";
import { readDcCorporateRegistrationImportSelection, runDcCorporateRegistrationAppJob, verifyDcCorporateRegistrationAppJob } from "./dc-corporate-registration-app.mjs";

const packageRoot = path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "packages");
const operationsRoot = path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "operations");
const NOW = new Date("2026-09-03T12:00:00.000Z");
const row = {
  FILE_NUMBER: "L00000001", ENTITY_STATUS: "Active - In Good Standing", LOCALE: "Domestic", MODELTYPE: "Domestic Business Corporation", BUSINESS_NAME: "FIXTURE HOLDINGS INC",
  BUSNIESS_ADDRESS_LINE1: "100 TEST AVE", BUSNIESS_ADDRESS_LINE2: null, BUSNIESS_ADDRESS_LINE3: null, BUSNIESS_ADDRESS_LINE4: null, BUSINESS_CITY: "WASHINGTON", BUSINESS_STATE: "DC", ZIPCODE: "20001-1234", BUSINESS_COUNTRY: "UNITED STATES", SUFFIX: "INC",
  EFFECTIVE_DATE: 1577923200000, FOREIGN_DATEOF_ORGANIZATION: null, NEXT_REPORTYEAR_DUE: "2028", DCS_LAST_MOD_DTTM: 1788422019000, DATE_LAST_REPORT_FILED: 1766275200000, NEXT_REPORTYEAR: null, LATESTFILED_REPORTDATE: null, LATESTREPORT_YEARFILED: null, OBJECTID: 1001, GLOBALID: "{11111111-1111-4111-8111-111111111111}",
};
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

async function receipt() {
  const statuses = Object.fromEntries(DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY.map(value => [value, value === DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES[0] ? 1 : 0]));
  const models = Object.fromEntries(DC_CORPORATE_REGISTRATION_MODEL_TYPES.map(value => [value, value === "Domestic Business Corporation" ? 1 : 0]));
  return preflightDcCorporateRegistration({ now: () => NOW, fetchImpl: async (url, options = {}) => {
    if (String(url) === `${DC_CORPORATE_REGISTRATION_LAYER_URL}?f=pjson`) return response({ name: "Corporate Registration", type: "Table", displayField: "BUSINESS_NAME", objectIdField: "OBJECTID", globalIdField: "GLOBALID", geometryType: null, capabilities: "Query,Extract", dateFieldsTimeReference: { timeZone: "Eastern Standard Time", timeZoneIANA: "America/New_York", respectsDaylightSaving: true }, fields: DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.map(([name, type, length]) => ({ name, type, length })) });
    assert.equal(String(url), DC_CORPORATE_REGISTRATION_QUERY_URL);
    const body = new URLSearchParams(options.body);
    if (body.get("returnCountOnly") === "true") return response({ count: 1 });
    if (body.get("groupByFieldsForStatistics") === "ENTITY_STATUS") return response({ features: Object.entries(statuses).map(([ENTITY_STATUS, ROW_COUNT]) => ({ attributes: { ENTITY_STATUS, ROW_COUNT } })) });
    if (body.get("groupByFieldsForStatistics") === "MODELTYPE") return response({ features: Object.entries(models).map(([MODELTYPE, ROW_COUNT]) => ({ attributes: { MODELTYPE, ROW_COUNT } })) });
    return response({ features: [{ attributes: { MAX_DCS_LAST_MOD_DTTM: 1788422019000 } }] });
  } });
}

async function makePackage(id) {
  const directory = path.join(packageRoot, id); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "active.jsonl"), `${JSON.stringify(row)}\n`);
  await writeFile(path.join(directory, "preflight.json"), `${JSON.stringify(await receipt())}\n`);
  await writeFile(path.join(directory, "selection.json"), `${JSON.stringify({ schema_version: "dc-corporate-registration-import-selection@1.0.0", package_id: id, files: { active_records: "active.jsonl", preflight_receipt: "preflight.json" } })}\n`);
  return path.join(directory, "selection.json");
}

test("runs and independently verifies one zero-network operation-scoped DC package", async t => {
  const selectionPath = await makePackage(`test-${Date.now()}-${process.pid}`); let operation;
  t.after(async () => { await rm(path.dirname(selectionPath), { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  const pointer = path.join(APP_ROOT, "data", "business-sources", "dc-corporate-registration-organizations", "current.json");
  const before = await readFile(pointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  const result = await runDcCorporateRegistrationAppJob({ selectionPath, now: () => NOW }); operation = result.operationDirectory;
  assert.equal(result.receipt.status, "SUCCEEDED"); assert.equal(result.receipt.network_requests, 0); assert.equal(result.receipt.source_pointer_changed, false); assert.equal(result.receipt.national_admission_performed, false);
  assert.match(result.receipt.source.source_release_id, /^dc-corporate-registration-/);
  await rm(path.dirname(selectionPath), { recursive: true, force: true });
  assert.equal((await verifyDcCorporateRegistrationAppJob(result.receiptPath)).receipt.source.release_id, result.receipt.source.release_id);
  assert.deepEqual(await readFile(pointer).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)), before);
  await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code: "ENOENT" });
});

test("fails closed on open receipt shapes and operation-external manifest paths", async t => {
  const selectionPath = await makePackage(`tamper-${Date.now()}-${process.pid}`); let operation;
  t.after(async () => { await rm(path.dirname(selectionPath), { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  const result = await runDcCorporateRegistrationAppJob({ selectionPath, now: () => NOW }); operation = result.operationDirectory;
  const original = JSON.parse(await readFile(result.receiptPath));
  await writeFile(result.receiptPath, `${JSON.stringify({ ...original, unexpected: true })}\n`);
  await assert.rejects(verifyDcCorporateRegistrationAppJob(result.receiptPath), /receipt shape/i);
  original.source.manifest = "config/source-policies/dc-corporate-registration.json";
  await writeFile(result.receiptPath, `${JSON.stringify(original)}\n`);
  await assert.rejects(verifyDcCorporateRegistrationAppJob(result.receiptPath), /outside its operation release/);
});

test("rejects invalid package paths, duplicate input roles, hardlinks, and pre-cancelled work", async t => {
  const selectionPath = await makePackage(`invalid-${Date.now()}-${process.pid}`), directory = path.dirname(selectionPath);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const selection = JSON.parse(await readFile(selectionPath)); selection.files.preflight_receipt = selection.files.active_records; await writeFile(selectionPath, `${JSON.stringify(selection)}\n`);
  await assert.rejects(readDcCorporateRegistrationImportSelection(selectionPath), /distinct file/);
  await assert.rejects(readDcCorporateRegistrationImportSelection(path.join(APP_ROOT, "config", "connectors", "dc-corporate-registration.json")), /fixed package/);
  await rm(path.join(directory, "preflight.json")); await link(path.join(directory, "active.jsonl"), path.join(directory, "preflight.json")); selection.files.preflight_receipt = "preflight.json"; await writeFile(selectionPath, `${JSON.stringify(selection)}\n`);
  await assert.rejects(readDcCorporateRegistrationImportSelection(selectionPath), /single regular file/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runDcCorporateRegistrationAppJob({ selectionPath, signal: controller.signal }), { name: "AbortError" });
});

test("records failure and removes only operation-scoped inputs and release", async t => {
  const selectionPath = await makePackage(`failure-${Date.now()}-${process.pid}`), directory = path.dirname(selectionPath); let operation;
  t.after(async () => { await rm(directory, { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  await writeFile(path.join(directory, "active.jsonl"), `${JSON.stringify({ ...row, EMAIL: "forbidden@example.test" })}\n`);
  const before = new Set(await readdir(operationsRoot).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error)));
  await assert.rejects(runDcCorporateRegistrationAppJob({ selectionPath, now: () => NOW }), /offline app operation rejected/);
  const added = (await readdir(operationsRoot)).filter(name => !before.has(name)); assert.equal(added.length, 1); operation = path.join(operationsRoot, added[0]);
  const terminal = JSON.parse(await readFile(path.join(operation, "receipt.json"))); assert.equal(terminal.status, "FAILED"); assert.equal(terminal.inspection_required, true);
  await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(operation, "release")), { code: "ENOENT" });
  assert.match(await readFile(path.join(directory, "active.jsonl"), "utf8"), /forbidden@example\.test/);
});

test("records cooperative cancellation and removes only operation-owned work", async t => {
  const selectionPath = await makePackage(`cancel-${Date.now()}-${process.pid}`), directory = path.dirname(selectionPath); let operation;
  t.after(async () => { await rm(directory, { recursive: true, force: true }); if (operation) await rm(operation, { recursive: true, force: true }); });
  const before = new Set(await readdir(operationsRoot).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error)));
  const controller = new AbortController(); let clockReads = 0;
  await assert.rejects(runDcCorporateRegistrationAppJob({ selectionPath, signal: controller.signal, now: () => {
    clockReads += 1; if (clockReads === 2) controller.abort(); return NOW;
  } }), { name: "AbortError" });
  const added = (await readdir(operationsRoot)).filter(name => !before.has(name)); assert.equal(added.length, 1); operation = path.join(operationsRoot, added[0]);
  const terminal = JSON.parse(await readFile(path.join(operation, "receipt.json")));
  assert.equal(terminal.status, "CANCELLED"); assert.equal(terminal.source, null); assert.equal(terminal.error_code, "DC_CORPORATE_APP_CANCELLED");
  await verifyDcCorporateRegistrationAppJob(path.join(operation, "receipt.json"));
  await assert.rejects(readFile(path.join(operation, "input-snapshot")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(operation, "release")), { code: "ENOENT" });
  assert.match(await readFile(path.join(directory, "active.jsonl"), "utf8"), /FIXTURE HOLDINGS/);
});

test("contract pins the zero-network and no-admission boundary", async () => {
  const contract = JSON.parse(await readFile(path.join(APP_ROOT, "config", "connectors", "dc-corporate-registration-app.json")));
  assert.deepEqual(contract.allowed_hosts, []); assert.equal(contract.execution_limits.max_parallel_requests, 0); assert.equal(contract.execution_limits.required_source_files, 2);
  const source = await readFile(new URL("./dc-corporate-registration-app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\//); assert.match(source, /source_pointer_changed: false/); assert.match(source, /national_admission_performed: false/);
});
