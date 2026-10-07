"use client";

import { useEffect, useState } from "react";
import { runnerJson } from "./runner-client";

type Industry = { id: string; label: string };
type CaReadiness = {
  schema_version: "ca-childcare-status-readiness-view@1.1.0";
  state: "CA";
  industry: "childcare";
  status: "verified-aggregate-publisher-readiness";
  publisher_rows: number;
  publisher_status_counts: Record<
    "CLOSED" | "INACTIVE" | "LICENSED" | "ON PROBATION" | "PENDING",
    number
  >;
  publisher_open_status_candidate_rows: number;
  temporal: {
    publisher_file_date: "2025-05-25";
    preflight_observed_at: string;
    posture: "publisher-file-date-retained-catalog-backend-disagreement-unresolved";
    current_operation_verified: false;
  };
  source: { run_id: string; manifest_sha256: string };
  claims: {
    provider_rows_acquired: 0;
    current_operations_verified: false;
    statewide_completeness: null;
    business_count: null;
  };
  semantics: string;
};
type View = {
  industries: Industry[];
  maintainedIndustries: string[];
  semantics: string;
  revision: number;
};
type Backlog = {
  schema_version: "state-access-maintenance-backlog@2.7.0";
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
        | "official-dated-licensed-center-roster-and-open-data-api-identified-acquisition-disabled";
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
  "aba6e72ebcf280e926fd0bb1cf3d996b1ec4e1098292a8dca84f15cf47d36c27";
type IndustryEvidence = {
  schema_version: "state-access-industry-summary@1.3.0";
  report_sha256: string;
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
const exact = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a, Object.keys(a as object).sort()) ===
  JSON.stringify(b, Object.keys(b as object).sort());
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
      "source",
      "claims",
      "semantics",
    ])
  )
    return false;
  const value = input as CaReadiness;
  if (
    value.schema_version !== "ca-childcare-status-readiness-view@1.1.0" ||
    value.state !== "CA" ||
    value.industry !== "childcare" ||
    value.status !== "verified-aggregate-publisher-readiness" ||
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
      "publisher_file_date",
      "preflight_observed_at",
      "posture",
      "current_operation_verified",
    ]) ||
    value.temporal.publisher_file_date !== "2025-05-25" ||
    new Date(value.temporal.preflight_observed_at).toISOString() !==
      value.temporal.preflight_observed_at ||
    value.temporal.posture !==
      "publisher-file-date-retained-catalog-backend-disagreement-unresolved" ||
    value.temporal.current_operation_verified !== false ||
    !exact(value.source, ["run_id", "manifest_sha256"]) ||
    !/^[a-f0-9-]{36}$/.test(value.source.run_id) ||
    !/^[a-f0-9]{64}$/.test(value.source.manifest_sha256) ||
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
    v.schema_version !== "state-access-maintenance-backlog@2.7.0" ||
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
            "DC",
            "DE",
            "FL",
            "GA",
            "HI",
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
          ].includes(row.state) &&
          row.industry === "childcare" &&
          row.source_discovery.status ===
            ({
              AZ: "official-monthly-table-metadata-validated-acquisition-disabled",
              DC: "official-monthly-pdf-identified-offline-parser-required",
              DE: "official-public-domain-api-metadata-validated-acquisition-disabled",
              FL: "official-workbook-metadata-validated-acquisition-disabled",
              GA: "official-csv-export-contract-metadata-validated-acquisition-disabled",
              HI: "official-search-identified-automation-prohibited-bulk-interface-unverified",
              ID: "official-dual-workbook-metadata-identified-acquisition-disabled",
              IL: "official-manual-export-identified-automated-bulk-contract-unverified",
              IN: "official-current-provider-tables-export-format-unverified-acquisition-disabled",
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
            ].includes(row.state)
              ? 4
              : row.state === "ID"
                ? 6
                : ["DC", "FL", "GA", "IN", "MD"].includes(row.state)
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
            ].includes(row.state) &&
          row.source_discovery.supported_api_verified ===
            ["DE", "NJ"].includes(row.state) &&
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
          source.automatic_refresh_authorized === false &&
          typeof source.automatic_refresh_reason_code === "string",
      ) &&
      row.refresh_posture.manual_app_plan_available ===
        row.refresh_posture.applicable_collection_sources.length > 0 &&
      row.refresh_posture.automatic_refresh_authorized === false &&
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
      "jurisdictions",
      "industry_cells",
      "industries",
      "claims",
    ])
  )
    return false;
  const v = input as IndustryEvidence;
  if (
    v.schema_version !== "state-access-industry-summary@1.3.0" ||
    v.report_sha256 !== reportSha ||
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
    new Set(v.industries.map((x) => x.id)).size !== 9 ||
    !industryIds.every((id) => v.industries.some((x) => x.id === id))
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
      new Set(row.states.map((x) => x.state)).size !== 51 ||
      !states.every((state) => row.states.some((x) => x.state === state))
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
            typeof source.retained_observed_at !== "string")
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

export default function Administration() {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [evidence, setEvidence] = useState<IndustryEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);
  const [caReadiness, setCaReadiness] = useState<CaReadiness | null>(null);
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
    void runnerJson<unknown>(
      "/api/business-map/ca-childcare-status-readiness",
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted && validCaReadiness(value))
          setCaReadiness(value);
      })
      .catch(() => {});
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
      try {
        const next = await runnerJson<unknown>(
          "/api/administration/industry-backlog",
        );
        setBacklog(validAdministrationBacklog(next, value) ? next : null);
      } catch {
        setBacklog(null);
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
        <p>
          Choose which industry programs Co*Tive should maintain and review
          their current evidence status.
        </p>
      </div>
      <p className="scope-note">
        Industry status starts with the governed evidence already retained:
        source access by state, temporal review posture, and maintenance
        selection. It does not require an all-business denominator, complete
        geocodes, or complete nationwide industry coverage. This selection
        records local maintenance intent only;{" "}
        {
          "it does not authorize acquisition, start downloads, prove coverage, or change production enrollment."
        }
      </p>
      {error && (
        <p role="alert">
          Administration settings are unavailable. No selection was inferred.
        </p>
      )}
      {!view && !error && <p role="status">Loading maintained industries…</p>}
      {view && (
        <>
          <div className="administration-actions">
            <button
              type="button"
              onClick={() => setSelected(view.industries.map(({ id }) => id))}
            >
              Select all
            </button>
            <button type="button" onClick={() => setSelected([])}>
              Select none
            </button>
            <span>
              {selected.length} of {view.industries.length} selected
            </span>
            <span>
              {draftChanged
                ? "Unsaved draft — persisted selection is unchanged"
                : "Displayed selection is persisted"}
            </span>
          </div>
          <div
            className="maintenance-grid"
            role="group"
            aria-label="Industries selected for maintenance"
          >
            {view.industries.map((industry) => {
              const checked = selected.includes(industry.id);
              const status = evidence?.industries.find(
                (row) => row.id === industry.id,
              );
              return (
                <label
                  key={industry.id}
                  className={checked ? "maintained" : "not-maintained"}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((current) =>
                        checked
                          ? current.filter((id) => id !== industry.id)
                          : [...current, industry.id],
                      )
                    }
                  />
                  <span>
                    <strong>{industry.label}</strong>
                    <small>
                      {checked
                        ? "Enabled in draft maintenance selection"
                        : "Not selected in draft maintenance selection"}
                    </small>
                    {status ? (
                      <>
                        <small>
                          <strong>
                            {status.retained_access_evidence_percent.toFixed(1)}
                            %
                          </strong>{" "}
                          of jurisdictions (
                          {status.jurisdictions_with_retained_access_evidence}
                          /51) have retained source-access evidence; not
                          business completeness.
                        </small>
                        <small>
                          Temporal status:{" "}
                          {temporalStatuses
                            .map(
                              (key) =>
                                `${key.replaceAll("-", " ")}: ${status.temporal_status_counts[key]}`,
                            )
                            .join(" · ")}
                        </small>
                        <small>
                          Authorization not represented by this ledger;
                          maintenance selection grants none.
                        </small>
                      </>
                    ) : (
                      <small>
                        {evidenceError
                          ? "Industry evidence unavailable; unknown is preserved and no zero is inferred."
                          : "Verifying retained industry evidence…"}
                      </small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="operations-note">
            <strong>Status interpretation:</strong> the displayed percentage is
            the share of the 50 states and D.C. with retained source-access
            evidence for that industry. Missing evidence remains missing; it is
            not converted to zero and does not stop other industry or geography
            views.
          </p>
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
                Publisher file date: {caReadiness.temporal.publisher_file_date}{" "}
                · preflight observed{" "}
                {caReadiness.temporal.preflight_observed_at}. Catalog/backend
                temporal disagreement remains unresolved.
              </p>
              <p className="operations-note">
                {caReadiness.semantics} No provider rows were acquired by this
                aggregate preflight; statewide completeness and business count
                remain unknown.
              </p>
            </section>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={saving || !draftChanged}
            onClick={save}
          >
            {saving ? "Saving…" : "Save maintenance selection"}
          </button>
          {message && <p role="status">{message}</p>}
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
                {"This deterministic batch is planning evidence only."} It does
                not authorize acquisition, dispatch
                {
                  "does not authorize acquisition, dispatch workers, change production, or measure business completeness."
                }
              </p>
            </section>
          )}
          <p className="operations-note">{view.semantics}</p>
        </>
      )}
    </section>
  );
}
