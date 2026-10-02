'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type Cohort={dataset_id:string;source_label:string;selected_source_rows:number;assigned_source_rows:number;by_status:Record<string,number>;by_county:Array<{county_geoid:string;candidate_rows:number}>};
type Data={status:string;derivative_created_at?:string;geography_manifest_sha256?:string;county_geoids?:string[];supported_state_fips?:string[];source_cohorts?:Cohort[];
  counts?:{candidate_rows:number;by_status:Record<string,number>;by_county:Array<{county_geoid:string;candidate_rows:number}>}};
export function RetainedCountyWorkspace({stateCode}:{stateCode:string}){
  const [catalog,setCatalog]=useState<{available:boolean;geography_manifest_sha256?:string}|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();void runnerJson<{available:boolean;geography_manifest_sha256?:string}>('/api/business-map/catalog',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setCatalog(value);}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[]);
  return <section aria-label="Separate retained childcare evidence"><h3>Retained childcare county evidence — Pennsylvania and Maryland</h3>
    <p>Separate local evidence layer. National dataset expectations, availability and completion remain unchanged. No acquisition, source replay, publication or national integration is performed.</p>
    {!stateCode?<p>Select a state above to inspect retained county evidence.</p>:!['PA','MD'].includes(stateCode)?<p>County evidence for {stateCode} is unavailable in this retained layer, not zero. Only Pennsylvania and Maryland are enabled.</p>:error||catalog?.available===false?<p role="alert">Current geography could not be verified. County counts are withheld.</p>:!catalog?<p role="status">Checking current geography…</p>:<RetainedCountyPanel key={stateCode} level="state" geoid={stateCode==='PA'?'42':'24'} geographyHash={catalog.geography_manifest_sha256} mapRevision={catalog} allowCountySelection/>}
  </section>;
}

export default function RetainedCountyPanel({level,geoid,geographyHash,mapRevision,allowCountySelection=false}:{level?:string;geoid?:string;geographyHash?:string;mapRevision?:unknown;allowCountySelection?:boolean}){
  const [result,setResult]=useState<{revision:unknown;data:Data|null;error:boolean}|null>(null);
  const [county,setCounty]=useState<{state?:string;geoid:string}>({state:geoid,geoid:''});
  const data=result?.revision===mapRevision?result?.data??null:null;
  const error=result?.revision===mapRevision&&result?.error;
  useEffect(()=>{let active=true;void runnerJson<Data>('/api/business-map/retained-childcare-counties').then(value=>{if(active)setResult({revision:mapRevision,data:value,error:false});}).catch(()=>{if(active)setResult({revision:mapRevision,data:null,error:true});});return()=>{active=false;};},[mapRevision]);
  const compatible=data?.status==='available'&&!!geographyHash&&geographyHash===data.geography_manifest_sha256;
  const selectedCounty=allowCountySelection&&level==='state'&&county.state===geoid?county.geoid:'';
  const counties=compatible&&level==='state'?data?.county_geoids?.filter(id=>id.startsWith(geoid??''))??[]:[];
  const activeLevel=selectedCounty?'county':level,activeGeoid=selectedCounty||geoid;
  const inScope=compatible&&!!activeGeoid&&(activeLevel==='state'&&data?.supported_state_fips?.includes(activeGeoid)||activeLevel==='county'&&data?.county_geoids?.includes(activeGeoid));
  const contributions=(data?.source_cohorts??[]).map(source=>({...source,value:inScope?source.by_county.reduce((sum,row)=>sum+((activeLevel==='state'?row.county_geoid.startsWith(activeGeoid!):row.county_geoid===activeGeoid)?row.candidate_rows:0),0):null}));
  const value=inScope?contributions.reduce((sum,source)=>sum+(source.value??0),0):null;
  return <section className="retained-childcare-panel" aria-label="Retained childcare county points">
    <h3>Retained childcare county points</h3>
    <p>Source-point relationships, not verified business locations or current operations. Separate from published business totals. All-business completeness remains unknown; public export is not authorized.</p>
    {!data&&!error&&<p role="status">Loading verified saved relationships…</p>}
    {error&&<p role="alert">County evidence could not be verified. No source request was made.</p>}
    {data&&data.status!=='available'&&<p>County evidence unavailable—not a zero business count.</p>}
    {data?.status==='available'&&<>
      {allowCountySelection&&compatible&&counties.length>0&&<label>Retained county <select aria-label="Retained childcare county" value={selectedCounty} onChange={event=>setCounty({state:geoid,geoid:event.target.value})}><option value="">All assigned rows in selected state</option>{counties.map(id=><option key={id} value={id}>County GEOID {id}</option>)}</select></label>}
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
        <p>Across {data.counts?.candidate_rows.toLocaleString()} selected source rows in the retained derivative, including cohorts not enabled for county display:</p>
        <ul>{Object.entries(data.counts?.by_status??{}).map(([status,total])=><li key={status}>{status.replaceAll('-',' ')}: {total.toLocaleString()}</li>)}</ul>
        <p>Derivative created: {data.derivative_created_at??'Unavailable'}. Source observation dates: not included in this aggregate response; retained source receipts hold the original dates. The derivative date is not a source observation date. This read checks saved integrity, not source freshness. ZIP5 and ZIP4 remain separate.</p>
      </details>
    </>}
  </section>;
}
