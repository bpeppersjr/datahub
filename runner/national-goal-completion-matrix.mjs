import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { readNationalReportingCatalog } from './national-reporting-catalog.mjs';
import { nationalDatasetRepresentation } from './dataset-representation.mjs';
import { readNationalReportingSnapshot } from './national-reporting-snapshot.mjs';
import { readSelectedIrsStateSummary } from './irs-eo-state-summary.mjs';
import { assessBusinessSourceTemporalStatus } from './business-source-temporal-status.mjs';
import { assessStateBusinessSourceReadiness } from './business-state-source-readiness.mjs';

const VERSION='national-goal-completion-matrix@1.0.0';
const check=(value,message='National goal-completion matrix rejected.')=>{if(!value)throw Error(message);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const percent=(n,d)=>d?Math.round(n/d*1000)/10:null;
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
function geocode(source){const g=source?.location_profile_geography;if(!g||!Number.isSafeInteger(g.profile_count)||!Number.isSafeInteger(g.coordinate_assigned_single_count))return{assigned:null,eligible:null,percent:null,scope:'national-source-release'};return{assigned:g.coordinate_assigned_single_count,eligible:g.profile_count,percent:percent(g.coordinate_assigned_single_count,g.profile_count),scope:'national-source-release'};}
function sourceEvidence(source,coverage){return{source_release_id:source?.release_metadata?.source_release_id??null,coverage_release_id:coverage.coverageReleaseId,coverage_manifest_sha256:coverage.manifestSha256};}

export async function buildNationalGoalCompletionMatrix({root=APP_ROOT,createdAt=new Date().toISOString(),releaseId=`national-goal-completion-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,8)}`,catalogReader=readNationalReportingCatalog,snapshotReader=readNationalReportingSnapshot,irsReader=readSelectedIrsStateSummary}={}){
  root=await realpath(path.resolve(root));check(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(releaseId),'Invalid matrix release ID.');
  const pointerPath=path.join(root,'data/business-coverage-views/current.json'),snapshot=await snapshotReader({pointerPath});
  const {catalog,sha256:catalogSha256}=await catalogReader();
  const irsSource=snapshot.sources.find(row=>row.source_key==='irs_eo_bmf_organizations');
  let irs=null;try{irs=await irsReader({root,pointerPath,coverageManifest:snapshot.manifest,sourceRow:irsSource});}catch{irs=null;}
  const representation=nationalDatasetRepresentation(catalog,snapshot.states,snapshot.sources,irs);
  const sourceMap=new Map(snapshot.sources.map(row=>[row.source_key,row]));
  const catalogMap=new Map(catalog.sources.map(row=>[row.id,row]));
  const categories=['general-business',...[...new Set(catalog.sources.map(row=>row.group))].sort()];
  const jurisdictions=representation.states.map(state=>({code:state.code,fips:state.fips,name:state.name,all_business_completion_percent:null,
    categories:categories.map(categoryId=>{if(categoryId==='general-business'){const sourceState=snapshot.states.find(row=>row.postal_abbreviation===state.code),readiness=assessStateBusinessSourceReadiness(sourceState),key=readiness.broad_jurisdiction_organization_layer.source_key,source=sourceMap.get(key),available=readiness.broad_jurisdiction_organization_layer.status==='production-integrated';const dataset={dataset_id:'broad-jurisdiction-organization-layer',label:'Broad jurisdiction organization layer',availability_status:available?'available':'unmeasured',state_record_count:available?sourceState.registry_evidence.source_profile_counts_by_reported_address_state[key]??null:null,authorization:{state:available?'production-integrated-governed-source':'not-available',basis:'current retained state source-readiness policy; acquisition authorization is not inferred',export_policy:catalog.exportPolicy},evidence:sourceEvidence(source,snapshot.evidence),temporal_status:source?assessBusinessSourceTemporalStatus(source,{asOf:createdAt}):{status:'unmeasured',general_business_operating_status_asserted:false},zip_contribution:{rows:source?.zip_rows_with_contribution??null,scope:'national-source-release'},geocode_rate:{assigned:readiness.coordinate_assigned_profile_count,eligible:readiness.reported_location_profile_count,percent:readiness.coordinate_assignment_percent,scope:'jurisdiction-all-retained-profiles'},gap_reason:available?null:'broad jurisdiction organization layer is missing',scope:'broad organization-registration or licensing evidence; not all active businesses',row_unit:'governed organization evidence'};return{category_id:categoryId,dataset_availability:{available:available?1:0,denominator:1,percent:available?100:0,measure:'governed-dataset-presence-not-business-completeness'},all_business_completion_percent:null,datasets:[dataset]};}
      const datasets=state.datasets.filter(row=>row.industries.includes(categoryId)).map(row=>{const catalogRow=catalogMap.get(row.id),source=sourceMap.get(row.sourceKey),available=row.status==='represented';return{
        dataset_id:row.id,label:row.label,availability_status:available?'available':row.status==='no-state-records'?'observed-zero':'unmeasured',state_record_count:row.stateRecordCount,
        authorization:{state:'retained-reporting-enrolled',basis:'governed national reporting catalog; acquisition authorization is not inferred',export_policy:catalog.exportPolicy},
        evidence:sourceEvidence(source,snapshot.evidence),temporal_status:source?assessBusinessSourceTemporalStatus(source,{asOf:createdAt}):{status:'unmeasured',general_business_operating_status_asserted:false},
        zip_contribution:{rows:source?.zip_rows_with_contribution??null,scope:'national-source-release'},geocode_rate:geocode(source),
        gap_reason:available?null:row.status==='no-state-records'?'governed dataset has zero reported-address records for this jurisdiction':'governed state count is unavailable from retained evidence',
        scope:catalogRow.scope,row_unit:row.rowUnit};});const available=datasets.filter(row=>row.availability_status==='available').length;return{
          category_id:categoryId,dataset_availability:{available,denominator:datasets.length,percent:percent(available,datasets.length),measure:'governed-dataset-presence-not-business-completeness'},all_business_completion_percent:null,datasets};})}));
  check(jurisdictions.length===51&&jurisdictions.every(row=>row.categories.length===categories.length));
  return{schema_version:VERSION,release_id:releaseId,created_at:createdAt,scope:'50 states and District of Columbia',denominator:{version:`${catalog.denominatorVersion}+broad-jurisdiction-layer@1.0.0`,datasets:catalog.sources.length+1,categories:categories.length,meaning:'governed national reporting datasets grouped by declared category plus one broad-jurisdiction organization-layer requirement; not all industries or businesses'},all_business_completion_percent:null,jurisdictions,
    evidence:{catalog_sha256:catalogSha256,coverage_release_id:snapshot.evidence.coverageReleaseId,coverage_pointer_sha256:snapshot.evidence.pointerSha256,coverage_manifest_sha256:snapshot.evidence.manifestSha256,state_artifact_sha256:snapshot.evidence.artifacts.states.sha256,source_artifact_sha256:snapshot.evidence.artifacts.sources.sha256,source_replay_performed_this_build:false,publisher_authentication_performed_this_build:false},
    limitations:['Availability percentages measure represented governed datasets in the declared denominator, not business or industry completeness.','A zero means retained evidence reports no state records; null means the state count is unmeasured.','ZIP contribution and geocode rates are source-release-wide context, not state-specific rates.','Source-specific status is not generalized into current operation.']};
}

export async function publishNationalGoalCompletionMatrix({root=APP_ROOT,...options}={}){
  root=await realpath(path.resolve(root));const report=await buildNationalGoalCompletionMatrix({root,...options}),base=path.join(root,'data/national-goal-completion-matrix/releases'),directory=path.join(base,report.release_id);
  check(!path.relative(root,directory).startsWith('..'));await mkdir(base,{recursive:true});await mkdir(directory);
  const reportBytes=Buffer.from(stable(report));await writeFile(path.join(directory,'report.json'),reportBytes,{flag:'wx'});
  const manifest={schema_version:VERSION,dataset_id:'national-goal-completion-matrix',release_id:report.release_id,status:'published-local-derived-report',created_at:report.created_at,all_business_completion_percent:null,production_pointers_changed:false,network_requests:0,artifacts:[{path:'report.json',bytes:reportBytes.length,sha256:hash(reportBytes),record_count:report.jurisdictions.length,export_policy:'local-review-only'}],evidence:report.evidence};
  await writeFile(path.join(directory,'manifest.json'),stable(manifest),{flag:'wx'});return{directory,report,manifest};
}

export async function verifyNationalGoalCompletionMatrix(manifestPath){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8')),directory=path.dirname(manifestPath);check(manifest.schema_version===VERSION&&manifest.dataset_id==='national-goal-completion-matrix'&&manifest.status==='published-local-derived-report'&&manifest.production_pointers_changed===false&&manifest.network_requests===0&&manifest.artifacts?.length===1);
  const bytes=await readFile(path.join(directory,'report.json')),artifact=manifest.artifacts[0];check(bytes.length===artifact.bytes&&hash(bytes)===artifact.sha256);const report=JSON.parse(bytes);check(report.schema_version===VERSION&&report.release_id===manifest.release_id&&report.all_business_completion_percent===null&&report.jurisdictions?.length===51&&report.jurisdictions.every(row=>row.all_business_completion_percent===null&&row.categories.every(category=>category.all_business_completion_percent===null)));return{status:'verified',release_id:manifest.release_id,manifest_path:manifestPath,report_sha256:artifact.sha256,jurisdictions:51,categories:report.denominator.categories,network_requests:0,production_pointers_changed:false,report};
}
