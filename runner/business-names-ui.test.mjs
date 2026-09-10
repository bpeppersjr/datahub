import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const defaults = { selectedZip: '', stateFips: '47', stateName: 'Tennessee', categoryId: 'childcare', canDrill: true };
const response = { available: true, zip_code: null, scope: 'source-zip-unavailable', total: 1, local_review_only: true, records: [{
  business_name: 'Fixture Center', address: { street: '1 Main St', street2: 'Suite 4', city: 'Nashville', state: 'TN', zip_code: null, zip4: null }, geocode: null, category_id: 'childcare',
}] };
const settle = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }
function text(tree) { return tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children); }
const scopeControl = tree => nodes(tree).find(node => node.props?.['aria-label'] === 'Business name address scope');
const filter = tree => nodes(tree).find(node => node.props?.['aria-label'] === 'Filter business names');
function fixture(request, initialProps = {}) {
  const values = [], effects = [], timers = new Map(); let index = 0, effectIndex = 0, nextTimer = 0, props = { ...defaults, ...initialProps }, writes = 0;
  const exports = {};
  runInNewContext(`${code}\nexports.TestNames = BusinessNames; exports.TestSummary = EntitySummary;`, {
    exports, URLSearchParams,
    window: { setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); } },
    require: name => name === './retained-county-panel' ? { default: function RetainedCountyPanel() {} } : name === './retained-childcare-panel' ? { default: function RetainedChildcarePanel() {} } : name === './runner-client' ? { runnerJson: request } : name === 'react' ? {
      useState(value) { const i = index++; if (!(i in values)) values[i] = value; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; writes++; }]; },
      useEffect(effect, deps) { const i = effectIndex++, previous = effects[i]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) { previous?.cleanup?.(); effects[i] = { deps, pending: effect }; } },
    } : require(name),
  });
  return {
    render(changes = {}) { props = { ...props, ...changes }; index = 0; effectIndex = 0; const tree = exports.TestNames(props); for (const effect of effects) if (effect.pending) { effect.cleanup = effect.pending(); delete effect.pending; } return tree; },
    flush() { const pending = [...timers.values()]; timers.clear(); for (const timer of pending) timer.callback(); },
    delays() { return [...timers.values()].map(timer => timer.delay); },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
    writes() { return writes; }, summary: exports.TestSummary,
  };
}

test('state ZIP-unavailable scope uses authenticated state endpoint and preserves nullable postal fields', async () => {
  const calls = [], f = fixture(async url => { calls.push(url); return response; });
  let tree = f.render(); f.flush(); assert.equal(calls.length, 0);
  scopeControl(tree).props.onChange({ target: { value: 'missing' } }); f.render(); f.flush(); await settle(); tree = f.render();
  const url = new URL(calls[0], 'http://fixture'); assert.equal(url.pathname, '/api/business-map/state-names');
  assert.equal(url.searchParams.get('state'), '47'); assert.equal(url.searchParams.has('zip'), false); assert.equal(url.searchParams.get('category'), 'childcare'); assert.equal(url.searchParams.get('limit'), '25');
  assert.match(text(tree), /Fixture Center/); assert.match(text(tree), /Suite 4/); assert.match(text(tree), /ZIP unavailable/); assert.doesNotMatch(text(tree), /null|undefined/);
  assert.match(text(tree), /not just the selected county/); assert.match(text(tree), /Local review only/);
});

test('ZIP scope remains separate with separate ZIP4 display and debounced name filtering', async () => {
  const calls = [], zipResponse = structuredClone(response); zipResponse.records[0].address.zip_code = '37201'; zipResponse.records[0].address.zip4 = '0123';
  const f = fixture(async url => { calls.push(url); return zipResponse; }, { selectedZip: '37201' });
  f.render(); f.flush(); await settle(); let tree = f.render();
  assert.equal(new URL(calls[0], 'http://fixture').pathname, '/api/business-map/names'); assert.match(text(tree), /37201 \+4 0123/); assert.doesNotMatch(text(tree), /37201-0123/);
  filter(tree).props.onChange({ target: { value: 'A & B' } }); tree = f.render(); assert.doesNotMatch(text(tree), /Fixture Center/); assert.deepEqual(f.delays(), [220]); f.flush(); await settle(); tree = f.render();
  const url = new URL(calls[1], 'http://fixture'); assert.equal(url.searchParams.get('query'), 'A & B'); assert.equal(url.searchParams.get('zip'), '37201'); assert.equal(url.searchParams.has('state'), false);
});

test('old scope responses cannot replace new names and unmounted requests cannot write state', async () => {
  const pending = [], f = fixture(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), { selectedZip: '37201' });
  let tree = f.render(); f.flush(); scopeControl(tree).props.onChange({ target: { value: 'missing' } }); f.render(); f.flush();
  pending[1].resolve(response); await settle(); tree = f.render(); assert.match(text(tree), /Fixture Center/);
  pending[0].resolve({ ...response, records: [{ ...response.records[0], business_name: 'Stale ZIP Name' }] }); await settle(); assert.doesNotMatch(text(f.render()), /Stale ZIP Name/);
  filter(tree).props.onChange({ target: { value: 'later' } }); f.render(); f.flush(); f.unmount(); const before = f.writes();
  pending[2].reject(new Error('late error')); await settle(); assert.equal(f.writes(), before);
});

test('no state selection or organization-only category cannot issue missing-ZIP requests', () => {
  for (const props of [{ stateFips: '' }, { canDrill: false, selectedZip: '37201' }]) {
    const f = fixture(() => assert.fail('must not query'), props), tree = f.render(); assert.equal(scopeControl(tree), undefined); f.flush(); f.unmount();
  }
});

test('unavailable evidence, valid empty result and request failures have different visible states', async () => {
  for (const [kind, expected] of [['unavailable', /No compatible published evidence/], ['empty', /No matching physical-location names/], ['error', /Unable to load names/]]) {
    const f = fixture(async () => { if (kind === 'error') throw 'failed'; return { ...response, available: kind !== 'unavailable', records: [], total: 0 }; });
    scopeControl(f.render()).props.onChange({ target: { value: 'missing' } }); f.render(); f.flush(); await settle(); const result = text(f.render()); assert.match(result, expected);
    if (kind === 'unavailable') assert.doesNotMatch(result, /No matching physical-location names/);
    f.unmount();
  }
});

test('right-side summary wires state/category/ZIP resets and uses published percentage semantics', () => {
  const f = fixture(() => {});
  const tree = f.summary({ feature: { properties: { level: 'county', state_fips: '47', name: 'County' } }, category: { id: 'childcare', business_name_drilldown: true }, selectedZip: '37201', stateFips: '26', stateSummary: {
    available: true, states: [], national_category_counts: {}, national_all_category_evidence_count: 0, national_category_percent_of_collected_evidence: {}, assignment: { semantics: 'Includes disjoint source ZIP-unavailable evidence.' },
  } });
  const drill = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'BusinessNames');
  const retained = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'RetainedChildcarePanel');
  assert.equal(retained.props.selectedZip, '37201'); assert.equal(retained.props.countySelected, true);
  assert.equal(retained.props.scopeUnavailable, true); assert.equal(retained.props.publisherState, undefined);
  assert.equal(drill.props.stateFips, '47'); assert.equal(drill.key, '47:37201:childcare'); assert.match(text(tree), /Includes disjoint source ZIP-unavailable evidence/);
  assert.match(text(tree), /percentage of all U.S. businesses collected is unknown/);
});
