import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/national-fsis-active-establishment-coverage-status.tsx', import.meta.url), 'utf8');
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
const view = () => ({ available: true, release: { release_id: 'fsis-r1' }, product_label: 'USDA FSIS source-defined active establishment coverage', source: { source_date: '2026-08-24', retrieved_at: '2026-09-03T00:22:10.046Z' }, coverage: { active_establishment_count: 7237, state_dc_rows: 51, territory_rows: 5, positive_zip5_rows: 4367, denominator_only_zip5_rows: 33492, reported_zip4_count: 113, retained_coordinate_count: 7237, missing_coordinate_count: 0, record_zcta_count: 7152, record_nonpolygon_count: 85 } });

test('FSIS panel renders source-bounded counts and no controls', async () => {
  const component = fixture(async (url, options) => { assert.equal(url, '/api/data-operations/national-fsis-active-establishment-coverage-status'); assert.ok(options.signal); return view(); });
  component.mount();
  await settle();
  const tree = component.render();
  const text = textOf(tree);
  for (const expected of ['7,237', '51', '5', '4,367', '33,492', '113', '7,152', '85', '2026-08-24', '2026-09-03T00:22:10.046Z', 'not all food businesses', 'coordinates, geometry']) assert.match(text, new RegExp(expected, 'i'));
  assert.equal(nodes(tree).filter((node) => ['button', 'input', 'select'].includes(node.type)).length, 0);
});

test('FSIS panel rejects stale completion and clears cached evidence on failure', async () => {
  let resolve;
  let signal;
  const stale = fixture((_url, options) => new Promise((done) => { resolve = () => done(view()); signal = options.signal; }));
  stale.mount();
  stale.unmount();
  assert.equal(signal.aborted, true);
  resolve();
  await settle();
  assert.doesNotMatch(textOf(stale.render()), /7,237|fsis-r1/);
  let reject;
  const failed = fixture(() => new Promise((_done, no) => { reject = no; }));
  failed.mount();
  reject(new Error('fail'));
  await settle();
  assert.match(textOf(failed.render()), /No cached evidence/);
});

test('Data Operations and exact ZIP Business Intelligence include separate FSIS evidence', async () => {
  const operations = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.match(operations, /import NationalFsisActiveEstablishmentCoverageStatus/);
  assert.match(operations, /<NationalFsisActiveEstablishmentCoverageStatus \/>/);
  const intelligence = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  for (const expected of [/fsis_active_establishment_evidence/, /USDA FSIS source-defined active establishment evidence/, /Active-directory establishment records/, /source_date/, /not all food businesses/, /Coordinates and geometry are not exposed/]) assert.match(intelligence, expected);
});
