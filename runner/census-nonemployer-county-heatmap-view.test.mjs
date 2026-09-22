import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { createCensusNonemployerCountyHeatmapView, joinCountyContextToGeometry } from './census-nonemployer-county-heatmap-view.mjs';

test('county heatmap joins pinned geometry and preserves the explicit Kalawao outside-universe cell', async () => {
  const view = createCensusNonemployerCountyHeatmapView();
  await assert.rejects(view.get({ stateFips: '72', naics: '23' }), /Fixed county heatmap selection pin is invalid/);
  const [hawaii, california, texas, nebraska] = await Promise.all([
    view.get({ stateFips: '15', naics: '23' }), view.get({ stateFips: '06', naics: '23' }), view.get({ stateFips: '48', naics: '23' }), view.get({ stateFips: '31', naics: '23' }),
  ]);
  const kalawao = hawaii.counties.features.find(feature => feature.properties.geoid === '15005');
  assert.equal(kalawao.properties.name, 'Kalawao County');
  assert.equal(kalawao.properties.status, 'outside-retained-native-universe');
  assert.equal(kalawao.properties.value, null);
  assert.equal(hawaii.counties.features.length, 5);
  assert.equal(hawaii.state_denominator.value, 9069);
  assert.equal(hawaii.national_denominator.value, california.national_denominator.value);
  assert.equal(california.national_denominator.value, texas.national_denominator.value);
  const flagged = texas.counties.features.find(feature => feature.properties.geoid === '48301');
  assert.equal(flagged.properties.status, 'published-flagged'); assert.equal(flagged.properties.flag, 'S');
  assert.equal(flagged.properties.value, null); assert.equal(flagged.properties.raw_value, 0);
  assert.equal(nebraska.counties.features.find(feature => feature.properties.geoid === '31009').properties.status, 'not-published');
  assert.equal(hawaii.source_replay_performed_this_read, false);
  assert.equal(hawaii.geography_release_id, 'us-census-geography-20260830-132803990Z-3629abc0');
  assert.equal(Buffer.byteLength(JSON.stringify(texas)) < 5_000_000, true);
});

test('county heatmap differentiates usable, flagged, missing, and outside cells without turning them into zero', () => {
  const cells = new Map([
    ['23:county:01001', { geoid: '01001', measures: { nonemployer_establishments: 0, nonemployer_establishments_raw: 0, nonemployer_establishments_flag: null }, missing_cell: false, provenance: {} }],
    ['23:county:01003', { geoid: '01003', measures: { nonemployer_establishments: null, nonemployer_establishments_raw: 7, nonemployer_establishments_flag: 'S' }, missing_cell: false, provenance: {} }],
    ['23:county:01005', { geoid: '01005', measures: { nonemployer_establishments: null, nonemployer_establishments_raw: null, nonemployer_establishments_flag: null }, missing_cell: true, provenance: {} }],
  ]);
  const features = joinCountyContextToGeometry({ features: ['01001','01003','01005','01007'].map(GEOID => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { GEOID } })) }, cells,
    { stateFips: '01', naics: '23', stateDenominator: 100, nationalDenominator: 1000 });
  assert.equal(features[0].properties.status, 'published-usable');
  assert.equal(features[0].properties.value, 0);
  assert.equal(features[0].properties.county_share_of_state_percent, 0);
  assert.equal(features[1].properties.status, 'published-flagged');
  assert.equal(features[1].properties.value, null);
  assert.equal(features[1].properties.raw_value, 7);
  assert.equal(features[1].properties.flag, 'S');
  assert.equal(features[2].properties.status, 'not-published');
  assert.equal(features[2].properties.missing_cell, true);
  assert.equal(features[3].properties.status, 'outside-retained-native-universe');
  assert.equal(features[3].properties.source_measures, null);
});

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'census-county-heatmap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configBytes = await readFile(path.join(APP_ROOT, 'config/census-nonemployer-county-heatmap.json'));
  const config = JSON.parse(configBytes);
  const files = [
    ['config/census-nonemployer-county-heatmap.json', configBytes],
    [config.context_manifest_path, await readFile(path.join(APP_ROOT, config.context_manifest_path))],
    [config.context_artifact_path, await readFile(path.join(APP_ROOT, config.context_artifact_path))],
    [config.geography_manifest_path, await readFile(path.join(APP_ROOT, config.geography_manifest_path))],
    [`data/geography/releases/${config.geography_release_id}/source/counties/state=15.geojson`, await readFile(path.join(APP_ROOT, `data/geography/releases/${config.geography_release_id}/source/counties/state=15.geojson`))],
  ];
  for (const [relative, bytes] of files) { const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
  return { root, config };
}

test('view rejects a tampered context artifact and tampered selected geometry', async t => {
  const { root, config } = await fixtureRoot(t), view = createCensusNonemployerCountyHeatmapView({ root });
  const pinPath = path.join(root, 'config/census-nonemployer-county-heatmap.json'), pin = JSON.parse(await readFile(pinPath, 'utf8'));
  await writeFile(pinPath, JSON.stringify({ ...pin, context_release_id: 'untrusted-current-release' }));
  await assert.rejects(view.get({ stateFips: '15', naics: '23' }), /Fixed county heatmap selection pin is invalid/);
  await writeFile(pinPath, JSON.stringify(pin));
  const manifestPath = path.join(root, config.context_manifest_path), manifest = await readFile(manifestPath);
  const corruptedManifest = Buffer.from(manifest); corruptedManifest[20] ^= 1; await writeFile(manifestPath, corruptedManifest);
  await assert.rejects(view.get({ stateFips: '15', naics: '23' }), /integrity check failed/);
  await writeFile(manifestPath, manifest);
  const contextPath = path.join(root, config.context_artifact_path), context = await readFile(contextPath);
  context[100] ^= 1; await writeFile(contextPath, context);
  await assert.rejects(view.get({ stateFips: '15', naics: '23' }), /integrity check failed/);
  await writeFile(contextPath, await readFile(path.join(APP_ROOT, config.context_artifact_path)));
  const geometryPath = path.join(root, `data/geography/releases/${config.geography_release_id}/source/counties/state=15.geojson`);
  const geometry = await readFile(geometryPath); geometry[100] ^= 1; await writeFile(geometryPath, geometry);
  await assert.rejects(view.get({ stateFips: '15', naics: '23' }), /integrity check failed/);
  const info = await lstat(geometryPath); assert.equal(info.isFile(), true);
  await writeFile(geometryPath, await readFile(path.join(APP_ROOT, `data/geography/releases/${config.geography_release_id}/source/counties/state=15.geojson`)));
  const geographyManifestPath = path.join(root, config.geography_manifest_path), geographyManifest = await readFile(geographyManifestPath);
  const corruptedGeographyManifest = Buffer.from(geographyManifest); corruptedGeographyManifest[20] ^= 1; await writeFile(geographyManifestPath, corruptedGeographyManifest);
  await assert.rejects(view.get({ stateFips: '15', naics: '23' }), /integrity check failed/);
});
