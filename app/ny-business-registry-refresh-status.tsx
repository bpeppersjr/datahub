'use client';

import { useState } from 'react';
import { runnerJson } from './runner-client';
import type {Operation} from './data-operation-model';

export type NyBusinessRegistryRefreshStatus={sourceId:'ny-business-registry';label:string;readinessStatus:'HOLD'|'AUTHORIZED';dispatchAvailable:boolean;freshAcquisitionAuthorized:boolean;autonomousAcquisitionAuthorized:boolean;productionPointerChangeAuthorized:boolean;sourceUseNotice?:string|null;retainedRelease:{releaseId:string;sourceReleaseId:string;sourceRowsUpdatedAt:string;sourceActiveExtractRecords:number;organizationsPublished:number;quarantinedSourceRecords:number;artifactCount:number};observedAssessment:{assessmentId:string;observedAt:string;decision:string;retainedReleaseId:string;catalogRetainedReleaseMatchesAssessment:boolean;currentRetainedReleaseMatchesAssessment:boolean};plan:NyRefreshPlan;nextAction:string};
type NyRefreshPlan={planId:string;sourceId:'ny-business-registry';mode:string;status:'HOLD'|'AUTHORIZED';allocationCount:0;networkRequestCount:0;operationCreated:false;authorization:null|{authorizationId:string;approvedAt:string;approvedBy:string};steps:string[];unresolvedGates:string[]};

export default function NyBusinessRegistryRefreshStatusCard({status,disabled=false,onOperation}:{status?:NyBusinessRegistryRefreshStatus;disabled?:boolean;onOperation?:(operation:Operation)=>void}){
  const [plan,setPlan]=useState<NyRefreshPlan|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!status)return null;
  const preview=async()=>{setBusy(true);setError('');try{setPlan(await runnerJson<NyRefreshPlan>('/api/data-operations/source-refresh-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'New York refresh plan is unavailable.');}finally{setBusy(false);}};
  const start=async()=>{setBusy(true);setError('');try{onOperation?.(await runnerJson<Operation>('/api/data-operations/source-refreshes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'New York refresh could not start.');}finally{setBusy(false);}};
  const authorized=status.dispatchAvailable&&status.readinessStatus==='AUTHORIZED';
  return <section className="operations-builder" aria-labelledby="ny-business-refresh-title">
    <h3 id="ny-business-refresh-title">{status.label}</h3>
    <p className="operations-note">Governed monthly active-corporations extract. Reported locations remain organization evidence, not verified operating sites.</p>
    <p role="status"><strong>Refresh {status.readinessStatus}</strong> · retained source updated {status.retainedRelease.sourceRowsUpdatedAt.slice(0,10)} · {status.retainedRelease.organizationsPublished.toLocaleString()} retained organization rows</p>
    <dl><dt>Fresh acquisition</dt><dd>{status.freshAcquisitionAuthorized?'Authorized':'Not authorized'}</dd><dt>Autonomous acquisition</dt><dd>{status.autonomousAcquisitionAuthorized?'Authorized':'Not authorized'}</dd><dt>Production pointer change</dt><dd>{status.productionPointerChangeAuthorized?'Authorized after verification':'Not authorized'}</dd><dt>Assessment</dt><dd>{status.observedAssessment.assessmentId}</dd></dl>
    {status.sourceUseNotice&&<p className="operations-note"><strong>Publisher notice:</strong> {status.sourceUseNotice}</p>}
    <div className="operations-actions"><button className="ghost-button" disabled={busy} onClick={()=>void preview()}>Preview refresh plan</button><button className="primary-button" disabled={!authorized||disabled||busy} aria-disabled={!authorized||disabled||busy} title={authorized?'Start the authorization-bound app operation':'ACQUISITION_NOT_AUTHORIZED'} onClick={()=>void start()}>Start New York refresh</button></div>
    {error&&<p role="alert" className="operations-error">{error}</p>}
    {plan&&<div className="operations-plan" aria-live="polite"><strong>{plan.status} · no operation created</strong><p className="operations-note">{plan.networkRequestCount} requests issued in preview · {plan.allocationCount} allocations</p><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="operations-note">{plan.unresolvedGates.length?`Open gates: ${plan.unresolvedGates.join(', ')}`:`Authorization ${plan.authorization?.authorizationId} is bound to the exact governed source evidence.`}</p></div>}
    <p className="operations-note">{status.nextAction}</p>
  </section>;
}
