import assert from 'node:assert/strict';
import test from 'node:test';
import { EXISTING_SOURCE_STATES, loadExistingGovernedSourceAssessmentWave, validateExistingGovernedSourceAssessment } from './state-business-source-existing-wave.mjs';

test('existing-source assessment wave covers the final eight jurisdictions without acquisition',async()=>{const wave=await loadExistingGovernedSourceAssessmentWave();assert.deepEqual(wave.scope,[...EXISTING_SOURCE_STATES]);assert.equal(wave.states.length,8);assert.deepEqual(wave.controls,{downloads:0,record_requests:0,accounts_created:0,terms_accepted:0,fees_paid:0,production_changes:0});for(const row of wave.states){assert.equal(row.decision,'existing-governed-source');assert.equal(row.authorization.retained_release_reuse_eligible,true);assert.equal(row.authorization.fresh_acquisition_authorized,false);assert.equal(row.authorization.active_business_claim_authorized,false);}});

test('existing-source assessment rejects widened authority',async()=>{const wave=await loadExistingGovernedSourceAssessmentWave(),row=structuredClone(wave.states[0]);row.authorization.fresh_acquisition_authorized=true;assert.throws(()=>validateExistingGovernedSourceAssessment(row));});
