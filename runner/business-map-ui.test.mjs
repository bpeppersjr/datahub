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
  runInNewContext(`${code}\nexports.Map = FeatureMap; exports.BusinessPage = BusinessEvidenceMap; exports.Goal = GoalCompletionSummary;`, { exports, URLSearchParams, require: id => id === 'react' ? {
    useState: initial => { const i = index++; return [i in values ? values[i] : initial, next => { values[i] = next; }]; },
    useMemo: factory => factory(), useEffect: () => {},
  } : id.startsWith('./') ? { default: () => null } : require(id) });
  return { map: props => { index = 0; return exports.Map(props); }, page: () => { index = 0; return exports.BusinessPage(); }, goal: (state, categoryId) => { index = 0; return exports.Goal({ state, categoryId }); }, wrapper:()=>{index=0;return exports.default();} };
}

test('credential mode replaces business subtree so incompatible selections reset on switching',()=>{
  const values=['business'],h=harness(values);
  assert.equal(nodes(h.wrapper()).some(node=>node.type?.name==='BusinessEvidenceMap'),true);
  nodes(h.wrapper()).find(node=>node.type==='select').props.onChange({target:{value:'credentials'}});
  assert.equal(nodes(h.wrapper()).some(node=>node.type?.name==='BusinessEvidenceMap'),false);
  nodes(h.wrapper()).find(node=>node.type==='select').props.onChange({target:{value:'business'}});
  assert.equal(nodes(h.wrapper()).some(node=>node.type?.name==='BusinessEvidenceMap'),true);
});
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
  const values = [catalog, null, '', null, '', false, response(), JSON.stringify(['childcare', 'business_count', 'counties', '42', '', '', '']), null,
    null, null, null, 'counties', 'childcare', 'retained_childcare_county_points', '', '', '42', 'Pennsylvania', '', '', false, ''];
  const h = harness(values);
  assert.equal(nodes(h.page()).some(node => node.type?.name === 'FeatureMap'), false);
  values[7] = JSON.stringify(current);
  assert.equal(nodes(h.page()).some(node => node.type?.name === 'FeatureMap'), true);
});

test('Heatmap ZIP summary keeps registry ZIP5, Census ZCTA, USPS assignments, and completion claims separate', () => {
  const summary = {
    national_zip_coverage: {
      registry_zip5: { members: { count: 42000 }, record_level_source_contribution: { count: 31000 }, denominator_only_no_record_level_contribution: { count: 11000 } },
      census_zcta: { same_code_governed_zcta_members: { count: 33120 }, statistical_geography_not_usps_postal_delivery_boundary: true },
      usps_assignment: { governed_dependency_present: false, assignment_members: null, complete_current_assignment_denominator_verified: false },
      claim_boundary: { active_business_completion_percentage: null, all_business_completion_percentage: null },
    },
    classification: { classes: {
      explicit_placeholder: { count: 10 }, valid_format_same_code_governed_zcta: { count: 20000 },
      valid_format_source_reported_no_same_code_zcta: { count: 11000 }, valid_format_denominator_only_no_same_code_zcta: { count: 11000 },
    } }, usps_operational_status: null, usps_evidence_status: 'unverified',
  };
  const catalog = { available: true, coverage_release_id: 'coverage', categories: [], enhancers: [], category_groups: [], semantics: {} };
  const tree = harness([catalog, summary]).page();
  const note = nodes(tree).find(node => node.props?.['data-testid'] === 'zip-quality-note');
  assert.ok(note);
  const rendered = text(note);
  for (const phrase of ['Registry ZIP5 total: 42,000', 'same-code Census ZCTA members: 33,120', 'source-contributed ZIP5: 31,000', 'denominator-only ZIP5: 11,000', 'USPS governed assignment denominator: not verified', 'Active-business completion remains unknown (null)', 'a ZCTA is not a USPS boundary', 'ZIP totals do not measure business coverage']) assert.ok(rendered.includes(phrase), phrase);
  assert.doesNotMatch(rendered, /business completion[^.]*100%/i);
});

test('all-state goal matrix renders freshness and authorization counts without implying completeness', () => {
  const view = { available: true, status: 'verified-immutable-release', release_id: 'matrix', category: 'retail-consumer', all_business_completion_percent: null,
    broad_layer_gaps: 1, denominator: { version: 'fixture' }, selected: null,
    jurisdictions: [{ code: 'AL', name: 'Alabama', available: 1, denominator: 1, measured: 1, unmeasured: 0, measurement_status: 'measured', percent: 100,
      temporal_status_counts: { 'review-due': 1 }, authorization_state_counts: { blocked: 1 }, broad_layer_gap: true }] };
  const tree = harness([view, false]).goal(undefined, 'retail-consumer');
  const rendered = text(tree);
  assert.match(rendered, /Temporal status counts/);
  assert.match(rendered, /Authorization state counts/);
  assert.match(rendered, /review due: 1/);
  assert.match(rendered, /blocked: 1/);
  assert.match(rendered, /separate from dataset availability/);
  assert.match(rendered, /All-business completion has no authoritative denominator and remains null/);
});

test('selected goal evidence labels D.C. geocoding at source-profile scope', () => {
  const view = { available: true, status: 'verified-immutable-release', release_id: 'matrix', category: 'general-business', all_business_completion_percent: null,
    broad_layer_gaps: 0, denominator: { version: 'fixture' },
    selected: { code: 'DC', name: 'District of Columbia', category: { category_id: 'general-business',
      dataset_availability: { available: 1, denominator: 1, measured: 1, unmeasured: 0, measurement_status: 'measured', percent: 100 },
      datasets: [{ dataset_id: 'dc-basic-business-license-sites', label: 'D.C. Basic Business Licenses', availability_status: 'available', state_record_count: 54_890,
        authorization: { state: 'retained-governed-source' }, temporal_status: { status: 'current-source-snapshot' },
        geocode_rate: { percent: 77.88, scope: 'source-profile level; not a D.C.-address-state rate' }, gap_reason: null }] } }, jurisdictions: [] };
  const rendered = text(harness([view, false]).goal('DC', 'all'));
  assert.match(rendered, /source geocoded: 77\.88%/);
  assert.match(rendered, /not a D\.C\.-address-state rate/);
  assert.doesNotMatch(rendered, /D\.C\. geocoding: 77\.88%/);
});

test('selected Texas goal evidence keeps geocoding unmeasured despite state-wide coordinates', () => {
  const view = { available: true, status: 'verified-immutable-release', release_id: 'matrix', category: 'general-business', all_business_completion_percent: null,
    broad_layer_gaps: 0, denominator: { version: 'fixture' },
    selected: { code: 'TX', name: 'Texas', category: { category_id: 'general-business',
      dataset_availability: { available: 1, denominator: 1, measured: 1, unmeasured: 0, measurement_status: 'measured', percent: 100 },
      datasets: [{ dataset_id: 'tx_active_sales_tax_permit_outlets', label: 'Texas Active Sales Tax Permits', availability_status: 'available', state_record_count: 885093,
        authorization: { state: 'retained-governed-source' }, temporal_status: { status: 'current-source-snapshot' },
        geocode_rate: { percent: null, assigned: null, eligible: null, status: 'unmeasured-at-source-level' }, gap_reason: null }] } }, jurisdictions: [] };
  const rendered = text(harness([view, false]).goal('TX', 'all'));
  assert.match(rendered, /source geocoded: —/);
  assert.doesNotMatch(rendered, /28,374|28\.374%|source geocoded: \d/);
});

test('exact ZIP inspector requests the selected category and aborts stale ZIP/category responses', async () => {
  const values = [{ available: true, coverage_release_id: 'coverage', categories: [], enhancers: [], category_groups: [], semantics: {} }, null, '10001'];
  const effects = [], pending = [], componentExports = {}; let index = 0, effectIndex = 0;
  runInNewContext(`${code}\nexports.Page = BusinessEvidenceMap;`, {
    exports: componentExports, URLSearchParams, AbortController, window: { setTimeout: () => 1, clearTimeout() {} },
    require: name => name === './runner-client' ? { runnerJson: (url, options = {}) => url.includes('/zip-inspector?') ? new Promise(resolve => pending.push({ url, options, resolve })) : new Promise(() => {}) }
      : name === 'react' ? {
        useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }]; },
        useMemo: factory => factory(),
        useEffect(effect, deps) { const slot = effectIndex++, prior = effects[slot]; if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) { prior?.cleanup?.(); effects[slot] = { effect, deps, cleanup: null }; } },
      } : name.startsWith('./') ? { default: function Stub() { return null; } } : require(name),
  });
  const render = () => { index = 0; effectIndex = 0; const tree = componentExports.Page(); for (const slot of effects) if (slot?.cleanup === null) slot.cleanup = slot.effect(); return tree; };
  const detail = (zip, categoryId, pharmacy_evidence = null) => ({ zip5: zip, evidence_status: 'selected-evidence-present', governed_zcta: { status: 'included', geoid: zip }, contributions: [], coverage_gap_codes: [], limitations: [], denominator_semantics: '', employer_alignment: { percent: null }, zip_quality: {}, bindings: { coverage_release_id: 'c', registry_release_id: 'r', geography_release_id: 'g' }, pharmacy_evidence, category_evidence: { category_id: categoryId, category_label: categoryId === 'all' ? 'All source categories' : categoryId, status: 'no-selected-positive-evidence', positive_source_contributions: [], completeness_percent: null, bindings: { coverage_release_id: 'c', registry_release_id: 'r', registry_manifest_sha256: 'm', zip_quality_audit_id: 'audit' }, semantics: 'No selected positive evidence, not a measured zero or completeness result.' } });
  let tree = render();
  const input = () => nodes(tree).find(node => node.props?.['aria-label'] === 'Inspect exact ZIP5');
  assert.equal(pending.length, 1);
  input().props.onChange({ target: { value: '20002' } });
  tree = render();
  assert.equal(pending.length, 2);
  assert.match(pending[1].url, /category=all/);
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(detail('20002', 'all'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(values[2], '20002'); assert.equal(values[3]?.zip5, '20002');
  values[13] = 'health-care';
  tree = render();
  assert.equal(pending.length, 3);
  assert.match(pending[2].url, /category=health-care/);
  assert.equal(pending[1].options.signal.aborted, true);
  assert.doesNotMatch(text(tree), /category evidence for ZIP/);
  values[13] = 'retail-consumer';
  tree = render();
  assert.equal(pending.length, 4);
  assert.match(pending[3].url, /category=retail-consumer/);
  assert.equal(pending[2].options.signal.aborted, true);
  pending[2].resolve(detail('20002', 'health-care'));
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(values[3]?.category_evidence?.category_id, 'health-care');
  pending[3].resolve(detail('20002', 'retail-consumer', { zip_code: '20002', evidence_scope: 'positive-source-reported-primary-address-evidence', reported_address_count: 7, unique_npi_count: 6, reported_zip4_count: 4, mail_order_taxonomy_assertion_count: 1, source: { dataset_id: 'national-pharmacy-industry-coverage', release_id: 'pharmacy-r1' }, limitations: ['Not a current-operation assertion.'] }));
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert.equal(values[3]?.category_evidence?.category_id, 'retail-consumer');
  assert.match(text(tree), /No selected positive evidence is available for this category and ZIP/);
  assert.match(text(tree), /not a measured zero/);
  assert.match(text(tree), /Pharmacy evidence for exact ZIP 20002/);
  assert.match(text(tree), /Reported primary addresses7/);
  assert.match(text(tree), /Unique organization NPIs6/);
  assert.match(text(tree), /national-pharmacy-industry-coverage/);
  assert.match(text(tree), /Not a current-operation assertion/);
  pending[0].resolve(detail('10001', 'all'));
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert.equal(values[3]?.zip5, '20002'); assert.doesNotMatch(text(tree), /governed Census ZCTA 10001/);
});
