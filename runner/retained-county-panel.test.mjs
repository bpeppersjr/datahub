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
const data={status:'available',geography_manifest_sha256:'a',pa_county_geoids:['42001','42003'],pa_selected_source_rows:4995,
  derivative_created_at:'2026-09-10T18:30:17.735Z',counts:{candidate_rows:12206,by_status:{'assigned-single-county':4930,
    'missing-source-point':4028,'unknown-coordinate-system':1476,'source-not-enabled-for-overlay':1772},by_county:[{county_geoid:'42001',candidate_rows:20}]}};
function render(props={},input=data,error=false,revision=props.mapRevision){const exports={};
  new Function('require','exports',compiled)(id=>id==='react'?{useState:()=>[{revision,data:input,error},()=>{}],useEffect:()=>{}}:id==='./runner-client'?{}:require(id),exports);
  return renderToStaticMarkup(exports.default({level:'county',geoid:'42001',geographyHash:'a',...props}));}
test('county panel shows assigned cohort denominator separately from business completeness',()=>{
  const html=render(); assert.match(html,/Assigned source-point rows/);assert.match(html,/0.4%/);assert.match(html,/4,995/);assert.match(html,/not industry completeness/);
  assert.match(render({geoid:'42003'}),/>0<\/dd>/);assert.doesNotMatch(render({geoid:'24001'}),/Assigned source-point rows/);
});
test('county panel withholds mismatched geography and ZIP counts and uses read-only endpoint',()=>{
  assert.match(render({geographyHash:'b'}),/Counts are withheld/);assert.match(render({level:'zip'}),/ZIP membership was not derived/);
  assert.match(render({},null,true),/could not be verified/);assert.match(render({},{status:'not-enrolled'}),/not a zero business count/);
  assert.doesNotMatch(render({mapRevision:'new'},data,false,'old'),/Assigned source-point rows/);
  assert.match(render({mapRevision:'new'},data,false,'old'),/Loading verified saved relationships/);
  assert.match(source,/active=false/);assert.doesNotMatch(source,/method:\s*['"]POST|--run/);
});
