import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');

test('state map explicitly remains usable with unresolved and non-ZCTA geography', () => {
  assert.match(source, /Unresolved geography never blocks this map/);
  assert.match(source, /Private or unique ZIPs can have no corresponding Census ZCTA or population estimate/);
  assert.match(source, /parks, protected public lands, tribal lands, private property/);
  assert.match(source, /retained areas outside ZCTAs by state and compass direction/);
  assert.match(source, /Park, tribal, and private-property classifications require separate source evidence/);
});

test('industry reporting does not depend on an all-business or geocode denominator', () => {
  assert.match(source, /Industry status reports evidence actually retained/);
  assert.match(source, /does not require an all-business denominator, complete geocoding, or nationwide industry completeness/);
});
