import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/refresh-schedules.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const catalog = { industries: [{ id: 'retail', label: 'Retail' }], states: ['TX'] };
const record = { id: 's1', industries: ['retail'], states: ['TX'], intervalHours: 168, enabled: false, status: 'DISABLED', nextDueAt: null, reason: null, lastOccurrence: null };
function fixture(request, initial = {}) {
  const values = [], refs = [], effects = [];
  let index = 0, refIndex = 0, timer;
  const exports = {};
  runInNewContext(code, {
    exports, AbortController,
    setInterval: (callback) => { timer = callback; return 1; }, clearInterval: () => {},
    require: (name) => name === './runner-client' ? { runnerJson: request } : name === 'react' ? {
      useState(value) { const i = index++; if (!(i in values)) values[i] = i in initial ? initial[i] : value; return [values[i], (next) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useRef(value) { const i = refIndex++; refs[i] ??= { current: value }; return refs[i]; },
      useEffect(effect) { if (!effects.length) effects.push(effect); },
    } : require(name),
  });
  return { values, render() { index = 0; refIndex = 0; return exports.default({ catalog }); }, mount() { return effects[0](); }, poll() { return timer(); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, text) => nodes(tree).find((node) => node.type === 'button' && node.props.children === text);
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('schedule form requires explicit scope and saves disabled through the authenticated client', async () => {
  const calls = [];
  const f = fixture(async (...args) => { calls.push(args); return record; }, { 4: true });
  let tree = f.render();
  assert.equal(button(tree, 'Create disabled schedule').props.disabled, true);
  const selects = nodes(tree).filter((node) => node.type === 'select');
  selects[0].props.onChange({ currentTarget: { selectedOptions: [{ value: 'retail' }] } });
  selects[1].props.onChange({ currentTarget: { selectedOptions: [{ value: 'TX' }] } });
  tree = f.render();
  assert.equal(button(tree, 'Create disabled schedule').props.disabled, false);
  nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/data-operations/schedules');
  assert.deepEqual(JSON.parse(calls[0][1].body), { industries: ['retail'], states: ['TX'], intervalHours: 168, enabled: false });
  assert.equal(f.values[0][0].id, 's1');
});

test('invalid intervals cannot submit; scheduler outage disables schedule controls only', () => {
  for (const interval of ['', '23', '24.5', '8761']) {
    const f = fixture(() => assert.fail('must not dispatch'), { 1: ['retail'], 2: ['TX'], 3: interval, 4: true });
    const tree = f.render();
    assert.equal(button(tree, 'Create disabled schedule').props.disabled, true);
    nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  }
  const f = fixture(() => {}, { 0: [record], 4: true, 5: 'Scheduler unavailable' });
  assert.equal(button(f.render(), 'Enable — due now').props.disabled, true);
});

test('enable and pause use distinct requests and never invoke collection cancellation', async () => {
  for (const enabled of [false, true]) {
    const calls = [];
    const f = fixture(async (...args) => { calls.push(args); return { ...record, enabled: !enabled }; }, { 0: [{ ...record, enabled }], 4: true });
    button(f.render(), enabled ? 'Pause schedule' : 'Enable — due now').props.onClick();
    await settle();
    assert.equal(calls[0][0], '/api/data-operations/schedules/s1/enabled');
    assert.deepEqual(JSON.parse(calls[0][1].body), { enabled: !enabled });
    assert.equal(calls.length, 1);
  }
});

test('stale polling cannot replace a newer mutation; duplicate clicks are suppressed', async () => {
  let resolveRead, resolveWrite;
  const calls = [];
  const f = fixture((url, options) => { calls.push(url); return new Promise((resolve) => { if (options.method) resolveWrite = resolve; else resolveRead = resolve; }); }, { 0: [record], 4: true });
  const tree = f.render(), cleanup = f.mount();
  const enable = button(tree, 'Enable — due now');
  enable.props.onClick(); enable.props.onClick();
  resolveWrite({ ...record, enabled: true }); await settle();
  resolveRead([record]); await settle();
  assert.equal(f.values[0][0].enabled, true);
  assert.equal(calls.length, 2);
  cleanup();
});

test('failed mutation reports uncertainty and polling reconciles authoritative state', async () => {
  let fail = true;
  const f = fixture(async (url, options) => { if (options.method && fail) throw new Error('Response interrupted'); return [{ ...record, enabled: true }]; }, { 0: [record], 4: true });
  const tree = f.render(), cleanup = f.mount(); await settle();
  button(tree, 'Enable — due now').props.onClick(); await settle();
  assert.match(f.values[6], /Check the refreshed list before retrying/);
  fail = false; await f.poll(); await settle();
  assert.equal(f.values[0][0].enabled, true);
  cleanup();
});
