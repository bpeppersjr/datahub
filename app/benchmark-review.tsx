'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadRunnerArtifact, runnerJson } from './runner-client';

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
type ImportResolution = { action: 'keep-existing' } | { action: 'replace'; correction_reason: string };
type ImportConflict = { candidate_id: string; existing_label: ReviewLabelValue; incoming_label: ReviewLabelValue };
type ImportPreview = {
  ready: boolean;
  preview_token: string | null;
  counts: { uploaded_rows: number; added: number; replaced: number; kept_existing: number; unchanged: number; ignored_null_rows: number };
  conflicts: ImportConflict[];
  unresolved_conflicts: string[];
  before: { strata: Record<string, StratumAssessment> };
  after: { strata: Record<string, StratumAssessment> };
  draft_only: true;
  export_authorized: false;
  benchmark_gate_passed: boolean;
};
type FinalizationPreview = {
  ready: boolean;
  preview_token: string | null;
  blockers: string[];
  submitted_label_count: number;
  unlabeled_count: number;
  reviewer_count: number;
  strata: Record<string, StratumAssessment>;
  prior_snapshot: { release_id: string; manifest_sha256: string | null } | null;
  label_diff: { added: number; removed: number; unchanged: number };
  benchmark_gate_passed: boolean;
  complete_labeled_benchmark: boolean;
  export_authorized: false;
  bindings: { draft_revision: string };
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
  return runnerJson<T>(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
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
  const [importingOperatorId, setImportingOperatorId] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [jsonl, setJsonl] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, ImportResolution>>({});
  const [importBusy, setImportBusy] = useState(false);
  const [finalizationOperatorId, setFinalizationOperatorId] = useState('');
  const [finalizationPreview, setFinalizationPreview] = useState<FinalizationPreview | null>(null);
  const [finalizationConfirmation, setFinalizationConfirmation] = useState('');
  const [finalizationBusy, setFinalizationBusy] = useState(false);
  const [finalizationError, setFinalizationError] = useState('');

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

  async function downloadLabels() {
    try {
      await downloadRunnerArtifact('/api/entity-resolution/benchmark/labels', 'entity-resolution-benchmark.labels.jsonl');
      setNotice('Prepared the current working labels download.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download labels.');
    }
  }

  async function selectImportFile(file?: File) {
    if (!file) return;
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      setJsonl(decoded);
      setUploadName(file.name);
      setImportPreview(null);
      setPreviewStale(true);
      setConflictResolutions({});
      setError('');
      setNotice('Upload loaded locally. No labels have been changed.');
    } catch {
      setJsonl('');
      setUploadName('');
      setImportPreview(null);
      setPreviewStale(true);
      setError('The selected file is not valid UTF-8.');
    }
  }

  function importRequest() {
    if (!data?.revision) throw new Error('Refresh the benchmark working revision before importing.');
    if (importingOperatorId.trim().length < 2) throw new Error('Enter a separate importing operator ID.');
    return {
      jsonl,
      importingOperatorId: importingOperatorId.trim(),
      expectedRevision: data.revision,
      conflictResolutions,
    };
  }

  async function previewImport() {
    setImportBusy(true);
    setPreviewStale(true);
    try {
      const preview = await benchmarkApi<ImportPreview>('/api/entity-resolution/benchmark/labels/import/preview', {
        method: 'POST', body: JSON.stringify(importRequest()),
      });
      setImportPreview(preview);
      setPreviewStale(false);
      setError('');
      setNotice(preview.ready ? 'Preview ready. This is still a local working-label draft.' : 'Resolve each completed-label conflict, then preview again.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview label import.');
      setPreviewStale(true);
    } finally {
      setImportBusy(false);
    }
  }

  async function commitImport() {
    if (!importPreview?.ready || !importPreview.preview_token || previewStale) return;
    setImportBusy(true);
    try {
      await benchmarkApi('/api/entity-resolution/benchmark/labels/import/commit', {
        method: 'POST', body: JSON.stringify({ ...importRequest(), previewToken: importPreview.preview_token }),
      });
      setImportPreview(null);
      setPreviewStale(true);
      setJsonl('');
      setUploadName('');
      setConflictResolutions({});
      setNotice('Labels merged into the local working draft. No label snapshot was published and export remains unauthorized.');
      setError('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to commit label import. Refresh and preview again if the draft changed.');
    } finally {
      setImportBusy(false);
    }
  }

  function setResolution(candidateId: string, value: string) {
    setConflictResolutions((current) => {
      const next = { ...current };
      if (value === 'keep-existing') next[candidateId] = { action: 'keep-existing' };
      else if (value === 'replace') next[candidateId] = { action: 'replace', correction_reason: current[candidateId]?.action === 'replace' ? current[candidateId].correction_reason : '' };
      else delete next[candidateId];
      return next;
    });
    setPreviewStale(true);
  }

  async function previewFinalization() {
    if (!data?.revision || finalizationOperatorId.trim().length < 2) return;
    setFinalizationBusy(true);
    setFinalizationError('');
    try {
      const preview = await benchmarkApi<FinalizationPreview>('/api/entity-resolution/benchmark/labels/finalize/preview', {
        method: 'POST', body: JSON.stringify({ operatorId: finalizationOperatorId.trim(), expectedRevision: data.revision }),
      });
      setFinalizationPreview(preview);
      setFinalizationConfirmation('');
    } catch (caught) {
      setFinalizationPreview(null);
      setFinalizationError(caught instanceof Error ? caught.message : 'Unable to preview label snapshot.');
    } finally { setFinalizationBusy(false); }
  }

  async function publishFinalization() {
    if (!data?.revision || !finalizationPreview?.ready || !finalizationPreview.preview_token || finalizationConfirmation !== 'PUBLISH LABEL SNAPSHOT') return;
    setFinalizationBusy(true);
    setFinalizationError('');
    try {
      const result = await benchmarkApi<{ release_id: string }>('/api/entity-resolution/benchmark/labels/finalize/publish', {
        method: 'POST', body: JSON.stringify({
          operatorId: finalizationOperatorId.trim(), expectedRevision: data.revision,
          previewToken: finalizationPreview.preview_token, confirmation: finalizationConfirmation,
        }),
      });
      setFinalizationPreview(null);
      setFinalizationConfirmation('');
      setNotice(`Immutable label snapshot ${result.release_id} published. Export remains unauthorized.`);
      await load();
    } catch (caught) {
      setFinalizationError(caught instanceof Error ? caught.message : 'Unable to publish label snapshot; inspect local publication status before retrying.');
    } finally { setFinalizationBusy(false); }
  }

  const siteAssessment = data?.assessment?.strata['automatic-physical-site'];
  const establishmentAssessment = data?.assessment?.strata['automatic-establishment'];
  const finalizationPreviewStale = !!finalizationPreview && finalizationPreview.bindings.draft_revision !== data?.revision;

  return (
    <section id="benchmark" className="panel benchmark-panel">
      <div className="panel-heading benchmark-heading">
        <div>
          <span className="section-kicker">Independent quality gate</span>
          <h2>Entity-resolution review <em>{data?.release_id || 'No live sample'}</em></h2>
        </div>
        <div className="benchmark-actions">
          <label>Reviewer ID<input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} placeholder="operator-name" /></label>
          {data?.available && <button className="ghost-button link-button" onClick={() => void downloadLabels()}>Download labels</button>}
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

          <details className="benchmark-import">
            <summary>Import reviewed labels into the working draft</summary>
            <p className="operations-note">Strict UTF-8 JSONL subset or full upload (maximum 4 MiB, 1,275 rows). Preview is read-only. Import changes remain a draft; publishing a label snapshot and export authorization are separate actions.</p>
            <div className="benchmark-toolbar">
              <label>Label JSONL<input type="file" accept=".jsonl,application/x-ndjson,application/jsonl" onChange={(event) => void selectImportFile(event.target.files?.[0])} /></label>
              <label>Importing operator ID<input value={importingOperatorId} onChange={(event) => { setImportingOperatorId(event.target.value); setImportPreview(null); setPreviewStale(true); }} placeholder="operator-name" /></label>
              <span>{uploadName || (jsonl ? 'JSONL loaded' : 'No file selected')}</span>
              <button className="ghost-button" onClick={() => void previewImport()} disabled={importBusy || !jsonl || importingOperatorId.trim().length < 2}>{importBusy ? 'Working…' : previewStale ? 'Preview import' : 'Re-preview import'}</button>
            </div>
            {importPreview && <div className="operations-plan" aria-live="polite">
              <strong>{previewStale ? 'Preview is out of date · preview again' : importPreview.ready ? 'Preview ready · draft only' : 'Conflict resolutions required'}</strong>
              <p>{importPreview.counts.uploaded_rows.toLocaleString()} uploaded · {importPreview.counts.added.toLocaleString()} added · {importPreview.counts.replaced.toLocaleString()} replaced · {importPreview.counts.kept_existing.toLocaleString()} kept · {importPreview.counts.unchanged.toLocaleString()} unchanged · {importPreview.counts.ignored_null_rows.toLocaleString()} null rows ignored</p>
              <p>Automatic precision gate after merge: {importPreview.benchmark_gate_passed ? 'passed' : 'not passed'} · export authorized: no</p>
              {importPreview.conflicts.map((conflict) => {
                const resolution = conflictResolutions[conflict.candidate_id];
                return <div className="review-conflict" key={conflict.candidate_id}>
                  <strong>{conflict.candidate_id}</strong>
                  <span>Existing: {labelText[conflict.existing_label]} · uploaded: {labelText[conflict.incoming_label]}</span>
                  <label>Resolution<select value={resolution?.action ?? ''} onChange={(event) => setResolution(conflict.candidate_id, event.target.value)}><option value="">Choose explicitly</option><option value="keep-existing">Keep existing</option><option value="replace">Replace with correction</option></select></label>
                  {resolution?.action === 'replace' && <label>Correction reason<textarea value={resolution.correction_reason} maxLength={2000} onChange={(event) => { setConflictResolutions((current) => ({ ...current, [conflict.candidate_id]: { action: 'replace', correction_reason: event.target.value } })); setPreviewStale(true); }} /></label>}
                </div>;
              })}
              {(previewStale || !importPreview.ready) && importPreview.conflicts.length > 0 && <button className="ghost-button" onClick={() => void previewImport()} disabled={importBusy}>Apply conflict choices to preview</button>}
              {importPreview.ready && <button className="primary-button" onClick={() => void commitImport()} disabled={importBusy || previewStale}>Commit to working draft</button>}
            </div>}
          </details>

          <details className="benchmark-finalization">
            <summary>Finalize an immutable label snapshot</summary>
            <p className="operations-note">A separate, irreversible publication step. Preview is read-only and will block while labels are empty, audit recovery is pending, or the registered sample/draft/pointer has drifted. A precision pass never authorizes export.</p>
            <div className="benchmark-toolbar">
              <label>Finalizing operator ID<input value={finalizationOperatorId} onChange={(event) => { setFinalizationOperatorId(event.target.value); setFinalizationPreview(null); setFinalizationConfirmation(''); }} placeholder="operator-name" /></label>
              <button className="ghost-button" onClick={() => void previewFinalization()} disabled={finalizationBusy || !data.revision || finalizationOperatorId.trim().length < 2}>{finalizationBusy ? 'Working…' : 'Preview snapshot'}</button>
              <span>Current draft: {data.revision?.slice(0, 12) || 'unavailable'}</span>
            </div>
            {finalizationPreview && <div className="operations-plan" aria-live="polite">
              <strong>{finalizationPreviewStale ? 'Draft changed · preview again' : finalizationPreview.ready ? 'Ready for explicit publication confirmation' : 'Publication blocked'}</strong>
              <p>{finalizationPreview.submitted_label_count.toLocaleString()} submitted · {finalizationPreview.unlabeled_count.toLocaleString()} unlabeled · {finalizationPreview.reviewer_count.toLocaleString()} reviewers</p>
              <p>Automatic precision gate: {finalizationPreview.benchmark_gate_passed ? 'passed' : 'not passed'} · full benchmark labeled: {finalizationPreview.complete_labeled_benchmark ? 'yes' : 'no'} · export authorized: no</p>
              {finalizationPreview.prior_snapshot && <p>Prior immutable snapshot: {finalizationPreview.prior_snapshot.release_id}</p>}
              {finalizationPreview.blockers.map((blocker) => <p className="benchmark-error" key={blocker}>{blocker}</p>)}
              {finalizationPreview.ready && !finalizationPreviewStale && <div className="finalize-confirmation">
                <label>Type PUBLISH LABEL SNAPSHOT to confirm<input value={finalizationConfirmation} onChange={(event) => setFinalizationConfirmation(event.target.value)} /></label>
                <button className="primary-button" onClick={() => void publishFinalization()} disabled={finalizationBusy || finalizationConfirmation !== 'PUBLISH LABEL SNAPSHOT'}>Publish immutable snapshot</button>
              </div>}
            </div>}
            {finalizationError && <p className="benchmark-error">{finalizationError}</p>}
          </details>

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
