import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileRegistryFreshnessSources} from './national-business-registry-source-freshness-audit.mjs';

const source=(overrides={})=>({source_key:'one',dataset_id:'dataset-one',status:'ready',pointer_scope:'candidate',current_release_id:'release-one',manifest_sha256:'a'.repeat(64),...overrides});
const dependency=(overrides={})=>({dataset_id:'dataset-one',release_id:'release-one',manifest_sha256:'a'.repeat(64),...overrides});
const pairs=(candidate='b'.repeat(64),production=candidate)=>new Map([['one',{production_path:'production/current.json',candidate_path:'candidate/current.json',production_sha256:production,candidate_sha256:candidate}]]);

test('freshness reconciliation records exact dependency and byte-identical pointers',()=>{
 const [row]=reconcileRegistryFreshnessSources([source()],[dependency()],pairs());assert.equal(row.binding_status,'exact-match');assert.equal(row.registry_dependency_occurrences,1);assert.equal(row.pointers_byte_identical,true);assert.equal(row.registry_manifest_sha256,'a'.repeat(64));
});

test('freshness reconciliation exposes release drift, pointer drift, missing and duplicate bindings',()=>{
 assert.equal(reconcileRegistryFreshnessSources([source()],[dependency({release_id:'other'})],pairs())[0].binding_status,'different');
 assert.equal(reconcileRegistryFreshnessSources([source()],[],pairs())[0].binding_status,'missing');
 assert.equal(reconcileRegistryFreshnessSources([source()],[dependency(),dependency()],pairs())[0].binding_status,'duplicate');
 assert.equal(reconcileRegistryFreshnessSources([source()],[dependency()],pairs('b'.repeat(64),'c'.repeat(64)))[0].pointers_byte_identical,false);
});

test('freshness reconciliation fails closed on non-ready or duplicate source identities',()=>{
 assert.throws(()=>reconcileRegistryFreshnessSources([source({status:'blocked'})],[dependency()],pairs()),/ready unique source/);
 assert.throws(()=>reconcileRegistryFreshnessSources([source(),source({source_key:'two'})],[dependency()],new Map([...pairs(),['two',{production_path:'p',candidate_path:'c',production_sha256:'b'.repeat(64),candidate_sha256:'b'.repeat(64)}]])),/ready unique source/);
});
