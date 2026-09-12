import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CREDENTIAL_COVERAGE_STATES} from './credential-coverage.mjs';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/credential-heatmap.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(request){const values=[],refs=[],exports={};let index=0,refIndex=0,effect;
  runInNewContext(compiled,{exports,URLSearchParams,AbortController,require:id=>id==='./runner-client'?{runnerJson:request}:id.endsWith('.module.css')?{default:new Proxy({},{get:(_o,key)=>key})}:id==='react'?{
    useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];},
    useRef:initial=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useMemo:fn=>fn(),useEffect:fn=>{effect=fn;},
  }:require(id)});
  return {values,render(){index=0;refIndex=0;return exports.default();},effect(){return effect();}};
}
function sample(){return {available:true,status:'available',generation:1,verifiedAt:'2026-09-12T13:00:00.000Z',sourceObservedAt:'2026-09-08T13:00:00.000Z',acceptedCohortRows:10,missingZip5Rows:1,outside50DcOrUnresolvedRows:0,
  nationalStates:CREDENTIAL_COVERAGE_STATES.map(state=>({state,stateFips:state,name:state,credentialRows:state==='MN'?8:state==='WI'?2:0,heatValue:state==='MN'?8:state==='WI'?2:0,categoryWithinState:50,stateShareOfCategory:80,geometryStatus:'available',geometry:{type:'Polygon',coordinates:[[[-90,40],[-89,40],[-89,41],[-90,40]]]}})),
  postalGroups:[{state:'MN',zip5:null,heatValue:1,credentialRows:1,categories:[]},{state:'MN',zip5:'55101',heatValue:7,credentialRows:7,categories:[]}],summary:{credentialRows:10,percentOfAcceptedCohort:100,state:null},displayGaps:{states:[],selectedCategoryRowsWithoutStateGeometry:0}};}
async function loaded(){const calls=[],f=fixture(async(url,options)=>{calls.push({url,options});return sample();});f.render();const cleanup=f.effect();await tick();return {f,calls,cleanup};}
test('credential map has all51 keyboard state controls, category zero values, missing ZIP tiles and separate right summary',async()=>{
  const {f,cleanup}=await loaded();const tree=f.render(),list=nodes(tree);
  assert.equal(list.filter(node=>node.type==='path').length,51);assert.equal(list.filter(node=>node.type==='aside'&&node.props['aria-label']==='Credential alignment summary').length,1);
  assert.match(list.find(node=>node.type==='path'&&node.props['aria-label'].startsWith('AK;')).props['aria-label'],/0 All credential categories credential rows/);
  assert.match(text(tree),/Missing ZIP/);assert.match(text(tree),/not collection completeness/);assert.match(text(tree),/Snapshot verified/);assert.match(text(tree),/Source observed/);
  const state=list.find(node=>node.type==='path'&&node.props['aria-label'].startsWith('MN;'));let prevented=false;state.props.onKeyDown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.values[1],'MN');assert.equal(f.values[2],null);
  assert.equal(nodes(f.render()).filter(node=>node.type==='path').length,0,'stale pre-filter map must be withheld before effect');cleanup();
});
test('category/state changes clear postal selection, closed fetches preserve signal, and Ctrl-scroll alone changes zoom',async()=>{
  const {f,calls,cleanup}=await loaded();let tree=f.render();nodes(tree).find(node=>node.type==='button'&&text(node).includes('Missing ZIP')).props.onClick();assert.match(text(f.render()),/10.00%/);
  nodes(tree).find(node=>node.type==='select'&&node.props['aria-label']==='Heatmap credential category').props.onChange({target:{value:'residential-roofer'}});assert.equal(f.values[2],null);f.render();cleanup();const stop=f.effect();await tick();assert.match(calls[1].url,/category=residential-roofer/);assert.equal(calls[1].options.method,'GET');
  tree=f.render();const svg=nodes(tree).find(node=>node.type==='svg');let prevent=0;svg.props.onWheel({ctrlKey:false,deltaY:-1,preventDefault(){prevent++;}});assert.equal(f.values[6],1);svg.props.onWheel({ctrlKey:true,deltaY:-1,preventDefault(){prevent++;}});assert.equal(f.values[6],1.18);assert.equal(prevent,1);stop();
});
test('unmount aborts request and a late older response cannot replace newer filters',async()=>{
  const calls=[],f=fixture((url,options)=>new Promise(resolve=>calls.push({url,options,resolve})));f.render();const old=f.effect();f.values[1]='MN';f.render();old();const newer=f.effect();
  assert.equal(calls[0].options.signal.aborted,true);calls[1].resolve(sample());await tick();const saved=f.values[4];calls[0].resolve({...sample(),acceptedCohortRows:999});await tick();assert.equal(f.values[4],saved);newer();assert.equal(calls[1].options.signal.aborted,true);
});
test('explicit recheck uses empty POST and failed/busy evidence hides prior counts rather than zero',async()=>{
  const calls=[];let response=sample();const f=fixture(async(url,options)=>{calls.push({url,options});return response;});f.render();let stop=f.effect();await tick();nodes(f.render()).find(node=>node.type==='button'&&text(node)==='Recheck retained evidence').props.onClick();f.render();stop();response={available:false,status:'busy-cancelling-prior-build',nationalStates:[],postalGroups:[],summary:null};stop=f.effect();await tick();
  assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.body,undefined);assert.match(text(f.render()),/still cancelling/);assert.doesNotMatch(text(f.render()),/Selected credential rows/);stop();
});
