'use client';

import { useEffect, useState } from 'react';
import { downloadRunnerArtifact, runnerJson } from './runner-client';
import RefreshSchedules from './refresh-schedules';
import ProductionRuns from './production-runs';
import OvertureNormalization from './overture-normalization';
import { operationLabel, operationEvidence, type Operation } from './data-operation-model';

type Catalog = {
  industries: Array<{ id: string; label?: string }>;
  states: string[];
  collectionSources?: Array<{ id: string; scope: string; states: string[] | 'all'; industries: string[]; manualSelectionRequired: boolean }>;
  export: { categories: string[]; fields: string[]; formats: string[]; policyModes: string[] };
};
type Plan = {
  taskCount: number; maxConcurrency: number; warnings: string[];
  tasks: Array<{ id: string; sourceId: string; scope: string; state?: string }>;
  gaps: Array<{ industry: string; state: string; reason: string }>;
};
const base = '/api/data-operations';
const active = (status: string) => ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(status);
const label = (text: string) => text.replaceAll('-', ' ').replaceAll('_', ' ');
const initialFields = ['business_name', 'street', 'city', 'state', 'zip_code', 'zip4', 'latitude', 'longitude'];
const selectedValues = (element: HTMLSelectElement) => Array.from(element.selectedOptions, (option) => option.value);

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  return runnerJson<T>(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export default function DataOperations() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [industry, setIndustry] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [category, setCategory] = useState('');
  const [exportStates, setExportStates] = useState<string[]>([]);
  const [fields, setFields] = useState(initialFields);
  const [format, setFormat] = useState('both');
  const [policyMode, setPolicyMode] = useState('public-only');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const [nextCatalog, history] = await Promise.all([
          runnerJson<Catalog>(`${base}/catalog`, { signal: controller.signal }),
          runnerJson<Operation[]>(`${base}/operations`, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) { setCatalog(nextCatalog); setOperations(history); setConnectionError(''); }
      } catch (reason) {
        if (!controller.signal.aborted) setConnectionError(reason instanceof Error ? reason.message : 'Unable to reach data operations.');
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const locked = operations.some((operation) => active(operation.status));
  const act = async (action: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed.'); }
    finally { setBusy(false); }
  };
  const remember = (operation: Operation) => setOperations((items) => [operation, ...items.filter((item) => item.id !== operation.id)]);
  const collectionInput = { industries: industry ? [industry] : [], states, ...(sourceId ? { sourceIds: [sourceId] } : {}) };
  const collectionSources = catalog?.collectionSources?.filter(source => (!industry || source.industries.includes(industry))
    && (!states.length || source.states === 'all' || states.some(state => source.states.includes(state)))) ?? [];

  return <section id="data-operations" className="panel data-operations">
    <div className="panel-heading"><div><span className="section-kicker">Collect · compile · extract</span><h2>Data operations</h2></div><span className="operations-local">Runs locally · no AI required</span></div>
    {(error || connectionError) && <p className="operations-error" role="alert">{error || connectionError}</p>}
    <div className="operations-builders">
      <section aria-labelledby="collection-title" className="operations-builder">
        <h3 id="collection-title">Update an industry</h3>
        <label>Industry<select value={industry} disabled={!catalog || busy} onChange={(event) => { setIndustry(event.target.value); setSourceId(''); setPlan(null); }}><option value="">All configured industries</option>{catalog?.industries.map((item) => <option key={item.id} value={item.id}>{item.label ?? label(item.id)}</option>)}</select></label>
        <label>Publisher states<select multiple size={5} value={states} disabled={!catalog || busy} onChange={(event) => { setStates(selectedValues(event.currentTarget)); setSourceId(''); setPlan(null); }}>{catalog?.states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <p className="operations-note">No state selection means all states. Hold Ctrl or Command to select several. State publishers may include out-of-state premises; national sources are acquired once in full.</p>
        <label>Collection source<select value={sourceId} disabled={!catalog || busy} onChange={(event) => { setSourceId(event.target.value); setPlan(null); }}><option value="">Default sources only</option>{collectionSources.map(source => <option key={source.id} value={source.id}>{label(source.id)}{source.manualSelectionRequired ? ' (manual-only)' : ''}</option>)}</select></label>
        <p className="operations-note">Manual-only sources are excluded from default runs. Selecting a source does not grant approval or bypass its checks.</p>
        <div className="operations-actions"><button className="ghost-button" disabled={!catalog || busy} onClick={() => void act(async () => setPlan(await post<Plan>('/plan', collectionInput)))}>Preview collection</button><button className="primary-button" disabled={!plan?.taskCount || locked || busy || !!connectionError} onClick={() => void act(async () => remember(await post<Operation>('/collections', collectionInput)))}>Start collection</button></div>
        {plan && <div className="operations-plan" aria-live="polite">
          <strong>{plan.taskCount} source updates · up to {Math.min(plan.taskCount, plan.maxConcurrency)} parallel workers</strong>
          <ul>{plan.tasks.map((task) => <li key={task.id}>{label(task.sourceId)} <span>({task.state ?? 'national'})</span></li>)}</ul>
          {plan.warnings.map((warning) => <p key={warning} className="operations-note">{warning}</p>)}
          {!!plan.gaps.length && <details><summary>{plan.gaps.length} industry/state collection gaps</summary><ul>{plan.gaps.map((gap) => <li key={`${gap.industry}-${gap.state}`}>{gap.state} · {label(gap.industry)} — {gap.reason}</li>)}</ul></details>}
          <p className="operations-note">New source releases are preserved separately. They appear in national comparisons after reconciliation.</p>
        </div>}
      </section>
      <section aria-labelledby="export-title" className="operations-builder">
        <h3 id="export-title">Build a flat file</h3>
        <label>Business category<select value={category} disabled={!catalog || busy} onChange={(event) => setCategory(event.target.value)}><option value="">All profile categories</option>{catalog?.export.categories.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>Business address states<select multiple size={5} value={exportStates} disabled={!catalog || busy} onChange={(event) => setExportStates(selectedValues(event.currentTarget))}>{catalog?.states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <p className="operations-note">No selection means all states. Exports use the current reconciled registry and preserve separate source records.</p>
        <fieldset className="operations-fields"><legend>Columns</legend>{catalog?.export.fields.map((field) => <label key={field}><input type="checkbox" checked={fields.includes(field)} disabled={busy} onChange={(event) => setFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />{label(field)}</label>)}</fieldset>
        <p className="operations-note">Record provenance is always included. ZIP5 and ZIP+4 stay separate. Business geography uses address latitude and longitude only.</p>
        <div className="operations-options"><label>Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="both">CSV and JSONL</option><option value="csv">CSV</option><option value="jsonl">JSONL</option></select></label><label>Use mode<select value={policyMode} onChange={(event) => setPolicyMode(event.target.value)}><option value="public-only">Public record policies only</option><option value="local-review">Local review</option></select></label></div>
        <p className="operations-note">Local review includes records approved for local inspection. Unknown or prohibited policies are excluded. Building a file does not publish it.</p>
        <button className="primary-button" disabled={!catalog || !fields.length || locked || busy || !!connectionError} onClick={() => void act(async () => remember(await post<Operation>('/exports', { categories: category ? [category] : [], states: exportStates, fields, format, policyMode })))}>Build file</button>
      </section>
    </div>
    <RefreshSchedules catalog={catalog} />
    <OvertureNormalization operations={operations} disabled={locked || busy || !!connectionError || !catalog} onOperation={remember} />
    <ProductionRuns />
    <section className="operations-history" aria-labelledby="operations-history-title"><h3 id="operations-history-title">Operation history</h3>
      {locked && <p className="operations-note">An operation is active. Additional starts become available when it finishes.</p>}
      {!operations.length && <p className="operations-note">{catalog ? 'No managed operations yet. Preview a collection or build a file above.' : 'Connecting to the local runner…'}</p>}
      {operations.map((operation) => <article key={operation.id} className="operation-record">
        <div><strong>{operationLabel(operation.kind)}</strong><span className={`operation-status status-${operation.status.toLowerCase()}`}>{label(operation.status.toLowerCase())}</span><time dateTime={operation.createdAt}>{new Date(operation.createdAt).toLocaleString()}</time></div>
        <small>{operation.id}</small>
        {operation.result?.sourceId && <p>{label(operation.result.sourceId)}</p>}
        {operationEvidence(operation) && <p className="operations-note">{operationEvidence(operation)}</p>}
        {operation.status === 'SUCCEEDED' && operation.result?.normalizationReady === true && typeof operation.result.normalizedPlaces === 'number' && <p>{operation.result.normalizedPlaces.toLocaleString()} normalized source places · not a unique-business count</p>}
        {typeof operation.result?.rowsWritten === 'number' && <p>{operation.result.rowsWritten.toLocaleString()} exported records · {label(operation.result.policyMode ?? '')}</p>}
        {typeof operation.result?.plan?.taskCount === 'number' && <p>{operation.result.plan.taskCount} source updates in the collection plan</p>}
        {!!operation.result?.tasks?.length && <ul className="operation-task-list">{operation.result.tasks.map((task) => <li key={task.task_id}><span>{label(task.source_id ?? task.task_id)} · {task.state ?? 'national'}</span><strong>{label(task.status)}</strong></li>)}</ul>}
        {operation.error && <p role="status">{operation.error}</p>}
        {operation.status === 'UNKNOWN' && <p className="operations-note">The earlier process could not be conclusively resolved. Its operation remains protected from duplicate execution.</p>}
        <div className="operations-actions">{['RUNNING', 'QUEUED'].includes(operation.status) && <button className="ghost-button" disabled={busy} onClick={() => void act(async () => remember(await post<Operation>(`/operations/${encodeURIComponent(operation.id)}/cancel`, {})))}>Cancel</button>}{operation.artifacts.map((artifact) => <button key={artifact.name} className="ghost-button" disabled={busy} onClick={() => void act(async () => downloadRunnerArtifact(`${base}/operations/${encodeURIComponent(operation.id)}/artifacts/${encodeURIComponent(artifact.name)}`, artifact.name))}>Download {artifact.name} · {(artifact.bytes / 1024 / 1024).toFixed(1)} MB</button>)}</div>
      </article>)}
    </section>
  </section>;
}
