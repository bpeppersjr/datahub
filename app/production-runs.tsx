'use client';

import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';

type Run = {
  runId: string; status: string; startedAt: string; finishedAt: string | null; stopRequested: boolean;
  completedStages: number; totalStages: number; hasError: boolean; controllerPresence: string;
  stages: Array<{ id: string; status: string }>;
  outputs: Array<{ group: string; releaseId: string }>;
};
type Snapshot = { inspectedAt: string; runs: Run[]; unavailableRuns: number; omittedRuns: number };
const label = (text: string) => text.toLowerCase().replaceAll('-', ' ');

export default function ProductionRuns() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return; pending = true;
      try {
        const next = await runnerJson<Snapshot>('/api/data-operations/production-runs', { signal: controller.signal });
        if (!controller.signal.aborted) { setSnapshot(next); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <section className="operations-history" aria-labelledby="production-runs-title">
    <h3 id="production-runs-title">National dataset rebuilds</h3>
    <p className="operations-note">Standalone app jobs reuse retained data. Stages publish separately; stage completion is not business coverage or row progress.</p>
    {error && <p className="operations-error" role="alert">Current rebuild status is unavailable. Any results below are the last successful snapshot, not a live update.</p>}
    {!snapshot && !error && <p className="operations-note">Loading rebuild history…</p>}
    {snapshot && <>
      <p className="operations-note">Last checked <time dateTime={snapshot.inspectedAt}>{new Date(snapshot.inspectedAt).toLocaleString()}</time></p>
      {snapshot.unavailableRuns > 0 && <p role="status">{snapshot.unavailableRuns} run records could not be safely read. This is an incomplete history.</p>}
      {!snapshot.runs.length && !snapshot.unavailableRuns && <p>No production rebuild receipts yet.</p>}
      {snapshot.runs.map(run => <article key={run.runId} className="operation-record">
        <div><strong>{run.runId}</strong><span className="operation-status">Recorded {label(run.status)}</span></div>
        <p>Started <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>{run.finishedAt && <> · Finished <time dateTime={run.finishedAt}>{new Date(run.finishedAt).toLocaleString()}</time></>}</p>
        {run.status === 'RUNNING' && <p className="operations-note">{run.controllerPresence === 'missing' ? 'The recorded controller process was not found. Inspect ownership before recovery; this does not mark the job failed.' : run.controllerPresence === 'present' ? 'A process exists at the recorded controller PID; its identity and progress are not independently verified.' : 'Controller process availability is unknown.'}</p>}
        {run.stopRequested && <p>Stop requested · the app finishes its current stage before stopping.</p>}
        {run.hasError && <p role="status">The local receipt contains an error. No retry has been started.</p>}
        <details><summary>{run.completedStages} of {run.totalStages} stages completed</summary><ul className="operation-task-list">{run.stages.map(stage => <li key={stage.id}><span>{label(stage.id)}</span><strong>{label(stage.status)}</strong></li>)}</ul></details>
        {!!run.outputs.length && <details><summary>Releases recorded by this run</summary><ul>{run.outputs.map(output => <li key={output.group}>{label(output.group)}: {output.releaseId}</li>)}</ul><p className="operations-note">These historical outputs are not necessarily today’s current releases.</p></details>}
      </article>)}
      {snapshot.omittedRuns > 0 && <p className="operations-note">{snapshot.omittedRuns} older readable runs are omitted from this view.</p>}
    </>}
  </section>;
}
