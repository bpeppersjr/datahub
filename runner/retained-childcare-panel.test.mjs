import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {APP_ROOT} from './paths.mjs';
const require=createRequire(import.meta.url);
const source=readFileSync(path.join(APP_ROOT,'app/retained-childcare-panel.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const cohort=(state,total)=>({status:'available',source_id:`source-${state}`,publisher_scope:state,accepted_candidate_rows:total,quarantined_candidate_rows:0,by_reported_zip:[{state:null,zip5:'50301',candidate_rows:2}],by_reported_state:[{state:null,candidate_rows:total}],quality:{with_points:0,with_zip5:total,with_zip4:0},provenance:{observed_at:'2026-09-09T00:00:00.000Z',source_updated_at:null}});
const data={status:'available',view:{cohorts:{IA:[cohort('IA',10)],VT:[cohort('VT',20)]}}};
function render(props={},input=data,error=false){
  let index=0;const exports={};
  const dependencies=id=>id==='react'?{useState:()=>[index++===0?input:error,()=>{}],useEffect:()=>{}}:id==='./runner-client'?{runnerJson:()=>assert.fail('render test must not request data')}:require(id);
  new Function('require','exports',compiled)(dependencies,exports);
  return renderToStaticMarkup(exports.default({selectedZip:'',countySelected:false,...props}));
}
test('retained panel scopes source rows by publisher and reported ZIP without national claims',()=>{
  const html=render({publisherState:'IA',selectedZip:'50301',countySelected:true});
  assert.match(html,/Iowa/);assert.doesNotMatch(html,/Vermont/);assert.match(html,/20.0%/);
  assert.match(html,/not county totals/);assert.match(html,/no reported address state/);assert.match(html,/all U.S. businesses collected: unknown/);
});
test('unresolved state, unavailable evidence and failures cannot become zero counts',()=>{
  const unresolved=render({scopeUnavailable:true});assert.match(unresolved,/counts are withheld/);assert.doesNotMatch(unresolved,/Accepted source rows/);
  assert.match(render({}, {status:'unavailable'}),/not a zero business count/);
  assert.match(render({},null,true),/could not be verified/);
  assert.match(render({publisherState:'TX'}),/Coverage is unknown/);
});
test('retained panel uses saved read endpoint with stale-response guard and no build action',()=>{
  assert.match(source,/api\/business-map\/retained-childcare/);assert.match(source,/if\(active\)setData/);assert.match(source,/active=false/);
  assert.doesNotMatch(source,/cohort-snapshots|method:\s*['"]POST/);
});

test('restricted samples remain distinct, state scoped and report ZIP rather than query assigned',()=>{
  const group=state=>({state,query_zip5:'73102',observed_at:'2026-09-10T16:10:18.534Z',normalized_at:'2026-09-10T16:10:18.636Z',count:4,points_available:4,
    rows:[{row_ordinal:1,name:'Retained example',source_record_id:'source-1',query_zip5:'73102',latitude:35,longitude:-97,address:{source_lines:['Source address'],zip5:'73103',zip4:'1234'}}]});
  const input={...data,view:{...data.view,restricted_samples:{groups:[group('OK'),group('NH')]}}};
  const html=render({publisherState:'OK',selectedZip:'73103'},input);
  assert.match(html,/Oklahoma — 4 retained sample rows/);assert.doesNotMatch(html,/New Hampshire|No retained childcare publisher/);
  assert.match(html,/separate from the seven enrolled state-source cohorts/);assert.match(html,/completeness are unknown/);
  assert.match(html,/Query ZIP: 73102; reported ZIP5: 73103; ZIP\+4: 1234/);assert.match(html,/Source latitude: 35/);
  assert.doesNotMatch(render({scopeUnavailable:true},input),/retained sample rows/);
});
