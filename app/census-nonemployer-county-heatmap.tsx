'use client';
import { useEffect, useMemo, useState } from 'react';
import { runnerJson } from './runner-client';

type PolygonFeature = { type: 'Feature'; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }; properties: {
  geoid: string; name: string; value: number | null; raw_value: number | null; flag: string | null;
  missing_cell: boolean; status: 'outside-retained-native-universe' | 'not-published' | 'published-flagged' | 'published-usable';
  county_share_of_state_percent: number | null; county_share_of_national_percent: number | null;
} };
type View = {
  status: string; state_fips: string; naics_code: string; naics_label: string; reference_year: number;
  release_id: string; release_manifest_sha256: string; source_release_id: string; source_manifest_sha256: string;
  context_artifact_sha256: string; geography_release_id: string; geography_manifest_sha256: string;
  geometry_artifact_sha256: string; created_at: string; source_replay_performed_this_read: false;
  state_denominator: { value: number | null; raw_value: number | null; flag: string | null };
  national_denominator: { value: number | null; raw_value: number | null; flag: string | null };
  counties: { type: 'FeatureCollection'; features: PolygonFeature[] }; limitations: string[];
};

const STATES = [
  ['01','Alabama'],['02','Alaska'],['04','Arizona'],['05','Arkansas'],['06','California'],['08','Colorado'],['09','Connecticut'],['10','Delaware'],['11','District of Columbia'],['12','Florida'],['13','Georgia'],['15','Hawaii'],['16','Idaho'],['17','Illinois'],['18','Indiana'],['19','Iowa'],['20','Kansas'],['21','Kentucky'],['22','Louisiana'],['23','Maine'],['24','Maryland'],['25','Massachusetts'],['26','Michigan'],['27','Minnesota'],['28','Mississippi'],['29','Missouri'],['30','Montana'],['31','Nebraska'],['32','Nevada'],['33','New Hampshire'],['34','New Jersey'],['35','New Mexico'],['36','New York'],['37','North Carolina'],['38','North Dakota'],['39','Ohio'],['40','Oklahoma'],['41','Oregon'],['42','Pennsylvania'],['44','Rhode Island'],['45','South Carolina'],['46','South Dakota'],['47','Tennessee'],['48','Texas'],['49','Utah'],['50','Vermont'],['51','Virginia'],['53','Washington'],['54','West Virginia'],['55','Wisconsin'],['56','Wyoming'],
] as const;
const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-US').format(value);
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(2)}%`;
const denominator = (item: View['state_denominator']) => item.flag ? `Unavailable · source flag ${item.flag} (raw ${number(item.raw_value)})` : number(item.value);
function coordinates(feature: PolygonFeature) {
  const output: number[][] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') output.push(value as number[]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(feature.geometry.coordinates); return output;
}
function ringPath(ring: unknown[], project: (point: number[]) => string) {
  return ring.map((point, index) => `${index ? 'L' : 'M'}${project(point as number[])}`).join(' ') + ' Z';
}
function pathFor(feature: PolygonFeature, project: (point: number[]) => string) {
  const values = feature.geometry.coordinates as unknown[];
  return feature.geometry.type === 'Polygon'
    ? values.map(ring => ringPath(ring as unknown[], project)).join(' ')
    : values.flatMap(polygon => (polygon as unknown[]).map(ring => ringPath(ring as unknown[], project))).join(' ');
}
function makeProjector(features: PolygonFeature[]) {
  if (!features.length) return () => '0,0';
  const points = features.flatMap(coordinates);
  const bounds = points.reduce((box, point) => ({ minX: Math.min(box.minX, point[0]), maxX: Math.max(box.maxX, point[0]), minY: Math.min(box.minY, point[1]), maxY: Math.max(box.maxY, point[1]) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const { minX, maxX, minY, maxY } = bounds;
  const width = Math.max(0.001, maxX - minX), height = Math.max(0.001, maxY - minY);
  const scale = Math.min(840 / width, 470 / height), ox = (900 - width * scale) / 2, oy = (500 - height * scale) / 2;
  return (point: number[]) => `${(ox + (point[0] - minX) * scale).toFixed(2)},${(oy + (maxY - point[1]) * scale).toFixed(2)}`;
}
function countyColor(feature: PolygonFeature, maximum: number) {
  if (feature.properties.status === 'outside-retained-native-universe') return 'url(#context-outside)';
  if (feature.properties.status === 'not-published') return 'url(#context-missing)';
  if (feature.properties.status === 'published-flagged') return 'url(#context-flagged)';
  const value = feature.properties.value ?? 0;
  const intensity = maximum ? Math.log1p(value) / Math.log1p(maximum) : 0;
  return value === 0 ? '#34434e' : `hsl(${199 - intensity * 156} 73% ${29 + intensity * 27}%)`;
}

export default function CensusNonemployerCountyHeatmap() {
  const [stateFips, setStateFips] = useState('06');
  const [naics, setNaics] = useState('23');
  const selectionKey = `${stateFips}:${naics}`;
  const [saved, setSaved] = useState<{ key: string; value: View } | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const [hover, setHover] = useState<{ key: string; geoid: string } | null>(null);
  const view = saved?.key === selectionKey ? saved.value : null;
  const features = view?.counties.features;
  const failed = failedKey === selectionKey;
  const hovered = hover?.key === selectionKey ? view?.counties.features.find(feature => feature.properties.geoid === hover.geoid) : null;
  const maximum = Math.max(0, ...(view?.counties.features.map(feature => feature.properties.value ?? 0) ?? []));
  const project = useMemo(() => makeProjector(features ?? []), [features]);
  useEffect(() => {
    const controller = new AbortController(), query = new URLSearchParams({ state_fips: stateFips, naics });
    void runnerJson<View>(`/api/business-map/nonemployer-county-heatmap?${query}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setSaved({ key: selectionKey, value }); })
      .catch(reason => { if (!controller.signal.aborted && reason?.name !== 'AbortError') setFailedKey(selectionKey); });
    return () => controller.abort();
  }, [stateFips, naics, selectionKey]);

  return <section className="panel census-industry-panel" aria-label="Census nonemployer county industry heatmap">
    <div className="panel-heading"><div><span className="section-kicker">Annual aggregate context</span><h2>Census nonemployer county heatmap</h2></div><div className="governed-chip"><i/> Fixed 2023 retained release</div></div>
    <div className="map-selectors">
      <label><span>State or District of Columbia</span><select aria-label="State or District of Columbia" value={stateFips} onChange={event => setStateFips(event.target.value)}>{STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label><span>NAICS industry</span><select aria-label="NAICS industry" value={naics} onChange={event => setNaics(event.target.value)}><option value="23">23 · Construction</option><option value="62441">62441 · Child Day Care Services</option></select></label>
    </div>
    {failed ? <p className="map-error" role="alert">The verified county heatmap could not be loaded. No alternate release was used.</p>
      : !view ? <p className="map-loading" role="status">Loading pinned county context and geometry…</p> : <>
        <p><strong>{view.naics_code} · {view.naics_label}</strong> · 2023 annual nonemployer establishments · {STATES.find(([code]) => code === stateFips)?.[1]}.</p>
        <div className="entity-method-note"><strong>Official denominators:</strong> State {denominator(view.state_denominator)} · United States {denominator(view.national_denominator)}. County shares are shown on hover.</div>
        <div className="heatmap-canvas">
          <svg viewBox="0 0 900 500" role="img" aria-label={`${view.naics_label} nonemployer establishment counts by county in ${STATES.find(([code]) => code === stateFips)?.[1]}`}>
            <defs>
              <pattern id="context-missing" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#49515c"/><path d="M0 8L8 0" stroke="#a9afb7" strokeWidth="2"/></pattern>
              <pattern id="context-flagged" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#514451"/><path d="M0 0L8 8" stroke="#f6a36c" strokeWidth="2"/></pattern>
              <pattern id="context-outside" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#23313b"/><path d="M0 4H8" stroke="#718493" strokeWidth="2"/></pattern>
            </defs>
            {view.counties.features.map(feature => <path key={feature.properties.geoid} d={pathFor(feature, project)} fill={countyColor(feature, maximum)} fillRule="evenodd" className="heatmap-shape" stroke="#101b23" strokeWidth="0.6" onMouseEnter={() => setHover({ key: selectionKey, geoid: feature.properties.geoid })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ key: selectionKey, geoid: feature.properties.geoid })} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${feature.properties.name}: ${feature.properties.status === 'published-usable' ? `${number(feature.properties.value)} establishments` : feature.properties.status.replaceAll('-', ' ')}; state share ${percent(feature.properties.county_share_of_state_percent)}; national share ${percent(feature.properties.county_share_of_national_percent)}`}><title>{feature.properties.name}</title></path>)}
          </svg>
          <div className="nonemployer-context-legend" role="img" aria-label="County heatmap value legend from lower to higher usable establishment counts"><span>Lower usable count</span><i style={{ background: 'hsl(199 73% 29%)' }}/><i style={{ background: 'hsl(160 73% 36%)' }}/><i style={{ background: 'hsl(121 73% 42%)' }}/><i style={{ background: 'hsl(82 73% 49%)' }}/><i style={{ background: 'hsl(43 73% 56%)' }}/><span>Higher usable count</span></div>
          <div className="nonemployer-context-legend" role="img" aria-label="County data status legend: true zero, not published, flagged, outside retained native universe"><span>True zero</span><i style={{ background: '#34434e' }}/><span>Not published</span><i style={{ background: 'repeating-linear-gradient(135deg,#49515c 0 4px,#a9afb7 4px 6px)' }}/><span>Flagged</span><i style={{ background: 'repeating-linear-gradient(45deg,#514451 0 4px,#f6a36c 4px 6px)' }}/><span>Outside retained universe</span><i style={{ background: 'repeating-linear-gradient(0deg,#23313b 0 4px,#718493 4px 6px)' }}/></div>
        </div>
        {hovered && <div className="map-tooltip" role="status"><strong>{hovered.properties.name}</strong><span>NAICS {view.naics_code} · {view.reference_year}</span><b>{hovered.properties.status === 'published-usable' ? `${number(hovered.properties.value)} annual establishments` : hovered.properties.status.replaceAll('-', ' ')}</b><small>Raw source value: {number(hovered.properties.raw_value)} · flag: {hovered.properties.flag ?? 'none'} · state share: {percent(hovered.properties.county_share_of_state_percent)} · national share: {percent(hovered.properties.county_share_of_national_percent)}</small></div>}
        <details><summary>Release provenance</summary><p>Derived release {view.release_id} · created {view.created_at}; source release {view.source_release_id}. Source manifest SHA-256 {view.source_manifest_sha256}; context manifest SHA-256 {view.release_manifest_sha256}; context artifact SHA-256 {view.context_artifact_sha256}; geography release {view.geography_release_id}; geography manifest SHA-256 {view.geography_manifest_sha256}; state geometry SHA-256 {view.geometry_artifact_sha256}.</p><p>Source release replay performed for this read: no. This map joins the fixed county geography and annual industry context by exact county GEOID.</p></details>
        <p className="map-method-note">Missing, flagged, and true zero values retain separate meanings. {view.limitations.join(' ')}</p>
      </>}
  </section>;
}
