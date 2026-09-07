'use client';

import { useEffect, useRef, useState } from 'react';
import { runnerJson } from './runner-client';

type Catalog = { industries: Array<{ id: string; label?: string }>; states: string[] };
type Schedule = {
  id: string; industries: string[]; states: string[]; intervalHours: number;
  enabled: boolean; status: string; nextDueAt: string | null; reason: string | null;
  lastOccurrence: { operationId: string; status: string; dueAt: string } | null;
};
const endpoint = '/api/data-operations/schedules';
const readable = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ');
const selected = (element: HTMLSelectElement) => Array.from(element.selectedOptions, (option) => option.value);

export default function RefreshSchedules({ catalog }: { catalog: Catalog | null }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [interval, setIntervalHours] = useState('168');
  const [loaded, setLoaded] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const mutating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || mutating.current) return;
      pending = true;
      const started = revision.current;
      try {
        const records = await runnerJson<Schedule[]>(endpoint, { signal: controller.signal });
        if (!controller.signal.aborted && started === revision.current) {
          setSchedules(records); setLoaded(true); setConnectionError('');
        }
      } catch (reason) {
        if (!controller.signal.aborted && started === revision.current) setConnectionError(reason instanceof Error ? reason.message : 'Unable to load refresh schedules.');
      } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const save = async (url: string, body: unknown, message: string) => {
    if (mutating.current) return;
    mutating.current = true; revision.current += 1;
    setBusy(true); setError(''); setNotice('');
    try {
      const record = await runnerJson<Schedule>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setSchedules((items) => [record, ...items.filter((item) => item.id !== record.id)]);
      setNotice(message);
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Schedule update failed.'} Check the refreshed list before retrying; an interrupted response does not prove the change failed.`);
    } finally { mutating.current = false; setBusy(false); }
  };
  const hours = Number(interval);
  const unavailable = busy || !loaded || !!connectionError;
  const valid = industries.length > 0 && states.length > 0 && Number.isInteger(hours) && hours >= 24 && hours <= 8760;

  return <section className="operations-history refresh-schedules" aria-labelledby="refresh-title">
    <h3 id="refresh-title">Automatic industry refreshes</h3>
    <p className="operations-note">Co*Tive must stay running; Codex is not required. Create a disabled schedule, review its scope, then enable it. Enabling makes it due immediately. National sources download once in full, regardless of selected states.</p>
    {(connectionError || error) && <p className="operations-error" role="alert">{connectionError || error}</p>}
    {connectionError && <p className="operations-note">Previously loaded schedules may be out of date. Manual collection and export controls remain separate.</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      if (valid && !unavailable && catalog) void save(endpoint, { industries, states, intervalHours: hours, enabled: false }, 'Schedule saved disabled. Review the scope below before enabling.');
    }}>
      <fieldset disabled={unavailable || !catalog} className="schedule-selection">
        <legend>New refresh schedule</legend>
        <label>Industries<select multiple size={5} required value={industries} onChange={(event) => setIndustries(selected(event.currentTarget))}>{catalog?.industries.map((item) => <option key={item.id} value={item.id}>{item.label ?? readable(item.id)}</option>)}</select></label>
        <label>Publisher states<select multiple size={5} required value={states} onChange={(event) => setStates(selected(event.currentTarget))}>{catalog?.states.map((state) => <option key={state}>{state}</option>)}</select></label>
        <label>Refresh interval (hours)<input type="number" min={24} max={8760} step={1} required value={interval} onChange={(event) => setIntervalHours(event.target.value)} /></label>
      </fieldset>
      <p className="operations-note">Choose at least one industry and state. Hold Ctrl or Command to select several. The interval is measured from a successful refresh; missed intervals do not create a backlog. Source policies and request limits still apply.</p>
      <button type="submit" className="primary-button" disabled={!catalog || unavailable || !valid}>Create disabled schedule</button>
    </form>
    {!loaded && !connectionError && <p className="operations-note">Loading refresh schedules…</p>}
    {loaded && !schedules.length && <p className="operations-note">No refresh schedules configured.</p>}
    {schedules.map((schedule) => <article className="operation-record" key={schedule.id}>
      <div><strong>{schedule.industries.map((id) => catalog?.industries.find((item) => item.id === id)?.label ?? readable(id)).join(', ')}</strong><span className="operation-status">{schedule.enabled ? 'Enabled' : 'Disabled'} · {readable(schedule.status)}</span></div>
      <p>Publisher states: {schedule.states.join(', ')} · Every {schedule.intervalHours} hours</p>
      <p>Next due: {schedule.nextDueAt ? <time dateTime={schedule.nextDueAt}>{new Date(schedule.nextDueAt).toLocaleString()}</time> : 'Not scheduled'}</p>
      {schedule.reason && <p role="status">Needs attention: {readable(schedule.reason)}. Inspect the operation and source prerequisites before re-enabling. A changed source plan requires a newly reviewed schedule.</p>}
      {schedule.lastOccurrence && <p>Latest occurrence: {readable(schedule.lastOccurrence.status)} · <a href="#operations-history-title">View operation history</a><br /><small>{schedule.lastOccurrence.operationId}</small></p>}
      <small>Schedule {schedule.id}</small>
      <button className="ghost-button" disabled={unavailable} aria-label={`${schedule.enabled ? 'Pause' : 'Enable'} schedule ${schedule.id}`} onClick={() => void save(`${endpoint}/${encodeURIComponent(schedule.id)}/enabled`, { enabled: !schedule.enabled }, schedule.enabled ? 'Schedule paused. Any active collection continues until cancelled in operation history.' : 'Schedule enabled and due now. Co*Tive will dispatch it when the runner is available.')}>{schedule.enabled ? 'Pause schedule' : 'Enable — due now'}</button>
    </article>)}
    <p className="operations-note">Pausing stops future dispatches, not an active download. Cancel an active collection in operation history. Overlapping enabled sources are rejected; failed or uncertain runs pause for inspection. Refreshed releases need reconciliation before appearing in national comparisons.</p>
  </section>;
}
