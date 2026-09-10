import assert from 'node:assert/strict';
import test from 'node:test';
import { mapReportingCompatibility } from './business-map-compatibility.mjs';

function coverage(origin) {
  return { publisher: { id: 'national-business-coverage-views', version: '2.11.0' },
    tn_childcare_origin: origin, dependencies: [{ dataset_id: 'national-business-registry', publisher_version: '2.15.0' }],
    coverage: origin === null ? {} : { tn_childcare_reporting: { records: 1 } } };
}
test('map supports exact Ohio coverage with recovered, fresh or absent Tennessee', () => {
  for (const origin of [null, 'fresh', 'recovered']) {
    assert.deepEqual(mapReportingCompatibility(coverage(origin)), {
      ohio: true, tennessee: origin !== null, freshTn: origin === 'fresh', registryVersion: '2.15.0',
    });
  }
});
test('map rejects changed publisher, registry, origin, duplicate dependency and future accounting', () => {
  for (const mutate of [m => { m.publisher.id = 'other'; }, m => { m.dependencies[0].publisher_version = '2.14.0'; },
    m => { m.tn_childcare_origin = 'guessed'; }, m => { delete m.tn_childcare_origin; },
    m => { m.dependencies.push(m.dependencies[0]); }, m => { m.publisher.version = '2.12.0'; },
    m => { m.tn_childcare_origin = null; }]) {
    const manifest = coverage('recovered'); mutate(manifest);
    assert.throws(() => mapReportingCompatibility(manifest));
  }
});
