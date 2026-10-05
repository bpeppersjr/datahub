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

export default function Administration() {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<View>("/api/administration/industries", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setView(value);
          setSelected(value.maintainedIndustries);
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
        <p className="operations-note">{view.semantics}</p>
      </>}
    </section>
  );
}
