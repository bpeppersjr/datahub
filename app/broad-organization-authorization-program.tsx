'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';

type GateItem = {
  gate_key: string;
  gate_kind: 'non-row-bearing-contract-evidence' | 'external-explicit-authorization';
  document_closable: boolean;
  automatic_closure_permitted: false;
  row_bearing?: false;
  required_evidence_type?: string;
  acceptance_criterion?: string;
  grants_authority?: false;
  closure_requires?: string;
  no_document_or_evidence_upload_can_close?: true;
};
type ProgramState = {
  priority: number; wave: number; state_abbreviation: string; state_name: string;
  unresolved_gates: string[]; required_exclusions: string[]; status_limitations: string[]; address_limitations: string[]; gate_items: GateItem[];
};
type ProgramView = {
  schema_version: string; available: true;
  metadata: { release_id: string; observed_at: string; jurisdiction_count: 43; gate_item_count: 371; gate_key_count: 28; wave_state_abbreviations: string[][] };
  source_lineage: { backlog_release_id: string; backlog_manifest_sha256: string; backlog_artifact_sha256: string; assessment_catalog_id: string; assessment_catalog_sha256: string };
  authority: { approval_granted: false; acquisition_authorized: false; evidence_request_authorized: false; contact_authorized: false; download_authorized: false; payment_authorized: false; record_request_authorized: false; row_bearing_evidence_authorized: false; production_change_authorized: false; source_actions_performed: 0; current_pointer_changed: false; evidence_specification_is_approval: false };
  states: ProgramState[];
};

const endpoint = '/api/data-operations/broad-organization-authorization-program';
const words = (value: string) => value.replaceAll('-', ' ').replaceAll('_', ' ');

export default function BroadOrganizationAuthorizationProgram() {
  const [view, setView] = useState<ProgramView | null>(null);
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
      const result = await runnerJson<ProgramView>(endpoint, { signal: controller.signal });
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

  const waveIndex = selectedWave ? Number(selectedWave) - 1 : -1;
  const waveStates = waveIndex >= 0 ? view?.metadata.wave_state_abbreviations[waveIndex] ?? [] : [];
  const visibleStates = view?.states.filter((state) => state.wave === waveIndex + 1 && (!selectedState || state.state_abbreviation === selectedState)) ?? [];

  return <section className="operations-builder" aria-labelledby="broad-org-program-title">
    <h3 id="broad-org-program-title">Broad-organization authorization program</h3>
    <p className="operations-note">Read-only, verified specification of unresolved evidence gates across five backlog waves. It is not approval to contact a publisher, request or download records, pay fees, or change production. No source action was taken.</p>
    <div className="operations-actions">
      <label>Wave<select aria-label="Filter authorization program wave" value={selectedWave} disabled={!view} onChange={(event) => { setSelectedWave(event.target.value); setSelectedState(''); }}>
        <option value="">Select a wave</option>{view?.metadata.wave_state_abbreviations.map((states, index) => <option key={index + 1} value={String(index + 1)}>Wave {index + 1} · {states.join(', ')}</option>)}
      </select></label>
      <label>Jurisdiction<select aria-label="Filter authorization program jurisdiction" value={selectedState} disabled={!view || !selectedWave} onChange={(event) => setSelectedState(event.target.value)}>
        <option value="">All jurisdictions in selected wave</option>{waveStates.map((state) => <option key={state} value={state}>{state}</option>)}
      </select></label>
      <button type="button" className="ghost-button" onClick={() => { setView(null); setError(false); setLoading(true); void load(); }}>Recheck verified program</button>
    </div>
    {loading && <p role="status">Verifying the retained all-wave program…</p>}
    {error && <p role="alert">The canonical authorization program is unavailable or failed verification. No program details or actions are available.</p>}
    {view && <>
      <p className="operations-note"><strong>43 jurisdictions · 371 gate items · 28 gate keys</strong> · observed {view.metadata.observed_at}. Approval granted: no. Acquisition authorized: no. Source actions performed: 0. Evidence specifications grant no authority.</p>
      <details><summary>Verified lineage and authority boundaries</summary>
        <dl>
          <dt>Program release</dt><dd>{view.metadata.release_id}</dd>
          <dt>Source backlog release</dt><dd>{view.source_lineage.backlog_release_id}</dd>
          <dt>Backlog manifest SHA-256</dt><dd><code>{view.source_lineage.backlog_manifest_sha256}</code></dd>
          <dt>Backlog artifact SHA-256</dt><dd><code>{view.source_lineage.backlog_artifact_sha256}</code></dd>
          <dt>Assessment catalog</dt><dd>{view.source_lineage.assessment_catalog_id}</dd>
          <dt>Assessment catalog SHA-256</dt><dd><code>{view.source_lineage.assessment_catalog_sha256}</code></dd>
        </dl>
        <p className="operations-note">No contact, download, payment, record request, row-bearing evidence, or production change is authorized. Current pointer changed: no.</p>
      </details>
      {selectedWave && visibleStates.map((state) => <article key={state.state_abbreviation} className="operation-record">
        <h4>Priority {state.priority} · {state.state_name} ({state.state_abbreviation}) · Wave {state.wave}</h4>
        <p><strong>Unresolved gates:</strong> {state.unresolved_gates.map(words).join(', ')}.</p>
        <details><summary>Required exclusions and bounded status/address limitations</summary>
          <h5>Required exclusions</h5><ul>{state.required_exclusions.map((text, index) => <li key={index}>{text}</li>)}</ul>
          <h5>Status limitations</h5><ul>{state.status_limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
          <h5>Address limitations</h5><ul>{state.address_limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
        </details>
        <h5>Gate specifications</h5>
        <ul>{state.gate_items.map((item) => <li key={item.gate_key}>
          {item.gate_kind === 'external-explicit-authorization' ? <div className="operations-note">
            <strong>{words(item.gate_key)} · explicit authorization only, not an evidence item</strong>
            <p>{item.closure_requires} No document or upload can close this gate; automatic closure is not permitted.</p>
          </div> : <details>
            <summary>{words(item.gate_key)} · non-row-bearing evidence specification, not approval</summary>
            <p><strong>Required evidence:</strong> {item.required_evidence_type}</p>
            <p><strong>Acceptance criterion:</strong> {item.acceptance_criterion}</p>
            <p className="operations-note">This specification grants no authority; automatic closure is not permitted.</p>
          </details>}
        </li>)}</ul>
      </article>)}
    </>}
  </section>;
}
