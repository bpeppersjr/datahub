import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness(request) {
  const catalog = { industries: [], states: [], collectionSources: [], export: { categories: [], fields: [], formats: [], policyModes: [] } };
  const values = [catalog, [], '', [], [], null];
  const exports = {};
  let cursor = 0;
  const noop = () => null;
  runInNewContext(code, {
    exports,
    require: name => name === './runner-client' ? { runnerJson: request, downloadRunnerArtifact: async () => {} }
      : name === './data-operation-model' ? { operationLabel: value => value.kind, operationEvidence: () => null }
      : name === 'react' ? {
        useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; },
        useEffect() {},
      }
        : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
          : { __esModule: true, default: noop },
  });
  return { render() { cursor = 0; return exports.default(); } };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : '';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Illinois card accepts only its exact forward-slash package selection and dispatches the governed operation', async () => {
  const calls = [];
  const h = harness(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return { id: 'illinois-op', kind: 'illinois-business-registry', status: 'QUEUED', artifacts: [], result: {}, createdAt: '2026-10-03T00:00:00.000Z' };
  });
  let tree = h.render();
  assert.match(text(tree), /all five official corporation and LLC files from the same daily run/);
  assert.match(text(tree), /local-review-only, creates no current pointer/);
  assert.match(text(tree), /not admitted to the national registry or broad-layer coverage/);
  const input = nodes(tree).find(node => node.type === 'input' && node.props['aria-label'] === 'Illinois Business Registry package selection');
  input.props.onChange({ target: { value: 'data\\imports\\illinois-business-registry\\packages\\run-1\\selection.json' } });
  tree = h.render();
  let start = nodes(tree).find(node => node.type === 'button' && text(node) === 'Start offline Illinois package operation');
  assert.equal(start.props.disabled, true);
  input.props.onChange({ target: { value: 'data/imports/illinois-business-registry/packages/run-1/selection.json' } });
  tree = h.render();
  start = nodes(tree).find(node => node.type === 'button' && text(node) === 'Start offline Illinois package operation');
  assert.equal(start.props.disabled, false);
  start.props.onClick();
  await settle();
  assert.deepEqual(calls, [{
    url: '/api/data-operations/illinois-business-registry',
    body: { selection: 'data/imports/illinois-business-registry/packages/run-1/selection.json' },
  }]);
});
