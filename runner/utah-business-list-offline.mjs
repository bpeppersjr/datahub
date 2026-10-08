import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const UTAH_BUSINESS_LIST_PACKAGE_VERSION = "utah-business-list-package@1.0.0";
export const UTAH_BUSINESS_LIST_NORMALIZER_VERSION = "utah-business-list-normalizer@1.0.0";
export const UTAH_BUSINESS_LIST_SHEETS = Object.freeze({
  BUSENTITY: Object.freeze(["Entity No.","Entity ID","Entity Type","License Type","Business Name","Address","Address 2","City","State","ZipCode","Reg. Date","Exp. Date","Home State","License Status","Status Reason","Date Status Changed","Last Renewal Date","Applicant Name","NAICS Code"]),
  BUSINFO: Object.freeze(["Entity ID","Entity Type","License Type","Business Name","Information Type","Information"]),
  PRINCIPAL: Object.freeze(["Entity ID","Entity Type","License Type","Business Name","Member Position","Full Name","Address","Address 2","City","State","ZipCode"]),
});
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
const FILENAMES = Object.freeze({ BUSENTITY: "BUSENTITY.jsonl", BUSINFO: "BUSINFO.jsonl", PRINCIPAL: "PRINCIPAL.jsonl" });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw Object.assign(new Error(`Utah business-list package rejected: ${message}`), { code: "UT_BUSINESS_LIST_REJECTED" }); };
const check = (condition, message) => { if (!condition) fail(message); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
const clean = (value, maximum = 500) => typeof value === "string" && value === value.trim() && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);

function parsePostal(value) {
  if (!value) return { zip5: null, zip4: null };
  const match = value.match(/^(\d{5})(?:-?(\d{4}))?$/);
  check(match, "postal code is not ZIP5 or ZIP5+4");
  return { zip5: match[1], zip4: match[2] ?? null };
}

function validateRow(row, headers, sheet) {
  check(exact(row, headers), `${sheet} field roster drifted`);
  for (const header of headers) check(clean(row[header]), `${sheet} contains an invalid value`);
  check(row["Entity ID"].length > 0, `${sheet} Entity ID is required`);
  if (sheet === "BUSENTITY") {
    check(row["Entity No."].length > 0 && row["Business Name"].length > 0, "BUSENTITY identity is incomplete");
    check(row.State === "" || /^[A-Z]{2}$/.test(row.State), "BUSENTITY state is invalid");
    check(row["Home State"] === "" || /^[A-Z]{2}$/.test(row["Home State"]), "BUSENTITY home state is invalid");
    parsePostal(row.ZipCode);
  }
}

function parseJsonl(bytes, sheet, maximumRows) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(!text.includes("\r") && (!text || text.endsWith("\n")), `${sheet} must be LF-terminated UTF-8 JSONL`);
  const lines = text ? text.slice(0, -1).split("\n") : [];
  check(lines.length <= maximumRows, `${sheet} exceeds row limit`);
  return lines.map(line => {
    check(line.length > 0 && Buffer.byteLength(line) <= 65_536, `${sheet} has an invalid line`);
    let row; try { row = JSON.parse(line); } catch { fail(`${sheet} contains invalid JSON`); }
    validateRow(row, UTAH_BUSINESS_LIST_SHEETS[sheet], sheet);
    return row;
  });
}

async function fixedFile(filename, parent, maximumBytes) {
  const canonical = await realpath(filename), relative = path.relative(parent, canonical);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "input escapes package");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(maximumBytes), "unsafe or oversized input");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev","ino","size","mtimeNs","ctimeNs"].every(key => before[key] === after[key]), "input changed while read");
  return { bytes, bytes_count: Number(before.size), sha256: sha256(bytes) };
}

export function normalizeUtahBusinessEntity(row, context) {
  validateRow(row, UTAH_BUSINESS_LIST_SHEETS.BUSENTITY, "BUSENTITY");
  check(exact(context, ["package_id","observed_at","updated_through","original_workbook_sha256","derived_sheets_sha256","transformation_version","reproducible_extraction_verified"]), "normalization context drifted");
  check(PACKAGE.test(context.package_id) && new Date(context.observed_at).toISOString() === context.observed_at && /^\d{4}-\d{2}-\d{2}$/.test(context.updated_through) && SHA.test(context.original_workbook_sha256) && SHA.test(context.derived_sheets_sha256) && clean(context.transformation_version, 128) && context.transformation_version.length > 0 && typeof context.reproducible_extraction_verified === "boolean", "normalization context is invalid");
  const postal = parsePostal(row.ZipCode), sourceKey = `${row["Entity ID"]}\0${row["Entity No."]}`;
  return {
    schema_version: UTAH_BUSINESS_LIST_NORMALIZER_VERSION,
    source_record_id: sha256(Buffer.from(sourceKey)),
    jurisdiction: "UT",
    entity_id: row["Entity ID"],
    entity_number: row["Entity No."],
    entity_type: row["Entity Type"] || null,
    license_type: row["License Type"] || null,
    organization_name: row["Business Name"],
    administrative_address: { address_line_1: row.Address || null, address_line_2: row["Address 2"] || null, city: row.City || null, state: row.State || null, zip5: postal.zip5, zip4: postal.zip4 },
    registration_date: row["Reg. Date"] || null,
    expiration_date: row["Exp. Date"] || null,
    home_state: row["Home State"] || null,
    registration_status: row["License Status"] || null,
    status_reason: row["Status Reason"] || null,
    status_changed_date: row["Date Status Changed"] || null,
    last_renewal_date: row["Last Renewal Date"] || null,
    naics_code: row["NAICS Code"] || null,
    provenance: { package_id: context.package_id, observed_at: context.observed_at, source_updated_through: context.updated_through, original_workbook_sha256: context.original_workbook_sha256, derived_sheets_sha256: context.derived_sheets_sha256, transformation_version: context.transformation_version, source_sheet: "BUSENTITY", representation: context.reproducible_extraction_verified ? "deterministic-workbook-replay" : "operator-derived-jsonl" },
    claims: { organization_registration_evidence: true, source_native: false, source_authenticity_verified: false, reproducible_extraction_verified: context.reproducible_extraction_verified, current_operation_verified: false, physical_site_verified: false, national_admission_performed: false, admission_eligible: false },
  };
}

export async function inspectUtahBusinessListPackage(packageDirectory, { root = APP_ROOT, maximumBytesPerSheet = 1_000_000_000, maximumRowsPerSheet = 1_000_000, signal } = {}) {
  signal?.throwIfAborted();
  check(path.isAbsolute(packageDirectory), "package path must be absolute");
  const expectedRoot = path.join(path.resolve(root), "data", "imports", "utah-business-list", "packages");
  const canonicalRoot = await realpath(path.resolve(root)), canonicalPackage = await realpath(packageDirectory);
  check(canonicalRoot === path.resolve(root) && path.dirname(canonicalPackage) === expectedRoot && PACKAGE.test(path.basename(canonicalPackage)), "package location is invalid");
  const info = await lstat(canonicalPackage, { bigint: true }); check(info.isDirectory() && !info.isSymbolicLink(), "package is not a regular directory");
  check(isDeepStrictEqual((await readdir(canonicalPackage)).sort(), ["BUSENTITY.jsonl","BUSINFO.jsonl","PRINCIPAL.jsonl","original.xlsx","selection.json"].sort()), "package inventory must be closed");
  const selectionFile = await fixedFile(path.join(canonicalPackage, "selection.json"), canonicalPackage, 64_000);
  let selection; try { selection = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(selectionFile.bytes)); } catch { fail("selection is not valid UTF-8 JSON"); }
  check(exact(selection, ["schema_version","package_id","observed_at","updated_through","source","transformation","files","claims"]), "selection envelope drifted");
  check(selection.schema_version === UTAH_BUSINESS_LIST_PACKAGE_VERSION && selection.package_id === path.basename(canonicalPackage) && new Date(selection.observed_at).toISOString() === selection.observed_at && /^\d{4}-\d{2}-\d{2}$/.test(selection.updated_through), "selection identity is invalid");
  check(selection.source === "https://secure.utah.gov/datarequest/businesses/index.html", "source is not the pinned official List Service");
  check(exact(selection.transformation, ["version","method","performed_by","source_native","reproducible_extraction_verified"]) && clean(selection.transformation.version,128) && selection.transformation.version.length > 0 && clean(selection.transformation.method,500) && selection.transformation.method.length > 0 && clean(selection.transformation.performed_by,128) && selection.transformation.performed_by.length > 0 && selection.transformation.source_native === false && typeof selection.transformation.reproducible_extraction_verified === "boolean", "transformation declaration is invalid");
  check(selection.transformation.reproducible_extraction_verified === false || selection.transformation.version === "utah-business-list-workbook-replay@1.0.0", "replay claim is not bound to the governed extractor");
  check(exact(selection.files, ["ORIGINAL_WORKBOOK","BUSENTITY","BUSINFO","PRINCIPAL"]) && exact(selection.claims, ["network_requests","purchase_performed","account_created","source_authenticity_verified","physical_site_verified","current_operation_verified","national_admission_performed","source_pointer_changed"]), "selection contract drifted");
  check(selection.claims.network_requests === 0 && selection.claims.purchase_performed === false && selection.claims.account_created === false && selection.claims.source_authenticity_verified === false && selection.claims.physical_site_verified === false && selection.claims.current_operation_verified === false && selection.claims.national_admission_performed === false && selection.claims.source_pointer_changed === false, "selection exceeds offline authority");
  const sheets = {}, artifacts = {};
  const workbookDescriptor = selection.files.ORIGINAL_WORKBOOK;
  check(exact(workbookDescriptor, ["path","bytes","sha256"]) && workbookDescriptor.path === "original.xlsx" && Number.isSafeInteger(workbookDescriptor.bytes) && workbookDescriptor.bytes > 0 && SHA.test(workbookDescriptor.sha256), "original workbook descriptor is invalid");
  const workbook = await fixedFile(path.join(canonicalPackage, workbookDescriptor.path), canonicalPackage, maximumBytesPerSheet);
  check(workbook.bytes_count === workbookDescriptor.bytes && workbook.sha256 === workbookDescriptor.sha256, "original workbook hash or size mismatch");
  for (const sheet of Object.keys(FILENAMES)) {
    const descriptor = selection.files[sheet];
    check(exact(descriptor, ["path","bytes","sha256","row_count"]) && descriptor.path === FILENAMES[sheet] && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0 && SHA.test(descriptor.sha256) && Number.isSafeInteger(descriptor.row_count) && descriptor.row_count >= 0, `${sheet} descriptor is invalid`);
    const file = await fixedFile(path.join(canonicalPackage, descriptor.path), canonicalPackage, maximumBytesPerSheet);
    check(file.bytes_count === descriptor.bytes && file.sha256 === descriptor.sha256, `${sheet} hash or size mismatch`);
    sheets[sheet] = parseJsonl(file.bytes, sheet, maximumRowsPerSheet);
    check(sheets[sheet].length === descriptor.row_count, `${sheet} row count mismatch`); artifacts[sheet] = file;
    signal?.throwIfAborted();
  }
  const ids = new Set();
  for (const row of sheets.BUSENTITY) { check(!ids.has(row["Entity ID"]), "duplicate BUSENTITY Entity ID"); ids.add(row["Entity ID"]); }
  for (const sheet of ["BUSINFO","PRINCIPAL"]) for (const row of sheets[sheet]) check(ids.has(row["Entity ID"]), `${sheet} contains an orphan Entity ID`);
  if (selection.transformation.reproducible_extraction_verified) {
    const { extractUtahBusinessWorkbook } = await import("./utah-business-list-workbook-replay.mjs");
    const replay = await extractUtahBusinessWorkbook(path.join(canonicalPackage, "original.xlsx"), { root, signal, allowPackagePath: true });
    for (const sheet of Object.keys(FILENAMES)) check(isDeepStrictEqual(replay.sheets[sheet], sheets[sheet]), `${sheet} does not match deterministic workbook replay`);
  }
  const context = { package_id: selection.package_id, observed_at: selection.observed_at, updated_through: selection.updated_through, original_workbook_sha256: workbook.sha256, derived_sheets_sha256: sha256(Buffer.concat(Object.keys(FILENAMES).map(sheet => artifacts[sheet].bytes))), transformation_version: selection.transformation.version, reproducible_extraction_verified: selection.transformation.reproducible_extraction_verified };
  const records = sheets.BUSENTITY.map(row => normalizeUtahBusinessEntity(row, context));
  check(records.every(record => !JSON.stringify(record).includes("Applicant Name") && !Object.hasOwn(record, "applicant_name")), "person-bearing field escaped projection");
  return { package_id: selection.package_id, selection_sha256: selectionFile.sha256, records, counts: { business_entities: sheets.BUSENTITY.length, business_info_rows_validated_not_retained: sheets.BUSINFO.length, principal_rows_validated_not_retained: sheets.PRINCIPAL.length }, claims: selection.claims };
}
