import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import unzipper from "unzipper";
import { APP_ROOT } from "./paths.mjs";
import { inspectUtahBusinessListPackage, UTAH_BUSINESS_LIST_SHEETS } from "./utah-business-list-offline.mjs";

export const UTAH_WORKBOOK_REPLAY_VERSION = "utah-business-list-workbook-replay@1.0.0";
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_WORKBOOK_BYTES = 1_000_000_000;
const MAX_ENTRY_BYTES = 256_000_000;
const MAX_EXPANDED_BYTES = 1_250_000_000;
const MAX_PARTS = 256;
const MAX_ROWS = 1_000_000;
const PRIVATE_FIELDS = Object.freeze({
  BUSENTITY: new Set(["Applicant Name"]),
  BUSINFO: new Set(["Information"]),
  PRINCIPAL: new Set(["Full Name", "Address", "Address 2", "City", "State", "ZipCode"]),
});
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw Object.assign(new Error(`Utah workbook replay rejected: ${message}`), { code: "UT_BUSINESS_WORKBOOK_REJECTED" }); };
const check = (condition, message) => { if (!condition) fail(message); };
const xmlText = value => String(value ?? "").replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => {
  if (numeric) return String.fromCodePoint(numeric[0].toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10));
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[named.toLowerCase()];
});
const attribute = (tag, name) => { const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`)); return match ? xmlText(match[1] ?? match[2]) : null; };
const safeXml = (bytes, label) => {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(!/<!DOCTYPE|<!ENTITY/i.test(text), `${label} contains a forbidden XML declaration`);
  return text;
};

async function fixedWorkbook(file, root) {
  check(path.isAbsolute(file), "workbook path must be absolute");
  const canonicalRoot = await realpath(root), canonical = await realpath(file);
  check(canonicalRoot === path.resolve(root), "application root is not canonical");
  const imports = path.join(canonicalRoot, "data", "imports", "utah-business-list", "workbooks");
  check(path.dirname(canonical) === imports && path.extname(canonical).toLowerCase() === ".xlsx", "workbook must be directly inside the governed workbooks directory");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(MAX_WORKBOOK_BYTES), "workbook is unsafe or oversized");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "workbook changed while read");
  return { canonical, bytes, sha256: sha(bytes) };
}

async function workbookEntries(file) {
  let directory; try { directory = await unzipper.Open.file(file); } catch { fail("input is not a readable XLSX ZIP container"); }
  check(directory.files.length <= MAX_PARTS, "workbook contains too many ZIP parts");
  const entries = new Map(); let expanded = 0;
  for (const entry of directory.files) {
    const name = entry.path.replaceAll("\\", "/");
    check(!name.startsWith("/") && !name.split("/").includes("..") && !entries.has(name), "workbook ZIP inventory is unsafe");
    if (entry.type === "Directory") continue;
    check(entry.uncompressedSize <= MAX_ENTRY_BYTES, "workbook entry exceeds size limit");
    expanded += entry.uncompressedSize; check(expanded <= MAX_EXPANDED_BYTES, "workbook expanded-size budget exceeded");
    entries.set(name, await entry.buffer());
  }
  return entries;
}

function relationships(xml, base) {
  const result = new Map();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
    const id = attribute(match[0], "Id"), target = attribute(match[0], "Target"), mode = attribute(match[0], "TargetMode");
    check(id && target && mode !== "External" && !/^[a-z][a-z0-9+.-]*:/i.test(target), "workbook contains an external or malformed relationship");
    check(!result.has(id), "workbook contains a duplicate relationship identifier");
    const resolved = path.posix.normalize(path.posix.join(base, target));
    check(!resolved.startsWith("../") && !resolved.startsWith("/"), "relationship escapes workbook package");
    result.set(id, resolved);
  }
  return result;
}

function sharedStrings(entries) {
  const bytes = entries.get("xl/sharedStrings.xml"); if (!bytes) return [];
  const xml = safeXml(bytes, "shared strings"), values = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) values.push([...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => xmlText(match[1])).join(""));
  return values;
}

function parseSheet(bytes, shared, sheet) {
  const xml = safeXml(bytes, sheet);
  check(!/<f\b|<hyperlink\b/i.test(xml), `${sheet} contains formulas or links`);
  const rows = [];
  let expectedRow = 1;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const declaredRow = attribute(`<row ${rowMatch[1]}>`, "r"); check(declaredRow === null || Number(declaredRow) === expectedRow, `${sheet} row numbering is not contiguous`);
    const cells = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const tag = `<c ${cellMatch[1] ?? cellMatch[3] ?? ""}>`, reference = attribute(tag, "r"), type = attribute(tag, "t") ?? "n";
      check(reference && /^[A-Z]+[1-9]\d*$/.test(reference), `${sheet} contains an invalid cell reference`);
      check(Number(reference.match(/\d+$/)[0]) === expectedRow, `${sheet} cell reference does not match its row`);
      const column = reference.match(/^[A-Z]+/)[0]; check(!cells.has(column), `${sheet} contains a duplicate cell`);
      const body = cellMatch[2] ?? ""; let value = "";
      if (type === "inlineStr") value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => xmlText(match[1])).join("");
      else { const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ""; if (type === "s") { const index = Number(raw); check(Number.isSafeInteger(index) && index >= 0 && index < shared.length, `${sheet} shared-string reference is invalid`); value = shared[index]; } else { check(["n", "str", "b"].includes(type), `${sheet} contains an unsupported cell type`); value = xmlText(raw); } }
      check(!/[\u0000-\u001f\u007f]/.test(value) && Buffer.byteLength(value) <= 65_536, `${sheet} contains an invalid cell value`);
      cells.set(column, value);
    }
    rows.push(cells);
    expectedRow += 1;
  }
  check(rows.length > 0 && rows.length - 1 <= MAX_ROWS, `${sheet} row count is invalid`);
  const expectedColumns = UTAH_BUSINESS_LIST_SHEETS[sheet].map((_, index) => { let value = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + ((n - 1) % 26)) + value; return value; });
  const columns = [...rows[0].keys()], headers = [...rows[0].values()];
  check(isDeepStrictEqual(headers, UTAH_BUSINESS_LIST_SHEETS[sheet]) && isDeepStrictEqual(columns, expectedColumns), `${sheet} headers drifted`);
  const emitted = rows.slice(1).map(cells => {
    check([...cells.values()].some(Boolean), `${sheet} contains a non-record row`);
    check([...cells.keys()].every(column => expectedColumns.includes(column)), `${sheet} contains a cell outside the required roster`);
    return Object.fromEntries(headers.map((header, index) => {
    const value = cells.get(columns[index]) ?? "";
    return [header, PRIVATE_FIELDS[sheet].has(header) ? "" : String(value)];
    }));
  });
  const fingerprints = emitted.map(value => sha(Buffer.from(JSON.stringify(value)))); check(new Set(fingerprints).size === fingerprints.length, `${sheet} contains duplicate rows`);
  return emitted;
}

async function parseWorkbook(workbook, signal) {
  const entries = await workbookEntries(workbook.canonical); signal?.throwIfAborted();
  const names = [...entries.keys()];
  check(!names.some(name => /(^|\/)(vbaProject\.bin|externalLinks|connections\.xml|embeddings|oleObjects)(\/|$)/i.test(name)), "workbook contains macros, external links, connections, or embedded objects");
  const types = safeXml(entries.get("[Content_Types].xml") ?? fail("content types are missing"), "content types");
  check(/ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml"/.test(types), "workbook content type is missing");
  check((types.match(/ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.worksheet\+xml"/g) ?? []).length >= 1, "worksheet content type is missing");
  for (const [name, bytes] of entries) if (name.endsWith(".rels")) relationships(safeXml(bytes, name), path.posix.dirname(name.replace(/\/_rels\/([^/]+)\.rels$/, "/$1")));
  const book = safeXml(entries.get("xl/workbook.xml") ?? fail("workbook metadata is missing"), "workbook metadata");
  check(!/<definedNames?\b|<externalReferences?\b/i.test(book), "workbook contains defined names or external references");
  const rels = relationships(safeXml(entries.get("xl/_rels/workbook.xml.rels") ?? fail("workbook relationships are missing"), "workbook relationships"), "xl");
  const sheets = [...book.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map(match => ({ name: attribute(match[0], "name"), id: attribute(match[0], "r:id"), state: attribute(match[0], "state") ?? "visible" }));
  check(isDeepStrictEqual(sheets.map(value => value.name), Object.keys(UTAH_BUSINESS_LIST_SHEETS)) && sheets.every(value => value.id && value.state === "visible"), "workbook must contain exactly the three required visible sheets in order");
  const shared = sharedStrings(entries), result = {};
  for (const sheet of sheets) { signal?.throwIfAborted(); const target = rels.get(sheet.id); check(target && entries.has(target), `${sheet.name} worksheet is missing`); result[sheet.name] = parseSheet(entries.get(target), shared, sheet.name); }
  const ids = new Set();
  for (const row of result.BUSENTITY) { check(row["Entity ID"] && row["Entity No."] && row["Business Name"], "BUSENTITY identity is incomplete"); check(!ids.has(row["Entity ID"]), "duplicate BUSENTITY Entity ID"); ids.add(row["Entity ID"]); }
  for (const sheet of ["BUSINFO", "PRINCIPAL"]) for (const row of result[sheet]) check(row["Entity ID"] && ids.has(row["Entity ID"]), `${sheet} contains an orphan Entity ID`);
  return { workbook, sheets: result, counts: Object.fromEntries(Object.entries(result).map(([name, rows]) => [name, rows.length])) };
}

export async function extractUtahBusinessWorkbook(file, { root = APP_ROOT, signal, allowPackagePath = false } = {}) {
  signal?.throwIfAborted();
  let workbook;
  if (allowPackagePath) {
    const canonical = await realpath(file), packageRoot = path.join(await realpath(root), "data", "imports", "utah-business-list", "packages");
    check(path.basename(canonical) === "original.xlsx" && path.dirname(path.dirname(canonical)) === packageRoot, "replay workbook package location is invalid");
    workbook = await fixedFileForReplay(canonical, path.dirname(canonical));
  } else workbook = await fixedWorkbook(file, root);
  return parseWorkbook(workbook, signal);
}

const jsonl = rows => Buffer.from(rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
const writeNew = async (file, bytes) => { const handle = await open(file, "wx", 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } };

export async function buildUtahBusinessListReplayPackage({ workbookPath, packageId, observedAt, updatedThrough, root = APP_ROOT, signal } = {}) {
  check(PACKAGE.test(packageId ?? ""), "package ID is invalid"); check(new Date(observedAt).toISOString() === observedAt, "observation time is invalid"); check(/^\d{4}-\d{2}-\d{2}$/.test(updatedThrough ?? ""), "updated-through date is invalid");
  const extracted = await extractUtahBusinessWorkbook(workbookPath, { root, signal });
  const packagesRoot = path.join(path.resolve(root), "data", "imports", "utah-business-list", "packages"); await mkdir(packagesRoot, { recursive: true });
  const canonicalPackagesRoot = await realpath(packagesRoot); check(canonicalPackagesRoot === packagesRoot, "package root ancestry is not canonical");
  const final = path.join(canonicalPackagesRoot, packageId), stage = path.join(canonicalPackagesRoot, `${packageId}.staging`); await mkdir(stage, { recursive: false }); let published = false;
  try {
    const files = {}; await writeNew(path.join(stage, "original.xlsx"), extracted.workbook.bytes); files.ORIGINAL_WORKBOOK = { path: "original.xlsx", bytes: extracted.workbook.bytes.length, sha256: extracted.workbook.sha256 };
    for (const name of Object.keys(UTAH_BUSINESS_LIST_SHEETS)) { const bytes = jsonl(extracted.sheets[name]); await writeNew(path.join(stage, `${name}.jsonl`), bytes); files[name] = { path: `${name}.jsonl`, bytes: bytes.length, sha256: sha(bytes), row_count: extracted.sheets[name].length }; }
    signal?.throwIfAborted();
    const replayWorkbook = await fixedFileForReplay(path.join(stage, "original.xlsx"), stage), replayed = await parseWorkbook(replayWorkbook, signal);
    for (const name of Object.keys(UTAH_BUSINESS_LIST_SHEETS)) check(sha(jsonl(replayed.sheets[name])) === files[name].sha256, `${name} independent replay did not conserve output`);
    const selection = { schema_version: "utah-business-list-package@1.0.0", package_id: packageId, observed_at: observedAt, updated_through: updatedThrough, source: "https://secure.utah.gov/datarequest/businesses/index.html", transformation: { version: UTAH_WORKBOOK_REPLAY_VERSION, method: "Deterministic offline OOXML replay with exact sheet/header checks and person-bearing field minimization.", performed_by: "cotive-collector", source_native: false, reproducible_extraction_verified: true }, files, claims: { network_requests: 0, purchase_performed: false, account_created: false, source_authenticity_verified: false, physical_site_verified: false, current_operation_verified: false, national_admission_performed: false, source_pointer_changed: false } };
    await writeNew(path.join(stage, "selection.json"), Buffer.from(`${JSON.stringify(selection)}\n`)); signal?.throwIfAborted(); await rename(stage, final); published = true;
    const inspected = await inspectUtahBusinessListPackage(final, { root, signal });
    return { schema_version: UTAH_WORKBOOK_REPLAY_VERSION, package_directory: final, package_id: packageId, workbook_sha256: extracted.workbook.sha256, selection_sha256: inspected.selection_sha256, counts: inspected.counts, claims: { network_requests: 0, deterministic_replay_performed: true, source_authenticity_verified: false, rights_verified: false, admission_eligible: false, completeness_claimed: false } };
  } catch (error) { await rm(published ? final : stage, { recursive: true, force: true }); throw error; }
}

async function fixedFileForReplay(file, parent) {
  const canonical = await realpath(file); check(path.dirname(canonical) === parent, "replay workbook escaped staging");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(MAX_WORKBOOK_BYTES), "replay workbook is unsafe");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "replay workbook changed while read");
  return { canonical, bytes, sha256: sha(bytes) };
}
