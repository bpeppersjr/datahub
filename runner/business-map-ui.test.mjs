import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
function harness(values) {
  let index = 0; const exports = {};
  runInNewContext(`${code}\nexports.Map = FeatureMap;`, { exports, URLSearchParams, require: id => id === 'react' ? {
    useState: initial => { const i = index++; return [i in values ? values[i] : initial, next => { values[i] = next; }]; },
    useMemo: factory => factory(), useEffect: () => {},
  } : id.startsWith('./') ? { default: () => null } : require(id) });
  return { map: props => { index = 0; return exports.Map(props); }, page: () => { index = 0; return exports.default(); } };
}
function response(value = 20) {
  return { available: true, level: 'counties', category_id: 'childcare', enhancer_id: 'retained_childcare_county_points', meta: { heat_max: value },
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-78, 40], [-77, 40], [-77, 41], [-78, 40]]] },
      properties: { geoid: '42001', name: 'Example county', heat_value: value, observed_business_units: 999,
        retained_childcare_county_status: 'available-source-points' } }] };
}
test('map hover reconciles selected geoid against new response and uses source-point accessibility labels', () => {
  const h = harness([1, '42001']);
  const props = { data: response(), selectedGeoid: '', categoryLabel: 'Childcare', enhancerLabel: 'Retained points', onSelect: () => {} };
  const first = h.map(props), label = nodes(first).find(node => node.type === 'path').props['aria-label'];
  assert.match(label, /20 assigned retained childcare source points/); assert.doesNotMatch(label, /999|provisional business/);
  const second = h.map({ ...props, data: response(33) });
  assert.match(text(second), /33 assigned retained childcare source points/);
  assert.doesNotMatch(text(second), /20 assigned/);
  const empty = h.map({ ...props, data: { ...response(), features: [] } });
  assert.equal(nodes(empty).some(node => node.props?.className === 'map-tooltip'), false);
});
test('selection change withholds previous map response before effects run', () => {
  const catalog = { available: true, categories: [], enhancers: [], category_groups: [], semantics: {} };
  const current = ['childcare', 'retained_childcare_county_points', 'counties', '42', '', '', ''];
  const values = [catalog, response(), JSON.stringify(['childcare', 'business_count', 'counties', '42', '', '', '']), null,
    null, null, null, 'counties', 'childcare', 'retained_childcare_county_points', '', '', '42', 'Pennsylvania', '', '', false, ''];
  const h = harness(values);
  assert.equal(nodes(h.page()).some(node => node.type?.name === 'FeatureMap'), false);
  values[2] = JSON.stringify(current);
  assert.equal(nodes(h.page()).some(node => node.type?.name === 'FeatureMap'), true);
});
