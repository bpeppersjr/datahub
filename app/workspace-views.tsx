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
import zipSourceStatusRegistration from "../config/datasets/zip-source-native-status-distribution.json";

export const workspaceTabs = [
  "State Completion",
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
  "State Completion": {
    number: "01",
    description: "Nationwide dataset availability",
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
type OperationalIndustryEvidence={schema_version:"state-access-industry-summary@1.1.0";jurisdictions:51;industry_cells:459;industries:Array<{id:string;jurisdictions:51;jurisdictions_with_retained_access_evidence:number;retained_access_evidence_percent:number;access_status_counts:Record<string,number>;temporal_status_counts:Record<string,number>}>;claims:{active_business_count:null;nationwide_industry_completeness:null;complete_geocodes:false;maintenance_selection_affects_evidence:false}};
function OperationalMaintenanceIntent(){
  const[view,setView]=useState<MaintenanceIntentView|null>(null),[evidence,setEvidence]=useState<OperationalIndustryEvidence|null>(null),[error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();void Promise.allSettled([runnerJson<MaintenanceIntentView>("/api/administration/industries",{signal:controller.signal}),runnerJson<OperationalIndustryEvidence>("/api/business-map/state-access-industry-summary",{signal:controller.signal})]).then(([intent,status])=>{if(controller.signal.aborted)return;if(intent.status==='fulfilled')setView(intent.value);else setError(true);if(status.status==='fulfilled'&&status.value.industry_cells===459)setEvidence(status.value)});return()=>controller.abort()},[]);
  return <section className="industry-summary" aria-label="Operational industry maintenance intent"><h3>Operational maintenance intent</h3><p>Operational segment IDs are shown separately from reporting/map categories. Selection controls planning defaults only; historical evidence below remains visible and unchanged.</p>{error?<p role="status">Maintenance intent is unavailable. No selection is inferred; reporting evidence remains visible.</p>:!view?<p role="status">Loading local maintenance intent…</p>:<div className="maintenance-status-list">{view.industries.map(item=>{const status=evidence?.industries.find(row=>row.id===item.id);return <div key={item.id}><strong>{item.label}</strong><code>{item.id}</code><span className={view.maintainedIndustries.includes(item.id)?"status-succeeded":"scope-note"}>{view.maintainedIndustries.includes(item.id)?"Selected for maintenance":"Not selected"}</span>{status?<><small><strong>{status.retained_access_evidence_percent.toFixed(1)}%</strong> of jurisdictions ({status.jurisdictions_with_retained_access_evidence}/51) have retained access evidence. This is not business completeness.</small><small>Access: {Object.entries(status.access_status_counts).map(([key,value])=>`${key.replaceAll('-', ' ')}: ${value}`).join(' · ')}</small><small>Temporal review: {Object.entries(status.temporal_status_counts).map(([key,value])=>`${key.replaceAll('-', ' ')}: ${value}`).join(' · ')}</small></>:<small>Evidence status unavailable; no zero inferred</small>}</div>})}</div>}<p className="operations-note">Manual-only and unauthorized sources retain their own gates. Maintenance intent does not imply authorization or completeness. Evidence status is hash-pinned and remains independent of this selection.</p></section>;
}
type TemporalMatrix = {
  schema_version: "national-business-temporal-claim-matrix-view@1.0.0";
  available: true;
  scope: "retained-source-classification-only";
  summary: {
    source_count: 30;
    source_defined_current_membership_sources: 22;
    non_active_directory_registration_reporting_sources: 7;
    annual_aggregate_sources: 1;
    broad_state_dc_source_defined_active: 11;
    broad_state_dc_total: 51;
    broad_state_dc_gaps: 40;
    verified_current_complete_jurisdictions: 0;
    verified_current_complete_gaps: 51;
    active_business_count: null;
    completeness_percentage: null;
  };
  provenance: {
    release_id: string;
    manifest_sha256: string;
    artifact_sha256: string;
    created_at: string;
    registry_release_id: string;
    registry_manifest_sha256: string;
    coverage_release_id: string;
    coverage_manifest_sha256: string;
  };
  claims: {
    network_requests: 0;
    current_pointer_written: false;
    production_enrollment: false;
    current_operations_verified: false;
    active_business_count: false;
    completeness_inferred: false;
  };
};
const percent = (value: number | null | undefined) =>
  value == null ? "Unmeasured" : `${value.toFixed(1)}%`;
const count = (value: number | null | undefined) =>
  value == null ? "Unmeasured" : value.toLocaleString();
const exactZipSourceMeasureValue = (cell: ExactZipCell): number | null => {
  switch (cell.status) {
    case "positive":
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
export function validTemporalMatrix(value: unknown): value is TemporalMatrix {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as TemporalMatrix,
    s = view.summary,
    p = view.provenance,
    c = view.claims;
  return (
    view.schema_version ===
      "national-business-temporal-claim-matrix-view@1.0.0" &&
    view.available === true &&
    view.scope === "retained-source-classification-only" &&
    !!s &&
    s.source_count === 30 &&
    s.source_defined_current_membership_sources === 22 &&
    s.non_active_directory_registration_reporting_sources === 7 &&
    s.annual_aggregate_sources === 1 &&
    s.broad_state_dc_source_defined_active === 11 &&
    s.broad_state_dc_total === 51 &&
    s.broad_state_dc_gaps === 40 &&
    s.verified_current_complete_jurisdictions === 0 &&
    s.verified_current_complete_gaps === 51 &&
    s.active_business_count === null &&
    s.completeness_percentage === null &&
    !!p &&
    /^national-business-temporal-claim-matrix-[a-f0-9]{64}$/.test(
      p.release_id,
    ) &&
    temporalHash(p.manifest_sha256) &&
    temporalHash(p.artifact_sha256) &&
    temporalHash(p.registry_manifest_sha256) &&
    temporalHash(p.coverage_manifest_sha256) &&
    !!c &&
    c.network_requests === 0 &&
    c.current_pointer_written === false &&
    c.production_enrollment === false &&
    c.current_operations_verified === false &&
    c.active_business_count === false &&
    c.completeness_inferred === false
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
            <dt>Source-defined current-membership cohorts</dt>
            <dd>{view.summary.source_defined_current_membership_sources}</dd>
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
            “Current membership” is the source’s classification only; it does
            not independently verify current operation. Source cohorts overlap
            and are not an active-business total.
          </p>
          <details>
            <summary>Exact temporal release provenance</summary>
            <p>
              Release: <code>{view.provenance.release_id}</code>
            </p>
            <p>
              Manifest SHA-256: <code>{view.provenance.manifest_sha256}</code>
            </p>
            <p>
              Artifact SHA-256: <code>{view.provenance.artifact_sha256}</code>
            </p>
            <p>
              Coverage release:{" "}
              <code>{view.provenance.coverage_release_id}</code> ·{" "}
              <code>{view.provenance.coverage_manifest_sha256}</code>
            </p>
            <p>
              Registry release:{" "}
              <code>{view.provenance.registry_release_id}</code> ·{" "}
              <code>{view.provenance.registry_manifest_sha256}</code>
            </p>
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
  assessment_as_of?: string; geography_manifest_sha256?: string; zcta_index_sha256?: string; county_geometry_inventory_sha256?: string;
  point_assignment_manifest_sha256?: string;
};
type NationalObjectiveReadiness = {
  schema_version: string; available: true; status: "not-accepted"; assessment_as_of: string;
  acceptance: { accepted: false; blockers: string[]; blocker_details: Array<{ code: string; count?: number }> };
  requirements_ledger: Array<{ requirement: string; status: string; evidence: string; current_gap_count?: number; jurisdiction_count?: number;
    profile_count?: number; registry_profile_count?: number; active_business_eligible_count?: number; stale_count?: number; unknown_or_contradictory_count?: number; verified_current_operation_count?: number;
    source_count?: number; policy_files_verified?: number; profile_policy_rows_verified?: number; authorization_granted?: false; acquisition_authorized?: false; export_authorized?: false;
    site_count?: number; matching_profile_count?: number; matching_profile_denominator?: number; combined_retained_site_evidence_count?: number; current_operation_verified_count?: number; zip_present_count?: number; zip_absent_count?: number; usps_unverified_count?: number; point_assigned_count?: number; point_assignment_ineligible_count?: number;
    postal_counts?: Record<string, number>; point_assignment_counts?: Record<string, number>; reported_state_conflict_count?: number; usps_unverified_profile_count?: number;
    usps_operational_assignment_verified?: false; usps_deliverability_verified?: false; same_code_zcta_is_membership?: false; entity_polygons_present?: false }>;
  broad_jurisdiction_gap_count: 40;
  claims: { all_business_completion_percent: null; active_business_count: null; current_operating_business_count: null; active_business_eligible_count: 0; current_operations_verified: false; all_business_completeness: false; public_export_authorized: false; production_execution: false; publication_performed: false; network_requests: 0 };
  lineage: { zip_entity_resolution: ObjectiveLineageEntry; zip_industry_matrix: ObjectiveLineageEntry; temporal_claim_matrix: ObjectiveLineageEntry; goal_completion_matrix: ObjectiveLineageEntry; broad_organization_projection: ObjectiveLineageEntry; lifecycle_eligibility: ObjectiveLineageEntry; business_entity_geography_relationship: ObjectiveLineageEntry; reporting_only_site_qualification: ObjectiveLineageEntry; business_entity_source_policy_provenance: ObjectiveLineageEntry };
};

export function validNationalObjectiveReadiness(value: unknown): value is NationalObjectiveReadiness {
  const exactKeys = (item: unknown, expected: string[]) => item && typeof item === "object"
    && !Array.isArray(item) && Object.keys(item).sort().join("|") === [...expected].sort().join("|");
  const sha = (item: unknown) => typeof item === "string" && /^[a-f0-9]{64}$/.test(item);
  if (!exactKeys(value, ["schema_version", "available", "status", "assessment_as_of", "acceptance", "requirements_ledger", "broad_jurisdiction_gap_count", "claims", "lineage"])) return false;
  const payload = value as NationalObjectiveReadiness;
  if (payload.schema_version !== "national-zip-objective-readiness-api@1.5.0" || payload.available !== true || payload.status !== "not-accepted" ||
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
      : ["requirement", "status", "evidence"];
    if (!exactKeys(row, expected)) return false;
    if (requirement === "broad-state-coverage" && (row.current_gap_count !== 40 || row.jurisdiction_count !== 51)) return false;
    if (requirement === "lifecycle-eligibility" && (row.profile_count !== 8011835 || row.registry_profile_count !== row.profile_count || row.active_business_eligible_count !== 0 || row.stale_count !== 24230 || row.unknown_or_contradictory_count !== 635899 || row.verified_current_operation_count !== 0)) return false;
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
  if (!exactKeys(lineage, ["zip_entity_resolution", "zip_industry_matrix", "temporal_claim_matrix", "goal_completion_matrix", "broad_organization_projection", "lifecycle_eligibility", "business_entity_geography_relationship", "reporting_only_site_qualification", "business_entity_source_policy_provenance"])) return false;
  for (const [key, item] of Object.entries(lineage) as [string, ObjectiveLineageEntry][]) {
    if (typeof item?.release_id !== "string" || !item.release_id) return false;
    if (key !== "goal_completion_matrix" && key !== "broad_organization_projection" && !sha(item.registration_sha256)) return false;
    if (key !== "goal_completion_matrix" && key !== "broad_organization_projection" && !sha(item.manifest_sha256)) return false;
  }
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
      "assessment_as_of", "profile_count", "registry_profile_count", "release_manifest_verified", "source_count", "source_status_value_count", "review_status_counts", "lifecycle_evidence_counts",
      "exception_counts", "current_operation_verified_count", "active_business_eligible_count"]) ||
      lifecycle.registration_path !== "config/datasets/business-entity-lifecycle-eligibility.json" ||
      lifecycle.manifest_path !== `data/business-entity-lifecycle-eligibility/releases/${lifecycle.release_id}/manifest.json` ||
      lifecycle.taxonomy_path !== "config/datasets/business-entity-lifecycle-eligibility-taxonomy.json" ||
      lifecycle.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" ||
      lifecycle.temporal_release_id !== "national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090" ||
      lifecycle.qualification_release_id !== "exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503" ||
      !exactKeys(lifecycle.review_status_counts, ["within-review-window", "stale", "unmeasured", "unmapped"]) ||
      lifecycle.review_status_counts["within-review-window"] !== 7987605 || lifecycle.review_status_counts.stale !== 24230 ||
      lifecycle.review_status_counts.unmeasured !== 0 || lifecycle.review_status_counts.unmapped !== 0 ||
      !exactKeys(lifecycle.lifecycle_evidence_counts, ["source-defined-current", "non-active-reporting", "unknown", "contradictory"]) ||
      lifecycle.lifecycle_evidence_counts["source-defined-current"] !== 5240481 || lifecycle.lifecycle_evidence_counts["non-active-reporting"] !== 2135455 ||
      lifecycle.lifecycle_evidence_counts.unknown !== 633232 || lifecycle.lifecycle_evidence_counts.contradictory !== 2667 ||
      !exactKeys(lifecycle.exception_counts, ["la_null_source_status", "ca_expiration_before_observation_profiles", "ny_retail_food_stale_non_active"]) ||
      lifecycle.exception_counts.la_null_source_status !== 633232 || lifecycle.exception_counts.ca_expiration_before_observation_profiles !== 2667 ||
      lifecycle.exception_counts.ny_retail_food_stale_non_active !== 24230) return false;
  if (lifecycle.release_id !== "business-entity-lifecycle-eligibility-f37556f8722c5a48c114a763ce1786cbe2e6d11b985b875602a97afb45671057" ||
      lifecycle.registration_sha256 !== "f7531c0a06b4259ae46f6887c69eb9d8d5f0135ae52f30237556c84e89a66035" ||
      lifecycle.manifest_sha256 !== "fe97a5b260a7c9c38c8884d668ba6f99b237ca4ec0f6885af587efd349f428ae" ||
      lifecycle.taxonomy_sha256 !== "7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc" ||
      lifecycle.artifact_inventory_sha256 !== "ef3c2a697f8504656d884b1dde88317d4ed6a04597d99d957e28795f2a417907" ||
      lifecycle.artifact_count !== 100 || lifecycle.artifact_record_count !== 8011835 || lifecycle.profile_count !== 8011835 || lifecycle.registry_profile_count !== lifecycle.profile_count || lifecycle.release_manifest_verified !== true ||
      lifecycle.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" ||
      lifecycle.temporal_artifact_sha256 !== "d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0" ||
      lifecycle.qualification_manifest_sha256 !== "771a0f27951569bc7f1a96d02b8b9f114b65b2a37fdb1db3fb98217c6ad50e3e" ||
      lifecycle.qualification_artifact_sha256 !== "958cb73f61dc27bf8bbbcb3f3e666917f8c885a59bf1470129ccadb5e2a862ed" ||
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
      sourcePolicy.release_id !== "business-entity-source-policy-provenance-c43ddd5a681702e77c1446a31bdd07264a6a206a5435947d353e0d7c3e3ed098" ||
      sourcePolicy.registration_sha256 !== "dea750ba0c597b4792189f321cdba2d6f73e69664fcb901587ad0d43302e603f" ||
      sourcePolicy.manifest_sha256 !== "4706f9cb6bfaf9ff11b488c8bb692172ec46e2ea85847c07571e1a0e7efbce54" ||
      sourcePolicy.artifact_sha256 !== "be3ae723b0728ff161e0764233bfae7888222fc8f0b1768bad70635d5a378534" ||
      sourcePolicy.source_count !== 15 || sourcePolicy.profile_count !== 8011835 || sourcePolicy.registry_release_id !== "national-business-registry-20260911-022652067Z-1ec656c3" ||
      sourcePolicy.registry_manifest_sha256 !== "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76" ||
      sourcePolicy.lifecycle_release_id !== lineage.lifecycle_eligibility.release_id || sourcePolicy.lifecycle_manifest_sha256 !== lineage.lifecycle_eligibility.manifest_sha256 ||
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
        {value.requirements_ledger.map((row) => <div key={row.requirement}><span>{row.requirement.replaceAll("-", " ")}</span><strong>{row.status}</strong>{row.requirement === "broad-state-coverage" && <small>{row.current_gap_count} broad jurisdiction gaps / {row.jurisdiction_count} jurisdictions</small>}{row.requirement === "entity-geography-relationship" && <small>{row.profile_count?.toLocaleString("en-US")} profiles / {row.registry_profile_count?.toLocaleString("en-US")} registry profiles; {row.point_assignment_counts?.["assigned-single-county"]?.toLocaleString("en-US")} deterministic county point assignments, {row.point_assignment_counts?.["missing-geocode"]?.toLocaleString("en-US")} missing geocode, {row.point_assignment_counts?.["unassignable-legacy-coordinate-crs-unproven"]?.toLocaleString("en-US")} CRS-unproven. Postal: {row.postal_counts?.["same-code-zcta-candidate"]?.toLocaleString("en-US")} same-code ZCTA candidates, {row.postal_counts?.["outside-zcta"]?.toLocaleString("en-US")} outside, {row.postal_counts?.["explicit-placeholder"]?.toLocaleString("en-US")} placeholder. USPS validity is unverified for {row.usps_unverified_profile_count?.toLocaleString("en-US")} profiles; ZCTA correspondence is not membership; no entity polygons.</small>}{row.requirement === "lifecycle-eligibility" && <small>{row.active_business_eligible_count?.toLocaleString("en-US")} eligible / {row.profile_count?.toLocaleString("en-US")} profiles (registry denominator {row.registry_profile_count?.toLocaleString("en-US")}) · {row.stale_count?.toLocaleString("en-US")} stale · {row.unknown_or_contradictory_count?.toLocaleString("en-US")} unknown/contradictory · {row.verified_current_operation_count?.toLocaleString("en-US")} independently verified operating</small>}{row.requirement === "reporting-only-site-qualification" && <small>{row.site_count?.toLocaleString("en-US")} reporting-only sites, separate from matching-profile denominator {row.matching_profile_denominator?.toLocaleString("en-US")}; combined retained site-evidence rows: {row.combined_retained_site_evidence_count?.toLocaleString("en-US")} (not a complete-business denominator). {row.zip_present_count?.toLocaleString("en-US")} have source ZIP5 and {row.zip_absent_count?.toLocaleString("en-US")} have no ZIP5 (27 missing, 145 placeholders). {row.point_assigned_count?.toLocaleString("en-US")} retained county point assignments; {row.point_assignment_ineligible_count?.toLocaleString("en-US")} Ohio rows are source-policy-ineligible. All {row.usps_unverified_count?.toLocaleString("en-US")} USPS validity unverified; 0 active-eligible/current-operation verified.</small>}{row.requirement === "business-entity-source-policy-provenance" && <small>All {row.source_count?.toLocaleString("en-US")} source policy files hash-verified across {row.profile_count?.toLocaleString("en-US")} retained profiles (including {row.profile_policy_rows_verified?.toLocaleString("en-US")} lifecycle policy matches). Integrity only; this does not grant acquisition, use, or export authority.</small>}</div>)}
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
          <h2>{industries ? "Industry Summary" : "State completion"}</h2>
        </div>
        <p>
          {industries
            ? "Follow each industry across the country and the selected state."
            : "Select a state to see completion and missing industry datasets beside the map."}
        </p>
      </div>
      <p className="scope-note">
        Overview uses the governed nationwide-required dataset denominator
        across all reporting industries and the broad-jurisdiction requirement.
        State completion = available expected dataset cells ÷ all expected cells
        for that state. Unknown cells remain in the denominator; measured zero,
        unknown, and not applicable are distinct. This is not all-business or
        GDP completeness.
      </p>
      {industries && <p className="industry-evidence-boundary"><strong>Industry status reports evidence actually retained.</strong> It does not require an all-business denominator, complete geocoding, or nationwide industry completeness. Missing and unmeasured evidence remains unknown rather than zero.</p>}
      {!industries && <NationalObjectiveReadinessCard value={objectiveReadiness} unavailable={objectiveReadinessError} />}
      <div className="workspace-filters">
        <label>
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
        </label>
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
      {national && (
        <div
          className="coverage-national-metrics"
          aria-label="National dataset expectations"
        >
          <article>
            <span>National dataset completion</span>
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
          <OperationalMaintenanceIntent/>
          <ExactZipIndustryNationalSummary />
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
        view?.available && (
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
      {!industries && view?.available && (
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
                onNavigate(industries ? "State Completion" : "Industry Summary")
              }
            >
              {industries ? "View state completion" : "View industry summary"}
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
      {!industries&&<CensusZctaResidualLayer state={state}/>}
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
] as const;
type ExactZipSource = (typeof EXACT_ZIP_SOURCES)[number];
type ExactZipZeroEvidenceSemantics = {
  absent_cell_status:
    | "measured-zero"
    | "outside-source-denominator"
    | "absent-from-retained-source-rows";
  exact_zip_denominator: boolean;
  explicit_zero_evidence_allowed: boolean;
  interpretation: string;
};
type ExactZipCell = {
  status:
    | "positive"
    | "measured-zero"
    | "outside-source-denominator"
    | "absent-from-retained-source-rows";
  count: number | null;
  measure: string;
  source_release_id: string;
  temporal_status: {
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
  schema_version: "national-exact-zip-industry-evidence-matrix@1.8.0";
  status: "present";
  row: null | {
    schema_version: "national-exact-zip-industry-evidence-matrix-row@1.8.0";
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
    schema_version: "exact-zip-industry-temporal-qualification-view@1.1.0";
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
    provenance: { release_id: string; manifest_sha256: string; artifact_sha256: string; bindings: Record<string, unknown> };
    claims: { current_operations_verified: false; active_business_count: null; all_business_denominator: null; all_business_completion_percent: null; additive: false; network_requests: 0; acquisition_performed: false; current_pointer_written: false; production_enrollment: false };
  };
  source_bytes_read: number;
  full_matrix_replay_performed: false;
  claims: {
    authoritative_current_usps_zip_denominator: null;
    usps_validity_classified: false;
    zip4_joined: false;
    additive_cross_industry_total: false;
    current_operation_verified: false;
    all_business_completeness: false;
    network_requests: 0;
    acquisition_performed: false;
    current_pointer_written: false;
    production_enrollment: false;
    production_execution: false;
  };
};
const exactObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exactZipDisposition=(cell_status:string,semantic:string,review:string)=>{const lifecycle_status=review==="unmapped"&&semantic==="unmapped"?"unmapped":review==="unmeasured"?"unmeasured":review==="stale"?"stale":semantic==="source-defined-current"?(cell_status==="positive"?"source-defined-current-positive-within-review-window":"source-defined-current-without-positive-evidence"):(cell_status==="positive"?"non-active-reporting-positive":"non-active-reporting-without-positive-evidence");return{cell_status,lifecycle_status,label:`${cell_status.replaceAll("-"," ")} · ${lifecycle_status.replaceAll("-"," ")}`,current_operations_verified:false}};
export function validExactZipEvidence(
  value: unknown,
  zip: string,
): value is ExactZipEvidence {
  if (
    !exactKeys(value, [
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
    ])
  )
    return false;
  const v = value as ExactZipEvidence,
    childcarePin = childcareRegistration.retained_release,
    nativePin = zipSourceStatusRegistration.retained_release;
  const tq=v.temporal_qualification;
  if(!exactKeys(tq,["schema_version","zip5","assessment_as_of","rows","summary","provenance","claims"])||tq.schema_version!=="exact-zip-industry-temporal-qualification-view@1.1.0"||tq.zip5!==zip||tq.assessment_as_of!=="2026-10-02T16:30:00.000Z"||!Array.isArray(tq.rows)||tq.rows.length!==39||!exactKeys(tq.provenance,["release_id","manifest_sha256","artifact_sha256","bindings"])||tq.provenance.release_id!=="exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503"||tq.provenance.manifest_sha256!=="771a0f27951569bc7f1a96d02b8b9f114b65b2a37fdb1db3fb98217c6ad50e3e"||!sha(tq.provenance.artifact_sha256)||!exactKeys(tq.claims,["current_operations_verified","active_business_count","all_business_denominator","all_business_completion_percent","additive","network_requests","acquisition_performed","current_pointer_written","production_enrollment"])||tq.claims.current_operations_verified!==false||tq.claims.active_business_count!==null||tq.claims.all_business_denominator!==null||tq.claims.all_business_completion_percent!==null||tq.claims.additive!==false||tq.claims.network_requests!==0||tq.claims.acquisition_performed!==false||tq.claims.current_pointer_written!==false||tq.claims.production_enrollment!==false)return false;
  const tRows=tq.rows;
  if(tRows.some((r,i)=>!exactKeys(r,["dimension_id","source_key","source_release_id","semantic_class","source_status_term","source_reference_at","assessment_as_of","review_qualification","review_due_at","evidence_disposition","current_operations_verified"])||r.dimension_id!==EXACT_ZIP_SOURCES[i]||!(["source-defined-current","non-active-reporting","unmapped"].includes(r.semantic_class))||!(["within-review-window","stale","unmeasured","unmapped"].includes(r.review_qualification))||r.assessment_as_of!==tq.assessment_as_of||r.current_operations_verified!==false||(r.semantic_class==="unmapped")!==(r.source_key===null)||(r.semantic_class==="unmapped")!==(r.review_qualification==="unmapped")||!sameClosed(r.evidence_disposition,exactZipDisposition(v.row?.cells?.[r.dimension_id]?.status??"unavailable",r.semantic_class,r.review_qualification))))return false;
  const qualificationCounts=Object.fromEntries(["within-review-window","stale","unmeasured","unmapped"].map(status=>[status,tRows.filter(row=>row.review_qualification===status).length])), semanticCounts=Object.fromEntries(["source-defined-current","non-active-reporting","unmapped"].map(status=>[status,tRows.filter(row=>row.semantic_class===status).length])), binds=tq.provenance.bindings;
  if(!sameClosed(qualificationCounts,{"within-review-window":25,stale:1,unmeasured:4,unmapped:9})||!sameClosed(semanticCounts,{"source-defined-current":22,"non-active-reporting":8,unmapped:9})||tq.summary?.qualification_cell_total!==48194*39||tq.summary?.semantic_cell_total!==48194*39||tq.summary?.zip_cohort_members!==48194||!exactKeys(binds,["matrix","temporal","qualification"])||!exactKeys(binds.matrix,["release_id","manifest_sha256","artifact_inventory_sha256","registration_sha256"])||binds.matrix.release_id!=="national-exact-zip-industry-evidence-matrix-ada7e938a0bfa31a51b4cc165b0a3e357f025704eff853fb88a4ccadf2c9ceb6"||binds.matrix.manifest_sha256!=="743d1bad94a7e8b122969cbb0cb9618e20b820b4b1b5afb46285bd70458d9ffe"||!sha(binds.matrix.artifact_inventory_sha256)||!sha(binds.matrix.registration_sha256)||!exactKeys(binds.temporal,["release_id","manifest_sha256","artifact_sha256","registration_sha256"])||binds.temporal.release_id!=="national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090"||binds.temporal.manifest_sha256!=="342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05"||!sha(binds.temporal.artifact_sha256)||!sha(binds.temporal.registration_sha256)||!exactKeys(binds.qualification,["release_id","manifest_sha256","projection_sha256","inventory_sha256","registration_sha256","assessment_as_of"])||binds.qualification.release_id!=="zip-active-evidence-76630f473281f971dc8e588ad7cf918ef649ae6c3597f995118b1238223969d9"||binds.qualification.manifest_sha256!=="9872e4b46fe01fc529ac189cda20a5a8a28d0a39904c8742b931934a5ce0b493"||binds.qualification.projection_sha256!=="bb4314e0d76a6d0507093bd00992dd29a4caa28e34e43d1d2b5e1b9ea58ee4c8"||binds.qualification.inventory_sha256!=="9f00f1a86252dace3a209bbe628a104046947ab8c0097d3eb75a97c12ac2b5e5"||binds.qualification.assessment_as_of!==tq.assessment_as_of)return false;
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
    v.schema_version !== "national-exact-zip-industry-evidence-matrix@1.8.0" ||
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
    "authoritative_current_usps_zip_denominator",
    "usps_validity_classified",
    "zip4_joined",
    "additive_cross_industry_total",
    "current_operation_verified",
    "all_business_completeness",
    "network_requests",
    "acquisition_performed",
    "current_pointer_written",
    "production_enrollment",
    "production_execution",
  ];
  if (
    !exactKeys(v.claims, claimKeys) ||
    v.claims.authoritative_current_usps_zip_denominator !== null ||
    v.claims.network_requests !== 0 ||
    claimKeys
      .filter(
        (k) =>
          ![
            "authoritative_current_usps_zip_denominator",
            "network_requests",
          ].includes(k),
      )
      .some(
        (k) => (v.claims as unknown as Record<string, unknown>)[k] !== false,
      )
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
      "national-exact-zip-industry-evidence-matrix-row@1.8.0" ||
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
    } as Record<string, string>
  )[source] ??
  source.replaceAll("_", " ");
type ExactZipIndustrySummary={schema_version:"national-exact-zip-industry-summary-view@1.8.0";available:true;release_id:string;manifest_sha256:string;created_at:string;zip5_rows:number;source_dimensions:number;industry_cells:number;status_counts:Record<string,number>;temporal_status_counts:{"source-referenced-current-operation-unverified":number;"source-reference-unresolved":number};temporal_qualification:{release_id:string;manifest_sha256:string;assessment_as_of:string;dimension_counts:{"within-review-window":number;stale:number;unmeasured:number;unmapped:number};semantic_dimension_counts:{"source-defined-current":number;"non-active-reporting":number;unmapped:number}};omitted_industries_status:"unavailable-not-materialized";coverage_gaps:{out_of_cohort_source_records:number;out_of_cohort_zip_count:number;source_quality_gap_records:number;address_gap_dimensions:number;address_rows_without_eligible_zip5:number;meaning:string};geography_cohort:{same_code_census_zcta:number;source_contributed_without_same_code_zcta:number;denominator_only_without_same_code_zcta:number;explicit_placeholder:number;without_same_code_zcta_total:number;cohort_release_id:string;cohort_manifest_sha256:string;created_at:string};entity_resolution:{evidence_zip_count:number;no_decision_zip_count:number;evidence_zip_percent:number;no_decision_zip_percent:number;site_alias_groups:number;establishment_alias_groups:number;unapplied_review_candidates:number;release_id:string;manifest_sha256:string;created_at:string;benchmark_gate_passed:false;entity_resolution_applied:false};dimensions:Array<{id:string;status_counts:Record<string,number>;positive_zip_percent:number;measured_status_percent:number;temporal_qualification:{source_key:string|null;source_release_id:string|null;review_qualification:"within-review-window"|"stale"|"unmeasured"|"unmapped";semantic_class:"source-defined-current"|"non-active-reporting"|"unmapped";source_reference_at:string|null;review_due_at:string|null;source_status_term:string|null;assessment_as_of:string}}>;verification_scope:string;claims:{authoritative_current_usps_zip_denominator:null;current_operation_verified:false;all_business_completeness:false;additive_cross_industry_total:false;non_zcta_means_invalid_zip:false;omitted_industries_measured:false;network_requests:0}};
function ExactZipIndustryNationalSummary(){const[view,setView]=useState<ExactZipIndustrySummary|null>(null),[failed,setFailed]=useState(false);useEffect(()=>{const controller=new AbortController();void runnerJson<ExactZipIndustrySummary>('/api/business-map/exact-zip-industry-summary',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setView(value)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort()},[]);const download=()=>{if(!view)return;const url=URL.createObjectURL(new Blob([`${JSON.stringify(view,null,2)}\n`],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`cotive-national-zip-industry-status-${view.manifest_sha256.slice(0,12)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0)};if(failed)return <p role="alert">National exact-ZIP industry summary is unavailable; no coverage percentage was inferred.</p>;if(!view)return <p role="status">Loading national exact-ZIP industry summary…</p>;return <section className="supporting-evidence" aria-label="National exact ZIP industry evidence summary"><h4>National exact-ZIP evidence matrix</h4><p><strong>{count(view.zip5_rows)}</strong> retained ZIP5 keys × <strong>{view.source_dimensions}</strong> source dimensions = <strong>{count(view.industry_cells)}</strong> evidence cells.</p><button type="button" onClick={download}>Download governed status JSON</button><p><strong>{count(view.geography_cohort.same_code_census_zcta)}</strong> keys have a same-code Census ZCTA polygon. <strong>{count(view.geography_cohort.source_contributed_without_same_code_zcta)}</strong> source-contributed keys and <strong>{count(view.geography_cohort.denominator_only_without_same_code_zcta)}</strong> denominator-only keys do not; one additional key is the explicit `00000` placeholder. Non-ZCTA status does not mean an invalid ZIP.</p><p>Positive: {count(view.status_counts.positive)} · measured zero: {count(view.status_counts['measured-zero'])} · outside source denominator: {count(view.status_counts['outside-source-denominator'])} · absent from retained source rows: {count(view.status_counts['absent-from-retained-source-rows'])}.</p><p><strong>Review qualification:</strong> {count(view.temporal_qualification.dimension_counts['within-review-window'])} dimensions are within review window; {count(view.temporal_qualification.dimension_counts.stale)} is stale; {count(view.temporal_qualification.dimension_counts.unmeasured)} are unmeasured; {count(view.temporal_qualification.dimension_counts.unmapped)} are unmapped. Assessed {view.temporal_qualification.assessment_as_of}. No qualification verifies current operation.</p><p><strong>Publisher status meaning:</strong> {count(view.temporal_qualification.semantic_dimension_counts['source-defined-current'])} dimensions use a publisher-defined current status; {count(view.temporal_qualification.semantic_dimension_counts['non-active-reporting'])} are non-active reporting; {count(view.temporal_qualification.semantic_dimension_counts.unmapped)} are unmapped. Publisher-defined current still does not verify general business operation.</p><p><strong>Entity-resolution evidence:</strong> {count(view.entity_resolution.evidence_zip_count)} ZIPs have retained candidate evidence ({view.entity_resolution.evidence_zip_percent.toFixed(1)}%); {count(view.entity_resolution.no_decision_zip_count)} ZIPs have no resolution decision ({view.entity_resolution.no_decision_zip_percent.toFixed(1)}%). Candidate groups are not applied business merges; the benchmark gate has not passed.</p><p><strong>Source quality gaps:</strong> {count(view.coverage_gaps.out_of_cohort_source_records)} retained records report ZIPs outside the cohort; {count(view.coverage_gaps.source_quality_gap_records)} source-quality gap groups remain; {count(view.coverage_gaps.address_rows_without_eligible_zip5)} address rows lack an eligible ZIP5 across {count(view.coverage_gaps.address_gap_dimensions)} source dimensions. These are retained source-row quality and assignment gaps, not missing-business counts.</p><p><strong>Scope boundary:</strong> Industries outside these 39 dimensions are unavailable—not materialized, not measured zero, and not included in either percentage.</p><details><summary>Governed release provenance</summary><dl><dt>Matrix release</dt><dd><code>{view.release_id}</code><small>Built {view.created_at} · manifest SHA-256 {view.manifest_sha256}</small></dd><dt>Temporal qualification</dt><dd><code>{view.temporal_qualification.release_id}</code><small>Assessed {view.temporal_qualification.assessment_as_of} · manifest SHA-256 {view.temporal_qualification.manifest_sha256}</small></dd><dt>Geography cohort</dt><dd><code>{view.geography_cohort.cohort_release_id}</code><small>Built {view.geography_cohort.created_at} · manifest SHA-256 {view.geography_cohort.cohort_manifest_sha256}</small></dd><dt>Resolution evidence</dt><dd><code>{view.entity_resolution.release_id}</code><small>Built {view.entity_resolution.created_at} · manifest SHA-256 {view.entity_resolution.manifest_sha256}</small></dd></dl></details><details><summary>All 39 source dimensions</summary><div className="representation-table" role="region" aria-label="National ZIP source dimension status" tabIndex={0}><table><thead><tr><th scope="col">Source dimension / retained source release</th><th scope="col">ZIPs with positive evidence</th><th scope="col">ZIPs with measured status</th><th scope="col">Review qualification / publisher meaning</th><th scope="col">Absent / outside denominator</th></tr></thead><tbody>{view.dimensions.map(row=><tr key={row.id}><th scope="row">{sourceLabel(row.id)}<small>{row.temporal_qualification.source_key??'No temporal source mapping'} · {row.temporal_qualification.source_release_id??'No retained source release mapped'}</small></th><td>{count(row.status_counts.positive)} · {row.positive_zip_percent.toFixed(1)}%</td><td>{count(row.status_counts.positive+row.status_counts['measured-zero'])} · {row.measured_status_percent.toFixed(1)}%</td><td>{row.temporal_qualification.review_qualification.replaceAll('-', ' ')}<small>{row.temporal_qualification.semantic_class.replaceAll('-', ' ')} · {row.temporal_qualification.source_status_term??'No publisher status meaning mapped'} · reference {row.temporal_qualification.source_reference_at??'unresolved'} · due {row.temporal_qualification.review_due_at??'unmeasured'}</small></td><td>{count(row.status_counts['absent-from-retained-source-rows'])} absent · {count(row.status_counts['outside-source-denominator'])} outside</td></tr>)}</tbody></table></div></details><p className="operations-note">Percentages use the retained 48,194-key evidence cohort, not an authoritative current USPS denominator or all-business completeness. Source dimensions overlap and are not additive. Current operation is not independently verified. {view.verification_scope}.</p></section>}
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
        Enter a ZIP to inspect the thirty-nine retained source projections.
      </p>
    );
  if (!view)
    return (
      <p role={failure ? "alert" : "status"}>
        {failure
          ? "Exact thirty-nine-source ZIP matrix evidence is unavailable or malformed; no cell was interpreted."
          : `Loading thirty-nine-source matrix evidence for ZIP ${zip}…`}
      </p>
    );
  if (!view.row)
    return (
      <section role="status">
        <p>
          ZIP {zip} is outside the retained evidence cohort. This does not
          establish an invalid USPS ZIP or zero business activity.
        </p>
        {view.out_of_cohort_source_zip_gaps.length > 0 && (
          <>
            <p>
              Retained source ZIP evidence is preserved as out-of-cohort gaps:
            </p>
            <ul>
              {view.out_of_cohort_source_zip_gaps.map((g) => (
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
        {view.source_quality_gaps.length > 0 && (
          <>
            <p>
              Separate retained source ZIP quality gaps are not keyed to this
              out-of-cohort ZIP:
            </p>
            <ul>
              {view.source_quality_gaps.map((g, index) => (
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
        {view.source_address_row_gaps.length > 0 && (
          <details>
            <summary>
              Separate source-address rows without eligible ZIP5 (
              {view.source_address_row_gaps.length} grouped gaps)
            </summary>
            <ul>
              {view.source_address_row_gaps.map((g, index) => (
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
      <summary>Detailed thirty-nine-source ZIP matrix and provenance</summary>
      <section aria-label={`Exact ZIP ${zip} industry source matrix`}>
        <h4>Thirty-nine-source exact-ZIP matrix</h4>
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
              {EXACT_ZIP_SOURCES.map((source) => {
                const cell = view.row!.cells[source],
                  metadata = view.source_metadata[source],
                  qualification=view.temporal_qualification.rows.find(row=>row.dimension_id===source)!,
                  measureValue = exactZipSourceMeasureValue(cell);
                return (
                  <tr key={source}>
                    <th scope="row">{sourceLabel(source)}</th>
                    <td>
                      {cell.status === "measured-zero"
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
                      {cell.temporal_status.source_reference_date ??
                        "Unresolved"}
                      <small>
                        {cell.temporal_status.status.replaceAll("-", " ")} ·
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
        {view.source_quality_gaps.length > 0 && (
          <details>
            <summary>
              Childcare source ZIP quality gaps (
              {view.source_quality_gaps.length})
            </summary>
            <ul>
              {view.source_quality_gaps.map((g, index) => (
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
        {view.source_address_row_gaps.length > 0 && (
          <details>
            <summary>
              Separate broad-organization address-row ZIP gaps (
              {view.source_address_row_gaps.length} grouped gaps)
            </summary>
            <ul>
              {view.source_address_row_gaps.map((g, index) => (
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
        aria-label="Thirty-nine source cells with demographic context"
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
            {EXACT_ZIP_SOURCES.map((source) => {
              const cell = view.industry_evidence.row!.cells[source],
                measureValue = exactZipSourceMeasureValue(cell),
                metadata = view.industry_evidence.source_metadata[source],
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
                    {cell.temporal_status.source_reference_date ?? "Unresolved"}
                    <small>
                      {cell.temporal_status.status.replaceAll("-", " ")}
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
