import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {BENCHMARK_SHA256,COHORT_SHA256,DATASET,MAX_PREFIX_BYTES,REGISTRATION_SHA256,REGISTRY_SHA256,RELEASE_SHA256,SELECTED_MANIFEST_SHA256,SELECTED_RELEASE,readZipEntityResolutionEvidence,verifyZipEntityResolutionEvidence} from './zip-entity-resolution-evidence.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Buffer.from(`${JSON.stringify(x)}\n`);
async function fixture(t){
 const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zip-entity-resolution-evidence-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const rows=[{zip5:'00501',site_alias_memberships:2,site_alias_groups:1,establishment_alias_memberships:0,establishment_alias_groups:0,unapplied_review_candidates:1,status:'retained-linkage-evidence',benchmark_gate_passed:false,entity_resolution_applied:false,unique_business_count:null,current_operating_business_count:null},{zip5:'00502',site_alias_memberships:0,site_alias_groups:0,establishment_alias_memberships:0,establishment_alias_groups:0,unapplied_review_candidates:0,status:'no-retained-linkage-decisions',benchmark_gate_passed:false,entity_resolution_applied:false,unique_business_count:null,current_operating_business_count:null}];
 const buckets=Array.from({length:100},(_,n)=>{const prefix=String(n).padStart(2,'0'),payload=stable(n===0?rows:[]);return {artifact:{path:`zip-${prefix}.json`,bytes:payload.length,sha256:hash(payload),record_count:n===0?rows.length:0},payload};});
 const body={schema_version:'zip-entity-resolution-evidence@1.0.0',dataset_id:DATASET,status:'immutable-local-review-only',publication_mode:'pointer-free',created_at:'2026-10-04T00:00:00.000Z',bindings:{resolution:{manifest_sha256:RELEASE_SHA256},registry:{manifest_sha256:REGISTRY_SHA256},cohort:{manifest_sha256:COHORT_SHA256},benchmark:{manifest_sha256:BENCHMARK_SHA256}},summary:{site_alias_memberships:2325053,site_alias_groups:876076,establishment_alias_memberships:146828,establishment_alias_groups:72122,unapplied_review_candidates:106431,site_zip_count:26920,establishment_zip_count:13088,review_zip_count:14585,zip_union_count:26920,no_decision_zip_count:21274,global_unlocalized_skipped_review_groups:2,unresolved_review_hashes:0,conflicting_review_hashes:0,out_of_cohort_decisions:0},claims:{entity_resolution_applied:false,benchmark_gate_passed:false,public_export_authorized:false},semantics:{},limitations:[],artifacts:buckets.map(x=>x.artifact)},manifest={release_id:`${DATASET}-${hash(JSON.stringify(body))}`,...body};
 const dir=`data/${DATASET}/releases/${manifest.release_id}`,manifestBytes=stable(manifest);await fs.mkdir(path.join(root,dir),{recursive:true});await fs.writeFile(path.join(root,dir,'manifest.json'),manifestBytes);for(const b of buckets)await fs.writeFile(path.join(root,dir,b.artifact.path),b.payload);
 const registration={schema_version:'1.0.0',dataset_id:DATASET,status:'registered-pointer-free-local-review-evidence',runtime_pointer:null,production_enrollment:false,retained_release:{release_id:manifest.release_id,manifest:`${dir}/manifest.json`,manifest_sha256:hash(manifestBytes)},claims:manifest.claims};await fs.mkdir(path.join(root,'config/datasets'),{recursive:true});await fs.writeFile(path.join(root,`config/datasets/${DATASET}.json`),stable(registration));
 return {root,manifest,artifact:buckets[0].artifact,dir};
}

test('bounded ZIP lookup distinguishes retained evidence from no-decision ZIPs without identity or operation claims',async t=>{
 const f=await fixture(t),evidence=await readZipEntityResolutionEvidence({root:f.root,zip5:'00501'});assert.equal(evidence.evidence.site_alias_memberships,2);assert.equal(evidence.evidence.benchmark_gate_passed,false);assert.equal(evidence.evidence.unique_business_count,null);assert.doesNotMatch(JSON.stringify(evidence.evidence),/name|profile_id|subject_entity_id|resolved_entity_id|decision_id/i);await evidence.recheck();
 const absent=await readZipEntityResolutionEvidence({root:f.root,zip5:'00502'});assert.equal(absent.evidence.status,'no-retained-linkage-decisions');assert.equal(absent.evidence.site_alias_memberships,0);assert.equal(absent.evidence.current_operating_business_count,null);
});
test('selected runtime pins the November successor and retains closed non-operation claims',async()=>{
 const value=await readZipEntityResolutionEvidence({zip5:'10001'});
 assert.equal(value.registration_sha256,REGISTRATION_SHA256);
 assert.equal(value.manifest_sha256,SELECTED_MANIFEST_SHA256);
 assert.match(SELECTED_RELEASE,/^zip-entity-resolution-evidence-[a-f0-9]{64}$/);
 assert.equal(value.evidence.unique_business_count,null);
 assert.equal(value.evidence.current_operating_business_count,null);
 assert.equal(value.evidence.entity_resolution_applied,false);
 assert.equal(value.evidence.benchmark_gate_passed,false);
 await value.recheck();
});
test('bucket tampering, oversized declarations, and cancellation fail closed',async t=>{
 const f=await fixture(t);await fs.appendFile(path.join(f.root,f.dir,'zip-00.json'),' ');await assert.rejects(readZipEntityResolutionEvidence({root:f.root,zip5:'00501'}));
 const g=await fixture(t);g.manifest.artifacts[0].bytes=MAX_PREFIX_BYTES+1;const raw=stable(g.manifest);await fs.writeFile(path.join(g.root,g.dir,'manifest.json'),raw);const configPath=path.join(g.root,`config/datasets/${DATASET}.json`),config=JSON.parse(await fs.readFile(configPath,'utf8'));config.retained_release.manifest_sha256=hash(raw);await fs.writeFile(configPath,stable(config));await assert.rejects(readZipEntityResolutionEvidence({root:g.root,zip5:'00501'}));
 const h=await fixture(t),controller=new AbortController();controller.abort();await assert.rejects(readZipEntityResolutionEvidence({root:h.root,zip5:'00501',signal:controller.signal}),/abort/i);
});

test('historical replay rejects a live benchmark substituted at the retained manifest path',async t=>{
 const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zip-entity-resolution-replay-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const registration=JSON.parse(await fs.readFile(path.join(APP_ROOT,`config/datasets/${DATASET}.json`),'utf8'));
 const {bindings}=JSON.parse(await fs.readFile(path.join(APP_ROOT,registration.retained_release.manifest),'utf8'));
 for(const key of ['resolution','registry','benchmark']){
  const historical=bindings[key].manifest_path;
  const target=path.join(root,historical);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(path.join(APP_ROOT,historical),target);
 }
 await fs.appendFile(path.join(root,bindings.benchmark.manifest_path),' ');
 await assert.rejects(verifyZipEntityResolutionEvidence(path.join(root,registration.retained_release.manifest),{root}),/pinned benchmark manifest lineage/);
});
