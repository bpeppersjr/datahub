import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const KY_BUSINESS_PACKAGE_VERSION = "kentucky-business-entity-package@1.0.0";
export const KY_BUSINESS_NORMALIZER_VERSION = "kentucky-business-entity-normalizer@1.0.0";
export const KY_BUSINESS_FIELDS = Object.freeze(["ID","comptype","compseq","Name","Standing","Status","Country","State","Type","raname","raaddr1","raaddr2","raaddr3","raaddr4","racity","restate","razip","poaddr1","poaddr2","poaddr3","poaddr4","pocity","postate","pozip","filedate","orgdate","authdate","recorddate","raresdte","expdte","rendte","numofcr","numofshr","mangnum","applname","appltitl","parpre","parcomno","parcom","parpreno","profit","recordnumber"]);
export const KY_BUSINESS_TEMPORAL_SCOPES = Object.freeze(["all-companies-monthly","new-companies-weekly","new-companies-daily","company-changes-daily"]);

const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
const DATE = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(\d{4})$/;
const REQUIRED = Object.freeze(["ID","comptype","compseq","Name","Status","State","Type","raname","raaddr1","racity","restate","razip","poaddr1","pocity","postate","pozip","filedate","recorddate","recordnumber"]);
const DATES = Object.freeze(["filedate","orgdate","authdate","recorddate","raresdte","expdte","rendte"]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw Object.assign(new Error(`Kentucky business-entity package rejected: ${message}`), { code: "KY_BUSINESS_ENTITY_REJECTED" }); };
const check = (condition, message) => { if (!condition) fail(message); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
const clean = (value, maximum = 2_000) => typeof value === "string" && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const realDate = value => {
  const match = value.match(DATE); if (!match) return false;
  const month=Number(match[1]), day=Number(match[2]), year=Number(match[3]), date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
};

function postal(raw) {
  if (raw === "") return { postal_raw: "", zip5: null, zip4: null, postal_parse_status: "blank" };
  const match = raw.match(/^(\d{5})(?:-?(\d{4}))?$/);
  return match
    ? { postal_raw: raw, zip5: match[1], zip4: match[2] ?? null, postal_parse_status: "parsed" }
    : { postal_raw: raw, zip5: null, zip4: null, postal_parse_status: "unresolved-format" };
}

function validateRow(row) {
  check(Array.isArray(row) && row.length === KY_BUSINESS_FIELDS.length, "company row does not contain exactly 42 tab-delimited fields");
  const value = Object.fromEntries(KY_BUSINESS_FIELDS.map((field, index) => [field, row[index]]));
  for (const field of KY_BUSINESS_FIELDS) check(clean(value[field]), `${field} contains an invalid or oversized value`);
  for (const field of REQUIRED) check(value[field].length > 0, `${field} is required by the published company-family layout`);
  check(/^\d{7}$/.test(value.ID), "ID must contain exactly 7 digits");
  check(/^\d{2}$/.test(value.comptype), "comptype must contain exactly 2 digits");
  check(/^\d{5}$/.test(value.compseq), "compseq must contain exactly 5 digits");
  check(/^\d{7}$/.test(value.recordnumber), "recordnumber must contain exactly 7 digits");
  for (const field of DATES) check(value[field] === "" || realDate(value[field]), `${field} must be blank or a real calendar date in exact mm/dd/yyyy form`);
  check(["A","D","I"].includes(value.Status), "Status must be A, D, or I");
  check(value.Standing === "" || (["06","09"].includes(value.comptype) && ["G","B","X"].includes(value.Standing)), "Standing is only G/B/X for company types 06/09");
  check(value.Country === "" || value.Country.length === 2, "Country must be blank or exactly 2 characters");
  check(value.State.length === 2 && value.Type.length === 3 && value.restate.length === 2 && value.postate.length === 2, "State/Type/address code width is invalid");
  check(value.razip.length <= 10 && value.pozip.length <= 10, "ZIP text exceeds 10 characters");
  check(["","P","N"].includes(value.profit) && (value.profit === "" || value.comptype === "09"), "profit must be blank or P/N only for company type 09");
  return value;
}

function parseTsv(bytes, hasHeader, maximumRows, signal) {
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("companies.txt is not valid UTF-8"); }
  check((!text || text.endsWith("\n")) && !text.replaceAll("\r\n", "").includes("\r"), "companies.txt must use consistently LF or CRLF terminated records");
  const lines = text ? text.slice(0, -1).split("\n").map(line => line.endsWith("\r") ? line.slice(0, -1) : line) : [];
  if (hasHeader) {
    check(lines.length > 0 && isDeepStrictEqual(lines[0].split("\t"), KY_BUSINESS_FIELDS), "declared source header does not exactly match the official 42-field order");
    lines.shift();
  }
  check(lines.length <= maximumRows, "company row count exceeds the configured bound");
  return lines.map(line => {
    signal?.throwIfAborted();
    check(line.length > 0 && Buffer.byteLength(line) <= 65_536, "companies.txt contains an empty or oversized record");
    return validateRow(line.split("\t"));
  });
}

async function fixedFile(filename, parent, maximumBytes) {
  const canonical = await realpath(filename), relative = path.relative(parent, canonical);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "input escapes package");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximumBytes), "input is unsafe, empty, or oversized");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev","ino","size","mtimeNs","ctimeNs"].every(key => before[key] === after[key]), "input changed while read");
  return { bytes, bytes_count: Number(before.size), sha256: sha256(bytes) };
}

export function normalizeKentuckyBusinessEntity(row, context) {
  const value = Array.isArray(row) ? validateRow(row) : validateRow(KY_BUSINESS_FIELDS.map(field => row[field]));
  check(exact(context, ["package_id","observed_at","temporal_scope","source_file_sha256","selection_sha256","transformation_version"]), "normalization context drifted");
  check(PACKAGE.test(context.package_id) && new Date(context.observed_at).toISOString() === context.observed_at && KY_BUSINESS_TEMPORAL_SCOPES.includes(context.temporal_scope) && SHA.test(context.source_file_sha256) && SHA.test(context.selection_sha256) && clean(context.transformation_version, 128) && context.transformation_version, "normalization context is invalid");
  const sourceKey = `${value.ID}\0${value.comptype}\0${value.compseq}`;
  return {
    schema_version: KY_BUSINESS_NORMALIZER_VERSION,
    source_record_id: sha256(Buffer.from(sourceKey)), jurisdiction: "KY",
    source_identity: { id: value.ID, company_type: value.comptype, company_sequence: value.compseq },
    record_number: value.recordnumber,
    organization_name: value.Name,
    standing: value.Standing || null, status: value.Status, country: value.Country || null, state: value.State, entity_type: value.Type,
    dates: { file_date: value.filedate, organization_date: value.orgdate || null, authorization_date: value.authdate || null, record_date: value.recorddate, expiration_date: value.expdte || null, renewal_date: value.rendte || null },
    principal_administrative_address: { address_lines: [value.poaddr1,value.poaddr2,value.poaddr3,value.poaddr4].filter(Boolean), city: value.pocity, state: value.postate, ...postal(value.pozip), role: "administrative-only", may_be_residential: true, may_be_out_of_state: true },
    profit: value.profit || null,
    provenance: { ...context, source_schema: "official-company-family-42-field-layout" },
    raw_source_classification: "person-bearing-internal", export_policy: "local-review-only",
    claims: { identifier_permanence_or_nonreuse_verified:false, source_authenticity_verified:false, statewide_complete:false, current_operation_verified:false, physical_site_verified:false, redistribution_authorized:false, national_admission_performed:false, admission_eligible:false, production_enrollment:false, current_pointer_written:false },
  };
}

export async function inspectKentuckyBusinessEntityPackage(packageDirectory, { root = APP_ROOT, maximumSourceBytes = 1_000_000_000, maximumRows = 2_000_000, signal } = {}) {
  signal?.throwIfAborted();
  check(path.isAbsolute(packageDirectory), "package path must be absolute");
  check(Number.isSafeInteger(maximumRows) && maximumRows >= 0 && maximumRows <= 2_000_000, "maximumRows is invalid");
  const canonicalRoot = await realpath(path.resolve(root));
  const expectedRoot = path.join(canonicalRoot, "data", "imports", "kentucky-business-entity-bulk", "packages");
  const canonicalPackage = await realpath(packageDirectory);
  check(path.dirname(canonicalPackage) === expectedRoot && PACKAGE.test(path.basename(canonicalPackage)), "package location is invalid");
  const info = await lstat(canonicalPackage, { bigint: true }); check(info.isDirectory() && !info.isSymbolicLink(), "package is not a regular directory");
  check(isDeepStrictEqual((await readdir(canonicalPackage)).sort(), ["companies.txt","selection.json"]), "package inventory must contain exactly selection.json and companies.txt; officer files are forbidden");
  const selectionFile = await fixedFile(path.join(canonicalPackage, "selection.json"), canonicalPackage, 64_000);
  let selection; try { selection = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(selectionFile.bytes)); } catch { fail("selection.json is not valid UTF-8 JSON"); }
  check(exact(selection, ["schema_version","package_id","observed_at","temporal_scope","source","source_file_has_header","transformation","raw_source_classification","files","claims"]), "selection envelope drifted");
  check(selection.schema_version === KY_BUSINESS_PACKAGE_VERSION && selection.package_id === path.basename(canonicalPackage) && new Date(selection.observed_at).toISOString() === selection.observed_at && KY_BUSINESS_TEMPORAL_SCOPES.includes(selection.temporal_scope), "selection identity or temporal scope is invalid");
  check(selection.source === "https://www.sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx" && typeof selection.source_file_has_header === "boolean" && selection.raw_source_classification === "person-bearing-internal", "source declaration is invalid");
  check(exact(selection.transformation, ["version","method","performed_by"]) && clean(selection.transformation.version,128) && selection.transformation.version && clean(selection.transformation.method,500) && selection.transformation.method && clean(selection.transformation.performed_by,128) && selection.transformation.performed_by, "transformation declaration is invalid");
  check(exact(selection.files, ["COMPANIES"]), "file roster must contain only COMPANIES; officer files are forbidden");
  const descriptor = selection.files.COMPANIES;
  check(exact(descriptor, ["path","bytes","sha256","row_count"]) && descriptor.path === "companies.txt" && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= maximumSourceBytes && SHA.test(descriptor.sha256) && Number.isSafeInteger(descriptor.row_count) && descriptor.row_count >= 0 && descriptor.row_count <= maximumRows, "company file descriptor is invalid");
  const claimKeys = ["network_requests","acquisition_performed","account_created","payment_made","terms_accepted","publisher_contacted","officer_files_included","source_authenticity_verified","statewide_complete","current_operation_verified","physical_site_verified","redistribution_authorized","national_admission_performed","production_enrollment","source_pointer_changed"];
  check(exact(selection.claims, claimKeys) && selection.claims.network_requests === 0 && claimKeys.slice(1).every(key => selection.claims[key] === false), "selection exceeds fixture-only offline authority");
  const sourceFile = await fixedFile(path.join(canonicalPackage, descriptor.path), canonicalPackage, maximumSourceBytes);
  check(sourceFile.bytes_count === descriptor.bytes && sourceFile.sha256 === descriptor.sha256, "company file hash or size mismatch");
  const rows = parseTsv(sourceFile.bytes, selection.source_file_has_header, maximumRows, signal);
  check(rows.length === descriptor.row_count, "company row count mismatch");
  const identities = new Set(); for (const row of rows) { const key = `${row.ID}\0${row.comptype}\0${row.compseq}`; check(!identities.has(key), "duplicate (ID, comptype, compseq) identity"); identities.add(key); }
  const context = { package_id:selection.package_id, observed_at:selection.observed_at, temporal_scope:selection.temporal_scope, source_file_sha256:sourceFile.sha256, selection_sha256:selectionFile.sha256, transformation_version:selection.transformation.version };
  const records = rows.map(row => normalizeKentuckyBusinessEntity(row, context));
  signal?.throwIfAborted();
  const selectionAfter = await fixedFile(path.join(canonicalPackage, "selection.json"), canonicalPackage, 64_000);
  check(selectionAfter.sha256 === selectionFile.sha256 && isDeepStrictEqual((await readdir(canonicalPackage)).sort(), ["companies.txt","selection.json"]), "package inventory or selection changed during inspection");
  return { package_id:selection.package_id, selection_sha256:selectionFile.sha256, records, counts:{company_rows:rows.length}, claims:selection.claims };
}
