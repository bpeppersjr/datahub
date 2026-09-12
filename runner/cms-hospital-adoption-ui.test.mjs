import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),source=await readFile(new URL('../app/cms-hospital-adoption.tsx',import.meta.url),'utf8');
const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const operation={kind:'source-adoption',status:'SUCCEEDED',result:{sourceId:'cms-hospital-general-information',receiptIntegrityVerified:true,adoptedAt:'2026-09-12',summary:{directoryRows:2,statesDcRows:1,territoryRows:1,unknownStateRows:0,sourceDates:{issued:'2025-01-08',modified:'2026-07-22',released:'2026-08-13'},acquisitionStartedAt:'2026-09-12T00:00:00Z',acquisitionCompletedAt:'2026-09-12T00:00:01Z',sourceRunId:'source-run',states:{AL:1},territories:{PR:1}}}};
test('CMS adoption card shows dated scope, separate clocks, restrictions and explicit action only',()=>{
  let clicks=0;const tree=exports.default({operations:[operation],disabled:false,onInspect:()=>{clicks++;}});assert.equal(clicks,0);
  assert.match(text(tree),/2 dated hospital directory rows/);assert.match(text(tree),/1 reporting states\/DC/);assert.match(text(tree),/1 territories/);assert.match(text(tree),/Current source bytes have not been replayed by this history read/);assert.match(text(tree),/No public redistribution or downloads/);
  const buttons=nodes(tree).filter(node=>node.type==='button');assert.equal(buttons.length,1);buttons[0].props.onClick();assert.equal(clicks,1);assert.doesNotMatch(text(buttons[0]),/acquire|refresh|download/i);
});
test('failed/unknown/pending adoption withholds success counts and lock disables action',()=>{
  for(const status of ['FAILED','UNKNOWN','CANCELLED','RUNNING']){const tree=exports.default({operations:[{...operation,status}],disabled:true,onInspect(){}});assert.doesNotMatch(text(tree),/2 dated hospital/);assert.match(text(tree),/Counts withheld/);assert.equal(nodes(tree).find(node=>node.type==='button').props.disabled,true);}
  const empty=exports.default({operations:[],disabled:false,onInspect(){}});assert.match(text(empty),/not yet verified/);
});
test('management integration posts only fixed source ID and adopts a separate operation kind',async()=>{
  const code=await readFile(new URL('../app/data-operations.tsx',import.meta.url),'utf8');assert.match(code,/post<Operation>\('\/source-adoptions',\{sourceId:'cms-hospital-general-information'\}\)/);
  assert.doesNotMatch(source,/runnerJson|fetch\(|acquire-cms|selected.jsonl/);
});
