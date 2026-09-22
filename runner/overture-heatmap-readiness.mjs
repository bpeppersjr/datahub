import { inspectOvertureReadiness } from './overture-readiness.mjs';

const RELEASE='2026-08-19.0';
const FINGERPRINT='36e62492e9474442b81f1f7bc3efc8b5d49308c75fe33c943169852abfa7f64f';

export function projectOvertureHeatmapReadiness(value){
  const metadata=value?.metadata,failed=value?.failed_acquisition,journal=failed?.journal,selected=failed?.selected_output;
  if(value?.schema_version!=='overture-readiness@1.0.0'||value.read_only!==true||value.operations_allocated!==0||value.network_requests!==0
    ||value.retry_authorized!==false||value.resume_supported!==false||value.snapshot_ready!==false||value.acquisition_ready!==false
    ||value.retained_evidence_valid!==true||metadata?.operation_id!=='c7fd0208-eb13-442a-8982-8a5d1ef2927e'
    ||metadata.current_replay!==true||metadata.release_id!==RELEASE||metadata.observed_at!=='2026-09-09T11:54:15.150Z'
    ||metadata.asset_count!==16||metadata.declared_global_rows!==73631092||metadata.stac_fingerprint!==FINGERPRINT
    ||value.runtime?.operation_id!=='b4ae8318-e786-4ac8-bf7b-e673c6d00ae1'||value.runtime.current_replay!==true
    ||failed?.operation_id!=='a8ff9f6d-b2be-4d56-905b-17984788b1d5'||failed.status!=='FAILED'||failed.snapshot_ready!==false
    ||failed.inspection_required!==true||failed.reason_code!=='failed-acquisition-not-resumable'
    ||journal?.present!==true||journal.pending_request_index!==24||journal.requests_reserved!==24||journal.completed_requests!==23||journal.delivered_bytes!==3292783
    ||selected?.present!==true||selected.bytes!==0||selected.sha256!=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'||selected.integrity_verified!==true
    ||!Array.isArray(value.blockers)||!value.blockers.includes('fresh-explicit-large-acquisition-authorization-required')
    ||!value.blockers.includes('failed-acquisition-is-not-a-resumable-checkpoint'))throw new Error('Overture retained readiness evidence rejected.');
  return Object.freeze({schema_version:'overture-heatmap-readiness@1.0.0',read_only:true,source_id:'overture-us-places',status:'metadata-only-no-place-admission',
    release_id:RELEASE,observed_at:metadata.observed_at,asset_count:16,declared_global_rows:73631092,declared_row_scope:'global-not-us',
    stac_fingerprint:FINGERPRINT,failed_operation_id:failed.operation_id,failed_status:'FAILED',snapshot_ready:false,resumable:false,
    journal:{requests_reserved:24,completed_requests:23,pending_request_index:24,delivered_bytes:3292783},
    selected_output:{bytes:0,sha256:selected.sha256,admissible:false},admission:{named_rows:0,state_rows:0,zip5_rows:0,category_counts_available:false,geocodes:0},
    acquisition_authorized:false,acquisition_control_exposed:false,blockers:[...value.blockers],
    semantics:['Declared rows describe the pinned global release, not U.S. rows.','No names, categories, state records, ZIP5 records, or geocodes are admitted.','The failed acquisition is not resumable and does not authorize a retry.']});
}

export async function createOvertureHeatmapReadiness(options={}){
  return projectOvertureHeatmapReadiness(await inspectOvertureReadiness(options));
}
