import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readNationalStatus } from './national-status.mjs';
import { validNationalStatus } from '../app/national-status-validation.mjs';
const source=await readFile(new URL('../app/national-status-panel.tsx',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const jsx=(type,props)=>({type,props}),text=t=>t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
const flush=()=>new Promise(done=>setImmediate(done));
function find(tree,type){if(Array.isArray(tree))return tree.flatMap(t=>find(t,type));if(!tree||typeof tree!=='object')return [];return [...(tree.type===type?[tree]:[]),...find(tree.props?.children,type)]}
function harness(request) {
  const exports={},slots=[],dependencies=[],cleanups=[],pending=[];let cursor=0;
  runInNewContext(code,{exports,AbortController,require:name=>name==='./runner-client'?{runnerJson:request}:name==='./national-status-validation.mjs'?{validNationalStatus}:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='react'?{useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useEffect(effect,deps){const i=cursor++;if(!dependencies[i]||deps.some((d,j)=>d!==dependencies[i][j])){dependencies[i]=deps;pending.push(()=>{cleanups[i]?.();cleanups[i]=effect()})}}}:{}});
  return {render(state='NJ'){cursor=0;const tree=exports.NationalStatusPanel({state});pending.splice(0).forEach(effect=>effect());return tree},close(){cleanups.forEach(cleanup=>cleanup?.())}};
}
const summary=await readNationalStatus(),state=await readNationalStatus({kind:'state',state:'NJ'});
test('National Status renders national units, evidence reach, source reviews, selected state and separate territories',async()=>{
  const h=harness(async url=>url.endsWith('summary')?structuredClone(summary):structuredClone(state));h.render();await flush();const output=text(h.render());
  for(const expected of [/48,194 ZIP5 cohort keys/,/51 source dimensions/,/459 state\/industry rows/,/29 within review window/,/2 stale/,/20 unmeasured/,/40 states\/DC awaiting broad/,/150 unsupported/,/59.2%/,/evidence reach/,/NJ · nine/,/Source date:/,/PR 132 ZIP5 keys/,/14,402 non-ZCTA keys/,/184 material cross-state/,/business completeness is unmeasured/,/8,011,835 matching profiles/,/7,963,395 same-code ZCTA candidates/,/48,439 outside ZCTA/,/372,079 retained single-county/,/6,976,397 missing geocode/,/11 reported-state conflicts/,/not a numerator/])assert.match(output,expected);assert.doesNotMatch(output,/% complete/);h.close();
});
test('summary and selected-state failures are isolated and malformed data never displays inferred counts',async()=>{
  const h=harness(async url=>{if(url.endsWith('summary'))throw Error('private path');return structuredClone(state)});h.render();await flush();const output=text(h.render());assert.match(output,/Existing Industry Status remains available/);assert.match(output,/NJ · nine/);assert.match(output,/Source date:/);assert.doesNotMatch(output,/private path|48,194 ZIP5 cohort/);h.close();
  const h2=harness(async url=>url.endsWith('summary')?structuredClone(summary):({...state,industries:[]}));h2.render();await flush();const output2=text(h2.render());assert.match(output2,/48,194 ZIP5/);assert.match(output2,/evidence reach remains unknown/);h2.close();
  const composition=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');assert.match(composition,/<OperationalMaintenanceIntent\/><NationalStatusPanel state=\{state\}\/><OperationalIndustryCrosswalkStatus state=\{state\}\/><EpaOperationalIndustryStatus state=\{state\}\/>/);
});
test('state changes abort old requests and stale results cannot replace new selection',async()=>{
  let resolve;const signals=[];
  const h=harness((url,options)=>{signals.push(options.signal);if(url.endsWith('summary'))return Promise.resolve(summary);if(url.endsWith('state=NJ'))return new Promise(done=>resolve=done);return readNationalStatus({kind:'state',state:'DC'})});h.render('NJ');h.render('DC');resolve(state);await flush();await flush();const output=text(h.render('DC'));assert.equal(signals[1].aborted,true);assert.match(output,/DC · nine/);assert.doesNotMatch(output,/NJ · nine/);h.close();
  let finish;const stale=harness(()=>new Promise(done=>finish=done));stale.render('');stale.close();finish(summary);await flush();assert.doesNotMatch(text(stale.render('')),/48,194 ZIP5 cohort/);
});

test('ZIP form issues one exact ZIP5 selector and shows outside-cohort absence explicitly',async()=>{
  const urls=[],outside=await readNationalStatus({kind:'zip',zip:'00100'});
  const h=harness(async url=>{urls.push(url);return url.endsWith('summary')?summary:url.includes('state=')?state:outside});
  const first=h.render();find(first,'input')[0].props.onChange({target:{value:'00100'}});find(h.render(),'form')[0].props.onSubmit({preventDefault(){}});h.render();await flush();const output=text(h.render());
  assert.equal(urls.filter(url=>url.includes('national-status-zip')).length,1);assert.ok(urls.includes('/api/business-map/national-status-zip?zip=00100'));assert.match(output,/outside this retained cohort/);assert.match(output,/USPS validity and business availability remain unknown/);h.close();
});
