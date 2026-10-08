import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, buildAkCorporationsOffline, verifyAkCorporations } from "./ak-corporations.mjs";

export const AK_CORPORATIONS_APP_VERSION = "ak-corporations-app@1.0.0";
export const AK_CORPORATIONS_IMPORT_SELECTION_VERSION = "ak-corporations-import-selection@1.0.0";
const IMPORT_ROOT = path.join(APP_ROOT, "data", "imports", "ak-corporations");
const PACKAGES_ROOT = path.join(IMPORT_ROOT, "packages");
const OPERATIONS_ROOT = path.join(IMPORT_ROOT, "operations");
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (message = "Alaska Corporations offline app operation rejected.") => Object.assign(new Error(message), { code: "AK_CORPORATIONS_APP_JOB" });
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
  check(before.size > 0n && before.size <= BigInt(maximum), "Input size is outside the operation limit.");
  const bytes = await readFile(filename), after = await lstat(filename, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "Input changed while read.");
  return { filename, bytes, bytesCount: Number(before.size), sha256: sha256(bytes) };
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp-${randomUUID()}`, bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, filename);
  return sha256(bytes);
}

export async function readAkCorporationsImportSelection(selectionPath) {
  selectionPath = await canonical(selectionPath, { file: true });
  const packageDirectory = path.dirname(selectionPath), packageId = path.basename(packageDirectory);
  check(path.basename(selectionPath) === "selection.json" && path.dirname(packageDirectory) === PACKAGES_ROOT && PACKAGE.test(packageId), "Selection must be a fixed Alaska package selection.json.");
  const selectionFile = await fixedRead(selectionPath, 16_384);
  let selection;
  try { selection = JSON.parse(selectionFile.bytes.toString("utf8")); } catch { throw fail("Selection must be valid UTF-8 JSON."); }
  check(exact(selection, ["schema_version", "package_id", "source"]) && selection.schema_version === AK_CORPORATIONS_IMPORT_SELECTION_VERSION && selection.package_id === packageId
    && exact(selection.source, ["file", "sha256"]), "Selection contract is invalid.");
  const name = selection.source.file;
  check(typeof name === "string" && name === path.basename(name) && name.length <= 128 && !["selection.json", ".", ".."].includes(name) && /\.csv$/i.test(name), "Selected source must be one package-local CSV basename.");
  check(SHA.test(selection.source.sha256), "Selected source SHA-256 is invalid.");
  check(isDeepStrictEqual((await readdir(packageDirectory)).sort(), ["selection.json", name].sort()), "Package must contain exactly selection.json and its selected CSV.");
  const source = await fixedRead(path.join(packageDirectory, name), 60_000_000);
  check(source.sha256 === selection.source.sha256, "Selected source SHA-256 does not match selection.json.");
  return { packageId, packageDirectory, selectionPath, selectionFile, selection, source };
}

export async function runAkCorporationsAppJob({ selectionPath, operationsRoot = OPERATIONS_ROOT, signal, now = () => new Date() } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "Invalid cancellation signal.");
  signal?.throwIfAborted();
  const selected = await readAkCorporationsImportSelection(selectionPath);
  const root = await canonical(operationsRoot, { create: true });
  check(root === OPERATIONS_ROOT, "Operations root is fixed.");
  const runId = randomUUID(), operation = path.join(root, runId);
  await mkdir(operation);
  const startedAt = now().toISOString();
  const start = { schema_version: AK_CORPORATIONS_APP_VERSION, run_id: runId, status: "RUNNING", started_at: startedAt, execution_mode: "operator-supplied-official-offline-csv", network_requests: 0, acquisition_performed: false, package_id: selected.packageId, selection: relative(selected.selectionPath), selection_sha256: selected.selectionFile.sha256, source: { path: relative(selected.source.filename), bytes: selected.source.bytesCount, sha256: selected.source.sha256 } };
  const startSha256 = await atomicJson(path.join(operation, "start.json"), start);
  const snapshotRoot = path.join(operation, "input-snapshot"), snapshotSource = path.join(snapshotRoot, path.basename(selected.source.filename)), snapshotSelection = path.join(snapshotRoot, "selection.json"), releaseRoot = path.join(operation, "release");
  try {
    signal?.throwIfAborted();
    await mkdir(snapshotRoot);
    await copyFile(selected.selectionPath, snapshotSelection, constants.COPYFILE_EXCL);
    await copyFile(selected.source.filename, snapshotSource, constants.COPYFILE_EXCL);
    const snapshot = await fixedRead(snapshotSource, 60_000_000), selectionSnapshot = await fixedRead(snapshotSelection, 16_384);
    check(snapshot.sha256 === selected.source.sha256 && snapshot.bytesCount === selected.source.bytesCount && selectionSnapshot.sha256 === selected.selectionFile.sha256, "Selected package changed before its operation snapshot was fixed.");
    const built = await buildAkCorporationsOffline({ outputRoot: releaseRoot, sourcePath: snapshotSource, expectedSourceSha256: snapshot.sha256, acknowledgement: AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT, runId, signal, now });
    signal?.throwIfAborted();
    const verified = await verifyAkCorporations(built.manifestPath, { signal });
    const manifest = await fixedRead(built.manifestPath, 2_000_000);
    const source = { manifest: relative(built.manifestPath), manifest_sha256: manifest.sha256, release_id: built.manifest.release_id, source_release_id: built.manifest.source_release_id, coverage: built.manifest.coverage };
    check(verified.release_id === source.release_id && built.manifest.source.input_sha256 === snapshot.sha256, "Verified release differs from the immutable operation input.");
    await rm(snapshotRoot, { recursive: true });
    const receipt = { schema_version: AK_CORPORATIONS_APP_VERSION, run_id: runId, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source, input_snapshot_retained: false, network_requests: 0, acquisition_performed: false, source_pointer_changed: false, admission_eligible: false, national_admission_performed: false, coverage_admission_performed: false, heatmap_admission_performed: false, production_authorized: false, export_policy: "local-review-only" };
    await atomicJson(path.join(operation, "receipt.json"), receipt);
    return { operationDirectory: operation, receiptPath: path.join(operation, "receipt.json"), receipt };
  } catch (primaryError) {
    const cleanupErrors = [];
    for (const owned of [releaseRoot, snapshotRoot]) try { await rm(owned, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    const cancelled = signal?.aborted === true;
    const receipt = { schema_version: AK_CORPORATIONS_APP_VERSION, run_id: runId, status: cancelled ? "CANCELLED" : "FAILED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source: null, input_snapshot_retained: false, network_requests: 0, acquisition_performed: false, source_pointer_changed: false, admission_eligible: false, national_admission_performed: false, coverage_admission_performed: false, heatmap_admission_performed: false, production_authorized: false, error_code: cancelled ? "AK_CORPORATIONS_APP_CANCELLED" : "AK_CORPORATIONS_APP_JOB", inspection_required: true };
    try { await atomicJson(path.join(operation, "receipt.json"), receipt); } catch (error) { cleanupErrors.push(error); }
    if (cancelled) signal.throwIfAborted();
    if (cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], "Alaska Corporations app operation failed and cleanup or terminal receipt persistence was incomplete.");
    throw fail();
  }
}

export async function verifyAkCorporationsAppJob(receiptPath, { signal } = {}) {
  signal?.throwIfAborted();
  receiptPath = await canonical(receiptPath, { file: true });
  const operation = path.dirname(receiptPath), runId = path.basename(operation);
  check(path.basename(receiptPath) === "receipt.json" && UUID.test(runId) && path.resolve(path.dirname(operation)).toLowerCase() === path.resolve(OPERATIONS_ROOT).toLowerCase(), "Receipt path is invalid.");
  const startFile = await fixedRead(path.join(operation, "start.json"), 100_000), receiptFile = await fixedRead(receiptPath, 100_000);
  const start = JSON.parse(startFile.bytes), receipt = JSON.parse(receiptFile.bytes);
  check(exact(start, ["schema_version","run_id","status","started_at","execution_mode","network_requests","acquisition_performed","package_id","selection","selection_sha256","source"]), "Start record shape is invalid.");
  check(start.schema_version === AK_CORPORATIONS_APP_VERSION && start.run_id === runId && start.status === "RUNNING" && start.execution_mode === "operator-supplied-official-offline-csv" && start.network_requests === 0 && start.acquisition_performed === false && PACKAGE.test(start.package_id) && start.selection === `data/imports/ak-corporations/packages/${start.package_id}/selection.json` && SHA.test(start.selection_sha256) && exact(start.source, ["path","bytes","sha256"]) && start.source.path.startsWith(`data/imports/ak-corporations/packages/${start.package_id}/`) && Number.isSafeInteger(start.source.bytes) && start.source.bytes > 0 && SHA.test(start.source.sha256), "Start record envelope is invalid.");
  const successKeys = ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","source","input_snapshot_retained","network_requests","acquisition_performed","source_pointer_changed","admission_eligible","national_admission_performed","coverage_admission_performed","heatmap_admission_performed","production_authorized","export_policy"];
  const failureKeys = ["schema_version","run_id","status","execution_mode","started_at","finished_at","start_sha256","source","input_snapshot_retained","network_requests","acquisition_performed","source_pointer_changed","admission_eligible","national_admission_performed","coverage_admission_performed","heatmap_admission_performed","production_authorized","error_code","inspection_required"];
  check(exact(receipt, receipt.status === "SUCCEEDED" ? successKeys : failureKeys), "Terminal receipt shape is invalid.");
  check(receipt.schema_version === AK_CORPORATIONS_APP_VERSION && receipt.run_id === runId && receipt.execution_mode === start.execution_mode && receipt.started_at === start.started_at && receipt.start_sha256 === startFile.sha256 && !Number.isNaN(Date.parse(receipt.finished_at)) && Date.parse(receipt.finished_at) >= Date.parse(start.started_at) && receipt.network_requests === 0 && receipt.acquisition_performed === false && receipt.source_pointer_changed === false && receipt.admission_eligible === false && receipt.national_admission_performed === false && receipt.coverage_admission_performed === false && receipt.heatmap_admission_performed === false && receipt.production_authorized === false, "Receipt envelope is invalid.");
  if (receipt.status === "SUCCEEDED") {
    check(receipt.input_snapshot_retained === false && receipt.export_policy === "local-review-only" && exact(receipt.source, ["manifest","manifest_sha256","release_id","source_release_id","coverage"]), "Successful receipt is incomplete.");
    try { await lstat(path.join(operation, "input-snapshot")); throw fail("Successful operation retained its transient input snapshot."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const expectedManifest = path.join(operation, "release", "releases", receipt.source.release_id, "manifest.json"), manifestPath = path.resolve(APP_ROOT, ...receipt.source.manifest.split("/"));
    check(manifestPath === expectedManifest, "Receipt manifest is outside its operation release.");
    const manifest = await fixedRead(manifestPath, 2_000_000);
    check(manifest.sha256 === receipt.source.manifest_sha256, "Manifest hash changed.");
    const verified = await verifyAkCorporations(manifestPath, { signal }), manifestValue = JSON.parse(manifest.bytes);
    check(verified.release_id === receipt.source.release_id && manifestValue.source_release_id === receipt.source.source_release_id && manifestValue.run_id === runId && manifestValue.source.input_sha256 === start.source.sha256 && manifestValue.source.input_bytes === start.source.bytes && isDeepStrictEqual(manifestValue.coverage, receipt.source.coverage), "Verified release differs from the operation receipt.");
  } else check(["FAILED", "CANCELLED"].includes(receipt.status) && receipt.source === null && receipt.input_snapshot_retained === false && receipt.inspection_required === true && receipt.error_code === (receipt.status === "CANCELLED" ? "AK_CORPORATIONS_APP_CANCELLED" : "AK_CORPORATIONS_APP_JOB"), "Terminal receipt status is invalid.");
  return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
}
