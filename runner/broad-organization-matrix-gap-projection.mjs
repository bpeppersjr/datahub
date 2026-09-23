import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { verifyBroadOrganizationAcquisitionBacklog, DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT } from "./broad-organization-acquisition-backlog.mjs";
import { readNewestNationalGoalCompletionMatrix } from "./national-goal-completion-view.mjs";
import { verifyNationalGoalCompletionMatrix } from "./national-goal-completion-matrix.mjs";

export const BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_SCHEMA = "broad-organization-matrix-gap-projection@1.0.0";
export const BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET = "broad-organization-matrix-gap-projection";
export const DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET);
const STATE_CODES = Object.freeze("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const HASH = /^[a-f0-9]{64}$/;
const RELEASE_ID = /^national-goal-completion-\d{14}-[a-f0-9]{8}$/;
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

async function currentBacklog() {
  const releases = path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases");
  const entries = await readdir(releases, { withFileTypes: true });
  const candidates = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith("broad-organization-acquisition-backlog-")).map((entry) => entry.name).sort().reverse();
  if (!candidates.length || candidates.length > 256) fail("canonical backlog release inventory is absent or requires review");
  const manifestPath = path.join(releases, candidates[0], "manifest.json");
  const verified = await verifyBroadOrganizationAcquisitionBacklog(manifestPath);
  const manifestBytes = await readFile(manifestPath);
  return { backlog: verified.backlog, manifest: verified.manifest, manifestBytes, manifestPath, artifactSha256: verified.manifest.artifacts[0].sha256 };
}

async function currentMatrix() {
  const loaded = await readNewestNationalGoalCompletionMatrix({ root: APP_ROOT });
  if (!loaded) fail("no verified current national goal-completion matrix exists");
  const manifestPath = path.resolve(loaded.manifestPath);
  const canonicalMatrixRoot = path.join(await realpath(APP_ROOT), "data", "national-goal-completion-matrix", "releases");
  if (!inside(canonicalMatrixRoot, manifestPath) || !RELEASE_ID.test(path.basename(path.dirname(manifestPath)))) fail("matrix is not the exact canonical current release");
  const verified = await verifyNationalGoalCompletionMatrix(manifestPath, { root: APP_ROOT });
  if (verified.schema_version !== "national-goal-completion-matrix@1.3.0" || verified.release_id !== loaded.report.release_id) fail("current matrix version or identity drifted");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifactBytes = await readFile(path.join(path.dirname(manifestPath), "report.json"));
  if (sha256(artifactBytes) !== verified.report_sha256 || !artifactBytes.equals(jsonBytes(verified.report))) fail("verified matrix artifact changed during projection");
  return { report: verified.report, manifest, manifestBytes, manifestPath, artifactSha256: verified.report_sha256 };
}

export function deriveBroadOrganizationMatrixGapProjection(backlog, backlogManifestBytes, backlogManifest, matrix, matrixManifestBytes, matrixManifest, matrixArtifactSha256) {
  if (backlog?.dataset_id !== "broad-organization-acquisition-backlog" || backlog.states?.length !== 43 || backlog.scope?.acquisition_authorized !== false || backlog.scope?.source_actions_performed !== 0) fail("verified 43-jurisdiction backlog contract is invalid");
  if (!backlogManifest?.artifacts?.[0] || backlogManifest.artifacts[0].path !== "backlog.json" || backlogManifest.artifacts[0].bytes !== jsonBytes(backlog).length || backlogManifest.artifacts[0].sha256 !== sha256(jsonBytes(backlog)) || !Buffer.from(backlogManifestBytes).equals(jsonBytes(backlogManifest))) fail("backlog source bytes or artifact binding drifted");
  if (matrix?.schema_version !== "national-goal-completion-matrix@1.3.0" || matrix.release_id !== matrixManifest?.release_id || matrix.jurisdictions?.length !== 51 || matrixManifest?.dataset_id !== "national-goal-completion-matrix" || matrixManifest?.schema_version !== matrix.schema_version || matrixManifest?.production_pointers_changed !== false || matrixManifest?.network_requests !== 0) fail("verified current matrix identity or boundary is invalid");
  if (!matrixManifest?.artifacts?.[0] || matrixManifest.artifacts[0].path !== "report.json" || matrixManifest.artifacts[0].bytes !== jsonBytes(matrix).length || matrixManifest.artifacts[0].sha256 !== matrixArtifactSha256 || matrixArtifactSha256 !== sha256(jsonBytes(matrix)) || !Buffer.from(matrixManifestBytes).equals(jsonBytes(matrixManifest))) fail("matrix source bytes or artifact binding drifted");
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
  if (backlogByCode.size !== 43 || [...backlogByCode.keys()].some((code) => !STATE_CODES.includes(code))) fail("backlog state roster is invalid");
  const gaps = [];
  const admitted = [];
  for (const code of STATE_CODES) {
    const { jurisdiction, dataset } = byCode.get(code);
    const backlogRow = backlogByCode.get(code);
    if (dataset.availability_status === "available") {
      admitted.push({
        state_abbreviation: code,
        state_name: jurisdiction.name,
        matrix_status: "available",
        historical_backlog_member: Boolean(backlogRow),
        backlog_priority: backlogRow?.priority ?? null,
        broad_evidence: structuredClone(dataset.broad_organization_evidence),
        assessment_snapshot: backlogRow ? structuredClone(backlogRow.assessment) : null,
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
  if (gaps.length !== currentGaps || gaps.length !== 40 || admitted.length !== 11 || ["AK", "DC", "TX"].some((code) => !admitted.some((row) => row.state_abbreviation === code && row.historical_backlog_member))) fail("matrix/backlog conservation differs from the audited 40 gaps and 11 admitted broad layers");
  return {
    schema_version: BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_SCHEMA,
    dataset_id: BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_DATASET,
    observed_at: matrix.created_at,
    purpose: "Current-matrix-aligned planning projection; older 43-jurisdiction backlog and authorization program releases remain unchanged and historical.",
    source_backlog: { dataset_id: backlogManifest.dataset_id, release_id: backlogManifest.release_id, manifest_sha256: sha256(backlogManifestBytes), artifact_sha256: backlogManifest.artifacts[0].sha256, assessment_catalog_sha256: backlogManifest.assessment_catalog_sha256 },
    source_matrix: { dataset_id: matrixManifest.dataset_id, release_id: matrixManifest.release_id, schema_version: matrixManifest.schema_version, manifest_sha256: sha256(matrixManifestBytes), artifact_sha256: matrixArtifactSha256, denominator_version: matrix.denominator.version },
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

async function loadVerifiedSources() {
  const [backlog, matrix] = await Promise.all([currentBacklog(), currentMatrix()]);
  const projection = deriveBroadOrganizationMatrixGapProjection(backlog.backlog, backlog.manifestBytes, backlog.manifest, matrix.report, matrix.manifestBytes, matrix.manifest, matrix.artifactSha256);
  return { ...backlog, matrix, projection, manifest: buildBroadOrganizationMatrixGapProjectionManifest(projection) };
}

export async function buildBroadOrganizationMatrixGapProjection({ outputRoot = DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, signal } = {}) {
  const source = await loadVerifiedSources();
  const safeRoot = await assertDataDirectory(outputRoot, { create: true });
  const releases = await assertDataDirectory(path.join(safeRoot, "releases"), { create: true });
  const directory = path.join(releases, source.manifest.release_id);
  try { const st = await lstat(directory); if (!st.isDirectory() || st.isSymbolicLink()) fail("pre-existing release is not a real directory"); await verifyBroadOrganizationMatrixGapProjection(path.join(directory, "manifest.json")); return { projection: source.projection, manifest: source.manifest, releaseDirectory: directory, reused_existing_release: true }; } catch (error) { if (error.code !== "ENOENT") throw error; }
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
    await verifyBroadOrganizationMatrixGapProjection(path.join(staging, "manifest.json"), { allowOwnedStaging: true });
    try { await lstat(directory); fail("release identity appeared during publication"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(staging, directory); owns = false;
    await verifyBroadOrganizationMatrixGapProjection(path.join(directory, "manifest.json"));
  } finally { if (owns) await rm(staging, { recursive: true, force: true }); await rmdir(lock); }
  return { projection: source.projection, manifest: source.manifest, releaseDirectory: directory, reused_existing_release: false };
}

export async function verifyBroadOrganizationMatrixGapProjection(manifestPath, { allowOwnedStaging = false } = {}) {
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
  const expected = await loadVerifiedSources();
  if (JSON.stringify(manifest) !== JSON.stringify(expected.manifest) || !artifactBytes.equals(jsonBytes(expected.projection))) fail("projection differs from the independently verified current matrix/backlog join or widens authority");
  const basename = path.basename(directory), staged = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(basename);
  if (basename !== manifest.release_id && !(allowOwnedStaging && staged)) fail("release directory identity mismatch");
  if (!HASH.test(expected.projection.source_matrix.manifest_sha256) || !HASH.test(expected.projection.source_backlog.manifest_sha256)) fail("source lineage hashes are malformed");
  return { manifest, projection: expected.projection };
}
