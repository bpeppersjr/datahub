import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedChildcareStateCount as count} from './retained-childcare-state-evidence.mjs';
const declaration = {schema_version:'retained-childcare-registry-input@1.0.0'};
const row = () => ({retained_childcare_reporting:{...declaration,export_policy:'internal',identity_matching_eligible:false,publisher_scope_assigns_address_state:false,candidate_rows:7,by_source:[{dataset_id:'pa-dhs-childcare-centers',candidate_rows:7}]}});
test('published retained evidence distinguishes reported state counts, missing integration and other sources',()=>{
  assert.equal(count(row(),declaration,'state-pa-childcare-centers'),7);
  assert.equal(count(row(),declaration,'state-vt-childcare-centers'),0);
  assert.equal(count(row(),declaration,'state-ia-childcare-centers'),0);
  assert.equal(count({},undefined,'state-pa-childcare-centers'),null);
  assert.equal(count({},undefined,'national-snap-retailers'),null);
});
test('retained evidence rejects orphan, missing, malformed and inflated counts',()=>{
  assert.throws(()=>count(row(),undefined,'state-pa-childcare-centers'),/invalid/);
  assert.throws(()=>count({},declaration,'state-pa-childcare-centers'),/invalid/);
  for(const value of [-1,1.5,'7']) {const r=row();r.retained_childcare_reporting.by_source[0].candidate_rows=value;assert.throws(()=>count(r,declaration,'state-pa-childcare-centers'),/invalid/);}
  const r=row();r.retained_childcare_reporting.candidate_rows=8;assert.throws(()=>count(r,declaration,'state-pa-childcare-centers'),/reconcile/);
  const d=row();d.retained_childcare_reporting.by_source.push({...d.retained_childcare_reporting.by_source[0]});assert.throws(()=>count(d,declaration,'state-pa-childcare-centers'),/invalid/);
  const p=row();p.retained_childcare_reporting.publisher_scope_assigns_address_state=true;assert.throws(()=>count(p,declaration,'state-pa-childcare-centers'),/invalid/);
});
