'use client';

import { useState } from 'react';
import { runnerJson } from './runner-client';

export type OrBusinessRegistryRefreshStatus={sourceId:'or-business-registry';label:string;readinessStatus:'HOLD';dispatchAvailable:false;freshAcquisitionAuthorized:false;autonomousAcquisitionAuthorized:false;productionPointerChangeAuthorized:false;retainedRelease:{releaseId:string;sourceReleaseId:string;sourceRowsUpdatedAt:string;sourcePrincipalPlaceRows:number;activeRegistrationsPublished:number;legalEntityRegistrations:number;assumedBusinessNameRegistrations:number};observedAssessment:{assessmentId:string;observedAt:string;decision:string;retainedReleaseId:string;catalogRetainedReleaseMatchesAssessment:boolean;currentRetainedReleaseMatchesAssessment:boolean};plan:OrRefreshPlan;nextAction:string};
type OrRefreshPlan={planId:string;sourceId:'or-business-registry';mode:string;status:'HOLD';allocationCount:0;networkRequestCount:0;operationCreated:false;steps:string[];unresolvedGates:string[]};

export default function OrBusinessRegistryRefreshStatusCard({status}:{status?:OrBusinessRegistryRefreshStatus}){
  const [plan,setPlan]=useState<OrRefreshPlan|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!status)return null;
  const preview=async()=>{setBusy(true);setError('');try{setPlan(await runnerJson<OrRefreshPlan>('/api/data-operations/source-refresh-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'Oregon refresh plan is unavailable.');}finally{setBusy(false);}};
  return <section className="operations-builder" aria-labelledby="or-business-refresh-title">
    <h3 id="or-business-refresh-title">{status.label}</h3>
    <p className="operations-note">Read-only readiness for the governed full-snapshot source. Assumed business names remain brands, not legal organizations.</p>
    <p role="status"><strong>Refresh {status.readinessStatus}</strong> · retained source updated {status.retainedRelease.sourceRowsUpdatedAt.slice(0,10)} · {status.retainedRelease.activeRegistrationsPublished.toLocaleString()} retained active-registration rows</p>
    <dl><dt>Fresh acquisition</dt><dd>Not authorized</dd><dt>Autonomous acquisition</dt><dd>Not authorized</dd><dt>Production pointer change</dt><dd>Not authorized</dd><dt>Assessment</dt><dd>{status.observedAssessment.assessmentId}</dd></dl>
    <div className="operations-actions"><button className="ghost-button" disabled={busy} onClick={()=>void preview()}>Preview refresh plan</button><button className="primary-button" disabled aria-disabled="true" title="ACQUISITION_NOT_AUTHORIZED">Start Oregon refresh</button></div>
    {error&&<p role="alert" className="operations-error">{error}</p>}
    {plan&&<div className="operations-plan" aria-live="polite"><strong>{plan.status} · no operation created</strong><p className="operations-note">{plan.networkRequestCount} network requests · {plan.allocationCount} allocations</p><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="operations-note">Open gates: {plan.unresolvedGates.join(', ')}</p></div>}
    <p className="operations-note">{status.nextAction}</p>
  </section>;
}
