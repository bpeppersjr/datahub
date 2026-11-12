"use client";
import { useEffect, useState } from "react";
import registration from "../config/datasets/national-business-lifecycle-industry-zip-evidence.json";
import supplementalRegistration from "../config/datasets/national-irs-eo-supplemental-industry-evidence.json";
import { runnerJson } from "./runner-client";
import StateRegistrationLicenseSupplemental from "./state-registration-license-supplemental";
const industries = [
    "retail-consumer",
    "health-care",
    "financial-services",
    "transportation",
    "construction",
    "tax-exempt-organizations",
    "sales-tax-outlets",
    "local-business-licenses",
    "childcare",
  ] as const,
  life = [
    "source-defined-current",
    "non-active-reporting",
    "unknown",
    "contradictory",
  ] as const,
  review = ["within-review-window", "stale", "unmeasured", "unmapped"] as const,
  segments = [
    "construction",
    "retail-consumer",
    "financial-services",
    "transportation",
    "health-care",
    "childcare",
  ] as const;
const labels: Record<string, string> = {
    "retail-consumer": "Retail / consumer",
    "health-care": "Health care",
    "financial-services": "Financial services",
    transportation: "Transportation",
    construction: "Construction",
    "tax-exempt-organizations": "Tax-exempt organizations",
    "sales-tax-outlets": "Sales-tax outlets",
    "local-business-licenses": "Local business licenses",
    childcare: "Childcare",
  },
  EPA = "epa-echo-exporter-active-facility",
  FSIS = "usda-fsis-active-mpi-directory";
const routes: Record<string, string[]> = {
    "alaska-dcced-active-business-licenses": ["local-business-licenses"],
    "california-abc-daily-active-licenses": ["retail-consumer"],
    "city-of-chicago-bacp-current-active-business-licenses": [
      "local-business-licenses",
    ],
    "cms-nppes-monthly-v2": ["health-care"],
    "dc-dlcp-active-basic-business-licenses": ["local-business-licenses"],
    [EPA]: [...segments],
    "fdic-bankfind-current-structure": ["financial-services"],
    "fmcsa-company-census-active-us-principal-office": ["transportation"],
    "los-angeles-office-of-finance-active-businesses": [
      "local-business-licenses",
    ],
    "ncua-final-quarterly-call-report": ["financial-services"],
    "new-york-agriculture-markets-retail-food-stores": ["retail-consumer"],
    "nyc-dcwp-issued-licenses-active-premises": ["local-business-licenses"],
    "texas-comptroller-active-sales-tax-permits": ["sales-tax-outlets"],
    [FSIS]: [],
    "usda-snap-current-retailers": ["retail-consumer"],
  },
  sources = Object.keys(routes)
    .filter((id) => id !== EPA)
    .concat(EPA);
type Counts = Record<string, number>;
type Release = {
  release_id: string;
  registration_sha256: string;
  manifest_sha256: string;
  summary_sha256: string;
  epa_manifest_sha256: string;
  epa_zip_artifact_sha256: string;
};
type Claims = {
  record_unit: "registry-location-profile-lifecycle-membership";
  dense_governed_zip_cohort: true;
  exact_zip5_keys_preserved: true;
  cohort_classifications_preserved: true;
  source_relative_lifecycle_evidence: true;
  epa_operational_segment_refinement: true;
  mapped_source_record_union_separate_from_industry_assignments: true;
  industry_assignments_additive: false;
  source_memberships_additive_across_industries: false;
  cross_source_additivity: false;
  unique_business_count: null;
  active_business_count: null;
  current_operating_business_count: null;
  all_business_completeness: null;
  industry_completeness: null;
  current_operation_verified: false;
  active_business_eligible: false;
  identity_resolution_applied: false;
  authoritative_current_usps_zip_denominator: null;
  usps_zip_state_assignment: false;
  zip4_joined: false;
  network_requests: 0;
  source_acquisition_performed: false;
  current_pointer_written: false;
  production_enrollment: false;
};
type AssignmentSource = {
  source_id: string;
  source_assignment_count: number;
  lifecycle_evidence_assignment_counts: Counts;
  review_status_assignment_counts: Counts;
};
type IndustryRow = {
  industry_id: string;
  source_assignment_count: number;
  lifecycle_evidence_assignment_counts: Counts;
  review_status_assignment_counts: Counts;
  sources: AssignmentSource[];
};
type UnmappedSource = {
  source_id: string;
  unmapped_reason: string;
  profile_membership_count: number;
  lifecycle_evidence_counts: Counts;
  review_status_counts: Counts;
};
type Epa = {
  source_id: string;
  source_record_count: number;
  mapped_source_record_union_count: number;
  industry_assignment_count: number;
  multisegment_record_count: number;
  partially_unmapped_record_count: number;
  unresolved_source_record_count: number;
  segment_assignment_counts: Counts;
  lifecycle_evidence_counts: Counts;
  review_status_counts: Counts;
};
type Row = {
  schema_version: string;
  zip5: string;
  cohort_classification: string;
  source_membership_count: number;
  lifecycle_evidence_counts: Counts;
  review_status_counts: Counts;
  mapped_source_record_union_count: number;
  unresolved_source_record_count: number;
  industry_assignment_count: number;
  industries: IndustryRow[];
  epa_refinement: Epa;
  unmapped_sources: UnmappedSource[];
};
type Summary = {
  zip5_rows: number;
  positive_zip5_rows: number;
  zero_profile_zip5_rows: number;
  source_membership_count: number;
  lifecycle_evidence_counts: Counts;
  review_status_counts: Counts;
  source_counts: Counts;
  cohort_classification_counts: Counts;
  mapped_source_record_union_count: number;
  unresolved_source_record_count: number;
  industry_assignment_count: number;
  industry_assignment_counts: Counts;
  epa_refinement: {
    source_record_count: number;
    records_with_segment: number;
    segment_assignments: number;
    multisegment_records: number;
    records_partially_unmapped: number;
    unresolved_source_records: number;
  };
  fully_mapped_source_count: number;
  partially_mapped_source_count: number;
  fully_unmapped_source_count: number;
};
type SummaryView = {
  schema_version: string;
  release: Release;
  summary: Summary;
  claims: Claims;
};
type LookupView = {
  schema_version: string;
  release: Release;
  partition: { path: string; sha256: string };
  zip5: string;
  status:
    | "governed-source-relative-industry-memberships"
    | "governed-zero-profile"
    | "outside-governed-cohort";
  row: Row | null;
  claims: Claims;
};
type SupplementalRelease = {
  release_id: string;
  registration_sha256: string;
  manifest_sha256: string;
  scope_artifact_sha256: string;
  reported_jurisdictions_artifact_sha256: string;
  summary_artifact_sha256: string;
  source_manifest_sha256: string;
  overlay_manifest_sha256: string;
  jurisdiction_manifest_sha256: string;
  jurisdiction_artifact_sha256: string;
  refresh_assessment_sha256: string;
};
type SupplementalRefresh = {
  selected_source_posting_date: string;
  assessment_as_of: string;
  review_status: string;
  selected_release_stale: boolean;
  newer_edition_observed: boolean;
  newer_edition_observed_not_collected: boolean;
  observed_posting_date: string;
  observed_source_page_claimed_records: number;
  observed_records_downloaded: number;
  observed_count_is_not_net_organization_creation: boolean;
};
type SupplementalZipRow = {
  schema_version: string;
  zip5: string;
  zip4: null;
  denominator_classification: string;
  geography_disposition_scope_id: string;
  evidence_kind: string;
  industry: string;
  organization_membership_count: number;
  review_status: string;
  filing_address_only: boolean;
};
type SupplementalZipLookup = {
  schema_version: string;
  release: SupplementalRelease;
  refresh: SupplementalRefresh;
  partition: { path: string; sha256: string };
  zip5: string;
  status:
    | "governed-supplemental-memberships"
    | "governed-zero-supplemental-memberships"
    | "outside-governed-cohort";
  row: SupplementalZipRow | null;
  claims: Record<string, unknown>;
};
type SupplementalSummary = {
  schema_version: string;
  release: SupplementalRelease;
  refresh: SupplementalRefresh;
  summary: Record<string, unknown>;
  scopes: { states: unknown[]; territories: unknown[]; special: unknown[] };
  reported_filing_address_jurisdictions: Array<{
    reported_filing_address_jurisdiction: string;
    organization_membership_count: number;
  }>;
  claims: Record<string, unknown>;
};
const SHA = /^[a-f0-9]{64}$/,
  REG = "76a81b1ba71034ea54fd9496f046716664a114bcf443c4c7b2e629fd569abf88",
  SUMMARY = "3e7f2aa71166c48dbce6fb0ef47d942afcb0f3dbe27febfa070bdfbfd13ac486",
  EPA_MANIFEST =
    "bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7",
  EPA_ZIP = "f47b129512c75389897c44b849ca89da0926d4269aad39ae67d80008cb4fa266";
const expectedClaims: Claims = {
  record_unit: "registry-location-profile-lifecycle-membership",
  dense_governed_zip_cohort: true,
  exact_zip5_keys_preserved: true,
  cohort_classifications_preserved: true,
  source_relative_lifecycle_evidence: true,
  epa_operational_segment_refinement: true,
  mapped_source_record_union_separate_from_industry_assignments: true,
  industry_assignments_additive: false,
  source_memberships_additive_across_industries: false,
  cross_source_additivity: false,
  unique_business_count: null,
  active_business_count: null,
  current_operating_business_count: null,
  all_business_completeness: null,
  industry_completeness: null,
  current_operation_verified: false,
  active_business_eligible: false,
  identity_resolution_applied: false,
  authoritative_current_usps_zip_denominator: null,
  usps_zip_state_assignment: false,
  zip4_joined: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
};
const exact = (v: unknown, k: readonly string[]) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join("|") === [...k].sort().join("|"),
  same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
  sum = (v: Counts) => Object.values(v).reduce((a, b) => a + b, 0),
  counts = (v: unknown, k: readonly string[]) =>
    exact(v, k) &&
    k.every(
      (x) => Number.isSafeInteger((v as Counts)[x]) && (v as Counts)[x] >= 0,
    );
const supplementalPins = {
    registration:
      "09fcf954fd84f622adc08e736d517b594ae760992e9964ac6c3c17183dfd9029",
    manifest:
      "ea1f62b477375269fc829562172137c3368b54f5596ad2aa69d51ae1b60d8aa1",
    scopes: "c65867324217a85fa7c47235f1056e67e2ae1fa7eb1e475282912a1ef3053d95",
    reported:
      "12be8e625923b4d97773a202f057713f06c72feaa570846853a5cd3c134db53d",
    summary: "3875515521d403de10629707015071b3ebabb9db374f40856dcc6a26c6b84e4d",
    source: "999233d73e42eac72a094d1248d6790680d39d276c3a9e849a496d01ed5288f8",
    overlay: "3fadc44772bcf2166d5e777d268028f3427342f7bfd0aab0a7706b92058581ce",
    jurisdiction:
      "d2f2114dfdbf6788eea0dd2335c9a9383673d61baf557486ebd2e8aba7ffbf41",
    jurisdictionArtifact:
      "d29f7047dfe713fd9e95ede930edd0d2642eaa59158e3d2398ee3d5945658c84",
    assessment:
      "61c5dbfec39137eeea10945dd4a2b167da8d9e955611f71a3512df8f4f3520a5",
  },
  supplementalClaims = {
    evidence_kind: "supplemental-non-active-reporting-membership",
    industry: "tax-exempt-organizations",
    filing_address_only: true,
    lifecycle_base_denominator_changed: false,
    lifecycle_base_assignments_changed: false,
    unique_business_count: null,
    current_operation_verified: false,
    physical_site_verified: false,
    complete_all_nonprofits: false,
    all_business_completeness: null,
    additive_to_business_or_industry_totals: false,
    authoritative_current_usps_zip_validity: null,
    zip4_joined: false,
    geography_disposition_and_reported_jurisdiction_are_separate: true,
    state_inferred_from_zip_prefix: false,
    reported_jurisdiction_overwrites_geography_disposition: false,
    network_requests: 0,
    source_acquisition_performed: false,
    current_pointer_written: false,
    production_enrollment: false,
  },
  supplementalRefresh = {
    selected_source_posting_date: "2026-08-11",
    assessment_as_of: "2026-11-12",
    review_status: "stale",
    selected_release_stale: true,
    newer_edition_observed: true,
    newer_edition_observed_not_collected: true,
    observed_posting_date: "2026-10-13",
    observed_source_page_claimed_records: 1975975,
    observed_records_downloaded: 0,
    observed_count_is_not_net_organization_creation: true,
  };
const validSupplementalRelease = (v: unknown): v is SupplementalRelease =>
  exact(v, [
    "release_id",
    "registration_sha256",
    "manifest_sha256",
    "scope_artifact_sha256",
    "reported_jurisdictions_artifact_sha256",
    "summary_artifact_sha256",
    "source_manifest_sha256",
    "overlay_manifest_sha256",
    "jurisdiction_manifest_sha256",
    "jurisdiction_artifact_sha256",
    "refresh_assessment_sha256",
  ]) &&
  (v as SupplementalRelease).release_id ===
    supplementalRegistration.retained_release.release_id &&
  (v as SupplementalRelease).registration_sha256 ===
    supplementalPins.registration &&
  (v as SupplementalRelease).manifest_sha256 === supplementalPins.manifest &&
  (v as SupplementalRelease).scope_artifact_sha256 ===
    supplementalPins.scopes &&
  (v as SupplementalRelease).reported_jurisdictions_artifact_sha256 ===
    supplementalPins.reported &&
  (v as SupplementalRelease).summary_artifact_sha256 ===
    supplementalPins.summary &&
  (v as SupplementalRelease).source_manifest_sha256 ===
    supplementalPins.source &&
  (v as SupplementalRelease).overlay_manifest_sha256 ===
    supplementalPins.overlay &&
  (v as SupplementalRelease).jurisdiction_manifest_sha256 ===
    supplementalPins.jurisdiction &&
  (v as SupplementalRelease).jurisdiction_artifact_sha256 ===
    supplementalPins.jurisdictionArtifact &&
  (v as SupplementalRelease).refresh_assessment_sha256 ===
    supplementalPins.assessment;
export function validIrsEoSupplementalZipSummary(
  input: unknown,
): input is SupplementalSummary {
  if (
    !exact(input, [
      "schema_version",
      "release",
      "refresh",
      "summary",
      "scopes",
      "reported_filing_address_jurisdictions",
      "claims",
    ])
  )
    return false;
  const v = input as SupplementalSummary,
    s = v.summary;
  return (
    v.schema_version ===
      "national-irs-eo-supplemental-industry-evidence-runtime-summary@1.0.0" &&
    validSupplementalRelease(v.release) &&
    same(v.refresh, supplementalRefresh) &&
    same(v.claims, supplementalClaims) &&
    s.schema_version ===
      "national-irs-eo-supplemental-industry-evidence-summary@1.0.0" &&
    s.zip5_rows === 48194 &&
    s.positive_zip5_rows === 36950 &&
    s.organization_membership_count === 1955841 &&
    s.evidence_kind === "supplemental-non-active-reporting-membership" &&
    s.industry === "tax-exempt-organizations" &&
    s.review_status === "stale" &&
    s.lifecycle_base_changed === false &&
    same(s.claims, supplementalClaims) &&
    exact(v.scopes, ["states", "territories", "special"]) &&
    v.scopes.states.length === 51 &&
    v.scopes.territories.length === 5 &&
    v.scopes.special.length === 4 &&
    Array.isArray(v.reported_filing_address_jurisdictions) &&
    v.reported_filing_address_jurisdictions.length === 56 &&
    v.reported_filing_address_jurisdictions.reduce(
      (n, x) => n + x.organization_membership_count,
      0,
    ) === 1955841
  );
}
export function validIrsEoSupplementalZipLookup(
  input: unknown,
  zip: string,
): input is SupplementalZipLookup {
  if (
    !exact(input, [
      "schema_version",
      "release",
      "refresh",
      "partition",
      "zip5",
      "status",
      "row",
      "claims",
    ])
  )
    return false;
  const v = input as SupplementalZipLookup;
  if (
    v.schema_version !==
      "national-irs-eo-supplemental-industry-evidence-runtime-zip@1.0.0" ||
    !validSupplementalRelease(v.release) ||
    !same(v.refresh, supplementalRefresh) ||
    !same(v.claims, supplementalClaims) ||
    v.zip5 !== zip ||
    !exact(v.partition, ["path", "sha256"]) ||
    v.partition.path !== `zip2=${zip.slice(0, 2)}.jsonl.gz` ||
    !SHA.test(v.partition.sha256) ||
    ![
      "governed-supplemental-memberships",
      "governed-zero-supplemental-memberships",
      "outside-governed-cohort",
    ].includes(v.status)
  )
    return false;
  if (v.status === "outside-governed-cohort") return v.row === null;
  if (
    !exact(v.row, [
      "schema_version",
      "zip5",
      "zip4",
      "denominator_classification",
      "geography_disposition_scope_id",
      "evidence_kind",
      "industry",
      "organization_membership_count",
      "review_status",
      "filing_address_only",
    ])
  )
    return false;
  const r = v.row as SupplementalZipRow;
  return (
    r.schema_version ===
      "national-irs-eo-supplemental-industry-evidence-zip@1.0.0" &&
    r.zip5 === zip &&
    r.zip4 === null &&
    typeof r.denominator_classification === "string" &&
    !!r.denominator_classification &&
    typeof r.geography_disposition_scope_id === "string" &&
    !!r.geography_disposition_scope_id &&
    r.evidence_kind === "supplemental-non-active-reporting-membership" &&
    r.industry === "tax-exempt-organizations" &&
    Number.isSafeInteger(r.organization_membership_count) &&
    r.organization_membership_count >= 0 &&
    r.review_status === "stale" &&
    r.filing_address_only === true &&
    v.status ===
      (r.organization_membership_count
        ? "governed-supplemental-memberships"
        : "governed-zero-supplemental-memberships")
  );
}
const validClaims = (v: unknown): v is Claims => same(v, expectedClaims),
  validRelease = (v: unknown): v is Release =>
    exact(v, [
      "release_id",
      "registration_sha256",
      "manifest_sha256",
      "summary_sha256",
      "epa_manifest_sha256",
      "epa_zip_artifact_sha256",
    ]) &&
    (v as Release).release_id === registration.retained_release.release_id &&
    (v as Release).registration_sha256 === REG &&
    (v as Release).manifest_sha256 ===
      registration.retained_release.manifest_sha256 &&
    (v as Release).summary_sha256 === SUMMARY &&
    (v as Release).epa_manifest_sha256 === EPA_MANIFEST &&
    (v as Release).epa_zip_artifact_sha256 === EPA_ZIP;
const validAssignment = (v: unknown, allowed: string[]) =>
  exact(v, [
    "source_id",
    "source_assignment_count",
    "lifecycle_evidence_assignment_counts",
    "review_status_assignment_counts",
  ]) &&
  allowed.includes((v as AssignmentSource).source_id) &&
  Number.isSafeInteger((v as AssignmentSource).source_assignment_count) &&
  (v as AssignmentSource).source_assignment_count > 0 &&
  counts((v as AssignmentSource).lifecycle_evidence_assignment_counts, life) &&
  sum((v as AssignmentSource).lifecycle_evidence_assignment_counts) ===
    (v as AssignmentSource).source_assignment_count &&
  counts((v as AssignmentSource).review_status_assignment_counts, review) &&
  sum((v as AssignmentSource).review_status_assignment_counts) ===
    (v as AssignmentSource).source_assignment_count;
const validEpa = (v: unknown): v is Epa => {
  if (
    !exact(v, [
      "source_id",
      "source_record_count",
      "mapped_source_record_union_count",
      "industry_assignment_count",
      "multisegment_record_count",
      "partially_unmapped_record_count",
      "unresolved_source_record_count",
      "segment_assignment_counts",
      "lifecycle_evidence_counts",
      "review_status_counts",
    ])
  )
    return false;
  const e = v as Epa;
  return (
    e.source_id === EPA &&
    [
      e.source_record_count,
      e.mapped_source_record_union_count,
      e.industry_assignment_count,
      e.multisegment_record_count,
      e.partially_unmapped_record_count,
      e.unresolved_source_record_count,
    ].every((x) => Number.isSafeInteger(x) && x >= 0) &&
    e.mapped_source_record_union_count + e.unresolved_source_record_count ===
      e.source_record_count &&
    e.industry_assignment_count >= e.mapped_source_record_union_count &&
    e.multisegment_record_count <= e.mapped_source_record_union_count &&
    e.partially_unmapped_record_count <= e.mapped_source_record_union_count &&
    counts(e.segment_assignment_counts, segments) &&
    sum(e.segment_assignment_counts) === e.industry_assignment_count &&
    counts(e.lifecycle_evidence_counts, life) &&
    sum(e.lifecycle_evidence_counts) === e.source_record_count &&
    counts(e.review_status_counts, review) &&
    sum(e.review_status_counts) === e.source_record_count
  );
};
const validRow = (v: unknown, zip: string): v is Row => {
  if (
    !exact(v, [
      "schema_version",
      "zip5",
      "cohort_classification",
      "source_membership_count",
      "lifecycle_evidence_counts",
      "review_status_counts",
      "mapped_source_record_union_count",
      "unresolved_source_record_count",
      "industry_assignment_count",
      "industries",
      "epa_refinement",
      "unmapped_sources",
    ])
  )
    return false;
  const r = v as Row;
  if (
    r.schema_version !==
      "national-business-lifecycle-industry-zip-evidence-row@1.1.0" ||
    r.zip5 !== zip ||
    ![
      "same-code-census-zcta",
      "source-contributed-outside-zcta",
      "denominator-only-outside-zcta",
      "explicit-placeholder",
    ].includes(r.cohort_classification) ||
    ![
      r.source_membership_count,
      r.mapped_source_record_union_count,
      r.unresolved_source_record_count,
      r.industry_assignment_count,
    ].every((x) => Number.isSafeInteger(x) && x >= 0) ||
    r.mapped_source_record_union_count + r.unresolved_source_record_count !==
      r.source_membership_count ||
    r.industry_assignment_count < r.mapped_source_record_union_count ||
    !counts(r.lifecycle_evidence_counts, life) ||
    sum(r.lifecycle_evidence_counts) !== r.source_membership_count ||
    !counts(r.review_status_counts, review) ||
    sum(r.review_status_counts) !== r.source_membership_count ||
    !validEpa(r.epa_refinement) ||
    !Array.isArray(r.industries) ||
    r.industries.length !== 9 ||
    !Array.isArray(r.unmapped_sources) ||
    r.unmapped_sources.length > 1
  )
    return false;
  for (let i = 0; i < 9; i++) {
    const x = r.industries[i],
      allowed = sources.filter((id) => routes[id].includes(industries[i]));
    if (
      !exact(x, [
        "industry_id",
        "source_assignment_count",
        "lifecycle_evidence_assignment_counts",
        "review_status_assignment_counts",
        "sources",
      ]) ||
      x.industry_id !== industries[i] ||
      !Number.isSafeInteger(x.source_assignment_count) ||
      x.source_assignment_count < 0 ||
      !counts(x.lifecycle_evidence_assignment_counts, life) ||
      sum(x.lifecycle_evidence_assignment_counts) !==
        x.source_assignment_count ||
      !counts(x.review_status_assignment_counts, review) ||
      sum(x.review_status_assignment_counts) !== x.source_assignment_count ||
      !Array.isArray(x.sources) ||
      x.sources.some(
        (s, j) =>
          !validAssignment(s, allowed) ||
          (j > 0 &&
            sources.indexOf(x.sources[j - 1].source_id) >=
              sources.indexOf(s.source_id)),
      ) ||
      x.sources.reduce((a, s) => a + s.source_assignment_count, 0) !==
        x.source_assignment_count
    )
      return false;
  }
  const f = r.unmapped_sources[0];
  if (
    f &&
    (!exact(f, [
      "source_id",
      "unmapped_reason",
      "profile_membership_count",
      "lifecycle_evidence_counts",
      "review_status_counts",
    ]) ||
      f.source_id !== FSIS ||
      typeof f.unmapped_reason !== "string" ||
      f.unmapped_reason.length < 20 ||
      !Number.isSafeInteger(f.profile_membership_count) ||
      f.profile_membership_count <= 0 ||
      !counts(f.lifecycle_evidence_counts, life) ||
      sum(f.lifecycle_evidence_counts) !== f.profile_membership_count ||
      !counts(f.review_status_counts, review) ||
      sum(f.review_status_counts) !== f.profile_membership_count)
  )
    return false;
  const assignments = r.industries.reduce(
      (a, x) => a + x.source_assignment_count,
      0,
    ),
    epaAssignments = r.industries.reduce(
      (a, x) =>
        a +
        (x.sources.find((s) => s.source_id === EPA)?.source_assignment_count ??
          0),
      0,
    ),
    fsis = f?.profile_membership_count ?? 0;
  return (
    assignments === r.industry_assignment_count &&
    epaAssignments === r.epa_refinement.industry_assignment_count &&
    r.industry_assignment_count - r.mapped_source_record_union_count ===
      r.epa_refinement.industry_assignment_count -
        r.epa_refinement.mapped_source_record_union_count &&
    r.unresolved_source_record_count ===
      r.epa_refinement.unresolved_source_record_count + fsis
  );
};
export function validLifecycleIndustryZipSummary(
  input: unknown,
): input is SummaryView {
  if (!exact(input, ["schema_version", "release", "summary", "claims"]))
    return false;
  const v = input as SummaryView,
    s = v.summary,
    e = s.epa_refinement,
    totals = {
      "retail-consumer": 484508,
      "health-care": 2118021,
      "financial-services": 101618,
      transportation: 2242612,
      construction: 93917,
      "tax-exempt-organizations": 0,
      "sales-tax-outlets": 885097,
      "local-business-licenses": 856795,
      childcare: 177,
    };
  return (
    v.schema_version ===
      "national-business-lifecycle-industry-zip-evidence-runtime-summary@1.1.0" &&
    validRelease(v.release) &&
    validClaims(v.claims) &&
    exact(s, [
      "zip5_rows",
      "positive_zip5_rows",
      "zero_profile_zip5_rows",
      "source_membership_count",
      "lifecycle_evidence_counts",
      "review_status_counts",
      "source_counts",
      "cohort_classification_counts",
      "mapped_source_record_union_count",
      "unresolved_source_record_count",
      "industry_assignment_count",
      "industry_assignment_counts",
      "epa_refinement",
      "fully_mapped_source_count",
      "partially_mapped_source_count",
      "fully_unmapped_source_count",
    ]) &&
    s.zip5_rows === 48194 &&
    s.positive_zip5_rows === 42267 &&
    s.zero_profile_zip5_rows === 5927 &&
    s.source_membership_count === 8011213 &&
    s.mapped_source_record_union_count === 6780627 &&
    s.unresolved_source_record_count === 1230586 &&
    s.mapped_source_record_union_count + s.unresolved_source_record_count ===
      s.source_membership_count &&
    s.industry_assignment_count === 6782745 &&
    same(s.industry_assignment_counts, totals) &&
    sum(s.industry_assignment_counts) === s.industry_assignment_count &&
    s.fully_mapped_source_count === 13 &&
    s.partially_mapped_source_count === 1 &&
    s.fully_unmapped_source_count === 1 &&
    counts(s.lifecycle_evidence_counts, life) &&
    sum(s.lifecycle_evidence_counts) === s.source_membership_count &&
    counts(s.review_status_counts, review) &&
    sum(s.review_status_counts) === s.source_membership_count &&
    counts(s.source_counts, sources) &&
    sum(s.source_counts) === s.source_membership_count &&
    same(s.cohort_classification_counts, {
      "same-code-census-zcta": 33791,
      "source-contributed-outside-zcta": 14361,
      "denominator-only-outside-zcta": 41,
      "explicit-placeholder": 1,
    }) &&
    same(e, {
      source_record_count: 1517826,
      records_with_segment: 294477,
      segment_assignments: 296595,
      multisegment_records: 2107,
      records_partially_unmapped: 25035,
      unresolved_source_records: 1223349,
    }) &&
    s.industry_assignment_count - s.mapped_source_record_union_count ===
      e.segment_assignments - e.records_with_segment
  );
}
export function validLifecycleIndustryZipLookup(
  input: unknown,
  zip: string,
): input is LookupView {
  if (
    !exact(input, [
      "schema_version",
      "release",
      "partition",
      "zip5",
      "status",
      "row",
      "claims",
    ])
  )
    return false;
  const v = input as LookupView;
  if (
    v.schema_version !==
      "national-business-lifecycle-industry-zip-evidence-runtime-lookup@1.1.0" ||
    !validRelease(v.release) ||
    !validClaims(v.claims) ||
    v.zip5 !== zip ||
    !exact(v.partition, ["path", "sha256"]) ||
    v.partition.path !== `zip2=${zip.slice(0, 2)}.jsonl.gz` ||
    !SHA.test(v.partition.sha256) ||
    ![
      "governed-source-relative-industry-memberships",
      "governed-zero-profile",
      "outside-governed-cohort",
    ].includes(v.status)
  )
    return false;
  if (v.status === "outside-governed-cohort") return v.row === null;
  if (!validRow(v.row, zip)) return false;
  return (
    v.status ===
    (v.row.source_membership_count > 0
      ? "governed-source-relative-industry-memberships"
      : "governed-zero-profile")
  );
}
const n = (v: number) => v.toLocaleString("en-US");
export default function LifecycleIndustryZipPanel({ zip5 }: { zip5: string }) {
  const [summary, setSummary] = useState<SummaryView | null>(null),
    [summaryFailed, setSummaryFailed] = useState(false),
    [lookup, setLookup] = useState<{
      zip5: string;
      view: LookupView | null;
      failed: boolean;
    } | null>(null),
    [supplementalSummary, setSupplementalSummary] =
      useState<SupplementalSummary | null>(null),
    [supplementalSummaryFailed, setSupplementalSummaryFailed] = useState(false),
    [supplementalLookup, setSupplementalLookup] = useState<{
      zip5: string;
      view: SupplementalZipLookup | null;
      failed: boolean;
    } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void runnerJson<unknown>(
      "/api/business-map/lifecycle-industry-zip-summary",
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) {
          if (validLifecycleIndustryZipSummary(v)) setSummary(v);
          else setSummaryFailed(true);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setSummaryFailed(true);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void runnerJson<unknown>(
      "/api/business-map/irs-eo-supplemental-industry-summary",
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) {
          if (validIrsEoSupplementalZipSummary(v)) setSupplementalSummary(v);
          else setSupplementalSummaryFailed(true);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setSupplementalSummaryFailed(true);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip5)) return;
    const requested = zip5,
      c = new AbortController();
    void runnerJson<unknown>(
      `/api/business-map/lifecycle-industry-zip?zip=${encodeURIComponent(zip5)}`,
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted)
          setLookup({
            zip5: requested,
            view: validLifecycleIndustryZipLookup(v, requested) ? v : null,
            failed: !validLifecycleIndustryZipLookup(v, requested),
          });
      })
      .catch((e) => {
        if (!c.signal.aborted && e?.name !== "AbortError")
          setLookup({ zip5: requested, view: null, failed: true });
      });
    return () => c.abort();
  }, [zip5]);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip5)) return;
    const requested = zip5,
      c = new AbortController();
    void runnerJson<unknown>(
      `/api/business-map/irs-eo-supplemental-industry-zip?zip=${encodeURIComponent(zip5)}`,
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted)
          setSupplementalLookup({
            zip5: requested,
            view: validIrsEoSupplementalZipLookup(v, requested) ? v : null,
            failed: !validIrsEoSupplementalZipLookup(v, requested),
          });
      })
      .catch((e) => {
        if (!c.signal.aborted && e?.name !== "AbortError")
          setSupplementalLookup({ zip5: requested, view: null, failed: true });
      });
    return () => c.abort();
  }, [zip5]);
  const current = lookup?.zip5 === zip5 ? lookup : null,
    row = current?.view?.row,
    supplementalCurrent =
      supplementalLookup?.zip5 === zip5 ? supplementalLookup : null,
    supplemental = supplementalCurrent?.view;
  return (
    <section
      className="state-alignment-card"
      aria-label="Lifecycle evidence by operational industry and exact ZIP"
    >
      <div>
        <span>Lifecycle by operational industry</span>
        <strong>
          {/^\d{5}$/.test(zip5) ? `Exact ZIP ${zip5}` : "Enter an exact ZIP"}
        </strong>
      </div>
      {summary ? (
        <p>
          <strong>National allocation context:</strong>{" "}
          {n(summary.summary.mapped_source_record_union_count)} distinct mapped
          source records · {n(summary.summary.industry_assignment_count)}{" "}
          overlapping industry assignments ·{" "}
          {n(summary.summary.unresolved_source_record_count)} unresolved source
          records.
        </p>
      ) : summaryFailed ? (
        <p role="status">
          National industry lifecycle context is unavailable. Other exact-ZIP
          evidence remains available.
        </p>
      ) : (
        <p role="status">Verifying national industry lifecycle context…</p>
      )}
      {supplementalSummary && (
        <p>
          <strong>National IRS supplemental context:</strong>{" "}
          {n(
            supplementalSummary.summary.organization_membership_count as number,
          )}{" "}
          current-extract EIN organization memberships · filing addresses only ·
          non-active reporting · stale review. A newer edition dated{" "}
          {supplementalSummary.refresh.observed_posting_date} was observed but
          not collected.
        </p>
      )}
      {supplementalSummaryFailed && (
        <p role="status">
          IRS EO supplemental evidence is unavailable. Lifecycle industry status
          remains available.
        </p>
      )}
      {/^\d{5}$/.test(zip5) && !current && (
        <p role="status">
          Verifying industry lifecycle evidence for ZIP {zip5}…
        </p>
      )}
      {current?.failed && (
        <p role="status">
          Industry lifecycle evidence for ZIP {zip5} is unavailable. Other
          exact-ZIP evidence remains available.
        </p>
      )}
      {/^\d{5}$/.test(zip5) &&
        !supplementalCurrent &&
        !supplementalSummaryFailed && (
          <p role="status">
            Verifying IRS EO supplemental evidence for ZIP {zip5}…
          </p>
        )}
      {supplementalCurrent?.failed && (
        <p role="status">
          IRS EO supplemental evidence for ZIP {zip5} is unavailable. Lifecycle
          industry status remains available.
        </p>
      )}
      {supplemental?.status === "outside-governed-cohort" && (
        <p>
          IRS EO supplemental evidence places this ZIP outside its governed
          cohort. That is not a supplemental zero.
        </p>
      )}
      {current?.view?.status === "outside-governed-cohort" && (
        <p>
          This ZIP is outside the governed cohort. That is not a zero, an
          invalid ZIP, or evidence that no businesses exist.
        </p>
      )}
      {row && (
        <>
          {current?.view?.status === "governed-zero-profile" && (
            <p>
              <strong>Governed explicit zero-profile row.</strong> This is zero
              retained source records, not zero businesses or a completeness
              result.
            </p>
          )}
          <div
            className="representation-table"
            role="region"
            aria-label={`All operational industry lifecycle evidence for exact ZIP ${zip5}`}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Industry</th>
                  <th scope="col">Industry memberships (overlapping)</th>
                  <th scope="col">Lifecycle evidence</th>
                  <th scope="col">Review evidence</th>
                </tr>
              </thead>
              <tbody>
                {row.industries.map((x) => (
                  <tr key={x.industry_id}>
                    <th scope="row">
                      {labels[x.industry_id] ?? x.industry_id}
                    </th>
                    <td>
                      {x.source_assignment_count === 0 ? (
                        <>
                          <strong>0</strong>
                          <small>
                            {x.industry_id === "tax-exempt-organizations" ? (
                              <>
                                0 lifecycle assignments.
                                {supplemental?.row && (
                                  <>
                                    {" "}
                                    {n(
                                      supplemental.row
                                        .organization_membership_count,
                                    )}{" "}
                                    supplemental IRS current-extract EIN
                                    organization memberships · filing address
                                    only · non-active reporting · stale review.
                                    Newer edition observed, not collected.
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                No governed lifecycle memberships assigned to
                                this industry in this layer.
                              </>
                            )}
                          </small>
                        </>
                      ) : (
                        n(x.source_assignment_count)
                      )}
                    </td>
                    <td>
                      Current{" "}
                      {n(
                        x.lifecycle_evidence_assignment_counts[
                          "source-defined-current"
                        ],
                      )}{" "}
                      · non-active{" "}
                      {n(
                        x.lifecycle_evidence_assignment_counts[
                          "non-active-reporting"
                        ],
                      )}{" "}
                      · unknown{" "}
                      {n(x.lifecycle_evidence_assignment_counts.unknown)} ·
                      contradictory{" "}
                      {n(x.lifecycle_evidence_assignment_counts.contradictory)}
                    </td>
                    <td>
                      Within window{" "}
                      {n(
                        x.review_status_assignment_counts[
                          "within-review-window"
                        ],
                      )}{" "}
                      · stale {n(x.review_status_assignment_counts.stale)} ·
                      unmeasured{" "}
                      {n(x.review_status_assignment_counts.unmeasured)} ·
                      unmapped {n(x.review_status_assignment_counts.unmapped)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Mapping and overlap context</summary>
            <p>
              <strong>Exact-ZIP source allocation:</strong>{" "}
              {n(row.mapped_source_record_union_count)} distinct mapped records
              · {n(row.industry_assignment_count)} overlapping industry
              assignments · {n(row.unresolved_source_record_count)} unresolved
              source records.
            </p>
            <p>
              <strong>EPA refined segment evidence:</strong>{" "}
              {n(row.epa_refinement.mapped_source_record_union_count)} distinct
              records with a mapped segment ·{" "}
              {n(row.epa_refinement.industry_assignment_count)}{" "}
              record-to-segment assignments ·{" "}
              {n(row.epa_refinement.multisegment_record_count)} multisegment
              records · {n(row.epa_refinement.partially_unmapped_record_count)}{" "}
              partially-unmapped records ·{" "}
              {n(row.epa_refinement.unresolved_source_record_count)} records
              with no mapped segment.
            </p>
            <p>
              Multisegment and partially-unmapped records are overlapping
              subsets of the EPA mapped-record union; neither is added to
              unresolved records.
            </p>
            {row.unmapped_sources.length ? (
              row.unmapped_sources.map((s) => (
                <p key={s.source_id}>
                  <strong>FSIS residual · {s.source_id}</strong> ·{" "}
                  {n(s.profile_membership_count)} records. {s.unmapped_reason}
                </p>
              ))
            ) : (
              <p>
                <strong>FSIS residual:</strong> 0 retained source records for
                this ZIP.
              </p>
            )}
          </details>
          <p className="entity-method-note">
            Industry assignments overlap and must not be summed as a distinct
            record or business total. IRS supplemental memberships are not
            lifecycle assignments or additive totals. Counts are not unique
            businesses, completeness, verified current operation, physical
            sites, or an active-business numerator. USPS validity and
            ZIP-to-state assignment are not asserted.
          </p>
        </>
      )}
      <StateRegistrationLicenseSupplemental zip5={zip5} />
    </section>
  );
}
