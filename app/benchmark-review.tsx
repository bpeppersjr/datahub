'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const RUNNER_URL = 'http://127.0.0.1:4300';

type ReviewLabelValue = 'match' | 'non-match' | 'uncertain' | 'not-reviewable';
type ReviewLabel = {
  candidate_id: string;
  label: ReviewLabelValue | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  evidence_note: string | null;
};
type Profile = {
  profile_id: string;
  address?: { street?: string | null; unit_or_additional?: string | null; city?: string | null; state?: string | null; zip_code?: string | null };
  names?: Array<{ raw?: string; strict?: string }>;
  external_identifiers?: Array<{ type?: string; value?: string }>;
  source_status?: { value?: string } | string | null;
  observed_at?: string;
  source?: { source_id?: string; source_release_id?: string; source_record_id?: string };
};
type Candidate = {
  candidate_id: string;
  stratum: 'automatic-physical-site' | 'automatic-establishment' | 'review-candidate';
  entity_type: 'physical_site' | 'establishment';
  rule_id: string;
  label_question: string;
  source_pair: string[];
  left_profile: Profile;
  right_profile: Profile;
  review_label: ReviewLabel;
};
type StratumAssessment = {
  sampled: number;
  submitted: number;
  complete: boolean;
  conclusive: number;
  excluded: number;
  observed_precision: number | null;
  wilson_lower_bound_95: number | null;
  precision_gate_passed: boolean;
};
type BenchmarkState = {
  available: boolean;
  reason?: string;
  release_id?: string;
  revision?: string;
  assessment?: {
    strata: Record<string, StratumAssessment>;
    automatic_precision_gate_passed: boolean;
    export_authorized: boolean;
  };
  coverage?: {
    total_sampled_candidates: number;
    submitted_labels: number;
  };
  pagination?: { offset: number; limit: number; total: number; has_more: boolean };
  candidates?: Candidate[];
};

const labelText: Record<ReviewLabelValue, string> = {
  match: 'Match',
  'non-match': 'Non-match',
  uncertain: 'Uncertain',
  'not-reviewable': 'Not reviewable',
};

function profileName(profile: Profile) {
  return profile.names?.[0]?.raw || profile.names?.[0]?.strict || 'Unnamed source record';
}

function profileAddress(profile: Profile) {
  const address = profile.address ?? {};
  return [address.street, address.unit_or_additional, address.city, address.state, address.zip_code].filter(Boolean).join(', ') || 'No usable reported address';
}

function sourceName(profile: Profile) {
  return profile.source?.source_id || 'Unknown source';
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}

async function benchmarkApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${RUNNER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Runner returned HTTP ${response.status}.`);
  }
  return response.json();
}

export default function BenchmarkReview() {
  const [data, setData] = useState<BenchmarkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stratum, setStratum] = useState('all');
  const [status, setStatus] = useState('unlabeled');
  const [offset, setOffset] = useState(0);
  const [reviewerId, setReviewerId] = useState('');
  const [editor, setEditor] = useState<{ candidate: Candidate; label: ReviewLabelValue; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ stratum, status, offset: String(offset), limit: '8' });
      setData(await benchmarkApi<BenchmarkState>(`/api/entity-resolution/benchmark?${query}`));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load benchmark review.');
    } finally {
      setLoading(false);
    }
  }, [offset, status, stratum]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('cotive-benchmark-reviewer-id');
      if (saved) setReviewerId(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (reviewerId.trim()) window.localStorage.setItem('cotive-benchmark-reviewer-id', reviewerId.trim());
  }, [reviewerId]);

  const automaticProgress = useMemo(() => {
    const strata = data?.assessment?.strata;
    if (!strata) return { submitted: 0, sampled: 850 };
    const site = strata['automatic-physical-site'];
    const establishment = strata['automatic-establishment'];
    return { submitted: site.submitted + establishment.submitted, sampled: site.sampled + establishment.sampled };
  }, [data]);

  async function saveLabel() {
    if (!editor || !data?.revision) return;
    if (reviewerId.trim().length < 2) {
      setError('Enter a reviewer ID before saving a label.');
      return;
    }
    if (editor.label !== 'match' && !editor.note.trim()) {
      setError(`${labelText[editor.label]} requires an evidence note.`);
      return;
    }
    setSaving(true);
    try {
      await benchmarkApi(`/api/entity-resolution/benchmark/labels/${encodeURIComponent(editor.candidate.candidate_id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: editor.label,
          reviewerId: reviewerId.trim(),
          evidenceNote: editor.note.trim() || null,
          evidenceReferences: [],
          expectedRevision: data.revision,
        }),
      });
      setEditor(null);
      setNotice(`Saved ${labelText[editor.label].toLowerCase()} with an audit event.`);
      setError('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save label.');
    } finally {
      setSaving(false);
    }
  }

  const siteAssessment = data?.assessment?.strata['automatic-physical-site'];
  const establishmentAssessment = data?.assessment?.strata['automatic-establishment'];

  return (
    <section id="benchmark" className="panel benchmark-panel">
      <div className="panel-heading benchmark-heading">
        <div>
          <span className="section-kicker">Independent quality gate</span>
          <h2>Entity-resolution review <em>{data?.release_id || 'No live sample'}</em></h2>
        </div>
        <div className="benchmark-actions">
          <label>Reviewer ID<input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} placeholder="operator-name" /></label>
          {data?.available && <a className="ghost-button link-button" href={`${RUNNER_URL}/api/entity-resolution/benchmark/labels`}>Download labels</a>}
          <button className="text-button" onClick={() => void load()} disabled={loading}>Refresh</button>
        </div>
      </div>

      {!data?.available && !loading && <div className="benchmark-empty">{data?.reason || error || 'No benchmark sample is available.'}</div>}
      {data?.available && (
        <>
          <div className="benchmark-metrics">
            <div><span>Automatic review</span><strong>{automaticProgress.submitted} / {automaticProgress.sampled}</strong><small>submitted labels</small></div>
            <div><span>Site lower bound</span><strong>{percent(siteAssessment?.wilson_lower_bound_95)}</strong><small>{siteAssessment?.precision_gate_passed ? 'gate passed' : 'requires ≥ 99.00%'}</small></div>
            <div><span>Establishment lower bound</span><strong>{percent(establishmentAssessment?.wilson_lower_bound_95)}</strong><small>{establishmentAssessment?.precision_gate_passed ? 'gate passed' : 'requires ≥ 99.00%'}</small></div>
            <div><span>Release posture</span><strong className={data.assessment?.automatic_precision_gate_passed ? 'gate-pass' : 'gate-hold'}>{data.assessment?.automatic_precision_gate_passed ? 'Precision pass' : 'On hold'}</strong><small>export remains prohibited</small></div>
          </div>

          <div className="benchmark-toolbar">
            <label>Stratum<select value={stratum} onChange={(event) => { setStratum(event.target.value); setOffset(0); }}><option value="all">All strata</option><option value="automatic-physical-site">Automatic sites</option><option value="automatic-establishment">Automatic establishments</option><option value="review-candidate">Review candidates</option></select></label>
            <label>Label status<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="unlabeled">Unlabeled</option><option value="labeled">Labeled</option><option value="all">All</option></select></label>
            <span>{data.pagination?.total ?? 0} matching packets</span>
            <div className="benchmark-pager"><button onClick={() => setOffset(Math.max(0, offset - 8))} disabled={offset === 0}>← Previous</button><button onClick={() => setOffset(offset + 8)} disabled={!data.pagination?.has_more}>Next →</button></div>
          </div>

          {error && <p className="benchmark-error">{error}</p>}
          {notice && <p className="benchmark-notice">{notice}</p>}
          {loading && <div className="benchmark-empty">Loading verified review packets…</div>}
          {!loading && !data.candidates?.length && <div className="benchmark-empty">No packets match these filters.</div>}
          <div className="benchmark-list">
            {data.candidates?.map((candidate) => (
              <article className="benchmark-row" key={candidate.candidate_id}>
                <div className="benchmark-row-head">
                  <div><span>{candidate.stratum.replaceAll('-', ' ')}</span><strong>{candidate.label_question}</strong></div>
                  {candidate.review_label?.label && <i className={`label-chip ${candidate.review_label.label}`}>{labelText[candidate.review_label.label]}</i>}
                </div>
                <div className="profile-pair">
                  {[candidate.left_profile, candidate.right_profile].map((profile) => (
                    <div className="review-profile" key={profile.profile_id}>
                      <span>{sourceName(profile)}</span>
                      <strong>{profileName(profile)}</strong>
                      <p>{profileAddress(profile)}</p>
                      <small>{profile.source?.source_record_id} · observed {profile.observed_at ? new Date(profile.observed_at).toLocaleDateString() : 'unknown'}</small>
                    </div>
                  ))}
                </div>
                <div className="label-buttons">
                  {(Object.keys(labelText) as ReviewLabelValue[]).map((value) => <button className={value} key={value} onClick={() => { setEditor({ candidate, label: value, note: '' }); setError(''); }}>{labelText[value]}</button>)}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editor && (
        <div className="review-editor">
          <div><span className="section-kicker">Record independent judgment</span><strong>{labelText[editor.label]}</strong><small>{profileName(editor.candidate.left_profile)} ↔ {profileName(editor.candidate.right_profile)}</small></div>
          <textarea value={editor.note} onChange={(event) => setEditor({ ...editor, note: event.target.value })} placeholder={editor.label === 'match' ? 'Optional evidence note' : 'Required evidence note'} />
          <button className="ghost-button" onClick={() => setEditor(null)} disabled={saving}>Cancel</button>
          <button className="primary-button" onClick={() => void saveLabel()} disabled={saving}>{saving ? 'Saving…' : 'Save audited label'}</button>
        </div>
      )}
    </section>
  );
}
