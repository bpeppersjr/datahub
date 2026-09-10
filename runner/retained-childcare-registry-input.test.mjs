import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRetainedChildcareCoverage,verifyRetainedChildcareCoverageExtension} from './retained-childcare-coverage-extension.mjs';
import {loadRetainedChildcareRegistryInput,verifyRetainedChildcareRegistryExtension,retainedChildcareRegistryDeclaration,RETAINED_CHILDCARE_CANDIDATE_TYPE} from '../runner/retained-childcare-registry-input.mjs';
import {APP_ROOT} from '../runner/paths.mjs';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {projectRetainedChildcareCandidate as project,summarizeRetainedChildcareCandidates as summarize,validateRetainedChildcareSelection as validate,RETAINED_CHILDCARE_REGISTRY_VERSION as version,RETAINED_CHILDCARE_STATES as states} from '../runner/retained-childcare-registry-input.mjs';
const binding={dataset_id:'ia-childcare-centers',publisher_scope:'IA',release_id:'release-a',ingest_run_id:'run-a',manifest_sha256:'a'.repeat(64),app_receipt_sha256:'b'.repeat(64)};
const row=()=>({dataset_id:binding.dataset_id,source_record_id:'row-1',business_name:'Example',export_policy:'internal',reported_address:{state:null,zip_code:'00100',postal_code:'00100',zip4:'0123'},geocode:{latitude:41,longitude:-93,crs:null},provenance:{source_release_id:binding.release_id,ingest_run_id:binding.ingest_run_id},source:{point_geometry:{type:'Point',coordinates:[-93,41]}},claims:{physical_site_verified:false}});
test('candidate preserves ZIP4, unknown state, coordinate uncertainty and source lineage without business geometry',()=>{
  const source=row(),candidate=project(source,binding);assert.equal(candidate.reported_address.zip4,'0123');assert.equal(candidate.reported_address.state,null);
  assert.equal(candidate.geocode.crs,null);assert.equal(candidate.source_record.source,undefined);assert.equal(candidate.claims.identity_matching_eligible,false);
  source.reported_address.zip4='9999';assert.equal(candidate.reported_address.zip4,'0123');assert.equal(candidate.source_record.reported_address.zip4,'0123');
  assert.equal(summarize([candidate]).by_reported_state[0].state,null);assert.equal(summarize([candidate]).national_completeness_percent,null);
});
test('candidate identity is release scoped and duplicates cannot inflate totals',()=>{
  const a=project(row(),binding),brow=row();brow.provenance.source_release_id='release-b';const b=project(brow,{...binding,release_id:'release-b'});
  assert.notEqual(a.candidate_id,b.candidate_id);assert.throws(()=>summarize([a,a]));assert.equal(summarize([a,b]).candidate_rows,2);
});
test('reject joined postal fields, incompatible source binding and noninternal records',()=>{
  for(const change of [r=>r.reported_address.zip_code='00100-0123',r=>r.reported_address.zip4='12345',r=>r.export_policy='public',r=>r.provenance.ingest_run_id='wrong']){const r=row();change(r);assert.throws(()=>project(r,binding));}
});
test('selection is exact, seven-state and checksum pinned',()=>{
  const selection={schema_version:version,enrollments:Object.fromEntries(states.map(state=>[state,'a'.repeat(64)]))};assert.deepEqual(validate(selection),selection);
  assert.throws(()=>validate({...selection,download:true}));delete selection.enrollments.IA;assert.throws(()=>validate(selection));
});
test('coverage distinguishes country cohort share, missing state, absent ZIP view and unassigned county',()=>{
  const a=project(row(),binding),r=row();r.source_record_id='row-2';r.reported_address.state='IA';r.reported_address.zip_code='50001';r.reported_address.postal_code='50001';
  const b=project(r,binding),input={records:[a,b],summary:summarize([a,b])};
  const views={national:[{scope:'registry-union'},{scope:'50-states-and-dc'}],states:[{postal_abbreviation:'IA'},{postal_abbreviation:'VT'}],zips:[{zip_code:'50001'}],counties:[{}]};
  const result=applyRetainedChildcareCoverage(input,views);
  assert.equal(views.national[0].retained_childcare_reporting.candidate_rows,2);
  assert.equal(views.national[1].retained_childcare_reporting.candidate_rows,1);
  assert.equal(views.states[0].retained_childcare_reporting.percent_of_selected_retained_cohort,50);
  assert.equal(views.states[1].retained_childcare_reporting.candidate_rows,0);
  assert.equal(result.candidate_rows_without_reported_state,1);assert.equal(result.candidate_rows_without_existing_zip_view,1);
  assert.equal(views.counties[0].retained_childcare_reporting.candidate_rows,null);
});
test('unextended historical registry refuses a candidate artifact or candidate counts',async()=>{
  assert.equal(await verifyRetainedChildcareRegistryExtension({artifacts:[],coverage:{}},APP_ROOT),null);
  await assert.rejects(verifyRetainedChildcareRegistryExtension({artifacts:[{artifact_type:RETAINED_CHILDCARE_CANDIDATE_TYPE}],coverage:{}},APP_ROOT));
  await assert.rejects(verifyRetainedChildcareRegistryExtension({artifacts:[],coverage:{retained_childcare_candidate_rows:1}},APP_ROOT));
});
test('native retained cohorts replay and every internal registry candidate reconciles without national publication',
  {skip:process.env.DATAHUB_TEST_RETAINED_COHORTS!=='1',timeout:600000},async()=>{
    const input=await loadRetainedChildcareRegistryInput(path.join(APP_ROOT,'config/retained-childcare-registry-selection.json'));
    assert.equal(input.records.length,12206);assert.equal(input.summary.with_zip4,1213);
    assert.equal(input.summary.by_reported_state.find(row=>row.state===null).candidate_rows,1979);
    const base=path.join(APP_ROOT,'data/tmp');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'retained-registry-test-'));
    try{
      const relative='reporting/retained-childcare/candidates.jsonl',file=path.join(directory,relative);await mkdir(path.dirname(file),{recursive:true});
      const bytes=Buffer.from(input.records.map(row=>JSON.stringify(row)+'\n').join(''));await writeFile(file,bytes,{flag:'wx'});
      const manifest={dataset_id:'national-business-registry',release_id:'test-retained-registry',retained_childcare_reporting:retainedChildcareRegistryDeclaration(input),coverage:{source_records:10,source_records_including_retained_childcare:12216,retained_childcare_candidate_rows:12206},
        dependencies:input.bindings.map(b=>({dataset_id:b.dataset_id,release_id:b.release_id,manifest_sha256:b.manifest_sha256})),
        artifacts:[{artifact_type:RETAINED_CHILDCARE_CANDIDATE_TYPE,path:relative,record_count:12206,export_policy:'internal',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
      const verified=await verifyRetainedChildcareRegistryExtension(manifest,directory);assert.equal(verified.records.length,12206);
      const registryFile=path.join(directory,'manifest.json'),registryBytes=Buffer.from(JSON.stringify(manifest));await writeFile(registryFile,registryBytes,{flag:'wx'});
      const views={national:[{scope:'registry-union'},{scope:'50-states-and-dc'}],states:['PA','CT','MD','VT','CO','UT','IA'].map(postal_abbreviation=>({postal_abbreviation})),zips:[{zip_code:'50001'}],counties:[{}]};
      const declaration=applyRetainedChildcareCoverage(input,views),coverageArtifacts=[];await mkdir(path.join(directory,'views'));
      for(const [key,type]of [['national','national'],['states','state'],['counties','county'],['zips','zip']]){
        const data=Buffer.from(views[key].map(row=>JSON.stringify(row)+'\n').join('')),file=`views/${key}.jsonl`;await writeFile(path.join(directory,file),data,{flag:'wx'});
        coverageArtifacts.push({path:file,artifact_type:`${type}-coverage-view-jsonl`,export_policy:'internal',record_count:views[key].length,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
      }
      await verifyRetainedChildcareCoverageExtension({retained_childcare_reporting:{...declaration,registry_manifest_path:path.relative(APP_ROOT,registryFile).replaceAll('\\','/')},
        artifacts:coverageArtifacts,dependencies:[{dataset_id:manifest.dataset_id,release_id:manifest.release_id,manifest_sha256:createHash('sha256').update(registryBytes).digest('hex')}]},directory);
    }finally{assert.equal(path.dirname(directory),base);await rm(directory,{recursive:true,force:true});}
  });
