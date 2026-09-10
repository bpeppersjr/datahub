import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { loadRetainedCountyDisplay, retainedCountyMetric, aggregateCountySourceCohorts } from './retained-childcare-county-display.mjs';

const sample = {status:'available',geography_manifest_sha256:'a'.repeat(64),county_geoids:['42001','42003','24001'],supported_state_fips:['42','24'],
  source_cohorts:[{by_county:[{county_geoid:'42001',candidate_rows:10}]},{by_county:[{county_geoid:'24001',candidate_rows:5},{county_geoid:'42001',candidate_rows:2}]}]};
const metric = (data, options = {}) => retainedCountyMetric(data,{level:'county',geoid:'42001',categoryId:'childcare',geographyManifestSha256:'a'.repeat(64),...options});
test('retained county metric distinguishes assigned zero from outside scope and geography/category mismatch',()=>{
  assert.equal(metric(sample).value,12); assert.equal(metric(sample,{geoid:'42003'}).value,0);
  assert.equal(metric(sample,{level:'state',geoid:'42'}).value,12);
  assert.equal(metric(sample,{level:'state',geoid:'24'}).value,5);
  for(const options of [{geoid:'42999'},{geoid:'24999'},{level:'state',geoid:'39'},{level:'zip',geoid:'17001'},
    {categoryId:'health-care'},{geographyManifestSha256:'b'.repeat(64)}]) assert.equal(metric(sample,options).value,null);
  assert.equal(metric({status:'unavailable'}).value,null);
});

test('source cohorts retain cross-state assignments and source-specific denominators',()=>{
  const assigned=(dataset_id,county_geoid)=>({dataset_id,county_geoid,derived_state_fips:county_geoid.slice(0,2),status:'assigned-single-county'});
  const result=aggregateCountySourceCohorts([assigned('pa-dhs-childcare-centers','42001'),assigned('md-msde-childcare-centers','24001'),
    assigned('md-msde-childcare-centers','42001'),{dataset_id:'md-msde-childcare-centers',status:'missing-source-point'}]);
  assert.equal(result[0].assigned_source_rows,1);assert.equal(result[1].assigned_source_rows,2);assert.equal(result[1].selected_source_rows,3);
  assert.deepEqual(result[1].by_county,[{county_geoid:'24001',candidate_rows:1},{county_geoid:'42001',candidate_rows:1}]);
  assert.equal(result[1].by_status['missing-source-point'],1);
  assert.throws(()=>aggregateCountySourceCohorts([{...assigned('md-msde-childcare-centers','42001'),derived_state_fips:'24'}]));
});

test('county display missing enrollment is not an observed zero',async()=>{
  const root=path.join(APP_ROOT,'data/tmp/county-display-tests',randomUUID()); await mkdir(path.join(root,'config'),{recursive:true});
  assert.deepEqual(await loadRetainedCountyDisplay({root}),{status:'not-enrolled'});
  await assert.rejects(loadRetainedCountyDisplay({root,signal:AbortSignal.abort()}));
});

test('county display reads pinned aggregates without source replay and rejects local drift',{
  skip:!process.env.DATAHUB_TEST_RETAINED_COUNTY_V2_MANIFEST,
},async()=>{
  const native=await loadRetainedCountyDisplay(); assert.equal(native.status,'available');
  assert.equal(native.counts.by_status['assigned-single-county'],6702); assert.equal(native.source_cohorts[0].selected_source_rows,4995);
  assert.equal(native.source_cohorts[0].assigned_source_rows,4930);assert.equal(native.source_cohorts[1].assigned_source_rows,1772);
  assert.equal(native.source_replay_performed_this_read,false); assert.equal(native.county_geoids.length,91);
  for(const forbidden of ['rows','source_bindings','business_name','reported_zip5']) assert.equal(Object.hasOwn(native,forbidden),false);
  assert.equal(native.counts.by_county.reduce((sum,row)=>sum+row.candidate_rows,0),6702);
  assert.equal(retainedCountyMetric(native,{level:'state',geoid:'42',geographyManifestSha256:native.geography_manifest_sha256}).value,4930);
  assert.equal(retainedCountyMetric(native,{level:'state',geoid:'24',geographyManifestSha256:native.geography_manifest_sha256}).value,1772);
  const root=path.join(APP_ROOT,'data/tmp/county-display-tests',randomUUID());
  const config='config/retained-childcare-county-enrollment.json';
  await mkdir(path.dirname(path.join(root,config)),{recursive:true}); await copyFile(path.join(APP_ROOT,config),path.join(root,config));
  assert.equal((await loadRetainedCountyDisplay({root})).status,'unavailable');
  const manifest=process.env.DATAHUB_TEST_RETAINED_COUNTY_V2_MANIFEST;
  const saved=JSON.parse(await readFile(manifest,'utf8'));
  for(const relative of [path.relative(APP_ROOT,manifest),path.join(path.dirname(saved.report.inputs.geography),'derived/index/counties.jsonl')]) {
    await mkdir(path.dirname(path.join(root,relative)),{recursive:true}); await copyFile(path.join(APP_ROOT,relative),path.join(root,relative));
  }
  assert.deepEqual(await loadRetainedCountyDisplay({root}),native);
  await writeFile(path.join(root,config),'{}'); await assert.rejects(loadRetainedCountyDisplay({root}));
  await copyFile(path.join(APP_ROOT,config),path.join(root,config));
  await writeFile(path.join(root,path.relative(APP_ROOT,manifest)),'{}'); await assert.rejects(loadRetainedCountyDisplay({root}));
});
