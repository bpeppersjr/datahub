'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {runnerJson} from './runner-client';
import styles from './credential-heatmap.module.css';

const categories=[['construction-contractor-registration','Construction contractor registration'],['residential-building-contractor','Residential building contractor'],['residential-remodeler','Residential remodeler'],['residential-roofer','Residential roofer'],['manufactured-home-installer','Manufactured home installer']];
type Cell={category:string;credentialRows:number;categoryWithinState?:number|null;stateShareOfCategory?:number|null;categoryWithinZipGroup?:number|null;percentOfAcceptedCohort?:number|null};
type Geometry={type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]};
type State={state:string;stateFips:string;name:string;credentialRows:number;heatValue:number;geometryStatus:string;geometry:Geometry|null;categoryWithinState:number|null;stateShareOfCategory:number|null};
type Postal={state:string|null;zip5:string|null;credentialRows:number;heatValue:number;categories:Cell[];percentOfReportedState:number|null};
type View={available:boolean;status:string;generation:number;verifiedAt:string|null;sourceObservedAt?:string|null;acceptedCohortRows:number|null;missingZip5Rows?:number;outside50DcOrUnresolvedRows?:number;nationalStates:State[];postalGroups:Postal[];summary:{credentialRows:number;percentOfAcceptedCohort:number|null;state:{credentialRows:number;categories:Cell[]}|null}|null;displayGaps?:{states:string[];selectedCategoryRowsWithoutStateGeometry:number};};
const count=(value:number|null|undefined)=>value==null?'Unknown':value.toLocaleString('en-US');
const percent=(n:number|null|undefined,d:number|null|undefined)=>n==null||d==null||d===0?'Unknown':`${(n/d*100).toFixed(2)}%`;
const percentValue=(value:number|null|undefined)=>value==null?'Unknown':`${value.toFixed(2)}%`;
const groupKey=(row:Postal)=>JSON.stringify([row.state,row.zip5]);
function color(value:number,maximum:number){return value===0?'#202f3a':`hsl(${196-Math.log1p(value)/Math.log1p(Math.max(1,maximum))*162} 78% 46%)`;}
function statePath(row:State){
  if(!row.geometry)return '';
  const polygons=row.geometry.type==='Polygon'?[row.geometry.coordinates as number[][][]]:row.geometry.coordinates as number[][][][];
  const project=([longitude,latitude]:number[])=>{
    if(row.state==='AK')return [35+((longitude>0?longitude-360:longitude)+180)*3.2,385+(72-latitude)*7.5];
    if(row.state==='HI')return [215+(longitude+161)*8.5,470+(23-latitude)*11];
    return [100+(longitude+125)*13.2,20+(50-latitude)*19.2];
  };
  return polygons.flatMap(polygon=>polygon.map(ring=>ring.map((point,i)=>`${i?'L':'M'}${project(point).map(n=>n.toFixed(2)).join(',')}`).join(' ')+' Z')).join(' ');
}

export default function CredentialHeatmap(){
  const [category,setCategory]=useState(''),[state,setState]=useState(''),[zip,setZip]=useState<string|null>(null);
  const [reload,setReload]=useState(0),[saved,setSaved]=useState<{key:string;value:View}|null>(null),[error,setError]=useState('');
  const [zoom,setZoom]=useState(1),[hover,setHover]=useState<string|null>(null);
  const sequence=useRef(0),recheckSent=useRef(0);
  const key=JSON.stringify([category,state,reload]);
  const data=saved?.key===key?saved.value:null;
  useEffect(()=>{
    const controller=new AbortController(),current=++sequence.current;
    const parameters=new URLSearchParams();if(category)parameters.set('category',category);if(state)parameters.set('state',state);
    const recheck=reload>recheckSent.current;if(recheck)recheckSent.current=reload;
    void runnerJson<View>(`/api/credential-heatmap?${parameters}`,{method:recheck?'POST':'GET',signal:controller.signal}).then(value=>{
      if(!controller.signal.aborted&&current===sequence.current){setSaved({key,value});setError('');}
    }).catch(()=>{if(!controller.signal.aborted&&current===sequence.current){setSaved(null);setError('Credential evidence is unavailable. Recheck explicitly; unknown counts are not zero.');}});
    return ()=>controller.abort();
  },[category,state,reload,key]);
  const paths=useMemo(()=>data?.available?data.nationalStates.map(row=>({row,d:statePath(row)})):[],[data]);
  const selectedZip=data?.postalGroups.find(row=>groupKey(row)===zip);
  const selectedState=data?.nationalStates.find(row=>row.state===(selectedZip?.state??state));
  const categoryLabel=categories.find(([id])=>id===category)?.[1]??'All credential categories';
  const selectedCount=selectedZip?.heatValue??data?.summary?.credentialRows;
  const max=Math.max(0,...paths.map(({row})=>row.heatValue));
  const zipMax=(data?.postalGroups??[]).reduce((maximum,row)=>Math.max(maximum,row.heatValue),1);
  const hovered=data?.nationalStates.find(row=>row.state===hover);
  function chooseState(value:string){setState(value);setZip(null);setError('');}
  function recheck(){setError('');setZip(null);setReload(value=>value+1);}
  return <section id="business-intelligence" className={`panel ${styles.panel}`} aria-label="Credential Heatmap Builder">
    <div className="panel-heading"><div><span className="section-kicker">Retained Minnesota publisher cohort</span><h2>Credential Heatmap Builder</h2></div><span>Local review only</span></div>
    <div className={styles.controls}>
      <label>Credential category<select aria-label="Heatmap credential category" value={category} onChange={event=>{setCategory(event.target.value);setZip(null);setError('');}}><option value="">All credential categories</option>{categories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label>Reported-address state<select aria-label="Heatmap reported-address state" value={state} onChange={event=>chooseState(event.target.value)}><option value="">All reported states</option>{(data?.nationalStates??saved?.value.nationalStates??[]).map(row=><option value={row.state} key={row.state}>{row.name}</option>)}</select></label>
      <button onClick={recheck}>Recheck retained evidence</button>
    </div>
    <p className={styles.note}>Reported-address state → reported-ZIP heat tiles. County navigation, business names and demographic filters are unavailable: credential addresses are not verified operating sites. ZIP tiles are not polygons; ZIP+4 is not joined.</p>
    {!data&&!error&&<p role="status">Verifying retained credential and state-geography evidence…</p>}
    {error&&<p role="alert">{error}</p>}
    {data&&!data.available&&<p role="status">{data.status==='busy-cancelling-prior-build'?'Prior verification is still cancelling. Recheck after it settles.':'Verified evidence is unavailable. Recheck explicitly.'} Counts and completeness are unknown, not zero.</p>}
    {data?.available&&<div className={styles.layout}>
      <div className={styles.mapColumn}>
        <div className={styles.map}>
          <div className={styles.zoom}><button aria-label="Zoom credential map in" onClick={()=>setZoom(z=>Math.min(7,z*1.25))}>＋</button><button aria-label="Zoom credential map out" onClick={()=>setZoom(z=>Math.max(1,z/1.25))}>−</button><button onClick={()=>setZoom(1)}>Reset zoom</button><span>{zoom.toFixed(1)}× · Ctrl+scroll</span></div>
          <svg viewBox="0 0 900 540" role="group" aria-label="Reported-address state credential choropleth" onWheel={event=>{if(event.ctrlKey){event.preventDefault();setZoom(z=>Math.max(1,Math.min(7,z*(event.deltaY<0?1.18:0.85))));}}}>
            <g style={{transform:`scale(${zoom})`,transformOrigin:'450px 270px'}}>{paths.filter(item=>item.d).map(({row,d})=><path key={row.state} d={d} fill={color(row.heatValue,max)} stroke={row.state===state?'#fff':'#15232c'} strokeWidth={row.state===state?2:0.6} tabIndex={0} role="button" aria-pressed={row.state===state} aria-label={`${row.name}; ${count(row.heatValue)} ${categoryLabel} credential rows; reported address, not verified sites`} onClick={()=>chooseState(row.state)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseState(row.state);}}} onMouseEnter={()=>setHover(row.state)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(row.state)} onBlur={()=>setHover(null)}/>)}</g>
          </svg>
          <div className={styles.legend}>0 <i/> {count(max)} selected-category credential rows · logarithmic color</div>
          <div className={styles.hover} aria-live="polite">{hovered?`${hovered.name}: ${count(hovered.heatValue)} ${categoryLabel} credential rows`:'Select a state by map or dropdown. All 51 state/DC observations remain on the map.'}</div>
        </div>
        <h3>Reported-ZIP heat tiles · {state||'all reported states'}</h3>
        <p className={styles.note}>Counts include missing ZIP and codes whose polygon membership is unknown. Category zero counts remain visible. Select a tile to inspect its denominators.</p>
        <div className={styles.tiles} aria-label="Reported ZIP groups">{data.postalGroups.map(row=><button key={groupKey(row)} aria-pressed={zip===groupKey(row)} onClick={()=>setZip(groupKey(row))} style={{borderColor:color(row.heatValue,zipMax)}}><span>{row.state??'Outside / unresolved'} · {row.zip5??'Missing ZIP'}</span><strong>{count(row.heatValue)}</strong></button>)}</div>
        {!data.postalGroups.length&&<p>No reported-ZIP groups in this observed state cohort.</p>}
      </div>
      <aside className={styles.summary} aria-label="Credential alignment summary">
        <h3>Credential alignment</h3><p>{categoryLabel}</p><strong>{selectedZip?`${selectedZip.state??'Outside / unresolved'} · ${selectedZip.zip5??'Missing ZIP'}`:selectedState?.name??'All reported states'}</strong>
        {selectedZip&&<button onClick={()=>setZip(null)}>Clear ZIP selection</button>}
        <dl><dt>Selected credential rows</dt><dd>{count(selectedCount)}</dd><dt>Share of all {count(data.acceptedCohortRows)} accepted credential rows</dt><dd>{percent(selectedCount,data.acceptedCohortRows)}</dd>
          {selectedState&&<><dt>Share of all {count(selectedState.credentialRows)} credential rows reporting {selectedState.state}</dt><dd>{percent(selectedCount,selectedState.credentialRows)}</dd></>}
          {selectedState&&category&&<><dt>{selectedState.state} share of this category’s 50-state/DC rows</dt><dd>{percentValue(selectedState.stateShareOfCategory)}</dd></>}
          {selectedZip&&category&&<><dt>Category share of all {count(selectedZip.credentialRows)} rows in this reported-state / ZIP group</dt><dd>{percent(selectedZip.heatValue,selectedZip.credentialRows)}</dd></>}
          <dt>Full-cohort missing ZIP rows</dt><dd>{count(data.missingZip5Rows)}</dd><dt>Full-cohort outside / unresolved state rows</dt><dd>{count(data.outside50DcOrUnresolvedRows)}</dd>
          <dt>Selected-category rows lacking state geometry (all states)</dt><dd>{count(data.displayGaps?.selectedCategoryRowsWithoutStateGeometry)}</dd>
        </dl>
        <p>These are cohort shares, not collection completeness. Unique businesses, physical sites and nationwide completeness are unknown. No geographic assignment or public export is authorized.</p>
        <dl><dt>Source observed</dt><dd>{data.sourceObservedAt??'Unknown'}</dd><dt>Snapshot verified</dt><dd>{data.verifiedAt??'Unknown'}</dd></dl>
        <p>Verification describes this retained snapshot, not perpetual freshness. Existing ZIP-view membership is not evaluated. Original source integration flags remain unchanged.</p>
      </aside>
    </div>}
  </section>;
}
