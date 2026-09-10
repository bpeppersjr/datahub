import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {verifySeptember10StateTransition as verify} from './retained-childcare-reassessment.mjs';
import {loadStateCoverageReassessment,RETAINED_COVERAGE_REASSESSMENT as proof,getReviewedHistoricalEligibilityRows} from './state-coverage-reassessment.mjs';
const rows=async release=>(await readFile(path.join(APP_ROOT,'data/business-coverage-views/releases',release,'views/states.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
test('September 10 exact transition retains original eligibility and separates candidate additions',async()=>{
  const result=await loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`});
  assert.deepEqual(result.reviewedTransitionChangedStates,['OH']);
  assert.equal(result.reviewedRetainedCandidateAdditions.PA,4995);
  assert.equal(result.retainedCandidatesWithoutReportedState,1979);
  assert.equal(result.sourcePolicyRevalidated,false);
  assert.equal(getReviewedHistoricalEligibilityRows(result,result.currentRows).length,56);
});
test('September 10 rejects unrelated drift, guessed state assignments and inflated identity claims',async()=>{
  const before=await rows(proof.predecessorRelease),after=await rows(proof.currentRelease);
  verify(before,after);
  for(const mutate of [
    r=>{r.find(x=>x.postal_abbreviation==='OH').registry_evidence.matching_profile_count+=1;},
    r=>{r.find(x=>x.postal_abbreviation==='OH').registry_evidence.oh_childcare_reporting.coordinate_assigned=4237;},
    r=>{r.find(x=>x.postal_abbreviation==='VT').retained_childcare_reporting.candidate_rows=503;},
    r=>{r[0].retained_childcare_reporting.public_export_authorized=true;},
    r=>{r[0].lineage.transformation_version='future';},
    r=>{r[0].unexpected=true;},
    r=>{r[1]=r[0];},
  ]){const changed=structuredClone(after);mutate(changed);assert.throws(()=>verify(before,changed),/transition|jurisdictions/);}
});
