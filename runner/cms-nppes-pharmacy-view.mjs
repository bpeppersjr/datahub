import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { verifyCmsNppesCommunityRetailPharmacies } from './cms-nppes-community-retail-pharmacy.mjs';

const DEFAULT_POINTER = path.join(APP_ROOT, 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json');
const DEFAULT_GEOGRAPHY_POINTER = path.join(APP_ROOT, 'data/geography/current.json');
const LIMIT_MAX = 100;
const GEOGRAPHY_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEOGRAPHY_MANIFEST_SHA256 = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const GEOGRAPHY_POINTER_SHA256 = '5f89350482630a7d2e888772512aca36fdd21f68c8d3f01f1113dc6c2c400403';
const STATE_PAIRS = '01:AL 02:AK 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 15:HI 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY 22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM 36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT 51:VA 53:WA 54:WV 55:WI 56:WY 60:AS 66:GU 69:MP 72:PR 78:VI'.split(' ').map((value) => value.split(':'));
const FIPS_BY_STATE = new Map(STATE_PAIRS.map(([fips, state]) => [state, fips]));
const STATE_BY_FIPS = new Map(STATE_PAIRS);
const MAP_STATES = new Set(STATE_PAIRS.slice(0, 51).map(([, state]) => state));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

function queryValue(value, label, pattern) {
  if (value == null || value === '') return null;
  if (!pattern.test(value)) { const error = new Error(`${label} is invalid.`); error.statusCode = 400; throw error; }
  return value;
}

async function readGzipRecords(filename, rows) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) rows.push(JSON.parse(line));
}

function assertGeometry(value, label) {
  if (!value || !['Polygon', 'MultiPolygon'].includes(value.type) || !Array.isArray(value.coordinates) || !value.coordinates.length) throw new Error(`${label} has invalid governed polygon geometry.`);
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  for (const polygon of polygons) for (const ring of polygon) {
    if (!Array.isArray(ring) || ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) throw new Error(`${label} has an invalid closed ring.`);
    for (const point of ring) if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error(`${label} has an invalid coordinate.`);
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function loadJsonArtifact(directory, manifest, relativePath, expectedKind, maxBytes = 100_000_000, readFileImpl = readFile) {
  const artifact = (manifest.artifacts ?? []).find((item) => item.path === relativePath);
  if (!artifact || artifact.geography_type !== expectedKind || !integer(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > maxBytes || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error(`Governed geography artifact ${relativePath} is not declared exactly.`);
  const bytes = await readFileImpl(path.resolve(directory, relativePath));
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`Governed geography artifact ${relativePath} failed byte or SHA-256 verification.`);
  return { artifact, value: JSON.parse(bytes.toString('utf8')) };
}

async function loadJsonLinesArtifact(directory, manifest, relativePath, maxBytes = 30_000_000, readFileImpl = readFile) {
  const artifact = (manifest.artifacts ?? []).find((item) => item.path === relativePath);
  if (!artifact || artifact.artifact_type !== 'normalized-index' || !integer(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > maxBytes || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error(`Governed geography index ${relativePath} is not declared exactly.`);
  const bytes = await readFileImpl(path.resolve(directory, relativePath));
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`Governed geography index ${relativePath} failed byte or SHA-256 verification.`);
  return { artifact, rows: bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) };
}

async function loadGeometry({ geographyPointerPath, expectedRelease = GEOGRAPHY_RELEASE, expectedManifestSha256 = GEOGRAPHY_MANIFEST_SHA256, expectedPointerSha256 = GEOGRAPHY_POINTER_SHA256, readFileImpl = readFile }) {
  const pointerBuffer = await readFileImpl(geographyPointerPath);
  if (sha256(pointerBuffer) !== expectedPointerSha256) throw new Error('Governed Census geography pointer hash drifted.');
  const pointer = JSON.parse(pointerBuffer.toString('utf8'));
  if (pointer.dataset_id !== 'us-census-geography' || pointer.release_id !== expectedRelease) throw new Error('Pharmacy map is bound to a different Census geography release.');
  const manifestPath = path.resolve(path.dirname(geographyPointerPath), pointer.manifest);
  const manifestBuffer = await readFileImpl(manifestPath);
  if (sha256(manifestBuffer) !== expectedManifestSha256 || pointer.manifest_sha256 && pointer.manifest_sha256 !== sha256(manifestBuffer)) throw new Error('Governed Census geography manifest hash drifted.');
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (manifest.dataset_id !== 'us-census-geography' || manifest.release_id !== expectedRelease || manifest.status !== 'published' || manifest.complete_national_release !== true || manifest.coordinate_reference_system !== 'EPSG:4326') throw new Error('Governed Census geography release is not complete and published.');
  const directory = path.dirname(manifestPath);
  const [stateIndex, stateGeo] = await Promise.all([
    loadJsonLinesArtifact(directory, manifest, 'derived/index/states.jsonl', 30_000_000, readFileImpl),
    loadJsonArtifact(directory, manifest, 'source/states.geojson', 'state', 8_000_000, readFileImpl),
  ]);
  if (stateIndex.rows.length !== stateIndex.artifact.record_count || stateGeo.value.type !== 'FeatureCollection' || stateGeo.value.features.length !== stateGeo.artifact.feature_count) throw new Error('Governed state geometry counts do not reconcile.');
  const stateIndexByFips = new Map();
  for (const row of stateIndex.rows) {
    if (!STATE_BY_FIPS.has(row.geoid) || row.geo_id !== `state:${row.geoid}` || row.state_fips !== row.geoid || row.geometry_file !== 'source/states.geojson' || stateIndexByFips.has(row.geoid)) throw new Error('Governed state index identity failed closed.');
    stateIndexByFips.set(row.geoid, row);
  }
  const stateFeatures = new Map();
  for (const feature of stateGeo.value.features) {
    const fips = String(feature.properties?.GEOID ?? '');
    if (!stateIndexByFips.has(fips) || stateFeatures.has(fips) || feature.properties?.STUSAB !== STATE_BY_FIPS.get(fips)) throw new Error('Governed state polygon identity failed closed.');
    assertGeometry(feature.geometry, `State ${fips}`);
    stateFeatures.set(fips, { type: 'Feature', geometry: feature.geometry, properties: { geoid: fips, name: feature.properties.NAME, postal_abbreviation: feature.properties.STUSAB } });
  }
  const zctaIndex = await loadJsonLinesArtifact(directory, manifest, 'derived/index/zctas.jsonl', 30_000_000, readFileImpl);
  if (zctaIndex.rows.length !== zctaIndex.artifact.record_count) throw new Error('Governed ZCTA index count does not reconcile.');
  const zctaIndexByCode = new Map();
  for (const row of zctaIndex.rows) {
    if (!/^\d{5}$/.test(row.geoid ?? '') || row.geo_id !== `zcta:${row.geoid}` || row.zcta !== row.geoid || !/^source\/zctas\/prefix=\d\.geojson$/.test(row.geometry_file) || zctaIndexByCode.has(row.geoid)) throw new Error('Governed ZCTA index identity failed closed.');
    zctaIndexByCode.set(row.geoid, row);
  }
  const finalPointer = await readFileImpl(geographyPointerPath); const finalManifest = await readFileImpl(manifestPath);
  if (!finalPointer.equals(pointerBuffer) || !finalManifest.equals(manifestBuffer) || sha256(finalManifest) !== expectedManifestSha256) throw new Error('Governed Census geography changed while loading; response was withheld.');
  return { pointerBuffer, manifestBuffer, manifestPath, directory, manifest, expectedRelease, expectedManifestSha256, expectedPointerSha256, readFileImpl, pins: { pointer_sha256: sha256(pointerBuffer), manifest_sha256: sha256(manifestBuffer), release_id: manifest.release_id, state_index: { path: 'derived/index/states.jsonl', bytes: stateIndex.artifact.bytes, sha256: stateIndex.artifact.sha256 }, state_geometry: { path: 'source/states.geojson', bytes: stateGeo.artifact.bytes, sha256: stateGeo.artifact.sha256 }, zcta_index: { path: 'derived/index/zctas.jsonl', bytes: zctaIndex.artifact.bytes, sha256: zctaIndex.artifact.sha256 }, zcta_geometry: [] }, stateFeatures, zctaIndexByCode, zctaGeometryByState: new Map() };
}

async function loadZctaGeometry({ geography, geographyPointerPath, requiredZctas }) {
  const { readFileImpl } = geography;
  const pointerBuffer = await readFileImpl(geographyPointerPath);
  if (!pointerBuffer.equals(geography.pointerBuffer) || sha256(pointerBuffer) !== geography.expectedPointerSha256) throw new Error('Governed Census geography pointer changed before loading ZCTA geometry.');
  const manifestBuffer = await readFileImpl(geography.manifestPath);
  if (!manifestBuffer.equals(geography.manifestBuffer) || sha256(manifestBuffer) !== geography.expectedManifestSha256) throw new Error('Governed Census geography manifest changed before loading ZCTA geometry.');
  const prefixes = [...new Set([...requiredZctas].map((code) => code[0]))].sort();
  const zctaFeatures = new Map();
  const zctaGeometryPins = [];
  for (const prefix of prefixes) {
    const relativePath = `source/zctas/prefix=${prefix}.geojson`;
    const partition = await loadJsonArtifact(geography.directory, geography.manifest, relativePath, 'zcta', 45_000_000, readFileImpl);
    if (partition.value.type !== 'FeatureCollection' || partition.value.features.length !== partition.artifact.feature_count) throw new Error(`Governed ZCTA partition ${prefix} count does not reconcile.`);
    zctaGeometryPins.push({ path: partition.artifact.path, bytes: partition.artifact.bytes, sha256: partition.artifact.sha256 });
    for (const feature of partition.value.features) {
      const code = String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? '');
      if (!requiredZctas.has(code)) continue;
      const indexed = geography.zctaIndexByCode.get(code);
      if (!indexed || indexed.geometry_file !== relativePath || zctaFeatures.has(code)) throw new Error(`Governed ZCTA ${code} identity failed closed.`);
      assertGeometry(feature.geometry, `ZCTA ${code}`);
      zctaFeatures.set(code, { type: 'Feature', geometry: feature.geometry, properties: { geoid: code, name: feature.properties?.NAME ?? `ZCTA5 ${code}` } });
    }
  }
  for (const code of requiredZctas) if (!zctaFeatures.has(code)) throw new Error(`Governed ZCTA ${code} polygon is unavailable.`);
  const finalPointer = await readFileImpl(geographyPointerPath); const finalManifest = await readFileImpl(geography.manifestPath);
  if (!finalPointer.equals(pointerBuffer) || !finalManifest.equals(manifestBuffer) || !finalPointer.equals(geography.pointerBuffer) || !finalManifest.equals(geography.manifestBuffer)) throw new Error('Governed Census geography changed while loading ZCTA geometry; response was withheld.');
  return { zctaFeatures, zctaGeometryPins };
}

export function createCmsNppesPharmacyView({ pointerPath = DEFAULT_POINTER, geographyPointerPath = DEFAULT_GEOGRAPHY_POINTER, geographyRelease = GEOGRAPHY_RELEASE, geographyManifestSha256 = GEOGRAPHY_MANIFEST_SHA256, geographyPointerSha256 = GEOGRAPHY_POINTER_SHA256, readFileImpl = readFile } = {}) {
  let cached;
  async function load() {
    if (cached) return cached;
    cached = (async () => {
      const pointerBuffer = await readFileImpl(pointerPath); const pointer = JSON.parse(pointerBuffer.toString('utf8')); const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest); const manifestBuffer = await readFileImpl(manifestPath);
      if (pointer.manifest_sha256 && pointer.manifest_sha256 !== sha256(manifestBuffer)) throw new Error('Pharmacy pointer manifest hash drifted.');
      const manifest = JSON.parse(manifestBuffer.toString('utf8')); await verifyCmsNppesCommunityRetailPharmacies(pointerPath);
      const releaseDirectory = path.dirname(manifestPath); const stateArtifact = manifest.artifacts.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-state-aggregate-json'); const zipArtifact = manifest.artifacts.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl');
      const stateAggregate = JSON.parse(await readFileImpl(path.join(releaseDirectory, stateArtifact.path), 'utf8')); const zipAggregate = (await readFileImpl(path.join(releaseDirectory, zipArtifact.path), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); const rows = [];
      for (const artifact of manifest.artifacts.filter((item) => item.artifact_type === 'normalized-nppes-community-retail-pharmacy-jsonl-gzip')) await readGzipRecords(path.join(releaseDirectory, artifact.path), rows);
      const sourceManifestPath = path.resolve(APP_ROOT, manifest.dependencies.nppes_organizations_manifest.path); const sourceManifestBuffer = await readFileImpl(sourceManifestPath); if (sha256(sourceManifestBuffer) !== manifest.dependencies.nppes_organizations_manifest.sha256) throw new Error('NPPES source manifest hash drifted.'); const sourceManifest = JSON.parse(sourceManifestBuffer.toString('utf8')); const geoDependency = (sourceManifest.dependencies ?? []).find((item) => item.dataset_id === 'us-census-geography'); if (!geoDependency || geoDependency.release_id !== geographyRelease || geoDependency.manifest_sha256 !== geographyManifestSha256) throw new Error('NPPES source is bound to a different Census geography release.');
      const geography = await loadGeometry({ geographyPointerPath, expectedRelease: geographyRelease, expectedManifestSha256: geographyManifestSha256, expectedPointerSha256: geographyPointerSha256, readFileImpl });
      const byState = new Map([...MAP_STATES].map((state) => [state, { state, source_record_count: 0, exact_zcta_mapped_count: 0, nonpolygon_count: 0, unassigned_count: 0, zcta_codes: new Set() }])); const byZipState = new Map(); let territoryRows = 0; let unmatchedRows = 0;
      for (const row of rows) { const state = row.address?.state; const target = state ? byState.get(state) : null; if (!target) { if (state && !MAP_STATES.has(state)) territoryRows += 1; else unmatchedRows += 1; continue; } target.source_record_count += 1; if (row.geography?.zcta_match_status === '2020-zcta-polygon-available') { target.exact_zcta_mapped_count += 1; target.zcta_codes.add(row.geography.zcta_geoid); } else target.nonpolygon_count += 1; if (row.address?.zip_code) { const key = `${state}:${row.address.zip_code}`; const zip = byZipState.get(key) ?? { zip_code: row.address.zip_code, state, source_record_count: 0, exact_zcta_mapped_count: 0, nonpolygon_count: 0, unassigned_count: 0, zcta_geoid: null }; zip.source_record_count += 1; if (row.geography?.zcta_match_status === '2020-zcta-polygon-available') { zip.exact_zcta_mapped_count += 1; zip.zcta_geoid = row.geography.zcta_geoid; } else zip.nonpolygon_count += 1; byZipState.set(key, zip); } }
      const states = [...byState.values()].map((row) => ({ ...row, zcta_codes: [...row.zcta_codes].sort(), map_eligible: true })); const stateMedian = median(states.map((row) => row.source_record_count));
      const stateFeatures = states.map((row) => { const geometryFeature = geography.stateFeatures.get(FIPS_BY_STATE.get(row.state)); if (!geometryFeature) throw new Error(`Governed state geometry missing for ${row.state}.`); return { ...geometryFeature, properties: { ...geometryFeature.properties, level: 'state', state: row.state, name: geometryFeature.properties.name, source_record_count: row.source_record_count, exact_zcta_mapped_count: row.exact_zcta_mapped_count, nonpolygon_count: row.nonpolygon_count, unassigned_count: 0, relative_peer_median_percent: stateMedian ? row.source_record_count / stateMedian * 100 : null } }; });
      return { pointer, manifest, manifestPath, pointerBuffer, manifestBuffer, sourceManifestPath, sourceManifestBuffer, geographyPointerPath, rows, stateRows: stateAggregate.rows, zipRows: zipAggregate, geography, byState, byZipState, states, stateFeatures, stateMedian, territoryRows, unmatchedRows };
    })().catch((error) => { cached = undefined; throw error; }); return cached;
  }
  async function assertSnapshotStable(view) {
    const [pointerBuffer, manifestBuffer, sourceManifestBuffer, geographyPointerBuffer, geographyManifestBuffer] = await Promise.all([readFileImpl(pointerPath), readFileImpl(view.manifestPath), readFileImpl(view.sourceManifestPath), readFileImpl(geographyPointerPath), readFileImpl(view.geography.manifestPath)]);
    if (!pointerBuffer.equals(view.pointerBuffer) || !manifestBuffer.equals(view.manifestBuffer) || !sourceManifestBuffer.equals(view.sourceManifestBuffer) || !geographyPointerBuffer.equals(view.geography.pointerBuffer) || !geographyManifestBuffer.equals(view.geography.manifestBuffer)) throw new Error('Governed pharmacy or Census geography release changed; response was withheld.');
  }
  async function stateZctaGeometry(view, state, selectedState) {
    const cachedGeometry = view.geography.zctaGeometryByState.get(state);
    if (cachedGeometry) return cachedGeometry;
    const pending = loadZctaGeometry({ geography: view.geography, geographyPointerPath, requiredZctas: new Set(selectedState?.zcta_codes ?? []) }).catch((error) => { view.geography.zctaGeometryByState.delete(state); throw error; });
    view.geography.zctaGeometryByState.set(state, pending);
    return pending;
  }
  return {
    async get({ level = 'states', state, zip, query, limit = '25' } = {}) {
      if (!['states', 'zctas'].includes(level)) { const error = new Error('County view is unavailable: exact pharmacy-to-county assignment is not governed.'); error.statusCode = 400; throw error; }
      const safeState = queryValue(state, 'State', /^(?:[A-Z]{2})$/); const safeZip = queryValue(zip, 'ZIP5', /^\d{5}$/); const safeQuery = query == null ? null : String(query).trim(); if (safeQuery !== null && safeQuery.length > 100) { const error = new Error('Query must be 100 characters or fewer.'); error.statusCode = 400; throw error; }
      if (level === 'zctas' && !safeState) { const error = new Error('A governed state is required before loading ZCTA polygons.'); error.statusCode = 400; throw error; }
      if (safeState && !MAP_STATES.has(safeState)) { const error = new Error('State is outside the 50-state and D.C. map scope. Territories remain in the summary only.'); error.statusCode = 400; throw error; }
      if (safeZip && !safeState) { const error = new Error('A governed state is required before selecting a ZCTA.'); error.statusCode = 400; throw error; }
      const parsedLimit = limit == null || limit === '' ? 25 : Number(limit); if (!Number.isInteger(parsedLimit) || parsedLimit < 1) { const error = new Error('Limit must be a positive integer.'); error.statusCode = 400; throw error; } const safeLimit = Math.min(LIMIT_MAX, parsedLimit);
      const view = await load(); await assertSnapshotStable(view); const selectedState = safeState ? view.byState.get(safeState) : null; const zctaGeometry = level === 'zctas' ? await stateZctaGeometry(view, safeState, selectedState) : null; const featureRows = level === 'states' ? [] : (selectedState ? [...selectedState.zcta_codes].map((code) => ({ code, ...view.byZipState.get(`${safeState}:${code}`) })).filter((row) => row.source_record_count > 0) : []); const zctaMedian = median(featureRows.map((row) => row.source_record_count));
      const features = level === 'states' ? view.stateFeatures : featureRows.map((row) => { const geometryFeature = zctaGeometry.zctaFeatures.get(row.code); return { ...geometryFeature, properties: { ...geometryFeature.properties, level: 'zcta', state: safeState, source_record_count: row.source_record_count, exact_zcta_mapped_count: row.exact_zcta_mapped_count, nonpolygon_count: row.nonpolygon_count, unassigned_count: row.unassigned_count, relative_peer_median_percent: zctaMedian ? row.source_record_count / zctaMedian * 100 : null } }; });
      let matchingRows = []; if (safeZip) matchingRows = view.rows.filter((row) => row.address?.state === safeState && row.address?.zip_code === safeZip && (!safeQuery || `${row.legal_business_name ?? ''} ${row.other_organization_name ?? ''} ${row.npi ?? ''}`.toLocaleLowerCase('en-US').includes(safeQuery.toLocaleLowerCase('en-US'))));
      const selected = safeZip ? view.byZipState.get(`${safeState}:${safeZip}`) ?? { zip_code: safeZip, state: safeState, source_record_count: 0, exact_zcta_mapped_count: 0, nonpolygon_count: 0, unassigned_count: 0, zcta_geoid: null } : null;
      const stateRows = view.states.map((row) => { const copy = { ...row }; delete copy.zcta_codes; return copy; });
      const mapEligibleRows = [...view.byState.values()]; const mapEligibleSourceCount = mapEligibleRows.reduce((sum, row) => sum + row.source_record_count, 0); const mapEligibleExactCount = mapEligibleRows.reduce((sum, row) => sum + row.exact_zcta_mapped_count, 0); const mapEligibleNonpolygonCount = mapEligibleRows.reduce((sum, row) => sum + row.nonpolygon_count, 0); const geometryPins = level === 'zctas' ? { ...view.geography.pins, zcta_geometry: zctaGeometry.zctaGeometryPins } : view.geography.pins;
      return { schema_version: 'cms-nppes-community-retail-pharmacy-geo-view@1.0.0', mode: 'cms-nppes-community-retail-pharmacy', status: 'available', source: { dataset_id: view.manifest.dataset_id, release_id: view.manifest.release_id, source_release_id: view.manifest.source_release_id, source_through_date: view.manifest.source_through_date, observed_at: view.manifest.observed_at, retrieved_at: view.manifest.retrieved_at, pointer_sha256: sha256(view.pointerBuffer), manifest_sha256: sha256(view.manifestBuffer) }, geometry: { dataset_id: 'us-census-geography', release_id: view.geography.pins.release_id, manifest_sha256: view.geography.pins.manifest_sha256, pointer_sha256: view.geography.pins.pointer_sha256, vintage: '2020 Census ZCTA geometry', coordinate_reference_system: 'EPSG:4326', artifacts: geometryPins }, selection: { level, state: safeState, zip5: safeZip, query: safeQuery, limit: safeLimit }, coverage: { global_source_record_count: view.rows.length, map_eligible_state_dc_source_record_count: mapEligibleSourceCount, map_eligible_state_dc_exact_zcta_mapped_count: mapEligibleExactCount, map_eligible_state_dc_nonpolygon_count: mapEligibleNonpolygonCount, global_exact_zcta_mapped_count: view.manifest.coverage.exact_zcta_membership_rows, global_nonpolygon_count: view.manifest.coverage.nonpolygon_zip_rows, global_unassigned_count: view.manifest.coverage.unmatched_geography_rows, territory_source_record_count: view.territoryRows, map_state_count: 51, map_eligible_states: 51, county_view: 'unavailable-no-governed-exact-assignment' }, territory_rows: view.territoryRows, unmatched_rows: view.unmatchedRows, temporal: { source_release_id: view.manifest.source_release_id, source_through_date: view.manifest.source_through_date, observed_at: view.manifest.observed_at, retrieved_at: view.manifest.retrieved_at }, states: stateRows, territories: view.stateRows.filter((row) => !MAP_STATES.has(row.state)), unassigned: view.unmatchedRows, selected: selected ? { ...selected, relative_peer_median_percent: zctaMedian && selected.source_record_count ? selected.source_record_count / zctaMedian * 100 : null, peer_scope: `positive exact-ZCTA pharmacy source-record peers in ${safeState}` } : null, features, names: matchingRows.slice(0, safeLimit).map((row) => ({ npi: row.npi, legal_business_name: row.legal_business_name, other_organization_name: row.other_organization_name, address: row.address, mail_order_taxonomy_assertions: row.mail_order_taxonomy_assertions, geography: row.geography, temporal: row.temporal })), names_total: matchingRows.length, names_truncated: matchingRows.length > safeLimit, claims: view.manifest.claims, limitations: [...view.manifest.limitations, 'Map colors count retained NPPES source records, not verified current businesses or physical sites.', 'Relative percentages compare only the same map level and positive source-record peers; they are not completeness percentages.', 'County view is unavailable because no exact governed pharmacy-to-county assignment exists.'] };
    },
    close() { cached = undefined; return { closed: true }; },
  };
}

export const cmsNppesPharmacyView = createCmsNppesPharmacyView();
