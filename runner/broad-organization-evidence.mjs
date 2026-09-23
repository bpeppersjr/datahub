import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { assessBusinessSourceTemporalStatus } from "./business-source-temporal-status.mjs";
import { APP_ROOT } from "./paths.mjs";
import { BROAD_ORGANIZATION_ZIP_SOURCES } from "./broad-organization-zip-descriptors.mjs";

export const BROAD_ORGANIZATION_EVIDENCE_VERSION = "1.3.0";
export const DC_BROAD_ORGANIZATION_CONTRACT_VERSION = "dc-basic-business-license-organization-evidence@1.0.0";
export const TX_BROAD_ORGANIZATION_CONTRACT_VERSION = "tx-active-sales-tax-permit-outlet-evidence@1.0.0";
export const DC_BROAD_ORGANIZATION_SOURCE = Object.freeze({
  datasetId: "dc-basic-business-license-sites",
  sourceKey: "dc_basic_business_license_sites",
  profileSourceId: "dc-dlcp-active-basic-business-licenses",
  sourceReleaseId: "dc-basic-business-licenses-2026-09-07-70f09a6a032c9408",
  policy: "dc-basic-business-licenses.json",
  localReviewOnly: true,
  pinCoverageReleaseMetadata: true,
  fieldExportPolicyKey: "normalized_record_level_organizations_sites_establishments_assertions_relationships_and_match_profiles",
  sourceLevelGeocode: true,
  quarantineCoverage: Object.freeze({
    sourceRows: "dc_basic_business_license_source_rows",
    acceptedRows: "dc_basic_business_license_accepted_rows",
    normalizedOrganizations: "dc_basic_business_license_organizations",
    quarantinedRecords: "dc_basic_business_license_quarantined_source_records",
    quarantinedCustomerGroups: "dc_basic_business_license_quarantined_customer_groups",
    sourceGeocodedSites: "dc_basic_business_license_source_geocoded_sites",
  }),
  recordUnitSemantics: "One provisional organization and premise site per DLCP Customer Number. Multiple source-defined Active Business License activity rows remain license assertions on that customer group, not additional organizations or premises. Premise addresses may be outside the District and remain publisher-reported address claims.",
  evidenceContract: Object.freeze({
    schema_version: DC_BROAD_ORGANIZATION_CONTRACT_VERSION,
    publisher: "District of Columbia Department of Licensing and Consumer Protection",
    license_scope: "Basic Business License activities with source status Active",
    excluded_business_universe: "License-exempt businesses and businesses governed through other licensing regimes are not represented.",
    active_status_semantics: "Source status Active is not proof of continuous operation, current occupancy, public access, or compliance with every requirement.",
    organization_key_semantics: "Customer Number groups activity rows into one provisional organization and one premise site; no cross-source identity is inferred.",
    premise_semantics: "The source premise address is a publisher-reported licensed-premise address, not independently verified current occupancy; out-of-District addresses remain source-reported premises.",
    record_level_distribution: "local-review-only",
    source_level_geocode_only: true,
    quarantine_disclosed: true,
    all_business_completeness_percent: null,
    active_business_completeness_percent: null,
  }),
});
export const TX_BROAD_ORGANIZATION_SOURCE = Object.freeze({
  datasetId: "tx-active-sales-tax-outlets",
  datasetReleaseId: "tx-active-sales-tax-20260903-004825316Z-3ba279b8",
  datasetManifestPath: "data/business-sources/tx-active-sales-tax-outlets/releases/tx-active-sales-tax-20260903-004825316Z-3ba279b8/manifest.json",
  datasetManifestSha256: "7654c7ec1439a29e76abc2e2c19ce05c53901b836f43b1bb42b4c71cd032c499",
  sourceKey: "tx_active_sales_tax_permit_outlets",
  profileSourceId: "texas-comptroller-active-sales-tax-permits",
  sourceReleaseId: "tx-active-sales-tax-2026-08-29-98b90d177d81493e",
  policy: "tx-active-sales-tax-permits.json",
  localReviewOnly: true,
  pinCoverageReleaseMetadata: true,
  fieldExportPolicyKey: "normalized_record_level_taxpayers_outlets_sites_assertions_relationships_and_match_profiles",
  sourceLevelGeocode: false,
  sourceProfileCountsByAddressState: Object.freeze({ CO: 1, FL: 1, LA: 1, TX: 885093, VA: 1 }),
  coverageFields: Object.freeze({
    sourceRows: "tx_active_sales_tax_source_outlet_permits",
    normalizedOutlets: "tx_active_sales_tax_normalized_outlet_permits",
    uniqueTaxpayers: "tx_active_sales_tax_unique_taxpayers",
    quarantinedRows: "tx_active_sales_tax_quarantined_source_records",
  }),
  recordUnitSemantics: "Source-defined active Texas sales-tax taxpayer/outlet permit evidence. Each accepted taxpayer/outlet pair is one provisional permitted outlet, not a unique business or independently verified operating site; taxpayer numbers group provisional taxpayer organizations. This is not the Texas Secretary of State entity master or all Texas businesses.",
  evidenceContract: Object.freeze({
    schema_version: TX_BROAD_ORGANIZATION_CONTRACT_VERSION,
    publisher: "Texas Comptroller of Public Accounts",
    license_scope: "Source-defined active sales-tax permit taxpayers and permitted outlets under Texas Tax Code Chapter 151, Subchapter F.",
    excluded_business_universe: "This sales-tax permit layer is not the Texas Secretary of State entity master and does not represent all Texas businesses, exempt businesses, or businesses without an active permit in this source.",
    active_status_semantics: "An active permit is not proof of continuous operation, current occupancy, public access, solvency, or compliance with other licensing requirements.",
    organization_key_semantics: "The taxpayer number groups source outlet permits to a provisional taxpayer organization; outlet records are not unique businesses and no parent or cross-source identity is inferred.",
    outlet_semantics: "Accepted taxpayer/outlet pairs represent source-reported permitted outlets; they do not establish a currently operating or verified physical site.",
    record_level_distribution: "local-review-only",
    source_geocodes: "not-provided; source-level geocode rate is unmeasured and no state-wide coordinates are borrowed",
    source_rows: 885278,
    normalized_permitted_outlets: 885097,
    unique_taxpayer_organizations: 700705,
    quarantined_source_rows: 181,
    source_zip_keys: 2156,
    reported_address_profiles_by_state: Object.freeze({ CO: 1, FL: 1, LA: 1, TX: 885093, VA: 1 }),
    all_business_completeness_percent: null,
    active_business_completeness_percent: null,
  }),
});
export const BROAD_ORGANIZATION_SOURCES = Object.freeze({
  ...Object.fromEntries(Object.entries(BROAD_ORGANIZATION_ZIP_SOURCES).map(([state, spec]) => [state, Object.freeze({ sourceKey: spec.registryKey, profileSourceId: spec.profileSourceId ?? null, sourceReleaseId: spec.sourceReleaseId, policy: spec.policy, localReviewOnly: spec.localReviewOnly === true, pinCoverageReleaseMetadata: spec.pinCoverageReleaseMetadata === true, recordUnitSemantics: spec.recordUnitSemantics ?? null })])),
  DC: DC_BROAD_ORGANIZATION_SOURCE,
  TX: TX_BROAD_ORGANIZATION_SOURCE,
});

const POLICY_IDS = Object.freeze(Object.fromEntries(Object.entries(BROAD_ORGANIZATION_SOURCES).map(([state, value]) => [state, value.policy.replace(/\.json$/, "")])));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(`Broad organization evidence rejected: ${message}`); };

function geocodePercent(assigned, eligible) {
  if (eligible === 0) return null;
  const scale = 1_000_000_000_000n;
  const denominator = BigInt(eligible);
  let scaled = (BigInt(assigned) * 100n * scale + denominator / 2n) / denominator;
  if (assigned < eligible && scaled >= 100n * scale) scaled = 100n * scale - 1n;
  return Number(scaled) / Number(scale);
}

export async function buildBroadOrganizationEvidence({ state, source, registryCoverage = null, reportedAddressProfileCounts = null, root = APP_ROOT, asOf = new Date() }) {
  const spec = BROAD_ORGANIZATION_SOURCES[state];
  if (!spec) return null;
  check(source?.source_key === spec.sourceKey, `${state} source identity drifted`);
  if (spec.profileSourceId) check(source.profile_source_id === spec.profileSourceId, `${state} profile source identity drifted`);
  if (spec.pinCoverageReleaseMetadata) {
    check(source.release_metadata?.source_release_id === spec.sourceReleaseId, `${state} source release lineage drifted`);
    check(source.release_metadata?.record_level_distribution === "local-review-only", `${state} record-level distribution policy drifted`);
  }
  let txRelease = null;
  if (state === "TX") {
    const datasetManifestPath = path.join(root, ...spec.datasetManifestPath.split("/"));
    const manifestBytes = await readFile(datasetManifestPath);
    check(sha256(manifestBytes) === spec.datasetManifestSha256, "TX retained dataset manifest hash drifted");
    txRelease = JSON.parse(manifestBytes);
    check(txRelease.dataset_id === spec.datasetId && txRelease.release_id === spec.datasetReleaseId
      && txRelease.source_release_id === spec.sourceReleaseId && txRelease.status === "complete"
      && txRelease.complete_source_snapshot === true && txRelease.policy?.policy_id === POLICY_IDS.TX
      && txRelease.policy?.record_level_distribution === "local-review-only", "TX retained dataset release or policy drifted");
    const expectedCoverage = spec.coverageFields;
    check(txRelease.coverage?.source_outlet_permits === registryCoverage?.[expectedCoverage.sourceRows]
      && txRelease.coverage?.normalized_outlet_permits === registryCoverage?.[expectedCoverage.normalizedOutlets]
      && txRelease.coverage?.unique_taxpayers === registryCoverage?.[expectedCoverage.uniqueTaxpayers]
      && txRelease.coverage?.quarantined_source_records === registryCoverage?.[expectedCoverage.quarantinedRows]
      && txRelease.coverage?.source_zip_codes === spec.evidenceContract.source_zip_keys
      && txRelease.coverage?.source_outlet_permits === txRelease.coverage?.normalized_outlet_permits + txRelease.coverage?.quarantined_source_records,
    "TX retained outlet/quarantine counts or ZIP-key evidence do not match the pinned source release");
    check(reportedAddressProfileCounts && JSON.stringify(Object.fromEntries(Object.entries(reportedAddressProfileCounts).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b)))
      ) === JSON.stringify(spec.sourceProfileCountsByAddressState), "TX reported-address-state profile counts drifted from the retained contract");
  }
  check(source.complete_source_for_all_businesses === false, `${state} completeness boundary drifted`);
  check(Number.isSafeInteger(source.zip_rows_with_contribution) && source.zip_rows_with_contribution >= 0, `${state} ZIP contribution is invalid`);
  const policyPath = path.join(root, "config", "source-policies", spec.policy);
  const policyBytes = await readFile(policyPath);
  const policy = JSON.parse(policyBytes);
  check(policy.policy_id === POLICY_IDS[state] && /^\d+\.\d+\.\d+$/.test(policy.version ?? ""), `${state} policy identity drifted`);
  check(/^20\d{2}-\d{2}-\d{2}$/.test(policy.reviewed_at ?? ""), `${state} policy review date is invalid`);
  check(typeof policy.redistribution === "string" && policy.redistribution.length > 20 && Array.isArray(policy.prohibited_use) && policy.prohibited_use.length, `${state} policy semantics are incomplete`);
  if (spec.localReviewOnly) {
    const fieldPolicy = spec.fieldExportPolicyKey
      ? policy.field_export_policy?.[spec.fieldExportPolicyKey]
      : state === "DE"
      ? policy.field_export_policy?.normalized_record_level_organizations_addresses_assertions_and_match_profiles
      : policy.field_export_policy?.normalized_record_level_organizations_addresses_sites_assertions_relationships_and_match_profiles;
    check(fieldPolicy === "local-review-only", `${state} record-level policy is not local-review-only`);
  }
  const temporal = assessBusinessSourceTemporalStatus(source, { asOf });
  check(temporal.policy_configured && temporal.source_reference_at && temporal.general_business_operating_status_asserted === false, `${state} temporal policy is incomplete`);
  const addressCounts = source.zip_level_counts ?? {};
  check(Object.values(addressCounts).every((value) => Number.isSafeInteger(value) && value >= 0), `${state} address counts are invalid`);
  let geocode = { status: "unmeasured-at-source-level", assigned: null, eligible: null, percent: null, scope: "selected-broad-organization-source" };
  let quarantine = null;
  if (spec.sourceLevelGeocode) {
    const geography = source.location_profile_geography;
    const assigned = geography?.coordinate_assigned_single_count, coordinatePresentValid = geography?.coordinate_present_valid_count, eligible = geography?.profile_count;
    check(Number.isSafeInteger(assigned) && assigned >= 0 && Number.isSafeInteger(coordinatePresentValid) && coordinatePresentValid >= assigned
      && Number.isSafeInteger(eligible) && eligible >= coordinatePresentValid,
      `${state} source-level geocode counts are invalid`);
    const sourceGeocodedSites = registryCoverage?.[spec.quarantineCoverage.sourceGeocodedSites];
    check(Number.isSafeInteger(sourceGeocodedSites) && sourceGeocodedSites === coordinatePresentValid,
      `${state} source-level geocode count does not match retained registry coverage`);
    geocode = { status: "source-level-geocode", assigned, coordinate_present_valid: coordinatePresentValid, eligible, percent: geocodePercent(assigned, eligible), scope: "DC retained license-source profiles only; not a D.C.-address-state, ZIP, county, or Census geography assignment" };

    const fields = spec.quarantineCoverage;
    const sourceRows = registryCoverage?.[fields.sourceRows], acceptedRows = registryCoverage?.[fields.acceptedRows];
    const normalizedOrganizations = registryCoverage?.[fields.normalizedOrganizations];
    const quarantinedRecords = registryCoverage?.[fields.quarantinedRecords], quarantinedCustomerGroups = registryCoverage?.[fields.quarantinedCustomerGroups];
    for (const [label, value] of Object.entries({ sourceRows, acceptedRows, normalizedOrganizations, quarantinedRecords, quarantinedCustomerGroups })) {
      check(Number.isSafeInteger(value) && value >= 0, `${state} retained quarantine ${label} is invalid`);
    }
    check(sourceRows === acceptedRows + quarantinedRecords && normalizedOrganizations <= acceptedRows,
      `${state} retained quarantine counts do not conserve source and accepted rows`);
    quarantine = { source_rows: sourceRows, accepted_license_activity_rows: acceptedRows, normalized_customer_organizations_and_premises: normalizedOrganizations,
      quarantined_source_records: quarantinedRecords, quarantined_customer_groups: quarantinedCustomerGroups,
      conservation_status: "passed", semantics: "Quarantined source records and customer groups are disclosed as excluded; counts are retained registry aggregates, not row details." };
  }
  return {
    schema_version: BROAD_ORGANIZATION_EVIDENCE_VERSION,
    state,
    source_key: spec.sourceKey,
    ...(spec.profileSourceId ? { profile_source_id: spec.profileSourceId } : {}),
    source_release_id: source.release_metadata?.source_release_id ?? null,
    source_reference: {
      field: temporal.source_reference_field,
      value: temporal.source_reference_value,
      at: temporal.source_reference_at,
    },
    temporal_status: temporal,
    status_semantics: temporal.evidence_scope,
    general_business_operating_status_asserted: false,
    complete_all_businesses: false,
    ...(spec.recordUnitSemantics ? { record_unit_semantics: spec.recordUnitSemantics } : {}),
    zip_contribution: { rows: source.zip_rows_with_contribution, address_counts: structuredClone(addressCounts), scope: "source-release" },
    geocode,
    ...(spec.evidenceContract ? { evidence_contract: structuredClone(spec.evidenceContract) } : {}),
    ...(txRelease ? { dataset_release_id: txRelease.release_id, dataset_manifest_sha256: spec.datasetManifestSha256 } : {}),
    ...(quarantine ? { quarantine } : {}),
    policy: {
      id: policy.policy_id,
      version: policy.version,
      sha256: sha256(policyBytes),
      reviewed_at: policy.reviewed_at,
      field_export_policy: structuredClone(policy.field_export_policy ?? null),
      redistribution: policy.redistribution,
    },
    authorization: {
      acquisition_authorized: false,
      acquisition_authority_inferred: false,
      production_pointer_change_authorized: false,
      basis: "retained production evidence and pinned source policy; no new acquisition authority inferred",
    },
  };
}
