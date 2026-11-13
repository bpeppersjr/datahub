import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { DATASET, CLAIMS, federationGeographyScope, buildNationalGoalEvidenceFederation, verifyNationalGoalEvidenceFederation } from './national-goal-evidence-federation.mjs';

const configPath=path.join(APP_ROOT,`config/${DATASET}.json`);
const currentConfigPath=path.join(APP_ROOT,'config/national-goal-evidence-federation-v3-4.json');
const successorRelease='national-goal-evidence-federation-97ac6267cdfe6e4d20e86f5ad468b26ebc0e010a271ae36f1ea1cca002062234';
const successorManifest=path.join(APP_ROOT,`data/${DATASET}/releases/${successorRelease}/manifest.json`);
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
async function fixture(t) {const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/goal-federation-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('geography scope keeps private/nonpolygon, placeholders, cross-state, unresolved and territories distinct',()=>{
  const ordinary={classification:'same-code-census-zcta',zcta_geoid:'12345'},overlay={overlay_status:'complete-within-tolerance',crosses_state_boundary_materially:false,dominant_state_geo_id:'state:36'};
  assert.equal(federationGeographyScope(ordinary,overlay),'state:36');
  assert.equal(federationGeographyScope({classification:'explicit-placeholder',zcta_geoid:null}),'explicit-placeholder');
  assert.equal(federationGeographyScope({classification:'source-contributed-outside-zcta',zcta_geoid:null}),'non-zcta-unassigned');
  assert.equal(federationGeographyScope(ordinary,{...overlay,crosses_state_boundary_materially:true}),'multi-state-material');
  assert.equal(federationGeographyScope(ordinary,{...overlay,overlay_status:'partial'}),'zcta-overlay-unresolved');
  assert.equal(federationGeographyScope(ordinary,{...overlay,dominant_state_geo_id:'state:72'}),'territory:72');
});

test('claim boundary prevents completeness, operation, entity count, USPS and runtime enrollment inference',()=>{
  assert.equal(CLAIMS.business_completeness,null);assert.equal(CLAIMS.unique_business_count,null);assert.equal(CLAIMS.current_operation_verified,false);
  for(const key of ['zip4_joined','zcta_membership_is_usps_validity','production_enrollment','acquisition_performed','current_pointer_written','raw_business_rows_exported','missing_population_blocks_map','unresolved_geography_blocks_map'])assert.equal(CLAIMS[key],false);
  assert.equal(CLAIMS.network_requests,0);
});

test('preflight rejects hash drift, escaping paths, unsupported config shape, and cancellation',async t=>{
  const root=await fixture(t),config=await json(configPath),file=path.join(root,'config.json');
  const attempts=[{...config,inputs:{...config.inputs,goal:{...config.inputs.goal,path:'../outside.json'}}},{...config,extra:true}];
  for(const bad of attempts){await fs.writeFile(file,JSON.stringify(bad));await assert.rejects(buildNationalGoalEvidenceFederation({root,configPath:file}),/containment|closed config/);}
  const controller=new AbortController();controller.abort();await assert.rejects(buildNationalGoalEvidenceFederation({root,signal:controller.signal}),{name:'AbortError'});
  await fs.writeFile(file,JSON.stringify(config));await fs.mkdir(path.dirname(path.join(root,config.inputs.goal.path)),{recursive:true});await fs.copyFile(path.join(APP_ROOT,config.inputs.goal.path),path.join(root,config.inputs.goal.path));
  config.inputs.goal.sha256='0'.repeat(64);await fs.writeFile(file,JSON.stringify(config));await assert.rejects(buildNationalGoalEvidenceFederation({root,configPath:file}),/goal hash drift/);
});

test('symlink input ancestry is rejected before evidence processing',async t=>{
  const root=await fixture(t),config=await json(configPath),file=path.join(root,'config.json');
  await fs.symlink(path.join(APP_ROOT,'data'),path.join(root,'data-linked'),'junction');
  config.inputs.goal.path=config.inputs.goal.path.replace(/^data\//,'data-linked/');await fs.writeFile(file,JSON.stringify(config));
  await assert.rejects(buildNationalGoalEvidenceFederation({root,configPath:file}),/symlink ancestry/);
});

test('selected v3.4 federation successor has full independent replay, closed units and correct evidence gaps',async()=>{
  const manifest=successorManifest;
  const verified=await verifyNationalGoalEvidenceFederation(manifest,{configPath:currentConfigPath});assert.equal(verified.manifest_sha256,'e7a5af8144efa54373833fb5c81448153f496b5e2a8cb13df2e0bb3c7d7f3c2c');
  assert.equal(verified.zip5_cohort_rows,48194);assert.equal(verified.matrix_evidence_cells,2457894);assert.equal(verified.state_industry_rows,459);
  assert.deepEqual(verified.gaps,{broad_business_missing_states:40,unsupported_industry_access_cells:181,unmeasured_industry_access_cells:2,restricted_sample_industry_access_cells:1,stale_temporal_dimensions:0,unmeasured_temporal_dimensions:20});
  const directory=path.dirname(manifest),summary=await json(path.join(directory,'national-summary.json')),gaps=await json(path.join(directory,'gap-ledger.json')),territories=await json(path.join(directory,'territories.json'));
  assert.deepEqual(verified.temporal_assessment,summary.temporal_assessment);
  const temporal=summary.temporal_assessment, matrix=(await json(manifest)).inputs.matrix;
  assert.equal(temporal.schema_version,'exact-zip-industry-temporal-summary-projection@3.4.0');
  assert.equal(temporal.matrix_release_id,matrix.release_id);
  assert.equal(temporal.matrix_manifest_sha256,matrix.sha256);
  assert.equal(temporal.source_dimensions,summary.dimension_order.length);
  assert.equal(gaps.temporal.some(row=>['ny_retail_food_location_profiles','ny_retail_food_license_address_evidence_count'].includes(row.dimension)),false);
  assert.equal(Object.entries(summary.geography_scope_counts).filter(([s])=>s.startsWith('state:')).reduce((n,[,v])=>n+v,0),33455);
  assert.equal(summary.geography_scope_counts['non-zcta-unassigned'],14402);assert.equal(summary.geography_scope_counts['multi-state-material'],184);assert.equal(summary.geography_scope_counts['zcta-overlay-unresolved'],3);assert.equal(summary.geography_scope_counts['explicit-placeholder'],1);
  assert.equal(territories.included_in_51_state_denominator,false);assert.deepEqual(territories.geography.map(row=>row.zip5_rows),[1,7,3,132,6]);
  assert.ok(gaps.broad_business.every(row=>row.authorization_status==='not-asserted-by-this-federation' && row.action_class==='admission-review' && row.authority_evidence));
  assert.ok(gaps.industry_access.every(row=>row.action_class==='admission-review' && ['BLOCKED_PREREQUISITE','NOT_READY_EVIDENCE_UNMEASURED'].includes(row.app_handoff_status) && row.acquisition_authorization==='not-asserted-by-this-federation'));
  assert.equal(gaps.industry_access.filter(row=>row.access_evidence_status==='restricted-query-sample-evidence').length,1);
  assert.ok(gaps.industry_access.some(row=>row.authority_evidence.some(e=>e.type==='historical-state-publisher-assessment-hold' && typeof e.reason==='string')));
  assert.ok(summary.industry_evidence_metrics.every(row=>row.exact_zip_measurement_reach_percent===Number((row.measured_zip_dimension_cells/row.zip_dimension_cell_denominator*100).toFixed(1))));
  const q=summary.sidecars.entity_geography_relationship;assert.equal(q.profile_count,8011213);assert.equal(Object.values(q.postal_relationship_counts).reduce((n,v)=>n+v,0),8011213);assert.equal(Object.values(q.point_relationship_counts).reduce((n,v)=>n+v,0),8011213);assert.equal(Object.values(q.source_profile_counts).reduce((n,v)=>n+v,0),8011213);assert.equal(q.reported_state_conflict_count,50);assert.equal(q.claims.numerator,false);assert.equal(q.claims.denominator,false);
  const sp=summary.sidecars.source_policy_provenance;assert.equal(sp.registration_sha256,'619e3768bd89717d228caeaf1821de9438cde5a8899a35da13bf064123704564');assert.equal(sp.manifest_sha256,'5809e881502f503b410c05f104234de31574b2e62a48effb276b311fb063401b');assert.equal(sp.artifact_sha256,'abe3f83ff6d54e64ab78d1e7a1aa5bdebf252121c640238bef4d6cf99b37b0b4');assert.equal(sp.export_profile_counts.public+sp.export_profile_counts['local-review-only'],8011213);assert.equal(sp.policy_coverage.covered_sources,15);assert.equal(sp.claims.numerator,false);
  const la=summary.sidecars.publisher_membership_reconciliation;assert.equal(la.registration_sha256,'8bb9d80ddd7192e76f1a48a75e83b03afd8e91170eafb646193adde2b8961d75');assert.equal(la.source_rows,la.normalized_profiles+la.quarantined_rows);assert.deepEqual(la.effective_source_classification_counts,{'source-defined-current-membership':21,'non-active-reporting-membership':7,'annual-aggregate':1,'unknown-source-status':1});assert.equal(la.row_status,null);assert.equal(la.lifecycle_evidence,'unknown');assert.equal(la.active_business_eligible_count,0);assert.equal(la.active_business_count,null);assert.equal(la.completeness_percentage,null);assert.equal(la.claims.inference_performed,false);
});

test('lifecycle-industry sidecar successor preserves all predecessor artifacts except national summary',async()=>{
  const prior=path.join(APP_ROOT,'data/national-goal-evidence-federation/releases/national-goal-evidence-federation-05bc88f30f2270f3aae6c31446eacb6dda36db495346d232260428b85c35a2fb/manifest.json');
  const current=successorManifest;
  const oldBytes=await fs.readFile(prior),oldManifest=JSON.parse(oldBytes),newManifest=await json(current);
  assert.equal(createHash('sha256').update(oldBytes).digest('hex'),'a3d3db89947c27226baf567f20630a4278041abf34073fb39c9757d10c9346b9');
  assert.equal(oldManifest.artifacts.length,104);assert.equal(newManifest.artifacts.length,104);
  const oldHashes=new Map(oldManifest.artifacts.map(a=>[a.path,a.sha256]));
  assert.deepEqual(new Set(newManifest.artifacts.filter(a=>oldHashes.get(a.path)!==a.sha256).map(a=>a.path)),new Set(['national-summary.json']));
});

test('current verifier rejects legacy temporal lineage, dimension count and checksum',async t=>{
  const source=path.dirname(successorManifest),root=await fixture(t);
  const dir=path.join(root,successorRelease);await fs.cp(source,dir,{recursive:true});
  const file=path.join(dir,'manifest.json'),manifest=await json(file);
  const legacy={release_id:'exact-zip-industry-temporal-qualification-v2-1-runtime-projection',manifest_sha256:'2cd2cf73795af46956230ccbaa6de4e7b771967730c7181b6ba674b3ef2c3ea4'};
  for(const change of [value=>({...value,...legacy}),value=>({...value,source_dimensions:42}),value=>({...value,projection_sha256:legacy.manifest_sha256})]){
    const changed=structuredClone(manifest);changed.summary.temporal_assessment=change(changed.summary.temporal_assessment);
    await fs.writeFile(file,JSON.stringify(changed));
    await assert.rejects(verifyNationalGoalEvidenceFederation(file,{configPath:currentConfigPath}),/3\.4 temporal projection manifest pin/);
  }
});

test('exclusive publisher lock and cancellation leave no invocation staging',async t=>{
  const lock=path.join(APP_ROOT,`data/${DATASET}/.build.lock`);await fs.mkdir(lock);t.after(()=>fs.rm(lock,{recursive:true,force:true}));
  await assert.rejects(buildNationalGoalEvidenceFederation({configPath:currentConfigPath}),{code:'EEXIST'});await fs.rmdir(lock);
  const controller=new AbortController();await assert.rejects(buildNationalGoalEvidenceFederation({configPath:currentConfigPath,signal:controller.signal,hooks:async event=>{if(event==='output-row')controller.abort();}}),{name:'AbortError'});
  assert.equal(await fs.stat(lock).then(()=>true,()=>false),false);assert.ok(!(await fs.readdir(path.dirname(lock))).some(name=>name.startsWith('.stage-')));
});

test('manifest claim tampering rejects before replay',async t=>{
  const registration=await json(path.join(APP_ROOT,`config/datasets/${DATASET}.json`)),source=path.join(APP_ROOT,registration.retained_release.manifest),m=await json(source),root=await fixture(t),dir=path.join(root,m.release_id);await fs.mkdir(dir);
  m.claims.business_completeness=100;const file=path.join(dir,'manifest.json');await fs.writeFile(file,JSON.stringify(m));await assert.rejects(verifyNationalGoalEvidenceFederation(file,{root:APP_ROOT}),/manifest identity\/claims/);
});

test('artifact and repinned semantic/count tampering fail independent reconstruction',async t=>{
  const source=path.dirname(successorManifest),root=await fixture(t),dir=path.join(root,successorRelease);await fs.cp(source,dir,{recursive:true});
  const file=path.join(dir,'national-summary.json'),original=await fs.readFile(file),m=await json(path.join(dir,'manifest.json'));
  const summary=JSON.parse(original);summary.zip5_cohort_rows--;const changed=Buffer.from(JSON.stringify(summary)+'\n');await fs.writeFile(file,changed);
  await assert.rejects(verifyNationalGoalEvidenceFederation(path.join(dir,'manifest.json'),{configPath:currentConfigPath}),/artifact replay/);
  const a=m.artifacts.find(a=>a.path==='national-summary.json');a.sha256=createHash('sha256').update(changed).digest('hex');a.bytes=changed.length;a.decoded_bytes=changed.length;
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));await assert.rejects(verifyNationalGoalEvidenceFederation(path.join(dir,'manifest.json'),{configPath:currentConfigPath}),/independent semantic reconstruction/);
});

test('post-verification output mutation cannot publish and owned staging is removed',async()=>{
  await assert.rejects(buildNationalGoalEvidenceFederation({configPath:currentConfigPath,hooks:async(event,{stage}={})=>{if(event==='after-verification-before-publication')await fs.appendFile(path.join(stage,'gap-ledger.json'),' ');}}),/publication output mutation/);
  const base=path.join(APP_ROOT,`data/${DATASET}`);assert.equal(await fs.stat(path.join(base,'.build.lock')).then(()=>true,()=>false),false);assert.ok(!(await fs.readdir(base)).some(name=>name.startsWith('.stage-')));
});
