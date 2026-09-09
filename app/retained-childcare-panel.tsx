'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type Cohort={status:string;source_id:string;publisher_scope:string;accepted_candidate_rows?:number;quarantined_candidate_rows?:number;
  by_reported_zip?:Array<{state:string|null;zip5:string|null;candidate_rows:number}>;
  by_reported_state?:Array<{state:string|null;candidate_rows:number}>;
  quality?:{with_points:number;with_zip5:number;with_zip4:number};
  provenance?:{observed_at:string;source_updated_at?:string|null;publisher_cohort_date?:string;report_edition?:string};};
type RetainedResponse={status:string;operation_finished_at?:string;view?:{cohorts:Record<string,Cohort[]>}};
const names:Record<string,string>={PA:'Pennsylvania',CT:'Connecticut',MD:'Maryland',VT:'Vermont',CO:'Colorado',UT:'Utah',IA:'Iowa'};
const number=(value:number)=>value.toLocaleString();

export default function RetainedChildcarePanel({publisherState,selectedZip,countySelected,scopeUnavailable=false}:{publisherState?:string;selectedZip:string;countySelected:boolean;scopeUnavailable?:boolean}){
  const [data,setData]=useState<RetainedResponse|null>(null),[error,setError]=useState(false);
  useEffect(()=>{let active=true;void runnerJson<RetainedResponse>('/api/business-map/retained-childcare').then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
  const all=data?.view?.cohorts??{},rows=scopeUnavailable?[]:publisherState?(all[publisherState]??[]):Object.values(all).flat();
  return <section className="retained-childcare-panel" aria-label="Retained childcare source comparison">
    <h3>Retained childcare sources</h3>
    <p>Separate from map shading and national totals. Source rows are not a count of unique active businesses.</p>
    {!data&&!error&&<p role="status">Loading saved snapshot…</p>}
    {error&&<p role="alert">The saved snapshot could not be verified. No data has been downloaded.</p>}
    {data&&data.status!=='available'&&<p>Saved snapshot unavailable on this installation. This is not a zero business count.</p>}
    {data?.status==='available'&&<>
      {scopeUnavailable&&<p>The selected state could not be resolved. Source counts are withheld for this scope.</p>}
      {countySelected&&<p>Showing the state publisher’s cohort, not county totals. Source ZIP values do not establish county or ZCTA membership.</p>}
      {publisherState&&!rows.length&&<p>No retained childcare publisher cohort is enrolled for {publisherState}. Coverage is unknown.</p>}
      {rows.map(row=>{
        if(row.status!=='available')return <article key={row.source_id}><h4>{names[row.publisher_scope]??row.publisher_scope}</h4><p>Source evidence unavailable—not measured zero.</p></article>;
        const total=row.accepted_candidate_rows??0,matching=selectedZip?(row.by_reported_zip??[]).filter(zip=>zip.zip5===selectedZip).reduce((sum,zip)=>sum+zip.candidate_rows,0):total;
        const share=total>0?`${(100*matching/total).toFixed(1)}%`:'Unknown';
        const unknownState=(row.by_reported_state??[]).filter(state=>state.state===null).reduce((sum,state)=>sum+state.candidate_rows,0);
        return <article key={row.source_id}>
          <h4>{names[row.publisher_scope]??row.publisher_scope}</h4>
          <dl><div><dt>{selectedZip?`Rows reporting ZIP ${selectedZip}`:'Accepted source rows'}</dt><dd>{number(matching)}</dd></div>
            <div><dt>Share of this source cohort</dt><dd>{share}</dd></div>
            <div><dt>Accepted cohort denominator</dt><dd>{number(total)}</dd></div></dl>
          {unknownState>0&&<p>{number(unknownState)} cohort rows have no reported address state. Publisher location is not address-state evidence.</p>}
          <details><summary>Source scope and dates</summary>
            <p>{row.source_id}</p>
            <p>Quarantined rows: {number(row.quarantined_candidate_rows??0)}. These are excluded from the accepted-cohort denominator.</p>
            <p>Whole-cohort source points: {number(row.quality?.with_points??0)}; exact geocode accuracy is not verified. ZIP+4 remains a separate field.</p>
            <p>Observed: {row.provenance?.observed_at??'Unknown'}. Source update: {row.provenance?.source_updated_at??'Unknown'}.</p>
            {row.provenance?.publisher_cohort_date&&<p>Publisher cohort date: {row.provenance.publisher_cohort_date}.</p>}
          </details>
        </article>;
      })}
      <p>Snapshot completed: {data.operation_finished_at??'Unknown'}. This is a processing date, not source freshness. Percentage of all U.S. businesses collected: unknown.</p>
    </>}
  </section>;
}
