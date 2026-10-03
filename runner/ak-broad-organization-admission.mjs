import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const AK_ADMISSION_DATASET_ID = "ak-broad-organization-admission-candidate";
export const AK_ADMISSION_VERSION = "ak-broad-organization-admission-candidate@1.0.0";
export const DEFAULT_AK_ADMISSION_SELECTION = path.join(APP_ROOT, "config", "ak-broad-organization-admission.json");
const MANIFEST_VERSION = "ak-broad-organization-admission-candidate-manifest@1.0.0", SHA = /^[a-f0-9]{64}$/;
const stable = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const check = (value, message) => { if (!value) throw new Error(`Alaska admission candidate rejected: ${message}`); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const inside = (root, target) => { const relative = path.relative(root, target); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); };
const stableFile = (a, b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n && ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => a[key] === b[key]);

async function canonicalRoot(root) { const resolved = path.resolve(root), actual = await realpath(resolved); check(actual === resolved, "repository root is not canonical"); return actual; }
async function fixedRead(root, filename, maximum) {
  filename = path.resolve(filename); check(inside(root, filename), "input leaves repository");
  const parent = await realpath(path.dirname(filename)); check(parent === path.dirname(filename) && inside(root, parent), "input parent is unsafe");
  const before = await lstat(filename, { bigint: true }); check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum), "input is unsafe or oversized");
  const handle = await open(filename, "r"), chunks = [], digest = createHash("sha256"); let length = 0;
  try {
    check(stableFile(before, await handle.stat({ bigint: true })), "input identity changed");
    for (;;) { const buffer = Buffer.alloc(65_536), result = await handle.read(buffer, 0, buffer.length, null); if (!result.bytesRead) break; const part = buffer.subarray(0, result.bytesRead); length += part.length; check(length <= maximum, "input byte ceiling"); chunks.push(part); digest.update(part); }
    check(stableFile(before, await handle.stat({ bigint: true })) && stableFile(before, await lstat(filename, { bigint: true })), "input changed while read");
  } finally { await handle.close(); }
  return { bytes: Buffer.concat(chunks), length, sha256: digest.digest("hex"), path: filename };
}
async function fixedHash(root, filename, expectedBytes) {
  filename = path.resolve(filename); check(inside(root, filename), "artifact leaves repository");
  const parent = await realpath(path.dirname(filename)); check(parent === path.dirname(filename) && inside(root, parent), "artifact parent is unsafe");
  const before = await lstat(filename, { bigint: true }); check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size === BigInt(expectedBytes), "artifact is unsafe or byte count drifted");
  const handle = await open(filename, "r"), digest = createHash("sha256"); let length = 0;
  try {
    check(stableFile(before, await handle.stat({ bigint: true })), "artifact identity changed");
    for (;;) { const buffer = Buffer.alloc(65_536), result = await handle.read(buffer, 0, buffer.length, null); if (!result.bytesRead) break; length += result.bytesRead; check(length <= expectedBytes, "artifact byte ceiling"); digest.update(buffer.subarray(0, result.bytesRead)); }
    check(stableFile(before, await handle.stat({ bigint: true })) && stableFile(before, await lstat(filename, { bigint: true })) && length === expectedBytes, "artifact changed while read");
  } finally { await handle.close(); }
  return digest.digest("hex");
}
function parseJson(read, label) { try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.bytes)); } catch { throw new Error(`Alaska admission candidate rejected: invalid ${label} JSON or UTF-8`); } }

async function loadSelection(root, selectionPath) {
  root = await canonicalRoot(root); const selectionRead = await fixedRead(root, selectionPath, 32_768), value = parseJson(selectionRead, "selection");
  check(exact(value, ["schema_version", "state", "dataset_id", "release_id", "manifest_path", "manifest_sha256", "source_release_id", "policy_id", "claims"]), "selection envelope drifted");
  check(exact(value.claims, ["network_requests", "acquisition_performed", "production_pointer_change_authorized", "current_operation_verified", "physical_sites_verified", "geocodes_claimed", "all_business_completeness_percent"]), "selection claims drifted");
  check(value.schema_version === "ak-broad-organization-admission-selection@1.0.0" && value.state === "AK" && value.dataset_id === "ak-active-business-licenses" && typeof value.release_id === "string" && typeof value.source_release_id === "string" && value.policy_id === "ak-active-business-licenses", "selection identity drifted");
  check(value.claims.network_requests === 0 && value.claims.acquisition_performed === false && value.claims.production_pointer_change_authorized === false && value.claims.current_operation_verified === false && value.claims.physical_sites_verified === false && value.claims.geocodes_claimed === false && value.claims.all_business_completeness_percent === null, "authority boundary drifted");
  check(typeof value.manifest_path === "string" && !path.isAbsolute(value.manifest_path) && !value.manifest_path.includes("\\") && SHA.test(value.manifest_sha256), "manifest declaration is invalid");
  const manifestRead = await fixedRead(root, path.resolve(root, ...value.manifest_path.split("/")), 2_000_000); check(manifestRead.sha256 === value.manifest_sha256, "manifest hash drifted");
  return { root, selection: value, selectionSha256: selectionRead.sha256, manifest: parseJson(manifestRead, "source manifest"), manifestPath: manifestRead.path };
}

export async function buildAkBroadOrganizationAdmissionCandidate({ root = APP_ROOT, selectionPath = DEFAULT_AK_ADMISSION_SELECTION } = {}) {
  const input = await loadSelection(root, selectionPath), { selection, manifest } = input;
  check(manifest.dataset_id === selection.dataset_id && manifest.release_id === selection.release_id && manifest.source_release_id === selection.source_release_id && manifest.status === "published" && manifest.complete_active_license_snapshot === true && manifest.coverage?.complete_all_businesses === false, "retained release identity or scope drifted");
  check(manifest.policy?.policy_id === selection.policy_id && manifest.policy?.record_level_distribution === "local-review-only", "policy boundary drifted");
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 22, "artifact roster drifted");
  const releaseRoot = path.dirname(input.manifestPath), seen = new Set(); let verifiedBytes = 0;
  for (const artifact of manifest.artifacts) {
    const allowed = ["path", "bytes", "sha256", "artifact_type", ...(artifact.record_count === undefined ? [] : ["record_count"]), ...(artifact.export_policy === undefined ? [] : ["export_policy"]), ...(artifact.distribution_policy === undefined ? [] : ["distribution_policy"])];
    check(exact(artifact, allowed) && typeof artifact.path === "string" && artifact.path.length <= 512 && !path.isAbsolute(artifact.path) && !artifact.path.includes("\\") && !seen.has(artifact.path) && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && SHA.test(artifact.sha256), "artifact declaration is invalid"); seen.add(artifact.path);
    const candidate = path.resolve(releaseRoot, ...artifact.path.split("/")); check(inside(releaseRoot, candidate), "artifact leaves release");
    check(await fixedHash(input.root, candidate, artifact.bytes) === artifact.sha256, `${artifact.path} hash drifted`); verifiedBytes += artifact.bytes;
  }
  const c = manifest.coverage, shards = manifest.artifacts.filter(row => row.artifact_type === "normalized-ak-active-business-license-jsonl-gzip"), normalizedRows = shards.reduce((sum, row) => sum + row.record_count, 0);
  check(shards.length === 16 && normalizedRows === c.active_license_organizations, "normalized organization shards do not conserve organizations");
  check(c.source_active_license_rows === c.active_license_organizations + c.quarantined_source_records && c.active_license_organizations === c.provisional_physical_sites + c.organizations_without_eligible_physical_site && c.source_naics_rows === c.distinct_license_naics_pairs + c.duplicate_license_naics_rows_collapsed && c.licenses_with_naics + c.licenses_without_naics === c.source_active_license_rows, "coverage conservation failed");
  check(manifest.quality_gates?.duplicate_license_numbers === 0 && manifest.quality_gates?.orphan_naics_rows === 0, "retained identity quality gates failed");
  const body = { schema_version: AK_ADMISSION_VERSION, dataset_id: AK_ADMISSION_DATASET_ID, state: "AK", decision: "eligible-retained-broad-organization-cohort-candidate", source: { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, manifest_path: selection.manifest_path, manifest_sha256: selection.manifest_sha256, selection_sha256: input.selectionSha256 }, verification: { artifact_count: manifest.artifacts.length, verified_bytes: verifiedBytes, normalized_organization_rows: normalizedRows, source_rows: c.source_active_license_rows, quarantined_rows: c.quarantined_source_records, provisional_site_assertions_withheld_as_sites: c.provisional_physical_sites, conservation_status: "passed" }, semantics: { row_unit: "one provisional organization per source-defined active Alaska business license", active_operation_asserted: false, physical_sites_asserted: false, geocodes_asserted: false, complete_all_businesses: false, completeness_percent: null, note: "Reported physical addresses remain organization-address evidence; this candidate emits no site, establishment, coordinate, ownership, or current-operation assertion." }, authority: { retained_offline_replay: true, acquisition_authorized: false, network_requests: 0, production_enrollment: false, current_pointer_written: false, production_pointer_change_authorized: false, export_policy: "local-review-only" } };
  return { ...body, release_id: `${AK_ADMISSION_DATASET_ID}-${sha256(stable(body)).slice(0, 24)}` };
}

export async function publishAkBroadOrganizationAdmissionCandidate(options = {}) {
  const root = await canonicalRoot(options.root ?? APP_ROOT), outputRoot = path.resolve(options.outputRoot ?? root); check(outputRoot === root, "output root must be the canonical datahub root");
  const candidate = await buildAkBroadOrganizationAdmissionCandidate({ ...options, root }), releases = path.join(root, "data", AK_ADMISSION_DATASET_ID, "releases"), directory = path.join(releases, candidate.release_id), staging = path.join(releases, `.${candidate.release_id}.staging-${randomUUID()}`), lock = path.join(releases, `.${candidate.release_id}.lock`);
  await mkdir(releases, { recursive: true }); check(await realpath(releases) === releases, "release root is not canonical");
  let lockHandle;
  try { lockHandle = await open(lock, "wx"); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await access(path.join(directory, "manifest.json")).then(() => true, () => false)) return verifyAkBroadOrganizationAdmissionCandidate(path.join(directory, "manifest.json"), { ...options, root });
      if (!(await access(lock).then(() => true, () => false))) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error("Alaska admission candidate rejected: concurrent publisher did not produce a verifiable release");
  }
  try {
    if (await access(path.join(directory, "manifest.json")).then(() => true, () => false)) return verifyAkBroadOrganizationAdmissionCandidate(path.join(directory, "manifest.json"), { ...options, root });
    await mkdir(staging); const artifactBytes = Buffer.from(stable(candidate)); const artifact = await open(path.join(staging, "candidate.json"), "wx"); try { await artifact.writeFile(artifactBytes); await artifact.sync(); } finally { await artifact.close(); }
    const manifest = { schema_version: MANIFEST_VERSION, dataset_id: AK_ADMISSION_DATASET_ID, release_id: candidate.release_id, status: "published-local-derived-candidate", network_requests: 0, current_pointer_written: false, production_enrollment: false, source: candidate.source, artifacts: [{ path: "candidate.json", bytes: artifactBytes.length, sha256: sha256(artifactBytes), record_count: 1, artifact_type: "ak-broad-organization-admission-candidate-json", export_policy: "local-review-only" }] };
    const manifestHandle = await open(path.join(staging, "manifest.json"), "wx"); try { await manifestHandle.writeFile(stable(manifest)); await manifestHandle.sync(); } finally { await manifestHandle.close(); }
    await rename(staging, directory); return verifyAkBroadOrganizationAdmissionCandidate(path.join(directory, "manifest.json"), { ...options, root });
  } finally { await rm(staging, { recursive: true, force: true }); await lockHandle.close(); await rm(lock, { force: true }); }
}

export async function verifyAkBroadOrganizationAdmissionCandidate(manifestPath, options = {}) {
  const root = await canonicalRoot(options.root ?? APP_ROOT), expectedParent = path.join(root, "data", AK_ADMISSION_DATASET_ID, "releases"), directory = path.dirname(path.resolve(manifestPath));
  check(path.basename(manifestPath) === "manifest.json" && path.dirname(directory) === expectedParent, "candidate manifest path is invalid");
  const manifestRead = await fixedRead(root, manifestPath, 2_000_000), manifest = parseJson(manifestRead, "candidate manifest");
  check(exact(manifest, ["schema_version", "dataset_id", "release_id", "status", "network_requests", "current_pointer_written", "production_enrollment", "source", "artifacts"]) && manifest.schema_version === MANIFEST_VERSION && manifest.dataset_id === AK_ADMISSION_DATASET_ID && manifest.status === "published-local-derived-candidate" && manifest.network_requests === 0 && manifest.current_pointer_written === false && manifest.production_enrollment === false && path.basename(directory) === manifest.release_id, "candidate manifest contract drifted");
  const descriptor = manifest.artifacts?.[0]; check(manifest.artifacts?.length === 1 && exact(descriptor, ["path", "bytes", "sha256", "record_count", "artifact_type", "export_policy"]) && descriptor.path === "candidate.json" && descriptor.record_count === 1 && descriptor.artifact_type === "ak-broad-organization-admission-candidate-json" && descriptor.export_policy === "local-review-only" && Number.isSafeInteger(descriptor.bytes) && SHA.test(descriptor.sha256), "candidate artifact contract drifted");
  const artifactRead = await fixedRead(root, path.join(directory, "candidate.json"), 2_000_000); check(artifactRead.length === descriptor.bytes && artifactRead.sha256 === descriptor.sha256, "candidate artifact drifted");
  const actual = parseJson(artifactRead, "candidate"), expected = await buildAkBroadOrganizationAdmissionCandidate({ ...options, root }); check(isDeepStrictEqual(actual, expected) && actual.release_id === manifest.release_id && isDeepStrictEqual(manifest.source, actual.source), "candidate replay differs from retained release");
  return { manifest, candidate: actual, manifest_sha256: manifestRead.sha256, directory };
}
