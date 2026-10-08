"use client";
/* eslint-disable react-hooks/set-state-in-effect -- synchronous null-key clearing prevents stale ZIP evidence */

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";
import CensusZbpIndustryHeatmap from "./census-zbp-industry-heatmap";
import CensusNonemployerCountyHeatmap from "./census-nonemployer-county-heatmap";
import { StateAvailabilityChoropleth } from "./business-intelligence";
import { RetainedCountyWorkspace } from "./retained-county-panel";
import ZipEvidenceQualificationPanel from "./zip-evidence-qualification-panel";
import type { QualificationView } from "./zip-evidence-qualification-panel";
import CensusZbpZipProfile, {
  type CensusZbpZipProfileView,
} from "./census-zbp-zip-profile";
import ZipSourceNativeStatus, {
  type SourceNativeStatusView,
} from "./zip-source-native-status";
import childcareRegistration from "../config/datasets/retained-childcare-zip-evidence.json";
import CensusZctaResidualLayer from "./census-zcta-residual-layer";
import NonZctaGeographyStatus from "./non-zcta-geography-status";
import StateExactZipEvidencePanel from "./state-exact-zip-evidence-panel";
import StateExactZipEvidenceMap from "./state-exact-zip-evidence-map";
import zipSourceStatusRegistration from "../config/datasets/zip-source-native-status-distribution.json";
import NonZctaSourceGeographyContext from "./non-zcta-source-geography-context";
import stateAccessEnrollment from "../config/state-access-ui-enrollment.json";

export const workspaceTabs = [
  "State Evidence",
  "Industry Summary",
  "ZIP Economics",
  "Demographic GDP",
  "Administration",
  "Operations",
] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];
const workspaceTabDetails: Record<
  WorkspaceTab,
  { description: string; number: string }
> = {
  "State Evidence": {
    number: "01",
    description: "Retained evidence by state",
  },
  "Industry Summary": {
    number: "02",
    description: "Industry reach and connectivity",
  },
  "ZIP Economics": {
    number: "03",
    description: "ZIP total and segment GDP",
  },
  "Demographic GDP": {
    number: "04",
    description: "National and ZIP cross-views",
  },
  Administration: { number: "05", description: "Maintained industry settings" },
  Operations: { number: "06", description: "Jobs, evidence, and connectors" },
};
export function WorkspaceTabs({
  value,
  onChange,
}: {
  value: WorkspaceTab;
  onChange: (value: WorkspaceTab) => void;
}) {
  return (
    <div
      className="workspace-tabs"
      role="tablist"
      aria-label="Collector workspaces"
    >
      {workspaceTabs.map((name, index) => (
        <button
          key={name}
          id={`workspace-tab-${index}`}
          role="tab"
          aria-selected={value === name}
          aria-controls="workspace-panel"
          tabIndex={value === name ? 0 : -1}
          onClick={() => onChange(name)}
          onKeyDown={(event) => {
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? workspaceTabs.length - 1
                  : event.key === "ArrowRight"
                    ? (index + 1) % workspaceTabs.length
                    : event.key === "ArrowLeft"
                      ? (index + workspaceTabs.length - 1) %
                        workspaceTabs.length
                      : null;
            if (next !== null) {
              event.preventDefault();
              onChange(workspaceTabs[next]);
              document.getElementById(`workspace-tab-${next}`)?.focus();
            }
          }}
        >
          <span className="workspace-tab-number" aria-hidden="true">
            {workspaceTabDetails[name].number}
          </span>
          <span className="workspace-tab-copy">
            <strong>{name}</strong>
            <small>{workspaceTabDetails[name].description}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
export const operationsTabs = [
  "Jobs",
  "Collection",
  "Evidence",
  "Connectors",
] as const;
export type OperationsTab = (typeof operationsTabs)[number];
export function OperationsTabs({
  value,
  onChange,
}: {
  value: OperationsTab;
  onChange: (value: OperationsTab) => void;
}) {
  return (
    <div
      className="workspace-tabs operations-tabs"
      role="tablist"
      aria-label="Operations views"
    >
      {operationsTabs.map((name, index) => (
        <button
          key={name}
          id={`operations-tab-${index}`}
          role="tab"
          aria-selected={value === name}
          aria-controls="operations-panel"
          tabIndex={value === name ? 0 : -1}
          onClick={() => onChange(name)}
          onKeyDown={(event) => {
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? operationsTabs.length - 1
                  : event.key === "ArrowRight"
                    ? (index + 1) % operationsTabs.length
                    : event.key === "ArrowLeft"
                      ? (index + operationsTabs.length - 1) %
                        operationsTabs.length
                      : null;
            if (next !== null) {
              event.preventDefault();
              onChange(operationsTabs[next]);
              document.getElementById(`operations-tab-${next}`)?.focus();
            }
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

type MatrixRow = {
  code: string;
  name: string;
  available: number;
  measured: number;
  unmeasured: number;
  denominator: number;
  percent: number | null;
  measurement_status: string;
  broad_layer_gap: boolean;
};
type ScopeComparison = {
  available: boolean;
  denominator_version: string | null;
  configuration: null | { path: string; version: number; sha256: string };
  catalog: null | {
    path: string;
    schema_version: string;
    denominator_version: string;
    predecessor_sha256: string;
  };
  industries: null | Array<{
    id: string;
    sources: Array<{
      id: string;
      scope: string;
      publisher_states: string[] | "all";
      manual_selection_required: boolean;
    }>;
  }>;
};
type AdjacentEvidence = {
  dataset_id: string;
  evidence_kind: string;
  included_in_broad_layer: false;
  included_in_dataset_availability: false;
  release_id: string;
  source_release_id: string;
  source_date: string;
  state: string;
  row_semantics: string;
  organization_count: number;
  record_zcta_count: number;
  record_nonpolygon_count: number;
  limitations: string[];
};
type BroadGapAdjacentEvidence = {
  evidence_id: string;
  label: string;
  evidence_kind: string;
  record_count: number;
  row_unit: string;
  provenance: {
    release_id: string;
    source_release_id: string;
    manifest_sha256: string;
  };
  source_reference: {
    status: "reported" | "unknown";
    field: string | null;
    value: string | null;
  };
  temporal_limitation: string;
  current_operation_verified: false;
  geography_scope: string;
  authority: {
    retained_offline_use_authorized: true;
    acquisition_authorized: false;
    broad_layer_admission_authorized: false;
    production_pointer_change_authorized: false;
    export_policy: string;
  };
  coverage_limitations: string[];
};
export type BroadGapAdjacentView = {
  schema_version: "broad-organization-adjacent-evidence-view@1.0.0";
  available: true;
  release_id: string;
  manifest_sha256: string;
  summary: {
    broad_layer_gap_jurisdictions: number;
    jurisdictions_with_retained_adjacent_evidence: number;
    jurisdictions_without_retained_adjacent_evidence: number;
    retained_evidence_items: number;
    broad_layer_gaps_closed: 0;
  };
  selected: {
    code: string;
    name: string;
    broad_layer_gap: true;
    broad_layer_status: "unmeasured";
    adjacent_evidence_status:
      "retained-adjacent-evidence" | "no-retained-adjacent-evidence";
    evidence_count: number;
    evidence: BroadGapAdjacentEvidence[];
    limitations: string[];
  } | null;
  claims: {
    network_requests: 0;
    acquisition_performed: false;
    current_pointer_written: false;
    production_enrollment: false;
    broad_layer_gap_preserved: true;
    active_business_count: null;
    all_business_completeness_percent: null;
  };
};
type CompletionCounts = {
  available: number;
  measured: number;
  unmeasured: number;
  expected: number;
  missing_or_unknown?: number;
  denominator_percent?: number | null;
  measured_only_percent?: number | null;
  states?: number;
  states_fully_available?: number;
  states_with_missing_or_unknown?: number;
  measure?: string;
};
type CategorySummary = {
  category_id: string;
  national: CompletionCounts;
  selected_state:
    | null
    | (CompletionCounts & {
        code: string;
        name: string;
        measurement_status: string;
      });
};
type Matrix = {
  available: boolean;
  status: string;
  release_id: string | null;
  denominator?: { version: string };
  categories?: string[];
  category_summaries?: CategorySummary[];
  scope_comparison?: ScopeComparison;
  jurisdictions: MatrixRow[];
  overall_jurisdictions?: MatrixRow[];
  selected: null | {
    code: string;
    category: {
      datasets: Array<{
        dataset_id: string;
        label: string;
        availability_status: string;
        state_record_count: number | null;
        gap_reason: string | null;
      }>;
    };
    adjacent_evidence?: AdjacentEvidence[];
  };
};
type Shares = {
  available: boolean;
  categories: Array<{ id: string; label: string }>;
  national_category_counts: Record<string, number>;
  national_category_percent_of_collected_evidence: Record<
    string,
    number | null
  >;
  states: Array<{
    postal_abbreviation: string;
    state_name: string;
    category_counts: Record<string, number>;
    percent_of_category_nationwide: Record<string, number | null>;
  }>;
};
type MaintenanceIntentView={industries:Array<{id:string;label:string}>;maintainedIndustries:string[];revision:number;semantics:string};
const operationalIndustryIds=['childcare','construction','financial-services','health-care','local-business-licenses','retail-consumer','sales-tax-outlets','tax-exempt-organizations','transportation'] as const;
const operationalStates=['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'] as const;
const operationalAccessStatuses=['direct-state-publisher','local-publisher-substate-evidence','national-dataset-state-evidence','unsupported-evidence-not-measured','unsupported-missing'] as const;
const operationalTemporalStatuses=['missing-source-reference','no-positive-count-evidence','review-due','within-review-window'] as const;
type OperationalSource={source_key:string;source_release_id:string|null;source_reference_at:string|null;review_due_date:string|null;evidence_scope:string;publisher_currency_basis:string|null;retained_observed_at:string|null};
type OperationalState={state:string;access_status:string;temporal_status:string;source_keys:string[];sources:OperationalSource[]};
type OperationalIndustryEvidence={schema_version:"state-access-industry-summary@1.3.0";report_sha256:string;jurisdictions:51;industry_cells:459;industries:Array<{id:string;jurisdictions:51;jurisdictions_with_retained_access_evidence:number;retained_access_evidence_percent:number;access_status_counts:Record<string,number>;temporal_status_counts:Record<string,number>;states:OperationalState[]}>;claims:{active_business_count:null;nationwide_industry_completeness:null;complete_geocodes:false;maintenance_selection_affects_evidence:false}};
function validMaintenanceIntent(input:unknown):input is MaintenanceIntentView{if(!exactKeys(input,['industries','maintainedIndustries','revision','semantics']))return false;const value=input as MaintenanceIntentView,ids=Array.isArray(value.industries)?value.industries.map(item=>item?.id).sort():[];return Array.isArray(value.industries)&&value.industries.every(item=>exactKeys(item,['id','label'])&&typeof item.id==='string'&&typeof item.label==='string')&&ids.length===9&&ids.every((id,index)=>id===operationalIndustryIds[index])&&Array.isArray(value.maintainedIndustries)&&new Set(value.maintainedIndustries).size===value.maintainedIndustries.length&&value.maintainedIndustries.every(id=>operationalIndustryIds.includes(id as typeof operationalIndustryIds[number]))&&Number.isSafeInteger(value.revision)&&value.revision>=0&&typeof value.semantics==='string';}
export function validOperationalIndustryEvidence(input:unknown):input is OperationalIndustryEvidence{if(!exactKeys(input,['schema_version','report_sha256','jurisdictions','industry_cells','industries','claims']))return false;const value=input as OperationalIndustryEvidence,nonnegative=(item:unknown)=>Number.isSafeInteger(item)&&Number(item)>=0,percent=(item:unknown)=>typeof item==='number'&&Number.isFinite(item)&&item>=0&&item<=100;if(value.schema_version!=='state-access-industry-summary@1.3.0'||value.report_sha256!==stateAccessEnrollment.reportSha256||value.jurisdictions!==51||value.industry_cells!==459||!exactKeys(value.claims,['active_business_count','nationwide_industry_completeness','complete_geocodes','maintenance_selection_affects_evidence'])||!sameClosed(value.claims,{active_business_count:null,nationwide_industry_completeness:null,complete_geocodes:false,maintenance_selection_affects_evidence:false})||!Array.isArray(value.industries)||value.industries.length!==9)return false;const ids=value.industries.map(row=>row?.id).sort();if(new Set(ids).size!==9||!ids.every((id,index)=>id===operationalIndustryIds[index]))return false;return value.industries.every(row=>{if(!exactKeys(row,['id','jurisdictions','access_status_counts','temporal_status_counts','states','jurisdictions_with_retained_access_evidence','retained_access_evidence_percent'])||row.jurisdictions!==51||!exactKeys(row.access_status_counts,[...operationalAccessStatuses])||!exactKeys(row.temporal_status_counts,[...operationalTemporalStatuses])||!Object.values(row.access_status_counts).every(nonnegative)||!Object.values(row.temporal_status_counts).every(nonnegative)||Object.values(row.access_status_counts).reduce((sum,item)=>sum+item,0)!==51||Object.values(row.temporal_status_counts).reduce((sum,item)=>sum+item,0)!==51||!Array.isArray(row.states)||row.states.length!==51||new Set(row.states.map(item=>item?.state)).size!==51||!operationalStates.every(state=>row.states.some(item=>item.state===state))||!nonnegative(row.jurisdictions_with_retained_access_evidence)||!percent(row.retained_access_evidence_percent))return false;const retained=row.access_status_counts['direct-state-publisher']+row.access_status_counts['local-publisher-substate-evidence']+row.access_status_counts['national-dataset-state-evidence'];if(row.jurisdictions_with_retained_access_evidence!==retained||row.retained_access_evidence_percent!==Number((retained/51*100).toFixed(1)))return false;const access=Object.fromEntries(operationalAccessStatuses.map(status=>[status,0])),temporal=Object.fromEntries(operationalTemporalStatuses.map(status=>[status,0]));for(const state of row.states){if(!exactKeys(state,['state','access_status','temporal_status','source_keys','sources'])||!operationalStates.includes(state.state as typeof operationalStates[number])||!operationalAccessStatuses.includes(state.access_status as typeof operationalAccessStatuses[number])||!operationalTemporalStatuses.includes(state.temporal_status as typeof operationalTemporalStatuses[number])||!Array.isArray(state.source_keys)||state.source_keys.some(key=>typeof key!=='string')||new Set(state.source_keys).size!==state.source_keys.length||!Array.isArray(state.sources))return false;access[state.access_status]+=1;temporal[state.temporal_status]+=1;const sourceKeys=new Set<string>();for(const source of state.sources){if(!exactKeys(source,['source_key','source_release_id','source_reference_at','review_due_date','evidence_scope','publisher_currency_basis','retained_observed_at'])||typeof source.source_key!=='string'||!source.source_key||source.source_release_id!==null&&typeof source.source_release_id!=='string'||source.source_reference_at!==null&&typeof source.source_reference_at!=='string'||source.review_due_date!==null&&typeof source.review_due_date!=='string'||typeof source.evidence_scope!=='string'||source.publisher_currency_basis!==null&&typeof source.publisher_currency_basis!=='string'||source.retained_observed_at!==null&&typeof source.retained_observed_at!=='string')return false;sourceKeys.add(source.source_key);}if(sourceKeys.size!==state.source_keys.length||!state.source_keys.every(key=>sourceKeys.has(key)))return false;}return sameClosed(access,row.access_status_counts)&&sameClosed(temporal,row.temporal_status_counts);});}
export function OperationalMaintenanceIntent(){
  const[view,setView]=useState<MaintenanceIntentView|null>(null),[evidence,setEvidence]=useState<OperationalIndustryEvidence|null>(null),[intentError,setIntentError]=useState(false),[evidenceError,setEvidenceError]=useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setView(null); setEvidence(null); setIntentError(false); setEvidenceError(false);
    void runnerJson<unknown>("/api/administration/industries", {signal:controller.signal})
      .then(value => {
        if (controller.signal.aborted) return;
        if (validMaintenanceIntent(value)) setView(value);
        else setIntentError(true);
      }).catch(() => {if (!controller.signal.aborted) setIntentError(true);});
    void runnerJson<unknown>("/api/business-map/state-access-industry-summary", {signal:controller.signal})
      .then(value => {
        if (controller.signal.aborted) return;
        if (validOperationalIndustryEvidence(value)) setEvidence(value);
        else setEvidenceError(true);
      }).catch(() => {if (!controller.signal.aborted) setEvidenceError(true);});
    return () => controller.abort();
  }, []);
  const industries = view?.industries ?? operationalIndustryIds.map(id => ({id,label:id.replaceAll('-', ' ')}));
  return <section className="industry-summary" aria-label="Operational industry maintenance intent">
    <h4>Operational maintenance segments</h4>
    <p>Operational segment IDs are shown separately from retained source dimensions and reporting/map categories. Selection controls planning defaults only; historical evidence below remains visible and unchanged. Choose maintained industries in the Administration tab.</p>
    {intentError ? <p role="status">Maintenance intent is unavailable. No selection is inferred; reporting evidence remains visible.</p>
      : !view ? <p role="status">Loading local maintenance intent…</p> : null}
    <div className="maintenance-status-list">{industries.map(item => {
      const status = evidence?.industries.find(row => row.id === item.id);
      return <div key={item.id}>
        <strong>{item.label}</strong><code>{item.id}</code>
        <span className={view?.maintainedIndustries.includes(item.id) ? "status-succeeded" : "scope-note"}>
          {view ? view.maintainedIndustries.includes(item.id) ? "Selected for maintenance" : "Not selected for maintenance"
            : intentError ? "Maintenance selection unavailable" : "maintenance selection loading"}
        </span>
        {status ? <>
          <strong>{status.jurisdictions_with_retained_access_evidence > 0 ? "Evidence retained" : "Awaiting source evidence"}</strong>
          <small><strong>{status.retained_access_evidence_percent.toFixed(1)}%</strong> of jurisdictions ({status.jurisdictions_with_retained_access_evidence}/51) have any retained source-access evidence. This is not business completeness or a business count.</small>
          <small>Review summary: {status.temporal_status_counts['within-review-window']} within review window · {status.temporal_status_counts['review-due']} review due · {status.temporal_status_counts['missing-source-reference']} missing source reference · {status.temporal_status_counts['no-positive-count-evidence']} without positive count evidence.</small>
          <small>Retained evidence status: {operationalAccessStatuses.map(key => `${key.replaceAll('-', ' ')}: ${status.access_status_counts[key]}`).join(' · ')}</small>
          <small>Temporal status: {operationalTemporalStatuses.map(key => `${key.replaceAll('-', ' ')}: ${status.temporal_status_counts[key]}`).join(' · ')}</small>
          <details><summary>State evidence details for {item.label}</summary>
            <div className="representation-table" role="region" aria-label={`${item.label} state evidence details`} tabIndex={0}>
              <table><thead><tr><th scope="col">State</th><th scope="col">Access status</th><th scope="col">Temporal status</th><th scope="col">Retained source provenance</th></tr></thead>
                <tbody>{status.states.map(state => <tr key={state.state}>
                  <th scope="row">{state.state}</th><td>{state.access_status.replaceAll('-', ' ')}</td><td>{state.temporal_status.replaceAll('-', ' ')}</td>
                  <td>{state.sources.length ? state.sources.map(source => <span key={`${source.source_key}:${source.source_release_id ?? 'unresolved'}`}>
                    <code>{source.source_key}</code><small>release {source.source_release_id ?? 'unresolved'} · publisher reference {source.source_reference_at ?? 'unmeasured'} · publisher currency {source.publisher_currency_basis?.replaceAll('-', ' ') ?? 'unmeasured'} · retained observation {source.retained_observed_at ?? 'unmeasured'} · review due {source.review_due_date ?? 'unmeasured'} · {source.evidence_scope.replaceAll('-', ' ')}</small>
                  </span>) : <span>Unknown — no retained temporal source key</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </> : <small>{evidenceError ? 'Retained state evidence is unavailable or incompatible; unknown is preserved and no zero is inferred.' : 'Loading retained state evidence…'}</small>}
      </div>;
    })}</div>
    <p className="operations-note">Manual-only and unauthorized sources retain their own gates. Maintenance intent does not imply authorization or completeness. This source-access ledger stays separate from the governed exact-ZIP crosswalk below.</p>
  </section>;
}
type TemporalMatrix = {
  schema_version: "national-business-temporal-claim-matrix-view@1.2.0";
  available: true;
  scope: "effective-profile-classification-with-source-cohort-provenance";
  summary: {
    source_count: 30;
    source_cohort_counts: { source_defined_current_membership: 22; non_active_reporting_membership: 7; annual_aggregate: 1 };
    effective_profile_source_counts: { source_defined_current_membership: 21; non_active_reporting_membership: 7; annual_aggregate: 1; unknown_source_status: 1 };
    lifecycle_bound_sources: 15; classification_matches: 14; classification_mismatches: 1; mismatch_profiles: 633232;
    broad_state_dc_source_defined_active: 11;
    broad_state_dc_total: 51;
    broad_state_dc_gaps: 40;
    verified_current_complete_jurisdictions: 0;
    verified_current_complete_gaps: 51;
    active_business_count: null;
    completeness_percentage: null;
  };
  publisher_membership: { source_key: "la_active_business_location_accounts"; profile_source_id: "los-angeles-office-of-finance-active-businesses"; assertion: "active-list-membership-without-row-status"; profile_count: 633232; row_status: "null"; lifecycle_evidence: "unknown" };
  source_status_posture: { source_id: "cms-nppes-monthly-v2"; status: "source-defined-current-registration-status"; profile_count: 1958089; non_primary_reporting_count: 130691 };
  organization_assertion_status_posture: { source_id: "co-business-registry"; good_standing: { status: "source-defined-current-registry-standing"; organization_count: 1019372 }; delinquent: { status: "non-active-reporting"; organization_count: 1145439 } };
  mismatch: { source_key: "la_active_business_location_accounts"; profile_source_id: "los-angeles-office-of-finance-active-businesses"; source_release_id: string; source_cohort_classification: "source-defined-current-membership"; effective_profile_classification: "unknown-source-status"; lifecycle_evidence: "unknown"; profile_count: 633232; current_operations_verified: false };
  provenance: {
    temporal: { release_id: string; manifest_sha256: string; artifact_sha256: string; created_at: string; registry_release_id: string; registry_manifest_sha256: string; coverage_release_id: string; coverage_manifest_sha256: string };
    reconciliation: { registration_path: "config/datasets/national-business-temporal-lifecycle-reconciliation.json"; registration_sha256: string; schema_version: "national-business-temporal-lifecycle-reconciliation@1.0.0"; status: "one-bounded-profile-classification-conflict"; lifecycle_release_id: string; lifecycle_manifest_sha256: string; taxonomy_path: "config/datasets/business-entity-lifecycle-eligibility-taxonomy.json"; taxonomy_sha256: string; los_angeles_pointer_sha256: string; los_angeles_manifest_sha256: string };
    publisher_membership_reconciliation: { registration_path: string; registration_sha256: string; schema_version: "national-business-temporal-lifecycle-reconciliation@1.1.0"; source_artifact_sha256: string; source_summary_sha256: string };
    source_status_posture: { registration_path: "config/datasets/national-business-source-status-posture.json"; access_mode: "pointer-pinned-local-only"; pointer_sha256: string; manifest_sha256: string; taxonomy_sha256: string };
    organization_assertion_status_posture: { registration_path: "config/datasets/national-business-co-registration-status-posture.json"; scope: "separate-organization-assertion-cohort"; pointer_sha256: string; manifest_sha256: string; source_summary_sha256: string; taxonomy_sha256: string };
  };
  claims: {
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
    current_operations_verified: false;
    active_business_count: null;
    completeness_percentage: null;
  };
};
const percent = (value: number | null | undefined) =>
  value == null ? "Unmeasured" : `${value.toFixed(1)}%`;
const count = (value: number | null | undefined) =>
  value == null ? "Unmeasured" : value.toLocaleString();
const exactZipSourceMeasureValue = (cell: ExactZipCell): number | null => {
  switch (cell.status) {
    case "positive":
    case "measured-positive":
      return cell.count !== null && Number.isSafeInteger(cell.count) && cell.count > 0
        ? cell.count
        : null;
    case "measured-zero":
      return cell.count === 0 ? 0 : null;
    case "outside-source-denominator":
    case "absent-from-retained-source-rows":
      return null;
    default:
      return null;
  }
};
const CATEGORY_LABELS: Record<string, string> = {
  "general-business": "Broad state organization layer",
  "retail-consumer": "Retail and consumer",
  "health-care": "Health care",
  "financial-services": "Financial services",
  "tax-exempt-organizations": "Tax-exempt organizations",
  "regulated-meat-poultry-egg-establishments":
    "Regulated meat, poultry and egg establishments",
  "cross-industry-regulated-facilities": "Cross-industry regulated facilities",
  transportation: "Transportation",
};
const categoryLabel = (id: string) =>
  CATEGORY_LABELS[id] ?? id.replaceAll("-", " ");
const temporalHash = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const temporalExact=(value:unknown,keys:string[])=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join("|")===[...keys].sort().join("|");
export function validTemporalMatrix(value: unknown): value is TemporalMatrix {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as TemporalMatrix,
    s = view.summary,
    p = view.provenance,
    c = view.claims;
  return (
    temporalExact(view,["schema_version","available","scope","summary","publisher_membership","source_status_posture","organization_assertion_status_posture","mismatch","provenance","claims"])&&
    temporalExact(s,["source_count","source_cohort_counts","effective_profile_source_counts","lifecycle_bound_sources","classification_matches","classification_mismatches","mismatch_profiles","broad_state_dc_source_defined_active","broad_state_dc_total","broad_state_dc_gaps","verified_current_complete_jurisdictions","verified_current_complete_gaps","active_business_count","completeness_percentage"])&&
    temporalExact(s.source_cohort_counts,["source_defined_current_membership","non_active_reporting_membership","annual_aggregate"])&&temporalExact(s.effective_profile_source_counts,["source_defined_current_membership","non_active_reporting_membership","annual_aggregate","unknown_source_status"])&&
    temporalExact(view.publisher_membership,["source_key","profile_source_id","assertion","profile_count","row_status","lifecycle_evidence"])&&
    temporalExact(view.source_status_posture,["source_id","status","profile_count","non_primary_reporting_count"])&&
    temporalExact(view.organization_assertion_status_posture,["source_id","good_standing","delinquent"])&&temporalExact(view.organization_assertion_status_posture.good_standing,["status","organization_count"])&&temporalExact(view.organization_assertion_status_posture.delinquent,["status","organization_count"])&&
    temporalExact(view.mismatch,["source_key","profile_source_id","source_release_id","source_cohort_classification","effective_profile_classification","lifecycle_evidence","profile_count","current_operations_verified"])&&
    temporalExact(p,["temporal","reconciliation","publisher_membership_reconciliation","source_status_posture","organization_assertion_status_posture"])&&temporalExact(p.temporal,["release_id","manifest_sha256","artifact_sha256","created_at","registry_release_id","registry_manifest_sha256","coverage_release_id","coverage_manifest_sha256"])&&temporalExact(p.reconciliation,["registration_path","registration_sha256","schema_version","status","lifecycle_release_id","lifecycle_manifest_sha256","taxonomy_path","taxonomy_sha256","los_angeles_pointer_sha256","los_angeles_manifest_sha256"])&&
    temporalExact(p.publisher_membership_reconciliation,["registration_path","registration_sha256","schema_version","source_artifact_sha256","source_summary_sha256"])&&temporalHash(p.publisher_membership_reconciliation.registration_sha256)&&p.publisher_membership_reconciliation.schema_version==="national-business-temporal-lifecycle-reconciliation@1.1.0"&&temporalHash(p.publisher_membership_reconciliation.source_artifact_sha256)&&temporalHash(p.publisher_membership_reconciliation.source_summary_sha256)&&
    temporalExact(p.source_status_posture,["registration_path","access_mode","pointer_sha256","manifest_sha256","taxonomy_sha256"])&&p.source_status_posture.registration_path==="config/datasets/national-business-source-status-posture.json"&&p.source_status_posture.access_mode==="pointer-pinned-local-only"&&temporalHash(p.source_status_posture.pointer_sha256)&&temporalHash(p.source_status_posture.manifest_sha256)&&temporalHash(p.source_status_posture.taxonomy_sha256)&&
    temporalExact(p.organization_assertion_status_posture,["registration_path","scope","pointer_sha256","manifest_sha256","source_summary_sha256","taxonomy_sha256"])&&p.organization_assertion_status_posture.registration_path==="config/datasets/national-business-co-registration-status-posture.json"&&p.organization_assertion_status_posture.scope==="separate-organization-assertion-cohort"&&temporalHash(p.organization_assertion_status_posture.pointer_sha256)&&temporalHash(p.organization_assertion_status_posture.manifest_sha256)&&temporalHash(p.organization_assertion_status_posture.source_summary_sha256)&&temporalHash(p.organization_assertion_status_posture.taxonomy_sha256)&&
    temporalExact(c,["network_requests","current_pointer_written","production_enrollment","current_operations_verified","active_business_count","completeness_percentage"])&&
    view.schema_version ===
      "national-business-temporal-claim-matrix-view@1.2.0" &&
    view.available === true &&
    view.scope === "effective-profile-classification-with-source-cohort-provenance" &&
    !!s &&
    s.source_count === 30 &&
    s.source_cohort_counts?.source_defined_current_membership === 22 && s.source_cohort_counts.non_active_reporting_membership === 7 && s.source_cohort_counts.annual_aggregate === 1 &&
    s.effective_profile_source_counts?.source_defined_current_membership === 21 && s.effective_profile_source_counts.non_active_reporting_membership === 7 && s.effective_profile_source_counts.annual_aggregate === 1 && s.effective_profile_source_counts.unknown_source_status === 1 &&
    s.lifecycle_bound_sources === 15 && s.classification_matches === 14 && s.classification_mismatches === 1 && s.mismatch_profiles === 633232 &&
    s.broad_state_dc_source_defined_active === 11 &&
    s.broad_state_dc_total === 51 &&
    s.broad_state_dc_gaps === 40 &&
    s.verified_current_complete_jurisdictions === 0 &&
    s.verified_current_complete_gaps === 51 &&
    s.active_business_count === null &&
    s.completeness_percentage === null &&
    view.publisher_membership?.assertion === "active-list-membership-without-row-status" && view.publisher_membership.profile_count === 633232 && view.publisher_membership.row_status === "null" && view.publisher_membership.lifecycle_evidence === "unknown" &&
    view.source_status_posture?.source_id === "cms-nppes-monthly-v2" && view.source_status_posture.status === "source-defined-current-registration-status" && view.source_status_posture.profile_count === 1958089 && view.source_status_posture.non_primary_reporting_count === 130691 &&
    view.organization_assertion_status_posture?.source_id === "co-business-registry" && view.organization_assertion_status_posture.good_standing?.status === "source-defined-current-registry-standing" && view.organization_assertion_status_posture.good_standing.organization_count === 1019372 && view.organization_assertion_status_posture.delinquent?.status === "non-active-reporting" && view.organization_assertion_status_posture.delinquent.organization_count === 1145439 &&
    view.mismatch?.source_key === "la_active_business_location_accounts" && view.mismatch.profile_source_id === "los-angeles-office-of-finance-active-businesses" && view.mismatch.source_cohort_classification === "source-defined-current-membership" && view.mismatch.effective_profile_classification === "unknown-source-status" && view.mismatch.lifecycle_evidence === "unknown" && view.mismatch.profile_count === 633232 && view.mismatch.current_operations_verified === false &&
    !!p &&
    /^national-business-temporal-claim-matrix-[a-f0-9]{64}$/.test(
      p.temporal?.release_id,
    ) &&
    temporalHash(p.temporal.manifest_sha256) && temporalHash(p.temporal.artifact_sha256) && temporalHash(p.temporal.registry_manifest_sha256) && temporalHash(p.temporal.coverage_manifest_sha256) &&
    p.reconciliation?.registration_path === "config/datasets/national-business-temporal-lifecycle-reconciliation.json" && p.reconciliation.registration_sha256 === "8d772918c6f0bcf3ab664bc769f732a1c4941414bd1b5ce4c430516a252b007e" && p.reconciliation.schema_version === "national-business-temporal-lifecycle-reconciliation@1.0.0" && p.reconciliation.status === "one-bounded-profile-classification-conflict" && temporalHash(p.reconciliation.lifecycle_manifest_sha256) && p.reconciliation.taxonomy_path === "config/datasets/business-entity-lifecycle-eligibility-taxonomy.json" && temporalHash(p.reconciliation.taxonomy_sha256) && temporalHash(p.reconciliation.los_angeles_pointer_sha256) && temporalHash(p.reconciliation.los_angeles_manifest_sha256) &&
    !!c &&
    c.network_requests === 0 &&
    c.current_pointer_written === false &&
    c.production_enrollment === false &&
    c.current_operations_verified === false &&
    c.active_business_count === null && c.completeness_percentage === null
  );
}

export function TemporalCoverageSummary({
  view,
  error,
}: {
  view: TemporalMatrix | null;
  error: boolean;
}) {
  return (
    <section aria-label="National temporal coverage summary">
      <h4>Temporal coverage boundary</h4>
      {error ? (
        <p role="alert">
          Verified temporal classification evidence is unavailable. No cached
          counts or completeness claim is shown.
        </p>
      ) : !view ? (
        <p role="status">Verifying retained temporal classifications…</p>
      ) : (
        <>
          <dl className="summary-stats">
            <dt>Source classifications</dt>
            <dd>{view.summary.source_count}</dd>
            <dt>Effective source-defined current-membership sources</dt>
            <dd>{view.summary.effective_profile_source_counts.source_defined_current_membership}</dd>
            <dt>Effective non-active reporting sources</dt><dd>{view.summary.effective_profile_source_counts.non_active_reporting_membership}</dd>
            <dt>Effective annual aggregate sources</dt><dd>{view.summary.effective_profile_source_counts.annual_aggregate}</dd>
            <dt>Effective unknown-status sources</dt><dd>{view.summary.effective_profile_source_counts.unknown_source_status}</dd>
            <dt>Publisher-labelled current cohorts</dt><dd>{view.summary.source_cohort_counts.source_defined_current_membership}</dd>
            <dt>Broad state/DC sources</dt>
            <dd>
              {view.summary.broad_state_dc_source_defined_active} /{" "}
              {view.summary.broad_state_dc_total}
            </dd>
            <dt>Broad state/DC gaps</dt>
            <dd>{view.summary.broad_state_dc_gaps}</dd>
            <dt>Verified-current-complete jurisdictions</dt>
            <dd>
              {view.summary.verified_current_complete_jurisdictions} /{" "}
              {view.summary.broad_state_dc_total}
            </dd>
            <dt>Active-business count</dt>
            <dd>Unknown</dd>
            <dt>All-business completeness</dt>
            <dd>Unknown</dd>
          </dl>
          <p>
            Effective status applies the retained lifecycle taxonomy. Los Angeles is the sole mismatch: its publisher cohort is labelled current, but {view.mismatch.profile_count.toLocaleString("en-US")} profiles have null source status and remain unknown. The cohort label and its timestamp do not independently verify current operation. Source cohorts overlap and are not an active-business total.
          </p>
          <p><strong>Los Angeles publisher membership:</strong> {view.publisher_membership.profile_count.toLocaleString("en-US")} retained profiles belong to the publisher&apos;s active-business listing, but have no row-level status. They remain lifecycle unknown and are not verified-current or active-business counts.</p>
          <p><strong>NPPES registration posture:</strong> {view.source_status_posture.profile_count.toLocaleString("en-US")} primary profiles have current or reactivated NPI enumeration status; {view.source_status_posture.non_primary_reporting_count.toLocaleString("en-US")} non-primary locations remain reporting-only. This does not prove an open business, business activity, active-business eligibility, or current operation.</p>
          <p><strong>Colorado registry posture:</strong> {view.organization_assertion_status_posture.good_standing.organization_count.toLocaleString("en-US")} organizations are in Good Standing and {view.organization_assertion_status_posture.delinquent.organization_count.toLocaleString("en-US")} are Delinquent in the retained registry snapshot. This separate organization-assertion cohort does not change the profile-source totals; neither status verifies operation, closure, active-business eligibility, business counts, or completeness.</p>
          <details>
            <summary>Exact temporal release provenance</summary>
            <p>
              Release: <code>{view.provenance.temporal.release_id}</code>
            </p>
            <p>
              Manifest SHA-256: <code>{view.provenance.temporal.manifest_sha256}</code>
            </p>
            <p>
              Artifact SHA-256: <code>{view.provenance.temporal.artifact_sha256}</code>
            </p>
            <p>
              Coverage release:{" "}
              <code>{view.provenance.temporal.coverage_release_id}</code> ·{" "}
              <code>{view.provenance.temporal.coverage_manifest_sha256}</code>
            </p>
            <p>
              Registry release:{" "}
              <code>{view.provenance.temporal.registry_release_id}</code> ·{" "}
              <code>{view.provenance.temporal.registry_manifest_sha256}</code>
            </p>
            <p>Reconciliation registration SHA-256: <code>{view.provenance.reconciliation.registration_sha256}</code></p>
          </details>
        </>
      )}
    </section>
  );
}

type IrsMembership = {
  status: string;
  release_id: string;
  manifest_sha256: string;
  created_at: string;
  summary: {
    irs_eo_rows: number;
    exact_ein_organization_membership_matches: number;
    missing_identities: number;
    extra_identities: number;
    organization_additions: number;
    site_additions: number;
    establishment_additions: number;
    generic_business_additivity_delta: number;
    jurisdiction_rows: number;
    zip5_denominator_rows: number;
    positive_zip5_rows: number;
  };
  claims: {
    source_current_extract_membership_as_of: string;
    filing_address_only: true;
    identifier_free_aggregate_output: true;
    k_anonymous: false;
    small_cell_suppression_applied: false;
    disclosure_control_claimed: false;
    current_operation_beyond_source: false;
    verified_physical_site: false;
    nationwide_business_completeness: false;
    authoritative_current_usps_zip_denominator: null;
    network_requests: 0;
    acquisition_performed: false;
    current_pointer_written: false;
    production_enrollment: false;
    production_execution: false;
  };
};
type BiReadiness = {
  schema_version: string;
  source_replay_performed: false;
  pharmacy_overlay: {
    status: string;
    release_id: string;
    manifest_sha256: string;
    created_at: string;
    summary: {
      pharmacy_rows: number;
      exact_npi_membership_matches: number;
      already_present_same_source_identity: number;
      generic_business_additivity_delta: number;
      organization_additions: number;
      site_additions: number;
      establishment_additions: number;
      zip5_denominator_rows: number;
      positive_zip5_rows: number;
    };
    claims: {
      active_npi_enumeration_as_of: string;
      nationwide_completeness: false;
      authoritative_current_usps_zip_denominator: null;
      current_operation: null;
      licensed_pharmacy: null;
      production_enrollment: false;
    };
  };
  fmcsa_transportation_membership: {
    status: string;
    release_id: string;
    manifest_sha256: string;
    created_at: string;
    summary: {
      fmcsa_rows: number;
      exact_usdot_membership_matches: number;
      exact_site_identity_matches: number;
      exact_establishment_identity_matches: number;
      missing_identities: number;
      extra_identities: number;
      organization_additions: number;
      site_additions: number;
      establishment_additions: number;
      generic_business_additivity_delta: number;
      jurisdiction_rows: number;
      zip5_denominator_rows: number;
      positive_zip5_rows: number;
    };
    claims: {
      source_defined_active_fmcsa_registration_as_of: string;
      reported_principal_office_only: true;
      roles_and_classes_exclusive: false;
      unique_business: false;
      current_operation_beyond_source: false;
      verified_physical_site: false;
      public_access: false;
      complete_carrier_universe: false;
      complete_trucking_or_transportation_universe: false;
      nationwide_completeness: false;
      authoritative_current_usps_zip_denominator: null;
      network_requests: 0;
      acquisition_performed: false;
      current_pointer_written: false;
      production_enrollment: false;
      production_execution: false;
    };
  };
  irs_tax_exempt_organization_membership: IrsMembership;
  zip_denominator: {
    status: string;
    release_id: string;
    manifest_sha256: string;
    readiness_sha256: string;
    observed_at: string;
    blockers: string[];
    retained_zip_evidence: {
      rows: number;
      usps_unverified: number;
      same_code_census_zcta: number;
      source_contributed_outside_zcta: number;
    };
    claims: {
      authoritative_current_usps_zip_denominator: null;
      valid_usps_zip_count: null;
      zip_validity_classified: false;
      production_execution: false;
    };
  };
};
const sha = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
  nonnegative = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export function validBiReadiness(value: unknown): value is BiReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as BiReadiness,
    p = v.pharmacy_overlay,
    f = v.fmcsa_transportation_membership,
    i = v.irs_tax_exempt_organization_membership,
    z = v.zip_denominator,
    s = p?.summary,
    fs = f?.summary,
    fc = f?.claims,
    is = i?.summary,
    ic = i?.claims,
    r = z?.retained_zip_evidence,
    date = p?.claims?.active_npi_enumeration_as_of,
    calendar =
      typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date,
    fSummary = [
      "fmcsa_rows",
      "exact_usdot_membership_matches",
      "exact_site_identity_matches",
      "exact_establishment_identity_matches",
      "missing_identities",
      "extra_identities",
      "organization_additions",
      "site_additions",
      "establishment_additions",
      "generic_business_additivity_delta",
      "jurisdiction_rows",
      "zip5_denominator_rows",
      "positive_zip5_rows",
    ],
    fClaims = [
      "source_defined_active_fmcsa_registration_as_of",
      "reported_principal_office_only",
      "roles_and_classes_exclusive",
      "unique_business",
      "current_operation_beyond_source",
      "verified_physical_site",
      "public_access",
      "complete_carrier_universe",
      "complete_trucking_or_transportation_universe",
      "nationwide_completeness",
      "authoritative_current_usps_zip_denominator",
      "network_requests",
      "acquisition_performed",
      "current_pointer_written",
      "production_enrollment",
      "production_execution",
    ],
    iSummary = [
      "irs_eo_rows",
      "exact_ein_organization_membership_matches",
      "missing_identities",
      "extra_identities",
      "organization_additions",
      "site_additions",
      "establishment_additions",
      "generic_business_additivity_delta",
      "jurisdiction_rows",
      "zip5_denominator_rows",
      "positive_zip5_rows",
    ];
  return (
    exactKeys(v, [
      "schema_version",
      "pharmacy_overlay",
      "fmcsa_transportation_membership",
      "irs_tax_exempt_organization_membership",
      "zip_denominator",
      "source_replay_performed",
    ]) &&
    v.schema_version === "business-intelligence-readiness-view@1.2.0" &&
    v.source_replay_performed === false &&
    p?.status === "verified-retained-nonadditive-overlay" &&
    /^national-nppes-pharmacy-registry-overlay-[a-f0-9]{64}$/.test(
      p.release_id,
    ) &&
    sha(p.manifest_sha256) &&
    iso(p.created_at) &&
    calendar &&
    nonnegative(s?.pharmacy_rows) &&
    s.pharmacy_rows === s.exact_npi_membership_matches &&
    s.pharmacy_rows === s.already_present_same_source_identity &&
    s.generic_business_additivity_delta === 0 &&
    s.organization_additions === 0 &&
    s.site_additions === 0 &&
    s.establishment_additions === 0 &&
    nonnegative(s.zip5_denominator_rows) &&
    nonnegative(s.positive_zip5_rows) &&
    s.positive_zip5_rows <= s.zip5_denominator_rows &&
    p.claims?.nationwide_completeness === false &&
    p.claims.authoritative_current_usps_zip_denominator === null &&
    p.claims.current_operation === null &&
    p.claims.licensed_pharmacy === null &&
    p.claims.production_enrollment === false &&
    exactKeys(f, [
      "status",
      "release_id",
      "manifest_sha256",
      "created_at",
      "summary",
      "claims",
    ]) &&
    f.status === "verified-retained-nonadditive-membership" &&
    /^national-fmcsa-registry-industry-overlay-[a-f0-9]{64}$/.test(
      f.release_id,
    ) &&
    sha(f.manifest_sha256) &&
    iso(f.created_at) &&
    exactKeys(fs, fSummary) &&
    fSummary.every((key) =>
      nonnegative((fs as unknown as Record<string, unknown>)[key]),
    ) &&
    fs.fmcsa_rows === fs.exact_usdot_membership_matches &&
    fs.fmcsa_rows === fs.exact_site_identity_matches &&
    fs.fmcsa_rows === fs.exact_establishment_identity_matches &&
    fs.missing_identities === 0 &&
    fs.extra_identities === 0 &&
    fs.organization_additions === 0 &&
    fs.site_additions === 0 &&
    fs.establishment_additions === 0 &&
    fs.generic_business_additivity_delta === 0 &&
    fs.positive_zip5_rows <= fs.zip5_denominator_rows &&
    exactKeys(fc, fClaims) &&
    iso(fc.source_defined_active_fmcsa_registration_as_of) &&
    fc.reported_principal_office_only === true &&
    [
      "roles_and_classes_exclusive",
      "unique_business",
      "current_operation_beyond_source",
      "verified_physical_site",
      "public_access",
      "complete_carrier_universe",
      "complete_trucking_or_transportation_universe",
      "nationwide_completeness",
      "acquisition_performed",
      "current_pointer_written",
      "production_enrollment",
      "production_execution",
    ].every(
      (key) => (fc as unknown as Record<string, unknown>)[key] === false,
    ) &&
    fc.authoritative_current_usps_zip_denominator === null &&
    fc.network_requests === 0 &&
    exactKeys(i, [
      "status",
      "release_id",
      "manifest_sha256",
      "created_at",
      "summary",
      "claims",
    ]) &&
    i.status === "verified-retained-nonadditive-membership" &&
    /^national-irs-eo-registry-industry-overlay-[a-f0-9]{64}$/.test(
      i.release_id,
    ) &&
    sha(i.manifest_sha256) &&
    iso(i.created_at) &&
    exactKeys(is, iSummary) &&
    iSummary.every((key) =>
      nonnegative((is as unknown as Record<string, unknown>)[key]),
    ) &&
    is.irs_eo_rows === is.exact_ein_organization_membership_matches &&
    is.missing_identities === 0 &&
    is.extra_identities === 0 &&
    is.organization_additions === 0 &&
    is.site_additions === 0 &&
    is.establishment_additions === 0 &&
    is.generic_business_additivity_delta === 0 &&
    is.positive_zip5_rows <= is.zip5_denominator_rows &&
    ic?.filing_address_only === true &&
    ic.identifier_free_aggregate_output === true &&
    ic.k_anonymous === false &&
    ic.small_cell_suppression_applied === false &&
    ic.disclosure_control_claimed === false &&
    ic.current_operation_beyond_source === false &&
    ic.verified_physical_site === false &&
    ic.nationwide_business_completeness === false &&
    ic.authoritative_current_usps_zip_denominator === null &&
    ic.network_requests === 0 &&
    ic.acquisition_performed === false &&
    ic.current_pointer_written === false &&
    ic.production_enrollment === false &&
    ic.production_execution === false &&
    z?.status === "blocked-on-authorized-authoritative-input" &&
    /^zip-denominator-admission-readiness-[a-f0-9]{64}$/.test(z.release_id) &&
    sha(z.manifest_sha256) &&
    sha(z.readiness_sha256) &&
    iso(z.observed_at) &&
    Array.isArray(z.blockers) &&
    z.blockers.length > 0 &&
    z.blockers.every((x) => /^[a-z0-9-]+$/.test(x)) &&
    nonnegative(r?.rows) &&
    nonnegative(r.usps_unverified) &&
    nonnegative(r.same_code_census_zcta) &&
    nonnegative(r.source_contributed_outside_zcta) &&
    r.usps_unverified === r.rows &&
    r.same_code_census_zcta <= r.rows &&
    r.source_contributed_outside_zcta <= r.rows &&
    z.claims?.authoritative_current_usps_zip_denominator === null &&
    z.claims.valid_usps_zip_count === null &&
    z.claims.zip_validity_classified === false &&
    z.claims.production_execution === false
  );
}
export function BusinessIntelligenceReadiness({
  mode,
}: {
  mode: "industry" | "zip";
}) {
  const [view, setView] = useState<BiReadiness | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<BiReadiness>(
      "/api/business-map/business-intelligence-readiness",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted && validBiReadiness(value))
          setView(value);
        else if (!controller.signal.aborted) setError(true);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setError(true);
      });
    return () => controller.abort();
  }, []);
  if (!view)
    return (
      <section
        aria-label={`${mode === "industry" ? "Industry overlays" : "ZIP denominator"} readiness`}
      >
        <h3>
          {mode === "industry"
            ? "Industry overlay readiness"
            : "ZIP denominator readiness"}
        </h3>
        <p role={error ? "alert" : "status"}>
          {error
            ? "Verified retained readiness is unavailable; no counts, validity, or completion state is substituted."
            : "Verifying retained readiness…"}
        </p>
      </section>
    );
  if (mode === "industry") {
    const p = view.pharmacy_overlay,
      f = view.fmcsa_transportation_membership,
      i = view.irs_tax_exempt_organization_membership;
    return (
      <section aria-label="Industry overlay readiness">
        <h3>Verified non-additive industry memberships</h3>
        <article aria-label="Pharmacy overlay readiness">
          <h4>Pharmacy</h4>
          <p>
            <strong>{count(p.summary.pharmacy_rows)}</strong> active NPI
            organization records as of {p.claims.active_npi_enumeration_as_of};
            exact same-source registry identities.
          </p>
          <p>
            Generic-business additions:{" "}
            {p.summary.generic_business_additivity_delta}. Completeness not
            established; no licensure, current-operation, physical-site, or
            USPS-validity claim.
          </p>
          <details>
            <summary>Pharmacy release</summary>
            <p>
              <code>{p.release_id}</code> · <code>{p.manifest_sha256}</code>
            </p>
          </details>
        </article>
        <article aria-label="FMCSA transportation membership readiness">
          <h4>Transportation · FMCSA membership</h4>
          <p>
            <strong>{count(f.summary.fmcsa_rows)}</strong> source-defined active
            registrations as of{" "}
            {f.claims.source_defined_active_fmcsa_registration_as_of}; exact
            USDOT, site, and establishment identity membership.
          </p>
          <dl>
            <dt>Generic-business additions</dt>
            <dd>{f.summary.generic_business_additivity_delta}</dd>
            <dt>ZIP evidence rows with membership</dt>
            <dd>
              {count(f.summary.positive_zip5_rows)} /{" "}
              {count(f.summary.zip5_denominator_rows)}
            </dd>
            <dt>Industry completeness</dt>
            <dd>Not established</dd>
          </dl>
          <p>
            Distinct, non-additive transportation membership. Roles and classes
            overlap. This is not a unique-business count or proof of current
            operation, verified physical sites, carrier/transportation
            completeness, or USPS ZIP validity.
          </p>
          <details>
            <summary>FMCSA release</summary>
            <p>
              <code>{f.release_id}</code> · <code>{f.manifest_sha256}</code>
            </p>
          </details>
        </article>
        <article aria-label="IRS tax-exempt organization membership readiness">
          <h4>Tax-exempt organizations · IRS EO membership</h4>
          <p>
            <strong>{count(i.summary.irs_eo_rows)}</strong> current-extract
            organization records as of{" "}
            {i.claims.source_current_extract_membership_as_of}; exact
            EIN-to-registry organization membership.
          </p>
          <dl>
            <dt>Generic-business additions</dt>
            <dd>{i.summary.generic_business_additivity_delta}</dd>
            <dt>ZIP evidence rows with membership</dt>
            <dd>
              {count(i.summary.positive_zip5_rows)} /{" "}
              {count(i.summary.zip5_denominator_rows)}
            </dd>
            <dt>Industry completeness</dt>
            <dd>Not established</dd>
          </dl>
          <p>
            Identifier-free aggregate filing-address evidence only. It is not a
            physical-site, current-operation, all-nonprofit, disclosure-control,
            or USPS-validity claim; small cells are not suppressed.
          </p>
          <details>
            <summary>IRS EO release</summary>
            <p>
              <code>{i.release_id}</code> · <code>{i.manifest_sha256}</code>
            </p>
          </details>
        </article>
      </section>
    );
  }
  const z = view.zip_denominator;
  return (
    <section aria-label="ZIP denominator readiness">
      <h3>ZIP denominator readiness</h3>
      <p>
        <code>{z.status}</code>. All {count(z.retained_zip_evidence.rows)}{" "}
        registry ZIP evidence keys remain USPS-unverified; same-code Census ZCTA
        membership is not USPS validity.
      </p>
      <dl>
        <dt>Machine-readable blockers</dt>
        <dd>
          <ul>
            {z.blockers.map((blocker) => (
              <li key={blocker}>
                <code>{blocker}</code>
              </li>
            ))}
          </ul>
        </dd>
        <dt>Authoritative current USPS denominator</dt>
        <dd>Unknown</dd>
        <dt>Valid USPS ZIP count</dt>
        <dd>Unknown</dd>
      </dl>
      <details>
        <summary>Verified retained release</summary>
        <p>
          <code>{z.release_id}</code> · observed {z.observed_at}
        </p>
        <p>
          Readiness SHA-256: <code>{z.readiness_sha256}</code>
        </p>
      </details>
    </section>
  );
}

export function OutsideNationalReporting({
  comparison,
}: {
  comparison?: ScopeComparison;
}) {
  const ready =
    comparison?.available &&
    comparison.configuration &&
    comparison.catalog &&
    Array.isArray(comparison.industries);
  return (
    <section aria-label="Outside national reporting denominator">
      <h3>Outside national reporting denominator</h3>
      <p>
        Configured industries below are excluded from the national reporting
        denominator. State-only configuration is not evidence of acquisition or
        nationwide coverage. Expected, measured and unmeasured matrix totals
        above are unchanged; no completeness percentage is inferred.
      </p>
      {!ready ? (
        <p role="status">
          Scope comparison unavailable. Missing or unverified inputs are not an
          empty gap list or zero coverage.
        </p>
      ) : (
        <>
          <p>Compared denominator: {comparison.denominator_version}.</p>
          {comparison.industries!.length ? (
            <div
              className="representation-table"
              role="region"
              aria-label="Excluded configured industry sources"
              tabIndex={0}
            >
              <table>
                <caption>
                  Configuration only — not acquired records or measured coverage
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Configured industry</th>
                    <th scope="col">Source configuration</th>
                    <th scope="col">Publisher scope</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.industries!.flatMap((industry) =>
                    industry.sources.map((source) => (
                      <tr key={`${industry.id}:${source.id}`}>
                        <th scope="row">{categoryLabel(industry.id)}</th>
                        <td>
                          {source.id}
                          {source.manual_selection_required &&
                            " · manual selection required"}
                        </td>
                        <td>
                          {source.scope === "state"
                            ? `State-only: ${Array.isArray(source.publisher_states) ? source.publisher_states.join(", ") : "Unknown"}`
                            : "National configuration only"}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No excluded configured industry groups were found in this
              validated comparison. This is not a completeness claim.
            </p>
          )}
          <details>
            <summary>Scope comparison identities</summary>
            <p>
              Configuration: {comparison.configuration!.path} · version{" "}
              {comparison.configuration!.version}
            </p>
            <p>
              Configuration SHA-256:{" "}
              <code style={{ overflowWrap: "anywhere" }}>
                {comparison.configuration!.sha256}
              </code>
            </p>
            <p>
              Catalog: {comparison.catalog!.path} ·{" "}
              {comparison.catalog!.schema_version} ·{" "}
              {comparison.catalog!.denominator_version}
            </p>
            <p>
              Validated base catalog SHA-256:{" "}
              <code style={{ overflowWrap: "anywhere" }}>
                {comparison.catalog!.predecessor_sha256}
              </code>
            </p>
          </details>
        </>
      )}
    </section>
  );
}

export function summarizeAvailability(rows: MatrixRow[]) {
  const available = rows.reduce((sum, row) => sum + row.available, 0),
    measured = rows.reduce((sum, row) => sum + row.measured, 0),
    expected = rows.reduce((sum, row) => sum + row.denominator, 0),
    unmeasured = rows.reduce((sum, row) => sum + row.unmeasured, 0),
    connected = rows.filter((row) => row.available > 0).length;
  return {
    available,
    measured,
    expected,
    unmeasured,
    connected,
    jurisdictions: rows.length,
    completionPercent: expected ? (available / expected) * 100 : null,
    availabilityPercent: measured ? (available / measured) * 100 : null,
    connectivityPercent: rows.length ? (connected / rows.length) * 100 : null,
  };
}
function completionStateLabel(row: MatrixRow) {
  if (row.denominator === 0)
    return "Not applicable — no required dataset expectations";
  if (row.measurement_status === "unmeasured" || row.percent === null)
    return `Unknown — ${row.unmeasured} required dataset cells unmeasured`;
  if (row.available === 0)
    return `Measured zero available — 0 of ${row.denominator} expected dataset cells`;
  return `${percent(row.percent)} available — ${row.available} of ${row.denominator} expected dataset cells`;
}

export function validBroadGapAdjacentView(
  value: unknown,
  state: string,
): value is BroadGapAdjacentView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as BroadGapAdjacentView,
    selected = view.selected,
    claims = view.claims,
    summary = view.summary;
  if (
    view.schema_version !== "broad-organization-adjacent-evidence-view@1.0.0" ||
    view.available !== true ||
    !/^broad-organization-adjacent-evidence-index-[a-f0-9]{24}$/.test(
      view.release_id,
    ) ||
    !temporalHash(view.manifest_sha256) ||
    !selected ||
    selected.code !== state ||
    selected.broad_layer_gap !== true ||
    selected.broad_layer_status !== "unmeasured"
  )
    return false;
  if (
    !summary ||
    summary.broad_layer_gap_jurisdictions !== 40 ||
    summary.jurisdictions_with_retained_adjacent_evidence +
      summary.jurisdictions_without_retained_adjacent_evidence !==
      40 ||
    summary.broad_layer_gaps_closed !== 0 ||
    !claims ||
    claims.network_requests !== 0 ||
    claims.acquisition_performed !== false ||
    claims.current_pointer_written !== false ||
    claims.production_enrollment !== false ||
    claims.broad_layer_gap_preserved !== true ||
    claims.active_business_count !== null ||
    claims.all_business_completeness_percent !== null
  )
    return false;
  if (
    !Array.isArray(selected.evidence) ||
    selected.evidence_count !== selected.evidence.length ||
    !Array.isArray(selected.limitations) ||
    selected.limitations.some((item) => typeof item !== "string")
  )
    return false;
  if (
    selected.adjacent_evidence_status ===
    (selected.evidence_count === 0
      ? "retained-adjacent-evidence"
      : "no-retained-adjacent-evidence")
  )
    return false;
  return selected.evidence.every(
    (item) =>
      typeof item.evidence_id === "string" &&
      typeof item.label === "string" &&
      typeof item.evidence_kind === "string" &&
      Number.isSafeInteger(item.record_count) &&
      item.record_count >= 0 &&
      typeof item.row_unit === "string" &&
      typeof item.geography_scope === "string" &&
      typeof item.temporal_limitation === "string" &&
      item.current_operation_verified === false &&
      temporalHash(item.provenance?.manifest_sha256) &&
      typeof item.provenance?.release_id === "string" &&
      typeof item.provenance?.source_release_id === "string" &&
      ["reported", "unknown"].includes(item.source_reference?.status) &&
      ((item.source_reference.status === "unknown" &&
        item.source_reference.field === null &&
        item.source_reference.value === null) ||
        (item.source_reference.status === "reported" &&
          typeof item.source_reference.field === "string" &&
          typeof item.source_reference.value === "string")) &&
      item.authority?.retained_offline_use_authorized === true &&
      item.authority.acquisition_authorized === false &&
      item.authority.broad_layer_admission_authorized === false &&
      item.authority.production_pointer_change_authorized === false &&
      typeof item.authority.export_policy === "string" &&
      Array.isArray(item.coverage_limitations) &&
      item.coverage_limitations.every((limit) => typeof limit === "string"),
  );
}

export function BroadGapAdjacentEvidencePanel({
  view,
  error,
  state,
}: {
  view: BroadGapAdjacentView | null;
  error: boolean;
  state: string;
}) {
  if (error)
    return (
      <section
        className="adjacent-evidence-panel"
        aria-label={`${state} state and local adjacent evidence`}
      >
        <h5>State/local retained cohorts — unavailable</h5>
        <p role="alert">
          The pointer-free adjacent-evidence index could not be verified. The
          broad organization layer remains a gap.
        </p>
      </section>
    );
  if (!view?.selected)
    return (
      <section
        className="adjacent-evidence-panel"
        aria-label={`${state} state and local adjacent evidence`}
      >
        <h5>State/local retained cohorts</h5>
        <p role="status">Verifying retained adjacent evidence…</p>
      </section>
    );
  const selected = view.selected;
  return (
    <section
      className="adjacent-evidence-panel"
      aria-label={`${state} state and local adjacent evidence`}
    >
      <h5>State/local retained cohorts — outside broad availability</h5>
      <p>
        <strong>Broad organization layer: Gap preserved.</strong> These records
        are adjacent context only, not broad coverage or an all-business
        numerator.
      </p>
      {selected.evidence.length === 0 ? (
        <p>
          <strong>None retained.</strong> No governed state-specific, municipal,
          license, credential, or childcare cohort is indexed for this
          broad-layer gap.
        </p>
      ) : (
        <div className="goal-source-list">
          {selected.evidence.map((item) => (
            <details key={item.evidence_id}>
              <summary>
                {item.label} · {count(item.record_count)} {item.row_unit} rows
              </summary>
              <dl>
                <dt>Evidence kind</dt>
                <dd>{item.evidence_kind.replaceAll("-", " ")}</dd>
                <dt>Geography scope</dt>
                <dd>{item.geography_scope}</dd>
                <dt>Source/reference date</dt>
                <dd>
                  {item.source_reference.status === "unknown"
                    ? "Unknown"
                    : `${item.source_reference.field}: ${item.source_reference.value}`}
                </dd>
                <dt>Current operation</dt>
                <dd>Not verified</dd>
                <dt>Retained-use authority</dt>
                <dd>
                  {item.authority.export_policy.replaceAll("-", " ")}; broad
                  admission not authorized
                </dd>
              </dl>
              <p>{item.temporal_limitation}</p>
              <p>
                Release <code>{item.provenance.release_id}</code> · source{" "}
                <code>{item.provenance.source_release_id}</code> · manifest{" "}
                <code>{item.provenance.manifest_sha256}</code>
              </p>
              <ul>
                {item.coverage_limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      <ul>
        {selected.limitations.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
      <small>
        Pointer-free index <code>{view.release_id}</code> · manifest{" "}
        <code>{view.manifest_sha256}</code>
      </small>
    </section>
  );
}

const OBJECTIVE_READINESS_ROWS = [
  ["geography", "achieved"],
  ["entity-geography-relationship", "partial"],
  ["postal-denominator", "blocked"],
  ["source-authorization-policy-and-provenance", "partial"],
  ["broad-state-coverage", "blocked"],
  ["industry-coverage", "unmeasured"],
  ["temporal-and-current-operation", "blocked"],
  ["lifecycle-eligibility", "blocked"],
  ["reconciliation-and-benchmark", "blocked"],
  ["all-business-completeness-denominator", "unmeasured"],
  ["reporting-only-site-qualification", "partial"],
  ["business-entity-source-policy-provenance", "achieved"],
] as const;

type ObjectiveLineageEntry = {
  release_id: string; manifest_sha256?: string; registration_sha256?: string; report_sha256?: string;
  taxonomy_sha256?: string; artifact_inventory_sha256?: string; registry_manifest_sha256?: string;
  temporal_artifact_sha256?: string; qualification_manifest_sha256?: string; qualification_artifact_sha256?: string;
  artifact_count?: number; artifact_record_count?: number; profile_count?: number; source_count?: number; source_status_value_count?: number;
  assessment_as_of?: string; current_operation_verified_count?: number; active_business_eligible_count?: number;
  registry_profile_count?: number; release_manifest_verified?: boolean;
  review_status_counts?: { "within-review-window": number; stale: number; unmeasured: number; unmapped: number };
  lifecycle_evidence_counts?: { "source-defined-current": number; "non-active-reporting": number; unknown: number; contradictory: number };
  exception_counts?: { la_null_source_status: number; ca_expiration_before_observation_profiles: number; ny_retail_food_stale_non_active: number };
  program_manifest_sha256?: string; backlog_release_id?: string; backlog_manifest_sha256?: string;
  assessment_catalog_id?: string; assessment_catalog_sha256?: string; source_matrix_release_id?: string;
  source_matrix_manifest_sha256?: string;
  artifact_count?: number; profile_count?: number; registry_profile_count?: number; usps_unverified_profile_count?: number;
  point_assignment_counts?: Record<string, number>; postal_counts?: Record<string, number>; reported_state_conflict_count?: number;
  claims?: Record<string, boolean | number>; semantics?: Record<string, boolean>;
  upstream?: Record<string, string>;
  artifact_sha256?: string; record_count?: number; registry_release_id?: string; reporting_artifact_inventory_sha256?: string;
  source_manifest_hashes?: Record<string, string>; source_manifest_policy_hashes?: Record<string, string>; policy_profile_hashes?: Record<string, string>;
  source_profile_counts_sha256?: string; profile_export_policy_counts?: Record<string, number>; policy_files_verified?: number; profile_policy_rows_verified?: number;
  authorization_granted?: false; acquisition_authorized?: false; export_authorized?: false;
  source_bindings?: Record<string, Record<string, unknown>>;
  geography_release_id?: string; point_assignment_release_id?: string; summary?: Record<string, unknown>; export_policy?: string;
  temporal_registration_sha256?: string; temporal_release_id?: string; temporal_manifest_sha256?: string; temporal_artifact_sha256?: string;
  zip_temporal_qualification_release_id?: string; zip_temporal_qualification_manifest_sha256?: string; zip_temporal_qualification_artifact_sha256?: string;
  source_policy_provenance_release_id?: string; source_policy_provenance_registration_sha256?: string; source_policy_provenance_manifest_sha256?: string; source_policy_provenance_artifact_sha256?: string;
  source_policy_predecessor_lifecycle_release_id?: string; source_policy_predecessor_lifecycle_manifest_sha256?: string;
  assessment_as_of?: string; geography_manifest_sha256?: string; zcta_index_sha256?: string; county_geometry_inventory_sha256?: string;
  point_assignment_manifest_sha256?: string;
};
type NationalObjectiveReadiness = {
  schema_version: string; available: true; status: "not-accepted"; assessment_as_of: string;
  acceptance: { accepted: false; blockers: string[]; blocker_details: Array<{ code: string; count?: number }> };
  requirements_ledger: Array<{ requirement: string; status: string; evidence: string; current_gap_count?: number; jurisdiction_count?: number;
    profile_count?: number; registry_profile_count?: number; active_business_eligible_count?: number; stale_count?: number; unknown_or_contradictory_count?: number; verified_current_operation_count?: number;
    source_count?: number; policy_files_verified?: number; profile_policy_rows_verified?: number; authorization_granted?: false; acquisition_authorized?: false; export_authorized?: false;
    effective_source_defined_current_membership_sources?: number; effective_non_active_reporting_sources?: number; effective_annual_aggregate_sources?: number; effective_unknown_status_sources?: number; source_cohort_current_membership_sources?: number; mismatch_profiles?: number; verified_current_complete_jurisdictions?: number;
    site_count?: number; matching_profile_count?: number; matching_profile_denominator?: number; combined_retained_site_evidence_count?: number; current_operation_verified_count?: number; zip_present_count?: number; zip_absent_count?: number; usps_unverified_count?: number; point_assigned_count?: number; point_assignment_ineligible_count?: number;
    postal_counts?: Record<string, number>; point_assignment_counts?: Record<string, number>; reported_state_conflict_count?: number; usps_unverified_profile_count?: number;
    usps_operational_assignment_verified?: false; usps_deliverability_verified?: false; same_code_zcta_is_membership?: false; entity_polygons_present?: false }>;
  broad_jurisdiction_gap_count: 40;
  claims: { all_business_completion_percent: null; active_business_count: null; current_operating_business_count: null; active_business_eligible_count: 0; current_operations_verified: false; all_business_completeness: false; public_export_authorized: false; production_execution: false; publication_performed: false; network_requests: 0 };
  lineage: { zip_entity_resolution: ObjectiveLineageEntry; zip_industry_matrix: ObjectiveLineageEntry; temporal_claim_matrix: ObjectiveLineageEntry; temporal_lifecycle_reconciliation: ObjectiveLineageEntry; publisher_membership_reconciliation: ObjectiveLineageEntry; source_status_posture: ObjectiveLineageEntry; organization_assertion_status_posture: ObjectiveLineageEntry; goal_completion_matrix: ObjectiveLineageEntry; broad_organization_projection: ObjectiveLineageEntry; lifecycle_eligibility: ObjectiveLineageEntry; business_entity_geography_relationship: ObjectiveLineageEntry; reporting_only_site_qualification: ObjectiveLineageEntry; business_entity_source_policy_provenance: ObjectiveLineageEntry; non_zcta_source_geography_context: ObjectiveLineageEntry };
};

export function validNationalObjectiveReadiness(value: unknown): value is NationalObjectiveReadiness {
  const exactKeys = (item: unknown, expected: string[]) => item && typeof item === "object"
    && !Array.isArray(item) && Object.keys(item).sort().join("|") === [...expected].sort().join("|");
  const sha = (item: unknown) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item);
  if (!exactKeys(value, ["schema_version", "available", "status", "assessment_as_of", "acceptance", "requirements_ledger", "broad_jurisdiction_gap_count", "claims", "lineage"])) return false;
  const payload = value as NationalObjectiveReadiness;
  if (payload.schema_version !== "national-zip-objective-readiness-api@1.7.0" || payload.available !== true || payload.status !== "not-accepted" ||
      payload.acceptance?.accepted !== false || !exactKeys(payload.acceptance, ["accepted", "blockers", "blocker_details"]) || payload.broad_jurisdiction_gap_count !== 40 || !Array.isArray(payload.requirements_ledger) ||
      payload.requirements_ledger.length !== OBJECTIVE_READINESS_ROWS.length || !Array.isArray(payload.acceptance.blockers) ||
      !Array.isArray(payload.acceptance.blocker_details)) return false;
  for (let index = 0; index < OBJECTIVE_READINESS_ROWS.length; index++) {
    const [requirement, status] = OBJECTIVE_READINESS_ROWS[index], row = payload.requirements_ledger[index];
    if (row?.requirement !== requirement || row.status !== status || typeof row.evidence !== "string" || !row.evidence.trim()) return false;
    const expected = requirement === "broad-state-coverage"
      ? ["requirement", "status", "current_gap_count", "jurisdiction_count", "evidence"]
      : requirement === "entity-geography-relationship" ? ["requirement", "status", "profile_count", "registry_profile_count", "postal_counts", "point_assignment_counts", "reported_state_conflict_count", "usps_unverified_profile_count", "usps_operational_assignment_verified", "usps_deliverability_verified", "same_code_zcta_is_membership", "entity_polygons_present", "evidence"]
      : requirement === "lifecycle-eligibility" ? ["requirement", "status", "profile_count", "registry_profile_count", "active_business_eligible_count", "stale_count", "unknown_or_contradictory_count", "verified_current_operation_count", "evidence"]
      : requirement === "reporting-only-site-qualification" ? ["requirement", "status", "site_count", "matching_profile_count", "matching_profile_denominator", "combined_retained_site_evidence_count", "active_business_eligible_count", "current_operation_verified_count", "zip_present_count", "zip_absent_count", "usps_unverified_count", "point_assigned_count", "point_assignment_ineligible_count", "evidence"]
      : requirement === "business-entity-source-policy-provenance" ? ["requirement", "status", "source_count", "profile_count", "policy_files_verified", "profile_policy_rows_verified", "authorization_granted", "acquisition_authorized", "export_authorized", "evidence"]
      : requirement === "temporal-and-current-operation" ? ["requirement","status","effective_source_defined_current_membership_sources","effective_non_active_reporting_sources","effective_annual_aggregate_sources","effective_unknown_status_sources","source_cohort_current_membership_sources","mismatch_profiles","verified_current_complete_jurisdictions","evidence"]
      : ["requirement", "status", "evidence"];
    if (!exactKeys(row, expected)) return false;
    if (requirement === "broad-state-coverage" && (row.current_gap_count !== 40 || row.jurisdiction_count !== 51)) return false;
    if (requirement === "lifecycle-eligibility" && (row.profile_count !== 8011835 || row.registry_profile_count !== row.profile_count || row.active_business_eligible_count !== 0 || row.stale_count !== 24230 || row.unknown_or_contradictory_count !== 635899 || row.verified_current_operation_count !== 0)) return false;
    if (requirement === "temporal-and-current-operation" && (row.effective_source_defined_current_membership_sources !== 21 || row.effective_non_active_reporting_sources !== 7 || row.effective_annual_aggregate_sources !== 1 || row.effective_unknown_status_sources !== 1 || row.source_cohort_current_membership_sources !== 22 || row.mismatch_profiles !== 633232 || row.verified_current_complete_jurisdictions !== 0)) return false;
    if (requirement === "entity-geography-relationship" && (row.profile_count !== 8011835 || row.registry_profile_count !== row.profile_count ||
        !exactKeys(row.postal_counts, ["same-code-zcta-candidate", "outside-zcta", "explicit-placeholder", "missing"]) ||
        row.postal_counts["same-code-zcta-candidate"] !== 7963395 || row.postal_counts["outside-zcta"] !== 48439 || row.postal_counts["explicit-placeholder"] !== 1 || row.postal_counts.missing !== 0 ||
        !exactKeys(row.point_assignment_counts, ["assigned-single-county", "unmatched", "ambiguous", "conflict", "missing-geocode", "invalid-coordinate", "unassignable-legacy-coordinate-crs-unproven", "unassignable-coordinate-not-premise-point"]) ||
        row.point_assignment_counts["assigned-single-county"] !== 372079 || row.point_assignment_counts.unmatched !== 21 || row.point_assignment_counts.ambiguous !== 7 || row.point_assignment_counts.conflict !== 0 ||
        row.point_assignment_counts["missing-geocode"] !== 6976397 || row.point_assignment_counts["invalid-coordinate"] !== 0 ||
        row.point_assignment_counts["unassignable-legacy-coordinate-crs-unproven"] !== 640383 || row.point_assignment_counts["unassignable-coordinate-not-premise-point"] !== 22948 ||
        row.reported_state_conflict_count !== 11 || row.usps_unverified_profile_count !== 8011835 || row.usps_operational_assignment_verified !== false ||
        row.usps_deliverability_verified !== false || row.same_code_zcta_is_membership !== false || row.entity_polygons_present !== false)) return false;
    if (requirement === "reporting-only-site-qualification" && (row.site_count !== 13182 || row.matching_profile_count !== 0 || row.matching_profile_denominator !== 8011835 || row.combined_retained_site_evidence_count !== 8025017 ||
        row.active_business_eligible_count !== 0 || row.current_operation_verified_count !== 0 || row.zip_present_count !== 13010 ||
        row.zip_absent_count !== 172 || row.usps_unverified_count !== 13182 || row.point_assigned_count !== 8942 || row.point_assignment_ineligible_count !== 4237)) return false;
    if (requirement === "business-entity-source-policy-provenance" && (row.source_count !== 15 || row.profile_count !== 8011835 || row.policy_files_verified !== 15 ||
        row.profile_policy_rows_verified !== 8011835 || row.authorization_granted !== false || row.acquisition_authorized !== false || row.export_authorized !== false)) return false;
    if (Object.hasOwn(row, "percent") || Object.hasOwn(row, "completion_percent")) return false;
  }
  const requiredBlockers = ["entity-resolution-benchmark-gate-not-passed", "entity-resolution-not-applied",
    "nationwide-industry-universe-unmeasured", "broad-jurisdiction-source-gaps", "current-operation-not-independently-verified",
    "reporting-only-sites-not-eligible-or-verified", "entity-geography-relationship-not-complete",
    "lifecycle-active-eligibility-not-established", "lifecycle-stale-records-present", "lifecycle-unknown-or-contradictory"];
  const acceptanceBlockers = ["authoritative-current-usps-denominator-unavailable", "complete-current-delivery-zip-registry-not-established",
    "all-business-universe-unmeasured", "current-business-operations-not-independently-verified", ...requiredBlockers];
  if (payload.acceptance.blockers.length !== acceptanceBlockers.length || acceptanceBlockers.some((code, index) => payload.acceptance.blockers[index] !== code) ||
      payload.acceptance.blocker_details.length !== requiredBlockers.length || !requiredBlockers.every(code => payload.acceptance.blockers.includes(code) && payload.acceptance.blocker_details.some(item => item.code === code)) ||
      payload.acceptance.blocker_details.some(item => !exactKeys(item, item.code === "broad-jurisdiction-source-gaps" || item.code === "lifecycle-stale-records-present" || item.code === "lifecycle-unknown-or-contradictory" || item.code === "reporting-only-sites-not-eligible-or-verified" ? ["code", "count"] : item.code === "lifecycle-active-eligibility-not-established" ? ["code", "eligible_count", "profile_count", "verified_current_operation_count"] : ["code"])) ||
      payload.acceptance.blocker_details.find(item => item.code === "broad-jurisdiction-source-gaps")?.count !== 40 ||
      payload.acceptance.blocker_details.find(item => item.code === "lifecycle-stale-records-present")?.count !== 24230 ||
      payload.acceptance.blocker_details.find(item => item.code === "lifecycle-unknown-or-contradictory")?.count !== 635899 ||
      payload.acceptance.blocker_details.find(item => item.code === "lifecycle-active-eligibility-not-established")?.eligible_count !== 0 ||
      payload.acceptance.blocker_details.find(item => item.code === "lifecycle-active-eligibility-not-established")?.profile_count !== 8011835 ||
      payload.acceptance.blocker_details.find(item => item.code === "reporting-only-sites-not-eligible-or-verified")?.count !== 13182) return false;
  if (!exactKeys(payload.claims, ["all_business_completion_percent", "active_business_count", "current_operating_business_count", "active_business_eligible_count", "current_operations_verified", "all_business_completeness", "public_export_authorized", "production_execution", "publication_performed", "network_requests"]) ||
      payload.claims.all_business_completion_percent !== null || payload.claims.active_business_count !== null || payload.claims.current_operating_business_count !== null ||
      payload.claims.active_business_eligible_count !== 0 ||
      payload.claims.current_operations_verified !== false || payload.claims.all_business_completeness !== false || payload.claims.public_export_authorized !== false ||
      payload.claims.production_execution !== false || payload.claims.publication_performed !== false || payload.claims.network_requests !== 0) return false;
  const lineage = payload.lineage;
  if (!exactKeys(lineage, ["zip_entity_resolution", "zip_industry_matrix", "temporal_claim_matrix", "temporal_lifecycle_reconciliation", "publisher_membership_reconciliation", "source_status_posture", "organization_assertion_status_posture", "goal_completion_matrix", "broad_organization_projection", "lifecycle_eligibility", "business_entity_geography_relationship", "reporting_only_site_qualification", "business_entity_source_policy_provenance", "non_zcta_source_geography_context"])) return false;
  for (const [key, item] of Object.entries(lineage) as [string, ObjectiveLineageEntry][]) {
    if (typeof item?.release_id !== "string" || !item.release_id) return false;
    if (!["goal_completion_matrix", "broad_organization_projection", "source_status_posture", "organization_assertion_status_posture"].includes(key) && !sha(item.registration_sha256)) return false;
    if (key !== "goal_completion_matrix" && key !== "broad_organization_projection" && !sha(item.manifest_sha256)) return false;
  }
  const nonZcta=lineage.non_zcta_source_geography_context;
  if(!exactKeys(nonZcta,["registration_path","registration_sha256","release_id","manifest_sha256","summary_sha256","rows","source_contributed_outside_zcta","denominator_only_outside_zcta","relationship_keys","no_relationship_keys","state_assignment","cardinal_or_central_grouping","map_blocked","state_denominator_integration","business_completeness"])||nonZcta.rows!==14402||nonZcta.source_contributed_outside_zcta!==14361||nonZcta.denominator_only_outside_zcta!==41||nonZcta.relationship_keys!==8871||nonZcta.no_relationship_keys!==5531||nonZcta.state_assignment!==false||nonZcta.cardinal_or_central_grouping!==null||nonZcta.map_blocked!==false||nonZcta.state_denominator_integration!==false||nonZcta.business_completeness!==null||!sha(nonZcta.summary_sha256))return false;
  if (!sha(lineage.goal_completion_matrix.report_sha256) || !sha(lineage.broad_organization_projection.program_manifest_sha256) ||
      !sha(lineage.broad_organization_projection.backlog_manifest_sha256) || !sha(lineage.broad_organization_projection.assessment_catalog_sha256) ||
      !lineage.broad_organization_projection.backlog_release_id || !lineage.broad_organization_projection.assessment_catalog_id ||
      lineage.broad_organization_projection.source_matrix_release_id !== lineage.goal_completion_matrix.release_id ||
      lineage.broad_organization_projection.source_matrix_manifest_sha256 !== lineage.goal_completion_matrix.manifest_sha256 ||
      !sha(lineage.broad_organization_projection.source_matrix_manifest_sha256)) return false;
  const lifecycle = lineage.lifecycle_eligibility;
  if (!exactKeys(lifecycle, ["registration_path", "registration_sha256", "release_id", "manifest_path", "manifest_sha256", "taxonomy_path", "taxonomy_sha256",
      "artifact_count", "artifact_inventory_sha256", "artifact_record_count", "registry_release_id", "registry_manifest_sha256", "temporal_release_id",
      "temporal_manifest_sha256", "temporal_artifact_sha256", "qualification_release_id", "qualification_manifest_sha256", "qualification_artifact_sha256",
      "source_policy_provenance_release_id", "source_policy_provenance_registration_sha256", "source_policy_provenance_manifest_sha256", "source_policy_provenance_artifact_sha256", "source_policy_predecessor_lifecycle_release_id", "source_policy_predecessor_lifecycle_manifest_sha256",
      "assessment_as_of", "profile_count", "registry_profile_count", "release_manifest_verified", "source_count", "source_status_value_count", "review_status_counts", "lifecycle_evidence_counts",
      "exception_counts", "current_operation_verified_count", "active_business_eligible_count"]) ||
      lifecycle.registration_path !== "config/datasets/business-entity-lifecycle-eligibility.json" ||
      lifecycle.manifest_path !== `data/business-entity-lifecycle-eligibility/releases/${lifecycle.release_id}/manifest.json` ||
      lifecycle.taxonomy_path !== "config/datasets/business-entity-lifecycle-eligibility-taxonomy.json" ||
      lifecycle.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" ||
      lifecycle.temporal_release_id !== "national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090" ||
      lifecycle.qualification_release_id !== "exact-zip-industry-temporal-qualification-d4c84e6c4665b66c9629d942764ab26904f8571e17c2c5a6cca56b89bfdaf4ee" ||
      lifecycle.qualification_manifest_sha256 !== "c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409" ||
      lifecycle.qualification_artifact_sha256 !== "8cb2668ecf2f428e2f350742072ae589c9bc1342c6432e78e7e87e476a52848a" ||
      !exactKeys(lifecycle.review_status_counts, ["within-review-window", "stale", "unmeasured", "unmapped"]) ||
      lifecycle.review_status_counts["within-review-window"] !== 7987605 || lifecycle.review_status_counts.stale !== 24230 ||
      lifecycle.review_status_counts.unmeasured !== 0 || lifecycle.review_status_counts.unmapped !== 0 ||
      !exactKeys(lifecycle.lifecycle_evidence_counts, ["source-defined-current", "non-active-reporting", "unknown", "contradictory"]) ||
      lifecycle.lifecycle_evidence_counts["source-defined-current"] !== 5240481 || lifecycle.lifecycle_evidence_counts["non-active-reporting"] !== 2135455 ||
      lifecycle.lifecycle_evidence_counts.unknown !== 633232 || lifecycle.lifecycle_evidence_counts.contradictory !== 2667 ||
      !exactKeys(lifecycle.exception_counts, ["la_null_source_status", "ca_expiration_before_observation_profiles", "ny_retail_food_stale_non_active"]) ||
      lifecycle.exception_counts.la_null_source_status !== 633232 || lifecycle.exception_counts.ca_expiration_before_observation_profiles !== 2667 ||
      lifecycle.exception_counts.ny_retail_food_stale_non_active !== 24230) return false;
  if (lifecycle.release_id !== "business-entity-lifecycle-eligibility-afc1ef2c825cca630134a0d84dbff6777cf5d0b7710d4cff6172439f6c7928d0" ||
      lifecycle.registration_sha256 !== "2afa49be56059b2e61873f6dd328dfbf873b24feb03e5cf5ee8f9c288f9e979c" ||
      lifecycle.manifest_sha256 !== "d62cd007616c08da7ed71c3b7ecb4ac9890f1d8c0e711a4613e08e8e5cdb296e" ||
      lifecycle.taxonomy_sha256 !== "7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc" ||
      lifecycle.artifact_inventory_sha256 !== "ef3c2a697f8504656d884b1dde88317d4ed6a04597d99d957e28795f2a417907" ||
      lifecycle.artifact_count !== 100 || lifecycle.artifact_record_count !== 8011835 || lifecycle.profile_count !== 8011835 || lifecycle.registry_profile_count !== lifecycle.profile_count || lifecycle.release_manifest_verified !== true ||
      lifecycle.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" ||
      lifecycle.temporal_artifact_sha256 !== "d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0" ||
      lifecycle.qualification_manifest_sha256 !== "c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409" ||
      lifecycle.qualification_artifact_sha256 !== "8cb2668ecf2f428e2f350742072ae589c9bc1342c6432e78e7e87e476a52848a" ||
      lifecycle.source_policy_provenance_release_id !== "business-entity-source-policy-provenance-84d96465d8718c5c1bcb3a5dac650fe50267912f6768e40f98f690f743a8e68b" || lifecycle.source_policy_provenance_registration_sha256 !== "fb7b2405c5444d0e572aaccaa98138e295d21b348dff9e9398e3332726b7b3d9" || lifecycle.source_policy_provenance_manifest_sha256 !== "c0d347c47ff23f61e6b0b39401ac4671bc43c8922209106f79435e0305cf8ed5" || lifecycle.source_policy_provenance_artifact_sha256 !== "1c9728424770612ef28e80eac4258d40a0653ca516385ce18a4a5d4daf591232" || lifecycle.source_policy_predecessor_lifecycle_release_id !== "business-entity-lifecycle-eligibility-f5fba9c9f870251d54525d71bf99c26afaa6acbb93b83ec9bdf494c56513b074" || lifecycle.source_policy_predecessor_lifecycle_manifest_sha256 !== "6b8f0dd94d3ee667a591a99abdb94c37b2ef1af6005519f2f5b4312343ed8c65" ||
      lifecycle.active_business_eligible_count !== 0 || lifecycle.current_operation_verified_count !== 0 ||
      lifecycle.review_status_counts?.stale !== 24230 || lifecycle.lifecycle_evidence_counts?.unknown !== 633232 || lifecycle.lifecycle_evidence_counts?.contradictory !== 2667) return false;
  const entityGeography = lineage.business_entity_geography_relationship;
  if (!exactKeys(entityGeography, ["release_id", "registration_sha256", "manifest_sha256", "artifact_inventory_sha256", "artifact_count", "profile_count", "registry_profile_count", "upstream", "postal_counts", "point_assignment_counts", "reported_state_conflict_count", "usps_unverified_profile_count", "claims", "semantics"]) ||
      entityGeography.release_id !== "business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7" ||
      entityGeography.registration_sha256 !== "bc81d33b80a92da55f31713d36813807e7224da599ab24aa3898522b338f5829" ||
      entityGeography.manifest_sha256 !== "07e561938b2d027f0c1586e5db1a2b775f7680d486e75dfb4e99b399cc0bbaa2" ||
      entityGeography.artifact_inventory_sha256 !== "ca92485cf7659fc8f4565fe81de5728c960de9667f9b5c605f66c9e07d24a5f5" ||
      entityGeography.artifact_count !== 100 || entityGeography.profile_count !== 8011835 || entityGeography.registry_profile_count !== 8011835 ||
      entityGeography.usps_unverified_profile_count !== 8011835 || entityGeography.reported_state_conflict_count !== 11 ||
      !exactKeys(entityGeography.upstream, ["registry_release_id", "registry_manifest_sha256", "geography_release_id", "geography_manifest_sha256", "crosswalk_release_id", "crosswalk_manifest_sha256", "zip_audit_release_id", "zip_audit_manifest_sha256", "zip_quality_release_id", "zip_quality_manifest_sha256", "point_assignment_release_id", "point_assignment_manifest_sha256", "point_assignment_summary_sha256"]) ||
      entityGeography.upstream.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" || entityGeography.upstream.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" ||
      entityGeography.upstream.geography_release_id !== "us-census-geography-20260830-132803990Z-3629abc0" || entityGeography.upstream.geography_manifest_sha256 !== "5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b" ||
      entityGeography.upstream.crosswalk_release_id !== "us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8" || entityGeography.upstream.crosswalk_manifest_sha256 !== "02e19bd98ad587426628cd50013942acc0cc3e9c9a48ac653eaf96cf534b8fe2" ||
      entityGeography.upstream.zip_audit_release_id !== "zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb" || entityGeography.upstream.zip_audit_manifest_sha256 !== "792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea" ||
      entityGeography.upstream.zip_quality_release_id !== "registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430" || entityGeography.upstream.zip_quality_manifest_sha256 !== "1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c" ||
      entityGeography.upstream.point_assignment_release_id !== "national-business-coverage-views-20260911-040908332Z-f01c882a" || entityGeography.upstream.point_assignment_manifest_sha256 !== "f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6" || entityGeography.upstream.point_assignment_summary_sha256 !== "c9d9a8d3dd60cdcf6c734c3d2e327997c8c945260165a976e7cb2b0bfa284f0d" ||
      !exactKeys(entityGeography.postal_counts, ["same-code-zcta-candidate", "outside-zcta", "explicit-placeholder", "missing"]) || entityGeography.postal_counts["same-code-zcta-candidate"] !== 7963395 || entityGeography.postal_counts["outside-zcta"] !== 48439 || entityGeography.postal_counts["explicit-placeholder"] !== 1 || entityGeography.postal_counts.missing !== 0 ||
      !exactKeys(entityGeography.point_assignment_counts, ["assigned-single-county", "unmatched", "ambiguous", "conflict", "missing-geocode", "invalid-coordinate", "unassignable-legacy-coordinate-crs-unproven", "unassignable-coordinate-not-premise-point"]) || entityGeography.point_assignment_counts["assigned-single-county"] !== 372079 || entityGeography.point_assignment_counts.unmatched !== 21 || entityGeography.point_assignment_counts.ambiguous !== 7 || entityGeography.point_assignment_counts.conflict !== 0 || entityGeography.point_assignment_counts["missing-geocode"] !== 6976397 || entityGeography.point_assignment_counts["invalid-coordinate"] !== 0 || entityGeography.point_assignment_counts["unassignable-legacy-coordinate-crs-unproven"] !== 640383 || entityGeography.point_assignment_counts["unassignable-coordinate-not-premise-point"] !== 22948 ||
      !exactKeys(entityGeography.claims, ["current_operation_verified", "postal_validity_verified", "entity_polygon_present", "zcta_point_assignment_performed", "network_requests", "source_acquisition_performed", "source_bytes_modified", "current_pointer_written", "production_enrollment", "production_execution"]) ||
      entityGeography.claims.current_operation_verified !== false || entityGeography.claims.postal_validity_verified !== false || entityGeography.claims.entity_polygon_present !== false || entityGeography.claims.zcta_point_assignment_performed !== false || entityGeography.claims.network_requests !== 0 || entityGeography.claims.source_acquisition_performed !== false || entityGeography.claims.source_bytes_modified !== false || entityGeography.claims.current_pointer_written !== false || entityGeography.claims.production_enrollment !== false || entityGeography.claims.production_execution !== false ||
      !exactKeys(entityGeography.semantics, ["usps_operational_assignment_verified", "usps_deliverability_verified", "same_code_zcta_is_membership", "zcta_point_assignment_performed", "entity_polygons_present"]) ||
      Object.values(entityGeography.semantics).some(item => item !== false)) return false;
  const reporting = lineage.reporting_only_site_qualification;
  const reportSources = { MA: "c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc", NJ: "b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e", TN: "98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d", OH: "e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171" };
  const reportManifestPolicies = { MA: "bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201", NJ: "79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410", TN: "78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b", OH: "53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98" };
  const reportPolicyProfiles = { MA: "8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742", NJ: "3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc", TN: "06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e", OH: "f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2" };
  if (!exactKeys(reporting, ["release_id", "registration_sha256", "manifest_sha256", "artifact_sha256", "record_count", "registry_release_id", "registry_manifest_sha256", "reporting_artifact_inventory_sha256", "source_manifest_hashes", "source_manifest_policy_hashes", "policy_profile_hashes", "source_bindings", "temporal_registration_sha256", "temporal_release_id", "temporal_manifest_sha256", "temporal_artifact_sha256", "zip_temporal_qualification_release_id", "zip_temporal_qualification_manifest_sha256", "zip_temporal_qualification_artifact_sha256", "assessment_as_of", "geography_release_id", "geography_manifest_sha256", "zcta_index_sha256", "county_geometry_inventory_sha256", "point_assignment_release_id", "point_assignment_manifest_sha256", "summary", "active_business_eligible_count", "current_operation_verified_count", "usps_unverified_count", "export_policy"]) ||
      reporting.release_id !== "reporting-only-site-qualification-a125bbeb43928016c7d0abf7259572f9e248f85f22f997bf8572b503ff3e4fce" || reporting.registration_sha256 !== "0eb4e02a94d3618362b2d9fbc0f58c34a826481befbafbc0655a8a0a69b049ba" ||
      reporting.manifest_sha256 !== "e3e62ff1ad7d05c9fdfaf51e93783effb07d738a1f2236128183229c08b95e83" || reporting.artifact_sha256 !== "c4d882b146cdd06f0817744ffa92ce8c9d9bf6b36dd5326aa1c10286953144ab" || reporting.record_count !== 13182 ||
      reporting.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" || reporting.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" || reporting.reporting_artifact_inventory_sha256 !== "e060dd4979babd4ce4824edbf7e3469cd6447e2513c368615111da16259cf1c5" ||
      !exactKeys(reporting.source_manifest_hashes, Object.keys(reportSources)) || Object.entries(reportSources).some(([key, value]) => reporting.source_manifest_hashes[key] !== value) ||
      !exactKeys(reporting.source_manifest_policy_hashes, Object.keys(reportManifestPolicies)) || Object.entries(reportManifestPolicies).some(([key, value]) => reporting.source_manifest_policy_hashes[key] !== value) ||
      !exactKeys(reporting.policy_profile_hashes, Object.keys(reportPolicyProfiles)) || Object.entries(reportPolicyProfiles).some(([key, value]) => reporting.policy_profile_hashes[key] !== value) ||
      !exactKeys(reporting.source_bindings, ["MA", "NJ", "TN", "OH"]) ||
      Object.values(reporting.source_bindings).some(binding => !exactKeys(binding, ["source_id", "release_id", "source_release_id", "manifest_path", "manifest_sha256", "policy_id", "policy_profile", "policy_profile_path", "policy_profile_sha256", "source_manifest_policy_sha256", "transformation_version", "observed_at"])) ||
      reporting.source_bindings.MA?.transformation_version !== "ma-childcare-normalization@1.0.0" || reporting.source_bindings.NJ?.transformation_version !== "nj-childcare-normalization@1.0.1" ||
      reporting.source_bindings.TN?.transformation_version !== "tn-childcare-normalization@1.0.1" || reporting.source_bindings.OH?.transformation_version !== "oh-childcare-normalization@1.0.0" ||
      Object.entries(reportSources).some(([key, sha]) => reporting.source_bindings[key]?.manifest_sha256 !== sha || reporting.source_bindings[key]?.policy_profile_sha256 !== reportPolicyProfiles[key] || reporting.source_bindings[key]?.source_manifest_policy_sha256 !== reportManifestPolicies[key]) ||
      reporting.source_bindings.MA?.manifest_path !== "data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json" ||
      reporting.source_bindings.NJ?.manifest_path !== "data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json" ||
      reporting.source_bindings.TN?.manifest_path !== "data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json" ||
      reporting.source_bindings.OH?.manifest_path !== "data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json" ||
      reporting.source_bindings.MA?.policy_profile_path !== "config/source-policies/massgis-eec-childcare-local-review.json" || reporting.source_bindings.NJ?.policy_profile_path !== "config/source-policies/njdep-childcare-local-review.json" ||
      reporting.source_bindings.TN?.policy_profile_path !== "config/source-policies/tn-childcare-local-review.json" || reporting.source_bindings.OH?.policy_profile_path !== "config/source-policies/oh-childcare-local-review.json" ||
      reporting.temporal_release_id !== "national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090" || reporting.temporal_manifest_sha256 !== "342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05" || reporting.temporal_artifact_sha256 !== "d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0" || reporting.temporal_registration_sha256 !== "65e7c8e5a3f32ee1a71f816f4aeb449c43925c924926ec6a1d777a727e19d738" ||
      reporting.zip_temporal_qualification_release_id !== "exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503" || reporting.zip_temporal_qualification_manifest_sha256 !== "771a0f27951569bc7f1a96d02b8b9f114b65b2a37fdb1db3fb98217c6ad50e3e" || reporting.zip_temporal_qualification_artifact_sha256 !== "958cb73f61dc27bf8bbbcb3f3e666917f8c885a59bf1470129ccadb5e2a862ed" || reporting.assessment_as_of !== "2026-10-02T16:30:00.000Z" ||
      reporting.geography_release_id !== "us-census-geography-20260830-132803990Z-3629abc0" || reporting.geography_manifest_sha256 !== "5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b" || reporting.zcta_index_sha256 !== "41cbef263f88514d6c6e139e54527350c23f9e05a96a9576a6d7b2478f28ffc6" || reporting.county_geometry_inventory_sha256 !== "993e450f60492f7c651020e7135caf6d92b5f30a5a54d2adee8ad2fe9d9c38ae" || reporting.point_assignment_release_id !== "national-business-coverage-views-20260911-040908332Z-f01c882a" || reporting.point_assignment_manifest_sha256 !== "f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6" || reporting.active_business_eligible_count !== 0 || reporting.current_operation_verified_count !== 0 || reporting.usps_unverified_count !== 13182 || reporting.export_policy !== "local-review-only" ||
      !exactKeys(reporting.summary, ["site_count", "matching_profile_count", "by_source", "zip", "point_assignment", "current_operation_verified", "active_business_verified", "active_business_eligible", "identity_matching_eligible", "temporal_review_unmeasured", "source_status_counts", "physical_site_denominator"]) || reporting.summary.site_count !== 13182 || reporting.summary.matching_profile_count !== 0 ||
      !exactKeys(reporting.summary.by_source, ["MA", "NJ", "TN", "OH"]) || reporting.summary.by_source.MA !== 3007 || reporting.summary.by_source.NJ !== 4075 || reporting.summary.by_source.TN !== 1863 || reporting.summary.by_source.OH !== 4237 ||
      reporting.summary.zip?.present !== 13010 || reporting.summary.zip?.absent !== 172 || reporting.summary.zip?.["missing-source-zip"] !== 27 || reporting.summary.zip?.["invalid-source-zip-placeholder"] !== 145 ||
      reporting.summary.point_assignment?.["assigned-single-county"] !== 8942 || reporting.summary.point_assignment?.["assignment-ineligible-by-source-policy"] !== 4237 || reporting.summary.point_assignment?.["missing-geocode"] !== 3 ||
      reporting.summary.current_operation_verified !== 0 || reporting.summary.active_business_verified !== 0 || reporting.summary.active_business_eligible !== 0 || reporting.summary.identity_matching_eligible !== 0 || reporting.summary.temporal_review_unmeasured !== 13182 ||
      reporting.summary.physical_site_denominator?.matching_profiles !== 8011835 || reporting.summary.physical_site_denominator?.reporting_only_sites !== 13182 || reporting.summary.physical_site_denominator?.combined_retained_site_evidence !== 8025017) return false;
  const sourcePolicy = lineage.business_entity_source_policy_provenance;
  if (!exactKeys(sourcePolicy, ["release_id", "registration_sha256", "manifest_sha256", "artifact_sha256", "source_count", "profile_count", "registry_release_id", "registry_manifest_sha256", "lifecycle_release_id", "lifecycle_manifest_sha256", "taxonomy_sha256", "temporal_release_id", "temporal_manifest_sha256", "source_profile_counts_sha256", "policy_files_verified", "profile_policy_rows_verified", "profile_export_policy_counts", "authorization_granted", "acquisition_authorized", "export_authorized"]) ||
      sourcePolicy.release_id !== "business-entity-source-policy-provenance-84d96465d8718c5c1bcb3a5dac650fe50267912f6768e40f98f690f743a8e68b" ||
      sourcePolicy.registration_sha256 !== "fb7b2405c5444d0e572aaccaa98138e295d21b348dff9e9398e3332726b7b3d9" ||
      sourcePolicy.manifest_sha256 !== "c0d347c47ff23f61e6b0b39401ac4671bc43c8922209106f79435e0305cf8ed5" ||
      sourcePolicy.artifact_sha256 !== "1c9728424770612ef28e80eac4258d40a0653ca516385ce18a4a5d4daf591232" ||
      sourcePolicy.source_count !== 15 || sourcePolicy.profile_count !== 8011835 || sourcePolicy.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" ||
      sourcePolicy.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" ||
      sourcePolicy.release_id !== lineage.lifecycle_eligibility.source_policy_provenance_release_id || sourcePolicy.registration_sha256 !== lineage.lifecycle_eligibility.source_policy_provenance_registration_sha256 || sourcePolicy.manifest_sha256 !== lineage.lifecycle_eligibility.source_policy_provenance_manifest_sha256 || sourcePolicy.artifact_sha256 !== lineage.lifecycle_eligibility.source_policy_provenance_artifact_sha256 ||
      sourcePolicy.lifecycle_release_id !== lineage.lifecycle_eligibility.source_policy_predecessor_lifecycle_release_id || sourcePolicy.lifecycle_manifest_sha256 !== lineage.lifecycle_eligibility.source_policy_predecessor_lifecycle_manifest_sha256 ||
      sourcePolicy.taxonomy_sha256 !== lineage.lifecycle_eligibility.taxonomy_sha256 || sourcePolicy.temporal_release_id !== lineage.temporal_claim_matrix.release_id ||
      sourcePolicy.temporal_manifest_sha256 !== lineage.temporal_claim_matrix.manifest_sha256 || !sha(sourcePolicy.source_profile_counts_sha256) ||
      sourcePolicy.policy_files_verified !== 15 || sourcePolicy.profile_policy_rows_verified !== 8011835 ||
      !exactKeys(sourcePolicy.profile_export_policy_counts, ["local-review-only", "public"]) || sourcePolicy.profile_export_policy_counts["local-review-only"] !== 1850619 ||
      sourcePolicy.profile_export_policy_counts.public !== 6161216 || sourcePolicy.authorization_granted !== false || sourcePolicy.acquisition_authorized !== false || sourcePolicy.export_authorized !== false) return false;
  return typeof payload.assessment_as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.assessment_as_of);
}

function NationalObjectiveReadinessCard({ value, unavailable }: { value: NationalObjectiveReadiness | null; unavailable: boolean }) {
  if (!value) return (
    <section className="objective-readiness-card" aria-label="National Objective Readiness">
      <div className="objective-readiness-heading"><div><span>National Objective Readiness</span><strong>Unavailable</strong></div><small>Verified readiness evidence could not be validated.</small></div>
      <p role="status">{unavailable ? "Fail-closed: no prior result, zero, or percentage is substituted." : "Loading verified objective evidence…"}</p>
    </section>
  );
  const blockerLabels: Record<string, string> = {
    "authoritative-current-usps-denominator-unavailable": "USPS denominator unavailable",
    "complete-current-delivery-zip-registry-not-established": "Current delivery-ZIP registry not established",
    "all-business-universe-unmeasured": "All-business universe unmeasured",
    "current-business-operations-not-independently-verified": "Current operation not independently verified",
    "entity-resolution-benchmark-gate-not-passed": "Entity-resolution benchmark gate not passed",
    "entity-resolution-not-applied": "Entity resolution not applied",
    "nationwide-industry-universe-unmeasured": "Nationwide industry universe unmeasured",
    "broad-jurisdiction-source-gaps": "Broad-jurisdiction source gaps: 40",
    "current-operation-not-independently-verified": "Temporal/current operation not independently verified",
    "reporting-only-sites-not-eligible-or-verified": "Reporting-only sites not eligible or verified: 13,182",
    "entity-geography-relationship-not-complete": "Entity geography is partial: postal validity and point coverage are incomplete",
    "lifecycle-active-eligibility-not-established": "Lifecycle eligibility not established: 0 / 8,011,835 eligible",
    "lifecycle-stale-records-present": "Lifecycle records stale: 24,230",
    "lifecycle-unknown-or-contradictory": "Lifecycle records unknown or contradictory: 635,899",
  };
  return (
    <section className="objective-readiness-card" aria-label="National Objective Readiness">
      <div className="objective-readiness-heading"><div><span>National Objective Readiness</span><strong>Not accepted</strong></div><small>Assessment {value.assessment_as_of} · report-only</small></div>
      <p className="objective-readiness-caveat">Governed dataset availability is not all-business completeness.</p>
      <div className="objective-readiness-ledger" aria-label="Twelve objective readiness requirements">
        {value.requirements_ledger.map((row) => <div key={row.requirement}><span>{row.requirement.replaceAll("-", " ")}</span><strong>{row.status}</strong>{row.requirement === "broad-state-coverage" && <small>{row.current_gap_count} broad jurisdiction gaps / {row.jurisdiction_count} jurisdictions</small>}{row.requirement === "temporal-and-current-operation" && <small>Effective source status: {row.effective_source_defined_current_membership_sources} source-defined current · {row.effective_non_active_reporting_sources} non-active reporting · {row.effective_annual_aggregate_sources} annual aggregate · {row.effective_unknown_status_sources} unknown. Publisher cohort provenance retains {row.source_cohort_current_membership_sources} current-labelled sources; Los Angeles contributes {row.mismatch_profiles?.toLocaleString("en-US")} null-status profiles to the unknown class. Current operation remains unverified.</small>}{row.requirement === "entity-geography-relationship" && <small>{row.profile_count?.toLocaleString("en-US")} profiles / {row.registry_profile_count?.toLocaleString("en-US")} registry profiles; {row.point_assignment_counts?.["assigned-single-county"]?.toLocaleString("en-US")} deterministic county point assignments, {row.point_assignment_counts?.["missing-geocode"]?.toLocaleString("en-US")} missing geocode, {row.point_assignment_counts?.["unassignable-legacy-coordinate-crs-unproven"]?.toLocaleString("en-US")} CRS-unproven. Postal: {row.postal_counts?.["same-code-zcta-candidate"]?.toLocaleString("en-US")} same-code ZCTA candidates, {row.postal_counts?.["outside-zcta"]?.toLocaleString("en-US")} outside, {row.postal_counts?.["explicit-placeholder"]?.toLocaleString("en-US")} placeholder. USPS validity is unverified for {row.usps_unverified_profile_count?.toLocaleString("en-US")} profiles; ZCTA correspondence is not membership; no entity polygons.</small>}{row.requirement === "lifecycle-eligibility" && <small>{row.active_business_eligible_count?.toLocaleString("en-US")} eligible / {row.profile_count?.toLocaleString("en-US")} profiles (registry denominator {row.registry_profile_count?.toLocaleString("en-US")}) · {row.stale_count?.toLocaleString("en-US")} stale · {row.unknown_or_contradictory_count?.toLocaleString("en-US")} unknown/contradictory · {row.verified_current_operation_count?.toLocaleString("en-US")} independently verified operating</small>}{row.requirement === "reporting-only-site-qualification" && <small>{row.site_count?.toLocaleString("en-US")} reporting-only sites, separate from matching-profile denominator {row.matching_profile_denominator?.toLocaleString("en-US")}; combined retained site-evidence rows: {row.combined_retained_site_evidence_count?.toLocaleString("en-US")} (not a complete-business denominator). {row.zip_present_count?.toLocaleString("en-US")} have source ZIP5 and {row.zip_absent_count?.toLocaleString("en-US")} have no ZIP5 (27 missing, 145 placeholders). {row.point_assigned_count?.toLocaleString("en-US")} retained county point assignments; {row.point_assignment_ineligible_count?.toLocaleString("en-US")} Ohio rows are source-policy-ineligible. All {row.usps_unverified_count?.toLocaleString("en-US")} USPS validity unverified; 0 active-eligible/current-operation verified.</small>}{row.requirement === "business-entity-source-policy-provenance" && <small>All {row.source_count?.toLocaleString("en-US")} source policy files hash-verified across {row.profile_count?.toLocaleString("en-US")} retained profiles (including {row.profile_policy_rows_verified?.toLocaleString("en-US")} lifecycle policy matches). Integrity only; this does not grant acquisition, use, or export authority.</small>}</div>)}
      </div>
      <div className="objective-readiness-blockers"><strong>Blocking requirements</strong><div>{value.acceptance.blockers.map((code: string) => <span key={code}>{blockerLabels[code] ?? code.replaceAll("-", " ")}</span>)}</div></div>
      <details className="objective-readiness-lineage"><summary>Verified evidence lineage</summary><ul>{Object.entries(value.lineage).map(([key, item]) => <li key={key}>{key.replaceAll("_", " ")}: <code>{item.release_id}</code>{Object.entries(item).filter(([field]) => field.endsWith("_sha256")).map(([field, hash]) => <small key={field}>{field.replaceAll("_", " ")}: <code>{hash}</code></small>)}</li>)}</ul></details>
    </section>
  );
}

export function CoverageWorkspace({
  industries = false,
  stateCode,
  categoryCode,
  onStateChange,
  onCategoryChange,
  onNavigate,
}: {
  industries?: boolean;
  stateCode?: string;
  categoryCode?: string;
  onStateChange?: (code: string) => void;
  onCategoryChange?: (code: string) => void;
  onNavigate?: (tab: WorkspaceTab) => void;
}) {
  const [localCategory, setCategory] = useState("general-business"),
    [localState, setState] = useState(""),
    [result, setResult] = useState<{ scope: string; view: Matrix } | null>(
      null,
    ),
    [shares, setShares] = useState<Shares | null>(null),
    [error, setError] = useState(""),
    [temporal, setTemporal] = useState<TemporalMatrix | null>(null),
    [temporalError, setTemporalError] = useState(false),
    [objectiveReadiness, setObjectiveReadiness] = useState<NationalObjectiveReadiness | null>(null),
    [objectiveReadinessError, setObjectiveReadinessError] = useState(false),
    [mapMode, setMapMode] = useState<"availability" | "exact-zip-evidence">("availability"),
    [overall, setOverall] = useState(true),
    [adjacentResult, setAdjacentResult] = useState<{
      state: string;
      view: BroadGapAdjacentView | null;
      error: boolean;
    } | null>(null);
  const category = categoryCode ?? localCategory,
    state = stateCode ?? localState,
    scope = category + ":" + state,
    view = result?.scope === scope ? result.view : null;
  function chooseState(value: string) {
    setState(value);
    onStateChange?.(value);
    setResult(null);
    setError("");
  }
  function chooseCategory(value: string) {
    setOverall(value === "overall");
    if (value === "overall") return;
    setCategory(value);
    onCategoryChange?.(value);
    setResult(null);
    setError("");
  }
  useEffect(() => {
    const controller = new AbortController(),
      query = new URLSearchParams({ category });
    if (state) query.set("state", state);
    void runnerJson<Matrix>("/api/business-map/goal-completion?" + query, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setResult({ scope, view: value });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(
            "Verified coverage evidence is unavailable. No older result or zero is substituted.",
          );
        }
      });
    return () => controller.abort();
  }, [state, category, scope]);
  useEffect(() => {
    if (!industries) return;
    const controller = new AbortController();
    void runnerJson<Shares>("/api/business-map/state-summary?include_territories=false",{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setShares(value)}).catch(()=>{if(!controller.signal.aborted)setShares(null)});
    return () => controller.abort();
  }, [industries]);
  useEffect(() => {
    if (industries) return;
    const controller = new AbortController();
    setObjectiveReadiness(null);
    setObjectiveReadinessError(false);
    void runnerJson<unknown>("/api/business-map/national-objective-readiness", {
      signal: controller.signal,
    }).then((value) => {
      if (controller.signal.aborted) return;
      const valid = validNationalObjectiveReadiness(value);
      setObjectiveReadiness(valid ? value : null);
      setObjectiveReadinessError(!valid);
    }).catch((reason) => {
      if (!controller.signal.aborted && reason?.name !== "AbortError") {
        setObjectiveReadiness(null);
        setObjectiveReadinessError(true);
      }
    });
    return () => controller.abort();
  }, [industries]);
  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<TemporalMatrix>("/api/business-map/temporal-claim-matrix", {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setTemporal(validTemporalMatrix(value) ? value : null);
        setTemporalError(!validTemporalMatrix(value));
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError") {
          setTemporal(null);
          setTemporalError(true);
        }
      });
    return () => controller.abort();
  }, []);
  const aggregate = !industries && overall && !!view?.overall_jurisdictions;
  const mapRows =
    (aggregate ? view?.overall_jurisdictions : view?.jurisdictions) ?? [];
  const rows = mapRows.map((row) => ({
    ...row,
    percent:
      row.denominator > 0 ? (row.available / row.denominator) * 100 : null,
  }));
  const selected = rows.find((row) => row.code === state),
    selectedCategoryLabel = aggregate
      ? "All expected datasets"
      : categoryLabel(category),
    national = view?.available ? summarizeAvailability(rows) : null,
    industryState = shares?.states.find(
      (row) => row.postal_abbreviation === state,
    );
  useEffect(() => {
    if (category !== "general-business" || !state || !selected?.broad_layer_gap)
      return;
    const requestedState = state,
      controller = new AbortController();
    void runnerJson<BroadGapAdjacentView>(
      "/api/business-map/broad-organization-adjacent-evidence?state=" +
        encodeURIComponent(state),
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setAdjacentResult({
            state: requestedState,
            view: validBroadGapAdjacentView(value, requestedState)
              ? value
              : null,
            error: !validBroadGapAdjacentView(value, requestedState),
          });
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setAdjacentResult({ state: requestedState, view: null, error: true });
      });
    return () => controller.abort();
  }, [category, state, selected?.broad_layer_gap]);
  const connectivity = (
    <div
      className="representation-table"
      role="region"
      aria-label="National and selected-state reporting-industry dataset availability"
      tabIndex={0}
    >
      <table>
        <caption>
          Comparable governed dataset availability by reporting industry
        </caption>
        <thead>
          <tr>
            <th scope="col">Reporting industry</th>
            <th scope="col">National dataset availability</th>
            <th scope="col">Available / expected</th>
            <th scope="col">Missing / unknown</th>
            <th scope="col">{state || "Selected state"} dataset availability</th>
          </tr>
        </thead>
        <tbody>
          {(view?.category_summaries ?? []).map((summary) => (
            <tr key={summary.category_id}>
              <th scope="row">{categoryLabel(summary.category_id)}</th>
              <td>{percent(summary.national.denominator_percent)}</td>
              <td>
                {count(summary.national.available)} /{" "}
                {count(summary.national.expected)}
              </td>
              <td>
                {count(
                  summary.national.missing_or_unknown ??
                    summary.national.unmeasured,
                )}
              </td>
              <td>
                {summary.selected_state ? (
                  <>
                    {percent(
                      summary.selected_state.expected
                        ? (summary.selected_state.available /
                            summary.selected_state.expected) *
                            100
                        : null,
                    )}
                    <small>
                      {count(summary.selected_state.available)} /{" "}
                      {count(summary.selected_state.expected)} expected
                    </small>
                  </>
                ) : (
                  "Select a state"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="panel focused-workspace">
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">
            {industries
              ? "National industry alignment"
              : "National collection progress"}
          </span>
          <h2>{industries ? "Industry Summary" : "State evidence"}</h2>
        </div>
        <p>
          {industries
            ? "Follow each industry across the country and the selected state."
            : "Select a state to compare retained and missing industry evidence beside the map."}
        </p>
      </div>
      <p className="scope-note">
        {!industries && mapMode === "exact-zip-evidence"
          ? "Exact-ZIP source evidence = positive retained source-evidence ZIP keys ÷ governed state-assigned same-code Census ZCTA cohort keys for the selected source dimension. It is not business completeness, business share, current-operation coverage, or a USPS ZIP-to-state assignment."
          : "Overview compares retained dataset evidence with the governed datasets expected for each reporting industry and jurisdiction. This is an evidence-availability ratio, not an estimate of all businesses, geocode completeness, or an authoritative USPS ZIP denominator. This is not all-business or GDP completeness. Unknown cells remain unknown; measured zero and not applicable stay distinct."}
      </p>
      {industries && <p className="industry-evidence-boundary"><strong>Industry status reports evidence actually retained.</strong> It does not require an all-business denominator, complete geocoding, or nationwide industry completeness. Missing and unmeasured evidence remains unknown rather than zero.</p>}
      {!industries && <p className="industry-evidence-boundary"><strong>Unresolved geography never blocks this map.</strong> Private and unique ZIPs, zero-population delivery areas, parks, tribal lands, private property, and other space without a governed Census ZCTA remain visible through the surrounding state geography and are reported as unresolved—not silently assigned, counted as missing businesses, or converted to zero. Select a state to inspect each retained unresolved component as a state/cardinal reference area that stays distinct from ZIP and Census boundaries. Park, tribal and private-land classifications remain unresolved where no governed overlay is retained.</p>}
      {!industries && <NationalObjectiveReadinessCard value={objectiveReadiness} unavailable={objectiveReadinessError} />}
      {!industries && mapMode === "availability" && <StateExactZipEvidencePanel state={state} />}
      <div className="workspace-filters">
        {!industries && <label>Map mode <select aria-label="State map mode" value={mapMode} onChange={event=>setMapMode(event.target.value==="exact-zip-evidence"?"exact-zip-evidence":"availability")}><option value="availability">Dataset availability</option><option value="exact-zip-evidence">Exact-ZIP source evidence</option></select></label>}
        {(industries || mapMode === "availability") && <label>
          {industries ? "Reporting industry" : "Coverage category"}{" "}
          <select
            aria-label={industries ? "Reporting industry" : "Coverage category"}
            value={!industries && overall ? "overall" : category}
            onChange={(event) => chooseCategory(event.target.value)}
          >
            {!industries && (
              <option value="overall">All expected datasets</option>
            )}
            {(view?.categories ?? [category]).map((id) => (
              <option key={id} value={id}>
                {categoryLabel(id)}
              </option>
            ))}
          </select>
        </label>}
        <label>
          State{" "}
          <select
            aria-label="Coverage state"
            value={state}
            onChange={(event) => chooseState(event.target.value)}
          >
            <option value="">All states / choose a state</option>
            {rows.map((row) => (
              <option key={row.code} value={row.code}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p role="status">Verifying local coverage…</p>}
      {view && !view.available && (
        <p role="status">
          {view.status.replaceAll("-", " ")}. Completion is unmeasured.
        </p>
      )}
      {national && (industries || mapMode === "availability") && (
        <div
          className="coverage-national-metrics"
          aria-label="National dataset expectations"
        >
          <article>
            <span>National evidence availability</span>
            <strong>{percent(national.completionPercent)}</strong>
            <small>
              {count(national.available)} / {count(national.expected)} expected
              cells
            </small>
          </article>
          <article>
            <span>Missing / unknown</span>
            <strong>{count(national.expected - national.available)}</strong>
            <small>
              {count(national.unmeasured)} unmeasured · Unknown, not zero
            </small>
          </article>
          <article>
            <span>States with retained evidence</span>
            <strong>
              {national.connected} / {national.jurisdictions}
            </strong>
            <small>{selectedCategoryLabel} availability</small>
          </article>
        </div>
      )}
      {industries ? (
        <>
          <GovernedIndustryStatus state={state} />
          <h3>Industry connectivity</h3>
          {view?.available ? (
            connectivity
          ) : (
            <p>Verified dataset connectivity is unavailable.</p>
          )}
          {shares?.available && (
            <section className="industry-summary" aria-label="Industry summary">
              <h3>Industry summary</h3>
              <div className="coverage-national-metrics">
                <article>
                  <span>National evidence rows</span>
                  <strong>
                    {count(shares.national_category_counts[category])}
                  </strong>
                  <small>
                    {percent(
                      shares.national_category_percent_of_collected_evidence[
                        category
                      ],
                    )}{" "}
                    of collected category evidence
                  </small>
                </article>
                <article>
                  <span>{state || "Selected state"} evidence rows</span>
                  <strong>
                    {count(industryState?.category_counts[category])}
                  </strong>
                  <small>
                    {percent(
                      industryState?.percent_of_category_nationwide[category],
                    )}{" "}
                    of this category nationwide
                  </small>
                </article>
              </div>
              <details>
                <summary>All national and state evidence shares</summary>
                <div className="representation-table">
                  <table>
                    <caption>
                      Source categories overlap; these rows are not additive
                      businesses or GDP weights
                    </caption>
                    <thead>
                      <tr>
                        <th>Source category</th>
                        <th>National rows</th>
                        <th>Share of retained evidence</th>
                        <th>{state || "Selected state"} rows</th>
                        <th>State share nationwide</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shares.categories.map((row) => (
                        <tr key={row.id}>
                          <th>{row.label}</th>
                          <td>
                            {count(shares.national_category_counts[row.id])}
                          </td>
                          <td>
                            {percent(
                              shares
                                .national_category_percent_of_collected_evidence[
                                row.id
                              ],
                            )}
                          </td>
                          <td>
                            {count(industryState?.category_counts[row.id])}
                          </td>
                          <td>
                            {percent(
                              industryState?.percent_of_category_nationwide[
                                row.id
                              ],
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}
        </>
      ) : (
        mapMode === "exact-zip-evidence" ? <StateExactZipEvidenceMap selected={state} onSelect={chooseState}/> : view?.available && (
          <div className="coverage-focus-layout">
            <div>
              <h3>50 states and D.C. · governed dataset availability</h3>
              <StateAvailabilityChoropleth
                rows={rows}
                selected={state}
                categoryLabel={selectedCategoryLabel}
                onSelect={chooseState}
                measure="expected"
              />
              <details>
                <summary>
                  Accessible state tiles — same values as the map
                </summary>
                <div className="coverage-state-tiles">
                  {rows.map((row) => (
                    <button
                      key={row.code}
                      aria-pressed={state === row.code}
                      aria-label={
                        row.name +
                        ": " +
                        percent(row.percent) +
                        ", " +
                        row.available +
                        " of " +
                        row.denominator +
                        " expected, " +
                        row.unmeasured +
                        " unmeasured"
                      }
                      onClick={() => chooseState(row.code)}
                    >
                      <strong>{row.code}</strong>
                      <span>{percent(row.percent)}</span>
                      <small>
                        {row.available}/{row.denominator} expected
                      </small>
                      <small>{row.unmeasured} unmeasured</small>
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <aside
              className="coverage-selected"
              aria-label="Selected state summary"
            >
              <h3>{selected?.name ?? "Select a state"}</h3>
              {selected ? (
                <>
                  <p className="state-completion-value">
                    <strong>{percent(selected.percent)}</strong>
                    <span>{completionStateLabel(selected)}</span>
                  </p>
                  <dl className="summary-stats">
                    <dt>Available / expected</dt>
                    <dd>
                      {selected.available} / {selected.denominator}
                    </dd>
                    <dt>Unmeasured expectations</dt>
                    <dd>{selected.unmeasured}</dd>
                    <dt>Measured-only availability</dt>
                    <dd>
                      {percent(
                        selected.measured
                          ? (selected.available / selected.measured) * 100
                          : null,
                      )}
                    </dd>
                    <dt>All-business completeness</dt>
                    <dd>Unknown</dd>
                  </dl>
                  <p>
                    Broad state organization layer:{" "}
                    {selected.broad_layer_gap ? "Gap" : "Available"}.
                    All-business completeness: Unknown.
                  </p>
                  <h4>Industry connections</h4>
                  <div className="state-industry-progress">
                    {(view.category_summaries ?? []).map((summary) => (
                      <div key={summary.category_id}>
                        <span>{categoryLabel(summary.category_id)}</span>
                        <strong>
                          {percent(
                            summary.selected_state?.expected
                              ? (summary.selected_state.available /
                                  summary.selected_state.expected) *
                                  100
                              : null,
                          )}
                        </strong>
                        <small>
                          {count(summary.selected_state?.available)} /{" "}
                          {count(summary.selected_state?.expected)} expected
                          datasets
                        </small>
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary>
                      {categoryLabel(category)} source records and gaps
                    </summary>
                    <ul>
                      {view.selected?.code === state &&
                        view.selected.category.datasets.map((row) => (
                          <li key={row.dataset_id}>
                            <strong>{row.label}</strong>:{" "}
                            {row.availability_status.replaceAll("-", " ")} ·{" "}
                            {count(row.state_record_count)} state records
                            {row.gap_reason && " · " + row.gap_reason}
                          </li>
                        ))}
                    </ul>
                    {view.selected?.adjacent_evidence?.map((item) => (
                      <article key={item.dataset_id}>
                        <h5>
                          National IRS adjacent evidence — outside availability
                        </h5>
                        <p>
                          {count(item.organization_count)} IRS tax-exempt
                          records grouped by reported filing-address state.
                        </p>
                        <dl>
                          <dt>Same-code ZCTA records</dt>
                          <dd>{count(item.record_zcta_count)}</dd>
                          <dt>Nonpolygon records</dt>
                          <dd>{count(item.record_nonpolygon_count)}</dd>
                        </dl>
                        <p>{item.row_semantics}</p>
                        <ul>
                          {item.limitations.map((value) => (
                            <li key={value}>{value}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                    {category === "general-business" &&
                      selected.broad_layer_gap && (
                        <BroadGapAdjacentEvidencePanel
                          state={state}
                          view={
                            adjacentResult?.state === state
                              ? adjacentResult.view
                              : null
                          }
                          error={
                            adjacentResult?.state === state &&
                            adjacentResult.error === true
                          }
                        />
                      )}
                  </details>
                </>
              ) : (
                <p>
                  Click a state on the map to see completion, industry
                  connections and gaps here.
                </p>
              )}
            </aside>
          </div>
        )
      )}
      {!industries && mapMode === "availability" && view?.available && (
        <details className="supporting-evidence">
          <summary>
            Nationwide industry connectivity and selected-state availability
          </summary>
          {connectivity}
        </details>
      )}
      <div className="workspace-path">
        <span>{state ? "Selected state: " + state : "National view"}</span>
        {onNavigate && (
          <>
            <button
              onClick={() =>
                onNavigate(industries ? "State Evidence" : "Industry Summary")
              }
            >
              {industries ? "View state evidence" : "View industry summary"}
            </button>
            <button onClick={() => onNavigate("ZIP Economics")}>
              Explore ZIP economics
            </button>
          </>
        )}
      </div>
      <details className="supporting-evidence">
        <summary>Coverage methodology and supporting evidence</summary>
        <p>
          Versioned denominator: {view?.denominator?.version ?? "Unavailable"}.
          Release: {view?.release_id ?? "Unavailable"}. 100% availability
          applies only to the selected category or expected dataset set and does
          not establish complete business collection.
        </p>
        <OutsideNationalReporting comparison={view?.scope_comparison} />
        <TemporalCoverageSummary view={temporal} error={temporalError} />
        {industries && (
          <>
            <BusinessIntelligenceReadiness mode="industry" />
            <CensusZbpIndustryHeatmap />
            <CensusNonemployerCountyHeatmap />
          </>
        )}
        <RetainedCountyWorkspace stateCode={state} />
      </details>
      {!industries&&<><NonZctaGeographyStatus/><CensusZctaResidualLayer state={state}/></>}
    </section>
  );
}
type ZipEvidence = {
  source_native_status_distribution?: SourceNativeStatusView | null;
  census_zbp_industry_profile?: CensusZbpZipProfileView;
  qualification?: QualificationView;
  operational_admission?: {
    status: string;
    production_admission: boolean | null;
    blockers: string[];
  };
  zip5: string;
  evidence_status: string;
  coverage_status?: string | null;
  classification?: { class: string; ordinary_zip5_eligible?: boolean } | null;
  governed_zcta: { status: string; geoid: string | null };
  selected_coverage_geography?: {
    zcta_status: string | null;
    zcta_geoid: string | null;
    spatial_zip_polygon_membership_status: string | null;
    material_county_count: number | null;
    county_assignment: string | null;
  } | null;
  zip_quality?: {
    status?: string;
    usps_operational_status?: string;
    usps_operational_evidence?: {
      evidence_status: string;
      operational_status?: string | null;
      reason?: string;
    };
    unresolved_proof_gap_codes?: string[];
  };
  coverage_gap_codes?: string[];
  counts: null | {
    physical_sites: number;
    establishments: number;
    employer_establishments: number | null;
  };
  bindings: Record<string, string | null>;
  category_evidence?: {
    category_id: string;
    category_label: string;
    status: string;
    semantics: string;
    positive_source_contributions: Array<{
      source_id: string;
      source_release_id: string | null;
      positive_counts: Record<string, number>;
    }>;
  };
};
export type ZctaEconomicReadiness = {
  schema_version: string;
  zcta: string;
  available: boolean;
  status: string;
  readiness: null | {
    population_2020: number;
    housing_units_2020: number;
    zbp_publication_status: string;
    relationship_count: number;
    material_relationship_count: number;
    state_fips: string[];
    county_geoids: string[];
    direct_county_gdp_count: number;
    missing_county_gdp_geoids: string[];
    direct_gdp_relationship_coverage: number | null;
    model_status: string;
    blockers: string[];
  };
  provenance: {
    release_id: string;
    manifest_sha256: string;
    artifact_sha256: string;
    created_at: string;
    geography_release_id: string;
    input_releases: Array<{
      dataset_id: string;
      release_id: string;
      manifest_sha256: string;
    }>;
  };
  limitations: string[];
  claims: {
    official_zip_code: false;
    active_businesses: false;
    numeric_gdp_or_demographic_allocation: false;
  };
};
type CmsDirectoryCount = {
  directory_rows: number;
  reported_states: Record<string, number>;
};
type CmsDirectorySource = {
  release_id: string;
  manifest_sha256: string;
  source_dates: { issued: string; modified: string; released: string };
  observed_at: string;
  completed_at: string;
  provenance_mode: string;
};
export type CmsDirectoryZipEvidence = {
  available: boolean;
  zip5: string;
  status: string;
  claims: Record<string, unknown>;
  schema_version?: string;
  row?: null | {
    zip5: string;
    zip4: null;
    hospital: CmsDirectoryCount;
    nursing_home: CmsDirectoryCount;
  };
  release_id?: string;
  manifest_sha256?: string;
  created_at?: string;
  bindings?: {
    sources: { hospital: CmsDirectorySource; nursing_home: CmsDirectorySource };
  };
  denominators?: Record<
    "hospital" | "nursing_home",
    CmsDirectoryCount & {
      state_dc_rows: number;
      territory_rows: number;
      unknown_state_rows: number;
      missing_zip_rows: number;
      zip_present_rows: number;
    }
  >;
  source_replay_performed?: false;
  semantics?: string;
};
const evidenceLabel = (value: string | null | undefined) =>
  value ? value.replaceAll("-", " ") : "Unknown — not evidenced";
const machine = (value: string | null | undefined) => value ?? "unavailable";
const exactKeys = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(),
    expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};
const cmsClaims = {
  export_policy: "local-review-only",
  production_enrollment: false,
  national_reporting_denominator_enrollment: false,
  current_pointer_written: false,
  network_requests: 0,
  business_count: null,
  physical_site_count: null,
  current_operating_count: null,
  national_completeness_percent: null,
  coordinates_retained: false,
  county_assignment_performed: false,
  zcta_membership_inferred: false,
  zip4_aggregated: false,
  public_export_authorized: false,
};
const cmsStateCounts = (value: unknown, total: number) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let sum = 0;
  for (const [key, count] of Object.entries(value)) {
    if (
      !(key === "missing" || /^reported:[^\u0000-\u001f]{0,32}$/u.test(key)) ||
      !Number.isSafeInteger(count) ||
      Number(count) <= 0 ||
      Number(count) > 25000
    )
      return false;
    sum += Number(count);
  }
  return sum === total;
};
const cmsCount = (value: unknown) =>
  exactKeys(value, ["directory_rows", "reported_states"]) &&
  Number.isSafeInteger((value as CmsDirectoryCount).directory_rows) &&
  (value as CmsDirectoryCount).directory_rows >= 0 &&
  (value as CmsDirectoryCount).directory_rows <= 25000 &&
  cmsStateCounts(
    (value as CmsDirectoryCount).reported_states,
    (value as CmsDirectoryCount).directory_rows,
  );
const iso = (value: unknown) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const calendarDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};
export function validCmsDirectoryZipEvidence(
  value: unknown,
  zip5: string,
): value is CmsDirectoryZipEvidence {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !/^\d{5}$/.test(zip5)
  )
    return false;
  const view = value as CmsDirectoryZipEvidence;
  if (
    view.zip5 !== zip5 ||
    !exactKeys(view.claims, Object.keys(cmsClaims)) ||
    Object.entries(cmsClaims).some(
      ([key, expected]) => view.claims[key] !== expected,
    )
  )
    return false;
  if (view.available === false)
    return (
      exactKeys(view, ["available", "zip5", "status", "claims"]) &&
      view.status === "not-registered"
    );
  if (
    !exactKeys(view, [
      "schema_version",
      "available",
      "zip5",
      "status",
      "row",
      "release_id",
      "manifest_sha256",
      "created_at",
      "bindings",
      "denominators",
      "claims",
      "source_replay_performed",
      "semantics",
    ]) ||
    view.available !== true ||
    view.schema_version !== "cms-retained-directory-zip-evidence@1.0.0" ||
    !/^cms-retained-directory-zip-evidence-[a-f0-9]{64}$/.test(
      view.release_id ?? "",
    ) ||
    !/^[a-f0-9]{64}$/.test(view.manifest_sha256 ?? "") ||
    !iso(view.created_at) ||
    view.source_replay_performed !== false ||
    view.semantics !==
      "Separate dated directory-row evidence only; missing source/ZIP evidence is not zero businesses or closure."
  )
    return false;
  if (
    !exactKeys(view.bindings, ["sources"]) ||
    !exactKeys(view.bindings?.sources, ["hospital", "nursing_home"]) ||
    !exactKeys(view.denominators, ["hospital", "nursing_home"])
  )
    return false;
  for (const kind of ["hospital", "nursing_home"] as const) {
    const source = view.bindings!.sources[kind] as unknown as Record<
        string,
        unknown
      >,
      artifact = source.selected_artifact as Record<string, unknown>,
      dates = source.source_dates;
    const sourceKeys =
      kind === "hospital"
        ? [
            "selection_path",
            "selection_sha256",
            "manifest_path",
            "manifest_sha256",
            "release_id",
            "selected_artifact",
            "source_dates",
            "observed_at",
            "completed_at",
            "provenance_mode",
          ]
        : [
            "selection_path",
            "selection_sha256",
            "manifest_path",
            "manifest_sha256",
            "release_id",
            "selected_artifact",
            "source_dates",
            "observed_at",
            "completed_at",
            "provenance_mode",
            "historical_failed_run_id",
            "historical_failed_at",
            "historical_failure_rewritten",
          ];
    if (
      !exactKeys(source, sourceKeys) ||
      !["selection_sha256", "manifest_sha256"].every((key) =>
        /^[a-f0-9]{64}$/.test(String(source[key])),
      ) ||
      !["selection_path", "manifest_path", "release_id"].every(
        (key) => typeof source[key] === "string" && Boolean(source[key]),
      ) ||
      source.provenance_mode !==
        (kind === "hospital"
          ? "native-acquisition"
          : "retained-native-source-recovery") ||
      !iso(source.observed_at) ||
      !iso(source.completed_at) ||
      !exactKeys(dates, ["issued", "modified", "released"]) ||
      !Object.values(dates as Record<string, unknown>).every(calendarDate) ||
      !exactKeys(
        artifact,
        kind === "hospital"
          ? ["path", "bytes", "sha256", "exportPolicy"]
          : ["path", "bytes", "sha256", "rows", "exportPolicy"],
      ) ||
      artifact.path !== "selected.jsonl" ||
      artifact.exportPolicy !== "local-review-only" ||
      !Number.isSafeInteger(artifact.bytes) ||
      Number(artifact.bytes) <= 0 ||
      !/^[a-f0-9]{64}$/.test(String(artifact.sha256))
    )
      return false;
    if (
      kind === "nursing_home" &&
      (source.historical_failure_rewritten !== false ||
        !iso(source.historical_failed_at) ||
        typeof source.historical_failed_run_id !== "string" ||
        !Number.isSafeInteger(artifact.rows) ||
        Number(artifact.rows) <= 0)
    )
      return false;
    const denominator = view.denominators![kind];
    if (
      !exactKeys(denominator, [
        "directory_rows",
        "state_dc_rows",
        "territory_rows",
        "unknown_state_rows",
        "missing_zip_rows",
        "zip_present_rows",
        "reported_states",
      ]) ||
      !(
        [
          "directory_rows",
          "state_dc_rows",
          "territory_rows",
          "unknown_state_rows",
          "missing_zip_rows",
          "zip_present_rows",
        ] as const
      ).every(
        (key) =>
          Number.isSafeInteger(denominator[key]) &&
          denominator[key] >= 0 &&
          denominator[key] <= 25000,
      ) ||
      !cmsStateCounts(
        denominator.reported_states,
        denominator.directory_rows,
      ) ||
      denominator.directory_rows !==
        denominator.state_dc_rows +
          denominator.territory_rows +
          denominator.unknown_state_rows ||
      denominator.directory_rows !==
        denominator.missing_zip_rows + denominator.zip_present_rows
    )
      return false;
  }
  if (view.row == null)
    return view.status === "absent-from-retained-directory-zip-evidence";
  const row = view.row;
  if (
    !exactKeys(row, ["zip5", "zip4", "hospital", "nursing_home"]) ||
    row.zip5 !== zip5 ||
    row.zip4 !== null ||
    view.status !== "retained-directory-evidence-present" ||
    !cmsCount(row.hospital) ||
    !cmsCount(row.nursing_home) ||
    row.hospital.directory_rows + row.nursing_home.directory_rows <= 0
  )
    return false;
  for (const kind of ["hospital", "nursing_home"] as const)
    for (const [state, total] of Object.entries(row[kind].reported_states)) {
      const denominatorTotal = view.denominators![kind].reported_states[state];
      if (!Number.isSafeInteger(denominatorTotal) || total > denominatorTotal)
        return false;
    }
  return (
    row.hospital.directory_rows <=
      view.denominators!.hospital.zip_present_rows &&
    row.nursing_home.directory_rows <=
      view.denominators!.nursing_home.zip_present_rows
  );
}
export function CmsDirectoryZipPanel({
  view,
}: {
  view: CmsDirectoryZipEvidence;
}) {
  if (!view.available)
    return (
      <section aria-labelledby="cms-directory-title">
        <h3 id="cms-directory-title">Retained CMS directory evidence</h3>
        <p role="status">
          The retained CMS ZIP directory index is not registered. No absence,
          zero, or closure is inferred.
        </p>
      </section>
    );
  const row = view.row,
    sources = view.bindings!.sources;
  return (
    <section
      aria-labelledby="cms-directory-title"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h3 id="cms-directory-title">
        Retained CMS directory evidence · reported ZIP {view.zip5}
      </h3>
      <p>
        Separate dated hospital and nursing-home directory rows. These are not
        active-business counts, verified physical sites, current-operation
        findings, or completeness measures.
      </p>
      {row ? (
        <>
          <dl>
            <dt>Hospital directory rows</dt>
            <dd>{count(row.hospital.directory_rows)}</dd>
            <dt>Nursing-home directory rows</dt>
            <dd>{count(row.nursing_home.directory_rows)}</dd>
          </dl>
          {(["hospital", "nursing_home"] as const).map((kind) => (
            <details key={kind}>
              <summary>
                {kind === "hospital" ? "Hospital" : "Nursing-home"}{" "}
                reported-state distribution
              </summary>
              {Object.keys(row[kind].reported_states).length ? (
                <dl>
                  {Object.entries(row[kind].reported_states).map(
                    ([state, total]) => (
                      <div key={state}>
                        <dt>
                          {state === "missing"
                            ? "Missing reported state"
                            : state.replace("reported:", "Reported ")}
                        </dt>
                        <dd>{count(total)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              ) : (
                <p>
                  No {kind === "hospital" ? "hospital" : "nursing-home"} rows
                  were retained for this ZIP.
                </p>
              )}
            </details>
          ))}
        </>
      ) : (
        <p role="status">
          No retained hospital or nursing-home directory row reports ZIP{" "}
          {view.zip5}. This is not zero businesses, closure, ZIP invalidity, or
          evidence that facilities are absent.
        </p>
      )}
      <details>
        <summary>Dated release and source lineage</summary>
        <p>
          Derived release: <code>{view.release_id}</code> · created{" "}
          {view.created_at} · manifest <code>{view.manifest_sha256}</code>
        </p>
        {(["hospital", "nursing_home"] as const).map((kind) => (
          <article key={kind}>
            <h4>
              {kind === "hospital" ? "Hospital" : "Nursing-home"} retained
              source
            </h4>
            <p>
              Release <code>{sources[kind].release_id}</code> · manifest{" "}
              <code>{sources[kind].manifest_sha256}</code>
            </p>
            <p>
              Issued {sources[kind].source_dates.issued} · modified{" "}
              {sources[kind].source_dates.modified} · released{" "}
              {sources[kind].source_dates.released} · observed{" "}
              {sources[kind].observed_at}
            </p>
            <p>
              Provenance mode: <code>{sources[kind].provenance_mode}</code>
            </p>
          </article>
        ))}
      </details>
      <p>
        {view.semantics} Local review only; no public export or
        reporting-denominator enrollment is authorized.
      </p>
    </section>
  );
}
export function CmsDirectoryZipLoader({
  zip,
  attempt,
}: {
  zip: string;
  attempt: number;
}) {
  const [view, setView] = useState<CmsDirectoryZipEvidence | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setView(null);
        setError(false);
      }
    });
    void runnerJson<CmsDirectoryZipEvidence>(
      `/api/business-map/cms-retained-directory-zip-evidence?zip=${encodeURIComponent(zip)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (
          !controller.signal.aborted &&
          validCmsDirectoryZipEvidence(value, zip)
        )
          setView(value);
        else if (!controller.signal.aborted) setError(true);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setError(true);
      });
    return () => controller.abort();
  }, [zip, attempt]);
  return view ? (
    <CmsDirectoryZipPanel view={view} />
  ) : (
    <section aria-labelledby="cms-directory-title">
      <h3 id="cms-directory-title">Retained CMS directory evidence</h3>
      <p role={error ? "alert" : "status"}>
        {error
          ? "Retained CMS directory evidence is unavailable or malformed. No absence, zero, or closure was inferred."
          : `Loading separate retained CMS directory evidence for reported ZIP ${zip}…`}
      </p>
    </section>
  );
}

const childcareStates = ["PA", "CT", "MD", "VT", "CO", "UT", "IA"] as const;
const childcareSemantics =
  "Source-separated retained candidate rows only. Quality and provenance describe entire source cohorts, not this ZIP. Absent evidence is not zero businesses or invalid USPS membership.";
type ChildcareSource = {
  source_id: string;
  publisher_scope: string;
  status: string;
  evidence_basis: string;
  accepted_candidate_rows: number;
  by_reported_state: Array<{
    state: string | null;
    candidate_rows: number;
    percent_of_accepted_cohort: number;
  }>;
  quality: { with_zip5: number; with_zip4?: number; with_points?: number };
  provenance: { observed_at: string; publisher_cohort_date?: string };
  source_claims: Record<string, unknown>;
  denominator: string;
  source_row_unit: string;
  enrollment_sha256: string;
};
type ChildcareZipEvidence = {
  schema_version: string;
  available: true;
  zip5: string;
  status: string;
  row: null | {
    zip5: string;
    zip4: null;
    sources: Array<{
      publisher_scope: string;
      source_id: string;
      reported_state: string | null;
      candidate_rows: number;
    }>;
  };
  release_id: string;
  manifest_sha256: string;
  created_at: string;
  sources: Record<string, ChildcareSource>;
  summary: {
    accepted_candidate_rows: number;
    zip_present_candidate_rows: number;
    missing_zip_candidate_rows: number;
    invalid_zip_candidate_rows: number;
    indexed_zip_count: number;
    missing_zip_buckets: unknown[];
    invalid_zip_buckets: unknown[];
  };
  root_view_sha256: string;
  claims: Record<string, unknown>;
  source_replay_performed: false;
  semantics: string;
};
const safeCount = (value: unknown, maximum = 100000) =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const sameClosed = (actual: unknown, expected: unknown): boolean =>
  Array.isArray(expected)
    ? Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((item, index) => sameClosed(item, expected[index]))
    : expected !== null && typeof expected === "object"
      ? exactKeys(actual, Object.keys(expected)) &&
        Object.entries(expected).every(([key, value]) =>
          sameClosed((actual as Record<string, unknown>)[key], value),
        )
      : actual === expected;
export function validChildcareZipEvidence(
  value: unknown,
  zip5: string,
): value is ChildcareZipEvidence {
  if (
    !exactKeys(value, [
      "schema_version",
      "available",
      "zip5",
      "status",
      "row",
      "release_id",
      "manifest_sha256",
      "created_at",
      "sources",
      "summary",
      "root_view_sha256",
      "claims",
      "source_replay_performed",
      "semantics",
    ])
  )
    return false;
  const view = value as ChildcareZipEvidence,
    pin = childcareRegistration.retained_release;
  if (
    view.schema_version !== "retained-childcare-zip-evidence@1.1.0" ||
    view.available !== true ||
    view.zip5 !== zip5 ||
    view.source_replay_performed !== false ||
    view.semantics !== childcareSemantics ||
    view.release_id !== pin.release_id ||
    view.manifest_sha256 !== pin.manifest_sha256 ||
    view.root_view_sha256 !== pin.root_view_sha256 ||
    view.created_at !== pin.created_at
  )
    return false;
  if (
    !sameClosed(view.claims, childcareRegistration.claims) ||
    !sameClosed(view.sources, pin.sources) ||
    !sameClosed(view.summary, pin.summary) ||
    view.summary.accepted_candidate_rows !== 12206 ||
    view.summary.zip_present_candidate_rows !== 12205 ||
    view.summary.missing_zip_candidate_rows !== 0 ||
    view.summary.invalid_zip_candidate_rows !== 1 ||
    !sameClosed(view.summary.invalid_zip_buckets, [
      {
        publisher_scope: "MD",
        source_id: "md-msde-childcare-centers",
        reason: "invalid-source-zip-range",
        candidate_rows: 1,
      },
    ])
  )
    return false;
  let accepted = 0,
    present = 0;
  for (const state of childcareStates) {
    const source = view.sources[state];
    if (
      source.publisher_scope !== state ||
      source.status !== "available" ||
      source.by_reported_state.reduce((n, row) => n + row.candidate_rows, 0) !==
        source.accepted_candidate_rows ||
      source.quality.with_zip5 > source.accepted_candidate_rows
    )
      return false;
    accepted += source.accepted_candidate_rows;
    present += source.quality.with_zip5;
  }
  if (accepted !== 12206 || present !== 12205) return false;
  if (view.row === null)
    return view.status === "absent-from-retained-candidate-evidence";
  if (
    view.status !== "retained-candidate-evidence-present" ||
    !exactKeys(view.row, ["zip5", "zip4", "sources"]) ||
    view.row.zip5 !== zip5 ||
    view.row.zip4 !== null ||
    !Array.isArray(view.row.sources) ||
    !view.row.sources.length
  )
    return false;
  const seen = new Set<string>();
  return view.row.sources.every((row) => {
    const source = view.sources[row.publisher_scope],
      bucket = source?.by_reported_state.find(
        (item) => item.state === row.reported_state,
      );
    return (
      exactKeys(row, [
        "publisher_scope",
        "source_id",
        "reported_state",
        "candidate_rows",
      ]) &&
      childcareStates.includes(
        row.publisher_scope as (typeof childcareStates)[number],
      ) &&
      row.source_id === source?.source_id &&
      (row.reported_state === null || /^[A-Z]{2}$/.test(row.reported_state)) &&
      (!["VT", "IA"].includes(row.publisher_scope) ||
        row.reported_state === null) &&
      safeCount(row.candidate_rows) &&
      row.candidate_rows > 0 &&
      row.candidate_rows <= source.accepted_candidate_rows &&
      Boolean(bucket) &&
      row.candidate_rows <= bucket!.candidate_rows &&
      !seen.has(`${row.publisher_scope}:${row.reported_state}`) &&
      (seen.add(`${row.publisher_scope}:${row.reported_state}`), true)
    );
  });
}
export function RetainedChildcareZipPanel({
  view,
}: {
  view: ChildcareZipEvidence;
}) {
  const rows = view.row?.sources ?? [];
  return (
    <section
      aria-labelledby="retained-childcare-title"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h3 id="retained-childcare-title">
        Retained childcare candidate evidence · reported ZIP {view.zip5}
      </h3>
      <p>
        Source candidate rows are shown separately by publisher cohort and
        source-reported state. They are not unique businesses, verified physical
        sites, findings of current operations, proof of USPS ZIP validity, or a
        completeness measure.
      </p>
      {rows.length ? (
        <div
          className="representation-table"
          role="region"
          aria-label="Retained childcare source candidate rows"
          tabIndex={0}
        >
          <table>
            <caption>
              Exact source-reported ZIP match; no cross-source deduplication
            </caption>
            <thead>
              <tr>
                <th scope="col">Publisher cohort</th>
                <th scope="col">Reported state</th>
                <th scope="col">Candidate rows</th>
                <th scope="col">Cohort quality and lineage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const source = view.sources[row.publisher_scope];
                return (
                  <tr key={`${row.publisher_scope}:${row.reported_state}`}>
                    <th scope="row">
                      {row.publisher_scope}
                      <small>{source.source_id}</small>
                    </th>
                    <td>{row.reported_state ?? "Not source-reported"}</td>
                    <td>{count(row.candidate_rows)}</td>
                    <td>
                      {count(source.quality.with_zip5)} of{" "}
                      {count(source.accepted_candidate_rows)} cohort rows have
                      ZIP5
                      <small>
                        Observed {source.provenance.observed_at}
                        {source.provenance.publisher_cohort_date
                          ? ` · cohort ${source.provenance.publisher_cohort_date}`
                          : ""}{" "}
                        · {source.evidence_basis.replaceAll("-", " ")}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status">
          No retained source candidate row reports ZIP {view.zip5}. This is
          absence from this retained evidence only—not zero childcare
          businesses, facility closure, ZIP invalidity, or complete coverage.
        </p>
      )}
      <details>
        <summary>Retained release and cohort-wide quality</summary>
        <p>
          Release <code>{view.release_id}</code> · created {view.created_at} ·
          manifest <code>{view.manifest_sha256}</code>
        </p>
        <dl>
          <dt>Accepted candidate rows</dt>
          <dd>{count(view.summary.accepted_candidate_rows)}</dd>
          <dt>Rows with ZIP5</dt>
          <dd>{count(view.summary.zip_present_candidate_rows)}</dd>
          <dt>Missing ZIP rows</dt>
          <dd>{count(view.summary.missing_zip_candidate_rows)}</dd>
          <dt>Invalid ZIP rows</dt>
          <dd>{count(view.summary.invalid_zip_candidate_rows)}</dd>
        </dl>
        <p>
          Quality and provenance describe entire retained source cohorts, not
          the selected ZIP. Source replay was not performed by this lookup.
        </p>
      </details>
      <p>
        {view.semantics} Internal evidence only; no public export or
        national-denominator enrollment is authorized.
      </p>
    </section>
  );
}
export function RetainedChildcareZipLoader({
  zip,
  attempt,
}: {
  zip: string;
  attempt: number;
}) {
  const [view, setView] = useState<ChildcareZipEvidence | null>(null),
    [failure, setFailure] = useState<"unavailable" | "malformed" | null>(null);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setView(null);
        setFailure(null);
      }
    });
    void runnerJson<ChildcareZipEvidence>(
      `/api/business-map/retained-childcare-zip-evidence?zip=${encodeURIComponent(zip)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (validChildcareZipEvidence(value, zip)) setView(value);
        else setFailure("malformed");
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setFailure("unavailable");
      });
    return () => controller.abort();
  }, [zip, attempt]);
  const message =
    failure === "malformed"
      ? "Retained childcare evidence returned a malformed or unregistered contract. No evidence state was accepted."
      : failure === "unavailable"
        ? "Retained childcare evidence is unavailable. Absence was not established and no older result was substituted."
        : `Loading retained childcare candidate evidence for reported ZIP ${zip}…`;
  return view ? (
    <RetainedChildcareZipPanel view={view} />
  ) : (
    <section aria-labelledby="retained-childcare-title">
      <h3 id="retained-childcare-title">
        Retained childcare candidate evidence
      </h3>
      <p role={failure ? "alert" : "status"}>
        {message} No zero-business, USPS-validity, or completeness claim is
        inferred.
      </p>
    </section>
  );
}
const unique = (values: unknown[]) => new Set(values).size === values.length;
const canonicalIso = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};
export function validZctaEconomicReadiness(
  value: unknown,
  zcta: string = (value as { zcta?: string })?.zcta ?? "",
): value is ZctaEconomicReadiness {
  if (
    !exactKeys(value, [
      "schema_version",
      "zcta",
      "available",
      "status",
      "readiness",
      "provenance",
      "limitations",
      "claims",
    ])
  )
    return false;
  const view = value as ZctaEconomicReadiness;
  if (
    view.schema_version !== "zcta-economic-readiness-view@1.0.0" ||
    !/^[0-9]{5}$/.test(zcta) ||
    view.zcta !== zcta ||
    typeof view.available !== "boolean" ||
    !["found", "not-found"].includes(view.status) ||
    view.available !== (view.status === "found") ||
    !Array.isArray(view.limitations) ||
    !view.limitations.every((item) => typeof item === "string")
  )
    return false;
  if (
    !exactKeys(view.claims, [
      "official_zip_code",
      "active_businesses",
      "numeric_gdp_or_demographic_allocation",
    ]) ||
    Object.values(view.claims).some((item) => item !== false)
  )
    return false;
  if (
    !exactKeys(view.provenance, [
      "release_id",
      "manifest_sha256",
      "artifact_sha256",
      "created_at",
      "geography_release_id",
      "input_releases",
    ]) ||
    ![view.provenance.release_id, view.provenance.geography_release_id].every(
      (item) => typeof item === "string" && item.length > 0,
    ) ||
    typeof view.provenance.created_at !== "string" ||
    !canonicalIso(view.provenance.created_at) ||
    ![view.provenance.manifest_sha256, view.provenance.artifact_sha256].every(
      (item) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item),
    ) ||
    !Array.isArray(view.provenance.input_releases) ||
    !view.provenance.input_releases.every(
      (item) =>
        exactKeys(item, ["dataset_id", "release_id", "manifest_sha256"]) &&
        typeof item.dataset_id === "string" &&
        item.dataset_id.length > 0 &&
        typeof item.release_id === "string" &&
        item.release_id.length > 0 &&
        /^[a-f0-9]{64}$/.test(item.manifest_sha256),
    )
  )
    return false;
  if (!view.available) return view.readiness === null;
  const row = view.readiness;
  if (
    !exactKeys(row, [
      "population_2020",
      "housing_units_2020",
      "zbp_publication_status",
      "relationship_count",
      "material_relationship_count",
      "state_fips",
      "county_geoids",
      "direct_county_gdp_count",
      "missing_county_gdp_geoids",
      "direct_gdp_relationship_coverage",
      "model_status",
      "blockers",
    ]) ||
    !row
  )
    return false;
  if (
    row.model_status !== "withheld" ||
    !Number.isSafeInteger(row.population_2020) ||
    row.population_2020 < 0 ||
    !Number.isSafeInteger(row.housing_units_2020) ||
    row.housing_units_2020 < 0 ||
    !["zbp-and-zcta", "zcta-without-published-zbp"].includes(
      row.zbp_publication_status,
    ) ||
    !Number.isSafeInteger(row.relationship_count) ||
    row.relationship_count < 0 ||
    !Number.isSafeInteger(row.material_relationship_count) ||
    row.material_relationship_count < 0 ||
    row.material_relationship_count > row.relationship_count ||
    !Number.isSafeInteger(row.direct_county_gdp_count) ||
    row.direct_county_gdp_count < 0 ||
    row.direct_county_gdp_count > row.relationship_count
  )
    return false;
  if (
    !Array.isArray(row.state_fips) ||
    !unique(row.state_fips) ||
    !row.state_fips.every((item) => /^\d{2}$/.test(item)) ||
    !Array.isArray(row.county_geoids) ||
    !unique(row.county_geoids) ||
    row.county_geoids.length !== row.relationship_count ||
    !row.county_geoids.every((item) => /^\d{5}$/.test(item)) ||
    !Array.isArray(row.missing_county_gdp_geoids) ||
    !unique(row.missing_county_gdp_geoids) ||
    !row.missing_county_gdp_geoids.every((item) =>
      row.county_geoids.includes(item),
    ) ||
    row.direct_county_gdp_count + row.missing_county_gdp_geoids.length !==
      row.relationship_count ||
    !Array.isArray(row.blockers) ||
    !unique(row.blockers) ||
    !row.blockers.every((item) => typeof item === "string" && item.length > 0)
  )
    return false;
  return (
    row.direct_gdp_relationship_coverage ===
    (row.relationship_count
      ? row.direct_county_gdp_count / row.relationship_count
      : null)
  );
}
export function ZctaEconomicReadinessPanel({
  view,
}: {
  view: ZctaEconomicReadiness;
}) {
  const row = view.readiness,
    lineage = view.provenance.input_releases;
  return (
    <section
      aria-label={`ZCTA ${view.zcta} economic-model readiness`}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h3>Economic-model readiness · Census ZCTA {view.zcta}</h3>
      <p>
        This is readiness metadata for a Census statistical area, not an
        official USPS ZIP, current-operation finding, or economic estimate.
      </p>
      {!view.available || !row ? (
        <p role="status">
          <code>{machine(view.status)}</code>. No retained readiness row was
          found; this does not make the ZIP invalid or establish zero
          population, housing, businesses, or GDP.
        </p>
      ) : (
        <dl>
          <dt>model_status</dt>
          <dd>
            <code>{machine(row.model_status)}</code>
          </dd>
          <dt>blockers</dt>
          <dd>
            {row.blockers.length ? (
              <ul>
                {row.blockers.map((value) => (
                  <li key={value}>
                    <code>{value}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <code>none-reported</code>
            )}
          </dd>
          <dt>County relationships</dt>
          <dd>
            {count(row.relationship_count)} total ·{" "}
            {count(row.material_relationship_count)} material
          </dd>
          <dt>Direct county GDP coverage</dt>
          <dd>
            {count(row.direct_county_gdp_count)} /{" "}
            {count(row.relationship_count)} relationships ·{" "}
            {row.direct_gdp_relationship_coverage == null
              ? "Unavailable"
              : `${(row.direct_gdp_relationship_coverage * 100).toFixed(1)}%`}
          </dd>
          <dt>Missing direct-county GDP GEOIDs</dt>
          <dd>
            {row.missing_county_gdp_geoids.length
              ? row.missing_county_gdp_geoids.map((value) => (
                  <code key={value}>{value} </code>
                ))
              : "None reported"}
          </dd>
          <dt>2020 Census population</dt>
          <dd>
            {count(row.population_2020)} · aggregate context, not a current
            estimate or allocation weight
          </dd>
          <dt>2020 Census housing units</dt>
          <dd>
            {count(row.housing_units_2020)} · aggregate context, not a current
            estimate or allocation weight
          </dd>
          <dt>ZIP Business Patterns status</dt>
          <dd>
            <code>{machine(row.zbp_publication_status)}</code>
          </dd>
        </dl>
      )}
      <details>
        <summary>Readiness release and source lineage</summary>
        <p>
          Readiness release: <code>{view.provenance.release_id}</code> · created{" "}
          {view.provenance.created_at}
        </p>
        <p>
          Census geography release:{" "}
          <code>{view.provenance.geography_release_id}</code>
        </p>
        <p>
          Manifest SHA-256: <code>{view.provenance.manifest_sha256}</code> ·
          artifact SHA-256: <code>{view.provenance.artifact_sha256}</code>
        </p>
        {lineage.length ? (
          <ul>
            {lineage.map((source) => (
              <li key={`${source.dataset_id}:${source.release_id}`}>
                <code>{source.dataset_id}</code> ·{" "}
                <code>{source.release_id}</code> · manifest{" "}
                <code>{source.manifest_sha256}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p>Source lineage was not supplied.</p>
        )}
      </details>
      <details>
        <summary>Readiness limitations ({view.limitations.length})</summary>
        {view.limitations.length ? (
          <ul>
            {view.limitations.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : (
          <p>
            No limitations were supplied; this is not evidence that limitations
            are absent.
          </p>
        )}
      </details>
      <ZctaGdpExecutionReadinessPanel
        zcta={view.available ? view.zcta : null}
      />
      <p>
        No ZIP/ZCTA GDP or demographic allocation is produced. County GDP is
        direct county evidence only and is not allocated to this ZCTA.
      </p>
    </section>
  );
}
type ZctaDemographicReadiness = {
  schema_version: "zcta-demographic-readiness-view@1.0.0";
  zcta: string;
  available: boolean;
  status: "found" | "not-found";
  readiness: null | {
    status: "partial-input-readiness";
    population_2020: number;
    housing_units_2020: number;
    availability: {
      population_2020: true;
      housing_units_2020: true;
      race: false;
      ancestry_lineage: false;
      sex: false;
      age: false;
    };
    blockers: string[];
  };
  provenance: {
    release_id: string;
    manifest_sha256: string;
    artifact_sha256: string;
    created_at: string;
    geography_release_id: string;
  };
  claims: {
    official_zip_code: false;
    demographic_percentages: false;
    gdp: false;
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
  };
};
const demographicDimensions = {
  Race: "race",
  "Lineage / ancestry": "ancestry_lineage",
  Sex: "sex",
  Age: "age",
} as const;
export function validZctaDemographicReadiness(
  value: unknown,
  zcta: string,
): value is ZctaDemographicReadiness {
  if (
    !exactKeys(value, [
      "schema_version",
      "zcta",
      "available",
      "status",
      "readiness",
      "provenance",
      "claims",
    ])
  )
    return false;
  const v = value as ZctaDemographicReadiness;
  if (
    v.schema_version !== "zcta-demographic-readiness-view@1.0.0" ||
    v.zcta !== zcta ||
    v.available !== (v.status === "found") ||
    !["found", "not-found"].includes(v.status)
  )
    return false;
  if (
    !exactKeys(v.provenance, [
      "release_id",
      "manifest_sha256",
      "artifact_sha256",
      "created_at",
      "geography_release_id",
    ]) ||
    !/^zcta-demographic-input-readiness-[a-f0-9]{64}$/.test(
      v.provenance.release_id,
    ) ||
    ![v.provenance.manifest_sha256, v.provenance.artifact_sha256].every(sha) ||
    !canonicalIso(v.provenance.created_at) ||
    typeof v.provenance.geography_release_id !== "string" ||
    !v.provenance.geography_release_id
  )
    return false;
  if (
    !exactKeys(v.claims, [
      "official_zip_code",
      "demographic_percentages",
      "gdp",
      "network_requests",
      "current_pointer_written",
      "production_enrollment",
    ]) ||
    v.claims.network_requests !== 0 ||
    [
      "official_zip_code",
      "demographic_percentages",
      "gdp",
      "current_pointer_written",
      "production_enrollment",
    ].some(
      (key) => (v.claims as unknown as Record<string, unknown>)[key] !== false,
    )
  )
    return false;
  if (!v.available) return v.readiness === null;
  if (
    !exactKeys(v.readiness, [
      "status",
      "population_2020",
      "housing_units_2020",
      "availability",
      "blockers",
    ])
  )
    return false;
  const r = v.readiness!;
  const availability = {
      population_2020: true,
      housing_units_2020: true,
      race: false,
      ancestry_lineage: false,
      sex: false,
      age: false,
    },
    blockers = [
      "race-input-unavailable",
      "ancestry-lineage-input-unavailable",
      "sex-input-unavailable",
      "age-input-unavailable",
    ];
  return (
    r.status === "partial-input-readiness" &&
    nonnegative(r.population_2020) &&
    nonnegative(r.housing_units_2020) &&
    exactKeys(r.availability, Object.keys(availability)) &&
    Object.entries(availability).every(
      ([key, expected]) =>
        (r.availability as unknown as Record<string, unknown>)[key] ===
        expected,
    ) &&
    Array.isArray(r.blockers) &&
    JSON.stringify(r.blockers) === JSON.stringify(blockers)
  );
}
export function ZctaDemographicReadinessPanel({
  zcta,
  dimension,
}: {
  zcta: string | null;
  dimension: keyof typeof demographicDimensions;
}) {
  const [view, setView] = useState<ZctaDemographicReadiness | null>(null),
    [failure, setFailure] = useState(false);
  useEffect(() => {
    if (!zcta) return;
    const controller = new AbortController();
    void runnerJson<ZctaDemographicReadiness>(
      `/api/business-map/zcta-demographic-readiness?zcta=${encodeURIComponent(zcta)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (validZctaDemographicReadiness(value, zcta)) {
          setView(value);
          setFailure(false);
        } else {
          setView(null);
          setFailure(true);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError") {
          setView(null);
          setFailure(true);
        }
      });
    return () => controller.abort();
  }, [zcta]);
  if (!zcta)
    return (
      <p role="status">
        Demographic readiness is not applicable because this ZIP has no
        same-code governed Census ZCTA match.
      </p>
    );
  if (!view)
    return (
      <p role={failure ? "alert" : "status"}>
        {failure
          ? "Verified demographic readiness is unavailable or malformed; no totals, status, or availability was substituted."
          : `Loading demographic readiness for Census ZCTA ${zcta}…`}
      </p>
    );
  if (!view.available || !view.readiness)
    return (
      <p role="status">
        No retained demographic readiness row was found for Census ZCTA {zcta};
        this does not establish zero population or demographic activity.
      </p>
    );
  const key = demographicDimensions[dimension];
  return (
    <section aria-label={`ZCTA ${zcta} demographic readiness`}>
      <h4>Verified demographic input readiness · Census ZCTA {zcta}</h4>
      <dl>
        <dt>Selected dimension</dt>
        <dd>
          {dimension}:{" "}
          <strong>
            {view.readiness.availability[key] ? "Available" : "Unavailable"}
          </strong>
        </dd>
        <dt>Readiness status</dt>
        <dd>
          <code>{view.readiness.status}</code>
        </dd>
        <dt>2020 population context</dt>
        <dd>{count(view.readiness.population_2020)}</dd>
        <dt>2020 housing context</dt>
        <dd>{count(view.readiness.housing_units_2020)}</dd>
        <dt>Blocking input</dt>
        <dd>
          <code>{`${key.replace("_", "-")}-input-unavailable`}</code>
        </dd>
      </dl>
      <details>
        <summary>Demographic readiness lineage</summary>
        <p>
          Release <code>{view.provenance.release_id}</code> · created{" "}
          {view.provenance.created_at}
        </p>
        <p>
          Manifest <code>{view.provenance.manifest_sha256}</code> · artifact{" "}
          <code>{view.provenance.artifact_sha256}</code>
        </p>
        <p>
          Geography <code>{view.provenance.geography_release_id}</code>
        </p>
      </details>
      <p>
        This is Census ZCTA readiness, not an official USPS ZIP or demographic
        percentage. No GDP allocation is produced.
      </p>
    </section>
  );
}
type GdpApprovalBinding = {
  release_id: string;
  manifest_path: string;
  manifest_sha256: string;
};
type ZctaGdpApprovalPacket = {
  schema_version: "1.0.0";
  packet_id: "county-to-2020-zcta-gdp-research-scenario-v1";
  decision_status: "hold";
  decision_requested: string;
  scope: {
    geography: "2020 Census ZCTA";
    official_usps_zip: false;
    measure: "modeled current-dollar GDP research scenario";
    bea_reference_year: 2024;
    zbp_reference_year: 2023;
  };
  feasibility: {
    total_zctas: 33791;
    technically_feasible_all_methods: 30576;
    withheld: 3215;
    conservation: "30576 + 3215 = 33791";
    feasible_when_all: string[];
    withhold_when_any: string[];
    missing_values: "null-and-withhold-never-zero";
    interpretation: string;
  };
  proposed_methods: {
    primary: "zbp-payroll-area-hybrid";
    sensitivity: ["polygon-area", "zbp-establishment-area-fallback"];
    fallback: null;
  };
  required_decisions: string[];
  bindings: {
    model_specification: GdpApprovalBinding;
    allocation_evaluation: GdpApprovalBinding;
    allocation_evaluation_artifacts: {
      relationships: {
        path: "relationship-evaluation.jsonl";
        bytes: number;
        record_count: 65631;
        sha256: string;
      };
      county_diagnostics: {
        path: "county-diagnostics.jsonl";
        bytes: number;
        record_count: 3091;
        sha256: string;
      };
    };
    bea_policy: {
      path: "config/source-policies/bea-regional-gdp.json";
      sha256: string;
    };
  };
  claims: {
    model_approved: false;
    output_authorized: false;
    numeric_gdp_emitted: false;
    demographic_slices_emitted: false;
    official_usps_zip: false;
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
  };
};
export function validZctaGdpApprovalPacket(
  value: unknown,
): value is ZctaGdpApprovalPacket {
  if (
    !exactKeys(value, [
      "schema_version",
      "packet_id",
      "decision_status",
      "decision_requested",
      "scope",
      "feasibility",
      "proposed_methods",
      "required_decisions",
      "bindings",
      "claims",
    ])
  )
    return false;
  const v = value as ZctaGdpApprovalPacket,
    f = v.feasibility,
    b = v.bindings,
    c = v.claims;
  const binding = (x: unknown, prefix: string) =>
    exactKeys(x, ["release_id", "manifest_path", "manifest_sha256"]) &&
    typeof (x as GdpApprovalBinding).release_id === "string" &&
    (x as GdpApprovalBinding).release_id.startsWith(prefix) &&
    typeof (x as GdpApprovalBinding).manifest_path === "string" &&
    (x as GdpApprovalBinding).manifest_path.includes(
      `/releases/${(x as GdpApprovalBinding).release_id}/manifest.json`,
    ) &&
    sha((x as GdpApprovalBinding).manifest_sha256);
  if (
    v.schema_version !== "1.0.0" ||
    v.packet_id !== "county-to-2020-zcta-gdp-research-scenario-v1" ||
    v.decision_status !== "hold" ||
    typeof v.decision_requested !== "string" ||
    !v.decision_requested.includes("Explicit approval")
  )
    return false;
  if (
    !exactKeys(v.scope, [
      "geography",
      "official_usps_zip",
      "measure",
      "bea_reference_year",
      "zbp_reference_year",
    ]) ||
    v.scope.geography !== "2020 Census ZCTA" ||
    v.scope.official_usps_zip !== false ||
    v.scope.measure !== "modeled current-dollar GDP research scenario" ||
    v.scope.bea_reference_year !== 2024 ||
    v.scope.zbp_reference_year !== 2023
  )
    return false;
  if (
    !exactKeys(f, [
      "total_zctas",
      "technically_feasible_all_methods",
      "withheld",
      "conservation",
      "feasible_when_all",
      "withhold_when_any",
      "missing_values",
      "interpretation",
    ]) ||
    f.total_zctas !== 33791 ||
    f.technically_feasible_all_methods !== 30576 ||
    f.withheld !== 3215 ||
    f.technically_feasible_all_methods + f.withheld !== f.total_zctas ||
    f.conservation !== "30576 + 3215 = 33791" ||
    f.missing_values !== "null-and-withhold-never-zero" ||
    !f.interpretation.includes("Technical feasibility is not approval") ||
    ![f.feasible_when_all, f.withhold_when_any].every(
      (items) =>
        Array.isArray(items) &&
        items.length === 4 &&
        items.every((item) => typeof item === "string" && item.length > 0),
    )
  )
    return false;
  if (
    !exactKeys(v.proposed_methods, ["primary", "sensitivity", "fallback"]) ||
    v.proposed_methods.primary !== "zbp-payroll-area-hybrid" ||
    JSON.stringify(v.proposed_methods.sensitivity) !==
      JSON.stringify(["polygon-area", "zbp-establishment-area-fallback"]) ||
    v.proposed_methods.fallback !== null ||
    !Array.isArray(v.required_decisions) ||
    v.required_decisions.length !== 4 ||
    !v.required_decisions.every(
      (item) => typeof item === "string" && item.length > 0,
    )
  )
    return false;
  const artifacts = b?.allocation_evaluation_artifacts;
  if (
    !exactKeys(b, [
      "model_specification",
      "allocation_evaluation",
      "allocation_evaluation_artifacts",
      "bea_policy",
    ]) ||
    !binding(b.model_specification, "zcta-gdp-model-specification-") ||
    !binding(
      b.allocation_evaluation,
      "zcta-gdp-allocation-method-evaluation-",
    ) ||
    !exactKeys(artifacts, ["relationships", "county_diagnostics"]) ||
    !exactKeys(artifacts.relationships, [
      "path",
      "bytes",
      "record_count",
      "sha256",
    ]) ||
    artifacts.relationships.path !== "relationship-evaluation.jsonl" ||
    artifacts.relationships.record_count !== 65631 ||
    !nonnegative(artifacts.relationships.bytes) ||
    !sha(artifacts.relationships.sha256) ||
    !exactKeys(artifacts.county_diagnostics, [
      "path",
      "bytes",
      "record_count",
      "sha256",
    ]) ||
    artifacts.county_diagnostics.path !== "county-diagnostics.jsonl" ||
    artifacts.county_diagnostics.record_count !== 3091 ||
    !nonnegative(artifacts.county_diagnostics.bytes) ||
    !sha(artifacts.county_diagnostics.sha256) ||
    !exactKeys(b.bea_policy, ["path", "sha256"]) ||
    b.bea_policy.path !== "config/source-policies/bea-regional-gdp.json" ||
    !sha(b.bea_policy.sha256)
  )
    return false;
  return (
    exactKeys(c, [
      "model_approved",
      "output_authorized",
      "numeric_gdp_emitted",
      "demographic_slices_emitted",
      "official_usps_zip",
      "network_requests",
      "current_pointer_written",
      "production_enrollment",
    ]) &&
    c.network_requests === 0 &&
    [
      "model_approved",
      "output_authorized",
      "numeric_gdp_emitted",
      "demographic_slices_emitted",
      "official_usps_zip",
      "current_pointer_written",
      "production_enrollment",
    ].every((key) => (c as unknown as Record<string, unknown>)[key] === false)
  );
}
export function ZctaGdpApprovalCard({
  view,
  error,
}: {
  view: ZctaGdpApprovalPacket | null;
  error: boolean;
}) {
  if (error)
    return (
      <section aria-label="ZCTA GDP model decision readiness">
        <h3>GDP model decision · unavailable</h3>
        <p role="alert">
          The governed approval packet is unavailable or malformed. No approval,
          feasibility count, or GDP value was substituted.
        </p>
      </section>
    );
  if (!view)
    return (
      <section aria-label="ZCTA GDP model decision readiness">
        <h3>GDP model decision</h3>
        <p role="status">Verifying the governed approval packet…</p>
      </section>
    );
  return (
    <section aria-label="ZCTA GDP model decision readiness">
      <h3>GDP model decision · HOLD</h3>
      <div className="coverage-national-metrics">
        <article>
          <span>Technically feasible</span>
          <strong>
            {count(view.feasibility.technically_feasible_all_methods)} /{" "}
            {count(view.feasibility.total_zctas)}
          </strong>
          <small>2020 Census ZCTAs passing all proposed methods</small>
        </article>
        <article>
          <span>Withheld</span>
          <strong>{count(view.feasibility.withheld)}</strong>
          <small>
            Missing or failing required inputs; never treated as zero
          </small>
        </article>
        <article>
          <span>Numeric GDP</span>
          <strong>Unavailable</strong>
          <small>Model and output are not approved</small>
        </article>
      </div>
      <p>
        <strong>Technical feasibility is not approval.</strong> This is not
        operational USPS ZIP coverage, observed ZCTA GDP, industry GDP, or
        demographic GDP.
      </p>
      <details>
        <summary>Required decisions and exact provenance</summary>
        <h4>Required decisions</h4>
        <ol>
          {view.required_decisions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <h4>Bound releases</h4>
        <p>
          Model specification:{" "}
          <code>{view.bindings.model_specification.release_id}</code>
          <br />
          Manifest:{" "}
          <code>{view.bindings.model_specification.manifest_sha256}</code>
          <br />
          Path: <code>{view.bindings.model_specification.manifest_path}</code>
        </p>
        <p>
          Allocation evaluation:{" "}
          <code>{view.bindings.allocation_evaluation.release_id}</code>
          <br />
          Manifest:{" "}
          <code>{view.bindings.allocation_evaluation.manifest_sha256}</code>
          <br />
          Path: <code>{view.bindings.allocation_evaluation.manifest_path}</code>
        </p>
        <p>
          Relationship evaluation:{" "}
          {count(
            view.bindings.allocation_evaluation_artifacts.relationships
              .record_count,
          )}{" "}
          rows ·{" "}
          <code>
            {view.bindings.allocation_evaluation_artifacts.relationships.sha256}
          </code>
        </p>
        <p>
          County diagnostics:{" "}
          {count(
            view.bindings.allocation_evaluation_artifacts.county_diagnostics
              .record_count,
          )}{" "}
          rows ·{" "}
          <code>
            {
              view.bindings.allocation_evaluation_artifacts.county_diagnostics
                .sha256
            }
          </code>
        </p>
        <p>
          BEA policy: <code>{view.bindings.bea_policy.path}</code> ·{" "}
          <code>{view.bindings.bea_policy.sha256}</code>
        </p>
      </details>
    </section>
  );
}
export function ZctaGdpApprovalCardLoader() {
  const [view, setView] = useState<ZctaGdpApprovalPacket | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<ZctaGdpApprovalPacket>(
      "/api/business-map/zcta-gdp-model-approval-packet",
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (validZctaGdpApprovalPacket(value)) {
          setView(value);
          setError(false);
        } else {
          setView(null);
          setError(true);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError") {
          setView(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, []);
  return <ZctaGdpApprovalCard view={view} error={error} />;
}
type GdpExecutionReadiness = {
  schema_version: "zcta-gdp-execution-readiness-view@1.0.0";
  zcta: string;
  available: boolean;
  status: "found" | "not-found";
  readiness: null | {
    zcta: string;
    execution_status: "feasible-on-approval" | "withheld";
    decision_status: "hold";
    material_relationship_count: number;
    county_geoids: string[];
    withhold_reasons: string[];
    total_model: {
      approval_required: true;
      output_authorized: false;
      numeric_output: false;
    };
    industry_readiness: {
      status: "unavailable";
      county_industry_input: false;
      governed_naics_bea_concordance: false;
      nonemployer_zip_allocation: false;
      numeric_output_authorized: false;
    };
    claims: {
      official_usps_zip: false;
      observed_zcta_gdp: false;
      numeric_gdp: false;
      industry_gdp: false;
      demographic_gdp: false;
    };
  };
  summary: { zctas: 33791; feasible_on_approval: 30576; withheld: 3215 };
  provenance: {
    release_id: string;
    manifest_sha256: string;
    artifact_sha256: string;
    created_at: string;
  };
  claims: {
    model_approved: false;
    output_authorized: false;
    numeric_gdp: false;
    industry_gdp: false;
    official_usps_zip: false;
  };
};
const validGdpExecution = (
  v: unknown,
  zcta: string,
): v is GdpExecutionReadiness => {
  if (
    !exactKeys(v, [
      "schema_version",
      "zcta",
      "available",
      "status",
      "readiness",
      "summary",
      "provenance",
      "claims",
    ])
  )
    return false;
  const x = v as GdpExecutionReadiness,
    claimKeys = [
      "model_approved",
      "output_authorized",
      "numeric_gdp",
      "industry_gdp",
      "official_usps_zip",
    ];
  if (
    x.schema_version !== "zcta-gdp-execution-readiness-view@1.0.0" ||
    x.zcta !== zcta ||
    x.summary?.zctas !== 33791 ||
    x.summary.feasible_on_approval !== 30576 ||
    x.summary.withheld !== 3215 ||
    !sha(x.provenance?.manifest_sha256) ||
    !sha(x.provenance?.artifact_sha256) ||
    typeof x.provenance.release_id !== "string" ||
    !x.provenance.release_id.startsWith("zcta-gdp-execution-readiness-") ||
    !Number.isFinite(Date.parse(x.provenance.created_at)) ||
    !exactKeys(x.claims, claimKeys) ||
    Object.values(x.claims).some((value) => value !== false)
  )
    return false;
  if (!x.available) return x.status === "not-found" && x.readiness === null;
  const r = x.readiness,
    rowClaimKeys = [
      "official_usps_zip",
      "observed_zcta_gdp",
      "numeric_gdp",
      "industry_gdp",
      "demographic_gdp",
    ];
  return (
    x.status === "found" &&
    !!r &&
    r.zcta === zcta &&
    r.decision_status === "hold" &&
    ["feasible-on-approval", "withheld"].includes(r.execution_status) &&
    Number.isSafeInteger(r.material_relationship_count) &&
    r.material_relationship_count >= 0 &&
    Array.isArray(r.county_geoids) &&
    r.county_geoids.every((value) => /^\d{5}$/.test(value)) &&
    r.total_model?.approval_required === true &&
    r.total_model.output_authorized === false &&
    r.total_model.numeric_output === false &&
    r.industry_readiness?.status === "unavailable" &&
    r.industry_readiness.county_industry_input === false &&
    r.industry_readiness.governed_naics_bea_concordance === false &&
    r.industry_readiness.nonemployer_zip_allocation === false &&
    r.industry_readiness.numeric_output_authorized === false &&
    exactKeys(r.claims, rowClaimKeys) &&
    Object.values(r.claims).every((value) => value === false) &&
    Array.isArray(r.withhold_reasons) &&
    r.withhold_reasons.every((value) => typeof value === "string")
  );
};
export function ZctaGdpExecutionReadinessPanel({
  zcta,
}: {
  zcta: string | null;
}) {
  const [result, setResult] = useState<GdpExecutionReadiness | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!zcta) {
      setResult(null);
      setError(false);
      return;
    }
    const controller = new AbortController();
    void runnerJson<GdpExecutionReadiness>(
      `/api/business-map/zcta-gdp-execution-readiness?zcta=${encodeURIComponent(zcta)}`,
      { signal: controller.signal },
    )
      .then((v) => {
        if (!controller.signal.aborted && validGdpExecution(v, zcta)) {
          setResult(v);
          setError(false);
        } else if (!controller.signal.aborted) {
          setResult(null);
          setError(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && e?.name !== "AbortError") {
          setResult(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [zcta]);
  if (!zcta)
    return (
      <p role="status">
        GDP execution readiness is not applicable without a same-code governed
        Census ZCTA.
      </p>
    );
  if (!result)
    return (
      <p role={error ? "alert" : "status"}>
        {error
          ? "GDP execution readiness is unavailable or malformed; no status or value was substituted."
          : `Loading execution readiness for Census ZCTA ${zcta}…`}
      </p>
    );
  if (!result.available || !result.readiness)
    return (
      <p role="status">
        No governed execution-readiness row was found. This does not establish
        zero GDP.
      </p>
    );
  const r = result.readiness;
  return (
    <section aria-label={`ZCTA ${zcta} GDP execution readiness`}>
      <h3>Total-model execution readiness · HOLD</h3>
      <p>
        <strong>
          {r.execution_status === "feasible-on-approval"
            ? "Technically feasible on approval"
            : "Withheld"}
        </strong>{" "}
        for Census ZCTA {zcta}. Technical feasibility is not model approval or
        output authority.
      </p>
      <dl>
        <dt>Material county relationships</dt>
        <dd>
          {count(r.material_relationship_count)} across{" "}
          {count(r.county_geoids.length)} counties
        </dd>
        <dt>Withholding reasons</dt>
        <dd>
          {r.withhold_reasons.length
            ? r.withhold_reasons.join(", ")
            : "None under the proposed technical gate"}
        </dd>
        <dt>Industry allocation</dt>
        <dd>
          Unavailable — county-industry GDP input and governed NAICS-to-BEA
          concordance are unavailable
        </dd>
        <dt>Numeric GDP</dt>
        <dd>Unavailable</dd>
      </dl>
      <p>This is not an official USPS ZIP or observed ZCTA GDP.</p>
      <details>
        <summary>Execution-readiness provenance</summary>
        <p>
          Release <code>{result.provenance.release_id}</code>
        </p>
        <p>
          Manifest <code>{result.provenance.manifest_sha256}</code> · artifact{" "}
          <code>{result.provenance.artifact_sha256}</code>
        </p>
      </details>
    </section>
  );
}
export function ZipGeographySummary({ view }: { view: ZipEvidence }) {
  const geography = view.selected_coverage_geography,
    quality = view.zip_quality;
  const gaps = Array.from(
    new Set([
      ...(quality?.unresolved_proof_gap_codes ?? []),
      ...(view.coverage_gap_codes ?? []),
    ]),
  );
  // The API's absent-registry fallback also says not-in-denominator; it is not a verified nonmember.
  const membership =
    view.governed_zcta?.status === "not-in-denominator"
      ? view.classification
        ? "Not in the selected governed ZCTA denominator"
        : "Unknown — no registry classification"
      : evidenceLabel(view.governed_zcta?.status);
  const hasZcta = !!view.governed_zcta?.geoid;
  const unresolvedGrouping = hasZcta
    ? "Not applicable — represented by governed Census ZCTA geography"
    : "Reported ZIP5 without same-code ZCTA / non-ZCTA ZIP evidence · state and cardinal/central region unresolved because no governed retained assignment is available";
  return (
    <section
      aria-label="Shared ZIP geography evidence"
      style={{
        fontSize: "1rem",
        lineHeight: 1.5,
        minWidth: 0,
        overflowWrap: "anywhere",
      }}
    >
      <h3>Geography evidence · ZIP {view.zip5}</h3>
      <p>
        ZIP-wide context, not segment-filtered. A same-code Census ZCTA does not
        verify USPS operation, business operations or membership in the selected
        navigation state.
      </p>
      <p className="industry-evidence-boundary"><strong>Census ZCTA map status remains usable independently of USPS ZIP polygons or an operational ZIP denominator.</strong> Postal evidence gaps do not hide the governed statistical geography.</p>
      <dl>
        <dt>Registry classification</dt>
        <dd>{evidenceLabel(view.classification?.class)}</dd>
        <dt>Selected coverage status</dt>
        <dd>{evidenceLabel(view.coverage_status)}</dd>
        <dt>Same-code governed ZCTA status</dt>
        <dd>{membership}</dd>
        <dt>Same-code ZCTA GEOID</dt>
        <dd>{view.governed_zcta?.geoid ?? "Unknown — not evidenced"}</dd>
        <dt>Non-ZCTA fallback grouping</dt>
        <dd>{unresolvedGrouping}</dd>
        <dt>Special-area categorization</dt>
        <dd>Unresolved — no governed retained overlay classifies this ZIP as park, Native, private, or another special area; no classification is inferred</dd>
        <dt>Selected coverage ZCTA status / GEOID</dt>
        <dd>
          {evidenceLabel(geography?.zcta_status)} ·{" "}
          {geography?.zcta_geoid ?? "Unknown — not evidenced"}
        </dd>
        <dt>Selected spatial polygon status</dt>
        <dd>
          {evidenceLabel(geography?.spatial_zip_polygon_membership_status)}
        </dd>
        <dt>Material county intersections</dt>
        <dd>{geography?.material_county_count ?? "Unknown — not measured"}</dd>
        <dt>County assignment</dt>
        <dd>{evidenceLabel(geography?.county_assignment)}</dd>
        <dt>USPS operational evidence</dt>
        <dd>
          {evidenceLabel(
            quality?.usps_operational_evidence?.evidence_status ??
              quality?.usps_operational_status,
          )}
          . Current USPS operation is not verified by this view.
        </dd>
      </dl>
      <details>
        <summary>
          Geography proof gaps (
          {gaps.length
            ? `${gaps.length} reported`
            : "none reported; not proof of completeness"}
          )
        </summary>
        {gaps.length ? (
          <ul>
            {gaps.map((gap) => (
              <li key={gap}>{evidenceLabel(gap)}</li>
            ))}
          </ul>
        ) : (
          <p>
            No proof gap codes were supplied. This does not verify geography or
            postal operation.
          </p>
        )}
      </details>
      <p>
        Business segments contains independently bound source contributions and
        temporal review qualification; neither resolves these geography gaps.
      </p>
    </section>
  );
}
const EXACT_ZIP_PROFILE_SOURCES = [
  "ak_license_location_profiles",
  "ca_abc_license_location_profiles",
  "chicago_license_location_profiles",
  "dc_basic_license_location_profiles",
  "la_registered_location_profiles",
  "ny_retail_food_location_profiles",
  "nyc_dcwp_license_location_profiles",
  "tx_sales_tax_outlet_profiles",
] as const;
const EXACT_ZIP_SOURCES = [
  "healthcare_organizations",
  "regulated_facilities",
  "fdic_offices",
  "food_safety_establishments",
  "credit_union_locations",
  "snap_retailers",
  "pharmacy",
  "transportation",
  "tax_exempt_organizations",
  "cms_hospital_directory",
  "cms_nursing_home_directory",
  "childcare_pa_candidates",
  "childcare_ct_candidates",
  "childcare_md_candidates",
  "childcare_vt_candidates",
  "childcare_co_candidates",
  "childcare_ut_candidates",
  "childcare_ia_candidates",
  "childcare_ma_reporting_centers",
  "childcare_nj_reporting_centers",
  "childcare_tn_reporting_centers",
  "childcare_oh_reporting_centers",
  ...EXACT_ZIP_PROFILE_SOURCES,
  "broad_org_co_organization_addresses",
  "broad_org_ct_organization_addresses",
  "broad_org_de_license_addresses",
  "broad_org_fl_organization_addresses",
  "broad_org_ia_organization_addresses",
  "broad_org_ny_organization_addresses",
  "broad_org_or_legal_registration_addresses",
  "broad_org_or_brand_registration_addresses",
  "broad_org_pa_organization_addresses",
  "wa_lni_active_contractor_organization_mailing_addresses",
] as const;
const EXACT_ZIP_V21_SOURCES=[...EXACT_ZIP_SOURCES,"mn_residential_construction_credential_reported_address_rows","cms_nppes_pharmacy_nonprimary_reported_address_rows"] as const;
const EXACT_ZIP_V22_SOURCES=[...EXACT_ZIP_V21_SOURCES,"census_zbp_2023_all_industry_employer_establishments"] as const;
const EXACT_ZIP_V23_SOURCES=[...EXACT_ZIP_V22_SOURCES,"cross_source_entity_resolution_linkage_evidence"] as const;
const EXACT_ZIP_V24_SOURCES=[...EXACT_ZIP_V23_SOURCES,"ca_abc_active_issued_license_physical_sites"] as const;
const EXACT_ZIP_V25_SOURCES=[...EXACT_ZIP_V24_SOURCES,"dc_active_basic_business_license_physical_sites"] as const;
const EXACT_ZIP_V26_SOURCES=[...EXACT_ZIP_V25_SOURCES,"tx_active_sales_tax_permitted_outlet_physical_sites"] as const;
const EXACT_ZIP_V27_SOURCES=[...EXACT_ZIP_V26_SOURCES,"la_publisher_active_listing_location_account_sites"] as const;
const EXACT_ZIP_V28_SOURCES=[...EXACT_ZIP_V27_SOURCES,"ak_active_business_license_conditional_physical_sites"] as const;
const EXACT_ZIP_V29_SOURCES=[...EXACT_ZIP_V28_SOURCES,"chicago_current_active_business_license_physical_sites"] as const;
const EXACT_ZIP_V30_SOURCES=[...EXACT_ZIP_V29_SOURCES,"ny_retail_food_license_address_evidence_count"] as const;
const EXACT_ZIP_V31_TEMPORAL_MAPPINGS={cms_hospital_directory:"cms-hospital-directory",cms_nursing_home_directory:"cms-nursing-home-directory",childcare_pa_candidates:"pa-childcare-centers",childcare_ct_candidates:"ct-childcare-centers",childcare_md_candidates:"md-childcare-centers",childcare_vt_candidates:"vt-childcare-centers",childcare_co_candidates:"co-childcare-centers",childcare_ut_candidates:"ut-childcare-centers",childcare_ia_candidates:"ia-childcare-centers",mn_residential_construction_credential_reported_address_rows:"mn-residential-construction-credentials"} as const;
function validExactZipIndustrySummaryV30(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@3.0.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9"||input.manifest_sha256!=="07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7"||input.source_dimensions!==51||input.industry_cells!==2457894||!Array.isArray(input.dimensions)||input.dimensions.length!==51||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==51||!Array.isArray(input.ny_retail_food_license_address_dispositions)||input.ny_retail_food_license_address_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2457894||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2457894||!exactObject(input.temporal_qualification)||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":29,stale:2,unmeasured:10,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":26,"non-active-reporting":9,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="ny_retail_food_license_address_evidence_count");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===1500&&row.raw_status_counts["measured-zero"]===36336&&row.raw_status_counts["outside-source-denominator"]===10358&&exactObject(row.temporal_qualification)&&row.temporal_qualification.semantic_class==="non-active-reporting"&&row.temporal_qualification.review_qualification==="stale"&&input.ny_retail_food_license_address_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.lifecycle_status==="stale"&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.site_occupancy_verified===false&&item.public_access_verified===false&&item.additive===false);}
type ExactZipSource = (typeof EXACT_ZIP_V30_SOURCES)[number];
type ExactZipZeroEvidenceSemantics = {
  absent_cell_status:
    | "measured-zero"
    | "outside-source-denominator"
    | "absent-from-retained-source-rows"
    | "measured-positive"
    | "not-published-for-zip"
    | "outside-zbp-zcta-evidence-union"
    | "retained-linkage-evidence-row"
    | "no-retained-linkage-decisions";
  exact_zip_denominator: boolean;
  explicit_zero_evidence_allowed: boolean;
  interpretation: string;
};
type ExactZipCell = {
  status:
    | "positive"
    | "measured-zero"
    | "outside-source-denominator"
    | "absent-from-retained-source-rows"
    | "measured-positive"
    | "not-published-for-zip"
    | "outside-zbp-zcta-evidence-union"
    | "retained-linkage-evidence-row"
    | "no-retained-linkage-decisions";
  count: number | null;
  measure: string;
  source_release_id?: string;
  temporal_status?: {
    status:
      | "source-referenced-current-operation-unverified"
      | "source-reference-unresolved";
    source_reference_date: string | null;
  };
  source_status_counts?: Record<string, number>;
};
type ExactZipSourceMetadata = {
  source_reference_field: string;
  current_operation_verified: false;
  semantics: string;
  source_manifest: string;
  source_manifest_sha256: string;
  zero_evidence_semantics: ExactZipZeroEvidenceSemantics;
  publisher_scope?: string;
  source_id?: string;
  row_unit?: string;
  export_policy?: string;
  accepted_candidate_rows?: number;
  accepted_reporting_rows?: number;
  retained_source?: Record<string, unknown>;
  record_kind?: string;
  accepted_address_rows?: number;
  source_provenance?: Record<string, unknown>;
  source_release_id?: string;
  accepted_profile_count?: number;
  source_zip_count?: number;
  source_reference_date?: string | null;
  source_reference_basis?: string;
  source_status_counts?: Record<string, number>;
  source_observation?: {
    earliest_observed_at: string | null;
    latest_observed_at: string | null;
    observed_at_present: number;
    observed_at_missing: number;
  };
  source_refresh_at?: null;
  source_refresh_asserted?: false;
  source_observed_at?: string | null;
  earliest_observed_at?: string | null;
  latest_observed_at?: string | null;
  zip4_rows?: number;
  coordinate_rows?: number;
  coordinate_ineligible_rows?: number;
  identity_matching_eligible?: false;
  active_business_verified?: false;
};
type ExactZipGap = {
  zip5: string;
  source_id: string;
  publisher_scope?: string;
  count: number;
  measure: string;
  source_release_id: string;
  temporal_status: {
    status:
      | "source-referenced-current-operation-unverified"
      | "source-reference-unresolved";
    source_reference_date: string | null;
  };
};
type ExactZipCandidateQualityGap = {
  zip5: null;
  quality_dimension: "source-zip";
  publisher_scope: string;
  source_id: string;
  reason: "invalid-source-zip-range";
  candidate_rows: number;
  source_release_id: string;
  source_reference_date: string | null;
};
type ExactZipReportingQualityGap = {
  zip5: null;
  quality_dimension: "source-zip";
  publisher_scope: "TN";
  source_id: "tn-dhs-active-childcare-centers";
  reason: "missing-source-zip" | "invalid-source-zip-placeholder";
  reported_center_rows: number;
  source_release_id: string;
  source_observed_at: string;
};
type ExactZipQualityGap =
  ExactZipCandidateQualityGap | ExactZipReportingQualityGap;
type ExactZipAddressRowGap = {
  gap_type: "source-address-row-without-eligible-zip5";
  publisher_jurisdiction: string;
  record_kind: "organization" | "registration" | "brand";
  dimension_id: string;
  zip5: null;
  zip_partition_reason: string;
  address_rows: number;
  source_release_id: string;
  source_manifest_path: string;
  source_manifest_sha256: string;
  source_reference_date: string;
  temporal_status: {
    status: "source-referenced-current-operation-unverified";
    source_reference_date: string;
  };
};
type ExactZipEvidence = {
  schema_version: "national-exact-zip-industry-evidence-matrix@1.9.0"|"national-exact-zip-industry-evidence-matrix@2.1.0";
  status: "present";
  row: null | {
    schema_version: "national-exact-zip-industry-evidence-matrix-row@1.9.0"|"national-exact-zip-industry-evidence-row@2.1.0";
    zip5: string;
    zip4: null;
    cohort_classification: string;
    usps_validity: null;
    zcta_geoid: string | null;
    cells: Record<ExactZipSource, ExactZipCell>;
  };
  out_of_cohort_source_zip_gaps: ExactZipGap[];
  source_quality_gaps: ExactZipQualityGap[];
  source_address_row_gaps: ExactZipAddressRowGap[];
  source_metadata: Record<ExactZipSource, ExactZipSourceMetadata>;
  status_counts: Record<string, number>;
  serialized_status_value_counts: Record<string, { cells: number; numeric_cells: number; null_cells: number }>;
  cell_status_counts_by_dimension: Record<ExactZipSource, Record<string, number>>;
  reclassified_absent_source_row_cells: number;
  release_id: string;
  manifest_sha256: string;
  temporal_qualification: {
    schema_version: "exact-zip-industry-temporal-qualification-view@1.1.0"|"exact-zip-industry-temporal-qualification-view@2.1.0";
    zip5: string;
    assessment_as_of: "2026-10-02T16:30:00.000Z";
    rows: Array<{
      dimension_id: ExactZipSource;
      source_key: string | null;
      source_release_id: string | null;
      semantic_class: "source-defined-current" | "non-active-reporting" | "unmapped";
      source_status_term: string | null;
      source_reference_at: string | null;
      assessment_as_of: "2026-10-02T16:30:00.000Z";
      review_qualification: "within-review-window" | "stale" | "unmeasured" | "unmapped";
      review_due_at: string | null;
      evidence_disposition: {cell_status:"positive"|"measured-zero"|"outside-source-denominator"|"absent-from-retained-source-rows"|"unavailable";lifecycle_status:"source-defined-current-positive-within-review-window"|"source-defined-current-without-positive-evidence"|"non-active-reporting-positive"|"non-active-reporting-without-positive-evidence"|"stale"|"unmeasured"|"unmapped";label:string;current_operations_verified:false};
      current_operations_verified: false;
    }>;
    summary: Record<string, unknown>;
    provenance: Record<string, unknown>;
    claims: { current_operations_verified: false; active_business_count: null; all_business_denominator: null; all_business_completion_percent: null; additive: false; network_requests: 0; acquisition_performed: false; current_pointer_written: false; production_enrollment: false };
  };
  source_bytes_read: number;
  full_matrix_replay_performed: false;
  claims: {
    wa_broad_jurisdiction_gap_complete: false;
    physical_site_inference_permitted: false;
    establishment_inference_permitted: false;
    current_operations_verified: false;
    all_business_completeness_percent: null;
    nonadditive: true;
    record_level_export_policy: "local-review-only";
    aggregate_export_policy: "public-under-pddl-with-attribution-and-semantic-limitations";
    zip4_joined_to_zip5: false;
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
  };
};
const exactObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const validV31MatrixRow=(value:unknown,zip:string)=>{if(value===null)return true;if(!exactObject(value)||value.zip5!==zip||!exactObject(value.cells))return false;return Object.keys(value.cells).length===51&&EXACT_ZIP_V30_SOURCES.every(source=>source in value.cells);};
const validV31TemporalRows=(value:unknown)=>Array.isArray(value)&&value.length===51&&new Set(value.map(item=>exactObject(item)?item.dimension_id:null)).size===51&&Object.entries(EXACT_ZIP_V31_TEMPORAL_MAPPINGS).every(([id,key])=>{const item=value.find(candidate=>exactObject(candidate)&&candidate.dimension_id===id);return exactObject(item)&&item.source_key===key&&item.semantic_class==="non-active-reporting"&&item.review_qualification==="unmeasured"&&typeof item.source_release_id==="string"&&item.source_release_id.length>0&&item.current_operations_verified===false&&exactObject(item.evidence_disposition)&&item.evidence_disposition.lifecycle_status==="unmeasured"&&item.evidence_disposition.current_operations_verified===false;});
const exactZipDisposition=(cell_status:string,semantic:string,review:string)=>{const lifecycle_status=review==="unmapped"&&semantic==="unmapped"?"unmapped":review==="unmeasured"?"unmeasured":review==="stale"?"stale":semantic==="source-defined-current"?(cell_status==="positive"?"source-defined-current-positive-within-review-window":"source-defined-current-without-positive-evidence"):(cell_status==="positive"?"non-active-reporting-positive":"non-active-reporting-without-positive-evidence");return{cell_status,lifecycle_status,label:`${cell_status.replaceAll("-"," ")} · ${lifecycle_status.replaceAll("-"," ")}`,current_operations_verified:false}};
function validExactZipEvidenceV21(value:unknown,zip:string):boolean{if(!exactObject(value)||value.schema_version!=="national-exact-zip-industry-evidence-matrix@2.1.0"||value.release_id!=="national-exact-zip-industry-evidence-matrix-1a72cd9340c8b230004a6b024b9679bbb613ce4174e91ec8b69eed7d6afaf9e3"||value.manifest_sha256!=="2cd2cf73795af46956230ccbaa6de4e7b771967730c7181b6ba674b3ef2c3ea4"||value.full_matrix_replay_performed!==false||!exactObject(value.cell_status_counts_by_dimension)||Object.keys(value.cell_status_counts_by_dimension).length!==42)return false;const row=value.row,tq=value.temporal_qualification;if(row!==null&&(!exactObject(row)||row.schema_version!=="national-exact-zip-industry-evidence-row@2.1.0"||row.zip5!==zip||row.zip4!==null||!exactObject(row.cells)||Object.keys(row.cells).length!==42||EXACT_ZIP_V21_SOURCES.some(source=>!(source in row.cells))))return false;if(!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.1.0"||tq.zip5!==zip||!Array.isArray(tq.rows)||tq.rows.length!==42||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==42||!exactObject(tq.summary)||tq.summary.qualification_cell_total!==2024148||tq.summary.semantic_cell_total!==2024148||!exactObject(tq.provenance)||tq.provenance.matrix_release_id!==value.release_id||tq.provenance.matrix_manifest_sha256!==value.manifest_sha256)return false;return tq.rows.every(r=>exactObject(r)&&typeof r.dimension_id==="string"&&EXACT_ZIP_V21_SOURCES.includes(r.dimension_id as typeof EXACT_ZIP_V21_SOURCES[number])&&r.current_operations_verified===false&&exactObject(r.evidence_disposition)&&r.evidence_disposition.current_operations_verified===false);}
export function validExactZipEvidence(
  value: unknown,
  zip: string,
): value is ExactZipEvidence {
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@3.0.0"&&exactObject(value.temporal_qualification)&&value.temporal_qualification.schema_version==="exact-zip-industry-temporal-qualification-view@3.1.0"){
    const row=value.row,tq=value.temporal_qualification;
    return value.release_id==="national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9"&&value.manifest_sha256==="07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7"&&value.full_matrix_replay_performed===false&&value.recursive_lineage_verified===true&&exactObject(tq.summary)&&tq.summary.unmapped_dimension_count===0&&validV31MatrixRow(row,zip)&&validV31TemporalRows(tq.rows);
  }
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@3.0.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9"||value.manifest_sha256!=="07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@3.0.0"||!Array.isArray(tq.rows)||tq.rows.length!==51||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==51||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==51||EXACT_ZIP_V30_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="ny_retail_food_license_address_evidence_count");return exactObject(q)&&q.semantic_class==="non-active-reporting"&&q.review_qualification==="stale"&&q.publisher_status==="New York Agriculture and Markets annual licensed retail-food-store snapshot"&&q.publisher_jurisdiction==="New York State"&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&q.site_occupancy_verified===false&&q.public_access_verified===false&&q.unique_business_count===null&&q.coordinates_are_verified_premises===false&&q.address_evidence_may_not_qualify_as_physical_site===true&&q.record_export_policy==="local-review-only"&&q.aggregate_export_policy==="public-under-open-ny-terms-with-attribution-and-limitations"&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.lifecycle_status==="stale"&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.site_occupancy_verified===false&&q.evidence_disposition.public_access_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.9.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-3533736fa5e0a27f0b4c5e4cb8e7d2af4aa04c2f0c97c4da7eff620df31f7ff7"||value.manifest_sha256!=="9c6fa25f318d3b89f7f24efa15340d56b38a72691e40e5c4ebde22b45281c975"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.9.0"||!Array.isArray(tq.rows)||tq.rows.length!==50||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==50||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==50||EXACT_ZIP_V29_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="chicago_current_active_business_license_physical_sites");return exactObject(q)&&q.semantic_class==="source-defined-current"&&q.review_qualification==="within-review-window"&&q.publisher_status==="City of Chicago municipal source-defined current selected official view snapshot"&&q.source_status_term==="City of Chicago municipal source-defined current selected official view snapshot; reported address jurisdiction is not inferred"&&q.publisher_jurisdiction==="City of Chicago"&&q.reported_address_jurisdiction_may_differ===true&&q.address_jurisdiction_inferred===false&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&q.site_occupancy_verified===false&&q.public_access_verified===false&&q.unique_business_count===null&&q.record_export_policy==="local-review-only"&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.site_occupancy_verified===false&&q.evidence_disposition.public_access_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.8.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-704e9357eaf4b19b6d2b59951f3fcc0536c050305ac19e61582037379129646d"||value.manifest_sha256!=="12efcccb28edc6ccb066cb32f4e4274361562e1964044b427686121ceae12cab"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.8.0"||!Array.isArray(tq.rows)||tq.rows.length!==49||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==49||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==49||EXACT_ZIP_V28_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="ak_active_business_license_conditional_physical_sites");return exactObject(q)&&q.semantic_class==="source-defined-current"&&q.review_qualification==="within-review-window"&&q.publisher_status==="Alaska-issued source-defined Active business license membership"&&q.source_status_term==="Alaska-issued source-defined Active business license membership; reported address jurisdiction may differ"&&q.publisher_jurisdiction==="Alaska"&&q.reported_address_jurisdiction_may_differ===true&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&q.site_occupancy_verified===false&&q.public_access_verified===false&&q.coordinates_available===false&&q.record_export_policy==="local-review-only"&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.site_occupancy_verified===false&&q.evidence_disposition.public_access_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.7.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-33ab3fa11f8d1782c945359f4d88e1cbab808f109f6f7a29cd1f5b46cc79e6c6"||value.manifest_sha256!=="447ebb5a78205557c539f54c726d832052aa43eb72c2072c75296b9cabedafca"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.7.0"||!Array.isArray(tq.rows)||tq.rows.length!==48||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==48||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==48||EXACT_ZIP_V27_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="la_publisher_active_listing_location_account_sites");return exactObject(q)&&q.semantic_class==="unknown-source-status"&&q.review_qualification==="unmeasured"&&q.publisher_status==="City of Los Angeles active-list membership; row status not retained"&&q.municipal_scope==="City of Los Angeles"&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.lifecycle_status==="unknown-source-status"&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.6.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-fd4f57796a03b50125e2668336a039a1d1e18ae6bdf12d664d382020e77293b8"||value.manifest_sha256!=="b02e108ef70ac16732744cadd2cd2540e7f448e46957de4a9e07eaff30474a0d"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.6.0"||!Array.isArray(tq.rows)||tq.rows.length!==47||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==47||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==47||EXACT_ZIP_V26_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="tx_active_sales_tax_permitted_outlet_physical_sites");return exactObject(q)&&q.semantic_class==="publisher-active-snapshot"&&q.review_qualification==="unmeasured"&&q.publisher_status==="Active sales tax permit (source-defined)"&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.5.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-2cda66ffbd78232edeffea73167bfa9f151c885bd912e3f8025c6c18455b503b"||value.manifest_sha256!=="eee93f465d24575487e23c52781507f5543dfb593e9f3d76fde907597cba013b"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.5.0"||!Array.isArray(tq.rows)||tq.rows.length!==46||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==46||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==46||EXACT_ZIP_V25_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="dc_active_basic_business_license_physical_sites");return exactObject(q)&&q.semantic_class==="publisher-active-snapshot"&&q.review_qualification==="unmeasured"&&q.publisher_status==="Active"&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.4.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-522a5236674ebbdd8163d71cc15fba49e3526feac916aee74be1bcbf01cb7d63"||value.manifest_sha256!=="072ab5f6018ec9eb085f18a675535514268e1b2154f23ce26334ef66c0a5dc4b"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.4.0"||!Array.isArray(tq.rows)||tq.rows.length!==45||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==45||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==45||EXACT_ZIP_V24_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="ca_abc_active_issued_license_physical_sites");return exactObject(q)&&q.semantic_class==="publisher-active-snapshot"&&q.review_qualification==="unmeasured"&&q.publisher_status==="ACTIVE"&&q.current_operations_verified===false&&q.continuous_operation_verified===false&&exactObject(q.evidence_disposition)&&["positive","measured-zero","outside-source-denominator"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.continuous_operation_verified===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.3.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-cdddc0df5de1697491cb82a6f8d0e70d174271d7e1b4e2ed3c37e48e512815a5"||value.manifest_sha256!=="d5c9da391a7a35de0f72f2b6912c9098dcefce2e88cafc0bcd048ed86d78963c"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.3.0"||!Array.isArray(tq.rows)||tq.rows.length!==44||new Set(tq.rows.map(r=>exactObject(r)?r.dimension_id:null)).size!==44||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==44||EXACT_ZIP_V23_SOURCES.some(source=>!(source in row.cells))))return false;const q=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="cross_source_entity_resolution_linkage_evidence");return exactObject(q)&&q.semantic_class==="linkage-readiness"&&q.review_qualification==="unmeasured"&&q.current_operations_verified===false&&q.identity_merge_applied===false&&exactObject(q.evidence_disposition)&&["retained-linkage-evidence-row","no-retained-linkage-decisions"].includes(String(q.evidence_disposition.raw_status))&&q.evidence_disposition.current_operations_verified===false&&q.evidence_disposition.identity_merge_applied===false&&q.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-row@2.2.0"){const row=value.row,tq=value.temporal_qualification;if(value.release_id!=="national-exact-zip-industry-evidence-matrix-a24fa3582a27a13748b006350b10ae83053eadba419b15f08e5301a8ba76656d"||value.manifest_sha256!=="59c58a7651ffde6f521f97fc3b197d7541f142e546b1653370d262ff5235e6b3"||value.full_matrix_replay_performed!==false||value.recursive_lineage_verified!==true||!exactObject(tq)||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@2.2.0"||!Array.isArray(tq.rows)||tq.rows.length!==43||row!==null&&(!exactObject(row)||row.zip5!==zip||!exactObject(row.cells)||Object.keys(row.cells).length!==43||EXACT_ZIP_V22_SOURCES.some(source=>!(source in row.cells))))return false;const z=tq.rows.find(item=>exactObject(item)&&item.dimension_id==="census_zbp_2023_all_industry_employer_establishments");return exactObject(z)&&z.semantic_class==="annual-aggregate"&&z.review_qualification==="unmeasured"&&z.current_operations_verified===false&&exactObject(z.evidence_disposition)&&["measured-positive","not-published-for-zip","outside-zbp-zcta-evidence-union","unavailable"].includes(String(z.evidence_disposition.raw_status))&&z.evidence_disposition.current_operations_verified===false&&z.evidence_disposition.additive===false;}
  if(exactObject(value)&&value.schema_version==="national-exact-zip-industry-evidence-matrix@2.1.0")return validExactZipEvidenceV21(value,zip);
  const legacyKeys = [
      "schema_version",
      "status",
      "row",
      "out_of_cohort_source_zip_gaps",
      "source_quality_gaps",
      "source_address_row_gaps",
      "source_metadata",
      "status_counts",
      "serialized_status_value_counts",
      "cell_status_counts_by_dimension",
      "reclassified_absent_source_row_cells",
      "release_id",
      "manifest_sha256",
      "temporal_qualification",
      "source_bytes_read",
      "full_matrix_replay_performed",
      "claims",
    ], leanKeys = ["schema_version", "status", "row", "source_metadata", "status_counts", "cell_status_counts_by_dimension", "release_id", "manifest_sha256", "temporal_qualification", "source_bytes_read", "full_matrix_replay_performed", "claims"];
  if (!exactKeys(value, legacyKeys) && !exactKeys(value, leanKeys))
    return false;
  const v = value as ExactZipEvidence,
    childcarePin = childcareRegistration.retained_release,
    nativePin = zipSourceStatusRegistration.retained_release;
  const tq=v.temporal_qualification;
  if(!exactKeys(tq,["schema_version","zip5","assessment_as_of","rows","summary","provenance","claims"])||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@1.1.0"||tq.zip5!==zip||tq.assessment_as_of!=="2026-10-02T16:30:00.000Z"||!Array.isArray(tq.rows)||tq.rows.length!==40||!exactKeys(tq.provenance,["release_id","manifest_sha256","artifact_sha256","bindings"])||tq.provenance.release_id!=="exact-zip-industry-temporal-qualification-d4c84e6c4665b66c9629d942764ab26904f8571e17c2c5a6cca56b89bfdaf4ee"||tq.provenance.manifest_sha256!=="c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409"||!sha(tq.provenance.artifact_sha256)||!exactKeys(tq.claims,["current_operations_verified","active_business_count","all_business_denominator","all_business_completion_percent","additive","network_requests","acquisition_performed","current_pointer_written","production_enrollment"])||tq.claims.current_operations_verified!==false||tq.claims.active_business_count!==null||tq.claims.all_business_denominator!==null||tq.claims.all_business_completion_percent!==null||tq.claims.additive!==false||tq.claims.network_requests!==0||tq.claims.acquisition_performed!==false||tq.claims.current_pointer_written!==false||tq.claims.production_enrollment!==false)return false;
  const tRows=tq.rows;
  if(tRows.some((r,i)=>!exactKeys(r,["dimension_id","source_key","source_release_id","semantic_class","source_status_term","source_reference_at","assessment_as_of","review_qualification","review_due_at","evidence_disposition","current_operations_verified"])||r.dimension_id!==EXACT_ZIP_SOURCES[i]||!(["source-defined-current","non-active-reporting","unmapped"].includes(r.semantic_class))||!(["within-review-window","stale","unmeasured","unmapped"].includes(r.review_qualification))||r.assessment_as_of!==tq.assessment_as_of||r.current_operations_verified!==false||(r.semantic_class==="unmapped")!==(r.source_key===null)||(r.semantic_class==="unmapped")!==(r.review_qualification==="unmapped")||!sameClosed(r.evidence_disposition,exactZipDisposition(v.row?.cells?.[r.dimension_id]?.status??"unavailable",r.semantic_class,r.review_qualification))))return false;
  const qualificationCounts=Object.fromEntries(["within-review-window","stale","unmeasured","unmapped"].map(status=>[status,tRows.filter(row=>row.review_qualification===status).length])), semanticCounts=Object.fromEntries(["source-defined-current","non-active-reporting","unmapped"].map(status=>[status,tRows.filter(row=>row.semantic_class===status).length])), binds=tq.provenance.bindings;
  if(!sameClosed(qualificationCounts,{"within-review-window":26,stale:1,unmeasured:4,unmapped:9})||!sameClosed(semanticCounts,{"source-defined-current":23,"non-active-reporting":8,unmapped:9})||tq.summary?.qualification_cell_total!==48194*40||tq.summary?.semantic_cell_total!==48194*40||tq.summary?.zip_cohort_members!==48194||!exactKeys(binds,["matrix","temporal","qualification"])||!exactKeys(binds.matrix,["release_id","manifest_sha256","artifact_inventory_sha256","registration_sha256"])||binds.matrix.release_id!=="national-exact-zip-industry-evidence-matrix-0055db697e2ef0900edb00b43e8114c146ad446a0bbb41633b938d445f74b003"||binds.matrix.manifest_sha256!=="aa155af612f232bafe83d59583500452326bcd16d565c4445425b9f99a8f4ad1"||!sha(binds.matrix.artifact_inventory_sha256)||!sha(binds.matrix.registration_sha256)||!exactKeys(binds.temporal,["release_id","manifest_sha256","artifact_sha256","registration_sha256"])||binds.temporal.release_id!=="national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090"||binds.temporal.manifest_sha256!=="342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05"||!sha(binds.temporal.artifact_sha256)||!sha(binds.temporal.registration_sha256)||!exactKeys(binds.qualification,["release_id","manifest_sha256","projection_sha256","inventory_sha256","registration_sha256","assessment_as_of"])||binds.qualification.release_id!=="zip-active-evidence-76630f473281f971dc8e588ad7cf918ef649ae6c3597f995118b1238223969d9"||binds.qualification.manifest_sha256!=="9872e4b46fe01fc529ac189cda20a5a8a28d0a39904c8742b931934a5ce0b493"||binds.qualification.projection_sha256!=="bb4314e0d76a6d0507093bd00992dd29a4caa28e34e43d1d2b5e1b9ea58ee4c8"||binds.qualification.inventory_sha256!=="9f00f1a86252dace3a209bbe628a104046947ab8c0097d3eb75a97c12ac2b5e5"||binds.qualification.assessment_as_of!==tq.assessment_as_of)return false;
  if (exactKeys(value, leanKeys)) {
    {
      const row=v.row, claims=v.claims;
      if(v.full_matrix_replay_performed!==false||!Number.isSafeInteger(v.source_bytes_read)||v.source_bytes_read<=0)return false;
      if(v.status!=="present"||v.release_id!==binds.matrix.release_id||v.manifest_sha256!==binds.matrix.manifest_sha256||!exactKeys(claims,["wa_broad_jurisdiction_gap_complete","physical_site_inference_permitted","establishment_inference_permitted","current_operations_verified","all_business_completeness_percent","nonadditive","record_level_export_policy","aggregate_export_policy","zip4_joined_to_zip5","production_enrollment","network_requests","current_pointer_written"])||claims.current_operations_verified!==false||claims.all_business_completeness_percent!==null||claims.nonadditive!==true||claims.physical_site_inference_permitted!==false||claims.establishment_inference_permitted!==false||claims.production_enrollment!==false||claims.zip4_joined_to_zip5!==false||claims.network_requests!==0||claims.current_pointer_written!==false||!exactObject(v.source_metadata)||!exactObject(v.cell_status_counts_by_dimension))return false;
      const metadataSources=EXACT_ZIP_SOURCES.filter(source=>source!=="wa_lni_active_contractor_organization_mailing_addresses");
      if(Object.keys(v.source_metadata).length!==39||metadataSources.some(source=>!(source in v.source_metadata))||Object.values(v.source_metadata).some(metadata=>metadata.current_operation_verified!==false)||v.source_metadata.childcare_md_candidates?.export_policy!=="internal")return false;
      if(v.source_metadata.childcare_pa_candidates?.zero_evidence_semantics?.exact_zip_denominator!==false)return false;
      if(row===null)return true;
      if(!exactKeys(row,["schema_version","zip5","zip4","cohort_classification","usps_validity","zcta_geoid","cells"])||row.schema_version!=="national-exact-zip-industry-evidence-matrix-row@1.9.0"||row.zip5!==zip||row.zip4!==null||row.usps_validity!==null||!exactObject(row.cells)||Object.keys(row.cells).length!==40||EXACT_ZIP_SOURCES.some(source=>!(source in row.cells)))return false;
      for(const source of EXACT_ZIP_PROFILE_SOURCES){const metadata=v.source_metadata[source],cell=row.cells[source],observation=metadata?.source_observation,statusCounts=cell?.source_status_counts,clock=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);if(metadata?.source_refresh_asserted!==false||!observation||!clock(observation.earliest_observed_at)||!clock(observation.latest_observed_at)||!exactObject(statusCounts)||Object.values(statusCounts).some(value=>!Number.isSafeInteger(value)||Number(value)<0)||Object.values(statusCounts).reduce((sum,value)=>sum+Number(value),0)!==(cell.count??0))return false;}
      return Object.values(row.cells).every(cell=>["positive","measured-zero","outside-source-denominator","absent-from-retained-source-rows"].includes(cell.status)&&(cell.status==="positive"?Number.isSafeInteger(cell.count)&&Number(cell.count)>0:cell.status==="measured-zero"?cell.count===0:cell.count===null));
    }
  }
  const expectedQuality: ExactZipQualityGap[] = [
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "MD",
      source_id: "md-msde-childcare-centers",
      reason: "invalid-source-zip-range",
      candidate_rows: 1,
      source_release_id: childcarePin.release_id,
      source_reference_date:
        childcarePin.sources.MD.provenance.source_updated_at,
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "missing-source-zip",
      reported_center_rows: 27,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
    {
      zip5: null,
      quality_dimension: "source-zip",
      publisher_scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      reason: "invalid-source-zip-placeholder",
      reported_center_rows: 145,
      source_release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      source_observed_at: "2026-09-08T00:36:36.628Z",
    },
  ];
  const addressGapDimensions = new Set([
    "broad_org_co_organization_addresses",
    "broad_org_ct_organization_addresses",
    "broad_org_de_license_addresses",
    "broad_org_fl_organization_addresses",
    "broad_org_ia_organization_addresses",
    "broad_org_ny_organization_addresses",
    "broad_org_or_legal_registration_addresses",
    "broad_org_or_brand_registration_addresses",
    "broad_org_pa_organization_addresses",
  ]);
  const profileSpecs: Record<
    (typeof EXACT_ZIP_PROFILE_SOURCES)[number],
    { source_id: string; release_id: string; count: number; zips: number }
  > = {
    ak_license_location_profiles: {
      source_id: "alaska-dcced-active-business-licenses",
      release_id: "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc",
      count: 94550,
      zips: 4383,
    },
    ca_abc_license_location_profiles: {
      source_id: "california-abc-daily-active-licenses",
      release_id: "ca-abc-active-licenses-2026-09-07-4adb619cd534904b",
      count: 84497,
      zips: 2920,
    },
    chicago_license_location_profiles: {
      source_id: "city-of-chicago-bacp-current-active-business-licenses",
      release_id:
        "chicago-active-business-licenses-2026-09-02-5509fc257e382b49",
      count: 42940,
      zips: 1033,
    },
    dc_basic_license_location_profiles: {
      source_id: "dc-dlcp-active-basic-business-licenses",
      release_id: "dc-basic-business-licenses-2026-09-07-70f09a6a032c9408",
      count: 54910,
      zips: 3125,
    },
    la_registered_location_profiles: {
      source_id: "los-angeles-office-of-finance-active-businesses",
      release_id: "la-active-businesses-2026-08-15-7a4190d1dfe2b2ac",
      count: 633232,
      zips: 5371,
    },
    ny_retail_food_location_profiles: {
      source_id: "new-york-agriculture-markets-retail-food-stores",
      release_id: "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
      count: 24230,
      zips: 1498,
    },
    nyc_dcwp_license_location_profiles: {
      source_id: "nyc-dcwp-issued-licenses-active-premises",
      release_id: "nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec",
      count: 31163,
      zips: 1550,
    },
    tx_sales_tax_outlet_profiles: {
      source_id: "texas-comptroller-active-sales-tax-permits",
      release_id: "tx-active-sales-tax-2026-08-29-98b90d177d81493e",
      count: 885097,
      zips: 2156,
    },
  };
  const reportingSpecs: Record<
    string,
    {
      scope: string;
      source_id: string;
      release_id: string;
      manifest: string;
      manifest_sha256: string;
      count: number;
      zips: number;
      statuses: Record<string, number>;
      observed_at: string | null;
      earliest: string;
      latest: string;
      zip4: number;
      coordinates: number;
      ineligible: number;
    }
  > = {
    childcare_ma_reporting_centers: {
      scope: "MA",
      source_id: "ma-licensed-center-based-childcare",
      release_id:
        "ma-childcare-c6b4990deeedb98fb2bc384c420b2fe3c0d37892398f1596d11ca077ed2e80b5",
      manifest:
        "data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json",
      manifest_sha256:
        "c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc",
      count: 3007,
      zips: 438,
      statuses: {
        Current: 2561,
        "Renewal in progress": 431,
        Expired: 13,
        "Regional Enrollment Freeze": 2,
      },
      observed_at: "2026-09-07T19:10:25.331Z",
      earliest: "2026-09-07T19:10:25.331Z",
      latest: "2026-09-07T19:10:25.331Z",
      zip4: 1113,
      coordinates: 3007,
      ineligible: 0,
    },
    childcare_nj_reporting_centers: {
      scope: "NJ",
      source_id: "nj-licensed-childcare-centers",
      release_id:
        "nj-childcare-a9ed3d970922f919cee26a93310677b81a8319ae6ce960d83b34f607fec34f69",
      manifest:
        "data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json",
      manifest_sha256:
        "b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e",
      count: 4075,
      zips: 525,
      statuses: { null: 4075 },
      observed_at: "2026-09-07T20:05:27.313Z",
      earliest: "2026-09-07T20:05:27.313Z",
      latest: "2026-09-07T20:05:27.313Z",
      zip4: 0,
      coordinates: 4075,
      ineligible: 0,
    },
    childcare_tn_reporting_centers: {
      scope: "TN",
      source_id: "tn-dhs-active-childcare-centers",
      release_id:
        "tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7",
      manifest:
        "data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json",
      manifest_sha256:
        "98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d",
      count: 1863,
      zips: 327,
      statuses: { Active: 1863 },
      observed_at: "2026-09-08T00:36:36.628Z",
      earliest: "2026-09-08T00:36:36.628Z",
      latest: "2026-09-08T00:36:36.628Z",
      zip4: 259,
      coordinates: 1860,
      ineligible: 0,
    },
    childcare_oh_reporting_centers: {
      scope: "OH",
      source_id: "oh-dcy-publisher-open-childcare-centers",
      release_id:
        "oh-childcare-2c38df58d6d977c7e93a26d6b1e730e7850ec893b6f5a947b76d5060e1cc6e4b",
      manifest:
        "data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json",
      manifest_sha256:
        "e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171",
      count: 4237,
      zips: 674,
      statuses: { Open: 4237 },
      observed_at: null,
      earliest: "2026-09-08T08:30:15.824Z",
      latest: "2026-09-08T08:31:02.735Z",
      zip4: 0,
      coordinates: 4237,
      ineligible: 4237,
    },
  };
  const validClock = (value: unknown) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
  if (
    v.schema_version !== "national-exact-zip-industry-evidence-matrix@1.9.0" ||
    v.status !== "present" ||
    !/^national-exact-zip-industry-evidence-matrix-[a-f0-9]{64}$/.test(
      v.release_id,
    ) ||
    !sha(v.manifest_sha256) ||
    !nonnegative(v.source_bytes_read) ||
    v.full_matrix_replay_performed !== false ||
    !Array.isArray(v.out_of_cohort_source_zip_gaps) ||
    !v.out_of_cohort_source_zip_gaps.every(
      (g) =>
        exactKeys(
          g,
          g.publisher_scope
            ? [
                "zip5",
                "source_id",
                "publisher_scope",
                "count",
                "measure",
                "source_release_id",
                "temporal_status",
              ]
            : [
                "zip5",
                "source_id",
                "count",
                "measure",
                "source_release_id",
                "temporal_status",
              ],
        ) &&
        /^\d{5}$/.test(g.zip5) &&
        /^[a-z0-9_]+$/.test(g.source_id) &&
        (g.publisher_scope === undefined ||
          ["PA", "CT", "MD", "VT", "CO", "UT", "IA"].includes(
            g.publisher_scope,
          )) &&
        Number.isSafeInteger(g.count) &&
        g.count > 0 &&
        typeof g.measure === "string" &&
        g.measure.length > 0 &&
        typeof g.source_release_id === "string" &&
        exactKeys(g.temporal_status, ["status", "source_reference_date"]) &&
        [
          "source-referenced-current-operation-unverified",
          "source-reference-unresolved",
        ].includes(g.temporal_status.status) &&
        (g.temporal_status.status === "source-reference-unresolved"
          ? g.temporal_status.source_reference_date === null
          : typeof g.temporal_status.source_reference_date === "string"),
    ) ||
    !Array.isArray(v.source_quality_gaps) ||
    !sameClosed(v.source_quality_gaps, expectedQuality) ||
    !Array.isArray(v.source_address_row_gaps) ||
    !v.source_address_row_gaps.every(
      (g) =>
        exactKeys(g, [
          "gap_type",
          "publisher_jurisdiction",
          "record_kind",
          "dimension_id",
          "zip5",
          "zip_partition_reason",
          "address_rows",
          "source_release_id",
          "source_manifest_path",
          "source_manifest_sha256",
          "source_reference_date",
          "temporal_status",
        ]) &&
        g.gap_type === "source-address-row-without-eligible-zip5" &&
        /^[A-Z]{2}$/.test(g.publisher_jurisdiction) &&
        ["organization", "registration", "brand"].includes(g.record_kind) &&
        addressGapDimensions.has(g.dimension_id) &&
        g.zip5 === null &&
        typeof g.zip_partition_reason === "string" &&
        g.zip_partition_reason.length > 0 &&
        nonnegative(g.address_rows) &&
        g.address_rows > 0 &&
        typeof g.source_release_id === "string" &&
        /^data\/[a-z0-9_-]+\/releases\/[A-Za-z0-9-]+\/manifest\.json$/.test(
          g.source_manifest_path,
        ) &&
        sha(g.source_manifest_sha256) &&
        typeof g.source_reference_date === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(g.source_reference_date) &&
        exactKeys(g.temporal_status, ["status", "source_reference_date"]) &&
        g.temporal_status.status ===
          "source-referenced-current-operation-unverified" &&
        g.temporal_status.source_reference_date === g.source_reference_date,
    )
  )
    return false;
  const claimKeys = [
    "wa_broad_jurisdiction_gap_complete",
    "physical_site_inference_permitted",
    "establishment_inference_permitted",
    "current_operations_verified",
    "all_business_completeness_percent",
    "nonadditive",
    "record_level_export_policy",
    "aggregate_export_policy",
    "zip4_joined_to_zip5",
    "network_requests",
    "current_pointer_written",
    "production_enrollment",
  ];
  if (
    !exactKeys(v.claims, claimKeys) ||
    v.claims.all_business_completeness_percent !== null ||
    v.claims.nonadditive !== true ||
    v.claims.record_level_export_policy !== "local-review-only" ||
    v.claims.aggregate_export_policy !== "public-under-pddl-with-attribution-and-semantic-limitations" ||
    v.claims.network_requests !== 0 ||
    ["wa_broad_jurisdiction_gap_complete", "physical_site_inference_permitted", "establishment_inference_permitted", "current_operations_verified", "zip4_joined_to_zip5", "current_pointer_written", "production_enrollment"]
      .some((k) => (v.claims as unknown as Record<string, unknown>)[k] !== false)
  )
    return false;
  if (
    !exactObject(v.source_metadata) ||
    JSON.stringify(Object.keys(v.source_metadata)) !==
      JSON.stringify(EXACT_ZIP_SOURCES)
  )
    return false;
  const validMetadata = EXACT_ZIP_SOURCES.every((source) => {
    const metadata = v.source_metadata[source],
      base = [
        "source_reference_field",
        "current_operation_verified",
        "semantics",
        "source_manifest",
        "source_manifest_sha256",
        "zero_evidence_semantics",
      ],
      childcare =
        source.startsWith("childcare_") && source.endsWith("_candidates"),
      reporting =
        source.startsWith("childcare_") && !source.endsWith("_candidates"),
      broad = source.startsWith("broad_org_"),
      profile = (EXACT_ZIP_PROFILE_SOURCES as readonly string[]).includes(
        source,
      );
    const profileKeys = [
      "source_id",
      "source_release_id",
      "row_unit",
      "export_policy",
      "accepted_profile_count",
      "source_zip_count",
      "source_reference_date",
      "source_reference_basis",
      "source_status_counts",
      "source_observation",
      "source_refresh_at",
      "source_refresh_asserted",
    ];
    const reportingKeys = [
      "publisher_scope",
      "source_id",
      "source_release_id",
      "row_unit",
      "export_policy",
      "accepted_reporting_rows",
      "source_zip_count",
      "source_status_counts",
      "source_observed_at",
      "earliest_observed_at",
      "latest_observed_at",
      "source_refresh_at",
      "source_refresh_asserted",
      "zip4_rows",
      "coordinate_rows",
      "coordinate_ineligible_rows",
      "identity_matching_eligible",
      "active_business_verified",
    ];
    const expectedKeys = reporting
      ? [...base, ...reportingKeys]
      : childcare
        ? [
            ...base,
            "publisher_scope",
            "source_id",
            "row_unit",
            "export_policy",
            "accepted_candidate_rows",
            "retained_source",
          ]
        : broad
          ? [
              ...base,
              "publisher_scope",
              "source_id",
              "row_unit",
              "export_policy",
              "record_kind",
              "accepted_address_rows",
              "source_provenance",
            ]
          : profile
            ? [...base, ...profileKeys]
            : base;
    if (
      !exactKeys(metadata, expectedKeys) ||
      typeof metadata.source_reference_field !== "string" ||
      metadata.source_reference_field.length === 0 ||
      metadata.current_operation_verified !== false ||
      typeof metadata.semantics !== "string" ||
      metadata.semantics.length === 0 ||
      !/^data\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+\/manifest\.json$/.test(
        metadata.source_manifest,
      ) ||
      !sha(metadata.source_manifest_sha256)
    )
      return false;
    const stateLocal = source.startsWith("childcare_") ||
        source.startsWith("broad_org_") ||
        (EXACT_ZIP_PROFILE_SOURCES as readonly string[]).includes(source),
      outsideDenominator = [
        "healthcare_organizations",
        "regulated_facilities",
        "fdic_offices",
        "food_safety_establishments",
        "credit_union_locations",
        "snap_retailers",
      ].includes(source),
      exactDenominator = [
        "pharmacy",
        "transportation",
        "tax_exempt_organizations",
        "cms_hospital_directory",
        "cms_nursing_home_directory",
      ].includes(source),
      expectedZeroContract: ExactZipZeroEvidenceSemantics = {
        absent_cell_status: stateLocal
          ? "absent-from-retained-source-rows"
          : outsideDenominator
            ? "outside-source-denominator"
            : "measured-zero",
        exact_zip_denominator: exactDenominator,
        explicit_zero_evidence_allowed: !stateLocal,
        interpretation: metadata.zero_evidence_semantics?.interpretation ?? "",
      };
    if (
      !exactKeys(metadata.zero_evidence_semantics, [
        "absent_cell_status",
        "exact_zip_denominator",
        "explicit_zero_evidence_allowed",
        "interpretation",
      ]) ||
      metadata.zero_evidence_semantics.absent_cell_status !== expectedZeroContract.absent_cell_status ||
      metadata.zero_evidence_semantics.exact_zip_denominator !== expectedZeroContract.exact_zip_denominator ||
      metadata.zero_evidence_semantics.explicit_zero_evidence_allowed !== expectedZeroContract.explicit_zero_evidence_allowed ||
      typeof metadata.zero_evidence_semantics.interpretation !== "string" ||
      metadata.zero_evidence_semantics.interpretation.length < 30 ||
      (stateLocal && !metadata.zero_evidence_semantics.interpretation.includes("not measured zero or completeness")) ||
      (!stateLocal && !outsideDenominator && !metadata.zero_evidence_semantics.interpretation.includes("supports a zero source-row count")) ||
      (outsideDenominator && !metadata.zero_evidence_semantics.interpretation.includes("outside-source-denominator"))
    ) return false;
    if (profile) {
      const expected = profileSpecs[source as keyof typeof profileSpecs],
        counts = metadata.source_status_counts,
        observation = metadata.source_observation,
        referenceDate =
          expected.release_id.match(/-(\d{4}-\d{2}-\d{2})-/)?.[1] ?? null;
      const expectedCounts =
        source === "la_registered_location_profiles"
          ? { present: 0, "empty-object": 0, missing: 0, null: expected.count }
          : { present: expected.count, "empty-object": 0, missing: 0, null: 0 };
      return (
        metadata.source_id === expected.source_id &&
        metadata.source_release_id === expected.release_id &&
        metadata.source_reference_field === "source_release_id.date_token" &&
        metadata.source_manifest === nativePin.manifest &&
        metadata.source_manifest_sha256 === nativePin.manifest_sha256 &&
        metadata.row_unit === "registry-location-profile" &&
        metadata.export_policy === "local-review-only" &&
        metadata.accepted_profile_count === expected.count &&
        metadata.source_zip_count === expected.zips &&
        metadata.source_reference_date === referenceDate &&
        metadata.source_reference_basis ===
          "date token in pinned native source release ID; not an observed-at or refresh timestamp" &&
        sameClosed(counts, expectedCounts) &&
        exactKeys(observation, [
          "earliest_observed_at",
          "latest_observed_at",
          "observed_at_present",
          "observed_at_missing",
        ]) &&
        validClock(observation.earliest_observed_at) &&
        validClock(observation.latest_observed_at) &&
        observation.observed_at_present === expected.count &&
        observation.observed_at_missing === 0 &&
        metadata.source_refresh_at === null &&
        metadata.source_refresh_asserted === false &&
        metadata.semantics.includes("not unique businesses") &&
        metadata.semantics.includes("current operations")
      );
    }
    if (reporting) {
      const expected = reportingSpecs[source],
        counts = metadata.source_status_counts;
      return (
        !!expected &&
        metadata.publisher_scope === expected.scope &&
        metadata.source_id === expected.source_id &&
        metadata.source_release_id === expected.release_id &&
        metadata.source_manifest === expected.manifest &&
        metadata.source_manifest_sha256 === expected.manifest_sha256 &&
        metadata.source_reference_field ===
          (expected.observed_at === expected.earliest &&
          expected.earliest === expected.latest
            ? "source_observed_at"
            : "row.observed_at") &&
        metadata.row_unit === "publisher-reported-center-row" &&
        metadata.export_policy === "local-review-only" &&
        metadata.accepted_reporting_rows === expected.count &&
        metadata.source_observed_at === expected.observed_at &&
        metadata.earliest_observed_at === expected.earliest &&
        metadata.latest_observed_at === expected.latest &&
        metadata.source_refresh_at === null &&
        metadata.source_refresh_asserted === false &&
        metadata.zip4_rows === expected.zip4 &&
        metadata.coordinate_rows === expected.coordinates &&
        metadata.coordinate_ineligible_rows === expected.ineligible &&
        metadata.identity_matching_eligible === false &&
        metadata.active_business_verified === false &&
        sameClosed(counts, expected.statuses) &&
        metadata.semantics.includes("not verification of current operation")
      );
    }
    if (childcare) {
      const scope =
          metadata.publisher_scope as keyof typeof childcarePin.sources,
        retained = childcarePin.sources[scope];
      return (
        !!retained &&
        metadata.publisher_scope ===
          source
            .slice("childcare_".length, source.length - "_candidates".length)
            .toUpperCase() &&
        metadata.source_id === retained.source_id &&
        metadata.row_unit === retained.source_claims.row_unit &&
        metadata.export_policy === "internal" &&
        metadata.accepted_candidate_rows === retained.accepted_candidate_rows &&
        metadata.source_manifest === childcarePin.manifest &&
        metadata.source_manifest_sha256 === childcarePin.manifest_sha256 &&
        sameClosed(metadata.retained_source, retained)
      );
    }
    if (broad) {
      const dimensions: Record<
          string,
          { scope: string; kind: string; measure: string }
        > = {
          broad_org_co_organization_addresses: {
            scope: "CO",
            kind: "organization",
            measure: "organization_address_rows",
          },
          broad_org_ct_organization_addresses: {
            scope: "CT",
            kind: "organization",
            measure: "organization_address_rows",
          },
          broad_org_de_license_addresses: {
            scope: "DE",
            kind: "organization",
            measure: "license_address_rows",
          },
          broad_org_fl_organization_addresses: {
            scope: "FL",
            kind: "organization",
            measure: "organization_address_rows",
          },
          broad_org_ia_organization_addresses: {
            scope: "IA",
            kind: "organization",
            measure: "organization_address_rows",
          },
          broad_org_ny_organization_addresses: {
            scope: "NY",
            kind: "organization",
            measure: "organization_address_rows",
          },
          broad_org_or_legal_registration_addresses: {
            scope: "OR",
            kind: "registration",
            measure: "legal_registration_address_rows",
          },
          broad_org_or_brand_registration_addresses: {
            scope: "OR",
            kind: "brand",
            measure: "brand_registration_address_rows",
          },
          broad_org_pa_organization_addresses: {
            scope: "PA",
            kind: "organization",
            measure: "organization_address_rows",
          },
        },
        dimension = dimensions[source],
        provenance = metadata.source_provenance,
        sourceMetadataKeys = [
          "publisher_jurisdiction",
          "source_dataset_id",
          "normalized_release_id",
          "normalized_manifest_path",
          "normalized_manifest_sha256",
          "source_release_id",
          "source_rows_reference_field",
          "source_reference_date",
          "source_manifest_sha256",
          "policy_id",
          "policy_version",
          "policy_path",
          "policy_sha256",
          "export_policy",
          "record_unit_semantics",
          "address_semantics",
          "current_operation_verified",
          "physical_establishment_verified",
          "zip4_joined",
          "usps_validity",
          "dimension_ids",
        ];
      return (
        !!dimension &&
        metadata.publisher_scope === dimension.scope &&
        metadata.source_id === provenance?.source_dataset_id &&
        metadata.record_kind === dimension.kind &&
        typeof metadata.row_unit === "string" &&
        metadata.row_unit.length > 10 &&
        metadata.export_policy ===
          (dimension.scope === "DE"
            ? "local-review-only"
            : "source-policy-controlled") &&
        nonnegative(metadata.accepted_address_rows) &&
        exactKeys(provenance, sourceMetadataKeys) &&
        provenance.publisher_jurisdiction === dimension.scope &&
        provenance.current_operation_verified === false &&
        provenance.physical_establishment_verified === false &&
        provenance.zip4_joined === false &&
        provenance.usps_validity === "unknown" &&
        Array.isArray(provenance.dimension_ids) &&
        provenance.dimension_ids.includes(source) &&
        sha(provenance.normalized_manifest_sha256) &&
        sha(provenance.source_manifest_sha256) &&
        sha(provenance.policy_sha256) &&
        typeof provenance.source_reference_date === "string" &&
        metadata.source_reference_field ===
          provenance.source_rows_reference_field &&
        metadata.source_manifest.endsWith("/manifest.json")
      );
    }
    return true;
  });
  if (!validMetadata) return false;
  const statusKeys = [
      "positive",
      "measured-zero",
      "outside-source-denominator",
      "absent-from-retained-source-rows",
      "unavailable",
    ],
    expectedStatusCounts = {
      positive: 336058,
      "measured-zero": 248869,
      "outside-source-denominator": 57452,
      "absent-from-retained-source-rows": 1237187,
      unavailable: 0,
    },
    aggregateDimensionCounts = Object.fromEntries(statusKeys.map((key) => [key, 0])) as Record<string, number>;
  if (
    !sameClosed(v.status_counts, expectedStatusCounts) ||
    !sameClosed(v.serialized_status_value_counts, {
      positive: { cells: 336058, numeric_cells: 336058, null_cells: 0 },
      "measured-zero": { cells: 248869, numeric_cells: 248869, null_cells: 0 },
      "outside-source-denominator": { cells: 57452, numeric_cells: 0, null_cells: 57452 },
      "absent-from-retained-source-rows": { cells: 1237187, numeric_cells: 0, null_cells: 1237187 },
    }) ||
    v.reclassified_absent_source_row_cells !== 1237187 ||
    !exactObject(v.cell_status_counts_by_dimension) ||
    JSON.stringify(Object.keys(v.cell_status_counts_by_dimension)) !==
      JSON.stringify(EXACT_ZIP_SOURCES) ||
    !EXACT_ZIP_SOURCES.every((source) => {
      const counts = v.cell_status_counts_by_dimension[source];
      if (!exactKeys(counts, statusKeys) ||
        !statusKeys.every((key) => nonnegative(counts[key])) ||
        statusKeys.reduce((sum, key) => sum + counts[key], 0) !== 48194) return false;
      for (const key of statusKeys) aggregateDimensionCounts[key] += counts[key];
      const contract = v.source_metadata[source].zero_evidence_semantics;
      return (contract.explicit_zero_evidence_allowed || counts["measured-zero"] === 0) &&
        statusKeys.every((key) => nonnegative(counts[key])) &&
        statusKeys.reduce((sum, key) => sum + counts[key], 0) === 48194;
    }) || !sameClosed(aggregateDimensionCounts, v.status_counts)
  ) return false;
  if (v.row === null)
    return v.out_of_cohort_source_zip_gaps.every((g) => g.zip5 === zip);
  const r = v.row;
  if (
    !exactKeys(r, [
      "schema_version",
      "zip5",
      "zip4",
      "cohort_classification",
      "usps_validity",
      "zcta_geoid",
      "cells",
    ]) ||
    r.schema_version !==
      "national-exact-zip-industry-evidence-matrix-row@1.9.0" ||
    r.zip5 !== zip ||
    r.zip4 !== null ||
    r.usps_validity !== null ||
    typeof r.cohort_classification !== "string" ||
    !(r.zcta_geoid === null || /^\d{5}$/.test(r.zcta_geoid)) ||
    !exactObject(r.cells) ||
    JSON.stringify(Object.keys(r.cells)) !==
      JSON.stringify(EXACT_ZIP_SOURCES) ||
    v.out_of_cohort_source_zip_gaps.length !== 0
  )
    return false;
  return EXACT_ZIP_SOURCES.every((source) => {
    const cell = r.cells[source],
      temporal = cell?.temporal_status,
      profile = (EXACT_ZIP_PROFILE_SOURCES as readonly string[]).includes(
        source,
      ),
      reporting =
        source.startsWith("childcare_") && !source.endsWith("_candidates"),
      cellKeys =
        profile || reporting
          ? [
              "status",
              "count",
              "measure",
              "source_release_id",
              "temporal_status",
              "source_status_counts",
            ]
          : [
              "status",
              "count",
              "measure",
              "source_release_id",
              "temporal_status",
            ];
    if (
      !exactKeys(cell, cellKeys) ||
      !["positive", "measured-zero", "outside-source-denominator", "absent-from-retained-source-rows"].includes(
        cell.status,
      ) ||
      typeof cell.measure !== "string" ||
      cell.measure.length === 0 ||
      typeof cell.source_release_id !== "string" ||
      cell.source_release_id.length === 0 ||
      (cell.status === "positive" && (!nonnegative(cell.count) || cell.count === 0)) ||
      (cell.status === "measured-zero" && cell.count !== 0) ||
      (cell.status === "outside-source-denominator" && cell.count !== null) ||
      (cell.status === "absent-from-retained-source-rows" && cell.count !== null) ||
      (cell.status === "absent-from-retained-source-rows" &&
        v.source_metadata[source].zero_evidence_semantics.absent_cell_status !== cell.status) ||
      (cell.status === "measured-zero" &&
        v.source_metadata[source].zero_evidence_semantics.explicit_zero_evidence_allowed !== true) ||
      (cell.status === "outside-source-denominator" &&
        v.source_metadata[source].zero_evidence_semantics.absent_cell_status !== cell.status) ||
      !exactKeys(temporal, ["status", "source_reference_date"]) ||
      ![
        "source-referenced-current-operation-unverified",
        "source-reference-unresolved",
      ].includes(temporal.status) ||
      (temporal.status === "source-reference-unresolved"
        ? temporal.source_reference_date !== null
        : typeof temporal.source_reference_date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}/.test(temporal.source_reference_date))
    )
      return false;
    const isReporting =
      source.startsWith("childcare_") && !source.endsWith("_candidates");
    if (isReporting) {
      const labels: Record<string, string[]> = {
        childcare_ma_reporting_centers: [
          "Current",
          "Renewal in progress",
          "Expired",
          "Regional Enrollment Freeze",
        ],
        childcare_nj_reporting_centers: ["null"],
        childcare_tn_reporting_centers: ["Active"],
        childcare_oh_reporting_centers: ["Open"],
      };
      const counts = cell.source_status_counts,
        retainedRowCount = cell.status === "absent-from-retained-source-rows" ? 0 : cell.count;
      return (
        !!counts &&
        Object.entries(counts).every(
          ([label, value]) =>
            labels[source]?.includes(label) &&
            Number.isSafeInteger(value) &&
            value > 0,
        ) &&
        Object.values(counts).reduce((n, value) => n + value, 0) ===
          retainedRowCount &&
        cell.measure === "reported_center_rows" &&
        cell.temporal_status.status ===
          "source-referenced-current-operation-unverified"
      );
    }
    if (!profile) return true;
    const statusCounts = cell.source_status_counts,
      retainedRowCount = cell.status === "absent-from-retained-source-rows" ? 0 : cell.count,
      expected =
        source === "la_registered_location_profiles"
          ? { present: 0, "empty-object": 0, missing: 0, null: retainedRowCount }
          : { present: retainedRowCount, "empty-object": 0, missing: 0, null: 0 };
    return (
      sameClosed(statusCounts, expected) &&
      statusCounts.present +
        statusCounts["empty-object"] +
        statusCounts.missing +
        statusCounts.null ===
        retainedRowCount &&
      cell.measure === "registry_location_profile_count" &&
      cell.temporal_status.status ===
        "source-referenced-current-operation-unverified" &&
      cell.temporal_status.source_reference_date ===
        v.source_metadata[source].source_reference_date
    );
  });
}
const profileSourceLabels: Record<string, string> = {
  ak_license_location_profiles: "Alaska license location profiles",
  ca_abc_license_location_profiles: "California ABC license location profiles",
  chicago_license_location_profiles: "Chicago license location profiles",
  dc_basic_license_location_profiles: "D.C. basic-license location profiles",
  la_registered_location_profiles: "Los Angeles registered locations",
  ny_retail_food_location_profiles: "New York retail-food location profiles",
  nyc_dcwp_license_location_profiles: "NYC DCWP license location profiles",
  tx_sales_tax_outlet_profiles: "Texas sales-tax outlet profiles",
};
const sourceLabel = (source: string) =>
  profileSourceLabels[source] ??
  (
    {
      healthcare_organizations: "Health-care organizations",
      regulated_facilities: "Regulated facilities",
      fdic_offices: "FDIC offices",
      food_safety_establishments: "Food-safety establishments",
      credit_union_locations: "Credit-union locations",
      snap_retailers: "SNAP retailers",
      pharmacy: "Pharmacy organizations",
      transportation: "Transportation registrations",
      tax_exempt_organizations: "Tax-exempt organizations",
      cms_hospital_directory: "CMS hospital directory rows",
      cms_nursing_home_directory: "CMS nursing-home directory rows",
      childcare_pa_candidates: "PA childcare candidate rows",
      childcare_ct_candidates: "CT childcare candidate rows",
      childcare_md_candidates: "MD childcare candidate rows",
      childcare_vt_candidates: "VT childcare candidate rows",
      childcare_co_candidates: "CO childcare candidate rows",
      childcare_ut_candidates: "UT childcare candidate rows",
      childcare_ia_candidates: "IA childcare candidate rows",
      childcare_ma_reporting_centers: "MA childcare reporting-center rows",
      childcare_nj_reporting_centers: "NJ childcare reporting-center rows",
      childcare_tn_reporting_centers: "TN childcare reporting-center rows",
      childcare_oh_reporting_centers: "OH childcare reporting-center rows",
      broad_org_co_organization_addresses: "CO organization-address rows",
      broad_org_ct_organization_addresses: "CT organization-address rows",
      broad_org_de_license_addresses: "DE business-license address rows",
      broad_org_fl_organization_addresses: "FL organization-address rows",
      broad_org_ia_organization_addresses: "IA organization-address rows",
      broad_org_ny_organization_addresses: "NY organization-address rows",
      broad_org_or_legal_registration_addresses:
        "OR legal-registration address rows",
      broad_org_or_brand_registration_addresses:
        "OR brand-registration address rows",
      broad_org_pa_organization_addresses: "PA organization-address rows",
      dc_active_basic_business_license_physical_sites: "D.C. active basic business license physical sites",
    } as Record<string, string>
  )[source] ??
  source.replaceAll("_", " ");
// Closed application contract for the immutable 51-dimension v3.0 matrix's v3.1 summary projection.
const EXACT_ZIP_V31_SUMMARY_CONTRACT = [
  ["healthcare_organizations",[28056,10630,9508,0,0],{"source_key":"cms_nppes_organizations","source_release_id":"NPPES_Data_Dissemination_August_2026_V2","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-08-09T23:59:59.999Z","review_due_at":"2026-10-23T23:59:59.999Z","source_status_term":"monthly enumeration extract membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["regulated_facilities",[38401,3183,6610,0,0],{"source_key":"epa_echo_active_facilities","source_release_id":"epa-echo-2026-08-30-382d612a42041dc0","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-30T06:36:03.000Z","review_due_at":"2026-10-14T06:36:03.000Z","source_status_term":"active environmental-program facility","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["fdic_offices",[18018,19838,10338,0,0],{"source_key":"fdic_bankfind","source_release_id":"fdic-bankfind-5710a083e3b49f87","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-28T11:57:32.000Z","review_due_at":"2026-10-12T11:57:32.000Z","source_status_term":"current bank/branch structure","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["food_safety_establishments",[4367,33492,10335,0,0],{"source_key":"fsis_active_mpi_establishments","source_release_id":"fsis-mpi-2026-08-24-e7be6d8dfc46f68e","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-24T23:59:59.999Z","review_due_at":"2026-11-07T23:59:59.999Z","source_status_term":"active inspected-establishment directory","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["credit_union_locations",[9401,28454,10339,0,0],{"source_key":"ncua_quarterly_credit_unions","source_release_id":"ncua-2026-03-31-6d7fdf1e7eaf9078","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-03-31T23:59:59.999Z","review_due_at":"2026-10-17T23:59:59.999Z","source_status_term":"quarterly call-report membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["snap_retailers",[23957,13915,10322,0,0],{"source_key":"usda_snap_retailers","source_release_id":"usda-snap-20260819T174009953Z","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-19T17:40:09.953Z","review_due_at":"2026-11-02T17:40:09.953Z","source_status_term":"current retailer source membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["pharmacy",[15376,32818,0,0,0],{"source_key":"cms_nppes_organizations","source_release_id":"NPPES_Data_Dissemination_August_2026_V2","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-08-09T23:59:59.999Z","review_due_at":"2026-10-23T23:59:59.999Z","source_status_term":"monthly enumeration extract membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["transportation",[35648,12546,0,0,0],{"source_key":"fmcsa_active_us_company_census","source_release_id":"fmcsa-company-census-2026-08-30-55fd24985d97e66e","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-30T11:55:17.000Z","review_due_at":"2026-10-14T11:55:17.000Z","source_status_term":"active carrier registration","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["tax_exempt_organizations",[36950,11244,0,0,0],{"source_key":"irs_eo_bmf_organizations","source_release_id":"irs-eo-bmf-2026-08-11-d272cdb9c6c4afef","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-08-11T23:59:59.999Z","review_due_at":"2026-10-25T23:59:59.999Z","source_status_term":"current-extract filing membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["cms_hospital_directory",[4716,43478,0,0,0],{"source_key":"cms-hospital-directory","source_release_id":"cms-retained-directory-zip-evidence-87064e0f512a859e6244e7123858dae862dad4b002290a05b97581998feb9e40","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-08-13","review_due_at":null,"source_status_term":"CMS hospital directory row; directory membership is not verified current operation","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["cms_nursing_home_directory",[8923,39271,0,0,0],{"source_key":"cms-nursing-home-directory","source_release_id":"cms-retained-directory-zip-evidence-87064e0f512a859e6244e7123858dae862dad4b002290a05b97581998feb9e40","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-08-26","review_due_at":null,"source_status_term":"CMS nursing-home directory row; directory membership is not verified current operation","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_pa_candidates",[819,0,0,47375,0],{"source_key":"pa-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-08-13T14:32:18.000Z","review_due_at":null,"source_status_term":"Pennsylvania retained childcare candidate row; not a verified active business","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_ct_candidates",[230,0,0,47964,0],{"source_key":"ct-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-09-07T08:15:33.000Z","review_due_at":null,"source_status_term":"Connecticut retained childcare candidate row; not a verified active business","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_md_candidates",[299,0,0,47895,0],{"source_key":"md-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-05-27T19:48:49.000Z","review_due_at":null,"source_status_term":"Maryland retained childcare candidate row; not a verified active business","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_vt_candidates",[172,0,0,48022,0],{"source_key":"vt-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-08-14T16:48:56.000Z","review_due_at":null,"source_status_term":"Vermont retained childcare candidate row; not a verified active business","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_co_candidates",[321,0,0,47873,0],{"source_key":"co-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-09-01T15:56:30.000Z","review_due_at":null,"source_status_term":"Colorado retained childcare candidate row; not a verified active business","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_ut_candidates",[113,0,0,48081,0],{"source_key":"ut-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":null,"review_due_at":null,"source_status_term":"Utah retained childcare candidate row; publisher reference time remains unresolved","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_ia_candidates",[404,0,0,47790,0],{"source_key":"ia-childcare-centers","source_release_id":"retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":null,"review_due_at":null,"source_status_term":"Iowa retained childcare candidate row; publisher reference time remains unresolved","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_ma_reporting_centers",[438,0,0,47756,0],{"source_key":"ma_childcare_centers","source_release_id":"ma-childcare-c6b4990deeedb98fb2bc384c420b2fe3c0d37892398f1596d11ca077ed2e80b5","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":null,"review_due_at":null,"source_status_term":"licensed center directory membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_nj_reporting_centers",[525,0,0,47669,0],{"source_key":"nj_childcare_centers","source_release_id":"nj-childcare-a9ed3d970922f919cee26a93310677b81a8319ae6ce960d83b34f607fec34f69","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":null,"review_due_at":null,"source_status_term":"licensed center layer membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_tn_reporting_centers",[327,0,0,47867,0],{"source_key":"tn_childcare_centers","source_release_id":"tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7","review_qualification":"unmeasured","semantic_class":"source-defined-current","source_reference_at":null,"review_due_at":null,"source_status_term":"source Active status","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["childcare_oh_reporting_centers",[674,0,0,47520,0],{"source_key":"oh_childcare_centers","source_release_id":"oh-childcare-2c38df58d6d977c7e93a26d6b1e730e7850ec893b6f5a947b76d5060e1cc6e4b","review_qualification":"unmeasured","semantic_class":"source-defined-current","source_reference_at":null,"review_due_at":null,"source_status_term":"publisher Open status","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ak_license_location_profiles",[4383,0,0,43811,0],{"source_key":"ak_active_business_licenses","source_release_id":"ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-03T00:37:03.000Z","review_due_at":"2026-10-18T00:37:03.000Z","source_status_term":"Active business license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ca_abc_license_location_profiles",[2920,0,0,45274,0],{"source_key":"california_abc_active_issued_license_sites","source_release_id":"ca-abc-active-licenses-2026-09-07-4adb619cd534904b","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-07T10:50:28.000Z","review_due_at":"2026-10-22T10:50:28.000Z","source_status_term":"ACTIVE/LIC alcohol license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["chicago_license_location_profiles",[1033,0,0,47161,0],{"source_key":"chicago_active_business_license_sites","source_release_id":"chicago-active-business-licenses-2026-09-02-5509fc257e382b49","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T23:59:59.999Z","review_due_at":"2026-10-17T23:59:59.999Z","source_status_term":"current active municipal license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["dc_basic_license_location_profiles",[3125,0,0,45069,0],{"source_key":"dc_basic_business_license_sites","source_release_id":"dc-basic-business-licenses-2026-09-07-70f09a6a032c9408","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-07T04:00:00.000Z","review_due_at":"2026-10-22T04:00:00.000Z","source_status_term":"Active basic business license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["la_registered_location_profiles",[5371,0,0,42823,0],{"source_key":"la_active_business_location_accounts","source_release_id":"la-active-businesses-2026-08-15-7a4190d1dfe2b2ac","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-15T15:37:22.000Z","review_due_at":"2026-10-29T15:37:22.000Z","source_status_term":"active business location account","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ny_retail_food_location_profiles",[1498,0,0,46696,0],{"source_key":"ny_retail_food_store_license_sites","source_release_id":"ny-retail-food-stores-2025-09-30-9dfbb0199594dab8","review_qualification":"stale","semantic_class":"non-active-reporting","source_reference_at":"2025-09-30T15:15:15.000Z","review_due_at":"2026-01-28T15:15:15.000Z","source_status_term":"annual license snapshot membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["nyc_dcwp_license_location_profiles",[1550,0,0,46644,0],{"source_key":"nyc_dcwp_active_license_sites","source_release_id":"nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-20T13:24:53.000Z","review_due_at":"2026-10-04T13:24:53.000Z","source_status_term":"Active premises license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["tx_sales_tax_outlet_profiles",[2156,0,0,46038,0],{"source_key":"tx_active_sales_tax_permit_outlets","source_release_id":"tx-active-sales-tax-2026-08-29-98b90d177d81493e","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-29T08:21:49.000Z","review_due_at":"2026-10-13T08:21:49.000Z","source_status_term":"active sales-tax permit","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_co_organization_addresses",[18133,0,0,30061,0],{"source_key":"co_business_registry_good_standing_or_delinquent_organizations","source_release_id":"co-business-registry-2026-09-02-42884e178198747a","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-09-02T11:28:49.000Z","review_due_at":"2026-10-17T11:28:49.000Z","source_status_term":"Good Standing or Delinquent registry status","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_ct_organization_addresses",[9230,0,0,38964,0],{"source_key":"ct_business_registry_active_organizations","source_release_id":"ct-business-registry-2026-09-02-30857c9921e9e791","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T09:25:09.000Z","review_due_at":"2026-10-17T09:25:09.000Z","source_status_term":"Active registration","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_de_license_addresses",[4513,0,0,43681,0],{"source_key":"de_business_licenses_current","source_release_id":"de-business-licenses-2026-09-02-5c2d3a7c86c77c8e","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T11:30:38.000Z","review_due_at":"2026-10-17T11:30:38.000Z","source_status_term":"current business license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_fl_organization_addresses",[19064,0,0,29130,0],{"source_key":"fl_business_registry_quarterly_active_entities","source_release_id":"fl-business-registry-2026-07-10-392c89e9e5b94cb6","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-07-10T17:41:15.000Z","review_due_at":"2027-01-06T17:41:15.000Z","source_status_term":"quarterly Active entity code","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_ia_organization_addresses",[9901,0,0,38293,0],{"source_key":"ia_business_registry_active_entities","source_release_id":"ia-business-registry-2026-08-10-9654242df778d3bb","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-08-10T12:59:03.509Z","review_due_at":"2026-10-24T12:59:03.509Z","source_status_term":"Active registration","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_ny_organization_addresses",[8646,0,0,39548,0],{"source_key":"ny_business_registry_active_entities","source_release_id":"ny-business-registry-2026-09-02-9d8490fb18678e54","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T13:39:39.000Z","review_due_at":"2026-10-17T13:39:39.000Z","source_status_term":"active-extract membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_or_legal_registration_addresses",[9068,0,0,39126,0],{"source_key":"or_business_registry_active_registrations","source_release_id":"or-business-registry-2026-09-01-c58ca37fef13c0e9","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-01T13:44:15.000Z","review_due_at":"2026-10-16T13:44:15.000Z","source_status_term":"Active registration","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_or_brand_registration_addresses",[2796,0,0,45398,0],{"source_key":"or_business_registry_active_registrations","source_release_id":"or-business-registry-2026-09-01-c58ca37fef13c0e9","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-01T13:44:15.000Z","review_due_at":"2026-10-16T13:44:15.000Z","source_status_term":"Active registration","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["broad_org_pa_organization_addresses",[4536,0,0,43658,0],{"source_key":"pa_business_registry_active_registrations","source_release_id":"pa-business-registry-2026-09-02-5aea113d98c4bfb7","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T13:36:39.000Z","review_due_at":"2026-11-16T13:36:39.000Z","source_status_term":"active-registration dataset membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["wa_lni_active_contractor_organization_mailing_addresses",[3113,0,0,45081,0],{"source_key":"wa_lni_active_contractor_organizations","source_release_id":"wa-lni-active-contractor-licenses-2026-09-07-24c7059d65e4d084","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-07T00:35:49.000Z","review_due_at":"2026-10-22T00:35:49.000Z","source_status_term":"ACTIVE contractor license","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["mn_residential_construction_credential_reported_address_rows",[960,0,0,47234,0],{"source_key":"mn-residential-construction-credentials","source_release_id":"30cd9c0e-0a8d-467c-b416-150453e1513f","review_qualification":"unmeasured","semantic_class":"non-active-reporting","source_reference_at":"2026-09-08T13:11:41.678Z","review_due_at":null,"source_status_term":"Minnesota publisher credential row at a reported address; not a unique business or verified operating site","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["cms_nppes_pharmacy_nonprimary_reported_address_rows",[377,0,0,47817,0],{"source_key":"cms_nppes_organizations","source_release_id":"NPPES_Data_Dissemination_August_2026_V2","review_qualification":"within-review-window","semantic_class":"non-active-reporting","source_reference_at":"2026-08-09T23:59:59.999Z","review_due_at":"2026-10-23T23:59:59.999Z","source_status_term":"monthly enumeration extract membership","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["census_zbp_2023_all_industry_employer_establishments",[34954,0,0,0,13240],{"source_key":"census-zbp-2023","source_release_id":"census-zbp-2023-20260830-134622645Z-4da1edc0","review_qualification":"unmeasured","semantic_class":"annual-aggregate","source_reference_at":"2023-12-31","review_due_at":null,"source_status_term":"2023 annual employer-establishment aggregate","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["cross_source_entity_resolution_linkage_evidence",[26919,0,0,21275,0],{"source_key":"zip-entity-resolution-evidence","source_release_id":"zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564","review_qualification":"unmeasured","semantic_class":"linkage-readiness","source_reference_at":null,"review_due_at":null,"source_status_term":"retained linkage evidence; no merge or resolution applied","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ca_abc_active_issued_license_physical_sites",[2920,34908,10366,0,0],{"source_key":"ca-abc-active-license-sites","source_release_id":"ca-abc-active-licenses-20260907-134420041Z-1d86412e","review_qualification":"unmeasured","semantic_class":"publisher-active-snapshot","source_reference_at":"2026-09-07T10:50:28.000Z","review_due_at":null,"source_status_term":"publisher ACTIVE issued-license snapshot","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["dc_active_basic_business_license_physical_sites",[3125,34703,10366,0,0],{"source_key":"dc-basic-business-license-sites","source_release_id":"dc-basic-business-licenses-20260907-175749194Z-aec3b0ac","review_qualification":"unmeasured","semantic_class":"publisher-active-snapshot","source_reference_at":"2026-09-07T04:00:00.000Z","review_due_at":null,"source_status_term":"publisher Active license snapshot","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["tx_active_sales_tax_permitted_outlet_physical_sites",[2156,35672,10366,0,0],{"source_key":"tx-active-sales-tax-outlets","source_release_id":"tx-active-sales-tax-2026-08-29-98b90d177d81493e","review_qualification":"unmeasured","semantic_class":"publisher-active-snapshot","source_reference_at":"2026-08-29T08:21:49.000Z","review_due_at":null,"source_status_term":"publisher Active sales tax permit snapshot","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["la_publisher_active_listing_location_account_sites",[5371,32457,10366,0,0],{"source_key":"la-active-business-location-accounts","source_release_id":"la-active-businesses-2026-08-15-7a4190d1dfe2b2ac","review_qualification":"unmeasured","semantic_class":"unknown-source-status","source_reference_at":"2026-08-15T15:37:22.000Z","review_due_at":null,"source_status_term":"City of Los Angeles active-list membership; row status not retained","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ak_active_business_license_conditional_physical_sites",[4383,33528,10283,0,0],{"source_key":"ak-active-business-licenses","source_release_id":"ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-03T00:37:03.000Z","review_due_at":null,"source_status_term":"Alaska-issued source-defined Active business license membership; reported address jurisdiction may differ","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["chicago_current_active_business_license_physical_sites",[1033,36795,10366,0,0],{"source_key":"chicago-active-business-license-sites","source_release_id":"chicago-active-business-licenses-2026-09-02-5509fc257e382b49","review_qualification":"within-review-window","semantic_class":"source-defined-current","source_reference_at":"2026-09-02T10:04:48.000Z","review_due_at":null,"source_status_term":"City of Chicago municipal source-defined current selected official view snapshot; row operation and occupancy remain unverified","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
  ["ny_retail_food_license_address_evidence_count",[1500,36336,10358,0,0],{"source_key":"ny-retail-food-store-license-sites","source_release_id":"ny-retail-food-stores-2025-09-30-9dfbb0199594dab8","review_qualification":"stale","semantic_class":"non-active-reporting","source_reference_at":"2025-09-30T15:15:15.000Z","review_due_at":"2026-01-28T15:15:15.000Z","source_status_term":"annual current-snapshot membership; current operation, site qualification, and occupancy remain unverified","assessment_as_of":"2026-10-02T16:30:00.000Z"}],
] as const;
const EXACT_ZIP_V31_SUMMARY_ROOT_KEYS = ["schema_version","available","release_id","manifest_sha256","created_at","zip5_rows","source_dimensions","industry_cells","status_counts","evidence_disposition_counts","temporal_status_counts","temporal_qualification","omitted_industries_status","coverage_gaps","geography_cohort","entity_resolution","dimensions","verification_scope","claims","raw_status_counts","evidence_state_counts","zbp_dispositions","linkage_dispositions","ca_abc_dispositions","dc_bbl_dispositions","tx_sales_tax_dispositions","la_active_listing_dispositions","ak_active_license_dispositions","chicago_active_license_dispositions","ny_retail_food_license_address_dispositions"] as const;
const EXACT_ZIP_V31_SUMMARY_TEMPORAL = {"release_id":"exact-zip-industry-temporal-qualification-v2-1-runtime-projection","manifest_sha256":"2cd2cf73795af46956230ccbaa6de4e7b771967730c7181b6ba674b3ef2c3ea4","assessment_as_of":"2026-10-02T16:30:00.000Z","dimension_counts":{"within-review-window":29,"stale":2,"unmeasured":20,"unmapped":0},"semantic_dimension_counts":{"source-defined-current":25,"non-active-reporting":20,"unmapped":0,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1}} as const;
const EXACT_ZIP_V31_SUMMARY_STATUS = {"positive":422869,"measured-zero":493268,"outside-source-denominator":129923,"absent-from-retained-source-rows":1398594,"unavailable":13240} as const;
const EXACT_ZIP_V31_SUMMARY_RAW = {"positive":340508,"measured-zero":248869,"outside-source-denominator":57452,"absent-from-retained-source-rows":1377319,"unavailable":0,"measured-positive":34954,"not-published-for-zip":2874,"outside-zbp-zcta-evidence-union":10366,"retained-linkage-evidence-row":26919,"no-retained-linkage-decisions":21275,"ca-abc:positive":2920,"ca-abc:measured-zero":34908,"ca-abc:outside-source-denominator":10366,"dc-bbl:positive":3125,"dc-bbl:measured-zero":34703,"dc-bbl:outside-source-denominator":10366,"tx-sales-tax:positive":2156,"tx-sales-tax:measured-zero":35672,"tx-sales-tax:outside-source-denominator":10366,"la-active-list:positive":5371,"la-active-list:measured-zero":32457,"la-active-list:outside-source-denominator":10366,"ak-active-license:positive":4383,"ak-active-license:measured-zero":33528,"ak-active-license:outside-source-denominator":10283,"chicago-active-license:positive":1033,"chicago-active-license:measured-zero":36795,"chicago-active-license:outside-source-denominator":10366,"ny-retail-food-license-address:positive":1500,"ny-retail-food-license-address:measured-zero":36336,"ny-retail-food-license-address:outside-source-denominator":10358} as const;
const EXACT_ZIP_V31_SUMMARY_GAPS = {"out_of_cohort_source_records":4,"out_of_cohort_zip_count":4,"source_quality_gap_records":3,"address_gap_dimensions":10,"address_rows_without_eligible_zip5":4399807,"meaning":"Retained source-row quality and ZIP-assignment gaps, including the separately conserved Minnesota missing/out-of-cohort rows and pharmacy nonprimary ZIP+4 kept separate. Not missing-business counts."} as const;
const EXACT_ZIP_V31_SUMMARY_GEOGRAPHY = {"same_code_census_zcta":33791,"source_contributed_without_same_code_zcta":14361,"denominator_only_without_same_code_zcta":41,"explicit_placeholder":1,"without_same_code_zcta_total":14403,"cohort_release_id":"zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb","cohort_manifest_sha256":"792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea","created_at":"2026-10-03T07:22:43.230Z"} as const;
const EXACT_ZIP_V31_SUMMARY_ENTITY = {"evidence_zip_count":26919,"no_decision_zip_count":21275,"evidence_zip_percent":55.9,"no_decision_zip_percent":44.1,"site_alias_groups":0,"establishment_alias_groups":0,"unapplied_review_candidates":0,"release_id":"zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564","manifest_sha256":"742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba","created_at":"2026-10-03T15:24:28.426Z","benchmark_gate_passed":false,"entity_resolution_applied":false} as const;
function sameSummaryV31(value:unknown, expected:unknown):boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && expected.every((item,index)=>sameSummaryV31(value[index],item));
  if (exactObject(expected)) return exactObject(value) && exactKeys(value,Object.keys(expected)) && Object.entries(expected).every(([key,item])=>sameSummaryV31(value[key],item));
  return value === expected;
}
function validExactZipIndustrySummaryV31(input:unknown):boolean {
  try {
    if (!exactObject(input) || !exactKeys(input,[...EXACT_ZIP_V31_SUMMARY_ROOT_KEYS]) ||
      input.schema_version !== "national-exact-zip-industry-summary-view@3.1.0" || input.available !== true ||
      input.release_id !== "national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9" ||
      input.manifest_sha256 !== "07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7" ||
      input.created_at !== null || input.zip5_rows !== 48194 || input.source_dimensions !== 51 || input.industry_cells !== 2457894 ||
      input.omitted_industries_status !== "unavailable-not-materialized" || typeof input.verification_scope !== "string" ||
      !sameSummaryV31(input.claims,{authoritative_current_usps_zip_denominator:null,current_operation_verified:false,all_business_completeness:false,
        additive_cross_industry_total:false,non_zcta_means_invalid_zip:false,omitted_industries_measured:false,network_requests:0}) ||
      !sameSummaryV31(input.temporal_qualification,EXACT_ZIP_V31_SUMMARY_TEMPORAL) ||
      !sameSummaryV31(input.status_counts,EXACT_ZIP_V31_SUMMARY_STATUS) || !sameSummaryV31(input.raw_status_counts,EXACT_ZIP_V31_SUMMARY_RAW) ||
      !sameSummaryV31(input.temporal_status_counts,{"source-referenced-current-operation-unverified":1542208,"source-reference-unresolved":481940}) ||
      !sameSummaryV31(input.coverage_gaps,EXACT_ZIP_V31_SUMMARY_GAPS) || !sameSummaryV31(input.geography_cohort,EXACT_ZIP_V31_SUMMARY_GEOGRAPHY) ||
      !sameSummaryV31(input.entity_resolution,EXACT_ZIP_V31_SUMMARY_ENTITY) ||
      !Array.isArray(input.dimensions) || input.dimensions.length !== 51) return false;
    const sidecars:Record<string,string> = {
      census_zbp_2023_all_industry_employer_establishments:"zbp_dispositions",
      cross_source_entity_resolution_linkage_evidence:"linkage_dispositions",
      ca_abc_active_issued_license_physical_sites:"ca_abc_dispositions",
      dc_active_basic_business_license_physical_sites:"dc_bbl_dispositions",
      tx_active_sales_tax_permitted_outlet_physical_sites:"tx_sales_tax_dispositions",
      la_publisher_active_listing_location_account_sites:"la_active_listing_dispositions",
      ak_active_business_license_conditional_physical_sites:"ak_active_license_dispositions",
      chicago_current_active_business_license_physical_sites:"chicago_active_license_dispositions",
      ny_retail_food_license_address_evidence_count:"ny_retail_food_license_address_dispositions",
    };
    const derivedByRaw:Record<string,string> = {positive:"evidence-present","measured-zero":"measured-zero",
      "outside-source-denominator":"outside-source-denominator","absent-from-retained-source-rows":"absent-from-retained-source-rows",unavailable:"unavailable",
      "measured-positive":"evidence-present","not-published-for-zip":"source-did-not-publish-for-zip","outside-zbp-zcta-evidence-union":"outside-source-evidence-union",
      "retained-linkage-evidence-row":"linkage-evidence-present","no-retained-linkage-decisions":"no-retained-linkage-decisions"};
    const joined:Record<string,unknown>[] = [];
    const byLifecycle:Record<string,number> = {};
    for (let index=0;index<EXACT_ZIP_V31_SUMMARY_CONTRACT.length;index++) {
      const [id,counts,temporal] = EXACT_ZIP_V31_SUMMARY_CONTRACT[index], row=input.dimensions[index];
      const rawContract=Object.hasOwn(sidecars,id), mapped=Object.hasOwn(EXACT_ZIP_V31_TEMPORAL_MAPPINGS,id);
      const statuses=["positive","measured-zero","outside-source-denominator","absent-from-retained-source-rows","unavailable"];
      const statusCounts=Object.fromEntries(statuses.map((status,i)=>[status,counts[i]]));
      const rowKeys=["id","status_counts","positive_zip_percent","measured_status_percent","evidence_disposition_counts","temporal_qualification"];
      if (rawContract) rowKeys.push("raw_status_counts","derived_evidence_status_counts");
      if (!exactObject(row) || !exactKeys(row,rowKeys) || row.id!==id || !sameSummaryV31(row.status_counts,statusCounts) ||
        !sameSummaryV31(row.temporal_qualification,temporal) ||
        row.positive_zip_percent!==Number((counts[0]/48194*100).toFixed(1)) ||
        row.measured_status_percent!==Number(((counts[0]+counts[1])/48194*100).toFixed(1))) return false;
      let rawCounts:Record<string,number>=statusCounts;
      if (id==="census_zbp_2023_all_industry_employer_establishments") rawCounts={"measured-positive":34954,"not-published-for-zip":2874,"outside-zbp-zcta-evidence-union":10366};
      else if (id==="cross_source_entity_resolution_linkage_evidence") rawCounts={"retained-linkage-evidence-row":26919,"no-retained-linkage-decisions":21275};
      else if (rawContract) rawCounts=Object.fromEntries(statuses.slice(0,3).map((status,i)=>[status,counts[i]]));
      const derived=Object.fromEntries(Object.entries(rawCounts).map(([status,count])=>[derivedByRaw[status],count]));
      if (rawContract && (!sameSummaryV31(row.raw_status_counts,rawCounts) || !sameSummaryV31(row.derived_evidence_status_counts,derived))) return false;
      const dispositions=Object.entries(rawCounts).map(([raw,count])=>{
        let lifecycle:string;
        if (temporal.semantic_class==="linkage-readiness") lifecycle=raw==="retained-linkage-evidence-row"?"linkage-readiness-evidence-present":"linkage-readiness-unmeasured";
        else if (temporal.semantic_class==="publisher-active-snapshot") lifecycle=raw==="positive"?"publisher-active-snapshot-evidence-present":raw==="measured-zero"?"publisher-active-snapshot-measured-zero":"publisher-active-snapshot-outside-denominator";
        else if (temporal.semantic_class==="unknown-source-status") lifecycle="unknown-source-status";
        else if (temporal.review_qualification==="unmeasured" || temporal.review_qualification==="stale") lifecycle=temporal.review_qualification;
        else lifecycle=temporal.semantic_class==="source-defined-current"?(raw==="positive"?"source-defined-current-positive-within-review-window":"source-defined-current-without-positive-evidence"):(raw==="positive"?"non-active-reporting-positive":"non-active-reporting-without-positive-evidence");
        const disposition:Record<string,unknown>={lifecycle_status:lifecycle,label:`${raw.replaceAll("-"," ")} · ${lifecycle.replaceAll("-"," ")}`,current_operations_verified:false,count};
        if (rawContract || mapped) {
          Object.assign(disposition,{raw_status:raw,evidence_state:derivedByRaw[raw],additive:false});
          if (mapped || ["linkage_dispositions","ak_active_license_dispositions","chicago_active_license_dispositions","ny_retail_food_license_address_dispositions"].includes(sidecars[id])) disposition.identity_merge_applied=false;
          if (rawContract && !["zbp_dispositions","linkage_dispositions"].includes(sidecars[id])) disposition.continuous_operation_verified=false;
          if (["ak_active_license_dispositions","chicago_active_license_dispositions","ny_retail_food_license_address_dispositions"].includes(sidecars[id])) Object.assign(disposition,{site_occupancy_verified:false,public_access_verified:false});
        } else disposition.cell_status=raw;
        byLifecycle[lifecycle]=(byLifecycle[lifecycle]??0)+count;
        return disposition;
      });
      if (!sameSummaryV31(row.evidence_disposition_counts,{total_cells:48194,joined:dispositions}) ||
        (rawContract && !sameSummaryV31(input[sidecars[id]],dispositions))) return false;
      joined.push(...dispositions);
    }
    return sameSummaryV31(input.evidence_state_counts,byLifecycle) &&
      sameSummaryV31(input.evidence_disposition_counts,{total_cells:2457894,by_cell_status:EXACT_ZIP_V31_SUMMARY_STATUS,by_lifecycle_status:byLifecycle,joined});
  } catch { return false; }
}
type DispositionCount={cell_status:string;lifecycle_status:string;label:string;current_operations_verified:false;count:number};
type ExactZipIndustrySummary={schema_version:`national-exact-zip-industry-summary-view@${string}`;available:true;release_id:string;manifest_sha256:string;created_at:null;zip5_rows:number;source_dimensions:number;industry_cells:number;status_counts:Record<string,number>;evidence_disposition_counts:{total_cells:number;by_cell_status:Record<string,number>;by_lifecycle_status:Record<string,number>;joined:DispositionCount[]};temporal_status_counts:{"source-referenced-current-operation-unverified":number;"source-reference-unresolved":number};temporal_qualification:{release_id:string;manifest_sha256:string;assessment_as_of:string;dimension_counts:{"within-review-window":number;stale:number;unmeasured:number;unmapped:number};semantic_dimension_counts:{"source-defined-current":number;"non-active-reporting":number;unmapped:number}};omitted_industries_status:"unavailable-not-materialized";coverage_gaps:{out_of_cohort_source_records:number;out_of_cohort_zip_count:number;source_quality_gap_records:number;address_gap_dimensions:number;address_rows_without_eligible_zip5:number;meaning:string};geography_cohort:{same_code_census_zcta:number;source_contributed_without_same_code_zcta:number;denominator_only_without_same_code_zcta:number;explicit_placeholder:number;without_same_code_zcta_total:number;cohort_release_id:string;cohort_manifest_sha256:string;created_at:string};entity_resolution:{evidence_zip_count:number;no_decision_zip_count:number;evidence_zip_percent:number;no_decision_zip_percent:number;site_alias_groups:number;establishment_alias_groups:number;unapplied_review_candidates:number;release_id:string;manifest_sha256:string;created_at:string;benchmark_gate_passed:false;entity_resolution_applied:false};dimensions:Array<{id:string;status_counts:Record<string,number>;positive_zip_percent:number;measured_status_percent:number;evidence_disposition_counts:{total_cells:number;joined:DispositionCount[]};temporal_qualification:{source_key:string|null;source_release_id:string|null;review_qualification:"within-review-window"|"stale"|"unmeasured"|"unmapped";semantic_class:"source-defined-current"|"non-active-reporting"|"unmapped";source_reference_at:string|null;review_due_at:string|null;source_status_term:string|null;assessment_as_of:string}}>;verification_scope:string;claims:{authoritative_current_usps_zip_denominator:null;current_operation_verified:false;all_business_completeness:false;additive_cross_industry_total:false;non_zcta_means_invalid_zip:false;omitted_industries_measured:false;network_requests:0}};
type MnConstructionEvidenceStatus={schema_version:'mn-construction-exact-zip-evidence-status@1.0.0';available:true;dimension_id:'mn_residential_construction_credential_reported_address_rows';source_reference_at:string;source:{dataset_id:'mn-construction-credential-reporting';release_id:string;manifest_sha256:string;artifact_sha256:string};registration_sha256:string;summary:{source_credential_rows:11456;zip5_credential_rows:11455;missing_reported_zip5_rows:1;reported_zip4_rows:0;positive_zip5_rows:961;projected_credential_rows:11455};claims:{unique_business_count:null;physical_site_count:null;current_operations_verified:false;all_business_completeness_percent:null;geographic_assignment_performed:false;geocode_created:false;zip4_aggregated:false;network_requests:0;acquisition_performed:false;current_pointer_written:false;record_unit:'publisher-business-credential-row';nonadditive:true;public_export_authorized:false;production_enrollment:false;matrix_admission_performed:false};verification_scope:string};
function validMnConstructionEvidenceStatus(input:unknown):input is MnConstructionEvidenceStatus{if(!exactKeys(input,['schema_version','available','dimension_id','source_reference_at','source','registration_sha256','summary','claims','verification_scope']))return false;const value=input as MnConstructionEvidenceStatus,sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);return value.schema_version==='mn-construction-exact-zip-evidence-status@1.0.0'&&value.available===true&&value.dimension_id==='mn_residential_construction_credential_reported_address_rows'&&value.source_reference_at==='2026-09-08T13:11:41.678Z'&&exactKeys(value.source,['dataset_id','release_id','manifest_sha256','artifact_sha256'])&&value.source.dataset_id==='mn-construction-credential-reporting'&&value.source.release_id==='30cd9c0e-0a8d-467c-b416-150453e1513f'&&value.source.manifest_sha256==='558182417940580140fbc4640e80ac177b6a9c1886a435f06ae8130b1f258b75'&&value.source.artifact_sha256==='286e5c798bb39671291d3db8e20c48f6f9778f17e62aa2a0f1312ca574654edb'&&sha(value.registration_sha256)&&exactKeys(value.summary,['source_credential_rows','zip5_credential_rows','missing_reported_zip5_rows','reported_zip4_rows','positive_zip5_rows','projected_credential_rows'])&&sameClosed(value.summary,{source_credential_rows:11456,zip5_credential_rows:11455,missing_reported_zip5_rows:1,reported_zip4_rows:0,positive_zip5_rows:961,projected_credential_rows:11455})&&exactKeys(value.claims,['unique_business_count','physical_site_count','current_operations_verified','all_business_completeness_percent','geographic_assignment_performed','geocode_created','zip4_aggregated','network_requests','acquisition_performed','current_pointer_written','record_unit','nonadditive','public_export_authorized','production_enrollment','matrix_admission_performed'])&&sameClosed(value.claims,{unique_business_count:null,physical_site_count:null,current_operations_verified:false,all_business_completeness_percent:null,geographic_assignment_performed:false,geocode_created:false,zip4_aggregated:false,network_requests:0,acquisition_performed:false,current_pointer_written:false,record_unit:'publisher-business-credential-row',nonadditive:true,public_export_authorized:false,production_enrollment:false,matrix_admission_performed:false})&&typeof value.verification_scope==='string';}
/** Compatibility-only renderer for callers that still embed the superseded single-entry status view. */
export function MnConstructionEvidenceStatusBlock(){const[view,setView]=useState<MnConstructionEvidenceStatus|null>(null),[failed,setFailed]=useState(false);useEffect(()=>{const controller=new AbortController();setView(null);setFailed(false);void runnerJson<unknown>('/api/business-map/mn-construction-exact-zip-evidence-status',{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;if(validMnConstructionEvidenceStatus(value))setView(value);else setFailed(true)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort()},[]);if(failed)return <section className="supporting-evidence" aria-label="Minnesota residential construction credential exact ZIP evidence"><h4>Minnesota credential exact-ZIP evidence</h4><p role="alert">Retained Minnesota credential evidence is unavailable or incompatible; no zero or status was inferred.</p></section>;if(!view)return <p role="status">Loading Minnesota credential exact-ZIP evidence…</p>;return <section className="supporting-evidence" aria-label="Minnesota residential construction credential exact ZIP evidence"><h4>Minnesota residential construction credential evidence</h4><p><strong>{count(view.summary.source_credential_rows)}</strong> retained publisher credential rows · <strong>{count(view.summary.zip5_credential_rows)}</strong> rows bearing ZIP5 · <strong>{count(view.summary.positive_zip5_rows)}</strong> distinct positive ZIP5 keys.</p><p>Missing ZIP5: {count(view.summary.missing_reported_zip5_rows)} · reported ZIP+4: {count(view.summary.reported_zip4_rows)}. ZIP+4 remains separate and was not aggregated.</p><p><strong>Source reference:</strong> {view.source_reference_at}. Local-review-only, nonadditive publisher credential-row evidence; current operation is unverified.</p><p className="operations-note">This status is not a business, physical-site, completeness, geocoding, or matrix-admission measure. No public export or production enrollment is authorized.</p></section>}
type AdjacentEvidenceEntry={id:string;label:string;jurisdiction:string;dimension_id:string;record_unit:string;export_policy:string;temporal_status:{status:string;source_reference_at:string;current_operations_verified:false};counts:{source_rows:number;zip5_bearing_rows:number;missing_zip5_rows:number;zip4_rows:number;positive_zip5_keys:number;projected_rows:number};provenance:{registration_path:string;registration_sha256:string;source_dataset_id:string;source_release_id:string;source_manifest_sha256:string;source_evidence_sha256:string};claims:{business_count:false;physical_site_count:false;all_business_completeness:false;geocoding_performed:false;current_operations_verified:false;matrix_admission_performed:false;nonadditive:true;public_export_authorized:false;production_enrollment:false}};
type AdjacentEvidenceCatalog={schema_version:'adjacent-exact-zip-evidence-catalog-view@1.0.0';available:true;catalog:{dataset_id:'adjacent-exact-zip-evidence-catalog';sha256:string;status:'registered-local-review-only-catalog'};entries:AdjacentEvidenceEntry[];claims:{business_count:false;physical_site_count:false;all_business_completeness:false;geocoding_performed:false;current_operations_verified:false;matrix_admission_performed:false;additive_across_entries:false;network_requests:0;production_enrollment:false};verification_scope:string};
const adjacentCatalogClaims={business_count:false,physical_site_count:false,all_business_completeness:false,geocoding_performed:false,current_operations_verified:false,matrix_admission_performed:false,additive_across_entries:false,network_requests:0,production_enrollment:false} as const,adjacentEntryClaims={business_count:false,physical_site_count:false,all_business_completeness:false,geocoding_performed:false,current_operations_verified:false,matrix_admission_performed:false,nonadditive:true,public_export_authorized:false,production_enrollment:false} as const;
function validAdjacentEvidenceCatalog(input:unknown):input is AdjacentEvidenceCatalog{if(!exactKeys(input,['schema_version','available','catalog','entries','claims','verification_scope']))return false;const value=input as AdjacentEvidenceCatalog,sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),nonnegative=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;if(value.schema_version!=='adjacent-exact-zip-evidence-catalog-view@1.0.0'||value.available!==true||!exactKeys(value.catalog,['dataset_id','sha256','status'])||value.catalog.dataset_id!=='adjacent-exact-zip-evidence-catalog'||value.catalog.status!=='registered-local-review-only-catalog'||!sha(value.catalog.sha256)||!exactKeys(value.claims,Object.keys(adjacentCatalogClaims))||!sameClosed(value.claims,adjacentCatalogClaims)||!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>100||new Set(value.entries.map(row=>row.id)).size!==value.entries.length||typeof value.verification_scope!=='string')return false;return value.entries.every(row=>exactKeys(row,['id','label','jurisdiction','dimension_id','record_unit','export_policy','temporal_status','counts','provenance','claims'])&&typeof row.id==='string'&&typeof row.label==='string'&&/^(?:[A-Z]{2}|US)$/.test(row.jurisdiction)&&typeof row.dimension_id==='string'&&typeof row.record_unit==='string'&&row.record_unit.length>0&&typeof row.export_policy==='string'&&row.export_policy.length>0&&exactKeys(row.temporal_status,['status','source_reference_at','current_operations_verified'])&&row.temporal_status.status.endsWith('current-operation-unverified')&&Number.isFinite(Date.parse(row.temporal_status.source_reference_at))&&row.temporal_status.current_operations_verified===false&&exactKeys(row.counts,['source_rows','zip5_bearing_rows','missing_zip5_rows','zip4_rows','positive_zip5_keys','projected_rows'])&&Object.values(row.counts).every(nonnegative)&&row.counts.source_rows===row.counts.zip5_bearing_rows+row.counts.missing_zip5_rows&&row.counts.projected_rows===row.counts.zip5_bearing_rows&&exactKeys(row.provenance,['registration_path','registration_sha256','source_dataset_id','source_release_id','source_manifest_sha256','source_evidence_sha256'])&&sha(row.provenance.registration_sha256)&&sha(row.provenance.source_manifest_sha256)&&sha(row.provenance.source_evidence_sha256)&&exactKeys(row.claims,Object.keys(adjacentEntryClaims))&&sameClosed(row.claims,adjacentEntryClaims));}
function AdjacentExactZipEvidenceCatalog(){const[view,setView]=useState<AdjacentEvidenceCatalog|null>(null),[failed,setFailed]=useState(false);useEffect(()=>{const controller=new AbortController();setView(null);setFailed(false);void runnerJson<unknown>('/api/business-map/adjacent-exact-zip-evidence-catalog',{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;if(validAdjacentEvidenceCatalog(value))setView(value);else setFailed(true)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort()},[]);if(failed)return <section className="supporting-evidence" aria-label="Adjacent exact ZIP evidence catalog"><h4>Adjacent exact-ZIP evidence</h4><p role="alert">Adjacent retained evidence is unavailable or incompatible; no zero or status was inferred.</p></section>;if(!view)return <p role="status">Loading adjacent exact-ZIP evidence…</p>;return <section className="supporting-evidence" aria-label="Adjacent exact ZIP evidence catalog"><h4>Adjacent exact-ZIP evidence</h4><p>Independently verified local-review provenance catalog. Minnesota construction, pharmacy nonprimary-address, hospital-directory, and nursing-home-directory evidence remain distinct industry dimensions; Census ZBP remains a noncurrent annual aggregate whose raw publication statuses are separate from derived evidence states. Catalog rows are nonadditive provenance, not extra matrix counts.</p><div className="representation-table" role="region" aria-label="Adjacent exact ZIP evidence entries" tabIndex={0}><table><thead><tr><th scope="col">Evidence / jurisdiction</th><th scope="col">Retained row conservation</th><th scope="col">ZIP evidence</th><th scope="col">Temporal status and policy</th></tr></thead><tbody>{view.entries.map(row=><tr key={row.id}><th scope="row">{row.label}<small>{row.jurisdiction} · {row.record_unit}</small></th><td>{count(row.counts.source_rows)} source rows<small>{count(row.counts.zip5_bearing_rows)} ZIP5-bearing + {count(row.counts.missing_zip5_rows)} missing ZIP5</small></td><td>{count(row.counts.positive_zip5_keys)} positive ZIP5 keys<small>{count(row.counts.zip4_rows)} ZIP+4 rows; ZIP+4 remains separate</small></td><td>{row.temporal_status.status.replaceAll('-',' ')}<small>Reference {row.temporal_status.source_reference_at} · {row.export_policy} · nonadditive</small></td></tr>)}</tbody></table></div><p className="operations-note">These are retained source-row evidence projections, not businesses, physical sites, completeness, geocoding, or verified current operation. Entries are not additive. No controls, export, acquisition, or production enrollment are provided.</p></section>}
function validExactZipIndustrySummaryV23(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.3.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-cdddc0df5de1697491cb82a6f8d0e70d174271d7e1b4e2ed3c37e48e512815a5"||input.manifest_sha256!=="d5c9da391a7a35de0f72f2b6912c9098dcefce2e88cafc0bcd048ed86d78963c"||input.source_dimensions!==44||input.industry_cells!==2120536||!Array.isArray(input.dimensions)||input.dimensions.length!==44||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==44||!exactObject(input.raw_status_counts)||input.raw_status_counts["retained-linkage-evidence-row"]!==26919||input.raw_status_counts["no-retained-linkage-decisions"]!==21275||!Array.isArray(input.linkage_dispositions)||input.linkage_dispositions.length!==2||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2120536||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2120536)return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="cross_source_entity_resolution_linkage_evidence");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts["retained-linkage-evidence-row"]===26919&&row.raw_status_counts["no-retained-linkage-decisions"]===21275&&input.linkage_dispositions.every(item=>exactObject(item)&&["retained-linkage-evidence-row","no-retained-linkage-decisions"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.identity_merge_applied===false&&item.additive===false);}
function validExactZipIndustrySummaryV24(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.4.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-522a5236674ebbdd8163d71cc15fba49e3526feac916aee74be1bcbf01cb7d63"||input.manifest_sha256!=="072ab5f6018ec9eb085f18a675535514268e1b2154f23ce26334ef66c0a5dc4b"||input.source_dimensions!==45||input.industry_cells!==2168730||!Array.isArray(input.dimensions)||input.dimensions.length!==45||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==45||!Array.isArray(input.ca_abc_dispositions)||input.ca_abc_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2168730||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2168730||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!exactObject(input.temporal_qualification.dimension_counts)||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":27,stale:1,unmeasured:7,unmapped:10})||!exactObject(input.temporal_qualification.semantic_dimension_counts)||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":24,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":1}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="ca_abc_active_issued_license_physical_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===2920&&row.raw_status_counts["measured-zero"]===34908&&row.raw_status_counts["outside-source-denominator"]===10366&&input.ca_abc_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.additive===false);}
function validExactZipIndustrySummaryV25(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.5.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-2cda66ffbd78232edeffea73167bfa9f151c885bd912e3f8025c6c18455b503b"||input.manifest_sha256!=="eee93f465d24575487e23c52781507f5543dfb593e9f3d76fde907597cba013b"||input.source_dimensions!==46||input.industry_cells!==2216924||!Array.isArray(input.dimensions)||input.dimensions.length!==46||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==46||!Array.isArray(input.dc_bbl_dispositions)||input.dc_bbl_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2216924||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2216924||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":27,stale:1,unmeasured:8,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":24,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":2}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="dc_active_basic_business_license_physical_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===3125&&row.raw_status_counts["measured-zero"]===34703&&row.raw_status_counts["outside-source-denominator"]===10366&&input.dc_bbl_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.additive===false);}
const summaryStatuses=['positive','measured-zero','outside-source-denominator','absent-from-retained-source-rows','unavailable'],summaryLifecycles=['source-defined-current-positive-within-review-window','source-defined-current-without-positive-evidence','non-active-reporting-positive','non-active-reporting-without-positive-evidence','stale','unmeasured','unmapped'];
function validExactZipIndustrySummaryV29(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.9.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-3533736fa5e0a27f0b4c5e4cb8e7d2af4aa04c2f0c97c4da7eff620df31f7ff7"||input.manifest_sha256!=="9c6fa25f318d3b89f7f24efa15340d56b38a72691e40e5c4ebde22b45281c975"||input.source_dimensions!==50||input.industry_cells!==2409700||!Array.isArray(input.dimensions)||input.dimensions.length!==50||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==50||!Array.isArray(input.chicago_active_license_dispositions)||input.chicago_active_license_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2409700||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2409700||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":29,stale:1,unmeasured:10,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":26,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="chicago_current_active_business_license_physical_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===1033&&row.raw_status_counts["measured-zero"]===36795&&row.raw_status_counts["outside-source-denominator"]===10366&&exactObject(row.temporal_qualification)&&row.temporal_qualification.semantic_class==="source-defined-current"&&String(row.temporal_qualification.source_status_term).includes("municipal source-defined current selected official view snapshot")&&input.chicago_active_license_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.site_occupancy_verified===false&&item.public_access_verified===false&&item.additive===false);}
function validExactZipIndustrySummaryV28(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.8.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-704e9357eaf4b19b6d2b59951f3fcc0536c050305ac19e61582037379129646d"||input.manifest_sha256!=="12efcccb28edc6ccb066cb32f4e4274361562e1964044b427686121ceae12cab"||input.source_dimensions!==49||input.industry_cells!==2361506||!Array.isArray(input.dimensions)||input.dimensions.length!==49||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==49||!Array.isArray(input.ak_active_license_dispositions)||input.ak_active_license_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2361506||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2361506||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":28,stale:1,unmeasured:10,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":25,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="ak_active_business_license_conditional_physical_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===4383&&row.raw_status_counts["measured-zero"]===33528&&row.raw_status_counts["outside-source-denominator"]===10283&&exactObject(row.temporal_qualification)&&row.temporal_qualification.semantic_class==="source-defined-current"&&String(row.temporal_qualification.source_status_term).includes("reported address jurisdiction may differ")&&input.ak_active_license_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.site_occupancy_verified===false&&item.public_access_verified===false&&item.additive===false);}
function validExactZipIndustrySummaryV27(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.7.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-33ab3fa11f8d1782c945359f4d88e1cbab808f109f6f7a29cd1f5b46cc79e6c6"||input.manifest_sha256!=="447ebb5a78205557c539f54c726d832052aa43eb72c2072c75296b9cabedafca"||input.source_dimensions!==48||input.industry_cells!==2313312||!Array.isArray(input.dimensions)||input.dimensions.length!==48||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==48||!Array.isArray(input.la_active_listing_dispositions)||input.la_active_listing_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2313312||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2313312||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":27,stale:1,unmeasured:10,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":24,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="la_publisher_active_listing_location_account_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===5371&&row.raw_status_counts["measured-zero"]===32457&&row.raw_status_counts["outside-source-denominator"]===10366&&exactObject(row.temporal_qualification)&&row.temporal_qualification.semantic_class==="unknown-source-status"&&input.la_active_listing_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.lifecycle_status==="unknown-source-status"&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.additive===false);}
function validExactZipIndustrySummaryV26(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.6.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-fd4f57796a03b50125e2668336a039a1d1e18ae6bdf12d664d382020e77293b8"||input.manifest_sha256!=="b02e108ef70ac16732744cadd2cd2540e7f448e46957de4a9e07eaff30474a0d"||input.source_dimensions!==47||input.industry_cells!==2265118||!Array.isArray(input.dimensions)||input.dimensions.length!==47||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==47||!Array.isArray(input.tx_sales_tax_dispositions)||input.tx_sales_tax_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2265118||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2265118||!exactObject(input.temporal_qualification)||!exactKeys(input.temporal_qualification,["release_id","manifest_sha256","assessment_as_of","dimension_counts","semantic_dimension_counts"])||!sameClosed(input.temporal_qualification.dimension_counts,{"within-review-window":27,stale:1,unmeasured:9,unmapped:10})||!sameClosed(input.temporal_qualification.semantic_dimension_counts,{"source-defined-current":24,"non-active-reporting":8,unmapped:10,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3}))return false;const row=input.dimensions.find(item=>exactObject(item)&&item.id==="tx_active_sales_tax_permitted_outlet_physical_sites");return exactObject(row)&&exactObject(row.raw_status_counts)&&row.raw_status_counts.positive===2156&&row.raw_status_counts["measured-zero"]===35672&&row.raw_status_counts["outside-source-denominator"]===10366&&input.tx_sales_tax_dispositions.every(item=>exactObject(item)&&["positive","measured-zero","outside-source-denominator"].includes(String(item.raw_status))&&item.current_operations_verified===false&&item.continuous_operation_verified===false&&item.additive===false);}
function validDispositionCount(item:DispositionCount){return exactKeys(item,['cell_status','lifecycle_status','label','current_operations_verified','count'])&&summaryStatuses.includes(item.cell_status)&&summaryLifecycles.includes(item.lifecycle_status)&&item.label===`${item.cell_status.replaceAll('-',' ')} · ${item.lifecycle_status.replaceAll('-',' ')}`&&item.current_operations_verified===false&&Number.isSafeInteger(item.count)&&item.count>=0}
function validExactZipIndustrySummaryV22(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.2.0"||input.release_id!=="national-exact-zip-industry-evidence-matrix-a24fa3582a27a13748b006350b10ae83053eadba419b15f08e5301a8ba76656d"||input.manifest_sha256!=="59c58a7651ffde6f521f97fc3b197d7541f142e546b1653370d262ff5235e6b3"||input.source_dimensions!==43||input.industry_cells!==2072342||!Array.isArray(input.dimensions)||input.dimensions.length!==43||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==43||!exactObject(input.raw_status_counts)||!exactObject(input.evidence_state_counts)||!Array.isArray(input.zbp_dispositions)||input.zbp_dispositions.length!==3||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2072342||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2072342)return false;const raw=input.raw_status_counts,zbp=input.dimensions.find(row=>exactObject(row)&&row.id==="census_zbp_2023_all_industry_employer_establishments");return raw["measured-positive"]===34954&&raw["not-published-for-zip"]===2874&&raw["outside-zbp-zcta-evidence-union"]===10366&&34954+2874+10366===48194&&exactObject(zbp)&&exactObject(zbp.raw_status_counts)&&zbp.raw_status_counts["measured-positive"]===34954&&zbp.raw_status_counts["not-published-for-zip"]===2874&&zbp.raw_status_counts["outside-zbp-zcta-evidence-union"]===10366&&input.zbp_dispositions.every(row=>exactObject(row)&&["measured-positive","not-published-for-zip","outside-zbp-zcta-evidence-union"].includes(String(row.raw_status))&&row.current_operations_verified===false&&row.additive===false);}
function validExactZipIndustrySummaryV21(input:unknown):boolean{if(!exactObject(input)||input.schema_version!=="national-exact-zip-industry-summary-view@2.1.0"||input.available!==true||input.release_id!=="national-exact-zip-industry-evidence-matrix-1a72cd9340c8b230004a6b024b9679bbb613ce4174e91ec8b69eed7d6afaf9e3"||input.manifest_sha256!=="2cd2cf73795af46956230ccbaa6de4e7b771967730c7181b6ba674b3ef2c3ea4"||input.zip5_rows!==48194||input.source_dimensions!==42||input.industry_cells!==2024148||!Array.isArray(input.dimensions)||input.dimensions.length!==42||new Set(input.dimensions.map(row=>exactObject(row)?row.id:null)).size!==42||!exactObject(input.status_counts)||Object.values(input.status_counts).reduce((n,v)=>n+Number(v),0)!==2024148||!exactObject(input.evidence_disposition_counts)||input.evidence_disposition_counts.total_cells!==2024148||!Array.isArray(input.evidence_disposition_counts.joined)||input.evidence_disposition_counts.joined.reduce((n,row)=>n+(exactObject(row)?Number(row.count):NaN),0)!==2024148||!exactObject(input.temporal_qualification)||input.temporal_qualification.release_id!=="exact-zip-industry-temporal-qualification-v2-1-runtime-projection"||input.temporal_qualification.manifest_sha256!==input.manifest_sha256)return false;return input.dimensions.every(row=>exactObject(row)&&typeof row.id==="string"&&EXACT_ZIP_V21_SOURCES.includes(row.id as typeof EXACT_ZIP_V21_SOURCES[number])&&exactObject(row.status_counts)&&Object.values(row.status_counts).reduce((n,v)=>n+Number(v),0)===48194&&exactObject(row.temporal_qualification)&&["source-defined-current","non-active-reporting","unmapped"].includes(String(row.temporal_qualification.semantic_class)));}
export function validExactZipIndustrySummary(input:unknown):input is ExactZipIndustrySummary{if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@3.1.0")return validExactZipIndustrySummaryV31(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@3.0.0")return validExactZipIndustrySummaryV30(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.9.0")return validExactZipIndustrySummaryV29(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.8.0")return validExactZipIndustrySummaryV28(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.7.0")return validExactZipIndustrySummaryV27(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.6.0")return validExactZipIndustrySummaryV26(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.5.0")return validExactZipIndustrySummaryV25(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.4.0")return validExactZipIndustrySummaryV24(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.3.0")return validExactZipIndustrySummaryV23(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.2.0")return validExactZipIndustrySummaryV22(input);if(exactObject(input)&&input.schema_version==="national-exact-zip-industry-summary-view@2.1.0")return validExactZipIndustrySummaryV21(input);try{const rootKeys=['schema_version','available','release_id','manifest_sha256','created_at','zip5_rows','source_dimensions','industry_cells','status_counts','evidence_disposition_counts','temporal_status_counts','temporal_qualification','omitted_industries_status','coverage_gaps','geography_cohort','entity_resolution','dimensions','verification_scope','claims'];if(!exactKeys(input,rootKeys))return false;const value=input as ExactZipIndustrySummary,iso=(item:unknown)=>typeof item==='string'&&Number.isFinite(Date.parse(item))&&new Date(item).toISOString()===item,nonnegative=(item:unknown)=>Number.isSafeInteger(item)&&Number(item)>=0;if(value.schema_version!=="national-exact-zip-industry-summary-view@2.0.0"||value.available!==true||value.release_id!=="national-exact-zip-industry-evidence-matrix-0055db697e2ef0900edb00b43e8114c146ad446a0bbb41633b938d445f74b003"||value.manifest_sha256!=='aa155af612f232bafe83d59583500452326bcd16d565c4445425b9f99a8f4ad1'||value.created_at!==null||value.industry_cells!==1927760||value.zip5_rows!==48194||value.source_dimensions!==40||value.omitted_industries_status!=='unavailable-not-materialized'||typeof value.verification_scope!=='string'||!exactKeys(value.claims,['authoritative_current_usps_zip_denominator','current_operation_verified','all_business_completeness','additive_cross_industry_total','non_zcta_means_invalid_zip','omitted_industries_measured','network_requests'])||!sameClosed(value.claims,{authoritative_current_usps_zip_denominator:null,current_operation_verified:false,all_business_completeness:false,additive_cross_industry_total:false,non_zcta_means_invalid_zip:false,omitted_industries_measured:false,network_requests:0})||!exactKeys(value.status_counts,summaryStatuses)||!summaryStatuses.every(key=>nonnegative(value.status_counts[key]))||Object.values(value.status_counts).reduce((sum,item)=>sum+item,0)!==value.industry_cells)return false;const tq=value.temporal_qualification;if(!exactKeys(tq,['release_id','manifest_sha256','assessment_as_of','dimension_counts','semantic_dimension_counts'])||tq.release_id!=='exact-zip-industry-temporal-qualification-d4c84e6c4665b66c9629d942764ab26904f8571e17c2c5a6cca56b89bfdaf4ee'||tq.manifest_sha256!=='c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409'||!iso(tq.assessment_as_of)||!exactKeys(tq.dimension_counts,['within-review-window','stale','unmeasured','unmapped'])||!exactKeys(tq.semantic_dimension_counts,['source-defined-current','non-active-reporting','unmapped'])||Object.values(tq.dimension_counts).reduce((sum,item)=>sum+item,0)!==40||Object.values(tq.semantic_dimension_counts).reduce((sum,item)=>sum+item,0)!==40)return false;if(!exactKeys(value.temporal_status_counts,['source-referenced-current-operation-unverified','source-reference-unresolved'])||Object.values(value.temporal_status_counts).reduce((sum,item)=>sum+item,0)!==value.industry_cells)return false;const gap=value.coverage_gaps,geo=value.geography_cohort,entity=value.entity_resolution;if(!exactKeys(gap,['out_of_cohort_source_records','out_of_cohort_zip_count','source_quality_gap_records','address_gap_dimensions','address_rows_without_eligible_zip5','meaning'])||!Object.entries(gap).every(([key,item])=>key==='meaning'?typeof item==='string':nonnegative(item))||!exactKeys(geo,['same_code_census_zcta','source_contributed_without_same_code_zcta','denominator_only_without_same_code_zcta','explicit_placeholder','without_same_code_zcta_total','cohort_release_id','cohort_manifest_sha256','created_at'])||geo.cohort_release_id!=='zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb'||geo.cohort_manifest_sha256!=='792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea'||!iso(geo.created_at)||geo.same_code_census_zcta+geo.without_same_code_zcta_total!==value.zip5_rows||!exactKeys(entity,['evidence_zip_count','no_decision_zip_count','evidence_zip_percent','no_decision_zip_percent','site_alias_groups','establishment_alias_groups','unapplied_review_candidates','release_id','manifest_sha256','created_at','benchmark_gate_passed','entity_resolution_applied'])||entity.release_id!=='zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564'||entity.manifest_sha256!=='742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba'||!iso(entity.created_at)||entity.benchmark_gate_passed!==false||entity.entity_resolution_applied!==false||entity.evidence_zip_count+entity.no_decision_zip_count!==value.zip5_rows)return false;const counts=value.evidence_disposition_counts;if(!exactKeys(counts,['total_cells','by_cell_status','by_lifecycle_status','joined'])||counts.total_cells!==value.industry_cells||!sameClosed(counts.by_cell_status,value.status_counts)||!exactKeys(counts.by_cell_status,summaryStatuses)||!exactKeys(counts.by_lifecycle_status,summaryLifecycles)||!Array.isArray(counts.joined)||!counts.joined.every(validDispositionCount)||counts.joined.reduce((sum,item)=>sum+item.count,0)!==value.industry_cells)return false;const joinedKeys=counts.joined.map(item=>`${item.cell_status}|${item.lifecycle_status}`),joinedByCell=Object.fromEntries(summaryStatuses.map(status=>[status,counts.joined.filter(item=>item.cell_status===status).reduce((sum,item)=>sum+item.count,0)])),joinedByLifecycle=Object.fromEntries(summaryLifecycles.map(status=>[status,counts.joined.filter(item=>item.lifecycle_status===status).reduce((sum,item)=>sum+item.count,0)]));if(new Set(joinedKeys).size!==joinedKeys.length||!sameClosed(joinedByCell,counts.by_cell_status)||!sameClosed(joinedByLifecycle,counts.by_lifecycle_status)||!Array.isArray(value.dimensions)||value.dimensions.length!==40||new Set(value.dimensions.map(row=>row.id)).size!==40)return false;return value.dimensions.every(row=>{if(!exactKeys(row,['id','status_counts','positive_zip_percent','measured_status_percent','evidence_disposition_counts','temporal_qualification'])||typeof row.id!=='string'||!exactKeys(row.status_counts,summaryStatuses)||!summaryStatuses.every(status=>nonnegative(row.status_counts[status]))||Object.values(row.status_counts).reduce((sum,item)=>sum+item,0)!==value.zip5_rows||typeof row.positive_zip_percent!=='number'||typeof row.measured_status_percent!=='number')return false;const temporal=row.temporal_qualification;if(!exactKeys(temporal,['source_key','source_release_id','review_qualification','semantic_class','source_reference_at','review_due_at','source_status_term','assessment_as_of'])||!['within-review-window','stale','unmeasured','unmapped'].includes(temporal.review_qualification)||!['source-defined-current','non-active-reporting','unmapped'].includes(temporal.semantic_class)||temporal.assessment_as_of!==tq.assessment_as_of)return false;const disposition=row.evidence_disposition_counts;if(!exactKeys(disposition,['total_cells','joined'])||!Array.isArray(disposition.joined))return false;const joined=disposition.joined,cellStatuses=joined.map(item=>item.cell_status);return disposition.total_cells===value.zip5_rows&&joined.length===5&&new Set(cellStatuses).size===5&&summaryStatuses.every(status=>cellStatuses.includes(status))&&joined.every(validDispositionCount)&&joined.reduce((sum,item)=>sum+item.count,0)===value.zip5_rows&&joined.every(item=>item.count===row.status_counts[item.cell_status]&&item.lifecycle_status===exactZipDisposition(item.cell_status,temporal.semantic_class,temporal.review_qualification).lifecycle_status);});}catch{return false;}}
export function ExactZipIndustryNationalSummary(){const[view,setView]=useState<ExactZipIndustrySummary|null>(null),[failed,setFailed]=useState(false);useEffect(()=>{const controller=new AbortController();void runnerJson<ExactZipIndustrySummary>('/api/business-map/exact-zip-industry-summary',{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;if(validExactZipIndustrySummary(value))setView(value);else setFailed(true)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort()},[]);const download=()=>{if(!view)return;const url=URL.createObjectURL(new Blob([`${JSON.stringify(view,null,2)}\n`],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`cotive-national-zip-industry-status-${view.manifest_sha256.slice(0,12)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0)};if(failed)return <p role="alert">Retained source-dimension status is unavailable; no coverage percentage or zero was inferred.</p>;if(!view)return <p role="status">Loading retained source-dimension status…</p>;return <section className="supporting-evidence" aria-label="National exact ZIP industry evidence summary"><h4>Retained source-dimension status</h4><p><strong>{count(view.zip5_rows)}</strong> retained ZIP5 keys × <strong>{view.source_dimensions}</strong> governed source dimensions = <strong>{count(view.industry_cells)}</strong> evidence cells.</p><button type="button" onClick={download}>Download governed status JSON</button><p><strong>Joined evidence disposition:</strong> {view.evidence_disposition_counts.joined.filter(item=>item.count>0).map(item=>`${item.label}: ${count(item.count)}`).join(' · ')}. These are source-specific evidence cells, not business counts, and no disposition verifies current operation.</p><p><strong>{count(view.geography_cohort.same_code_census_zcta)}</strong> keys have a same-code Census ZCTA polygon. <strong>{count(view.geography_cohort.source_contributed_without_same_code_zcta)}</strong> source-contributed keys and <strong>{count(view.geography_cohort.denominator_only_without_same_code_zcta)}</strong> denominator-only keys do not; one additional key is the explicit `00000` placeholder. Non-ZCTA status does not mean an invalid ZIP.</p><p>Positive: {count(view.status_counts.positive)} · measured zero: {count(view.status_counts['measured-zero'])} · outside source denominator: {count(view.status_counts['outside-source-denominator'])} · absent from retained source rows: {count(view.status_counts['absent-from-retained-source-rows'])}.</p><p><strong>Review qualification:</strong> {count(view.temporal_qualification.dimension_counts['within-review-window'])} dimensions are within review window; {count(view.temporal_qualification.dimension_counts.stale)} is stale; {count(view.temporal_qualification.dimension_counts.unmeasured)} are unmeasured; {count(view.temporal_qualification.dimension_counts.unmapped)} are unmapped. Assessed {view.temporal_qualification.assessment_as_of}. No qualification verifies current operation.</p><p><strong>Publisher status meaning:</strong> {count(view.temporal_qualification.semantic_dimension_counts['source-defined-current'])} dimensions use a publisher-defined current status; {count(view.temporal_qualification.semantic_dimension_counts['non-active-reporting'])} are non-active reporting; {count(view.temporal_qualification.semantic_dimension_counts.unmapped)} are unmapped; {count((view.temporal_qualification.semantic_dimension_counts as Record<string,number>)['annual-aggregate'])} is an annual aggregate, not a current-operation measure; {count((view.temporal_qualification.semantic_dimension_counts as Record<string,number>)['linkage-readiness'])} is linkage readiness, not identity resolution or a merge; and {count((view.temporal_qualification.semantic_dimension_counts as Record<string,number>)['publisher-active-snapshot'])} is a publisher-active snapshot only, not continuous operation or completeness; and {count((view.temporal_qualification.semantic_dimension_counts as Record<string,number>)['unknown-source-status'])} has municipal publisher active-list membership with unknown row lifecycle status. Publisher-defined current still does not verify general business operation.</p><p><strong>Entity-resolution evidence:</strong> {count(view.entity_resolution.evidence_zip_count)} ZIPs have retained candidate evidence ({view.entity_resolution.evidence_zip_percent.toFixed(1)}%); {count(view.entity_resolution.no_decision_zip_count)} ZIPs have no resolution decision ({view.entity_resolution.no_decision_zip_percent.toFixed(1)}%). Candidate groups are not applied business merges; the benchmark gate has not passed.</p><p><strong>Source quality gaps:</strong> {count(view.coverage_gaps.out_of_cohort_source_records)} retained records report ZIPs outside the cohort; {count(view.coverage_gaps.source_quality_gap_records)} source-quality gap groups remain; {count(view.coverage_gaps.address_rows_without_eligible_zip5)} address rows lack an eligible ZIP5 across {count(view.coverage_gaps.address_gap_dimensions)} source dimensions. These are retained source-row quality and assignment gaps, not missing-business counts.</p><p><strong>Scope boundary:</strong> Industries outside these {view.source_dimensions} dimensions are unavailable—not materialized, not measured zero, and not included in either percentage.</p><details><summary>Governed release provenance</summary><dl><dt>Matrix release</dt><dd><code>{view.release_id}</code><small>Release creation time not asserted · manifest SHA-256 {view.manifest_sha256}</small></dd><dt>Temporal qualification</dt><dd><code>{view.temporal_qualification.release_id}</code><small>Assessed {view.temporal_qualification.assessment_as_of} · manifest SHA-256 {view.temporal_qualification.manifest_sha256}</small></dd><dt>Geography cohort</dt><dd><code>{view.geography_cohort.cohort_release_id}</code><small>Built {view.geography_cohort.created_at} · manifest SHA-256 {view.geography_cohort.cohort_manifest_sha256}</small></dd><dt>Resolution evidence</dt><dd><code>{view.entity_resolution.release_id}</code><small>Built {view.entity_resolution.created_at} · manifest SHA-256 {view.entity_resolution.manifest_sha256}</small></dd></dl></details><details><summary>All {view.source_dimensions} governed source dimensions</summary><div className="representation-table" role="region" aria-label="National ZIP source dimension status" tabIndex={0}><table><thead><tr><th scope="col">Source dimension / retained source release</th><th scope="col">ZIPs with positive evidence</th><th scope="col">ZIPs with measured status</th><th scope="col">Source vintage / temporal status</th><th scope="col">Unknown, absent, or outside denominator</th></tr></thead><tbody>{view.dimensions.map(row=><tr key={row.id}><th scope="row">{sourceLabel(row.id)}<small>{row.temporal_qualification.source_key??'No temporal source mapping'} · {row.temporal_qualification.source_release_id??'No retained source release mapped'}</small></th><td>{count(row.status_counts.positive)} · {row.positive_zip_percent.toFixed(1)}%</td><td>{count(row.status_counts.positive+row.status_counts['measured-zero'])} · {row.measured_status_percent.toFixed(1)}%</td><td>{row.temporal_qualification.review_qualification.replaceAll('-', ' ')}<small>{row.temporal_qualification.semantic_class.replaceAll('-', ' ')} · {row.temporal_qualification.source_status_term??'No publisher status meaning mapped'} · reference {row.temporal_qualification.source_reference_at??'unresolved'} · due {row.temporal_qualification.review_due_at??'unmeasured'}</small><small>Joined cell disposition: {row.evidence_disposition_counts.joined.filter(item=>item.count>0).map(item=>`${item.label} ${count(item.count)}`).join(' · ')}. Not business counts; current operation unverified.</small></td><td>{count(row.status_counts['absent-from-retained-source-rows'])} absent · {count(row.status_counts['outside-source-denominator'])} outside</td></tr>)}</tbody></table></div></details><p className="operations-note">Percentages use the retained 48,194-key evidence cohort, not an authoritative current USPS denominator or all-business completeness. Source dimensions overlap and are not additive. Current operation is not independently verified. {view.verification_scope}.</p></section>}

function GovernedCoverageStates(){return <section className="supporting-evidence" aria-label="Nonblocking geography coverage states"><h4>Geography coverage states</h4><p>These states remain visible and never block retained source evidence. They are context states, not business completeness or ZIP-validity decisions.</p><dl><dt>Census ZCTA</dt><dd>Available map geography where a same-code 2020 Census ZCTA is retained.</dd><dt>Private or special-purpose ZIP evidence</dt><dd>Preserved as reported non-ZCTA/special-purpose evidence only where the governed source supplies that classification; otherwise unresolved. Population may be unavailable and is not required.</dd><dt>Park or protected land</dt><dd>Unavailable until a governed protected-land overlay is retained. No classification is inferred and the map remains usable.</dd><dt>Tribal or Native territory</dt><dd>Unavailable until a governed tribal-area overlay is retained. No classification is inferred and the map remains usable.</dd><dt>Unresolved land outside selected ZCTAs</dt><dd>A topology-verified residual artifact is retained separately for each of the 56 Census state equivalents, providing state-level placement without inventing ZIP coverage. Its components have unique state/cardinal reference labels derived from bounding-box midpoint orientation; these labels do not subdivide geometry or assert centroids. It remains nonblocking optional context and does not infer a ZIP, population, park, tribal/Native, private-land, or business status.</dd></dl></section>}

type OperationalIndustryCrosswalkView={schema_version:'operational-industry-evidence-summary@1.0.0';state:{code:string;name:string;fips:string;governed_zcta_zip5_rows:number};industries:Array<{id:string;mapped_dimensions:number;dimensions_with_retained_evidence:number;dimension_evidence_availability_percent:number|null;measured_zip_dimension_cells:number;zip_dimension_cell_denominator:number;exact_zip_measurement_reach_percent:number|null;dimensions:Array<{id:string;measured_zip_dimension_cells:number;positive_zip_dimension_cells:number;temporal_qualification:{source_release_id:string|null;review_qualification:string;semantic_class:string}}>} >;unmapped_dimensions:Array<{id:string;reason:string}>;special_geography:{included_in_state_denominator:false;non_zcta_unassigned_reported_separately:true;material_cross_state_zctas_reported_separately:true};claims:{metric_unit:'ZIP5-by-source-dimension evidence cells';business_or_entity_counts_added:false;business_completeness:null;industry_completeness:null;current_operation_verified:false;usps_validity_verified:false;zip4_joined:false;network_requests:0;runtime_writes:0;production_enrollment:false;export_authorized:false};provenance:{crosswalk_sha256:string;summary_release_id:string;summary_manifest_sha256:string;state_disposition_release_id:string;state_disposition_manifest_sha256:string;state_disposition_artifact_sha256:string}};
// Closed mappings and provenance for the retained v3.1 crosswalk projection.
const OPERATIONAL_INDUSTRY_DIMENSIONS: Record<string, string[]> = {
  'retail-consumer': ['snap_retailers','pharmacy','ca_abc_license_location_profiles','ny_retail_food_location_profiles','cms_nppes_pharmacy_nonprimary_reported_address_rows','ca_abc_active_issued_license_physical_sites','ny_retail_food_license_address_evidence_count'],
  'health-care': ['healthcare_organizations','pharmacy','cms_hospital_directory','cms_nursing_home_directory','cms_nppes_pharmacy_nonprimary_reported_address_rows'],
  'financial-services': ['fdic_offices','credit_union_locations'],
  transportation: ['transportation'],
  construction: ['wa_lni_active_contractor_organization_mailing_addresses','mn_residential_construction_credential_reported_address_rows'],
  'tax-exempt-organizations': ['tax_exempt_organizations'],
  'sales-tax-outlets': ['tx_sales_tax_outlet_profiles','tx_active_sales_tax_permitted_outlet_physical_sites'],
  'local-business-licenses': ['ak_license_location_profiles','chicago_license_location_profiles','dc_basic_license_location_profiles','la_registered_location_profiles','nyc_dcwp_license_location_profiles','broad_org_de_license_addresses','dc_active_basic_business_license_physical_sites','la_publisher_active_listing_location_account_sites','ak_active_business_license_conditional_physical_sites','chicago_current_active_business_license_physical_sites'],
  childcare: ['childcare_pa_candidates','childcare_ct_candidates','childcare_md_candidates','childcare_vt_candidates','childcare_co_candidates','childcare_ut_candidates','childcare_ia_candidates','childcare_ma_reporting_centers','childcare_nj_reporting_centers','childcare_tn_reporting_centers','childcare_oh_reporting_centers'],
};
const OPERATIONAL_CROSSWALK_PROVENANCE = {
  crosswalk_sha256: '8c0763a56c4941e410387f986805bf595e227217d816b0c039b9cb2e0c2d219f',
  summary_release_id: 'national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9',
  summary_manifest_sha256: '07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7',
  state_disposition_release_id: 'state-exact-zip-industry-evidence-disposition-62e4ced49cfb1c0d41628864f1b867c8b89a9f58bec66de1e146568f777f544a',
  state_disposition_manifest_sha256: '1678f94007155d602dd9d803093c1efd368aa862498da8d0108a969b3b0d4f6e',
  state_disposition_artifact_sha256: '647da886fc5dceec381b787d2309f593dcb4db6bc8dedb87c8774e2d405fe888',
};
const OPERATIONAL_STATE_FIPS: Record<string, string> = Object.fromEntries(
  operationalStates.map((state, index) => [state, ['02','01','05','04','06','08','09','11','10','12','13','15','19','16','17','18','20','21','22','25','24','23','26','27','29','28','30','37','38','31','33','34','35','32','36','39','40','41','42','44','45','46','47','48','49','51','50','53','55','54','56'][index]]),
);
function validOperationalIndustryCrosswalkView(input: unknown, state: string): input is OperationalIndustryCrosswalkView {
  const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const percent = (value: unknown, numerator: number, denominator: number) => denominator === 0
    ? value === null
    : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 && value === Number((numerator / denominator * 100).toFixed(1));
  if (!exactObject(input) || !exactKeys(input, ['schema_version','state','industries','unmapped_dimensions','special_geography','claims','provenance']) ||
    input.schema_version !== 'operational-industry-evidence-summary@1.0.0' ||
    !operationalStates.includes(state as typeof operationalStates[number]) ||
    !exactObject(input.state) || !exactKeys(input.state, ['code','name','fips','governed_zcta_zip5_rows']) ||
    input.state.code !== state || input.state.fips !== OPERATIONAL_STATE_FIPS[state] ||
    typeof input.state.name !== 'string' || !input.state.name.trim() ||
    !nonnegative(input.state.governed_zcta_zip5_rows) || input.state.governed_zcta_zip5_rows > 33791 ||
    !Array.isArray(input.industries) || input.industries.length !== operationalIndustryIds.length ||
    new Set(input.industries.map(row => exactObject(row) ? row.id : null)).size !== operationalIndustryIds.length ||
    !Array.isArray(input.unmapped_dimensions) ||
    !sameClosed(input.provenance, OPERATIONAL_CROSSWALK_PROVENANCE) ||
    !sameClosed(input.special_geography, {included_in_state_denominator:false,non_zcta_unassigned_reported_separately:true,material_cross_state_zctas_reported_separately:true}) ||
    !sameClosed(input.claims, {metric_unit:'ZIP5-by-source-dimension evidence cells',business_or_entity_counts_added:false,business_completeness:null,industry_completeness:null,current_operation_verified:false,usps_validity_verified:false,zip4_joined:false,network_requests:0,runtime_writes:0,production_enrollment:false,export_authorized:false})) return false;

  const zipRows = input.state.governed_zcta_zip5_rows;
  const mapped = new Set(Object.values(OPERATIONAL_INDUSTRY_DIMENSIONS).flat());
  const unmapped = EXACT_ZIP_V31_SUMMARY_CONTRACT.filter(([id]) => !mapped.has(id));
  if (input.unmapped_dimensions.length !== unmapped.length ||
    new Set(input.unmapped_dimensions.map(row => exactObject(row) ? row.id : null)).size !== unmapped.length ||
    !input.unmapped_dimensions.every(row => exactObject(row) && exactKeys(row, ['id','reason']) &&
      unmapped.some(([id]) => id === row.id) && typeof row.reason === 'string' && !!row.reason.trim())) return false;

  const seenDimensions = new Map<string, unknown>();
  return input.industries.every(row => {
    if (!exactObject(row) || !exactKeys(row, ['id','mapped_dimensions','dimensions_with_retained_evidence','dimension_evidence_availability_percent','measured_zip_dimension_cells','zip_dimension_cell_denominator','exact_zip_measurement_reach_percent','dimensions']) ||
      typeof row.id !== 'string' || !operationalIndustryIds.includes(row.id as typeof operationalIndustryIds[number])) return false;
    const expectedDimensions = OPERATIONAL_INDUSTRY_DIMENSIONS[row.id];
    if (row.mapped_dimensions !== expectedDimensions.length || !nonnegative(row.dimensions_with_retained_evidence) ||
      row.dimensions_with_retained_evidence > expectedDimensions.length || !nonnegative(row.measured_zip_dimension_cells) ||
      !nonnegative(row.zip_dimension_cell_denominator) || row.zip_dimension_cell_denominator !== zipRows * expectedDimensions.length ||
      row.measured_zip_dimension_cells > row.zip_dimension_cell_denominator ||
      !percent(row.dimension_evidence_availability_percent, row.dimensions_with_retained_evidence, expectedDimensions.length) ||
      !percent(row.exact_zip_measurement_reach_percent, row.measured_zip_dimension_cells, row.zip_dimension_cell_denominator) ||
      !Array.isArray(row.dimensions) || row.dimensions.length !== expectedDimensions.length ||
      new Set(row.dimensions.map(dimension => exactObject(dimension) ? dimension.id : null)).size !== expectedDimensions.length) return false;
    let measured = 0, evidenced = 0;
    for (const dimension of row.dimensions) {
      if (!exactObject(dimension) || !exactKeys(dimension, ['id','measured_zip_dimension_cells','positive_zip_dimension_cells','disposition_counts','temporal_qualification']) ||
        typeof dimension.id !== 'string' || !expectedDimensions.includes(dimension.id) ||
        !nonnegative(dimension.measured_zip_dimension_cells) || dimension.measured_zip_dimension_cells > zipRows ||
        !nonnegative(dimension.positive_zip_dimension_cells) || dimension.positive_zip_dimension_cells > dimension.measured_zip_dimension_cells ||
        !exactObject(dimension.disposition_counts) || !exactKeys(dimension.disposition_counts, ['evidence-present','measured-zero','source-did-not-publish-for-zip','outside-source-evidence-union','outside-source-denominator','absent-from-retained-source-rows','unavailable']) ||
        !Object.values(dimension.disposition_counts).every(nonnegative)) return false;
      const counts = dimension.disposition_counts as Record<string, number>;
      if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== zipRows ||
        counts['evidence-present'] !== dimension.positive_zip_dimension_cells ||
        counts['evidence-present'] + counts['measured-zero'] !== dimension.measured_zip_dimension_cells) return false;
      const temporal = EXACT_ZIP_V31_SUMMARY_CONTRACT.find(([id]) => id === dimension.id)?.[2];
      if (!temporal || !sameClosed(dimension.temporal_qualification, {
        source_key: temporal.source_key, source_release_id: temporal.source_release_id,
        source_reference_at: temporal.source_reference_at, review_due_at: temporal.review_due_at,
        review_qualification: temporal.review_qualification, semantic_class: temporal.semantic_class,
        source_status_term: temporal.source_status_term,
      }) || seenDimensions.has(dimension.id) && !sameClosed(dimension, seenDimensions.get(dimension.id))) return false;
      seenDimensions.set(dimension.id, dimension);
      measured += dimension.measured_zip_dimension_cells;
      if (dimension.measured_zip_dimension_cells > 0) evidenced++;
    }
    return row.measured_zip_dimension_cells === measured && row.dimensions_with_retained_evidence === evidenced;
  });
}
function OperationalIndustryCrosswalkStatus({state}:{state:string}){const[result,setResult]=useState<{state:string;view:OperationalIndustryCrosswalkView|null;failed:boolean}|null>(null),view=result?.state===state?result.view:null,failed=result?.state===state&&result.failed;useEffect(()=>{if(!state)return;const controller=new AbortController();setResult(null);void runnerJson<unknown>(`/api/business-map/operational-industry-evidence?state=${encodeURIComponent(state)}`,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setResult(validOperationalIndustryCrosswalkView(value,state)?{state,view:value,failed:false}:{state,view:null,failed:true})}).catch(reason=>{if(!controller.signal.aborted&&reason?.name!=='AbortError')setResult({state,view:null,failed:true})});return()=>controller.abort()},[state]);if(!state)return <section className="supporting-evidence" aria-label="Selected-state operational industry evidence"><h4>Selected-state industry evidence</h4><p>Select a state to compare the nine operational industries with retained exact-ZIP evidence.</p></section>;if(failed)return <section className="supporting-evidence" aria-label="Selected-state operational industry evidence"><h4>{state} industry evidence</h4><p role="alert">Verified retained evidence is unavailable; no percentage or zero was inferred.</p></section>;if(!view)return <p role="status">Verifying {state} operational-industry evidence…</p>;return <section className="supporting-evidence" aria-label="Selected-state operational industry evidence"><h4>{view.state.name} · operational industry evidence</h4><p>{count(view.state.governed_zcta_zip5_rows)} governed state ZCTA ZIP5 keys. Percentages below measure retained source-dimension evidence cells, not businesses or industry completeness.</p><div className="state-industry-progress">{view.industries.map(row=><div key={row.id}><span>{row.id.replaceAll('-',' ')}</span><strong>{row.exact_zip_measurement_reach_percent===null?'Unmeasured':`${row.exact_zip_measurement_reach_percent.toFixed(1)}%`}</strong><small>Exact-ZIP measurement reach · {count(row.measured_zip_dimension_cells)} / {count(row.zip_dimension_cell_denominator)} ZIP5-by-source-dimension cells</small><small>Dimension evidence availability {row.dimension_evidence_availability_percent?.toFixed(1)??'Unmeasured'}% · {row.dimensions_with_retained_evidence}/{row.mapped_dimensions} mapped dimensions</small></div>)}</div><details><summary>Mapped source dimensions and provenance</summary>{view.industries.map(row=><div key={row.id}><strong>{row.id.replaceAll('-',' ')}</strong>{row.dimensions.map(dimension=><small key={dimension.id}><code>{dimension.id}</code> · {dimension.temporal_qualification.review_qualification.replaceAll('-',' ')} · {dimension.temporal_qualification.semantic_class.replaceAll('-',' ')} · release {dimension.temporal_qualification.source_release_id??'unresolved'}</small>)}</div>)}</details><p className="operations-note">The crosswalk does not add overlapping source rows or entities. Non-ZCTA, materially cross-state, unresolved, and placeholder ZIP evidence stays outside the state denominator. ZIP+4 remains separate. Current operation, USPS validity, public export, production enrollment, and business or industry completeness remain unverified.</p></section>}
function GovernedIndustryStatus({state}:{state:string}){return <section className="industry-summary" aria-label="Governed Industry Status"><h3>Industry Status</h3><p>This view reports maintenance intent and retained evidence without estimating the number or completeness of all U.S. businesses. The governed crosswalk below relates compatible retained source dimensions to the nine operational segments while preserving each source&apos;s distinct row unit, provenance, and status. Unavailable or unresolved evidence remains unknown rather than zero.</p><OperationalMaintenanceIntent/><OperationalIndustryCrosswalkStatus state={state}/><GovernedCoverageStates/><AdjacentExactZipEvidenceCatalog/><ExactZipIndustryNationalSummary /></section>}
export function ExactZipIndustryEvidencePanel({ zip }: { zip: string }) {
  const [result, setResult] = useState<{
      zip: string;
      view: ExactZipEvidence | null;
      failure: boolean;
    } | null>(null),
    view = result?.zip === zip ? result.view : null,
    failure = result?.zip === zip && result.failure;
  useEffect(() => {
    if (!zip) return;
    const controller = new AbortController();
    void runnerJson<ExactZipEvidence>(
      `/api/business-map/exact-zip-industry-evidence?zip=${encodeURIComponent(zip)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        setResult(
          validExactZipEvidence(value, zip)
            ? { zip, view: value, failure: false }
            : { zip, view: null, failure: true },
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setResult({ zip, view: null, failure: true });
      });
    return () => controller.abort();
  }, [zip]);
  if (!zip)
    return (
      <p role="status">
        Enter a ZIP to inspect the 43 retained source projections.
      </p>
    );
  if (!view)
    return (
      <p role={failure ? "alert" : "status"}>
        {failure
          ? "Exact 43-source ZIP matrix evidence is unavailable or malformed; no cell was interpreted."
          : `Loading 43-source matrix evidence for ZIP ${zip}…`}
      </p>
    );
  if (!view.row)
    return (
      <section role="status">
        <p>
          ZIP {zip} is outside the retained evidence cohort. This does not
          establish an invalid USPS ZIP or zero business activity.
        </p>
        {(view.out_of_cohort_source_zip_gaps??[]).length > 0 && (
          <>
            <p>
              Retained source ZIP evidence is preserved as out-of-cohort gaps:
            </p>
            <ul>
              {(view.out_of_cohort_source_zip_gaps??[]).map((g) => (
                <li key={`${g.zip5}:${g.source_id}:${g.publisher_scope ?? ""}`}>
                  {sourceLabel(g.source_id)}
                  {g.publisher_scope ? ` (${g.publisher_scope})` : ""}:{" "}
                  {count(g.count)} · source release {g.source_release_id} ·
                  reference{" "}
                  {g.temporal_status.source_reference_date ?? "unresolved"};
                  current operation unverified.
                </li>
              ))}
            </ul>
          </>
        )}
        {(view.source_quality_gaps??[]).length > 0 && (
          <>
            <p>
              Separate retained source ZIP quality gaps are not keyed to this
              out-of-cohort ZIP:
            </p>
            <ul>
              {(view.source_quality_gaps??[]).map((g, index) => (
                <li key={`${g.source_id}:${index}`}>
                  {g.publisher_scope} · {g.source_id}:{" "}
                  {"candidate_rows" in g
                    ? count(g.candidate_rows)
                    : count(g.reported_center_rows)}{" "}
                  {"candidate_rows" in g
                    ? "candidate row"
                    : "reported center rows"}{" "}
                  classified by the source as {g.reason}; no ZIP5 key is
                  asserted.
                </li>
              ))}
            </ul>
          </>
        )}
        {(view.source_address_row_gaps??[]).length > 0 && (
          <details>
            <summary>
              Separate source-address rows without eligible ZIP5 (
              {(view.source_address_row_gaps??[]).length} grouped gaps)
            </summary>
            <ul>
              {(view.source_address_row_gaps??[]).map((g, index) => (
                <li
                  key={`${g.publisher_jurisdiction}:${g.dimension_id}:${g.zip_partition_reason}:${index}`}
                >
                  {g.publisher_jurisdiction} · {sourceLabel(g.dimension_id)}:{" "}
                  {count(g.address_rows)} source address rows classified as{" "}
                  {g.zip_partition_reason}; no ZIP5 key. Reference{" "}
                  {g.source_reference_date}; source release{" "}
                  {g.source_release_id}.
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  const registryStatus = (
    source: string,
    cell: ExactZipCell,
    metadata: ExactZipSourceMetadata,
  ) =>
    (profileSourceLabels[source] ||
      (source.startsWith("childcare_") && !source.endsWith("_candidates"))) &&
    cell.source_status_counts ? (
      <small>
        Source status labels:{" "}
        {Object.entries(cell.source_status_counts)
          .map(([label, value]) => `${label} ${count(value)}`)
          .join(" · ")}
        .{" "}
        {metadata.source_observation ? (
          <>
            Observed{" "}
            {metadata.source_observation.earliest_observed_at ?? "unknown"}–
            {metadata.source_observation.latest_observed_at ?? "unknown"}{" "}
            (observation, not refresh).
          </>
        ) : metadata.earliest_observed_at ? (
          <>
            Observed {metadata.earliest_observed_at}–
            {metadata.latest_observed_at}; observation, not refresh.
          </>
        ) : null}{" "}
        {metadata.row_unit ? (
          <>
            Row unit {metadata.row_unit}; current operation remains unverified.
          </>
        ) : null}{" "}
        {metadata.coordinate_ineligible_rows ? (
          <>Coordinates are not eligible for governed geography.</>
        ) : null}
      </small>
    ) : null;
  return (
    <details className="supporting-evidence">
      <summary>Detailed 43-source ZIP matrix and provenance</summary>
      <section aria-label={`Exact ZIP ${zip} industry source matrix`}>
        <h4>Forty-source exact-ZIP matrix</h4>
        <p>
          USPS validity: <strong>Unknown</strong> · ZIP+4:{" "}
          <strong>Separate and not joined</strong>. Cells are nonadditive and do
          not establish all-business completeness or current operation.
          Registry-location profiles preserve source-native status categories;
          they are not unique businesses, sites, or current operations.
          Childcare candidate rows and publisher reporting-center rows remain
          distinct source units; publisher labels do not verify operations.
          Broad-organization publisher address rows and Oregon legal and
          brand-registration dimensions are also separate.
          {" "}A state/local source with no retained row is shown as “absent
          from retained source rows,” not measured zero; same-code ZCTA does not
          establish that publisher’s ZIP denominator or jurisdiction.
        </p>
        <div
          className="representation-table"
          role="region"
          aria-label="Exact ZIP source cells"
          tabIndex={0}
        >
          <table>
            <caption>Retained source projections for ZIP {zip}</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Source-specific measure</th>
                <th scope="col">Temporal status</th>
                <th scope="col">Release provenance</th>
              </tr>
            </thead>
            <tbody>
              {(view.schema_version==="national-exact-zip-industry-evidence-row@3.0.0"?EXACT_ZIP_V30_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.9.0"?EXACT_ZIP_V29_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.8.0"?EXACT_ZIP_V28_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.7.0"?EXACT_ZIP_V27_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.6.0"?EXACT_ZIP_V26_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.5.0"?EXACT_ZIP_V25_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.4.0"?EXACT_ZIP_V24_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.3.0"?EXACT_ZIP_V23_SOURCES:view.schema_version==="national-exact-zip-industry-evidence-row@2.2.0"?EXACT_ZIP_V22_SOURCES:EXACT_ZIP_SOURCES).map((source) => {
                const cell = view.row!.cells[source],
                  metadata = view.source_metadata[source] ?? {} as ExactZipSourceMetadata,
                  qualification=view.temporal_qualification.rows.find(row=>row.dimension_id===source)!,
                  measureValue = exactZipSourceMeasureValue(cell);
                return (
                  <tr key={source}>
                    <th scope="row">{sourceLabel(source)}</th>
                    <td>
                      {cell.status === "measured-positive"
                        ? "Measured positive Census annual aggregate evidence"
                        : source === "dc_active_basic_business_license_physical_sites" && cell.status === "positive"
                          ? "Publisher Active snapshot evidence — continuous operation unverified"
                          : source === "dc_active_basic_business_license_physical_sites" && cell.status === "measured-zero"
                            ? "Measured zero physical sites in the retained D.C. publisher snapshot"
                            : source === "dc_active_basic_business_license_physical_sites" && cell.status === "outside-source-denominator"
                              ? "Outside the retained D.C. license/ZCTA evidence denominator — not zero"
                        : source === "ca_abc_active_issued_license_physical_sites" && cell.status === "positive"
                          ? "Publisher ACTIVE snapshot evidence — continuous operation unverified"
                          : source === "ca_abc_active_issued_license_physical_sites" && cell.status === "measured-zero"
                            ? "Measured zero physical sites in the retained publisher snapshot"
                            : source === "ca_abc_active_issued_license_physical_sites" && cell.status === "outside-source-denominator"
                              ? "Outside the retained CA ABC/ZCTA evidence denominator — not zero"
                        : source === "cross_source_entity_resolution_linkage_evidence" && cell.status === "positive"
                          ? "Retained linkage evidence row — no identity merge or resolution asserted"
                          : source === "cross_source_entity_resolution_linkage_evidence" && cell.status === "absent-from-retained-source-rows"
                            ? "No retained linkage decisions — not evidence of absence or resolution"
                        : cell.status === "not-published-for-zip"
                          ? "Source did not publish this ZIP — not zero"
                          : cell.status === "outside-zbp-zcta-evidence-union"
                            ? "Outside ZBP/ZCTA evidence union — not zero"
                      : cell.status === "measured-zero"
                        ? "Measured zero in this source projection"
                        : cell.status === "outside-source-denominator"
                          ? "Outside source denominator — not zero"
                          : cell.status === "absent-from-retained-source-rows"
                            ? "No retained source row — not measured zero"
                            : "Positive source evidence"}
                    </td>
                    <td>
                      {measureValue === null ? "Not measured" : count(measureValue)}{" "}
                      · {cell.measure.replaceAll("_", " ")}
                      {registryStatus(source, cell, metadata)}
                    </td>
                    <td>
                      {cell.temporal_status?.source_reference_date ??
                        "Unresolved"}
                      <small>
                        {cell.temporal_status?.status.replaceAll("-", " ")??"annual aggregate source status"} ·
                        current operation unverified
                      </small>
                      <small>
                        Governed semantic: {qualification.semantic_class.replaceAll("-", " ")} · review: {qualification.review_qualification.replaceAll("-", " ")} as of {qualification.assessment_as_of}. Source-defined current is not verified current operation.
                      </small>
                      <small>
                        Evidence disposition: {qualification.evidence_disposition.label} · source {qualification.source_key??"unmapped"} · release {qualification.source_release_id??"unmapped"} · publisher status {qualification.source_status_term??"unmapped"} · reference {qualification.source_reference_at??"unresolved"} · review due {qualification.review_due_at??"unmeasured"}. This disposition does not verify current operation.
                      </small>
                    </td>
                    <td>
                      <code>{cell.source_release_id}</code>
                      <small>
                        Manifest SHA-256 {metadata.source_manifest_sha256}
                        {metadata.row_unit
                          ? ` · ${metadata.row_unit} · ${metadata.export_policy} export`
                          : ""}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(view.source_quality_gaps??[]).length > 0 && (
          <details>
            <summary>
              Childcare source ZIP quality gaps (
              {(view.source_quality_gaps??[]).length})
            </summary>
            <ul>
              {(view.source_quality_gaps??[]).map((g, index) => (
                <li key={`${g.source_id}:${index}`}>
                  {g.publisher_scope} · {g.source_id}:{" "}
                  {"candidate_rows" in g
                    ? count(g.candidate_rows)
                    : count(g.reported_center_rows)}{" "}
                  {"candidate_rows" in g
                    ? "candidate row"
                    : "reported center rows"}{" "}
                  classified by the retained source as {g.reason}; no ZIP5 key
                  is asserted. Source release {g.source_release_id}, reference{" "}
                  {"source_reference_date" in g
                    ? (g.source_reference_date ?? "unresolved")
                    : g.source_observed_at}
                  .
                </li>
              ))}
            </ul>
          </details>
        )}
        {(view.source_address_row_gaps??[]).length > 0 && (
          <details>
            <summary>
              Separate broad-organization address-row ZIP gaps (
              {(view.source_address_row_gaps??[]).length} grouped gaps)
            </summary>
            <ul>
              {(view.source_address_row_gaps??[]).map((g, index) => (
                <li
                  key={`${g.publisher_jurisdiction}:${g.dimension_id}:${g.zip_partition_reason}:${index}`}
                >
                  {g.publisher_jurisdiction} · {sourceLabel(g.dimension_id)}:{" "}
                  {count(g.address_rows)} source address rows classified as{" "}
                  {g.zip_partition_reason}; no ZIP5 key is assigned. Reference{" "}
                  {g.source_reference_date}; source release{" "}
                  {g.source_release_id}. This is distinct from positive
                  out-of-cohort ZIP evidence and the Maryland childcare
                  source-quality exception.
                </li>
              ))}
            </ul>
          </details>
        )}
        <details>
          <summary>Matrix release provenance</summary>
          <p>
            Release <code>{view.release_id}</code>
          </p>
          <p>
            Manifest SHA-256 <code>{view.manifest_sha256}</code>
          </p>
          <p>
            Bounded source bytes read: {count(view.source_bytes_read)} · full
            matrix replay per request: no
          </p>
        </details>
      </section>
    </details>
  );
}
type ZipIndustryDemographicCrossView = {
  schema_version: "zip-industry-demographic-cross-view@1.0.0";
  zip5: string;
  status:
    | "available"
    | "not-applicable-no-same-code-zcta"
    | "unavailable-exact-zip-evidence"
    | "unavailable-demographic-context";
  zcta_geoid: string | null;
  industry_evidence: ExactZipEvidence;
  demographic_context: null | {
    status: string;
    population_2020: number;
    housing_units_2020: number;
    availability: {
      population_2020: boolean;
      housing_units_2020: boolean;
      race: boolean;
      ancestry_lineage: boolean;
      sex: boolean;
      age: boolean;
    };
    blockers: string[];
    provenance: {
      release_id: string;
      manifest_sha256: string;
      artifact_sha256: string;
      created_at: string;
      geography_release_id: string;
    };
  };
  semantics: { geography: string; industry: string; demographic: string };
  claims: {
    same_code_zcta_required: true;
    ratios_computed: false;
    cross_industry_total: false;
    numeric_gdp: false;
    demographic_shares: false;
    authoritative_usps_validity: null;
    network_requests: 0;
    acquisition_performed: false;
    current_pointer_written: false;
    production_enrollment: false;
  };
};
export function validZipIndustryDemographicCrossView(
  value: unknown,
  zip: string,
): value is ZipIndustryDemographicCrossView {
  if (
    !exactKeys(value, [
      "schema_version",
      "zip5",
      "status",
      "zcta_geoid",
      "industry_evidence",
      "demographic_context",
      "semantics",
      "claims",
    ])
  )
    return false;
  const v = value as ZipIndustryDemographicCrossView;
  if (
    v.schema_version !== "zip-industry-demographic-cross-view@1.0.0" ||
    v.zip5 !== zip ||
    ![
      "available",
      "not-applicable-no-same-code-zcta",
      "unavailable-exact-zip-evidence",
      "unavailable-demographic-context",
    ].includes(v.status) ||
    !validExactZipEvidence(v.industry_evidence, zip)
  )
    return false;
  if (
    !exactKeys(v.semantics, ["geography", "industry", "demographic"]) ||
    Object.values(v.semantics).some(
      (item) => typeof item !== "string" || item.length < 10,
    )
  )
    return false;
  if (
    !exactKeys(v.claims, [
      "same_code_zcta_required",
      "ratios_computed",
      "cross_industry_total",
      "numeric_gdp",
      "demographic_shares",
      "authoritative_usps_validity",
      "network_requests",
      "acquisition_performed",
      "current_pointer_written",
      "production_enrollment",
    ]) ||
    v.claims.same_code_zcta_required !== true ||
    v.claims.authoritative_usps_validity !== null ||
    v.claims.network_requests !== 0 ||
    [
      "ratios_computed",
      "cross_industry_total",
      "numeric_gdp",
      "demographic_shares",
      "acquisition_performed",
      "current_pointer_written",
      "production_enrollment",
    ].some(
      (key) => (v.claims as unknown as Record<string, unknown>)[key] !== false,
    )
  )
    return false;
  const sameCode = v.industry_evidence.row?.zcta_geoid === zip;
  if (v.status === "available") {
    const d = v.demographic_context;
    if (
      !d ||
      !sameCode ||
      v.zcta_geoid !== zip ||
      !exactKeys(d, [
        "status",
        "population_2020",
        "housing_units_2020",
        "availability",
        "blockers",
        "provenance",
      ]) ||
      typeof d.status !== "string" ||
      !nonnegative(d.population_2020) ||
      !nonnegative(d.housing_units_2020) ||
      !exactKeys(d.availability, [
        "population_2020",
        "housing_units_2020",
        "race",
        "ancestry_lineage",
        "sex",
        "age",
      ]) ||
      Object.values(d.availability).some((item) => typeof item !== "boolean") ||
      !Array.isArray(d.blockers) ||
      !d.blockers.every(
        (item) => typeof item === "string" && item.length > 0,
      ) ||
      !exactKeys(d.provenance, [
        "release_id",
        "manifest_sha256",
        "artifact_sha256",
        "created_at",
        "geography_release_id",
      ]) ||
      typeof d.provenance.release_id !== "string" ||
      !sha(d.provenance.manifest_sha256) ||
      !sha(d.provenance.artifact_sha256) ||
      !iso(d.provenance.created_at) ||
      typeof d.provenance.geography_release_id !== "string"
    )
      return false;
  } else if (v.demographic_context !== null) return false;
  if (
    v.status === "not-applicable-no-same-code-zcta" &&
    (sameCode || v.zcta_geoid === zip)
  )
    return false;
  if (
    v.status === "unavailable-exact-zip-evidence" &&
    v.industry_evidence.row !== null
  )
    return false;
  if (v.status === "unavailable-demographic-context" && !sameCode) return false;
  return true;
}
export function ZipIndustryDemographicCrossViewPanel({ zip }: { zip: string }) {
  const [result, setResult] = useState<{
      zip: string;
      view: ZipIndustryDemographicCrossView | null;
      failure: boolean;
    } | null>(null),
    view = result?.zip === zip ? result.view : null,
    failure = result?.zip === zip && result.failure;
  useEffect(() => {
    if (!zip) return;
    const controller = new AbortController();
    void runnerJson<ZipIndustryDemographicCrossView>(
      `/api/business-map/zip-industry-demographic-cross-view?zip=${encodeURIComponent(zip)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setResult(
            validZipIndustryDemographicCrossView(value, zip)
              ? { zip, view: value, failure: false }
              : { zip, view: null, failure: true },
          );
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setResult({ zip, view: null, failure: true });
      });
    return () => controller.abort();
  }, [zip]);
  if (!zip)
    return (
      <p role="status">
        Enter a ZIP to inspect the governed industry and demographic cross-view.
      </p>
    );
  if (!view)
    return (
      <p role={failure ? "alert" : "status"}>
        {failure
          ? "ZIP industry and demographic cross-view is unavailable or malformed; no values were interpreted."
          : `Loading governed cross-view for ZIP ${zip}…`}
      </p>
    );
  if (view.status !== "available")
    return (
      <section aria-label={`ZIP ${zip} industry and demographic cross-view`}>
        <h4>Industry × demographic context</h4>
        <p role="status">
          {view.status === "not-applicable-no-same-code-zcta"
            ? "Not applicable: this ZIP has no exact same-code governed Census ZCTA."
            : view.status === "unavailable-exact-zip-evidence"
              ? "Unavailable: this ZIP is outside the retained exact-ZIP evidence cohort."
              : "Unavailable: governed Census demographic context was not found."}
        </p>
        <p>
          No ratios, totals, GDP, demographic shares, or USPS-validity
          conclusion was produced.
        </p>
      </section>
    );
  const d = view.demographic_context!;
  return (
    <section aria-label={`ZIP ${zip} industry and demographic cross-view`}>
      <h4>Industry evidence × 2020 Census context</h4>
      <p>
        Census ZCTA {view.zcta_geoid} · population {count(d.population_2020)} ·
        housing units {count(d.housing_units_2020)}. Aggregate context only; no
        ratio, total, GDP allocation, demographic share, or USPS-validity
        conclusion is computed.
      </p>
      <div
        className="representation-table"
        role="region"
        aria-label="Forty source cells with demographic context"
        tabIndex={0}
      >
        <table>
          <caption>
            Source-specific, nonadditive evidence beside same-code ZCTA context
          </caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Evidence status</th>
              <th scope="col">Source measure</th>
              <th scope="col">Temporal status</th>
              <th scope="col">2020 population</th>
              <th scope="col">2020 housing</th>
            </tr>
          </thead>
          <tbody>
            {(view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@3.0.0"?EXACT_ZIP_V30_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.9.0"?EXACT_ZIP_V29_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.8.0"?EXACT_ZIP_V28_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.7.0"?EXACT_ZIP_V27_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.6.0"?EXACT_ZIP_V26_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.5.0"?EXACT_ZIP_V25_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.4.0"?EXACT_ZIP_V24_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.3.0"?EXACT_ZIP_V23_SOURCES:view.industry_evidence.schema_version==="national-exact-zip-industry-evidence-row@2.2.0"?EXACT_ZIP_V22_SOURCES:EXACT_ZIP_SOURCES).map((source) => {
              const cell = view.industry_evidence.row!.cells[source],
                measureValue = exactZipSourceMeasureValue(cell),
                metadata = view.industry_evidence.source_metadata[source] ?? {} as ExactZipSourceMetadata,
                qualification=view.industry_evidence.temporal_qualification.rows.find(row=>row.dimension_id===source)!,
                statusCounts = cell.source_status_counts,
                observation = metadata.source_observation,
                reportingObservation = metadata.earliest_observed_at
                  ? { earliest_observed_at: metadata.earliest_observed_at, latest_observed_at: metadata.latest_observed_at }
                  : null;
              return (
                <tr key={source}>
                  <th scope="row">{sourceLabel(source)}</th>
                  <td>{cell.status.replaceAll("-", " ")}</td>
                  <td>
                    {measureValue === null ? "Not measured" : count(measureValue)}{" "}·{" "}
                    {cell.measure.replaceAll("_", " ")}
                    {statusCounts && (
                      <small>
                        Source status labels:{" "}
                        {Object.entries(statusCounts)
                          .map(([label, value]) => `${label} ${count(value)}`)
                          .join(" · ")}
                      </small>
                    )}
                    {metadata.coordinate_ineligible_rows ? (
                      <small>
                        Coordinates are not eligible for governed geography.
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {cell.temporal_status?.source_reference_date ?? "Unresolved"}
                    <small>
                      {cell.temporal_status?.status.replaceAll("-", " ")??"annual aggregate source status"}
                    </small>
                    <small>
                      Governed semantic: {qualification.semantic_class.replaceAll("-", " ")} · review: {qualification.review_qualification.replaceAll("-", " ")} as of {qualification.assessment_as_of}; source-defined current is not verified current operation.
                    </small>
                    <small>
                      Evidence disposition: {qualification.evidence_disposition.label} · source {qualification.source_key??"unmapped"} · release {qualification.source_release_id??"unmapped"} · publisher status {qualification.source_status_term??"unmapped"} · reference {qualification.source_reference_at??"unresolved"} · review due {qualification.review_due_at??"unmeasured"}. This disposition does not verify current operation.
                    </small>
                    {observation && (
                      <small>
                        Observed {observation.earliest_observed_at ?? "unknown"}
                        –{observation.latest_observed_at ?? "unknown"};
                        observation, not refresh.
                      </small>
                    )}
                    {!observation && reportingObservation && (
                      <small>
                        Source observation {reportingObservation.earliest_observed_at}–{reportingObservation.latest_observed_at}; not a refresh clock.
                      </small>
                    )}
                  </td>
                  <td>{count(d.population_2020)}</td>
                  <td>{count(d.housing_units_2020)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        {view.semantics.industry} {view.semantics.demographic}
      </p>
    </section>
  );
}
const economyTabs = ["Overview", "Business segments", "Demographics"] as const;
const segments = [
  ["all", "All source categories"],
  ["retail-consumer", "Retail and consumer"],
  ["health-care", "Health care"],
  ["financial-services", "Financial services"],
  ["tax-exempt-organizations", "Tax-exempt organizations"],
  ["food-production", "Food production"],
  ["environmental-facilities", "Environmental facilities"],
  ["transportation", "Transportation"],
  ["childcare", "Childcare"],
  ["licensed-businesses", "Licensed business evidence"],
  ["registrations-nonprofits", "Organization registrations and nonprofits"],
];
export function ZipEconomyWorkspace({
  stateCode = "",
  mode = "economy",
  initialZip = "",
  onZipChange,
}: {
  stateCode?: string;
  mode?: "economy" | "demographics";
  initialZip?: string;
  onZipChange?: (zip: string) => void;
} = {}) {
  const restoredZip = /^\d{5}$/.test(initialZip) ? initialZip : "";
  const [input, setInput] = useState(restoredZip),
    [zip, setZip] = useState(restoredZip),
    [view, setView] = useState<ZipEvidence | null>(null),
    [error, setError] = useState(""),
    [dimension, setDimension] = useState("Race"),
    [section, setSection] = useState<(typeof economyTabs)[number]>(
      mode === "demographics" ? "Demographics" : "Overview",
    ),
    [segment, setSegment] = useState("all"),
    [attempt, setAttempt] = useState(0),
    [readiness, setReadiness] = useState<ZctaEconomicReadiness | null>(null),
    [readinessError, setReadinessError] = useState(false);
  const segmentName = segments.find(([id]) => id === segment)?.[1] ?? segment;
  useEffect(() => {
    if (!zip) return;
    const controller = new AbortController();
    void runnerJson<ZipEvidence>(
      `/api/business-map/zip-inspector?zip=${zip}&category=${encodeURIComponent(segment)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (
          !controller.signal.aborted &&
          value.zip5 === zip &&
          value.category_evidence?.category_id === segment
        )
          setView(value);
        else if (!controller.signal.aborted)
          setError(
            "Returned ZIP/category evidence did not match the requested scope.",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Exact ZIP evidence is unavailable. No estimates were substituted.",
          );
      });
    return () => controller.abort();
  }, [zip, segment, attempt]);
  const governedZcta = view?.governed_zcta;
  let matchedZcta: string | null = null;
  if (
    view &&
    governedZcta?.geoid === view.zip5 &&
    governedZcta.status === "included"
  )
    matchedZcta = governedZcta.geoid;
  useEffect(() => {
    if (!matchedZcta) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setReadiness(null);
        setReadinessError(false);
      }
    });
    void runnerJson<ZctaEconomicReadiness>(
      `/api/business-map/zcta-economic-readiness?zcta=${encodeURIComponent(matchedZcta)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (
          !controller.signal.aborted &&
          validZctaEconomicReadiness(value, matchedZcta)
        )
          setReadiness(value);
        else if (!controller.signal.aborted) setReadinessError(true);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && reason?.name !== "AbortError")
          setReadinessError(true);
      });
    return () => controller.abort();
  }, [matchedZcta]);
  function changeSegment(value: string) {
    setSegment(value);
    setView(null);
    setReadiness(null);
    setReadinessError(false);
    setError("");
  }
  return (
    <section className="panel focused-workspace">
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">
            {mode === "demographics"
              ? "National demographic cross-view"
              : "Local economic view"}
          </span>
          <h2>{mode === "demographics" ? "Demographic GDP" : "ZIP Economics"}</h2>
        </div>
        <p>
          {mode === "demographics"
            ? "Cross-view modeled GDP by demographic dimension without converting unavailable inputs into estimates."
            : "Connect exact ZIP evidence and business segments with modeled total GDP where governed inputs exist."}
        </p>
      </div>
      <p className="scope-note">
        Source-reported ZIP5 and Census ZCTA polygons are different geographies.
        Observed values, published statistics, modeled values, and withheld
        outputs remain distinct.
      </p>
      <details className="supporting-evidence">
        <summary>ZIP denominator readiness and blockers</summary>
        <BusinessIntelligenceReadiness mode="zip" />
      </details>
      {stateCode && (
        <p>
          Navigation context: {stateCode}. A ZIP is not inferred from the
          selected state; enter an exact ZIP below.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (/^\d{5}$/.test(input)) {
            setError("");
            setView(null);
            setReadiness(null);
            setReadinessError(false);
            setZip(input);
            onZipChange?.(input);
            setAttempt(attempt + 1);
          } else
            setError("Enter exactly five ZIP digits, including leading zeros.");
        }}
      >
        <label>
          ZIP5{" "}
          <input
            aria-label="Economy ZIP5"
            inputMode="numeric"
            maxLength={5}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <label>
          Business segment{" "}
          <select
            aria-label="Economy business segment"
            value={segment}
            onChange={(event) => changeSegment(event.target.value)}
          >
            {segments.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{error && zip ? "Retry ZIP" : "View ZIP"}</button>
        {(mode === "demographics" || section === "Demographics") && (
          <label>
            Demographic dimension{" "}
            <select
              aria-label="Demographic dimension"
              value={dimension}
              onChange={(event) => setDimension(event.target.value)}
            >
              {["Race", "Lineage / ancestry", "Sex", "Age"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
      </form>
      <p className="economy-context">
        <strong>{zip ? `ZIP ${zip}` : "No ZIP selected"}</strong> ·{" "}
        {segmentName} ·{" "}
        {section === "Demographics"
          ? `${dimension} cross-view`
          : "observed source evidence and model readiness"}
      </p>
      <p>
        Source segments can overlap. Registration and licensing evidence does
        not establish current operation or a physical site. GDP and demographic
        allocations require governed inputs; missing evidence is not a measured
        zero.
      </p>
      {mode === "economy" && <div
        className="workspace-tabs subsection-tabs"
        role="tablist"
        aria-label="ZIP Economics views"
      >
        {economyTabs.map((name, index) => (
          <button
            key={name}
            id={`economy-tab-${index}`}
            role="tab"
            aria-selected={section === name}
            aria-controls="economy-panel"
            tabIndex={section === name ? 0 : -1}
            onClick={() => setSection(name)}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? economyTabs.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % economyTabs.length
                      : event.key === "ArrowLeft"
                        ? (index + economyTabs.length - 1) % economyTabs.length
                        : null;
              if (next !== null) {
                event.preventDefault();
                setSection(economyTabs[next]);
                document.getElementById(`economy-tab-${next}`)?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>}
      {error && <p role="alert">{error}</p>}
      {zip && !view && !error && (
        <p role="status">
          Loading {zip} · {segmentName}…
        </p>
      )}
      {zip && (
        <details className="supporting-evidence">
          <summary>ZIP geography, source dates and directory evidence</summary>
          {view && (
            <>
              <ZipGeographySummary view={view} />
              <ZipSourceNativeStatus
                view={view.source_native_status_distribution}
              />
            </>
          )}
          <CmsDirectoryZipLoader zip={zip} attempt={attempt} />
          <RetainedChildcareZipLoader zip={zip} attempt={attempt} />
          <NonZctaSourceGeographyContext zip={zip} />
        </details>
      )}
      <div
        id="economy-panel"
        role={mode === "economy" ? "tabpanel" : undefined}
        aria-labelledby={
          mode === "economy"
            ? `economy-tab-${economyTabs.indexOf(section)}`
            : undefined
        }
        tabIndex={0}
      >
        {mode === "economy" && section === "Overview" && (
          <>
            <section
              className="model-method-panel"
              aria-label="Extrapolated ZIP GDP method and coverage"
            >
              <div>
                <span className="section-kicker">
                  Modeled / extrapolated output · HOLD
                </span>
                <h3>ZIP-level total GDP and business-segment breakdown</h3>
                <p>
                  No ZIP GDP or segment allocation is currently authorized or
                  emitted. Published county GDP, retained source rows, and
                  Census establishment aggregates are separate evidence—not ZIP
                  GDP or valid segment weights.
                </p>
              </div>
              <div className="economy-evidence-grid">
                <article>
                  <h4>Total extrapolated ZIP GDP</h4>
                  <strong>Withheld — no approved ZIP model</strong>
                  <p>
                    Current governed BEA evidence is county-level. The retained
                    research packet evaluates county-to-2020-ZCTA methods; a
                    ZCTA is not an official USPS ZIP5.
                  </p>
                </article>
                <article>
                  <h4>GDP by business segment</h4>
                  <strong>Withheld — no governed allocation</strong>
                  <p>
                    Coverage is not established by segment. Industry counts and
                    source memberships are not GDP weights; missing inputs are
                    not zero.
                  </p>
                </article>
              </div>
              <p className="entity-method-note">
                Method and coverage gate: inspect the governed HOLD packet
                below. Its technical readiness is not model approval. No false
                precision, cross-industry total, current-operation claim, or
                USPS ZIP conversion is produced.
              </p>
              <ZctaGdpApprovalCardLoader />
            </section>
            {view && (
              <>
                <h3>Observed evidence · ZIP {view.zip5}</h3>
                <p>{evidenceLabel(view.evidence_status)}.</p>
                <dl>
                  <dt>All-category physical-site evidence</dt>
                  <dd>{count(view.counts?.physical_sites)}</dd>
                  <dt>All-category provisional establishments</dt>
                  <dd>{count(view.counts?.establishments)}</dd>
                  <dt>
                    Published Census employer baseline (statistical aggregate)
                  </dt>
                  <dd>{count(view.counts?.employer_establishments)}</dd>
                </dl>
                <p>
                  These baseline counts are not filtered by the business
                  segment. Open Business segments for scoped source evidence.
                </p>
              </>
            )}
            {view &&
              (matchedZcta ? (
                readiness ? (
                  <ZctaEconomicReadinessPanel view={readiness} />
                ) : (
                  <p role="status">
                    {readinessError
                      ? "Economic-model readiness is unavailable. No status or estimate was substituted."
                      : `Loading economic-model readiness for Census ZCTA ${matchedZcta}…`}
                  </p>
                )
              ) : (
                <p role="status">
                  Economic-model readiness: not applicable. This ZIP has no
                  same-code governed Census ZCTA match, so no readiness lookup
                  was made.
                </p>
              ))}
            {view && (
              <details className="supporting-evidence">
                <summary>Census employer profile · ZIP {view.zip5}</summary>
                <CensusZbpZipProfile
                  view={view.census_zbp_industry_profile}
                  onRetry={() => {
                    setView(null);
                    setReadiness(null);
                    setReadinessError(false);
                    setError("");
                    setAttempt(attempt + 1);
                  }}
                />
              </details>
            )}
          </>
        )}
        {mode === "economy" && section === "Business segments" && (
          <>
            <h3>
              {segmentName} · ZIP {zip || "not selected"}
            </h3>
            <p>
              Selected-segment extrapolated GDP: <strong>Unavailable</strong>.
              GDP share: <strong>Unmeasured</strong>. Observed source
              contributions below are not GDP allocations, additive business
              totals or a completeness percentage.
            </p>
            <ExactZipIndustryEvidencePanel zip={zip} />
            <details>
              <summary>Selected segment contribution detail</summary>
              <h4>Observed source contributions</h4>
              {view?.category_evidence?.status ===
              "positive-source-contribution" ? (
                <div
                  className="representation-table"
                  role="region"
                  aria-label="Ordinary ZIP source contributions"
                  tabIndex={0}
                >
                  <table>
                    <caption>
                      Observed source evidence for the selected ZIP and segment
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Source / release</th>
                        <th scope="col">Source-defined count</th>
                        <th scope="col">Modeled GDP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.category_evidence.positive_source_contributions.flatMap(
                        (source) =>
                          Object.entries(source.positive_counts).map(
                            ([unit, value]) => (
                              <tr key={`${source.source_id}:${unit}`}>
                                <th scope="row">
                                  {source.source_id}
                                  <small>
                                    {source.source_release_id ??
                                      "Release unavailable"}
                                  </small>
                                </th>
                                <td>
                                  {count(value)} · {unit.replaceAll("_", " ")}
                                </td>
                                <td>Unavailable</td>
                              </tr>
                            ),
                          ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>
                  {!zip
                    ? "Enter a ZIP to inspect segment evidence."
                    : error
                      ? "Ordinary source contributions are unavailable. Retry ZIP above; absence has not been established."
                      : !view
                        ? "Ordinary source contributions are loading; absence has not been established."
                        : view.category_evidence?.status ===
                            "no-selected-positive-evidence"
                          ? "No verified positive segment evidence in the selected release. This is not a measured zero."
                          : "Ordinary source contribution status is unknown. Absence has not been established."}
                </p>
              )}
              {view?.category_evidence && (
                <p>{view.category_evidence.semantics}</p>
              )}
            </details>
          </>
        )}
        {(mode === "demographics" || section === "Demographics") && (
          <>
            <section
              className="model-method-panel"
              aria-label="National demographic GDP modeling coverage"
            >
              <div>
                <span className="section-kicker">
                  Modeled / extrapolated outputs · not observed
                </span>
                <h3>Cross-country GDP by demographic dimension</h3>
                <p>
                  National estimates are not available in the governed output
                  contract. Coverage is unknown, not zero: no nationwide
                  demographic weights or approved GDP allocations are published.
                </p>
              </div>
              <div className="demographic-output-grid">
                {(["Race", "Lineage / ancestry", "Sex", "Age"] as const).map(
                  (value) => (
                    <article key={value}>
                      <h4>{value}</h4>
                      <strong>Withheld · no governed national estimate</strong>
                      <p>
                        {value} output would require an approved GDP model and
                        dimension-specific, geography-aligned population
                        weights. Those inputs and an authorized national
                        allocation are not available here.
                      </p>
                    </article>
                  ),
                )}
              </div>
              <p className="entity-method-note">
                No demographic group is inferred from business names, addresses,
                licensing, industry counts, or ancestry proxies. These cards
                describe missing model coverage; they are not zero-valued
                estimates.
              </p>
            </section>
            <section
              className="model-method-panel"
              aria-label="Selected ZIP demographic input readiness"
            >
              <div>
                <span className="section-kicker">
                  Selected ZIP · {zip || "not selected"}
                </span>
                <h3>
                  {dimension} × {segmentName}
                </h3>
                <p>
                  Observed Census context and modeled/extrapolated outputs are
                  separate. Readiness for one same-code ZCTA cannot be
                  generalized to the country.
                </p>
              </div>
              <ZctaDemographicReadinessPanel
                zcta={matchedZcta}
                dimension={dimension as keyof typeof demographicDimensions}
              />
              {readiness?.readiness && (
                <dl>
                  <dt>2020 Census population context</dt>
                  <dd>
                    {count(readiness.readiness.population_2020)} · aggregate
                    context only
                  </dd>
                  <dt>2020 Census housing context</dt>
                  <dd>
                    {count(readiness.readiness.housing_units_2020)} · aggregate
                    context only
                  </dd>
                  <dt>ZIP Business Patterns readiness</dt>
                  <dd>
                    <code>{readiness.readiness.zbp_publication_status}</code>
                  </dd>
                  <dt>GDP model status</dt>
                  <dd>
                    <code>{readiness.readiness.model_status}</code>
                  </dd>
                </dl>
              )}
              <p>
                <strong>Selected-ZIP {dimension} GDP:</strong> withheld. No
                demographic share, population weight, or allocation is emitted
                by the governed contract.
              </p>
            </section>
            <details className="supporting-evidence">
              <summary>
                Industry evidence beside Census population context
              </summary>
              <ZipIndustryDemographicCrossViewPanel zip={zip} />
            </details>
          </>
        )}
        {view?.operational_admission && (
          <details className="supporting-evidence">
            <summary>USPS operational evidence</summary>
            <aside aria-label="USPS operational admission">
              <h3>USPS operational evidence</h3>
              <p>
                {view.operational_admission.status.replaceAll("-", " ")}.
                Candidate configuration is not admission or proof of current ZIP
                operation or address deliverability.
              </p>
              <ul>
                {view.operational_admission.blockers.map((code) => (
                  <li key={code}>{code.replaceAll("-", " ")}</li>
                ))}
              </ul>
            </aside>
          </details>
        )}
        {mode === "economy" && section === "Business segments" && (
          <ZipEvidenceQualificationPanel
            navigationState={stateCode}
            zip={zip}
            categoryId={segment}
            coverageReleaseId={view?.bindings.coverage_release_id ?? ""}
            registryReleaseId={view?.bindings.registry_release_id ?? ""}
            supplied={{
              view: view?.qualification ?? null,
              error: !!error || (!!view && !view.qualification),
            }}
            onRetry={() => {
              setView(null);
              setReadiness(null);
              setReadinessError(false);
              setError("");
              setAttempt(attempt + 1);
            }}
          />
        )}
      </div>
      {view && (
        <details>
          <summary>Evidence releases</summary>
          {Object.entries(view.bindings).map(([key, value]) => (
            <p key={key}>
              {key.replaceAll("_", " ")}: {value ?? "Unavailable"}
            </p>
          ))}
        </details>
      )}
      <p className="entity-method-note">
        Observed source records, published statistical estimates and modeled
        allocations are distinct. This view performs no acquisition and
        publishes no economic model.
      </p>
    </section>
  );
}
