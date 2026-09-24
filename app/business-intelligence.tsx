'use client';
import DatasetRepresentation from './dataset-representation';
import CredentialHeatmap from './credential-heatmap';
import CensusZbpIndustryHeatmap from './census-zbp-industry-heatmap';
import CensusNonemployerCountyHeatmap from './census-nonemployer-county-heatmap';
import OvertureHeatmapReadiness from './overture-heatmap-readiness';
import NppesPharmacyHeatmap from './nppes-pharmacy-heatmap';
import OrganizationZipEvidencePanel from './organization-zip-evidence-panel';

import { useEffect, useMemo, useState, type WheelEvent } from 'react';
import { runnerJson } from './runner-client';
import RetainedChildcarePanel from './retained-childcare-panel';
import RetainedCountyPanel from './retained-county-panel';

type Category = { id: string; label: string; group_id?: string; group_label?: string; business_name_drilldown: boolean };
type Enhancer = { id: string; label: string; kind: string };
type Catalog = {
  available: boolean;
  coverage_release_id: string;
  registry_release_id?: string | null;
  registry_manifest_sha256?: string | null;
  geography_release_id: string;
  geography_manifest_sha256?: string;
  gdp_release_id: string | null;
  categories: Category[];
  category_groups: Array<{ id: string; label: string; categories: Category[] }>;
  enhancers: Enhancer[];
  semantics: Record<string, string>;
};
type MapProperties = {
  geoid: string;
  name: string;
  postal_abbreviation?: string | null;
  level: 'state' | 'county' | 'zip';
  business_count: number;
  observed_business_units: number;
  observed_physical_sites: number;
  observed_organization_primary_locations: number;
  population_2020: number | null;
  population_status: string;
  housing_units_2020: number | null;
  housing_status: string;
  employer_establishments: number | null;
  employer_baseline_status: string;
  businesses_per_1000_people: number | null;
  population_density: number | null;
  evidence_per_employer_establishment: number | null;
  relative_coverage_alignment_percent: number | null;
  relative_coverage_alignment_peer_scope: string;
  relative_coverage_alignment_basis: string;
  gdp_current_dollars: number | null;
  gdp_reference_year: number | null;
  gdp_units: string | null;
  gdp_source_release_id: string | null;
  gdp_geography_kind: string | null;
  gdp_status: string;
  nonemployer_establishments: number | null;
  nonemployer_receipts_thousands_usd: number | null;
  nonemployer_reference_year: number | null;
  nonemployer_source_release_id: string | null;
  nonemployer_status: string;
  state_fips?: string;
  county_geoid?: string;
  heat_value: number | null;
  retained_childcare_county_status?: string;
  scope_assignment: string;
};
type MapFeature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: MapProperties };
type MapResponse = {
  geography_manifest_sha256?: string;
  available: boolean;
  type: 'FeatureCollection';
  level: 'states' | 'counties' | 'zips';
  category_id: string;
  enhancer_id: string;
  meta: Record<string, number | string | null>;
  features: MapFeature[];
};
type NameResponse = {
  available: boolean;
  zip_code: string | null;
  scope?: 'source-zip-unavailable';
  total: number;
  limitation?: string;
  local_review_only?: boolean;
  records: Array<{
    business_name: string;
    address: { street: string | null; street2?: string | null; city: string | null; state: string | null; zip_code: string | null; zip4: string | null };
    geocode: { latitude: number; longitude: number } | null;
    category_id: string;
    source_id: string;
    source_release_id: string | null;
    source_record_id: string | null;
    transformation_version: string | null;
    policy_id: string | null;
    observed_at: string | null;
    export_policy: string;
  }>;
};
type StateSummary = {
  available: boolean;
  categories: Array<{ id: string; label: string }>;
  national_category_counts: Record<string, number>;
  national_all_category_evidence_count: number;
  national_category_percent_of_collected_evidence: Record<string, number | null>;
  national_percentage_basis: { geography_scope: string; unit: string };
  assignment: Record<string, number | string>;
  states: Array<{
    state_fips: string;
    state_name: string;
    postal_abbreviation: string;
    category_counts: Record<string, number>;
    percent_of_state: Record<string, number | null>;
    percent_of_category_nationwide: Record<string, number | null>;
    all_category_evidence_count: number;
    population_2020: number | null;
    population_status: string;
    housing_units_2020: number | null;
    housing_status: string;
    uniquely_assigned_zcta_count: number;
  }>;
};
type GoalCompletion = {
  available: boolean; status: string; release_id: string | null; created_at?: string;
  denominator?: { version: string; datasets: number; categories: number; meaning: string };
  category?: string; categories?: string[]; all_business_completion_percent: null;
  broad_layer_gaps?: number;
  jurisdictions: Array<{ code: string; name: string; available: number; denominator: number; measured: number; unmeasured: number; measurement_status: 'measured'|'partially-measured'|'unmeasured'; percent: number | null; temporal_status_counts: Record<string, number>; authorization_state_counts: Record<string, number>; broad_layer_gap: boolean }>;
  selected: null | { code: string; name: string; category: { category_id: string; dataset_availability: { available: number; denominator: number; measured: number; unmeasured: number; measurement_status: 'measured'|'partially-measured'|'unmeasured'; percent: number | null }; datasets: Array<{ dataset_id: string; label: string; availability_status: string; state_record_count: number | null; authorization: { state: string; basis?: string }; temporal_status: { status: string }; geocode_rate: { percent: number | null; scope?: string; status?: string }; gap_reason: string | null }> } };
};
type ZipQualitySummary = {
  national_zip_coverage: {
    registry_zip5: {
      members: { count: number };
      record_level_source_contribution: { count: number };
      denominator_only_no_record_level_contribution: { count: number };
    };
    census_zcta: {
      same_code_governed_zcta_members: { count: number };
      statistical_geography_not_usps_postal_delivery_boundary: true;
    };
    usps_assignment: {
      governed_dependency_present: boolean;
      assignment_members: { count: number } | null;
      complete_current_assignment_denominator_verified: boolean;
    };
    claim_boundary: {
      active_business_completion_percentage: null;
      all_business_completion_percentage: null;
    };
  };
  classification: { classes: {
    explicit_placeholder: { count: number };
    valid_format_same_code_governed_zcta: { count: number };
    valid_format_source_reported_no_same_code_zcta: { count: number };
    valid_format_denominator_only_no_same_code_zcta: { count: number };
  } };
  usps_operational_status: null;
  usps_evidence_status: 'unverified';
};
type ZipContribution = { source_id: string; source_release_id: string | null; source_through_date?: string; source_date?: string; source_month?: string; reference_year?: number; positive_counts: Record<string, number> };
type ZipInspection = {
  zip5: string; evidence_status: string; coverage_status: string | null;
  classification: { class: string; ordinary_zip5_eligible: boolean } | null;
  bindings: Record<string, string | null>;
  governed_zcta: { status: string; geoid: string | null };
  counts: null | { physical_sites: number; establishments: number; organization_primary_locations: number; employer_establishments: number | null; employer_baseline_status: string };
  contributions: ZipContribution[];
  category_evidence: {
    category_id: string; category_label: string;
    status: 'positive-source-contribution' | 'no-selected-positive-evidence';
    positive_source_contributions: ZipContribution[]; completeness_percent: null;
    bindings: { coverage_release_id: string; registry_release_id: string; registry_manifest_sha256: string; zip_quality_audit_id: string };
    semantics: string;
  };
  pharmacy_evidence: null | {
    zip_code?: string; evidence_scope: string;
    reported_address_count: number; unique_npi_count: number; reported_zip4_count: number;
    mail_order_taxonomy_assertion_count: number;
    zcta_membership?: { status?: string } | string | null;
    source?: { dataset_id?: string | null; release_id?: string | null; source_release_id?: string | null; source_through_date?: string | null };
    claims?: { current_operation?: null; physical_site?: boolean; unique_business?: null; licensed_pharmacy?: null; nationwide_completeness?: boolean };
    limitations?: string[];
  };
  coverage_gap_codes: string[];
  employer_alignment: { numerator: number | null; denominator: number | null; percent: number | null; basis: string };
  zip_quality: { postal_fields?: Record<string, unknown>; split_postal_contract?: Record<string, unknown>; usps_operational_evidence?: { status: string; reason: string | null }; unresolved_proof_gap_codes?: string[]; status?: string; usps_operational_status?: string };
  denominator_semantics: string; limitations: string[];
};
type StateAccess = {
  accessEvidenceStatus: string;
  temporalStatus: { status: string; positiveEvidenceItems: number; statusCounts: Record<string, number>; activeBusinessVerified: false; generalBusinessOperatingStatusAsserted: false };
  exactBindings: Array<{ evidenceType: string; sourceId: string | null; recordCount: number | null; temporalEvidence: { binding: string; status: string; sourceReferenceField: string | null; sourceReferenceValue: string | number | null; reviewDueDate: string | null; evidenceScope: string } }>;
  annualAggregateContext?: { referenceYear: number; naics: string; nonemployerEstablishments: number; nationalSameIndustryNonemployerEstablishments: number; percentOfNationalSameIndustry: number; zipOrZctaInferencePermitted: false; collectionCompletenessPercent: null };
  retainedDirectoryEvidence: Array<{ sourceId: string; directoryRows: number; sourceReleased: string; namedBusinessCount: null; physicalSiteCount: null; currentOperatingCount: null; nationalCompletenessPercent: null; currentUspsAssignmentVerified: false; zctaMembershipInferred: false }>;
  limitations: string[];
};

const MATRIX_CATEGORY: Record<string, string> = { all: 'general-business', 'retail-consumer': 'retail-consumer', 'health-care': 'health-care', 'financial-services': 'financial-services', 'tax-exempt-organizations': 'tax-exempt-organizations', 'food-production': 'regulated-meat-poultry-egg-establishments', 'environmental-facilities': 'cross-industry-regulated-facilities', transportation: 'transportation' };
function matrixCategory(categoryId: string) { return MATRIX_CATEGORY[categoryId] ?? null; }
const STATE_ACCESS_INDUSTRIES=new Set(['retail-consumer','health-care','financial-services','transportation','tax-exempt-organizations','childcare']);
function stateAccessIndustry(categoryId:string){return STATE_ACCESS_INDUSTRIES.has(categoryId)?categoryId:undefined;}

function GoalCompletionSummary({ state, categoryId }: { state?: string; categoryId: string }) {
  const [view, setView] = useState<GoalCompletion | null>(null);
  const [error, setError] = useState(false);
  const matrixCategoryId = matrixCategory(categoryId);
  useEffect(() => {
    if (!matrixCategoryId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ category: matrixCategoryId }); if (state) query.set('state', state);
    void runnerJson<GoalCompletion>(`/api/business-map/goal-completion?${query}`, { signal: controller.signal }).then((value) => { setView(value); setError(false); }).catch((reason) => { if (reason?.name !== 'AbortError') { setView(null); setError(true); } });
    return () => controller.abort();
  }, [state, matrixCategoryId]);
  if (!matrixCategoryId) return <section className="state-alignment-card"><div><span>National goal matrix</span><strong>Category outside denominator</strong></div><p className="entity-method-note">This selected category is not represented by the current eight-dataset national reporting denominator. No substitute percentage is shown; all-business completion remains unknown.</p></section>;
  if (error) return <section className="state-alignment-card"><div><span>National goal matrix</span><strong>Evidence unavailable</strong></div><p className="entity-method-note">The newest immutable matrix could not be verified. No older release was substituted.</p></section>;
  if (!view) return <section className="state-alignment-card"><div><span>National goal matrix</span><strong>Verifying local evidence…</strong></div></section>;
  if (!view.available) return <section className="state-alignment-card"><div><span>National goal matrix</span><strong>Not available</strong></div><p className="entity-method-note">{view.status.replaceAll('-', ' ')}. All-business completion remains unknown.</p></section>;
  const selected = view.selected?.category;
  return <section className="state-alignment-card goal-completion-card" aria-label="National business goal completion">
    <div><span>National goal matrix</span><strong>{view.selected ? `${view.selected.code} · ${selected?.category_id.replaceAll('-', ' ')}` : view.category?.replaceAll('-', ' ')}</strong></div>
    <dl><div><dt>Governed datasets available</dt><dd>{selected ? `${selected.dataset_availability.available} / ${selected.dataset_availability.measured} measured` : 'Select a state'}</dd></div><div><dt>Unmeasured datasets</dt><dd>{selected ? `${selected.dataset_availability.unmeasured} / ${selected.dataset_availability.denominator}` : 'Select a state'}</dd></div><div><dt>Dataset availability</dt><dd>{selected ? selected.dataset_availability.measurement_status==='unmeasured'?'Unmeasured':percent(selected.dataset_availability.percent) : '—'}</dd></div><div><dt>Broad state-layer gaps</dt><dd>{count(view.broad_layer_gaps)}</dd></div><div><dt>All-business completion</dt><dd>Unknown</dd></div></dl>
    {selected && <div className="goal-source-list">{selected.datasets.map((dataset) => <div key={dataset.dataset_id}><strong>{dataset.label}</strong><span>{dataset.availability_status.replaceAll('-', ' ')} · {dataset.state_record_count === null ? 'state count unmeasured' : `${count(dataset.state_record_count)} state records`}</span><small>Freshness: {dataset.temporal_status.status.replaceAll('-', ' ')} · authorization: {dataset.authorization.state.replaceAll('-', ' ')} · source geocoded: {percent(dataset.geocode_rate.percent)}{dataset.geocode_rate.scope ? ` (${dataset.geocode_rate.scope})` : ''}</small>{dataset.gap_reason && <small>Gap: {dataset.gap_reason}</small>}</div>)}</div>}
    <details><summary>All 50 states and D.C. for this category</summary><div className="representation-table"><table><thead><tr><th>State</th><th>Available / measured</th><th>Unmeasured</th><th>Share of measured</th><th>Temporal status counts</th><th>Authorization state counts</th><th>Broad layer</th></tr></thead><tbody>{view.jurisdictions.map((row) => <tr key={row.code}><th>{row.code}</th><td>{row.available}/{row.measured}</td><td>{row.unmeasured}/{row.denominator}</td><td>{row.measurement_status==='unmeasured'?'Unmeasured':percent(row.percent)}</td><td>{statusBreakdown(row.temporal_status_counts)}</td><td>{statusBreakdown(row.authorization_state_counts)}</td><td>{row.broad_layer_gap ? 'Gap' : 'Available'}</td></tr>)}</tbody></table></div><p className="entity-method-note">Temporal and authorization columns count source-dataset status values in the selected category; they are separate from dataset availability and do not indicate business completeness.</p></details>
    <p className="entity-method-note">Denominator: {view.denominator?.version}. Availability share is available governed datasets among measured members; unmeasured members are shown separately, and an all-unmeasured category has no percentage. Observed-zero datasets are measured evidence and contribute zero available. These percentages are not the share of U.S. businesses collected. All-business completion has no authoritative denominator and remains null. Release {view.release_id}.</p>
  </section>;
}

function reconcileFeature(current: MapFeature | null, response: MapResponse) {
  if (!current) return null;
  const responseLevel = response.level === 'states' ? 'state' : response.level === 'counties' ? 'county' : 'zip';
  if (current.properties.level !== responseLevel) return current;
  return response.features.find((feature) => feature.properties.geoid === current.properties.geoid) ?? null;
}

async function request<T>(path: string): Promise<T> {
  return runnerJson<T>(path);
}

function count(value?: number | null) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function statusBreakdown(values: Record<string, number>) {
  const entries = Object.entries(values);
  return entries.length ? entries.map(([status, value]) => `${status.replaceAll('-', ' ')}: ${count(value)}`).join(' · ') : 'No status recorded';
}

function percent(value?: number | null) {
  return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}%`;
}

function currency(value?: number | null) {
  return value === null || value === undefined ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function currencyFromThousands(value?: number | null) {
  return value === null || value === undefined ? 'Unavailable' : currency(value * 1000);
}

function gdpLabel(properties: MapProperties) {
  return properties.gdp_reference_year ? `GDP — ${properties.gdp_reference_year} current dollars` : 'GDP — current dollars';
}

function gdpNote(properties: MapProperties) {
  if (properties.gdp_current_dollars !== null) return 'BEA estimate · direct geography match';
  if (properties.gdp_status === 'unavailable-no-official-zip-gdp-do-not-allocate') return 'No official ZIP GDP; not allocated';
  if (properties.gdp_status.includes('no-direct-bea')) return 'No direct BEA geography match';
  if (properties.gdp_status === 'unavailable-bea-value-not-published') return 'BEA value not published';
  return 'No governed BEA GDP release';
}

function nonemployerLabel(properties: MapProperties) {
  return properties.nonemployer_reference_year ? `Census nonemployer units — ${properties.nonemployer_reference_year}` : 'Census nonemployer units';
}

function nonemployerNote(properties: MapProperties) {
  if (typeof properties.nonemployer_establishments === 'number') return `Annual aggregate · businesses with no paid employees · source ${shortRelease(properties.nonemployer_source_release_id || undefined)}`;
  if (properties.nonemployer_status === 'unavailable-not-published-at-zip-do-not-allocate') return 'Not published at ZIP level; not allocated';
  if (properties.nonemployer_status?.includes('not-published')) return 'Census value not published for this geography';
  return 'No governed Census Nonemployer value';
}

function alignmentLabel(properties: MapProperties) {
  if (properties.level === 'state') return 'Peer evidence alignment vs states';
  if (properties.level === 'county') return 'Peer evidence alignment vs in-state counties';
  return 'Peer evidence alignment vs in-state ZIP peers';
}

function populationLabel(properties: MapProperties) {
  return properties.level === 'zip' ? '2020 Census ZCTA population' : '2020 uniquely assigned ZCTA population';
}

function housingLabel(properties: MapProperties) {
  return properties.level === 'zip' ? '2020 Census ZCTA housing units' : '2020 uniquely assigned ZCTA housing units';
}

function demographicNote(properties: MapProperties, kind: 'population' | 'housing') {
  const value = kind === 'population' ? properties.population_2020 : properties.housing_units_2020;
  const status = kind === 'population' ? properties.population_status : properties.housing_status;
  if (typeof value === 'number') return properties.level === 'zip' ? 'Direct Census ZCTA value' : 'Complete sum of uniquely assigned ZCTAs; not an official jurisdiction total';
  if (status === 'unavailable-no-uniquely-assigned-zcta') return 'No uniquely assigned ZCTA; unavailable, not zero';
  if (status?.includes('incomplete')) return 'Incomplete ZCTA inputs; partial sum withheld';
  return 'Census ZCTA value unavailable, not zero';
}

function employerNote(properties: MapProperties) {
  if (typeof properties.employer_establishments === 'number') return properties.level === 'zip' ? 'Direct ZIP Business Patterns value' : 'Complete sum of published uniquely assigned ZCTAs';
  if (properties.employer_baseline_status === 'unavailable-no-uniquely-assigned-zcta') return 'No uniquely assigned ZCTA; unavailable, not zero';
  if (properties.employer_baseline_status?.includes('incomplete')) return 'Incomplete ZIP Business Patterns inputs; partial sum withheld';
  return 'ZIP Business Patterns value not published; unavailable, not zero';
}

function shortRelease(value?: string) {
  if (!value) return 'unavailable';
  const tail = value.split('-').at(-1);
  return tail ? `…${tail}` : value;
}

function visitCoordinates(coordinates: unknown, visitor: (longitude: number, latitude: number) => void) {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    visitor(coordinates[0], coordinates[1]);
    return;
  }
  for (const child of coordinates) visitCoordinates(child, visitor);
}

function boundsFor(features: MapFeature[]) {
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const feature of features) visitCoordinates(feature.geometry.coordinates, (longitude, latitude) => {
    west = Math.min(west, longitude); south = Math.min(south, latitude); east = Math.max(east, longitude); north = Math.max(north, latitude);
  });
  return Number.isFinite(west) ? [west, south, east, north] : [-125, 24, -66, 50];
}

function projector(level: string, features: MapFeature[]) {
  if (level === 'states') {
    return (longitude: number, latitude: number) => {
      if (latitude > 50 && longitude < -130) return [35 + (longitude + 180) * 3.2, 385 + (72 - latitude) * 7.5];
      if (latitude < 24 && longitude < -150) return [215 + (longitude + 161) * 8.5, 470 + (23 - latitude) * 11];
      return [100 + (longitude + 125) * 13.2, 20 + (50 - latitude) * 19.2];
    };
  }
  const [west, south, east, north] = boundsFor(features);
  const width = Math.max(0.0001, east - west);
  const height = Math.max(0.0001, north - south);
  const scale = Math.min(840 / width, 500 / height);
  const xOffset = (900 - width * scale) / 2;
  const yOffset = (540 - height * scale) / 2;
  return (longitude: number, latitude: number) => [xOffset + (longitude - west) * scale, yOffset + (north - latitude) * scale];
}

function ringPath(ring: unknown[], project: (longitude: number, latitude: number) => number[]) {
  return ring.map((point, index) => {
    const [x, y] = project(Number((point as number[])[0]), Number((point as number[])[1]));
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

function geometryPath(feature: MapFeature, project: (longitude: number, latitude: number) => number[]) {
  const coordinates = feature.geometry.coordinates as unknown[];
  if (feature.geometry.type === 'Polygon') return coordinates.map((ring) => ringPath(ring as unknown[], project)).join(' ');
  if (feature.geometry.type === 'MultiPolygon') return coordinates.flatMap((polygon) => (polygon as unknown[]).map((ring) => ringPath(ring as unknown[], project))).join(' ');
  return '';
}

function heatColor(value: number | null, maximum: number, selected: boolean) {
  if (selected) return '#72f3cd';
  if (value === null || value <= 0 || maximum <= 0) return '#202f3a';
  const intensity = Math.min(1, Math.log1p(value) / Math.log1p(maximum));
  const hue = 196 - intensity * 162;
  const lightness = 29 + intensity * 28;
  return `hsl(${hue} 78% ${lightness}%)`;
}

function FeatureMap({ data, selectedGeoid, categoryLabel, enhancerLabel, onSelect }: {
  data: MapResponse;
  selectedGeoid: string;
  categoryLabel: string;
  enhancerLabel: string;
  onSelect: (feature: MapFeature) => void;
}) {
  const [zoom, setZoom] = useState(selectedGeoid ? 1.8 : 1);
  const [hoveredGeoid, setHoveredGeoid] = useState<string | null>(null);
  const hovered = data.features.find(feature => feature.properties.geoid === hoveredGeoid)?.properties;
  const enhancerId = data.enhancer_id;
  const paths = useMemo(() => {
    const project = projector(data.level, data.features);
    return data.features.map((feature) => ({ feature, d: geometryPath(feature, project) }));
  }, [data]);
  const maximum = Number(data.meta.heat_max ?? 0);

  function wheel(event: WheelEvent<SVGSVGElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom((current) => Math.max(1, Math.min(7, current * (event.deltaY < 0 ? 1.18 : 0.85))));
  }

  return (
    <div className="heatmap-canvas">
      <div className="map-zoom-controls" aria-label="Map zoom controls">
        <button onClick={() => setZoom((value) => Math.min(7, value * 1.25))} aria-label="Zoom in">＋</button>
        <button onClick={() => setZoom((value) => Math.max(1, value / 1.25))} aria-label="Zoom out">−</button>
        <button onClick={() => setZoom(1)}>Reset</button>
        <span>{zoom.toFixed(1)}× · Ctrl+scroll</span>
      </div>
      <svg viewBox="0 0 900 540" role="img" aria-label={`${data.level} business heat map`} onWheel={wheel}>
        <g style={{ transform: `scale(${zoom})`, transformOrigin: '450px 270px', transition: 'transform 120ms ease-out' }}>
          {paths.map(({ feature, d }) => (
            <path
              key={feature.properties.geoid}
              d={d}
              fill={heatColor(feature.properties.heat_value, maximum, selectedGeoid === feature.properties.geoid)}
              className="heatmap-shape"
              tabIndex={0}
              role="button"
              aria-pressed={selectedGeoid === feature.properties.geoid}
              aria-label={enhancerId === 'retained_childcare_county_points'
                ? `${feature.properties.name}; ${count(feature.properties.heat_value)} assigned retained childcare source points; ${feature.properties.retained_childcare_county_status?.replaceAll('-', ' ')}; not verified business locations`
                : `${feature.properties.name}; ${count(feature.properties.observed_business_units)} observed provisional business units; ${count(feature.properties.business_count)} selected-category evidence records; ${alignmentLabel(feature.properties)} ${percent(feature.properties.relative_coverage_alignment_percent)}`}
              onClick={() => onSelect(feature)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(feature); } }}
              onMouseEnter={() => setHoveredGeoid(feature.properties.geoid)}
              onMouseLeave={() => setHoveredGeoid(null)}
              onFocus={() => setHoveredGeoid(feature.properties.geoid)}
              onBlur={() => setHoveredGeoid(null)}
            />
          ))}
        </g>
      </svg>
      <div className="heatmap-legend"><span>Lower</span><i /><i /><i /><i /><i /><span>Higher</span></div>
      {enhancerId === 'retained_childcare_county_points' && <p className="entity-method-note">PA and MD source-point relationships; other states and ZIP-level values are unavailable. Not verified business locations or industry completeness.</p>}
      {hovered && <div className="map-tooltip">
        <strong>{hovered.postal_abbreviation || hovered.name}</strong>
        <span>{hovered.name} · {categoryLabel}</span>
        {enhancerId === 'retained_childcare_county_points' ? <>
          <b>{count(hovered.heat_value)} <small>assigned retained childcare source points</small></b>
          <small>{hovered.retained_childcare_county_status?.replaceAll('-', ' ')}. Business-location accuracy and completeness are unverified.</small>
          <dl><div><dt>{populationLabel(hovered)}</dt><dd>{count(hovered.population_2020)}</dd></div><div><dt>{gdpLabel(hovered)}</dt><dd>{currency(hovered.gdp_current_dollars)}</dd></div></dl>
        </> : <><b>{count(hovered.observed_business_units)} <small>observed provisional business units</small></b>
        <dl><div><dt>Selected-category evidence</dt><dd>{count(hovered.business_count)}</dd></div><div><dt>Observed physical sites</dt><dd>{count(hovered.observed_physical_sites)}</dd></div><div><dt>Census employer units</dt><dd>{count(hovered.employer_establishments)}<small>{employerNote(hovered)}</small></dd></div><div><dt>{nonemployerLabel(hovered)}</dt><dd>{count(hovered.nonemployer_establishments)}<small>{nonemployerNote(hovered)}</small></dd></div><div><dt>{populationLabel(hovered)}</dt><dd>{count(hovered.population_2020)}<small>{demographicNote(hovered, 'population')}</small></dd></div><div><dt>{housingLabel(hovered)}</dt><dd>{count(hovered.housing_units_2020)}<small>{demographicNote(hovered, 'housing')}</small></dd></div><div><dt>{gdpLabel(hovered)}</dt><dd>{currency(hovered.gdp_current_dollars)}<small>{gdpNote(hovered)}</small></dd></div><div><dt>{alignmentLabel(hovered)}</dt><dd>{percent(hovered.relative_coverage_alignment_percent)}<small>100% = peer median</small></dd></div></dl>
        </>}
        <small>Heat: {enhancerLabel} · {enhancerId === 'gdp_current_dollars' ? currency(hovered.heat_value) : count(hovered.heat_value)}</small>
      </div>}
    </div>
  );
}

function BusinessNames({ selectedZip, stateFips, stateName, categoryId, canDrill }: { selectedZip: string; stateFips: string; stateName: string; categoryId: string; canDrill: boolean }) {
  const [scope, setScope] = useState<'zip' | 'missing'>('zip');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<NameResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const missingZip = scope === 'missing';
  const canQuery = canDrill && Boolean(missingZip ? stateFips : selectedZip);

  useEffect(() => {
    let active = true;
    if (!canQuery) return;
    const timer = window.setTimeout(() => {
      setData(null);
      setError('');
      setLoading(true);
      const parameters = new URLSearchParams({ ...(missingZip ? { state: stateFips } : { zip: selectedZip }), category: categoryId, query, limit: '25' });
      void request<NameResponse>(`/api/business-map/${missingZip ? 'state-names' : 'names'}?${parameters}`).then(result => { if (active) setData(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load names.'); }).finally(() => { if (active) setLoading(false); });
    }, query ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [canQuery, categoryId, query, selectedZip, stateFips, missingZip]);

  function changeScope(value: 'zip' | 'missing') { setScope(value); setData(null); setError(''); setLoading(false); setQuery(''); }
  function changeQuery(value: string) { setQuery(value); setData(null); setError(''); setLoading(true); }

  return (
    <section className="business-name-drill">
      <div className="name-drill-heading"><div><span>Business-name drill-down by reported ZIP5</span><strong>{missingZip ? `${stateName || stateFips} · reported ZIP5 unavailable` : selectedZip ? `Reported ZIP5 ${selectedZip} · matches selected ZCTA identifier, not boundary membership` : 'Select a Census ZCTA polygon'}</strong></div>{canQuery && <input aria-label="Filter business names" value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Filter names" />}</div>
      {stateFips && canDrill && <label className="business-name-scope">Address scope <select aria-label="Business name address scope" value={scope} onChange={event => changeScope(event.target.value === 'missing' ? 'missing' : 'zip')}><option value="zip">Reported ZIP5 matching ZCTA identifier</option><option value="missing">Reported ZIP5 unavailable in this state</option></select></label>}
      {!selectedZip && !missingZip && <p>Click a state, then county, then a five-digit Census ZCTA polygon to inspect names indexed by the matching source-reported ZIP5, or choose records with reported ZIP5 unavailable. ZCTA is not a USPS ZIP boundary.</p>}
      {!canDrill && <p>This category contains organization-address assertions, not physical-location profiles, so names are not exposed by this map index.</p>}
      {missingZip && <p>Source records without a usable ZIP, across the selected state—not just the selected county. ZIPs are not inferred from coordinates.</p>}
      {loading && <p role="status">{missingZip ? 'Loading records without a source ZIP…' : 'Scanning the matching ZIP partition…'}</p>}
      {error && <p className="map-error" role="alert">{error}</p>}
      {data?.local_review_only && <small className="local-review-label">Local review only — record-level redistribution policies still apply.</small>}
      {data?.limitation && <small className="name-drill-limitation">{data.limitation}</small>}
      {data && !loading && !data.available && <p>No compatible published evidence is available for this address scope.</p>}
      {data?.available && !loading && canDrill && <div className="business-name-list">
        {!data.records.length && <p>No matching physical-location names in this category.</p>}
        {data.records.map((record, index) => <article key={`${record.business_name}-${index}`}><div><strong>{record.business_name}</strong><span>{record.address.street || 'Street not reported'}{record.address.street2 ? ` · ${record.address.street2}` : ''} · {record.address.city}, {record.address.state} {record.address.zip_code ?? 'ZIP unavailable'}{record.address.zip4 ? <small> +4 {record.address.zip4}</small> : null}</span>{record.geocode && <small className="business-geocode">{record.geocode.latitude.toFixed(6)}; {record.geocode.longitude.toFixed(6)}</small>}</div><em>{record.category_id.replaceAll('-', ' ')}</em></article>)}
        {data.total > data.records.length && <small>Showing {data.records.length} of {count(data.total)} distinct names.</small>}
      </div>}
    </section>
  );
}

function EntitySummary({ feature, category, stateSummary, stateFips, selectedZip, geographyHash, mapRevision }: {
  feature: MapFeature | null;
  category: Category | undefined;
  stateSummary: StateSummary | null;
  stateFips: string;
  selectedZip: string;
  geographyHash?: string;
  mapRevision?: MapResponse|null;
}) {
  const properties = feature?.properties;
  const selectedStateFips = properties?.level === 'state' ? properties.geoid : properties?.state_fips || stateFips;
  const state = stateSummary?.states.find((item) => item.state_fips === selectedStateFips);
  const categoryId = category?.id ?? 'all';
  const nationalAll = stateSummary?.states.reduce((sum, item) => sum + item.all_category_evidence_count, 0) ?? 0;
  const stateEvidence = state ? (categoryId === 'all' ? state.all_category_evidence_count : state.category_counts[categoryId]) : null;
  const withinState = state ? (categoryId === 'all' ? (state.all_category_evidence_count > 0 ? 100 : null) : state.percent_of_state[categoryId]) : null;
  const acrossNation = state ? (categoryId === 'all' ? (nationalAll > 0 ? (state.all_category_evidence_count / nationalAll) * 100 : null) : state.percent_of_category_nationwide[categoryId]) : null;
  const nationalCategoryCount = categoryId === 'all' ? stateSummary?.national_all_category_evidence_count : stateSummary?.national_category_counts[categoryId];
  const nationalCategoryShare = categoryId === 'all' ? (stateSummary && stateSummary.national_all_category_evidence_count > 0 ? 100 : null) : stateSummary?.national_category_percent_of_collected_evidence?.[categoryId];

  return (
    <aside className="map-entity-summary" aria-live="polite">
      <OvertureHeatmapReadiness />
      <StateAccessSummary key={`${state?.postal_abbreviation??''}:${categoryId}`} state={state?.postal_abbreviation} industry={stateAccessIndustry(categoryId)} />
      <GoalCompletionSummary state={state?.postal_abbreviation} categoryId={categoryId} />
      {categoryId === 'tax-exempt-organizations' && <p className="entity-method-note">IRS EO BMF current-extract filing-address records only. A filing address may be a headquarters, mailing address, or P.O. box; it is not a verified physical site or proof of current operations. This local-review view has no all-business completeness denominator.</p>}
      <DatasetRepresentation stateFips={selectedStateFips} />
      {(categoryId === 'all' || categoryId === 'childcare') && <RetainedCountyPanel level={properties?.level} geoid={properties?.geoid} geographyHash={geographyHash} mapRevision={mapRevision} />}
      {(categoryId === 'all' || categoryId === 'childcare') && <RetainedChildcarePanel publisherState={state?.postal_abbreviation} selectedZip={selectedZip} countySelected={properties?.level === 'county' || properties?.level === 'zip'} scopeUnavailable={!!selectedStateFips && !state} />}
      {stateSummary?.available && <section className="state-alignment-card">
        <div><span>National category share</span><strong>{category?.label ?? 'All source categories'}</strong></div>
        <dl><div><dt>State-assigned category evidence</dt><dd>{count(nationalCategoryCount)}</dd></div><div><dt>State-assigned all-category evidence</dt><dd>{count(stateSummary.national_all_category_evidence_count)}</dd></div><div><dt>Share of state-assigned national evidence</dt><dd>{percent(nationalCategoryShare)}</dd></div></dl>
        <p className="entity-method-note">{stateSummary.national_percentage_basis?.geography_scope ?? '50 states and District of Columbia'}. Category count ÷ all-category count. {stateSummary.assignment.semantics} Excludes {count(Number(stateSummary.assignment.excluded_ambiguous_business_evidence))} ambiguous and {count(Number(stateSummary.assignment.excluded_unmatched_business_evidence))} unmatched evidence records. Categories group source evidence and may overlap. The percentage of all U.S. businesses collected is unknown.</p>
      </section>}
      <div className="entity-summary-heading"><span>Business summary by map entity</span><strong>{properties?.name ?? 'Select a map entity'}</strong><small>{properties ? `${properties.level==='zip'?'CENSUS ZCTA POLYGON':properties.level.toUpperCase()} · ${category?.label ?? 'All source categories'}` : 'State, county, or Census ZCTA polygon details appear here after selection.'}</small></div>
      {properties ? <>
        <div className="entity-stat-grid">
          <div><span>Observed business units</span><strong>{count(properties.observed_business_units)}</strong><small>Provisional establishments</small></div>
          <div><span>Observed physical sites</span><strong>{count(properties.observed_physical_sites)}</strong><small>Address-associated locations</small></div>
          <div><span>Selected-category evidence</span><strong>{count(properties.business_count)}</strong><small>Source-preserving; not deduplicated</small></div>
          <div><span>Census employer units</span><strong>{count(properties.employer_establishments)}</strong><small>{employerNote(properties)}</small></div>
          <div><span>{nonemployerLabel(properties)}</span><strong>{count(properties.nonemployer_establishments)}</strong><small>{nonemployerNote(properties)}</small></div>
          <div><span>Nonemployer receipts</span><strong>{currencyFromThousands(properties.nonemployer_receipts_thousands_usd)}</strong><small>Annual Census aggregate; not named-business revenue</small></div>
          <div><span>{populationLabel(properties)}</span><strong>{count(properties.population_2020)}</strong><small>{demographicNote(properties, 'population')}</small></div>
          <div><span>{housingLabel(properties)}</span><strong>{count(properties.housing_units_2020)}</strong><small>{demographicNote(properties, 'housing')}</small></div>
          <div><span>{alignmentLabel(properties)}</span><strong>{percent(properties.relative_coverage_alignment_percent)}</strong><small>100% equals the governed peer median</small></div>
          <div><span>{gdpLabel(properties)}</span><strong>{currency(properties.gdp_current_dollars)}</strong><small>{gdpNote(properties)}</small></div>
        </div>
        <div className="entity-ratios"><span><b>{count(properties.businesses_per_1000_people)}</b> evidence / 1K people</span><span><b>{count(properties.population_density)}</b> people / sq. mile</span></div>
        <p className="entity-method-note">Peer evidence alignment compares selected-category evidence per Census employer establishment with the median for {properties.relative_coverage_alignment_peer_scope}. Values can exceed 100%; it is not measured completeness of all businesses.</p>
      </> : <div className="entity-summary-empty">Select a map entity to pin its business evidence, employer and nonemployer Census baselines, GDP, and state-relative coverage summary here. Hover details remain on the map.</div>}
      {state && <section className="state-alignment-card">
        <div><span>State alignment</span><strong>{state.postal_abbreviation} · {state.state_name}</strong></div>
        <dl><div><dt>Category evidence</dt><dd>{count(stateEvidence)}</dd></div><div><dt>Within state</dt><dd>{percent(withinState)}</dd></div><div><dt>Across displayed states</dt><dd>{percent(acrossNation)}</dd></div><div><dt>Assigned ZCTAs</dt><dd>{count(state.uniquely_assigned_zcta_count)}</dd></div></dl>
      </section>}
      <BusinessNames key={`${selectedStateFips}:${selectedZip}:${categoryId}`} selectedZip={selectedZip} stateFips={selectedStateFips} stateName={state?.state_name ?? ''} categoryId={categoryId} canDrill={category?.business_name_drilldown ?? true} />
    </aside>
  );
}

export default function BusinessIntelligence() {
  const [mode,setMode]=useState('business');
  return <div><label className="heatmap-mode-selector">Heatmap record type <select aria-label="Heatmap record type" value={mode} onChange={event=>setMode(event.target.value)}><option value="business">Business evidence</option><option value="census-industry">Census employer industry · annual aggregate</option><option value="census-nonemployer-county">Census nonemployer county industry · annual aggregate</option><option value="credentials">MN credential rows · local review</option><option value="pharmacy">CMS NPPES community / retail pharmacy · reported evidence</option></select></label>{mode==='credentials'?<CredentialHeatmap/>:mode==='census-industry'?<CensusZbpIndustryHeatmap/>:mode==='census-nonemployer-county'?<CensusNonemployerCountyHeatmap/>:mode==='pharmacy'?<NppesPharmacyHeatmap/>:<BusinessEvidenceMap/>}</div>;
}

function StateAccessSummary({state,industry}:{state?:string;industry?:string}){
  const [view,setView]=useState<StateAccess|null>(null),[error,setError]=useState(false);
  useEffect(()=>{if(!state||!industry||industry==='all')return;const controller=new AbortController(),query=new URLSearchParams({state,industry});void runnerJson<StateAccess>(`/api/business-map/state-access?${query}`,{signal:controller.signal}).then(value=>setView(value)).catch(reason=>{if(reason?.name!=='AbortError')setError(true);});return()=>controller.abort();},[state,industry]);
  if(!state||!industry)return <section className="state-alignment-card"><div><span>Governed state-industry evidence</span><strong>{state?'Category outside schema-4 industry buckets':'Select a state and governed industry'}</strong></div><p className="entity-method-note">No unlike record units are combined into a synthetic completeness measure.</p></section>;
  if(error)return <section className="state-alignment-card"><div><span>Governed state-industry evidence</span><strong>Unavailable</strong></div><p className="entity-method-note">The exact enrolled schema-4 report could not be verified; no fallback was substituted.</p></section>;
  if(!view)return <section className="state-alignment-card"><div><span>Governed state-industry evidence</span><strong>Verifying exact report…</strong></div></section>;
  return <section className="state-alignment-card state-access-card" aria-label="Governed state industry access evidence"><div><span>Governed state-industry evidence</span><strong>{state} · {industry.replaceAll('-',' ')}</strong></div>
    <dl><div><dt>Access evidence</dt><dd>{view.accessEvidenceStatus.replaceAll('-',' ')}</dd></div><div><dt>Worst temporal status</dt><dd>{view.temporalStatus.status.replaceAll('-',' ')}</dd></div><div><dt>Exact temporal bindings</dt><dd>{view.exactBindings.length} / {view.temporalStatus.positiveEvidenceItems}</dd></div><div><dt>All-business completion</dt><dd>Unknown</dd></div></dl>
    <details><summary>Temporal source bindings</summary>{view.exactBindings.map((item,index)=><p key={`${item.sourceId}:${index}`}><strong>{item.sourceId??item.evidenceType}</strong> — {item.temporalEvidence.status.replaceAll('-',' ')}; {item.temporalEvidence.sourceReferenceField??'publisher reference'}: {String(item.temporalEvidence.sourceReferenceValue??'missing')}; review due {item.temporalEvidence.reviewDueDate??'unmeasured'}. <small>{item.temporalEvidence.evidenceScope.replaceAll('-',' ')}</small></p>)}</details>
    {view.annualAggregateContext&&<div className="entity-method-note"><strong>Annual aggregate context — {view.annualAggregateContext.referenceYear} NAICS {view.annualAggregateContext.naics}</strong><br/>{count(view.annualAggregateContext.nonemployerEstablishments)} state nonemployer establishments · {percent(view.annualAggregateContext.percentOfNationalSameIndustry)} of {count(view.annualAggregateContext.nationalSameIndustryNonemployerEstablishments)} nationwide in the same industry. Context only: not named businesses, current operations, collection completeness, ZIP5, or ZCTA allocation.</div>}
    {view.retainedDirectoryEvidence.map(item=><div className="entity-method-note" key={item.sourceId}><strong>{item.sourceId.replaceAll('-',' ')}</strong><br/>{count(item.directoryRows)} publisher directory rows · source released {item.sourceReleased}. Not named-business, physical-site, current-operation, completeness, current USPS ZIP, or Census ZCTA evidence.</div>)}
  </section>;
}

function BusinessEvidenceMap() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [zipQuality, setZipQuality] = useState<ZipQualitySummary | null>(null);
  const [inspectionZip, setInspectionZip] = useState('');
  const [zipInspection, setZipInspection] = useState<ZipInspection | null>(null);
  const [zipInspectionError, setZipInspectionError] = useState('');
  const [zipInspectionLoading, setZipInspectionLoading] = useState(false);
  const [savedData, setData] = useState<MapResponse | null>(null);
  const [dataSelection, setDataSelection] = useState('');
  const [stateSummary, setStateSummary] = useState<StateSummary | null>(null);
  const [stateFeature, setStateFeature] = useState<MapFeature | null>(null);
  const [countyFeature, setCountyFeature] = useState<MapFeature | null>(null);
  const [zipFeature, setZipFeature] = useState<MapFeature | null>(null);
  const [level, setLevel] = useState<'states' | 'counties' | 'zips'>('states');
  const [categoryId, setCategoryId] = useState('all');
  const [enhancerId, setEnhancerId] = useState('business_count');
  const [minPopulation, setMinPopulation] = useState('');
  const [minHousingUnits, setMinHousingUnits] = useState('');
  const [stateFips, setStateFips] = useState('');
  const [stateName, setStateName] = useState('');
  const [countyGeoid, setCountyGeoid] = useState('');
  const [countyName, setCountyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selectionKey = JSON.stringify([categoryId, enhancerId, level, stateFips, countyGeoid, minPopulation, minHousingUnits]);
  const data = dataSelection === selectionKey ? savedData : null;

  function selectInspectionZip(zip: string) {
    setInspectionZip(zip);
    setZipInspection(null);
    setZipInspectionError('');
    setZipInspectionLoading(/^\d{5}$/.test(zip));
  }

  useEffect(() => {
    void request<Catalog>('/api/business-map/catalog').then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load map catalog.'));
    void request<StateSummary>('/api/business-map/state-summary?include_territories=false').then(setStateSummary).catch(() => setStateSummary(null));
    void request<ZipQualitySummary>('/api/business-map/zip-quality').then(setZipQuality).catch(() => setZipQuality(null));
  }, []);

  useEffect(() => {
    if (!/^\d{5}$/.test(inspectionZip)) return;
    const controller = new AbortController();
    void runnerJson<ZipInspection>(`/api/business-map/zip-inspector?zip=${encodeURIComponent(inspectionZip)}&category=${encodeURIComponent(categoryId)}`, { signal: controller.signal })
      .then((detail) => { if (!controller.signal.aborted && detail.zip5 === inspectionZip && detail.category_evidence?.category_id === categoryId) setZipInspection(detail); })
      .catch((reason) => { if (!controller.signal.aborted && reason?.name !== 'AbortError') setZipInspectionError(reason instanceof Error ? reason.message : 'Exact ZIP evidence is unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setZipInspectionLoading(false); });
    return () => controller.abort();
  }, [categoryId, inspectionZip]);

  useEffect(() => {
    if (!catalog?.available) return;
    const parameters = new URLSearchParams({ level, category: categoryId, enhancer: enhancerId });
    if (stateFips) parameters.set('state_fips', stateFips);
    if (countyGeoid) parameters.set('county_geoid', countyGeoid);
    if (minPopulation) parameters.set('min_population', minPopulation);
    if (minHousingUnits) parameters.set('min_housing_units', minHousingUnits);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void request<MapResponse>(`/api/business-map/features?${parameters}`).then((result) => {
        if (cancelled) return;
        setData(result);
        setDataSelection(selectionKey);
        setStateFeature((current) => reconcileFeature(current, result));
        setCountyFeature((current) => reconcileFeature(current, result));
        setZipFeature((current) => reconcileFeature(current, result));
      }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load map.'); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [catalog, categoryId, countyGeoid, enhancerId, level, minHousingUnits, minPopulation, stateFips, selectionKey]);

  const activeCategory = catalog?.categories?.find(({ id }) => id === categoryId);
  const activeEnhancer = catalog?.enhancers?.find(({ id }) => id === enhancerId);
  const selectedFeature = zipFeature ?? countyFeature ?? stateFeature;
  const selectedZip = zipFeature?.properties.geoid ?? '';

  function choose(feature: MapFeature) {
    if (level === 'states') {
      setStateFeature(feature); setCountyFeature(null); setZipFeature(null); setStateFips(feature.properties.geoid); setStateName(feature.properties.name); setCountyGeoid(''); setCountyName(''); setLevel('counties');
    } else if (level === 'counties') {
      setCountyFeature(feature); setZipFeature(null); setCountyGeoid(feature.properties.geoid); setCountyName(feature.properties.name); setLevel('zips');
    } else { setZipFeature(feature); selectInspectionZip(feature.properties.geoid); }
  }

  function national() {
    setLevel('states'); setStateFeature(null); setCountyFeature(null); setZipFeature(null); setStateFips(''); setStateName(''); setCountyGeoid(''); setCountyName('');
  }

  function state() {
    setLevel('counties'); setCountyFeature(null); setZipFeature(null); setCountyGeoid(''); setCountyName('');
  }

  function county() {
    setLevel('zips'); setZipFeature(null);
  }

  return (
    <section id="business-intelligence" className="panel intelligence-panel">
      <div className="panel-heading intelligence-heading"><div><span className="section-kicker">Heatmap Builder agent</span><h2>Heatmap Builder <em>{shortRelease(catalog?.coverage_release_id)}</em></h2></div><div className="governed-chip"><i /> Governed local view</div></div>
      <div className="heatmap-intro-bar"><span>Business evidence</span><span>Census context</span><span>State alignment</span><small>Hover for a fast comparison · click to drill down</small></div>
      {!catalog && !error && <div className="map-loading">Indexing the current governed coverage release…</div>}
      {error && <div className="map-error">{error}</div>}
      {catalog?.available === false && <div className="map-error">No compatible coverage and geography release is available.</div>}
      {catalog?.available && <div className="heatmap-layout">
        <aside className="map-selectors">
          <label><span>Business category hierarchy</span><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setStateFeature(null); setCountyFeature(null); setZipFeature(null); setZipInspection(null); setZipInspectionError(''); setZipInspectionLoading(/^\d{5}$/.test(inspectionZip)); }}><option value="all">All source categories</option>{catalog.category_groups.map((group) => <optgroup label={group.label} key={group.id}>{group.categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</optgroup>)}</select></label>
          <label><span>Heat-map data / enhancer</span><select value={enhancerId} onChange={(event) => setEnhancerId(event.target.value)}>{catalog.enhancers.map((enhancer) => <option value={enhancer.id} key={enhancer.id}>{enhancer.label}</option>)}</select></label>
          <fieldset className="demographic-filters">
            <legend>Population / demographic filters</legend>
            <label><span>Minimum population</span><input aria-label="Minimum population" type="number" min="0" step="1" inputMode="numeric" value={minPopulation} onChange={(event) => { setMinPopulation(event.target.value); setZipFeature(null); }} placeholder="No minimum" /></label>
            <label><span>Minimum housing units</span><input aria-label="Minimum housing units" type="number" min="0" step="1" inputMode="numeric" value={minHousingUnits} onChange={(event) => { setMinHousingUnits(event.target.value); setZipFeature(null); }} placeholder="No minimum" /></label>
            <button type="button" onClick={() => { setMinPopulation(''); setMinHousingUnits(''); }}>Clear filters</button>
          </fieldset>
          <div className="scope-card"><span>Current scope</span><strong>{selectedZip ? `Census ZCTA ${selectedZip}` : countyName || stateName || 'United States'}</strong><small>{activeCategory?.label}</small></div>
        </aside>
        <div className="map-stage">
          <nav className="map-breadcrumb" aria-label="Map scope"><button onClick={national}>United States</button>{stateFips && <><span>›</span><button onClick={state}>{stateName}</button></>}{countyGeoid && <><span>›</span><button onClick={county}>{countyName}</button></>}{selectedZip && <><span>›</span><strong>Census ZCTA {selectedZip}</strong></>}</nav>
          {loading && <div className="map-loading overlay">Loading {level} polygons and evidence…</div>}
          {data && <FeatureMap key={`${data.level}:${data.category_id}:${data.enhancer_id}:${String(data.meta.state_fips ?? '')}:${String(data.meta.county_geoid ?? '')}:${selectedZip}`} data={data} selectedGeoid={selectedFeature?.properties.geoid ?? ''} categoryLabel={activeCategory?.label ?? 'All source categories'} enhancerLabel={activeEnhancer?.label ?? 'Observed business evidence'} onSelect={choose} />}
          {data && <div className="map-stats"><span><strong>{count(data.meta.feature_count as number)}</strong> map entities</span><span><strong>{count(data.meta.filtered_out_feature_count as number)}</strong> filtered out</span><span><strong>{enhancerId === 'gdp_current_dollars' ? currency(data.meta.heat_max as number | null) : count(data.meta.heat_max as number)}</strong> high value</span><span><strong>{count(data.meta.cross_boundary_zctas as number)}</strong> cross-boundary ZCTAs</span></div>}
          <p className="map-method-note">{catalog.semantics.business_count} {level === 'zips' ? 'Displayed Census ZCTA polygons materially intersect the selected county; source-reported ZIP5 values are address fields, not polygon boundaries, and are not allocated to that county.' : catalog.semantics.jurisdiction_assignment} ZIP+4 remains a separate, non-geometric field.</p>
          {zipQuality && <p className="map-method-note" data-testid="zip-quality-note">
            Registry ZIP5 total: {count(zipQuality.national_zip_coverage.registry_zip5.members.count)} · same-code Census ZCTA members: {count(zipQuality.national_zip_coverage.census_zcta.same_code_governed_zcta_members.count)} · source-contributed ZIP5: {count(zipQuality.national_zip_coverage.registry_zip5.record_level_source_contribution.count)} · denominator-only ZIP5: {count(zipQuality.national_zip_coverage.registry_zip5.denominator_only_no_record_level_contribution.count)}. USPS governed assignment denominator: {zipQuality.national_zip_coverage.usps_assignment.complete_current_assignment_denominator_verified ? 'verified' : 'not verified'}{zipQuality.national_zip_coverage.usps_assignment.assignment_members ? ` (${count(zipQuality.national_zip_coverage.usps_assignment.assignment_members.count)} governed assignments)` : ''}. Active-business completion remains unknown (null); no percentage is claimed. Registry ZIP5 keys and Census ZCTAs are distinct measures; a ZCTA is not a USPS boundary, and ZIP totals do not measure business coverage.
            {' '}ZIP quality classes: {count(zipQuality.classification.classes.valid_format_same_code_governed_zcta.count)} same-code Census ZCTA members · {count(zipQuality.classification.classes.valid_format_source_reported_no_same_code_zcta.count)} source-reported ZIP5 without same-code ZCTA · {count(zipQuality.classification.classes.valid_format_denominator_only_no_same_code_zcta.count)} denominator-only without ZCTA · {count(zipQuality.classification.classes.explicit_placeholder.count)} explicit placeholder (`00000`). USPS operational status is {zipQuality.usps_operational_status === null ? 'not asserted' : 'asserted'}; evidence remains {zipQuality.usps_evidence_status}. Other low-number ZIP5 values are not treated as placeholders without governed proof.
          </p>}
          <section className="state-alignment-card" aria-label="Exact ZIP5 evidence inspector" data-testid="zip-inspector">
            <label><span>Inspect exact ZIP5</span><input aria-label="Inspect exact ZIP5" inputMode="numeric" maxLength={5} value={inspectionZip} onChange={(event) => selectInspectionZip(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Five digits" /></label>
            {inspectionZip.length > 0 && inspectionZip.length !== 5 && <p>Enter exactly five digits.</p>}
            {zipInspectionLoading && <p>Verifying selected ZIP evidence…</p>}
            {zipInspectionError && <p role="alert">{zipInspectionError}</p>}
            {zipInspection?.zip5 === inspectionZip && zipInspection.category_evidence.category_id === categoryId && <>
              <div><span>ZIP {zipInspection.zip5}</span><strong>{zipInspection.evidence_status.replaceAll('-', ' ')}</strong></div>
              <p>{zipInspection.classification?.class.replaceAll('-', ' ') ?? 'No selected registry evidence'} · {zipInspection.governed_zcta.status === 'included' ? `governed Census ZCTA ${zipInspection.governed_zcta.geoid}` : 'outside the governed ZCTA denominator'}.</p>
              {zipInspection.counts && <dl><div><dt>Physical-site evidence</dt><dd>{count(zipInspection.counts.physical_sites)}</dd></div><div><dt>Organization primary locations</dt><dd>{count(zipInspection.counts.organization_primary_locations)}</dd></div><div><dt>Employer baseline</dt><dd>{count(zipInspection.counts.employer_establishments)}</dd></div><div><dt>Physical sites / employer baseline</dt><dd>{percent(zipInspection.employer_alignment.percent)}</dd></div></dl>}
              <p>{zipInspection.employer_alignment.basis}</p>
              <p>{zipInspection.denominator_semantics}</p>
              <details><summary>Source contributions and release provenance ({zipInspection.contributions.length})</summary>
                {zipInspection.contributions.map((item) => <p key={item.source_id}><strong>{item.source_id}</strong> · source release {item.source_release_id ?? 'not supplied'}{item.source_through_date ? ` · through ${item.source_through_date}` : ''}{item.source_date ? ` · source date ${item.source_date}` : ''}{item.source_month ? ` · month ${item.source_month}` : ''}{item.reference_year ? ` · reference year ${item.reference_year}` : ''} · {Object.entries(item.positive_counts).map(([name, value]) => `${name}: ${count(value)}`).join(', ')}</p>)}
                <p>Coverage {zipInspection.bindings.coverage_release_id}; registry {zipInspection.bindings.registry_release_id}; Census geography {zipInspection.bindings.geography_release_id}.</p>
                <p>ZIP5 {String(zipInspection.zip_quality.postal_fields?.zip_code ?? 'not present')}; ZIP+4 {String(zipInspection.zip_quality.postal_fields?.zip4 ?? 'null / not supplied')}. USPS status is not asserted.</p>
              </details>
              <section className="category-zip-evidence" aria-label={`${zipInspection.category_evidence.category_label} exact ZIP source evidence`}>
                <h3>{zipInspection.category_evidence.category_label} category evidence for ZIP {zipInspection.zip5}</h3>
                {zipInspection.category_evidence.positive_source_contributions.length > 0
                  ? <details open><summary>Positive contributions in this category ({zipInspection.category_evidence.positive_source_contributions.length})</summary>
                    {zipInspection.category_evidence.positive_source_contributions.map((item) => <p key={item.source_id}><strong>{item.source_id}</strong> · source release {item.source_release_id ?? 'not supplied'}{item.source_through_date ? ` · through ${item.source_through_date}` : ''}{item.source_date ? ` · source date ${item.source_date}` : ''}{item.source_month ? ` · month ${item.source_month}` : ''}{item.reference_year ? ` · reference year ${item.reference_year}` : ''} · {Object.entries(item.positive_counts).map(([name, value]) => `${name}: ${count(value)}`).join(', ')}</p>)}
                    <p>Coverage {zipInspection.category_evidence.bindings.coverage_release_id}; registry {zipInspection.category_evidence.bindings.registry_release_id}; manifest {zipInspection.category_evidence.bindings.registry_manifest_sha256}; ZIP-quality audit {zipInspection.category_evidence.bindings.zip_quality_audit_id}.</p>
                  </details>
                  : <p>No selected positive evidence is available for this category and ZIP. This is not a measured zero, does not establish absence of organizations, and does not measure category completeness.</p>}
                <p>{zipInspection.category_evidence.semantics}</p>
              </section>
              {zipInspection.pharmacy_evidence && <section className="category-zip-evidence" aria-label={`Pharmacy evidence for exact ZIP ${zipInspection.zip5}`}>
                <h3>Pharmacy evidence for exact ZIP {zipInspection.zip5}</h3>
                <p>{zipInspection.pharmacy_evidence.evidence_scope.replaceAll('-', ' ')}</p>
                <dl>
                  <div><dt>Reported primary addresses</dt><dd>{count(zipInspection.pharmacy_evidence.reported_address_count)}</dd></div>
                  <div><dt>Unique organization NPIs</dt><dd>{count(zipInspection.pharmacy_evidence.unique_npi_count)}</dd></div>
                  <div><dt>Rows with ZIP+4</dt><dd>{count(zipInspection.pharmacy_evidence.reported_zip4_count)}</dd></div>
                  <div><dt>Mail-order taxonomy assertions</dt><dd>{count(zipInspection.pharmacy_evidence.mail_order_taxonomy_assertion_count)}</dd></div>
                </dl>
                <p>Source {zipInspection.pharmacy_evidence.source?.dataset_id ?? 'not supplied'} · release {zipInspection.pharmacy_evidence.source?.release_id ?? zipInspection.pharmacy_evidence.source?.source_release_id ?? 'not supplied'}{zipInspection.pharmacy_evidence.source?.source_through_date ? ` · through ${zipInspection.pharmacy_evidence.source.source_through_date}` : ''}.</p>
                <p>These are source-reported aggregate address and NPI facts, not generic business totals, verified physical sites, unique businesses, licensed pharmacies, current operations, or nationwide completeness.</p>
                {zipInspection.pharmacy_evidence.limitations?.map((item) => <p key={item}>{item}</p>)}
              </section>}
              {zipInspection.coverage_gap_codes.length > 0 && <p>Evidence gaps: {zipInspection.coverage_gap_codes.join(', ')}.</p>}
              {zipInspection.limitations.map((item) => <p key={item}>{item}</p>)}
            </>}
          </section>
          <OrganizationZipEvidencePanel zip5={inspectionZip} />
        </div>
        <EntitySummary feature={selectedFeature} category={activeCategory} stateSummary={stateSummary} stateFips={stateFips} selectedZip={selectedZip} geographyHash={data?.geography_manifest_sha256} mapRevision={data} />
      </div>}
    </section>
  );
}
