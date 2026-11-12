import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readdir, rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { relativeToApp } from "./paths.mjs";
import {
  buildMississippiBusinessReportReadiness, canonicalDirectory, digest, exact, fixedRead, inspectMississippiBusinessReportIntake,
  intakeError, isTime, jsonBytes, limitsOfAuthority, loadMississippiBusinessReportReviewPins, METADATA_LIMIT, OPERATIONS_ROOT,
  PACKAGE_ID, PACKAGES_ROOT, readJson, requireIntake, SHA, UUID,
} from "./mississippi-business-report-intake.mjs";
import { MS_BUSINESS_REPORT_APP_VERSION as LEGACY_VERSION, verifyLegacyMississippiBusinessReportAppJob } from "./mississippi-business-report-app-legacy-verifier.mjs";

export const MS_BUSINESS_REPORT_APP_VERSION = "mississippi-business-report-app@2.0.0";
const MANIFEST_VERSION = "mississippi-business-report-intake-manifest@1.0.0";
const LOCK_VERSION = "mississippi-business-report-intake-lock@1.0.0";
const EXECUTION_MODE = "operator-supplied-local-intake";
const READINESS = "readiness";
const REPORT = "report.json";
const MANIFEST = "manifest.json";
const START = "start.json";
const RECEIPT = "receipt.json";
const LOCK = ".intake-lock";
const OWNER = /^owner-([0-9a-f-]{36})\.json$/;
const TEMP_FILE = /^(?:start|report|manifest|receipt)\.json\.tmp-[0-9a-f-]{36}$/;
const STATUSES = ["blocked", "operator-attested-awaiting-independent-review", "ready-for-normalization-review"];
const FAILURE_CODES = { CANCELLED: "MS_REPORT_INTAKE_CANCELLED", FAILED: "MS_REPORT_INTAKE_FAILED", INTERRUPTED: "MS_REPORT_INTAKE_INTERRUPTED" };

const rejected = condition => requireIntake(condition, "MS_REPORT_RECEIPT_REJECTED");
const locked = condition => requireIntake(condition, "MS_REPORT_INTAKE_LOCKED");
const cancelled = () => new DOMException("Mississippi intake was cancelled.", "AbortError");

async function writeNew(filename, value) {
  const bytes = jsonBytes(value);
  const temporary = `${filename}.tmp-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await link(temporary, filename);
  } finally {
    await unlink(temporary);
  }
  return { sha256: digest(bytes), bytes: bytes.length };
}

async function readRecord(filename, signal) {
  const file = await fixedRead(filename, METADATA_LIMIT, signal);
  return { ...file, value: readJson(file.bytes) };
}

async function exists(filename) {
  try { await lstat(filename); return true; }
  catch (error) { if (error.code !== "ENOENT") throw error; return false; }
}

async function removeIfPresent(filename) {
  await unlink(filename).catch(error => { if (error.code !== "ENOENT") throw error; });
}

async function cleanUnpublished(operation) {
  const readiness = path.join(operation, READINESS);
  let names;
  try {
    await canonicalDirectory(readiness);
    names = await readdir(readiness);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (names) {
    requireIntake(names.every(name => [REPORT, MANIFEST].includes(name) || TEMP_FILE.test(name)), "MS_REPORT_INTAKE_FAILED");
    for (const name of names) await removeIfPresent(path.join(readiness, name));
    await rmdir(readiness).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  for (const name of await readdir(operation)) if (TEMP_FILE.test(name)) await removeIfPresent(path.join(operation, name));
}

function startFor(runId, packageId, startedAt) {
  return { schema_version: MS_BUSINESS_REPORT_APP_VERSION, run_id: runId, status: "RUNNING", execution_mode: EXECUTION_MODE, package_id: packageId, started_at: startedAt };
}

function validateStart(start, runId) {
  rejected(isTime(start?.started_at) && typeof start.package_id === "string" && PACKAGE_ID.test(start.package_id) && !start.package_id.endsWith("."));
  rejected(isDeepStrictEqual(start, startFor(runId, start.package_id, start.started_at)));
}

function receiptFor(start, startSha256, finishedAt, status, source, errorCode = null) {
  return {
    ...start, status, finished_at: finishedAt, start_sha256: startSha256, source, claims: limitsOfAuthority,
    error_code: errorCode, inspection_required: status !== "SUCCEEDED",
  };
}

function validateTerminal(receipt, start, startSha256) {
  rejected(isTime(receipt?.finished_at) && receipt.finished_at >= start.started_at);
  const { status, source, error_code: errorCode } = receipt;
  rejected((status === "SUCCEEDED" && errorCode === null && source) || (source === null && (status === "CANCELLED" ? errorCode === FAILURE_CODES.CANCELLED : status === "FAILED" && [FAILURE_CODES.FAILED, FAILURE_CODES.INTERRUPTED].includes(errorCode))));
  rejected(isDeepStrictEqual(receipt, receiptFor(start, startSha256, receipt.finished_at, status, source, errorCode)));
}

function manifestFor(start, report, reportFile) {
  return {
    schema_version: MANIFEST_VERSION, run_id: start.run_id, package_id: start.package_id,
    selection_sha256: report.selection_sha256, review_pin_sha256: report.review_pin_sha256,
    readiness_status: report.readiness_status, status: "published-private-readiness",
    artifacts: [{ path: REPORT, ...reportFile }], claims: limitsOfAuthority,
  };
}

function sourceFor(operation, report, reportFile, manifestFile) {
  return {
    readiness_status: report.readiness_status, review_pin_sha256: report.review_pin_sha256,
    report: relativeToApp(path.join(operation, READINESS, REPORT)), report_sha256: reportFile.sha256,
    manifest: relativeToApp(path.join(operation, READINESS, MANIFEST)), manifest_sha256: manifestFile.sha256,
    gates: report.gates, rows_observed: report.extraction?.rows_observed ?? null, warnings: report.warnings,
  };
}

function pidIsDead(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === "ESRCH"; }
}

async function recoverInterrupted(root, runId) {
  const operation = path.join(root, runId);
  if (!(await exists(operation))) return;
  await canonicalDirectory(operation);
  if (!(await exists(path.join(operation, START)))) {
    const names = await readdir(operation);
    locked(names.every(name => TEMP_FILE.test(name)));
    await cleanUnpublished(operation);
    return;
  }
  const { value: start, sha256 } = await readRecord(path.join(operation, START));
  validateStart(start, runId);
  const receiptPath = path.join(operation, RECEIPT);
  if (await exists(receiptPath)) {
    const { value: receipt } = await readRecord(receiptPath);
    validateTerminal(receipt, start, sha256);
    if (receipt.status !== "SUCCEEDED") await cleanUnpublished(operation);
    return;
  }
  await cleanUnpublished(operation);
  const finished = new Date().toISOString();
  const receipt = receiptFor(start, sha256, finished < start.started_at ? start.started_at : finished, "FAILED", null, FAILURE_CODES.INTERRUPTED);
  await writeNew(receiptPath, receipt).catch(error => { if (error.code !== "EEXIST") throw error; });
}

async function readLock(directory) {
  await canonicalDirectory(directory);
  const names = await readdir(directory);
  if (names.length === 0) return null;
  const token = names.length === 1 ? OWNER.exec(names[0])?.[1] : null;
  locked(UUID.test(token ?? ""));
  const ownerFile = path.join(directory, names[0]);
  const { value } = await readRecord(ownerFile);
  locked(exact(value, ["schema_version", "run_id", "token", "pid"]) && value.schema_version === LOCK_VERSION && UUID.test(value.run_id) && value.token === token && Number.isSafeInteger(value.pid) && value.pid > 0 && value.pid <= 2147483647);
  return { ownerFile, value };
}

async function removeEmptyLock(lock) {
  await rmdir(lock).catch(error => { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; });
}

async function reserve(root, runId, signal) {
  const lock = path.join(root, LOCK);
  const candidate = path.join(root, `.lock-candidate-${randomUUID()}`);
  const token = randomUUID();
  const ownerName = `owner-${token}.json`;
  const owner = { schema_version: LOCK_VERSION, run_id: runId, token, pid: process.pid };
  await mkdir(candidate);
  let acquired = false;
  try {
    await writeNew(path.join(candidate, ownerName), owner);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      signal?.throwIfAborted();
      try { await rename(candidate, lock); acquired = true; break; }
      catch (error) { if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error.code)) throw error; }
      let current;
      try { current = await readLock(lock); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (current) {
        locked(pidIsDead(current.value.pid));
        await recoverInterrupted(root, current.value.run_id);
        // The owner's filename includes its unique token. A contender can
        // never remove a newer owner's differently named marker.
        await removeIfPresent(current.ownerFile);
      }
      await removeEmptyLock(lock);
    }
    locked(acquired);
    const assertHeld = async () => {
      const current = await readLock(lock);
      locked(current && isDeepStrictEqual(current.value, owner));
      return current.ownerFile;
    };
    return {
      assertHeld,
      async release() { await unlink(await assertHeld()); await removeEmptyLock(lock); },
    };
  } finally {
    if (!acquired) {
      await removeIfPresent(path.join(candidate, ownerName));
      await removeEmptyLock(candidate);
    }
  }
}

export async function runMississippiBusinessReportAppJob({ packageDirectory, operationId = randomUUID(), signal, now = () => new Date() } = {}) {
  let lease;
  let start;
  let startFile;
  let operation;
  try {
    requireIntake(signal === undefined || signal instanceof AbortSignal);
    signal?.throwIfAborted();
    requireIntake(typeof packageDirectory === "string" && path.isAbsolute(packageDirectory) && path.dirname(packageDirectory) === PACKAGES_ROOT);
    const packageId = path.basename(packageDirectory);
    requireIntake(PACKAGE_ID.test(packageId) && !packageId.endsWith(".") && typeof operationId === "string" && UUID.test(operationId));
    const root = await canonicalDirectory(OPERATIONS_ROOT, { create: true });
    lease = await reserve(root, operationId, signal);
    operation = path.join(root, operationId);
    start = startFor(operationId, packageId, now().toISOString());
    await mkdir(operation);
    startFile = await writeNew(path.join(operation, START), start);
    signal?.throwIfAborted();
    const assessment = await inspectMississippiBusinessReportIntake(packageDirectory, { signal });
    const report = buildMississippiBusinessReportReadiness(assessment, await loadMississippiBusinessReportReviewPins(signal));
    const readiness = path.join(operation, READINESS);
    await mkdir(readiness);
    const reportFile = await writeNew(path.join(readiness, REPORT), report);
    await lease.assertHeld();
    signal?.throwIfAborted();
    const manifestFile = await writeNew(path.join(readiness, MANIFEST), manifestFor(start, report, reportFile));
    const receiptPath = path.join(operation, RECEIPT);
    const finished = now().toISOString();
    requireIntake(finished >= start.started_at, "MS_REPORT_INTAKE_FAILED");
    signal?.throwIfAborted();
    const receipt = receiptFor(start, startFile.sha256, finished, "SUCCEEDED", sourceFor(operation, report, reportFile, manifestFile));
    await writeNew(receiptPath, receipt);
    return { operationDirectory: operation, receiptPath, receipt };
  } catch (error) {
    const wasCancelled = signal?.aborted === true;
    if (startFile) {
      const receiptPath = path.join(operation, RECEIPT);
      if (!(await exists(receiptPath).catch(() => true))) {
        await cleanUnpublished(operation).catch(() => {});
        const finished = new Date().toISOString();
        const status = wasCancelled ? "CANCELLED" : "FAILED";
        const receipt = receiptFor(start, startFile.sha256, finished < start.started_at ? start.started_at : finished, status, null, FAILURE_CODES[status]);
        await writeNew(receiptPath, receipt).catch(() => {});
      }
    }
    if (wasCancelled) throw cancelled();
    const code = ["MS_REPORT_PACKAGE_REJECTED", "MS_REPORT_INTAKE_LOCKED"].includes(error.code) ? error.code : "MS_REPORT_INTAKE_FAILED";
    throw intakeError(code);
  } finally {
    if (lease) await lease.release().catch(() => { throw intakeError("MS_REPORT_INTAKE_LOCKED"); });
  }
}

export async function verifyMississippiBusinessReportAppJob(receiptPath, { signal } = {}) {
  try {
    signal?.throwIfAborted();
    rejected(typeof receiptPath === "string" && path.isAbsolute(receiptPath) && path.basename(receiptPath) === RECEIPT);
    const operation = path.dirname(receiptPath);
    const runId = path.basename(operation);
    rejected(UUID.test(runId) && path.dirname(operation) === OPERATIONS_ROOT);
    const receiptFile = await readRecord(receiptPath, signal);
    const receipt = receiptFile.value;
    if (receipt.schema_version === LEGACY_VERSION) return await verifyLegacyMississippiBusinessReportAppJob(receiptPath, { signal });
    const startFile = await readRecord(path.join(operation, START), signal);
    const start = startFile.value;
    validateStart(start, runId);
    validateTerminal(receipt, start, startFile.sha256);
    if (receipt.status !== "SUCCEEDED") {
      rejected(!(await exists(path.join(operation, READINESS))));
      return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
    }
    const readiness = path.join(operation, READINESS);
    await canonicalDirectory(readiness);
    rejected(isDeepStrictEqual((await readdir(readiness)).sort(), [MANIFEST, REPORT]));
    const reportFile = await readRecord(path.join(readiness, REPORT), signal);
    const manifestFile = await readRecord(path.join(readiness, MANIFEST), signal);
    rejected(STATUSES.includes(receipt.source.readiness_status) && (receipt.source.review_pin_sha256 === null || SHA.test(receipt.source.review_pin_sha256)));
    const assessment = await inspectMississippiBusinessReportIntake(path.join(PACKAGES_ROOT, start.package_id), { signal });
    const pins = await loadMississippiBusinessReportReviewPins(signal);
    const report = buildMississippiBusinessReportReadiness(assessment, pins, receipt.source.review_pin_sha256);
    rejected(reportFile.bytes.equals(jsonBytes(report)));
    const reportInfo = { sha256: reportFile.sha256, bytes: reportFile.bytes.length };
    const manifestInfo = { sha256: manifestFile.sha256, bytes: manifestFile.bytes.length };
    rejected(manifestFile.bytes.equals(jsonBytes(manifestFor(start, report, reportInfo))));
    rejected(isDeepStrictEqual(receipt.source, sourceFor(operation, report, reportInfo, manifestInfo)));
    return { receiptPath, receiptSha256: receiptFile.sha256, receipt };
  } catch {
    if (signal?.aborted) throw cancelled();
    throw intakeError("MS_REPORT_RECEIPT_REJECTED");
  }
}
