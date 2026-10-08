import test from 'node:test';
import assert from 'node:assert/strict';
import { readRestrictedChildcareExactZipSidecar, validateRestrictedChildcareExactZipSidecar } from './restricted-childcare-exact-zip-sidecar.mjs';

test('projects retained NH and OK samples by reported ZIP without measured coverage claims',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('sidecar read must not use network');
  try{
    const nh=await readRestrictedChildcareExactZipSidecar({zip5:'03755'}),ok=await readRestrictedChildcareExactZipSidecar({zip5:'73102'}),absent=await readRestrictedChildcareExactZipSidecar({zip5:'99999'});
    assert.deepEqual(nh.groups.map(group=>[group.state,group.retained_sample_rows,group.rows_with_coordinates]),[['NH',6,0]]);
    assert.deepEqual(ok.groups.map(group=>[group.state,group.retained_sample_rows,group.rows_with_coordinates]),[['OK',4,4]]);
    assert.equal(ok.groups[0].coordinate_status,'coordinates-retained-datum-accuracy-and-address-association-unverified');
    assert.ok(ok.groups[0].rows.every(row=>row.address.zip4===null&&row.source_datum===null&&row.accuracy===null&&row.address_association_verified===false));
    assert.equal(absent.status,'absent-from-restricted-samples');assert.deepEqual(absent.groups,[]);assert.match(absent.semantics,/not measured zero/);
    for(const value of [nh,ok,absent]){assert.equal(value.claims.included_in_exact_zip_matrix,false);assert.equal(value.claims.included_in_completeness_denominators,false);assert.equal(value.claims.measured_zero_supported,false);assert.equal(value.lineage.source_replay_performed_this_read,false);}
  }finally{globalThis.fetch=previous;}
});

test('rejects malformed input, cancellation and authority drift',async()=>{
  await assert.rejects(readRestrictedChildcareExactZipSidecar({zip5:'3755'}));
  await assert.rejects(readRestrictedChildcareExactZipSidecar({zip5:'03755',signal:AbortSignal.abort()}));
  const value=await readRestrictedChildcareExactZipSidecar({zip5:'03755'});
  for(const mutate of [v=>v.claims.included_in_exact_zip_matrix=true,v=>v.groups[0].rows[0].address.zip5='73102',v=>v.groups[0].rows.forEach(row=>{row.claims.current_operations_verified=true;}),v=>v.groups[0].coordinate_status='verified',v=>v.lineage.source_replay_performed_this_read=true]){
    const changed=structuredClone(value);mutate(changed);assert.throws(()=>validateRestrictedChildcareExactZipSidecar(changed,'03755'));
  }
});
