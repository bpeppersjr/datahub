'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';

type Gate = { gate_key: string; status: 'HOLD'; item_kind: 'approval-only'; acquisition_authorized: false };
type ChainState = {
  state_abbreviation: string; state_name: string; wave: number; wave_position: number; historical_backlog_priority: number;
  matrix_gap_status: string; approval_status: 'HOLD'; item_kind: 'approval-only'; acquisition_authorized: false;
  required_exclusions: string[]; unresolved_gates: Gate[];
};
type ChainWave = {
  wave_number: number; release_id: string; manifest_sha256: string; artifact_sha256: string; selected_count: number; remaining_count: number;
  cumulative_prior_count: number; gate_item_count: number; state_abbreviations: string[];
  prior_wave: null | { release_id: string; manifest_sha256: string; artifact_sha256: string; wave_state_abbreviations: string[] };
};
type ChainView = {
  schema_version: string; available: true;
  metadata: {
    matrix_release_id: string; matrix_manifest_sha256: string; gap_projection_release_id: string; gap_projection_manifest_sha256: string; gap_projection_artifact_sha256: string;
    jurisdiction_count: 51; broad_data_coverage: { admitted_jurisdictions: 11; denominator: 51; current_data_gaps: 40; meaning: string };
    authorization_packet_coverage: { expected_current_gaps: 40; packeted_current_gaps: 40; authorization_packet_gaps: 0 };
    wave_count: 4; current_gap_state_count: 40; gate_item_count: number;
  };
  authority: { approval_only: true; status: 'HOLD'; approval_granted: false; acquisition_authorized: false; contact_authorized: false; download_authorized: false; payment_authorized: false; record_request_authorized: false; network_requests: 0; source_actions_performed: 0; current_pointer_changed: false; production_change_authorized: false };
  waves: ChainWave[]; states: ChainState[];
};

const endpoint = '/api/data-operations/broad-organization-current-authorization-chain';
const words = (value: string) => value.replaceAll('-', ' ').replaceAll('_', ' ');

export default function BroadOrganizationCurrentAuthorizationChain() {
  const [view, setView] = useState<ChainView | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedWave, setSelectedWave] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const sequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestSequence = ++sequence.current;
    try {
      const result = await runnerJson<ChainView>(endpoint, { signal: controller.signal });
      if (controller.signal.aborted || requestSequence !== sequence.current) return;
      setView(result);
      setError(false);
    } catch {
      if (!controller.signal.aborted && requestSequence === sequence.current) { setView(null); setError(true); }
    } finally {
      if (!controller.signal.aborted && requestSequence === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      sequence.current += 1;
      activeRequest.current?.abort();
    };
  }, [load]);

  const waveStates = view?.states.filter((state) => !selectedWave || state.wave === Number(selectedWave)) ?? [];
  const visibleStates = waveStates.filter((state) => !selectedState || state.state_abbreviation === selectedState);

  return <section className="operations-builder" aria-labelledby="current-auth-chain-title">
    <h3 id="current-auth-chain-title">Current broad-organization authorization chain</h3>
    <p className="operations-note">Read-only verification of the four current-matrix waves. Broad data coverage is 11 of 51 jurisdictions, with 40 unresolved data gaps; all 40 are separately represented in approval packets, leaving zero unpacketized gaps. Packet coverage is not data coverage.</p>
    <div className="operations-actions">
      <label>Wave<select aria-label="Filter current authorization wave" value={selectedWave} disabled={!view} onChange={(event) => { setSelectedWave(event.target.value); setSelectedState(''); }}>
        <option value="">All four waves</option>{view?.waves.map((wave) => <option key={wave.wave_number} value={String(wave.wave_number)}>Wave {wave.wave_number} · {wave.state_abbreviations.join(', ')}</option>)}
      </select></label>
      <label>Jurisdiction<select aria-label="Filter current authorization jurisdiction" value={selectedState} disabled={!view} onChange={(event) => setSelectedState(event.target.value)}>
        <option value="">All jurisdictions in selected scope</option>{waveStates.map((state) => <option key={state.state_abbreviation} value={state.state_abbreviation}>{state.state_abbreviation}</option>)}
      </select></label>
      <button type="button" className="ghost-button" onClick={() => { setView(null); setError(false); setLoading(true); void load(); }}>Recheck verified chain</button>
    </div>
    {loading && <p role="status">Independently verifying all four authorization waves and their matrix lineage…</p>}
    {error && <p role="alert">The current authorization chain is unavailable or failed verification. No cached details or actions are available.</p>}
    {view && <>
      <p className="operations-note"><strong>{`${view.metadata.broad_data_coverage.admitted_jurisdictions}/51 jurisdictions have admitted broad-layer evidence · ${view.metadata.broad_data_coverage.current_data_gaps} data gaps remain · ${view.metadata.authorization_packet_coverage.authorization_packet_gaps} authorization-packet gaps`}</strong>. The 40 packets specify review only; every state and gate is HOLD.</p>
      <p className="operations-note">No approval, acquisition, contact, download, payment, record request, network request, pointer change, or production action is authorized. Source actions performed: 0.</p>
      <details><summary>Verified four-wave release chain and lineage</summary>
        <dl>
          <dt>Current matrix release</dt><dd>{view.metadata.matrix_release_id}</dd>
          <dt>Matrix manifest SHA-256</dt><dd><code>{view.metadata.matrix_manifest_sha256}</code></dd>
          <dt>Gap projection release</dt><dd>{view.metadata.gap_projection_release_id}</dd>
          <dt>Gap projection manifest SHA-256</dt><dd><code>{view.metadata.gap_projection_manifest_sha256}</code></dd>
          <dt>Gap projection artifact SHA-256</dt><dd><code>{view.metadata.gap_projection_artifact_sha256}</code></dd>
        </dl>
        <ol>{view.waves.map((wave) => <li key={wave.wave_number}>
          <strong>Wave {wave.wave_number}</strong> · {wave.selected_count} selected · {wave.remaining_count} remaining · {wave.gate_item_count} gates<br />
          States: {wave.state_abbreviations.join(', ')}<br />
          Release {wave.release_id} · manifest <code>{wave.manifest_sha256}</code> · artifact <code>{wave.artifact_sha256}</code>
          {wave.prior_wave && <p>Cryptographically bound to Wave {wave.wave_number - 1}: {wave.prior_wave.release_id} · manifest <code>{wave.prior_wave.manifest_sha256}</code> · artifact <code>{wave.prior_wave.artifact_sha256}</code></p>}
        </li>)}</ol>
      </details>
      <p className="operations-note"><strong>{`${view.metadata.current_gap_state_count} current data-gap states · ${view.metadata.gate_item_count} unresolved gate items`}</strong> · {`filtered: ${visibleStates.length} state${visibleStates.length === 1 ? '' : 's'}`}.</p>
      {visibleStates.map((state) => <article key={state.state_abbreviation} className="operation-record">
        <h4>{`Wave ${state.wave}, position ${state.wave_position} · ${state.state_name} (${state.state_abbreviation}) · historical priority ${state.historical_backlog_priority}`}</h4>
        <p>Current broad data status: {words(state.matrix_gap_status)}. Packet status: <strong>HOLD · approval-only</strong>. Acquisition authorized: no.</p>
        <details><summary>{state.unresolved_gates.length} approval-only gate items — all HOLD</summary>
          <ul>{state.unresolved_gates.map((gate) => <li key={gate.gate_key}>{words(gate.gate_key)} · {gate.item_kind} · {gate.status} · acquisition authorized: no</li>)}</ul>
          <h5>Required exclusions</h5><ul>{state.required_exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </details>
      </article>)}
    </>}
  </section>;
}
