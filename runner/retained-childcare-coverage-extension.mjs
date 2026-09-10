import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {verifyRetainedChildcareRegistryExtension,retainedChildcareCoverageIndex,RETAINED_CHILDCARE_REGISTRY_VERSION} from './retained-childcare-registry-input.mjs';
const check=value=>{if(!value)throw Error('Retained childcare coverage extension rejected.');};

export function applyRetainedChildcareCoverage(input,views){
  const index=retainedChildcareCoverageIndex(input);
  for(const row of views.states)row.retained_childcare_reporting=index.states.get(row.postal_abbreviation)??index.empty;
  for(const row of views.zips)row.retained_childcare_reporting=index.zips.get(row.zip_code)??index.empty;
  const reportedStates=new Set(views.states.map(row=>row.postal_abbreviation));
  const known=retainedChildcareCoverageIndex({...input,records:input.records.filter(row=>reportedStates.has(row.reported_address.state))}).national;
  // Scope denominators stay the same selected seven-cohort universe, even when address state is missing.
  known.percent_of_selected_retained_cohort=input.records.length?100*known.candidate_rows/input.records.length:null;
  known.unknown_reported_state_rows_in_selected_cohort=index.national.unknown_reported_state_rows_in_selected_cohort;
  for(const row of views.national)row.retained_childcare_reporting=row.scope==='registry-union'?index.national:known;
  for(const row of views.counties)row.retained_childcare_reporting={schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,candidate_rows:null,
    county_assignment_performed:false,reason:'source coordinates retained; governed county assignment not implemented for these candidate cohorts',export_policy:'internal'};
  const zipSet=new Set(views.zips.map(row=>row.zip_code));
  return {schema_version:RETAINED_CHILDCARE_REGISTRY_VERSION,summary:input.summary,
    candidate_rows_without_reported_state:index.states.get(null)?.candidate_rows??0,
    candidate_rows_without_existing_zip_view:[...index.zips].filter(([zip])=>!zipSet.has(zip)).reduce((n,[,value])=>n+value.candidate_rows,0),
    county_assignment_performed:false,identity_matching_applied:false,public_export_authorized:false,export_policy:'internal'};
}

export async function verifyRetainedChildcareCoverageExtension(manifest,directory){
  const declaration=manifest.retained_childcare_reporting;
  if(declaration===undefined){
    const retained=(manifest.artifacts??[]).filter(a=>a.artifact_type==='retained-registry-manifest-json');
    if(retained.length){check(retained.length===1&&retained[0].path==='evidence/registry-manifest.json');
      const m={},registry=await readJson(path.join(directory,retained[0].path),4_000_000,undefined,m);
      check(m.sha256===retained[0].sha256&&!registry.retained_childcare_reporting);
    }
    return;
  }
  check(declaration.schema_version===RETAINED_CHILDCARE_REGISTRY_VERSION&&typeof declaration.registry_manifest_path==='string');
  const meter={},registryPath=path.resolve(APP_ROOT,declaration.registry_manifest_path);
  const registry=await readJson(registryPath,4_000_000,undefined,meter);
  const dependencies=manifest.dependencies.filter(d=>d.dataset_id==='national-business-registry');
  check(dependencies.length===1&&meter.sha256===dependencies[0].manifest_sha256&&registry.release_id===dependencies[0].release_id);
  const input=await verifyRetainedChildcareRegistryExtension(registry,path.dirname(registryPath));check(input);
  const views={};
  for(const [key,type]of [['national','national'],['states','state'],['counties','county'],['zips','zip']]){
    const artifacts=manifest.artifacts.filter(a=>a.artifact_type===`${type}-coverage-view-jsonl`);check(artifacts.length===1);
    const artifact=artifacts[0];check(artifact.path===`views/${key}.jsonl`&&artifact.export_policy===(manifest.mn_construction_credential_reporting?'local-review-only':'internal'));
    const rows=[],m={};for await(const row of readLines(path.join(directory,artifact.path),1_000_000_000,undefined,m)){
      check(m.records<=100000);
      rows.push({scope:row.scope,postal_abbreviation:row.postal_abbreviation,zip_code:row.zip_code,retained_childcare_reporting:row.retained_childcare_reporting});
    }
    check(m.sha256===artifact.sha256&&m.bytes===artifact.bytes&&m.records===artifact.record_count);views[key]=rows;
  }
  const actual=Object.fromEntries(Object.entries(views).map(([key,rows])=>[key,rows.map(row=>row.retained_childcare_reporting)]));
  const expected=applyRetainedChildcareCoverage(input,views);
  check(same(declaration,{...expected,registry_manifest_path:declaration.registry_manifest_path}));
  for(const [key,rows]of Object.entries(views))check(same(actual[key],rows.map(row=>row.retained_childcare_reporting)));
}
