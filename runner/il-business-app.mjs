import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { buildIllinoisBusinessRegistry, verifyIllinoisBusinessRegistry } from "./il-business-registry.mjs";

export const IL_BUSINESS_APP_VERSION = "il-business-app@1.0.0";
const SELECTION_VERSION = "il-business-import-selection@1.0.0";
const KEYS = ["corporation_master", "corporation_name", "corporation_annual", "llc_master", "llc_name"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = (message = "Illinois offline app operation rejected.") => Object.assign(new Error(message), { code: "IL_APP_JOB" });
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
  return { filename, bytes, sha256: sha(bytes) };
}

async function fixedHash(filename, maximum) {
  filename = await canonical(filename, { file: true });
  const before = await lstat(filename, { bigint: true });
  check(before.size > 0n && before.size <= BigInt(maximum), "Input size is outside the operation limit.");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) { bytes += chunk.length; hash.update(chunk); }
  const after = await lstat(filename, { bigint: true });
  check(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, "Input changed while read.");
  return { filename, bytes, sha256: hash.digest("hex") };
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp-${randomUUID()}`, bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, filename); return sha(bytes);
}

export async function readIllinoisImportSelection(selectionPath) {
  const expectedRoot = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "packages");
  selectionPath = await canonical(selectionPath, { file: true });
  const packageDirectory = path.dirname(selectionPath), packageId = path.basename(packageDirectory);
  check(path.basename(selectionPath) === "selection.json" && path.dirname(packageDirectory) === expectedRoot && PACKAGE.test(packageId), "Selection must be a fixed package selection.json.");
  const selected = await fixedRead(selectionPath, 16_384), value = JSON.parse(selected.bytes.toString("utf8"));
  check(exact(value, ["schema_version", "package_id", "files"]) && value.schema_version === SELECTION_VERSION && value.package_id === packageId && exact(value.files, KEYS), "Selection contract is invalid.");
  const sourcePaths = {}, inputs = [];
  for (const key of KEYS) {
    const name = value.files[key];
    check(typeof name === "string" && name === path.basename(name) && name.length <= 128 && !["selection.json", ".", ".."].includes(name), "Selected filenames must be package-local basenames.");
    const input = await fixedHash(path.join(packageDirectory, name), 2_000_000_000);
    sourcePaths[key] = input.filename; inputs.push({ role: key, path: relative(input.filename), bytes: input.bytes, sha256: input.sha256 });
  }
  check(new Set(inputs.map(item => item.path)).size === KEYS.length, "Each source role must select a distinct file.");
  return { selection: relative(selectionPath), selection_sha256: selected.sha256, package_id: packageId, sourcePaths, inputs };
}

export async function runIllinoisBusinessAppJob({ selectionPath, operationsRoot = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "operations"), zbpPointer = path.join(APP_ROOT, "data", "business-baselines", "census-zbp", "current.json"), minimumOrganizations = 500_000, signal } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "Invalid cancellation signal.");
  signal?.throwIfAborted();
  const selection = await readIllinoisImportSelection(selectionPath);
  const root = await canonical(operationsRoot, { create: true });
  check(root === path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "operations"), "Operations root is fixed.");
  await canonical(zbpPointer, { file: true });
  const runId = randomUUID(), operation = path.join(root, runId); await mkdir(operation);
  const startedAt = new Date().toISOString();
  const start = { schema_version: IL_BUSINESS_APP_VERSION, run_id: runId, status: "RUNNING", started_at: startedAt, execution_mode: "operator-supplied-official-files", network_requests: 0, selection: selection.selection, selection_sha256: selection.selection_sha256, package_id: selection.package_id, inputs: selection.inputs };
  const startSha256 = await atomicJson(path.join(operation, "start.json"), start);
  let releaseRoot = path.join(operation, "release"), snapshotRoot = path.join(operation, "input-snapshot"), source = null;
  try {
    signal?.throwIfAborted();
    await mkdir(snapshotRoot);
    const snapshotPaths = {};
    for (const input of selection.inputs) {
      signal?.throwIfAborted();
      const destination = path.join(snapshotRoot, path.basename(selection.sourcePaths[input.role]));
      await copyFile(selection.sourcePaths[input.role], destination, constants.COPYFILE_EXCL);
      const copied = await fixedHash(destination, 2_000_000_000);
      check(copied.bytes === input.bytes && copied.sha256 === input.sha256, "Selected input changed before its operation snapshot was fixed.");
      snapshotPaths[input.role] = destination;
    }
    const built = await buildIllinoisBusinessRegistry({ outputRoot: releaseRoot, zbpPointer, sourcePaths: snapshotPaths, allowedRoot: snapshotRoot, minimumOrganizations, signal, logger: () => {} });
    signal?.throwIfAborted();
    const manifestPath = path.join(built.releaseDirectory, "manifest.json"), verified = await verifyIllinoisBusinessRegistry(manifestPath, { signal });
    const manifest = await fixedRead(manifestPath, 2_000_000);
    source = { manifest: relative(manifestPath), manifest_sha256: manifest.sha256, release_id: verified.release_id, source_release_id: verified.source_release_id, coverage: verified.coverage };
    await rm(snapshotRoot, { recursive: true, force: true });
    const receipt = { schema_version: IL_BUSINESS_APP_VERSION, run_id: runId, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: new Date().toISOString(), start_sha256: startSha256, source, network_requests: 0, source_pointer_changed: false, national_admission_performed: false, export_policy: "local-review-only" };
    await atomicJson(path.join(operation, "receipt.json"), receipt);
    return { operationDirectory: operation, receiptPath: path.join(operation, "receipt.json"), receipt };
  } catch (error) {
    await rm(releaseRoot, { recursive: true, force: true }).catch(() => {});
    await rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    const receipt = { schema_version: IL_BUSINESS_APP_VERSION, run_id: runId, status: signal?.aborted ? "CANCELLED" : "FAILED", execution_mode: start.execution_mode, started_at: startedAt, finished_at: new Date().toISOString(), start_sha256: startSha256, source, network_requests: 0, source_pointer_changed: false, national_admission_performed: false, error_code: signal?.aborted ? "IL_APP_CANCELLED" : "IL_APP_JOB", inspection_required: true };
    await atomicJson(path.join(operation, "receipt.json"), receipt).catch(() => {});
    if (signal?.aborted) throw signal.reason; throw fail();
  }
}

export async function verifyIllinoisBusinessAppJob(receiptPath, { signal } = {}) {
  signal?.throwIfAborted();
  receiptPath = await canonical(receiptPath, { file: true });
  const operation = path.dirname(receiptPath), runId = path.basename(operation);
  const operationsRoot = path.join(APP_ROOT, "data", "imports", "illinois-business-registry", "operations");
  check(path.basename(receiptPath) === "receipt.json" && UUID.test(runId) && path.dirname(operation) === operationsRoot, "Receipt path is invalid.");
  const startFile = await fixedRead(path.join(operation, "start.json"), 100_000), receiptFile = await fixedRead(receiptPath, 100_000);
  const start = JSON.parse(startFile.bytes), receipt = JSON.parse(receiptFile.bytes);
  check(start.schema_version === IL_BUSINESS_APP_VERSION && start.run_id === runId && start.status === "RUNNING" && start.network_requests === 0 && receipt.schema_version === IL_BUSINESS_APP_VERSION && receipt.run_id === runId && receipt.start_sha256 === startFile.sha256 && receipt.network_requests === 0 && receipt.source_pointer_changed === false && receipt.national_admission_performed === false, "Receipt envelope is invalid.");
  if (receipt.status === "SUCCEEDED") {
    check(receipt.export_policy === "local-review-only" && receipt.source?.manifest, "Successful receipt is incomplete.");
    const manifestPath = path.resolve(APP_ROOT, receipt.source.manifest), manifest = await fixedRead(manifestPath, 2_000_000);
    const expectedReleaseRoot = path.join(operation, "release", "releases");
    check(path.dirname(path.dirname(manifestPath)) === expectedReleaseRoot && path.basename(manifestPath) === "manifest.json", "Receipt manifest is outside its operation release.");
    check(manifest.sha256 === receipt.source.manifest_sha256, "Manifest hash changed.");
    const verified = await verifyIllinoisBusinessRegistry(manifestPath, { signal });
    check(verified.release_id === receipt.source.release_id && verified.source_release_id === receipt.source.source_release_id && isDeepStrictEqual(verified.coverage, receipt.source.coverage), "Verified release differs from receipt.");
    const manifestValue = JSON.parse(manifest.bytes);
    const metadataArtifact = manifestValue.artifacts?.find(item => item.artifact_type === "il-business-registry-source-release-metadata");
    check(metadataArtifact?.path, "Release metadata is missing.");
    const metadata = JSON.parse((await fixedRead(path.join(path.dirname(manifestPath), metadataArtifact.path), 2_000_000)).bytes);
    check(start.inputs?.length === KEYS.length && KEYS.every(key => {
      const input = start.inputs.find(item => item.role === key);
      return input && metadata.documents?.[key]?.input?.bytes === input.bytes && metadata.documents[key].input.sha256 === input.sha256;
    }), "Release inputs differ from the operation start record.");
  } else check(["FAILED", "CANCELLED"].includes(receipt.status) && receipt.inspection_required === true, "Terminal receipt status is invalid.");
  return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
}
