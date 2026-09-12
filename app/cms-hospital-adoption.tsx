'use client';
import {type Operation} from './data-operation-model';

export default function CmsHospitalAdoption({operations,disabled,onInspect}:{operations:Operation[];disabled:boolean;onInspect:()=>void}){
  const latest=operations.find(operation=>operation.kind==='source-adoption'&&operation.result?.sourceId==='cms-hospital-general-information');
  const summary=latest?.status==='SUCCEEDED'&&latest.result?.receiptIntegrityVerified===true?latest.result.summary:null;
  return <section className="operations-builder" aria-labelledby="cms-retained-title">
    <h3 id="cms-retained-title">Retained CMS hospital directory</h3>
    <p className="operations-note">Inspect the enrolled local hospital run and record a separate adoption event. This does not download, refresh, normalize or promote data. Original source receipts stay unchanged.</p>
    <button className="primary-button" disabled={disabled} onClick={onInspect}>Inspect / adopt retained hospitals</button>
    {!latest&&<p>No managed adoption recorded. Source availability and row counts are not yet verified by this action.</p>}
    {latest&&<p role="status">Latest adoption: {latest.status}. {summary?'Full source replay completed at the time below. Current source bytes have not been replayed by this history read.':'Counts withheld until a successful verified inspection. Preserve failed or interrupted outputs; no automatic retry.'}</p>}
    {summary&&<div>
      <p><strong>{summary.directoryRows.toLocaleString()} dated hospital directory rows</strong> · {summary.statesDcRows.toLocaleString()} reporting states/DC · {summary.territoryRows.toLocaleString()} territories · {summary.unknownStateRows.toLocaleString()} other/unresolved</p>
      <dl><dt>Publisher released</dt><dd>{summary.sourceDates.released}</dd><dt>Publisher modified</dt><dd>{summary.sourceDates.modified}</dd><dt>Publisher issued</dt><dd>{summary.sourceDates.issued}</dd><dt>Original acquisition</dt><dd>{summary.acquisitionStartedAt} → {summary.acquisitionCompletedAt}</dd><dt>Adoption verified</dt><dd>{latest?.result?.adoptedAt}</dd><dt>Original run</dt><dd>{summary.sourceRunId}</dd></dl>
      <details><summary>Reported-state / territory row counts</summary><div className="table-scroll"><table><thead><tr><th>Reported jurisdiction</th><th>Directory rows</th></tr></thead><tbody>{Object.entries({...summary.states,...summary.territories}).map(([state,count])=><tr key={state}><td>{state}</td><td>{count.toLocaleString()}</td></tr>)}</tbody></table></div></details>
      <p className="operations-note">Selected fields: local review only. Raw evidence: internal. Unique businesses, physical campuses, current operations and nationwide completeness remain unverified. No public redistribution or downloads are authorized here.</p>
    </div>}
  </section>;
}
