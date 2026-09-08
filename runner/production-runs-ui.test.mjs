import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/production-runs.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const sample={inspectedAt:'2026-09-08T09:46:24.268Z',unavailableRuns:0,omittedRuns:0,runs:[{runId:'run-a',status:'RUNNING',startedAt:'2026-09-08T09:46:24.268Z',finishedAt:null,stopRequested:false,completedStages:0,totalStages:1,hasError:false,controllerPresence:'missing',stages:[{id:'registry-build',status:'RUNNING'}],outputs:[]}]};
function fixture(request){const values=[],effects=[],exports={};let index=0,timer,cleared=false;
  runInNewContext(code,{exports,AbortController,setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{cleared=true;},require:name=>name==='./runner-client'?{runnerJson:request}:name==='react'?{
    useState:v=>{const i=index++;if(!(i in values))values[i]=v;return [values[i],next=>{values[i]=next;}];},useEffect:fn=>{if(!effects.length)effects.push(fn);}
  }:require(name)});
  return {values,render(){index=0;return exports.default();},mount(){return effects[0]();},poll(){return timer();},get cleared(){return cleared;}};
}
function nodes(v){if(!v||typeof v!=='object')return [];return Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];}
const settle=()=>new Promise(r=>setImmediate(r));
test('production UI uses read-only authenticated polling and cancels late updates',async()=>{
  const calls=[];let resolve;const f=fixture((url,options)=>{calls.push({url,options});return new Promise(r=>{resolve=r;});});
  f.render();const cleanup=f.mount();f.poll();assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/data-operations/production-runs');assert.equal(calls[0].options.method,undefined);
  cleanup();assert.equal(calls[0].options.signal.aborted,true);assert.equal(f.cleared,true);resolve(sample);await settle();assert.equal(f.values[0],null);
});
test('production UI separates stale status, unreadable history and empty history without job controls',async()=>{
  let fail=false;const f=fixture(async()=>{if(fail)throw Error('SECRET');return sample;});
  f.render();const cleanup=f.mount();await settle();let tree=f.render();
  assert.match(JSON.stringify(tree),/recorded controller process was not found/);assert.equal(nodes(tree).filter(n=>n.type==='button'||n.type==='form').length,0);
  fail=true;f.poll();await settle();tree=f.render();assert.match(JSON.stringify(tree),/last successful snapshot/);assert.doesNotMatch(JSON.stringify(tree),/SECRET/);
  assert.equal(f.values[0].runs[0].status,'RUNNING');cleanup();
  const g=fixture(async()=>({...sample,runs:[],unavailableRuns:1}));g.render();const stop=g.mount();await settle();
  assert.match(JSON.stringify(g.render()),/incomplete history/);assert.doesNotMatch(JSON.stringify(g.render()),/No production rebuild receipts/);stop();
});
