import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { APP_ROOT } from './paths.mjs';
import { normalizeBusinessLocationProfile, registryProfileCompatibilityBinding } from './business-location-profile-contract.mjs';
import { createCountySpatialIndex, assignPointToCounty } from './national-business-coverage-views.mjs';

export const BUSINESS_ENTITY_GEOGRAPHY_VERSION = 'business-entity-geography-relationship@1.0.0';
const DATASET = 'business-entity-geography-relationship';
const REGISTRY_RELEASE = 'national-business-registry-20260911-022652067Z-1ec656c3';
const REGISTRY_SHA = 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76';
const GEO_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEO_SHA = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const CROSSWALK_RELEASE = 'us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8';
const CROSSWALK_SHA = '02e19bd98ad587426628cd50013942acc0cc3e9c9a48ac653eaf96cf534b8fe2';
const GAP_RELEASE = 'zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb';
const GAP_SHA = '792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea';
const ZIP_QUALITY_RELEASE = 'registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430';
const ZIP_QUALITY_SHA = '1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c';
const COVERAGE_RELEASE = 'national-business-coverage-views-20260911-040908332Z-f01c882a';
const COVERAGE_SHA = 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6';
const SELECTED_RELEASE_ID = 'business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7';
const SELECTED_MANIFEST_SHA256 = '07e561938b2d027f0c1586e5db1a2b775f7680d486e75dfb4e99b399cc0bbaa2';
const EXPECTED = Object.freeze({ profiles: 8011835, same: 7963395, outside: 48439, placeholder: 1, missing: 0, assigned: 995293, notAssigned: 7016542 });
const SHA = /^[a-f0-9]{64}$/;
const LEGACY_ADDRESS_EXTRA_KEYS = new Set(['country', 'state_county_fips', 'county_fips', 'address_role', 'reported_county_code', 'country_source', 'independently_verified', 'postal_code_status', 'site_inference_eligible', 'site_inference_reason', 'source_scope', 'state_semantics', 'postal_code_source', 'unit', 'address_line', 'source_premise_in_dc', 'source_value', 'validation_status', 'street_2', 'street_3', 'street_number', 'street_name', 'address_line_2', 'address_line_3', 'county_source', 'zip_coverage_eligible']);
const LEGACY_POINT_UNVERIFIED_KEYS = new Set(['coordinates', 'type']);
const LEGACY_POINT_UNVERIFIED_WITH_QUALIFIERS = new Set(['coordinate_scope', 'coordinates', 'plausibility', 'type']);
const LEGACY_POINT_SCOPES = new Set(['source-geocoded-reported-business-location-not-independently-verified', 'source-geocoded-reported-business-address-not-verified-physical-operating-site', 'portal-geocoded-reported-license-address-not-independently-verified']);
const LEGACY_POINT_PLAUSIBILITY = new Set(['not-independently-validated', 'in-city-council-district-coordinate-outside-broad-los-angeles-bounds', 'outside-broad-nyc-bounds-or-offsite-license', 'within-broad-chicago-bounds-not-independently-validated', 'outside-broad-chicago-bounds-or-offsite-license', 'within-broad-delaware-bounds', 'reported-de-address-coordinate-outside-broad-delaware-bounds', 'reported-pa-address-coordinate-outside-broad-pa-bounds', 'within-broad-nyc-bounds-not-independently-validated']);
const LEGACY_NONPREMISE_POINT_KEYS = new Set(['independently_verified', 'latitude', 'longitude', 'precision', 'premise_coordinate_claim_permitted']);
const DC_TRANSFORMED_POINT_KEYS = new Set(['coordinates', 'coordinate_scope', 'independently_verified', 'output_crs', 'plausibility', 'source_coordinate', 'source_crs', 'transformation', 'type']);
const MAX_REGISTRY_PROFILE_LINE_BYTES = 262_144;
const check = (value, message = 'Business entity geography relationship contract rejected.') => { if (!value) throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(canonical(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const safeRelative = value => typeof value === 'string' && value.length && !path.isAbsolute(value) && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');

export function normalizeRetainedGeographyProfile(raw, registryManifest, registryManifestSha256) {
  check(raw && raw.profile_version === 'business-location-match-profile@1.0.0' && registryManifest.release_id === REGISTRY_RELEASE
    && registryManifestSha256 === REGISTRY_SHA && raw.address && typeof raw.address === 'object' && !Array.isArray(raw.address));
  const addressKeys = Object.keys(raw.address);
  check(addressKeys.every(key => ['street', 'unit_or_additional', 'city', 'state', 'zip_code', 'postal_code', 'zip4', 'county_name'].includes(key) || LEGACY_ADDRESS_EXTRA_KEYS.has(key)));
  check(raw.address.zip_code === raw.zip_code && raw.address.postal_code === raw.zip_code && /^\d{5}$/.test(raw.zip_code ?? '')
    && (raw.address.zip4 === null || /^\d{4}$/.test(raw.address.zip4 ?? ''))
    && (raw.address.state === null || typeof raw.address.state === 'string'));
  const projectedAddress = { street: raw.address.street ?? null, unit_or_additional: raw.address.unit_or_additional ?? null,
    city: raw.address.city ?? null, state: raw.address.state ?? null, zip_code: raw.address.zip_code, postal_code: raw.address.postal_code,
    zip4: raw.address.zip4 ?? null, county_name: raw.address.county_name ?? null };
  let input = { ...raw, address: projectedAddress }, pointInputStatus = 'source-geocode-retained';
  if (raw.location && raw.source?.source_id === 'dc-dlcp-active-basic-business-licenses'
    && raw.source.transformation_version === 'dc-basic-business-licenses@1.0.1'
    && Object.keys(raw.location).sort().join(',') === [...DC_TRANSFORMED_POINT_KEYS].sort().join(',')) {
    check(raw.location.type === 'Point' && raw.location.output_crs === 'EPSG:4326' && raw.location.source_crs === 'EPSG:26985'
      && raw.location.transformation === 'proj4@2.22.0' && raw.location.coordinate_scope === 'dc-master-address-repository-geocode-not-independently-verified-current-occupancy'
      && raw.location.independently_verified === false && ['within-broad-dc-bounds', 'outside-broad-dc-bounds'].includes(raw.location.plausibility)
      && Array.isArray(raw.location.coordinates) && raw.location.coordinates.length === 2 && raw.location.coordinates.every(Number.isFinite)
      && raw.location.source_coordinate && Object.keys(raw.location.source_coordinate).sort().join(',') === 'x,y'
      && Number.isFinite(raw.location.source_coordinate.x) && Number.isFinite(raw.location.source_coordinate.y),
    'DC coordinate transformation differs from the exact retained point adapter.');
    input = { ...input, location: { type: 'Point', coordinates: raw.location.coordinates, coordinate_reference_system: 'EPSG:4326' } };
  } else if (raw.location && raw.location.type === 'Point' && raw.location.coordinates === null
    && Object.keys(raw.location).sort().join(',') === 'coordinate_scope,coordinates,plausibility,type'
    && raw.location.coordinate_scope === 'conflicting-source-geocodes-suppressed' && raw.location.plausibility === 'not-used-for-spatial-assignment') {
    input = { ...input, location: null }; pointInputStatus = 'conflicting-source-geocodes-suppressed';
  } else if (raw.location && Object.keys(raw.location).sort().join(',') === [...LEGACY_NONPREMISE_POINT_KEYS].sort().join(',')) {
    check(Number.isFinite(raw.location.latitude) && Number.isFinite(raw.location.longitude) && raw.location.independently_verified === false
      && raw.location.precision === 'open-data-platform-generated-address-component-centroid' && raw.location.premise_coordinate_claim_permitted === false,
    'Legacy coordinate is not a verified premise point; unknown shape or semantics fail closed.');
    input = { ...input, location: null }; pointInputStatus = 'unassignable-coordinate-not-premise-point';
  } else if (raw.location && Object.keys(raw.location).sort().join(',') === 'latitude,longitude') {
    check(Number.isFinite(raw.location.latitude) && Math.abs(raw.location.latitude) <= 90
      && Number.isFinite(raw.location.longitude) && Math.abs(raw.location.longitude) <= 180,
    'Legacy latitude/longitude coordinate is malformed.');
    input = { ...input, location: null }; pointInputStatus = 'unassignable-legacy-coordinate-crs-unproven';
  } else if (raw.location && raw.location.type === 'Point' && Array.isArray(raw.location.coordinates)
    && ([...LEGACY_POINT_UNVERIFIED_KEYS].sort().join(',') === Object.keys(raw.location).sort().join(',')
      || [...LEGACY_POINT_UNVERIFIED_WITH_QUALIFIERS].sort().join(',') === Object.keys(raw.location).sort().join(','))) {
    check(raw.location.coordinates.length === 2 && raw.location.coordinates.every(Number.isFinite),
      'Legacy point without CRS is malformed; no coordinate order/CRS inference is allowed.');
    if (Object.hasOwn(raw.location, 'coordinate_scope')) check(LEGACY_POINT_SCOPES.has(raw.location.coordinate_scope) && LEGACY_POINT_PLAUSIBILITY.has(raw.location.plausibility));
    input = { ...input, location: null }; pointInputStatus = 'unassignable-legacy-coordinate-crs-unproven';
  }
  if (raw.location && input.location === raw.location) check(raw.location.type === 'Point'
    && Object.keys(raw.location).sort().join(',') === 'coordinate_reference_system,coordinates,type'
    && raw.location.coordinate_reference_system === 'EPSG:4326',
  'Legacy coordinate lacks the exact governed CRS declaration.');
  const normalized = normalizeBusinessLocationProfile(input, registryProfileCompatibilityBinding(registryManifest, registryManifestSha256));
  return { ...normalized, _geography_point_status: pointInputStatus };
}

export function classifyEntityGeographyRelationship({ profile, zctaCodes, countyIndex, stateFipsByAbbreviation, zipAuditClass }) {
  check(profile && /^location-profile:[a-f0-9]{32}$/.test(profile.profile_id ?? '') && /^\d{5}$/.test(profile.zip_code ?? ''));
  const zip = profile.zip_code;
  const postal_class = zip === '00000' ? 'explicit-placeholder' : zctaCodes.has(zip) ? 'same-code-zcta-candidate' : 'outside-zcta';
  const expectedAuditClass = postal_class === 'same-code-zcta-candidate' ? 'same-code-census-zcta'
    : postal_class === 'explicit-placeholder' ? 'explicit-placeholder' : 'source-contributed-outside-zcta';
  check(zipAuditClass === expectedAuditClass, 'Postal relationship differs from the retained ZIP denominator audit.');
  const sourceReportedState = profile.address?.state ?? null;
  const geocode = profile.geocode;
  let point_assignment;
  if (profile._geography_point_status === 'unassignable-legacy-coordinate-crs-unproven') {
    point_assignment = { status: 'unassignable-legacy-coordinate-crs-unproven', county_geoid: null, state_fips: null, zcta_geoid: null, reported_state_relationship: 'not-assessed' };
  } else if (profile._geography_point_status === 'unassignable-coordinate-not-premise-point') {
    point_assignment = { status: 'unassignable-coordinate-not-premise-point', county_geoid: null, state_fips: null, zcta_geoid: null, reported_state_relationship: 'not-assessed' };
  } else if (profile._geography_point_status === 'conflicting-source-geocodes-suppressed') {
    point_assignment = { status: 'conflict', county_geoid: null, state_fips: null, zcta_geoid: null, reported_state_relationship: 'not-assessed' };
  } else if (geocode === null || (geocode?.latitude === null && geocode?.longitude === null)) {
    point_assignment = { status: 'missing-geocode', county_geoid: null, state_fips: null, zcta_geoid: null, reported_state_relationship: 'not-assessed' };
  } else {
    const assignment = assignPointToCounty([geocode.longitude, geocode.latitude], countyIndex);
    if (assignment.status === 'assigned-single-county') {
      const stateFips = assignment.county.stateFips;
      const reportedStateFips = sourceReportedState ? stateFipsByAbbreviation?.get?.(sourceReportedState) : null;
      point_assignment = {
        status: 'assigned-single-county', county_geoid: assignment.county.geoid, state_fips: stateFips, zcta_geoid: null,
        reported_state_relationship: reportedStateFips === null ? 'unresolved-reported-state' : reportedStateFips === stateFips ? 'agrees' : 'conflicts',
      };
    } else {
      const status = assignment.status === 'coordinate-not-in-county-polygon' ? 'unmatched' : assignment.status === 'ambiguous-county-boundary' ? 'ambiguous' : 'invalid-coordinate';
      point_assignment = { status, county_geoid: null, state_fips: null, zcta_geoid: null, reported_state_relationship: 'not-assessed' };
    }
  }
  return {
    schema_version: 'business-entity-geography-relationship-row@1.0.0', profile_id: profile.profile_id,
    source: { source_id: profile.source.source_id, source_release_id: profile.source.source_release_id,
      source_record_lineage_sha256: sha(stable(profile.source.source_record_ids ?? [profile.source.source_record_id])),
      transformation_version: profile.source.transformation_version ?? null, policy_id: profile.source.policy_id ?? null,
      observed_at: profile.observed_at ?? null, export_policy: profile.export_policy ?? null },
    postal: { zip_code: zip, zip4: profile.address.zip4 ?? null, classification: postal_class, usps_operational_assignment: null, usps_deliverability: null },
    source_reported_state: sourceReportedState,
    code_correspondence: { status: postal_class === 'same-code-zcta-candidate' ? 'same-code-census-zcta-candidate' : postal_class === 'explicit-placeholder' ? 'not-applicable-placeholder' : 'no-same-code-zcta', zcta_geoid: postal_class === 'same-code-zcta-candidate' ? zip : null, membership: false },
    point_assignment,
    claims: { current_operation_verified: false, postal_validity_verified: false, entity_polygon_present: false, zip_to_state_inferred: false, zip_to_county_inferred: false },
  };
}

async function boundedJson(file, max = 5_000_000) {
  const stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= max, `Input is not a bounded single-link file: ${file}`);
  const bytes = await readFile(file); check(bytes.length === stat.size);
  return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), bytes, sha256: sha(bytes) };
}
async function jsonLines(file, descriptor, visitor, { gzip = false, signal } = {}) {
  check(descriptor && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= 1_000_000_000 && Number.isSafeInteger(descriptor.record_count) && SHA.test(descriptor.sha256 ?? ''));
  const input = createReadStream(file), hash = createHash('sha256'); let bytes = 0, count = 0, decoded = input;
  input.on('data', chunk => { bytes += chunk.length; if (bytes > descriptor.bytes) input.destroy(new Error('Input artifact exceeded declared bytes.')); hash.update(chunk); });
  if (gzip) { const gunzip = createGunzip(); input.on('error', e => gunzip.destroy(e)); decoded = input.pipe(gunzip); }
  const lines = createInterface({ input: decoded, crlfDelay: Infinity });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; count++; check(count <= descriptor.record_count && Buffer.byteLength(line) <= 16_000); await visitor(JSON.parse(line)); } }
  finally { lines.close(); input.destroy(); if (decoded !== input) decoded.destroy(); }
  check(bytes === descriptor.bytes && hash.digest('hex') === descriptor.sha256 && count === descriptor.record_count, `Input artifact integrity mismatch: ${descriptor.path}`);
  return count;
}

async function* readGzipRows(file, descriptor, signal) {
  const source = createReadStream(file), hash = createHash('sha256'); let bytes = 0, count = 0;
  source.on('data', chunk => { bytes += chunk.length; if (bytes > descriptor.bytes) source.destroy(new Error('Output artifact exceeded declared bytes.')); hash.update(chunk); });
  const gunzip = createGunzip(); source.on('error', error => gunzip.destroy(error)); const lines = createInterface({ input: source.pipe(gunzip), crlfDelay: Infinity });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; check(Buffer.byteLength(line) <= 16_000); count++; check(count <= descriptor.record_count); yield JSON.parse(line); } }
  finally { lines.close(); source.destroy(); gunzip.destroy(); }
  check(bytes === descriptor.bytes && hash.digest('hex') === descriptor.sha256 && count === descriptor.record_count, `Output artifact integrity mismatch: ${descriptor.path}`);
}

async function readInputs(root, signal) {
  const load = async rel => boundedJson(path.join(root, rel));
  const registryCatalog = (await load('config/datasets/national-business-registry.json')).value;
  const registryMeta = registryCatalog.current_release; check(registryMeta.release_id === REGISTRY_RELEASE && registryMeta.manifest_sha256 === REGISTRY_SHA && safeRelative(registryMeta.manifest));
  const registryPath = path.join(root, registryMeta.manifest), registryRead = await boundedJson(registryPath, 4_000_000), registry = registryRead.value;
  check(registryRead.sha256 === REGISTRY_SHA && registry.release_id === REGISTRY_RELEASE && registry.coverage.resolution_location_profiles === EXPECTED.profiles);
  const profiles = registry.artifacts.filter(a => a.artifact_type === 'entity-resolution-location-profile-jsonl-gzip');
  check(profiles.length === 100 && profiles.reduce((n, a) => n + a.record_count, 0) === EXPECTED.profiles);
  const geographyConfig = (await load('config/datasets/us-census-geography.json')).value;
  const geoPointer = await load('data/geography/current.json'), geoManifestPath = path.join(root, 'data/geography', geoPointer.value.manifest);
  const geoRead = await boundedJson(geoManifestPath, 8_000_000), geo = geoRead.value;
  check(geoPointer.value.release_id === GEO_RELEASE && geoRead.sha256 === GEO_SHA && geo.release_id === GEO_RELEASE && geographyConfig.dataset_id === 'us-census-geography');
  const crosswalkConfig = (await load('config/datasets/us-census-zcta-jurisdiction-crosswalk.json')).value;
  const crosswalkPointer = await load('data/zcta-jurisdiction-crosswalk/current.json'), crosswalkRead = await boundedJson(path.join(root, 'data/zcta-jurisdiction-crosswalk', crosswalkPointer.value.manifest), 5_000_000), crosswalk = crosswalkRead.value;
  check(crosswalkPointer.value.release_id === CROSSWALK_RELEASE && crosswalkConfig.current_verified_release.release_id === CROSSWALK_RELEASE && crosswalkRead.sha256 === CROSSWALK_SHA && crosswalk.release_id === CROSSWALK_RELEASE);
  const coverageConfig = (await load('config/datasets/national-business-coverage-views.json')).value;
  const coverageMeta = coverageConfig.current_verified_release, coverageRead = await boundedJson(path.join(root, coverageMeta.manifest), 10_000_000), coverage = coverageRead.value;
  check(coverageMeta.release_id === COVERAGE_RELEASE && coverageRead.sha256 === COVERAGE_SHA && coverage.release_id === COVERAGE_RELEASE);
  const profileSummaryArtifact = coverage.artifacts.find(a => a.path === 'derived/profile-geography-summary.json');
  const profileSummaryPath = path.join(root, 'data/business-coverage-views/releases', COVERAGE_RELEASE, profileSummaryArtifact.path);
  const summaryRead = await boundedJson(profileSummaryPath, 100_000);
  check(summaryRead.sha256 === profileSummaryArtifact.sha256);
  const gapReg = (await load('config/datasets/zip-denominator-gap-cohort.json')).value.retained_release;
  check(gapReg.release_id === GAP_RELEASE && gapReg.manifest_sha256 === GAP_SHA);
  const gapRead = await boundedJson(path.join(root, gapReg.manifest), 1_000_000), gap = gapRead.value;
  check(gapRead.sha256 === GAP_SHA && gap.release_id === GAP_RELEASE);
  const gapRowsArtifact = gap.artifacts.find(a => a.path === 'cohort.jsonl'); check(gapRowsArtifact?.sha256 === gapReg.cohort_sha256);
  const zctaDecl = geo.artifacts.find(a => a.path === 'derived/index/zctas.jsonl'), countyDecl = geo.artifacts.filter(a => /^source\/counties\/state=\d{2}\.geojson$/.test(a.path));
  const statesDecl = geo.artifacts.find(a => a.path === 'derived/index/states.jsonl');
  const countyIndexDecl = geo.artifacts.find(a => a.path === 'derived/index/counties.jsonl');
  check(zctaDecl && countyDecl.length === 56 && countyIndexDecl && statesDecl && crosswalk.artifacts.length === 4);
  const zipQualityConfig = (await load('config/datasets/registry-zip-quality-index.json')).value, qualityReg = zipQualityConfig.retained_release;
  check(qualityReg.release_id === ZIP_QUALITY_RELEASE && qualityReg.manifest_sha256 === ZIP_QUALITY_SHA);
  const qualityManifest = (await boundedJson(path.join(root, qualityReg.manifest), 2_000_000)).value;
  check(qualityManifest.release_id === ZIP_QUALITY_RELEASE && qualityManifest.artifacts.length === 100
    && sha(JSON.stringify(qualityManifest.artifacts)) === qualityReg.artifact_inventory_sha256);
  const registryRoot = path.dirname(registryPath), geoRoot = path.dirname(geoManifestPath), crosswalkRoot = path.dirname(path.join(root, 'data/zcta-jurisdiction-crosswalk', crosswalkPointer.value.manifest));
  const coverageRoot = path.dirname(path.join(root, coverageMeta.manifest));
  const algorithmFiles = ['runner/business-location-profile-contract.mjs', 'runner/national-business-coverage-views.mjs', 'runner/dc-basic-business-licenses.mjs'];
  const algorithmPins = {};
  for (const relative of algorithmFiles) { const file = path.join(root, relative), bytes = await readFile(file); check(bytes.length <= 1_000_000); algorithmPins[relative] = sha(bytes); }
  for (const artifact of crosswalk.artifacts) {
    const actual = await hashFile(path.join(crosswalkRoot, artifact.path));
    const stat = await lstat(path.join(crosswalkRoot, artifact.path));
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === artifact.bytes && actual === artifact.sha256, `Crosswalk evidence tampered: ${artifact.path}`);
  }
  for (const artifact of qualityManifest.artifacts) {
    const actual = await hashFile(path.join(root, 'data/registry-zip-quality-index/releases', ZIP_QUALITY_RELEASE, artifact.path));
    const stat = await lstat(path.join(root, 'data/registry-zip-quality-index/releases', ZIP_QUALITY_RELEASE, artifact.path));
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === artifact.bytes && actual === artifact.sha256, `ZIP quality evidence tampered: ${artifact.path}`);
  }
  const zctaRows = new Map();
  await jsonLines(path.join(geoRoot, zctaDecl.path), zctaDecl, row => { check(/^\d{5}$/.test(row.geoid ?? '') && !zctaRows.has(row.geoid)); zctaRows.set(row.geoid, row); }, { signal });
  const stateFipsByAbbreviation = new Map();
  await jsonLines(path.join(geoRoot, statesDecl.path), statesDecl, row => { check(/^[A-Z]{2}$/.test(row.postal_abbreviation ?? '') && /^\d{2}$/.test(row.state_fips ?? '') && !stateFipsByAbbreviation.has(row.postal_abbreviation)); stateFipsByAbbreviation.set(row.postal_abbreviation, row.state_fips); }, { signal });
  const countyIndexRows = [];
  await jsonLines(path.join(geoRoot, countyIndexDecl.path), countyIndexDecl, row => countyIndexRows.push(row), { signal });
  const countyFeatures = [];
  for (const descriptor of countyDecl) {
    const featurePath = path.join(geoRoot, descriptor.path), actual = await hashFile(featurePath), stat = await lstat(featurePath);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === descriptor.bytes && actual === descriptor.sha256, `County geography tampered: ${descriptor.path}`);
    const { value } = await boundedJson(featurePath, descriptor.bytes + 1);
    check(value.type === 'FeatureCollection' && Array.isArray(value.features)); countyFeatures.push(...value.features);
  }
  check(countyFeatures.length === 3235 && countyIndexRows.length === 3235 && zctaRows.size === 33791);
  const countyIndex = createCountySpatialIndex(countyFeatures, countyIndexRows);
  const zipClasses = new Map();
  await jsonLines(path.join(root, 'data/zip-denominator-gap-cohort/releases', GAP_RELEASE, gapRowsArtifact.path), gapRowsArtifact, row => {
    check(/^\d{5}$/.test(row.zip5 ?? '') && !zipClasses.has(row.zip5));
    zipClasses.set(row.zip5, row.classification);
  }, { signal });
  check(zipClasses.size === 48194);
  return {
    registry, registryMeta, registryRead, profiles, registryRoot, geo, geoRead, geoRoot,
    crosswalk, crosswalkRead, crosswalkRoot, coverage, coverageRead, coverageRoot, profileSummaryArtifact, summaryRead,
    zctaDecl, countyDecl, countyIndexDecl, statesDecl, stateFipsByAbbreviation, zctaRows, countyIndexRows, countyIndex, zipClasses,
    gap, gapReg, gapRowsArtifact, qualityReg, qualityManifest,
    pins: {
      registry: { dataset_id: 'national-business-registry', release_id: REGISTRY_RELEASE, manifest_sha256: REGISTRY_SHA, profile_artifact_inventory_sha256: sha(JSON.stringify(profiles)) },
      geography: { release_id: GEO_RELEASE, manifest_sha256: GEO_SHA, zcta_index_sha256: zctaDecl.sha256, state_index_sha256: statesDecl.sha256, county_index_sha256: countyIndexDecl.sha256, county_geometry_inventory_sha256: sha(JSON.stringify(countyDecl.map(a => ({ path: a.path, sha256: a.sha256, bytes: a.bytes })))) },
      crosswalk: { release_id: CROSSWALK_RELEASE, manifest_sha256: CROSSWALK_SHA, artifact_inventory_sha256: sha(JSON.stringify(crosswalk.artifacts)) },
      zip_quality: { release_id: ZIP_QUALITY_RELEASE, manifest_sha256: ZIP_QUALITY_SHA, artifact_inventory_sha256: qualityReg.artifact_inventory_sha256 },
      zip_audit: { release_id: GAP_RELEASE, manifest_sha256: GAP_SHA, cohort_sha256: gapRowsArtifact.sha256 },
      point_assignment: { release_id: COVERAGE_RELEASE, manifest_sha256: COVERAGE_SHA, summary_sha256: profileSummaryArtifact.sha256, summary_artifact_sha256: summaryRead.sha256 },
      assignment_algorithms: algorithmPins,
    },
  };
}

export async function inspectBusinessEntityGeographyRelationshipInputs({ root = APP_ROOT, signal } = {}) {
  const input = await readInputs(path.resolve(root), signal);
  return { inputs_verified: true, pins: input.pins, source_partitions: input.profiles.length, source_profiles: input.profiles.reduce((n, item) => n + item.record_count, 0), zcta_count: input.zctaRows.size, county_count: input.countyIndexRows.length, audited_zip_count: input.zipClasses.size };
}

export async function loadReportingSiteGeographyContext({ root = APP_ROOT, signal } = {}) {
  const input = await readInputs(path.resolve(root), signal);
  return {
    zctaCodes: new Set(input.zctaRows.keys()), countyIndex: input.countyIndex,
    stateFipsByAbbreviation: input.stateFipsByAbbreviation, zipClasses: input.zipClasses,
    pins: input.pins,
  };
}

function emptyCounts() { return { profiles: 0, postal: { 'same-code-zcta-candidate': 0, 'outside-zcta': 0, 'explicit-placeholder': 0, missing: 0 }, point: { 'assigned-single-county': 0, unmatched: 0, ambiguous: 0, conflict: 0, 'missing-geocode': 0, 'invalid-coordinate': 0, 'unassignable-legacy-coordinate-crs-unproven': 0, 'unassignable-coordinate-not-premise-point': 0 }, reported_state_conflict: 0, source_counts: {}, state_point_counts: {}, county_point_counts: {}, state_point_source_counts: {}, county_point_source_counts: {} }; }
function addCounts(c, row) {
  c.profiles++; c.postal[row.postal.classification]++;
  c.point[row.point_assignment.status]++;
  if (row.point_assignment.reported_state_relationship === 'conflicts') c.reported_state_conflict++;
  const source = row.source.source_id; c.source_counts[source] = (c.source_counts[source] ?? 0) + 1;
  if (row.point_assignment.status === 'assigned-single-county') {
    const county = row.point_assignment.county_geoid, state = row.point_assignment.state_fips;
    c.county_point_counts[county] = (c.county_point_counts[county] ?? 0) + 1; c.state_point_counts[state] = (c.state_point_counts[state] ?? 0) + 1;
    for (const [table, key] of [[c.county_point_source_counts, county], [c.state_point_source_counts, state]]) {
      table[key] ??= {}; table[key][source] = (table[key][source] ?? 0) + 1;
    }
  }
}
async function* readProfileLines(file, artifact, input, signal) {
  const source = createReadStream(file), hash = createHash('sha256'); let bytes = 0, count = 0;
  source.on('data', chunk => { bytes += chunk.length; if (bytes > artifact.bytes) source.destroy(new Error('Profile input byte ceiling exceeded.')); hash.update(chunk); });
  const gunzip = createGunzip(); source.on('error', e => gunzip.destroy(e)); const lines = createInterface({ input: source.pipe(gunzip), crlfDelay: Infinity });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; const lineBytes = Buffer.byteLength(line); check(lineBytes <= MAX_REGISTRY_PROFILE_LINE_BYTES, `Registry profile line exceeds ${MAX_REGISTRY_PROFILE_LINE_BYTES} bytes at ${artifact.path} row ${count + 1}: ${lineBytes}`); count++; try { yield normalizeRetainedGeographyProfile(JSON.parse(line), input.registry, input.registryRead.sha256); } catch (error) { throw new Error(`Registry profile normalization failed at ${artifact.path} row ${count}: ${error.message}`, { cause: error }); } } }
  finally { lines.close(); source.destroy(); gunzip.destroy(); }
  check(bytes === artifact.bytes && hash.digest('hex') === artifact.sha256 && count === artifact.record_count, `Registry profile artifact integrity mismatch: ${artifact.path}`);
}

async function writer(file, signal) {
  const output = createWriteStream(file, { flags: 'wx' }), gzip = createGzip({ level: 6 }); gzip.pipe(output); const hash = createHash('sha256'); let bytes = 0, records = 0;
  return { async append(value) { signal?.throwIfAborted(); const chunk = Buffer.from(`${JSON.stringify(value)}\n`); hash.update(chunk); bytes += chunk.length; records++; if (!gzip.write(chunk)) await once(gzip, 'drain'); }, async close() { gzip.end(); await finished(output); const stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1); return { bytes: stat.size, uncompressed_bytes: bytes, record_count: records, sha256: await hashFile(file), uncompressed_sha256: hash.digest('hex') }; }, async abort() { gzip.destroy(); output.destroy(); await finished(output).catch(() => {}); } };
}
async function hashFile(file) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }

function expectedSummary(input, counts, artifacts) {
  check(counts.profiles === EXPECTED.profiles && counts.postal['same-code-zcta-candidate'] === EXPECTED.same && counts.postal['outside-zcta'] === EXPECTED.outside && counts.postal['explicit-placeholder'] === EXPECTED.placeholder && counts.postal.missing === EXPECTED.missing,
    `Profile postal relationship conservation differs from the retained audit: ${JSON.stringify({ profiles: counts.profiles, postal: counts.postal })}`);
  check(Object.values(counts.point).reduce((sum, count) => sum + count, 0) === EXPECTED.profiles,
    `Profile point assignment conservation differs from the exact profile cohort: ${JSON.stringify({ profiles: counts.profiles, point: counts.point })}`);
  const sortNested = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, typeof entry === 'object' ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry]));
  const summary = { ...counts, source_counts: sortNested(counts.source_counts), state_point_counts: sortNested(counts.state_point_counts), county_point_counts: sortNested(counts.county_point_counts), state_point_source_counts: sortNested(counts.state_point_source_counts), county_point_source_counts: sortNested(counts.county_point_source_counts) };
  return { summary, artifacts };
}

export async function buildBusinessEntityGeographyRelationship({ root = APP_ROOT, signal, logger = () => {} } = {}) {
  root = path.resolve(root); signal?.throwIfAborted(); const input = await readInputs(root, signal);
  const stageRoot = path.join(root, 'data', DATASET, 'releases'); await mkdir(stageRoot, { recursive: true });
  const stage = path.join(stageRoot, `.stage-${randomUUID()}`); await mkdir(stage, { recursive: false }); const owner = await lstat(stage);
  let published = false; const counts = emptyCounts(), artifacts = [];
  try {
    await mkdir(path.join(stage, 'relationships'));
    for (const sourceArtifact of input.profiles) {
      signal?.throwIfAborted(); const zip2 = /zip2=(\d{2})\.jsonl\.gz$/.exec(sourceArtifact.path)?.[1]; check(zip2);
      const targetRel = `relationships/zip2=${zip2}.jsonl.gz`, target = path.join(stage, targetRel), out = await writer(target, signal);
      let partitionRows = 0;
      try {
        for await (const profile of readProfileLines(path.join(input.registryRoot, sourceArtifact.path), sourceArtifact, input, signal)) {
          partitionRows++;
          try {
            check(profile.zip_code?.slice(0, 2) === zip2 && input.zipClasses.has(profile.zip_code) && profile.profile_version);
            const relationship = classifyEntityGeographyRelationship({ profile, zctaCodes: input.zctaRows, countyIndex: input.countyIndex, stateFipsByAbbreviation: input.stateFipsByAbbreviation, zipAuditClass: input.zipClasses.get(profile.zip_code) });
            addCounts(counts, relationship); await out.append(relationship);
          } catch (error) { throw new Error(`Relationship derivation failed at ${sourceArtifact.path} row ${partitionRows}, profile ${profile.profile_id}, ZIP ${profile.zip_code}: ${error.message}`, { cause: error }); }
        }
        const descriptor = await out.close(); artifacts.push({ artifact_type: 'business-entity-geography-relationship-jsonl-gzip', path: targetRel, ...descriptor });
      } catch (error) { await out.abort(); throw error; }
      if (counts.profiles % 500_000 < sourceArtifact.record_count) logger(`Derived geography relationships for ${counts.profiles}/${EXPECTED.profiles} matching profiles.`);
    }
    const computed = expectedSummary(input, counts, artifacts);
    const bindings = input.pins;
    const manifestBase = { schema_version: `${DATASET}-release@1.0.0`, dataset_id: DATASET, status: 'immutable-pointer-free-local-review-only', publication_mode: 'pointer-free', bindings,
      summary: computed.summary, claims: { current_operation_verified: false, postal_validity_verified: false, entity_polygon_present: false, zcta_point_assignment_performed: false,
        network_requests: 0, source_acquisition_performed: false, source_bytes_modified: false, current_pointer_written: false, production_enrollment: false, production_execution: false }, artifacts };
    const release_id = `${DATASET}-${sha(stable(manifestBase))}`; const manifest = { ...manifestBase, release_id };
    await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    const manifestBytes = await readFile(path.join(stage, 'manifest.json')), manifest_sha256 = sha(manifestBytes), final = path.join(stageRoot, release_id);
    const existing = await lstat(final).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (existing) { check(existing.isDirectory() && !existing.isSymbolicLink()); await rm(stage, { recursive: true, force: false }); }
    else { check(owner.isDirectory() && !owner.isSymbolicLink()); await rename(stage, final); }
    published = true;
    await verifyBusinessEntityGeographyRelationship({ root, release_id, expectedManifestSha256: manifest_sha256, signal, requireRegistered: false });
    const registrationPath = path.join(root, 'config/datasets', `${DATASET}.json`), old = await readFile(registrationPath, 'utf8').then(JSON.parse).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    const releases = (old?.retained_releases ?? []).map(row => ({ ...row, selected: false }));
    releases.push({ release_id, manifest: `data/${DATASET}/releases/${release_id}/manifest.json`, manifest_sha256, profile_count: computed.summary.profiles, selected: true });
    const registration = { schema_version: `${DATASET}-registration@1.0.0`, dataset_id: DATASET, status: 'registered-pointer-free-local-review-only', runtime_pointer: null, production_enrollment: false, current_pointer_written: false, selected_release_id: release_id, retained_releases: releases };
    const temp = `${registrationPath}.tmp-${randomUUID()}`; await writeFile(temp, `${JSON.stringify(registration, null, 2)}\n`, { flag: 'wx' }); await rename(temp, registrationPath);
    return { release_id, manifest_sha256, summary: computed.summary };
  } catch (error) {
    if (!published) { const current = await lstat(stage).catch(() => null); if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) await rm(stage, { recursive: true, force: true }).catch(() => {}); }
    throw error;
  }
}

export async function verifyBusinessEntityGeographyRelationship({ root = APP_ROOT, release_id, expectedManifestSha256, signal, requireRegistered = true, acceptPinnedHistoricalBindings = false } = {}) {
  root = path.resolve(root); check(typeof release_id === 'string' && release_id.startsWith(`${DATASET}-`) && SHA.test(expectedManifestSha256 ?? ''));
  const input = await readInputs(root, signal);
  if (requireRegistered) {
    const registration = JSON.parse(await readFile(path.join(root, `config/datasets/${DATASET}.json`), 'utf8'));
    check(registration.selected_release_id === release_id && registration.retained_releases.filter(r => r.selected).length === 1);
    const selected = registration.retained_releases.find(r => r.selected); check(selected.manifest_sha256 === expectedManifestSha256);
  }
  const base = path.join(root, 'data', DATASET, 'releases', release_id), manifestBytes = await readFile(path.join(base, 'manifest.json'));
  check(sha(manifestBytes) === expectedManifestSha256); const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  const { release_id: ignored, ...withoutId } = manifest; void ignored;
  check(manifest.release_id === release_id && `${DATASET}-${sha(stable(withoutId))}` === release_id && (acceptPinnedHistoricalBindings || stable(manifest.bindings) === stable(input.pins))
    && manifest.claims?.current_operation_verified === false && manifest.claims?.postal_validity_verified === false && manifest.claims?.entity_polygon_present === false && manifest.claims?.zcta_point_assignment_performed === false);
  const byPath = new Map(manifest.artifacts.map(a => [a.path, a])); check(byPath.size === 100);
  const counts = emptyCounts();
  for (const sourceArtifact of input.profiles) {
    signal?.throwIfAborted(); const zip2 = /zip2=(\d{2})\.jsonl\.gz$/.exec(sourceArtifact.path)?.[1], declared = byPath.get(`relationships/zip2=${zip2}.jsonl.gz`); check(declared);
    const outputPath = path.join(base, declared.path), outputRows = readGzipRows(outputPath, declared, signal)[Symbol.asyncIterator](); let produced = 0;
    for await (const profile of readProfileLines(path.join(input.registryRoot, sourceArtifact.path), sourceArtifact, input, signal)) {
      const expected = classifyEntityGeographyRelationship({ profile, zctaCodes: input.zctaRows, countyIndex: input.countyIndex, stateFipsByAbbreviation: input.stateFipsByAbbreviation, zipAuditClass: input.zipClasses.get(profile.zip_code) });
      const next = await outputRows.next(); check(!next.done, 'Geography output shard ended before profile input.'); const actual = next.value; produced++;
      check(stable(actual) === stable(expected)); addCounts(counts, actual);
    }
    check((await outputRows.next()).done, 'Geography output shard contains orphan rows.');
    check(produced === declared.record_count);
  }
  const computed = expectedSummary(input, counts, manifest.artifacts); check(stable(computed.summary) === stable(manifest.summary));
  return { status: 'verified', release_id, manifest_sha256: expectedManifestSha256, summary: manifest.summary };
}

async function readSelectedPartition({ root = APP_ROOT, zip2, signal } = {}) {
  check(/^\d{2}$/.test(zip2 ?? '')); root = path.resolve(root); signal?.throwIfAborted();
  const registration = (await boundedJson(path.join(root, `config/datasets/${DATASET}.json`), 1_000_000)).value;
  check(registration.schema_version === `${DATASET}-registration@1.0.0` && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null && registration.production_enrollment === false
    && registration.current_pointer_written === false && registration.selected_release_id === SELECTED_RELEASE_ID);
  const selected = registration.retained_releases.filter(row => row.selected === true); check(selected.length === 1
    && selected[0].release_id === SELECTED_RELEASE_ID && selected[0].manifest_sha256 === SELECTED_MANIFEST_SHA256
    && selected[0].manifest === `data/${DATASET}/releases/${SELECTED_RELEASE_ID}/manifest.json`);
  const releaseDir = path.join(root, 'data', DATASET, 'releases', SELECTED_RELEASE_ID), manifestRead = await boundedJson(path.join(releaseDir, 'manifest.json'), 8_000_000), manifest = manifestRead.value;
  check(manifestRead.sha256 === SELECTED_MANIFEST_SHA256 && manifest.release_id === SELECTED_RELEASE_ID && manifest.schema_version === `${DATASET}-release@1.0.0`
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free'
    && manifest.bindings.registry.release_id === REGISTRY_RELEASE && manifest.bindings.registry.manifest_sha256 === REGISTRY_SHA
    && manifest.bindings.geography.release_id === GEO_RELEASE && manifest.bindings.geography.manifest_sha256 === GEO_SHA
    && manifest.bindings.crosswalk.release_id === CROSSWALK_RELEASE && manifest.bindings.crosswalk.manifest_sha256 === CROSSWALK_SHA
    && manifest.bindings.zip_audit.release_id === GAP_RELEASE && manifest.bindings.zip_audit.manifest_sha256 === GAP_SHA
    && manifest.bindings.zip_quality.release_id === ZIP_QUALITY_RELEASE && manifest.bindings.zip_quality.manifest_sha256 === ZIP_QUALITY_SHA
    && manifest.bindings.point_assignment.release_id === COVERAGE_RELEASE && manifest.bindings.point_assignment.manifest_sha256 === COVERAGE_SHA
    && manifest.claims.current_operation_verified === false && manifest.claims.postal_validity_verified === false
    && manifest.claims.entity_polygon_present === false && manifest.claims.zcta_point_assignment_performed === false);
  const artifacts = manifest.artifacts.filter(item => item.path === `relationships/zip2=${zip2}.jsonl.gz`); check(artifacts.length === 1);
  const artifact = artifacts[0], file = path.join(releaseDir, artifact.path), iterator = readGzipRows(file, artifact, signal)[Symbol.asyncIterator](); let seen = 0, closed = false;
  return {
    provenance: { release_id: manifest.release_id, manifest_sha256: manifestRead.sha256, bindings: manifest.bindings },
    async nextFor(profile) {
      check(!closed, 'Geography relationship partition is closed.'); signal?.throwIfAborted(); const next = await iterator.next(); check(!next.done, 'Geography relationship partition ended before source profiles.'); seen++;
      const row = next.value;
      check(row.schema_version === 'business-entity-geography-relationship-row@1.0.0' && row.profile_id === profile.profile_id
        && row.postal.zip_code === profile.zip_code && row.postal.zip4 === (profile.address.zip4 ?? null)
        && row.source.source_id === profile.source.source_id && row.source.source_release_id === profile.source.source_release_id
        && row.source.source_record_lineage_sha256 === sha(stable(profile.source.source_record_ids ?? [profile.source.source_record_id]))
        && row.source.transformation_version === (profile.source.transformation_version ?? null)
        && row.source.policy_id === (profile.source.policy_id ?? null) && row.source.observed_at === (profile.observed_at ?? null)
        && row.source.export_policy === (profile.export_policy ?? null)
        && row.source_reported_state === (profile.address?.state ?? null)
        && row.postal.usps_operational_assignment === null && row.postal.usps_deliverability === null
        && row.code_correspondence.membership === false && row.code_correspondence.zcta_geoid === (row.postal.classification === 'same-code-zcta-candidate' ? profile.zip_code : null)
        && ['same-code-zcta-candidate', 'outside-zcta', 'explicit-placeholder'].includes(row.postal.classification)
        && ['assigned-single-county', 'unmatched', 'ambiguous', 'conflict', 'missing-geocode', 'invalid-coordinate', 'unassignable-legacy-coordinate-crs-unproven', 'unassignable-coordinate-not-premise-point'].includes(row.point_assignment.status)
        && row.point_assignment.zcta_geoid === null && row.claims.current_operation_verified === false
        && row.claims.postal_validity_verified === false && row.claims.entity_polygon_present === false
        && row.claims.zip_to_state_inferred === false && row.claims.zip_to_county_inferred === false);
      if (row.point_assignment.status === 'assigned-single-county') check(/^\d{5}$/.test(row.point_assignment.county_geoid) && row.point_assignment.state_fips === row.point_assignment.county_geoid.slice(0, 2));
      else check(row.point_assignment.county_geoid === null && row.point_assignment.state_fips === null);
      return row;
    },
    async finish() { if (closed) return; signal?.throwIfAborted(); check((await iterator.next()).done && seen === artifact.record_count); closed = true; },
    async close() { closed = true; await iterator.return?.(); },
  };
}

export async function readBusinessEntityGeographyRelationshipPartition(options = {}) { return readSelectedPartition(options); }
export function businessEntityGeographyRelationshipMatchesRegistry(manifest, manifestSha256) {
  return manifest?.dataset_id === 'national-business-registry' && manifest.release_id === REGISTRY_RELEASE && manifestSha256 === REGISTRY_SHA;
}

export async function readBusinessEntityGeographyRelationshipSummary({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const registration = (await boundedJson(path.join(root, `config/datasets/${DATASET}.json`), 1_000_000)).value;
  check(registration.schema_version === `${DATASET}-registration@1.0.0` && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null
    && registration.current_pointer_written === false && registration.production_enrollment === false
    && registration.selected_release_id === SELECTED_RELEASE_ID);
  const selected = registration.retained_releases.filter(row => row.selected === true);
  check(selected.length === 1 && selected[0].release_id === SELECTED_RELEASE_ID && selected[0].manifest_sha256 === SELECTED_MANIFEST_SHA256);
  const manifestRead = await boundedJson(path.join(root, 'data', DATASET, 'releases', SELECTED_RELEASE_ID, 'manifest.json'), 8_000_000);
  const manifest = manifestRead.value;
  check(manifestRead.sha256 === SELECTED_MANIFEST_SHA256 && manifest.release_id === SELECTED_RELEASE_ID
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free'
    && manifest.summary.profiles === EXPECTED.profiles
    && manifest.summary.postal['same-code-zcta-candidate'] === EXPECTED.same
    && manifest.summary.postal['outside-zcta'] === EXPECTED.outside
    && manifest.summary.postal['explicit-placeholder'] === EXPECTED.placeholder
    && Object.values(manifest.summary.point).reduce((a, b) => a + b, 0) === EXPECTED.profiles
    && manifest.claims.current_operation_verified === false && manifest.claims.postal_validity_verified === false
    && manifest.claims.entity_polygon_present === false && manifest.claims.zcta_point_assignment_performed === false
    && manifest.artifacts.length === 100 && stable(manifest.artifacts.map(item => item.path).sort()) === stable(Array.from({ length: 100 }, (_, i) => `relationships/zip2=${String(i).padStart(2, '0')}.jsonl.gz`)));
  return { release_id: manifest.release_id, manifest_sha256: manifestRead.sha256, profile_count: manifest.summary.profiles,
    point_counts: manifest.summary.point, state_point_counts: manifest.summary.state_point_counts,
    county_point_counts: manifest.summary.county_point_counts,
    state_point_source_counts: manifest.summary.state_point_source_counts, county_point_source_counts: manifest.summary.county_point_source_counts,
    source_counts: manifest.summary.source_counts };
}

