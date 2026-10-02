export function qualificationFixture({zip='00501',category='all',qualification='measured-within-review-window'}={}){
 const sha='a'.repeat(64),temporal=qualification==='unmeasured'?'missing-source-reference':qualification==='measured-stale-review-due'?'review-due':'within-review-window';
 return {schema_version:'zip-evidence-qualification-view@1.0.0',available:true,status:'verified-immutable-projection',zip5:zip,category_id:category,selection_status:'matched',export_policy:'internal',
  release:{id:'qualification-fixture',manifest_sha256:sha,as_of:'2026-10-02T00:00:00.000Z',created_at:'2026-10-03T00:00:00.000Z',temporal_policy_version:'1.1.0'},
  bindings:{coverage_release_id:'coverage-fixture',coverage_manifest_sha256:sha,registry_release_id:'registry-fixture',registry_manifest_sha256:sha,mapping_version:'map@1.0.0',mapping_sha256:sha,taxonomy_version:'taxonomy@1.0.0'},
  claims:{current_operations_verified:false,active_business_count:null,all_business_denominator:null,all_business_completion_percent:null,overlapping_units_additive:false},
  rows:[{source_key:'source-fixture',source_release_id:'source-release',source_kind:'record-level-evidence',evidence_type:'source-reported-retailer',qualification,
   temporal_status:{status:temporal,source_reference_field:qualification==='unmeasured'?null:'source_date',source_reference_date:qualification==='unmeasured'?null:'2026-09-01',review_due_date:qualification==='unmeasured'?null:'2026-10-01'},
   evidence_counts_by_unit:{retailer_count:9},eligible_evidence_counts_by_unit:{retailer_count:qualification==='unmeasured'?null:qualification==='measured-stale-review-due'?0:9},current_operations_verified:false,current_operating_business_count:null,all_business_completion_percent:null,all_business_denominator:null}]};
}
