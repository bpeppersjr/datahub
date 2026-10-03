import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp, relativeToApp } from "./paths.mjs";

export const READINESS_SCHEMA = "zip-denominator-admission-readiness@1.0.0";
export const MANIFEST_SCHEMA = "zip-denominator-admission-readiness-manifest@1.0.0";
const MAX_JSON = 4_000_000, MAX_COHORT = 100_000_000;
const fail = (message) => { throw new Error(`ZIP denominator admission readiness rejected: ${message}.`); };
const check = (value, message) => value || fail(message);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableObject = (value) => Array.isArray(value) ? value.map(stableObject) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])])) : value;
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(stableObject(value), null, 2)}\n`);
const identity = (value) => `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs ?? value.mtimeMs}:${value.ctimeNs ?? value.ctimeMs}`;

function inside(root, candidate, label) {
  check(typeof candidate === "string" && candidate.length > 0, `${label} path`);
  const absolute = path.resolve(root, candidate), relative = path.relative(root, absolute);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${label} containment`);
  assertInsideApp(root === APP_ROOT ? absolute : path.resolve(APP_ROOT, path.relative(APP_ROOT, absolute)));
  return absolute;
}
async function canonicalParent(file) {
  let probe = path.dirname(file);
  for (;;) {
    try { await fs.realpath(probe); return; }
    catch (error) { if (error.code !== "ENOENT") throw error; const next = path.dirname(probe); check(next !== probe, "canonical parent"); probe = next; }
  }
}
async function ensureOutputRoot(root, output) {
  const rootCanonical = await fs.realpath(root); let probe = output;
  for (;;) {
    try {
      const canonical = await fs.realpath(probe), relative = path.relative(rootCanonical, canonical);
      check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "output canonical containment");
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(probe); check(parent !== probe, "output canonical ancestor"); probe = parent;
    }
  }
}
async function readStable(file, maximum, label, signal) {
  signal?.throwIfAborted(); await canonicalParent(file);
  const before = await fs.lstat(file, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum), `${label} bounded regular file`);
  check(await fs.realpath(file) === file, `${label} canonical path`);
  const handle = await fs.open(file, "r");
  try {
    check(identity(before) === identity(await handle.stat({ bigint: true })), `${label} ownership`);
    const chunks = []; let bytes = 0;
    for (;;) { signal?.throwIfAborted(); const buffer = Buffer.alloc(65536), result = await handle.read(buffer, 0, buffer.length, null); if (!result.bytesRead) break; bytes += result.bytesRead; check(bytes <= maximum, `${label} byte ceiling`); chunks.push(buffer.subarray(0, result.bytesRead)); }
    const raw = Buffer.concat(chunks), after = await handle.stat({ bigint: true }), pathAfter = await fs.lstat(file, { bigint: true });
    check(identity(before) === identity(after) && identity(before) === identity(pathAfter) && BigInt(bytes) === before.size, `${label} drift`);
    return { raw, bytes, sha256: sha256(raw) };
  } finally { await handle.close(); }
}
async function readJson(file, maximum, label, signal) {
  const read = await readStable(file, maximum, label, signal); let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.raw)); } catch { fail(`${label} JSON`); }
  return { ...read, value };
}
async function observedPath(root, relative, expectedKind, signal) {
  signal?.throwIfAborted(); const absolute = inside(root, relative, relative);
  try {
    const stat = await fs.lstat(absolute, { bigint: true });
    check(!stat.isSymbolicLink() && stat.nlink === 1n, `${relative} ownership`);
    return { path: relative, present: expectedKind === "file" ? stat.isFile() : stat.isDirectory() };
  } catch (error) { if (error.code !== "ENOENT") throw error; await canonicalParent(absolute); return { path: relative, present: false }; }
}
function pin(relative, read) { return { path: relative, bytes: read.bytes, sha256: read.sha256 }; }

export async function inspectZipDenominatorAdmissionReadiness(options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT), signal = options.signal;
  signal?.throwIfAborted();
  const configRel = options.configPath ?? "config/zip-denominator-admission-readiness.json";
  const configRead = await readJson(inside(root, configRel, "configuration"), MAX_JSON, "configuration", signal), config = configRead.value;
  check(config.schema_version === "zip-denominator-admission-readiness-config@1.0.0" && config.dataset_id === "zip-denominator-admission-readiness" && config.publication_mode === "immutable-local-review-only-pointer-free", "configuration identity");
  const registrationRead = await readJson(inside(root, config.cohort_registration, "cohort registration"), MAX_JSON, "cohort registration", signal), registration = registrationRead.value;
  const cohort = registration.retained_release;
  check(cohort?.release_id === config.expected.cohort_release_id && cohort.manifest_sha256 === config.expected.cohort_manifest_sha256 && cohort.cohort_sha256 === config.expected.cohort_sha256 && cohort.rows === config.expected.cohort_rows, "cohort registration pin");
  const cohortManifestRead = await readJson(inside(root, cohort.manifest, "cohort manifest"), MAX_JSON, "cohort manifest", signal), cohortManifest = cohortManifestRead.value;
  check(cohortManifestRead.sha256 === cohort.manifest_sha256 && cohortManifest.release_id === cohort.release_id && cohortManifest.current_pointer === null && cohortManifest.network_requests === 0 && cohortManifest.production_enrollment === false, "cohort manifest");
  const cohortArtifact = cohortManifest.artifacts?.find((item) => item.path === "cohort.jsonl");
  check(cohortArtifact?.record_count === 48194 && cohortArtifact.sha256 === cohort.cohort_sha256, "cohort artifact declaration");
  const cohortFile = path.join(path.dirname(inside(root, cohort.manifest, "cohort manifest")), cohortArtifact.path);
  const cohortRead = await readStable(cohortFile, MAX_COHORT, "cohort artifact", signal);
  check(cohortRead.sha256 === cohortArtifact.sha256 && cohortRead.bytes === cohortArtifact.bytes, "cohort artifact pin");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(cohortRead.raw).split("\n");
  check(lines.at(-1) === "", "cohort newline framing"); lines.pop();
  const classes = { "same-code-census-zcta": 0, "source-contributed-outside-zcta": 0, "denominator-only-outside-zcta": 0, "explicit-placeholder": 0 }, seen = new Set();
  let sourceContributed = 0, denominatorOnly = 0, unverified = 0;
  for (const line of lines) {
    check(line.length > 0 && line.length < 100000, "cohort line framing"); const row = JSON.parse(line);
    check(row.schema_version === "zip-denominator-gap-row@1.0.0" && /^\d{5}$/.test(row.zip5) && !seen.has(row.zip5) && Object.hasOwn(classes, row.classification), "cohort row identity");
    check(row.usps_validity === null && row.deliverability === null && row.completeness_percent === null, "cohort null claims");
    seen.add(row.zip5); classes[row.classification]++;
    if (row.registry_coverage_status === "record-level-source-contribution") sourceContributed++; else if (row.registry_coverage_status === "denominator-only-no-record-level-contribution") denominatorOnly++; else fail("cohort registry status");
    if (row.source_native_usps_status === "unverified") unverified++;
  }
  check(lines.length === 48194 && seen.size === 48194 && JSON.stringify(classes) === JSON.stringify({ "same-code-census-zcta": 33791, "source-contributed-outside-zcta": 14361, "denominator-only-outside-zcta": 41, "explicit-placeholder": 1 }) && sourceContributed === 47995 && denominatorOnly === 199 && unverified === 48194, "cohort conservation");
  const pointerRead = await readJson(inside(root, config.registry_pointer, "registry pointer"), MAX_JSON, "registry pointer", signal), pointer = pointerRead.value;
  check(pointerRead.sha256 === config.expected.registry_pointer_sha256 && pointer.release_id === config.expected.registry_release_id, "registry pointer pin");
  const manifestRel = path.posix.join(path.posix.dirname(config.registry_pointer.replaceAll("\\", "/")), pointer.manifest);
  const registryManifestRead = await readJson(inside(root, manifestRel, "registry manifest"), MAX_JSON, "registry manifest", signal), registryManifest = registryManifestRead.value;
  check(registryManifestRead.sha256 === config.expected.registry_manifest_sha256 && registryManifest.release_id === pointer.release_id && registryManifest.usps_reconciliation == null, "registry manifest pin or USPS reconciliation");
  const zipArtifact = registryManifest.artifacts?.find((item) => item.path === "derived/zip-coverage.jsonl");
  check(zipArtifact?.sha256 === config.expected.registry_zip_artifact_sha256 && zipArtifact.record_count === config.expected.registry_zip_rows, "registry ZIP artifact pin");
  const contractPins = {};
  for (const [route, values] of Object.entries(config.prerequisite_contracts)) {
    contractPins[route] = {};
    for (const [key, relative] of Object.entries(values)) if (key.endsWith("contract") || key === "production_adapter") contractPins[route][key] = pin(relative, await readStable(inside(root, relative, `${route} ${key}`), MAX_JSON, `${route} ${key}`, signal));
  }
  const postalPointer = await observedPath(root, config.prerequisite_contracts.postalpro_area_district.current_pointer, "file", signal);
  const cityAdmission = await observedPath(root, config.prerequisite_contracts.licensed_city_state.admission_root, "directory", signal);
  const cityCandidate = await observedPath(root, config.prerequisite_contracts.licensed_city_state.candidate_root, "directory", signal);
  const postalMissing = postalPointer.present ? [] : ["postalpro-current-pointer", "usps-written-permission-evidence", "exact-source-month-release"];
  const cityMissing = [...(!cityAdmission.present ? ["licensed-city-state-projection", "city-state-admission-manifest", "license-or-permission-reference", "four-zip-class-declaration"] : []), ...(!cityCandidate.present ? ["reviewed-status-semantics-map", "verified-city-state-candidate-release"] : [])];
  return {
    schema_version: READINESS_SCHEMA, dataset_id: "zip-denominator-admission-readiness", observed_at: (options.now ?? (() => new Date()))().toISOString(), status: "blocked-on-authorized-authoritative-input", publication_mode: "pointer-free-local-review-only",
    bindings: { configuration: pin(configRel, configRead), cohort_registration: pin(config.cohort_registration, registrationRead), cohort_manifest: pin(cohort.manifest, cohortManifestRead), cohort_artifact: pin(relativeToApp(cohortFile), cohortRead), registry_pointer: pin(config.registry_pointer, pointerRead), registry_manifest: pin(manifestRel, registryManifestRead), registry_zip_artifact: { path: path.posix.join(path.posix.dirname(manifestRel), zipArtifact.path), bytes: zipArtifact.bytes, sha256: zipArtifact.sha256, record_count: zipArtifact.record_count }, prerequisite_contracts: contractPins },
    retained_zip_evidence: { rows: 48194, record_level_source_contribution: 47995, denominator_only: 199, same_code_census_zcta: 33791, source_contributed_outside_zcta: 14361, denominator_only_outside_zcta: 41, explicit_placeholder: 1, usps_unverified: 48194 },
    prerequisite_routes: {
      postalpro_area_district: { status: postalMissing.length ? "missing-required-inputs" : "unverified-input-present", observed_path: postalPointer, missing_inputs: postalMissing, production_requires: ["verified-immutable-usps-operational-release", "usps-written-permission", "governed-permission-reference", "exact-source-month", "fresh-production-plan"] },
      licensed_city_state: { status: cityMissing.length ? "missing-required-inputs" : "unverified-inputs-present", observed_paths: { admissions: cityAdmission, candidates: cityCandidate }, missing_inputs: cityMissing, candidate_only: true, production_admission_implemented: false, requires: ["operator-managed-licensed-projection", "exact-sha256-and-bytes", "source-month-and-version", "permission-reference", "standard-po-box-unique-military-declarations", "explicit-reviewed-status-mapping"] }
    },
    blockers: ["missing-authorized-authoritative-usps-zip-artifact", "missing-governed-production-eligible-usps-permission-evidence", "authoritative-current-usps-denominator-unverified"],
    claims: { authoritative_current_usps_zip_denominator: null, valid_usps_zip_count: null, business_count: null, current_operating_business_count: null, completeness_percent: null, zip_validity_classified: false, deliverability_classified: false, zcta_treated_as_usps: false, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false }
  };
}

export async function buildZipDenominatorAdmissionReadiness(options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT), outputRoot = inside(root, options.outputRoot ?? "data/zip-denominator-admission-readiness", "output");
  await ensureOutputRoot(root, outputRoot);
  const readiness = await inspectZipDenominatorAdmissionReadiness({ ...options, root }); options.signal?.throwIfAborted();
  const artifact = jsonBytes(readiness), suffix = sha256(artifact), releaseId = `zip-denominator-admission-readiness-${suffix}`;
  const release = path.join(outputRoot, "releases", releaseId), stage = path.join(outputRoot, ".staging", randomUUID());
  try { await fs.lstat(release); fail("immutable release already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.mkdir(path.dirname(stage), { recursive: true });
  await fs.mkdir(stage, { recursive: false });
  try {
    await fs.writeFile(path.join(stage, "readiness.json"), artifact, { flag: "wx" });
    const manifest = { schema_version: MANIFEST_SCHEMA, dataset_id: readiness.dataset_id, release_id: releaseId, status: "immutable-local-review-release", publication_mode: "pointer-free", created_at: readiness.observed_at, current_pointer: null, network_requests: 0, acquisition_performed: false, production_enrollment: false, production_execution: false, artifacts: [{ path: "readiness.json", bytes: artifact.length, sha256: suffix, record_count: 1 }] };
    await fs.writeFile(path.join(stage, "manifest.json"), jsonBytes(manifest), { flag: "wx" }); options.signal?.throwIfAborted();
    await fs.mkdir(path.dirname(release), { recursive: true }); await fs.rename(stage, release);
    return await verifyZipDenominatorAdmissionReadiness(path.join(release, "manifest.json"), { root });
  } catch (error) { await fs.rm(stage, { recursive: true, force: true }).catch(() => {}); throw error; }
}

export async function verifyZipDenominatorAdmissionReadiness(manifestPath, options = {}) {
  const root = path.resolve(options.root ?? APP_ROOT), manifestFile = inside(root, manifestPath, "manifest"), manifestRead = await readJson(manifestFile, MAX_JSON, "manifest", options.signal), manifest = manifestRead.value;
  check(manifest.schema_version === MANIFEST_SCHEMA && manifest.dataset_id === "zip-denominator-admission-readiness" && manifest.status === "immutable-local-review-release" && manifest.publication_mode === "pointer-free" && manifest.current_pointer === null && manifest.network_requests === 0 && manifest.acquisition_performed === false && manifest.production_enrollment === false && manifest.production_execution === false, "manifest boundary");
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 1 && manifest.artifacts[0].path === "readiness.json" && manifest.artifacts[0].record_count === 1, "manifest inventory");
  const artifactRead = await readJson(path.join(path.dirname(manifestFile), "readiness.json"), MAX_JSON, "readiness artifact", options.signal), artifact = artifactRead.value, declared = manifest.artifacts[0];
  check(artifactRead.bytes === declared.bytes && artifactRead.sha256 === declared.sha256 && manifest.release_id === `zip-denominator-admission-readiness-${declared.sha256}`, "artifact identity");
  check(artifact.schema_version === READINESS_SCHEMA && artifact.status === "blocked-on-authorized-authoritative-input" && artifact.retained_zip_evidence?.rows === 48194 && artifact.retained_zip_evidence?.usps_unverified === 48194, "readiness identity");
  check(artifact.claims?.authoritative_current_usps_zip_denominator === null && artifact.claims?.valid_usps_zip_count === null && artifact.claims?.completeness_percent === null && artifact.claims?.zip_validity_classified === false && artifact.claims?.network_requests === 0 && artifact.claims?.production_execution === false, "readiness claim boundary");
  check(Array.isArray(artifact.prerequisite_routes?.postalpro_area_district?.missing_inputs) && Array.isArray(artifact.prerequisite_routes?.licensed_city_state?.missing_inputs) && artifact.prerequisite_routes?.licensed_city_state?.candidate_only === true && artifact.prerequisite_routes?.licensed_city_state?.production_admission_implemented === false, "prerequisite routes");
  const current = await inspectZipDenominatorAdmissionReadiness({ root, now: () => new Date(manifest.created_at), signal: options.signal });
  check(JSON.stringify(stableObject(artifact.bindings)) === JSON.stringify(stableObject(current.bindings)) && JSON.stringify(stableObject(artifact.retained_zip_evidence)) === JSON.stringify(stableObject(current.retained_zip_evidence)), "retained input replay");
  return { manifest, manifest_sha256: manifestRead.sha256, readiness: artifact, readiness_sha256: artifactRead.sha256, manifest_path: manifestFile };
}
