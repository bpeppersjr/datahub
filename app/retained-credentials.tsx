'use client';
import { useEffect,useState } from 'react';
import { runnerJson } from './runner-client';
type View={available:boolean;status:string;sourceLabel?:string;acceptedCohortRows?:number;sourceRows?:number;rejectedRows?:number;missingZip5Rows?:number;stateRows?:number|null;observedAt?:string;sourceReleaseId?:string;receiptSha256?:string;reportingReleaseId?:string;reportingManifestSha256?:string;availableStates?:string[];total?:number;national50DcRows?:number;outside50DcOrUnresolvedRows?:number;records:Array<{state:string;zip5?:string|null;category?:string;credentialRows:number;percentOfCohort?:number|null;categoryWithinState?:number|null;stateShareOfCategory?:number|null}>};
const categories=[['construction-contractor-registration','Contractor registration (separate cohort)'],['residential-building-contractor','Residential building contractor'],['residential-remodeler','Residential remodeler'],['residential-roofer','Residential roofer'],['manufactured-home-installer','Manufactured-home installer']];
const categoryLabel=(value:string|undefined)=>categories.find(([key])=>key===value)?.[1]??value;
const percent=(value:number|null|undefined)=>value===null||value===undefined?'—':`${value.toFixed(3)}%`;
const count=(value:number|undefined)=>value===undefined?'—':value.toLocaleString('en-US');
export default function RetainedCredentials(){
  const [state,setState]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[view,setView]=useState<View|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [states,setStates]=useState<string[]>([]);
  const [mode,setMode]=useState('categories'),[category,setCategory]=useState('');
  const resetView=()=>{setLoading(true);setView(null);setError('');};
  useEffect(()=>{
    const controller=new AbortController();
    const query=new URLSearchParams({offset:String(offset),limit:'25',view:mode,...(state?{state}:{}),...(mode==='categories'&&category?{category}:{})});
    void runnerJson<View>(`/api/retained-credentials?${query}`,{signal:controller.signal}).then(result=>{
      if(!controller.signal.aborted){setView(result);if(result.availableStates)setStates(result.availableStates);}
    }).catch(()=>{if(!controller.signal.aborted)setError('Retained credential evidence could not be verified. Counts are unavailable.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[state,offset,revision,mode,category]);
  return <section className="retained-credentials" aria-labelledby="retained-credentials-title">
    <div className="retained-heading"><div><h3 id="retained-credentials-title">Retained credential evidence</h3><p>Verified local records · not included in published national totals</p></div><button className="ghost-button" disabled={loading} onClick={()=>{resetView();setRevision(x=>x+1);}}>Recheck retained data</button></div>
    <div className="retained-controls">
      <label>Compare <select value={mode} onChange={event=>{resetView();setMode(event.target.value);setOffset(0);}}><option value="categories">Categories across states</option><option value="postal">Reported state / ZIP5 totals</option></select></label>
      <label>Reported address state <select value={state} onChange={event=>{resetView();setState(event.target.value);setOffset(0);}}><option value="">{mode==='categories'?'50 states + D.C.':'All reported states'}</option>{states.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      {mode==='categories'&&<label>Credential category <select value={category} onChange={event=>{resetView();setCategory(event.target.value);setOffset(0);}}><option value="">All credential categories</option>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
      <span>No source download is started by this panel.</span>
    </div>
    <div aria-live="polite">
      {loading&&<p>Verifying retained evidence…</p>}
      {error&&<p role="alert">{error}</p>}
      {!loading&&!error&&view&&!view.available&&<p>{view.status==='not-enrolled'?'No retained credential source is enrolled.':'The enrolled source is not installed. Counts are unavailable, not zero.'}</p>}
      {!loading&&!error&&view?.available&&<>
        <p><strong>{view.sourceLabel}</strong> — {count(view.acceptedCohortRows)} accepted credential rows from {count(view.sourceRows)} source rows. {count(view.rejectedRows)} excluded; {count(view.missingZip5Rows)} accepted row(s) have no ZIP5.</p>
        <p>Observed <time dateTime={view.observedAt}>{view.observedAt}</time>. Publisher jurisdiction: MN. {state&&<>Reported {state} addresses: {count(view.stateRows??undefined)} credential rows.</>}</p>
        <p>{mode==='categories'?'Within-state % uses all accepted credential rows reporting that state. Category share % uses all accepted rows in that category reporting one of the 50 states or D.C. Filters do not shrink these denominators.':'Percentages use all accepted rows in this cohort—even when filtered.'} These are not shares of all U.S. businesses. Reported addresses are not verified operating locations. Registrations are not included.</p>
        {mode==='categories'&&<p>{count(view.national50DcRows)} rows report a state or D.C.; {count(view.outside50DcOrUnresolvedRows)} are outside that scope or unresolved. Zero means no rows in this retained cohort, not no businesses. “—” means the denominator is zero.</p>}
        <div className="retained-table-scroll"><table><caption>{mode==='categories'?'Credential category distribution — retained cohort only':state?`${state} reported ZIP5 groups`:'Reported-address state distribution'}</caption><thead><tr><th scope="col">State</th>{mode==='categories'?<th scope="col">Credential category</th>:state&&<th scope="col">ZIP5</th>}<th scope="col">Credential rows</th>{mode==='categories'?<><th scope="col">Within-state %</th><th scope="col">Category share % (50 states + D.C.)</th></>:<th scope="col">% of accepted cohort</th>}</tr></thead><tbody>{view.records.map(row=><tr key={`${row.state}:${row.category??row.zip5??''}`}><td>{row.state}</td>{mode==='categories'?<td>{categoryLabel(row.category)}</td>:state&&<td>{row.zip5}</td>}<td>{count(row.credentialRows)}</td>{mode==='categories'?<><td>{percent(row.categoryWithinState)}</td><td>{percent(row.stateShareOfCategory)}</td></>:<td>{percent(row.percentOfCohort)}</td>}</tr>)}</tbody></table></div>
        {view.records.length===0&&<p>No {mode==='categories'?'state/category rows':'reported ZIP5 groups'} on this page. This does not mean there are no businesses in the state.</p>}
        <div className="retained-controls"><button disabled={offset===0} onClick={()=>{resetView();setOffset(Math.max(0,offset-25));}}>Previous</button><span>{count(view.total)} {mode==='categories'?'state/category rows':state?'ZIP5 groups':'reported states'}</span><button disabled={offset+25>=(view.total??0)} onClick={()=>{resetView();setOffset(offset+25);}}>Next</button></div>
        <details><summary>Evidence provenance</summary><p>Source release: <code>{view.sourceReleaseId}</code></p><p>Verified app receipt SHA-256: <code>{view.receiptSha256}</code></p>{view.reportingReleaseId&&<><p>Reporting release: <code>{view.reportingReleaseId}</code></p><p>Reporting manifest SHA-256: <code>{view.reportingManifestSha256}</code></p></>}<p>Unique active businesses and physical-site totals remain unknown. ZIP5 values are reported values, not verified current USPS assignments; ZIP4 is not joined to ZIP5.</p></details>
      </>}
    </div>
  </section>;
}
