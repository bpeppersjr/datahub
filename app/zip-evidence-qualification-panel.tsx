'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type Row={source_key:string;source_release_id:string;source_kind:string;evidence_type:string;qualification:string;temporal_status:{status:string;source_reference_field:string|null;source_reference_date:string|null;review_due_date:string|null};evidence_counts_by_unit:Record<string,number>;eligible_evidence_counts_by_unit:Record<string,number|null>};
export type QualificationView={schema_version:string;available:boolean;status:string;zip5:string;category_id:string;selection_status:string;export_policy:string|null;release:null|{id:string;manifest_sha256:string;as_of:string;created_at:string;temporal_policy_version:string};bindings:null|{coverage_release_id:string;coverage_manifest_sha256:string;registry_release_id:string;registry_manifest_sha256:string;mapping_version:string;mapping_sha256:string;taxonomy_version:string};rows:Row[]};
type Request=(path:string,options:{signal:AbortSignal})=>Promise<QualificationView>;
const qualificationLabel=(value:string)=>value==='measured-within-review-window'?'Within internal review window':value==='measured-stale-review-due'?'Review overdue — does not mean closed':'Unmeasured — reference does not support qualification';

/** Qualification owns its requests; ordinary ZIP evidence remains in the workspace. */
export default function ZipEvidenceQualificationPanel({zip,categoryId,coverageReleaseId,registryReleaseId,navigationState='',request=runnerJson}:{zip:string;categoryId:string;coverageReleaseId:string;registryReleaseId:string;navigationState?:string;request?:Request}){
 const [attempt,setAttempt]=useState(0),[result,setResult]=useState<{scope:string;view:QualificationView|null;error:boolean}|null>(null);
 const scope=JSON.stringify([zip,categoryId,coverageReleaseId,registryReleaseId,navigationState,attempt]);
 const current=result?.scope===scope?result:null;
 useEffect(()=>{
  if(!/^\d{5}$/.test(zip)||!coverageReleaseId||!registryReleaseId)return;
  const controller=new AbortController(),query=new URLSearchParams({zip,category:categoryId});
  void request(`/api/business-map/zip-evidence-qualification?${query}`,{signal:controller.signal}).then(view=>{
   if(controller.signal.aborted)return;
   const mismatch=view.schema_version!=='zip-evidence-qualification-view@1.0.0'||view.zip5!==zip||view.category_id!==categoryId||view.available&&(!coverageReleaseId||!registryReleaseId||view.bindings?.coverage_release_id!==coverageReleaseId||view.bindings?.registry_release_id!==registryReleaseId);
   setResult({scope,view:mismatch?null:view,error:!!mismatch});
  }).catch(()=>{if(!controller.signal.aborted)setResult({scope,view:null,error:true});});
  return()=>controller.abort();
 },[zip,categoryId,coverageReleaseId,registryReleaseId,navigationState,attempt,scope,request]);
 const view=current?.view;
 return <section aria-label="Source evidence review qualification" style={{fontSize:'1rem',lineHeight:1.5,minWidth:0,overflowWrap:'anywhere'}}>
  <h3>Source evidence review qualification</h3>
  <p>Internal temporal review only. Current operations are not verified; active-business counts and all-business completeness remain unknown. Source units overlap and must not be added.</p>
  {!/^\d{5}$/.test(zip)?<p>Enter an exact ZIP5 to inspect qualification.</p>:!coverageReleaseId||!registryReleaseId?<p role="status">Qualification waits for compatible ordinary ZIP evidence release identities. No assessment is inferred.</p>:<>
   <p>ZIP {zip} · {categoryId.replaceAll('-',' ')}</p>
   {!current&&<p role="status">Loading qualification evidence…</p>}
   {current?.error&&<p role="alert">Qualification evidence is unavailable or does not match the selected ZIP, category or evidence releases. Ordinary ZIP evidence is unchanged.</p>}
   {view&&!view.available&&<p role="status">Qualification release unavailable: {view.status.replaceAll('-',' ')}. No assessment was rebuilt; this is not zero evidence.</p>}
   {(current?.error||view&&!view.available)&&<button onClick={()=>setAttempt(attempt+1)}>Retry qualification</button>}
   {view?.available&&<>
    <p>Use restriction: <strong>{view.export_policy}</strong>. No public export is offered.</p>
    <p>Assessment as of {view.release?.as_of}. Built {view.release?.created_at}; build time does not refresh source reference dates. Review policy {view.release?.temporal_policy_version}.</p>
    {view.selection_status==='absent'&&<p>No retained matching ZIP/source pair. Absence is not measured zero or a finding of no businesses.</p>}
    {view.selection_status==='unsupported'&&<p>This category has no supported mapping in this release. Qualification is unavailable, not zero.</p>}
    {view.selection_status==='matched'&&<div role="region" aria-label="Source qualification rows" tabIndex={0} style={{overflowX:'auto',maxWidth:'100%'}}><table style={{fontSize:'inherit'}}><caption>ZIP {zip}: source-defined counts and review qualification</caption><thead><tr>{['Source / release','Review status / reference','Source unit','Observed count','Eligible under review rule'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{view.rows.flatMap(row=>Object.entries(row.evidence_counts_by_unit).map(([unit,value])=><tr key={`${row.source_key}:${unit}`}><th scope="row">{row.source_key}<br/>{row.source_release_id}<br/>{row.source_kind} · {row.evidence_type}</th><td>{qualificationLabel(row.qualification)}<br/>{row.temporal_status.status.replaceAll('-',' ')}<br/>Source reference: {row.temporal_status.source_reference_date??'Unknown'} ({row.temporal_status.source_reference_field??'Unavailable'})<br/>Review due: {row.temporal_status.review_due_date??'Unknown'}</td><td>{unit.replaceAll('_',' ')}</td><td>{value.toLocaleString()}</td><td>{row.eligible_evidence_counts_by_unit[unit]===null?'Unknown':row.eligible_evidence_counts_by_unit[unit]?.toLocaleString()}</td></tr>))}</tbody></table></div>}
    <details><summary>Qualification release and bindings</summary><p>Release {view.release?.id} · manifest {view.release?.manifest_sha256}</p>{Object.entries(view.bindings??{}).map(([key,value])=><p key={key}>{key.replaceAll('_',' ')}: {value}</p>)}</details>
   </>}
  </>}
 </section>;
}
