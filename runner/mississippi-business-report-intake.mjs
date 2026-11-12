import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { MS_BUSINESS_REPORT_MAX_ROWS as MAX_ROWS, mississippiBusinessReportWarnings } from "./mississippi-business-report-offline.mjs";
import { extractMississippiBusinessReport, MS_BUSINESS_REPORT_EXTRACTION, MS_BUSINESS_REPORT_MAX_INPUT_BYTES } from "./mississippi-business-report-extraction.mjs";

export const PACKAGE_VERSION = "mississippi-business-report-package@2.0.0";
export const REPORT_VERSION = "mississippi-business-report-readiness@1.0.0";
export const SOURCE = "https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3";
export const IMPORTS_ROOT = path.join(APP_ROOT, "data", "imports", "mississippi-business-report");
export const PACKAGES_ROOT = path.join(IMPORTS_ROOT, "packages");
export const OPERATIONS_ROOT = path.join(IMPORTS_ROOT, "operations");
export const PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const SHA = /^[0-9a-f]{64}$/;
export const METADATA_LIMIT = 64 * 1024;
const PIN_FILE = path.join(APP_ROOT, "config", "mississippi-business-report-review-pins.json");
const PIN_VERSION = "mississippi-business-report-review-pins@1.0.0";
const BINDING_KEYS = ["selection_sha256", "original_sha256", "csv_companion_sha256", "source_evidence_sha256", "rights_evidence_sha256"];
const REVIEW_FLAGS = ["source_reviewed", "local_retention_reviewed", "derived_use_reviewed"];
const FILE_ROLES = ["ORIGINAL", "CSV_COMPANION", "SOURCE_EVIDENCE", "RIGHTS_EVIDENCE"];
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const sameFile = (a, b) => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => a[key] === b[key]);
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
export const isTime = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const exact = (value, keys) => Boolean(value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()));

const MESSAGES = {
  MS_REPORT_PACKAGE_REJECTED: "Mississippi package does not match the governed intake contract.",
  MS_REPORT_INTAKE_LOCKED: "Another Mississippi intake owns the operation lock, or its ownership requires inspection.",
  MS_REPORT_INTAKE_FAILED: "Mississippi intake did not finalize cleanly. Inspect its private receipt before retrying.",
  MS_REPORT_RECEIPT_REJECTED: "Mississippi intake receipt or independent replay did not verify.",
};
export const intakeError = code => Object.assign(new Error(MESSAGES[code]), { code });
export function requireIntake(condition, code = "MS_REPORT_PACKAGE_REJECTED") {
  if (!condition) throw intakeError(code);
}

export async function canonicalDirectory(directory, { create = false } = {}) {
  const resolved = path.resolve(directory);
  const relative = path.relative(APP_ROOT, resolved);
  requireIntake(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  requireIntake(samePath(await realpath(APP_ROOT), APP_ROOT));
  let current = APP_ROOT;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (create) await mkdir(current).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(current);
    requireIntake(stat.isDirectory() && !stat.isSymbolicLink() && samePath(await realpath(current), current));
  }
  return resolved;
}

export async function fixedRead(filename, limit, signal) {
  signal?.throwIfAborted();
  await canonicalDirectory(path.dirname(filename));
  const before = await lstat(filename, { bigint: true });
  requireIntake(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(limit));
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    requireIntake(sameFile(before, await handle.stat({ bigint: true })));
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, offset, Math.min(bytes.length - offset, 1024 * 1024), offset);
      requireIntake(bytesRead > 0);
      offset += bytesRead;
    }
    const after = await lstat(filename, { bigint: true });
    requireIntake(after.nlink === 1n && sameFile(before, after) && sameFile(before, await handle.stat({ bigint: true })));
    signal?.throwIfAborted();
    return { bytes, sha256: digest(bytes) };
  } finally {
    await handle.close();
  }
}

export function readJson(bytes) {
  try { return JSON.parse(UTF8.decode(bytes)); }
  catch { throw intakeError("MS_REPORT_PACKAGE_REJECTED"); }
}

function descriptor(file, name, maximum) {
  requireIntake(exact(file, ["path", "bytes", "sha256"]) && file.path === name && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= maximum && SHA.test(file.sha256));
  return { path: name, bytes: file.bytes, sha256: file.sha256 };
}

function validateSelection(value, packageId) {
  requireIntake(exact(value, ["schema_version", "package_id", "observed_at", "source", "format", "sheet_name", "files"]));
  requireIntake(value.schema_version === PACKAGE_VERSION && value.package_id === packageId && isTime(value.observed_at) && value.source === SOURCE);
  requireIntake(["xlsx", "xls", "csv"].includes(value.format) && exact(value.files, FILE_ROLES));
  const sheetName = value.sheet_name;
  requireIntake(value.format === "xlsx" ? typeof sheetName === "string" && sheetName.length > 0 && sheetName.length <= 31 && sheetName.trim() === sheetName && !/[\u0000-\u001f\u007f[\]:*?/\\]/.test(sheetName) : sheetName === null);
  const { ORIGINAL, CSV_COMPANION, SOURCE_EVIDENCE, RIGHTS_EVIDENCE } = value.files;
  requireIntake(value.format === "xlsx" || CSV_COMPANION === null);
  return {
    ORIGINAL: descriptor(ORIGINAL, `original.${value.format}`, MS_BUSINESS_REPORT_MAX_INPUT_BYTES),
    CSV_COMPANION: CSV_COMPANION === null ? null : descriptor(CSV_COMPANION, "export.csv", MS_BUSINESS_REPORT_MAX_INPUT_BYTES),
    SOURCE_EVIDENCE: SOURCE_EVIDENCE === null ? null : descriptor(SOURCE_EVIDENCE, "source-evidence.json", METADATA_LIMIT),
    RIGHTS_EVIDENCE: RIGHTS_EVIDENCE === null ? null : descriptor(RIGHTS_EVIDENCE, "rights-evidence.json", METADATA_LIMIT),
  };
}

function attestSource(value, selected, original) {
  requireIntake(exact(value, ["schema_version", "publisher_url", "observed_at", "artifact_sha256", "method", "supporting_document_sha256"]));
  requireIntake(value.schema_version === "mississippi-business-report-source-evidence@1.0.0" && value.publisher_url === SOURCE && value.observed_at === selected.observed_at && value.artifact_sha256 === original.sha256 && value.method === "operator-observed-publisher-export" && SHA.test(value.supporting_document_sha256));
  return "operator-attested";
}

function attestRights(value, original) {
  requireIntake(exact(value, ["schema_version", "publisher_url", "artifact_sha256", "basis", "supporting_document_sha256", "local_retention", "derived_use"]));
  requireIntake(value.schema_version === "mississippi-business-report-rights-evidence@1.0.0" && value.publisher_url === SOURCE && value.artifact_sha256 === original.sha256 && value.basis === "publisher-written-permission" && SHA.test(value.supporting_document_sha256) && typeof value.local_retention === "boolean" && typeof value.derived_use === "boolean");
  return value.local_retention && value.derived_use ? "operator-attested" : "scope-insufficient";
}

async function matchedRead(directory, file, signal) {
  if (file === null) return null;
  const contents = await fixedRead(path.join(directory, file.path), file.bytes, signal);
  requireIntake(contents.bytes.length === file.bytes && contents.sha256 === file.sha256);
  return contents.bytes;
}

async function validateInventory(directory, names) {
  const remaining = new Set(names);
  for await (const entry of await opendir(directory)) requireIntake(remaining.delete(entry.name) && entry.isFile());
  requireIntake(remaining.size === 0);
}

export async function inspectMississippiBusinessReportIntake(directory, { signal } = {}) {
  const packageId = path.basename(directory);
  requireIntake(path.isAbsolute(directory) && path.dirname(directory) === PACKAGES_ROOT && PACKAGE_ID.test(packageId) && !packageId.endsWith("."));
  await canonicalDirectory(directory);
  const selection = await fixedRead(path.join(directory, "selection.json"), METADATA_LIMIT, signal);
  const selected = readJson(selection.bytes);
  const files = validateSelection(selected, packageId);
  await validateInventory(directory, ["selection.json", ...Object.values(files).filter(Boolean).map(file => file.path)]);
  const sourceEvidence = await matchedRead(directory, files.SOURCE_EVIDENCE, signal);
  const rightsEvidence = await matchedRead(directory, files.RIGHTS_EVIDENCE, signal);
  const gates = {
    original_workbook: selected.format === "xlsx" ? "supplied-xlsx" : "supported-original-workbook-required",
    source_evidence: sourceEvidence ? attestSource(readJson(sourceEvidence), selected, files.ORIGINAL) : "missing",
    rights_evidence: rightsEvidence ? attestRights(readJson(rightsEvidence), files.ORIGINAL) : "missing",
    extraction: selected.format === "xls" ? "unsupported-format" : "rejected",
    csv_companion: files.CSV_COMPANION ? "not-evaluated" : "not-supplied",
  };
  const original = await matchedRead(directory, files.ORIGINAL, signal);
  const csv = await matchedRead(directory, files.CSV_COMPANION, signal);
  let counts = null;
  if (selected.format !== "xls") {
    try {
      counts = await extractMississippiBusinessReport(original, { format: selected.format, sheetName: selected.sheet_name, signal });
      gates.extraction = counts.rows_observed === 0 ? "empty-export" : "matched";
    } catch (error) {
      if (error.code !== "MS_REPORT_EXTRACTION_REJECTED") throw error;
    }
  }
  if (counts && csv) {
    try {
      const companion = await extractMississippiBusinessReport(csv, { format: "csv", signal });
      gates.csv_companion = isDeepStrictEqual(counts, companion) ? "matched" : "mismatch";
    } catch (error) {
      if (error.code !== "MS_REPORT_EXTRACTION_REJECTED") throw error;
      gates.csv_companion = "rejected";
    }
  }
  return { packageId, format: selected.format, selectionSha256: selection.sha256, files, counts, gates };
}

export async function loadMississippiBusinessReportReviewPins(signal) {
  const { bytes } = await fixedRead(PIN_FILE, METADATA_LIMIT, signal);
  const value = readJson(bytes);
  requireIntake(exact(value, ["schema_version", "reviews"]) && value.schema_version === PIN_VERSION && Array.isArray(value.reviews) && value.reviews.length <= 100);
  const selections = new Set();
  for (const review of value.reviews) {
    requireIntake(exact(review, [...BINDING_KEYS, ...REVIEW_FLAGS]) && REVIEW_FLAGS.every(key => review[key] === true));
    requireIntake(BINDING_KEYS.every(key => SHA.test(review[key]) || (key === "csv_companion_sha256" && review[key] === null)) && !selections.has(review.selection_sha256));
    selections.add(review.selection_sha256);
  }
  return value.reviews;
}

export const limitsOfAuthority = Object.freeze({
  network_requests: 0, acquisition_performed: false, account_action_performed: false, purchase_performed: false,
  publisher_contact_performed: false, source_authenticity_verified: false, retention_rights_verified: false,
  derived_use_rights_verified: false, statewide_complete: false, current_operation_verified: false,
  physical_site_verified: false, geocodes_claimed: false, public_export_authorized: false,
  national_admission_performed: false, admission_eligible: false, production_enrollment: false,
  current_pointer_changed: false, rows_published: 0, row_bearing_snapshot_retained: false,
});

export function buildMississippiBusinessReportReadiness(assessment, reviews, expectedPin) {
  const { packageId, format, selectionSha256, files, counts, gates } = assessment;
  const binding = {
    selection_sha256: selectionSha256, original_sha256: files.ORIGINAL.sha256,
    csv_companion_sha256: files.CSV_COMPANION?.sha256 ?? null, source_evidence_sha256: files.SOURCE_EVIDENCE?.sha256 ?? null,
    rights_evidence_sha256: files.RIGHTS_EVIDENCE?.sha256 ?? null,
  };
  const review = reviews.find(candidate => BINDING_KEYS.every(key => candidate[key] === binding[key]) && REVIEW_FLAGS.every(key => candidate[key] === true));
  const pinSha256 = review ? digest(jsonBytes({ ...binding, ...Object.fromEntries(REVIEW_FLAGS.map(key => [key, true])) })) : null;
  const matchedPin = expectedPin === null ? null : pinSha256;
  requireIntake(expectedPin === undefined || matchedPin === expectedPin, "MS_REPORT_RECEIPT_REJECTED");
  const attested = gates.original_workbook === "supplied-xlsx" && gates.extraction === "matched" &&
    ["matched", "not-supplied"].includes(gates.csv_companion) && gates.source_evidence === "operator-attested" && gates.rights_evidence === "operator-attested";
  const readiness = !attested ? "blocked" : matchedPin ? "ready-for-normalization-review" : "operator-attested-awaiting-independent-review";
  return {
    schema_version: REPORT_VERSION, package_id: packageId, format, selection_sha256: selectionSha256,
    extraction_version: MS_BUSINESS_REPORT_EXTRACTION, readiness_status: readiness,
    inputs: files, gates: { ...gates, independent_review: matchedPin ? "matched" : "missing" },
    review_pin_sha256: matchedPin, extraction: counts,
    warnings: counts?.rows_observed === MAX_ROWS ? mississippiBusinessReportWarnings(MAX_ROWS) : [],
    claims: limitsOfAuthority,
  };
}
