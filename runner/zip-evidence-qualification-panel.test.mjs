import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {qualificationFixture} from './zip-evidence-qualification-test-fixtures.mjs';
const require=createRequire(import.meta.url),source=await readFile(new URL('../app/zip-evidence-qualification-panel.tsx',import.meta.url),'utf8');
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('server-supplied qualification performs no browser lookup and retry delegates to the inspector',()=>{
 const h=harness(()=>assert.fail('second browser request')),value=qualificationFixture();let retries=0;
 let tree=h.render({supplied:{view:value,error:false},onRetry:()=>retries++});
 assert.match(text(tree),/Observed count/);assert.equal(nodes(tree).filter(n=>n.type==='table').length,1);
 tree=h.render({supplied:{view:null,error:true},onRetry:()=>retries++});nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(retries,1);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);h.close();
});
function harness(request){const values=[],deps=[],cleanups=[],effects=[];let slot=0,eslot=0;const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,AbortController,URLSearchParams,require:id=>id==='react'?{useState:initial=>{const n=slot++;if(!(n in values))values[n]=initial;return [values[n],value=>values[n]=value];},useEffect:(fn,next)=>{const n=eslot++;if(!deps[n]||next.some((v,i)=>v!==deps[n][i])){deps[n]=next;effects.push(()=>{cleanups[n]?.();cleanups[n]=fn();});}}}:id==='./runner-client'?{runnerJson:request}:require(id)});return{render(props={}){slot=0;eslot=0;const tree=exports.default({zip:'00501',categoryId:'all',coverageReleaseId:'coverage-fixture',registryReleaseId:'registry-fixture',request,...props});effects.splice(0).forEach(fn=>fn());return tree;},close(){cleanups.forEach(fn=>fn?.());}};}
test('panel distinguishes observed, stale-zero and unmeasured counts with accessible scalable table',async()=>{
 for(const qualification of ['measured-within-review-window','measured-stale-review-due','unmeasured']){const h=harness(async()=>qualificationFixture({qualification}));h.render();await flush();const tree=h.render(),value=text(tree);assert.match(value,/Current operations are not verified/);assert.match(value,/completeness remain unknown/);assert.match(value,/No public export/);assert.match(value,/build time does not refresh/);assert.equal(tree.props.style.fontSize,'1rem');assert.equal(nodes(tree).find(n=>n.props?.role==='region').props.tabIndex,0);assert.equal(nodes(tree).find(n=>n.type==='table').props.style.fontSize,'inherit');assert.ok(nodes(tree).some(n=>n.type==='caption'));assert.ok(nodes(tree).some(n=>n.props?.scope==='row'));assert.match(value,/Observed count/);assert.match(value,/Eligible under review rule/);assert.match(value,qualification==='unmeasured'?/Unknown/:qualification==='measured-stale-review-due'?/does not mean closed/:/Within internal review window/);h.close();}
});
test('no valid ZIP means no request; absent and unsupported are not zero',async()=>{
 const empty=harness(()=>assert.fail('invalid ZIP request'));assert.match(text(empty.render({zip:''})),/Enter an exact ZIP5/);empty.close();
 for(const selection_status of ['absent','unsupported']){const value=qualificationFixture();value.selection_status=selection_status;value.rows=[];const h=harness(async()=>value);h.render();await flush();const tree=h.render();assert.match(text(tree),selection_status==='absent'?/Absence is not measured zero/:/unavailable, not zero/);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);h.close();}
});
test('ZIP/category changes abort stale responses, release mismatch withholds results and retry is independent',async()=>{
 const pending=[];const h=harness((url,{signal})=>new Promise((resolve,reject)=>pending.push({url,signal,resolve,reject})));h.render();h.render({zip:'12345',categoryId:'health-care'});assert.equal(pending[0].signal.aborted,true);pending[0].resolve(qualificationFixture());pending[1].resolve(qualificationFixture({zip:'12345',category:'all'}));await flush();let tree=h.render({zip:'12345',categoryId:'health-care'});assert.match(text(tree),/Ordinary ZIP evidence is unchanged/);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);
 nodes(tree).find(n=>n.type==='button').props.onClick();h.render({zip:'12345',categoryId:'health-care'});assert.equal(pending.length,3);const mismatch=qualificationFixture({zip:'12345',category:'health-care'});mismatch.bindings.coverage_release_id='other';pending[2].resolve(mismatch);await flush();assert.match(text(h.render({zip:'12345',categoryId:'health-care'})),/does not match/);h.close();assert.equal(pending[2].signal.aborted,true);
});
test('unavailable release permits retry without zero counts or automatic build',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return {schema_version:'zip-evidence-qualification-view@1.0.0',available:false,status:'not-enrolled',zip5:'00501',category_id:'all',rows:[]};});h.render();await flush();const tree=h.render();assert.match(text(tree),/No assessment was rebuilt/);assert.equal(calls,1);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);assert.ok(nodes(tree).some(n=>n.type==='button'));h.close();
 const workspace=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');assert.match(workspace,/section==='Business segments'&&<ZipEvidenceQualificationPanel/);
});

test('navigation state and missing release identities clear and abort qualification without invalid lookup',async()=>{
 const pending=[];const h=harness((url,{signal})=>new Promise(resolve=>pending.push({url,signal,resolve})));
 h.render({coverageReleaseId:''});assert.equal(pending.length,0);
 h.render({navigationState:'PA'});assert.equal(pending.length,1);
 const tree=h.render({navigationState:'MD'});assert.equal(pending[0].signal.aborted,true);assert.equal(pending.length,2);assert.match(text(tree),/Loading qualification/);
 pending[0].resolve(qualificationFixture());await flush();assert.equal(nodes(h.render({navigationState:'MD'})).filter(n=>n.type==='table').length,0);
 h.render({zip:'1234',navigationState:'MD'});assert.equal(pending[1].signal.aborted,true);assert.equal(pending.length,2);h.close();
});

test('childcare sends its exact qualification query and preserves unsupported as unavailable, not zero',async()=>{
 const calls=[];const value=qualificationFixture({category:'childcare'});value.selection_status='unsupported';value.rows=[];
 const h=harness(async(url)=>{calls.push(url);return value;});h.render({categoryId:'childcare'});await flush();const tree=h.render({categoryId:'childcare'});
 assert.deepEqual(calls,['/api/business-map/zip-evidence-qualification?zip=00501&category=childcare']);assert.match(text(tree),/no supported mapping in this release/);assert.match(text(tree),/unavailable, not zero/);assert.equal(nodes(tree).filter(n=>n.type==='table').length,0);h.close();
});
