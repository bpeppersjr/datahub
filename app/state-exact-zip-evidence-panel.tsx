"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

const RAW = ["positive","measured-zero","outside-source-denominator","absent-from-retained-source-rows","unavailable","measured-positive","not-published-for-zip","outside-zbp-zcta-evidence-union","retained-linkage-evidence","no-resolution-decision"] as const;
const EVIDENCE = ["evidence-present","measured-zero","source-did-not-publish-for-zip","outside-source-evidence-union","outside-source-denominator","absent-from-retained-source-rows","unavailable"] as const;
const LIFE = ["source-defined-current-positive-within-review-window","source-defined-current-without-positive-evidence","non-active-reporting-positive","non-active-reporting-without-positive-evidence","annual-aggregate-evidence-present","annual-aggregate-source-unmeasured","stale","unmeasured","unmapped","publisher-active-snapshot-positive","publisher-active-snapshot-measured-zero","unknown-source-status","source-defined-current-membership","outside-source-denominator"] as const;
type Counts = Record<string, number>;
type Dimension = { dimension_id: string; raw_status_counts: Counts; derived_evidence_status_counts: Counts; lifecycle_status_counts: Counts; count_sum: number };
type View = {
  schema_version: "state-exact-zip-industry-evidence-disposition@3.0.0"; status: "present"; scope_id: string;
  release_id: string; manifest_sha256: string; artifact_sha256: string; source_bytes_read: number; full_matrix_replay_performed: false;
  geography_scope_counts: { state: number; territory: number; "multi-state-material": number; "zcta-overlay-unresolved": number; "non-zcta-unassigned": number; "explicit-placeholder": number };
  raw_status_vocabulary: string[]; derived_evidence_status_vocabulary: string[]; lifecycle_status_vocabulary: string[];
  row: { scope_id: string; scope_label: string; state_fips: string; state_name: string; postal_abbreviation: string; zip5_rows: number; dimensions: Record<string, Dimension> };
  claims: { current_operations_verified: false; unique_business_count: null; current_operating_business_count: null; production_enrollment: false; network_requests: 0; current_pointer_written: false } & Record<string, unknown>;
};

const count = (value: number) => value.toLocaleString("en-US");
const keysExactly = (value: object, expected: readonly string[]) => Object.keys(value).sort().join("|") === [...expected].sort().join("|");
const validCounts = (value: unknown, expected: readonly string[], total: number) => !!value && typeof value === "object" && !Array.isArray(value) && keysExactly(value, expected) && Object.values(value).every(item => Number.isSafeInteger(item) && (item as number) >= 0) && Object.values(value).reduce<number>((sum,item)=>sum+(item as number),0)===total;
const exactVocabulary = (value: unknown, expected: readonly string[]) => Array.isArray(value) && value.join("|") === expected.join("|");

export function validStateExactZipEvidence(value: unknown, state: string): value is View {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const view=value as Partial<View>;
  if(!keysExactly(view,["schema_version","status","scope_id","row","geography_scope_counts","raw_status_vocabulary","derived_evidence_status_vocabulary","lifecycle_status_vocabulary","release_id","manifest_sha256","artifact_sha256","source_bytes_read","full_matrix_replay_performed","claims"])
    ||view.schema_version!=="state-exact-zip-industry-evidence-disposition@3.0.0"||view.status!=="present"||!/^state:\d{2}$/.test(view.scope_id??"")||view.full_matrix_replay_performed!==false
    ||!/^[a-f0-9]{64}$/.test(view.manifest_sha256??"")||!/^[a-f0-9]{64}$/.test(view.artifact_sha256??"")||!Number.isSafeInteger(view.source_bytes_read)||(view.source_bytes_read??0)<=0
    ||!exactVocabulary(view.raw_status_vocabulary,RAW)||!exactVocabulary(view.derived_evidence_status_vocabulary,EVIDENCE)||!exactVocabulary(view.lifecycle_status_vocabulary,LIFE)
    ||!view.row||!keysExactly(view.row,["scope_id","scope_label","state_fips","state_name","postal_abbreviation","zip5_rows","dimensions"])||view.row.scope_id!==view.scope_id||view.row.postal_abbreviation!==state||!Number.isSafeInteger(view.row.zip5_rows)||(view.row.zip5_rows??-1)<0
    ||!view.claims||view.claims.current_operations_verified!==false||view.claims.unique_business_count!==null||view.claims.current_operating_business_count!==null||view.claims.production_enrollment!==false||view.claims.network_requests!==0||view.claims.current_pointer_written!==false
    ||!view.geography_scope_counts||!keysExactly(view.geography_scope_counts,["state","territory","multi-state-material","zcta-overlay-unresolved","non-zcta-unassigned","explicit-placeholder"]))return false;
  const scopes=Object.values(view.geography_scope_counts);if(!scopes.every(item=>Number.isSafeInteger(item)&&item>=0)||scopes.reduce((sum,item)=>sum+item,0)!==48194)return false;
  const dimensions=Object.values(view.row.dimensions??{});if(dimensions.length!==51||new Set(dimensions.map(item=>item.dimension_id)).size!==51)return false;
  return dimensions.every(item=>keysExactly(item,["dimension_id","raw_status_counts","derived_evidence_status_counts","lifecycle_status_counts","count_sum"])&&Number.isSafeInteger(item.count_sum)&&item.count_sum>=0&&validCounts(item.raw_status_counts,RAW,view.row!.zip5_rows)&&validCounts(item.derived_evidence_status_counts,EVIDENCE,view.row!.zip5_rows)&&validCounts(item.lifecycle_status_counts,LIFE,view.row!.zip5_rows));
}

export default function StateExactZipEvidencePanel({state}:{state:string}){
  const[result,setResult]=useState<{state:string;view:View|null;failed:boolean}|null>(null);
  useEffect(()=>{if(!state)return;const controller=new AbortController(),requested=state;void runnerJson<unknown>(`/api/business-map/state-exact-zip-industry-evidence?state=${encodeURIComponent(state)}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){const valid=validStateExactZipEvidence(value,requested);setResult({state:requested,view:valid?value:null,failed:!valid});}}).catch(reason=>{if(!controller.signal.aborted&&reason?.name!=="AbortError")setResult({state:requested,view:null,failed:true});});return()=>controller.abort();},[state]);
  if(!state)return <section className="supporting-evidence" aria-label="State exact ZIP industry evidence"><h3>State exact-ZIP evidence</h3><p>Select a state to inspect its governed 51-dimension evidence cells.</p></section>;
  if(!result||result.state!==state)return <p role="status">Loading state exact-ZIP evidence…</p>;
  if(result.failed||!result.view)return <p role="alert">State exact-ZIP evidence is unavailable; no ZIP assignment, evidence count, or completion was inferred.</p>;
  const view=result.view,dimensions=Object.values(view.row.dimensions),totals=Object.fromEntries(EVIDENCE.map(status=>[status,dimensions.reduce((sum,row)=>sum+row.derived_evidence_status_counts[status],0)]));
  const current=(row:Dimension)=>row.lifecycle_status_counts["source-defined-current-positive-within-review-window"]+row.lifecycle_status_counts["source-defined-current-without-positive-evidence"]+row.lifecycle_status_counts["publisher-active-snapshot-positive"]+row.lifecycle_status_counts["publisher-active-snapshot-measured-zero"]+row.lifecycle_status_counts["source-defined-current-membership"];
  const nonActive=(row:Dimension)=>row.lifecycle_status_counts["non-active-reporting-positive"]+row.lifecycle_status_counts["non-active-reporting-without-positive-evidence"];
  const unresolved=(row:Dimension)=>row.lifecycle_status_counts.stale+row.lifecycle_status_counts.unmeasured+row.lifecycle_status_counts.unmapped+row.lifecycle_status_counts["unknown-source-status"];
  return <section className="supporting-evidence" aria-label="State exact ZIP industry evidence"><h3>{view.row.state_name} exact-ZIP source evidence</h3>
    <p><strong>{count(view.row.zip5_rows)}</strong> state-assigned Census ZCTA keys × <strong>51</strong> retained source dimensions = <strong>{count(view.row.zip5_rows*51)}</strong> source-specific evidence cells.</p>
    <p>Evidence present: {count(totals["evidence-present"])} · measured zero: {count(totals["measured-zero"])} · source did not publish: {count(totals["source-did-not-publish-for-zip"])} · outside source evidence: {count(totals["outside-source-evidence-union"])} · absent from retained rows: {count(totals["absent-from-retained-source-rows"])} · unavailable: {count(totals.unavailable)}.</p>
    <details><summary>All 51 source dimensions and lifecycle dispositions</summary><div className="representation-table" role="region" aria-label={`${state} exact ZIP source dimensions`} tabIndex={0}><table><thead><tr><th>Source dimension</th><th>Evidence present</th><th>Measured zero</th><th>Source-defined current / snapshot</th><th>Non-active reporting</th><th>Stale / unmeasured / unknown</th><th>Count sum</th></tr></thead><tbody>{dimensions.map(row=><tr key={row.dimension_id}><th scope="row">{row.dimension_id}</th><td>{count(row.derived_evidence_status_counts["evidence-present"])}</td><td>{count(row.derived_evidence_status_counts["measured-zero"])}</td><td>{count(current(row))}</td><td>{count(nonActive(row))}</td><td>{count(unresolved(row))}</td><td>{count(row.count_sum)}</td></tr>)}</tbody></table></div></details>
    <p><strong>National keys intentionally not assigned to a state:</strong> {count(view.geography_scope_counts["multi-state-material"])} material multi-state ZCTAs · {count(view.geography_scope_counts["zcta-overlay-unresolved"])} unresolved ZCTA overlays · {count(view.geography_scope_counts["non-zcta-unassigned"])} non-ZCTA keys · {count(view.geography_scope_counts["explicit-placeholder"])} explicit placeholder. Territories ({count(view.geography_scope_counts.territory)}) remain separate.</p>
    <p className="operations-note">Raw source status, derived evidence readiness, and lifecycle qualification remain separate. Counts describe retained source evidence cells—not unique businesses, all-business completeness, or verified current operation. State assignment is Census polygon based and is not USPS ZIP validity or business-location inference. Dimensions overlap and are not additive.</p>
  </section>;
}
