import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { readOperationalIndustryEvidenceSummary } from './operational-industry-evidence-summary.mjs';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(`${source}\nexports.crosswalkValidator = validOperationalIndustryCrosswalkView;\nexports.crosswalkStatus = OperationalIndustryCrosswalkStatus;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });
const text = tree => tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object'
  ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(request = async () => assert.fail('Unexpected request')) {
  const exports = {}, slots = [], effects = [], cleanups = [];
  let cursor = 0, mounted = false;
  runInNewContext(code, {
    exports, AbortController,
    require: name => name === './runner-client' ? { runnerJson: request }
      : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' }
        : name === 'react' ? {
          useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; },
          useEffect(effect) { if (!mounted) effects.push(effect); },
        } : name.startsWith('../config/') ? { default: require(name) } : {},
  });
  return {
    valid: value => exports.crosswalkValidator(value, 'NJ'),
    render() {
      cursor = 0;
      const tree = exports.crosswalkStatus({ state: 'NJ' });
      if (!mounted) { mounted = true; effects.splice(0).forEach(effect => cleanups.push(effect())); }
      return tree;
    },
    close: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

const view = await readOperationalIndustryEvidenceSummary({ state: 'NJ' });
const row = value => value.industries.find(item => item.id === 'retail-consumer');
const dimension = value => row(value).dimensions[0];

test('operational crosswalk renders all nine validated industries and retained provenance', async () => {
  const h = harness(async url => {
    assert.equal(url, '/api/business-map/operational-industry-evidence?state=NJ');
    return structuredClone(view);
  });
  assert.equal(h.valid(view), true);
  h.render(); await flush();
  const tree = h.render(), rendered = text(tree);
  assert.match(rendered, /New Jersey · operational industry evidence/);
  assert.match(rendered, /596 governed state ZCTA ZIP5 keys/);
  assert.match(rendered, /57\.9%/);
  assert.match(rendered, /Dimension evidence availability 85\.7%/);
  assert.match(rendered, /2,414 \/ 4,172 ZIP5-by-source-dimension cells/);
  assert.match(rendered, /NPPES_Data_Dissemination_August_2026_V2/);
  assert.equal(nodes(tree).filter(node => node.type === 'strong' && /%$/.test(text(node))).length, 9);
  assert.doesNotMatch(rendered, /evidence is unavailable/);
  h.close();
});

test('operational crosswalk rejects altered, nonnumeric, missing and nonfinite percentages', () => {
  const h = harness();
  for (const key of ['dimension_evidence_availability_percent', 'exact_zip_measurement_reach_percent']) {
    for (const value of [null, undefined, '57.9', {}, NaN, Infinity, -1, 101, 0, 57.9001]) {
      const invalid = structuredClone(view); row(invalid)[key] = value;
      assert.equal(h.valid(invalid), false, `${key}: ${String(value)}`);
    }
    const invalid = structuredClone(view); row(invalid)[key] += 0.1;
    assert.equal(h.valid(invalid), false, `${key}: altered percentage`);
  }
});

test('operational crosswalk reconciles counts, dimension totals and state denominators', () => {
  const h = harness();
  const mutations = [
    value => { row(value).mapped_dimensions = -1; },
    value => { row(value).mapped_dimensions = '7'; },
    value => { row(value).mapped_dimensions = 6.5; },
    value => { row(value).dimensions_with_retained_evidence = -1; },
    value => { row(value).dimensions_with_retained_evidence--; row(value).dimension_evidence_availability_percent = 71.4; },
    value => { row(value).measured_zip_dimension_cells = -1; },
    value => { row(value).measured_zip_dimension_cells++; row(value).exact_zip_measurement_reach_percent = 57.9; },
    value => { row(value).zip_dimension_cell_denominator = -1; },
    value => { row(value).zip_dimension_cell_denominator++; row(value).exact_zip_measurement_reach_percent = Number((row(value).measured_zip_dimension_cells / row(value).zip_dimension_cell_denominator * 100).toFixed(1)); },
    value => { value.state.governed_zcta_zip5_rows++; },
    value => { value.state.governed_zcta_zip5_rows = '596'; },
    value => { value.state.governed_zcta_zip5_rows = -1; },
    value => { dimension(value).measured_zip_dimension_cells = '596'; },
    value => { dimension(value).positive_zip_dimension_cells = 597; },
    value => { dimension(value).disposition_counts['measured-zero']--; },
    value => { dimension(value).disposition_counts['evidence-present']--; dimension(value).disposition_counts['measured-zero']++; },
    value => { row(value).dimensions[1] = row(value).dimensions[0]; },
    value => { row(value).dimensions[0] = null; },
    value => { row(value).dimensions[0].id = 'invented'; },
    value => { value.industries[1] = value.industries[0]; },
    value => { value.industries[0] = null; },
    value => { value.industries.pop(); },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(view); mutate(invalid);
    assert.equal(h.valid(invalid), false, String(mutate));
  }
});

test('operational crosswalk rejects state, provenance, temporal, special geography and claim drift', () => {
  const h = harness();
  const mutations = [
    value => { value.state.code = 'NY'; },
    value => { value.state.name = null; },
    value => { value.state.name = ' '; },
    value => { value.state.fips = '36'; },
    value => { value.extra = true; },
    value => { value.provenance = {}; },
    ...Object.keys(view.provenance).map(key => value => { value.provenance[key] = 'f'.repeat(64); }),
    ...Object.keys(view.claims).map(key => value => { value.claims[key] = true; }),
    ...Object.keys(view.special_geography).map(key => value => { value.special_geography[key] = !value.special_geography[key]; }),
    value => { value.claims.extra = false; },
    value => { value.unmapped_dimensions.pop(); },
    value => { value.unmapped_dimensions[0].reason = null; },
    value => { value.unmapped_dimensions[0].id = dimension(value).id; },
    ...Object.keys(dimension(view).temporal_qualification).map(key => value => { dimension(value).temporal_qualification[key] = 'invented'; }),
    value => { dimension(value).temporal_qualification = null; },
    value => { dimension(value).temporal_qualification.extra = true; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(view); mutate(invalid);
    assert.equal(h.valid(invalid), false, String(mutate));
  }
  assert.equal(h.valid(null), false);
});

test('operational crosswalk fails closed in the rendered view for mutated API responses', async () => {
  for (const mutate of [
    value => { row(value).exact_zip_measurement_reach_percent = '57.9'; },
    value => { row(value).dimension_evidence_availability_percent = 100; },
    value => { row(value).zip_dimension_cell_denominator++; },
    value => { dimension(value).positive_zip_dimension_cells++; },
    value => { value.provenance.summary_manifest_sha256 = 'f'.repeat(64); },
    value => { value.claims.usps_validity_verified = true; },
    value => { value.special_geography.included_in_state_denominator = true; },
  ]) {
    const invalid = structuredClone(view); mutate(invalid);
    const h = harness(async () => invalid);
    h.render(); await flush();
    const tree = h.render(), rendered = text(tree);
    assert.match(rendered, /Verified retained evidence is unavailable; no percentage or zero was inferred/);
    assert.equal(nodes(tree).filter(node => node.props?.role === 'alert').length, 1);
    assert.doesNotMatch(rendered, /57\.9%|85\.7%|Mapped source dimensions and provenance/);
    h.close();
  }
});
