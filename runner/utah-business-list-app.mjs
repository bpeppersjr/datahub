import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { inspectUtahBusinessListPackage, UTAH_BUSINESS_LIST_NORMALIZER_VERSION } from "./utah-business-list-offline.mjs";

export const UTAH_BUSINESS_LIST_APP_VERSION = "utah-business-list-app@1.0.0";
const PACKAGE_VERSION = "utah-business-list-package@1.0.0";
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const INVENTORY = Object.freeze(["selection.json", "original.xlsx", "BUSENTITY.jsonl", "BUSINFO.jsonl", "PRINCIPAL.jsonl"]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message = "Utah Business List offline app operation rejected.") => Object.assign(new Error(message), { code: "UT_BUSINESS_LIST_APP_JOB" });
const check = (value, message) => { if (!value) throw fail(message); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
const relative = filename => path.relative(APP_ROOT, filename).replaceAll("\\", "/");

async function canonical(filename, { file = false, create = false } = {}) {
  const target = path.resolve(filename), root = path.resolve(APP_ROOT), rel = path.relative(root, target);
  check(rel && !rel.startsWith("..") && !path.isAbsolute(rel), "Path must remain inside datahub.");
  check(await realpath(root) === root, "Datahub root is not canonical.");
  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current, { bigint: true }); }
    catch (error) {
      if (!create || error.code !== "ENOENT") throw error;
      await mkdir(current); info = await lstat(current, { bigint: true });
    }
    check(!info.isSymbolicLink() && await realpath(current) === current, "Links are not accepted.");
    if (current !== target || create) check(info.isDirectory(), "Path ancestor is not a directory.");
    if (current === target && file) check(info.isFile() && info.nlink === 1n, "Input is not a single regular file.");
  }
  return target;
}

async function fixedRead(filename, maximum) {
  filename = await canonical(filename, { file: true });
  const before = await lstat(filename, { bigint: true });
  check(before.size >= 0n && before.size <= BigInt(maximum), "Input size is outside the operation limit.");
  const bytes = await readFile(filename), after = await lstat(filename, { bigint: true });
  check(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, "Input changed while read.");
  return { filename, bytes, bytesCount: Number(before.size), sha256: sha256(bytes) };
}

async function atomicFile(filename, bytes) {
  const temporary = `${filename}.tmp-${randomUUID()}`, handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, filename);
  return sha256(bytes);
}
const atomicJson = (filename, value) => atomicFile(filename, Buffer.from(`${JSON.stringify(value)}\n`));

export async function readUtahBusinessListImportSelection(selectionPath) {
  const expectedRoot = path.join(APP_ROOT, "data", "imports", "utah-business-list", "packages");
  selectionPath = await canonical(selectionPath, { file: true });
  const packageDirectory = path.dirname(selectionPath), packageId = path.basename(packageDirectory);
  check(path.basename(selectionPath) === "selection.json" && path.dirname(packageDirectory) === expectedRoot && PACKAGE.test(packageId), "Selection must be a fixed package selection.json.");
  const inspected = await inspectUtahBusinessListPackage(packageDirectory);
  const inputs = {};
  for (const name of INVENTORY) inputs[name] = await fixedRead(path.join(packageDirectory, name), name === "selection.json" ? 64_000 : 1_000_000_000);
  let selection;
  try { selection = JSON.parse(inputs["selection.json"].bytes.toString("utf8")); } catch { throw fail("Selection must be valid UTF-8 JSON."); }
  check(selection.schema_version === PACKAGE_VERSION && selection.package_id === packageId && inspected.selection_sha256 === inputs["selection.json"].sha256, "Selection identity changed during inspection.");
  for (const [role, descriptor] of Object.entries(selection.files)) {
    const name = role === "ORIGINAL_WORKBOOK" ? "original.xlsx" : `${role}.jsonl`, input = inputs[name];
    check(descriptor.path === name && descriptor.bytes === input.bytesCount && descriptor.sha256 === input.sha256, "Selected input changed during inspection.");
  }
  return { packageDirectory, packageId, inspected, selection, inputs };
}

export async function runUtahBusinessListAppJob({ selectionPath, operationsRoot = path.join(APP_ROOT, "data", "imports", "utah-business-list", "operations"), signal, now = () => new Date() } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "Invalid cancellation signal.");
  signal?.throwIfAborted();
  const selected = await readUtahBusinessListImportSelection(selectionPath);
  const root = await canonical(operationsRoot, { create: true });
  check(root === path.join(APP_ROOT, "data", "imports", "utah-business-list", "operations"), "Operations root is fixed.");
  const runId = randomUUID(), operation = path.join(root, runId); await mkdir(operation);
  const startedAt = now().toISOString();
  const recordedInputs = INVENTORY.map(name => ({ role: name, path: relative(selected.inputs[name].filename), bytes: selected.inputs[name].bytesCount, sha256: selected.inputs[name].sha256 }));
  const start = { schema_version: UTAH_BUSINESS_LIST_APP_VERSION, run_id: runId, status: "RUNNING", started_at: startedAt, execution_mode: "operator-supplied-derived-local-review", network_requests: 0, purchase_performed: false, account_created: false, package_id: selected.packageId, selection: relative(selected.inputs["selection.json"].filename), selection_sha256: selected.inputs["selection.json"].sha256, inputs: recordedInputs };
  const startSha256 = await atomicJson(path.join(operation, "start.json"), start);
  const snapshotRoot = path.join(operation, "input-snapshot"), stagingRoot = path.join(operation, "release.tmp"), releaseRoot = path.join(operation, "release");
  try {
    signal?.throwIfAborted(); await mkdir(snapshotRoot);
    for (const name of INVENTORY) {
      const target = path.join(snapshotRoot, name); await copyFile(selected.inputs[name].filename, target, constants.COPYFILE_EXCL);
      const snapshot = await fixedRead(target, name === "selection.json" ? 64_000 : 1_000_000_000), source = selected.inputs[name];
      check(snapshot.bytesCount === source.bytesCount && snapshot.sha256 === source.sha256, "Selected input changed before its operation snapshot was fixed."); signal?.throwIfAborted();
    }
    await mkdir(stagingRoot);
    const recordsBytes = Buffer.from(selected.inspected.records.map(value => JSON.stringify(value)).join("\n") + (selected.inspected.records.length ? "\n" : ""));
    const recordsSha256 = await atomicFile(path.join(stagingRoot, "organizations.jsonl"), recordsBytes);
    const releaseId = `utah-business-list-${runId}`;
    const manifest = { schema_version: "utah-business-list-operation-release@1.0.0", release_id: releaseId, run_id: runId, package_id: selected.packageId, created_at: now().toISOString(), source_updated_through: selected.selection.updated_through, records: { path: "organizations.jsonl", bytes: recordsBytes.length, sha256: recordsSha256, row_count: selected.inspected.records.length, schema_version: UTAH_BUSINESS_LIST_NORMALIZER_VERSION }, counts: selected.inspected.counts, claims: { source_native: false, source_authenticity_verified: false, reproducible_extraction_verified: false, admission_eligible: false, network_requests: 0, purchase_performed: false, account_created: false, source_pointer_changed: false, national_admission_performed: false }, inputs: recordedInputs };
    const manifestSha256 = await atomicJson(path.join(stagingRoot, "manifest.json"), manifest);
    signal?.throwIfAborted(); await rename(stagingRoot, releaseRoot); await rm(snapshotRoot, { recursive: true, force: true });
    const receipt = { schema_version: UTAH_BUSINESS_LIST_APP_VERSION, run_id: runId, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, release: { manifest: relative(path.join(releaseRoot, "manifest.json")), manifest_sha256: manifestSha256, release_id: releaseId, record_count: selected.inspected.records.length }, network_requests: 0, purchase_performed: false, account_created: false, source_pointer_changed: false, national_admission_performed: false, export_policy: "local-review-only", admission_eligible: false };
    await atomicJson(path.join(operation, "receipt.json"), receipt);
    await verifyUtahBusinessListAppJob(path.join(operation, "receipt.json"), { signal });
    return { operationDirectory: operation, receiptPath: path.join(operation, "receipt.json"), receipt };
  } catch (error) {
    await rm(releaseRoot, { recursive: true, force: true }).catch(() => {}); await rm(stagingRoot, { recursive: true, force: true }).catch(() => {}); await rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    const cancelled = signal?.aborted === true;
    const receipt = { schema_version: UTAH_BUSINESS_LIST_APP_VERSION, run_id: runId, status: cancelled ? "CANCELLED" : "FAILED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, release: null, network_requests: 0, purchase_performed: false, account_created: false, source_pointer_changed: false, national_admission_performed: false, admission_eligible: false, error_code: cancelled ? "UT_BUSINESS_LIST_APP_CANCELLED" : "UT_BUSINESS_LIST_APP_JOB", inspection_required: true };
    await atomicJson(path.join(operation, "receipt.json"), receipt).catch(() => {});
    if (cancelled) signal.throwIfAborted();
    throw error?.code === "UT_BUSINESS_LIST_APP_JOB" ? error : fail();
  }
}

export async function verifyUtahBusinessListAppJob(receiptPath, { signal } = {}) {
  signal?.throwIfAborted(); receiptPath = await canonical(receiptPath, { file: true });
  const operation = path.dirname(receiptPath), runId = path.basename(operation), expectedRoot = path.join(APP_ROOT, "data", "imports", "utah-business-list", "operations");
  check(path.basename(receiptPath) === "receipt.json" && UUID.test(runId) && path.resolve(path.dirname(operation)).toLowerCase() === path.resolve(expectedRoot).toLowerCase(), "Receipt path is invalid.");
  const startFile = await fixedRead(path.join(operation, "start.json"), 100_000), receiptFile = await fixedRead(receiptPath, 100_000);
  let start, receipt; try { start = JSON.parse(startFile.bytes); receipt = JSON.parse(receiptFile.bytes); } catch { throw fail("Operation records must be valid JSON."); }
  check(exact(start, ["schema_version","run_id","status","started_at","execution_mode","network_requests","purchase_performed","account_created","package_id","selection","selection_sha256","inputs"]), "Start record shape is invalid.");
  check(start.schema_version === UTAH_BUSINESS_LIST_APP_VERSION && start.run_id === runId && start.status === "RUNNING" && start.execution_mode === "operator-supplied-derived-local-review" && start.network_requests === 0 && start.purchase_performed === false && start.account_created === false && PACKAGE.test(start.package_id) && start.selection === `data/imports/utah-business-list/packages/${start.package_id}/selection.json` && SHA.test(start.selection_sha256) && !Number.isNaN(Date.parse(start.started_at)) && Array.isArray(start.inputs) && start.inputs.length === INVENTORY.length, "Start record envelope is invalid.");
  const roles = new Set(); for (const input of start.inputs) { check(exact(input,["role","path","bytes","sha256"]) && INVENTORY.includes(input.role) && !roles.has(input.role) && input.path === `data/imports/utah-business-list/packages/${start.package_id}/${input.role}` && Number.isSafeInteger(input.bytes) && input.bytes >= 0 && SHA.test(input.sha256), "Start input contract is invalid."); roles.add(input.role); }
  check(roles.size === INVENTORY.length && start.inputs.find(value => value.role === "selection.json")?.sha256 === start.selection_sha256, "Start input roles are incomplete.");
  const success = receipt.status === "SUCCEEDED", terminalKeys = success ? ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","release","network_requests","purchase_performed","account_created","source_pointer_changed","national_admission_performed","export_policy","admission_eligible"] : ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","release","network_requests","purchase_performed","account_created","source_pointer_changed","national_admission_performed","admission_eligible","error_code","inspection_required"];
  check(exact(receipt, terminalKeys) && receipt.schema_version === UTAH_BUSINESS_LIST_APP_VERSION && receipt.run_id === runId && receipt.execution_mode === start.execution_mode && receipt.started_at === start.started_at && !Number.isNaN(Date.parse(receipt.finished_at)) && Date.parse(receipt.finished_at) >= Date.parse(receipt.started_at) && receipt.start_sha256 === startFile.sha256 && receipt.network_requests === 0 && receipt.purchase_performed === false && receipt.account_created === false && receipt.source_pointer_changed === false && receipt.national_admission_performed === false && receipt.admission_eligible === false, "Receipt envelope is invalid.");
  if (!success) { check(["FAILED","CANCELLED"].includes(receipt.status) && receipt.release === null && receipt.inspection_required === true && receipt.error_code === (receipt.status === "CANCELLED" ? "UT_BUSINESS_LIST_APP_CANCELLED" : "UT_BUSINESS_LIST_APP_JOB"), "Terminal receipt status is invalid."); return { receiptPath, receiptSha256: receiptFile.sha256, receipt }; }
  check(receipt.export_policy === "local-review-only" && exact(receipt.release,["manifest","manifest_sha256","release_id","record_count"]) && receipt.release.release_id === `utah-business-list-${runId}` && SHA.test(receipt.release.manifest_sha256) && Number.isSafeInteger(receipt.release.record_count) && receipt.release.record_count >= 0, "Successful receipt is incomplete.");
  const manifestPath = path.resolve(APP_ROOT, ...receipt.release.manifest.split("/")); check(manifestPath === path.join(operation,"release","manifest.json"), "Receipt manifest is outside its operation release.");
  check(isDeepStrictEqual((await readdir(path.dirname(manifestPath))).sort(),["manifest.json","organizations.jsonl"]), "Release inventory is not closed.");
  const manifestFile = await fixedRead(manifestPath, 2_000_000); check(manifestFile.sha256 === receipt.release.manifest_sha256, "Manifest hash changed."); const manifest = JSON.parse(manifestFile.bytes);
  check(exact(manifest,["schema_version","release_id","run_id","package_id","created_at","source_updated_through","records","counts","claims","inputs"]) && manifest.schema_version === "utah-business-list-operation-release@1.0.0" && manifest.release_id === receipt.release.release_id && manifest.run_id === runId && manifest.package_id === start.package_id && !Number.isNaN(Date.parse(manifest.created_at)) && /^\d{4}-\d{2}-\d{2}$/.test(manifest.source_updated_through) && exact(manifest.records,["path","bytes","sha256","row_count","schema_version"]) && Number.isSafeInteger(manifest.records.bytes) && manifest.records.bytes >= 0 && Number.isSafeInteger(manifest.records.row_count) && manifest.records.row_count === receipt.release.record_count && manifest.records.path === "organizations.jsonl" && manifest.records.schema_version === UTAH_BUSINESS_LIST_NORMALIZER_VERSION && SHA.test(manifest.records.sha256) && isDeepStrictEqual(manifest.inputs,start.inputs), "Release manifest is invalid.");
  check(exact(manifest.counts,["business_entities","business_info_rows_validated_not_retained","principal_rows_validated_not_retained"]) && Object.values(manifest.counts).every(value=>Number.isSafeInteger(value)&&value>=0) && manifest.counts.business_entities === manifest.records.row_count, "Release counts are invalid.");
  check(exact(manifest.claims,["source_native","source_authenticity_verified","reproducible_extraction_verified","admission_eligible","network_requests","purchase_performed","account_created","source_pointer_changed","national_admission_performed"]) && manifest.claims.source_native === false && manifest.claims.source_authenticity_verified === false && manifest.claims.reproducible_extraction_verified === false && manifest.claims.admission_eligible === false && manifest.claims.network_requests === 0 && manifest.claims.purchase_performed === false && manifest.claims.account_created === false && manifest.claims.source_pointer_changed === false && manifest.claims.national_admission_performed === false, "Release authority claims are invalid.");
  const recordsFile = await fixedRead(path.join(path.dirname(manifestPath),manifest.records.path),1_000_000_000); check(recordsFile.bytesCount === manifest.records.bytes && recordsFile.sha256 === manifest.records.sha256, "Records artifact changed.");
  const lines = recordsFile.bytesCount ? recordsFile.bytes.toString("utf8").slice(0,-1).split("\n") : []; check((recordsFile.bytesCount === 0 || recordsFile.bytes.at(-1) === 10) && lines.length === manifest.records.row_count, "Records framing or count is invalid.");
  for (const line of lines) {
    let record; try { record=JSON.parse(line); } catch { throw fail("Records artifact contains invalid JSON."); }
    check(exact(record,["schema_version","source_record_id","jurisdiction","entity_id","entity_number","entity_type","license_type","organization_name","administrative_address","registration_date","expiration_date","home_state","registration_status","status_reason","status_changed_date","last_renewal_date","naics_code","provenance","claims"])
      && record.schema_version === UTAH_BUSINESS_LIST_NORMALIZER_VERSION && SHA.test(record.source_record_id) && record.jurisdiction === "UT"
      && exact(record.administrative_address,["address_line_1","address_line_2","city","state","zip5","zip4"])
      && (record.administrative_address.zip5 === null || /^\d{5}$/.test(record.administrative_address.zip5)) && (record.administrative_address.zip4 === null || /^\d{4}$/.test(record.administrative_address.zip4))
      && exact(record.provenance,["package_id","observed_at","source_updated_through","original_workbook_sha256","derived_sheets_sha256","transformation_version","source_sheet","representation"])
      && record.provenance.package_id === start.package_id && record.provenance.representation === "operator-derived-jsonl" && record.provenance.source_sheet === "BUSENTITY" && SHA.test(record.provenance.original_workbook_sha256) && SHA.test(record.provenance.derived_sheets_sha256)
      && exact(record.claims,["organization_registration_evidence","source_native","source_authenticity_verified","reproducible_extraction_verified","current_operation_verified","physical_site_verified","national_admission_performed","admission_eligible"])
      && record.claims.organization_registration_evidence === true && record.claims.source_native === false && record.claims.source_authenticity_verified === false && record.claims.reproducible_extraction_verified === false && record.claims.current_operation_verified === false && record.claims.physical_site_verified === false && record.claims.national_admission_performed === false && record.claims.admission_eligible === false,
    "Record authority contract is invalid.");
  }
  return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
}
