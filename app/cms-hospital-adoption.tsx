'use client';
import {type Operation} from './data-operation-model';

export default function CmsHospitalAdoption({operations,disabled,onInspect,sourceId='cms-hospital-general-information'}:{operations:Operation[];disabled:boolean;onInspect:()=>void;sourceId?:'cms-hospital-general-information'|'cms-nursing-home-provider-information'}){
  const nursing=sourceId==='cms-nursing-home-provider-information',name=nursing?'nursing-home':'hospital',titleId=nursing?'cms-nursing-retained-title':'cms-retained-title';
  const latest=operations.find(operation=>operation.kind==='source-adoption'&&operation.result?.sourceId===sourceId);
  const summary=latest?.status==='SUCCEEDED'&&latest.result?.receiptIntegrityVerified===true?latest.result.summary:null;
  return <section className="operations-builder" aria-labelledby={titleId}>
    <h3 id={titleId}>Retained CMS {name} directory</h3>
    <p className="operations-note">Inspect the enrolled local {name} {nursing?'recovery':'run'} and record a separate adoption event. This does not download, refresh, normalize or promote data. Original source receipts stay unchanged.</p>
    {nursing&&<p>The original acquisition remains FAILED. This inspection verifies a separately retained recovery; it does not repair or relabel that acquisition.</p>}
    <button className="primary-button" disabled={disabled} onClick={onInspect}>Inspect / adopt retained {nursing?'nursing homes':'hospitals'}</button>
    {!latest&&<p>No managed adoption recorded. Source availability and row counts are not yet verified by this action.</p>}
    {latest&&<p role="status">Latest adoption: {latest.status}. {summary?'Full source replay completed at the time below. Current source bytes have not been replayed by this history read.':'Counts withheld until a successful verified inspection. Preserve failed or interrupted outputs; no automatic retry.'}</p>}
    {summary&&<div>
      <p><strong>{summary.directoryRows.toLocaleString()} dated {name} directory rows</strong> · {summary.statesDcRows.toLocaleString()} rows in states/DC · {summary.territoryRows.toLocaleString()} territory rows · {summary.unknownStateRows.toLocaleString()} other/unresolved rows</p>
      <dl><dt>Publisher released</dt><dd>{summary.sourceDates.released}</dd><dt>Publisher modified</dt><dd>{summary.sourceDates.modified}</dd><dt>Publisher issued</dt><dd>{summary.sourceDates.issued}</dd><dt>Original acquisition {nursing?'(FAILED)':''}</dt><dd>{summary.acquisitionStartedAt} → {nursing?summary.acquisitionFailedAt:summary.acquisitionCompletedAt}</dd>{nursing&&<><dt>Failed acquisition run</dt><dd>{summary.failedSourceRunId}</dd><dt>Recovery created</dt><dd>{summary.recoveryCreatedAt}</dd><dt>Failed receipt SHA-256</dt><dd>{summary.failedSourceReceiptSha256}</dd></>}<dt>Adoption verified</dt><dd>{latest?.result?.adoptedAt}</dd><dt>{nursing?'Retained recovery run':'Original run'}</dt><dd>{summary.sourceRunId}</dd></dl>
      {nursing&&<p>JSON output policy: metadata-only internal receipt. No raw or selected source JSON download is authorized. Row unit: publisher-nursing-home-directory-row. Geographic assignment and current operations remain unverified.</p>}
      <details><summary>Reported-state / territory row counts</summary><div className="table-scroll"><table><thead><tr><th>Reported jurisdiction</th><th>Directory rows</th></tr></thead><tbody>{Object.entries({...summary.states,...summary.territories}).map(([state,count])=><tr key={state}><td>{state}</td><td>{count.toLocaleString()}</td></tr>)}</tbody></table></div></details>
      <p className="operations-note">Selected fields: local review only. Raw evidence: internal. Unique businesses, physical campuses, current operations and nationwide completeness remain unverified. No public redistribution or downloads are authorized here.</p>
    </div>}
  </section>;
}
