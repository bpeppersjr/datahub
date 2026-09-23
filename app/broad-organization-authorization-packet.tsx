'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';

type Boundary = {
  contact_authorized: false; contact_performed: false; download_authorized: false; download_performed: false;
  payment_authorized: false; payment_performed: false; record_request_authorized: false; records_requested: 0;
  row_bearing_evidence_authorized: false; production_change_authorized: false; no_contact: true; no_download: true;
  no_payment: true; no_record_request: true; no_contact_no_download_no_payment_no_record_request: true;
};
type RequestItem = {
  request_item_id: string; unresolved_gate: string; request_item_type: 'non-row-bearing-evidence-specification';
  row_bearing: false; request_item: string; required_evidence_type: string; acceptance_criterion: string; action_boundary: Boundary;
};
type StatePacket = {
  state_abbreviation: string; state_name: string; assessment_provenance: { assessment_id: string; assessment_kind: string; observed_at: string };
  unresolved_gates: string[]; privacy_exclusions: string[]; legal_status_limitations: string[]; address_limitations: string[]; request_items: RequestItem[];
};
type PacketView = {
  schema_version: string; available: true;
  metadata: { release_id: string; observed_at: string; jurisdiction_count: 10; request_item_count: number; first_wave_state_abbreviations: string[] };
  source_lineage: { backlog_release_id: string; backlog_manifest_sha256: string; backlog_artifact_sha256: string; assessment_catalog_id: string; assessment_catalog_sha256: string };
  authority: { approval_granted: false; acquisition_authorized: false; contact_authorized: false; download_authorized: false; payment_authorized: false; record_request_authorized: false; row_bearing_evidence_authorized: false; production_change_authorized: false; source_actions_performed: 0; contact_performed: false; download_performed: false; payment_performed: false; records_requested: 0; current_pointer_changed: false; evidence_specification_is_approval: false };
  states: StatePacket[];
};

const endpoint = '/api/data-operations/broad-organization-authorization-packet';
const words = (value: string) => value.replaceAll('-', ' ').replaceAll('_', ' ');

export default function BroadOrganizationAuthorizationPacket() {
  const [view, setView] = useState<PacketView | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const sequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestSequence = ++sequence.current;
    try {
      const result = await runnerJson<PacketView>(endpoint, { signal: controller.signal });
      if (controller.signal.aborted || requestSequence !== sequence.current) return;
      setView(result);
      setError(false);
    } catch {
      if (!controller.signal.aborted && requestSequence === sequence.current) {
        setView(null);
        setError(true);
      }
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

  const visibleStates = view?.states.filter((state) => !stateFilter || state.state_abbreviation === stateFilter) ?? [];
  return <section className="operations-builder" aria-labelledby="broad-org-authorization-title">
    <h3 id="broad-org-authorization-title">Broad-organization evidence packet</h3>
    <p className="operations-note">Read-only review of the verified ten-state first wave. Each item specifies non-row-bearing evidence that would help resolve an assessment gate; it is not an approval, contact instruction, or acquisition authorization.</p>
    <div className="operations-actions">
      <label>Filter jurisdiction<select aria-label="Filter authorization packet jurisdiction" value={stateFilter} disabled={!view} onChange={(event) => setStateFilter(event.target.value)}>
        <option value="">All first-wave jurisdictions</option>{view?.metadata.first_wave_state_abbreviations.map((state) => <option key={state} value={state}>{state}</option>)}
      </select></label>
      <button type="button" className="ghost-button" onClick={() => { setView(null); setError(false); setLoading(true); void load(); }}>Recheck verified packet</button>
    </div>
    {loading && <p role="status">Verifying the retained packet…</p>}
    {error && <p role="alert">The canonical authorization packet is unavailable or failed verification. No packet details or actions are available.</p>}
    {view && <>
      <p className="operations-note"><strong>Evidence specification only · approval granted: no</strong> · {view.metadata.jurisdiction_count} jurisdictions · {view.metadata.request_item_count} evidence specifications · assessed {view.metadata.observed_at}. No contact, download, payment, record request, or production change is authorized or performed.</p>
      <dl>
        <dt>Packet release</dt><dd>{view.metadata.release_id}</dd>
        <dt>Source backlog release</dt><dd>{view.source_lineage.backlog_release_id}</dd>
        <dt>Backlog manifest SHA-256</dt><dd><code>{view.source_lineage.backlog_manifest_sha256}</code></dd>
        <dt>Backlog artifact SHA-256</dt><dd><code>{view.source_lineage.backlog_artifact_sha256}</code></dd>
        <dt>Assessment catalog</dt><dd>{view.source_lineage.assessment_catalog_id}</dd>
        <dt>Assessment catalog SHA-256</dt><dd><code>{view.source_lineage.assessment_catalog_sha256}</code></dd>
      </dl>
      <p className="operations-note">Authority: acquisition no · contact no · download no · payment no · records requested 0 · row-bearing evidence no · production change no · pointer changed no.</p>
      {visibleStates.map((state) => <article key={state.state_abbreviation} className="operation-record">
        <h4>{state.state_name} ({state.state_abbreviation})</h4>
        <p className="operations-note">Assessment: {words(state.assessment_provenance.assessment_kind)} · {state.assessment_provenance.assessment_id} · {state.assessment_provenance.observed_at}. Unresolved gates: {state.unresolved_gates.map(words).join(', ')}.</p>
        <details><summary>Privacy exclusions and source limitations</summary>
          <h5>Privacy exclusions</h5><ul>{state.privacy_exclusions.map((item) => <li key={item}>{item}</li>)}</ul>
          <h5>Legal-status limitations</h5><ul>{state.legal_status_limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          <h5>Address limitations</h5><ul>{state.address_limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
        <h5>Non-row-bearing evidence specifications</h5>
        <ul>{state.request_items.map((item) => <li key={item.request_item_id}>
          <details><summary>{words(item.unresolved_gate)} · evidence specification, not approval</summary>
            <p>{item.request_item}</p><p><strong>Required evidence:</strong> {item.required_evidence_type}</p>
            <p><strong>Acceptance criterion:</strong> {item.acceptance_criterion}</p>
            <p className="operations-note">No contact · no download · no payment · no record request · no row-bearing evidence · no production change.</p>
          </details>
        </li>)}</ul>
      </article>)}
    </>}
  </section>;
}
