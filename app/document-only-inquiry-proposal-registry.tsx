'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';

type Proposal = { proposal_id: string; wave_number: number; status: 'PROPOSED'; approval_status: 'NOT APPROVED'; authority_status: 'NO ACTION AUTHORIZED'; document_sha256: string; state_count: number; states: Array<{state_abbreviation: string; state_name: string}>; approval_syntax: string; supersession: null | { supersedes_only_prior_unapproved_document_sha256: string; prior_proposal_was_approved: false; prior_proposal_authorized_action: false } };
type Registry = { schema_version: string; available: true; coverage: { actual_collected_data: { admitted_jurisdictions: number; denominator: number; unresolved_data_gaps: number }; authorization_packets: { covered_current_gap_states: number; expected_current_gap_states: number; packet_gaps: number }; document_only_proposals: { covered_current_gap_states: number; expected_current_gap_states: number; proposal_gaps: number } }; authority: Record<string, false>; proposals: Proposal[] };
const endpoint = '/api/data-operations/document-only-inquiry-proposals';

export default function DocumentOnlyInquiryProposalRegistry() {
  const [view, setView] = useState<Registry | null>(null); const [error, setError] = useState(false); const [loading, setLoading] = useState(true);
  const sequence = useRef(0); const activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    activeRequest.current?.abort(); const controller = new AbortController(); activeRequest.current = controller; const requestSequence = ++sequence.current;
    try { const result = await runnerJson<Registry>(endpoint, { signal: controller.signal }); if (controller.signal.aborted || requestSequence !== sequence.current) return; setView(result); setError(false); }
    catch { if (!controller.signal.aborted && requestSequence === sequence.current) { setView(null); setError(true); } }
    finally { if (!controller.signal.aborted && requestSequence === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); sequence.current += 1; activeRequest.current?.abort(); }; }, [load]);
  return <section className="operations-builder" aria-labelledby="document-only-proposals-title">
    <h3 id="document-only-proposals-title">Document-only inquiry proposals</h3>
    <p className="operations-note">Read-only registry of the exact four proposed inquiry documents. It provides copyable approval wording, but no approval or execution control.</p>
    <button type="button" className="ghost-button" onClick={() => { setView(null); setError(false); setLoading(true); void load(); }}>Recheck proposal documents</button>
    {loading && <p role="status">Verifying all four proposal documents and state rosters…</p>}
    {error && <p role="alert">The proposal registry is unavailable or failed verification. No cached proposal details or actions are available.</p>}
    {view && <>
      <p className="operations-note"><strong>{`Actual collected coverage: ${view.coverage.actual_collected_data.admitted_jurisdictions}/${view.coverage.actual_collected_data.denominator}`}</strong>{` · ${view.coverage.actual_collected_data.unresolved_data_gaps} data gaps. `}<strong>{`Authorization-packet coverage: ${view.coverage.authorization_packets.covered_current_gap_states}/${view.coverage.authorization_packets.expected_current_gap_states}`}</strong>{` · ${view.coverage.authorization_packets.packet_gaps} packet gaps · `}<strong>{`document-only proposal coverage: ${view.coverage.document_only_proposals.covered_current_gap_states}/${view.coverage.document_only_proposals.expected_current_gap_states}`}</strong>{` · ${view.coverage.document_only_proposals.proposal_gaps} proposal gaps.`} Proposal and packet coverage are not collected-data coverage.</p>
      <p className="operations-note"><strong>PROPOSED · NOT APPROVED · NO ACTION AUTHORIZED.</strong> No contact, browsing, download, payment, enrollment, automation, connector, production, or pointer change is authorized.</p>
      {view.proposals.map((proposal) => <article className="operation-record" key={proposal.proposal_id}>
        <h4>{`Wave ${proposal.wave_number} · ${proposal.proposal_id}`}</h4>
        <p><strong>{proposal.status} · {proposal.approval_status} · {proposal.authority_status}</strong></p>
        <p>{`${proposal.state_count} states: ${proposal.states.map((state) => `${state.state_name} (${state.state_abbreviation})`).join(', ')}`}</p>
        <dl><dt>Document SHA-256</dt><dd><code>{proposal.document_sha256}</code></dd><dt>Exact approval syntax — copy/view only</dt><dd><code>{proposal.approval_syntax}</code></dd></dl>
        {proposal.supersession && <p>Wave 1 supersedes only the prior unapproved document SHA-256 <code>{proposal.supersession.supersedes_only_prior_unapproved_document_sha256}</code>. That prior proposal was not approved and authorized no action.</p>}
      </article>)}
    </>}
  </section>;
}
