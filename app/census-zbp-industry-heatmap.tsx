'use client';
import { useEffect, useMemo, useState } from 'react';
import { runnerJson } from './runner-client';

type Row={zip5:string;zcta_geoid:string|null;polygon_membership:string;state:string|null;establishments:number};
type View={release_id:string;reference_year:number;naics_code:string;total:number;truncated:boolean;records:Row[];states:Array<{state:string;establishments:number}>;absent_row_semantics:string;universe:string;current_operating_status_verified:false;named_businesses:false;hierarchical_aggregation_permitted:false};
const count=(value:number)=>new Intl.NumberFormat('en-US').format(value);

export default function CensusZbpIndustryHeatmap(){
 const[code,setCode]=useState('23----'),[submitted,setSubmitted]=useState('23----'),[view,setView]=useState<View|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();void runnerJson<View>(`/api/census-zbp-industry?naics=${encodeURIComponent(submitted)}&limit=35000`,{signal:controller.signal}).then(value=>{setError('');setView(value);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Census industry view unavailable.');});return()=>controller.abort();},[submitted]);
 const maximum=Math.max(0,...(view?.states.map(row=>row.establishments)??[]));
 const rows=useMemo(()=>view?.records.slice(0,100)??[],[view]);
 return <section className="panel census-industry-panel"><div className="panel-heading"><div><span className="section-kicker">Annual aggregate context</span><h2>Census employer industry heatmap</h2></div><div className="governed-chip"><i/> Retained 2023 ZBP</div></div>
  <form onSubmit={event=>{event.preventDefault();if(/^[0-9\/-]+$/.test(code)&&code.length===6)setSubmitted(code);else setError('Enter one exact six-character published NAICS code, such as 23----.');}}><label>Exact published NAICS code <input aria-label="Exact published NAICS code" value={code} maxLength={6} onChange={event=>setCode(event.target.value)}/></label><button>Apply</button></form>
  {error&&<p className="map-error">{error}</p>}{view&&<><p><strong>{view.naics_code}</strong> · reference year {view.reference_year} · {count(view.total)} published ZIP5 rows. Annual employer-establishment aggregates only; no named or currently operating businesses.</p>
  <div className="census-industry-grid" role="img" aria-label={`State heatmap for NAICS ${view.naics_code}`}>{view.states.map(row=>{const intensity=maximum?Math.log1p(row.establishments)/Math.log1p(maximum):0;return <span key={row.state} title={`${row.state}: ${count(row.establishments)}`} style={{backgroundColor:`hsl(${205-intensity*165} 72% ${25+intensity*35}%)`}}><b>{row.state}</b><small>{count(row.establishments)}</small></span>;})}</div>
  <div className="heatmap-legend"><span>Lower annual aggregate</span><i/><i/><i/><i/><i/><span>Higher</span></div>
  <details><summary>ZIP5 publication rows</summary><p>Shown as ZIP5. A ZCTA is indicated only for an exact five-digit code match; a ZIP5 without that match receives no polygon.</p><table><thead><tr><th>ZIP5</th><th>State label</th><th>Employer establishments</th><th>Polygon</th></tr></thead><tbody>{rows.map(row=><tr key={row.zip5}><td>{row.zip5}</td><td>{row.state??'Unassigned'}</td><td>{count(row.establishments)}</td><td>{row.zcta_geoid?`ZCTA ${row.zcta_geoid}`:'None'}</td></tr>)}</tbody></table>{view.total>rows.length&&<p>Showing the first {count(rows.length)} of {count(view.total)} rows.</p>}</details>
  <p className="map-method-note">Absent ZIP5 × NAICS rows are unavailable, not zero. One exact published code is evaluated at a time; hierarchical NAICS rows are never added together. ZIP 99999 remains unassigned. Universe: {view.universe.replaceAll('-', ' ')}.</p></>}
 </section>;
}
