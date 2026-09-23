'use client';
import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';

type EvidenceRow = {
  row_id: string; record_kind: string; publisher_jurisdiction: string; address_state: string | null; display_name: string;
  address: { street: string | null; unit_or_additional: string | null; city: string | null; zip5: string; zip4: string | null };
  source_status: { status: string | null; status_class: string | null; semantics: string | null };
  temporal: { observed_at: string | null; source_status_updated_at: string | null; formation_date: string | null; effective_date: string | null; source_release_id: string };
  provenance: { source_id: string; source_release_id: string; source_record_id: string | null; transformation_version: string; policy_id: string; policy_version: string };
  policy: { mode: string; row_policy: string; local_review_only: boolean; redistribution: string };
};
type View = { status: string; zip5: string; policy_mode: string; publisher_state_filter: string | null; policy_excluded_row_count?: number; policy_excluded_row_semantics?: string; page: { limit: number; offset: number; total_matching_rows: number; next_cursor: string | null }; rows: EvidenceRow[]; semantics: { local_review_restriction: string | null } };
const PUBLISHERS = ['CO', 'CT', 'DE', 'FL', 'IA', 'NY', 'OR', 'PA'];

export default function OrganizationZipEvidencePanel({ zip5 }: { zip5: string }) {
  const [policyMode, setPolicyMode] = useState<'public-only' | 'local-review'>('public-only');
  const [publisher, setPublisher] = useState(''); const [limit, setLimit] = useState(50); const [page, setPage] = useState<{ selectionKey: string; cursor: string | null; history: Array<string | null> } | null>(null);
  const [view, setView] = useState<{ key: string; value: View } | null>(null); const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const selectionKey = JSON.stringify([zip5, policyMode, publisher, limit]);
  const cursor = page?.selectionKey === selectionKey ? page.cursor : null;
  const history = page?.selectionKey === selectionKey ? page.history : [];
  const requestKey = JSON.stringify([selectionKey, cursor]);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip5)) return;
    const controller = new AbortController(); let active = true;
    const params = new URLSearchParams({ zip: zip5, policy_mode: policyMode, limit: String(limit) });
    if (publisher) params.set('publisher_state', publisher); if (cursor) params.set('cursor', cursor);
    void runnerJson<View>(`/api/business-map/organization-zip-evidence?${params}`, { signal: controller.signal })
      .then(value => { if (active && !controller.signal.aborted && value.zip5 === zip5 && value.policy_mode === policyMode && value.publisher_state_filter === (publisher || null)) { setView({ key: requestKey, value }); setError(null); } })
      .catch(reason => { if (active && !controller.signal.aborted && reason?.name !== 'AbortError') setError({ key: requestKey, message: reason instanceof Error ? reason.message : 'Organization ZIP evidence is unavailable.' }); });
    return () => { active = false; controller.abort(); };
  }, [zip5, policyMode, publisher, limit, cursor, requestKey]);
  const ready = view?.key === requestKey ? view.value : null;
  const visibleError = error?.key === requestKey ? error.message : '';
  const loading = /^\d{5}$/.test(zip5) && !ready && !visibleError;
  function next() { if (ready?.page.next_cursor) { setPage(current => ({ selectionKey, history: [...(current?.selectionKey === selectionKey ? current.history : []), cursor], cursor: ready.page.next_cursor })); } }
  function previous() { if (history.length) { setPage({ selectionKey, cursor: history.at(-1) ?? null, history: history.slice(0, -1) }); } }
  return <section className="state-alignment-card" aria-label="Retained organization ZIP evidence" data-testid="organization-zip-evidence">
    <div><span>Separate retained-source projection · not a map layer or business/site total</span><strong>Organization addresses reported at ZIP5 {zip5 || '—'}</strong></div>
    <p className="entity-method-note">One row represents a source-reported administrative organization or registration address. Publisher jurisdiction is distinct from the address state; addresses are not verified physical sites or current operations.</p>
    <div className="pharmacy-filters">
      <label>Policy mode <select aria-label="Organization ZIP evidence policy mode" value={policyMode} onChange={event => setPolicyMode(event.target.value as 'public-only' | 'local-review')}><option value="public-only">Public-only · omit Delaware records</option><option value="local-review">Local review · includes restricted Delaware details</option></select></label>
      <label>Publisher jurisdiction <select aria-label="Organization ZIP publisher" value={publisher} onChange={event => setPublisher(event.target.value)}><option value="">All selected publishers</option>{PUBLISHERS.map(state => <option key={state} value={state}>{state}</option>)}</select></label>
      <label>Rows per page <select aria-label="Organization ZIP page size" value={limit} onChange={event => setLimit(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </div>
    {loading && <p role="status">Verifying the pinned retained shard…</p>}{visibleError && <p role="alert">{visibleError}</p>}
    {ready && <><p className="entity-method-note">Pinned release {ready.page.total_matching_rows.toLocaleString('en-US')} matching rows · displayed {ready.page.offset + 1}–{ready.page.offset + ready.rows.length}. Public-only responses omit Delaware names and addresses.</p>
      {ready.policy_mode === 'public-only' && <p className="entity-method-note">{ready.policy_excluded_row_count?.toLocaleString('en-US') ?? '—'} Delaware rows policy-excluded; this is not missing or zero evidence.</p>}
      {ready.semantics.local_review_restriction && <p className="entity-method-note">{ready.semantics.local_review_restriction}</p>}
      <div className="business-name-list">{ready.rows.map(row => <article key={row.row_id}><div><strong>{row.display_name}</strong><span>{row.record_kind} · publisher {row.publisher_jurisdiction} · address state {row.address_state ?? 'not supplied'}</span><span>{[row.address.street, row.address.unit_or_additional, row.address.city, row.address_state, `${row.address.zip5}${row.address.zip4 ? ` +4 ${row.address.zip4}` : ''}`].filter(Boolean).join(', ')}</span><small>{row.source_status.status ?? 'Source status not supplied'} · observed {row.temporal.observed_at ?? 'date not supplied'}{row.temporal.source_status_updated_at ? ` · status updated ${row.temporal.source_status_updated_at}` : ''}{row.temporal.formation_date ? ` · formed ${row.temporal.formation_date}` : ''}{row.temporal.effective_date ? ` · effective ${row.temporal.effective_date}` : ''} · source {row.provenance.source_id} / {row.provenance.source_release_id}</small><small>{row.policy.row_policy} · {row.policy.local_review_only ? 'local-review-only' : 'source policy applies'} · not a physical-site or current-operation assertion</small></div></article>)}</div>
      <div className="pharmacy-filters"><button type="button" onClick={previous} disabled={!history.length}>Previous</button><button type="button" onClick={next} disabled={!ready.page.next_cursor}>Next</button><span>Page starts at row {ready.page.offset + 1}</span></div>
    </>}
  </section>;
}
