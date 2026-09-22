'use client';
import {useEffect,useState} from 'react';
import {runnerJson} from './runner-client';

type View={status:'metadata-only-no-place-admission';release_id:string;observed_at:string;asset_count:number;declared_global_rows:number;declared_row_scope:'global-not-us';failed_status:'FAILED';snapshot_ready:false;resumable:false;journal:{requests_reserved:number;completed_requests:number;pending_request_index:number;delivered_bytes:number};selected_output:{bytes:0;admissible:false};admission:{named_rows:0;state_rows:0;zip5_rows:0;category_counts_available:false;geocodes:0};acquisition_authorized:false;blockers:string[]};
const label=(value:string)=>value.replaceAll('-',' ');
export default function OvertureHeatmapReadiness(){
 const[view,setView]=useState<View|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();void runnerJson<View>('/api/overture-heatmap-readiness',{signal:controller.signal}).then(value=>{setView(value);setError(false);}).catch(reason=>{if(reason?.name!=='AbortError')setError(true);});return()=>controller.abort();},[]);
 return <section className="state-alignment-card overture-heatmap-readiness" aria-label="Overture metadata-only source readiness"><div><span>National source placeholder · no map layer</span><strong>Overture Places</strong></div>
  {error?<p className="entity-method-note" role="alert">Retained readiness evidence could not be verified. No Overture records are admitted.</p>:!view?<p className="entity-method-note">Verifying retained metadata and failed-operation evidence…</p>:<>
   <dl><div><dt>Admitted named / state / ZIP5 rows</dt><dd>{view.admission.named_rows} / {view.admission.state_rows} / {view.admission.zip5_rows}</dd></div><div><dt>Pinned metadata</dt><dd>{view.asset_count} assets · {view.declared_global_rows.toLocaleString()} global rows</dd></div><div><dt>Failed acquisition</dt><dd>{view.failed_status} · not resumable</dd></div><div><dt>Journal</dt><dd>{view.journal.completed_requests}/{view.journal.requests_reserved} complete · pending {view.journal.pending_request_index}</dd></div></dl>
   <p className="entity-method-note">Release {view.release_id}, observed {view.observed_at.slice(0,10)}. The declared row count is global, not U.S. The retained selected output is {view.selected_output.bytes} bytes, so no names, categories, state assignments, ZIP5 rows, or geocodes are available to this Heatmap.</p>
   <details><summary>Why this source is not a layer</summary><ul>{view.blockers.map(item=><li key={item}>{label(item)}</li>)}</ul><p className="entity-method-note">No acquisition or retry control is exposed here.</p></details>
  </>}
 </section>;
}
