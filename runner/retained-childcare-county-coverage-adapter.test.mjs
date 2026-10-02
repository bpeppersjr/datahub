import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetainedCountyIndex } from './retained-childcare-county-relations.mjs';
import { calculateSyntheticRetainedChildcareCountyCoverage as calculate, verifySyntheticRetainedChildcareCountyCoverage as verify,
  syntheticRetainedChildcareCountyMetric as metric, inspectRetainedChildcareCountyCoverageCompatibility as compatibility,
  loadRetainedChildcareCountyCoverage, verifyRetainedChildcareCountyCoverage, prepareRetainedChildcareCountyCoverageViews,
  validateRetainedChildcareCountyTargetViews } from './retained-childcare-county-coverage-adapter.mjs';

const states = [{ geoid: '24', postal_abbreviation: 'MD' }, { geoid: '42', postal_abbreviation: 'PA' }];
const counties = [{ geoid: '42001', state_fips: '42' }, { geoid: '42003', state_fips: '42' }, { geoid: '24001', state_fips: '24' }, { geoid: '19001', state_fips: '19' }];
const box = (id, left, right) => ({ type: 'Feature', properties: { GEOID: id }, geometry: { type: 'Polygon',
  coordinates: [[[left, 39], [right, 39], [right, 41], [left, 41], [left, 39]]] } });
const index = () => createRetainedCountyIndex([box('42001', -78, -77), box('42003', -79, -78), box('24001', -77, -76), box('19001', -80, -79)], counties);
const row = (n, source, longitude, overrides = {}) => ({ candidate_id: `candidate:childcare:${String(n).padStart(64, '0')}`,
  source_record_sha256: 'a'.repeat(64), source: { dataset_id: source, release_id: 'retained-source', enrollment_sha256: 'b'.repeat(64) },
  source_record: { provenance: { observed_at: '2026-09-01T00:00:00.000Z', processed_at: '2026-09-02T00:00:00.000Z', source_updated_at: null },
    source_status: { active_business_verified: false }, license_dates_source: { issue_date: 'unparsed-source-date' } },
  reported_address: { state: 'MD', zip_code: '00123', postal_code: '00123', zip4: '0045' },
  geocode: { latitude: 40, longitude, crs: 'EPSG:4326' }, ...overrides });
const records = () => [row(1, 'pa-dhs-childcare-centers', -77.5), row(2, 'md-msde-childcare-centers', -76.5),
  row(3, 'ia-childcare-centers', -79.5, { geocode: { latitude: 40, longitude: -79.5, crs: null } }),
  row(4, 'ct-oec-childcare-centers', null, { geocode: { latitude: null, longitude: null, crs: null } })];

function targetViews(bindings) {
  const row = (type, id, extra = {}) => ({ schema_version: '1.0.0', view_type: type, view_id: `${type}:${id}`,
    complete_all_businesses: false, lineage: { registry_release_id: bindings.registry_release_id,
      geography_release_id: bindings.geography_release_id, transformation_version: 'national-business-coverage-views@2.11.0' }, ...extra });
  return {
    lineage: {
      coverage_manifest: { path: bindings.coverage, release_id: bindings.coverage_release_id, sha256: bindings.coverage_sha256 },
      registry_manifest: { path: bindings.registry, release_id: bindings.registry_release_id, sha256: bindings.registry_sha256 },
      geography_manifest: { path: bindings.geography, release_id: bindings.geography_release_id, sha256: bindings.geography_sha256 },
    },
    national: ['registry-union', 'all-census-us-areas', '50-states-and-dc'].map(scope => row('national', scope, { scope })),
    counties: ['42001', '19001'].map(county_geoid => row('county', county_geoid, { county_geoid, state_fips: county_geoid.slice(0, 2), retained_childcare_reporting: { candidate_rows: null } })),
    states: ['42', '19'].map(state_fips => row('state', state_fips, { state_fips, retained_childcare_reporting: { candidate_rows: 9 } })),
    zips: [row('zip', '00123', { zip_code: '00123', zip4: '0045' })],
  };
}

test('synthetic adapter conserves dispositions, retains temporal/postal evidence and keeps unsupported geography null', async () => {
  const input = records(), original = structuredClone(input), result = await calculate(input, index(), states, counties);
  assert.deepEqual(input, original);
  assert.equal(result.counts.candidate_rows, 4);
  assert.equal(result.counts.by_status['assigned-single-county'], 2);
  assert.equal(result.counts.by_status['missing-source-point'], 1);
  assert.equal(result.counts.by_status['unknown-coordinate-system'], 1);
  assert.equal(result.rows[0].county_relationship.reported_state, 'MD');
  assert.equal(result.rows[0].county_relationship.derived_state_fips, '42');
  for (let n = 0; n < input.length; n++) {
    assert.deepEqual(result.rows[n].reported_address, input[n].reported_address);
    assert.deepEqual(result.rows[n].source_provenance, input[n].source_record.provenance);
    assert.deepEqual(result.rows[n].source_license_dates, input[n].source_record.license_dates_source);
    assert.deepEqual(result.rows[n].source_geocode, input[n].geocode);
  }
  assert.equal(metric(result, 'county', '42001').candidate_rows, 1);
  assert.equal(metric(result, 'county', '42003').candidate_rows, 0);
  assert.equal(metric(result, 'county', '19001').candidate_rows, null);
  assert.equal(metric(result, 'state', '19').candidate_rows, null);
  assert.equal(metric(result, 'zip', '00123').candidate_rows, null);
  assert.equal(result.national_completeness_percent, null);
  for (const flag of ['identity_matching_applied', 'physical_site_verified', 'current_operations_verified', 'postal_membership_inferred', 'national_reporting_integrated', 'successor_enrolled', 'public_export_authorized']) assert.equal(result[flag], false);
  assert.equal(result.export_policy, 'internal');
  await verify(result, input, index(), states, counties);
  assert.throws(() => prepareRetainedChildcareCountyCoverageViews(result, {}), /unverified/);
});

test('adapter replay rejects changed membership, duplicate candidates, unsupported sources and cancellation', async () => {
  const input = records(), result = await calculate(input, index(), states, counties);
  for (const mutate of [r => { r.rows[0].county_relationship.county_geoid = '42003'; }, r => { r.rows[0].reported_address.zip4 = '9999'; },
    r => { r.rows[0].candidate_id = r.rows[1].candidate_id; }, r => { r.rows[0].source_provenance.observed_at = '2026-10-01'; },
    r => { r.counts.by_status['assigned-single-county']++; }]) {
    const changed = structuredClone(result); mutate(changed);
    await assert.rejects(verify(changed, input, index(), states, counties), /source replay differs/);
  }
  await assert.rejects(calculate([input[0], input[0]], index(), states, counties));
  await assert.rejects(calculate([row(5, 'unreviewed-source', -77.5)], index(), states, counties), /unsupported/);
  await assert.rejects(calculate(input, index(), states, [...counties, counties[0]]));
  await assert.rejects(calculate(input, index(), states, counties, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(loadRetainedChildcareCountyCoverage({ signal: AbortSignal.abort() }), { name: 'AbortError' });
  for (const value of [{ registry: 'other' }, { policy: {} }, { enrollment: {} }, { fetchImpl() {} }]) {
    await assert.rejects(compatibility(value), /unsupported options/);
    await assert.rejects(loadRetainedChildcareCountyCoverage(value), /unsupported options/);
  }
});

test('exact retained metadata binds the old derivative cohort to the identical current registry cohort without promotion', async () => {
  const result = await compatibility();
  assert.equal(result.metadata_compatible, true);
  assert.equal(result.source_replay_verified, false);
  assert.equal(result.bindings.candidate_artifact.record_count, 12206);
  assert.equal(result.bindings.candidate_artifact.sha256, '9056279e54106e06d1f4c38236ff236b858927efe87fd8fd421238b960c264df');
  assert.notEqual(result.bindings.derivative_registry_sha256, result.bindings.registry_sha256);
  assert.equal(result.bindings.candidate_source_bindings.length, 7);
  assert.equal(result.bindings.candidate_enrollment_pins.length, 7);
  assert.equal(result.national_reporting_integrated, false);
  assert.equal(result.successor_enrolled, false);
  await assert.rejects(verifyRetainedChildcareCountyCoverage({ bindings: { ...result.bindings, registry_sha256: '0'.repeat(64) } }), /adapter rows or binding changed/);
});

test('target preparation contract rejects mismatched lineage/vintage and unsupported national scopes before mutation', async () => {
  const { bindings } = await compatibility(), views = targetViews(bindings), before = structuredClone(views);
  assert.equal(validateRetainedChildcareCountyTargetViews(views, bindings), true);
  assert.deepEqual(views, before);
  for (const mutate of [
    v => { delete v.lineage; },
    v => { v.lineage.coverage_manifest.sha256 = '0'.repeat(64); },
    v => { v.lineage.registry_manifest.release_id = 'old-registry'; },
    v => { v.lineage.geography_manifest.sha256 = '0'.repeat(64); },
    v => { v.counties[0].lineage.geography_release_id = 'old-vintage'; },
    v => { v.states[0].lineage.registry_release_id = 'unrelated-registry'; },
    v => { v.zips[0].lineage.transformation_version = 'national-business-coverage-views@2.7.0'; },
    v => { v.national[0].scope = 'world'; v.national[0].view_id = 'national:world'; },
    v => { v.national[1] = structuredClone(v.national[0]); },
    v => { v.counties[0].state_fips = '24'; },
    v => { v.states[0].view_id = 'state:24'; },
  ]) {
    const changed = structuredClone(views); mutate(changed); const unchanged = structuredClone(changed);
    assert.throws(() => validateRetainedChildcareCountyTargetViews(changed, bindings), /rejected/);
    assert.deepEqual(changed, unchanged);
  }
});

test('optional retained source replay produces an exact read-only national adapter', { skip: process.env.DATAHUB_TEST_RETAINED_COUNTY_COVERAGE !== '1' }, async () => {
  const result = await loadRetainedChildcareCountyCoverage();
  assert.equal(result.counts.candidate_rows, 12206);
  assert.equal(result.counts.by_status['assigned-single-county'], 6702);
  assert.equal(result.counts.by_status['missing-source-point'], 4028);
  assert.equal(result.counts.by_status['unknown-coordinate-system'], 1476);
  assert.equal(result.source_cohorts.find(row => row.dataset_id === 'pa-dhs-childcare-centers').assigned_rows, 4930);
  assert.equal(result.source_cohorts.find(row => row.dataset_id === 'md-msde-childcare-centers').assigned_rows, 1772);
  const views = targetViews(result.bindings);
  const before = structuredClone(views), prepared = prepareRetainedChildcareCountyCoverageViews(result, views);
  assert.deepEqual(before, views); assert.deepEqual(prepared.zips, views.zips);
  assert.deepEqual(prepared.states[0].retained_childcare_reporting, views.states[0].retained_childcare_reporting);
  assert.deepEqual(prepared.counties[0].retained_childcare_reporting, views.counties[0].retained_childcare_reporting);
  assert.equal(prepared.counties[1].retained_childcare_derived_county_reporting.candidate_rows, null);
  assert.equal(prepared.states[1].retained_childcare_derived_county_reporting.candidate_rows, null);
  assert.equal(prepared.national.length, 3);
  for (const row of prepared.national) assert.equal(row.retained_childcare_derived_county_reporting.counts.by_status['assigned-single-county'], 6702);
  const wrongVintage = structuredClone(views); wrongVintage.counties[0].lineage.geography_release_id = 'old-vintage';
  assert.throws(() => prepareRetainedChildcareCountyCoverageViews(result, wrongVintage), /row lineage/);
  const unsupported = structuredClone(views); unsupported.national[0].scope = 'world';
  assert.throws(() => prepareRetainedChildcareCountyCoverageViews(result, unsupported), /unsupported national scope/);
  const verification = await verifyRetainedChildcareCountyCoverage(result);
  assert.equal(verification.source_replay_verified, true);
  const changed = structuredClone(result); changed.bindings.registry_sha256 = '0'.repeat(64);
  await assert.rejects(verifyRetainedChildcareCountyCoverage(changed), /adapter rows or binding changed/);
});
