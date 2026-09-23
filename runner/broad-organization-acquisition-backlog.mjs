import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  loadStateBusinessSourceAssessmentCatalog,
  validateStateBusinessSourceAssessmentCatalog,
} from "./state-business-source-assessment.mjs";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_SCHEMA_VERSION = "1.0.0";
export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID = "broad-organization-acquisition-backlog";
export const DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID);
export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE = 10;

const PRIORITY_RULE = "AK, then DC (bounded connector implementation already authorized); remaining jurisdictions sort by assessment evidence date newest first, bounded implementation authorization first, production readiness first, unresolved gate count ascending, then jurisdiction abbreviation. This ranking does not authorize source acquisition.";
const FORBIDDEN_AUTHORITY = Object.freeze({
  autonomous_acquisition_authorized: false,
  paid_acquisition_authorized: false,
  complete_source_acquisition_authorized: false,
  row_bearing_preflight_authorized: false,
});

function fail(message) {
  throw new Error(`Broad-organization acquisition backlog is invalid: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function canonicalDataRoot() {
  return path.join(await realpath(APP_ROOT), "data");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function assertDataLocalDirectory(directory, { create = false } = {}) {
  const dataRoot = await canonicalDataRoot();
  const resolved = path.resolve(directory);
  if (!isInside(dataRoot, resolved) || resolved === dataRoot) fail("output must be a child of the canonical APP_ROOT/data directory");
  const appRoot = path.dirname(dataRoot);
  const relative = path.relative(appRoot, resolved);
  const segments = relative.split(path.sep);
  if (segments[0] !== "data") fail("output is not under canonical APP_ROOT/data");
  let current = appRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`linked or non-directory output ancestry is not allowed: ${current}`);
  }
  return resolved;
}

function priorityCompare(left, right) {
  if (left.state_abbreviation === "AK") return right.state_abbreviation === "AK" ? 0 : -1;
  if (right.state_abbreviation === "AK") return 1;
  if (left.state_abbreviation === "DC") return right.state_abbreviation === "DC" ? 0 : -1;
  if (right.state_abbreviation === "DC") return 1;
  return right.observed_at.localeCompare(left.observed_at)
    || Number(right.bounded_connector_implementation_authorized) - Number(left.bounded_connector_implementation_authorized)
    || Number(right.production_ready) - Number(left.production_ready)
    || left.unresolved_gates.length - right.unresolved_gates.length
    || left.state_abbreviation.localeCompare(right.state_abbreviation);
}

export function deriveBroadOrganizationAcquisitionBacklog(catalog) {
  const validated = validateStateBusinessSourceAssessmentCatalog(catalog);
  const excluded = validated.states.filter((state) => state.broad_layer_production_ready !== true);
  if (excluded.length !== 43 || validated.states.length !== 51) fail("expected the exact 43 of 51 non-production-ready jurisdictions");

  const candidates = excluded.map((state) => {
    if (Object.entries(FORBIDDEN_AUTHORITY).some(([field, value]) => state[field] !== value)) fail(`${state.state_abbreviation} acquisition authority is not explicitly false`);
    return structuredClone(state);
  }).sort(priorityCompare);
  if (candidates[0]?.state_abbreviation !== "AK" || candidates[1]?.state_abbreviation !== "DC") fail("bounded connector jurisdictions are not first in the disclosed order");

  const rows = candidates.map((assessment, index) => ({
    priority: index + 1,
    first_wave: index < BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE,
    assessment,
  }));
  return {
    schema_version: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_SCHEMA_VERSION,
    dataset_id: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
    observed_at: validated.observed_at,
    assessment_catalog: {
      assessment_catalog_id: validated.assessment_catalog_id,
      schema_version: validated.schema_version,
      observed_at: validated.observed_at,
      coverage_release_id: validated.coverage_release_id,
      source_artifacts: structuredClone(validated.source_artifacts),
      canonical_json_sha256: sha256(Buffer.from(JSON.stringify(validated), "utf8")),
    },
    scope: {
      total_assessed_jurisdictions: 51,
      not_broad_layer_production_ready: 43,
      acquisition_authorized: false,
      source_actions_performed: 0,
      current_pointer_changed: false,
      ranking_rule: PRIORITY_RULE,
      first_wave_size: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE,
      first_wave_state_abbreviations: rows.slice(0, BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE).map((row) => row.assessment.state_abbreviation),
      source_artifact_selection: "Exactly those validated 51-state assessment entries whose broad_layer_production_ready flag is false; assessment content and authority fields are preserved verbatim.",
    },
    states: rows,
  };
}

export function buildBroadOrganizationAcquisitionBacklogManifest(backlog) {
  const bytes = jsonBytes(backlog);
  const artifactSha256 = sha256(bytes);
  const releaseId = `${BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID}-${backlog.observed_at}-${artifactSha256.slice(0, 12)}`;
  return {
    schema_version: "broad-organization-acquisition-backlog-manifest@1.0.0",
    dataset_id: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
    release_id: releaseId,
    status: "published",
    derived_only: true,
    source_actions_performed: 0,
    current_pointer_changed: false,
    assessment_catalog_id: backlog.assessment_catalog.assessment_catalog_id,
    assessment_catalog_sha256: backlog.assessment_catalog.canonical_json_sha256,
    state_count: backlog.states.length,
    first_wave_state_abbreviations: [...backlog.scope.first_wave_state_abbreviations],
    artifacts: [{ path: "backlog.json", bytes: bytes.length, sha256: artifactSha256 }],
  };
}

export async function buildBroadOrganizationAcquisitionBacklog({
  outputRoot = DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
  catalogLoader = loadStateBusinessSourceAssessmentCatalog,
  signal,
} = {}) {
  const catalog = await catalogLoader();
  const backlog = deriveBroadOrganizationAcquisitionBacklog(catalog);
  const manifest = buildBroadOrganizationAcquisitionBacklogManifest(backlog);
  const safeOutputRoot = await assertDataLocalDirectory(outputRoot, { create: true });
  const releasesDirectory = await assertDataLocalDirectory(path.join(safeOutputRoot, "releases"), { create: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    const existingRelease = await lstat(releaseDirectory);
    if (!existingRelease.isDirectory() || existingRelease.isSymbolicLink()) fail("pre-existing release identity is not a real directory");
    // Deterministic rebuilds may verify an existing immutable release, but never overwrite it.
    await verifyBroadOrganizationAcquisitionBacklog(path.join(releaseDirectory, "manifest.json"), { catalog });
    return { backlog, manifest, releaseDirectory, reused_existing_release: true };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lockDirectory = path.join(releasesDirectory, `.${manifest.release_id}.publish-lock`);
  await mkdir(lockDirectory);
  const stagingDirectory = path.join(releasesDirectory, `.${manifest.release_id}.staging-${randomUUID()}`);
  let ownsStaging = false;
  try {
    // Recheck while holding the deterministic identity lock to avoid racing another builder.
    let releaseExists = false;
    try {
      const existingRelease = await lstat(releaseDirectory);
      if (!existingRelease.isDirectory() || existingRelease.isSymbolicLink()) fail("release identity appeared as a linked or non-directory path");
      releaseExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (releaseExists) {
      await verifyBroadOrganizationAcquisitionBacklog(path.join(releaseDirectory, "manifest.json"), { catalog });
      return { backlog, manifest, releaseDirectory, reused_existing_release: true };
    }
    await mkdir(stagingDirectory);
    ownsStaging = true;
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "backlog.json"), jsonBytes(backlog), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    signal?.throwIfAborted();
    await verifyBroadOrganizationAcquisitionBacklog(path.join(stagingDirectory, "manifest.json"), { catalog, allowOwnedStaging: true });
    try {
      await lstat(releaseDirectory);
      fail("release identity appeared during publication; refusing to replace it");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(stagingDirectory, releaseDirectory);
    ownsStaging = false;
  } catch (error) {
    throw error;
  } finally {
    if (ownsStaging) await rm(stagingDirectory, { recursive: true, force: true });
    await rmdir(lockDirectory);
  }
  return { backlog, manifest, releaseDirectory, reused_existing_release: false };
}

export async function verifyBroadOrganizationAcquisitionBacklog(manifestPath, { catalog = null, allowOwnedStaging = false } = {}) {
  await assertDataLocalDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail("manifest must be a regular file");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expectedKeys = ["schema_version", "dataset_id", "release_id", "status", "derived_only", "source_actions_performed", "current_pointer_changed", "assessment_catalog_id", "assessment_catalog_sha256", "state_count", "first_wave_state_abbreviations", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...expectedKeys].sort())) fail("manifest schema drifted");
  if (manifest.schema_version !== "broad-organization-acquisition-backlog-manifest@1.0.0"
      || manifest.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID
      || manifest.status !== "published" || manifest.derived_only !== true
      || manifest.source_actions_performed !== 0 || manifest.current_pointer_changed !== false) fail("manifest identity or authority boundary is invalid");
  const releaseDirectory = path.dirname(manifestPath);
  const releaseStat = await lstat(releaseDirectory);
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) fail("release directory must be a real directory");
  const entries = await readdir(releaseDirectory, { withFileTypes: true });
  if (entries.length !== 2 || entries.some((entry) => !["backlog.json", "manifest.json"].includes(entry.name) || !entry.isFile())) fail("release contains unexpected files or directories");
  const artifactPath = path.join(releaseDirectory, "backlog.json");
  const artifactStat = await lstat(artifactPath);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) fail("backlog artifact must be a regular file");
  if (manifest.artifacts.length !== 1 || manifest.artifacts[0].path !== "backlog.json") fail("manifest artifact inventory drifted");
  const artifactBytes = await readFile(artifactPath);
  if (artifactBytes.length !== manifest.artifacts[0].bytes || sha256(artifactBytes) !== manifest.artifacts[0].sha256) fail("backlog artifact checksum mismatch");
  const backlog = JSON.parse(artifactBytes.toString("utf8"));
  const pinnedCatalog = catalog ?? await loadStateBusinessSourceAssessmentCatalog();
  const expectedBacklog = deriveBroadOrganizationAcquisitionBacklog(pinnedCatalog);
  const expectedManifest = buildBroadOrganizationAcquisitionBacklogManifest(expectedBacklog);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) fail("manifest does not match the exact validated assessment catalog projection or authorized boundary");
  if (!artifactBytes.equals(jsonBytes(expectedBacklog)) || JSON.stringify(backlog) !== JSON.stringify(expectedBacklog)) fail("backlog content differs from the exact validated assessment-derived projection");
  const directoryName = path.basename(releaseDirectory);
  const stagedName = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(directoryName);
  if (directoryName !== manifest.release_id && !(allowOwnedStaging && stagedName)) fail("release directory identity mismatch");
  return { manifest, backlog };
}
