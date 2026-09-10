'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type Data={status:string;derivative_created_at?:string;geography_manifest_sha256?:string;pa_county_geoids?:string[];pa_selected_source_rows?:number;
  counts?:{candidate_rows:number;by_status:Record<string,number>;by_county:Array<{county_geoid:string;candidate_rows:number}>}};
export default function RetainedCountyPanel({level,geoid,geographyHash,mapRevision}:{level?:string;geoid?:string;geographyHash?:string;mapRevision?:unknown}){
  const [result,setResult]=useState<{revision:unknown;data:Data|null;error:boolean}|null>(null);
  const data=result?.revision===mapRevision?result?.data??null:null;
  const error=result?.revision===mapRevision&&result?.error;
  useEffect(()=>{let active=true;void runnerJson<Data>('/api/business-map/retained-childcare-counties').then(value=>{if(active)setResult({revision:mapRevision,data:value,error:false});}).catch(()=>{if(active)setResult({revision:mapRevision,data:null,error:true});});return()=>{active=false;};},[mapRevision]);
  const compatible=data?.status==='available'&&geographyHash===data.geography_manifest_sha256;
  const inScope=compatible&&(level==='state'&&geoid==='42'||level==='county'&&!!geoid&&data?.pa_county_geoids?.includes(geoid));
  const assigned=data?.counts?.by_status['assigned-single-county']??0;
  const value=inScope?(level==='state'?assigned:data?.counts?.by_county.find(row=>row.county_geoid===geoid)?.candidate_rows??0):null;
  const share=value!==null&&assigned>0?`${(100*value/assigned).toFixed(1)}%`:'Unavailable';
  return <section className="retained-childcare-panel" aria-label="Retained childcare county points">
    <h3>Retained childcare county points</h3>
    <p>Source-point relationships, not verified business locations. Separate from published business totals.</p>
    {!data&&!error&&<p role="status">Loading verified saved relationships…</p>}
    {error&&<p role="alert">County evidence could not be verified. No source request was made.</p>}
    {data&&data.status!=='available'&&<p>County evidence unavailable—not a zero business count.</p>}
    {data?.status==='available'&&<>
      {!compatible&&<p>Map geography differs from the retained county release. Counts are withheld.</p>}
      {compatible&&value===null&&<p>{level==='zip'?'ZIP membership was not derived from county polygons.':'Select Pennsylvania or one of its counties. Other states are not enabled in this version.'}</p>}
      {value!==null&&<dl><div><dt>Assigned source-point rows</dt><dd>{value.toLocaleString()}</dd></div>
        <div><dt>Share of all assigned PA source points</dt><dd>{share}</dd></div></dl>}
      <p>Assignment denominator: {assigned.toLocaleString()} assigned of {data.pa_selected_source_rows?.toLocaleString()} selected PA source rows. This is not industry completeness.</p>
      <details><summary>Coverage gaps and provenance</summary>
        <p>Across {data.counts?.candidate_rows.toLocaleString()} selected source rows: {data.counts?.by_status['missing-source-point'].toLocaleString()} missing points; {data.counts?.by_status['unknown-coordinate-system'].toLocaleString()} unknown coordinate system; {data.counts?.by_status['source-not-enabled-for-overlay'].toLocaleString()} not enabled for overlay.</p>
        <p>Derived: {data.derivative_created_at}. Original observation dates remain in the retained source receipts. This read checks saved integrity, not source freshness. ZIP5 and ZIP4 remain separate.</p>
      </details>
    </>}
  </section>;
}
