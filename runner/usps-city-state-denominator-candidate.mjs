import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, readdir, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";
import { verifyCityStateAdmission } from "./usps-city-state-admission.mjs";

export const CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA = "usps-city-state-operational-denominator-candidate@1.0.0";
export const CITY_STATE_DENOMINATOR_DATASET_ID = "usps-city-state-operational-denominator-candidate";
export const CITY_STATE_DENOMINATOR_SOURCE_PROFILE = "config/source-profiles/usps-city-state-operational-denominator.json";
export const CITY_STATE_DENOMINATOR_POLICY_PROFILE = "config/source-policies/usps-city-state-operational-denominator-candidate.json";
export const CITY_STATE_DENOMINATOR_DATASET_PROFILE = "config/datasets/usps-city-state-operational-denominator-candidate.json";
export const CITY_STATE_DENOMINATOR_CONNECTOR_PROFILE = "config/connectors/usps-city-state-operational-denominator-candidate.json";
export const CITY_STATE_DENOMINATOR_ROW_SCHEMA = "usps-city-state-operational-denominator-row@1.0.0";
export const CITY_STATE_DENOMINATOR_TRANSFORMATION_VERSION = CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA;
export const CITY_STATE_DENOMINATOR_ASSIGNMENT_STATUS = "usps-city-state-included";
export const CITY_STATE_DENOMINATOR_EVIDENCE_SCOPE = "usps-city-state-source-reported-zip5-assignment";
export const CITY_STATE_DENOMINATOR_DELIVERABILITY_STATUS = "not-asserted";
export const CITY_STATE_DENOMINATOR_ZCTA_STATUS = "not-asserted";
export const CITY_STATE_DENOMINATOR_POLICY_ID = "usps-city-state-operational-denominator-candidate";
const ZIP_CLASSES = ["standard", "po-box", "unique", "military"];
const MAX_BYTES = 50 * 1024 * 1024;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function json(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sameJson(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function token(value, label) {
  const result = String(value ?? "").trim();
  if (!TOKEN.test(result)) throw new Error(`${label} is missing or invalid.`);
  return result;
}
function contained(candidate, label) {
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${label} path is required.`);
  const absolute = path.resolve(candidate);
  assertInsideApp(absolute);
  return absolute;
}

async function ensureOutputRoot(root) {
  const dataRoot = path.join(APP_ROOT, "data");
  const relativeToData = path.relative(dataRoot, root);
  if (relativeToData.startsWith("..") || path.isAbsolute(relativeToData)) throw new Error("Candidate output root must be beneath the data folder.");
  if (relativeToData.split(path.sep).includes("worktrees")) throw new Error("Candidate output root may not be inside data/worktrees.");
  let probe = root;
  while (true) {
    try {
      const canonical = await realpath(probe);
      const relative = path.relative(APP_ROOT, canonical);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Candidate output root resolves outside the datahub folder.");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(probe);
      if (parent === probe) throw new Error("Candidate output root has no canonical datahub ancestor.");
      probe = parent;
    }
  }
}
function identity(info) {
  return `${String(info.dev)}:${String(info.ino)}:${String(info.size)}:${String(info.mtimeNs ?? info.mtimeMs)}`;
}

async function stableFileRead(filePath, label, maxBytes = MAX_BYTES) {
  const absolute = contained(filePath, label);
  const pathBefore = await lstat(absolute, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1n) throw new Error(`${label} must be one regular, non-linked file.`);
  if (pathBefore.size < 1n || pathBefore.size > BigInt(maxBytes)) throw new Error(`${label} bytes must be between 1 and ${maxBytes}.`);
  if (await realpath(absolute) !== absolute) throw new Error(`${label} path must be canonical.`);
  const handle = await open(absolute, "r");
  try {
    const handleBefore = await handle.stat({ bigint: true });
    if (!handleBefore.isFile() || handleBefore.isSymbolicLink() || handleBefore.nlink !== 1n || identity(pathBefore) !== identity(handleBefore)) throw new Error(`${label} changed before the read.`);
    const bytes = await handle.readFile();
    const handleAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(absolute, { bigint: true });
    if (identity(pathBefore) !== identity(handleBefore) || identity(handleBefore) !== identity(handleAfter) || identity(pathBefore) !== identity(pathAfter)) throw new Error(`${label} changed during the read.`);
    if (BigInt(bytes.length) !== handleBefore.size) throw new Error(`${label} size changed during the read.`);
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error(`${label} must be valid UTF-8.`); }
    return { absolute, bytes: bytes.length, sha256: sha256(bytes), buffer: bytes, text, identity: identity(handleAfter) };
  } finally { await handle.close(); }
}

function normalizeMapping(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Status mapping must be an object.");
  const semanticsReference = token(value.semantics_reference, "Status mapping semantics_reference");
  if (Object.keys(value).some((key) => !["semantics_reference", "statuses"].includes(key)) || !value.statuses || typeof value.statuses !== "object" || Array.isArray(value.statuses)) {
    throw new Error("Status mapping must contain only semantics_reference and statuses.");
  }
  const statuses = {};
  for (const status of Object.keys(value.statuses).sort()) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(status)) throw new Error(`Status mapping has an invalid status token ${status}.`);
    const item = value.statuses[status];
    if (!item || typeof item !== "object" || Array.isArray(item) || !["included", "excluded"].includes(item.disposition)) throw new Error(`Status ${status} must map to included or excluded.`);
    const meaning = String(item.meaning ?? "").trim();
    const reason = String(item.reason ?? "").trim();
    if (meaning.length < 8 || reason.length < 8) throw new Error(`Status ${status} requires a non-secret meaning and reason.`);
    statuses[status] = { disposition: item.disposition, meaning, reason };
  }
  if (!Object.keys(statuses).length) throw new Error("Status mapping must contain at least one status.");
  return { semantics_reference: semanticsReference, statuses };
}

function parseRows(text, label) {
  if (text.includes("\0")) throw new Error(`${label} must be UTF-8 JSON Lines.`);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`${label} has no rows.`);
  const rows = [];
  const countsByClass = Object.fromEntries(ZIP_CLASSES.map((value) => [value, 0]));
  const countsByStatus = {};
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    let row;
    try { row = JSON.parse(lines[index]); } catch { throw new Error(`${label} row ${index + 1} is not JSON.`); }
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join(",") !== "status,zip5,zip_class") throw new Error(`${label} row ${index + 1} must contain only zip5, zip_class, and status.`);
    if (typeof row.zip5 !== "string" || !/^\d{5}$/.test(row.zip5)) throw new Error(`${label} row ${index + 1} has an invalid string ZIP5.`);
    if (!ZIP_CLASSES.includes(row.zip_class)) throw new Error(`${label} row ${index + 1} has an unsupported ZIP class.`);
    if (typeof row.status !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(row.status)) throw new Error(`${label} row ${index + 1} has an invalid status token.`);
    if (seen.has(row.zip5)) throw new Error(`${label} contains duplicate ZIP5 ${row.zip5}.`);
    seen.add(row.zip5);
    countsByClass[row.zip_class] += 1;
    countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
    rows.push({ zip5: row.zip5, zip_class: row.zip_class, status: row.status });
  }
  return { rows, row_count: rows.length, unique_zip5_count: seen.size, counts_by_class: countsByClass, counts_by_status: countsByStatus };
}

function conservation(parsed) {
  const result = { row_count: parsed.row_count, unique_zip5_count: parsed.unique_zip5_count, counts_by_class: parsed.counts_by_class, counts_by_status: parsed.counts_by_status };
  if (parsed.excluded_by_status) result.excluded_by_status = parsed.excluded_by_status;
  return result;
}

function candidateRows(parsed, mapping, context) {
  const countsByClass = Object.fromEntries(ZIP_CLASSES.map((value) => [value, 0]));
  const countsByStatus = {};
  const rows = [];
  const excludedByStatus = {};
  for (const row of parsed.rows) {
    const mapped = mapping.statuses[row.status];
    if (!mapped) throw new Error(`Observed status ${row.status} has no explicit mapping.`);
    if (mapped.disposition === "excluded") {
      excludedByStatus[row.status] = (excludedByStatus[row.status] ?? 0) + 1;
      continue;
    }
    rows.push({
      schema_version: CITY_STATE_DENOMINATOR_ROW_SCHEMA,
      zip_code: row.zip5,
      postal_code: row.zip5,
      zip4: null,
      zip_class: row.zip_class,
      source_status: row.status,
      assignment_status: CITY_STATE_DENOMINATOR_ASSIGNMENT_STATUS,
      evidence_scope: CITY_STATE_DENOMINATOR_EVIDENCE_SCOPE,
      deliverability_status: CITY_STATE_DENOMINATOR_DELIVERABILITY_STATUS,
      zcta_status: CITY_STATE_DENOMINATOR_ZCTA_STATUS,
      source_month: context.source_month,
      source_version: context.source_version,
      observed_at: context.observed_at,
      created_at: context.created_at,
      export_policy: "local-restricted",
      provenance: {
        admission_id: context.admission_id,
        source_artifact_sha256: context.source_artifact_sha256,
        status_mapping_sha256: context.status_mapping_sha256,
        status_mapping_semantics_reference: mapping.semantics_reference,
        transformation_version: CITY_STATE_DENOMINATOR_TRANSFORMATION_VERSION,
        policy_id: CITY_STATE_DENOMINATOR_POLICY_ID,
      },
    });
    countsByClass[row.zip_class] += 1;
    countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
  }
  for (const zipClass of ZIP_CLASSES) if (!countsByClass[zipClass]) throw new Error(`Complete candidate requires included rows for ZIP class ${zipClass}.`);
  return { rows, row_count: rows.length, unique_zip5_count: rows.length, counts_by_class: countsByClass, counts_by_status: countsByStatus, excluded_by_status: excludedByStatus };
}

function allClassesIncluded(manifest) {
  const declaration = manifest.zip_class_declaration;
  if (!declaration || typeof declaration !== "object") throw new Error("Admission has no ZIP class declaration.");
  for (const zipClass of ZIP_CLASSES) if (declaration[zipClass]?.disposition !== "included") throw new Error(`Complete candidate requires admission class ${zipClass} to be included.`);
  if (Object.keys(declaration).some((key) => !ZIP_CLASSES.includes(key))) throw new Error("Admission ZIP class declaration has unsupported classes.");
  return declaration;
}

async function loadProfile(profilePath) {
  const profile = JSON.parse((await stableFileRead(profilePath, "Source profile", 2 * 1024 * 1024)).text);
  return validateSourceProfile(profile);
}

function validateSourceProfile(profile) {
  if (profile.profile_id !== "usps-city-state-operational-denominator" || profile.dataset_id !== CITY_STATE_DENOMINATOR_DATASET_ID || profile.source_product !== "USPS City State Product" || profile.not_area_or_district !== true || profile.network_requests !== 0 || profile.production_admitted !== false) throw new Error("Source profile is not the bounded City State denominator profile.");
  return profile;
}

function validateConnector(value) {
  if (value.connector_id !== "usps-city-state-operational-denominator-candidate" || value.version !== "1.0.0" || value.implementation_status !== "offline-local-candidate-only" || !Array.isArray(value.allowed_hosts) || value.allowed_hosts.length !== 0 || !Array.isArray(value.named_secret_references) || value.named_secret_references.length !== 0 || value.execution_limits?.network_requests !== 0 || value.source_policy !== CITY_STATE_DENOMINATOR_POLICY_PROFILE || value.source_profile !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE) throw new Error("Connector profile is not the bounded offline City State candidate contract.");
  return value;
}

function validateDataset(value) {
  const expectedFields = ["schema_version", "zip_code", "postal_code", "zip4", "zip_class", "source_status", "assignment_status", "evidence_scope", "deliverability_status", "zcta_status", "source_month", "source_version", "observed_at", "created_at", "export_policy", "provenance"];
  if (value.dataset_id !== CITY_STATE_DENOMINATOR_DATASET_ID || value.version !== "1.0.0" || value.source_profile !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE || value.policy_profile !== CITY_STATE_DENOMINATOR_POLICY_PROFILE || value.current_pointer !== false || value.production_admission !== false || value.network_requests !== 0 || value.zip4 !== "separate field absent" || value.zcta_geometry !== "absent" || value.record_schema !== CITY_STATE_DENOMINATOR_ROW_SCHEMA || !sameJson(value.record_fields, expectedFields)) throw new Error("Dataset profile is not the bounded City State candidate contract.");
  return value;
}

function validatePolicy(value) {
  if (value.policy_id !== "usps-city-state-operational-denominator-candidate" || value.version !== "1.0.0" || value.dataset_id !== CITY_STATE_DENOMINATOR_DATASET_ID || value.source_product !== "USPS City State Product" || value.not_area_or_district !== true || value.redistribution !== "not authorized" || !Array.isArray(value.prohibited_use) || !value.prohibited_use.includes("relabeling as Area or District")) throw new Error("Policy profile is not the bounded offline City State candidate policy.");
  return value;
}

async function loadConfigDependency(relativePath, label, validator) {
  const absolute = contained(path.join(APP_ROOT, relativePath), label);
  const read = await stableFileRead(absolute, label, 2 * 1024 * 1024);
  const value = validator(JSON.parse(read.text));
  return { path: relativePath, bytes: read.bytes, sha256: read.sha256, value };
}

async function loadConfigDependencies() {
  return {
    connector: await loadConfigDependency(CITY_STATE_DENOMINATOR_CONNECTOR_PROFILE, "Candidate connector profile", validateConnector),
    dataset: await loadConfigDependency(CITY_STATE_DENOMINATOR_DATASET_PROFILE, "Candidate dataset profile", validateDataset),
    policy: await loadConfigDependency(CITY_STATE_DENOMINATOR_POLICY_PROFILE, "Candidate policy profile", validatePolicy),
    source: await loadConfigDependency(CITY_STATE_DENOMINATOR_SOURCE_PROFILE, "Candidate source profile", validateSourceProfile),
  };
}

function dependencyPin(dependency) { return { path: dependency.path, bytes: dependency.bytes, sha256: dependency.sha256 }; }

function dependencyPins(dependencies) {
  return Object.fromEntries(Object.entries(dependencies).map(([key, value]) => [key, dependencyPin(value)]));
}

async function verifyConfigDependencies(pins) {
  if (!pins || typeof pins !== "object" || Object.keys(pins).sort().join(",") !== "connector,dataset,policy,source") throw new Error("Candidate config dependency pins are incomplete.");
  const dependencies = await loadConfigDependencies();
  for (const key of Object.keys(dependencies)) {
    const pin = pins[key];
    const current = dependencies[key];
    if (!pin || pin.path !== current.path || pin.bytes !== current.bytes || pin.sha256 !== current.sha256) throw new Error(`Candidate config dependency ${key} drifted from its pinned bytes or SHA-256.`);
  }
  return dependencies;
}

async function writeExclusive(filePath, buffer) {
  const handle = await open(filePath, "wx");
  try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
}

async function publishAtomic(directory, name, buffer) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  await writeExclusive(temporary, buffer);
  try { await rename(temporary, path.join(directory, name)); } finally { await unlink(temporary).catch(() => {}); }
}

async function artifactInfo(filePath, label) {
  const read = await stableFileRead(filePath, label, 200 * 1024 * 1024);
  return { path: relativeToApp(read.absolute), bytes: read.bytes, sha256: read.sha256, identity: read.identity };
}

function expectedCandidateId(sourceMonth, sourceSha, mappingSha) { return `usps-city-state-operational-denominator-${sourceMonth}-${sourceSha.slice(0, 16)}-${mappingSha.slice(0, 12)}`; }

export async function verifyCityStateDenominatorCandidate(manifestPath, options = {}) {
  const manifestRead = await stableFileRead(manifestPath, "Candidate manifest", 4 * 1024 * 1024);
  const manifest = JSON.parse(manifestRead.text);
  if (manifest.schema !== CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA || manifest.dataset_id !== CITY_STATE_DENOMINATOR_DATASET_ID || manifest.status !== "candidate-local-restricted") throw new Error("Unsupported City State denominator candidate manifest.");
  if (manifest.export_policy !== "local-restricted" || manifest.current_pointer_written !== false || manifest.production_admitted !== false || manifest.redistribution_authorized !== false || manifest.network_requests !== 0 || manifest.downloaded_bytes !== 0) throw new Error("Candidate publication boundary is invalid.");
  if (manifest.semantics?.zip4 !== "separate-not-present" || manifest.semantics?.zcta !== "separate-not-present" || manifest.semantics?.address_deliverability !== "not-asserted" || manifest.semantics?.not_area_or_district !== true) throw new Error("Candidate postal semantics are invalid.");
  if (manifest.policy_profile !== CITY_STATE_DENOMINATOR_POLICY_PROFILE || manifest.source_profile !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE || manifest.dataset_profile !== CITY_STATE_DENOMINATOR_DATASET_PROFILE) throw new Error("Candidate profiles are not the bounded separate profiles.");
  const configDependencies = await verifyConfigDependencies(manifest.config_dependencies);
  const admissionPath = contained(options.admissionManifestPath ?? path.join(APP_ROOT, manifest.dependencies.admission_manifest.path), "Admission manifest");
  const inputPath = contained(options.inputPath ?? path.join(APP_ROOT, manifest.source.artifact.path), "Operator-managed City State JSONL");
  const mappingPath = contained(options.statusMappingPath ?? path.join(APP_ROOT, manifest.status_mapping.path), "Status mapping");
  const admissionRaw = await stableFileRead(admissionPath, "Admission manifest", 4 * 1024 * 1024);
  const admission = JSON.parse(admissionRaw.text);
  await verifyCityStateAdmission(admissionPath);
  allClassesIncluded(admission);
  const source = await stableFileRead(inputPath, "Operator-managed City State JSONL");
  const mappingRead = await stableFileRead(mappingPath, "Status mapping", 2 * 1024 * 1024);
  const mapping = normalizeMapping(JSON.parse(mappingRead.text));
  const profilePath = contained(options.sourceProfilePath ?? path.join(APP_ROOT, CITY_STATE_DENOMINATOR_SOURCE_PROFILE), "Source profile");
  const profileRead = await stableFileRead(profilePath, "Source profile", 2 * 1024 * 1024);
  await loadProfile(profilePath);
  if (relativeToApp(profilePath) !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE || manifest.dependencies.source_profile !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE || profileRead.sha256 !== manifest.dependencies.source_profile_sha256 || profileRead.bytes !== manifest.dependencies.source_profile_bytes || profileRead.sha256 !== configDependencies.source.sha256 || profileRead.bytes !== configDependencies.source.bytes) throw new Error("Candidate source profile identity does not match the verified profile.");
  const parsed = parseRows(source.text, "Operator-managed City State JSONL");
  if (source.sha256 !== admission.source_artifact.sha256 || source.bytes !== admission.source_artifact.bytes) throw new Error("Operator-managed JSONL does not exactly match the verified admission source artifact.");
  if (source.sha256 !== manifest.source.artifact.sha256 || source.bytes !== manifest.source.artifact.bytes || admissionRaw.sha256 !== manifest.dependencies.admission_manifest.sha256 || admissionRaw.bytes !== manifest.dependencies.admission_manifest.bytes || mappingRead.sha256 !== manifest.status_mapping.sha256 || mappingRead.bytes !== manifest.status_mapping.bytes || manifest.status_mapping.semantics_reference !== mapping.semantics_reference) throw new Error("Candidate dependency identity does not match the verified replay inputs.");
  if (!sameJson(conservation(parsed), admission.conservation)) throw new Error("Reparsed source conservation does not match the admission manifest.");
  if (!sameJson(conservation(parsed), manifest.observed_conservation)) throw new Error("Candidate observed conservation does not match the source replay.");
  for (const status of Object.keys(parsed.counts_by_status)) if (!mapping.statuses[status]) throw new Error(`Observed status ${status} has no explicit mapping.`);
  const selected = candidateRows(parsed, mapping, {
    source_month: admission.source_month,
    source_version: admission.source_version,
    observed_at: admission.created_at,
    created_at: manifest.created_at,
    admission_id: admission.admission_id,
    source_artifact_sha256: source.sha256,
    status_mapping_sha256: mappingRead.sha256,
  });
  if (!sameJson(conservation(selected), manifest.candidate_conservation)) throw new Error("Candidate conservation does not match the source replay and status mapping.");
  if (manifest.source.product !== "USPS City State Product" || manifest.source.source_month !== admission.source_month || manifest.source.source_version !== admission.source_version || manifest.dependencies.admission_manifest.admission_id !== admission.admission_id) throw new Error("Candidate source identity does not match the verified admission.");
  const expectedId = expectedCandidateId(admission.source_month, source.sha256, mappingRead.sha256);
  if (manifest.release_id !== expectedId) throw new Error("Candidate release identity mismatch.");
  const artifactPath = contained(path.join(path.dirname(manifestRead.absolute), manifest.artifacts?.[0]?.path ?? ""), "Candidate artifact");
  const artifact = await artifactInfo(artifactPath, "Candidate artifact");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2 || manifest.artifacts[0].path !== "zip5-operational-denominator.jsonl" || manifest.artifacts[1].path !== "receipt.json" || artifact.bytes !== manifest.artifacts[0].bytes || artifact.sha256 !== manifest.artifacts[0].sha256) throw new Error("Candidate artifact size or SHA-256 or membership is invalid.");
  const artifactParsed = parseCandidateArtifact((await stableFileRead(artifactPath, "Candidate artifact", 200 * 1024 * 1024)).text, selected.excluded_by_status, {
    source_month: admission.source_month,
    source_version: admission.source_version,
    observed_at: admission.created_at,
    created_at: manifest.created_at,
    admission_id: admission.admission_id,
    source_artifact_sha256: source.sha256,
    status_mapping_sha256: mappingRead.sha256,
    semantics_reference: mapping.semantics_reference,
  });
  if (!sameJson(artifactParsed.rows, selected.rows) || !sameJson(conservation(artifactParsed), conservation(selected))) throw new Error("Candidate artifact rows do not match the independently replayed selection.");
  const releaseFiles = (await readdir(path.dirname(manifestRead.absolute))).sort();
  if (!sameJson(releaseFiles, ["manifest.json", "receipt.json", "zip5-operational-denominator.jsonl"])) throw new Error("Candidate release contains undeclared or missing files.");
  const receiptPath = path.join(path.dirname(manifestRead.absolute), "receipt.json");
  const receipt = await stableFileRead(receiptPath, "Candidate receipt", 4 * 1024 * 1024);
  if (receipt.bytes !== manifest.artifacts[1].bytes || receipt.sha256 !== manifest.artifacts[1].sha256) throw new Error("Candidate receipt size or SHA-256 mismatch.");
  const receiptValue = JSON.parse(receipt.text);
  if (receiptValue.schema !== CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA || receiptValue.release_id !== manifest.release_id || receiptValue.created_at !== manifest.created_at || !sameJson(receiptValue.candidate_conservation, conservation(selected)) || !sameJson(receiptValue.observed_conservation, conservation(parsed)) || !sameJson(receiptValue.status_mapping, manifest.status_mapping) || !sameJson(receiptValue.config_dependencies, manifest.config_dependencies) || receiptValue.export_policy !== manifest.export_policy || receiptValue.current_pointer_written !== false || receiptValue.production_admitted !== false || receiptValue.redistribution_authorized !== false) throw new Error("Candidate receipt does not match the verified manifest and replay.");
  return { release_id: manifest.release_id, source_month: admission.source_month, candidate_conservation: conservation(selected), export_policy: manifest.export_policy };
}

function parseCandidateArtifact(text, excludedByStatus = {}, context) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = [];
  const countsByClass = Object.fromEntries(ZIP_CLASSES.map((value) => [value, 0]));
  const countsByStatus = {};
  const seen = new Set();
  for (const line of lines) {
    const row = JSON.parse(line);
    const expectedKeys = ["assignment_status", "created_at", "deliverability_status", "evidence_scope", "export_policy", "observed_at", "postal_code", "provenance", "schema_version", "source_month", "source_status", "source_version", "zip4", "zip_class", "zip_code", "zcta_status"].sort().join(",");
    const invalid = !row || Object.keys(row).sort().join(",") !== expectedKeys || row.schema_version !== CITY_STATE_DENOMINATOR_ROW_SCHEMA || typeof row.zip_code !== "string" || !/^\d{5}$/.test(row.zip_code) || row.postal_code !== row.zip_code || row.zip4 !== null || !ZIP_CLASSES.includes(row.zip_class) || typeof row.source_status !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(row.source_status) || row.assignment_status !== CITY_STATE_DENOMINATOR_ASSIGNMENT_STATUS || row.evidence_scope !== CITY_STATE_DENOMINATOR_EVIDENCE_SCOPE || row.deliverability_status !== CITY_STATE_DENOMINATOR_DELIVERABILITY_STATUS || row.zcta_status !== CITY_STATE_DENOMINATOR_ZCTA_STATUS || row.source_month !== context.source_month || row.source_version !== context.source_version || row.observed_at !== context.observed_at || row.created_at !== context.created_at || row.export_policy !== "local-restricted";
    if (invalid) throw new Error("Candidate artifact row is invalid or has mismatched source context.");
    const expectedProvenance = { admission_id: context.admission_id, source_artifact_sha256: context.source_artifact_sha256, status_mapping_sha256: context.status_mapping_sha256, status_mapping_semantics_reference: context.semantics_reference, transformation_version: CITY_STATE_DENOMINATOR_TRANSFORMATION_VERSION, policy_id: CITY_STATE_DENOMINATOR_POLICY_ID };
    if (!sameJson(row.provenance, expectedProvenance)) throw new Error("Candidate artifact row provenance is invalid or mismatched.");
    if (seen.has(row.zip_code)) throw new Error(`Candidate artifact contains duplicate ZIP5 ${row.zip_code}.`);
    seen.add(row.zip_code); rows.push(row); countsByClass[row.zip_class] += 1; countsByStatus[row.source_status] = (countsByStatus[row.source_status] ?? 0) + 1;
  }
  return { rows, row_count: rows.length, unique_zip5_count: rows.length, counts_by_class: countsByClass, counts_by_status: countsByStatus, excluded_by_status: excludedByStatus };
}

export async function buildCityStateDenominatorCandidate({ admissionManifestPath, inputPath, statusMappingPath, sourceProfilePath = path.join(APP_ROOT, CITY_STATE_DENOMINATOR_SOURCE_PROFILE), outputRoot = path.join(APP_ROOT, "data/zip-validity/usps-city-state-operational-denominator"), signal, now = () => new Date(), beforeManifest } = {}) {
  if (signal?.aborted) throw new Error("City State denominator candidate cancelled before validation.");
  const admissionAbsolute = contained(admissionManifestPath, "Admission manifest");
  const inputAbsolute = contained(inputPath, "Operator-managed City State JSONL");
  const mappingAbsolute = contained(statusMappingPath, "Status mapping");
  const profileAbsolute = contained(sourceProfilePath, "Source profile");
  const admissionRead = await stableFileRead(admissionAbsolute, "Admission manifest", 4 * 1024 * 1024);
  const admission = JSON.parse(admissionRead.text);
  await verifyCityStateAdmission(admissionAbsolute);
  allClassesIncluded(admission);
  if (relativeToApp(profileAbsolute) !== CITY_STATE_DENOMINATOR_SOURCE_PROFILE) throw new Error("Candidate source profile must use the bounded City State profile path.");
  const configDependencies = await loadConfigDependencies();
  const profile = configDependencies.source.value;
  const profileRead = { bytes: configDependencies.source.bytes, sha256: configDependencies.source.sha256 };
  const source = await stableFileRead(inputAbsolute, "Operator-managed City State JSONL");
  const mappingRead = await stableFileRead(mappingAbsolute, "Status mapping", 2 * 1024 * 1024);
  const mapping = normalizeMapping(JSON.parse(mappingRead.text));
  const parsed = parseRows(source.text, "Operator-managed City State JSONL");
  if (source.sha256 !== admission.source_artifact.sha256 || source.bytes !== admission.source_artifact.bytes) throw new Error("Operator-managed JSONL does not exactly match the verified admission source artifact.");
  if (!sameJson(conservation(parsed), admission.conservation)) throw new Error("Reparsed source conservation does not match the admission manifest.");
  if (Object.keys(parsed.counts_by_status).some((status) => !mapping.statuses[status])) throw new Error("Every observed source status requires an explicit mapping.");
  if (Object.keys(mapping.statuses).some((status) => !parsed.counts_by_status[status])) throw new Error("Status mapping contains an unobserved status.");
  const createdAt = now().toISOString();
  const selected = candidateRows(parsed, mapping, {
    source_month: admission.source_month,
    source_version: admission.source_version,
    observed_at: admission.created_at,
    created_at: createdAt,
    admission_id: admission.admission_id,
    source_artifact_sha256: source.sha256,
    status_mapping_sha256: mappingRead.sha256,
  });
  const releaseId = expectedCandidateId(admission.source_month, source.sha256, mappingRead.sha256);
  const root = contained(outputRoot, "Candidate output root");
  await ensureOutputRoot(root);
  const releases = path.join(root, "releases");
  const stagingRoot = path.join(root, ".staging");
  const staging = path.join(stagingRoot, `${releaseId}-${randomUUID()}`);
  const releaseDirectory = path.join(releases, releaseId);
  if (path.relative(root, releaseDirectory).startsWith("..")) throw new Error("Candidate release escapes its output root.");
  try { await lstat(releaseDirectory); throw new Error("Candidate release already exists; immutable output will not be overwritten."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (signal?.aborted) throw new Error("City State denominator candidate cancelled during validation.");
  await mkdir(releases, { recursive: true });
  await mkdir(staging, { recursive: true });
  try {
    const candidateBody = `${selected.rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
    await writeExclusive(path.join(staging, "zip5-operational-denominator.jsonl"), Buffer.from(candidateBody));
    const receipt = {
      schema: CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA, release_id: releaseId, status: "validated",
      created_at: createdAt, source: { product: "USPS City State Product", source_month: admission.source_month, source_version: admission.source_version, bytes: source.bytes, sha256: source.sha256 },
      admission_manifest: { path: relativeToApp(admissionAbsolute), bytes: admissionRead.bytes, sha256: admissionRead.sha256, admission_id: admission.admission_id },
      status_mapping: { path: relativeToApp(mappingAbsolute), bytes: mappingRead.bytes, sha256: mappingRead.sha256, semantics_reference: mapping.semantics_reference, statuses: mapping.statuses },
      config_dependencies: dependencyPins(configDependencies),
      source_profile: { path: relativeToApp(profileAbsolute), bytes: profileRead.bytes, sha256: profileRead.sha256, profile_id: profile.profile_id },
      observed_conservation: conservation(parsed), candidate_conservation: conservation(selected),
      semantics: { zip5: "operational-code-projection-only", zip4: "separate-not-present", zcta: "separate-not-present", address_deliverability: "not-asserted", postal_operation: "not-asserted", not_area_or_district: true },
      export_policy: "local-restricted", network_requests: 0, downloaded_bytes: 0, current_pointer_written: false, production_admitted: false, redistribution_authorized: false,
    };
    const receiptBuffer = Buffer.from(json(receipt));
    await publishAtomic(staging, "receipt.json", receiptBuffer);
    const artifactBefore = await artifactInfo(path.join(staging, "zip5-operational-denominator.jsonl"), "Candidate artifact");
    if (beforeManifest) await beforeManifest({ staging, releaseId });
    if (signal?.aborted) throw new Error("City State denominator candidate cancelled before manifest publication.");
    const artifactAfter = await artifactInfo(path.join(staging, "zip5-operational-denominator.jsonl"), "Candidate artifact");
    if (!sameJson(artifactBefore, artifactAfter)) throw new Error("Candidate artifact changed before manifest publication.");
    const manifest = {
      schema: CITY_STATE_DENOMINATOR_CANDIDATE_SCHEMA, dataset_id: CITY_STATE_DENOMINATOR_DATASET_ID, release_id: releaseId, status: "candidate-local-restricted", created_at: receipt.created_at,
      source: { product: "USPS City State Product", source_month: admission.source_month, source_version: admission.source_version, artifact: { path: relativeToApp(inputAbsolute), bytes: source.bytes, sha256: source.sha256, retained_by_release: false } },
      dependencies: { admission_manifest: { path: relativeToApp(admissionAbsolute), bytes: admissionRead.bytes, sha256: admissionRead.sha256, admission_id: admission.admission_id }, source_profile: CITY_STATE_DENOMINATOR_SOURCE_PROFILE, source_profile_bytes: profileRead.bytes, source_profile_sha256: profileRead.sha256 },
      status_mapping: { path: relativeToApp(mappingAbsolute), bytes: mappingRead.bytes, sha256: mappingRead.sha256, semantics_reference: mapping.semantics_reference, statuses: mapping.statuses },
      config_dependencies: dependencyPins(configDependencies),
      policy_profile: CITY_STATE_DENOMINATOR_POLICY_PROFILE, source_profile: CITY_STATE_DENOMINATOR_SOURCE_PROFILE, dataset_profile: CITY_STATE_DENOMINATOR_DATASET_PROFILE,
      zip_class_declaration: allClassesIncluded(admission), observed_conservation: conservation(parsed), candidate_conservation: conservation(selected),
      semantics: receipt.semantics, export_policy: "local-restricted", current_pointer_written: false, production_admitted: false, redistribution_authorized: false, network_requests: 0, downloaded_bytes: 0,
      artifacts: [{ path: "zip5-operational-denominator.jsonl", bytes: artifactAfter.bytes, sha256: artifactAfter.sha256, row_unit: "selected unique source ZIP5", export_policy: "local-restricted" }, { path: "receipt.json", bytes: receiptBuffer.length, sha256: sha256(receiptBuffer) }],
      publication: { immutable_non_overwriting_release: true, manifest_last: true, current_pointer_written: false, production_admitted: false },
    };
    await publishAtomic(staging, "manifest.json", Buffer.from(json(manifest)));
    await rename(staging, releaseDirectory);
    try { await verifyCityStateDenominatorCandidate(path.join(releaseDirectory, "manifest.json"), { admissionManifestPath: admissionAbsolute, inputPath: inputAbsolute, statusMappingPath: mappingAbsolute }); }
    catch (error) { await rm(releaseDirectory, { recursive: true, force: true }); throw error; }
    return { releaseId, releaseDirectory, manifestPath: path.join(releaseDirectory, "manifest.json"), manifest };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
