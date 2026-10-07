import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');

test('state map explicitly remains usable with unresolved and non-ZCTA geography', () => {
  assert.match(source, /Unresolved geography never blocks this map/);
  assert.match(source, /Private and unique ZIPs, zero-population delivery areas, parks, tribal lands/);
  assert.match(source, /reported as unresolved—not silently assigned, counted as missing businesses, or converted to zero/);
  assert.match(source, /state\/cardinal reference area that stays distinct from ZIP and Census boundaries/);
});

test('industry reporting does not depend on an all-business or geocode denominator', () => {
  assert.match(source, /Industry status reports evidence actually retained/);
  assert.match(source, /does not require an all-business denominator, complete geocoding, or nationwide industry completeness/);
});
