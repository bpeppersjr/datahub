import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const MS_BUSINESS_REPORT_PACKAGE_VERSION = "mississippi-business-report-package@1.0.0";
export const MS_BUSINESS_REPORT_NORMALIZER_VERSION = "mississippi-business-report-normalizer@1.0.0";
export const MS_BUSINESS_REPORT_MAX_ROWS = 300_000;
export const MS_BUSINESS_REPORT_HEADERS = Object.freeze([
  "Business Name", "Business ID", "Other Business Name 1", "Other Business Name 2",
  "Profile Type", "Domicile Type", "Status", "NAICS Code 1", "NAICS Code 2", "NAICS Code 3",
  "Principal Address", "City", "State", "County", "Postal Code", "Formation Date",
]);

const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw Object.assign(new Error(`Mississippi business-report package rejected: ${message}`), { code: "MS_BUSINESS_REPORT_REJECTED" }); };
const check = (condition, message) => { if (!condition) fail(message); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
const clean = (value, maximum = 500) => typeof value === "string" && value === value.trim() && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);

export function mississippiBusinessReportWarnings(rowCount) {
  check(Number.isSafeInteger(rowCount) && rowCount >= 0 && rowCount <= MS_BUSINESS_REPORT_MAX_ROWS, "record count exceeds the published 300,000-row export ceiling");
  return rowCount === MS_BUSINESS_REPORT_MAX_ROWS ? ["Export contains exactly 300,000 rows, the published ceiling; truncation is possible and statewide completeness remains false."] : [];
}

function parsePostal(value) {
  if (!value) return { zip5: null, zip4: null };
  const match = value.match(/^(\d{5})(?:-?(\d{4}))?$/);
  check(match, "Postal Code is not ZIP5 or ZIP5+4");
  return { zip5: match[1], zip4: match[2] ?? null };
}

function validateRow(row) {
  check(exact(row, MS_BUSINESS_REPORT_HEADERS), "published field roster drifted");
  for (const header of MS_BUSINESS_REPORT_HEADERS) check(clean(row[header]), `${header} contains an invalid value`);
  check(/^\d{6,7}$/.test(row["Business ID"]), "Business ID must be the published six- or seven-digit identifier");
  check(row["Business Name"].length > 0, "Business Name is required");
  check(row.State === "" || /^[A-Z]{2}$/.test(row.State), "State is invalid");
  parsePostal(row["Postal Code"]);
}

function parseJsonl(bytes, maximumRows, signal) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(!text.includes("\r") && (!text || text.endsWith("\n")), "records.jsonl must be LF-terminated UTF-8 JSONL");
  const lines = text ? text.slice(0, -1).split("\n") : [];
  check(lines.length <= maximumRows && lines.length <= MS_BUSINESS_REPORT_MAX_ROWS, "record count exceeds the published 300,000-row export ceiling");
  return lines.map(line => {
    signal?.throwIfAborted();
    check(line.length > 0 && Buffer.byteLength(line) <= 65_536, "records.jsonl has an invalid line");
    let row; try { row = JSON.parse(line); } catch { fail("records.jsonl contains invalid JSON"); }
    validateRow(row); return row;
  });
}

async function fixedFile(filename, parent, maximumBytes) {
  const canonical = await realpath(filename), relative = path.relative(parent, canonical);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "input escapes package");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximumBytes), "unsafe, empty, or oversized input");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "input changed while read");
  return { bytes, bytes_count: Number(before.size), sha256: sha256(bytes) };
}

export function normalizeMississippiBusinessReportRow(row, context) {
  validateRow(row);
  check(exact(context, ["package_id", "observed_at", "original_workbook_sha256", "derived_records_sha256", "transformation_version"]), "normalization context drifted");
  check(PACKAGE.test(context.package_id) && new Date(context.observed_at).toISOString() === context.observed_at && SHA.test(context.original_workbook_sha256) && SHA.test(context.derived_records_sha256) && clean(context.transformation_version, 128) && context.transformation_version, "normalization context is invalid");
  const postal = parsePostal(row["Postal Code"]);
  return {
    schema_version: MS_BUSINESS_REPORT_NORMALIZER_VERSION,
    source_record_id: sha256(Buffer.from(row["Business ID"])), jurisdiction: "MS",
    business_id: row["Business ID"], organization_name: row["Business Name"],
    other_business_names: [row["Other Business Name 1"], row["Other Business Name 2"]].filter(Boolean),
    profile_type: row["Profile Type"] || null, domicile_type: row["Domicile Type"] || null,
    registry_status: row.Status || null,
    naics_codes: [row["NAICS Code 1"], row["NAICS Code 2"], row["NAICS Code 3"]].filter(Boolean),
    formation_date: row["Formation Date"] || null,
    principal_administrative_address: { address_line: row["Principal Address"] || null, city: row.City || null, state: row.State || null, county: row.County || null, zip5: postal.zip5, zip4: postal.zip4 },
    provenance: { package_id: context.package_id, observed_at: context.observed_at, original_workbook_sha256: context.original_workbook_sha256, derived_records_sha256: context.derived_records_sha256, transformation_version: context.transformation_version, representation: "operator-derived-jsonl" },
    export_policy: "local-review-only",
    claims: { organization_registration_evidence: true, principal_address_role: "administrative-registration-evidence", source_native: false, source_authenticity_verified: false, reproducible_extraction_verified: false, statewide_complete: false, current_operation_verified: false, physical_site_verified: false, redistribution_authorized: false, national_admission_performed: false, admission_eligible: false, production_enrollment: false, current_pointer_written: false },
  };
}

export async function inspectMississippiBusinessReportPackage(packageDirectory, { root = APP_ROOT, packagesRoot, maximumWorkbookBytes = 1_000_000_000, maximumJsonlBytes = 1_000_000_000, maximumRows = MS_BUSINESS_REPORT_MAX_ROWS, signal } = {}) {
  signal?.throwIfAborted();
  check(path.isAbsolute(packageDirectory), "package path must be absolute");
  check(Number.isSafeInteger(maximumRows) && maximumRows >= 0 && maximumRows <= MS_BUSINESS_REPORT_MAX_ROWS, "maximumRows exceeds the published ceiling");
  const canonicalRoot = await realpath(path.resolve(root));
  const expectedRoot = packagesRoot === undefined
    ? path.join(canonicalRoot, "data", "imports", "mississippi-business-report", "packages")
    : await realpath(path.resolve(packagesRoot));
  if (packagesRoot !== undefined) {
    const relativeRoot = path.relative(canonicalRoot, expectedRoot).split(path.sep).join("/");
    check(/^data\/imports\/mississippi-business-report\/operations\/[a-f0-9-]{36}\/input-snapshot$/i.test(relativeRoot), "packages root is not an operation-owned snapshot");
  }
  const canonicalPackage = await realpath(packageDirectory);
  check(path.dirname(canonicalPackage) === expectedRoot && PACKAGE.test(path.basename(canonicalPackage)), "package location is invalid");
  const info = await lstat(canonicalPackage, { bigint: true }); check(info.isDirectory() && !info.isSymbolicLink(), "package is not a regular directory");
  const names = (await readdir(canonicalPackage)).sort();
  check(names.length === 3 && names.includes("records.jsonl") && names.includes("selection.json") && (names.includes("original.xls") !== names.includes("original.xlsx")), "package inventory must contain selection, records, and exactly one XLS/XLSX workbook");
  const selectionFile = await fixedFile(path.join(canonicalPackage, "selection.json"), canonicalPackage, 64_000);
  let selection; try { selection = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(selectionFile.bytes)); } catch { fail("selection is not valid UTF-8 JSON"); }
  check(exact(selection, ["schema_version", "package_id", "observed_at", "source", "export", "transformation", "files", "claims"]), "selection envelope drifted");
  check(selection.schema_version === MS_BUSINESS_REPORT_PACKAGE_VERSION && selection.package_id === path.basename(canonicalPackage) && new Date(selection.observed_at).toISOString() === selection.observed_at && selection.source === "https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3", "selection identity is invalid");
  check(exact(selection.export, ["format", "query_description", "statewide_complete"]) && ["xls", "xlsx"].includes(selection.export.format) && clean(selection.export.query_description) && selection.export.query_description && selection.export.statewide_complete === false, "export declaration is invalid");
  check(exact(selection.transformation, ["version", "method", "performed_by", "source_native", "reproducible_extraction_verified"]) && clean(selection.transformation.version, 128) && selection.transformation.version && clean(selection.transformation.method) && selection.transformation.method && clean(selection.transformation.performed_by, 128) && selection.transformation.performed_by && selection.transformation.source_native === false && selection.transformation.reproducible_extraction_verified === false, "transformation declaration is invalid");
  check(exact(selection.files, ["ORIGINAL_WORKBOOK", "RECORDS"]), "file descriptor roster drifted");
  const workbookName = `original.${selection.export.format}`, workbookDescriptor = selection.files.ORIGINAL_WORKBOOK, recordsDescriptor = selection.files.RECORDS;
  check(exact(workbookDescriptor, ["path", "bytes", "sha256"]) && workbookDescriptor.path === workbookName && Number.isSafeInteger(workbookDescriptor.bytes) && workbookDescriptor.bytes > 0 && SHA.test(workbookDescriptor.sha256), "workbook descriptor is invalid");
  check(exact(recordsDescriptor, ["path", "bytes", "sha256", "row_count"]) && recordsDescriptor.path === "records.jsonl" && Number.isSafeInteger(recordsDescriptor.bytes) && recordsDescriptor.bytes > 0 && SHA.test(recordsDescriptor.sha256) && Number.isSafeInteger(recordsDescriptor.row_count) && recordsDescriptor.row_count >= 0 && recordsDescriptor.row_count <= MS_BUSINESS_REPORT_MAX_ROWS, "records descriptor is invalid");
  check(exact(selection.claims, ["network_requests", "acquisition_performed", "source_authenticity_verified", "statewide_complete", "current_operation_verified", "physical_site_verified", "redistribution_authorized", "national_admission_performed", "production_enrollment", "source_pointer_changed"]), "claims roster drifted");
  check(selection.claims.network_requests === 0 && Object.entries(selection.claims).filter(([key]) => key !== "network_requests").every(([, value]) => value === false), "selection exceeds offline authority");
  const workbook = await fixedFile(path.join(canonicalPackage, workbookName), canonicalPackage, maximumWorkbookBytes), recordsFile = await fixedFile(path.join(canonicalPackage, "records.jsonl"), canonicalPackage, maximumJsonlBytes);
  check(workbook.bytes_count === workbookDescriptor.bytes && workbook.sha256 === workbookDescriptor.sha256, "workbook hash or size mismatch");
  check(recordsFile.bytes_count === recordsDescriptor.bytes && recordsFile.sha256 === recordsDescriptor.sha256, "records hash or size mismatch");
  const rows = parseJsonl(recordsFile.bytes, maximumRows, signal); check(rows.length === recordsDescriptor.row_count, "row count mismatch");
  const ids = new Set(); for (const row of rows) { check(!ids.has(row["Business ID"]), "duplicate Business ID"); ids.add(row["Business ID"]); }
  const context = { package_id: selection.package_id, observed_at: selection.observed_at, original_workbook_sha256: workbook.sha256, derived_records_sha256: recordsFile.sha256, transformation_version: selection.transformation.version };
  return { package_id: selection.package_id, selection_sha256: selectionFile.sha256, records: rows.map(row => normalizeMississippiBusinessReportRow(row, context)), counts: { records: rows.length }, warnings: mississippiBusinessReportWarnings(rows.length), claims: selection.claims };
}
