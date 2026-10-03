import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const OK_BUSINESS_BULK_OFFLINE_VERSION = "ok-business-bulk-offline@1.0.0";
const SELECTION_VERSION = "ok-business-bulk-selection@1.0.0";
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
const EXPECTED_FIELDS = Object.freeze({
  "01": 23, "02": 9, "03": 12, "04": 14, "05": 14, "06": 13,
  "07": 7, "08": 7, "09": 3, "10": 3, "11": 3, "12": 3,
  "13": 3, "14": 3, "15": 3, "16": 3, "17": 10, "18": 9, "99": 21,
});
const FIELD_LENGTHS = Object.freeze({
  "01":[2,10,2,2,13,150,2,8,8,8,8,8,16,150,16,4,3,8,16,8,25,2,2],
  "02":[2,13,50,50,64,4,9,6,3], "03":[2,10,13,150,50,50,50,13,8,8,150,2],
  "04":[2,10,6,32,150,50,50,50,6,13,8,8,8,150], "05":[2,10,6,150,3,3,8,8,8,8,12,2,10,10],
  "06":[2,10,13,6,6,4,4,150,12,8,8,2,3], "07":[2,13,13,13,256,40,40], "08":[2,13,1,1,40,40,40],
  "09":[2,13,64], "10":[2,13,96], "11":[2,13,24], "12":[2,13,80], "13":[2,13,80], "14":[2,13,16],
  "15":[2,13,50], "16":[2,13,50], "17":[2,10,12,12,96,8,8,8,2,8], "18":[2,10,8,4,4,300,300,10,256],
  "99":[2,10,8,...Array(18).fill(12)],
});
const check = (value, message) => { if (!value) throw new Error(`Oklahoma business bulk package rejected: ${message}.`); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const clean = value => value === "" ? null : value;

async function fixedRead(filename, maximum) {
  const canonical = await realpath(filename);
  check(canonical === path.resolve(filename), "input path must be canonical");
  const before = await lstat(canonical, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum), "unsafe or oversized input");
  const bytes = await readFile(canonical), after = await lstat(canonical, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "input changed while read");
  return { bytes, sha256: sha256(bytes) };
}

function parseLine(line, number) {
  check(!line.includes("\r") && !line.includes("\0"), `line ${number} contains forbidden bytes`);
  const fields = line.split("~"), type = fields[0];
  check(Object.hasOwn(EXPECTED_FIELDS, type), `line ${number} has unknown record type`);
  check(fields.length === EXPECTED_FIELDS[type], `line ${number} type ${type} has ${fields.length} fields, expected ${EXPECTED_FIELDS[type]}`);
  fields.forEach((field, index) => check(field.length <= FIELD_LENGTHS[type][index], `line ${number} type ${type} field ${index + 1} exceeds published width`));
  return fields;
}

export async function readOkBusinessBulkPackage(selectionPath, { maximumBytes = 1_000_000_000 } = {}) {
  check(path.isAbsolute(selectionPath), "selection path must be absolute");
  const canonical = await realpath(selectionPath), packagesRoot = path.join(APP_ROOT, "data", "imports", "oklahoma-business-bulk", "packages");
  const packageDirectory = path.dirname(canonical), packageId = path.basename(packageDirectory);
  check(canonical === path.resolve(selectionPath) && path.basename(canonical) === "selection.json" && path.dirname(packageDirectory) === packagesRoot && PACKAGE.test(packageId), "selection must be an exact package selection.json");
  const directoryBefore = await lstat(packageDirectory, { bigint: true });
  check(directoryBefore.isDirectory() && !directoryBefore.isSymbolicLink() && await realpath(packageDirectory) === packageDirectory, "package directory must be canonical and link-free");
  const selectionFile = await fixedRead(canonical, 32_768);
  let selection; try { selection = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(selectionFile.bytes)); } catch { check(false, "selection must be UTF-8 JSON"); }
  check(exact(selection, ["schema_version", "package_id", "observed_at", "source_file", "source_sha256", "authorization"]), "selection envelope");
  check(selection.schema_version === SELECTION_VERSION && selection.package_id === packageId && new Date(selection.observed_at).toISOString() === selection.observed_at, "selection identity");
  check(typeof selection.source_file === "string" && selection.source_file === path.basename(selection.source_file) && selection.source_file === "business-bulk.txt" && SHA.test(selection.source_sha256), "source binding");
  check(exact(selection.authorization, ["operator_supplied", "network_acquisition_authorized", "purchase_authorized", "production_admission_authorized", "source_pointer_change_authorized"])
    && selection.authorization.operator_supplied === true && ["network_acquisition_authorized", "purchase_authorized", "production_admission_authorized", "source_pointer_change_authorized"].every(key => selection.authorization[key] === false), "authority boundary");
  check(isDeepStrictEqual((await readdir(packageDirectory)).sort(), ["business-bulk.txt", "selection.json"]), "package must contain exactly selection.json and business-bulk.txt");
  const source = await fixedRead(path.join(packageDirectory, selection.source_file), maximumBytes);
  check(source.sha256 === selection.source_sha256, "source SHA-256 mismatch");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes);
  check(text.endsWith("\n") && !text.includes("\r"), "source must be LF-terminated UTF-8");
  const rows = text.slice(0, -1).split("\n").map(parseLine);
  check(rows.length > 1 && rows.at(-1)[0] === "99" && rows.slice(0, -1).every(row => row[0] !== "99"), "exactly one terminal trailer is required");
  const trailer = rows.at(-1), dataRows = rows.slice(0, -1), counts = Object.fromEntries(Object.keys(EXPECTED_FIELDS).filter(type => type !== "99").map(type => [type, dataRows.filter(row => row[0] === type).length]));
  check(trailer[1] === "9999999999" && /^\d{8}$/.test(trailer[2]), "trailer identity or process date");
  for (let index = 0; index < 18; index += 1) check(/^\d+$/.test(trailer[index + 3]) && Number(trailer[index + 3]) === counts[String(index + 1).padStart(2, "0")], `trailer count for record ${String(index + 1).padStart(2, "0")}`);
  const [selectionAfter, sourceAfter, directoryAfter] = await Promise.all([fixedRead(canonical, 32_768), fixedRead(path.join(packageDirectory, selection.source_file), maximumBytes), lstat(packageDirectory, { bigint: true })]);
  check(selectionAfter.sha256 === selectionFile.sha256 && sourceAfter.sha256 === source.sha256
    && ["dev", "ino", "mtimeNs", "ctimeNs"].every(key => directoryBefore[key] === directoryAfter[key])
    && isDeepStrictEqual((await readdir(packageDirectory)).sort(), ["business-bulk.txt", "selection.json"]), "package changed while validated");
  return { packageId, packageDirectory, selection, selectionSha256: selectionFile.sha256, sourceSha256: source.sha256, sourceBytes: source.bytes.length, rows: dataRows, counts, processDate: trailer[2] };
}

export function projectOkBusinessOrganizations(pkg) {
  const keyed = (type, keyIndex, value) => {
    const result = new Map();
    for (const row of pkg.rows.filter(item => item[0] === type)) { check(row[keyIndex] && !result.has(row[keyIndex]), `duplicate ${type} key`); result.set(row[keyIndex], value(row)); }
    return result;
  };
  const addresses = keyed("02", 1, row => row), statuses = keyed("11", 1, row => row[2]), types = keyed("12", 1, row => row[2]);
  const filings = new Set();
  return pkg.rows.filter(row => row[0] === "01").map(row => {
    check(row[1] && !filings.has(row[1]) && row[5], "missing or duplicate entity identity"); filings.add(row[1]);
    const address = addresses.get(row[4]);
    const zip5 = address ? clean(address[6]?.trim()) : null, zip4 = address ? clean(address[7]?.trim()) : null;
    check(zip5 === null || /^\d{5}$/.test(zip5), "address ZIP5 must contain exactly five digits");
    check(zip4 === null || /^\d{4}$/.test(zip4), "address ZIP4 must contain exactly four digits");
    return {
      schema_version: "ok-business-registry-organization@1.0.0",
      normalized_record_id: `ok-sos:${row[1]}`,
      organization_name: row[5], filing_number: row[1], entity_type_code: row[3], entity_type_label: clean(types.get(row[3]) ?? ""),
      registry_status_code: row[2], registry_status_label: clean(statuses.get(row[2]) ?? ""), formation_date: clean(row[10]), inactive_date: clean(row[9]),
      administrative_address: address ? { address1: clean(address[2]), address2: clean(address[3]), city: clean(address[4]), state: clean(address[5]), zip5, zip4, country: clean(address[8]), scope: "source-entity-address-not-verified-physical-operating-site" } : null,
      temporal_status: "source-registry-status-not-independent-proof-of-current-operation",
      provenance: { source_id: "ok-sos-business-entities-bulk", package_id: pkg.packageId, source_sha256: pkg.sourceSha256, observed_at: pkg.selection.observed_at, process_date_raw: pkg.processDate, source_record_type: "01" },
      export_policy: "local-review-only",
    };
  });
}

export async function buildOkBusinessBulkOffline({ selectionPath, outputDirectory }) {
  check(path.isAbsolute(outputDirectory), "output directory must be absolute");
  outputDirectory = path.resolve(outputDirectory);
  const relative = path.relative(APP_ROOT, outputDirectory);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "output must remain inside datahub");
  check(await realpath(path.dirname(outputDirectory)) === path.dirname(outputDirectory), "output parent must be canonical and link-free");
  const pkg = await readOkBusinessBulkPackage(selectionPath), records = projectOkBusinessOrganizations(pkg);
  await mkdir(outputDirectory, { recursive: false });
  const recordsBytes = Buffer.from(records.map(row => JSON.stringify(row)).join("\n") + (records.length ? "\n" : ""));
  await writeFile(path.join(outputDirectory, "organizations.jsonl"), recordsBytes, { flag: "wx" });
  const receipt = { schema_version: OK_BUSINESS_BULK_OFFLINE_VERSION, status: "SUCCEEDED", package_id: pkg.packageId, selection_sha256: pkg.selectionSha256, source_sha256: pkg.sourceSha256, source_bytes: pkg.sourceBytes, source_record_counts: pkg.counts, projected_organization_count: records.length, organizations_sha256: sha256(recordsBytes), network_requests: 0, acquisition_performed: false, purchase_performed: false, source_pointer_changed: false, national_admission_performed: false, physical_site_claim: false, current_operation_claim: false, export_policy: "local-review-only" };
  await writeFile(path.join(outputDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receipt;
}
