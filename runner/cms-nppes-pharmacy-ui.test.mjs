import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('pharmacy mode is a distinct non-additive source layer', async () => {
  const ui = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  const mapStore = await readFile(new URL('./business-map-store.mjs', import.meta.url), 'utf8');
  assert.match(ui, /value="pharmacy"/);
  assert.match(ui, /NppesPharmacyHeatmap/);
  assert.doesNotMatch(mapStore, /cms-nppes-community-retail-pharmacies/);
  assert.doesNotMatch(mapStore, /3336C0003X/);
});
