import pin from "../config/national-status-contract.json" with { type: "json" };

export const exact = (v, keys) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export const equal = (v, ref) =>
  Array.isArray(ref)
    ? Array.isArray(v) &&
      v.length === ref.length &&
      ref.every((r, i) => equal(v[i], r))
    : ref !== null && typeof ref === "object"
      ? exact(v, Object.keys(ref)) &&
        Object.entries(ref).every(([k, r]) => equal(v[k], r))
      : v === ref;
export const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const sum = (values) => values.reduce((n, v) => n + v, 0);
export const percent = (n, d) =>
  d ? Number(((n / d) * 100).toFixed(1)) : null;
export const evidenceStatuses = [
  "evidence-present",
  "measured-zero",
  "source-did-not-publish-for-zip",
  "outside-source-evidence-union",
  "outside-source-denominator",
  "absent-from-retained-source-rows",
  "unavailable",
];
const temporalKeys = [
  "source_key",
  "source_release_id",
  "source_reference_at",
  "review_due_at",
  "review_qualification",
  "semantic_class",
  "source_status_term",
];
const boundedString = (v) =>
  typeof v === "string" && v.length > 0 && v.length <= 1000;
const connectorReadinessPins = Object.freeze({
  IL: Object.freeze(["config/connectors/il-business-registry.json", "af068da74c95ef81d5e79fb4bd9b5670f1cc9b17c54da22b06f2996667b6777c", "config/source-policies/il-business-registry.json", "b5c71332111005c3c78829bb0672adefa5e651312abb3673d101beaeee505be8", "config/state-business-source-assessments/il-2026-10-03.json", "58905b77a08494fd381654805bff0e70f73d08307355ef3b61ab94ef1264f323", 5]),
  KY: Object.freeze(["config/connectors/kentucky-business-entity-bulk-offline.json", "8b27d9ca6e9bcaca24f21b1cbdacbd8fb61812c172f81fdbe6b741a1812d1cfe", "config/source-policies/kentucky-business-entity-bulk-offline.json", "bbb13a97a2e51d03db5857edc4287e98412547432b78615933ed8580fd42735a", "config/state-business-source-assessments/ky-2026-10-03.json", "b8fc32faef8aa47ab9cdfddac3323d43bb66716b7bc9ac87690792804e37c5c7", 1]),
  MS: Object.freeze(["config/connectors/mississippi-business-report-offline.json", "e8264e06f02dc7823c6752fb7dbb88a3975e220c7ae6d37d4107eeedcffebf78", "config/source-policies/mississippi-business-report-offline.json", "84e535a5282b8f1b7c6d847d4d146b98a92b9be38cfe8fe2bd938a6b1cae90b1", "config/state-business-source-assessments/ms-2026-10-03.json", "85e1c6bd5565935bcfd381c12b9dec665638f0aad23e7b68dfe70b47d6b477f9", 2]),
  OK: Object.freeze(["config/connectors/ok-business-bulk-offline.json", "3bb356dc4eb90f12535afbb831694ef0d9bb3a907134a4e22da5ac5494f9f7ad", "config/source-policies/ok-business-entities-bulk.json", "b7f7f5c163e69ef366be66bdd864bb8d2376b39010a549c5eec874df4acf1aa4", "config/state-business-source-assessments/ok-2026-10-03.json", "47f1766d065e562b2c6d648b65055039beb583a13328322ec715c3fe7f514da1", 1]),
  UT: Object.freeze(["config/connectors/utah-business-list-offline.json", "106122b84872d1f03e8791604fa031d0abb3fd34181d0e0708340a4e63ba6ec4", "config/source-policies/utah-business-list-offline.json", "ea2bb05d93839e4d3185196761f3e31b3ccc54a670001fe9ed742beb732d7800", "config/state-business-source-assessments/ut-2026-10-03.json", "b06b5aa95d2c28cd3beedf36db689da340120fe283f5317e5725e1241fe114a7", 3]),
  MN: Object.freeze(["config/connectors/mn-active-business-data-zero-row.json", "0bc61a740f39d661b134de5019c92d8be644a067a6eda91778200300ea6803bf", "config/source-policies/mn-active-business-data-zero-row.json", "fb73c5174ad47b55f596273558ec20e869e69bed0d1531c856c9153b1b3ad69c", "config/state-business-source-assessments/mn-2026-10-03.json", "4a5eb48bd386a971a573a2cb8efddbc0c91e47dd70bfbdeab51d384d001ed065", 0]),
});
function validConnectorReadiness(value, state, gates) {
  const expected = connectorReadinessPins[state];
  if (!expected) return value === null;
  return exact(value, ["schema_version", "status", "readiness_kind", "connector_path", "connector_sha256", "policy_path", "policy_sha256", "assessment_path", "assessment_sha256", "required_source_files", "source_rows_read", "network_requests", "actions_performed", "unresolved_gates", "broad_layer_gap_resolved", "authority"])
    && value.schema_version === "broad-organization-connector-readiness@1.0.0"
    && value.status === "zero-row-ready-gap-unresolved"
    && value.readiness_kind === (state === "MN" ? "documentation-header-only-zero-row" : "operator-package-offline-connector")
    && equal([value.connector_path, value.connector_sha256, value.policy_path, value.policy_sha256, value.assessment_path, value.assessment_sha256, value.required_source_files], expected)
    && value.source_rows_read === 0 && value.network_requests === 0 && value.actions_performed === 0
    && value.broad_layer_gap_resolved === false && equal(value.unresolved_gates, gates)
    && exact(value.authority, ["acquisition_authorized", "row_bearing_preflight_authorized", "publication_authorized", "national_admission_authorized", "production_change_authorized"])
    && Object.values(value.authority).every(flag => flag === false);
}
export function validTemporal(v) {
  return (
    exact(v, temporalKeys) &&
    temporalKeys
      .filter((k) => !["review_qualification", "semantic_class"].includes(k))
      .every((k) => v[k] === null || boundedString(v[k])) &&
    ["within-review-window", "stale", "unmeasured", "unmapped"].includes(
      v.review_qualification,
    ) &&
    [
      "source-defined-current",
      "non-active-reporting",
      "annual-aggregate",
      "linkage-readiness",
      "publisher-active-snapshot",
      "unknown-source-status",
      "unmapped",
    ].includes(v.semantic_class)
  );
}
export function validTemporalAssessment(value) {
  return (
    equal(value, pin.temporal_assessment) &&
    [
      "exact-zip-industry-temporal-summary-projection@3.3.0",
      "exact-zip-industry-temporal-summary-projection@3.4.0",
    ].includes(value.schema_version) &&
    value.matrix_release_id === pin.matrix_provenance.release_id &&
    value.matrix_manifest_sha256 === pin.matrix_provenance.manifest_sha256 &&
    value.source_dimensions === pin.dimension_order.length &&
    /^[a-f0-9]{64}$/.test(value.projection_sha256) &&
    [
      value.dimension_counts,
      value.semantic_dimension_counts,
      value.retained_assessment_dimension_counts,
    ].every(
      (counts) =>
        Object.values(counts).every(integer) &&
        sum(Object.values(counts)) === value.source_dimensions,
    )
  );
}
const common = (v) =>
  v.schema_version === pin.schema_version &&
  equal(v.claims, pin.claims) &&
  exact(v.provenance, [
    "release_id",
    "manifest_sha256",
    "created_at",
    "artifact_sha256",
    "verification_scope",
  ]) &&
  v.provenance.release_id === pin.release_id &&
  v.provenance.manifest_sha256 === pin.manifest_sha256 &&
  /^[a-f0-9]{64}$/.test(v.provenance.artifact_sha256) &&
  boundedString(v.provenance.created_at) &&
  v.provenance.verification_scope ===
    "Pinned retained aggregate bytes and closed count reconciliation; full replay was verified at publication.";
export function validIndustryRow(row, state) {
  const scope = pin.state_scopes[state];
  if (
    !scope ||
    !exact(row, [
      "schema_version",
      "state",
      "scope_id",
      "scope_semantics",
      "zip5_rows",
      "id",
      "mapped_dimensions",
      "dimensions_with_retained_evidence",
      "dimension_evidence_availability_percent",
      "measured_zip_dimension_cells",
      "zip_dimension_cell_denominator",
      "exact_zip_measurement_reach_percent",
      "dimensions",
    ]) ||
    row.schema_version !==
      "national-goal-evidence-federation-state-industry@1.0.0" ||
    row.state !== state ||
    row.scope_id !== scope.scope_id ||
    row.zip5_rows !== scope.zip5_rows ||
    row.scope_semantics !==
      "dominant Census ZCTA polygon overlay; excludes material cross-state, unresolved and non-ZCTA cohorts" ||
    !pin.industries.includes(row.id)
  )
    return false;
  const ids = pin.industry_dimensions[row.id];
  if (
    !Array.isArray(row.dimensions) ||
    row.dimensions.length !== ids.length ||
    row.mapped_dimensions !== ids.length ||
    row.zip_dimension_cell_denominator !== scope.zip5_rows * ids.length ||
    !integer(row.measured_zip_dimension_cells)
  )
    return false;
  for (const [i, d] of row.dimensions.entries()) {
    if (
      !exact(d, [
        "id",
        "measured_zip_dimension_cells",
        "positive_zip_dimension_cells",
        "disposition_counts",
        "temporal_qualification",
      ]) ||
      d.id !== ids[i] ||
      !exact(d.disposition_counts, evidenceStatuses) ||
      !Object.values(d.disposition_counts).every(integer) ||
      sum(Object.values(d.disposition_counts)) !== scope.zip5_rows ||
      d.measured_zip_dimension_cells !==
        d.disposition_counts["evidence-present"] +
          d.disposition_counts["measured-zero"] ||
      d.positive_zip_dimension_cells !==
        d.disposition_counts["evidence-present"] ||
      !validTemporal(d.temporal_qualification)
    )
      return false;
  }
  const available = row.dimensions.filter(
    (d) => d.measured_zip_dimension_cells > 0,
  ).length;
  return (
    row.measured_zip_dimension_cells ===
      sum(row.dimensions.map((d) => d.measured_zip_dimension_cells)) &&
    row.dimensions_with_retained_evidence === available &&
    row.dimension_evidence_availability_percent ===
      percent(available, ids.length) &&
    row.exact_zip_measurement_reach_percent ===
      percent(
        row.measured_zip_dimension_cells,
        row.zip_dimension_cell_denominator,
      )
  );
}
/** @param {*} v @param {string|null} [state] */
function validateNationalStatus(v, state = null) {
  if (
    !v ||
    !common(v) ||
    v.provenance.created_at !== pin.created_at ||
    v.provenance.artifact_sha256 !==
      pin.artifact_sha256[
        v.kind === "summary"
          ? "national-summary.json"
          : v.kind === "state"
            ? "state-industry-status.jsonl"
            : `zip-status/prefix=${typeof v.zip5 === "string" ? v.zip5.slice(0, 2) : ""}.jsonl.gz`
      ]
  )
    return false;
  if (v.kind === "state")
    return (
      exact(v, [
        "schema_version",
        "kind",
        "state",
        "industries",
        "lifecycle_industry_jurisdiction",
        "broad_gap_authorization",
        "claims",
        "provenance",
      ]) &&
      v.state === state &&
      Object.hasOwn(pin.state_scopes, v.state) &&
      Array.isArray(v.industries) &&
      v.industries.length === 9 &&
      v.industries.every(
        (row, i) =>
          row.id === pin.industries[i] && validIndustryRow(row, v.state),
      ) &&
      v.lifecycle_industry_jurisdiction?.scope_kind === "state" &&
      v.lifecycle_industry_jurisdiction.postal_abbreviation === v.state &&
      v.lifecycle_industry_jurisdiction.industries?.length === 9 &&
      v.lifecycle_industry_jurisdiction.industries.every(
        (row, i) =>
          row.industry_id === pin.industries[i] &&
          integer(row.source_assignment_count),
      ) &&
      (v.broad_gap_authorization === null ||
        (exact(v.broad_gap_authorization, ["status", "decision", "assessment_id", "observed_at", "wave", "gate_count", "gate_keys", "required_exclusions", "strongest_bounded_next_action", "authority", "connector_readiness"]) &&
          v.broad_gap_authorization.status === "current-broad-gap" &&
          v.broad_gap_authorization.decision === "hold" &&
          integer(v.broad_gap_authorization.wave) &&
          integer(v.broad_gap_authorization.gate_count) &&
          v.broad_gap_authorization.gate_count ===
            v.broad_gap_authorization.gate_keys?.length &&
          v.broad_gap_authorization.required_exclusions?.length > 0 &&
          typeof v.broad_gap_authorization.strongest_bounded_next_action ===
            "string" &&
          Object.values(v.broad_gap_authorization.authority).every(
            (value) => value === false,
          ) &&
          validConnectorReadiness(v.broad_gap_authorization.connector_readiness, v.state, v.broad_gap_authorization.gate_keys)))
    );
  if (v.kind === "summary") {
    if (
      !exact(v, [
        "schema_version",
        "kind",
        "zip5_cohort_rows",
        "source_dimensions",
        "matrix_evidence_cells",
        "state_industry_rows",
        "temporal_assessment",
        "geography_scope_counts",
        "gaps",
        "industry_evidence_metrics",
        "territories",
        "geography_relationship_quality",
        "source_policy_provenance",
        "publisher_membership_reconciliation",
        "state_registration_license_supplemental",
        "irs_eo_supplemental",
        "lifecycle_industry_zip",
        "lifecycle_industry_jurisdiction",
        "broad_gap_authorization",
        "census_zbp_zip_profile_index",
        "entity_resolution",
        "claims",
        "provenance",
      ]) ||
      v.zip5_cohort_rows !== 48194 ||
      v.source_dimensions !== 51 ||
      v.matrix_evidence_cells !== v.zip5_cohort_rows * v.source_dimensions ||
      v.state_industry_rows !== 459 ||
      !validTemporalAssessment(v.temporal_assessment) ||
      !equal(v.geography_scope_counts, pin.geography_scope_counts) ||
      sum(Object.values(v.geography_scope_counts)) !== v.zip5_cohort_rows ||
      !equal(v.gaps, pin.gaps)
    )
      return false;
    const lifecycleIndustry = v.lifecycle_industry_zip,
      li = pin.lifecycle_industry_zip;
    if (
      !exact(lifecycleIndustry, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "manifest_sha256",
        "summary_artifact_sha256",
        "outside_cohort_artifact_sha256",
        "summary",
        "scope",
        "claims",
      ]) ||
      lifecycleIndustry.release_id !== li.release_id ||
      lifecycleIndustry.registration_sha256 !== li.registration_sha256 ||
      lifecycleIndustry.manifest_sha256 !== li.manifest_sha256 ||
      lifecycleIndustry.summary_artifact_sha256 !==
        li.summary_artifact_sha256 ||
      lifecycleIndustry.outside_cohort_artifact_sha256 !==
        li.outside_cohort_artifact_sha256 ||
      lifecycleIndustry.summary.zip5_rows !== 48194 ||
      lifecycleIndustry.summary.positive_zip5_rows !== 42267 ||
      lifecycleIndustry.summary.zero_profile_zip5_rows !== 5927 ||
      lifecycleIndustry.summary.source_membership_count !== 8011213 ||
      lifecycleIndustry.summary.mapped_source_record_union_count !== 6780627 ||
      lifecycleIndustry.summary.unresolved_source_record_count !== 1230586 ||
      lifecycleIndustry.summary.industry_assignment_count !== 6782745 ||
      Object.values(lifecycleIndustry.summary.lifecycle_evidence_counts).reduce(
        (total, value) => total + value,
        0,
      ) !== 8011213 ||
      Object.values(lifecycleIndustry.summary.review_status_counts).reduce(
        (total, value) => total + value,
        0,
      ) !== 8011213 ||
      Object.values(lifecycleIndustry.summary.source_counts).reduce(
        (total, value) => total + value,
        0,
      ) !== 8011213 ||
      lifecycleIndustry.summary.epa_refinement.source_record_count !== 1517826 ||
      lifecycleIndustry.summary.epa_refinement.segment_assignments !== 296595 ||
      lifecycleIndustry.summary.epa_refinement.multisegment_records !== 2107 ||
      lifecycleIndustry.summary.epa_refinement.records_partially_unmapped !==
        25035 ||
      lifecycleIndustry.claims.industry_assignments_additive !== false ||
      lifecycleIndustry.claims.unique_business_count !== null ||
      lifecycleIndustry.claims.current_operation_verified !== false ||
      lifecycleIndustry.claims.all_business_completeness !== null
    )
      return false;
    const resolution = v.entity_resolution,
      er = pin.entity_resolution;
    if (
      !exact(resolution, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "pointer_sha256",
        "manifest_sha256",
        "status",
        "artifact_count",
        "artifact_bytes",
        "coverage",
        "benchmark",
        "scope",
        "claims",
      ]) ||
      resolution.release_id !== er.release_id ||
      resolution.registration_sha256 !== er.registration_sha256 ||
      resolution.pointer_sha256 !== er.pointer_sha256 ||
      resolution.manifest_sha256 !== er.manifest_sha256 ||
      resolution.status !== "published-reviewable-partial" ||
      resolution.artifact_count !== 101 ||
      resolution.artifact_bytes !== 412615462 ||
      !equal(resolution.coverage, {
        profiles: 8011213,
        address_groups: 6505053,
        multi_member_street_address_groups: 876076,
        site_alias_decisions: 2325053,
        establishment_alias_decisions: 146828,
        review_candidate_decisions: 106431,
        review_groups_skipped_for_size: 2,
      }) ||
      resolution.benchmark.release_id !== er.benchmark_release_id ||
      resolution.benchmark.registration_sha256 !==
        er.benchmark_registration_sha256 ||
      resolution.benchmark.pointer_sha256 !== er.benchmark_pointer_sha256 ||
      resolution.benchmark.manifest_sha256 !== er.benchmark_manifest_sha256 ||
      resolution.benchmark.status !== "awaiting-independent-labels" ||
      resolution.benchmark.total_sampled_candidates !== 1275 ||
      resolution.benchmark.submitted_labels !== 0 ||
      resolution.benchmark.benchmark_gate_passed !== false ||
      resolution.benchmark.complete_labeled_benchmark !== false ||
      resolution.benchmark.automatic_precision_gate_passed !== false ||
      resolution.benchmark.export_authorized !== false ||
      !equal(resolution.claims, {
        unique_businesses: null,
        verified_active_businesses: null,
        current_operation_verified: false,
        ownership_inferred: false,
        parent_relationships_inferred: false,
        complete_entity_resolution: false,
        benchmark_accepted: false,
        export_authorized: false,
        network_requests: 0,
        acquisition_performed: false,
        current_pointer_written: false,
        production_enrollment: false,
      })
    )
      return false;
    const broadGap = v.broad_gap_authorization,
      bg = pin.broad_gap_authorization;
    if (
      !exact(broadGap, [
        "schema_version",
        "release_id",
        "manifest_sha256",
        "artifact_sha256",
        "observed_at",
        "state_count",
        "wave_count",
        "gate_item_count",
        "distinct_gate_key_count",
        "states",
        "authority",
        "scope",
      ]) ||
      broadGap.release_id !== bg.release_id ||
      broadGap.manifest_sha256 !== bg.manifest_sha256 ||
      broadGap.artifact_sha256 !== bg.artifact_sha256 ||
      broadGap.state_count !== 40 ||
      broadGap.wave_count !== 4 ||
      broadGap.gate_item_count !== 371 ||
      broadGap.distinct_gate_key_count !== 121 ||
      broadGap.states?.length !== 40 ||
      broadGap.states.reduce((n, row) => n + row.gate_count, 0) !== 371 ||
      new Set(broadGap.states.flatMap((row) => row.gate_keys)).size !== 121 ||
      broadGap.states.some(
        (row) =>
          row.decision !== "hold" ||
          row.gate_count !== row.gate_keys.length ||
          Object.values(row.authority).some((value) => value !== false),
      ) ||
      Object.values(broadGap.authority).some((value) => value !== false)
    )
      return false;
    const zbpIndex = v.census_zbp_zip_profile_index,
      zbp = pin.census_zbp_zip_profile_index;
    if (
      !exact(zbpIndex, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "manifest_sha256",
        "reference_year",
        "source_rows",
        "indexed_zip_count",
        "artifact_count",
        "artifact_bytes",
        "artifact_inventory_sha256",
        "scope",
        "claims",
      ]) ||
      zbpIndex.release_id !== zbp.release_id ||
      zbpIndex.registration_sha256 !== zbp.registration_sha256 ||
      zbpIndex.manifest_sha256 !== zbp.manifest_sha256 ||
      zbpIndex.reference_year !== 2023 ||
      zbpIndex.source_rows !== 2974116 ||
      zbpIndex.indexed_zip_count !== 37828 ||
      zbpIndex.artifact_count !== 20 ||
      zbpIndex.artifact_bytes !== 2015507248 ||
      zbpIndex.artifact_inventory_sha256 !== zbp.artifact_inventory_sha256 ||
      zbpIndex.claims.export_policy !== "local-review-only" ||
      zbpIndex.claims.current_operations_verified !== false ||
      zbpIndex.claims.current_operating_business_count !== null ||
      zbpIndex.claims.all_business_completion_percent !== null ||
      zbpIndex.claims.zip4 !== null
    )
      return false;
    const lifecycleJurisdiction = v.lifecycle_industry_jurisdiction,
      lj = pin.lifecycle_industry_jurisdiction;
    if (
      lifecycleJurisdiction.release_id !== lj.release_id ||
      lifecycleJurisdiction.registration_sha256 !== lj.registration_sha256 ||
      lifecycleJurisdiction.manifest_sha256 !== lj.manifest_sha256 ||
      lifecycleJurisdiction.jurisdictions_artifact_sha256 !==
        lj.jurisdictions_artifact_sha256 ||
      lifecycleJurisdiction.summary.scope_rows !== 60 ||
      lifecycleJurisdiction.summary.state_scope_rows !== 51 ||
      lifecycleJurisdiction.summary.territory_scope_rows !== 5 ||
      lifecycleJurisdiction.summary.special_scope_rows !== 4 ||
      lifecycleJurisdiction.summary.zip5_rows !== 48194 ||
      lifecycleJurisdiction.summary.source_membership_count !== 8011213 ||
      lifecycleJurisdiction.summary.industry_assignment_count !== 6782745 ||
      lifecycleJurisdiction.claims.industry_assignments_additive !== false ||
      lifecycleJurisdiction.claims.usps_zip_state_assignment !== false ||
      lifecycleJurisdiction.claims.unique_business_count !== null
    )
      return false;
    const irs = v.irs_eo_supplemental,
      ir = pin.irs_eo_supplemental;
    if (
      !exact(irs, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "manifest_sha256",
        "summary_artifact_sha256",
        "scope_artifact_sha256",
        "reported_jurisdictions_artifact_sha256",
        "summary",
        "review",
        "scope",
        "claims",
      ]) ||
      irs.release_id !== ir.release_id ||
      irs.registration_sha256 !== ir.registration_sha256 ||
      irs.manifest_sha256 !== ir.manifest_sha256 ||
      irs.summary_artifact_sha256 !== ir.summary_artifact_sha256 ||
      irs.scope_artifact_sha256 !== ir.scope_artifact_sha256 ||
      irs.reported_jurisdictions_artifact_sha256 !==
        ir.reported_jurisdictions_artifact_sha256 ||
      !equal(irs.summary, {
        zip5_rows: 48194,
        positive_zip5_rows: 36950,
        organization_membership_count: 1955841,
        geography_disposition_scope_rows: 60,
        reported_filing_address_jurisdiction_rows: 56,
        evidence_kind: "supplemental-non-active-reporting-membership",
        industry: "tax-exempt-organizations",
        review_status: "stale",
      }) ||
      irs.claims.unique_business_count !== null ||
      irs.claims.current_operation_verified !== false ||
      irs.claims.all_business_completeness !== null ||
      irs.claims.additive_to_business_or_industry_totals !== false ||
      irs.claims
        .geography_disposition_and_reported_jurisdiction_are_separate !== true
    )
      return false;
    const q = v.geography_relationship_quality,
      p = pin.geography_relationship_quality;
    if (
      !exact(q, [
        "profile_count",
        "postal_relationship_counts",
        "point_relationship_counts",
        "reported_state_conflict_count",
        "scope",
        "claims",
        "release_id",
        "manifest_sha256",
      ]) ||
      q.profile_count !== p.profile_count ||
      !equal(q.postal_relationship_counts, p.postal_relationship_counts) ||
      !equal(q.point_relationship_counts, p.point_relationship_counts) ||
      q.reported_state_conflict_count !== p.reported_state_conflict_count ||
      q.release_id !== p.release_id ||
      q.manifest_sha256 !== p.manifest_sha256 ||
      q.scope !==
        "Aggregate relationship quality for the registry profile cohort; non-numerator and separate from ZIP5 evidence dimensions." ||
      !exact(q.claims, [
        "numerator",
        "denominator",
        "entity_assignment",
        "polygon_assignment",
        "usps_validity_verified",
        "current_operation_verified",
        "geocode_verified",
        "business_completeness",
        "acquisition_performed",
        "production_enrollment",
        "current_pointer_written",
        "network_requests",
      ]) ||
      q.claims.numerator !== false ||
      q.claims.denominator !== false ||
      q.claims.business_completeness !== null ||
      q.claims.network_requests !== 0
    )
      return false;
    const sp = v.source_policy_provenance,
      la = v.publisher_membership_reconciliation;
    if (
      !exact(sp, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "manifest_sha256",
        "artifact_sha256",
        "assessment_as_of",
        "source_count",
        "profile_count",
        "export_profile_counts",
        "policy_coverage",
        "scope",
        "boundaries",
        "claims",
      ]) ||
      !exact(sp.export_profile_counts, ["public", "local-review-only"]) ||
      !exact(sp.policy_coverage, ["covered_sources", "total_sources"]) ||
      !exact(sp.boundaries, [
        "authorization",
        "acquisition",
        "current_operation",
        "export",
      ]) ||
      !exact(sp.claims, [
        "numerator",
        "denominator",
        "authorization_granted",
        "acquisition_performed",
        "current_operation_verified",
        "active_business_eligible",
        "production_enrollment",
        "current_pointer_written",
        "network_requests",
      ]) ||
      sp.release_id !== pin.source_policy_provenance.release_id ||
      sp.registration_sha256 !==
        pin.source_policy_provenance.registration_sha256 ||
      sp.manifest_sha256 !== pin.source_policy_provenance.manifest_sha256 ||
      sp.artifact_sha256 !== pin.source_policy_provenance.artifact_sha256 ||
      sp.source_count !== 15 ||
      sp.profile_count !== 8011213 ||
      sp.export_profile_counts.public !== 6161216 ||
      sp.export_profile_counts["local-review-only"] !== 1849997 ||
      sp.export_profile_counts.public +
        sp.export_profile_counts["local-review-only"] !==
        sp.profile_count ||
      sp.policy_coverage.covered_sources !== 15 ||
      sp.policy_coverage.total_sources !== 15 ||
      sp.claims.numerator !== false ||
      sp.claims.authorization_granted !== false ||
      sp.claims.current_operation_verified !== false
    )
      return false;
    if (
      !exact(la, [
        "schema_version",
        "registration_sha256",
        "source_rows",
        "normalized_profiles",
        "quarantined_rows",
        "quarantine_reasons",
        "effective_source_classification_counts",
        "publisher_assertion",
        "row_status",
        "lifecycle_evidence",
        "active_business_eligible_count",
        "current_operations_verified",
        "active_business_count",
        "completeness_percentage",
        "upstream_hashes",
        "scope",
        "claims",
      ]) ||
      !exact(la.quarantine_reasons, [
        "invalid_or_unmapped_zip",
        "missing_address",
      ]) ||
      !exact(la.effective_source_classification_counts, [
        "source-defined-current-membership",
        "non-active-reporting-membership",
        "annual-aggregate",
        "unknown-source-status",
      ]) ||
      !exact(la.upstream_hashes, [
        "prior_reconciliation_registration_sha256",
        "la_pointer_sha256",
        "la_manifest_sha256",
        "source_artifact_sha256",
        "source_summary_sha256",
      ]) ||
      !exact(la.claims, [
        "numerator",
        "denominator",
        "inference_performed",
        "network_requests",
        "production_enrollment",
        "current_pointer_written",
      ]) ||
      la.registration_sha256 !==
        pin.publisher_membership_reconciliation.registration_sha256 ||
      la.source_rows !== 633782 ||
      la.normalized_profiles !== 633232 ||
      la.quarantined_rows !== 550 ||
      la.source_rows !== la.normalized_profiles + la.quarantined_rows ||
      la.quarantine_reasons.invalid_or_unmapped_zip !== 465 ||
      la.quarantine_reasons.missing_address !== 85 ||
      !equal(la.effective_source_classification_counts, {
        "source-defined-current-membership": 21,
        "non-active-reporting-membership": 7,
        "annual-aggregate": 1,
        "unknown-source-status": 1,
      }) ||
      la.publisher_assertion !== "active-list-membership-without-row-status" ||
      la.row_status !== null ||
      la.lifecycle_evidence !== "unknown" ||
      la.active_business_eligible_count !== 0 ||
      la.current_operations_verified !== false ||
      la.active_business_count !== null ||
      la.completeness_percentage !== null ||
      la.claims.inference_performed !== false
    )
      return false;
    const supplemental = v.state_registration_license_supplemental,
      sr = pin.state_registration_license_supplemental;
    if (
      !exact(supplemental, [
        "schema_version",
        "release_id",
        "registration_sha256",
        "manifest_sha256",
        "summary_artifact_sha256",
        "scope_artifact_sha256",
        "issuer_marginals_artifact_sha256",
        "summary",
        "scope",
        "claims",
      ]) ||
      supplemental.release_id !== sr.release_id ||
      supplemental.registration_sha256 !== sr.registration_sha256 ||
      supplemental.manifest_sha256 !== sr.manifest_sha256 ||
      supplemental.summary_artifact_sha256 !== sr.summary_artifact_sha256 ||
      supplemental.scope_artifact_sha256 !== sr.scope_artifact_sha256 ||
      supplemental.issuer_marginals_artifact_sha256 !==
        sr.issuer_marginals_artifact_sha256 ||
      !equal(supplemental.summary, {
        zip5_rows: 48194,
        positive_zip5_rows: 31050,
        zero_zip5_rows: 17144,
        geography_disposition_scope_rows: 60,
        issuer_state_marginal_rows: 9,
        dimension_rows: 10,
        evidence_class_rows: 5,
        source_address_row_count: 14414724,
        eligible_address_membership_count: 10014807,
        missing_or_ineligible_address_membership_count: 4399917,
      }) ||
      supplemental.claims.cross_source_additivity_asserted !== false ||
      supplemental.claims.additive_business_count_asserted !== false ||
      supplemental.claims.unique_business_count !== null ||
      supplemental.claims.current_operation_verified !== false ||
      supplemental.claims.all_business_completeness !== null
    )
      return false;
    if (
      !Array.isArray(v.industry_evidence_metrics) ||
      v.industry_evidence_metrics.length !== 9 ||
      !v.industry_evidence_metrics.every(
        (row, i) =>
          exact(row, [
            "industry",
            "mapped_dimensions",
            "measured_zip_dimension_cells",
            "zip_dimension_cell_denominator",
            "exact_zip_measurement_reach_percent",
            "scope",
          ]) &&
          row.industry === pin.industries[i] &&
          row.mapped_dimensions ===
            pin.industry_dimensions[row.industry].length &&
          row.zip_dimension_cell_denominator ===
            33455 * row.mapped_dimensions &&
          integer(row.measured_zip_dimension_cells) &&
          row.measured_zip_dimension_cells <=
            row.zip_dimension_cell_denominator &&
          row.exact_zip_measurement_reach_percent ===
            percent(
              row.measured_zip_dimension_cells,
              row.zip_dimension_cell_denominator,
            ) &&
          row.scope === "33455 governed dominant-state Census ZCTA cohort rows",
      )
    )
      return false;
    return (
      Array.isArray(v.territories) &&
      v.territories.length === 5 &&
      v.territories.every(
        (row, i) =>
          exact(row, [
            "code",
            "scope_id",
            "zip5_rows",
            "included_in_state_denominator",
          ]) &&
          row.code === ["AS", "GU", "MP", "PR", "VI"][i] &&
          row.scope_id ===
            [
              "territory:60",
              "territory:66",
              "territory:69",
              "territory:72",
              "territory:78",
            ][i] &&
          row.zip5_rows === pin.geography_scope_counts[row.scope_id] &&
          row.included_in_state_denominator === false,
      )
    );
  }
  if (v.kind === "zip") {
    if (
      !exact(v, [
        "schema_version",
        "kind",
        "zip5",
        "zip4",
        "found",
        "cohort_classification",
        "zcta_geoid",
        "usps_validity",
        "geography_scope",
        "overlay",
        "dimensions",
        "census_zbp_profile",
        "claims",
        "provenance",
      ]) ||
      v.zip5 !== state ||
      !/^\d{5}$/.test(v.zip5) ||
      v.zip4 !== null ||
      v.usps_validity !== null ||
      typeof v.found !== "boolean"
    )
      return false;
    const zbp = v.census_zbp_profile,
      present = zbp?.status === "present";
    if (
      !exact(zbp, [
        "status",
        "profile_status",
        "reference_year",
        "employer_baseline",
        "all_industry",
        "published_industry_row_count",
        "postal_label",
        "geography",
        "provenance",
        "claims",
      ]) ||
      !["present", "absent-from-selected-zbp-zip-union"].includes(zbp.status) ||
      zbp.reference_year !== 2023 ||
      !integer(zbp.published_industry_row_count) ||
      zbp.provenance.release_id !== pin.census_zbp_zip_profile_index.release_id ||
      zbp.provenance.manifest_sha256 !==
        pin.census_zbp_zip_profile_index.manifest_sha256 ||
      zbp.provenance.registration_sha256 !==
        pin.census_zbp_zip_profile_index.registration_sha256 ||
      !equal(zbp.claims, {
        export_policy: "local-review-only",
        current_operations_verified: false,
        named_businesses: false,
        completion_percent: null,
        census_zip_zcta_is_usps_validity: false,
        zip4: null,
      }) ||
      present !== (zbp.profile_status !== null) ||
      (!present &&
        (zbp.employer_baseline !== null ||
          zbp.all_industry !== null ||
          zbp.postal_label !== null ||
          zbp.geography !== null ||
          zbp.published_industry_row_count !== 0)) ||
      (present &&
        (!["published-industry-rows", "no-published-industry-rows"].includes(
          zbp.profile_status,
        ) ||
          !exact(zbp.employer_baseline, [
            "status",
            "establishments",
            "employment",
            "employment_suppression_code",
            "first_quarter_payroll_thousands_usd",
            "first_quarter_payroll_suppression_code",
            "annual_payroll_thousands_usd",
            "annual_payroll_suppression_code",
          ]) ||
          !(
            integer(zbp.employer_baseline.establishments) ||
            zbp.employer_baseline.establishments === null
          ) ||
          !(
            integer(zbp.employer_baseline.employment) ||
            zbp.employer_baseline.employment === null
          ) ||
          !(
            zbp.postal_label === null ||
            exact(zbp.postal_label, ["name", "city", "state", "county"])
          ) ||
          !(
            zbp.geography === null ||
            exact(zbp.geography, ["status", "zcta_geoid"])
          ) ||
          (zbp.profile_status === "published-industry-rows" &&
            (zbp.published_industry_row_count === 0 ||
              zbp.all_industry === null)) ||
          (zbp.profile_status === "no-published-industry-rows" &&
            (zbp.published_industry_row_count !== 0 ||
              zbp.all_industry !== null))))
    )
      return false;
    if (
      zbp.all_industry !== null &&
      (!exact(zbp.all_industry, [
        "establishments",
        "size_1_4",
        "size_5_9",
        "size_10_19",
        "size_20_49",
        "size_50_99",
        "size_100_249",
        "size_250_499",
        "size_500_999",
        "size_1000_plus",
        "suppression_codes",
      ]) ||
        !exact(zbp.all_industry.suppression_codes, [
          "size_1_4",
          "size_5_9",
          "size_10_19",
          "size_20_49",
          "size_50_99",
          "size_100_249",
          "size_250_499",
          "size_500_999",
          "size_1000_plus",
        ]))
    )
      return false;
    if (!v.found)
      return (
        v.cohort_classification === null &&
        v.zcta_geoid === null &&
        v.geography_scope === null &&
        v.overlay === null &&
        Array.isArray(v.dimensions) &&
        v.dimensions.length === 0
      );
    if (
      ![
        "same-code-census-zcta",
        "source-contributed-outside-zcta",
        "denominator-only-outside-zcta",
        "explicit-placeholder",
      ].includes(v.cohort_classification) ||
      !Object.hasOwn(pin.geography_scope_counts, v.geography_scope) ||
      ![null, v.zip5].includes(v.zcta_geoid) ||
      (v.cohort_classification === "same-code-census-zcta") !==
        (v.zcta_geoid !== null)
    )
      return false;
    if (
      v.overlay !== null &&
      (!exact(v.overlay, [
        "overlay_status",
        "dominant_state_geo_id",
        "crosses_state_boundary_materially",
      ]) ||
        !boundedString(v.overlay.overlay_status) ||
        !(
          v.overlay.dominant_state_geo_id === null ||
          /^state:\d{2}$/.test(v.overlay.dominant_state_geo_id)
        ) ||
        typeof v.overlay.crosses_state_boundary_materially !== "boolean")
    )
      return false;
    if (
      (v.zcta_geoid === null && v.overlay !== null) ||
      (v.cohort_classification === "explicit-placeholder" &&
        (v.zip5 !== "00000" || v.geography_scope !== "explicit-placeholder")) ||
      (v.cohort_classification !== "explicit-placeholder" &&
        v.zcta_geoid === null &&
        v.geography_scope !== "non-zcta-unassigned")
    )
      return false;
    if (
      /^(state|territory):/.test(v.geography_scope) &&
      (!v.overlay ||
        v.overlay.overlay_status !== "complete-within-tolerance" ||
        v.overlay.crosses_state_boundary_materially ||
        v.overlay.dominant_state_geo_id !==
          v.geography_scope.replace("territory:", "state:"))
    )
      return false;
    if (
      v.geography_scope === "multi-state-material" &&
      (!v.overlay || !v.overlay.crosses_state_boundary_materially)
    )
      return false;
    return (
      Array.isArray(v.dimensions) &&
      v.dimensions.length === 51 &&
      v.dimensions.every(
        (d, i) =>
          exact(d, [
            "id",
            "evidence_status",
            "matrix_release_id",
            "matrix_manifest_sha256",
            "temporal_qualification",
          ]) &&
          d.id === pin.dimension_order[i] &&
          evidenceStatuses.includes(d.evidence_status) &&
          d.matrix_release_id === pin.matrix_provenance.release_id &&
          d.matrix_manifest_sha256 === pin.matrix_provenance.manifest_sha256 &&
          (d.temporal_qualification === null ||
            validTemporal(d.temporal_qualification)),
      )
    );
  }
  return false;
}
/** @param {*} v @param {string|null} [state] */
export function validNationalStatus(v, state = null) {
  try {
    return validateNationalStatus(v, state);
  } catch {
    return false;
  }
}
