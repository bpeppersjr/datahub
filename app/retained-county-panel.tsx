'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type Cohort={dataset_id:string;source_label:string;selected_source_rows:number;assigned_source_rows:number;by_status:Record<string,number>;by_county:Array<{county_geoid:string;candidate_rows:number}>};
type Data={status:string;derivative_created_at?:string;geography_manifest_sha256?:string;county_geoids?:string[];supported_state_fips?:string[];source_cohorts?:Cohort[];
  counts?:{candidate_rows:number;by_status:Record<string,number>;by_county:Array<{county_geoid:string;candidate_rows:number}>}};
export default function RetainedCountyPanel({level,geoid,geographyHash,mapRevision}:{level?:string;geoid?:string;geographyHash?:string;mapRevision?:unknown}){
  const [result,setResult]=useState<{revision:unknown;data:Data|null;error:boolean}|null>(null);
  const data=result?.revision===mapRevision?result?.data??null:null;
  const error=result?.revision===mapRevision&&result?.error;
  useEffect(()=>{let active=true;void runnerJson<Data>('/api/business-map/retained-childcare-counties').then(value=>{if(active)setResult({revision:mapRevision,data:value,error:false});}).catch(()=>{if(active)setResult({revision:mapRevision,data:null,error:true});});return()=>{active=false;};},[mapRevision]);
  const compatible=data?.status==='available'&&geographyHash===data.geography_manifest_sha256;
  const inScope=compatible&&!!geoid&&(level==='state'&&data?.supported_state_fips?.includes(geoid)||level==='county'&&data?.county_geoids?.includes(geoid));
  const contributions=(data?.source_cohorts??[]).map(source=>({...source,value:inScope?source.by_county.reduce((sum,row)=>sum+((level==='state'?row.county_geoid.startsWith(geoid!):row.county_geoid===geoid)?row.candidate_rows:0),0):null}));
  const value=inScope?contributions.reduce((sum,source)=>sum+(source.value??0),0):null;
  return <section className="retained-childcare-panel" aria-label="Retained childcare county points">
    <h3>Retained childcare county points</h3>
    <p>Source-point relationships, not verified business locations. Separate from published business totals.</p>
    {!data&&!error&&<p role="status">Loading verified saved relationships…</p>}
    {error&&<p role="alert">County evidence could not be verified. No source request was made.</p>}
    {data&&data.status!=='available'&&<p>County evidence unavailable—not a zero business count.</p>}
    {data?.status==='available'&&<>
      {!compatible&&<p>Map geography differs from the retained county release. Counts are withheld.</p>}
      {compatible&&value===null&&<p>{level==='zip'?'ZIP membership was not derived from county polygons.':'Select Pennsylvania, Maryland or one of their counties. Other states are not enabled in this version.'}</p>}
      {value!==null&&<dl><div><dt>Assigned source-point rows in selected geography</dt><dd>{value.toLocaleString()}</dd></div></dl>}
      {contributions.map(source=><div key={source.dataset_id}>
        <h4>{source.source_label} source cohort</h4>
        {source.value!==null&&<dl><div><dt>Source rows in selected geography</dt><dd>{source.value.toLocaleString()}</dd></div>
          <div><dt>Share of assigned {source.source_label} source rows</dt><dd>{source.assigned_source_rows>0?`${(100*source.value/source.assigned_source_rows).toFixed(1)}%`:'Unavailable'}</dd></div></dl>}
        <p>Assignment denominator: {source.assigned_source_rows.toLocaleString()} assigned of {source.selected_source_rows.toLocaleString()} selected {source.source_label} source rows. This is not industry completeness.</p>
        <p>Unassigned source rows: {(source.selected_source_rows-source.assigned_source_rows).toLocaleString()}. Publisher scope and assigned geography are separate.</p>
      </div>)}
      <details><summary>Coverage gaps and provenance</summary>
        <p>Across {data.counts?.candidate_rows.toLocaleString()} selected source rows: {data.counts?.by_status['missing-source-point'].toLocaleString()} missing points; {data.counts?.by_status['unknown-coordinate-system'].toLocaleString()} unknown coordinate system; {data.counts?.by_status['source-not-enabled-for-overlay'].toLocaleString()} not enabled for overlay.</p>
        <p>Derived: {data.derivative_created_at}. Original observation dates remain in the retained source receipts. This read checks saved integrity, not source freshness. ZIP5 and ZIP4 remain separate.</p>
      </details>
    </>}
  </section>;
}
