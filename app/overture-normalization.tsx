'use client';
import { useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';
import { eligibleOvertureAcquisition, type Operation } from './data-operation-model';
type Baseline = { releaseId: string; sha256: string; referenceYear: number };
type Choices = { baselines: Baseline[]; unavailable: number; truncated: boolean; verification: 'manifest-only' };
export default function OvertureNormalization({ operations, disabled, onOperation }: {
  operations: Operation[]; disabled: boolean; onOperation: (operation: Operation) => void;
}) {
  const [choices, setChoices] = useState<Choices | null>(null);
  const [acquisitionId, setAcquisitionId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    runnerJson<Choices>('/api/data-operations/overture-normalization-baselines', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setChoices(value); })
      .catch(() => { if (!controller.signal.aborted) setError('Retained Census releases could not be loaded. Refresh to try again.'); });
    return () => controller.abort();
  }, [revision]);
  const eligible = operations.filter(eligibleOvertureAcquisition);
  const acquisition = eligible.find(item => item.id === acquisitionId);
  const baseline = choices?.baselines.find(item => item.releaseId === baselineId);
  const ready = !!acquisition && !!baseline && !disabled && !busy;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !acquisition || !baseline || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const operation = await runnerJson<Operation>('/api/data-operations/overture-normalizations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acquisitionOperationId: acquisition.id, baselineReleaseId: baseline.releaseId, baselineSha256: baseline.sha256 }),
      });
      onOperation(operation); setAcquisitionId('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Normalization could not be started.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <section className="operations-builder" aria-labelledby="normalization-title">
    <h3 id="normalization-title">Normalize retained Overture data</h3>
    <p className="operations-note">Reuse a completed source download with a retained Census ZIP baseline. No new download or national promotion is performed.</p>
    {error && <p role="alert" className="operations-error">{error}</p>}
    <form onSubmit={event => void submit(event)}>
      <label>Completed source acquisition<select value={acquisition?.id ?? ''} disabled={busy || disabled || !eligible.length} onChange={event => setAcquisitionId(event.target.value)}>
        <option value="">Select a retained acquisition</option>{eligible.map(item => <option key={item.id} value={item.id}>{item.id} · {new Date(item.createdAt).toLocaleString()}</option>)}
      </select></label>
      {!eligible.length && <p className="operations-note">No successful, ready Overture acquisition is available in operation history. Failed and incomplete acquisitions cannot be normalized.</p>}
      <label>Census baseline release<select value={baseline?.releaseId ?? ''} disabled={busy || disabled || !choices?.baselines.length} onChange={event => setBaselineId(event.target.value)}>
        <option value="">Select a retained baseline</option>{choices?.baselines.map(item => <option key={item.releaseId} value={item.releaseId}>{item.referenceYear} · {item.releaseId}</option>)}
      </select></label>
      {!choices && !error && <p className="operations-note">Loading retained baseline choices…</p>}
      {choices && !choices.baselines.length && <p className="operations-note">No baseline candidates are available.</p>}
      {choices && (choices.unavailable > 0 || choices.truncated) && <p className="operations-note">This list is incomplete: {choices.unavailable} inspected entries were unavailable or unsuitable.{choices.truncated ? ' The directory scan reached its limit.' : ''}</p>}
      {baseline && <p className="operations-note">Pinned manifest SHA-256: <code>{baseline.sha256}</code></p>}
      <p className="operations-note">Choices reflect retained manifest metadata, not full data verification. The app rechecks both inputs before starting. Census ZIP/ZCTA coverage does not establish current USPS validity.</p>
      <div className="operations-actions"><button type="button" className="ghost-button" disabled={busy} onClick={() => { setChoices(null); setBaselineId(''); setError(''); setRevision(value => value + 1); }}>Refresh baseline choices</button>
        <button type="submit" className="primary-button" disabled={!ready}>{busy ? 'Starting normalization…' : 'Normalize retained data'}</button></div>
    </form>
  </section>;
}
