'use client';

import { useEffect, useMemo, useState, type CSSProperties, type WheelEvent } from 'react';
import { runnerJson } from './runner-client';

type Category = { id: string; label: string; group_id?: string; group_label?: string; business_name_drilldown: boolean };
type Enhancer = { id: string; label: string; kind: string };
type Catalog = {
  available: boolean;
  coverage_release_id: string;
  geography_release_id: string;
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
  population_2020: number;
  housing_units_2020: number;
  employer_establishments: number;
  businesses_per_1000_people: number | null;
  population_density: number | null;
  heat_value: number | null;
  scope_assignment: string;
};
type MapFeature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: MapProperties };
type MapResponse = {
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
  zip_code: string;
  total: number;
  limitation?: string;
  local_review_only?: boolean;
  records: Array<{
    business_name: string;
    address: { street: string | null; city: string | null; state: string | null; zip_code: string; zip4: string | null };
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
  assignment: Record<string, number | string>;
  states: Array<{
    state_fips: string;
    state_name: string;
    postal_abbreviation: string;
    category_counts: Record<string, number>;
    percent_of_state: Record<string, number>;
    percent_of_category_nationwide: Record<string, number>;
    all_category_evidence_count: number;
    population_2020: number;
    uniquely_assigned_zcta_count: number;
  }>;
};

async function request<T>(path: string): Promise<T> {
  return runnerJson<T>(path);
}

function count(value?: number | null) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function percent(value?: number | null) {
  return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}%`;
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

function FeatureMap({ data, selectedZip, onSelect }: { data: MapResponse; selectedZip: string; onSelect: (feature: MapFeature) => void }) {
  const [zoom, setZoom] = useState(selectedZip ? 1.8 : 1);
  const [hovered, setHovered] = useState<MapProperties | null>(null);
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
              fill={heatColor(feature.properties.heat_value, maximum, selectedZip === feature.properties.geoid)}
              className="heatmap-shape"
              tabIndex={0}
              role="button"
              aria-label={`${feature.properties.name}: ${count(feature.properties.heat_value)}`}
              onClick={() => onSelect(feature)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(feature); }}
              onMouseEnter={() => setHovered(feature.properties)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(feature.properties)}
              onBlur={() => setHovered(null)}
            />
          ))}
        </g>
      </svg>
      <div className="heatmap-legend"><span>Lower</span><i /><i /><i /><i /><i /><span>Higher</span></div>
      {hovered && <div className="map-tooltip"><strong>{hovered.postal_abbreviation || hovered.name}</strong><span>{hovered.name}</span><b>{count(hovered.heat_value)}</b><small>{count(hovered.business_count)} selected-category evidence rows</small></div>}
    </div>
  );
}

function BusinessNames({ selectedZip, categoryId, canDrill }: { selectedZip: string; categoryId: string; canDrill: boolean }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<NameResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedZip || !canDrill) return;
    const timer = window.setTimeout(() => {
      setData(null);
      setError('');
      setLoading(true);
      const parameters = new URLSearchParams({ zip: selectedZip, category: categoryId, query, limit: '25' });
      void request<NameResponse>(`/api/business-map/names?${parameters}`).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load names.')).finally(() => setLoading(false));
    }, query ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [canDrill, categoryId, query, selectedZip]);

  return (
    <section className="business-name-drill">
      <div className="name-drill-heading"><div><span>Business-name drill-down</span><strong>{selectedZip ? `ZIP ${selectedZip}` : 'Select a ZIP polygon'}</strong></div>{selectedZip && canDrill && <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter names" />}</div>
      {!selectedZip && <p>Click a state, then county, then a five-digit ZCTA to inspect governed physical-location names.</p>}
      {selectedZip && !canDrill && <p>This category contains organization-address assertions, not physical-location profiles, so names are not exposed by this map index.</p>}
      {loading && <p>Scanning the matching ZIP partition…</p>}
      {error && <p className="map-error">{error}</p>}
      {data?.local_review_only && <small className="local-review-label">Local review only — record-level redistribution policies still apply.</small>}
      {data && !loading && canDrill && <div className="business-name-list">
        {!data.records.length && <p>No matching physical-location names in this category.</p>}
        {data.records.map((record, index) => <article key={`${record.business_name}-${index}`}><div><strong>{record.business_name}</strong><span>{record.address.street || 'Street not reported'} · {record.address.city}, {record.address.state} {record.address.zip_code}{record.address.zip4 ? <small> +4 {record.address.zip4}</small> : null}</span></div><em>{record.category_id.replaceAll('-', ' ')}</em></article>)}
        {data.total > data.records.length && <small>Showing {data.records.length} of {count(data.total)} distinct names.</small>}
      </div>}
    </section>
  );
}

function StateComparison({ catalog }: { catalog: Catalog }) {
  const childCategories = catalog.categories.filter(({ id }) => id !== 'all');
  const [selectedCategory, setSelectedCategory] = useState(childCategories[0]?.id ?? 'retail-consumer');
  const [includeTerritories, setIncludeTerritories] = useState(false);
  const [summary, setSummary] = useState<StateSummary | null>(null);
  const [sort, setSort] = useState<'state' | 'state-share' | 'national-share'>('national-share');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSummary(null);
      setError('');
      void request<StateSummary>(`/api/business-map/state-summary?include_territories=${includeTerritories}`).then((result) => { if (!cancelled) setSummary(result); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load state comparison.'); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [includeTerritories]);

  const rows = useMemo(() => {
    const values = [...(summary?.states ?? [])];
    if (sort === 'state') values.sort((a, b) => a.state_name.localeCompare(b.state_name));
    if (sort === 'state-share') values.sort((a, b) => b.percent_of_state[selectedCategory] - a.percent_of_state[selectedCategory]);
    if (sort === 'national-share') values.sort((a, b) => b.percent_of_category_nationwide[selectedCategory] - a.percent_of_category_nationwide[selectedCategory]);
    return values;
  }, [selectedCategory, sort, summary]);

  return (
    <div className="state-comparison">
      <div className="comparison-controls">
        <label><span>Compare category</span><select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>{childCategories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select></label>
        <label><span>Sort states</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="national-share">Share of category nationwide</option><option value="state-share">Share within state</option><option value="state">State name</option></select></label>
        <label className="territory-toggle"><input type="checkbox" checked={includeTerritories} onChange={(event) => setIncludeTerritories(event.target.checked)} /> Include territories</label>
      </div>
      {error && <div className="map-error">{error}</div>}
      {!summary && !error && <div className="map-loading">Calculating governed state percentages…</div>}
      {summary && <>
        <div className="comparison-key"><span><b>Within state</b> Category’s share of that state’s relevant source evidence</span><span><b>Across U.S.</b> State’s share of that category across displayed states</span></div>
        <div className="state-summary-head"><span>State</span><span>Category evidence</span><span>Within state</span><span>Across U.S.</span><span>Category mix</span></div>
        <div className="state-summary-list">
          {rows.map((state) => <article key={state.state_fips}>
            <div><strong>{state.postal_abbreviation}</strong><span>{state.state_name}</span><small>{count(state.uniquely_assigned_zcta_count)} uniquely assigned ZCTAs</small></div>
            <b>{count(state.category_counts[selectedCategory])}</b>
            <span>{percent(state.percent_of_state[selectedCategory])}</span>
            <span>{percent(state.percent_of_category_nationwide[selectedCategory])}</span>
            <div className="category-mix" title="Distribution across all categories">{childCategories.map((category, index) => <i key={category.id} style={{ width: `${state.percent_of_state[category.id]}%`, '--mix-index': index } as CSSProperties} />)}</div>
          </article>)}
        </div>
        <p className="map-method-note">{summary.assignment.semantics} Excluded: {count(summary.assignment.excluded_ambiguous_zcta_count as number)} cross-state ZCTAs and {count(summary.assignment.excluded_unmatched_zip_count as number)} ZIP values without a usable ZCTA assignment.</p>
      </>}
    </div>
  );
}

export default function BusinessIntelligence() {
  const [tab, setTab] = useState<'heatmap' | 'states'>('heatmap');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [data, setData] = useState<MapResponse | null>(null);
  const [level, setLevel] = useState<'states' | 'counties' | 'zips'>('states');
  const [categoryId, setCategoryId] = useState('all');
  const [enhancerId, setEnhancerId] = useState('business_count');
  const [minPopulation, setMinPopulation] = useState('');
  const [minHousingUnits, setMinHousingUnits] = useState('');
  const [stateFips, setStateFips] = useState('');
  const [stateName, setStateName] = useState('');
  const [countyGeoid, setCountyGeoid] = useState('');
  const [countyName, setCountyName] = useState('');
  const [selectedZip, setSelectedZip] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void request<Catalog>('/api/business-map/catalog').then(setCatalog).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load map catalog.'));
  }, []);

  useEffect(() => {
    if (!catalog?.available || tab !== 'heatmap') return;
    const parameters = new URLSearchParams({ level, category: categoryId, enhancer: enhancerId });
    if (stateFips) parameters.set('state_fips', stateFips);
    if (countyGeoid) parameters.set('county_geoid', countyGeoid);
    if (minPopulation) parameters.set('min_population', minPopulation);
    if (minHousingUnits) parameters.set('min_housing_units', minHousingUnits);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void request<MapResponse>(`/api/business-map/features?${parameters}`).then((result) => { if (!cancelled) setData(result); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load map.'); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [catalog, categoryId, countyGeoid, enhancerId, level, minHousingUnits, minPopulation, stateFips, tab]);

  const activeCategory = catalog?.categories?.find(({ id }) => id === categoryId);

  function choose(feature: MapFeature) {
    if (level === 'states') {
      setStateFips(feature.properties.geoid); setStateName(feature.properties.name); setCountyGeoid(''); setCountyName(''); setSelectedZip(''); setLevel('counties');
    } else if (level === 'counties') {
      setCountyGeoid(feature.properties.geoid); setCountyName(feature.properties.name); setSelectedZip(''); setLevel('zips');
    } else setSelectedZip(feature.properties.geoid);
  }

  function national() {
    setLevel('states'); setStateFips(''); setStateName(''); setCountyGeoid(''); setCountyName(''); setSelectedZip('');
  }

  function state() {
    setLevel('counties'); setCountyGeoid(''); setCountyName(''); setSelectedZip('');
  }

  function county() {
    setLevel('zips'); setSelectedZip('');
  }

  return (
    <section id="business-intelligence" className="panel intelligence-panel">
      <div className="panel-heading intelligence-heading"><div><span className="section-kicker">Spatial intelligence</span><h2>Business heat maps <em>{shortRelease(catalog?.coverage_release_id)}</em></h2></div><div className="governed-chip"><i /> Governed local view</div></div>
      <div className="intelligence-tabs" role="tablist" aria-label="Business intelligence views">
        <button role="tab" aria-selected={tab === 'heatmap'} className={tab === 'heatmap' ? 'active' : ''} onClick={() => setTab('heatmap')}>Heat map</button>
        <button role="tab" aria-selected={tab === 'states'} className={tab === 'states' ? 'active' : ''} onClick={() => setTab('states')}>State category alignment</button>
      </div>
      {!catalog && !error && <div className="map-loading">Indexing the current governed coverage release…</div>}
      {error && <div className="map-error">{error}</div>}
      {catalog?.available === false && <div className="map-error">No compatible coverage and geography release is available.</div>}
      {catalog?.available && tab === 'heatmap' && <div className="heatmap-layout">
        <aside className="map-selectors">
          <label><span>Business category hierarchy</span><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSelectedZip(''); }}><option value="all">All source categories</option>{catalog.category_groups.map((group) => <optgroup label={group.label} key={group.id}>{group.categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</optgroup>)}</select></label>
          <label><span>Heat-map data / enhancer</span><select value={enhancerId} onChange={(event) => setEnhancerId(event.target.value)}>{catalog.enhancers.map((enhancer) => <option value={enhancer.id} key={enhancer.id}>{enhancer.label}</option>)}</select></label>
          <fieldset className="demographic-filters">
            <legend>Population / demographic filters</legend>
            <label><span>Minimum population</span><input aria-label="Minimum population" type="number" min="0" step="1" inputMode="numeric" value={minPopulation} onChange={(event) => { setMinPopulation(event.target.value); setSelectedZip(''); }} placeholder="No minimum" /></label>
            <label><span>Minimum housing units</span><input aria-label="Minimum housing units" type="number" min="0" step="1" inputMode="numeric" value={minHousingUnits} onChange={(event) => { setMinHousingUnits(event.target.value); setSelectedZip(''); }} placeholder="No minimum" /></label>
            <button type="button" onClick={() => { setMinPopulation(''); setMinHousingUnits(''); }}>Clear filters</button>
          </fieldset>
          <div className="scope-card"><span>Current scope</span><strong>{selectedZip ? `ZIP ${selectedZip}` : countyName || stateName || 'United States'}</strong><small>{activeCategory?.label}</small></div>
          <BusinessNames key={`${selectedZip}:${categoryId}`} selectedZip={selectedZip} categoryId={categoryId} canDrill={activeCategory?.business_name_drilldown ?? true} />
        </aside>
        <div className="map-stage">
          <nav className="map-breadcrumb" aria-label="Map scope"><button onClick={national}>United States</button>{stateFips && <><span>›</span><button onClick={state}>{stateName}</button></>}{countyGeoid && <><span>›</span><button onClick={county}>{countyName}</button></>}{selectedZip && <><span>›</span><strong>ZIP {selectedZip}</strong></>}</nav>
          {loading && <div className="map-loading overlay">Loading {level} polygons and evidence…</div>}
          {data && <FeatureMap key={`${data.level}:${String(data.meta.state_fips ?? '')}:${String(data.meta.county_geoid ?? '')}:${selectedZip}`} data={data} selectedZip={selectedZip} onSelect={choose} />}
          {data && <div className="map-stats"><span><strong>{count(data.meta.feature_count as number)}</strong> polygons</span><span><strong>{count(data.meta.filtered_out_feature_count as number)}</strong> filtered out</span><span><strong>{count(data.meta.heat_max as number)}</strong> high value</span><span><strong>{count(data.meta.cross_boundary_zctas as number)}</strong> cross-boundary ZCTAs</span></div>}
          <p className="map-method-note">{catalog.semantics.business_count} {level === 'zips' ? 'Displayed ZCTAs materially intersect the selected county; their direct ZIP values are not allocated to that county.' : catalog.semantics.jurisdiction_assignment} ZIP+4 remains a separate, non-geometric field.</p>
        </div>
      </div>}
      {catalog?.available && tab === 'states' && <StateComparison catalog={catalog} />}
    </section>
  );
}
