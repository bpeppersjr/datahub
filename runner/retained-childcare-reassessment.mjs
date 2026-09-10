import {isDeepStrictEqual as same} from 'node:util';

const additions = {PA:['pa-dhs-childcare-centers',4995],CT:['ct-oec-childcare-centers',1390],MD:['md-msde-childcare-centers',1772],CO:['co-cdec-childcare-centers',1648],UT:['ut-dlbc-childcare-centers',422]};

// Exact September 10 transition. This is not permission for future releases,
// source-policy renewal, or a statement that source candidates are businesses.
export function verifySeptember10StateTransition(before, after) {
  if (before.length !== 56 || after.length !== 56 || new Set(after.map(r=>r.postal_abbreviation)).size !== 56)
    throw Error('September 10 transition requires 56 unique jurisdictions.');
  for (const old of before) {
    const state=old.postal_abbreviation, expected=structuredClone(old), oh=state==='OH'?4237:0;
    if(old.retained_childcare_reporting!==undefined || old.registry_evidence?.oh_childcare_reporting!==undefined)
      throw Error('September 10 predecessor already contains additions.');
    expected.lineage={...expected.lineage,registry_release_id:'national-business-registry-20260910-132939322Z-176d0af2',
      entity_resolution_release_id:'business-entity-resolution-20260910-150446108Z-be92beec',
      entity_resolution_benchmark_release_id:'business-entity-resolution-benchmark-sample-20260910-150758574Z-84c0bf72',
      transformation_version:'national-business-coverage-views@2.11.0'};
    expected.registry_evidence.oh_childcare_reporting={records:oh,with_zip:oh,without_zip:0,
      missing_zip_reasons:{'missing-source-zip':0,'invalid-source-zip-placeholder':0,'invalid-source-zip-format':0},
      valid_points:oh,missing_points:0,assignment_ineligible:oh,coordinate_assigned:0,zip_inferred:false};
    if(oh){
      expected.registry_evidence.reported_address_profile_count+=oh;
      expected.registry_evidence.reporting_only_count+=oh;
      expected.registry_evidence.source_profile_counts_by_reported_address_state['oh-dcy-publisher-open-childcare-centers']=oh;
      expected.registry_evidence.latest_observed_at='2026-09-08T08:31:02.735Z';
    }
    const addition=additions[state],n=addition?.[1]??0;
    expected.retained_childcare_reporting={schema_version:'retained-childcare-registry-input@1.0.0',candidate_rows:n,
      by_source:addition?[{dataset_id:addition[0],candidate_rows:n}]:[],percent_of_selected_retained_cohort:100*n/12206,
      denominator:'accepted rows in the seven selected retained childcare cohorts; not all U.S. childcare businesses',
      county_assignment_performed:false,publisher_scope_assigns_address_state:false,zip4_not_aggregated:true,
      unknown_reported_state_rows_in_selected_cohort:1979,row_unit:'source-candidate-row',identity_matching_eligible:false,
      physical_site_verified:false,current_operations_verified:false,public_export_authorized:false,export_policy:'internal',national_completeness_percent:null};
    if(!same(expected,after.find(r=>r.postal_abbreviation===state)))throw Error(`Unreviewed September 10 transition for ${state}.`);
  }
}
