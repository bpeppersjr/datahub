'use client';

export type CmsSnfPecosStatus={sourceId:string;label:string;profile:string;sourcePeriod:string;nativeExecutionAuthorized:false;approvedDownloadBudgetBytes:0;dispatchAvailable:false;prerequisitesReady:boolean;policyMatches:boolean;retainedDocuments:Array<{kind:string;ready:boolean}>;acquisitionReceiptReady:false;acquisitionReceiptStatus:string;nextAction:string};

export default function CmsSnfPecosStatusCard({status}:{status?:CmsSnfPecosStatus}){
  if(!status)return null;
  const ready=status.retainedDocuments.filter(document=>document.ready).length;
  return <section className="operations-builder" aria-labelledby="cms-snf-pecos-title">
    <h3 id="cms-snf-pecos-title">{status.label}</h3>
    <p className="operations-note">Standalone acquisition service visibility. This panel cannot start or download PECOS data.</p>
    <p role="status"><strong>{status.dispatchAvailable?'Dispatch available':'Production hold'}</strong> · native execution authorized: {String(status.nativeExecutionAuthorized)} · approved download budget: {status.approvedDownloadBudgetBytes.toLocaleString()} bytes</p>
    <dl><dt>Fixed source period</dt><dd>{status.sourcePeriod}</dd><dt>Policy</dt><dd>{status.policyMatches?'Exact compiled policy verified':'Policy unavailable or changed'}</dd><dt>Retained document prerequisites</dt><dd>{ready} of {status.retainedDocuments.length} verified</dd><dt>Acquisition receipt</dt><dd>{status.acquisitionReceiptReady?'Verified':'Not created; native execution is held'}</dd></dl>
    <button className="primary-button" disabled>Start PECOS acquisition</button>
    <p className="operations-note">{status.nextAction}</p>
  </section>;
}
