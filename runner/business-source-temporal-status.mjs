const DAY_MS = 24 * 60 * 60 * 1000;

const POLICY = (referenceFields, reviewAfterDays, cadenceClass, evidenceScope) => Object.freeze({
  reference_fields: Object.freeze(referenceFields),
  review_after_days: reviewAfterDays,
  cadence_class: cadenceClass,
  evidence_scope: evidenceScope,
});

export const BUSINESS_SOURCE_TEMPORAL_POLICY_VERSION = "1.0.0";

// review_after_days is an internal re-review control, not a claim about a publisher SLA.
export const BUSINESS_SOURCE_TEMPORAL_POLICIES = Object.freeze({
  ak_active_business_licenses: POLICY(["source_observed_through", "source_observed_from"], 45, "daily-or-periodic-active-license-snapshot", "source-active-license-evidence"),
  california_abc_active_issued_license_sites: POLICY(["source_modified_at"], 45, "daily-active-license-snapshot", "source-active-issued-license-evidence"),
  census_nonemployer_statistics: POLICY(["reference_year"], 1095, "annual-statistical-baseline", "annual-aggregate-not-current-named-business-evidence"),
  chicago_active_business_license_sites: POLICY(["source_filter_reference_date", "source_rows_updated_at"], 45, "current-active-license-filter", "source-current-active-license-evidence"),
  cms_nppes_organizations: POLICY(["source_through_date"], 75, "monthly-enumeration", "organization-enumeration-and-deactivation-evidence-not-general-operation"),
  co_business_registry_good_standing_or_delinquent_organizations: POLICY(["source_rows_updated_at"], 45, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  ct_business_registry_active_organizations: POLICY(["source_rows_updated_at"], 45, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  dc_basic_business_license_sites: POLICY(["source_refreshed_at"], 45, "periodic-active-license-snapshot", "source-active-license-evidence"),
  de_business_licenses_current: POLICY(["source_rows_updated_at"], 45, "periodic-current-license-snapshot", "source-current-license-evidence"),
  epa_echo_active_facilities: POLICY(["source_updated_at"], 45, "periodic-regulated-facility-snapshot", "program-active-regulated-facility-evidence-not-general-operation"),
  fdic_bankfind: POLICY(["source_updated_at"], 45, "periodic-current-institution-structure", "current-banking-structure-evidence"),
  fl_business_registry_quarterly_active_entities: POLICY(["source_modified_at"], 180, "quarterly-registration-snapshot", "legal-registration-status-not-general-operation"),
  fmcsa_active_us_company_census: POLICY(["source_updated_at"], 45, "periodic-motor-carrier-snapshot", "source-active-registration-evidence-not-general-operation"),
  fsis_active_mpi_establishments: POLICY(["source_date"], 75, "periodic-inspection-directory", "source-active-inspection-program-evidence"),
  ia_business_registry_active_entities: POLICY(["source_modified_at"], 75, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  irs_eo_bmf_organizations: POLICY(["source_posting_date"], 75, "monthly-exempt-organization-file", "tax-exempt-organization-filing-evidence-not-general-operation"),
  la_active_business_location_accounts: POLICY(["source_rows_updated_at"], 75, "periodic-local-tax-registration-snapshot", "source-defined-active-local-account-evidence"),
  ncua_quarterly_credit_unions: POLICY(["cycle_date"], 200, "quarterly-call-report", "quarterly-institution-and-location-evidence"),
  ny_business_registry_active_entities: POLICY(["source_rows_updated_at"], 45, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  ny_retail_food_store_license_sites: POLICY(["source_rows_updated_at"], 120, "periodic-retail-food-license-snapshot", "source-license-evidence-not-general-operation"),
  nyc_dcwp_active_license_sites: POLICY(["source_rows_updated_at"], 45, "periodic-active-premises-license-snapshot", "source-active-premises-license-evidence"),
  or_business_registry_active_registrations: POLICY(["source_rows_updated_at"], 45, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  pa_business_registry_active_registrations: POLICY(["source_rows_updated_at"], 75, "periodic-registration-snapshot", "legal-registration-status-not-general-operation"),
  tx_active_sales_tax_permit_outlets: POLICY(["source_rows_updated_at"], 45, "periodic-active-permit-snapshot", "source-active-sales-tax-permit-evidence"),
  usda_snap_retailers: POLICY(["source_updated_at"], 75, "periodic-program-authorization-snapshot", "source-current-program-authorization-evidence-not-general-operation"),
  wa_lni_active_contractor_organizations: POLICY(["source_rows_updated_at"], 45, "periodic-active-contractor-license-snapshot", "source-active-contractor-license-evidence-not-general-operation"),
});

const GENERIC_REFERENCE_FIELDS = Object.freeze([
  "source_observed_through",
  "source_filter_reference_date",
  "source_through_date",
  "source_refreshed_at",
  "source_rows_updated_at",
  "source_modified_at",
  "source_updated_at",
  "source_posting_date",
  "source_date",
  "cycle_date",
  "reference_year",
]);

function instant(value, field) {
  if (field === "reference_year") {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) return null;
    return `${year}-12-31T23:59:59.999Z`;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? `${value.trim()}T23:59:59.999Z`
    : value.trim();
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function sourceReference(releaseMetadata, fields) {
  for (const field of fields) {
    if (!Object.hasOwn(releaseMetadata, field)) continue;
    const normalized = instant(releaseMetadata[field], field);
    if (normalized) return { field, value: releaseMetadata[field], instant: normalized };
    return { field, value: releaseMetadata[field], instant: null };
  }
  return null;
}

function dateOnly(isoInstant) {
  return isoInstant?.slice(0, 10) ?? null;
}

export function assessBusinessSourceTemporalStatus(row, { asOf = new Date() } = {}) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  if (!Number.isFinite(asOfDate.getTime())) throw new Error("Business source temporal assessment requires a valid as-of instant.");
  const sourceKey = String(row?.source_key ?? "").trim();
  if (!sourceKey) throw new Error("Business source temporal assessment requires a source key.");
  const releaseMetadata = row?.release_metadata && typeof row.release_metadata === "object" && !Array.isArray(row.release_metadata)
    ? row.release_metadata
    : {};
  const policy = BUSINESS_SOURCE_TEMPORAL_POLICIES[sourceKey] ?? null;
  const reference = sourceReference(releaseMetadata, policy?.reference_fields ?? GENERIC_REFERENCE_FIELDS);
  const referenceTime = reference?.instant ? new Date(reference.instant).getTime() : null;
  const ageDays = referenceTime === null ? null : Math.floor((asOfDate.getTime() - referenceTime) / DAY_MS);
  let status;
  if (!policy) status = "unconfigured-source-policy";
  else if (!reference || !reference.instant) status = "missing-source-reference";
  else if (ageDays < -1) status = "future-source-reference";
  else if (ageDays > policy.review_after_days) status = "review-due";
  else status = "within-review-window";
  const reviewDue = reference?.instant && policy
    ? new Date(new Date(reference.instant).getTime() + policy.review_after_days * DAY_MS).toISOString()
    : null;
  const observation = row?.location_profile_geography ?? {};
  return {
    policy_version: BUSINESS_SOURCE_TEMPORAL_POLICY_VERSION,
    policy_configured: Boolean(policy),
    status,
    source_reference_field: reference?.field ?? null,
    source_reference_value: reference?.value ?? null,
    source_reference_at: reference?.instant ?? null,
    source_reference_date: dateOnly(reference?.instant),
    age_days: ageDays,
    review_after_days: policy?.review_after_days ?? null,
    review_due_date: dateOnly(reviewDue),
    cadence_class: policy?.cadence_class ?? "unconfigured",
    evidence_scope: policy?.evidence_scope ?? "unconfigured-source-semantics",
    general_business_operating_status_asserted: false,
    normalized_record_observation_window: {
      first_seen: observation.earliest_observed_at ?? null,
      last_seen: observation.latest_observed_at ?? null,
      meaning: "Registry profile observation time; not publisher source currency or proof of current operation.",
    },
  };
}

export function summarizeBusinessSourceTemporalStatus(rows) {
  const summary = {
    total_sources: rows.length,
    policy_configured: 0,
    within_review_window: 0,
    review_due: 0,
    missing_source_reference: 0,
    future_source_reference: 0,
    unconfigured_source_policy: 0,
    general_business_operating_status_asserted: 0,
  };
  for (const row of rows) {
    const temporal = row.temporal_status ?? row;
    if (temporal.policy_configured) summary.policy_configured += 1;
    const key = temporal.status?.replaceAll("-", "_");
    if (Object.hasOwn(summary, key)) summary[key] += 1;
    if (temporal.general_business_operating_status_asserted) summary.general_business_operating_status_asserted += 1;
  }
  return summary;
}
