import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readCensusZctaResidualView } from './census-zcta-residual-geography.mjs';

const require=createRequire(import.meta.url),source=await readFile(new URL('../app/census-zcta-residual-layer.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const jsx=(type,props)=>({type,props:props??{}}),nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
function harness(request){const exports={},states=[];let cursor=0,mounted=false;const effects=[];
  runInNewContext(code,{exports,module:{exports},require:id=>id==='react'?{useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useEffect(effect){if(!mounted)effects.push(effect)}}:id==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:id==='./runner-client'?{runnerJson:request}:require(id),AbortController,URLSearchParams});
  return {exports,render(state='DC'){cursor=0;return exports.default({state})},async mount(){this.render();mounted=true;for(const effect of effects)effect();await new Promise(resolve=>setImmediate(resolve));}};
}
const retained=await readCensusZctaResidualView({state:'DC'});
test('optional context validator binds selection, release, component conservation and conservative claims',()=>{
  const h=harness();assert.equal(h.exports.validResidualReferenceView(retained,'DC',0,'all'),true);
  for(const mutate of [v=>v.release.manifest_sha256='0'.repeat(64),v=>v.state.state_abbreviation='MN',v=>v.reference_areas.direction_counts.north++,v=>v.reference_areas.rows[0].id='invented',v=>v.reference_areas.rows[0].label='Park',v=>v.reference_areas.next_offset=null,v=>v.claims.population=0,v=>v.claims.existing_map_blocked=true,v=>v.reference_areas.rows[0].reference_bounds=[NaN,0,1,1]]){const changed=structuredClone(retained);mutate(changed);assert.equal(h.exports.validResidualReferenceView(changed,'DC',0,'all'),false)}
});
test('renders unique labels and bounded controls; state change hides old result immediately',async()=>{
  const h=harness(async()=>retained);await h.mount();const tree=h.render(),rendered=text(tree);
  assert.match(rendered,/District of Columbia unresolved areas/);assert.match(rendered,/167 retained polygon components/);assert.match(rendered,/Park, tribal, private-property, population and business status remain unresolved/);
  assert.equal(nodes(tree).filter(node=>node.type==='tr').length,101);
  assert.equal(nodes(tree).find(node=>node.type==='button'&&text(node)==='Previous areas').props.disabled,true);
  assert.equal(nodes(tree).find(node=>node.type==='button'&&text(node)==='Next areas').props.disabled,false);
  assert.doesNotMatch(text(h.render('MN')),/District of Columbia unresolved areas/);
});
test('failed or incompatible optional context leaves the map available',async()=>{
  for(const request of [async()=>{throw Error('missing')},async()=>({...retained,claims:{...retained.claims,population:0}})]){const h=harness(request);await h.mount();assert.match(text(h.render()),/The state\/ZCTA map remains available/);assert.equal(nodes(h.render()).some(node=>node.type==='table'),false)}
});
