import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readEpaOperationalIndustryStatus } from './epa-operational-industry-status.mjs';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const jsx=(type,props)=>({type,props});
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(request=async()=>assert.fail('unexpected request')){
  const exports={},slots=[],effects=[],cleanups=[];let cursor=0,mounted=false;
  runInNewContext(code,{exports,AbortController,require:name=>name==='./runner-client'?{runnerJson:request}:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='react'?{useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value}]},useEffect(effect){if(!mounted)effects.push(effect)}}:name.startsWith('../config/')?{default:require(name)}:{}});
  return{valid:(value,state='NJ')=>exports.validEpaIndustryStatusView(value,state),render(state='NJ'){cursor=0;const tree=exports.EpaOperationalIndustryStatus({state});if(!mounted){mounted=true;effects.splice(0).forEach(effect=>cleanups.push(effect()))}return tree},close:()=>cleanups.forEach(cleanup=>cleanup?.())};
}
const view=await readEpaOperationalIndustryStatus({state:'NJ'});
test('EPA supplemental UI renders mapped counts, separate territories, unknown state ZIP reach and no mappings',async()=>{
  const h=harness(async url=>{assert.equal(url,'/api/business-map/epa-operational-industry-status?state=NJ');return structuredClone(view)});
  assert.equal(h.valid(view),true);h.render();await flush();const rendered=text(h.render());
  for(const expected of [/124,323 record memberships/,/NJ · 2,236 record memberships/,/16,089 positive source-reported ZIP5 keys/,/No EPA mapping/,/PR · 514 record memberships/,/501,976 missing NAICS/,/Source edition and primary industry remain unresolved/,/State-specific positive ZIP counts are unavailable/,/nonadditive/,/current business operation/,/bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7/])assert.match(rendered,expected);
  assert.doesNotMatch(rendered,/%|progressbar|0% complete/);h.close();
});
test('EPA UI rejects nested count/roster/schema/state/pin/claim drift and inferred zeros',()=>{
  const h=harness();
  for(const mutate of [
    x=>x.extra=true,x=>x.schema_version='other',x=>x.selected_state='NY',x=>x.selected_state_evidence.code='PR',x=>x.selected_state_evidence.jurisdiction_kind='territory',
    x=>x.selected_state_evidence=null,x=>x.national.status_counts.mapped++,x=>x.national.industries[0].record_memberships++,
    x=>x.national.industries[0].positive_zip5_count++,x=>x.national.industries[6].record_memberships=0,x=>x.national.industries[6].mapping='mapped',
    x=>x.selected_state_evidence.industries[0].positive_zip5_count=0,x=>x.territories[0].code='NJ',x=>x.territories.pop(),
    x=>x.selected_state_evidence.status_counts['missing-naics']++,x=>x.selected_state_evidence.source_record_count=-1,x=>x.selected_state_evidence.segment_memberships=NaN,
    x=>x.selected_state_evidence.industries[0].extra=true,x=>x.provenance.manifest_sha256='f'.repeat(64),x=>x.provenance.source_as_of='2026-10-08',
    x=>x.provenance.reference_editions.pop(),x=>x.claims.cross_segment_counts_additive=true,x=>x.claims.unique_business_count=0,x=>x.claims.extra=true,
  ]){const value=structuredClone(view);mutate(value);assert.equal(h.valid(value),false,String(mutate))}
});
test('unavailable supplemental response renders unknown without hiding base Industry Status composition',async()=>{
  for(const request of [async()=>{throw new Error('unavailable')},async()=>({...view,schema_version:'invalid'})]){
    const h=harness(request);h.render();await flush();const rendered=text(h.render());assert.match(rendered,/Existing Industry Status remains available/);assert.match(rendered,/counts are unknown/);assert.doesNotMatch(rendered,/124,323/);h.close();
  }
  assert.match(source,/<OperationalIndustryCrosswalkStatus state=\{state\}\/><EpaOperationalIndustryStatus state=\{state\}\/><GovernedCoverageStates\/>/);
});
test('national supplemental response works before state selection and abort prevents stale counts',async()=>{
  const national=await readEpaOperationalIndustryStatus();
  const h=harness(async url=>{assert.equal(url,'/api/business-map/epa-operational-industry-status');return national});assert.equal(h.valid(national,''),true);h.render('');await flush();assert.match(text(h.render('')),/Select a state/);h.close();
  let resolve;const stale=harness(()=>new Promise(done=>{resolve=done}));stale.render();stale.close();resolve(view);await flush();assert.doesNotMatch(text(stale.render()),/124,323/);
});
