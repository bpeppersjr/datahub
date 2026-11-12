"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type Industry = { id: string; label: string };
type CaReadiness = {
  schema_version: "ca-childcare-status-readiness-view@1.4.0";
  state: "CA";
  industry: "childcare";
  status: "verified-aggregate-publisher-readiness-migration-hold";
  publisher_rows: number;
  publisher_status_counts: Record<
    "CLOSED" | "INACTIVE" | "LICENSED" | "ON PROBATION" | "PENDING",
    number
  >;
  publisher_open_status_candidate_rows: number;
  temporal: {
    catalog_last_updated: "2026-11-11";
    publisher_file_date: "2025-05-25";
    preflight_observed_at: string;
    posture: "arcgis-current-distribution-legacy-ckan-file-date-conflict-automatic-refresh-hold";
    current_operation_verified: false;
  };
  migration: {current_distribution:"ArcGIS GeoService";arcgis_item_id:string;legacy_backend_still_listed:true;existing_app_backend:"legacy-ckan-datastore";arcgis_all_program_rows:number;arcgis_childcare_rows:number;arcgis_childcare_rows_with_zip:number;arcgis_family_child_care_homes_excluded:true;item_aggregate_scope_conflict:true;raw_status_code_meanings_verified:false;automatic_refresh_authorized:false;next_action:string};
  family_home_source: {catalog_resource_id:string;catalog_link_delivery:"legacy-ckan-resource";backend_last_modified:string;publisher_file_date:"2025-05-25";arcgis_view_includes_family_homes:false;current_provider_row_source_identified:false;interpretation:string};
  source: {manifests:Record<"catalog"|"schema"|"status"|"geography"|"arcgis",{path:string;sha256:string}>};
  claims: {
    provider_rows_acquired: 0;
    current_operations_verified: false;
    statewide_completeness: null;
    business_count: null;
  };
  semantics: string;
};
type AcsReadiness = {
  schema_version: "acs-zcta-demographic-network-readiness-view@1.0.0";
  status: "reviewed-plan-awaiting-explicit-network-authorization";
  source: {
    publisher: "United States Census Bureau";
    vintage: 2024;
    period: "2020-2024";
    product: "ACS 5-Year Detailed Tables";
    public_release_date: "2026-01-29";
    geography: "zip code tabulation area";
  };
  request_budget: {
    metadata_requests: 4;
    data_requests: 4;
    maximum_total_requests: 8;
    maximum_metadata_response_bytes: 5000000;
    maximum_group_response_bytes: 536870912;
    maximum_total_source_bytes: 1073741824;
    minimum_free_disk_bytes: 2147483648;
    maximum_parallel_requests: 1;
  };
  tables: ["B01001", "B02001", "B03002", "B04006"];
  prerequisites: {
    plan_verified: true;
    network_acquisition_authorized: false;
    trusted_official_metadata_release_available: false;
    approved_structured_authorization_receipt_available: false;
    immutable_governed_acs_source_release_available: false;
  };
  blockers: string[];
  geography: {
    governed_zctas: 33791;
    private_unique_or_po_box_zip_without_zcta: "not-applicable-no-census-zcta-demographic-estimate";
    non_zcta_space_blocks_map: false;
  };
  claims: {
    network_requests: 0;
    acquisition_performed: false;
    current_pointer_written: false;
    production_enrollment: false;
    demographic_percentages: false;
    demographic_gdp_allocation: false;
  };
  provenance: { plan_sha256: string; admission_config_sha256: string };
};
type View = {
  industries: Industry[];
  maintainedIndustries: string[];
  semantics: string;
  revision: number;
};
type MaintenanceSchedule = {
  id: string;
  industries: string[];
  states: string[];
  intervalHours: number;
  enabled: boolean;
  planHash: string;
  resources: string[];
  createdAt: string;
  status: "READY" | "DISABLED" | "RUNNING" | "PAUSED";
  nextDueAt: string | null;
  reason: string | null;
  lastOccurrence: null | {
    operationId: string;
    status: string;
    dueAt: string;
    createdAt?: string;
    finishedAt?: string;
  };
};
type MaintenanceExecutionStatus = {
  schema_version: "industry-maintenance-execution-status@1.0.0";
  generated_at: string;
  maintenance_revision: number;
  industries: Array<{
    id: string;
    selected_intent: boolean;
    configured_sources: { total: number; national: number; state: number; manual_only: number };
    automatic_refresh: {
      authorized: number;
      blocked: number;
      reason_counts: Record<"AUTOMATIC_REFRESH_NOT_REVIEWED" | "GOVERNED_SOURCE_HOLD" | "MANUAL_SELECTION_REQUIRED", number>;
    };
    schedule: {
      configured: number;
      enabled: number;
      running: number;
      paused: number;
      next_due_at: string | null;
      last_occurrence_status: string | null;
    };
    latest_collection: null | { operation_id: string; status: string; created_at: string; finished_at: string | null };
    prerequisites: { declared: number; present: number; missing: number; status: "none" | "missing" | "present-unvalidated" };
    effective_status: "not-selected" | "selected-running" | "selected-scheduled-enabled" | "selected-scheduled-paused" | "selected-scheduled-disabled" | "selected-blocked-automatic-refresh" | "selected-blocked-prerequisite" | "selected-manual-only" | "selected-intent-only";
  }>;
  claims: {
    selection_authorizes_acquisition: false;
    status_starts_work: false;
    prerequisite_contents_validated: false;
    latest_success_implies_current_evidence: false;
    business_completeness: null;
  };
};
type Backlog = {
  schema_version: "state-access-maintenance-backlog@2.19.0";
  report_sha256: string;
  backlog_sha256: string;
  maintenance_revision: number;
  maintained_industries: string[];
  total_attention_cells: number;
  batch_limit: 10;
  next_batch: Array<{
    state: string;
    industry: string;
    action_kind: "source-discovery-review" | "temporal-source-review";
    access_status: string;
    temporal_status: string;
    source_keys: string[];
    issue_codes: string[];
    source_discovery: null | {
      discovery_id: string;
      status:
        | "official-search-identified-bulk-interface-unverified"
        | "official-monthly-table-metadata-validated-acquisition-disabled"
        | "official-monthly-pdf-identified-offline-parser-required"
        | "official-public-domain-api-metadata-validated-acquisition-disabled"
        | "official-workbook-metadata-validated-acquisition-disabled"
        | "official-csv-export-contract-metadata-validated-acquisition-disabled"
        | "official-search-identified-automation-prohibited-bulk-interface-unverified"
        | "official-dual-workbook-metadata-identified-acquisition-disabled"
        | "official-manual-export-identified-automated-bulk-contract-unverified"
        | "official-current-provider-tables-export-format-unverified-acquisition-disabled"
        | "official-search-and-data-request-path-identified-acquisition-disabled"
        | "official-dynamic-download-control-identified-contract-unverified"
        | "official-statewide-center-finder-identified-bulk-contract-unverified"
        | "official-current-and-history-downloads-identified-contract-unverified"
        | "official-open-provider-search-identified-bulk-contract-unverified"
        | "official-regulated-provider-search-and-monthly-list-path-identified-acquisition-disabled"
        | "official-current-facilities-report-identified-contract-unverified"
        | "official-daily-licensing-lookup-csv-export-identified-acquisition-disabled"
        | "official-dated-licensed-and-exempt-provider-listing-identified-contract-unverified"
        | "official-licensed-facility-search-and-records-request-path-identified-acquisition-disabled"
        | "official-licensed-provider-dashboard-identified-bulk-contract-unverified"
        | "official-facility-search-and-data-request-path-identified-acquisition-disabled"
        | "official-licensed-and-self-declared-search-identified-bulk-contract-unverified"
        | "official-weekly-zip-organized-roster-identified-acquisition-disabled"
        | "official-child-care-search-identified-bulk-contract-unverified"
        | "official-dated-licensed-center-roster-and-open-data-api-identified-acquisition-disabled"
        | "official-provider-database-backed-finder-identified-bulk-contract-unverified"
        | "official-licensure-search-identified-jurisdiction-boundary-unresolved"
        | "official-daily-program-api-identified-nyc-center-boundary-unresolved"
        | "official-daily-email-gated-csv-export-identified-acquisition-disabled"
        | "official-licensed-provider-locator-identified-bulk-contract-unverified"
        | "official-daily-child-care-safety-portal-identified-bulk-contract-unverified"
        | "official-monthly-open-certified-program-odata-identified-acquisition-disabled"
        | "official-rises-statewide-licensed-program-search-identified-bulk-contract-unverified"
        | "official-manual-excel-export-identified-automated-bulk-contract-unverified"
        | "official-mixed-cohort-provider-search-identified-bulk-contract-unverified"
        | "official-center-only-arcgis-api-and-retained-release-validated"
        | "official-regulated-provider-search-identified-bulk-contract-unverified"
        | "official-current-regulated-program-report-and-retained-center-release-validated"
        | "official-annual-quality-workbooks-identified-use-permission-unresolved"
        | "official-socrata-center-api-and-retained-release-validated"
        | "official-active-center-and-school-age-socrata-api-metadata-validated-acquisition-disabled"
        | "official-licensed-group-arcgis-api-metadata-validated-use-decision-pending"
        | "official-wvpath-provider-search-identified-bulk-contract-unverified"
        | "official-monthly-socrata-api-metadata-validated-acquisition-disabled"
        | "official-active-childcare-rosters-identified-export-contract-unverified"
        | "official-datastore-preflights-validated-reporting-not-enrolled"
        | "official-source-migration-preflights-validated-reporting-not-enrolled"
        | "official-near-real-time-provider-search-and-data-sharing-path-identified-bulk-contract-unverified"
        | "official-monthly-active-provider-list-download-identified-acquisition-disabled";
      official_source_count: number;
      supported_bulk_export_verified: boolean;
      supported_api_verified: boolean;
      portal_automation_authorized: false;
      record_acquisition_authorized: false;
      next_action: string;
    };
    refresh_posture: {
      applicable_collection_sources: Array<{
        source_id: string;
        scope: "national" | "state";
        manual_selection_required: boolean;
        automatic_refresh_authorized: boolean;
        automatic_refresh_reason_code: string;
      }>;
      manual_app_plan_available: boolean;
      automatic_refresh_authorized: boolean;
      newer_publisher_release_guaranteed: false;
      gap_resolution_guaranteed: false;
    };
  }>;
  remaining_after_batch: number;
  claims: {
    acquisition_authorized: false;
    dispatch_performed: false;
    production_change: false;
    business_completeness: null;
  };
};
const industryIds = [
  "childcare",
  "construction",
  "financial-services",
  "health-care",
  "local-business-licenses",
  "retail-consumer",
  "sales-tax-outlets",
  "tax-exempt-organizations",
  "transportation",
] as const;
const states = [
  "AK",
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
] as const;
const accessStatuses = [
  "direct-state-publisher",
  "local-publisher-substate-evidence",
  "national-dataset-state-evidence",
  "restricted-query-sample-evidence",
  "unsupported-evidence-not-measured",
  "unsupported-missing",
] as const;
const temporalStatuses = [
  "missing-source-reference",
  "no-positive-count-evidence",
  "review-due",
  "within-review-window",
] as const;
const reportSha =
  "7781f4392be6348538bec2c3555afe5dcfc7b90bf0de0f476f3c64c1f6234246";
type IndustryEvidence = {
  schema_version: "state-access-industry-summary@1.5.0";
  report_sha256: string;
  assessed_at: string;
  jurisdictions: 51;
  industry_cells: 459;
  industries: Array<{
    id: string;
    jurisdictions: 51;
    jurisdictions_with_retained_access_evidence: number;
    retained_access_evidence_percent: number;
    access_status_counts: Record<string, number>;
    temporal_status_counts: Record<string, number>;
    states: Array<{
      state: string;
      access_status: string;
      temporal_status: string;
      source_keys: string[];
      sources: Array<{
        source_key: string;
        source_release_id: string | null;
        source_reference_at: string | null;
        review_due_date: string | null;
        evidence_scope: string;
        publisher_currency_basis: string | null;
        retained_observed_at: string | null;
        evidence_type: string;
        temporal_status: (typeof temporalStatuses)[number];
        record_count: number | null;
        count_unit: string | null;
        issuing_locality: string | null;
      }>;
    }>;
  }>;
  claims: {
    active_business_count: null;
    nationwide_industry_completeness: null;
    complete_geocodes: false;
    maintenance_selection_affects_evidence: false;
  };
};
type IndustryCensusStatus = {
  schema_version: "operational-industry-census-status@1.1.0";
  source: { dataset_id: "census-zbp-baseline"; release_id: string; reference_year: 2023; publisher_release_status:"latest-publisher-reference-year"; publisher_assessment_id:string; publisher_assessment_observed_at:string; publisher_assessment_sha256:string; next_reference_year:2024; next_release_status:"no-planned-release-date-publisher-evaluating-alternative-approach"; pointer_sha256: string; manifest_sha256: string; naics_catalog_sha256: string };
  industries: Array<{ id:string; aggregate_status:"retained-annual-employer-establishment-aggregate"|"not-comparable-to-single-naics"; naics_code:string|null; naics_label:string|null; published_zip_rows:number|null; published_establishments:number|null; reason:string|null }>;
  claims: { annual_aggregate_context_only:true; named_businesses:false; current_operations_verified:false; business_completeness:null; industry_completeness:null; state_access_gap_resolution_performed:false; zip5_is_zcta:false; zip4_joined:false; network_requests:0; runtime_writes:0 };
};
const exact = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a, Object.keys(a as object).sort()) ===
  JSON.stringify(b, Object.keys(b as object).sort());
const validDate = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const acsBlockers = [
  "missing-trusted-retained-official-acs-group-metadata",
  "missing-approved-structured-authorization-receipt",
  "missing-immutable-governed-acs-source-release",
  "unresolved-official-sentinel-and-annotation-semantics",
  "network-acquisition-plan-awaiting-explicit-authorization",
];

export function validAcsReadiness(input: unknown): input is AcsReadiness {
  if (
    !exact(input, [
      "schema_version", "status", "source", "request_budget", "tables",
      "prerequisites", "blockers", "geography", "claims", "provenance",
    ])
  ) return false;
  const value = input as AcsReadiness;
  return (
    value.schema_version === "acs-zcta-demographic-network-readiness-view@1.0.0" &&
    value.status === "reviewed-plan-awaiting-explicit-network-authorization" &&
    exact(value.source, ["publisher", "vintage", "period", "product", "public_release_date", "geography"]) &&
    value.source.publisher === "United States Census Bureau" &&
    value.source.vintage === 2024 && value.source.period === "2020-2024" &&
    value.source.product === "ACS 5-Year Detailed Tables" &&
    value.source.public_release_date === "2026-01-29" &&
    value.source.geography === "zip code tabulation area" &&
    exact(value.request_budget, ["metadata_requests", "data_requests", "maximum_total_requests", "maximum_metadata_response_bytes", "maximum_group_response_bytes", "maximum_total_source_bytes", "minimum_free_disk_bytes", "maximum_parallel_requests"]) &&
    same(value.request_budget, { metadata_requests: 4, data_requests: 4, maximum_total_requests: 8, maximum_metadata_response_bytes: 5000000, maximum_group_response_bytes: 536870912, maximum_total_source_bytes: 1073741824, minimum_free_disk_bytes: 2147483648, maximum_parallel_requests: 1 }) &&
    JSON.stringify(value.tables) === JSON.stringify(["B01001", "B02001", "B03002", "B04006"]) &&
    exact(value.prerequisites, ["plan_verified", "network_acquisition_authorized", "trusted_official_metadata_release_available", "approved_structured_authorization_receipt_available", "immutable_governed_acs_source_release_available"]) &&
    same(value.prerequisites, { plan_verified: true, network_acquisition_authorized: false, trusted_official_metadata_release_available: false, approved_structured_authorization_receipt_available: false, immutable_governed_acs_source_release_available: false }) &&
    JSON.stringify(value.blockers) === JSON.stringify(acsBlockers) &&
    exact(value.geography, ["governed_zctas", "private_unique_or_po_box_zip_without_zcta", "non_zcta_space_blocks_map"]) &&
    same(value.geography, { governed_zctas: 33791, private_unique_or_po_box_zip_without_zcta: "not-applicable-no-census-zcta-demographic-estimate", non_zcta_space_blocks_map: false }) &&
    exact(value.claims, ["network_requests", "acquisition_performed", "current_pointer_written", "production_enrollment", "demographic_percentages", "demographic_gdp_allocation"]) &&
    same(value.claims, { network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, demographic_percentages: false, demographic_gdp_allocation: false }) &&
    exact(value.provenance, ["plan_sha256", "admission_config_sha256"]) &&
    /^[a-f0-9]{64}$/.test(value.provenance.plan_sha256) &&
    /^[a-f0-9]{64}$/.test(value.provenance.admission_config_sha256)
  );
}

export function validMaintenanceSchedules(
  input: unknown,
): input is MaintenanceSchedule[] {
  if (!Array.isArray(input) || input.length > 1000) return false;
  const ids = new Set<string>();
  return input.every((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const value = row as MaintenanceSchedule & Record<string, unknown>;
    const expected = new Set([
      "id",
      "industries",
      "states",
      "intervalHours",
      "enabled",
      "planHash",
      "resources",
      "createdAt",
      "status",
      "nextDueAt",
      "lastOccurrence",
      "reason",
    ]);
    if (
      Object.keys(value).length !== expected.size ||
      Object.keys(value).some((key) => !expected.has(key))
    )
      return false;
    if (
      typeof value.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.id) ||
      ids.has(value.id) ||
      !Array.isArray(value.industries) ||
      !value.industries.length ||
      value.industries.some((id) => !industryIds.includes(id as typeof industryIds[number])) ||
      new Set(value.industries).size !== value.industries.length ||
      !Array.isArray(value.states) ||
      !value.states.length ||
      value.states.some((state) => !states.includes(state as typeof states[number])) ||
      new Set(value.states).size !== value.states.length ||
      !Number.isSafeInteger(value.intervalHours) ||
      value.intervalHours < 24 ||
      value.intervalHours > 8760 ||
      typeof value.enabled !== "boolean" ||
      typeof value.planHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.planHash) ||
      !Array.isArray(value.resources) ||
      !value.resources.length ||
      value.resources.some((resource) => typeof resource !== "string" || !resource) ||
      new Set(value.resources).size !== value.resources.length ||
      !validDate(value.createdAt) ||
      !["READY", "DISABLED", "RUNNING", "PAUSED"].includes(value.status) ||
      (value.nextDueAt !== null && !validDate(value.nextDueAt)) ||
      (value.reason !== null && typeof value.reason !== "string")
    )
      return false;
    if (value.lastOccurrence !== null) {
      const occurrence = value.lastOccurrence;
      if (
        !occurrence ||
        typeof occurrence !== "object" ||
        typeof occurrence.operationId !== "string" ||
        !occurrence.operationId ||
        typeof occurrence.status !== "string" ||
        !occurrence.status ||
        !validDate(occurrence.dueAt) ||
        (occurrence.createdAt !== undefined && !validDate(occurrence.createdAt)) ||
        (occurrence.finishedAt !== undefined && !validDate(occurrence.finishedAt))
      )
        return false;
    }
    ids.add(value.id);
    return true;
  });
}

export function maintenanceExecutionLabel(
  industry: string,
  maintained: boolean,
  schedules: MaintenanceSchedule[] | null,
) {
  if (!maintained) return "Not selected";
  if (schedules === null) return "Selected intent only · schedule status unavailable";
  const applicable = schedules.filter((row) => row.industries.includes(industry));
  if (!applicable.length) return "Selected intent only · no schedule configured";
  const running = applicable.find((row) => row.status === "RUNNING");
  if (running) return `Running · ${running.lastOccurrence?.operationId ?? "operation pending"}`;
  const enabled = applicable.find((row) => row.enabled && row.status === "READY");
  if (enabled)
    return `Scheduled enabled · next due ${enabled.nextDueAt ?? "unknown"}`;
  const failed = applicable.find((row) =>
    ["FAILED", "CANCELLED"].includes(row.lastOccurrence?.status ?? ""),
  );
  if (failed)
    return `Scheduled paused · latest ${failed.lastOccurrence!.status.toLowerCase()}`;
  if (applicable.some((row) => row.status === "PAUSED")) return "Scheduled paused · needs review";
  return "Schedule configured but disabled";
}
const executionReasons = ["AUTOMATIC_REFRESH_NOT_REVIEWED", "GOVERNED_SOURCE_HOLD", "MANUAL_SELECTION_REQUIRED"] as const;
const operationStatuses = ["QUEUED", "RUNNING", "UNKNOWN", "SUCCEEDED", "FAILED", "CANCELLED"];
const effectiveStatuses = ["not-selected", "selected-running", "selected-scheduled-enabled", "selected-scheduled-paused", "selected-scheduled-disabled", "selected-blocked-automatic-refresh", "selected-blocked-prerequisite", "selected-manual-only", "selected-intent-only"];
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function validMaintenanceExecutionStatus(input: unknown, view: View): input is MaintenanceExecutionStatus {
  if (!exact(input, ["schema_version", "generated_at", "maintenance_revision", "industries", "claims"])) return false;
  const value = input as MaintenanceExecutionStatus;
  if (value.schema_version !== "industry-maintenance-execution-status@1.0.0" || !validDate(value.generated_at) || value.maintenance_revision !== view.revision || !Array.isArray(value.industries) || value.industries.length !== industryIds.length || !same(value.claims, { selection_authorizes_acquisition: false, status_starts_work: false, prerequisite_contents_validated: false, latest_success_implies_current_evidence: false, business_completeness: null })) return false;
  if (value.industries.map(row => row.id).join("|") !== industryIds.join("|")) return false;
  return value.industries.every(row => {
    if (!exact(row, ["id", "selected_intent", "configured_sources", "automatic_refresh", "schedule", "latest_collection", "prerequisites", "effective_status"]) || row.selected_intent !== view.maintainedIndustries.includes(row.id) || !effectiveStatuses.includes(row.effective_status)) return false;
    const configured = row.configured_sources;
    if (!exact(configured, ["total", "national", "state", "manual_only"]) || !Object.values(configured).every(nonnegative) || configured.total !== configured.national + configured.state || configured.manual_only > configured.total) return false;
    const automatic = row.automatic_refresh;
    if (!exact(automatic, ["authorized", "blocked", "reason_counts"]) || !nonnegative(automatic.authorized) || !nonnegative(automatic.blocked) || automatic.authorized + automatic.blocked !== configured.total || !exact(automatic.reason_counts, [...executionReasons]) || !Object.values(automatic.reason_counts).every(nonnegative) || Object.values(automatic.reason_counts).reduce((sum, count) => sum + count, 0) !== automatic.blocked) return false;
    const schedule = row.schedule;
    if (!exact(schedule, ["configured", "enabled", "running", "paused", "next_due_at", "last_occurrence_status"]) || ![schedule.configured, schedule.enabled, schedule.running, schedule.paused].every(nonnegative) || schedule.enabled > schedule.configured || schedule.running > schedule.configured || schedule.paused > schedule.configured || (schedule.next_due_at !== null && !validDate(schedule.next_due_at)) || (schedule.last_occurrence_status !== null && !operationStatuses.includes(schedule.last_occurrence_status))) return false;
    const prerequisite = row.prerequisites;
    if (!exact(prerequisite, ["declared", "present", "missing", "status"]) || ![prerequisite.declared, prerequisite.present, prerequisite.missing].every(nonnegative) || prerequisite.declared !== prerequisite.present + prerequisite.missing || !["none", "missing", "present-unvalidated"].includes(prerequisite.status)) return false;
    const latest = row.latest_collection;
    if (!(latest === null || exact(latest, ["operation_id", "status", "created_at", "finished_at"]) && typeof latest.operation_id === "string" && latest.operation_id.length > 0 && operationStatuses.includes(latest.status) && validDate(latest.created_at) && (latest.finished_at === null || validDate(latest.finished_at)))) return false;
    let expected = "not-selected";
    if (row.selected_intent) {
      if (schedule.running > 0 || latest && ["QUEUED", "RUNNING", "UNKNOWN"].includes(latest.status)) expected = "selected-running";
      else if (prerequisite.missing > 0) expected = "selected-blocked-prerequisite";
      else if (automatic.authorized === 0 && configured.manual_only === configured.total) expected = "selected-manual-only";
      else if (automatic.authorized === 0) expected = "selected-blocked-automatic-refresh";
      else if (schedule.paused > 0) expected = "selected-scheduled-paused";
      else if (schedule.enabled > 0) expected = "selected-scheduled-enabled";
      else if (schedule.configured > 0) expected = "selected-scheduled-disabled";
      else expected = "selected-intent-only";
    }
    return row.effective_status === expected;
  });
}
export function maintenanceExecutionStatusLabel(row: MaintenanceExecutionStatus["industries"][number] | undefined) {
  if (!row) return "Unknown — execution status unavailable";
  return row.effective_status.replaceAll("-", " ");
}
const caStatuses = [
  "CLOSED",
  "INACTIVE",
  "LICENSED",
  "ON PROBATION",
  "PENDING",
] as const;
function validCaReadiness(input: unknown): input is CaReadiness {
  if (
    !exact(input, [
      "schema_version",
      "state",
      "industry",
      "status",
      "publisher_rows",
      "publisher_status_counts",
      "publisher_open_status_candidate_rows",
      "temporal",
      "migration",
      "family_home_source",
      "source",
      "claims",
      "semantics",
    ])
  )
    return false;
  const value = input as CaReadiness;
  if (
    value.schema_version !== "ca-childcare-status-readiness-view@1.4.0" ||
    value.state !== "CA" ||
    value.industry !== "childcare" ||
    value.status !== "verified-aggregate-publisher-readiness-migration-hold" ||
    !exact(value.publisher_status_counts, [...caStatuses]) ||
    !caStatuses.every(
      (key) =>
        Number.isSafeInteger(value.publisher_status_counts[key]) &&
        value.publisher_status_counts[key] >= 0,
    ) ||
    Object.values(value.publisher_status_counts).reduce(
      (sum, count) => sum + count,
      0,
    ) !== value.publisher_rows ||
    value.publisher_open_status_candidate_rows !==
      value.publisher_status_counts.LICENSED +
        value.publisher_status_counts["ON PROBATION"] ||
    !exact(value.temporal, [
      "catalog_last_updated",
      "publisher_file_date",
      "preflight_observed_at",
      "posture",
      "current_operation_verified",
    ]) ||
    value.temporal.catalog_last_updated !== "2026-11-11" ||
    value.temporal.publisher_file_date !== "2025-05-25" ||
    new Date(value.temporal.preflight_observed_at).toISOString() !==
      value.temporal.preflight_observed_at ||
    value.temporal.posture !==
      "arcgis-current-distribution-legacy-ckan-file-date-conflict-automatic-refresh-hold" ||
    value.temporal.current_operation_verified !== false ||
    !exact(value.migration,["current_distribution","arcgis_item_id","legacy_backend_still_listed","existing_app_backend","arcgis_all_program_rows","arcgis_childcare_rows","arcgis_childcare_rows_with_zip","arcgis_family_child_care_homes_excluded","item_aggregate_scope_conflict","raw_status_code_meanings_verified","automatic_refresh_authorized","next_action"]) ||
    value.migration.current_distribution!=="ArcGIS GeoService" || value.migration.arcgis_item_id!=="db31b0884a074cff9260facb3f2ade45" || value.migration.legacy_backend_still_listed!==true || value.migration.existing_app_backend!=="legacy-ckan-datastore" || value.migration.arcgis_all_program_rows!==37897 || value.migration.arcgis_childcare_rows!==13265 || value.migration.arcgis_childcare_rows_with_zip!==13245 || value.migration.arcgis_family_child_care_homes_excluded!==true || value.migration.item_aggregate_scope_conflict!==true || value.migration.raw_status_code_meanings_verified!==false || value.migration.automatic_refresh_authorized!==false || !value.migration.next_action ||
    !exact(value.family_home_source,["catalog_resource_id","catalog_link_delivery","backend_last_modified","publisher_file_date","arcgis_view_includes_family_homes","current_provider_row_source_identified","interpretation"]) || value.family_home_source.catalog_resource_id!=="4b5cc48d-03b1-4f42-a7d1-b9816903eb2b" || value.family_home_source.catalog_link_delivery!=="legacy-ckan-resource" || value.family_home_source.backend_last_modified!=="2025-05-27T23:42:21.908087" || value.family_home_source.publisher_file_date!=="2025-05-25" || value.family_home_source.arcgis_view_includes_family_homes!==false || value.family_home_source.current_provider_row_source_identified!==false || !value.family_home_source.interpretation ||
    !exact(value.source,["manifests"]) || !exact(value.source.manifests,["catalog","schema","status","geography","arcgis"]) || Object.values(value.source.manifests).some(item=>!exact(item,["path","sha256"])||!item.path.startsWith("data/business-sources/ca-childcare/")||!/^[a-f0-9]{64}$/.test(item.sha256)) ||
    !same(value.claims, {
      provider_rows_acquired: 0,
      current_operations_verified: false,
      statewide_completeness: null,
      business_count: null,
    }) ||
    typeof value.semantics !== "string" ||
    !value.semantics
  )
    return false;
  return true;
}
export function validAdministrationView(input: unknown): input is View {
  if (
    !exact(input, [
      "industries",
      "maintainedIndustries",
      "semantics",
      "revision",
    ])
  )
    return false;
  const v = input as View,
    ids = Array.isArray(v.industries)
      ? v.industries.map((x) => x?.id).sort()
      : [];
  return (
    ids.length === 9 &&
    ids.every((id, i) => id === industryIds[i]) &&
    v.industries.every(
      (x) =>
        exact(x, ["id", "label"]) &&
        typeof x.label === "string" &&
        x.label.length > 0,
    ) &&
    Array.isArray(v.maintainedIndustries) &&
    new Set(v.maintainedIndustries).size === v.maintainedIndustries.length &&
    v.maintainedIndustries.every((id) =>
      industryIds.includes(id as (typeof industryIds)[number]),
    ) &&
    Number.isSafeInteger(v.revision) &&
    v.revision >= 0 &&
    typeof v.semantics === "string"
  );
}
export function validAdministrationBacklog(
  input: unknown,
  view: View,
): input is Backlog {
  if (
    !exact(input, [
      "schema_version",
      "report_sha256",
      "backlog_sha256",
      "maintenance_revision",
      "maintained_industries",
      "total_attention_cells",
      "batch_limit",
      "next_batch",
      "remaining_after_batch",
      "claims",
    ])
  )
    return false;
  const v = input as Backlog;
  if (
    v.schema_version !== "state-access-maintenance-backlog@2.19.0" ||
    v.report_sha256 !== reportSha ||
    !/^[a-f0-9]{64}$/.test(v.backlog_sha256) ||
    v.maintenance_revision !== view.revision ||
    v.batch_limit !== 10 ||
    !Array.isArray(v.maintained_industries) ||
    [...v.maintained_industries].sort().join("|") !==
      [...view.maintainedIndustries].sort().join("|") ||
    !Number.isSafeInteger(v.total_attention_cells) ||
    v.total_attention_cells < 0 ||
    !Number.isSafeInteger(v.remaining_after_batch) ||
    v.remaining_after_batch < 0 ||
    !Array.isArray(v.next_batch) ||
    v.next_batch.length > 10 ||
    v.next_batch.length + v.remaining_after_batch !== v.total_attention_cells ||
    !same(v.claims, {
      acquisition_authorized: false,
      dispatch_performed: false,
      production_change: false,
      business_completeness: null,
    })
  )
    return false;
  return v.next_batch.every(
    (row) =>
      exact(row, [
        "state",
        "industry",
        "action_kind",
        "access_status",
        "temporal_status",
        "source_keys",
        "issue_codes",
        "source_discovery",
        "refresh_posture",
      ]) &&
      states.includes(row.state as (typeof states)[number]) &&
      industryIds.includes(row.industry as (typeof industryIds)[number]) &&
      v.maintained_industries.includes(row.industry) &&
      ["source-discovery-review", "temporal-source-review"].includes(
        row.action_kind,
      ) &&
      accessStatuses.includes(
        row.access_status as (typeof accessStatuses)[number],
      ) &&
      temporalStatuses.includes(
        row.temporal_status as (typeof temporalStatuses)[number],
      ) &&
      Array.isArray(row.source_keys) &&
      new Set(row.source_keys).size === row.source_keys.length &&
      row.source_keys.every((x) => typeof x === "string") &&
      Array.isArray(row.issue_codes) &&
      row.issue_codes.every((x) => typeof x === "string") &&
      (row.source_discovery === null ||
        (exact(row.source_discovery, [
          "discovery_id",
          "status",
          "official_source_count",
          "supported_bulk_export_verified",
          "supported_api_verified",
          "portal_automation_authorized",
          "record_acquisition_authorized",
          "next_action",
        ]) &&
          [
            "AK",
            "AL",
            "AR",
            "AZ",
            "CA",
            "CO",
            "CT",
            "DC",
            "DE",
            "FL",
            "GA",
            "HI",
            "ID",
            "IL",
            "IN",
            "IA",
            "KS",
            "KY",
            "LA",
            "MA",
            "MD",
            "ME",
            "MI",
            "MN",
            "MO",
            "MS",
            "MT",
            "NC",
            "ND",
            "NE",
            "NH",
            "NJ",
            "NM",
            "NV",
            "NY",
            "OH",
            "OK",
            "OR",
            "PA",
            "RI",
            "SC",
            "SD",
            "TN",
            "TX",
            "UT",
            "VA",
            "VT",
            "WA",
            "WI",
            "WV",
            "WY",
          ].includes(row.state) &&
          row.industry === "childcare" &&
          row.source_discovery.status ===
            ({
              AZ: "official-monthly-table-metadata-validated-acquisition-disabled",
              CA: "official-source-migration-preflights-validated-reporting-not-enrolled",
              CO: "official-monthly-socrata-api-metadata-validated-acquisition-disabled",
              CT: "official-active-childcare-rosters-identified-export-contract-unverified",
              DC: "official-monthly-pdf-identified-offline-parser-required",
              DE: "official-public-domain-api-metadata-validated-acquisition-disabled",
              FL: "official-workbook-metadata-validated-acquisition-disabled",
              GA: "official-csv-export-contract-metadata-validated-acquisition-disabled",
              HI: "official-search-identified-automation-prohibited-bulk-interface-unverified",
              ID: "official-dual-workbook-metadata-identified-acquisition-disabled",
              IL: "official-manual-export-identified-automated-bulk-contract-unverified",
              IN: "official-current-provider-tables-export-format-unverified-acquisition-disabled",
              IA: "official-near-real-time-provider-search-and-data-sharing-path-identified-bulk-contract-unverified",
              KS: "official-search-and-data-request-path-identified-acquisition-disabled",
              KY: "official-dynamic-download-control-identified-contract-unverified",
              LA: "official-statewide-center-finder-identified-bulk-contract-unverified",
              MA: "official-current-and-history-downloads-identified-contract-unverified",
              MD: "official-open-provider-search-identified-bulk-contract-unverified",
              ME: "official-regulated-provider-search-and-monthly-list-path-identified-acquisition-disabled",
              MI: "official-current-facilities-report-identified-contract-unverified",
              MN: "official-daily-licensing-lookup-csv-export-identified-acquisition-disabled",
              MO: "official-dated-licensed-and-exempt-provider-listing-identified-contract-unverified",
              MS: "official-licensed-facility-search-and-records-request-path-identified-acquisition-disabled",
              MT: "official-licensed-provider-dashboard-identified-bulk-contract-unverified",
              NC: "official-facility-search-and-data-request-path-identified-acquisition-disabled",
              ND: "official-licensed-and-self-declared-search-identified-bulk-contract-unverified",
              NE: "official-weekly-zip-organized-roster-identified-acquisition-disabled",
              NH: "official-child-care-search-identified-bulk-contract-unverified",
              NJ: "official-dated-licensed-center-roster-and-open-data-api-identified-acquisition-disabled",
              NM: "official-provider-database-backed-finder-identified-bulk-contract-unverified",
              NV: "official-licensure-search-identified-jurisdiction-boundary-unresolved",
              NY: "official-daily-program-api-identified-nyc-center-boundary-unresolved",
              OH: "official-daily-email-gated-csv-export-identified-acquisition-disabled",
              OK: "official-licensed-provider-locator-identified-bulk-contract-unverified",
              OR: "official-daily-child-care-safety-portal-identified-bulk-contract-unverified",
              PA: "official-monthly-open-certified-program-odata-identified-acquisition-disabled",
              RI: "official-rises-statewide-licensed-program-search-identified-bulk-contract-unverified",
              SC: "official-manual-excel-export-identified-automated-bulk-contract-unverified",
              SD: "official-mixed-cohort-provider-search-identified-bulk-contract-unverified",
              TN: "official-center-only-arcgis-api-and-retained-release-validated",
              TX: "official-regulated-provider-search-identified-bulk-contract-unverified",
              UT: "official-current-regulated-program-report-and-retained-center-release-validated",
              VA: "official-annual-quality-workbooks-identified-use-permission-unresolved",
              VT: "official-socrata-center-api-and-retained-release-validated",
              WA: "official-active-center-and-school-age-socrata-api-metadata-validated-acquisition-disabled",
              WI: "official-licensed-group-arcgis-api-metadata-validated-use-decision-pending",
              WV: "official-wvpath-provider-search-identified-bulk-contract-unverified",
              WY: "official-monthly-active-provider-list-download-identified-acquisition-disabled",
            }[row.state] ??
              "official-search-identified-bulk-interface-unverified") &&
          row.source_discovery.official_source_count ===
            ([
              "AK",
              "IL",
              "KS",
              "LA",
              "MI",
              "MN",
              "MO",
              "MS",
              "MT",
              "NC",
              "ND",
              "NE",
              "NH",
              "NJ",
              "NM",
              "NV",
              "NY",
              "OH",
              "OK",
              "OR",
              "PA",
              "RI",
              "SC",
              "SD",
              "TX",
              "UT",
              "VA",
              "VT",
              "WA",
              "WI",
              "CO",
              "CT",
              "CA",
              "IA",
              "WY",
            ].includes(row.state)
              ? 4
              : row.state === "ID"
                ? 6
                : ["DC", "FL", "GA", "IN", "MD", "WV"].includes(row.state)
                  ? 3
                  : 5) &&
          row.source_discovery.supported_bulk_export_verified ===
            [
              "AZ",
              "DE",
              "FL",
              "GA",
              "ID",
              "IN",
              "KY",
              "MA",
              "MI",
              "MN",
              "MO",
              "NE",
              "NJ",
              "NY",
              "OH",
              "PA",
              "TN",
              "UT",
              "VA",
              "VT",
              "WA",
              "WI",
              "CO",
              "CT",
              "CA",
              "WY",
            ].includes(row.state) &&
          row.source_discovery.supported_api_verified ===
            ["CA", "CO", "DE", "NJ", "NY", "PA", "TN", "VT", "WA", "WI"].includes(
              row.state,
            ) &&
          row.source_discovery.portal_automation_authorized === false &&
          row.source_discovery.record_acquisition_authorized === false &&
          typeof row.source_discovery.next_action === "string")) &&
      exact(row.refresh_posture, [
        "applicable_collection_sources",
        "manual_app_plan_available",
        "automatic_refresh_authorized",
        "newer_publisher_release_guaranteed",
        "gap_resolution_guaranteed",
      ]) &&
      Array.isArray(row.refresh_posture.applicable_collection_sources) &&
      row.refresh_posture.applicable_collection_sources.every(
        (source) =>
          exact(source, [
            "source_id",
            "scope",
            "manual_selection_required",
            "automatic_refresh_authorized",
            "automatic_refresh_reason_code",
          ]) &&
          typeof source.source_id === "string" &&
          ["national", "state"].includes(source.scope) &&
          typeof source.manual_selection_required === "boolean" &&
          typeof source.automatic_refresh_authorized === "boolean" &&
          typeof source.automatic_refresh_reason_code === "string",
      ) &&
      row.refresh_posture.manual_app_plan_available ===
        row.refresh_posture.applicable_collection_sources.length > 0 &&
      row.refresh_posture.automatic_refresh_authorized ===
        (row.refresh_posture.applicable_collection_sources.length > 0 &&
          row.refresh_posture.applicable_collection_sources.every(
            (source) => source.automatic_refresh_authorized,
          )) &&
      row.refresh_posture.newer_publisher_release_guaranteed === false &&
      row.refresh_posture.gap_resolution_guaranteed === false,
  );
}
export function validAdministrationIndustryEvidence(
  input: unknown,
): input is IndustryEvidence {
  if (
    !exact(input, [
      "schema_version",
      "report_sha256",
      "assessed_at",
      "jurisdictions",
      "industry_cells",
      "industries",
      "claims",
    ])
  )
    return false;
  const v = input as IndustryEvidence;
  if (
    v.schema_version !== "state-access-industry-summary@1.5.0" ||
    v.report_sha256 !== reportSha ||
    !validDate(v.assessed_at) ||
    new Date(v.assessed_at).toISOString() !== v.assessed_at ||
    v.jurisdictions !== 51 ||
    v.industry_cells !== 459 ||
    !same(v.claims, {
      active_business_count: null,
      nationwide_industry_completeness: null,
      complete_geocodes: false,
      maintenance_selection_affects_evidence: false,
    }) ||
    !Array.isArray(v.industries) ||
    v.industries.length !== 9 ||
    !industryIds.every((id) => v.industries.some((x) => x?.id === id))
  )
    return false;
  return v.industries.every((row) => {
    if (
      !exact(row, [
        "id",
        "jurisdictions",
        "access_status_counts",
        "temporal_status_counts",
        "states",
        "jurisdictions_with_retained_access_evidence",
        "retained_access_evidence_percent",
      ]) ||
      row.jurisdictions !== 51 ||
      !exact(row.access_status_counts, [...accessStatuses]) ||
      !exact(row.temporal_status_counts, [...temporalStatuses]) ||
      !Array.isArray(row.states) ||
      row.states.length !== 51 ||
      !states.every((state) => row.states.some((x) => x?.state === state))
    )
      return false;
    const access = Object.fromEntries(accessStatuses.map((x) => [x, 0])),
      temporal = Object.fromEntries(temporalStatuses.map((x) => [x, 0]));
    for (const state of row.states) {
      if (
        !exact(state, [
          "state",
          "access_status",
          "temporal_status",
          "source_keys",
          "sources",
        ]) ||
        !states.includes(state.state as (typeof states)[number]) ||
        !accessStatuses.includes(
          state.access_status as (typeof accessStatuses)[number],
        ) ||
        !temporalStatuses.includes(
          state.temporal_status as (typeof temporalStatuses)[number],
        ) ||
        !Array.isArray(state.source_keys) ||
        new Set(state.source_keys).size !== state.source_keys.length ||
        !Array.isArray(state.sources)
      )
        return false;
      access[state.access_status]++;
      temporal[state.temporal_status]++;
      const keys = new Set<string>();
      for (const source of state.sources) {
        if (
          !exact(source, [
            "source_key",
            "source_release_id",
            "source_reference_at",
            "review_due_date",
            "evidence_scope",
            "publisher_currency_basis",
            "retained_observed_at",
            "evidence_type",
            "temporal_status",
            "record_count",
            "count_unit",
            "issuing_locality",
          ]) ||
          typeof source.source_key !== "string" ||
          !source.source_key ||
          (source.source_release_id !== null &&
            typeof source.source_release_id !== "string") ||
          (source.source_reference_at !== null &&
            typeof source.source_reference_at !== "string") ||
          (source.review_due_date !== null &&
            typeof source.review_due_date !== "string") ||
          typeof source.evidence_scope !== "string" ||
          (source.publisher_currency_basis !== null &&
            typeof source.publisher_currency_basis !== "string") ||
          (source.retained_observed_at !== null &&
            typeof source.retained_observed_at !== "string") ||
          typeof source.evidence_type !== "string" || !source.evidence_type ||
          !temporalStatuses.includes(source.temporal_status) ||
          (source.issuing_locality !== null && (typeof source.issuing_locality !== "string" || !source.issuing_locality)) ||
          (source.record_count === null ? source.count_unit !== null :
            !Number.isSafeInteger(source.record_count) || source.record_count < 0 ||
            typeof source.count_unit !== "string" || !source.count_unit)
        )
          return false;
        keys.add(source.source_key);
      }
      if (
        keys.size !== state.source_keys.length ||
        !state.source_keys.every((x) => keys.has(x))
      )
        return false;
    }
    const retained =
      access["direct-state-publisher"] +
      access["local-publisher-substate-evidence"] +
      access["national-dataset-state-evidence"];
    return (
      same(access, row.access_status_counts) &&
      same(temporal, row.temporal_status_counts) &&
      row.jurisdictions_with_retained_access_evidence === retained &&
      row.retained_access_evidence_percent ===
        Number(((retained / 51) * 100).toFixed(1))
    );
  });
}

export function validIndustryCensusStatus(input: unknown): input is IndustryCensusStatus {
  if (!exact(input,["schema_version","source","industries","claims"])) return false;
  const value=input as IndustryCensusStatus, sha=/^[a-f0-9]{64}$/;
  if(value.schema_version!=="operational-industry-census-status@1.1.0"||!exact(value.source,["dataset_id","release_id","reference_year","publisher_release_status","publisher_assessment_id","publisher_assessment_observed_at","publisher_assessment_sha256","next_reference_year","next_release_status","pointer_sha256","manifest_sha256","naics_catalog_sha256"])||value.source.dataset_id!=="census-zbp-baseline"||value.source.reference_year!==2023||value.source.publisher_release_status!=="latest-publisher-reference-year"||value.source.publisher_assessment_id!=="census-zbp-current-release-2026-11-12"||value.source.publisher_assessment_observed_at!=="2026-11-12"||value.source.next_reference_year!==2024||value.source.next_release_status!=="no-planned-release-date-publisher-evaluating-alternative-approach"||![value.source.pointer_sha256,value.source.manifest_sha256,value.source.naics_catalog_sha256,value.source.publisher_assessment_sha256].every(item=>sha.test(item))||!Array.isArray(value.industries)||value.industries.length!==9||!industryIds.every(id=>value.industries.some(row=>row.id===id))||!same(value.claims,{annual_aggregate_context_only:true,named_businesses:false,current_operations_verified:false,business_completeness:null,industry_completeness:null,state_access_gap_resolution_performed:false,zip5_is_zcta:false,zip4_joined:false,network_requests:0,runtime_writes:0}))return false;
  return value.industries.every(row=>exact(row,["id","aggregate_status","naics_code","naics_label","published_zip_rows","published_establishments","reason"])&&(row.aggregate_status==="retained-annual-employer-establishment-aggregate"?typeof row.naics_code==="string"&&row.naics_code.length===6&&typeof row.naics_label==="string"&&Number.isSafeInteger(row.published_zip_rows)&&Number(row.published_zip_rows)>0&&Number.isSafeInteger(row.published_establishments)&&Number(row.published_establishments)>0&&row.reason===null:row.aggregate_status==="not-comparable-to-single-naics"&&row.naics_code===null&&row.naics_label===null&&row.published_zip_rows===null&&row.published_establishments===null&&typeof row.reason==="string"&&row.reason.length>0));
}

export default function Administration() {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backlogResult, setBacklog] = useState<Backlog | null>(null);
  const [evidence, setEvidence] = useState<IndustryEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);
  const [censusStatus, setCensusStatus] = useState<IndustryCensusStatus | null>(null);
  const [caReadiness, setCaReadiness] = useState<CaReadiness | null>(null);
  const [acsReadiness, setAcsReadiness] = useState<AcsReadiness | null>(null);
  const [acsReadinessError, setAcsReadinessError] = useState(false);
  const [executionResult, setExecution] = useState<MaintenanceExecutionStatus | null>(null);
  const backlog = backlogResult?.maintenance_revision === view?.revision ? backlogResult : null;
  const execution = executionResult?.maintenance_revision === view?.revision ? executionResult : null;
  const draftChanged =
    !!view &&
    [...selected].sort().join("|") !==
      [...view.maintainedIndustries].sort().join("|");

  useEffect(() => {
    const controller = new AbortController();
    void runnerJson<unknown>("/api/administration/industries", {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          if (!validAdministrationView(value))
            throw Error("Invalid administration settings.");
          setView(value);
          setSelected(value.maintainedIndustries);
          void runnerJson<unknown>("/api/administration/industry-maintenance-execution-status", { signal: controller.signal })
            .then((status) => {
              if (!controller.signal.aborted)
                setExecution(validMaintenanceExecutionStatus(status, value) ? status : null);
            })
            .catch(() => {});
          void runnerJson<unknown>("/api/administration/industry-backlog", {
            signal: controller.signal,
          })
            .then((next) => {
              if (!controller.signal.aborted)
                setBacklog(
                  validAdministrationBacklog(next, value) ? next : null,
                );
            })
            .catch(() => {});
        }
      })
      .catch(() => !controller.signal.aborted && setError(true));
    void runnerJson<unknown>(
      "/api/business-map/state-access-industry-summary",
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (validAdministrationIndustryEvidence(value)) setEvidence(value);
        else setEvidenceError(true);
      })
      .catch(() => !controller.signal.aborted && setEvidenceError(true));
    void runnerJson<unknown>("/api/administration/operational-industry-census-status", {signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted&&validIndustryCensusStatus(value))setCensusStatus(value);})
      .catch(()=>{});
    void runnerJson<unknown>(
      "/api/business-map/ca-childcare-status-readiness",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted && validCaReadiness(value))
          setCaReadiness(value);
      })
      .catch(() => {});
    void runnerJson<unknown>(
      "/api/data-operations/acs-zcta-demographic-network-readiness",
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (validAcsReadiness(value)) setAcsReadiness(value);
        else setAcsReadinessError(true);
      })
      .catch(() => !controller.signal.aborted && setAcsReadinessError(true));
    return () => controller.abort();
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const value = await runnerJson<unknown>(
        "/api/administration/industries",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": `"${view?.revision ?? -1}"`,
          },
          body: JSON.stringify({
            maintainedIndustries: selected,
            expectedRevision: view?.revision ?? -1,
          }),
        },
      );
      if (!validAdministrationView(value))
        throw Error("Invalid saved settings.");
      setView(value);
      setSelected(value.maintainedIndustries);
      setMessage("Maintenance selection saved locally.");
      setExecution(null);
      try {
        const [next, executionValue] = await Promise.all([
          runnerJson<unknown>("/api/administration/industry-backlog"),
          runnerJson<unknown>("/api/administration/industry-maintenance-execution-status"),
        ]);
        setBacklog(validAdministrationBacklog(next, value) ? next : null);
        setExecution(validMaintenanceExecutionStatus(executionValue, value) ? executionValue : null);
      } catch {
        setBacklog(null);
        setExecution(null);
      }
    } catch {
      try {
        const durable = await runnerJson<unknown>(
          "/api/administration/industries",
        );
        if (!validAdministrationView(durable))
          throw Error("Invalid durable settings.");
        setView(durable);
        setSelected(durable.maintainedIndustries);
        setMessage(
          "Save failed or was stale. Reloaded the persisted maintenance selection.",
        );
      } catch {
        setView(null);
        setSelected([]);
        setBacklog(null);
        setError(true);
        setMessage(
          "Save failed and persisted settings could not be reloaded. No selection is shown.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function downloadBacklog() {
    if (!backlog) return;
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(backlog, null, 2)}\n`], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `cotive-maintenance-backlog-${backlog.backlog_sha256.slice(0, 12)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel focused-workspace administration-workspace">
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">Local application settings</span>
          <h2>Administration</h2>
        </div>
        <p>Choose maintained industries and review source and refresh status.</p>
      </div>
      {error && (
        <p role="alert">
          Administration settings are unavailable. No selection was inferred.
        </p>
      )}
      {!view && !error && <p role="status">Loading maintained industries…</p>}
      {view && (
        <section aria-labelledby="maintained-industries-heading">
          <h3 id="maintained-industries-heading">Maintained industries</h3>
          <p>The saved selection sets defaults for collection and refresh planning. Downloads and recurring schedules have their own controls.</p>
          <p className="scope-note">
            This selection records local maintenance intent only; it does not authorize acquisition, start downloads, prove coverage, or change production enrollment.
          </p>
          <div className="administration-actions">
            <button type="button" disabled={saving} onClick={() => setSelected(view.industries.map(({ id }) => id))}>Select all</button>
            <button type="button" disabled={saving} onClick={() => setSelected([])}>Select none</button>
            <span>{selected.length} of {view.industries.length} selected</span>
          </div>
          <div className="maintenance-grid" role="group" aria-label="Industries selected for maintenance">
            {view.industries.map((industry) => {
              const checked = selected.includes(industry.id);
              return (
                <label key={industry.id} className={checked ? "maintained" : "not-maintained"}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={() => setSelected((current) =>
                      current.includes(industry.id)
                        ? current.filter((id) => id !== industry.id)
                        : [...current, industry.id],
                    )}
                  />
                  <strong>{industry.label}</strong>
                </label>
              );
            })}
          </div>
          <div className="administration-actions">
            <button className="primary-button" type="button" disabled={saving || !draftChanged} onClick={save}>
              {saving ? "Saving…" : "Save maintenance selection"}
            </button>
            <span>{draftChanged ? "Unsaved draft — persisted selection is unchanged" : "Displayed selection is persisted"}</span>
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <section className="industry-summary" aria-label="Industry evidence status overview">
        <h3>Industry evidence status</h3>
        <p>Evidence availability is the share of the 50 states and D.C. with retained source evidence. It is not the percent of businesses collected or nationwide industry completeness. Reporting starts with the governed evidence already retained; an all-business denominator is not required. Population, geocode, and Census-ZCTA gaps do not suppress otherwise retained industry evidence.</p>
        {evidence ? <div className="representation-table" role="region" aria-label="All operational industries status" tabIndex={0}>
          <table><thead><tr><th scope="col">Industry</th><th scope="col">Evidence availability</th><th scope="col">2023 Census aggregate context</th><th scope="col">Known gaps</th><th scope="col">Source access</th><th scope="col">Temporal review</th><th scope="col">Saved maintenance selection</th><th scope="col">Maintenance execution</th></tr></thead><tbody>{evidence.industries.map(row => <tr key={row.id}>
            <th scope="row">{view?.industries.find(industry => industry.id === row.id)?.label ?? row.id.replaceAll("-", " ")}</th>
            <td>{row.jurisdictions_with_retained_access_evidence} of {row.jurisdictions} jurisdictions ({row.retained_access_evidence_percent.toFixed(1)}% evidence availability; completeness unknown)</td>
            <td>{(()=>{const aggregate=censusStatus?.industries.find(item=>item.id===row.id);return !aggregate?"Unavailable — no aggregate inferred":aggregate.aggregate_status==="retained-annual-employer-establishment-aggregate"?`${aggregate.published_establishments?.toLocaleString()} employer establishments · ${aggregate.published_zip_rows?.toLocaleString()} published ZIP rows · NAICS ${aggregate.naics_code}`:aggregate.reason;})()}</td>
            <td>Unsupported: {(row.access_status_counts["unsupported-missing"] ?? 0) + (row.access_status_counts["unsupported-evidence-not-measured"] ?? 0)} · unmeasured: {row.access_status_counts["unsupported-evidence-not-measured"] ?? 0} · restricted sample: {row.access_status_counts["restricted-query-sample-evidence"] ?? 0} · temporal review due/unknown: {(row.temporal_status_counts["review-due"] ?? 0) + (row.temporal_status_counts["missing-source-reference"] ?? 0)}</td>
            <td>{accessStatuses.filter(status => row.access_status_counts[status] > 0).map(status => `${status.replaceAll("-", " ")}: ${row.access_status_counts[status]}`).join(" · ")}</td>
            <td>{temporalStatuses.filter(status => row.temporal_status_counts[status] > 0).map(status => `${status.replaceAll("-", " ")}: ${row.temporal_status_counts[status]}`).join(" · ")}</td>
            <td>{view ? view.maintainedIndustries.includes(row.id) ? "Selected" : "Not selected" : "Settings unavailable — evidence still reportable"}</td>
            <td>{view ? (() => { const status = execution?.industries.find(item => item.id === row.id); return status ? <>
              <strong>{maintenanceExecutionStatusLabel(status)}</strong>
              <div>{status.automatic_refresh.authorized}/{status.configured_sources.total} sources authorized for automatic refresh · {status.automatic_refresh.blocked} blocked</div>
              <div>Prerequisites: {status.prerequisites.status.replaceAll("-", " ")} ({status.prerequisites.present}/{status.prerequisites.declared} present)</div>
              <div>Schedules: {status.schedule.enabled} enabled · {status.schedule.running} running{status.schedule.next_due_at ? ` · next due ${status.schedule.next_due_at}` : ""}</div>
              <div>Latest collection: {status.latest_collection ? `${status.latest_collection.status} · ${status.latest_collection.operation_id}` : "none retained"}</div>
            </> : "Unknown — execution status unavailable"; })() : "Unknown — settings unavailable"}</td>
          </tr>)}</tbody></table>
          <small>Assessed {evidence.assessed_at.slice(0, 10)} · Retained state-access report SHA-256 {evidence.report_sha256}. Census reference year 2023 remains the latest publisher release as reviewed {censusStatus?.source.publisher_assessment_observed_at??"unknown"}; Census reports no planned 2024 release date. These are annual employer-establishment aggregates, not named or currently operating businesses, and do not resolve entity-source gaps. For state and source counts, see Industry Summary.</small>
        </div> : <p role="status">{evidenceError ? "Industry evidence unavailable; status is unknown. Maintenance selection remains usable when its settings are available." : "Loading retained industry status…"}</p>}
      </section>
      <section
        className="maintenance-backlog"
        aria-label="ACS ZCTA demographic acquisition readiness"
      >
        <h3>2020–2024 ACS ZCTA demographics</h3>
        {acsReadiness ? (
          <>
            <p>
              <strong>Plan verified · Network authorization pending.</strong>{" "}
              Zero Census API requests have been made and no demographic
              release, current pointer, or production enrollment exists.
            </p>
            <p>
              Governed scope: {acsReadiness.geography.governed_zctas.toLocaleString()} Census
              ZCTAs · tables {acsReadiness.tables.join(", ")} · maximum{" "}
              {acsReadiness.request_budget.maximum_total_requests} serial requests.
            </p>
            <p>
              Retained-source ceiling: 1 GiB · minimum free disk before execution:
              2 GiB. Private, unique, or PO-box ZIPs without a Census ZCTA are
              not applicable for this estimate and do not block the map.
            </p>
            <p className="operations-note">
              Remaining gates: {acsReadiness.blockers.map((item) => item.replaceAll("-", " ")).join(" · ")}.
              No demographic percentages or demographic GDP allocation are claimed.
            </p>
          </>
        ) : (
          <p role={acsReadinessError ? "alert" : "status"}>
            {acsReadinessError
              ? "ACS acquisition readiness is unavailable; no authorization or completed download is inferred."
              : "Verifying ACS acquisition readiness…"}
          </p>
        )}
      </section>
      {view && (
        <>
          {caReadiness && (
            <section
              className="maintenance-backlog"
              aria-label="California childcare publisher status readiness"
            >
              <h3>California childcare publisher status readiness</h3>
              <p>
                <strong>{caReadiness.publisher_rows.toLocaleString()}</strong>{" "}
                rows are represented by retained publisher aggregate counts:{" "}
                {Object.entries(caReadiness.publisher_status_counts)
                  .map(
                    ([status, total]) => `${status}: ${total.toLocaleString()}`,
                  )
                  .join(" · ")}
                .
              </p>
              <p>
                {caReadiness.publisher_open_status_candidate_rows.toLocaleString()}{" "}
                rows carry LICENSED or ON PROBATION publisher labels. They are
                lifecycle-review candidates, not verified active businesses.
              </p>
              <p>
                Catalog updated: {caReadiness.temporal.catalog_last_updated} · legacy publisher file date: {caReadiness.temporal.publisher_file_date}{" "}
                · preflight observed{" "}
                {caReadiness.temporal.preflight_observed_at}. Catalog/backend
                . The catalog now names ArcGIS GeoService as the current distribution, so automatic refresh remains on hold.
              </p>
              <p className="operations-note">
                {caReadiness.semantics} No provider rows were acquired by this
                aggregate preflight; statewide completeness and business count remain unknown. {caReadiness.migration.next_action}
              </p>
              <p className="operations-note">
                ArcGIS aggregate scope: {caReadiness.migration.arcgis_childcare_rows.toLocaleString()} CHILD CARE rows of {caReadiness.migration.arcgis_all_program_rows.toLocaleString()} all-program rows; {caReadiness.migration.arcgis_childcare_rows_with_zip.toLocaleString()} carry a ZIP value. Family child-care homes are excluded, numeric status meanings are unresolved, and the item description conflicts with the aggregate program roster.
              </p>
              <p className="operations-note">
                Family-home source: the catalog link still resolves to legacy CKAN resource <code>{caReadiness.family_home_source.catalog_resource_id}</code>, last modified {caReadiness.family_home_source.backend_last_modified} with publisher file date {caReadiness.family_home_source.publisher_file_date}. A newer catalog-page timestamp is not treated as newer provider data; no current family-home row source is identified.
              </p>
            </section>
          )}
          {backlog && (
            <section
              className="maintenance-backlog"
              aria-label="Maintained industry attention backlog"
            >
              <h3>Next maintenance review batch</h3>
              <p>
                {backlog.total_attention_cells} selected industry/state cells
                need access or temporal review. The first{" "}
                {backlog.next_batch.length} are shown;{" "}
                {backlog.remaining_after_batch} remain.
              </p>
              {backlog.next_batch.length ? (
                <ol>
                  {backlog.next_batch.map((row) => (
                    <li key={`${row.industry}:${row.state}`}>
                      <strong>
                        {row.state} · {row.industry.replaceAll("-", " ")}
                      </strong>
                      <span>
                        {row.action_kind.replaceAll("-", " ")} ·{" "}
                        {row.issue_codes
                          .map((code) => code.replaceAll("-", " "))
                          .join(" · ")}
                        {row.source_keys.length
                          ? ` · retained sources: ${row.source_keys.join(", ")}`
                          : " · no retained source cohort"}
                      </span>
                      {row.source_discovery && (
                        <span>
                          Official discovery retained (
                          {row.source_discovery.official_source_count} sources):{" "}
                          {row.source_discovery.status ===
                          "official-monthly-pdf-identified-offline-parser-required"
                            ? "monthly official PDF identified; an authorized retained file and offline parser are still required"
                            : row.source_discovery.supported_api_verified
                              ? "official public-domain API and bulk metadata verified; provider-row acquisition disabled"
                              : row.source_discovery
                                    .supported_bulk_export_verified
                                ? "downloadable bulk publication metadata verified; provider-row acquisition disabled"
                                : "bulk export/API unverified"}
                          ; portal automation unauthorized. Next:{" "}
                          {row.source_discovery.next_action}
                        </span>
                      )}
                      <span>
                        {row.refresh_posture.manual_app_plan_available
                          ? `Manual Co*Tive planning available for: ${row.refresh_posture.applicable_collection_sources.map((source) => `${source.source_id} (${source.automatic_refresh_reason_code.replaceAll("_", " ").toLowerCase()})`).join(", ")}.`
                          : "No applicable collection source is configured for this cell."}{" "}
                        Automatic refresh authorized:{" "}
                        {row.refresh_posture.automatic_refresh_authorized
                          ? "yes"
                          : "no"}
                        .
                      </span>
                      <span>
                        A refresh does not guarantee a newer publisher release
                        or resolution of this evidence gap.
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  No selected industry currently has an access or
                  temporal-review item. An empty selection does not imply
                  complete coverage.
                </p>
              )}
              <button type="button" onClick={downloadBacklog}>
                Download review batch JSON
              </button>
              <p className="operations-note">
                Revision {backlog.maintenance_revision} · fingerprint{" "}
                {backlog.backlog_sha256}.{" "}
                {"This deterministic batch is planning evidence only. It does not authorize acquisition, dispatch workers, change production, or measure business completeness."}
              </p>
            </section>
          )}
          <p className="operations-note">{view.semantics}</p>
        </>
      )}
    </section>
  );
}
