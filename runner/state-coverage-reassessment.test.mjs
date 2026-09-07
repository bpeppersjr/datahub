import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStateCoverageForReassessment, currentCoverageProjection, loadStateCoverageReassessment } from './state-coverage-reassessment.mjs';

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
