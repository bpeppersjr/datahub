import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const compile = async name => ts.transpileModule(await readFile(new URL(`../app/${name}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const model = {}; runInNewContext(await compile('data-operation-model.ts'), { exports: model });
const code = await compile('overture-normalization.tsx');
const source = { id: 'source-a', kind: 'source-acquisition', status: 'SUCCEEDED', createdAt: '2026-09-10T00:00:00Z', result: {
  sourceId: 'overture-us-places', receiptIntegrityVerified: true, inspectionRequired: false, snapshotReady: true } };
const choices = { baselines: [{ releaseId: 'baseline-a', referenceYear: 2023, sha256: 'a'.repeat(64) }], unavailable: 0, truncated: false, verification: 'manifest-only' };
function fixture(request) {
  const values = [], effects = [], exports = {}; let index = 0;
  runInNewContext(code, { exports, AbortController, require: name => name === './runner-client' ? { runnerJson: request }
    : name === './data-operation-model' ? model : name === 'react' ? {
      useState: value => { const i = index++; if (!(i in values)) values[i] = value; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useRef: value => { const i = index++; return values[i] ??= { current: value }; },
      useEffect: fn => { if (!effects.length) effects.push(fn); },
    } : require(name) });
  return { render(props) { index = 0; return exports.default(props); }, mount() { return effects[0](); } };
}
function nodes(v) { return !v || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(nodes) : [v, ...nodes(v.props?.children)]; }
const settle = () => new Promise(resolve => setImmediate(resolve));
test('operation presentation labels every managed kind and never treats failed sources as ready', () => {
  for (const kind of ['source-prerequisite', 'source-acquisition', 'source-normalization', 'cohort-snapshot']) assert.notEqual(model.operationLabel(kind), 'Flat-file export');
  assert.equal(model.operationLabel('export'), 'Flat-file export'); assert.equal(model.operationLabel('unknown'), 'Data operation');
  assert.equal(model.eligibleOvertureAcquisition(source), true);
  for (const status of ['FAILED', 'CANCELLED', 'UNKNOWN', 'RUNNING']) {
    const op = { ...source, status }; assert.equal(model.eligibleOvertureAcquisition(op), false);
    if (status !== 'RUNNING') assert.match(model.operationEvidence(op), /Not ready/);
  }
  assert.equal(model.eligibleOvertureAcquisition({ ...source, result: { ...source.result, inspectionRequired: true } }), false);
});
test('normalization UI loads metadata only, posts exact pinned selection once, and remembers app operation', async () => {
  const calls = [], remembered = []; let finish;
  const f = fixture(async (url, options) => { calls.push({ url, options }); if (!options.method) return choices; return new Promise(resolve => { finish = resolve; }); });
  const props = { operations: [source], disabled: false, onOperation: value => remembered.push(value) };
  f.render(props); const cleanup = f.mount(); await settle(); let tree = f.render(props);
  const selects = nodes(tree).filter(n => n.type === 'select');
  selects[0].props.onChange({ target: { value: 'source-a' } }); selects[1].props.onChange({ target: { value: 'baseline-a' } });
  tree = f.render(props); const form = nodes(tree).find(n => n.type === 'form');
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 2); assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[1].url, '/api/data-operations/overture-normalizations');
  assert.deepEqual(JSON.parse(calls[1].options.body), { acquisitionOperationId: 'source-a', baselineReleaseId: 'baseline-a', baselineSha256: 'a'.repeat(64) });
  finish({ id: 'new-operation' }); await settle(); assert.equal(remembered[0].id, 'new-operation'); cleanup();
});
test('normalization UI disables stale acquisition selection, unavailable inputs and competing work', async () => {
  const f = fixture(async () => choices); const props = { operations: [source], disabled: false, onOperation() { assert.fail('not submitted'); } };
  f.render(props); const cleanup = f.mount(); await settle();
  const selects = nodes(f.render(props)).filter(n => n.type === 'select');
  selects[0].props.onChange({ target: { value: 'source-a' } }); selects[1].props.onChange({ target: { value: 'baseline-a' } });
  for (const next of [{ ...props, disabled: true }, { ...props, operations: [{ ...source, status: 'FAILED' }] }, { ...props, operations: [] }]) {
    const tree = f.render(next); assert.equal(nodes(tree).find(n => n.props?.type === 'submit').props.disabled, true);
    nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  }
  assert.match(JSON.stringify(f.render({ ...props, operations: [] })), /Failed and incomplete acquisitions cannot be normalized/); cleanup();
});

test('normalization UI cancels late metadata updates and distinguishes incomplete choices from load failure', async () => {
  let finish, signal;
  const props = { operations: [], disabled: false, onOperation() {} };
  const late = fixture((url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  late.render(props); const stop = late.mount(); stop(); assert.equal(signal.aborted, true);
  finish(choices); await settle(); assert.doesNotMatch(JSON.stringify(late.render(props)), /baseline-a/);
  const incomplete = fixture(async () => ({ ...choices, baselines: [], unavailable: 2, truncated: true }));
  incomplete.render(props); const cleanup = incomplete.mount(); await settle();
  assert.match(JSON.stringify(incomplete.render(props)), /list is incomplete/); cleanup();
  const failed = fixture(async () => { throw Error('private details'); });
  failed.render(props); const cleanupFailed = failed.mount(); await settle();
  const tree = JSON.stringify(failed.render(props)); assert.match(tree, /could not be loaded/); assert.doesNotMatch(tree, /private details/); cleanupFailed();
});
