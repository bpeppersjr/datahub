import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/refresh-schedules.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const catalog = { industries: [{ id: 'retail', label: 'Retail' }], states: ['TX'],collectionSources:[{id:'state-tx-retail',scope:'state',states:['TX'],industries:['retail'],manualSelectionRequired:false}],automaticRefreshSources:[{sourceId:'state-tx-retail',script:'scripts/tx.mjs',automaticRefreshAuthorized:false,reasonCode:'GOVERNED_SOURCE_HOLD',governedSourceId:'tx-retail'}] };
const record = { id: 's1', industries: ['retail'], states: ['TX'], intervalHours: 168, enabled: false, status: 'DISABLED', nextDueAt: null, reason: null, lastOccurrence: null };
function fixture(request, initial = {}, props = {}) {
  const values = [], refs = [], effects = [];
  let index = 0, refIndex = 0, effectIndex = 0, timer;
  const exports = {};
  runInNewContext(code, {
    exports, AbortController,
    setInterval: (callback) => { timer = callback; return 1; }, clearInterval: () => {},
    require: (name) => name === './runner-client' ? { runnerJson: request } : name === 'react' ? {
      useState(value) { const i = index++; if (!(i in values)) values[i] = i in initial ? initial[i] : value; return [values[i], (next) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useRef(value) { const i = refIndex++; refs[i] ??= { current: value }; return refs[i]; },
      useEffect(effect) { const i=effectIndex++; effects[i] ??= effect; },
    } : require(name),
  });
  return { values,exports, render() { index = 0; refIndex = 0; effectIndex = 0; return exports.default({ catalog, administrationIndustries: [], ...props }); }, mount() { const cleanups=effects.map(effect=>effect()).filter(value=>typeof value==='function'); return()=>cleanups.forEach(cleanup=>cleanup()); }, poll() { return timer(); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, text) => nodes(tree).find((node) => node.type === 'button' && node.props.children === text);
const text = tree => typeof tree === 'string'||typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : '';
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('schedule form exposes the matching HOLD and fails closed without posting', async () => {
  const calls = [];
  const f = fixture(async (...args) => { calls.push(args); return record; }, { 4: true });
  let tree = f.render();
  assert.equal(button(tree, 'Create disabled schedule').props.disabled, true);
  const selects = nodes(tree).filter((node) => node.type === 'select');
  selects[0].props.onChange({ currentTarget: { selectedOptions: [{ value: 'retail' }] } });
  selects[1].props.onChange({ currentTarget: { selectedOptions: [{ value: 'TX' }] } });
  tree = f.render();
  assert.equal(button(tree, 'Create disabled schedule').props.disabled, true);
  assert.match(text(tree),/0\s+authorized/);
  assert.match(text(tree),/1\s+unauthorized/);
  assert.match(text(tree),/Governed source remains on HOLD/);
  assert.match(text(tree),/Manual collection remains available above/);
  nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await settle();
  assert.equal(calls.length, 0);
});

test('persisted Administration industries initialize and can restore only the schedule form', async () => {
  const expanded={...catalog,industries:[{id:'retail',label:'Retail'},{id:'childcare',label:'Childcare'}],collectionSources:[...catalog.collectionSources,{id:'state-tx-childcare',scope:'state',states:['TX'],industries:['childcare'],manualSelectionRequired:false}],automaticRefreshSources:[...catalog.automaticRefreshSources,{sourceId:'state-tx-childcare',script:'scripts/childcare.mjs',automaticRefreshAuthorized:false,reasonCode:'AUTOMATIC_REFRESH_NOT_REVIEWED',governedSourceId:null}]};
  const f=fixture(async()=>[],{}, {catalog:expanded,administrationIndustries:['childcare','unknown','childcare']});
  f.render(); const cleanup=f.mount(); await settle();
  let tree=f.render();
  assert.deepEqual(Array.from(nodes(tree).find(node=>node.type==='select').props.value),['childcare']);
  const selects=nodes(tree).filter(node=>node.type==='select');
  selects[0].props.onChange({currentTarget:{selectedOptions:[{value:'retail'}]}});
  selects[1].props.onChange({currentTarget:{selectedOptions:[{value:'TX'}]}});
  tree=f.render(); assert.deepEqual(Array.from(nodes(tree).find(node=>node.type==='select').props.value),['retail']);
  button(tree,'Use Administration selection').props.onClick();
  tree=f.render(); const restored=nodes(tree).filter(node=>node.type==='select');
  assert.deepEqual(Array.from(restored[0].props.value),['childcare']);
  assert.deepEqual(Array.from(restored[1].props.value),['TX']);
  assert.match(f.values[7],/No schedule was created or enabled/);
  cleanup();
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

test('authorization validator fails closed on missing, duplicate, extra, or invented authorization decisions',()=>{
  const f=fixture(()=>assert.fail('must not dispatch'),{1:['retail'],2:['TX'],4:true});
  assert.equal(f.exports.automaticRefreshScope(catalog,['retail'],['TX']).valid,true);
  const cases=[{...catalog,automaticRefreshSources:undefined},{...catalog,automaticRefreshSources:[]},{...catalog,automaticRefreshSources:[...catalog.automaticRefreshSources,catalog.automaticRefreshSources[0]]},{...catalog,automaticRefreshSources:[{...catalog.automaticRefreshSources[0],automaticRefreshAuthorized:true}]},{...catalog,automaticRefreshSources:[{...catalog.automaticRefreshSources[0],extra:true}]}];
  for(const malformed of cases){const view=fixture(()=>assert.fail('must not dispatch'),{1:['retail'],2:['TX'],4:true},{catalog:malformed}).render();assert.equal(button(view,'Create disabled schedule').props.disabled,true);assert.match(text(view),/authorization evidence is unavailable or incompatible/i);}
});

test('selected scope lists national and matching state decisions but not unrelated state sources',()=>{
  const scoped={industries:[{id:'retail'}],states:['TX','CA'],collectionSources:[{id:'national-retail',scope:'national',states:'all',industries:['retail'],manualSelectionRequired:false},{id:'tx-retail',scope:'state',states:['TX'],industries:['retail'],manualSelectionRequired:false},{id:'ca-retail',scope:'state',states:['CA'],industries:['retail'],manualSelectionRequired:true}],automaticRefreshSources:[{sourceId:'national-retail',script:'scripts/national.mjs',automaticRefreshAuthorized:false,reasonCode:'AUTOMATIC_REFRESH_NOT_REVIEWED',governedSourceId:null},{sourceId:'tx-retail',script:'scripts/tx.mjs',automaticRefreshAuthorized:false,reasonCode:'GOVERNED_SOURCE_HOLD',governedSourceId:'tx-retail'},{sourceId:'ca-retail',script:'scripts/ca.mjs',automaticRefreshAuthorized:false,reasonCode:'MANUAL_SELECTION_REQUIRED',governedSourceId:null}]};
  const tree=fixture(()=>assert.fail('must not dispatch'),{1:['retail'],2:['TX'],4:true},{catalog:scoped}).render(),value=text(tree);
  assert.match(value,/national retail/);assert.match(value,/tx retail/);assert.doesNotMatch(value,/ca retail/);assert.match(value,/Automatic refresh has not been reviewed/);assert.match(value,/Governed source remains on HOLD/);assert.equal(button(tree,'Create disabled schedule').props.disabled,true);
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
