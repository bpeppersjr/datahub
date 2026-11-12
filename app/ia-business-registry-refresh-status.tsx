'use client';

import { useState } from 'react';
import { runnerJson } from './runner-client';
import type {Operation} from './data-operation-model';

type CatalogObservation = { metadataUrl: string; modifiedAt: string; reportedRowCount: number | null };
export type IaBusinessRegistryRefreshStatus = {
  sourceId: 'ia-business-registry';
  label: string;
  readinessStatus: 'HOLD'|'AUTHORIZED';
  dispatchAvailable: boolean;
  freshAcquisitionAuthorized: boolean;
  autonomousAcquisitionAuthorized: boolean;
  productionPointerChangeAuthorized: boolean;
  sourceUseNotice?: string|null;
  retainedRelease: { releaseId: string; sourceReleaseId: string; sourceModifiedAt: string; sourceRows: number; activeEntitiesPublished: number };
  observedCatalog: { datasetId: string; accessLevel: 'public'; licenseUrl: string; publisher: CatalogObservation; federalHarvest: CatalogObservation };
  observedAssessment: { assessmentId: string; observedAt: string; decision: string; retainedReleaseId: string; catalogRetainedReleaseMatchesAssessment: boolean; currentRetainedReleaseMatchesAssessment: boolean };
  plan: IaRefreshPlan;
  nextAction: string;
};
type IaRefreshPlan={planId:string;sourceId:'ia-business-registry';mode:string;status:'HOLD'|'AUTHORIZED';allocationCount:0;networkRequestCount:0;operationCreated:false;authorization:null|{authorizationId:string;approvedAt:string;approvedBy:string};steps:string[];unresolvedGates:string[]};

export default function IaBusinessRegistryRefreshStatusCard({status,disabled=false,onOperation}:{status?:IaBusinessRegistryRefreshStatus;disabled?:boolean;onOperation?:(operation:Operation)=>void}){
  const [plan,setPlan]=useState<IaRefreshPlan|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  if(!status)return null;
  const { publisher, federalHarvest, datasetId } = status.observedCatalog;
  const preview=async()=>{setBusy(true);setError('');try{setPlan(await runnerJson<IaRefreshPlan>('/api/data-operations/source-refresh-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'Iowa refresh plan is unavailable.');}finally{setBusy(false);}};
  const start=async()=>{setBusy(true);setError('');try{onOperation?.(await runnerJson<Operation>('/api/data-operations/source-refreshes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:status.sourceId})}));}catch(reason){setError(reason instanceof Error?reason.message:'Iowa refresh could not start.');}finally{setBusy(false);}};
  const authorized=status.dispatchAvailable&&status.readinessStatus==='AUTHORIZED';
  return <section className="operations-builder" aria-labelledby="ia-business-refresh-title">
    <h3 id="ia-business-refresh-title">{status.label}</h3>
    <p role="status"><strong>Refresh {status.readinessStatus}</strong></p>
    <dl>
      <dt>Retained snapshot</dt><dd><time dateTime={status.retainedRelease.sourceModifiedAt}>{status.retainedRelease.sourceModifiedAt.slice(0, 10)}</time> · {status.retainedRelease.activeEntitiesPublished.toLocaleString()} retained active-entity rows</dd>
      <dt>Publisher catalog</dt><dd>Dataset {datasetId} · public · CC BY 4.0 · <time dateTime={publisher.modifiedAt}>{publisher.modifiedAt.slice(0, 10)}</time> · {publisher.reportedRowCount === null ? 'row count unavailable' : `${publisher.reportedRowCount.toLocaleString()} publisher-reported rows`}</dd>
      <dt>Data.gov harvest</dt><dd><time dateTime={federalHarvest.modifiedAt}>{federalHarvest.modifiedAt.slice(0, 10)}</time> · {federalHarvest.reportedRowCount === null ? 'row count unavailable' : `${federalHarvest.reportedRowCount.toLocaleString()} catalog-reported rows`}</dd>
    </dl>
    <dl><dt>Fresh acquisition</dt><dd>{status.freshAcquisitionAuthorized?'Authorized':'Not authorized'}</dd><dt>Autonomous acquisition</dt><dd>{status.autonomousAcquisitionAuthorized?'Authorized':'Not authorized'}</dd><dt>Production pointer change</dt><dd>{status.productionPointerChangeAuthorized?'Authorized after verification':'Not authorized'}</dd><dt>Assessment</dt><dd>{status.observedAssessment.assessmentId}</dd></dl>
    {status.sourceUseNotice&&<p className="operations-note"><strong>Publisher notice:</strong> {status.sourceUseNotice}</p>}
    <div className="operations-actions"><button className="ghost-button" disabled={busy} onClick={()=>void preview()}>Preview refresh plan</button><button className="primary-button" disabled={!authorized||disabled||busy} aria-disabled={!authorized||disabled||busy} title={authorized?'Start the authorization-bound app operation':'ACQUISITION_NOT_AUTHORIZED'} onClick={()=>void start()}>Start Iowa refresh</button></div>
    {error&&<p role="alert" className="operations-error">{error}</p>}
    {plan&&<div className="operations-plan" aria-live="polite"><strong>{plan.status} · no operation created</strong><p className="operations-note">{plan.networkRequestCount} requests issued in preview · {plan.allocationCount} allocations</p><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><p className="operations-note">{plan.unresolvedGates.length?`Open gates: ${plan.unresolvedGates.join(', ')}`:`Authorization ${plan.authorization?.authorizationId} is bound to the exact governed source evidence.`}</p></div>}
    <p className="operations-note">{status.nextAction}</p>
  </section>;
}
