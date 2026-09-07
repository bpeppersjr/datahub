import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStateCoverageForReassessment, currentCoverageProjection, loadStateCoverageReassessment, COVERAGE_REASSESSMENT, COVERAGE_REASSESSMENTS } from './state-coverage-reassessment.mjs';

function rows(){return Array.from({length:56},(_,i)=>({postal_abbreviation:String.fromCharCode(65+Math.floor(i/26),65+i%26),state_fips:String(i),is_50_states_or_dc:i<51,
  registry_evidence:{reported_address_profile_count:100,coordinate_assigned_profile_count:10,source_profile_counts_by_reported_address_state:{}},
  nonemployer_baseline:{nonemployer_establishments:999},zcta_coverage:{material_intersecting_zcta_count:10,zctas_with_record_level_source_contribution:9}}));}
test('coverage reassessment preserves both measurements without claiming equivalence or fresh policy',()=>{
  const old=rows(),current=structuredClone(old);current[0].registry_evidence.reported_address_profile_count=101;
  const result=compareStateCoverageForReassessment(old,current);
  assert.equal(result[0].historical_coverage.reported_profiles,100);assert.equal(result[0].current_coverage.reported_profiles,101);
  assert.equal(result[0].source_policy_revalidated,false);assert.equal(result[0].acquisition_authorization_changed,false);
  assert.equal(currentCoverageProjection(old[0]).diagnostic_profile_percent,10);
});
test('coverage reassessment rejects missing, duplicated or identity-changed jurisdictions',()=>{
  const old=rows();assert.throws(()=>compareStateCoverageForReassessment(old,old.slice(1)),/56/);
  const duplicated=structuredClone(old);duplicated[1]=duplicated[0];assert.throws(()=>compareStateCoverageForReassessment(old,duplicated),/Duplicate/);
  const changed=structuredClone(old);changed[0].state_fips='different';assert.throws(()=>compareStateCoverageForReassessment(old,changed),/identity/);
});
test('coverage reassessment rejects unreviewed current releases before reading local evidence',async()=>{
  await assert.rejects(loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:'future'}),/no reviewed/);
});
test('coverage reassessment rejects changes in reported source roster',()=>{
  const old=rows(),current=structuredClone(old);current[0].registry_evidence.source_profile_counts_by_reported_address_state.extra=1;
  assert.throws(()=>compareStateCoverageForReassessment(old,current),/source roster changed/);
});

test('both exact reviewed transitions retain historical policy authority and verified 56-state evidence',async()=>{
  for(const proof of COVERAGE_REASSESSMENTS){
    const result=await loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`});
    assert.equal(result.states.length,56);assert.equal(result.currentManifestSha256,proof.currentManifestSha256);
    assert.equal(result.historicalRelease,'national-business-coverage-views-20260902-115337634Z-ba689784');
    assert.equal(result.sourcePolicyRevalidated,false);assert.equal(result.sourceDecisionsCarriedForward,true);
    assert.ok(result.states.every(row=>row.source_policy_revalidated===false&&row.acquisition_authorization_changed===false));
  }
});

test('reviewed DC refresh preserves rosters and classifications with explicit nonzero count changes',async()=>{
  const loaded=await Promise.all(COVERAGE_REASSESSMENTS.map(proof=>loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`})));
  const transition=compareStateCoverageForReassessment(loaded[0].currentRows,loaded[1].currentRows);
  const changed=transition.filter(row=>JSON.stringify(row.historical_coverage)!==JSON.stringify(row.current_coverage));
  assert.deepEqual(changed.map(row=>row.state),['CA','DC','MD','MA','MI','MN','NY','OH','PA','TN','TX','VA','WI']);
  assert.equal(changed.reduce((n,row)=>n+row.current_coverage.reported_profiles-row.historical_coverage.reported_profiles,0),18);
  assert.equal(changed.reduce((n,row)=>n+row.current_coverage.coordinate_profiles-row.historical_coverage.coordinate_profiles,0),1);
  assert.equal(loaded[1].coverageProjectionChangedStates.length,30);
  assert.equal(loaded[1].currentManifestSha256,'6add23501019da0e5c503f3a7eaada6ce5e653362866f29741b302fa5ed6beb8');
});

test('reviewed release ID cannot substitute a different immutable manifest path',async()=>{
  await assert.rejects(loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:COVERAGE_REASSESSMENT.currentRelease,manifest:`releases/${COVERAGE_REASSESSMENTS[0].currentRelease}/manifest.json`}),/no reviewed/);
});
