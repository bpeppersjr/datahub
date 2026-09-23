import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";
import { verifyCurrentMatrixAuthorizationWave } from "./broad-organization-current-matrix-authorization-wave.mjs";

const DATASET = "broad-organization-current-matrix-authorization-wave";
const WAVE_ROSTERS = Object.freeze([
  Object.freeze(["IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT", "WA", "OK"]),
  Object.freeze(["AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"]),
  Object.freeze(["MI", "MN", "MO", "MT", "NC", "ND", "NH", "NJ", "NM", "OH"]),
  Object.freeze(["RI", "SC", "SD", "TN", "VA", "VT", "WI", "WV", "WY", "NE"]),
]);

function fail(message) { throw new Error(`Current-matrix authorization-chain view unavailable: ${message}`); }
const isInside = (parent, candidate) => { const rel = path.relative(parent, candidate); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel)); };

function projectCurrentMatrixAuthorizationChain(waves, projection, projectionManifest) {
  if (!Array.isArray(waves) || waves.length !== 4 || projection?.dataset_id !== "broad-organization-matrix-gap-projection" || projection.scope?.jurisdictions !== 51 || projection.scope?.broad_layers_admitted !== 11 || projection.scope?.current_broad_layer_gaps !== 40) fail("current projection or four-wave inventory is invalid");
  const seen = new Set();
  let gateItemCount = 0;
  const viewWaves = waves.map(({ verified, manifestBytes }) => {
    const { manifest, wave } = verified;
    const number = wave.scope?.wave_number;
    const expectedCodes = WAVE_ROSTERS[number - 1];
    if (!Number.isInteger(number) || number < 1 || number > 4 || JSON.stringify(wave.wave_state_abbreviations) !== JSON.stringify(expectedCodes) || wave.states?.length !== 10 || wave.scope.matrix_gap_jurisdictions !== 40 || wave.scope.selected_jurisdictions !== 10 || wave.scope.remaining_current_gaps !== 40 - (number * 10) || wave.scope.conservation_total !== 40 || wave.scope.acquisition_authorized !== false || wave.scope.source_actions_performed !== 0 || wave.scope.network_requests !== 0 || wave.scope.current_pointer_changed !== false || wave.scope.approval_only !== true || wave.scope.status !== "HOLD") fail(`wave ${number} roster, conservation, or authority boundary is invalid`);
    if (number === 1 ? wave.prior_wave !== undefined || wave.scope.prior_wave_jurisdictions !== undefined : wave.scope.prior_wave_jurisdictions !== (number - 1) * 10) fail(`wave ${number} prior-wave count is invalid`);
    if (wave.source_projection?.release_id !== projectionManifest.release_id || wave.source_projection?.manifest_sha256 !== waves[0].verified.wave.source_projection.manifest_sha256 || wave.source_projection?.artifact_sha256 !== waves[0].verified.wave.source_projection.artifact_sha256) fail(`wave ${number} is bound to a different current matrix projection`);
    const prior = number === 1 ? null : waves[number - 2];
    if (number === 1 ? Boolean(wave.prior_wave) : !prior || wave.prior_wave?.release_id !== prior.verified.manifest.release_id || wave.prior_wave?.manifest_sha256 !== prior.manifestSha256 || wave.prior_wave?.artifact_sha256 !== prior.verified.manifest.artifacts[0].sha256 || JSON.stringify(wave.prior_wave?.wave_state_abbreviations) !== JSON.stringify(prior.verified.wave.wave_state_abbreviations)) fail(`wave ${number} cryptographic prior binding is invalid`);
    const states = wave.states.map((state, index) => {
      const code = expectedCodes[index];
      if (state.state_abbreviation !== code || seen.has(code) || state.approval_status !== "HOLD" || state.item_kind !== "approval-only" || state.acquisition_authorized !== false || !Array.isArray(state.unresolved_gates) || !Array.isArray(state.gate_items) || state.gate_items.length !== state.unresolved_gates.length || !state.assessment_snapshot || state.assessment_snapshot.state_abbreviation !== code || JSON.stringify(state.unresolved_gates) !== JSON.stringify(state.assessment_snapshot.unresolved_gates) || JSON.stringify(state.required_exclusions) !== JSON.stringify(state.assessment_snapshot.required_exclusions)) fail(`wave ${number} state or gate detail is invalid`);
      seen.add(code);
      gateItemCount += state.gate_items.length;
      return {
        state_abbreviation: code,
        state_name: state.state_name,
        wave: number,
        wave_position: state.wave_position,
        historical_backlog_priority: state.historical_backlog_priority,
        matrix_gap_status: state.matrix_gap_status,
        approval_status: "HOLD",
        item_kind: "approval-only",
        acquisition_authorized: false,
        required_exclusions: structuredClone(state.required_exclusions),
        unresolved_gates: state.unresolved_gates.map((key, gateIndex) => ({ gate_key: key, status: state.gate_items[gateIndex].status, item_kind: state.gate_items[gateIndex].item_kind, acquisition_authorized: state.gate_items[gateIndex].acquisition_authorized })),
      };
    });
    return {
      wave_number: number,
      release_id: manifest.release_id,
      manifest_sha256: manifestSha256(manifestBytes),
      artifact_sha256: manifest.artifacts[0].sha256,
      selected_count: 10,
      remaining_count: wave.scope.remaining_current_gaps,
      cumulative_prior_count: (number - 1) * 10,
      gate_item_count: wave.states.reduce((sum, state) => sum + state.gate_items.length, 0),
      state_abbreviations: [...wave.wave_state_abbreviations],
      prior_wave: wave.prior_wave ? structuredClone(wave.prior_wave) : null,
      states,
    };
  });
  const states = viewWaves.flatMap((wave) => wave.states);
  if (seen.size !== 40 || gateItemCount !== states.reduce((sum, state) => sum + state.unresolved_gates.length, 0) || states.some((state) => state.unresolved_gates.some((gate) => gate.status !== "HOLD" || gate.item_kind !== "approval-only" || gate.acquisition_authorized !== false))) fail("wave chain does not account for all 40 unique current gaps with held approval-only gates");
  return {
    schema_version: "broad-organization-current-authorization-chain-management-view@1.0.0",
    available: true,
    metadata: {
      matrix_release_id: waves[0].verified.wave.source_projection.matrix_release_id,
      matrix_manifest_sha256: waves[0].verified.wave.source_projection.matrix_manifest_sha256,
      gap_projection_release_id: projectionManifest.release_id,
      gap_projection_manifest_sha256: waves[0].verified.wave.source_projection.manifest_sha256,
      gap_projection_artifact_sha256: waves[0].verified.wave.source_projection.artifact_sha256,
      jurisdiction_count: projection.scope.jurisdictions,
      broad_data_coverage: { admitted_jurisdictions: projection.scope.broad_layers_admitted, denominator: projection.scope.jurisdictions, current_data_gaps: projection.scope.current_broad_layer_gaps, meaning: "retained broad-layer evidence availability; not all-business completeness" },
      authorization_packet_coverage: { expected_current_gaps: projection.scope.current_broad_layer_gaps, packeted_current_gaps: seen.size, authorization_packet_gaps: projection.scope.current_broad_layer_gaps - seen.size },
      wave_count: 4,
      current_gap_state_count: states.length,
      gate_item_count: gateItemCount,
    },
    authority: {
      approval_only: true,
      status: "HOLD",
      approval_granted: false,
      acquisition_authorized: false,
      contact_authorized: false,
      download_authorized: false,
      payment_authorized: false,
      record_request_authorized: false,
      network_requests: 0,
      source_actions_performed: 0,
      current_pointer_changed: false,
      production_change_authorized: false,
    },
    waves: viewWaves.map((wave) => ({
      wave_number: wave.wave_number,
      release_id: wave.release_id,
      manifest_sha256: wave.manifest_sha256,
      artifact_sha256: wave.artifact_sha256,
      selected_count: wave.selected_count,
      remaining_count: wave.remaining_count,
      cumulative_prior_count: wave.cumulative_prior_count,
      gate_item_count: wave.gate_item_count,
      state_abbreviations: wave.state_abbreviations,
      prior_wave: wave.prior_wave,
    })),
    states,
  };
}

const createSha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestSha256 = createSha256;

export async function loadBroadOrganizationCurrentAuthorizationChainManagementView() {
  const canonicalData = path.join(await realpath(APP_ROOT), "data");
  const root = path.join(canonicalData, DATASET), releases = path.join(root, "releases");
  const rootStat = await lstat(root), releasesStat = await lstat(releases);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !releasesStat.isDirectory() || releasesStat.isSymbolicLink() || await realpath(root) !== root || await realpath(releases) !== releases) fail("canonical release ancestry is missing or linked");
  const entries = await readdir(releases, { withFileTypes: true });
  if (entries.length !== 4 || entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())) fail("expected exactly four immutable current-matrix wave releases");
  const verifiedByWave = new Map();
  for (const entry of entries) {
    const releaseDirectory = path.join(releases, entry.name), manifestPath = path.join(releaseDirectory, "manifest.json");
    if (!isInside(releases, manifestPath) || await realpath(releaseDirectory) !== releaseDirectory) fail("wave release path is not canonical");
    const verified = await verifyCurrentMatrixAuthorizationWave(manifestPath);
    const number = verified.wave.scope.wave_number;
    if (verified.manifest.release_id !== entry.name || verified.manifest.dataset_id !== DATASET || verifiedByWave.has(number)) fail("wave release identity is invalid or duplicated");
    const manifestBytes = await readFile(manifestPath), artifactBytes = await readFile(path.join(releaseDirectory, "authorization-wave.json"));
    if (!artifactBytes.equals(Buffer.from(`${JSON.stringify(verified.wave, null, 2)}\n`)) || createSha256(artifactBytes) !== verified.manifest.artifacts[0].sha256) fail(`wave ${number} changed after verification`);
    verifiedByWave.set(number, { verified, manifestBytes, manifestSha256: createSha256(manifestBytes) });
  }
  const waves = [1, 2, 3, 4].map((number) => {
    const row = verifiedByWave.get(number);
    if (!row) fail(`wave ${number} is missing`);
    return row;
  });
  const first = waves[0].verified.wave, projectionManifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, "releases", first.source_projection.release_id, "manifest.json");
  if (!isInside(path.join(canonicalData, "broad-organization-matrix-gap-projection", "releases"), projectionManifestPath)) fail("current gap projection path is not canonical");
  const projectionResult = await verifyBroadOrganizationMatrixGapProjection(projectionManifestPath);
  const projectionManifestBytes = await readFile(projectionManifestPath), projectionManifestSha = createSha256(projectionManifestBytes);
  if (projectionResult.manifest.release_id !== first.source_projection.release_id || projectionManifestSha !== first.source_projection.manifest_sha256 || projectionResult.manifest.artifacts[0].sha256 !== first.source_projection.artifact_sha256) fail("wave chain projection lineage no longer verifies");
  const view = projectCurrentMatrixAuthorizationChain(waves, projectionResult.projection, projectionResult.manifest);
  if (view.metadata.gap_projection_manifest_sha256 !== projectionManifestSha) fail("projected lineage hash drifted");
  return view;
}
