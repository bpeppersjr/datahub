import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {APP_ROOT} from './paths.mjs';
const require=createRequire(import.meta.url),source=readFileSync(path.join(APP_ROOT,'app/retained-county-panel.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const data={status:'available',geography_manifest_sha256:'a',county_geoids:['42001','42003','24001'],supported_state_fips:['42','24'],
  source_cohorts:[{dataset_id:'pa',source_label:'Pennsylvania',selected_source_rows:4995,assigned_source_rows:4930,by_county:[{county_geoid:'42001',candidate_rows:20}]},
    {dataset_id:'md',source_label:'Maryland',selected_source_rows:1772,assigned_source_rows:1772,by_county:[{county_geoid:'24001',candidate_rows:1772}]}],
  derivative_created_at:'2026-09-10T19:37:10.000Z',counts:{candidate_rows:12206,by_status:{'assigned-single-county':6702,
    'missing-source-point':4028,'unknown-coordinate-system':1476,'source-not-enabled-for-overlay':0},by_county:[{county_geoid:'42001',candidate_rows:20}]}};
function render(props={},input=data,error=false,revision=props.mapRevision){const exports={};
  new Function('require','exports',compiled)(id=>id==='react'?{useState:()=>[{revision,data:input,error},()=>{}],useEffect:()=>{}}:id==='./runner-client'?{}:require(id),exports);
  return renderToStaticMarkup(exports.default({level:'county',geoid:'42001',geographyHash:'a',...props}));}
test('county panel shows assigned cohort denominator separately from business completeness',()=>{
  const html=render(); assert.match(html,/Assigned source-point rows/);assert.match(html,/0.4%/);assert.match(html,/4,995/);assert.match(html,/not industry completeness/);
  assert.match(render({geoid:'42003'}),/>0<\/dd>/);assert.doesNotMatch(render({geoid:'39001'}),/Assigned source-point rows/);
  const maryland=render({level:'state',geoid:'24'});assert.match(maryland,/1,772/);assert.match(maryland,/100.0%/);
  assert.match(maryland,/Share of assigned Maryland source rows/);assert.match(maryland,/Share of assigned Pennsylvania source rows/);
  assert.doesNotMatch(maryland.split('<details>')[0],/6,702/);
  assert.match(maryland,/Source observation dates: not included/);assert.match(maryland,/Derivative created:/);assert.match(maryland,/not a source observation date/);assert.match(maryland,/missing source point: <!-- -->4,028|missing source point: 4,028/);
});

test('county selector supports supported zero and resets when parent state changes',()=>{
 let selection={state:'42',geoid:''},slot=0;const exports={};
 new Function('require','exports',compiled)(id=>id==='react'?{useState:()=>slot++===0?[{revision:'r',data,error:false},()=>{}]:[selection,value=>{selection=value;}],useEffect:()=>{}}:id==='./runner-client'?{}:require(id),exports);
 const renderTree=(geoid='42')=>{slot=0;return exports.default({level:'state',geoid,geographyHash:'a',mapRevision:'r',allowCountySelection:true});};
 const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props.children)];
 let tree=renderTree(),select=nodes(tree).find(node=>node.props?.['aria-label']==='Retained childcare county');
 assert.deepEqual(nodes(select).filter(node=>node.type==='option').map(node=>node.props.value),['','42001','42003']);
 select.props.onChange({target:{value:'42003'}});tree=renderTree();assert.match(renderToStaticMarkup(tree),/Assigned source-point rows in selected geography<\/dt><dd>0<\/dd>/);
 assert.equal(nodes(tree).find(node=>node.type==='select').props.value,'42003');
 tree=renderTree('24');assert.equal(nodes(tree).find(node=>node.type==='select').props.value,'');assert.match(renderToStaticMarkup(tree),/Assigned source-point rows in selected geography<\/dt><dd>1,772<\/dd>/);
 assert.doesNotMatch(render({geographyHash:undefined}),/Assigned source-point rows in selected geography/);
});

test('standalone workspace gates unsupported states and absent or incompatible geography',()=>{
 function workspace(stateCode,catalog,error=false){let slot=0;const exports={};new Function('require','exports',compiled)(id=>id==='react'?{useState:()=>[slot++===0?catalog:error,()=>{}],useEffect:()=>{}}:id==='./runner-client'?{}:require(id),exports);return exports.RetainedCountyWorkspace({stateCode});}
 const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props.children);
 assert.match(text(workspace('OH',{available:true})),/unavailable.*not zero/);
 assert.match(text(workspace('',null)),/Select a state/);
 assert.match(text(workspace('PA',null,true)),/counts are withheld/);
 assert.match(text(workspace('MD',{available:false})),/counts are withheld/);
 assert.match(text(workspace('MD',null)),/Checking current geography/);
 for(const[stateCode,geoid]of [['PA','42'],['MD','24']]){const tree=workspace(stateCode,{available:true,geography_manifest_sha256:'a'}),child=tree.props.children.at(-1);assert.equal(child.props.geoid,geoid);assert.equal(child.props.allowCountySelection,true);assert.equal(child.props.geographyHash,'a');}
});
test('county panel keeps cross-state source contributions distinct from geography totals',()=>{
  const mixed=structuredClone(data);mixed.source_cohorts[1].by_county=[{county_geoid:'42001',candidate_rows:886},{county_geoid:'24001',candidate_rows:886}];
  const html=render({},mixed);assert.match(html,/>906<\/dd>/);assert.match(html,/50.0%/);assert.match(html,/0.4%/);
  assert.match(html,/Publisher scope and assigned geography are separate/);
});
test('county panel withholds mismatched geography and ZIP counts and uses read-only endpoint',()=>{
  assert.match(render({geographyHash:'b'}),/Counts are withheld/);assert.match(render({level:'zip'}),/ZIP membership was not derived/);
  assert.match(render({},null,true),/could not be verified/);assert.match(render({},{status:'not-enrolled'}),/not a zero business count/);
  assert.doesNotMatch(render({mapRevision:'new'},data,false,'old'),/Assigned source-point rows/);
  assert.match(render({mapRevision:'new'},data,false,'old'),/Loading verified saved relationships/);
  assert.match(source,/active=false/);assert.doesNotMatch(source,/method:\s*['"]POST|--run/);
});
test('late asynchronous response cannot overwrite the new map selection',async()=>{
  const effects=[],pending=[],updates=[],exports={};
  new Function('require','exports',compiled)(id=>id==='react'?{
    useState:()=>[null,value=>updates.push(value)],useEffect:effect=>effects.push(effect),
  }:id==='./runner-client'?{runnerJson:()=>new Promise(resolve=>pending.push(resolve))}:require(id),exports);
  exports.default({mapRevision:'old'});const cleanup=effects[0]();cleanup();
  exports.default({mapRevision:'new'});const newCleanup=effects[1]();
  pending[1](data);await Promise.resolve();await Promise.resolve();
  pending[0]({...data,status:'unavailable'});await Promise.resolve();await Promise.resolve();
  assert.equal(updates.length,1);assert.equal(updates[0].revision,'new');assert.equal(updates[0].data.status,'available');
  newCleanup();
});
