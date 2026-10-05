"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type Industry = { id: string; label: string };
type View = {
  industries: Industry[];
  maintainedIndustries: string[];
  semantics: string;
  revision: number;
};
type Backlog = {schema_version:"state-access-maintenance-backlog@1.0.0";maintained_industries:string[];total_attention_cells:number;batch_limit:10;next_batch:Array<{state:string;industry:string;access_status:string;temporal_status:string;issue_codes:string[]}>;remaining_after_batch:number;claims:{acquisition_authorized:false;dispatch_performed:false;production_change:false;business_completeness:null}};

export default function Administration() {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backlog,setBacklog]=useState<Backlog|null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<View>("/api/administration/industries", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setView(value);
          setSelected(value.maintainedIndustries);
          void runnerJson<Backlog>("/api/administration/industry-backlog",{signal:controller.signal}).then(next=>!controller.signal.aborted&&setBacklog(next)).catch(()=>{});
        }
      })
      .catch(() => !controller.signal.aborted && setError(true));
    return () => controller.abort();
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const value = await runnerJson<View>("/api/administration/industries", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": `"${view?.revision ?? -1}"` },
        body: JSON.stringify({ maintainedIndustries: selected, expectedRevision: view?.revision ?? -1 }),
      });
      setView(value);
      setSelected(value.maintainedIndustries);
      setMessage("Maintenance selection saved locally.");
      try{setBacklog(await runnerJson<Backlog>("/api/administration/industry-backlog"));}catch{setBacklog(null);}
    } catch {
      setMessage("Unable to save maintenance selection. Existing settings were preserved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel focused-workspace administration-workspace">
      <div className="workspace-heading"><div><span className="section-kicker">Local application settings</span><h2>Administration</h2></div><p>Choose which industry programs Co*Tive should maintain.</p></div>
      <p className="scope-note">This selection records local maintenance intent only. It does not authorize acquisition, start downloads, prove coverage, or change production enrollment.</p>
      {error && <p role="alert">Administration settings are unavailable. No selection was inferred.</p>}
      {!view && !error && <p role="status">Loading maintained industries…</p>}
      {view && <>
        <div className="administration-actions">
          <button type="button" onClick={() => setSelected(view.industries.map(({ id }) => id))}>Select all</button>
          <button type="button" onClick={() => setSelected([])}>Select none</button>
          <span>{selected.length} of {view.industries.length} selected</span>
        </div>
        <div className="maintenance-grid" role="group" aria-label="Industries selected for maintenance">
          {view.industries.map((industry) => {
            const checked = selected.includes(industry.id);
            return <label key={industry.id} className={checked ? "maintained" : "not-maintained"}>
              <input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== industry.id) : [...current, industry.id])}/>
              <span><strong>{industry.label}</strong><small>{checked ? "Enabled for maintenance planning" : "Not selected for maintenance"}</small></span>
            </label>;
          })}
        </div>
        <button className="primary-button" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save maintenance selection"}</button>
        {message && <p role="status">{message}</p>}
        {backlog&&<section className="maintenance-backlog" aria-label="Maintained industry attention backlog"><h3>Next maintenance review batch</h3><p>{backlog.total_attention_cells} selected industry/state cells need access or temporal review. The first {backlog.next_batch.length} are shown; {backlog.remaining_after_batch} remain.</p>{backlog.next_batch.length?<ol>{backlog.next_batch.map(row=><li key={`${row.industry}:${row.state}`}><strong>{row.state} · {row.industry.replaceAll("-"," ")}</strong><span>{row.issue_codes.map(code=>code.replaceAll("-"," ")).join(" · ")}</span></li>)}</ol>:<p>No selected industry currently has an access or temporal-review item. An empty selection does not imply complete coverage.</p>}<p className="operations-note">This deterministic batch is planning evidence only. It does not authorize acquisition, dispatch workers, change production, or measure business completeness.</p></section>}
        <p className="operations-note">{view.semantics}</p>
      </>}
    </section>
  );
}
