import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  loadStateBusinessSourceAssessmentCatalog,
  validateStateBusinessSourceAssessmentCatalog,
} from "./state-business-source-assessment.mjs";
import { readNewestNationalGoalCompletionMatrix } from "./national-goal-completion-view.mjs";
import { verifyNationalGoalCompletionMatrix } from "./national-goal-completion-matrix.mjs";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_SCHEMA_VERSION = "3.0.0";
export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID = "broad-organization-acquisition-backlog";
export const DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID);
export const BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE = 10;

const PRIORITY_RULE = "Current broad-layer gaps sort by assessment evidence date newest first, bounded implementation authorization first, unresolved gate count ascending, then jurisdiction abbreviation. This ranking does not authorize source acquisition.";
const STATE_CODES = Object.freeze("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const MATRIX_RELEASE_ID = /^national-goal-completion-\d{14}-[a-f0-9]{8}$/;
const FORBIDDEN_AUTHORITY = Object.freeze({
  autonomous_acquisition_authorized: false,
  paid_acquisition_authorized: false,
  complete_source_acquisition_authorized: false,
  row_bearing_preflight_authorized: false,
});
const HISTORICAL_V1_RELEASE = Object.freeze({
  release_id: "broad-organization-acquisition-backlog-2026-09-22-a485cf7845ff",
  manifest_sha256: "5295bd5ee08c140dbbf47ed198898dfc6db15d92a7ee482b91fb6e6e8357b013",
  artifact_sha256: "a485cf7845fff502a7c46e6d15a3222923e31c7c14d73909b38b1c54a5080c75",
  assessment_catalog_sha256: "2aec070420ed885fd52e3a3f7ecd406eb79620a0beee93a455d98254116ab384",
});
const HISTORICAL_V2_RELEASES = Object.freeze(new Map([
  ["broad-organization-acquisition-backlog-2026-09-23T15-28-41.546Z-0b28203dc600", ["57ad207d5f955f6434f54c7a2994d8e73c3d609fcc305e9f5e11c9b6d2988f86", "0b28203dc60033b03fe353749bd8fc9b86f1219a530bdcedcb6ed15f65e6ead5"]],
  ["broad-organization-acquisition-backlog-2026-09-23T15-28-41.546Z-cf0bcff7cccb", ["e88119c2ac0ccccc3511fd54f7bdfeebf23dcc55a99d5c6a66b0a0bf1a6ce6a0", "cf0bcff7cccb38618c4068b24ca5fe50bdaf2e743e921918866339a5ac5faf13"]],
  ["broad-organization-acquisition-backlog-2026-10-03T21-39-58.008Z-198a4e2579c0", ["e134b7721b31095c3f7b4b54f7d0493ca6d52ca387dd9aab74a474f88bd7c0e4", "198a4e2579c08e8fdaa5ced6d27ed078c2a583731630e8ec173edbc9fc8cd642"]],
  ["broad-organization-acquisition-backlog-2026-10-03T21-39-58.008Z-3b06b7e6dc73", ["d3d38cde534304f09e7a42d5ddc270ac2c618c83ef8f2d876805da61fab748fe", "3b06b7e6dc732df0dcb71cbbc13e0ac0947a4498fc7b43d4f9dd6e520a9e69da"]],
  ["broad-organization-acquisition-backlog-2026-10-07T05-23-37.982Z-add02eecfa37", ["ba710a3fdbe108fac26527e94951191e052d1359ce47a1d6c4f9b579ce60163b", "add02eecfa37f3abef25686ae9965a4b6eb018b281943fa7315600be38343cab"]],
]));

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

export async function loadCurrentBroadOrganizationGapEvidence() {
  const loaded = await readNewestNationalGoalCompletionMatrix({ root: APP_ROOT });
  if (!loaded) fail("no verified current national goal-completion matrix exists");
  const manifestPath = path.resolve(loaded.manifestPath);
  const releasesRoot = path.join(await realpath(APP_ROOT), "data", "national-goal-completion-matrix", "releases");
  if (!isInside(releasesRoot, manifestPath) || !MATRIX_RELEASE_ID.test(path.basename(path.dirname(manifestPath)))) fail("current matrix path is not canonical");
  const verified = await verifyNationalGoalCompletionMatrix(manifestPath, { root: APP_ROOT });
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifactBytes = await readFile(path.join(path.dirname(manifestPath), "report.json"));
  if (verified.schema_version !== "national-goal-completion-matrix@1.3.0" || verified.release_id !== loaded.report.release_id
      || !artifactBytes.equals(jsonBytes(verified.report)) || sha256(artifactBytes) !== verified.report_sha256) fail("current matrix verification or byte binding failed");
  return { report: verified.report, manifest, manifestBytes, artifactSha256: verified.report_sha256 };
}

function priorityCompare(left, right) {
  return right.observed_at.localeCompare(left.observed_at)
    || Number(right.bounded_connector_implementation_authorized) - Number(left.bounded_connector_implementation_authorized)
    || left.unresolved_gates.length - right.unresolved_gates.length
    || left.state_abbreviation.localeCompare(right.state_abbreviation);
}

export function deriveBroadOrganizationAcquisitionBacklog(catalog, matrixSource) {
  const validated = validateStateBusinessSourceAssessmentCatalog(catalog);
  const matrix = matrixSource?.report;
  if (validated.states.length !== 51 || matrix?.schema_version !== "national-goal-completion-matrix@1.3.0"
      || matrix.jurisdictions?.length !== 51 || matrix.release_id !== matrixSource?.manifest?.release_id) fail("expected the validated 51-jurisdiction catalog and verified current matrix");
  const matrixBytes = jsonBytes(matrix), matrixManifest = matrixSource.manifest;
  if (!Buffer.from(matrixSource.manifestBytes ?? []).equals(jsonBytes(matrixManifest)) || sha256(matrixBytes) !== matrixSource.artifactSha256
      || matrixManifest?.dataset_id !== "national-goal-completion-matrix" || matrixManifest.production_pointers_changed !== false || matrixManifest.network_requests !== 0
      || matrixManifest.artifacts?.length !== 1 || matrixManifest.artifacts[0].path !== "report.json" || matrixManifest.artifacts[0].bytes !== matrixBytes.length
      || matrixManifest.artifacts[0].sha256 !== matrixSource.artifactSha256) fail("current matrix bytes, provenance, or authority boundary drifted");
  const gapCodes = [];
  const seenCodes = new Set();
  for (const jurisdiction of matrix.jurisdictions) {
    if (!STATE_CODES.includes(jurisdiction.code) || seenCodes.has(jurisdiction.code)) fail("current matrix jurisdiction roster is invalid");
    seenCodes.add(jurisdiction.code);
    const category = jurisdiction.categories?.find((row) => row.category_id === "general-business");
    const dataset = category?.datasets?.length === 1 ? category.datasets[0] : null;
    if (dataset?.dataset_id !== "broad-jurisdiction-organization-layer" || !["available", "unmeasured", "observed-zero"].includes(dataset.availability_status)) fail(`current matrix broad-layer cell is invalid for ${jurisdiction.code}`);
    if (dataset.availability_status !== "available") gapCodes.push(jurisdiction.code);
  }
  if (seenCodes.size !== 51 || STATE_CODES.some((code) => !seenCodes.has(code)) || gapCodes.length !== 40 || gapCodes.includes("AK")) fail("expected the exact current 40-gap matrix with Alaska admitted");
  const byCode = new Map(validated.states.map((state) => [state.state_abbreviation, state]));
  if (byCode.size !== 51 || STATE_CODES.some((code) => !byCode.has(code))) fail("assessment jurisdiction roster is invalid");
  const excluded = gapCodes.map((code) => byCode.get(code));

  const candidates = excluded.map((state) => {
    if (Object.entries(FORBIDDEN_AUTHORITY).some(([field, value]) => state[field] !== value)) fail(`${state.state_abbreviation} acquisition authority is not explicitly false`);
    return structuredClone(state);
  }).sort(priorityCompare);
  if (candidates.some((state) => state.state_abbreviation === "AK")) fail("already-admitted Alaska must not appear in the current backlog");

  const rows = candidates.map((assessment, index) => ({
    priority: index + 1,
    first_wave: index < BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE,
    assessment,
  }));
  const supplemental = validated.source_artifacts.filter((artifact) => artifact.artifact_kind === "supplemental-document-prerequisite");
  if (supplemental.length !== 1 || supplemental[0].state_abbreviation !== "VT"
      || supplemental[0].primary_assessment_id !== "vt-business-source-reassessment-2026-10-03"
      || supplemental[0].authority_granted !== false || !/^[a-f0-9]{64}$/.test(supplemental[0].canonical_file_sha256)) fail("supplemental prerequisite evidence is invalid");
  const supplementalEvidence = validated.supplemental_evidence;
  if (!Array.isArray(supplementalEvidence) || supplementalEvidence.length !== 1
      || supplementalEvidence[0].assessment_id !== supplemental[0].artifact_id
      || supplementalEvidence[0].supersedes_assessment_id !== supplemental[0].primary_assessment_id
      || supplementalEvidence[0].interface_observation?.content_class !== "application-shell"
      || supplementalEvidence[0].interface_observation?.delivery_interface_verified !== false
      || supplementalEvidence[0].fields?.website_address_roles_documented !== true
      || supplementalEvidence[0].status_semantics?.website_good_standing_definition_established !== true
      || supplementalEvidence[0].claims?.business_count !== null
      || supplementalEvidence[0].claims?.statewide_completeness !== null
      || supplementalEvidence[0].unresolved_gates?.length !== 10
      || Object.values(supplementalEvidence[0].authority ?? {}).some((value) => value !== false)) fail("supplemental prerequisite facts or authority boundary are invalid");
  return {
    schema_version: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_SCHEMA_VERSION,
    dataset_id: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
    observed_at: matrix.created_at,
    assessment_catalog: {
      assessment_catalog_id: validated.assessment_catalog_id,
      schema_version: validated.schema_version,
      observed_at: validated.observed_at,
      coverage_release_id: validated.coverage_release_id,
      source_artifacts: structuredClone(validated.source_artifacts),
      canonical_json_sha256: sha256(Buffer.from(JSON.stringify(validated), "utf8")),
    },
    source_matrix: {
      release_id: matrix.release_id,
      schema_version: matrix.schema_version,
      manifest_sha256: sha256(matrixSource.manifestBytes),
      artifact_sha256: matrixSource.artifactSha256,
      denominator_version: matrix.denominator.version,
    },
    supplemental_evidence: structuredClone(supplementalEvidence),
    scope: {
      total_assessed_jurisdictions: 51,
      current_broad_layer_gaps: 40,
      acquisition_authorized: false,
      source_actions_performed: 0,
      network_requests: 0,
      current_pointer_changed: false,
      ranking_rule: PRIORITY_RULE,
      first_wave_size: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE,
      first_wave_state_abbreviations: rows.slice(0, BROAD_ORGANIZATION_ACQUISITION_BACKLOG_FIRST_WAVE_SIZE).map((row) => row.assessment.state_abbreviation),
      source_artifact_selection: "Exactly the validated assessment entries whose jurisdictions are current general-business broad-layer gaps in the independently verified newest national goal-completion matrix; assessment content and authority fields are preserved verbatim.",
    },
    states: rows,
  };
}

export function buildBroadOrganizationAcquisitionBacklogManifest(backlog) {
  const bytes = jsonBytes(backlog);
  const artifactSha256 = sha256(bytes);
  const observedToken = backlog.observed_at.replace(/[^A-Za-z0-9._-]/g, "-");
  const releaseId = `${BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID}-${observedToken}-${artifactSha256.slice(0, 12)}`;
  return {
    schema_version: "broad-organization-acquisition-backlog-manifest@3.0.0",
    dataset_id: BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
    release_id: releaseId,
    status: "published",
    derived_only: true,
    source_actions_performed: 0,
    network_requests: 0,
    current_pointer_changed: false,
    assessment_catalog_id: backlog.assessment_catalog.assessment_catalog_id,
    assessment_catalog_sha256: backlog.assessment_catalog.canonical_json_sha256,
    source_matrix_release_id: backlog.source_matrix.release_id,
    source_matrix_manifest_sha256: backlog.source_matrix.manifest_sha256,
    source_matrix_artifact_sha256: backlog.source_matrix.artifact_sha256,
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
  const [catalog, matrixSource] = await Promise.all([catalogLoader(), loadCurrentBroadOrganizationGapEvidence()]);
  const backlog = deriveBroadOrganizationAcquisitionBacklog(catalog, matrixSource);
  const manifest = buildBroadOrganizationAcquisitionBacklogManifest(backlog);
  const safeOutputRoot = await assertDataLocalDirectory(outputRoot, { create: true });
  const releasesDirectory = await assertDataLocalDirectory(path.join(safeOutputRoot, "releases"), { create: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    const existingRelease = await lstat(releaseDirectory);
    if (!existingRelease.isDirectory() || existingRelease.isSymbolicLink()) fail("pre-existing release identity is not a real directory");
    // Deterministic rebuilds may verify an existing immutable release, but never overwrite it.
    await verifyBroadOrganizationAcquisitionBacklog(path.join(releaseDirectory, "manifest.json"), { catalog, matrixSource });
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
      await verifyBroadOrganizationAcquisitionBacklog(path.join(releaseDirectory, "manifest.json"), { catalog, matrixSource });
      return { backlog, manifest, releaseDirectory, reused_existing_release: true };
    }
    await mkdir(stagingDirectory);
    ownsStaging = true;
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "backlog.json"), jsonBytes(backlog), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    signal?.throwIfAborted();
    await verifyBroadOrganizationAcquisitionBacklog(path.join(stagingDirectory, "manifest.json"), { catalog, matrixSource, allowOwnedStaging: true });
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

export async function verifyBroadOrganizationAcquisitionBacklog(manifestPath, { catalog = null, matrixSource = null, allowOwnedStaging = false } = {}) {
  await assertDataLocalDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail("manifest must be a regular file");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const historicalV1 = manifest.schema_version === "broad-organization-acquisition-backlog-manifest@1.0.0";
  const historicalV2 = manifest.schema_version === "broad-organization-acquisition-backlog-manifest@2.0.0";
  const expectedKeys = historicalV1
    ? ["schema_version", "dataset_id", "release_id", "status", "derived_only", "source_actions_performed", "current_pointer_changed", "assessment_catalog_id", "assessment_catalog_sha256", "state_count", "first_wave_state_abbreviations", "artifacts"]
    : ["schema_version", "dataset_id", "release_id", "status", "derived_only", "source_actions_performed", "network_requests", "current_pointer_changed", "assessment_catalog_id", "assessment_catalog_sha256", "source_matrix_release_id", "source_matrix_manifest_sha256", "source_matrix_artifact_sha256", "state_count", "first_wave_state_abbreviations", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...expectedKeys].sort())) fail("manifest schema drifted");
  if (!historicalV1 && !historicalV2 && manifest.schema_version !== "broad-organization-acquisition-backlog-manifest@3.0.0"
      || manifest.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID
      || manifest.status !== "published" || manifest.derived_only !== true
      || manifest.source_actions_performed !== 0 || (!historicalV1 && manifest.network_requests !== 0) || manifest.current_pointer_changed !== false) fail("manifest identity or authority boundary is invalid");
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
  if (historicalV1) {
    if (manifest.release_id !== HISTORICAL_V1_RELEASE.release_id
        || sha256(manifestBytes) !== HISTORICAL_V1_RELEASE.manifest_sha256
        || manifest.artifacts[0].sha256 !== HISTORICAL_V1_RELEASE.artifact_sha256
        || manifest.assessment_catalog_sha256 !== HISTORICAL_V1_RELEASE.assessment_catalog_sha256) fail("historical v1 release differs from its immutable lineage pins");
    if (backlog.schema_version !== "1.0.0" || backlog.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID
        || backlog.states?.length !== 43 || backlog.scope?.acquisition_authorized !== false
        || backlog.scope?.source_actions_performed !== 0 || backlog.scope?.current_pointer_changed !== false
        || backlog.assessment_catalog?.canonical_json_sha256 !== HISTORICAL_V1_RELEASE.assessment_catalog_sha256
        || backlog.states.some(({ assessment }) => Object.entries(FORBIDDEN_AUTHORITY).some(([field, value]) => assessment?.[field] !== value))) fail("historical v1 content or authority boundary is invalid");
  } else if (historicalV2) {
    const pins = HISTORICAL_V2_RELEASES.get(manifest.release_id);
    if (!pins || sha256(manifestBytes) !== pins[0] || manifest.artifacts[0].sha256 !== pins[1]
        || backlog.schema_version !== "2.0.0" || backlog.states?.length !== 40
        || backlog.scope?.current_broad_layer_gaps !== 40 || backlog.scope?.acquisition_authorized !== false
        || backlog.scope?.source_actions_performed !== 0 || backlog.scope?.network_requests !== 0
        || backlog.scope?.current_pointer_changed !== false
        || backlog.states.some(({ assessment }) => Object.entries(FORBIDDEN_AUTHORITY).some(([field, value]) => assessment?.[field] !== value))) fail("historical v2 content differs from its immutable lineage pins");
  } else {
    const pinnedCatalog = catalog ?? await loadStateBusinessSourceAssessmentCatalog();
    const expectedBacklog = deriveBroadOrganizationAcquisitionBacklog(pinnedCatalog, matrixSource ?? await loadCurrentBroadOrganizationGapEvidence());
    const expectedManifest = buildBroadOrganizationAcquisitionBacklogManifest(expectedBacklog);
    if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) fail("manifest does not match the exact validated assessment catalog projection or authorized boundary");
    if (!artifactBytes.equals(jsonBytes(expectedBacklog)) || JSON.stringify(backlog) !== JSON.stringify(expectedBacklog)) fail("backlog content differs from the exact validated assessment-derived projection");
  }
  const directoryName = path.basename(releaseDirectory);
  const stagedName = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(directoryName);
  if (directoryName !== manifest.release_id && !(allowOwnedStaging && stagedName)) fail("release directory identity mismatch");
  return { manifest, backlog };
}
