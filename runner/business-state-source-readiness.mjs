export const BUSINESS_STATE_SOURCE_READINESS_POLICY_VERSION = "1.0.0";

const BROAD_ORGANIZATION_LAYERS = Object.freeze({
  CO: "co_business_registry_good_standing_or_delinquent_organizations",
  CT: "ct_business_registry_active_organizations",
  DE: "de_business_licenses_current",
  FL: "fl_business_registry_quarterly_active_entities",
  IA: "ia_business_registry_active_entities",
  NY: "ny_business_registry_active_entities",
  OR: "or_business_registry_active_registrations",
  PA: "pa_business_registry_active_registrations",
});

const STATEWIDE_SCOPED_LAYERS = Object.freeze({
  AK: Object.freeze(["ak_active_business_licenses"]),
  CA: Object.freeze(["california_abc_active_issued_license_sites"]),
  DC: Object.freeze(["dc_basic_business_license_sites"]),
  TX: Object.freeze(["tx_active_sales_tax_permit_outlets"]),
  WA: Object.freeze(["wa_lni_active_contractor_organizations"]),
});

const LOCAL_LAYERS = Object.freeze({
  CA: Object.freeze(["la_active_business_location_accounts"]),
  IL: Object.freeze(["chicago_active_business_license_sites"]),
  NY: Object.freeze(["nyc_dcwp_active_license_sites"]),
});

const NATIONAL_SECTOR_PROFILE_SOURCE_IDS = Object.freeze(new Set([
  "cms-nppes-monthly-v2",
  "epa-echo-exporter-active-facility",
  "fdic-bankfind-current-structure",
  "fmcsa-company-census-active-us-principal-office",
  "ncua-final-quarterly-call-report",
  "usda-fsis-active-mpi-directory",
  "usda-snap-current-retailers",
]));

export const FIFTY_STATES_AND_DC = Object.freeze([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

function percentage(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

export function assessStateBusinessSourceReadiness(row) {
  const abbreviation = String(row?.postal_abbreviation ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(abbreviation)) throw new Error("State source readiness requires a two-letter postal abbreviation.");
  const inNationalPeerScope = row?.is_50_states_or_dc === true && FIFTY_STATES_AND_DC.includes(abbreviation);
  const broadSource = BROAD_ORGANIZATION_LAYERS[abbreviation] ?? null;
  const scopedSources = STATEWIDE_SCOPED_LAYERS[abbreviation] ?? [];
  const localSources = LOCAL_LAYERS[abbreviation] ?? [];
  let sourceScopeStatus = "outside-50-states-and-dc-peer-scope";
  if (inNationalPeerScope && broadSource) sourceScopeStatus = "broad-jurisdiction-organization-layer";
  else if (inNationalPeerScope && scopedSources.length) sourceScopeStatus = "statewide-scoped-layer-only";
  else if (inNationalPeerScope && localSources.length) sourceScopeStatus = "local-and-national-sector-layers-only";
  else if (inNationalPeerScope) sourceScopeStatus = "national-sector-layers-only";
  const reportedProfiles = Number(row?.registry_evidence?.reported_address_profile_count ?? 0);
  const coordinateProfiles = Number(row?.registry_evidence?.coordinate_assigned_profile_count ?? 0);
  const profileSources = row?.registry_evidence?.source_profile_counts_by_reported_address_state ?? {};
  const nationalSectorEvidencePresent = Object.entries(profileSources)
    .some(([sourceId, count]) => NATIONAL_SECTOR_PROFILE_SOURCE_IDS.has(sourceId) && Number(count) > 0);
  return {
    policy_version: BUSINESS_STATE_SOURCE_READINESS_POLICY_VERSION,
    in_50_states_and_dc_peer_scope: inNationalPeerScope,
    source_scope_status: sourceScopeStatus,
    broad_jurisdiction_organization_layer: broadSource ? {
      status: "production-integrated",
      source_key: broadSource,
    } : {
      status: inNationalPeerScope ? "missing" : "not-applicable",
      source_key: null,
    },
    statewide_scoped_source_keys: scopedSources,
    local_source_keys: localSources,
    national_sector_evidence_present: inNationalPeerScope && nationalSectorEvidencePresent,
    reported_location_profile_count: reportedProfiles,
    coordinate_assigned_profile_count: coordinateProfiles,
    coordinate_assignment_percent: percentage(coordinateProfiles, reportedProfiles),
    complete_all_active_businesses: false,
    missing_evidence: inNationalPeerScope ? [
      ...(!broadSource ? ["broad-jurisdiction-organization-layer"] : []),
      ...(coordinateProfiles < reportedProfiles ? ["source-coordinate-or-governed-address-geocode"] : []),
      "independently-validated-active-business-completeness",
    ] : [],
    geometry_policy: "business-entities-use-address-latitude-longitude-only-no-business-geometry",
  };
}

export function summarizeStateBusinessSourceReadiness(rows) {
  const peers = rows.map((row) => row.state_source_readiness ?? assessStateBusinessSourceReadiness(row))
    .filter((row) => row.in_50_states_and_dc_peer_scope);
  const summary = {
    policy_version: BUSINESS_STATE_SOURCE_READINESS_POLICY_VERSION,
    jurisdictions_in_scope: peers.length,
    broad_jurisdiction_organization_layers: 0,
    missing_broad_jurisdiction_organization_layers: 0,
    statewide_scoped_layers_without_broad_layer: 0,
    local_layers_without_broad_or_statewide_layer: 0,
    national_sector_layers_only: 0,
    jurisdictions_with_national_sector_evidence: 0,
    reported_location_profiles: 0,
    coordinate_assigned_profiles: 0,
    coordinate_assignment_percent: null,
    complete_all_active_businesses: false,
  };
  for (const row of peers) {
    if (row.broad_jurisdiction_organization_layer.status === "production-integrated") summary.broad_jurisdiction_organization_layers += 1;
    else summary.missing_broad_jurisdiction_organization_layers += 1;
    if (row.source_scope_status === "statewide-scoped-layer-only") summary.statewide_scoped_layers_without_broad_layer += 1;
    if (row.source_scope_status === "local-and-national-sector-layers-only") summary.local_layers_without_broad_or_statewide_layer += 1;
    if (row.source_scope_status === "national-sector-layers-only") summary.national_sector_layers_only += 1;
    if (row.national_sector_evidence_present) summary.jurisdictions_with_national_sector_evidence += 1;
    summary.reported_location_profiles += row.reported_location_profile_count;
    summary.coordinate_assigned_profiles += row.coordinate_assigned_profile_count;
  }
  summary.coordinate_assignment_percent = percentage(summary.coordinate_assigned_profiles, summary.reported_location_profiles);
  return summary;
}
