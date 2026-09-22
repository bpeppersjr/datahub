import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';

const CONFIG = 'config/census-nonemployer-county-heatmap.json';
const CONTEXT_RELEASE = 'census-nonemployer-industry-context-2023-e3fe540b-889b-4dc2-b279-8e9f515ac97e';
const CONTEXT_MANIFEST_HASH = '60bc303ec665df2472afb93277ed871c1448a6e891b6294903431b6d15c6715f';
const CONTEXT_ARTIFACT_HASH = '50783ebe19fef9817c6502ee48a9de0be7c99fe71f1b2db475948fd93a0bc0ba';
const GEOGRAPHY_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEOGRAPHY_MANIFEST_HASH = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const ELIGIBLE_STATES = Object.freeze(['01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56']);
const INDUSTRIES = Object.freeze({ '23': 'Construction', '62441': 'Child Day Care Services' });
const NATIONAL_STATE_COUNTIES = Object.freeze({ county: 3143, state: 51, national: 1 });
const hash = value => createHash('sha256').update(value).digest('hex');
function fail(message, statusCode = 503) { throw Object.assign(new Error(message), { statusCode }); }
function inside(root, target) {
  const absolute = path.resolve(root, target), relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('Pinned county heatmap path is outside the application.');
  return absolute;
}
function sameFile(a, b) { return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino && a.nlink === 1n && b.nlink === 1n; }
async function readStable(root, relative, { maxBytes, signal } = {}) {
  signal?.throwIfAborted();
  const filename = inside(root, relative), canonical = await realpath(filename);
  if (canonical !== filename) fail('Pinned county heatmap file is not canonical.');
  const before = await lstat(filename, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maxBytes)) fail('Pinned county heatmap file is invalid or too large.');
  const handle = await open(filename, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) fail('Pinned county heatmap file changed before reading.');
    const bytes = await handle.readFile();
    signal?.throwIfAborted();
    const after = await handle.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    if (!sameFile(before, after) || !sameFile(before, named) || before.size !== BigInt(bytes.length)
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail('Pinned county heatmap file changed during reading.');
    return bytes;
  } finally { await handle.close(); }
}
function verifyHash(bytes, expected, label) { if (hash(bytes) !== expected) fail(`${label} integrity check failed.`); }
function safeJson(bytes, label) { try { return JSON.parse(bytes.toString('utf8')); } catch { fail(`${label} is malformed JSON.`); } }
function validateRow(row, ids, eligibleStates) {
  if (!row || row.schema_version !== 'census-nonemployer-county-industry-context@1.0.0'
    || !Object.hasOwn(INDUSTRIES, row.naics?.code) || row.naics.classification !== '2022 NAICS'
    || row.reference_year !== 2023 || row.provenance?.source_release_id !== 'census-nonemployer-2023-20260830-230249716Z-78268f89'
    || row.provenance?.source_manifest_sha256 !== '7ebdba43630506d1c6bf859fdc91fe57566c0d0b95c4b8f872c40c2c71670f06'
    || row.provenance?.transformation_version !== 'census-nonemployer-county-industry-context@1.0.0'
    || row.measures?.flags_preserved_without_reinterpretation !== true
    || typeof row.geoid !== 'string' || !['county', 'state', 'national'].includes(row.geography_type)) fail('A pinned nonemployer context cell failed validation.');
  const expected = row.geography_type === 'national' ? row.geoid === 'US' && row.state_fips === null && row.county_fips === null
    : row.geography_type === 'state' ? /^\d{2}$/.test(row.geoid) && row.geoid !== '00' && row.geoid === row.state_fips && row.county_fips === null && eligibleStates.has(row.state_fips)
      : /^\d{5}$/.test(row.geoid) && row.geoid.slice(0, 2) === row.state_fips && row.geoid.slice(2) === row.county_fips && eligibleStates.has(row.state_fips);
  if (!expected) fail('A pinned nonemployer context geography key is invalid.');
  const key = `${row.naics.code}:${row.geography_type}:${row.geoid}`;
  if (ids.has(key)) fail('The pinned nonemployer context contains duplicate cells.');
  ids.add(key);
  for (const value of [row.measures.nonemployer_establishments, row.measures.nonemployer_establishments_raw]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) fail('A nonemployer count is invalid.');
  }
  for (const key of ['nonemployer_establishments_flag', 'receipts_flag', 'receipts_noise_range_flag']) {
    if (row.measures[key] !== null && typeof row.measures[key] !== 'string') fail('A published Census flag is invalid.');
  }
  if (row.missing_cell && (row.geography_type !== 'county' || row.status !== 'not-published-in-retained-selected-total-cells'
    || row.measures.nonemployer_establishments !== null || row.measures.nonemployer_establishments_raw !== null)) fail('A missing nonemployer cell was reinterpreted.');
  if (row.measures.nonemployer_establishments_flag && (row.measures.nonemployer_establishments !== null || row.status !== 'published-flagged-establishment-measure')) fail('A flagged nonemployer count has a usable value or altered status.');
  if (!row.missing_cell && !row.measures.nonemployer_establishments_flag
    && (!Number.isSafeInteger(row.measures.nonemployer_establishments) || row.measures.nonemployer_establishments !== row.measures.nonemployer_establishments_raw || row.status !== 'published-annual-aggregate')) fail('A usable nonemployer count differs from its raw value or published status.');
}
function validGeometryFeature(feature, stateFips) {
  const geoid = String(feature?.properties?.GEOID ?? '');
  return /^\d{5}$/.test(geoid) && geoid.slice(0, 2) === stateFips
    && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) && Array.isArray(feature.geometry.coordinates);
}
export function joinCountyContextToGeometry(geometry, contextCells, { stateFips, naics, stateDenominator, nationalDenominator } = {}) {
  const seen = new Set();
  return geometry.features.map(feature => {
    const geoid = String(feature.properties.GEOID);
    if (seen.has(geoid)) fail('Pinned county geometry contains duplicate county GEOIDs.');
    seen.add(geoid);
    const cell = contextCells.get(`${naics}:county:${geoid}`);
    const outside = !cell;
    const count = cell?.measures.nonemployer_establishments ?? null;
    const share = denominator => Number.isSafeInteger(count) && Number.isSafeInteger(denominator) && denominator > 0
      ? Number((count / denominator * 100).toFixed(6)) : null;
    if (geoid.slice(0, 2) !== stateFips) fail('County geometry does not match the selected state.');
    return { ...feature, properties: { ...feature.properties,
      geoid, name: String(feature.properties.NAME ?? feature.properties.NAMELSAD ?? geoid),
      naics_code: naics, reference_year: 2023,
      value: outside || cell.missing_cell || cell.measures.nonemployer_establishments_flag ? null : count,
      raw_value: cell?.measures.nonemployer_establishments_raw ?? null,
      flag: cell?.measures.nonemployer_establishments_flag ?? null,
      missing_cell: outside ? false : cell.missing_cell,
      status: outside ? 'outside-retained-native-universe' : cell.missing_cell ? 'not-published' : cell.measures.nonemployer_establishments_flag ? 'published-flagged' : 'published-usable',
      source_measures: cell?.measures ?? null, source_provenance: cell?.provenance ?? null,
      county_share_of_state_percent: outside ? null : share(stateDenominator),
      county_share_of_national_percent: outside ? null : share(nationalDenominator),
    } };
  });
}

export function createCensusNonemployerCountyHeatmapView({ root = APP_ROOT } = {}) {
  let closed = false;
  async function get({ stateFips, naics } = {}, { signal } = {}) {
    if (closed) fail('County heatmap view is closed.');
    if (!/^\d{2}$/.test(stateFips ?? '')) fail('Choose one eligible state or the District of Columbia.', 400);
    if (!Object.hasOwn(INDUSTRIES, naics)) fail('Choose an available fixed NAICS selection.', 400);
    const appRoot = await realpath(path.resolve(root));
    const configBytes = await readStable(appRoot, CONFIG, { maxBytes: 16_000 });
    const config = safeJson(configBytes, 'County heatmap pin');
    if (config.schema_version !== 'census-nonemployer-county-heatmap@1.0.0'
      || config.context_release_id !== CONTEXT_RELEASE || config.context_manifest_sha256 !== CONTEXT_MANIFEST_HASH
      || config.context_artifact_sha256 !== CONTEXT_ARTIFACT_HASH || config.geography_release_id !== GEOGRAPHY_RELEASE
      || config.geography_manifest_sha256 !== GEOGRAPHY_MANIFEST_HASH || config.max_context_artifact_bytes !== 25_000_000
      || config.max_geometry_artifact_bytes !== 4_000_000 || config.max_response_bytes !== 5_000_000
      || config.context_record_count !== 6390 || config.context_artifact_bytes !== 12483025
      || config.context_manifest_path !== `data/business-baselines/census-nonemployer-industry-context/releases/${CONTEXT_RELEASE}/manifest.json`
      || config.context_artifact_path !== `data/business-baselines/census-nonemployer-industry-context/releases/${CONTEXT_RELEASE}/county-industry-context.jsonl`
      || config.geography_manifest_path !== `data/geography/releases/${GEOGRAPHY_RELEASE}/manifest.json`
      || JSON.stringify(config.selected_naics) !== JSON.stringify(['23', '62441'])
      || JSON.stringify(config.states_and_dc) !== JSON.stringify(ELIGIBLE_STATES) || !ELIGIBLE_STATES.includes(stateFips)) fail('Fixed county heatmap selection pin is invalid.');
    signal?.throwIfAborted();
    const contextManifestBytes = await readStable(appRoot, config.context_manifest_path, { maxBytes: 2_000_000, signal });
    verifyHash(contextManifestBytes, CONTEXT_MANIFEST_HASH, 'Pinned context manifest');
    const contextManifest = safeJson(contextManifestBytes, 'Pinned context manifest');
    const contextDescriptor = contextManifest.artifacts?.find(item => item.path === 'county-industry-context.jsonl');
    if (contextManifest.schema_version !== 'census-nonemployer-county-industry-context@1.0.0'
      || contextManifest.dataset_id !== 'census-nonemployer-county-industry-context'
      || contextManifest.release_id !== CONTEXT_RELEASE || contextManifest.status !== 'verified-retained-derived-context'
      || contextManifest.coverage?.county_geographies !== 3143 || contextManifest.coverage?.rows !== 6390
      || contextManifest.source?.release_id !== 'census-nonemployer-2023-20260830-230249716Z-78268f89'
      || contextManifest.source?.manifest_sha256 !== '7ebdba43630506d1c6bf859fdc91fe57566c0d0b95c4b8f872c40c2c71670f06'
      || contextManifest.classification?.system !== 'NAICS' || contextManifest.classification?.vintage !== 2022
      || JSON.stringify(contextManifest.classification?.selection?.map(item => item.code)) !== JSON.stringify(['23', '62441'])
      || contextDescriptor?.artifact_type !== 'census-nonemployer-industry-context-jsonl'
      || contextDescriptor?.sha256 !== CONTEXT_ARTIFACT_HASH || contextDescriptor.bytes !== 12483025 || contextDescriptor.record_count !== 6390) fail('Pinned context release manifest contract is invalid.');
    const contextBytes = await readStable(appRoot, config.context_artifact_path, { maxBytes: config.max_context_artifact_bytes, signal });
    if (contextBytes.length !== 12483025) fail('Pinned context artifact size is invalid.');
    verifyHash(contextBytes, CONTEXT_ARTIFACT_HASH, 'Pinned context artifact');
    const rows = contextBytes.toString('utf8').trimEnd().split('\n').map(line => safeJson(Buffer.from(line), 'Context cell'));
    if (rows.length !== config.context_record_count) fail('Pinned context artifact cell count is invalid.');
    const ids = new Set(), cells = new Map(), geographyCounts = new Map(), eligibleStates = new Set(config.states_and_dc);
    for (const row of rows) {
      validateRow(row, ids, eligibleStates);
      const tallyKey = `${row.naics.code}:${row.geography_type}`;
      geographyCounts.set(tallyKey, (geographyCounts.get(tallyKey) ?? 0) + 1);
      cells.set(`${row.naics.code}:${row.geography_type}:${row.geoid}`, row);
    }
    for (const code of Object.keys(INDUSTRIES)) for (const [type, expected] of Object.entries(NATIONAL_STATE_COUNTIES)) {
      if (geographyCounts.get(`${code}:${type}`) !== expected) fail('Pinned context native cell partition count is invalid.');
    }
    const geographyManifestBytes = await readStable(appRoot, config.geography_manifest_path, { maxBytes: 2_000_000, signal });
    verifyHash(geographyManifestBytes, GEOGRAPHY_MANIFEST_HASH, 'Pinned geography manifest');
    const geographyManifest = safeJson(geographyManifestBytes, 'Pinned geography manifest');
    if (geographyManifest.release_id !== GEOGRAPHY_RELEASE || geographyManifest.dataset_id !== 'us-census-geography'
      || geographyManifest.status !== 'published' || geographyManifest.complete_national_release !== true
      || geographyManifest.coordinate_reference_system !== 'EPSG:4326') fail('Pinned geography release manifest contract is invalid.');
    const geometryRelative = `source/counties/state=${stateFips}.geojson`;
    const geometryDescriptor = geographyManifest.artifacts?.find(item => item.path === geometryRelative && item.geography_type === 'county' && item.partition === stateFips);
    if (!geometryDescriptor || geometryDescriptor.bytes > config.max_geometry_artifact_bytes) fail('Pinned state county geometry is unavailable.');
    const geometryBytes = await readStable(appRoot, `data/geography/releases/${GEOGRAPHY_RELEASE}/${geometryRelative}`, { maxBytes: config.max_geometry_artifact_bytes, signal });
    if (geometryBytes.length !== geometryDescriptor.bytes) fail('Pinned state county geometry size is invalid.');
    verifyHash(geometryBytes, geometryDescriptor.sha256, 'Pinned state county geometry');
    const geometry = safeJson(geometryBytes, 'Pinned state county geometry');
    if (geometry.type !== 'FeatureCollection' || geometry.features?.length !== geometryDescriptor.feature_count
      || !Array.isArray(geometry.features) || geometry.features.some(feature => !validGeometryFeature(feature, stateFips))) fail('Pinned county geometry partition is invalid.');
    const national = cells.get(`${naics}:national:US`), state = cells.get(`${naics}:state:${stateFips}`);
    if (!national || !state) fail('Official national or state denominator is unavailable.');
    const features = joinCountyContextToGeometry(geometry, cells, { stateFips, naics,
      stateDenominator: state.measures.nonemployer_establishments,
      nationalDenominator: national.measures.nonemployer_establishments });
    signal?.throwIfAborted();
    const response = {
      schema_version: 'census-nonemployer-county-heatmap@1.0.0', status: 'available', state_fips: stateFips,
      naics_code: naics, naics_label: INDUSTRIES[naics], reference_year: 2023, naics_vintage: 2022,
      release_id: CONTEXT_RELEASE, release_manifest_sha256: CONTEXT_MANIFEST_HASH,
      source_release_id: contextManifest.source.release_id, source_manifest_sha256: contextManifest.source.manifest_sha256,
      source_replay_performed_this_read: false, context_artifact_sha256: CONTEXT_ARTIFACT_HASH,
      geography_release_id: GEOGRAPHY_RELEASE, geography_manifest_sha256: GEOGRAPHY_MANIFEST_HASH,
      geometry_artifact_sha256: geometryDescriptor.sha256, created_at: contextManifest.created_at,
      state_denominator: { value: state.measures.nonemployer_establishments, raw_value: state.measures.nonemployer_establishments_raw, flag: state.measures.nonemployer_establishments_flag },
      national_denominator: { value: national.measures.nonemployer_establishments, raw_value: national.measures.nonemployer_establishments_raw, flag: national.measures.nonemployer_establishments_flag },
      counties: { type: 'FeatureCollection', features },
      limitations: ['Annual aggregate nonemployer establishment counts; not current-operation evidence.', 'Missing and flagged source values are not zero. True unflagged zero remains zero.', 'Counties outside the retained native universe are explicitly identified. Territories are excluded. No ZIP/ZCTA allocation.'],
    };
    if (Buffer.byteLength(JSON.stringify(response)) > config.max_response_bytes) fail('County heatmap response exceeded its size bound.');
    return response;
  }
  return Object.freeze({ get, close: async () => { closed = true; return { closed }; } });
}

export const CENSUS_NONEMPLOYER_INDUSTRIES = INDUSTRIES;
export const nonemployerCountyHeatmapView = createCensusNonemployerCountyHeatmapView();
