'use client';

import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';

type View = {
  prerequisites_ready: boolean;
  metadata: { reason_code: string; release_id: string | null; age_days: number | null };
  runtime: { reason_code: string };
  failed_acquisition: {
    status: string;
    checkpoint_format: boolean;
    journal: { present: boolean; pending_request_index: number | null; requests_reserved: number; completed_requests: number; delivered_bytes: number };
  };
  capacity: {
    free_disk_gib: number | null;
    minimum_free_disk_gib: number;
    maximum_reserved_network_gib: number;
    engine_memory_setting_gib: number;
    spill_setting_gib: number;
    parallel_requests: number;
    minimum_pacing_ms: number;
    session_deadline_hours: number;
  };
  blockers: string[];
  next_steps: string[];
};

const label = (value: string) => value.replaceAll('-', ' ');

export default function OvertureReadiness() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<View>('/api/data-operations/overture-readiness', { signal: controller.signal })
      .then(setView)
      .catch(error => { if (error?.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, []);
  const failed = view?.failed_acquisition;
  const journal = failed?.journal;
  const capacity = view?.capacity;
  return <section className="operations-builder" aria-label="Overture acquisition readiness">
    <h3>Overture acquisition readiness</h3>
    {error ? <p role="alert">Readiness evidence could not be verified.</p> : !view || !failed || !capacity ? <p>Checking retained evidence…</p> : <>
      <p className="operations-note"><strong>{view.prerequisites_ready ? 'Prerequisites verified' : 'Blocked'}</strong>
        {' · source release '}{view.metadata.release_id ?? 'unavailable'}{view.metadata.age_days === null ? '' : ` · observed ${view.metadata.age_days} days ago`}.
      </p>
      <dl>
        <dt>Metadata replay</dt><dd>{label(view.metadata.reason_code)}</dd>
        <dt>Runtime replay</dt><dd>{label(view.runtime.reason_code)}</dd>
        <dt>Latest interrupted acquisition</dt>
        <dd>{failed.status}{failed.status !== 'absent' && (failed.checkpoint_format
          ? ' · checkpoint verification required'
          : ' · snapshot ready: no · resumable: no')}</dd>
        <dt>Request journal</dt><dd>{journal?.present
          ? `${journal.completed_requests}/${journal.requests_reserved} completed · pending ${journal.pending_request_index ?? 'none'} · ${journal.delivered_bytes.toLocaleString()} delivered bytes`
          : 'unavailable'}</dd>
        <dt>Retry authorized</dt><dd>No</dd>
        <dt>Local disk</dt><dd>{capacity.free_disk_gib ?? 'unknown'} GiB free · {capacity.minimum_free_disk_gib} GiB minimum</dd>
      </dl>
      <details><summary>Bounded acquisition contract</summary>
        <p>{capacity.parallel_requests} sequential request · {capacity.minimum_pacing_ms} ms minimum pacing · {capacity.maximum_reserved_network_gib} GiB reserved-range ceiling across recovery attempts · {capacity.engine_memory_setting_gib} GiB engine setting · {capacity.spill_setting_gib} GiB spill setting · {capacity.session_deadline_hours}-hour cooperative deadline.</p>
      </details>
      <details><summary>Blockers and app-owned recovery</summary>
        <ul>{view.blockers.map(blocker => <li key={blocker}>{label(blocker)}</li>)}</ul>
        <ol>{view.next_steps.map(step => <li key={step}>{step}</li>)}</ol>
      </details>
      <p className="operations-note">Co*Tive can reuse verified asset checkpoints after fresh explicit authorization.</p>
    </>}
  </section>;
}
