import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),source=await readFile(new URL('../app/census-zbp-zip-profile.tsx',import.meta.url),'utf8'),exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require});
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)],text=t=>t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
const row=(naics_code,establishments)=>({zip_code:'00501',naics_code,establishments,size_1_4:0,size_5_9:null,size_5_9_suppression_code:'D',publisher_place_labels:{preferred_city:'Publisher city',preferred_state:'NY',county_name:'Publisher county'}});
function render(profile,status='present'){return exports.default({view:{available:true,zip5:'00501',reference_year:2023,status,profile,index:{release_id:'index-fixture',manifest_sha256:'a'.repeat(64)}},onRetry:()=>{}});}
test('ZIP-wide exact-code table preserves total zero, null and suppression with scalable keyboard access',()=>{
 const tree=render({industry_rows:[row('------',0),row('23----',2)]}),value=text(tree);assert.match(value,/Published total code ------: 0/);assert.match(value,/Not filtered or mapped/);assert.match(value,/must not be added/);assert.match(value,/not GDP or GDP allocation weights/);assert.match(value,/source flag D/);assert.match(value,/Unpublished \/ unknown/);assert.match(value,/not governed assignment/);assert.match(value,/Publisher county/);assert.equal(tree.props.style.fontSize,'1rem');assert.equal(nodes(tree).find(n=>n.props?.role==='region').props.tabIndex,0);assert.equal(nodes(tree).filter(n=>n.props?.scope==='row').length,2);assert.equal(nodes(tree).find(n=>n.type==='table').props.style.fontSize,'inherit');assert.ok(nodes(tree).find(n=>n.type==='summary'));
});
test('missing total is not computed; empty, absent and unavailable remain distinct',()=>{
 assert.match(text(render({industry_rows:[row('23----',2)]})),/Not published in this ZIP industry profile/);
 assert.match(text(render({industry_rows:[]})),/Denominator-only context is not a measured zero/);
 assert.match(text(render(null,'absent-from-selected-zbp-zip-union')),/No profile in the selected ZIP union/);
 let retries=0;const tree=exports.default({view:{available:false},onRetry:()=>retries++});assert.match(text(tree),/unavailable/);nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(retries,1);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);
});
test('ZIP Economics overview consumes the existing inspector result without a second browser request',async()=>{
 const workspace=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');assert.match(workspace,/mode === "economy" && section === "Overview"[\s\S]*<CensusZbpZipProfile[\s\S]*view=\{view\.census_zbp_industry_profile\}/);assert.doesNotMatch(source,/runnerJson|fetch\(|useEffect/);
});
