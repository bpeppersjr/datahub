import { createHash } from "node:crypto";
import { readFile, lstat, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, types } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const STATE_SOURCE_CLOSED_PACKAGE_VERSION = "state-source-closed-package@1.0.0";
export const STATE_SOURCE_AUTHORIZATION_REGISTRY_VERSION = "state-source-authorization-registry@1.0.0";
const FILES = ["authorization.json", "manifest.json", "policy.json", "records.jsonl", "schema.json", "source.json"];
const SHA = /^[a-f0-9]{64}$/;
const STATE = /^(?:A[KLZR]|C[AOT]|D[CE]|F[LM]|G[AU]|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/;
const FORBIDDEN_KEYS = /(?:agent|person|owner|officer|manager|member|email|phone|ssn|ein|fein|contact|document|free.?text|geometry|polygon|bbox|__proto__|prototype|constructor)/i;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const check = (value, message) => { if (!value) throw new Error(`Closed state-source package rejected: ${message}.`); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const token = (value, maximum = 200) => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);

async function fixedRead(filename, maximum, { allowEmpty = false, parent } = {}) {
  const canonical = await realpath(filename);
  check(canonical === path.resolve(filename), "input path must be canonical");
  if (parent) {
    const relative = path.relative(parent, canonical);
    check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "input escapes package directory");
  }
  const before = await lstat(filename, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && (allowEmpty || before.size > 0n) && before.size <= BigInt(maximum), "unsafe or oversized input");
  const bytes = await readFile(filename), after = await lstat(filename, { bigint: true });
  check(["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => before[key] === after[key]), "input changed while read");
  return { bytes, sha256: sha256(bytes) };
}

function assertPlainDataTree(value, label, seen = new Set()) {
  check(value === null || ["string", "number", "boolean", "object"].includes(typeof value), `${label} contains a non-data value`);
  if (value === null || typeof value !== "object") return;
  check(!types.isProxy(value), `${label} contains a proxy`);
  check(!seen.has(value), `${label} contains a cycle`); seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  check(Array.isArray(value) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, `${label} has an unsafe prototype`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Object.entries(descriptors).every(([key, descriptor]) => key === "length" && Array.isArray(value) || "value" in descriptor && descriptor.enumerable && descriptor.configurable && descriptor.writable), `${label} contains an accessor or non-JSON property`);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    check(keys.length === value.length && keys.every((key, index) => key === String(index)), `${label} contains a sparse or extended array`);
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== "length") assertPlainDataTree(descriptor.value, label, seen);
  }
  seen.delete(value);
}

function snapshotRegistry(registry) {
  assertPlainDataTree(registry, "authorization registry");
  return JSON.parse(JSON.stringify(registry));
}

function json(read, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.bytes)); }
  catch { throw new Error(`Closed state-source package rejected: invalid ${label} JSON or UTF-8.`); }
}

function validateRegistry(registry) {
  check(exact(registry, ["schema_version", "status", "approved_sources"]), "authorization registry envelope");
  check(registry.schema_version === STATE_SOURCE_AUTHORIZATION_REGISTRY_VERSION && registry.status === "closed" && Array.isArray(registry.approved_sources), "authorization registry");
  for (const entry of registry.approved_sources) {
    check(exact(entry, ["authorization_id", "authorization_sha256", "source_id", "state", "source_sha256", "schema_sha256", "policy_sha256"]), "authorization registry entry envelope");
    check(token(entry.authorization_id) && token(entry.source_id) && STATE.test(entry.state) && [entry.authorization_sha256, entry.source_sha256, entry.schema_sha256, entry.policy_sha256].every(value => SHA.test(value)), "authorization registry entry");
  }
  check(new Set(registry.approved_sources.map(entry => `${entry.state}\0${entry.source_id}\0${entry.authorization_id}`)).size === registry.approved_sources.length, "duplicate authorization registry entry");
}

function validateSource(source) {
  check(exact(source, ["schema_version", "source_id", "state", "publisher", "dataset", "observed_at"]), "source declaration envelope");
  check(source.schema_version === "state-source-declaration@1.0.0" && token(source.source_id) && STATE.test(source.state) && token(source.publisher, 500) && token(source.dataset, 500) && new Date(source.observed_at).toISOString() === source.observed_at, "source declaration");
}

function validateSchema(schema) {
  check(exact(schema, ["schema_version", "schema_id", "fields", "zip5_field", "zip4_field", "latitude_field", "longitude_field", "business_geometry_allowed"]), "schema declaration envelope");
  check(schema.schema_version === "state-source-projection-schema@1.0.0" && token(schema.schema_id) && Array.isArray(schema.fields) && schema.fields.length > 0 && schema.fields.length <= 128 && schema.fields.every(field => token(field, 128)), "projection schema");
  check(new Set(schema.fields).size === schema.fields.length && schema.fields.includes("state") && schema.fields.includes(schema.zip5_field) && schema.fields.includes(schema.zip4_field), "projection field roster");
  check(schema.zip5_field === "zip5" && schema.zip4_field === "zip4" && schema.zip5_field !== schema.zip4_field, "ZIP5 and ZIP4 must be separate canonical fields");
  check(schema.latitude_field === "latitude" && schema.longitude_field === "longitude" && schema.fields.includes("latitude") === schema.fields.includes("longitude"), "coordinate field pair");
  check(schema.business_geometry_allowed === false && schema.fields.every(field => !FORBIDDEN_KEYS.test(field)), "forbidden or geometry field");
}

function validatePolicy(policy) {
  check(exact(policy, ["schema_version", "policy_id", "allowed_use", "retention", "redistribution", "required_exclusions", "business_geometry_allowed", "production_admission_authorized"]), "policy envelope");
  check(policy.schema_version === "state-source-policy@1.0.0" && token(policy.policy_id) && token(policy.allowed_use, 1000) && token(policy.retention, 1000) && token(policy.redistribution, 1000), "source policy");
  const required = ["natural-person data", "registered-agent data", "direct contact data", "sensitive identifiers", "filing documents", "free text"];
  check(Array.isArray(policy.required_exclusions) && required.every(item => policy.required_exclusions.includes(item)), "privacy exclusions");
  check(policy.business_geometry_allowed === false && policy.production_admission_authorized === false, "policy authority boundary");
}

function validateAuthorization(authorization, source, schema, policy) {
  check(exact(authorization, ["schema_version", "authorization_id", "authorized_at", "authorized_by", "source_id", "state", "source_sha256", "schema_sha256", "policy_sha256", "offline_files_authorized", "network_acquisition_authorized", "production_pointer_change_authorized", "broad_layer_admission_authorized"]), "authorization envelope");
  check(authorization.schema_version === "state-source-offline-authorization@1.0.0" && token(authorization.authorization_id) && token(authorization.authorized_by) && new Date(authorization.authorized_at).toISOString() === authorization.authorized_at, "authorization receipt");
  check(authorization.source_id === source.source_id && authorization.state === source.state && authorization.source_sha256 === source.sha256 && authorization.schema_sha256 === schema.sha256 && authorization.policy_sha256 === policy.sha256, "authorization binding");
  check(authorization.offline_files_authorized === true && authorization.network_acquisition_authorized === false && authorization.production_pointer_change_authorized === false && authorization.broad_layer_admission_authorized === false, "authorization boundary");
}

function validateManifest(manifest, artifacts, maximumRecords) {
  check(exact(manifest, ["schema_version", "source_id", "state", "record_count", "artifacts", "claims"]), "manifest envelope");
  check(manifest.schema_version === STATE_SOURCE_CLOSED_PACKAGE_VERSION && token(manifest.source_id) && STATE.test(manifest.state) && Number.isSafeInteger(manifest.record_count) && manifest.record_count >= 0 && manifest.record_count <= maximumRecords, "manifest");
  check(exact(manifest.claims, ["network_requests", "production_pointer_written", "broad_layer_admission_performed", "business_geometry_present", "zip5_zip4_joined"]), "manifest claims");
  check(manifest.claims.network_requests === 0 && manifest.claims.production_pointer_written === false && manifest.claims.broad_layer_admission_performed === false && manifest.claims.business_geometry_present === false && manifest.claims.zip5_zip4_joined === false, "manifest authority claims");
  const names = FILES.filter(name => name !== "manifest.json");
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === names.length && isDeepStrictEqual(manifest.artifacts.map(item => item.path).sort(), names), "closed artifact inventory");
  for (const item of manifest.artifacts) check(exact(item, ["path", "bytes", "sha256"]) && names.includes(item.path) && Number.isSafeInteger(item.bytes) && (item.path === "records.jsonl" ? item.bytes >= 0 : item.bytes > 0) && SHA.test(item.sha256) && artifacts[item.path].bytes.length === item.bytes && artifacts[item.path].sha256 === item.sha256, "artifact binding");
}

function validateRows(bytes, schema, state, expectedCount, maximumLineBytes) {
  check(expectedCount !== 0 || bytes.length === 0, "zero-record package must use an empty records file");
  if (expectedCount === 0) return;
  let lineBytes = 0, lineCount = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) { check(lineBytes > 0, "empty record"); lineCount += 1; lineBytes = 0; }
    else { lineBytes += 1; check(lineBytes <= maximumLineBytes, "record line byte ceiling"); }
  }
  check(lineBytes === 0 && lineCount === expectedCount, "record count or LF termination");
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  check(!decoded.includes("\r") && decoded.endsWith("\n"), "records must be LF-terminated UTF-8 JSONL");
  const lines = decoded.slice(0, -1).split("\n");
  check(lines.length === expectedCount, "record count");
  for (const line of lines) {
    let row; try { row = JSON.parse(line); } catch { check(false, "invalid record JSON"); }
    check(exact(row, schema.fields), "record field roster");
    check(row.state === state, "record state binding");
    check(row.zip5 === null || /^\d{5}$/.test(row.zip5), "ZIP5 field");
    check(row.zip4 === null || /^\d{4}$/.test(row.zip4), "ZIP4 field");
    check(row.latitude === undefined || row.latitude === null || (typeof row.latitude === "number" && Number.isFinite(row.latitude) && row.latitude >= -90 && row.latitude <= 90), "latitude");
    check(row.longitude === undefined || row.longitude === null || (typeof row.longitude === "number" && Number.isFinite(row.longitude) && row.longitude >= -180 && row.longitude <= 180), "longitude");
  }
}

export async function verifyClosedStateSourcePackage(packageDirectory, { authorizationRegistry, root = APP_ROOT, maximumRecordsBytes = 2_000_000_000, maximumLineBytes = 1_000_000, maximumRecords = 1_000_000 } = {}) {
  check(Number.isSafeInteger(maximumRecordsBytes) && maximumRecordsBytes >= 0 && maximumRecordsBytes <= 2_000_000_000 && Number.isSafeInteger(maximumLineBytes) && maximumLineBytes > 0 && maximumLineBytes <= 1_000_000 && Number.isSafeInteger(maximumRecords) && maximumRecords >= 0 && maximumRecords <= 1_000_000, "invalid verifier limits");
  const registry = snapshotRegistry(authorizationRegistry);
  check(path.isAbsolute(packageDirectory), "package path must be absolute");
  const resolvedRoot = path.resolve(root), canonicalRoot = await realpath(resolvedRoot), canonical = await realpath(packageDirectory);
  check(canonicalRoot === resolvedRoot && (await lstat(canonicalRoot)).isDirectory(), "root must be a canonical directory");
  check(canonical === path.resolve(packageDirectory), "package directory must be canonical");
  const relative = path.relative(canonicalRoot, canonical);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "package must remain inside datahub");
  const directoryBefore = await lstat(canonical, { bigint: true });
  check(directoryBefore.isDirectory() && !directoryBefore.isSymbolicLink(), "package must be a regular directory");
  check(isDeepStrictEqual((await readdir(canonical)).sort(), FILES), "package must contain exactly the closed inventory");
  validateRegistry(registry);
  const artifacts = {};
  for (const name of FILES) artifacts[name] = await fixedRead(path.join(canonical, name), name === "records.jsonl" ? maximumRecordsBytes : 2_000_000, { allowEmpty: name === "records.jsonl", parent: canonical });
  const directoryAfter = await lstat(canonical, { bigint: true });
  check(["dev", "ino", "mtimeNs", "ctimeNs"].every(key => directoryBefore[key] === directoryAfter[key]) && isDeepStrictEqual((await readdir(canonical)).sort(), FILES), "package changed while read");
  const sourceValue = json(artifacts["source.json"], "source"), schemaValue = json(artifacts["schema.json"], "schema"), policyValue = json(artifacts["policy.json"], "policy"), authorizationValue = json(artifacts["authorization.json"], "authorization"), manifestValue = json(artifacts["manifest.json"], "manifest");
  const source = { ...sourceValue, sha256: artifacts["source.json"].sha256 }, schema = { ...schemaValue, sha256: artifacts["schema.json"].sha256 }, policy = { ...policyValue, sha256: artifacts["policy.json"].sha256 };
  validateSource(sourceValue); validateSchema(schemaValue); validatePolicy(policyValue); validateAuthorization(authorizationValue, source, schema, policy); validateManifest(manifestValue, artifacts, maximumRecords);
  check(manifestValue.source_id === source.source_id && manifestValue.state === source.state, "manifest source/state binding");
  const approved = registry.approved_sources.find(entry => entry.state === source.state && entry.source_id === source.source_id && entry.authorization_id === authorizationValue.authorization_id);
  check(approved && approved.authorization_sha256 === artifacts["authorization.json"].sha256 && approved.source_sha256 === source.sha256 && approved.schema_sha256 === schema.sha256 && approved.policy_sha256 === policy.sha256, "source-specific pinned authorization registry entry");
  validateRows(artifacts["records.jsonl"].bytes, schemaValue, source.state, manifestValue.record_count, maximumLineBytes);
  return { verified: true, source_specific_authorization_satisfied: false, source_id: source.source_id, state: source.state, record_count: manifestValue.record_count, package_manifest_sha256: artifacts["manifest.json"].sha256, network_requests: 0, production_pointer_written: false, broad_layer_admission_performed: false };
}
