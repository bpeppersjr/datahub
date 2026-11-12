import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { readStateExactZipIndustryEvidenceStateV33 } from "./state-exact-zip-industry-evidence-disposition-v3-3.mjs";

const require=createRequire(import.meta.url),source=await readFile(new URL("../app/state-exact-zip-evidence-panel.tsx",import.meta.url),"utf8");
const nodes=value=>!value||typeof value!=="object"?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)];
const text=value=>value==null||typeof value==="boolean"?"":typeof value!=="object"?String(value):Array.isArray(value)?value.map(text).join(""):text(value.props?.children);
function harness(request){const values=[],effects=[],cleanups=[],dependencies=[];let cursor=0,effectCursor=0;const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,AbortController,encodeURIComponent,require:name=>name==="./runner-client"?{runnerJson:request}:name==="react"?{useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],next=>values[i]=next]},useEffect:(effect,next)=>{const i=effectCursor++;if(!dependencies[i]||next.some((item,offset)=>item!==dependencies[i][offset])){dependencies[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=effect()})}}}:require(name)});return{exports,render:props=>{cursor=0;effectCursor=0;const tree=exports.default(props);effects.splice(0).forEach(run=>run());return tree},close:()=>cleanups.forEach(cleanup=>cleanup?.())}}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test("state evidence panel renders the registered 51-dimension successor",async()=>{
 const fixture=await readStateExactZipIndustryEvidenceStateV33({state:"MD"}),h=harness(async()=>fixture);h.render({state:"MD"});await flush();const tree=h.render({state:"MD"}),value=text(tree);
 assert.match(value,/51 retained source dimensions/);assert.match(value,/lifecycle dispositions/);assert.match(value,/Raw source status, derived evidence readiness, and lifecycle qualification remain separate/);assert.match(value,/184 material multi-state ZCTAs/);assert.match(value,/14,402 non-ZCTA keys/);assert.match(value,/not unique businesses, all-business completeness, or verified current operation/);assert.equal(nodes(tree).filter(node=>node.props?.scope==="row").length,51);h.close();
});

test("state evidence panel rejects scope drift and never shows stale state evidence",async()=>{
 const fixture=await readStateExactZipIndustryEvidenceStateV33({state:"MD"});let resolve;const h=harness(()=>new Promise(done=>{resolve=done}));h.render({state:"MD"});const loading=h.render({state:"VA"});assert.match(text(loading),/Loading state exact-ZIP evidence/);resolve(fixture);await flush();assert.doesNotMatch(text(h.render({state:"VA"})),/Maryland exact-ZIP/);h.close();
});

test("state v3 validator fails closed on vocabulary, dimension, geography, and claim drift",async()=>{
 const fixture=await readStateExactZipIndustryEvidenceStateV33({state:"MD"}),h=harness(async()=>fixture);assert.equal(h.exports.validStateExactZipEvidence(fixture,"MD"),true);
 for(const mutate of [v=>v.raw_status_vocabulary.pop(),v=>delete v.row.dimensions[Object.keys(v.row.dimensions)[0]],v=>v.geography_scope_counts["non-zcta-unassigned"]--,v=>v.claims.current_operations_verified=true,v=>v.row.dimensions[Object.keys(v.row.dimensions)[0]].derived_evidence_status_counts["evidence-present"]++]){const changed=structuredClone(fixture);mutate(changed);assert.equal(h.exports.validStateExactZipEvidence(changed,"MD"),false)}
});

test("State Completion mounts the panel once and Industry Summary does not duplicate it",async()=>{const workspace=await readFile(new URL("../app/workspace-views.tsx",import.meta.url),"utf8");assert.equal(workspace.match(/<StateExactZipEvidencePanel state=\{state\} \/>/g)?.length,1);assert.match(workspace,/\{!industries && mapMode === "availability" && <StateExactZipEvidencePanel state=\{state\} \/>\}/)});
