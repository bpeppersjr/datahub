import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { loadCurrentBroadOrganizationAcquisitionBacklog, loadCurrentBroadOrganizationGapEvidence } from "./broad-organization-acquisition-backlog.mjs";
import { isPinnedAuthorizationHistory, newestAuthorizationCohort, readAuthorizationViewReleases } from "./authorization-view-release-selection.mjs";

export const BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_SCHEMA = "broad-organization-matrix-gap-projection@1.0.0";
export const BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET = "broad-organization-matrix-gap-projection";
export const DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET);
const STATE_CODES = Object.freeze("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const HASH = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`Broad-organization matrix-gap projection rejected: ${message}`); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const inside = (parent, candidate) => { const rel = path.relative(parent, candidate); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel)); };

async function assertDataDirectory(directory, { create = false } = {}) {
  const data = path.join(await realpath(APP_ROOT), "data");
  const resolved = path.resolve(directory);
  if (!inside(data, resolved) || resolved === data) fail("output must be a child of canonical APP_ROOT/data");
  let current = path.dirname(data);
  for (const segment of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`linked or non-directory output ancestry: ${current}`);
  }
  return resolved;
}

export function deriveBroadOrganizationMatrixGapProjection(backlog, backlogManifestBytes, backlogManifest, matrix, matrixManifestBytes, matrixManifest, matrixArtifactSha256) {
  if (backlog?.dataset_id !== "broad-organization-acquisition-backlog" || backlog.schema_version !== "3.0.0" || backlogManifest?.schema_version !== "broad-organization-acquisition-backlog-manifest@3.0.0" || backlog.states?.length !== 40 || backlog.scope?.acquisition_authorized !== false || backlog.scope?.source_actions_performed !== 0 || backlog.scope?.network_requests !== 0 || backlog.scope?.current_pointer_changed !== false) fail("verified current 40-jurisdiction backlog contract is invalid");
  if (!backlogManifest?.artifacts?.[0] || backlogManifest.artifacts[0].path !== "backlog.json" || backlogManifest.artifacts[0].bytes !== jsonBytes(backlog).length || backlogManifest.artifacts[0].sha256 !== sha256(jsonBytes(backlog)) || !Buffer.from(backlogManifestBytes).equals(jsonBytes(backlogManifest))) fail("backlog source bytes or artifact binding drifted");
  if (matrix?.schema_version !== "national-goal-completion-matrix@1.3.0" || matrix.release_id !== matrixManifest?.release_id || matrix.jurisdictions?.length !== 51 || matrixManifest?.dataset_id !== "national-goal-completion-matrix" || matrixManifest?.schema_version !== matrix.schema_version || matrixManifest?.production_pointers_changed !== false || matrixManifest?.network_requests !== 0) fail("verified current matrix identity or boundary is invalid");
  if (!matrixManifest?.artifacts?.[0] || matrixManifest.artifacts[0].path !== "report.json" || matrixManifest.artifacts[0].bytes !== jsonBytes(matrix).length || matrixManifest.artifacts[0].sha256 !== matrixArtifactSha256 || matrixArtifactSha256 !== sha256(jsonBytes(matrix)) || !Buffer.from(matrixManifestBytes).equals(jsonBytes(matrixManifest))) fail("matrix source bytes or artifact binding drifted");
  const matrixManifestSha256 = sha256(matrixManifestBytes);
  if (backlog.observed_at !== matrix.created_at || backlog.source_matrix?.release_id !== matrix.release_id || backlog.source_matrix.manifest_sha256 !== matrixManifestSha256 || backlog.source_matrix.artifact_sha256 !== matrixArtifactSha256 || backlog.source_matrix.denominator_version !== matrix.denominator.version || backlogManifest.source_matrix_release_id !== matrix.release_id || backlogManifest.source_matrix_manifest_sha256 !== matrixManifestSha256 || backlogManifest.source_matrix_artifact_sha256 !== matrixArtifactSha256) fail("backlog lineage differs from the current matrix");
  const byCode = new Map();
  for (const jurisdiction of matrix.jurisdictions) {
    if (!STATE_CODES.includes(jurisdiction.code) || byCode.has(jurisdiction.code)) fail("matrix jurisdiction roster is invalid");
    const category = jurisdiction.categories?.find((row) => row.category_id === "general-business");
    if (!category || category.datasets?.length !== 1 || category.datasets[0].dataset_id !== "broad-jurisdiction-organization-layer") fail(`general-business cell is invalid for ${jurisdiction.code}`);
    const dataset = category.datasets[0];
    if (!new Set(["available", "unmeasured", "observed-zero"]).has(dataset.availability_status)) fail(`unsupported broad-layer status for ${jurisdiction.code}`);
    byCode.set(jurisdiction.code, { jurisdiction, dataset });
  }
  if (byCode.size !== 51 || STATE_CODES.some((code) => !byCode.has(code))) fail("matrix must contain exactly 50 states and DC");
  const backlogByCode = new Map(backlog.states.map((row) => [row.assessment?.state_abbreviation, row]));
  if (backlogByCode.size !== 40 || [...backlogByCode.keys()].some((code) => !STATE_CODES.includes(code)) || backlog.states.some((row, index) => row.priority !== index + 1 || row.first_wave !== (index < 10))) fail("backlog state roster or priority is invalid");
  const gaps = [];
  const admitted = [];
  for (const code of STATE_CODES) {
    const { jurisdiction, dataset } = byCode.get(code);
    const backlogRow = backlogByCode.get(code);
    if (dataset.availability_status === "available") {
      if (backlogRow) fail(`admitted jurisdiction ${code} appears in the current backlog`);
      admitted.push({
        state_abbreviation: code,
        state_name: jurisdiction.name,
        matrix_status: "available",
        historical_backlog_member: false,
        backlog_priority: null,
        broad_evidence: structuredClone(dataset.broad_organization_evidence),
        assessment_snapshot: null,
      });
      continue;
    }
    if (!backlogRow) fail(`matrix gap ${code} has no validated backlog assessment`);
    const assessment = backlogRow.assessment;
    if (assessment.state_abbreviation !== code || assessment.broad_layer_production_ready !== false || !Array.isArray(assessment.unresolved_gates) || !Array.isArray(assessment.required_exclusions)) fail(`assessment provenance is invalid for matrix gap ${code}`);
    gaps.push({
      state_abbreviation: code,
      state_name: jurisdiction.name,
      matrix_availability_status: dataset.availability_status,
      matrix_gap_reason: dataset.gap_reason,
      backlog_priority: backlogRow.priority,
      backlog_first_wave: backlogRow.first_wave,
      unresolved_gates: structuredClone(assessment.unresolved_gates),
      required_exclusions: structuredClone(assessment.required_exclusions),
      assessment_provenance: {
        assessment_id: assessment.assessment_id,
        assessment_kind: assessment.assessment_kind,
        observed_at: assessment.observed_at,
        coverage_release_id: assessment.coverage_release_id,
        source_artifacts: structuredClone(assessment.source_artifacts),
        official_urls: structuredClone(assessment.official_urls),
      },
      assessment_snapshot: structuredClone(assessment),
      authority: { acquisition_authorized: false, source_actions_performed: 0, current_pointer_changed: false },
    });
  }
  const currentGaps = [...byCode.values()].filter(({ dataset }) => dataset.availability_status !== "available").length;
  if (gaps.length !== currentGaps || gaps.length !== 40 || admitted.length !== 11) fail("matrix/backlog conservation differs from the audited 40 gaps and 11 admitted broad layers");
  return {
    schema_version: BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_SCHEMA,
    dataset_id: BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET,
    observed_at: matrix.created_at,
    purpose: "Current-matrix planning projection of the verified acquisition backlog and its 40 assessment priorities.",
    source_backlog: { dataset_id: backlogManifest.dataset_id, release_id: backlogManifest.release_id, manifest_sha256: sha256(backlogManifestBytes), artifact_sha256: backlogManifest.artifacts[0].sha256, assessment_catalog_sha256: backlogManifest.assessment_catalog_sha256 },
    source_matrix: { dataset_id: matrixManifest.dataset_id, release_id: matrixManifest.release_id, schema_version: matrixManifest.schema_version, manifest_sha256: matrixManifestSha256, artifact_sha256: matrixArtifactSha256, denominator_version: matrix.denominator.version },
    scope: { jurisdictions: 51, broad_layers_admitted: 11, current_broad_layer_gaps: gaps.length, historical_backlog_jurisdictions: backlog.states.length, matrix_gap_subset_of_backlog: true, acquisition_authorized: false, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false },
    admitted_jurisdictions: admitted,
    gaps,
  };
}

export function buildBroadOrganizationMatrixGapProjectionManifest(projection) {
  const artifactBytes = jsonBytes(projection);
  const artifactSha256 = sha256(artifactBytes);
  const observedToken = projection.observed_at.replace(/[^A-Za-z0-9._-]/g, "-");
  const releaseId = `${BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET}-${observedToken}-${artifactSha256.slice(0, 12)}`;
  return { schema_version: `${BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET}-manifest@1.0.0`, dataset_id: BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET, release_id: releaseId, status: "published-local-derived-projection", source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, source_backlog_release_id: projection.source_backlog.release_id, source_backlog_manifest_sha256: projection.source_backlog.manifest_sha256, source_matrix_release_id: projection.source_matrix.release_id, source_matrix_manifest_sha256: projection.source_matrix.manifest_sha256, jurisdiction_count: 51, admitted_broad_layer_count: 11, current_gap_count: 40, artifacts: [{ path: "gap-projection.json", bytes: artifactBytes.length, sha256: artifactSha256 }] };
}

async function loadVerifiedSources({ backlogRoot } = {}) {
  const matrix = await loadCurrentBroadOrganizationGapEvidence();
  const backlog = await loadCurrentBroadOrganizationAcquisitionBacklog({ backlogRoot, matrixSource: matrix });
  const projection = deriveBroadOrganizationMatrixGapProjection(backlog.backlog, backlog.manifestBytes, backlog.manifest, matrix.report, matrix.manifestBytes, matrix.manifest, matrix.artifactSha256);
  return { projection, manifest: buildBroadOrganizationMatrixGapProjectionManifest(projection) };
}

export async function buildBroadOrganizationMatrixGapProjection({ outputRoot = DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, signal } = {}) {
  const source = await loadVerifiedSources();
  const safeRoot = await assertDataDirectory(outputRoot, { create: true });
  const releases = await assertDataDirectory(path.join(safeRoot, "releases"), { create: true });
  const directory = path.join(releases, source.manifest.release_id);
  try { const st = await lstat(directory); if (!st.isDirectory() || st.isSymbolicLink()) fail("pre-existing release is not a real directory"); await verifyProjectionRelease(path.join(directory, "manifest.json"), { expected: source }); return { projection: source.projection, manifest: source.manifest, releaseDirectory: directory, reused_existing_release: true }; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = path.join(releases, `.${source.manifest.release_id}.publish-lock`);
  await mkdir(lock);
  const staging = path.join(releases, `.${source.manifest.release_id}.staging-${randomUUID()}`);
  let owns = false;
  try {
    signal?.throwIfAborted();
    await mkdir(staging); owns = true;
    await writeFile(path.join(staging, "gap-projection.json"), jsonBytes(source.projection), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(staging, "manifest.json"), jsonBytes(source.manifest), { flag: "wx" });
    await verifyProjectionRelease(path.join(staging, "manifest.json"), { allowOwnedStaging: true, expected: source });
    try { await lstat(directory); fail("release identity appeared during publication"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(staging, directory); owns = false;
    await verifyProjectionRelease(path.join(directory, "manifest.json"), { expected: source });
  } finally { if (owns) await rm(staging, { recursive: true, force: true }); await rmdir(lock); }
  return { projection: source.projection, manifest: source.manifest, releaseDirectory: directory, reused_existing_release: false };
}

async function verifyProjectionRelease(manifestPath, { allowOwnedStaging = false, expected = null } = {}) {
  await assertDataDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) fail("manifest must be a singly linked regular file");
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString("utf8"));
  const keys = ["schema_version", "dataset_id", "release_id", "status", "source_actions_performed", "network_requests", "current_pointer_changed", "source_backlog_release_id", "source_backlog_manifest_sha256", "source_matrix_release_id", "source_matrix_manifest_sha256", "jurisdiction_count", "admitted_broad_layer_count", "current_gap_count", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...keys].sort()) || manifest.schema_version !== `${BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET}-manifest@1.0.0` || manifest.dataset_id !== BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET || manifest.status !== "published-local-derived-projection" || manifest.source_actions_performed !== 0 || manifest.network_requests !== 0 || manifest.current_pointer_changed !== false) fail("manifest identity, schema, or authority boundary is invalid");
  const directory = path.dirname(manifestPath), dirStat = await lstat(directory), entries = await readdir(directory, { withFileTypes: true });
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || entries.length !== 2 || entries.some((entry) => !entry.isFile() || !["gap-projection.json", "manifest.json"].includes(entry.name))) fail("release must contain only the two declared regular files");
  const artifactPath = path.join(directory, "gap-projection.json"), artifactStat = await lstat(artifactPath);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.nlink !== 1 || manifest.artifacts?.length !== 1 || manifest.artifacts[0].path !== "gap-projection.json") fail("artifact inventory is invalid");
  const artifactBytes = await readFile(artifactPath);
  if (artifactBytes.length !== manifest.artifacts[0].bytes || sha256(artifactBytes) !== manifest.artifacts[0].sha256) fail("projection checksum mismatch");
  const basename = path.basename(directory), staged = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(basename);
  if (basename !== manifest.release_id && !(allowOwnedStaging && staged)) fail("release directory identity mismatch");
  const manifestSha256 = sha256(manifestBytes);
  if (!expected && isPinnedAuthorizationHistory(manifest.dataset_id, manifest.release_id, manifestSha256)) {
    return { manifest, manifestSha256, projection: JSON.parse(artifactBytes) };
  }
  expected ??= await loadVerifiedSources();
  if (!manifestBytes.equals(jsonBytes(expected.manifest)) || !artifactBytes.equals(jsonBytes(expected.projection))) fail("projection differs from the independently verified current matrix/backlog join or widens authority");
  if (!HASH.test(expected.projection.source_matrix.manifest_sha256) || !HASH.test(expected.projection.source_backlog.manifest_sha256)) fail("source lineage hashes are malformed");
  return { manifest, manifestSha256, projection: expected.projection };
}

export async function verifyBroadOrganizationMatrixGapProjection(manifestPath) {
  return verifyProjectionRelease(manifestPath);
}

export async function loadCurrentBroadOrganizationMatrixGapProjection({
  projectionRoot = DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT,
  backlogRoot,
} = {}) {
  const rows = await readAuthorizationViewReleases(projectionRoot, BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET, "gap-projection.json");
  const [newest] = newestAuthorizationCohort(rows, (row) => row.manifest.release_id);
  const expected = await loadVerifiedSources({ backlogRoot });
  if (newest.manifest.release_id !== expected.manifest.release_id) fail("newest projection for the current backlog and goal-completion matrix is unavailable");
  const verified = await verifyProjectionRelease(newest.manifestPath, { expected });
  const manifestBytes = jsonBytes(verified.manifest);
  if (verified.manifestSha256 !== newest.manifestSha256) fail("newest projection changed during verification");
  return { ...verified, manifestBytes, artifactSha256: verified.manifest.artifacts[0].sha256, instant: newest.instant };
}
