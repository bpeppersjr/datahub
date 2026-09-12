import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetRepresentation } from './dataset-representation.mjs';

test('denominator includes unavailable configured sources and excludes state-only plans', () => {
  const plan = { states: ['IL', 'DC'], industries: { health: ['national-nppes-organizations'], nonprofit: ['national-irs-eo-bmf'], local: ['local'] }, sources: {
    'national-nppes-organizations': { scope: 'national', states: 'all' },
    'national-irs-eo-bmf': { scope: 'national', states: 'all' }, local: { scope: 'state' },
  } };
  const result = datasetRepresentation(plan, [{ postal_abbreviation: 'IL', registry_evidence: { source_profile_counts_by_reported_address_state: { 'cms-nppes-monthly-v2': 20 } } }], [{ source_key: 'irs_eo_bmf_organizations', release_metadata: { release_id: 'retained' } }]);
  assert.equal(result.states[0].percent, 50);
  assert.equal(result.states[0].expected, 2);
  assert.equal(result.states[0].datasets[1].nationalReleasePresent, true);
  assert.equal(result.states[0].datasets[1].stateRecordCount, null);
  assert.equal(result.states[1].unmeasured, 2);
  assert.equal(result.states[0].industries[2].percent, null);
  assert.equal(result.allBusinessesPercent, null);
});

test('zero is measured absence and unknown projection remains unmeasured', () => {
  const result = datasetRepresentation({ states: ['IL'], industries: {}, sources: { 'national-snap-retailers': { scope: 'national', states: 'all' }, future: { scope: 'national', states: 'all' } } }, [{ postal_abbreviation: 'IL', registry_evidence: { source_profile_counts_by_reported_address_state: { 'usda-snap-current-retailers': 0 } } }], []);
  assert.equal(result.states[0].datasets[0].status, 'no-state-records');
  assert.equal(result.states[0].datasets[1].stateRecordCount, null);
  assert.equal(result.states[0].unmeasured, 1);
});
