"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";
import registration from "../config/datasets/us-census-non-zcta-state-residual-release.json";

const directions = ["northwest", "north", "northeast", "west", "central", "east", "southwest", "south", "southeast"] as const;
type ReferenceAreas = {
  method: "component-bounds-midpoint-state-bounds-thirds@1.0.0";
  component_count: number;
  direction_counts: Record<string, number>;
  direction: string;
  offset: number;
  page_size: 100;
  selected_count: number;
  next_offset: number | null;
  rows: Array<{ id: string; label: string; direction: string; reference_bounds: number[] }>;
  semantics: string;
};
type View = {
  schema_version: "us-census-non-zcta-state-residual-view@1.0.0";
  ready: true;
  available: true;
  status: "verified-state-equivalent-residual-release";
  release: { release_id: string; manifest_sha256: string; state_artifacts: 56; publication_mode: string };
  state: { state_abbreviation: string; state_name: string; artifact_sha256: string } | null;
  reference_areas: ReferenceAreas | null;
  claims: { zip_completion: false; population: null; business_count: null; park_status: null; tribal_status: null; private_land_status: null; existing_map_blocked: false; zip_or_postal_geography: false };
};
const exact = (value: unknown, keys: string[]) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000;
export function validResidualReferenceView(input: unknown, state: string, offset: number, direction: string): input is View {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const v = input as View;
  if (v.schema_version !== "us-census-non-zcta-state-residual-view@1.0.0" || v.ready !== true || v.available !== true || v.status !== "verified-state-equivalent-residual-release" || !v.release || v.release.release_id !== registration.retained_release.release_id || v.release.manifest_sha256 !== registration.retained_release.manifest_sha256 || v.release.state_artifacts !== 56 || !exact(v.claims, ["zip_completion", "population", "business_count", "park_status", "tribal_status", "private_land_status", "existing_map_blocked", "zip_or_postal_geography"]) || ["zip_completion", "existing_map_blocked", "zip_or_postal_geography"].some(key => v.claims[key as keyof View["claims"]] !== false) || ["population", "business_count", "park_status", "tribal_status", "private_land_status"].some(key => v.claims[key as keyof View["claims"]] !== null)) return false;
  if (!state) return v.state === null && v.reference_areas === null;
  const a = v.reference_areas;
  if (Array.isArray(a?.rows) && a.rows.some(row => !row || typeof row !== "object")) return false;
  if (v.state?.state_abbreviation !== state || typeof v.state.state_name !== "string" || !/^[a-f0-9]{64}$/.test(v.state.artifact_sha256) || !exact(a, ["method", "component_count", "direction_counts", "direction", "offset", "page_size", "selected_count", "next_offset", "rows", "semantics"]) || !a || a.method !== "component-bounds-midpoint-state-bounds-thirds@1.0.0" || a.direction !== direction || a.offset !== offset || a.page_size !== 100 || !count(a.component_count) || !count(a.selected_count) || !exact(a.direction_counts, [...directions]) || !Object.values(a.direction_counts).every(count) || Object.values(a.direction_counts).reduce((sum, n) => sum + n, 0) !== a.component_count || a.selected_count !== (direction === "all" ? a.component_count : a.direction_counts[direction]) || !Array.isArray(a.rows) || a.rows.length !== Math.min(100, Math.max(0, a.selected_count - offset)) || a.next_offset !== (offset + a.rows.length < a.selected_count ? offset + a.rows.length : null) || typeof a.semantics !== "string" || new Set(a.rows.map(row => row.id)).size !== a.rows.length) return false;
  return a.rows.every(row => exact(row, ["id", "label", "direction", "reference_bounds"]) && typeof row.id === "string" && new RegExp(`^${state}-unresolved-[a-f0-9]{64}$`).test(row.id) && directions.includes(row.direction as typeof directions[number]) && (direction === "all" || row.direction === direction) && row.label === `${v.state!.state_name} · ${row.direction} · unresolved area ${row.id.slice(-64, -52)}` && Array.isArray(row.reference_bounds) && row.reference_bounds.length === 4 && row.reference_bounds.every(Number.isFinite) && row.reference_bounds[0] <= row.reference_bounds[2] && row.reference_bounds[1] <= row.reference_bounds[3] && row.reference_bounds[0] >= 0 && row.reference_bounds[2] <= 720 && row.reference_bounds[1] >= -90 && row.reference_bounds[3] <= 90);
}

export default function CensusZctaResidualLayer({ state }: { state: string }) {
  const [selection, setSelection] = useState({ state, direction: "all", offset: 0 });
  const direction = selection.state === state ? selection.direction : "all", offset = selection.state === state ? selection.offset : 0;
  const key = `${state}:${direction}:${offset}`;
  const [result, setResult] = useState<{ key: string; view: View | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams();
    if (state) { params.set("state", state); params.set("direction", direction); params.set("offset", String(offset)); }
    void runnerJson<unknown>(`/api/business-map/census-zcta-residual${params.size ? `?${params}` : ""}`, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ key, view: validResidualReferenceView(value, state, offset, direction) ? value : null, failed: !validResidualReferenceView(value, state, offset, direction) });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, view: null, failed: true }); });
    return () => controller.abort();
  }, [state, direction, offset, key]);
  const current = result?.key === key ? result : null, view = current?.view, areas = view?.reference_areas;
  return <section className="supporting-evidence" aria-label="Census residual geography readiness">
    <strong>Residual geography readiness</strong>
    <p className="operations-note">The verified optional context release identifies area outside selected 2020 Census ZCTA polygons by state. Dedicated or private ZIPs may have no population record. Residual land may include parks, Native or tribal areas, private property, water, or other unpopulated space. A park match is unavailable in the retained overlays; classifications remain unresolved. This is not ZIP/postal geography, a Native/tribal or private-land classification, an unpopulated-area claim, a business gap, or ZIP completion. Missing population, ZIP geometry, business geocodes, and industry coverage do not block the map or status.</p>
    {current?.failed ? <p role="status">Residual context is unavailable or incompatible. The state/ZCTA map remains available.</p> : !view ? <p role="status">Checking residual geography readiness…</p> : !areas ? <p role="status">Verified for all 56 Census state equivalents. Select a state to inspect its uniquely labeled unresolved areas.</p> : <>
      <h4>{view.state?.state_name} unresolved areas</h4>
      <p>{areas.component_count.toLocaleString()} retained polygon components have state-scoped reference labels. Park, tribal, private-property, population and business status remain unresolved.</p>
      <label>Reference direction <select aria-label="Unresolved area reference direction" value={direction} onChange={event => setSelection({ state, direction: event.target.value, offset: 0 })}><option value="all">All directions ({areas.component_count.toLocaleString()})</option>{directions.map(value => <option key={value} value={value}>{value} ({areas.direction_counts[value].toLocaleString()})</option>)}</select></label>
      <p className="operations-note">{areas.semantics}</p>
      <details><summary>Unresolved area labels and placement ({areas.selected_count.toLocaleString()})</summary>
        <p>Showing {areas.rows.length ? offset + 1 : 0}–{offset + areas.rows.length} of {areas.selected_count.toLocaleString()} areas. Longitude bounds use the state’s antimeridian-aware reference frame.</p>
        <div className="representation-table" role="region" aria-label="State unresolved area reference labels" tabIndex={0}><table><thead><tr><th scope="col">Area label</th><th scope="col">Reference bounds (longitude; latitude)</th></tr></thead><tbody>{areas.rows.map(row => <tr key={row.id}><th scope="row">{row.label}<small><code>{row.id}</code></small></th><td>{row.reference_bounds.map(value => value.toFixed(5)).join("; ")}</td></tr>)}</tbody></table></div>
        <button type="button" disabled={offset === 0} onClick={() => setSelection({ state, direction, offset: Math.max(0, offset - 100) })}>Previous areas</button>{" "}<button type="button" disabled={areas.next_offset === null} onClick={() => setSelection({ state, direction, offset: areas.next_offset ?? offset })}>Next areas</button>
      </details>
      <small>Derived from retained artifact SHA-256 {view.state?.artifact_sha256}. Labels remain stable for this source geometry and do not assign businesses or ZIPs to an area.</small>
    </>}
  </section>;
}
