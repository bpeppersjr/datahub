import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import {
  buildDcCorporateRegistrationOffline,
  DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT,
  validateDcCorporateRegistrationPreflightReceipt,
  verifyDcCorporateRegistrationOffline,
} from "./dc-corporate-registration.mjs";

export const DC_CORPORATE_REGISTRATION_APP_VERSION = "dc-corporate-registration-app@1.0.0";
const SELECTION_VERSION = "dc-corporate-registration-import-selection@1.0.0";
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (message = "DC Corporate Registration offline app operation rejected.") => Object.assign(new Error(message), { code: "DC_CORPORATE_APP_JOB" });
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
  check(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, "Input changed while read.");
  return { filename, bytes, bytesCount: Number(before.size), sha256: sha256(bytes) };
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp-${randomUUID()}`, bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, filename);
  return sha256(bytes);
}

export async function readDcCorporateRegistrationImportSelection(selectionPath) {
  const expectedRoot = path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "packages");
  selectionPath = await canonical(selectionPath, { file: true });
  const packageDirectory = path.dirname(selectionPath), packageId = path.basename(packageDirectory);
  check(path.basename(selectionPath) === "selection.json" && path.dirname(packageDirectory) === expectedRoot && PACKAGE.test(packageId), "Selection must be a fixed package selection.json.");
  const selectionFile = await fixedRead(selectionPath, 16_384);
  let selection;
  try { selection = JSON.parse(selectionFile.bytes.toString("utf8")); } catch { throw fail("Selection must be valid UTF-8 JSON."); }
  check(exact(selection, ["schema_version", "package_id", "files"]) && selection.schema_version === SELECTION_VERSION && selection.package_id === packageId && exact(selection.files, ["active_records", "preflight_receipt"]), "Selection contract is invalid.");
  const inputs = {};
  for (const [role, maximum] of [["active_records", 500_000_000], ["preflight_receipt", 2_000_000]]) {
    const name = selection.files[role];
    check(typeof name === "string" && name === path.basename(name) && name.length <= 128 && !["selection.json", ".", ".."].includes(name), "Selected filenames must be package-local basenames.");
    inputs[role] = await fixedRead(path.join(packageDirectory, name), maximum);
  }
  check(inputs.active_records.filename !== inputs.preflight_receipt.filename, "Each source role must select a distinct file.");
  const expectedNames = ["selection.json", ...Object.values(selection.files)].sort();
  check(isDeepStrictEqual((await readdir(packageDirectory)).sort(), expectedNames), "Package must contain exactly selection.json and its two selected files.");
  check(/\.(?:jsonl|ndjson)(?:\.gz)?$/i.test(inputs.active_records.filename), "Active records must be JSONL, NDJSON, or gzip-compressed JSONL/NDJSON.");
  let preflight;
  try { preflight = JSON.parse(inputs.preflight_receipt.bytes.toString("utf8")); } catch { throw fail("Preflight receipt must be valid UTF-8 JSON."); }
  try { validateDcCorporateRegistrationPreflightReceipt(preflight); } catch { throw fail("Preflight receipt is invalid."); }
  return {
    package_id: packageId,
    selection: relative(selectionPath),
    selection_sha256: selectionFile.sha256,
    preflight,
    inputs: Object.fromEntries(Object.entries(inputs).map(([role, input]) => [role, {
      path: relative(input.filename),
      bytes: input.bytesCount,
      sha256: input.sha256,
    }])),
    sourcePaths: Object.fromEntries(Object.entries(inputs).map(([role, input]) => [role, input.filename])),
  };
}

export async function runDcCorporateRegistrationAppJob({
  selectionPath,
  operationsRoot = path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "operations"),
  signal,
  now = () => new Date(),
} = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "Invalid cancellation signal.");
  signal?.throwIfAborted();
  const selection = await readDcCorporateRegistrationImportSelection(selectionPath);
  const root = await canonical(operationsRoot, { create: true });
  check(root === path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "operations"), "Operations root is fixed.");
  const runId = randomUUID(), operation = path.join(root, runId);
  await mkdir(operation);
  const startedAt = now().toISOString();
  const recordedInputs = Object.entries(selection.inputs).map(([role, input]) => ({ role, path: input.path, bytes: input.bytes, sha256: input.sha256 }));
  const start = { schema_version: DC_CORPORATE_REGISTRATION_APP_VERSION, run_id: runId, status: "RUNNING", started_at: startedAt, execution_mode: "operator-supplied-official-selected-fields", network_requests: 0, package_id: selection.package_id, selection: selection.selection, selection_sha256: selection.selection_sha256, preflight_observation_fingerprint: selection.preflight.source_observation_fingerprint, preflight_canonical_sha256: sha256(Buffer.from(`${JSON.stringify(selection.preflight, null, 2)}\n`)), inputs: recordedInputs };
  const startSha256 = await atomicJson(path.join(operation, "start.json"), start);
  const snapshotRoot = path.join(operation, "input-snapshot"), releaseRoot = path.join(operation, "release");
  let source = null;
  try {
    signal?.throwIfAborted();
    await mkdir(snapshotRoot);
    const snapshotSource = path.join(snapshotRoot, path.basename(selection.sourcePaths.active_records));
    const snapshotPreflight = path.join(snapshotRoot, "preflight-receipt.json");
    await copyFile(selection.sourcePaths.active_records, snapshotSource, constants.COPYFILE_EXCL);
    await copyFile(selection.sourcePaths.preflight_receipt, snapshotPreflight, constants.COPYFILE_EXCL);
    for (const [role, snapshot] of [["active_records", snapshotSource], ["preflight_receipt", snapshotPreflight]]) {
      signal?.throwIfAborted();
      const fixed = await fixedRead(snapshot, role === "active_records" ? 500_000_000 : 2_000_000), expected = selection.inputs[role];
      check(fixed.bytesCount === expected.bytes && fixed.sha256 === expected.sha256, "Selected input changed before its operation snapshot was fixed.");
    }
    const built = await buildDcCorporateRegistrationOffline({ outputRoot: releaseRoot, sourcePath: snapshotSource, preflight: selection.preflight, acknowledgement: DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT, runId, signal, now });
    signal?.throwIfAborted();
    const verified = await verifyDcCorporateRegistrationOffline(built.manifestPath, { signal });
    const manifest = await fixedRead(built.manifestPath, 2_000_000);
    const manifestValue = JSON.parse(manifest.bytes);
    source = { manifest: relative(built.manifestPath), manifest_sha256: manifest.sha256, release_id: verified.release_id, source_release_id: manifestValue.source_release_id, coverage: verified.coverage };
    await rm(snapshotRoot, { recursive: true, force: true });
    const receipt = { schema_version: DC_CORPORATE_REGISTRATION_APP_VERSION, run_id: runId, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source, network_requests: 0, source_pointer_changed: false, national_admission_performed: false, export_policy: "local-review-only" };
    await atomicJson(path.join(operation, "receipt.json"), receipt);
    return { operationDirectory: operation, receiptPath: path.join(operation, "receipt.json"), receipt };
  } catch {
    await rm(releaseRoot, { recursive: true, force: true }).catch(() => {});
    await rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    const receipt = { schema_version: DC_CORPORATE_REGISTRATION_APP_VERSION, run_id: runId, status: signal?.aborted ? "CANCELLED" : "FAILED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: now().toISOString(), start_sha256: startSha256, source: null, network_requests: 0, source_pointer_changed: false, national_admission_performed: false, error_code: signal?.aborted ? "DC_CORPORATE_APP_CANCELLED" : "DC_CORPORATE_APP_JOB", inspection_required: true };
    await atomicJson(path.join(operation, "receipt.json"), receipt).catch(() => {});
    if (signal?.aborted) signal.throwIfAborted();
    throw fail();
  }
}

export async function verifyDcCorporateRegistrationAppJob(receiptPath, { signal } = {}) {
  signal?.throwIfAborted();
  receiptPath = await canonical(receiptPath, { file: true });
  const operation = path.dirname(receiptPath), runId = path.basename(operation), operationsRoot = path.join(APP_ROOT, "data", "imports", "dc-corporate-registration", "operations");
  check(path.basename(receiptPath) === "receipt.json" && UUID.test(runId) && path.resolve(path.dirname(operation)).toLowerCase() === path.resolve(operationsRoot).toLowerCase(), "Receipt path is invalid.");
  const startFile = await fixedRead(path.join(operation, "start.json"), 100_000), receiptFile = await fixedRead(receiptPath, 100_000);
  const start = JSON.parse(startFile.bytes), receipt = JSON.parse(receiptFile.bytes);
  check(exact(start, ["schema_version", "run_id", "status", "started_at", "execution_mode", "network_requests", "package_id", "selection", "selection_sha256", "preflight_observation_fingerprint", "preflight_canonical_sha256", "inputs"]), "Start record shape is invalid.");
  check(start.schema_version === DC_CORPORATE_REGISTRATION_APP_VERSION && start.run_id === runId && start.status === "RUNNING"
    && start.execution_mode === "operator-supplied-official-selected-fields" && start.network_requests === 0
    && PACKAGE.test(start.package_id) && start.selection === `data/imports/dc-corporate-registration/packages/${start.package_id}/selection.json`
    && /^[a-f0-9]{64}$/.test(start.selection_sha256)
    && /^[a-f0-9]{64}$/.test(start.preflight_observation_fingerprint) && /^[a-f0-9]{64}$/.test(start.preflight_canonical_sha256)
    && !Number.isNaN(Date.parse(start.started_at)) && Array.isArray(start.inputs) && start.inputs.length === 2,
  "Start record envelope is invalid.");
  const inputRoles = new Set();
  for (const input of start.inputs) {
    check(exact(input, ["role", "path", "bytes", "sha256"]) && ["active_records", "preflight_receipt"].includes(input.role)
      && !inputRoles.has(input.role) && typeof input.path === "string" && input.path.startsWith(`data/imports/dc-corporate-registration/packages/${start.package_id}/`)
      && Number.isSafeInteger(input.bytes) && input.bytes > 0 && /^[a-f0-9]{64}$/.test(input.sha256), "Start input contract is invalid.");
    inputRoles.add(input.role);
  }
  check(inputRoles.size === 2, "Start input roles are incomplete.");
  const terminalKeys = receipt.status === "SUCCEEDED"
    ? ["schema_version", "run_id", "status", "execution_mode", "started_at", "finished_at", "start_sha256", "source", "network_requests", "source_pointer_changed", "national_admission_performed", "export_policy"]
    : ["schema_version", "run_id", "status", "execution_mode", "started_at", "finished_at", "start_sha256", "source", "network_requests", "source_pointer_changed", "national_admission_performed", "error_code", "inspection_required"];
  check(exact(receipt, terminalKeys), "Terminal receipt shape is invalid.");
  check(receipt.schema_version === DC_CORPORATE_REGISTRATION_APP_VERSION && receipt.run_id === runId
    && receipt.execution_mode === start.execution_mode && receipt.started_at === start.started_at
    && !Number.isNaN(Date.parse(receipt.finished_at)) && Date.parse(receipt.finished_at) >= Date.parse(receipt.started_at)
    && receipt.start_sha256 === startFile.sha256 && receipt.network_requests === 0
    && receipt.source_pointer_changed === false && receipt.national_admission_performed === false, "Receipt envelope is invalid.");
  if (receipt.status === "SUCCEEDED") {
    check(receipt.export_policy === "local-review-only" && exact(receipt.source, ["manifest", "manifest_sha256", "release_id", "source_release_id", "coverage"])
      && typeof receipt.source.manifest === "string" && !path.isAbsolute(receipt.source.manifest)
      && /^[a-f0-9]{64}$/.test(receipt.source.manifest_sha256) && typeof receipt.source.release_id === "string"
      && typeof receipt.source.source_release_id === "string", "Successful receipt is incomplete.");
    const manifestPath = path.resolve(APP_ROOT, ...receipt.source.manifest.split("/"));
    const expectedManifest = path.join(operation, "release", "releases", receipt.source.release_id, "manifest.json");
    check(manifestPath === expectedManifest, "Receipt manifest is outside its operation release.");
    const manifest = await fixedRead(manifestPath, 2_000_000);
    check(manifest.sha256 === receipt.source.manifest_sha256, "Manifest hash changed.");
    const verified = await verifyDcCorporateRegistrationOffline(manifestPath, { signal });
    const manifestAfterVerification = await fixedRead(manifestPath, 2_000_000);
    check(manifestAfterVerification.sha256 === manifest.sha256, "Manifest changed during verification.");
    const manifestValue = JSON.parse(manifest.bytes);
    check(verified.release_id === receipt.source.release_id && manifestValue.source_release_id === receipt.source.source_release_id && isDeepStrictEqual(verified.coverage, receipt.source.coverage), "Verified release differs from receipt.");
    const sourceInput = start.inputs.find(input => input.role === "active_records"), preflightInput = start.inputs.find(input => input.role === "preflight_receipt");
    check(sourceInput?.sha256 === manifestValue.source?.input_sha256 && sourceInput?.bytes === manifestValue.source?.input_bytes, "Release source input differs from operation start record.");
    const embedded = manifestValue.artifacts?.find(item => item.artifact_type === "dc-corporate-registration-preflight-receipt-json");
    check(embedded?.path && preflightInput, "Preflight linkage is missing.");
    const embeddedFile = await fixedRead(path.join(path.dirname(manifestPath), embedded.path), 2_000_000);
    const embeddedValue = JSON.parse(embeddedFile.bytes);
    check(embeddedValue.source_observation_fingerprint === start.preflight_observation_fingerprint && embeddedFile.sha256 === start.preflight_canonical_sha256, "Release preflight differs from operation start record.");
  } else check(["FAILED", "CANCELLED"].includes(receipt.status) && receipt.source === null && receipt.inspection_required === true
    && receipt.error_code === (receipt.status === "CANCELLED" ? "DC_CORPORATE_APP_CANCELLED" : "DC_CORPORATE_APP_JOB"), "Terminal receipt status is invalid.");
  return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
}
