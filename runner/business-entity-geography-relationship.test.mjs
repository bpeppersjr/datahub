import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { createCountySpatialIndex } from './national-business-coverage-views.mjs';
import { businessEntityGeographyRelationshipMatchesRegistry, classifyEntityGeographyRelationship, normalizeRetainedGeographyProfile, readBusinessEntityGeographyRelationshipPartition, readBusinessEntityGeographyRelationshipSummary } from './business-entity-geography-relationship.mjs';

const profile = (zip = '01234', point = { latitude: 40.5, longitude: -75.5 }, state = 'PA') => ({
  profile_id: 'location-profile:0123456789abcdef0123456789abcdef', zip_code: zip, profile_version: 'business-location-match-profile@1.1.0',
  address: { zip_code: zip, zip4: '0042', state }, geocode: point,
  source: { source_id: 'fixture', source_release_id: 'fixture-release', source_record_id: 'fixture-record' },
});
const countyIndex = () => {
  const features = [{ type: 'Feature', properties: { GEOID: '42001' }, geometry: { type: 'Polygon', coordinates: [[[-76, 40], [-75, 40], [-75, 41], [-76, 41], [-76, 40]]] } }];
  return createCountySpatialIndex(features, [{ geoid: '42001', state_fips: '42' }]);
};

test('profile ZIP/ZCTA correspondence is explicitly not membership and USPS validity stays unknown', () => {
  const row = classifyEntityGeographyRelationship({ profile: profile(), zctaCodes: new Set(['01234']), countyIndex: countyIndex(), stateFipsByAbbreviation: new Map([['PA', '42']]), zipAuditClass: 'same-code-census-zcta' });
  assert.equal(row.postal.classification, 'same-code-zcta-candidate');
  assert.deepEqual(row.code_correspondence, { status: 'same-code-census-zcta-candidate', zcta_geoid: '01234', membership: false });
  assert.equal(row.postal.zip4, '0042');
  assert.equal(row.postal.usps_operational_assignment, null);
  assert.equal(row.postal.usps_deliverability, null);
  assert.equal(row.point_assignment.county_geoid, '42001');
  assert.equal(row.point_assignment.state_fips, '42');
  assert.equal(row.point_assignment.zcta_geoid, null);
  assert.equal(row.point_assignment.reported_state_relationship, 'agrees');
  assert.equal(row.claims.entity_polygon_present, false);
});

test('postal classification is independent of point assignment for placeholders and out-of-ZCTA codes', () => {
  const polygons = countyIndex();
  for (const [zip, expected] of [['00000', 'explicit-placeholder'], ['99501', 'outside-zcta']]) {
    const row = classifyEntityGeographyRelationship({ profile: profile(zip), zctaCodes: new Set(['01234']), countyIndex: polygons, stateFipsByAbbreviation: new Map([['PA', '42']]), zipAuditClass: zip === '00000' ? 'explicit-placeholder' : 'source-contributed-outside-zcta' });
    assert.equal(row.postal.classification, expected);
    assert.equal(row.point_assignment.county_geoid, '42001'); // only the independent point test assigns this county
    assert.equal(row.code_correspondence.membership, false);
  }
});

test('point assignment retains only deterministic county/state and distinguishes missing/unmatched/ambiguous/conflict', () => {
  const index = countyIndex(), zctas = new Set(['01234']);
  const stateMap = new Map([['PA', '42'], ['NJ', '34']]);
  const missing = classifyEntityGeographyRelationship({ profile: profile('01234', null), zctaCodes: zctas, countyIndex: index, stateFipsByAbbreviation: stateMap, zipAuditClass: 'same-code-census-zcta' });
  assert.equal(missing.point_assignment.status, 'missing-geocode');
  assert.equal(missing.point_assignment.county_geoid, null);
  const outside = classifyEntityGeographyRelationship({ profile: profile('01234', { latitude: 10, longitude: 10 }), zctaCodes: zctas, countyIndex: index, stateFipsByAbbreviation: stateMap, zipAuditClass: 'same-code-census-zcta' });
  assert.equal(outside.point_assignment.status, 'unmatched');
  assert.equal(outside.point_assignment.state_fips, null);
  const conflict = classifyEntityGeographyRelationship({ profile: profile('01234', { latitude: 40.5, longitude: -75.5 }, 'NJ'), zctaCodes: zctas, countyIndex: index, stateFipsByAbbreviation: stateMap, zipAuditClass: 'same-code-census-zcta' });
  assert.equal(conflict.source_reported_state, 'NJ');
  assert.equal(conflict.point_assignment.reported_state_relationship, 'conflicts');
  assert.equal(conflict.point_assignment.state_fips, '42');
});

test('legacy retained address extensions are release-bound and CRS-unproven points remain unassignable', () => {
  const raw = {
    schema_version: '1.0.0', profile_version: 'business-location-match-profile@1.0.0', profile_id: 'location-profile:0123456789abcdef0123456789abcdef',
    zip_code: '00662', site_entity_id: 'site:fixture', establishment_entity_id: 'establishment:fixture', organization_entity_id: null,
    address: { street: '1 Main', unit_or_additional: null, city: 'Example', state: 'PR', zip_code: '00662', postal_code: '00662', zip4: null, country: 'US', state_county_fips: '72001' },
    normalized_address: { kind: 'street', street: '1 MAIN', unit: null, city: 'EXAMPLE', state: 'PR', zip_code: '00662', complete: true, match_key: 'street|1 MAIN||EXAMPLE|PR|00662' },
    address_match_key_sha256: 'f0e5aa0a47ad3bae836c16ff7e6d28173967f82da5c8fc5ca6dc2be04944bfee', names: [], primary_name_match_key_sha256: null,
    location: { type: 'Point', coordinates: [-66.5, 18.2] }, external_identifiers: [], source_status: null,
    observed_at: '2026-09-01T00:00:00.000Z', source: { source_id: 'fixture', source_release_id: 'fixture-release', source_record_id: 'fixture-record', ingest_run_id: 'run-1', transformation_version: 'fixture@1', policy_id: 'fixture' }, export_policy: 'local-review-only',
  };
  const manifest = { dataset_id: 'national-business-registry', release_id: 'national-business-registry-20260911-022652067Z-1ec656c3' };
  const normalized = normalizeRetainedGeographyProfile(raw, manifest, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76');
  assert.equal(normalized.address.country, undefined);
  assert.equal(normalized.address.state, 'PR');
  assert.equal(normalized.geocode, null);
  assert.equal(normalized._geography_point_status, 'unassignable-legacy-coordinate-crs-unproven');
  assert.equal(raw.address.country, 'US'); // source fixture remains unchanged
  assert.throws(() => normalizeRetainedGeographyProfile(raw, manifest, '0'.repeat(64)), /Business entity geography relationship contract rejected/);
  const unknown = structuredClone(raw); unknown.address.unknown_region = 'USVI';
  assert.throws(() => normalizeRetainedGeographyProfile(unknown, manifest, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'), /rejected/);
});

test('only the exact retained DC output-CRS transformation adapter promotes legacy points', () => {
  const raw = {
    schema_version: '1.0.0', profile_version: 'business-location-match-profile@1.0.0', profile_id: 'location-profile:0123456789abcdef0123456789abcdef',
    zip_code: '20009', site_entity_id: 'site:fixture', establishment_entity_id: 'establishment:fixture', organization_entity_id: null,
    address: { address_line: '1 Main', city: 'Washington', state: 'DC', zip_code: '20009', postal_code: '20009', zip4: null },
    normalized_address: { kind: 'street', street: '1 MAIN', unit: null, city: 'WASHINGTON', state: 'DC', zip_code: '20009', complete: true, match_key: 'street|1 MAIN||WASHINGTON|DC|20009' },
    address_match_key_sha256: 'abaf8434045cc3fe3e9a2a1bc43ba327d3331d3f43bc19623ebe2562903a134f', names: [], primary_name_match_key_sha256: null,
    location: { type: 'Point', coordinates: [-77.04, 38.91], source_coordinate: { x: 396000, y: 138000 }, source_crs: 'EPSG:26985', output_crs: 'EPSG:4326', coordinate_scope: 'dc-master-address-repository-geocode-not-independently-verified-current-occupancy', transformation: 'proj4@2.22.0', plausibility: 'within-broad-dc-bounds', independently_verified: false },
    external_identifiers: [], source_status: null, observed_at: '2026-09-01T00:00:00.000Z',
    source: { source_id: 'dc-dlcp-active-basic-business-licenses', source_release_id: 'dc-release', source_record_id: 'dc-record', ingest_run_id: 'run-1', transformation_version: 'dc-basic-business-licenses@1.0.1', policy_id: 'dc-policy' }, export_policy: 'local-review-only',
  };
  const manifest = { dataset_id: 'national-business-registry', release_id: 'national-business-registry-20260911-022652067Z-1ec656c3' };
  const normalized = normalizeRetainedGeographyProfile(raw, manifest, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76');
  assert.deepEqual(normalized.geocode, { latitude: 38.91, longitude: -77.04 });
  assert.equal(normalized._geography_point_status, 'source-geocode-retained');
  const wrong = structuredClone(raw); wrong.source.transformation_version = 'future@9';
  assert.throws(() => normalizeRetainedGeographyProfile(wrong, manifest, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'));
});

test('registered relationship summary preserves exact cohort and strict row-level assignment counts', async () => {
  const summary = await readBusinessEntityGeographyRelationshipSummary();
  assert.equal(summary.release_id, 'business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7');
  assert.equal(summary.manifest_sha256, '07e561938b2d027f0c1586e5db1a2b775f7680d486e75dfb4e99b399cc0bbaa2');
  assert.equal(summary.profile_count, 8011835);
  assert.equal(summary.point_counts['assigned-single-county'], 372079);
  assert.equal(summary.point_counts['unassignable-legacy-coordinate-crs-unproven'], 640383);
  assert.equal(summary.point_counts['unassignable-coordinate-not-premise-point'], 22948);
  assert.equal(summary.point_counts['missing-geocode'], 6976397);
  assert.equal(summary.point_counts.unmatched, 21);
  assert.equal(summary.point_counts.ambiguous, 7);
  assert.equal(Object.values(summary.point_counts).reduce((total, value) => total + value, 0), 8011835);
  assert.equal(Object.values(summary.state_point_counts).reduce((total, value) => total + value, 0), 372079);
  assert.equal(Object.values(summary.county_point_counts).reduce((total, value) => total + value, 0), 372079);
  assert.equal(995293 - summary.point_counts['assigned-single-county'], 623214);
});

test('runtime adapter is enabled only for the exact immutable registry release and manifest hash', () => {
  const manifest = { dataset_id: 'national-business-registry', release_id: 'national-business-registry-20260911-022652067Z-1ec656c3' };
  assert.equal(businessEntityGeographyRelationshipMatchesRegistry(manifest, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'), true);
  assert.equal(businessEntityGeographyRelationshipMatchesRegistry(manifest, '0'.repeat(64)), false);
  assert.equal(businessEntityGeographyRelationshipMatchesRegistry({ ...manifest, release_id: 'historical' }, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'), false);
});

test('selected ZIP2 relationship partition joins row-for-row to its pinned registry profiles', async () => {
  const config = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/national-business-registry.json'), 'utf8'));
  const manifestBytes = await readFile(path.join(APP_ROOT, config.current_release.manifest));
  assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76');
  const registry = JSON.parse(manifestBytes), sourceArtifact = registry.artifacts.find(item => item.path === 'resolution/location-profiles/zip2=00.jsonl.gz');
  const sourceBytes = await readFile(path.join(APP_ROOT, 'data/business-registry/releases', registry.release_id, sourceArtifact.path));
  assert.equal(sourceBytes.length, sourceArtifact.bytes);
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), sourceArtifact.sha256);
  const sourceRows = gunzipSync(sourceBytes).toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const joiner = await readBusinessEntityGeographyRelationshipPartition({ zip2: '00' });
  for (const source of sourceRows) {
    const result = await joiner.nextFor({ profile_id: source.profile_id, zip_code: source.zip_code,
      address: { zip4: source.address?.zip4 ?? null, state: source.address?.state ?? null },
      observed_at: source.observed_at ?? null, export_policy: source.export_policy ?? null,
      source: { source_id: source.source.source_id, source_release_id: source.source.source_release_id,
        source_record_ids: source.source.source_record_ids, source_record_id: source.source.source_record_id,
        transformation_version: source.source.transformation_version ?? null, policy_id: source.source.policy_id ?? null } });
    assert.equal(result.profile_id, source.profile_id);
    assert.equal(result.postal.usps_deliverability, null);
    assert.equal(result.code_correspondence.membership, false);
    assert.equal(result.source_reported_state, source.address?.state ?? null);
    assert.equal(result.claims.current_operation_verified, false);
    assert.equal(result.claims.entity_polygon_present, false);
  }
  await joiner.finish();
  assert.equal(sourceRows.length, sourceArtifact.record_count);
});
