import path from 'node:path';
import {readdir,lstat} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {mnSelectionReadJson as readJson,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {APP_ROOT} from './paths.mjs';
import {ME_ASC_VERSION,ME_ASC_LIMITS as L,ME_ASC_LABELS,meClaims,meCheck as check} from './me-asc-preflight-contract.mjs';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),keys.split(' ').sort());
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1048576;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const labels=v=>Array.isArray(v)&&v.length<=ME_ASC_LABELS.length&&v.every(x=>ME_ASC_LABELS.includes(x));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export async function validateMeManagedOptions(value){
 check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===2&&['output','operationId'].every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)??{},'value')));
 const {output,operationId}=value;check(typeof output==='string'&&output===path.resolve(output)&&uuid(operationId)&&path.basename(output)==='output'&&path.basename(path.dirname(output))===operationId);
 const relative=path.relative(path.join(APP_ROOT,'data'),output);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&relative.split(path.sep)[0]!=='tmp');await canonical(output);return {output,operationId};
}
export function validateMeAscReceipt(r){
 check(exact(r,'schema_version execution_mode status started_at finished_at policy_sha256 limits claims requests pages counts export_schema session_controls cleanup_verified'));
 check(r.schema_version===ME_ASC_VERSION&&['native-fetch','injected-test-transport'].includes(r.execution_mode)&&['inspection-required','schema-observed-not-collection-ready'].includes(r.status));
 check(r.policy_sha256==='793f793c288d68e354e6bfbfbd12e42f7a81a7a75eb33e37dbc2155f2e9326c5'&&same(r.limits,L)&&same(r.claims,meClaims()));
 for(const t of [r.started_at,r.finished_at])check(typeof t==='string'&&Number.isFinite(Date.parse(t))&&new Date(t).toISOString()===t);
 check(r.finished_at>=r.started_at&&typeof r.cleanup_verified==='boolean');
 check(Array.isArray(r.requests)&&r.requests.length<=L.requests);let bytes=0;
 const order=['initial','category','county','list','details','export'];let prior=-1;
 for(const request of r.requests){check(exact(request,'step method status bytes sha256 complete'));const index=order.indexOf(request.step);check(index>prior&&index>=0);prior=index;
  check(request.method===(index<3?'GET':'POST')&&(request.status===null||Number.isInteger(request.status)&&request.status>=100&&request.status<=599)&&count(request.bytes)&&request.bytes<=L.response_bytes&&typeof request.complete==='boolean');
  check(request.complete?hash(request.sha256)&&[200,302].includes(request.status):request.sha256===null);bytes+=request.bytes;
 }check(bytes<=L.total_bytes);
 check(r.pages&&typeof r.pages==='object'&&!Array.isArray(r.pages)&&Object.keys(r.pages).every(k=>['initial','county','list','details','export'].includes(k)));
 for(const page of Object.values(r.pages)){
  check(exact(page,'labels label_counts known_label_occurrences form_count form_structure table_count structure_sha256')&&labels(page.labels)&&count(page.known_label_occurrences)&&count(page.form_count)&&count(page.table_count)&&hash(page.structure_sha256));
  check(page.label_counts&&typeof page.label_counts==='object'&&!Array.isArray(page.label_counts));
  check(Object.keys(page.label_counts).every(k=>ME_ASC_LABELS.includes(k)&&count(page.label_counts[k]))&&Object.values(page.label_counts).reduce((a,b)=>a+b,0)===page.known_label_occurrences);
  check(Array.isArray(page.form_structure)&&page.form_structure.length===page.form_count);
  for(const f of page.form_structure)check(exact(f,'known_name post controls unnamed_controls hidden_controls checkbox_controls')&&(f.known_name===null||['type_list','facsearch','county_city','facility_list','get_excel'].includes(f.known_name))&&typeof f.post==='boolean'&&[f.controls,f.unnamed_controls,f.hidden_controls,f.checkbox_controls].every(count)&&[f.unnamed_controls,f.hidden_controls,f.checkbox_controls].every(n=>n<=f.controls));
 }
 check(exact(r.counts,'list_rows details_rows export_rows list_details_match list_export_match'));
 for(const key of ['list_rows','details_rows','export_rows'])check(r.counts[key]===null||count(r.counts[key]));
 check(r.counts.list_rows===null||r.counts.list_rows<=L.rows);
 check(r.counts.list_details_match===(r.counts.list_rows!==null&&r.counts.list_rows===r.counts.details_rows)&&r.counts.list_export_match===(r.counts.list_rows!==null&&r.counts.list_rows===r.counts.export_rows));
 check(exact(r.session_controls,'csrf_forms export_named_fields unnamed_controls_omitted')&&Number.isInteger(r.session_controls.csrf_forms)&&r.session_controls.csrf_forms>=0&&r.session_controls.csrf_forms<=2&&r.session_controls.export_named_fields===0&&r.session_controls.unnamed_controls_omitted===true);
 if(r.export_schema!==null){const e=r.export_schema;check(exact(e,'format rows columns known_labels unknown_label_count conservation_verified')&&['unresolved','html-table-unresolved','html-table'].includes(e.format)&&labels(e.known_labels)&&e.conservation_verified===false);
  for(const key of ['rows','columns','unknown_label_count'])check(e[key]===null||count(e[key]));
  check(e.rows===r.counts.export_rows);if(e.format==='html-table')check(e.columns===e.known_labels.length+e.unknown_label_count&&e.rows!==null);else check(e.rows===null&&e.columns===null&&e.known_labels.length===0&&e.unknown_label_count===null);
 }
 if(r.status==='schema-observed-not-collection-ready'){
  const redirected=r.requests[1]?.status===302;
  const itinerary=redirected?['initial','category','county','list','details','export']:['initial','category','list','details','export'];
  check(same(r.requests.map(q=>q.step),itinerary)&&r.requests.every(q=>q.complete&&q.status===(redirected&&q.step==='category'?302:200)&&(q.status===302||q.bytes>0)));
  check(same(Object.keys(r.pages).sort(),['county','details','export','initial','list'])&&r.cleanup_verified&&r.export_schema?.format==='html-table'&&r.export_schema.columns>=2&&r.export_schema.unknown_label_count===0&&r.counts.list_details_match&&r.counts.list_export_match);
  check(r.counts.list_rows>0&&r.counts.details_rows===(r.pages.details.label_counts['Provider Type']??null)&&r.session_controls.csrf_forms===2);
  const form=(page,name)=>{const found=page.form_structure.filter(f=>f.known_name===name);check(found.length===1&&found[0].post);return found[0];};
  const county=form(r.pages.county,'county_city'),list=form(r.pages.list,'facility_list');form(r.pages.details,'get_excel');
  check(county.hidden_controls>=1&&county.checkbox_controls>=6&&list.hidden_controls>=2&&list.checkbox_controls===r.counts.list_rows&&r.pages.export.table_count>=1);
 }
 return r;
}
export async function readMeAscReceipt(manifest,{signal,expectedSha256,operationId,operationRoot,startedAt}={}){
 check(typeof manifest==='string'&&path.isAbsolute(manifest)&&path.basename(manifest)==='manifest.json');signal?.throwIfAborted();
 const managed=operationId!==undefined||operationRoot!==undefined||startedAt!==undefined;
 if(managed){await validateMeManagedOptions({output:operationRoot,operationId});check(hash(expectedSha256)&&typeof startedAt==='string'&&Number.isFinite(Date.parse(startedAt))&&new Date(startedAt).toISOString()===startedAt);}
 const directory=path.dirname(manifest);await canonical(directory);const owner=await lstat(directory,{bigint:true});check(same((await readdir(directory)).sort(),['manifest.json','receipt.json']));
 const mm={},m=await readJson(manifest,10000,signal,mm);
 check(exact(m,managed?'schema_version run_id operation_id receipt':'schema_version run_id receipt')&&m.schema_version==='me-asc-preflight-bundle@1.0.0'&&uuid(m.run_id)&&path.basename(directory)===m.run_id&&exact(m.receipt,'name bytes sha256')&&m.receipt.name==='receipt.json'&&count(m.receipt.bytes)&&hash(m.receipt.sha256));
 if(managed)check(m.operation_id===operationId&&manifest===path.join(operationRoot,'jobs',m.run_id,'manifest.json'));
 if(expectedSha256!==undefined)check(mm.sha256===expectedSha256);
 const meter={},receipt=await readJson(path.join(directory,'receipt.json'),100000,signal,meter);validateMeAscReceipt(receipt);check(meter.bytes===m.receipt.bytes&&meter.sha256===m.receipt.sha256);
 if(managed)check(receipt.execution_mode==='native-fetch'&&receipt.cleanup_verified&&receipt.started_at>=startedAt&&Date.parse(receipt.finished_at)-Date.parse(receipt.started_at)<=L.session_timeout_ms);
 const again={};await readJson(manifest,10000,signal,again);const after=await lstat(directory,{bigint:true});check(again.sha256===mm.sha256&&again.identity.ino===mm.identity.ino&&again.identity.dev===mm.identity.dev&&after.isDirectory()&&!after.isSymbolicLink()&&after.ino===owner.ino&&after.dev===owner.dev&&same((await readdir(directory)).sort(),['manifest.json','receipt.json']));
 return {manifest_sha256:mm.sha256,manifest:m,receipt};
}
