import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, lstat, access } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { createRetainedCountyIndex, deriveRetainedCountyRelations, buildRetainedCountyRelations,
  inspectRetainedCountyRelations, validateCountyRelationEnvelope, discardOwnedCountyStaging } from './retained-childcare-county-relations.mjs';

const box = (id, x0, x1) => ({ type: 'Feature', properties: { GEOID: id }, geometry: { type: 'Polygon',
  coordinates: [[[x0, 40], [x1, 40], [x1, 42], [x0, 42], [x0, 40]]] } });
const index = () => createRetainedCountyIndex([box('42001', -78, -77), box('42003', -77, -76)],
  [{ geoid: '42001', state_fips: '42' }, { geoid: '42003', state_fips: '42' }]);
const row = (n, latitude = 41, longitude = -77.5, dataset = 'pa-dhs-childcare-centers') => ({
  candidate_id: `candidate:childcare:${String(n).padStart(64, '0')}`, source: { dataset_id: dataset },
  geocode: { latitude, longitude, crs: 'EPSG:4326' }, reported_address: { state: 'PA', zip_code: '17001', zip4: '0123' } });

test('retained county relations preserve postal evidence and classify all point outcomes without business polygons', async () => {
  const records = [row(1), row(2, null, null), row(3, '41'), row(4, 41, -77), row(5, 0, 0), row(6, 41, -77.5, 'md-msde-childcare-centers')];
  const unknown = row(7, 41, -77.5, 'ia-childcare-centers'); unknown.geocode.crs = null; records.push(unknown);
  const before = structuredClone(records), result = await deriveRetainedCountyRelations(records, index());
  assert.deepEqual(records, before); assert.equal(result.counts.candidate_rows, 7);
  assert.ok(Object.values(result.counts.by_status).every(count => count === 1));
  assert.deepEqual(result.rows.map(r => r.status), ['assigned-single-county', 'missing-source-point', 'invalid-source-point',
    'ambiguous-county-boundary', 'coordinate-not-in-county-polygon', 'source-not-enabled-for-overlay', 'unknown-coordinate-system']);
  assert.equal(result.rows[0].county_geoid, '42001'); assert.equal(result.rows[0].reported_zip5, '17001');
  assert.equal(result.rows[0].reported_zip4, '0123'); assert.equal(result.rows[0].reported_state_relation, 'matches');
  assert.deepEqual(result.rows[3].candidate_county_geoids, ['42001', '42003']);
  assert.equal(result.business_location_verified, false); assert.equal(result.national_reporting_integrated, false);
  assert.equal(result.public_export_authorized, false); assert.equal(JSON.stringify(result).includes('geometry'), false);
});

test('county relation input rejects duplicate identity and does not coerce null or numeric strings', async () => {
  await assert.rejects(deriveRetainedCountyRelations([row(1), row(1)], index()));
  for (const coordinates of [[null, -77.5], [41, null], ['41', '-77.5'], [NaN, -77.5], [91, -77.5]]) {
    const result = await deriveRetainedCountyRelations([row(1, ...coordinates)], index());
    assert.equal(result.rows[0].status, 'invalid-source-point'); assert.equal(result.rows[0].county_geoid, null);
  }
  const other = row(1); other.reported_address.state = 'NY';
  assert.equal((await deriveRetainedCountyRelations([other], index())).rows[0].reported_state_relation, 'requires-review');
});

test('county index rejects missing/duplicate geography identities and invalid coordinate values', () => {
  assert.throws(() => createRetainedCountyIndex([box('42001', -78, -77)], []));
  assert.throws(() => createRetainedCountyIndex([box('42001', -78, -77)], [{ geoid: '42001', state_fips: '41' }]));
  assert.throws(() => createRetainedCountyIndex([box('42001', -78, -77), box('42001', -78, -77)],
    [{ geoid: '42001', state_fips: '42' }, { geoid: '42001', state_fips: '42' }]));
  assert.throws(() => createRetainedCountyIndex([box('42001', NaN, -77)], [{ geoid: '42001', state_fips: '42' }]));
});

test('county index handles antimeridian polygons without putting geometry on candidate records', async () => {
  const feature = box('02001', 179, -179);
  const tree = createRetainedCountyIndex([feature], [{ geoid: '02001', state_fips: '02' }]);
  for (const longitude of [179.5, -179.5]) {
    const result = await deriveRetainedCountyRelations([row(1, 41, longitude)], tree);
    assert.equal(result.rows[0].county_geoid, '02001'); assert.equal(result.rows[0].reported_state_relation, 'requires-review');
  }
});

test('county derivative cancellation and invalid inspection paths stop before I/O', async () => {
  const signal = AbortSignal.abort(); await assert.rejects(deriveRetainedCountyRelations([], index(), { signal }));
  await assert.rejects(buildRetainedCountyRelations({ signal }));
  await assert.rejects(inspectRetainedCountyRelations('manifest.json'));
});

test('county publication envelope rejects forged earlier dates, future dates and extra claims', () => {
  const runId = '12345678-1234-4234-8234-123456789012';
  const valid = { run_id: runId, created_at: '2026-09-10T15:00:00.000Z', report: { source_registry_created_at: '2026-09-10T13:29:39.322Z' } };
  validateCountyRelationEnvelope(valid, runId);
  for (const created_at of ['1900-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', null, '2026-09-10']) {
    assert.throws(() => validateCountyRelationEnvelope({ ...valid, created_at }, runId));
  }
  assert.throws(() => validateCountyRelationEnvelope({ ...valid, public_export_authorized: true }, runId));
});

test('county cancellation cleanup removes only its owned pending artifact and refuses published evidence', async () => {
  const make = async () => {
    const directory = path.join(APP_ROOT, 'data/retained-childcare-county-relations', randomUUID());
    await mkdir(directory, { recursive: true }); const owner = await lstat(directory, { bigint: true });
    const pending = path.join(directory, 'manifest.pending'); await writeFile(pending, '{}', { flag: 'wx' });
    return { directory, owner, owned: new Map([[pending, await lstat(pending, { bigint: true })]]) };
  };
  const own = await make(); await discardOwnedCountyStaging(own.directory, own.owner, own.owned);
  await assert.rejects(access(own.directory), error => error.code === 'ENOENT');
  const protectedRun = await make(); await writeFile(path.join(protectedRun.directory, 'manifest.json'), '{}', { flag: 'wx' });
  await assert.rejects(discardOwnedCountyStaging(protectedRun.directory, protectedRun.owner, protectedRun.owned));
  await access(path.join(protectedRun.directory, 'manifest.json')); await access(path.join(protectedRun.directory, 'manifest.pending'));
  await assert.rejects(discardOwnedCountyStaging(APP_ROOT, protectedRun.owner, protectedRun.owned));
});

test('actual retained county derivative independently replays pinned inputs offline', {
  skip: !process.env.DATAHUB_TEST_RETAINED_COUNTY_MANIFEST,
}, async () => {
  const result = await inspectRetainedCountyRelations(process.env.DATAHUB_TEST_RETAINED_COUNTY_MANIFEST);
  assert.equal(result.counts.candidate_rows, 12206); assert.equal(result.source_requests_this_build, 0);
  assert.equal(Object.values(result.counts.by_status).reduce((a, b) => a + b, 0), 12206);
  assert.equal(result.counts.by_status['unknown-coordinate-system'], 1476);
  assert.equal(result.counts.by_status['source-not-enabled-for-overlay'], 1772);
  assert.equal(result.counts.by_status['missing-source-point'], 4028);
});
