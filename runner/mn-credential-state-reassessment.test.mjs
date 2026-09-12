import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {verifySeptember11CredentialStateTransition as verify} from './mn-credential-state-reassessment.mjs';
import {loadStateCoverageReassessment as load,MN_CREDENTIAL_COVERAGE_REASSESSMENT as proof,
  getReviewedHistoricalEligibilityRows as eligibility} from './state-coverage-reassessment.mjs';
const pointer=release=>({dataset_id:'national-business-coverage-views',release_id:release,manifest:`releases/${release}/manifest.json`});
const rows=async release=>(await readFile(path.join(APP_ROOT,'data/business-coverage-views/releases',release,'views/states.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);

test('exact MN transition preserves historical eligibility, readiness scopes and legacy counts',async()=>{
  const prior=await load(pointer(proof.predecessorRelease)),current=await load(pointer(proof.currentRelease));
  assert.equal(current.states.length,56);assert.equal(current.sourcePolicyRevalidated,false);
  assert.equal(current.sourceDecisionsCarriedForward,true);assert.deepEqual(current.reviewedTransitionChangedStates,[]);
  assert.equal(current.reviewedCredentialReporting.selectedCohortRows,11456);
  assert.equal(current.reviewedCredentialReporting.sourceReplayThisRead,false);
  assert.equal(current.reviewedCredentialReporting.nationalCompletenessPercent,null);
  assert.equal(current.reviewedCredentialReporting.physicalSiteCount,null);
  assert.deepEqual(eligibility(current,current.currentRows),eligibility(prior,prior.currentRows));
  assert.deepEqual(current.coverageProjectionChangedStates,prior.coverageProjectionChangedStates);
  assert.equal(current.retainedCandidatesWithoutReportedState,1979);
  for(const state of current.states){
    const old=prior.states.find(row=>row.state===state.state),copy=structuredClone(state);
    delete copy.reviewed_credential_rows;copy.classification_basis=old.classification_basis;
    assert.deepEqual(copy,old);
  }
  assert.equal(current.states.find(row=>row.state==='MN').reviewed_credential_rows,10899);
  assert.equal(current.states.reduce((n,row)=>n+row.reviewed_credential_rows,0),11456);
  assert.throws(()=>eligibility(structuredClone(current),current.currentRows),/verified/);
  const changed=structuredClone(current.currentRows);changed[0].mn_construction_credential_reporting.credential_rows++;
  assert.throws(()=>eligibility(current,changed),/unaltered/);
});

test('MN exact metric and full-row boundary rejects unrelated drift and inflated claims',async()=>{
  const before=await rows(proof.predecessorRelease),after=await rows(proof.currentRelease);
  verify(before,after);verify([...before].reverse(),[...after].reverse());
  for(const mutate of [
    r=>{r[0].registry_evidence.reported_address_profile_count++;},
    r=>{r[0].mn_construction_credential_reporting.credential_rows++;},
    r=>{r[0].mn_construction_credential_reporting.physical_site_eligible=true;},
    r=>{r[0].mn_construction_credential_reporting.national_completeness_percent=100;},
    r=>{r[0].mn_construction_credential_reporting.geocode={latitude:44,longitude:-93};},
    r=>{r[0].mn_construction_credential_reporting.export_policy='public';},
    r=>{r.find(x=>x.postal_abbreviation==='WI').mn_construction_credential_reporting.missing_reported_zip5_rows=0;},
    r=>{r[0].mn_construction_credential_reporting.by_category[0].percent_of_category_in_entire_selected_cohort=0;},
    r=>{r[0].lineage.transformation_version='future';},
    r=>{r[0].lineage.registry_release_id='future';},
    r=>{r[0].retained_childcare_reporting.candidate_rows++;},
    r=>{r[0].unexpected=true;},r=>{delete r[0].mn_construction_credential_reporting;},r=>{r[1]=r[0];},
  ]){const changed=structuredClone(after);mutate(changed);assert.throws(()=>verify(before,changed),/transition/);}
  assert.throws(()=>verify(before.slice(1),after),/transition/);
  const duplicate=structuredClone(before);duplicate[1]=duplicate[0];assert.throws(()=>verify(duplicate,after),/transition/);
  assert.throws(()=>verify(after,after),/transition/);
});

test('MN reassessment never accepts a future or redirected release',async()=>{
  await assert.rejects(load(pointer('national-business-coverage-views-future')),/no reviewed/);
  await assert.rejects(load({...pointer(proof.currentRelease),manifest:`releases/${proof.predecessorRelease}/manifest.json`}),/no reviewed/);
});
