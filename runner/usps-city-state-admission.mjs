import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, rmdir, unlink } from "node:fs/promises";
import path from "node:path";

export const CITY_STATE_ADMISSION_SCHEMA = "usps-city-state-admission@1.0.0";
const ZIP_CLASSES = ["standard", "po-box", "unique", "military"];
const MAX_BYTES = 50 * 1024 * 1024;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function json(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function cleanToken(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/) {
  const result = String(value ?? "").trim();
  if (!pattern.test(result)) throw new Error(`${label} is missing or invalid.`);
  return result;
}

function normalizeDeclaration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ZIP class declaration is required.");
  const extra = Object.keys(value).filter((key) => !ZIP_CLASSES.includes(key));
  if (extra.length) throw new Error(`Unsupported ZIP class declaration: ${extra.join(", ")}.`);
  return Object.fromEntries(ZIP_CLASSES.map((zipClass) => {
    const item = value[zipClass];
    if (!item || !["included", "excluded"].includes(item.disposition)) throw new Error(`ZIP class ${zipClass} must be declared included or excluded.`);
    const reason = item.disposition === "excluded" ? String(item.reason ?? "").trim() : null;
    if (item.disposition === "excluded" && reason.length < 8) throw new Error(`ZIP class ${zipClass} exclusion requires a reason.`);
    return [zipClass, { disposition: item.disposition, reason }];
  }));
}

async function inspectFile(filePath) {
  const absolute = path.resolve(filePath);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("Input must be one regular, non-linked file.");
  if (info.size < 1 || info.size > MAX_BYTES) throw new Error(`Input bytes must be between 1 and ${MAX_BYTES}.`);
  if (await realpath(absolute) !== absolute) throw new Error("Input path must be canonical.");
  const hash = createHash("sha256");
  let bytes = 0;
  let content = "";
  for await (const chunk of createReadStream(absolute)) { bytes += chunk.length; hash.update(chunk); content += chunk.toString("utf8"); }
  return { absolute, bytes, sha256: hash.digest("hex"), content };
}

function parseProjection(content, declaration) {
  if (content.includes("\0")) throw new Error("Projection must be UTF-8 JSON Lines.");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("Projection has no rows.");
  const countsByClass = Object.fromEntries(ZIP_CLASSES.map((value) => [value, 0]));
  const countsByStatus = {};
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    let row;
    try { row = JSON.parse(lines[index]); } catch { throw new Error(`Projection row ${index + 1} is not JSON.`); }
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join(",") !== "status,zip5,zip_class") {
      throw new Error(`Projection row ${index + 1} must contain only zip5, zip_class, and status.`);
    }
    if (!/^\d{5}$/.test(row.zip5)) throw new Error(`Projection row ${index + 1} has an invalid ZIP5.`);
    if (!ZIP_CLASSES.includes(row.zip_class)) throw new Error(`Projection row ${index + 1} has an unsupported ZIP class.`);
    if (declaration[row.zip_class].disposition !== "included") throw new Error(`Projection includes class ${row.zip_class}, but it is declared excluded.`);
    const status = String(row.status ?? "");
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(status)) throw new Error(`Projection row ${index + 1} has an invalid status token.`);
    if (seen.has(row.zip5)) throw new Error(`Projection contains duplicate ZIP5 ${row.zip5}.`);
    seen.add(row.zip5); countsByClass[row.zip_class] += 1; countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
  }
  for (const zipClass of ZIP_CLASSES) if (declaration[zipClass].disposition === "included" && countsByClass[zipClass] === 0) throw new Error(`Declared included ZIP class ${zipClass} has no rows.`);
  return { row_count: lines.length, unique_zip5_count: seen.size, counts_by_class: countsByClass, counts_by_status: countsByStatus };
}

export async function verifyCityStateAdmission(manifestPath) {
  const absolute = path.resolve(manifestPath);
  const raw = await readFile(absolute);
  const manifest = JSON.parse(raw);
  if (manifest.schema !== CITY_STATE_ADMISSION_SCHEMA || manifest.status !== "admitted-local-restricted") throw new Error("Unsupported City State admission manifest.");
  if (manifest.export_policy !== "local-restricted" || manifest.produces_current_pointer !== false || manifest.production_admitted !== false) throw new Error("Admission boundary is invalid.");
  normalizeDeclaration(manifest.zip_class_declaration);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(manifest.source_month) || !manifest.source_version || !manifest.permission_reference) throw new Error("Source identity or permission reference is invalid.");
  const classTotal = Object.values(manifest.conservation?.counts_by_class ?? {}).reduce((sum, value) => sum + value, 0);
  const statusTotal = Object.values(manifest.conservation?.counts_by_status ?? {}).reduce((sum, value) => sum + value, 0);
  if (classTotal !== manifest.conservation?.row_count || statusTotal !== manifest.conservation?.row_count
    || manifest.conservation?.unique_zip5_count !== manifest.conservation?.row_count) throw new Error("Status/type conservation is invalid.");
  if (manifest.semantics?.zip4 !== "separate-not-present" || manifest.semantics?.zcta !== "separate-not-present") throw new Error("ZIP+4/ZCTA separation is invalid.");
  const receiptPath = path.join(path.dirname(absolute), "receipt.json");
  const receiptRaw = await readFile(receiptPath);
  if (receiptRaw.length !== manifest.receipt.bytes || digest(receiptRaw) !== manifest.receipt.sha256) throw new Error("Receipt size or SHA-256 mismatch.");
  const receipt = JSON.parse(receiptRaw);
  if (receipt.schema !== CITY_STATE_ADMISSION_SCHEMA || JSON.stringify(receipt.conservation) !== JSON.stringify(manifest.conservation)
    || receipt.status !== "validated"
    || receipt.source.sha256 !== manifest.source_artifact.sha256 || receipt.source.bytes !== manifest.source_artifact.bytes
    || receipt.source.source_month !== manifest.source_month || receipt.source.source_version !== manifest.source_version
    || receipt.authorization.permission_reference !== manifest.permission_reference
    || JSON.stringify(receipt.zip_class_declaration) !== JSON.stringify(manifest.zip_class_declaration)
    || JSON.stringify(receipt.semantics) !== JSON.stringify(manifest.semantics)
    || receipt.export_policy !== manifest.export_policy || receipt.network_requests !== 0 || receipt.downloaded_bytes !== 0) throw new Error("Receipt and manifest disagree.");
  const expectedId = `usps-city-state-${manifest.source_month}-${manifest.source_artifact.sha256.slice(0, 16)}`;
  if (manifest.admission_id !== expectedId || receipt.admission_id !== expectedId) throw new Error("Admission identity mismatch.");
  return { admission_id: manifest.admission_id, source_month: manifest.source_month, conservation: manifest.conservation, export_policy: manifest.export_policy };
}

async function publishAtomic(directory, name, buffer) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, path.join(directory, name)); } finally { await unlink(temporary).catch(() => {}); }
}

export async function admitCityStateProjection({ inputPath, outputRoot, sourceMonth, sourceVersion, expectedSha256, expectedBytes, permissionReference, zipClassDeclaration, signal, now = () => new Date() } = {}) {
  if (signal?.aborted) throw new Error("City State admission cancelled before validation.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(sourceMonth ?? ""))) throw new Error("sourceMonth must be YYYY-MM.");
  const version = cleanToken(sourceVersion, "sourceVersion");
  const permission = cleanToken(permissionReference, "permissionReference");
  if (!/^[a-f0-9]{64}$/.test(String(expectedSha256 ?? ""))) throw new Error("expectedSha256 must be a lowercase SHA-256.");
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_BYTES) throw new Error("expectedBytes is invalid.");
  const declaration = normalizeDeclaration(zipClassDeclaration);
  const source = await inspectFile(inputPath);
  if (signal?.aborted) throw new Error("City State admission cancelled during validation.");
  if (source.sha256 !== expectedSha256 || source.bytes !== expectedBytes) throw new Error("Operator-provided artifact does not match the declared SHA-256 and bytes.");
  const conservation = parseProjection(source.content, declaration);
  const admissionId = `usps-city-state-${sourceMonth}-${source.sha256.slice(0, 16)}`;
  const root = path.resolve(outputRoot);
  const directory = path.join(root, "admissions", admissionId);
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Admission output escapes its root.");
  try { await lstat(directory); throw new Error("Admission already exists; immutable output will not be overwritten."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const createdAt = now().toISOString();
  const receipt = {
    schema: CITY_STATE_ADMISSION_SCHEMA, admission_id: admissionId, status: "validated",
    created_at: createdAt,
    source: { product: "USPS City State Product", source_month: sourceMonth, source_version: version, bytes: source.bytes, sha256: source.sha256, retained_by_admission: false },
    authorization: { basis: "licensed-usps-city-state-product", permission_reference: permission, credentials_retained: false },
    zip_class_declaration: declaration, conservation,
    semantics: { zip5: "operational-code-projection", zip4: "separate-not-present", zcta: "separate-not-present", address_deliverability: "not-asserted" },
    export_policy: "local-restricted", network_requests: 0, downloaded_bytes: 0,
  };
  const receiptBuffer = Buffer.from(json(receipt));
  const manifest = {
    schema: CITY_STATE_ADMISSION_SCHEMA, admission_id: admissionId, status: "admitted-local-restricted", created_at: createdAt,
    source_month: sourceMonth, source_version: version,
    source_artifact: { bytes: source.bytes, sha256: source.sha256, retained_by_admission: false },
    permission_reference: permission, zip_class_declaration: declaration, conservation,
    semantics: receipt.semantics, export_policy: "local-restricted", produces_current_pointer: false, production_admitted: false,
    role: "governed-prerequisite-admission-artifact",
    receipt: { path: "receipt.json", bytes: receiptBuffer.length, sha256: digest(receiptBuffer) },
  };
  if (signal?.aborted) throw new Error("City State admission cancelled before publication.");
  await mkdir(directory, { recursive: true });
  await publishAtomic(directory, "receipt.json", receiptBuffer);
  try {
    if (signal?.aborted) throw new Error("City State admission cancelled before manifest publication.");
    await publishAtomic(directory, "manifest.json", Buffer.from(json(manifest)));
    await verifyCityStateAdmission(path.join(directory, "manifest.json"));
  } catch (error) {
    await unlink(path.join(directory, "manifest.json")).catch(() => {});
    await unlink(path.join(directory, "receipt.json")).catch(() => {});
    await rmdir(directory).catch(() => {});
    throw error;
  }
  return { admissionId, directory, manifestPath: path.join(directory, "manifest.json"), manifest };
}
