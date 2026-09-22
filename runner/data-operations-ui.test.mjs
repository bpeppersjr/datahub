import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const catalog = {
  industries: [{ id: 'childcare', label: 'Childcare' }], states: ['MA', 'NJ'],
  collectionSources: [
    { id: 'state-ma-childcare', scope: 'state', states: ['MA'], industries: ['childcare'], manualSelectionRequired: false },
    { id: 'state-nj-childcare', scope: 'state', states: ['NJ'], industries: ['childcare'], manualSelectionRequired: true },
  ],
  export: { categories: [], fields: [], formats: [], policyModes: [] },
};

function fixture(request) {
  const values = [catalog, [], '', [], [], null], exports = {};
  let index = 0;
  const noop = () => null;
  runInNewContext(code, {
    exports,
    require: (name) => name === './runner-client' ? { runnerJson: request, downloadRunnerArtifact: noop }
      : name === './data-operation-model' ? { operationLabel: () => 'Collection', operationEvidence: () => null }
      : name === 'react' ? { useState(value) { const i = index++; if (!(i in values)) values[i] = value; return [values[i], (next) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; }, useEffect() {} }
        : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' }
          : { __esModule: true, default: noop },
  });
  return { values, render() { index = 0; return exports.default(); } };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, text) => nodes(tree).find(node => node.type === 'button' && node.props.children === text);
const textOf = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(textOf).join(' ') : tree && typeof tree === 'object' ? textOf(tree.props?.children) : '';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('collection UI batches unique sources, shows selection, previews before dispatch, and clears safely', async () => {
  const calls = [];
  const f = fixture(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/plan')) return { taskCount: 2, maxConcurrency: 1, warnings: [], tasks: [], gaps: [] };
    if (url.endsWith('/collections')) return { id: 'collection-op', kind: 'collection', status: 'QUEUED', artifacts: [], result: {} };
    return [];
  });

  let tree = f.render();
  const sourceSelect = nodes(tree).find(node => node.type === 'select' && node.props['aria-describedby'] === 'collection-source-guidance');
  sourceSelect.props.onChange({ currentTarget: { selectedOptions: [{ value: 'state-ma-childcare' }, { value: 'state-nj-childcare' }, { value: 'state-ma-childcare' }] } });
  tree = f.render();
  assert.match(textOf(tree), /Selected 2 sources: state ma childcare, state nj childcare/);
  button(tree, 'Preview collection').props.onClick();
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/data-operations/plan');
  assert.deepEqual(calls[0].body, { industries: [], states: [], sourceIds: ['state-ma-childcare', 'state-nj-childcare'] });
  assert.deepEqual(calls[0].body.sourceIds, ['state-ma-childcare', 'state-nj-childcare']);

  tree = f.render();
  button(tree, 'Start collection').props.onClick();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/data-operations/collections');
  assert.deepEqual(calls[1].body.sourceIds, ['state-ma-childcare', 'state-nj-childcare']);

  tree = f.render();
  button(tree, 'Clear selected sources').props.onClick();
  tree = f.render();
  assert.match(textOf(tree), /No selected sources means use default sources only/);
  const clearedSelect = nodes(tree).find(node => node.type === 'select' && node.props['aria-describedby'] === 'collection-source-guidance');
  assert.equal(clearedSelect.props.value.length, 0);
});

test('select all chooses only currently matching sources', () => {
  const f = fixture(async () => []);
  let tree = f.render();
  button(tree, 'Select all matching sources').props.onClick();
  tree = f.render();
  assert.match(textOf(tree), /Selected 2 sources: state ma childcare, state nj childcare/);
  assert.deepEqual(nodes(tree).find(node => node.type === 'select' && node.props['aria-describedby'] === 'collection-source-guidance').props.value,
    ['state-ma-childcare', 'state-nj-childcare']);
});
