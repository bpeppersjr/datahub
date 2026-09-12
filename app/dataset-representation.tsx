'use client';

import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';

type Summary = { represented: number; expected: number; percent: number | null; unmeasured: number };
type Dataset = { id: string; label: string; stateRecordCount: number | null; nationalReleasePresent: boolean; status: string; rowUnit?: string; addressBasis?:string; sourcePostingDate?:string|null; observedAt?:string|null };
type State = Summary & { code: string; fips: string | null; name: string; datasets: Dataset[]; industries: (Summary & { id: string })[] };
type Representation = { available: boolean; releaseId: string; states: State[] };
const percentage = (value: number | null) => value === null ? 'Unmeasured' : `${value.toFixed(1)}%`;
const label = (value: string) => value.replaceAll('-', ' ');

export default function DatasetRepresentation({ stateFips = '' }: { stateFips?: string }) {
  const [data, setData] = useState<Representation | null>(null);
  const [selection, setSelection] = useState<{ context: string; code: string | null }>({ context: stateFips, code: null });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    runnerJson<Representation>('/api/dataset-representation').then(result => { if (active) setData(result); }).catch(() => { if (active) setError('Published dataset representation is unavailable.'); });
    return () => { active = false; };
  }, []);
  const code = selection.context === stateFips && selection.code !== null ? selection.code : data?.states?.find(row => row.fips === stateFips)?.code ?? '';
  const setCode = (value: string) => setSelection({ context: stateFips, code: value });
  const state = data?.states?.find(row => row.code === code);
  const industries = (state ?? data?.states?.[0])?.industries ?? [];
  const unconfiguredIndustries = industries.filter(row => row.expected === 0);
  return <section className="dataset-representation" aria-labelledby="dataset-representation-title">
    <h3 id="dataset-representation-title">State dataset coverage</h3>
    <p>Share of the configured nationwide collection plan with published records for each reported address state. This measures dataset presence, not the percentage of businesses collected or verified completeness.</p>
    <p className="representation-completeness"><strong>All-business completeness: Unknown</strong><br />Even 100% dataset coverage only means every configured dataset has state records. The plan does not include every dataset available nationwide.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading published state evidence…</p>}
    {data?.available === false && <p>No published coverage release is available.</p>}
    {data?.available && <>
      <p><strong>{industries.length - unconfiguredIndustries.length} of {industries.length} configured industry groups have nationwide datasets.</strong> {unconfiguredIndustries.length > 0 && <>Not configured: {unconfiguredIndustries.map(row => label(row.id)).join(', ')}.</>}</p>
      <label htmlFor="representation-state">State or district</label>{' '}
      <select id="representation-state" value={code} onChange={event => setCode(event.target.value)}><option value="">All states and D.C.</option>{data.states.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</select>
      <p>Follows the selected map state. Choose another state here to inspect its dataset evidence.</p>
      {state && <>
        <p className="representation-result"><strong>{percentage(state.percent)}</strong> dataset coverage for {state.name} · {state.represented}/{state.expected} configured nationwide datasets represented · {state.unmeasured} unmeasured</p>
        <ul>{state.datasets.map(row => <li key={row.id}><strong>{row.label}:</strong> {row.stateRecordCount === null ? (row.nationalReleasePresent ? 'National release present; state evidence unavailable' : 'State evidence unavailable; national release not evidenced here') : `${row.stateRecordCount.toLocaleString()} ${row.rowUnit??'published state records'}`}
          {row.addressBasis&&<span> — {row.addressBasis}.</span>}{row.sourcePostingDate&&<span> Source posting: {row.sourcePostingDate}; observed: {row.observedAt??'Unknown'}.</span>}</li>)}</ul>
        <p>Industry shares group configured datasets by their scope. Record counts above are source-wide state counts, not industry-filtered business counts.</p>
        <div className="representation-table"><table><caption>Industry dataset coverage for {state.code}</caption><thead><tr><th scope="col">Industry</th><th scope="col">Represented / configured</th><th scope="col">Dataset share</th><th scope="col">Unmeasured</th></tr></thead><tbody>{state.industries.map(row => <tr key={row.id}><th scope="row">{label(row.id)}</th><td>{row.expected ? `${row.represented}/${row.expected}` : 'No nationwide dataset configured'}</td><td>{row.expected ? percentage(row.percent) : 'Not configured'}</td><td>{row.expected ? row.unmeasured : 'Not configured'}</td></tr>)}</tbody></table></div>
      </>}
      <details open={!state}><summary>All 50 states and D.C. — dataset shares</summary><div className="representation-table"><table><caption>Published state representation against the fixed configured nationwide plan</caption><thead><tr><th>State</th><th>Represented / expected</th><th>Share</th><th>Unmeasured datasets</th></tr></thead><tbody>{data.states.map(row => <tr key={row.code}><th><button className="text-button" onClick={() => setCode(row.code)}>{row.code} · {row.name}</button></th><td>{row.represented}/{row.expected}</td><td>{percentage(row.percent)}</td><td>{row.datasets.filter(dataset => dataset.stateRecordCount === null).map(dataset => dataset.label).join(', ') || 'None'}</td></tr>)}</tbody></table></div></details>
      <p className="representation-release">Published release: {data.releaseId}. Unmeasured datasets remain in the denominator; all-business completeness is unknown. State-only and local datasets are outside this nationwide measure. Reviewed source readiness is a separate assessment.</p>
    </>}
  </section>;
}
