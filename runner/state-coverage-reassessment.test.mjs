import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStateCoverageForReassessment, compareChildcareCoverageForReassessment, currentCoverageProjection, loadStateCoverageReassessment, COVERAGE_REASSESSMENT, COVERAGE_REASSESSMENTS } from './state-coverage-reassessment.mjs';
import { TN_COVERAGE_REASSESSMENT, compareTennesseeCoverageForReassessment, getReviewedHistoricalEligibilityRows } from './state-coverage-reassessment.mjs';

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

test('all exact reviewed transitions retain historical policy authority and verified 56-state evidence',async()=>{
  for(const proof of COVERAGE_REASSESSMENTS){
    const result=await loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`});
    assert.equal(result.states.length,56);assert.equal(result.currentManifestSha256,proof.currentManifestSha256);
    assert.equal(result.historicalRelease,proof.historicalRelease);
    assert.equal(result.sourcePolicyRevalidated,false);assert.equal(result.sourceDecisionsCarriedForward,true);
    assert.ok(result.states.every(row=>row.source_policy_revalidated===false&&row.acquisition_authorization_changed===false));
  }
});

test('reviewed childcare adds only MA3007/NJ4075 without changing matching profiles or broad-registry holds',async()=>{
  const prior = COVERAGE_REASSESSMENTS[1], latest = COVERAGE_REASSESSMENT;
  const load = proof => loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`});
  const before = await load(prior), current = await load(latest);
  assert.deepEqual(current.reviewedTransitionChangedStates,['MA','NJ']);
  assert.equal(current.historicalRelease,'national-business-coverage-views-20260902-115337634Z-ba689784');
  assert.deepEqual(current.reviewedIndustryAdditions,{MA:3007,NJ:4075});
  assert.equal(current.states.filter(row=>row.reviewed_industry_addition).length,2);
  for(const row of current.states.filter(row=>row.reviewed_industry_addition)){
    assert.equal(row.historical_source_scope_status,'national-sector-layers-only');assert.equal(row.source_scope_status,'statewide-scoped-layer-only');
    assert.equal(row.reviewed_industry_addition.broad_business_coverage,false);assert.equal(row.acquisition_authorization_changed,false);
  }
  for(const mutate of [rows=>{rows.find(r=>r.postal_abbreviation==='MA').registry_evidence.matching_profile_count++;},
    rows=>{rows.find(r=>r.postal_abbreviation==='NJ').registry_evidence.source_profile_counts_by_reported_address_state['nj-licensed-childcare-centers']++;},
    rows=>{rows[0].registry_evidence.source_profile_counts_by_reported_address_state.future=1;}]){
    const altered=structuredClone(current.currentRows);mutate(altered);assert.throws(()=>compareChildcareCoverageForReassessment(before.currentRows,altered));
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

const loadProof = proof => loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:proof.currentRelease,manifest:`releases/${proof.currentRelease}/manifest.json`});
test('exact Tennessee transition conserves all postal gaps, other sources and original eligibility', async () => {
  const before = await loadProof(COVERAGE_REASSESSMENT), current = await loadProof(TN_COVERAGE_REASSESSMENT);
  assert.deepEqual(current.reviewedTransitionChangedStates, ['TN']); assert.deepEqual(current.reviewedIndustryAdditions, { TN:1863 });
  assert.deepEqual(getReviewedHistoricalEligibilityRows(current,current.currentRows),getReviewedHistoricalEligibilityRows(before,before.currentRows));
  const tn=current.states.find(row=>row.state==='TN');
  assert.equal(tn.source_scope_status,'statewide-scoped-layer-only'); assert.equal(tn.reviewed_industry_addition.identity_matching_eligible,false);
  assert.deepEqual(tn.reviewed_postal_coordinate_gaps,{records:1863,with_zip:1691,without_zip:172,missing_zip_reasons:{'missing-source-zip':27,'invalid-source-zip-placeholder':145},missing_points:3,zip_inferred:false});
  const sum = (rows,key) => rows.reduce((n,row)=>n+row.registry_evidence[key],0);
  assert.equal(sum(current.currentRows,'matching_profile_count'),sum(before.currentRows,'matching_profile_count'));
  assert.equal(sum(current.currentRows,'reporting_only_count')-sum(before.currentRows,'reporting_only_count'),1863);
  assert.equal(sum(current.currentRows,'reporting_only_coordinate_assigned_count')-sum(before.currentRows,'reporting_only_coordinate_assigned_count'),1860);
  assert.throws(()=>getReviewedHistoricalEligibilityRows({...current},current.currentRows),/verified/);
  const altered=structuredClone(current.currentRows);altered[0].registry_evidence.matching_profile_count++;
  assert.throws(()=>getReviewedHistoricalEligibilityRows(current,altered),/unaltered/);
  assert.throws(()=>getReviewedHistoricalEligibilityRows(current,before.currentRows),/unaltered/);
});
test('Tennessee exact delta rejects source, matching, ZIP, point, lineage and unrelated state changes', async () => {
  const before=await loadProof(COVERAGE_REASSESSMENT), current=await loadProof(TN_COVERAGE_REASSESSMENT);
  const mutations=[
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.matching_profile_count++;},
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.tn_childcare_reporting.with_zip+=172;},
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.tn_childcare_reporting.missing_zip_reasons['missing-source-zip']--;},
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.tn_childcare_reporting.zip_inferred=true;},
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.reporting_only_coordinate_assigned_count+=3;},
    rows=>{rows.find(r=>r.postal_abbreviation==='MA').registry_evidence.reporting_only_count++;},
    rows=>{rows[0].registry_evidence.source_profile_counts_by_reported_address_state.extra=1;},
    rows=>{rows[0].registry_evidence.tn_childcare_reporting.records=1;},
    rows=>{rows[0].lineage.geography_release_id='future';},
    rows=>{rows[0].lineage.transformation_version='national-business-coverage-views@2.10.0';},
    rows=>{rows[0].complete_all_businesses=true;},
    rows=>{rows.find(r=>r.postal_abbreviation==='TN').registry_evidence.latest_observed_at='2026-09-08T05:02:04.618Z';},
    rows=>{rows[1]=rows[0];},
  ];
  for(const mutate of mutations){const altered=structuredClone(current.currentRows);mutate(altered);assert.throws(()=>compareTennesseeCoverageForReassessment(before.currentRows,altered));}
  await assert.rejects(loadStateCoverageReassessment({dataset_id:'national-business-coverage-views',release_id:TN_COVERAGE_REASSESSMENT.currentRelease,manifest:`releases/${COVERAGE_REASSESSMENT.currentRelease}/manifest.json`}),/no reviewed/);
});
