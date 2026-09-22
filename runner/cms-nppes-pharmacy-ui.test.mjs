import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('pharmacy mode is a distinct non-additive source layer', async () => {
  const ui = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  const mapStore = await readFile(new URL('./business-map-store.mjs', import.meta.url), 'utf8');
  const pharmacy = await readFile(new URL('../app/nppes-pharmacy-heatmap.tsx', import.meta.url), 'utf8');
  assert.match(ui, /value="pharmacy"/);
  assert.match(ui, /NppesPharmacyHeatmap/);
  assert.doesNotMatch(mapStore, /cms-nppes-community-retail-pharmacies/);
  assert.doesNotMatch(mapStore, /3336C0003X/);
  assert.match(pharmacy, /<svg[^>]+onWheel=\{wheel\}/);
  assert.doesNotMatch(pharmacy, /<svg[^>]+role="img"/);
  assert.match(pharmacy, /<path[^>]+role="button"/);
  assert.match(pharmacy, /role="group"/);
  assert.match(pharmacy, /key=\{feature\.properties\.geoid\}/);
  assert.match(pharmacy, /Ctrl\+scroll/);
  assert.match(pharmacy, /pharmacies\/map/);
  assert.match(pharmacy, /AbortController/);
  assert.match(pharmacy, /County view: unavailable/);
  assert.match(pharmacy, /global_nonpolygon_count/);
  assert.match(pharmacy, /aria-label="Pharmacy map state"/);
});
