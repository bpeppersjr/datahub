import path from "node:path";

import { loadCurrentMatrixAuthorizationWaveChain } from "./broad-organization-current-matrix-authorization-wave.mjs";
import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";

const WEAKEST_COMPARABLE_DIAGNOSTIC_STATES = Object.freeze(["TN", "VA", "AZ", "RI", "NJ", "OH", "VT", "SC", "MA", "NH"]);
const DIAGNOSTIC_COVERAGE_RELEASE_ID = "national-business-coverage-views-20260902-115337634Z-ba689784";
const DIAGNOSTIC_PROJECTION_RELEASE_ID = "broad-organization-matrix-gap-projection-2026-10-07T05-23-37.982Z-2de794ce5041";

function fail(message) { throw new Error(`Current-matrix authorization-chain view unavailable: ${message}`); }

export function deriveWeakestComparableDiagnosticBatch(projection, historicalProjection = projection) {
  if (!Array.isArray(projection?.gaps) || projection.gaps.length !== 40 || new Set(projection.gaps.map((gap) => gap.state_abbreviation)).size !== 40) fail("diagnostic source projection must contain the exact 40 current gaps");
  const historicalByCode = new Map(historicalProjection.gaps.map((gap) => [gap.state_abbreviation, gap.assessment_snapshot]));
  const comparable = [], unavailable = [];
  for (const gap of projection.gaps) {
    const historical = historicalByCode.get(gap.state_abbreviation);
    const coverage = historical?.current_coverage;
    const valid = coverage
      && Number.isSafeInteger(coverage.reported_profiles) && coverage.reported_profiles >= 0
      && Number.isSafeInteger(coverage.nonemployer_baseline_2023) && coverage.nonemployer_baseline_2023 > 0
      && Number.isFinite(coverage.diagnostic_profile_percent)
      && coverage.diagnostic_profile_percent === Number((coverage.reported_profiles / coverage.nonemployer_baseline_2023 * 100).toFixed(1))
      && historical.coverage_release_id === DIAGNOSTIC_COVERAGE_RELEASE_ID;
    if (!valid) { unavailable.push(gap.state_abbreviation); continue; }
    comparable.push({ state_abbreviation: gap.state_abbreviation, state_name: gap.state_name, reported_profiles: coverage.reported_profiles, nonemployer_baseline_2023: coverage.nonemployer_baseline_2023, diagnostic_profile_percent: coverage.diagnostic_profile_percent, coverage_release_id: historical.coverage_release_id });
  }
  comparable.sort((left, right) => left.diagnostic_profile_percent - right.diagnostic_profile_percent || left.state_abbreviation.localeCompare(right.state_abbreviation));
  if (comparable.length !== 31 || unavailable.length !== 9 || comparable.length + unavailable.length !== 40 || JSON.stringify(comparable.slice(0, 10).map((row) => row.state_abbreviation)) !== JSON.stringify(WEAKEST_COMPARABLE_DIAGNOSTIC_STATES)) fail("diagnostic gap comparison does not conserve the reviewed 31 comparable and 9 unavailable states");
  const diagnosticStates = comparable.slice(0, 10);
  const expectedDiagnosticValues = [["TN", 91467, 649168, 14.1], ["VA", 116537, 740321, 15.7], ["AZ", 99038, 598126, 16.6], ["RI", 15949, 95241, 16.7], ["NJ", 156337, 883628, 17.7], ["OH", 163604, 909227, 18], ["VT", 11833, 65028, 18.2], ["SC", 81827, 445689, 18.4], ["MA", 118917, 633439, 18.8], ["NH", 22001, 116209, 18.9]];
  if (diagnosticStates.some((row, index) => JSON.stringify([row.state_abbreviation, row.reported_profiles, row.nonemployer_baseline_2023, row.diagnostic_profile_percent]) !== JSON.stringify(expectedDiagnosticValues[index]))) fail("weakest comparable diagnostic values changed");
  return {
    kind: "weakest-comparable-diagnostic-profile-batch", metric: "reported_profiles_divided_by_2023_nonemployer_baseline", selection_count: 10,
    comparable_gap_count: comparable.length, unavailable_gap_count: unavailable.length, source_coverage_release_id: DIAGNOSTIC_COVERAGE_RELEASE_ID,
    meaning: "diagnostic source-profile ratio; not business completeness", unavailable_treatment: "not zero; excluded from ranking",
    authority: { status: "HOLD", source_action_authorized: false, contact_authorized: false, payment_authorized: false, download_authorized: false, record_request_authorized: false, acquisition_authorized: false, network_request_authorized: false, pointer_change_authorized: false, production_change_authorized: false },
    states: diagnosticStates,
  };
}

export async function loadHistoricalBroadOrganizationDiagnosticProjection(projectionRoot = DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT) {
  const manifestPath = path.join(projectionRoot, "releases", DIAGNOSTIC_PROJECTION_RELEASE_ID, "manifest.json");
  const verified = await verifyBroadOrganizationMatrixGapProjection(manifestPath);
  if (verified.manifest.release_id !== DIAGNOSTIC_PROJECTION_RELEASE_ID) fail("historical diagnostic projection lineage is invalid");
  return verified;
}

function projectCurrentMatrixAuthorizationChain(waves, projection, projectionManifest, diagnosticSource) {
  if (!Array.isArray(waves) || waves.length !== 4 || projection?.dataset_id !== "broad-organization-matrix-gap-projection" || projection.scope?.jurisdictions !== 51 || projection.scope?.broad_layers_admitted !== 11 || projection.scope?.current_broad_layer_gaps !== 40) fail("current projection or four-wave inventory is invalid");
  const seen = new Set();
  let gateItemCount = 0;
  const viewWaves = waves.map(({ manifest, wave, manifestSha256 }, waveIndex) => {
    const number = wave.scope?.wave_number;
    const expectedCodes = wave.wave_state_abbreviations;
    if (number !== waveIndex + 1 || expectedCodes?.length !== 10 || wave.states?.length !== 10 || wave.scope.matrix_gap_jurisdictions !== 40 || wave.scope.selected_jurisdictions !== 10 || wave.scope.remaining_current_gaps !== 40 - (number * 10) || wave.scope.conservation_total !== 40 || wave.scope.acquisition_authorized !== false || wave.scope.source_actions_performed !== 0 || wave.scope.network_requests !== 0 || wave.scope.current_pointer_changed !== false || wave.scope.approval_only !== true || wave.scope.status !== "HOLD") fail(`wave ${number} roster, conservation, or authority boundary is invalid`);
    if (number === 1 ? wave.prior_wave !== undefined || wave.scope.prior_wave_jurisdictions !== undefined : wave.scope.prior_wave_jurisdictions !== (number - 1) * 10) fail(`wave ${number} prior-wave count is invalid`);
    if (wave.source_projection?.release_id !== projectionManifest.release_id || wave.source_projection?.manifest_sha256 !== waves[0].wave.source_projection.manifest_sha256 || wave.source_projection?.artifact_sha256 !== waves[0].wave.source_projection.artifact_sha256) fail(`wave ${number} is bound to a different current matrix projection`);
    const prior = number === 1 ? null : waves[number - 2];
    if (number === 1 ? Boolean(wave.prior_wave) : !prior || wave.prior_wave?.release_id !== prior.manifest.release_id || wave.prior_wave?.manifest_sha256 !== prior.manifestSha256 || wave.prior_wave?.artifact_sha256 !== prior.manifest.artifacts[0].sha256 || JSON.stringify(wave.prior_wave?.wave_state_abbreviations) !== JSON.stringify(prior.wave.wave_state_abbreviations)) fail(`wave ${number} cryptographic prior binding is invalid`);
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
      manifest_sha256: manifestSha256,
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
  if (seen.size !== 40 || projection.gaps.some((gap) => !seen.has(gap.state_abbreviation)) || gateItemCount !== states.reduce((sum, state) => sum + state.unresolved_gates.length, 0) || states.some((state) => state.unresolved_gates.some((gate) => gate.status !== "HOLD" || gate.item_kind !== "approval-only" || gate.acquisition_authorized !== false))) fail("wave chain does not account for all 40 unique current gaps with held approval-only gates");
  const diagnosticBatch = {
    ...deriveWeakestComparableDiagnosticBatch(projection, diagnosticSource.projection),
    source_gap_projection_release_id: diagnosticSource.manifest.release_id,
    source_gap_projection_manifest_sha256: diagnosticSource.manifestSha256,
  };
  return {
    schema_version: "broad-organization-current-authorization-chain-management-view@1.1.0",
    available: true,
    metadata: {
      matrix_release_id: projection.source_matrix.release_id,
      matrix_manifest_sha256: projection.source_matrix.manifest_sha256,
      backlog_release_id: projection.source_backlog.release_id,
      backlog_manifest_sha256: projection.source_backlog.manifest_sha256,
      backlog_artifact_sha256: projection.source_backlog.artifact_sha256,
      gap_projection_release_id: projectionManifest.release_id,
      gap_projection_manifest_sha256: waves[0].wave.source_projection.manifest_sha256,
      gap_projection_artifact_sha256: waves[0].wave.source_projection.artifact_sha256,
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
    diagnostic_batch: diagnosticBatch,
    states,
  };
}

export async function loadBroadOrganizationCurrentAuthorizationChainManagementView(options = {}) {
  const { waves, projection, projectionManifest } = await loadCurrentMatrixAuthorizationWaveChain(options);
  const diagnosticSource = await loadHistoricalBroadOrganizationDiagnosticProjection(options.projectionRoot);
  return projectCurrentMatrixAuthorizationChain(waves, projection, projectionManifest, diagnosticSource);
}
