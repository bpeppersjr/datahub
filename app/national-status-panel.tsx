"use client";
import { useEffect, useState } from 'react';
import { runnerJson } from './runner-client';
import { validNationalStatus } from './national-status-validation.mjs';

type Temporal={source_key:string|null;source_release_id:string|null;source_reference_at:string|null;review_due_at:string|null;review_qualification:string;semantic_class:string;source_status_term:string|null};
type Metric={industry:string;mapped_dimensions:number;measured_zip_dimension_cells:number;zip_dimension_cell_denominator:number;exact_zip_measurement_reach_percent:number|null};
type Dimension={id:string;evidence_status?:string;temporal_qualification:Temporal|null};
type Industry={id:string;dimension_evidence_availability_percent:number|null;dimensions_with_retained_evidence:number;mapped_dimensions:number;measured_zip_dimension_cells:number;zip_dimension_cell_denominator:number;exact_zip_measurement_reach_percent:number|null;dimensions:Dimension[]};
type View={kind:string;zip5_cohort_rows:number;source_dimensions:number;matrix_evidence_cells:number;state_industry_rows:number;temporal_assessment:{assessment_as_of:string;dimension_counts:Record<string,number>};gaps:Record<string,number>;geography_scope_counts:Record<string,number>;industry_evidence_metrics:Metric[];territories:{code:string;zip5_rows:number}[];industries:Industry[];zip5:string;zip4:null;found:boolean;cohort_classification:string;zcta_geoid:string|null;geography_scope:string;dimensions:Dimension[];provenance:{release_id:string;manifest_sha256:string;created_at:string}};
const n=(v:number)=>v.toLocaleString('en-US');
const label=(v:string)=>v.replaceAll('-',' ').replaceAll('_',' ');
const reach=(v:number|null)=>v===null?'Unmeasured':`${v.toFixed(1)}%`;
function useNationalView(kind:string,selector:string|null) {
  const key=`${kind}:${selector??''}`, [result,setResult]=useState<{key:string;view:View|null;failed:boolean}|null>(null);
  useEffect(()=>{
    if(kind!=='summary'&&!selector)return;
    const controller=new AbortController(),query=kind==='summary'?'':`?${kind==='state'?'state':'zip'}=${encodeURIComponent(selector??'')}`;
    void runnerJson<unknown>(`/api/business-map/national-status-${kind}${query}`,{signal:controller.signal}).then(value=>{
      if(!controller.signal.aborted)setResult(validNationalStatus(value,selector)?{key,view:value as View,failed:false}:{key,view:null,failed:true});
    }).catch(()=>{if(!controller.signal.aborted)setResult({key,view:null,failed:true})});
    return()=>controller.abort();
  },[kind,selector,key]);
  return result?.key===key?result:null;
}
export function NationalStatusPanel({state}:{state:string}) {
  const summary=useNationalView('summary',null),selected=useNationalView('state',state||null);
  const [zipInput,setZipInput]=useState(''),[zip,setZip]=useState<string|null>(null),detail=useNationalView('zip',zip);
  const view=summary?.view;
  return <section className="supporting-evidence" aria-label="National Status"><h4>National Status</h4>
    <p>Retained nationwide evidence, geography and source review status. Percentages measure evidence reach in the governed Census ZCTA cohort; business completeness is unmeasured.</p>
    {summary?.failed?<p role="alert">Verified National Status is unavailable. Existing Industry Status remains available.</p>:!view?<p role="status">Verifying national evidence…</p>:<>
      <p><strong>{n(view.zip5_cohort_rows)} ZIP5 cohort keys</strong> · {n(view.source_dimensions)} source dimensions · {n(view.matrix_evidence_cells)} evidence cells · {n(view.state_industry_rows)} state/industry rows</p>
      <p>Source review as of {view.temporal_assessment.assessment_as_of}: {n(view.temporal_assessment.dimension_counts['within-review-window'])} within review window · {n(view.gaps.stale_temporal_dimensions)} stale · {n(view.gaps.unmeasured_temporal_dimensions)} unmeasured.</p>
      <p>{n(view.gaps.broad_business_missing_states)} states/DC awaiting broad organization evidence · {n(view.gaps.unsupported_industry_access_cells)} unsupported industry access cells · {n(view.gaps.unmeasured_industry_access_cells)} unmeasured access cells.</p>
      <details><summary>National industry evidence reach</summary><div className="state-industry-progress">{view.industry_evidence_metrics.map(row=><div key={row.industry}><span>{label(row.industry)}</span><strong>{reach(row.exact_zip_measurement_reach_percent)}</strong><small>{n(row.measured_zip_dimension_cells)} / {n(row.zip_dimension_cell_denominator)} ZIP5-by-source-dimension cells</small></div>)}</div></details>
      <details><summary>Geography and separate territories</summary><p>33,455 dominant-state ZCTA keys · {n(view.geography_scope_counts['non-zcta-unassigned'])} non-ZCTA keys · {n(view.geography_scope_counts['multi-state-material'])} material cross-state ZCTAs · {n(view.geography_scope_counts['zcta-overlay-unresolved'])} unresolved overlays · {n(view.geography_scope_counts['explicit-placeholder'])} placeholder. These scopes remain visible without blocking the map.</p><p>Territories, outside state percentages: {view.territories.map(row=>`${row.code} ${n(row.zip5_rows)} ZIP5 keys`).join(' · ')}</p></details>
      <details><summary>Release provenance</summary><p>{view.provenance.release_id}</p><p>Manifest SHA-256: <code>{view.provenance.manifest_sha256}</code></p><p>Retained {view.provenance.created_at}. Source dates are available in state and ZIP detail.</p></details>
    </>}
    {state?<details><summary>{state} · nine industry status rows</summary>{selected?.failed?<p role="alert">Selected-state National Status is unavailable; evidence reach remains unknown.</p>:!selected?.view?<p role="status">Verifying {state} evidence…</p>:<div className="state-industry-progress">{selected.view.industries.map(row=><div key={row.id}><span>{label(row.id)}</span><strong>{reach(row.exact_zip_measurement_reach_percent)} evidence reach</strong><small>{n(row.measured_zip_dimension_cells)} / {n(row.zip_dimension_cell_denominator)} evidence cells · {reach(row.dimension_evidence_availability_percent)} dimension availability ({row.dimensions_with_retained_evidence}/{row.mapped_dimensions})</small><details><summary>Source dimensions and temporal status</summary>{row.dimensions.map(d=><p key={d.id}>{label(d.id)} · {label(d.temporal_qualification?.review_qualification??'unmeasured')} · {label(d.temporal_qualification?.semantic_class??'unmapped')}<br/>Release: {d.temporal_qualification?.source_release_id??'Unresolved'} · Source date: {d.temporal_qualification?.source_reference_at??'Unmeasured'}</p>)}</details></div>)}</div>}</details>:<p>Select a state on the map for its nine industry status rows.</p>}
    <details><summary>ZIP5 evidence detail</summary><form onSubmit={event=>{event.preventDefault();if(/^\d{5}$/.test(zipInput))setZip(zipInput)}}><label>Five-digit ZIP <input value={zipInput} onChange={event=>setZipInput(event.target.value)} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required aria-label="National Status ZIP5"/></label><button type="submit">Inspect ZIP</button></form>
      {zip&&(detail?.failed?<p role="alert">ZIP evidence is unavailable; no zero or validity claim was inferred.</p>:!detail?.view?<p role="status">Verifying ZIP {zip}…</p>:!detail.view.found?<p>ZIP {zip} is outside this retained cohort. USPS validity and business availability remain unknown.</p>:<><p>ZIP {detail.view.zip5} · ZIP+4 separate and unmeasured · {label(detail.view.cohort_classification)} · {label(detail.view.geography_scope)} · Census ZCTA {detail.view.zcta_geoid??'No polygon relation retained'}</p><details><summary>51 source dimensions and provenance</summary>{detail.view.dimensions.map(d=><p key={d.id}>{label(d.id)} · {label(d.evidence_status??'unavailable')} · {label(d.temporal_qualification?.review_qualification??'unmeasured')}<br/>Source release: {d.temporal_qualification?.source_release_id??'See matrix release provenance; temporal qualification unmeasured'}</p>)}<p>Federation {detail.view.provenance.release_id}</p></details></>)}
    </details>
  </section>;
}
