import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";

export const CURRENT_MATRIX_AUTHORIZATION_WAVE_SCHEMA = "broad-organization-current-matrix-authorization-wave@1.0.0";
export const CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET = "broad-organization-current-matrix-authorization-wave";
export const DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT = path.join(APP_ROOT, "data", CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET);
export const CURRENT_MATRIX_AUTHORIZATION_WAVE_SIZE = 10;
const fail = (message) => { throw new Error(`Current-matrix authorization wave is invalid: ${message}`); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const inside = (parent, candidate) => { const relative = path.relative(parent, candidate); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); };

async function assertDataDirectory(directory, { create = false } = {}) {
  const data = path.join(await realpath(APP_ROOT), "data"), resolved = path.resolve(directory);
  if (!inside(data, resolved) || resolved === data) fail("output must be a child of canonical APP_ROOT/data");
  let current = path.dirname(data);
  for (const segment of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current); stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`linked or non-directory output ancestry: ${current}`);
  }
  return resolved;
}

async function newestVerifiedProjection() {
  const releases = path.join(DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, "releases");
  const entries = await readdir(releases, { withFileTypes: true });
  const candidates = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith("broad-organization-matrix-gap-projection-")).map((entry) => entry.name).sort().reverse();
  if (!candidates.length || candidates.length > 256) fail("verified current matrix-gap projection is absent or release inventory requires review");
  const directory = path.join(releases, candidates[0]);
  if (await realpath(directory) !== directory) fail("matrix-gap projection release path is not canonical");
  const manifestPath = path.join(directory, "manifest.json"), verified = await verifyBroadOrganizationMatrixGapProjection(manifestPath);
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifactBytes = await readFile(path.join(directory, "gap-projection.json"));
  if (!artifactBytes.equals(jsonBytes(verified.projection)) || hash(artifactBytes) !== manifest.artifacts?.[0]?.sha256) fail("verified matrix-gap projection changed after verification");
  return { projection: verified.projection, manifest, manifestBytes, artifactSha256: hash(artifactBytes), manifestPath };
}

export function deriveCurrentMatrixAuthorizationWave(projection, projectionManifestBytes, projectionManifest, projectionArtifactSha256, { waveNumber = 1, priorWave = null } = {}) {
  if (![1, 2].includes(waveNumber)) fail("only the first two explicitly governed ten-state waves are defined");
  if (projection?.schema_version !== "broad-organization-matrix-gap-projection@1.0.0" || projection.dataset_id !== "broad-organization-matrix-gap-projection" || projection.scope?.jurisdictions !== 51 || projection.scope?.broad_layers_admitted !== 11 || projection.scope?.current_broad_layer_gaps !== 40 || projection.scope?.acquisition_authorized !== false || projection.scope?.source_actions_performed !== 0 || projection.scope?.network_requests !== 0 || projection.scope?.current_pointer_changed !== false) fail("verified 40-gap projection identity or authority boundary is invalid");
  const artifact = jsonBytes(projection);
  if (projectionManifest?.dataset_id !== projection.dataset_id || projectionManifest?.release_id !== `${projection.dataset_id}-${projection.observed_at.replace(/[^A-Za-z0-9._-]/g, "-")}-${hash(artifact).slice(0, 12)}` || projectionManifest.artifacts?.length !== 1 || projectionManifest.artifacts[0].path !== "gap-projection.json" || projectionManifest.artifacts[0].bytes !== artifact.length || projectionManifest.artifacts[0].sha256 !== projectionArtifactSha256 || projectionArtifactSha256 !== hash(artifact) || !Buffer.from(projectionManifestBytes).equals(jsonBytes(projectionManifest))) fail("projection manifest/artifact binding drifted");
  if (!Array.isArray(projection.gaps) || projection.gaps.length !== 40) fail("projection no longer contains exactly 40 current gaps");
  const sorted = [...projection.gaps].sort((left, right) => left.backlog_priority - right.backlog_priority);
  if (new Set(sorted.map((row) => row.state_abbreviation)).size !== 40 || new Set(sorted.map((row) => row.backlog_priority)).size !== 40 || sorted.some((row) => !Number.isSafeInteger(row.backlog_priority) || row.backlog_priority < 1 || row.backlog_priority > 43)) fail("gap roster or historical priority is invalid");
  let priorWaveBinding = null;
  if (waveNumber === 2) {
    if (!priorWave?.wave || !priorWave?.manifest || !priorWave?.manifestBytes || !priorWave?.artifactSha256) fail("a verified published wave-one release is required before deriving wave two");
    const prior = priorWave.wave;
    if (prior.scope?.wave_number !== 1 || prior.scope?.matrix_gap_jurisdictions !== 40 || prior.scope?.selected_jurisdictions !== 10 || prior.scope?.remaining_current_gaps !== 30 || prior.scope?.conservation_total !== 40 || prior.states?.length !== 10 || JSON.stringify(prior.wave_state_abbreviations) !== JSON.stringify(sorted.slice(0, 10).map((row) => row.state_abbreviation)) || prior.source_projection?.release_id !== projectionManifest.release_id || prior.source_projection?.manifest_sha256 !== hash(projectionManifestBytes) || prior.source_projection?.artifact_sha256 !== projectionArtifactSha256 || priorWave.manifest.schema_version !== `${CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET}-manifest@1.0.0` || priorWave.manifest.status !== "published-local-derived-approval-specification" || priorWave.manifest.source_actions_performed !== 0 || priorWave.manifest.network_requests !== 0 || priorWave.manifest.current_pointer_changed !== false || priorWave.manifest.acquisition_authorized !== false || priorWave.manifest.jurisdiction_count !== 10 || priorWave.manifest.source_gap_count !== 40 || priorWave.manifest.remaining_gap_count !== 30 || priorWave.manifest.source_projection_release_id !== projectionManifest.release_id || priorWave.manifest.source_projection_manifest_sha256 !== hash(projectionManifestBytes) || priorWave.manifest.source_projection_artifact_sha256 !== projectionArtifactSha256 || priorWave.manifest.release_id !== priorWave.manifest.dataset_id + `-${prior.observed_at.replace(/[^A-Za-z0-9._-]/g, "-")}-${hash(jsonBytes(prior)).slice(0, 12)}` || !Buffer.from(priorWave.manifestBytes).equals(jsonBytes(priorWave.manifest)) || priorWave.manifest.artifacts?.[0]?.sha256 !== priorWave.artifactSha256 || priorWave.artifactSha256 !== hash(jsonBytes(prior)) || !Buffer.from(priorWave.artifactBytes).equals(jsonBytes(prior))) fail("published wave-one release does not match the current projection or exact first ten priorities");
    priorWaveBinding = { release_id: priorWave.manifest.release_id, manifest_sha256: hash(priorWave.manifestBytes), artifact_sha256: priorWave.artifactSha256, wave_state_abbreviations: [...prior.wave_state_abbreviations] };
  }
  const start = (waveNumber - 1) * CURRENT_MATRIX_AUTHORIZATION_WAVE_SIZE;
  const selected = sorted.slice(start, start + CURRENT_MATRIX_AUTHORIZATION_WAVE_SIZE);
  const expectedByWave = {
    1: ["IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT", "WA", "OK"],
    2: ["AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"],
  };
  if (JSON.stringify(selected.map((row) => row.state_abbreviation)) !== JSON.stringify(expectedByWave[waveNumber]) || (waveNumber === 1 && ["AK", "DC", "TX"].some((code) => selected.some((row) => row.state_abbreviation === code)))) fail(`current wave ${waveNumber} is not the exact next ten historical priorities among current gaps`);
  if (waveNumber === 2 && (selected.length !== 10 || selected.some((row) => priorWave.wave.wave_state_abbreviations.includes(row.state_abbreviation)) || JSON.stringify([...priorWave.wave.wave_state_abbreviations, ...selected.map((row) => row.state_abbreviation)]) !== JSON.stringify(sorted.slice(0, 20).map((row) => row.state_abbreviation)))) fail("wave two overlaps, skips, or reorders the current priority sequence");
  const states = selected.map((row, index) => {
    if (!row.assessment_snapshot || row.assessment_snapshot.state_abbreviation !== row.state_abbreviation || JSON.stringify(row.unresolved_gates) !== JSON.stringify(row.assessment_snapshot.unresolved_gates) || JSON.stringify(row.required_exclusions) !== JSON.stringify(row.assessment_snapshot.required_exclusions)) fail(`assessment/gate provenance or exclusions drifted for ${row.state_abbreviation}`);
    return {
      wave_position: index + 1,
      state_abbreviation: row.state_abbreviation,
      state_name: row.state_name,
      historical_backlog_priority: row.backlog_priority,
      matrix_gap_status: row.matrix_availability_status,
      approval_status: "HOLD",
      item_kind: "approval-only",
      acquisition_authorized: false,
      unresolved_gates: structuredClone(row.unresolved_gates),
      gate_items: row.unresolved_gates.map((gate, gateIndex) => ({ item_id: `${row.state_abbreviation.toLowerCase()}-${gate}`, item_index: gateIndex + 1, gate_key: gate, item_kind: "approval-only", status: "HOLD", acquisition_authorized: false, source_action_authorized: false, authority_note: "No source, contact, download, payment, record-request, or production action is authorized by this item." })),
      required_exclusions: structuredClone(row.required_exclusions),
      assessment_provenance: structuredClone(row.assessment_provenance),
      assessment_snapshot: structuredClone(row.assessment_snapshot),
    };
  });
  const held = sorted.slice(start + CURRENT_MATRIX_AUTHORIZATION_WAVE_SIZE);
  return {
    schema_version: CURRENT_MATRIX_AUTHORIZATION_WAVE_SCHEMA,
    dataset_id: CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET,
    observed_at: projection.observed_at,
    purpose: "Current-matrix-aligned approval-only wave specification. Every item remains HOLD; this artifact grants no acquisition or execution authority.",
    source_projection: { dataset_id: projectionManifest.dataset_id, release_id: projectionManifest.release_id, manifest_sha256: hash(projectionManifestBytes), artifact_sha256: projectionArtifactSha256, matrix_release_id: projection.source_matrix.release_id, matrix_manifest_sha256: projection.source_matrix.manifest_sha256, backlog_release_id: projection.source_backlog.release_id, backlog_manifest_sha256: projection.source_backlog.manifest_sha256 },
    ...(waveNumber === 2 ? { prior_wave: priorWaveBinding } : {}),
    scope: {
      matrix_gap_jurisdictions: 40,
      wave_number: waveNumber,
      wave_size: CURRENT_MATRIX_AUTHORIZATION_WAVE_SIZE,
      selected_jurisdictions: states.length,
      ...(waveNumber === 2 ? { prior_wave_jurisdictions: priorWave.wave.states.length } : {}),
      remaining_current_gaps: held.length,
      conservation_total: (waveNumber === 2 ? priorWave.wave.states.length : 0) + states.length + held.length,
      acquisition_authorized: false,
      source_actions_performed: 0,
      network_requests: 0,
      current_pointer_changed: false,
      approval_only: true,
      status: "HOLD",
    },
    wave_state_abbreviations: states.map((row) => row.state_abbreviation),
    states,
  };
}

export function buildCurrentMatrixAuthorizationWaveManifest(wave) {
  const bytes = jsonBytes(wave), digest = hash(bytes), observed = wave.observed_at.replace(/[^A-Za-z0-9._-]/g, "-");
  const releaseId = `${CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET}-${observed}-${digest.slice(0, 12)}`;
  return { schema_version: `${CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET}-manifest@1.0.0`, dataset_id: CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET, release_id: releaseId, status: "published-local-derived-approval-specification", source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, acquisition_authorized: false, source_projection_release_id: wave.source_projection.release_id, source_projection_manifest_sha256: wave.source_projection.manifest_sha256, source_projection_artifact_sha256: wave.source_projection.artifact_sha256, jurisdiction_count: 10, source_gap_count: 40, remaining_gap_count: wave.scope.remaining_current_gaps, artifacts: [{ path: "authorization-wave.json", bytes: bytes.length, sha256: digest }] };
}

async function loadCurrentWave(waveNumber = 1) {
  const source = await newestVerifiedProjection();
  let priorWave = null;
  if (waveNumber === 2) {
    const first = deriveCurrentMatrixAuthorizationWave(source.projection, source.manifestBytes, source.manifest, source.artifactSha256);
    const firstManifest = buildCurrentMatrixAuthorizationWaveManifest(first);
    const firstManifestPath = path.join(DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT, "releases", firstManifest.release_id, "manifest.json");
    const firstVerified = await verifyCurrentMatrixAuthorizationWave(firstManifestPath);
    const firstManifestBytes = await readFile(firstManifestPath);
    const firstArtifactBytes = await readFile(path.join(path.dirname(firstManifestPath), "authorization-wave.json"));
    priorWave = { wave: firstVerified.wave, manifest: firstVerified.manifest, manifestBytes: firstManifestBytes, artifactBytes: firstArtifactBytes, artifactSha256: hash(firstArtifactBytes) };
    if (!firstArtifactBytes.equals(jsonBytes(first)) || !firstManifestBytes.equals(jsonBytes(firstManifest))) fail("published wave-one release is not the exact current first ten");
  }
  const wave = deriveCurrentMatrixAuthorizationWave(source.projection, source.manifestBytes, source.manifest, source.artifactSha256, { waveNumber, priorWave });
  return { ...source, wave, manifest: buildCurrentMatrixAuthorizationWaveManifest(wave) };
}

export async function buildCurrentMatrixAuthorizationWave({ outputRoot = DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT, signal, waveNumber = 1 } = {}) {
  signal?.throwIfAborted();
  const source = await loadCurrentWave(waveNumber);
  signal?.throwIfAborted();
  const safeRoot = await assertDataDirectory(outputRoot, { create: true });
  const releases = await assertDataDirectory(path.join(safeRoot, "releases"), { create: true });
  const releaseDirectory = path.join(releases, source.manifest.release_id);
  try { const stat = await lstat(releaseDirectory); if (!stat.isDirectory() || stat.isSymbolicLink()) fail("pre-existing release identity is not a real directory"); await verifyCurrentMatrixAuthorizationWave(path.join(releaseDirectory, "manifest.json")); return { wave: source.wave, manifest: source.manifest, releaseDirectory, reused_existing_release: true }; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = path.join(releases, `.${source.manifest.release_id}.publish-lock`);
  await mkdir(lock);
  const staging = path.join(releases, `.${source.manifest.release_id}.staging-${randomUUID()}`);
  let ownsStaging = false;
  try {
    signal?.throwIfAborted();
    await mkdir(staging); ownsStaging = true;
    await writeFile(path.join(staging, "authorization-wave.json"), jsonBytes(source.wave), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(staging, "manifest.json"), jsonBytes(source.manifest), { flag: "wx" });
    signal?.throwIfAborted();
    await verifyCurrentMatrixAuthorizationWave(path.join(staging, "manifest.json"), { allowOwnedStaging: true });
    try { await lstat(releaseDirectory); fail("release identity appeared during publication"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(staging, releaseDirectory); ownsStaging = false;
    await verifyCurrentMatrixAuthorizationWave(path.join(releaseDirectory, "manifest.json"));
  } finally { if (ownsStaging) await rm(staging, { recursive: true, force: true }); await rmdir(lock); }
  return { wave: source.wave, manifest: source.manifest, releaseDirectory, reused_existing_release: false };
}

export async function verifyCurrentMatrixAuthorizationWave(manifestPath, { allowOwnedStaging = false } = {}) {
  await assertDataDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) fail("manifest must be a singly linked regular file");
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString("utf8"));
  const keys = ["schema_version", "dataset_id", "release_id", "status", "source_actions_performed", "network_requests", "current_pointer_changed", "acquisition_authorized", "source_projection_release_id", "source_projection_manifest_sha256", "source_projection_artifact_sha256", "jurisdiction_count", "source_gap_count", "remaining_gap_count", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...keys].sort()) || manifest.schema_version !== `${CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET}-manifest@1.0.0` || manifest.dataset_id !== CURRENT_MATRIX_AUTHORIZATION_WAVE_DATASET || manifest.status !== "published-local-derived-approval-specification" || manifest.source_actions_performed !== 0 || manifest.network_requests !== 0 || manifest.current_pointer_changed !== false || manifest.acquisition_authorized !== false) fail("manifest identity or authority boundary is invalid");
  const directory = path.dirname(manifestPath), dirStat = await lstat(directory), entries = await readdir(directory, { withFileTypes: true });
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || entries.length !== 2 || entries.some((entry) => !entry.isFile() || !["authorization-wave.json", "manifest.json"].includes(entry.name))) fail("release must contain only the declared regular files");
  const artifactPath = path.join(directory, "authorization-wave.json"), artifactStat = await lstat(artifactPath);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.nlink !== 1 || manifest.artifacts?.length !== 1 || manifest.artifacts[0].path !== "authorization-wave.json") fail("artifact inventory is invalid");
  const artifactBytes = await readFile(artifactPath);
  if (artifactBytes.length !== manifest.artifacts[0].bytes || hash(artifactBytes) !== manifest.artifacts[0].sha256) fail("authorization wave checksum mismatch");
  const artifactWave = JSON.parse(artifactBytes.toString("utf8")), waveNumber = artifactWave.scope?.wave_number;
  if (![1, 2].includes(waveNumber)) fail("artifact wave number is invalid");
  const expected = await loadCurrentWave(waveNumber);
  if (JSON.stringify(manifest) !== JSON.stringify(expected.manifest) || !artifactBytes.equals(jsonBytes(expected.wave))) fail("authorization wave differs from exact current projection priority selection or widens authority");
  const name = path.basename(directory), staging = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(name);
  if (name !== manifest.release_id && !(allowOwnedStaging && staging)) fail("release directory identity mismatch");
  return { manifest, wave: expected.wave };
}
