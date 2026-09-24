import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/national-cms-nppes-organization-practice-location-coverage-status.tsx', import.meta.url), 'utf8');
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
const view = () => ({ available: true, release: { release_id: 'nppes-r1' }, product_label: 'CMS NPPES active organization practice-location coverage', source: { source_date: '2026-08-09', retrieved_at: '2026-08-30T14:13:17.460Z' }, coverage: { active_organization_npis: 1959633, organizations_without_valid_us_primary_zip: 1544, practice_location_count: 2088780, primary_practice_location_count: 1958089, non_primary_practice_location_count: 130691, deduplicated_practice_location_rows: 1606, state_dc_rows: 51, territory_rows: 5, military_rows: 3, associated_state_rows: 2, positive_zip5_rows: 28056, denominator_only_zip5_rows: 10630, reported_zip4_location_count: 1908009, location_zcta_count: 2081726, location_nonpolygon_count: 7054 } });

test('CMS NPPES panel renders source-bounded counts and no controls', async () => {
  const component = fixture(async (url, options) => { assert.equal(url, '/api/data-operations/national-cms-nppes-organization-practice-location-coverage-status'); assert.ok(options.signal); return view(); });
  component.mount();
  await settle();
  const tree = component.render();
  const text = textOf(tree);
  for (const expected of ['1,959,633', '2,088,780', '1,958,089', '130,691', '1,606', '51', '5', '28,056', '10,630', '1,908,009', '2,081,726', '7,054', '2026-08-09', '2026-08-30T14:13:17.460Z', 'licensure', 'NPIs']) assert.match(text, new RegExp(expected, 'i'));
  assert.equal(nodes(tree).filter((node) => ['button', 'input', 'select'].includes(node.type)).length, 0);
});

test('CMS NPPES panel rejects stale completion and clears cached evidence on failure', async () => {
  let resolve;
  let signal;
  const stale = fixture((_url, options) => new Promise((done) => { resolve = () => done(view()); signal = options.signal; }));
  stale.mount();
  stale.unmount();
  assert.equal(signal.aborted, true);
  resolve();
  await settle();
  assert.doesNotMatch(textOf(stale.render()), /2,088,780|nppes-r1/);
  let reject;
  const failed = fixture(() => new Promise((_done, no) => { reject = no; }));
  failed.mount();
  reject(new Error('fail'));
  await settle();
  assert.match(textOf(failed.render()), /No cached evidence/);
});

test('Data Operations and exact ZIP Business Intelligence include separate CMS NPPES evidence', async () => {
  const operations = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.match(operations, /import NationalCmsNppesOrganizationPracticeLocationCoverageStatus/);
  assert.match(operations, /<NationalCmsNppesOrganizationPracticeLocationCoverageStatus \/>/);
  const intelligence = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  for (const expected of [/cms_nppes_organization_practice_location_evidence/, /CMS NPPES active organization practice-location evidence/, /Reported practice-location records/, /source_date/, /proof of licensure/, /Names, NPIs, addresses, telephone numbers, and taxonomies are not exposed/]) assert.match(intelligence, expected);
});
