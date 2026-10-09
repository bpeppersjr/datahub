import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');

test('residual geometry route is separate, selected-state-only, and fail-closed', () => {
  assert.match(source, /census-zcta-residual-geometry/);
  assert.match(source, /getAll\('state'\)\.length!==1/);
  assert.match(source, /readCensusZctaResidualGeometryView\(\{state:url\.searchParams\.get\('state'\)\}\)/);
  assert.match(source, /Residual geometry is unavailable; the base map remains available\./);
  assert.doesNotMatch(source, /census-zcta-residual-geometry[^\n]+(?:offset|direction)/);
});
