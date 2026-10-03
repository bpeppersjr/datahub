import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { verifyNationalGoalCompletionMatrix } from './national-goal-completion-matrix.mjs';
import { nationalGoalCompletionView, configuredIndustryScopeComparison } from "./national-goal-completion-view.mjs";
import { APP_ROOT } from './paths.mjs';

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function scopeFixture(t) {
  await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/goal-scope-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'config'));
  const configBytes=await readFile(path.join(APP_ROOT,'config/industry-segments.json'));
  const catalogBytes=await readFile(path.join(APP_ROOT,'config/national-reporting-sources.json'));
  await writeFile(path.join(root,'config/industry-segments.json'),configBytes);
  await writeFile(path.join(root,'config/national-reporting-sources.json'),catalogBytes);
  const catalog=JSON.parse(catalogBytes),groups=[...new Set(catalog.sources.map(row=>row.group))];
  const value={denominator:{version:`${catalog.denominatorVersion}+fixture-broad@1`},evidence:{catalog_sha256:hash(catalogBytes)},jurisdictions:[{categories:['general-business',...groups].map(category_id=>({category_id}))}]};
  return {root,value,configBytes,catalogBytes};
}

test('scope comparison derives four excluded configuration groups without changing matrix cells',async t=>{
  const {root,value,configBytes,catalogBytes}=await scopeFixture(t),before=JSON.stringify(value);
  const result=await configuredIndustryScopeComparison(value,{root});
  assert.equal(result.available,true);assert.equal(JSON.stringify(value),before);
  assert.deepEqual(result.industries.map(row=>row.id),['childcare','construction','local-business-licenses','sales-tax-outlets']);
  assert.equal(result.configuration.sha256,hash(configBytes));assert.equal(result.catalog.predecessor_sha256,hash(catalogBytes));
  assert.deepEqual(result.industries.find(row=>row.id==='sales-tax-outlets').sources,[{id:'state-tx-sales-tax',scope:'state',publisher_states:['TX'],manual_selection_required:false}]);
  assert.equal(result.industries.find(row=>row.id==='childcare').sources.find(row=>row.id==='state-ok-childcare-spatial-batch').manual_selection_required,true);
  value.denominator.version='national-reporting-ten@1.0.0+fixture-broad@1';
  assert.equal((await configuredIndustryScopeComparison(value,{root})).catalog.schema_version,'national-reporting-catalog@2.0.0');
});
test('scope comparison is unavailable for missing, invalid, drifted or mismatched inputs',async t=>{
  const {root,value,configBytes}=await scopeFixture(t);
  for(const body of ['{',JSON.stringify({version:99})]){
    await writeFile(path.join(root,'config/industry-segments.json'),body);
    const result=await configuredIndustryScopeComparison(value,{root});assert.equal(result.available,false);assert.equal(result.industries,null);
  }
  await writeFile(path.join(root,'config/industry-segments.json'),configBytes);
  assert.equal((await configuredIndustryScopeComparison({...value,evidence:{catalog_sha256:'0'.repeat(64)}},{root})).available,false);
  assert.equal((await configuredIndustryScopeComparison({...value,jurisdictions:[{categories:[]}]},{root})).available,false);
  await rm(path.join(root,'config/national-reporting-sources.json'));
  assert.equal((await configuredIndustryScopeComparison(value,{root})).industries,null);
});
test('view exposes comparison failure without altering measured/unmeasured totals',async t=>{
  const {root}=await scopeFixture(t),id='national-goal-completion-20260922120000-eeeeeeee';
  await publish(root,id);
  const view=await nationalGoalCompletionView({root});
  assert.equal(view.available,true);assert.equal(view.scope_comparison.available,false);assert.equal(view.scope_comparison.industries,null);
  assert.equal(view.jurisdictions[0].available,1);assert.equal(view.jurisdictions[1].unmeasured,1);assert.equal(view.jurisdictions[1].percent,null);
});
const LEGACY_SCHEMA="national-goal-completion-matrix@1.0.0";
const categories = ["general-business", "retail-consumer"];
const stateCodes='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
function report(id) { return { schema_version: LEGACY_SCHEMA, release_id: id, created_at: "2026-09-22T12:00:00.000Z", denominator: { version: "fixture@1", datasets: 2, categories: 2, meaning: "dataset presence, not business completeness" }, all_business_completion_percent: null, limitations: ["Not business completeness."], jurisdictions: Array.from({ length: 51 }, (_, index) => ({ code: stateCodes[index], name: index === 0 ? "Alabama" : `Area ${index}`, all_business_completion_percent: null, categories: categories.map((category, categoryIndex) => { const availabilityStatus=categoryIndex===0?(index===0?"available":"unmeasured"):(index===0?"available":"observed-zero"),available=availabilityStatus==='available'?1:0;return { category_id: category, dataset_availability: { available, denominator: 1, percent:available*100,measure:'governed-dataset-presence-not-business-completeness' }, all_business_completion_percent: null, datasets: [{ dataset_id: category, label: category, availability_status: availabilityStatus, state_record_count: availabilityStatus==='unmeasured'?null:available, authorization: { state: "retained" }, temporal_status: { status: "within-review-window" }, geocode_rate: { assigned: 1, eligible: 2, percent: 50 }, gap_reason: availabilityStatus==='unmeasured'?'missing':null }] }; }) })) }; }
function legacyReport(id){const value=report(id);value.schema_version=LEGACY_SCHEMA;for(const jurisdiction of value.jurisdictions)for(const category of jurisdiction.categories){const {available,denominator}=category.dataset_availability;category.dataset_availability={available,denominator,percent:denominator?Math.round(available/denominator*1000)/10:null,measure:'governed-dataset-presence-not-business-completeness'};for(const dataset of category.datasets){const rate=dataset.geocode_rate;if(rate.eligible!==null)rate.percent=rate.eligible?Math.round(rate.assigned/rate.eligible*1000)/10:null;}}return value;}
async function publish(root, id, value=report(id)) { const directory = path.join(root, "data/national-goal-completion-matrix/releases", id); await mkdir(directory, { recursive: true }); const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await writeFile(path.join(directory, "report.json"), body); await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify({ schema_version: value.schema_version, dataset_id: "national-goal-completion-matrix", release_id: id, status: "published-local-derived-report", all_business_completion_percent: null, production_pointers_changed: false, network_requests: 0, artifacts: [{ path: "report.json", bytes: body.length, sha256: hash(body), record_count: 51 }] })}\n`); return directory; }

test("selects the newest immutable release and exposes measured/unmeasured availability", async (t) => { const root = await mkdtemp(path.join(os.tmpdir(), "goal-view-")); t.after(() => rm(root, { recursive: true, force: true })); await publish(root, "national-goal-completion-20260922110000-aaaaaaaa"); await publish(root, "national-goal-completion-20260922120000-bbbbbbbb"); const view = await nationalGoalCompletionView({ root, state: "AL", category: "retail-consumer" }); assert.equal(view.release_id, "national-goal-completion-20260922120000-bbbbbbbb"); assert.equal(view.jurisdictions.length, 51); assert.equal(view.selected.category.datasets[0].temporal_status.status, "within-review-window"); assert.equal(view.all_business_completion_percent, null); const unknown=await nationalGoalCompletionView({root,state:'AK',category:'general-business',adjacentReader:async()=>null});assert.equal(unknown.selected.category.dataset_availability.measurement_status,'unmeasured');assert.equal(unknown.selected.category.dataset_availability.percent,null);assert.equal(unknown.jurisdictions[1].measurement_status,'unmeasured');assert.equal(unknown.jurisdictions[1].percent,null);const observedZero=await nationalGoalCompletionView({root,state:'AK',category:'retail-consumer'});assert.equal(observedZero.selected.category.dataset_availability.measurement_status,'measured');assert.equal(observedZero.selected.category.dataset_availability.percent,0);assert.equal(observedZero.jurisdictions[1].measured,1); });
test('selected broad state composes adjacent evidence without changing matrix measures',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'goal-adjacent-'));t.after(()=>rm(root,{recursive:true,force:true}));await publish(root,'national-goal-completion-20260922120000-bbbbbbbb');let call;const adjacentReader=async options=>(call=options,{dataset_id:'national-irs-eo-bmf-organization-coverage',included_in_broad_layer:false,included_in_dataset_availability:false,organization_count:12});const view=await nationalGoalCompletionView({root,state:'AK',category:'general-business',adjacentReader});assert.equal(call.state,'AK');assert.equal(view.selected.adjacent_evidence[0].organization_count,12);assert.equal(view.jurisdictions[1].broad_layer_gap,true);assert.equal(view.jurisdictions[1].available,0);assert.equal(view.denominator.version,'fixture@1');const other=await nationalGoalCompletionView({root,state:'AK',category:'retail-consumer',adjacentReader:async()=>{throw Error('must not run');}});assert.deepEqual(other.selected.adjacent_evidence,[]);});
test('cross-category summaries expose nationwide comparable denominators without hiding unknown cells',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'goal-category-summary-'));t.after(()=>rm(root,{recursive:true,force:true}));await publish(root,'national-goal-completion-20260922120000-bbbbbbbb');const view=await nationalGoalCompletionView({root,state:'AK',category:'retail-consumer'}),broad=view.category_summaries[0],retail=view.category_summaries[1];assert.equal(broad.category_id,'general-business');assert.deepEqual(broad.national,{available:1,measured:1,unmeasured:50,expected:51,missing_or_unknown:50,denominator_percent:2,measured_only_percent:100,states:51,states_fully_available:1,states_with_missing_or_unknown:50,measure:'governed-dataset-availability-not-business-completeness'});assert.deepEqual(broad.selected_state.comparable_availability,{available:0,measured:0,missing_or_unknown:1,denominator:1,denominator_percent:0,measured_only_percent:null,measurement_status:'unmeasured',measure:'governed-dataset-availability-not-business-completeness'});assert.equal(retail.national.denominator_percent,2);assert.equal(retail.national.measured_only_percent,2);assert.equal(retail.national.states_with_missing_or_unknown,0);assert.equal(retail.selected_state.comparable_availability.denominator_percent,0);assert.equal(retail.selected_state.comparable_availability.measured_only_percent,0);const national=await nationalGoalCompletionView({root,category:'general-business'});assert.equal(national.category_summaries.length,2);assert.ok(national.category_summaries.every(row=>row.selected_state===null));});
test("all-state summaries keep temporal and authorization status counts separate from availability", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "goal-view-statuses-")); t.after(() => rm(root, { recursive: true, force: true }));
  const id = "national-goal-completion-20260923120000-dddddddd", value = report(id);
  const cell = code => value.jurisdictions.find(row => row.code === code).categories.find(row => row.category_id === "retail-consumer").datasets[0];
  cell("AL").temporal_status.status = "review-due"; cell("AL").authorization.state = "retained-enrolled";
  cell("AK").temporal_status.status = "missing-source-reference"; cell("AK").authorization.state = "blocked";
  cell("AZ").temporal_status.status = "unmeasured"; cell("AZ").authorization.state = "not-enrolled";
  await publish(root, id, value);
  const view = await nationalGoalCompletionView({ root, category: "retail-consumer" });
  const byState = new Map(view.jurisdictions.map(row => [row.code, row]));
  assert.deepEqual(byState.get("AL").temporal_status_counts, { "review-due": 1 });
  assert.deepEqual(byState.get("AL").authorization_state_counts, { "retained-enrolled": 1 });
  assert.deepEqual(byState.get("AK").temporal_status_counts, { "missing-source-reference": 1 });
  assert.deepEqual(byState.get("AK").authorization_state_counts, { blocked: 1 });
  assert.deepEqual(byState.get("AZ").temporal_status_counts, { unmeasured: 1 });
  assert.deepEqual(byState.get("AZ").authorization_state_counts, { "not-enrolled": 1 });
  assert.equal(byState.get("AL").available, 1);
  assert.equal(byState.get("AL").measurement_status, "measured");
  assert.equal(view.all_business_completion_percent, null);
});
test("fails closed when the newest release is tampered instead of falling back", async (t) => { const root = await mkdtemp(path.join(os.tmpdir(), "goal-view-")); t.after(() => rm(root, { recursive: true, force: true })); await publish(root, "national-goal-completion-20260922110000-aaaaaaaa"); const newest = await publish(root, "national-goal-completion-20260922120000-bbbbbbbb"); await writeFile(path.join(newest, "report.json"), "tampered"); assert.equal((await nationalGoalCompletionView({ root })).status, "newest-release-verification-failed"); });
test("fails closed when source replay requires a rebuild", async (t) => { const root = await mkdtemp(path.join(os.tmpdir(), "goal-view-")); t.after(() => rm(root, { recursive: true, force: true })); await publish(root, "national-goal-completion-20260922120000-bbbbbbbb"); const verifier=async()=>{throw Object.assign(Error('drift'),{code:'GOAL_MATRIX_EVIDENCE_REBUILD_REQUIRED'});}; assert.equal((await nationalGoalCompletionView({root,verifier})).status,"newest-release-verification-failed"); });
test("rejects state and category inputs outside the closed matrix", async (t) => { const root = await mkdtemp(path.join(os.tmpdir(), "goal-view-")); t.after(() => rm(root, { recursive: true, force: true })); await publish(root, "national-goal-completion-20260922120000-bbbbbbbb"); await assert.rejects(nationalGoalCompletionView({ root, state: "PR" }), /State is not/); await assert.rejects(nationalGoalCompletionView({ root, category: "made-up" }), /not in the matrix/); });
test("legacy immutable 1.0 releases remain verifiable and the view normalizes their all-unmeasured cells",async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'goal-view-'));t.after(()=>rm(root,{recursive:true,force:true}));const id='national-goal-completion-20260922120000-cccccccc',directory=await publish(root,id,legacyReport(id)),verified=await verifyNationalGoalCompletionMatrix(path.join(directory,'manifest.json'));assert.equal(verified.schema_version,LEGACY_SCHEMA);const view=await nationalGoalCompletionView({root,state:'AK',category:'general-business',adjacentReader:async()=>null});assert.equal(view.release_id,id);assert.equal(view.selected.category.dataset_availability.measurement_status,'unmeasured');assert.equal(view.selected.category.dataset_availability.percent,null);assert.equal(view.selected.category.dataset_availability.unmeasured,1);assert.equal(view.jurisdictions[1].percent,null);});
