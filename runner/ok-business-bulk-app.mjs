import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { buildOkBusinessBulkOffline, readOkBusinessBulkPackage } from "./ok-business-bulk-offline.mjs";

export const OK_BUSINESS_BULK_APP_VERSION = "ok-business-bulk-app@1.0.0";
const OPERATIONS_ROOT = path.join(APP_ROOT, "data", "imports", "oklahoma-business-bulk", "operations");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (message = "Oklahoma business bulk offline app operation rejected.") => Object.assign(new Error(message), { code: "OK_BUSINESS_BULK_APP" });
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
    catch (error) { if (!create || error.code !== "ENOENT") throw error; await mkdir(current); info = await lstat(current, { bigint: true }); }
    check(!info.isSymbolicLink() && await realpath(current) === current, "Links are not accepted.");
    if (current !== target || create) check(info.isDirectory(), "Path ancestor is not a directory.");
    if (current === target && file) check(info.isFile() && info.nlink === 1n, "Input is not a single regular file.");
  }
  return target;
}

async function fixedRead(filename, maximum) {
  filename = await canonical(filename, { file: true });
  const before = await lstat(filename, { bigint: true });
  check(before.size > 0n && before.size <= BigInt(maximum), "File size is outside the operation limit.");
  const bytes = await readFile(filename), after = await lstat(filename, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "File changed while read.");
  return { filename, bytes, bytesCount: Number(before.size), sha256: sha256(bytes) };
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp-${randomUUID()}`, bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, filename);
  return sha256(bytes);
}

export async function runOkBusinessBulkAppJob({ selectionPath, operationsRoot = OPERATIONS_ROOT, signal, now = () => new Date() } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "Invalid cancellation signal.");
  signal?.throwIfAborted();
  const selected = await readOkBusinessBulkPackage(selectionPath);
  const root = await canonical(operationsRoot, { create: true });
  check(root === OPERATIONS_ROOT, "Operations root is fixed.");
  const runId = randomUUID(), operation = path.join(root, runId);
  await mkdir(operation);
  const startedAt = now().toISOString();
  const start = {
    schema_version: OK_BUSINESS_BULK_APP_VERSION, run_id: runId, status: "RUNNING", started_at: startedAt,
    execution_mode: "operator-supplied-official-bulk-file", network_requests: 0, acquisition_performed: false,
    purchase_performed: false, account_action_performed: false, package_id: selected.packageId,
    selection: relative(selectionPath), selection_sha256: selected.selectionSha256,
    source: { path: relative(path.join(selected.packageDirectory, selected.selection.source_file)), bytes: selected.sourceBytes, sha256: selected.sourceSha256 },
  };
  const startSha256 = await atomicJson(path.join(operation, "start.json"), start);
  const snapshotRoot = path.join(operation, "input-snapshot"), snapshotPackage = path.join(snapshotRoot, selected.packageId), releaseRoot = path.join(operation, "release");
  try {
    signal?.throwIfAborted();
    await mkdir(snapshotPackage, { recursive: true });
    await copyFile(selectionPath, path.join(snapshotPackage, "selection.json"), constants.COPYFILE_EXCL);
    await copyFile(path.join(selected.packageDirectory, selected.selection.source_file), path.join(snapshotPackage, "business-bulk.txt"), constants.COPYFILE_EXCL);
    const snapshot = await readOkBusinessBulkPackage(path.join(snapshotPackage, "selection.json"), { packagesRoot: snapshotRoot });
    check(snapshot.selectionSha256 === selected.selectionSha256 && snapshot.sourceSha256 === selected.sourceSha256 && snapshot.sourceBytes === selected.sourceBytes, "Selected package changed before its operation snapshot was fixed.");
    const child = await buildOkBusinessBulkOffline({ selectionPath: path.join(snapshotPackage, "selection.json"), outputDirectory: releaseRoot, packagesRoot: snapshotRoot, signal });
    signal?.throwIfAborted();
    const childReceipt = await fixedRead(path.join(releaseRoot, "receipt.json"), 100_000);
    const organizations = await fixedRead(path.join(releaseRoot, "organizations.jsonl"), 1_500_000_000);
    check(child.organizations_sha256 === organizations.sha256 && child.selection_sha256 === selected.selectionSha256 && child.source_sha256 === selected.sourceSha256, "Built release differs from the fixed operation input.");
    await rm(snapshotRoot, { recursive: true, force: true });
    const source = { release: relative(releaseRoot), receipt: relative(childReceipt.filename), receipt_sha256: childReceipt.sha256, organizations: relative(organizations.filename), organizations_sha256: organizations.sha256, projected_organization_count: child.projected_organization_count, process_date: selected.processDate };
    const receipt = { schema_version: OK_BUSINESS_BULK_APP_VERSION, run_id: runId, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source, network_requests: 0, acquisition_performed: false, purchase_performed: false, account_action_performed: false, source_pointer_changed: false, national_admission_performed: false, physical_site_claim: false, current_operation_claim: false, export_policy: "local-review-only" };
    await atomicJson(path.join(operation, "receipt.json"), receipt);
    return { operationDirectory: operation, receiptPath: path.join(operation, "receipt.json"), receipt };
  } catch {
    await rm(releaseRoot, { recursive: true, force: true }).catch(() => {});
    await rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    const cancelled = signal?.aborted === true;
    const receipt = { schema_version: OK_BUSINESS_BULK_APP_VERSION, run_id: runId, status: cancelled ? "CANCELLED" : "FAILED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source: null, network_requests: 0, acquisition_performed: false, purchase_performed: false, account_action_performed: false, source_pointer_changed: false, national_admission_performed: false, physical_site_claim: false, current_operation_claim: false, error_code: cancelled ? "OK_BUSINESS_BULK_APP_CANCELLED" : "OK_BUSINESS_BULK_APP", inspection_required: true };
    await atomicJson(path.join(operation, "receipt.json"), receipt).catch(() => {});
    if (cancelled) signal.throwIfAborted();
    throw fail();
  }
}

export async function verifyOkBusinessBulkAppJob(receiptPath, { signal } = {}) {
  signal?.throwIfAborted();
  receiptPath = await canonical(receiptPath, { file: true });
  const operation = path.dirname(receiptPath), runId = path.basename(operation);
  check(path.basename(receiptPath) === "receipt.json", "Receipt filename is invalid.");
  check(UUID.test(runId), "Receipt operation ID is invalid.");
  check(path.resolve(path.dirname(operation)).toLowerCase() === path.resolve(OPERATIONS_ROOT).toLowerCase(), "Receipt path is invalid.");
  const startFile = await fixedRead(path.join(operation, "start.json"), 100_000), receiptFile = await fixedRead(receiptPath, 100_000);
  const start = JSON.parse(startFile.bytes), receipt = JSON.parse(receiptFile.bytes);
  check(exact(start, ["schema_version","run_id","status","started_at","execution_mode","network_requests","acquisition_performed","purchase_performed","account_action_performed","package_id","selection","selection_sha256","source"]), "Start record shape is invalid.");
  check(start.schema_version === OK_BUSINESS_BULK_APP_VERSION && start.run_id === runId && start.status === "RUNNING" && start.execution_mode === "operator-supplied-official-bulk-file" && start.network_requests === 0 && start.acquisition_performed === false && start.purchase_performed === false && start.account_action_performed === false && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(start.package_id) && start.selection === `data/imports/oklahoma-business-bulk/packages/${start.package_id}/selection.json` && SHA.test(start.selection_sha256) && exact(start.source, ["path","bytes","sha256"]) && start.source.path === `data/imports/oklahoma-business-bulk/packages/${start.package_id}/business-bulk.txt` && Number.isSafeInteger(start.source.bytes) && start.source.bytes > 0 && SHA.test(start.source.sha256), "Start record envelope is invalid.");
  const successKeys = ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","source","network_requests","acquisition_performed","purchase_performed","account_action_performed","source_pointer_changed","national_admission_performed","physical_site_claim","current_operation_claim","export_policy"];
  const failureKeys = ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","source","network_requests","acquisition_performed","purchase_performed","account_action_performed","source_pointer_changed","national_admission_performed","physical_site_claim","current_operation_claim","error_code","inspection_required"];
  check(exact(receipt, receipt.status === "SUCCEEDED" ? successKeys : failureKeys), "Terminal receipt shape is invalid.");
  const common = receipt.schema_version === OK_BUSINESS_BULK_APP_VERSION && receipt.run_id === runId && receipt.execution_mode === start.execution_mode && receipt.started_at === start.started_at && receipt.start_sha256 === startFile.sha256 && !Number.isNaN(Date.parse(receipt.finished_at)) && Date.parse(receipt.finished_at) >= Date.parse(start.started_at) && receipt.network_requests === 0 && receipt.acquisition_performed === false && receipt.purchase_performed === false && receipt.account_action_performed === false && receipt.source_pointer_changed === false && receipt.national_admission_performed === false && receipt.physical_site_claim === false && receipt.current_operation_claim === false;
  check(common, "Receipt envelope is invalid.");
  if (receipt.status === "SUCCEEDED") {
    check(receipt.export_policy === "local-review-only" && exact(receipt.source, ["release","receipt","receipt_sha256","organizations","organizations_sha256","projected_organization_count","process_date"]), "Successful receipt is incomplete.");
    const release = path.join(operation, "release"), childReceiptPath = path.join(release, "receipt.json"), organizationsPath = path.join(release, "organizations.jsonl");
    check(path.resolve(APP_ROOT, receipt.source.release) === release && path.resolve(APP_ROOT, receipt.source.receipt) === childReceiptPath && path.resolve(APP_ROOT, receipt.source.organizations) === organizationsPath, "Release artifacts are outside the operation-owned release.");
    const childFile = await fixedRead(childReceiptPath, 100_000), organizations = await fixedRead(organizationsPath, 1_500_000_000), child = JSON.parse(childFile.bytes);
    check(exact(child, ["schema_version","status","package_id","selection_sha256","source_sha256","source_bytes","source_record_counts","projected_organization_count","organizations_sha256","network_requests","acquisition_performed","purchase_performed","source_pointer_changed","national_admission_performed","physical_site_claim","current_operation_claim","export_policy"]), "Child receipt shape is invalid.");
    check(childFile.sha256 === receipt.source.receipt_sha256 && organizations.sha256 === receipt.source.organizations_sha256 && child.organizations_sha256 === organizations.sha256 && child.selection_sha256 === start.selection_sha256 && child.source_sha256 === start.source.sha256 && child.source_bytes === start.source.bytes && child.projected_organization_count === receipt.source.projected_organization_count && child.status === "SUCCEEDED" && child.network_requests === 0 && child.acquisition_performed === false && child.purchase_performed === false && child.source_pointer_changed === false && child.national_admission_performed === false && child.physical_site_claim === false && child.current_operation_claim === false && child.export_policy === "local-review-only", "Release evidence differs from the operation receipt.");
    let count = 0;
    for (const line of organizations.bytes.toString("utf8").split("\n")) if (line) {
      const record = JSON.parse(line); count += 1;
      check(record.schema_version === "ok-business-registry-organization@1.0.0" && record.export_policy === "local-review-only" && record.temporal_status === "source-registry-status-not-independent-proof-of-current-operation" && record.administrative_address?.scope !== "physical-operating-site" && record.provenance?.package_id === start.package_id && record.provenance?.source_sha256 === start.source.sha256 && record.provenance?.process_date_raw === receipt.source.process_date, "Release record makes an unsupported publication claim.");
    }
    check(count === child.projected_organization_count, "Release row count differs from its receipt.");
  } else check(["FAILED", "CANCELLED"].includes(receipt.status) && receipt.source === null && receipt.inspection_required === true && receipt.error_code === (receipt.status === "CANCELLED" ? "OK_BUSINESS_BULK_APP_CANCELLED" : "OK_BUSINESS_BULK_APP"), "Terminal receipt status is invalid.");
  return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
}
