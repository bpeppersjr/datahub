import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/national-epa-echo-active-facility-coverage-status.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function fixture(runnerJson) {
  const slots = [], effects = [], cleanups = [];
  let index = 0;
  const exports = {};
  runInNewContext(code, { exports, AbortController, require: (name) => name === './runner-client' ? { runnerJson } : name === 'react' ? { useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], (next) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }]; }, useEffect(effect) { index += 1; effects.push(effect); } } : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' } : {} });
  return { mount() { this.render(); for (const effect of effects.splice(0)) cleanups.push(effect()); }, unmount() { for (const cleanup of cleanups.splice(0)) cleanup?.(); }, render() { index = 0; return exports.default(); } };
}

const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const textOf = (tree) => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(textOf).join(' ') : tree && typeof tree === 'object' ? textOf(tree.props?.children) : '';
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const view = () => ({ available: true, release: { release_id: 'epa-echo-r1' }, product_label: 'EPA ECHO source-defined active-program-facility coverage', source: { source_date: '2026-08-30', retrieved_at: '2026-09-03T00:24:18.917Z' }, coverage: { active_facility_count: 1517826, state_dc_rows: 51, territory_rows: 5, positive_zip5_rows: 38401, denominator_only_zip5_rows: 3183, reported_zip4_count: 0, retained_coordinate_count: 1517826, centroid_warning_count: 67404, coordinate_accuracy_missing_count: 5154, record_zcta_count: 1490289, record_nonpolygon_count: 27537, air_association_count: 194344, npdes_association_count: 502585, rcra_association_count: 892305, safe_drinking_water_association_count: 50438, toxics_release_inventory_association_count: 21415, greenhouse_gas_reporting_association_count: 5409 } });

test('EPA ECHO panel renders source-bounded counts and no controls', async () => {
  const component = fixture(async (url, options) => { assert.equal(url, '/api/data-operations/national-epa-echo-active-facility-coverage-status'); assert.ok(options.signal); return view(); });
  component.mount();
  await settle();
  const tree = component.render();
  const text = textOf(tree);
  for (const expected of ['1,517,826', '51', '5', '38,401', '3,183', '67,404', '5,154', '1,490,289', '27,537', '892,305', '2026-08-30', '2026-09-03T00:24:18.917Z', 'not all businesses', 'coordinates, geometry']) assert.match(text, new RegExp(expected, 'i'));
  assert.equal(nodes(tree).filter((node) => ['button', 'input', 'select'].includes(node.type)).length, 0);
});

test('EPA ECHO panel rejects stale completion and clears cached evidence on failure', async () => {
  let resolve;
  let signal;
  const stale = fixture((_url, options) => new Promise((done) => { resolve = () => done(view()); signal = options.signal; }));
  stale.mount();
  stale.unmount();
  assert.equal(signal.aborted, true);
  resolve();
  await settle();
  assert.doesNotMatch(textOf(stale.render()), /1,517,826|epa-echo-r1/);
  let reject;
  const failed = fixture(() => new Promise((_done, no) => { reject = no; }));
  failed.mount();
  reject(new Error('fail'));
  await settle();
  assert.match(textOf(failed.render()), /No cached evidence/);
});

test('Data Operations and exact ZIP Business Intelligence include separate EPA ECHO evidence', async () => {
  const operations = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.match(operations, /import NationalEpaEchoActiveFacilityCoverageStatus/);
  assert.match(operations, /<NationalEpaEchoActiveFacilityCoverageStatus \/>/);
  const intelligence = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  for (const expected of [/epa_echo_active_facility_evidence/, /EPA ECHO source-defined active-program-facility evidence/, /Active-program facility records/, /source_date/, /not all businesses/, /Coordinates and geometry are not exposed/]) assert.match(intelligence, expected);
});

