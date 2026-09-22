'use client';

import { useState } from 'react';
import { runnerJson } from './runner-client';

export type NyBusinessRegistryRefreshStatus={sourceId:'ny-business-registry';label:string;readinessStatus:'HOLD';dispatchAvailable:false;freshAcquisitionAuthorized:false;autonomousAcquisitionAuthorized:false;productionPointerChangeAuthorized:false;retainedRelease:{releaseId:string;sourceReleaseId:string;sourceRowsUpdatedAt:string;sourceActiveExtractRecords:number;organizationsPublished:number;quarantinedSourceRecords:number;artifactCount:number};observedAssessment:{assessmentId:string;observedAt:string;decision:string;retainedReleaseId:string;catalogRetainedReleaseMatchesAssessment:boolean;currentRetainedReleaseMatchesAssessment:boolean};plan:NyRefreshPlan;nextAction:string};
type NyRefreshPlan={planId:string;sourceId:'ny-business-registry';mode:string;status:'HOLD';allocationCount:0;networkRequestCount:0;operationCreated:false;steps:string[];unresolvedGates:string[]};

export default function NyBusinessRegistryRefreshStatusCard({status}:{status?:NyBusinessRegistryRefreshStatus}){
  const [plan,setPlan]=useState<NyRefreshPlan|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!status)return null;
  const preview=async()=>{setBusy(true);setError('');try{setPlan(await runnerJson<NyRefreshPlan>('/api/data-operations/source-refresh-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'New York refresh plan is unavailable.');}finally{setBusy(false);}};
  return <section className="operations-builder" aria-labelledby="ny-business-refresh-title">
    <h3 id="ny-business-refresh-title">{status.label}</h3>
    <p className="operations-note">Read-only readiness for the governed monthly active-corporations extract. Reported locations remain organization evidence, not verified operating sites.</p>
    <p role="status"><strong>Refresh {status.readinessStatus}</strong> · retained source updated {status.retainedRelease.sourceRowsUpdatedAt.slice(0,10)} · {status.retainedRelease.organizationsPublished.toLocaleString()} retained organization rows</p>
    <dl><dt>Fresh acquisition</dt><dd>Not authorized</dd><dt>Autonomous acquisition</dt><dd>Not authorized</dd><dt>Production pointer change</dt><dd>Not authorized</dd><dt>Assessment</dt><dd>{status.observedAssessment.assessmentId}</dd></dl>
    <div className="operations-actions"><button className="ghost-button" disabled={busy} onClick={()=>void preview()}>Preview refresh plan</button><button className="primary-button" disabled aria-disabled="true" title="ACQUISITION_NOT_AUTHORIZED">Start New York refresh</button></div>
    {error&&<p role="alert" className="operations-error">{error}</p>}
    {plan&&<div className="operations-plan" aria-live="polite"><strong>{plan.status} · no operation created</strong><p className="operations-note">{plan.networkRequestCount} network requests · {plan.allocationCount} allocations</p><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="operations-note">Open gates: {plan.unresolvedGates.join(', ')}</p></div>}
    <p className="operations-note">{status.nextAction}</p>
  </section>;
}
