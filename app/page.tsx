'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import BenchmarkReview from './benchmark-review';
import BusinessIntelligence from './business-intelligence';
import CoverageExplorer from './coverage-explorer';

const RUNNER_URL = 'http://127.0.0.1:4300';

type JobType = 'browser' | 'api' | 'map' | 'places' | 'pharmacy' | 'download' | 'parse' | 'ocr' | 'transform';
type Status = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

type Job = {
  id: string;
  name: string;
  type: JobType;
  enabled: boolean;
  status: Status;
  config: Record<string, unknown>;
  updatedAt: string;
  lastRunId?: string;
  lastError?: string;
};

type Run = {
  id: string;
  jobId: string;
  jobName: string;
  type: JobType;
  status: Status;
  progress: number;
  message?: string;
  error?: string;
  outputPath?: string;
  summary?: { items?: number; kind?: string };
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  logs?: Array<{ at: string; level: string; message: string }>;
};

type Activity = {
  id: string;
  at: string;
  kind: string;
  runId: string;
  jobName: string;
  message?: string;
  progress?: number;
};

type Health = {
  ok: boolean;
  node: string;
  logicalCpus: number;
  pool: { concurrency: number; active: number; queued: number; available: number };
  services?: {
    googleMaps?: { configured: boolean };
    pharmacySource?: { cached: boolean; status: string; releaseId?: string | null; readyAt?: string | null; mainFile?: string | null };
  };
};

const jobMeta: Record<JobType, { label: string; short: string; tone: string; hint: string }> = {
  browser: { label: 'Browser scrape', short: 'BR', tone: 'cyan', hint: 'Playwright navigation, actions, selectors, pagination, and screenshots.' },
  api: { label: 'API call', short: 'AP', tone: 'violet', hint: 'HTTP method, headers, request body, response type, and timeout.' },
  map: { label: 'Map data', short: 'MP', tone: 'green', hint: 'Pull GeoJSON or a JSON feature collection and calculate map bounds.' },
  places: { label: 'ZIP place segments', short: 'GZ', tone: 'green', hint: 'Iterate ZIP inputs and build filtered segments with Google Places Aggregate.' },
  pharmacy: { label: 'Retail pharmacy directory', short: 'RX', tone: 'blue', hint: 'Build a ZIP-sorted retail pharmacy directory from NPPES with optional NCPDP enrichment.' },
  download: { label: 'Download', short: 'DL', tone: 'blue', hint: 'Download an HTTP resource into the datahub/downloads folder.' },
  parse: { label: 'Parser', short: 'PR', tone: 'orange', hint: 'Parse a local JSON, GeoJSON, CSV, or text artifact inside datahub.' },
  ocr: { label: 'OCR', short: 'OC', tone: 'amber', hint: 'Recognize text from a local image or an HTTP image using Tesseract.' },
  transform: { label: 'Transform', short: 'TX', tone: 'pink', hint: 'Select, sort, deduplicate, limit, and project fields from JSON output.' },
};

const statusLabel: Record<Status, string> = {
  idle: 'Ready', queued: 'Queued', running: 'Running', completed: 'Complete', failed: 'Failed', cancelled: 'Cancelled',
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${RUNNER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Runner returned HTTP ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function age(timestamp?: string) {
  if (!timestamp) return 'Never run';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [templates, setTemplates] = useState<Record<JobType, Record<string, unknown>> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Job | 'new' | null>(null);
  const [editorType, setEditorType] = useState<JobType>('browser');
  const [editorName, setEditorName] = useState('New browser scrape');
  const [editorEnabled, setEditorEnabled] = useState(true);
  const [editorConfig, setEditorConfig] = useState('{}');
  const [editorError, setEditorError] = useState('');
  const [runDetail, setRunDetail] = useState<Run | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (quiet = true) => {
    try {
      const [nextJobs, nextRuns, nextActivity, nextHealth] = await Promise.all([
        api<Job[]>('/api/jobs'),
        api<Run[]>('/api/runs?limit=200'),
        api<Activity[]>('/api/activity?limit=20'),
        api<Health>('/api/health'),
      ]);
      setJobs(nextJobs);
      setRuns(nextRuns);
      setActivity(nextActivity);
      setHealth(nextHealth);
    } catch (error) {
      setHealth(null);
      if (!quiet) setNotice(error instanceof Error ? error.message : 'Runner is offline.');
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh(false);
      void api<Record<JobType, Record<string, unknown>>>('/api/templates').then(setTemplates).catch(() => undefined);
    }, 0);
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const latestByJob = useMemo(() => {
    const map = new Map<string, Run>();
    for (const run of runs) if (!map.has(run.jobId)) map.set(run.jobId, run);
    return map;
  }, [runs]);

  const completedRuns = runs.filter((run) => run.status === 'completed');
  const failedRuns = runs.filter((run) => run.status === 'failed');
  const totalProcessed = completedRuns.reduce((sum, run) => sum + (run.summary?.items ?? 1), 0);
  const decidedRuns = completedRuns.length + failedRuns.length;
  const successRate = decidedRuns ? (completedRuns.length / decidedRuns) * 100 : 100;
  const active = health?.pool.active ?? 0;
  const concurrency = health?.pool.concurrency ?? 4;
  const utilization = Math.round((active / Math.max(1, concurrency)) * 100);

  function toggleSelection(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runJobs(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      await api('/api/runs', { method: 'POST', body: JSON.stringify({ jobIds: ids }) });
      setSelected(new Set());
      setNotice(`${ids.length} job${ids.length === 1 ? '' : 's'} added to the queue.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start jobs.');
    } finally {
      setBusy(false);
    }
  }

  function openNew(type: JobType = 'browser') {
    const config = templates?.[type] ?? {};
    setEditor('new');
    setEditorType(type);
    setEditorName(`New ${jobMeta[type].label.toLowerCase()}`);
    setEditorEnabled(true);
    setEditorConfig(JSON.stringify(config, null, 2));
    setEditorError('');
  }

  function openEdit(job: Job) {
    setEditor(job);
    setEditorType(job.type);
    setEditorName(job.name);
    setEditorEnabled(job.enabled);
    setEditorConfig(JSON.stringify(job.config, null, 2));
    setEditorError('');
  }

  function changeEditorType(type: JobType) {
    setEditorType(type);
    setEditorConfig(JSON.stringify(templates?.[type] ?? {}, null, 2));
    if (editor === 'new') setEditorName(`New ${jobMeta[type].label.toLowerCase()}`);
  }

  async function saveJob() {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(editorConfig);
      if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('Configuration must be a JSON object.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Invalid JSON configuration.');
      return;
    }
    setBusy(true);
    try {
      const payload = JSON.stringify({ name: editorName, type: editorType, enabled: editorEnabled, config });
      if (editor === 'new') await api('/api/jobs', { method: 'POST', body: payload });
      else if (editor) await api(`/api/jobs/${editor.id}`, { method: 'PUT', body: payload });
      setEditor(null);
      setNotice(editor === 'new' ? 'Job created.' : 'Job updated.');
      await refresh();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to save this job.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: Job) {
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
      setEditor(null);
      setNotice('Job deleted.');
      await refresh();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Unable to delete this job.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun(run: Run) {
    try {
      await api(`/api/runs/${run.id}/cancel`, { method: 'POST' });
      setNotice('Run cancelled.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to cancel run.');
    }
  }

  async function setConcurrency(value: number) {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ concurrency: value }) });
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update worker count.');
    }
  }

  function exportJobs() {
    const payload = jobs.map(({ name, type, enabled, config }) => ({ name, type, enabled, config }));
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cotive-collector-jobs.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJobs(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      const values = Array.isArray(parsed) ? parsed : parsed.jobs;
      if (!Array.isArray(values)) throw new Error('Import file must contain a job array.');
      for (const value of values) await api('/api/jobs', { method: 'POST', body: JSON.stringify(value) });
      setNotice(`Imported ${values.length} job${values.length === 1 ? '' : 's'}.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to import jobs.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-mark">C*</div>
        <nav aria-label="Primary navigation">
          <a className="rail-link active" href="#queue" aria-label="Operations">⌁</a>
          <a className="rail-link" href="#queue" aria-label="Jobs">▦</a>
          <a className="rail-link" href="#activity" aria-label="Activity">↺</a>
          <a className="rail-link" href="#coverage" aria-label="National business coverage">◎</a>
          <a className="rail-link" href="#business-intelligence" aria-label="Business heat maps and state comparisons">◉</a>
          <a className="rail-link" href="#benchmark" aria-label="Entity-resolution benchmark">≋</a>
        </nav>
        <div className="rail-spacer" />
        <span className={`system-dot ${health ? '' : 'offline'}`} title={health ? 'Runner online' : 'Runner offline'} />
        <button className="avatar" aria-label="Local operator">DH</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow"><span className={`live-dot ${health ? '' : 'offline'}`} /> {health ? `Runner online · ${health.node}` : 'Runner offline'}</div>
            <h1>Co*Tive Collector</h1>
          </div>
          <div className="top-actions">
            <input ref={importRef} type="file" accept="application/json,.json" onChange={importJobs} hidden />
            <button className="ghost-button" onClick={() => importRef.current?.click()} disabled={busy}>Import</button>
            <button className="ghost-button export-button" onClick={exportJobs} disabled={!jobs.length}>Export</button>
            <button className="primary-button" onClick={() => openNew()}><span>＋</span> New job</button>
          </div>
        </header>

        {!health && <div className="offline-banner"><strong>Runner unavailable.</strong> Start the local runner to create and execute jobs.</div>}

        <div className="content-grid">
          <section className="main-column">
            <div className="metrics">
              <article className="metric-card">
                <span className="metric-label">Active workers</span>
                <strong>{active}<span className="muted-total"> / {concurrency}</span></strong>
                <div className="micro-bars" aria-hidden="true">
                  {[44, 68, 31, 82, 60, 76, 47, 88, 67, 54, 72, 61].map((height, index) => <i key={index} style={{ height: `${active ? height : 8}%` }} />)}
                </div>
              </article>
              <article className="metric-card">
                <span className="metric-label">Items processed</span>
                <strong>{formatCount(totalProcessed)}</strong>
                <span className="delta">{completedRuns.length} completed runs</span>
              </article>
              <article className="metric-card">
                <span className="metric-label">Success rate</span>
                <strong>{successRate.toFixed(1)}%</strong>
                <span className="metric-foot">{decidedRuns} decided runs</span>
              </article>
            </div>

            <section id="queue" className="panel queue-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Live workload</span>
                  <h2>Execution queue <em>{health?.pool.queued ? `${health.pool.queued} waiting` : `${jobs.length} jobs`}</em></h2>
                </div>
                <div className="queue-actions">
                  <button className="text-button" onClick={() => runJobs(jobs.filter((job) => job.enabled).map((job) => job.id))} disabled={busy || !health || !jobs.length}>Run all</button>
                  <button className="run-button" onClick={() => runJobs([...selected])} disabled={busy || !health || !selected.size}>▶ Run selected {selected.size ? `(${selected.size})` : ''}</button>
                </div>
              </div>

              <div className="table-head"><span>Job</span><span>Type</span><span>Status</span><span>Progress</span><span /></div>
              <div className="job-list">
                {!jobs.length && <div className="empty-state"><strong>No jobs yet</strong><span>Create a browser scrape, API call, ZIP place segment, retail pharmacy directory, map pull, download, parser, OCR, or transform.</span><button className="run-button" onClick={() => openNew()}>Create first job</button></div>}
                {jobs.map((job) => {
                  const run = latestByJob.get(job.id);
                  const state = run?.status ?? job.status ?? 'idle';
                  const progress = run?.progress ?? 0;
                  const meta = jobMeta[job.type];
                  return (
                    <article className={`job-row ${selected.has(job.id) ? 'selected' : ''}`} key={job.id}>
                      <div className="job-name">
                        <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggleSelection(job.id)} aria-label={`Select ${job.name}`} />
                        <button className={`type-icon ${meta.tone}`} onClick={() => openEdit(job)} aria-label={`Edit ${job.name}`}>{meta.short}</button>
                        <button className="job-title-button" onClick={() => openEdit(job)}>
                          <strong>{job.name}</strong><small>{run ? `${statusLabel[state]} · ${age(run.completedAt ?? run.startedAt ?? run.queuedAt)}` : `Modified ${age(job.updatedAt)}`}</small>
                        </button>
                      </div>
                      <span className="job-type">{meta.label}</span>
                      <span className={`state ${state}`}><i />{statusLabel[state]}</span>
                      <div className="progress-wrap">
                        <span className="progress-track"><i style={{ width: `${state === 'completed' ? 100 : progress}%` }} /></span>
                        <small>{state === 'running' || state === 'queued' ? `${progress}%` : state === 'failed' ? 'Error' : state === 'completed' ? 'Done' : 'Ready'}</small>
                      </div>
                      {run && ['running', 'queued'].includes(run.status)
                        ? <button className="stop-button" onClick={() => cancelRun(run)} aria-label={`Cancel ${job.name}`}>■</button>
                        : run?.outputPath
                          ? <a className="output-button" href={`${RUNNER_URL}/api/runs/${run.id}/output`} title="Download JSON output">↓</a>
                          : <button className="more-button" onClick={() => openEdit(job)} aria-label={`Edit ${job.name}`}>•••</button>}
                    </article>
                  );
                })}
              </div>
            </section>

            <CoverageExplorer />
            <BusinessIntelligence />
            <BenchmarkReview />
          </section>

          <aside className="side-column">
            <section className="panel worker-panel">
              <div className="panel-heading compact"><div><span className="section-kicker">Parallel capacity</span><h2>Worker pool</h2></div><span className="pool-value">{utilization}%</span></div>
              <div className="pool-ring" style={{ '--pool': `${utilization}%` } as CSSProperties}><span>{active}<small>active</small></span></div>
              <div className="worker-stepper"><button onClick={() => setConcurrency(concurrency - 1)} disabled={concurrency <= 1}>−</button><span><strong>{concurrency}</strong> parallel workers</span><button onClick={() => setConcurrency(concurrency + 1)} disabled={concurrency >= 16}>＋</button></div>
              <div className="legend"><span><i className="cyan-dot" />Running {active}</span><span><i />Available {Math.max(0, concurrency - active)}</span></div>
            </section>

            <section id="activity" className="panel activity-panel">
              <div className="panel-heading compact"><div><span className="section-kicker">Streaming</span><h2>Activity</h2></div><button className="text-button" onClick={() => refresh(false)}>Refresh</button></div>
              {!activity.length && <div className="activity-empty">Run a job to see live events.</div>}
              {activity.slice(0, 6).map((event) => (
                <button className="event" key={event.id} onClick={() => setRunDetail(runs.find((run) => run.id === event.runId) ?? null)}>
                  <i className={event.kind === 'failed' ? 'warn' : event.kind === 'completed' ? 'ok' : 'info'}>{event.kind === 'failed' ? '!' : event.kind === 'completed' ? '✓' : event.kind === 'progress' ? '↗' : '•'}</i>
                  <div><strong>{event.message || event.jobName}</strong><small>{event.jobName} · {age(event.at)}</small></div>
                </button>
              ))}
            </section>

            <section className="panel service-panel">
              <div className="panel-heading compact"><div><span className="section-kicker">Data service</span><h2>ZIP place segments</h2></div><span className={`service-status ${health?.services?.googleMaps?.configured ? 'ready' : ''}`}><i />{health?.services?.googleMaps?.configured ? 'Ready' : 'Needs key'}</span></div>
              <div className="service-body">
                <p>Build count and place-ID segments across ZIP lists using the official Google Maps Platform APIs.</p>
                <div><span>Budgeted requests</span><span>Resumable runs</span><span>30-day expiry</span></div>
                <button className="run-button" onClick={() => openNew('places')}>Configure ZIP run</button>
                <small>Google Maps attribution and usage policies apply.</small>
              </div>
            </section>

            <section className="panel service-panel">
              <div className="panel-heading compact"><div><span className="section-kicker">Managed source</span><h2>Pharmacy directory</h2></div><span className={`service-status ${health?.services?.pharmacySource?.cached ? 'ready' : ''}`}><i />{health?.services?.pharmacySource?.cached ? 'Cached' : 'Auto-download'}</span></div>
              <div className="service-body">
                <p>{health?.services?.pharmacySource?.cached ? `${health.services.pharmacySource.releaseId ?? 'CMS NPPES V2'} is validated and ready.` : 'The current CMS NPPES V2 release will be discovered, downloaded, validated, and extracted before the first build.'}</p>
                <div><span>Release discovery</span><span>Integrity checks</span><span>Cache reuse</span></div>
                <button className="run-button" onClick={() => openNew('pharmacy')}>Configure pharmacy build</button>
                <small>{health?.services?.pharmacySource?.cached ? health.services.pharmacySource.mainFile : 'The first run downloads a large CMS archive.'}</small>
              </div>
            </section>

            <section className="quick-types">
              <span className="section-kicker">Quick create</span>
              <div className="type-grid">{(Object.keys(jobMeta) as JobType[]).map((type) => <button key={type} onClick={() => openNew(type)}><i className={jobMeta[type].tone}>{jobMeta[type].short}</i><span>{jobMeta[type].label}</span></button>)}</div>
            </section>
          </aside>
        </div>
      </section>

      {editor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditor(null); }}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <header><div><span className="section-kicker">{editor === 'new' ? 'Create workflow' : 'Edit workflow'}</span><h2 id="editor-title">{editor === 'new' ? 'New job' : editor.name}</h2></div><button className="modal-close" onClick={() => setEditor(null)} aria-label="Close">×</button></header>
            <div className="editor-body">
              <label><span>Job name</span><input value={editorName} onChange={(event) => setEditorName(event.target.value)} placeholder="Descriptive job name" /></label>
              <label><span>Job type</span><select value={editorType} onChange={(event) => changeEditorType(event.target.value as JobType)} disabled={editor !== 'new'}>{(Object.keys(jobMeta) as JobType[]).map((type) => <option value={type} key={type}>{jobMeta[type].label}</option>)}</select></label>
              <div className="config-heading"><div><span>Configuration</span><small>{jobMeta[editorType].hint}</small></div><button onClick={() => setEditorConfig(JSON.stringify(templates?.[editorType] ?? {}, null, 2))}>Reset template</button></div>
              {editorType === 'places' && <div className="service-note"><strong>Official API connector</strong><span>Add <code>GOOGLE_MAPS_API_KEY</code> to <code>datahub/.env</code>. Enable Geocoding API and Places Aggregate API. The key is never stored in this job.</span></div>}
              {editorType === 'pharmacy' && <div className="service-note"><strong>Managed nationwide source</strong><span>Keep <code>nppesFile</code> set to <code>auto</code> to discover, download, validate, extract, and cache the current CMS NPPES V2 release before processing. Add an authorized NCPDP dataQ CSV to populate NCPDP/NABP, drive-through, network, and parent fields.</span></div>}
              <textarea value={editorConfig} onChange={(event) => { setEditorConfig(event.target.value); setEditorError(''); }} spellCheck={false} aria-label="JSON job configuration" />
              <label className="toggle-label"><input type="checkbox" checked={editorEnabled} onChange={(event) => setEditorEnabled(event.target.checked)} /><span>Include this job when “Run all” is used</span></label>
              {editorError && <p className="form-error">{editorError}</p>}
            </div>
            <footer>{editor !== 'new' && <button className="danger-button" onClick={() => deleteJob(editor)} disabled={busy}>Delete</button>}<span className="footer-spacer" /><button className="ghost-button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-button" onClick={saveJob} disabled={busy || !editorName.trim()}>{busy ? 'Saving…' : 'Save job'}</button></footer>
          </section>
        </div>
      )}

      {runDetail && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRunDetail(null); }}>
          <section className="run-modal" role="dialog" aria-modal="true" aria-labelledby="run-title">
            <header><div><span className="section-kicker">Run detail</span><h2 id="run-title">{runDetail.jobName}</h2></div><button className="modal-close" onClick={() => setRunDetail(null)}>×</button></header>
            <div className="run-summary"><span className={`state ${runDetail.status}`}><i />{statusLabel[runDetail.status]}</span><span>{runDetail.type}</span><span>{runDetail.progress}%</span><span>{age(runDetail.completedAt ?? runDetail.startedAt)}</span></div>
            {runDetail.error && <p className="run-error">{runDetail.error}</p>}
            <div className="log-view">{runDetail.logs?.length ? runDetail.logs.map((entry, index) => <p key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString()}</time><span>{entry.message}</span></p>) : <p><span>{runDetail.message || 'No log messages recorded.'}</span></p>}</div>
            <footer>{runDetail.outputPath && <a className="primary-button link-button" href={`${RUNNER_URL}/api/runs/${runDetail.id}/output`}>Download output</a>}<span className="footer-spacer" /><button className="ghost-button" onClick={() => setRunDetail(null)}>Close</button></footer>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
