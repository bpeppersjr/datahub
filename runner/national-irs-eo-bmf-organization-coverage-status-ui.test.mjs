import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/national-irs-eo-bmf-organization-coverage-status.tsx', import.meta.url), 'utf8');
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
const view = () => ({ available: true, release: { release_id: 'irs-r1' }, product_label: 'IRS EO BMF current-extract organization filing-address coverage', source: { source_date: '2026-08-11', retrieved_at: '2026-09-03T00:34:47.217Z' }, coverage: { organization_count: 1955841, state_dc_rows: 51, territory_rows: 5, positive_zip5_rows: 36950, denominator_only_zip5_rows: 2267, reported_zip4_count: 1955841, record_zcta_count: 1812739, record_nonpolygon_count: 143102, exempt_status_01_count: 1947718, exempt_status_02_count: 640, exempt_status_12_count: 6637, exempt_status_25_count: 846 } });

test('IRS EO BMF panel renders source-bounded counts and no controls', async () => {
  const component = fixture(async (url, options) => { assert.equal(url, '/api/data-operations/national-irs-eo-bmf-organization-coverage-status'); assert.ok(options.signal); return view(); });
  component.mount();
  await settle();
  const tree = component.render();
  const text = textOf(tree);
  for (const expected of ['1,955,841', '51', '5', '36,950', '2,267', '1,812,739', '143,102', '1,947,718', '2026-08-11', '2026-09-03T00:34:47.217Z', 'not every nonprofit', 'EINs']) assert.match(text, new RegExp(expected, 'i'));
  assert.equal(nodes(tree).filter((node) => ['button', 'input', 'select'].includes(node.type)).length, 0);
});

test('IRS EO BMF panel rejects stale completion and clears cached evidence on failure', async () => {
  let resolve;
  let signal;
  const stale = fixture((_url, options) => new Promise((done) => { resolve = () => done(view()); signal = options.signal; }));
  stale.mount();
  stale.unmount();
  assert.equal(signal.aborted, true);
  resolve();
  await settle();
  assert.doesNotMatch(textOf(stale.render()), /1,955,841|irs-r1/);
  let reject;
  const failed = fixture(() => new Promise((_done, no) => { reject = no; }));
  failed.mount();
  reject(new Error('fail'));
  await settle();
  assert.match(textOf(failed.render()), /No cached evidence/);
});

test('Data Operations and exact ZIP Business Intelligence include separate IRS EO BMF evidence', async () => {
  const operations = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.match(operations, /import NationalIrsEoBmfOrganizationCoverageStatus/);
  assert.match(operations, /<NationalIrsEoBmfOrganizationCoverageStatus \/>/);
  const intelligence = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  for (const expected of [/irs_eo_bmf_organization_evidence/, /IRS EO BMF current-extract organization filing-address evidence/, /Organization filing-address records/, /source_date/, /not every nonprofit/, /EINs, and tax-profile details are not exposed/]) assert.match(intelligence, expected);
});
