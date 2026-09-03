'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { runnerJson } from './runner-client';
type Dimension = 'states' | 'counties' | 'zips' | 'sources' | 'gaps';

type Overview = {
  available: boolean;
  release_id?: string;
  created_at?: string;
  status?: string;
  export_policy?: string;
  complete_all_businesses?: boolean;
  entity_resolution_applied?: boolean;
  spatial_zip_polygon_denominator?: {
    count: number;
    geography_type: 'census-zcta5';
    source_vintage: string;
    zip4_polygon_applicability: 'not-applicable';
  };
  normalized_postal_field_migration?: {
    status: 'enforced-in-registry-release' | 'pre-migration-registry-release';
    registry_publisher_version: string | null;
    required_registry_publisher_version: string;
  };
  normalized_postal_source_migration?: {
    migration_id: string;
    contract_version: string;
    ready_for_registry_2_10: boolean;
    counts: {
      total: number;
      ready: number;
      rebuild_required: number;
      blocked: number;
      candidate_pointers_used: number;
    };
    candidate_plan_sha256: string;
    candidate_counts: {
      total: number;
      ready: number;
      rebuild_required: number;
      blocked: number;
      candidate_pointers_used: number;
    };
    sources: Array<{
      source_key: string;
      dataset_id: string;
      status: 'ready' | 'rebuild-required' | 'blocked';
      pointer_scope: 'production' | 'candidate' | 'override';
      current_connector_version: string | null;
      minimum_connector_version: string;
      reason: string;
      build_commands: string[];
      verify_command: string;
    }>;
  };
  normalized_postal_cutover?: {
    lock_present: boolean;
    lock: null | {
      readable: boolean;
      cutover_id: string | null;
      pid: number | null;
      hostname: string | null;
      operation: string | null;
      acquired_at: string | null;
      owner_alive: boolean | null;
    };
    run_count: number;
    latest_run: null | {
      cutover_id: string;
      status: string;
      plan_sha256: string | null;
      state_revision: number | null;
      updated_at: string | null;
    };
  };
  usps_operational_zip_evidence?: unknown;
  authoritative_current_usps_zip_denominator?: unknown;
  source_temporal_summary?: {
    total_sources: number;
    policy_configured: number;
    within_review_window: number;
    review_due: number;
    missing_source_reference: number;
    future_source_reference: number;
    unconfigured_source_policy: number;
    general_business_operating_status_asserted: number;
  };
  state_source_readiness_summary?: {
    policy_version: string;
    jurisdictions_in_scope: number;
    broad_jurisdiction_organization_layers: number;
    missing_broad_jurisdiction_organization_layers: number;
    statewide_scoped_layers_without_broad_layer: number;
    local_layers_without_broad_or_statewide_layer: number;
    national_sector_layers_only: number;
    jurisdictions_with_national_sector_evidence: number;
    reported_location_profiles: number;
    coordinate_assigned_profiles: number;
    coordinate_assignment_percent: number | null;
    complete_all_active_businesses: false;
  };
  state_source_revalidation_summary?: {
    schema_version: string;
    revalidation_id: string;
    observed_at: string;
    coverage_release_id: string;
    current_coverage_release_id: string | null;
    coverage_release_matches_current: boolean | null;
    jurisdictions_revalidated: number;
    hold_decisions: number;
    bounded_connector_decisions: number;
    changed_decisions: number;
    autonomous_acquisitions_authorized: number;
    production_ready_jurisdictions: number;
  } | null;
  state_source_assessment_summary?: {
    schema_version: string;
    assessment_catalog_id: string;
    observed_at: string;
    coverage_release_id: string;
    current_coverage_release_id: string | null;
    coverage_release_matches_current: boolean | null;
    source_artifact_ids: string[];
    jurisdictions_assessed: number;
    jurisdictions_revalidated: number;
    jurisdictions_discovered: number;
    hold_decisions: number;
    bounded_connector_decisions: number;
    changed_decisions: number;
    autonomous_acquisitions_authorized: number;
    production_ready_jurisdictions: number;
  } | null;
  coverage?: {
    state_views: number;
    county_views: number;
    zip_views: number;
    source_views: number;
    gap_views: number;
    location_profiles_assessed: number;
    coordinate_assigned_profiles: number;
    profiles_without_valid_coordinate_assignment: number;
    spatial_zip_polygon_denominator_count: number;
    zip_views_with_record_level_source_contribution: number;
    zip_views_without_record_level_source_contribution: number;
    zip_views_with_zcta_polygon: number;
    zip_views_without_zcta_polygon: number;
    zip_views_with_published_employer_baseline: number;
    zip_views_without_published_employer_baseline: number;
    nonemployer_reference_year: number;
    national_nonemployer_establishments: number;
    state_views_with_published_nonemployer_baseline: number;
    state_views_without_published_nonemployer_baseline: number;
    county_views_with_published_nonemployer_baseline: number;
    county_views_without_published_nonemployer_baseline: number;
    ct_business_registry_active_organization_records: number;
    ct_business_registry_eligible_reported_us_business_addresses: number;
    de_business_license_source_current_license_rows: number;
    de_business_license_accepted_current_license_rows: number;
    de_business_license_current_organization_records: number;
    de_business_license_quarantined_source_records: number;
    de_business_license_quarantined_license_groups: number;
    de_business_license_eligible_reported_us_business_addresses: number;
    ak_active_business_license_source_rows: number;
    ak_active_business_license_organizations: number;
    ak_active_business_license_provisional_physical_sites: number;
    ak_active_business_license_organizations_without_eligible_physical_site: number;
    ak_active_business_license_reported_us_address_zip_contributions: number;
    ak_active_business_license_quarantined_source_records: number;
    ak_active_business_license_accepted_naics_pairs: number;
    co_business_registry_good_standing_or_delinquent_organization_records: number;
    co_business_registry_quarantined_source_records: number;
    co_business_registry_eligible_reported_us_business_addresses: number;
    or_business_registry_source_principal_place_rows: number;
    or_business_registry_active_registration_records: number;
    or_business_registry_legal_entity_registrations: number;
    or_business_registry_assumed_business_name_registrations: number;
    or_business_registry_eligible_registration_zip_contributions: number;
    ia_business_registry_active_organization_records: number;
    ia_business_registry_quarantined_entities: number;
    ia_business_registry_entities_with_eligible_us_home_office_address: number;
    ia_business_registry_eligible_entity_zip_contributions: number;
    ia_business_registry_entities_with_source_geocoded_coordinates: number;
    ny_business_registry_active_organization_records: number;
    ny_business_registry_quarantined_source_records: number;
    ny_business_registry_eligible_reported_us_location_addresses: number;
    fl_business_registry_source_records: number;
    fl_business_registry_active_source_records: number;
    fl_business_registry_inactive_source_records_excluded: number;
    fl_business_registry_active_organization_records: number;
    fl_business_registry_quarantined_source_records: number;
    fl_business_registry_eligible_reported_us_principal_addresses: number;
    pa_business_registry_source_active_registration_rows: number;
    pa_business_registry_active_organization_records: number;
    pa_business_registry_duplicate_filing_number_groups: number;
    pa_business_registry_duplicate_rows_collapsed: number;
    pa_business_registry_eligible_reported_us_business_addresses: number;
    pa_business_registry_source_geocoded_reported_business_addresses: number;
    pa_business_registry_reported_pa_address_geocodes_outside_broad_pa_bounds: number;
    wa_lni_active_contractor_license_source_rows: number;
    wa_lni_active_contractor_organizations: number;
    wa_lni_active_contractor_license_activities: number;
    wa_lni_active_contractor_grouped_multi_license_organizations: number;
    wa_lni_active_contractor_reported_business_names: number;
    wa_lni_active_contractor_reported_mailing_addresses: number;
    wa_lni_active_contractor_eligible_reported_us_mailing_addresses: number;
    wa_lni_active_contractor_organizations_without_eligible_us_zip_address: number;
    la_active_business_source_location_accounts: number;
    la_active_business_normalized_us_location_accounts: number;
    la_active_business_quarantined_source_records: number;
    la_active_business_source_geocoded_locations: number;
    la_active_business_in_city_council_district_locations: number;
    la_active_business_out_of_city_locations: number;
    la_active_business_suspect_in_city_coordinates: number;
    tx_active_sales_tax_source_outlet_permits: number;
    tx_active_sales_tax_normalized_outlet_permits: number;
    tx_active_sales_tax_unique_taxpayers: number;
    tx_active_sales_tax_quarantined_source_records: number;
    chicago_active_business_license_source_records: number;
    chicago_active_business_license_accepted_records: number;
    chicago_active_business_license_normalized_sites: number;
    chicago_active_business_license_unique_accounts: number;
    chicago_active_business_license_quarantined_source_records: number;
    chicago_active_business_license_quarantined_site_groups: number;
    chicago_active_business_license_source_geocoded_sites: number;
    chicago_active_business_license_in_chicago_ward_sites: number;
    chicago_active_business_license_outside_or_unreported_ward_sites: number;
    dc_basic_business_license_source_rows: number;
    dc_basic_business_license_accepted_rows: number;
    dc_basic_business_license_normalized_sites: number;
    dc_basic_business_license_organizations: number;
    dc_basic_business_license_quarantined_source_records: number;
    dc_basic_business_license_quarantined_customer_groups: number;
    dc_basic_business_license_source_geocoded_sites: number;
    dc_basic_business_license_source_coordinate_conflict_sites: number;
    dc_basic_business_license_in_dc_premise_sites: number;
    dc_basic_business_license_outside_dc_premise_sites: number;
    ca_abc_source_records: number;
    ca_abc_selected_active_issued_license_rows: number;
    ca_abc_excluded_source_rows: number;
    ca_abc_active_issued_license_normalized_sites: number;
    ca_abc_active_issued_license_organizations: number;
    ca_abc_active_issued_license_activities: number;
    ca_abc_quarantined_source_rows: number;
    ca_abc_quarantined_file_groups: number;
    ca_abc_source_active_rows_with_expiration_before_observation: number;
    nyc_dcwp_active_license_source_records: number;
    nyc_dcwp_active_license_accepted_records: number;
    nyc_dcwp_active_license_normalized_sites: number;
    nyc_dcwp_active_license_unique_business_ids: number;
    nyc_dcwp_active_license_quarantined_source_records: number;
    nyc_dcwp_active_license_quarantined_business_groups: number;
    nyc_dcwp_active_license_source_geocoded_sites: number;
    nyc_dcwp_active_license_in_nyc_borough_sites: number;
    nyc_dcwp_active_license_outside_or_unreported_nyc_borough_sites: number;
    gap_counts_by_type: Record<string, number>;
  };
  national?: Array<Record<string, unknown>>;
  sources?: SourceRow[];
  limitations?: string[];
};

type Page<T = Record<string, unknown>> = {
  available: boolean;
  release_id?: string;
  dimension: Dimension;
  total: number;
  offset: number;
  limit: number;
  records: T[];
};

type StateSourceAssessment = {
  assessment_id: string;
  assessment_kind: 'revalidation' | 'source-discovery';
  revalidation_id: string | null;
  observed_at: string;
  coverage_release_id: string;
  coverage_release_matches_current: boolean;
  prior_decision: 'hold' | 'proceed-to-bounded-connector' | null;
  decision: 'hold' | 'proceed-to-bounded-connector';
  changed_since_prior_review: boolean;
  candidate: { publisher: string; product: string; availability: string; price: string };
  bounded_connector_implementation_authorized: boolean;
  autonomous_acquisition_authorized: false;
  complete_source_acquisition_authorized: false;
  production_ready: false;
  unresolved_gates: string[];
  strongest_bounded_next_action: string;
  official_urls: string[];
};

type StateRow = {
  view_id: string;
  state_fips: string;
  state_name: string;
  postal_abbreviation: string;
  state_equivalent_kind: string;
  reported_address_profile_count: number;
  coordinate_assigned_profile_count: number;
  material_intersecting_zcta_count: number;
  zctas_with_record_level_source_contribution: number;
  nonemployer_baseline?: NonemployerBaseline;
  state_source_readiness: {
    policy_version: string;
    in_50_states_and_dc_peer_scope: boolean;
    source_scope_status: 'broad-jurisdiction-organization-layer' | 'statewide-scoped-layer-only' | 'local-and-national-sector-layers-only' | 'national-sector-layers-only' | 'outside-50-states-and-dc-peer-scope';
    broad_jurisdiction_organization_layer: { status: 'production-integrated' | 'missing' | 'not-applicable'; source_key: string | null };
    statewide_scoped_source_keys: string[];
    local_source_keys: string[];
    coordinate_assignment_percent: number | null;
    complete_all_active_businesses: false;
  };
  latest_source_assessment: StateSourceAssessment | null;
  latest_source_revalidation: StateSourceAssessment | null;
};

type CountyRow = {
  view_id: string;
  county_geoid: string;
  county_name: string;
  state_fips: string;
  coordinate_assigned_profile_count: number;
  material_intersecting_zcta_count: number;
  zctas_with_record_level_source_contribution: number;
  nonemployer_baseline?: NonemployerBaseline;
};

type ZipRow = {
  view_id: string;
  zip_code: string;
  coverage_status: string;
  physical_site_count: number;
  establishment_count: number;
  organization_primary_location_count: number;
  zcta_geoid: string | null;
  spatial_zip_polygon_membership_status: 'included' | 'not-in-denominator' | 'unknown';
  employer_baseline_status: string;
  employer_establishments: number | null;
  material_county_count: number;
  current_usps_validity_status: string;
  coverage_gap_codes: string[];
};

type SourceRow = {
  view_id: string;
  source_key: string;
  source_name: string;
  profile_source_id: string | null;
  zip_rows_with_contribution: number;
  profile_count: number;
  reported_state_assigned_count: number;
  coordinate_present_valid_count: number;
  coordinate_assigned_single_count: number;
  coordinate_missing_count: number;
  zip_level_counts?: Record<string, number>;
  source_kind?: string;
  aggregate_baseline?: {
    national_nonemployer_establishments: number;
    state_totals: number;
    county_totals: number;
  } | null;
  temporal_status: {
    policy_version: string;
    policy_configured: boolean;
    status: 'within-review-window' | 'review-due' | 'missing-source-reference' | 'future-source-reference' | 'unconfigured-source-policy';
    source_reference_field: string | null;
    source_reference_date: string | null;
    age_days: number | null;
    review_after_days: number | null;
    review_due_date: string | null;
    cadence_class: string;
    evidence_scope: string;
    general_business_operating_status_asserted: false;
  };
};

type NonemployerBaseline = {
  status: string;
  reference_year: number;
  nonemployer_establishments: number | null;
};

type GapRow = {
  gap_id: string;
  gap_type: string;
  scope_type: string;
  scope_id: string;
  severity: string;
  consequence: string;
};

const dimensionLabels: Record<Dimension, string> = {
  states: 'States',
  counties: 'Counties',
  zips: 'ZIPs',
  sources: 'Sources',
  gaps: 'Coverage gaps',
};

function count(value?: number | null) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function shortRelease(value?: string) {
  if (!value) return 'No release';
  const match = value.match(/(\d{8}-\d{9}Z-[a-f0-9]{8})$/);
  return match?.[1] ?? value;
}

function label(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function request<T>(path: string): Promise<T> {
  return runnerJson<T>(path);
}

function StateRows({ records }: { records: StateRow[] }) {
  return records.map((row) => {
    const assessment = row.latest_source_assessment ?? row.latest_source_revalidation;
    return (
    <div className="coverage-table-row state-row" key={row.view_id}>
      <div><strong>{row.postal_abbreviation}</strong><span>{row.state_name} · {label(row.state_source_readiness.source_scope_status)}</span></div>
      <div className="state-source-gate">
        {assessment ? <>
          <strong className={assessment.decision === 'hold' ? 'coverage-warn' : 'coverage-ok'}>{assessment.assessment_kind === 'source-discovery' ? 'First-pass source discovery' : 'Source revalidation'}: {label(assessment.decision)}</strong>
          <span>{assessment.candidate.product}</span>
          <details><summary>{assessment.assessment_kind === 'source-discovery' ? 'Discovery gate' : 'Revalidation gate'}</summary><p>{!assessment.coverage_release_matches_current && <b>Source assessment pinned to prior coverage release. </b>}{assessment.strongest_bounded_next_action} Unresolved: {assessment.unresolved_gates.map(label).join(', ')}.</p></details>
        </> : <><strong>Source assessment unavailable</strong><span>Not included in the current governed assessment catalog</span></>}
      </div>
      <span>{count(row.reported_address_profile_count)}</span>
      <span>{count(row.coordinate_assigned_profile_count)}</span>
      <span>{row.nonemployer_baseline?.status === 'published-annual-aggregate' ? count(row.nonemployer_baseline.nonemployer_establishments) : '—'}</span>
      <span>{count(row.zctas_with_record_level_source_contribution)} <small>/ {count(row.material_intersecting_zcta_count)}</small></span>
    </div>
  );
  });
}

function CountyRows({ records }: { records: CountyRow[] }) {
  return records.map((row) => (
    <div className="coverage-table-row county-row" key={row.view_id}>
      <div><strong>{row.county_name}</strong><span>{row.county_geoid} · state {row.state_fips}</span></div>
      <span>{count(row.coordinate_assigned_profile_count)}</span>
      <span>{row.nonemployer_baseline?.status === 'published-annual-aggregate' ? count(row.nonemployer_baseline.nonemployer_establishments) : '—'}</span>
      <span>{count(row.zctas_with_record_level_source_contribution)} <small>/ {count(row.material_intersecting_zcta_count)}</small></span>
    </div>
  ));
}

function ZipRows({ records }: { records: ZipRow[] }) {
  return records.map((row) => (
    <div className="coverage-table-row zip-row" key={row.view_id}>
      <div><strong>{row.zip_code}</strong><span>{row.spatial_zip_polygon_membership_status === 'included' && row.zcta_geoid
        ? `Census ZCTA5 ${row.zcta_geoid} · ${row.material_county_count} material count${row.material_county_count === 1 ? 'y' : 'ies'}`
        : row.spatial_zip_polygon_membership_status === 'not-in-denominator'
          ? 'Reported ZIP5 · outside Census polygon set'
          : 'Census polygon membership unavailable'}</span></div>
      <span>{count(row.physical_site_count)}</span>
      <span>{count(row.establishment_count)}</span>
      <span className={row.coverage_status === 'record-level-source-contribution' ? 'coverage-ok' : 'coverage-warn'}>{row.coverage_status === 'record-level-source-contribution' ? 'Evidence' : 'Gap'}</span>
      <span>{row.employer_baseline_status === 'published' ? count(row.employer_establishments) : '—'}</span>
    </div>
  ));
}

function SourceRows({ records }: { records: SourceRow[] }) {
  return records.map((row) => {
    const aggregate = row.source_kind === 'aggregate-baseline' ? row.aggregate_baseline : null;
    const entityOnlyEvidence = row.profile_count === 0
      ? Math.max(0, ...Object.values(row.zip_level_counts ?? {}))
      : row.profile_count;
    return (
      <div className="coverage-table-row source-row" key={row.view_id}>
        <div><strong>{row.source_name || label(row.source_key)}</strong><span>{label(row.temporal_status.evidence_scope)}</span></div>
        <span>{count(aggregate?.national_nonemployer_establishments ?? entityOnlyEvidence)}</span>
        <span>{aggregate ? `${count(aggregate.state_totals)} states` : count(row.coordinate_assigned_single_count)}</span>
        <span className={row.temporal_status.status === 'within-review-window' ? 'coverage-ok' : 'coverage-warn'}>{row.temporal_status.source_reference_date ?? 'No source date'} <small>{label(row.temporal_status.status)}</small></span>
        <span>{aggregate ? `${count(aggregate.county_totals)} counties` : count(row.zip_rows_with_contribution)}</span>
      </div>
    );
  });
}

function GapRows({ records }: { records: GapRow[] }) {
  return records.map((row) => (
    <div className="coverage-table-row gap-row" key={row.gap_id}>
      <div><strong>{label(row.gap_type)}</strong><span>{row.scope_type} · {row.scope_id}</span></div>
      <span className="gap-severity">{label(row.severity)}</span>
      <p>{row.consequence}</p>
    </div>
  ));
}

export default function CoverageExplorer() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [dimension, setDimension] = useState<Dimension>('states');
  const [page, setPage] = useState<Page | null>(null);
  const [query, setQuery] = useState('');
  const [stateFips, setStateFips] = useState('');
  const [gapType, setGapType] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      setError('');
      setOverview(await request<Overview>('/api/business-coverage'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load business coverage.');
    }
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const parameters = new URLSearchParams({ offset: String(offset), limit: '20' });
      if (query.trim()) parameters.set('query', query.trim());
      if (dimension === 'counties' && stateFips) parameters.set('state_fips', stateFips);
      if (dimension === 'gaps' && gapType) parameters.set('gap_type', gapType);
      setPage(await request<Page>(`/api/business-coverage/${dimension}?${parameters}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load coverage records.');
    } finally {
      setLoading(false);
    }
  }, [dimension, gapType, offset, query, stateFips]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(), query ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [loadPage, query]);

  const states = useMemo(() => {
    const records = (overview?.national?.find((row) => row.view_id === 'national:all-census-us-areas') as { geography?: { state_equivalent_count?: number } } | undefined);
    return records?.geography?.state_equivalent_count ?? overview?.coverage?.state_views ?? 0;
  }, [overview]);
  const gapTypes = Object.keys(overview?.coverage?.gap_counts_by_type ?? {});
  const visiblePage = page?.dimension === dimension ? page : null;
  const maxOffset = visiblePage ? Math.max(0, Math.floor(Math.max(0, visiblePage.total - 1) / visiblePage.limit) * visiblePage.limit) : 0;
  const unavailable = overview && !overview.available;
  const sourceAssessmentSummary = overview?.state_source_assessment_summary ?? overview?.state_source_revalidation_summary;

  function chooseDimension(next: Dimension) {
    setDimension(next);
    setPage(null);
    setLoading(true);
    setOffset(0);
    setQuery('');
    setStateFips('');
    setGapType('');
  }

  return (
    <section id="coverage" className="panel coverage-panel">
      <div className="panel-heading coverage-heading">
        <div>
          <span className="section-kicker">Governed overall view</span>
          <h2>U.S. business coverage <em>{shortRelease(overview?.release_id)}</em></h2>
        </div>
        <div className="coverage-release-state">
          <span className="coverage-local">Local aggregate</span>
          <button className="ghost-button" onClick={() => { void loadOverview(); void loadPage(); }}>Refresh</button>
        </div>
      </div>

      {unavailable && <div className="coverage-empty"><strong>No coverage release</strong><span>Run <code>npm run coverage-views:build</code> to publish the first governed overall view.</span></div>}
      {!unavailable && (
        <>
          <div className="coverage-metrics">
            <div><span>Location profiles assessed</span><strong>{count(overview?.coverage?.location_profiles_assessed)}</strong><small>Source-preserving, not deduplicated businesses</small></div>
            <div><span>ZIP rows with evidence</span><strong>{count(overview?.coverage?.zip_views_with_record_level_source_contribution)}</strong><small>{count(overview?.coverage?.zip_views_without_record_level_source_contribution)} denominator-only gaps</small></div>
            <div><span>County-assigned profiles</span><strong>{count(overview?.coverage?.coordinate_assigned_profiles)}</strong><small>{count(overview?.coverage?.profiles_without_valid_coordinate_assignment)} remain unallocated</small></div>
            <div><span>Explicit coverage gaps</span><strong>{count(overview?.coverage?.gap_views)}</strong><small>Census polygon denominator active; identity gate remains open</small></div>
          </div>

          <div className="coverage-scope-strip">
            <span><strong>{count(states)}</strong> state equivalents</span>
            <span><strong>{count(overview?.coverage?.county_views)}</strong> county equivalents</span>
            <span><strong>{count(overview?.spatial_zip_polygon_denominator?.count ?? overview?.coverage?.spatial_zip_polygon_denominator_count)}</strong> Census ZCTA5 polygons</span>
            <span><strong>{count(overview?.coverage?.zip_views_without_zcta_polygon)}</strong> reported ZIP5 values outside polygon set</span>
            <span><strong>{overview?.normalized_postal_field_migration?.status === 'enforced-in-registry-release' ? 'Enforced' : 'Pending rebuild'}</strong> ZIP5 / ZIP4 split · registry {overview?.normalized_postal_field_migration?.registry_publisher_version ?? '—'}</span>
            <span><strong>{count(overview?.normalized_postal_source_migration?.candidate_counts.ready)} / {count(overview?.normalized_postal_source_migration?.candidate_counts.total)}</strong> isolated candidates ready · {count(overview?.normalized_postal_source_migration?.counts.ready)} production migrated · {count(overview?.normalized_postal_source_migration?.candidate_counts.blocked)} blocked</span>
            <span><strong>{overview?.normalized_postal_cutover?.lock_present ? 'Locked' : 'Unlocked'}</strong> postal cutover · {overview?.normalized_postal_cutover?.latest_run?.status ?? 'not started'}</span>
            <span><strong>{count(overview?.coverage?.zip_views_with_published_employer_baseline)}</strong> published ZBP baselines</span>
            <span><strong>{count(overview?.coverage?.national_nonemployer_establishments)}</strong> nonemployer baseline · {overview?.coverage?.nonemployer_reference_year ?? '—'}</span>
            <span><strong>{count(overview?.state_source_readiness_summary?.broad_jurisdiction_organization_layers)} / {count(overview?.state_source_readiness_summary?.jurisdictions_in_scope)}</strong> broad state organization layers · {count(overview?.state_source_readiness_summary?.missing_broad_jurisdiction_organization_layers)} gaps</span>
            <span><strong>{overview?.state_source_readiness_summary?.coordinate_assignment_percent?.toFixed(2) ?? '—'}%</strong> state-profile coordinate assignment · address latitude/longitude only</span>
            {sourceAssessmentSummary
              ? <span><strong>{count('jurisdictions_assessed' in sourceAssessmentSummary ? sourceAssessmentSummary.jurisdictions_assessed : sourceAssessmentSummary.jurisdictions_revalidated)}</strong> source contracts assessed · {'jurisdictions_discovered' in sourceAssessmentSummary ? `${count(sourceAssessmentSummary.jurisdictions_revalidated)} revalidated · ${count(sourceAssessmentSummary.jurisdictions_discovered)} first-pass discoveries · ` : ''}{count(sourceAssessmentSummary.hold_decisions)} hold · {count(sourceAssessmentSummary.bounded_connector_decisions)} bounded connector</span>
              : <span><strong>Unavailable</strong> no current source-contract assessment catalog</span>}
            <span><strong>{count(overview?.source_temporal_summary?.within_review_window)} / {count(overview?.source_temporal_summary?.total_sources)}</strong> sources within review window · {count(overview?.source_temporal_summary?.review_due)} due · {count(overview?.source_temporal_summary?.missing_source_reference)} missing date</span>
            <span><strong>{count(overview?.coverage?.ct_business_registry_active_organization_records)}</strong> CT active registrations</span>
            <span><strong>{count(overview?.coverage?.de_business_license_current_organization_records)}</strong> DE current licenses · {count(overview?.coverage?.de_business_license_eligible_reported_us_business_addresses)} reported U.S. addresses</span>
            <span><strong>{count(overview?.coverage?.ak_active_business_license_organizations)}</strong> AK active licenses · {count(overview?.coverage?.ak_active_business_license_provisional_physical_sites)} provisional sites</span>
            <span><strong>{count(overview?.coverage?.co_business_registry_good_standing_or_delinquent_organization_records)}</strong> CO Good Standing/Delinquent registrations</span>
            <span><strong>{count(overview?.coverage?.or_business_registry_active_registration_records)}</strong> OR active registrations</span>
            <span><strong>{count(overview?.coverage?.ia_business_registry_active_organization_records)}</strong> IA active entities</span>
            <span><strong>{count(overview?.coverage?.ny_business_registry_active_organization_records)}</strong> NY active extract entities</span>
            <span><strong>{count(overview?.coverage?.fl_business_registry_active_organization_records)}</strong> FL active quarterly entities</span>
            <span><strong>{count(overview?.coverage?.pa_business_registry_active_organization_records)}</strong> PA active registrations</span>
            <span><strong>{count(overview?.coverage?.wa_lni_active_contractor_organizations)}</strong> WA active contractor-license organizations · {count(overview?.coverage?.wa_lni_active_contractor_eligible_reported_us_mailing_addresses)} reported U.S. mailing addresses</span>
            <span><strong>{count(overview?.coverage?.la_active_business_normalized_us_location_accounts)}</strong> LA active location accounts</span>
            <span><strong>{count(overview?.coverage?.tx_active_sales_tax_normalized_outlet_permits)}</strong> TX active sales-tax outlets</span>
            <span><strong>{count(overview?.coverage?.chicago_active_business_license_normalized_sites)}</strong> Chicago active-license sites</span>
            <span><strong>{count(overview?.coverage?.dc_basic_business_license_normalized_sites)}</strong> DC Basic Business License sites</span>
            <span><strong>{count(overview?.coverage?.ca_abc_active_issued_license_normalized_sites)}</strong> CA ABC active-license sites · {count(overview?.coverage?.ca_abc_source_active_rows_with_expiration_before_observation)} source-active rows with past expiration</span>
            <span><strong>{count(overview?.coverage?.nyc_dcwp_active_license_normalized_sites)}</strong> NYC DCWP active-license sites</span>
            <span className="coverage-hold">Entity resolution unapplied</span>
          </div>

          <div className="coverage-tabs" role="tablist" aria-label="Business coverage dimensions">
            {(Object.keys(dimensionLabels) as Dimension[]).map((value) => (
              <button key={value} role="tab" aria-selected={dimension === value} className={dimension === value ? 'active' : ''} onClick={() => chooseDimension(value)}>
                {dimensionLabels[value]} <small>{value === 'gaps' ? count(overview?.coverage?.gap_views) : value === 'states' ? count(overview?.coverage?.state_views) : value === 'counties' ? count(overview?.coverage?.county_views) : value === 'zips' ? count(overview?.coverage?.zip_views) : count(overview?.coverage?.source_views)}</small>
              </button>
            ))}
          </div>

          <div className="coverage-toolbar">
            <label><span>{dimension === 'zips' ? 'ZIP prefix' : 'Search'}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder={dimension === 'zips' ? 'e.g. 606' : `Search ${dimensionLabels[dimension].toLowerCase()}`} /></label>
            {dimension === 'counties' && <label><span>State FIPS</span><input value={stateFips} onChange={(event) => { setStateFips(event.target.value.replace(/\D/g, '').slice(0, 2)); setOffset(0); }} placeholder="All" inputMode="numeric" /></label>}
            {dimension === 'gaps' && <label className="gap-filter"><span>Gap type</span><select value={gapType} onChange={(event) => { setGapType(event.target.value); setOffset(0); }}><option value="">All gap types</option>{gapTypes.map((value) => <option key={value} value={value}>{label(value)} ({count(overview?.coverage?.gap_counts_by_type[value])})</option>)}</select></label>}
            <span className="coverage-result-count">{loading || !visiblePage ? 'Loading…' : `${count(visiblePage.total)} records`}</span>
          </div>

          {error && <div className="coverage-error">{error}</div>}
          <div className={`coverage-table ${dimension}`} aria-live="polite">
            {!loading && visiblePage?.records.length === 0 && <div className="coverage-empty"><strong>No matching records</strong><span>Adjust the current filters.</span></div>}
            {dimension === 'states' && <StateRows records={(visiblePage?.records ?? []) as StateRow[]} />}
            {dimension === 'counties' && <CountyRows records={(visiblePage?.records ?? []) as CountyRow[]} />}
            {dimension === 'zips' && <ZipRows records={(visiblePage?.records ?? []) as ZipRow[]} />}
            {dimension === 'sources' && <SourceRows records={(visiblePage?.records ?? []) as SourceRow[]} />}
            {dimension === 'gaps' && <GapRows records={(visiblePage?.records ?? []) as GapRow[]} />}
          </div>

          <div className="coverage-pager">
            <span>{visiblePage?.total ? `${count((visiblePage.offset ?? 0) + 1)}–${count(Math.min(visiblePage.total, (visiblePage.offset ?? 0) + visiblePage.limit))} of ${count(visiblePage.total)}` : '0 records'}</span>
            <div><button onClick={() => setOffset(Math.max(0, offset - (visiblePage?.limit ?? 20)))} disabled={!visiblePage || offset === 0}>Previous</button><button onClick={() => setOffset(Math.min(maxOffset, offset + (visiblePage?.limit ?? 20)))} disabled={!visiblePage || offset >= maxOffset}>Next</button></div>
          </div>
        </>
      )}
    </section>
  );
}
