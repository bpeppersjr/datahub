import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import { readNationalZipGoalAcceptance, projectNationalZipObjectiveReadiness } from './national-zip-goal-acceptance.mjs';

const require=createRequire(import.meta.url),source=await readFile(new URL('../app/workspace-views.tsx',import.meta.url),'utf8');
const nodes=value=>!value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)];
const text=value=>value==null||typeof value==='boolean'?'':typeof value!=='object'?String(value):Array.isArray(value)?value.map(text).join(''):text(value.props?.children);
function harness(request){const values=[],effects=[],cleanups=[],dependencies=[];let cursor=0,effectCursor=0;const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,AbortController,URLSearchParams,document:{getElementById:()=>null},require:name=>name==='./runner-client'?{runnerJson:request}:name==='./business-intelligence'?{StateAvailabilityChoropleth:()=>null}:name.startsWith('./census-')?{default:()=>null}:name.startsWith('./')?{}:name==='react'?{useMemo:fn=>fn(),useState:initial=>{const index=cursor++;if(!(index in values))values[index]=initial;return[values[index],next=>values[index]=next];},useEffect:(effect,next)=>{const index=effectCursor++;if(!dependencies[index]||next.some((value,item)=>value!==dependencies[index][item])){dependencies[index]=next;effects.push(()=>{cleanups[index]?.();cleanups[index]=effect();});}}}:require(name)});return{exports,render:(name,props={})=>{cursor=0;effectCursor=0;const tree=exports[name](props);effects.splice(0).forEach(run=>run());return tree;},close:()=>cleanups.forEach(cleanup=>cleanup?.())};}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test('Industries exposes a keyboard-readable cross-category matrix without business-completeness claims',async()=>{
 const category_summaries=[{category_id:'general-business',national:{available:1,measured:1,unmeasured:50,expected:51},selected_state:{code:'MD',name:'Maryland',available:0,measured:0,unmeasured:1,expected:1,measurement_status:'unmeasured'}},{category_id:'health-care',national:{available:51,measured:51,unmeasured:0,expected:51},selected_state:{code:'MD',name:'Maryland',available:1,measured:1,unmeasured:0,expected:1,measurement_status:'measured'}}];
 const h=harness(async url=>url.includes('state-summary')?{available:false,categories:[],national_category_counts:{},national_category_percent_of_collected_evidence:{},states:[]}:url.includes('temporal-claim-matrix')?{available:false,status:'unavailable'}:{available:true,release_id:'matrix',denominator:{version:'v1'},categories:['general-business','health-care'],category_summaries,jurisdictions:[{code:'MD',name:'Maryland',available:0,measured:0,unmeasured:1,denominator:1,percent:null,broad_layer_gap:true}],selected:{code:'MD',category:{datasets:[]}}});
 h.render('CoverageWorkspace',{industries:true,stateCode:'MD'});await flush();const tree=h.render('CoverageWorkspace',{industries:true,stateCode:'MD'}),value=text(tree),region=nodes(tree).find(node=>node.props?.['aria-label']==='National and selected-state reporting-industry dataset availability');
 assert.equal(region.props.role,'region');assert.equal(region.props.tabIndex,0);assert.equal(nodes(region).filter(node=>node.props?.scope==='row').length,2);assert.equal(nodes(tree).some(node=>typeof node.type==='function'&&node.type.name==='IndustryViewTabs'),false);assert.match(value,/Industry connectivity/);assert.match(value,/not all-business or GDP completeness/);assert.match(value,/Unknown, not zero|unmeasured/i);h.close();
});

test('state changes clear prior completion counts and aborted late responses cannot restore them',async()=>{
 const pending=[];
 const h=harness((url,{signal})=>url.includes('state-summary')?Promise.resolve({available:false,categories:[],national_category_counts:{},national_category_percent_of_collected_evidence:{},states:[]}):url.includes('temporal-claim-matrix')?Promise.resolve({available:false,status:'unavailable'}):new Promise(resolve=>pending.push({url,signal,resolve})));
 const response=(state,status,available)=>({available:true,release_id:'matrix',denominator:{version:'v1'},categories:['general-business'],category_summaries:[{category_id:'general-business',national:{available:1,measured:1,unmeasured:50,expected:51},selected_state:state?{code:state,name:state,available,measured:1,unmeasured:0,expected:1,measurement_status:status}:null}],jurisdictions:[{code:'MD',name:'Maryland',available:1,measured:1,unmeasured:0,denominator:1,percent:100,broad_layer_gap:false},{code:'VA',name:'Virginia',available:1,measured:1,unmeasured:0,denominator:1,percent:100,broad_layer_gap:false}],selected:state?{code:state,category:{datasets:[]}}:null});
 h.render('CoverageWorkspace',{industries:true,stateCode:'MD'});assert.equal(pending[0].url.includes('state=MD'),true);let tree=h.render('CoverageWorkspace',{industries:true,stateCode:'VA'});assert.equal(pending[0].signal.aborted,true);assert.doesNotMatch(text(tree),/MD selected state|maryland-stale/);assert.equal(pending[1].url.includes('state=VA'),true);
 pending[1].resolve(response('VA','virginia-current',1));await flush();tree=h.render('CoverageWorkspace',{industries:true,stateCode:'VA'});assert.match(text(tree),/Selected state: VA/);assert.match(text(tree),/VA complete/);assert.match(text(tree),/1 \/ 1/);
 pending[0].resolve(response('MD','maryland-stale',7));await flush();tree=h.render('CoverageWorkspace',{industries:true,stateCode:'VA'});assert.match(text(tree),/Selected state: VA/);assert.doesNotMatch(text(tree),/maryland stale|Selected state: MD/);h.close();
});

test('State Completion shows strict lifecycle, reporting-only sites and partial entity geography counts with eight lineage bindings',async()=>{
 const readiness=projectNationalZipObjectiveReadiness(await readNationalZipGoalAcceptance({claim:'every-active-business-by-valid-zip'}));
 const h=harness(async url=>url.includes('national-objective-readiness')?readiness:url.includes('temporal-claim-matrix')?{available:false,status:'unavailable'}:url.includes('state-summary')?{available:false,states:[],categories:[],national_category_counts:{},national_category_percent_of_collected_evidence:{}}:{available:false,status:'unavailable'});
 assert.equal(h.exports.validNationalObjectiveReadiness(readiness),true);
 for (const mutate of [
  value=>{value.lineage.lifecycle_eligibility.registration_sha256='0'.repeat(64);},
  value=>{value.lineage.lifecycle_eligibility.artifact_inventory_sha256='0'.repeat(64);},
  value=>{value.lineage.lifecycle_eligibility.review_status_counts.stale=0;},
  value=>{value.acceptance.blocker_details.find(row=>row.code==='lifecycle-unknown-or-contradictory').count=0;},
  value=>{value.lineage.business_entity_geography_relationship.artifact_inventory_sha256='0'.repeat(64);},
  value=>{value.lineage.reporting_only_site_qualification.artifact_sha256='0'.repeat(64);},
  value=>{value.lineage.reporting_only_site_qualification.source_manifest_policy_hashes.MA='0'.repeat(64);},
  value=>{value.lineage.reporting_only_site_qualification.policy_profile_hashes.MA='0'.repeat(64);},
  value=>{value.requirements_ledger.find(row=>row.requirement==='reporting-only-site-qualification').site_count=1;},
  value=>{value.acceptance.blocker_details.find(row=>row.code==='reporting-only-sites-not-eligible-or-verified').count=0;},
  value=>{value.requirements_ledger.find(row=>row.requirement==='entity-geography-relationship').postal_counts['explicit-placeholder']=0;},
  value=>{value.requirements_ledger.find(row=>row.requirement==='entity-geography-relationship').same_code_zcta_is_membership=true;},
 ]){const invalid=structuredClone(readiness);mutate(invalid);assert.equal(h.exports.validNationalObjectiveReadiness(invalid),false);}
 h.render('CoverageWorkspace',{industries:false,stateCode:'CA'});await flush();const tree=h.render('CoverageWorkspace',{industries:false,stateCode:'CA'}),component=nodes(tree).find(node=>node.type?.name==='NationalObjectiveReadinessCard'),card=component?.type(component.props),value=text(card);
 assert.ok(component);assert.match(value,/Not accepted/);assert.match(value,/Governed dataset availability is not all-business completeness/);assert.match(value,/40 broad jurisdiction gaps \/ 51 jurisdictions/);assert.match(value,/USPS denominator unavailable/);assert.match(value,/Entity-resolution benchmark gate not passed/);assert.match(value,/Nationwide industry universe unmeasured/);assert.match(value,/Current operation not independently verified/);assert.match(value,/Reporting-only sites not eligible or verified: 13,182/);assert.match(value,/13,182 reporting-only sites, separate from matching-profile denominator 8,011,835/);assert.match(value,/combined retained site-evidence rows: 8,025,017/);assert.match(value,/8,942 retained county point assignments/);assert.match(value,/4,237 Ohio rows are source-policy-ineligible/);assert.match(value,/All 13,182 USPS validity unverified/);assert.match(value,/Entity geography is partial/);assert.match(value,/7,963,395 same-code ZCTA candidates/);assert.match(value,/USPS validity is unverified for 8,011,835 profiles/);assert.match(value,/ZCTA correspondence is not membership/);assert.match(value,/Lifecycle eligibility not established: 0 \/ 8,011,835 eligible/);assert.match(value,/24,230 stale/);assert.match(value,/635,899 unknown\/contradictory/);assert.match(value,/0 independently verified operating/);assert.doesNotMatch(value,/%/);assert.equal(nodes(card).filter(node=>node.type==='strong'&&['achieved','blocked','partial','unmeasured'].includes(text(node))).length,11);h.close();
});

test('invalid objective readiness is fail-closed without old rows, zero counts, or percentages',async()=>{
 const h=harness(async url=>url.includes('national-objective-readiness')?{available:true,status:'accepted',requirements_ledger:[],broad_jurisdiction_gap_count:0}:url.includes('temporal-claim-matrix')?{available:false,status:'unavailable'}:url.includes('state-summary')?{available:false,states:[],categories:[],national_category_counts:{},national_category_percent_of_collected_evidence:{}}:{available:false,status:'unavailable'});
 h.render('CoverageWorkspace',{industries:false,stateCode:'CA'});await flush();const component=nodes(h.render('CoverageWorkspace',{industries:false,stateCode:'CA'})).find(node=>node.type?.name==='NationalObjectiveReadinessCard'),value=text(component?.type(component.props));
 assert.match(value,/Unavailable/);assert.match(value,/Fail-closed/);assert.doesNotMatch(value,/Not accepted|40 broad jurisdiction|%/);h.close();
});
