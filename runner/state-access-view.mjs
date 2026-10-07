import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { loadIndustryConfig } from './industry-segments.mjs';
import { loadAutomaticRefreshAuthorizations } from './automatic-refresh-authorization.mjs';
import { readCaChildcareStatusReadiness } from './ca-childcare-status-readiness.mjs';
import { readAkChildcareSourceDiscovery } from './ak-childcare-source-discovery.mjs';
import { readAlChildcareSourceDiscovery } from './al-childcare-source-discovery.mjs';
import { readArChildcareSourceDiscovery } from './ar-childcare-source-discovery.mjs';
import { readAzChildcareSourceDiscovery } from './az-childcare-source-discovery.mjs';

const STATE=/^[A-Z]{2}$/;
const INDUSTRY=/^[a-z][a-z0-9-]{1,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const TEMPORAL='state-access-temporal-evidence@1.0.0';
const CONFIG='config/state-access-ui-enrollment.json';
const ACCESS_STATUSES=new Set(['direct-state-publisher','local-publisher-substate-evidence','national-dataset-state-evidence','unsupported-evidence-not-measured','unsupported-missing']);
const TEMPORAL_STATUSES=new Set(['missing-source-reference','no-positive-count-evidence','review-due','within-review-window']);
const hash=value=>createHash('sha256').update(value).digest('hex');
function check(value,message='State-access evidence is unavailable.'){if(!value)throw Error(message);}
function inside(root,value){const file=path.resolve(root,value),relative=path.relative(root,file);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return file;}
function temporal(value){check(value?.schemaVersion===TEMPORAL&&typeof value.binding==='string'&&typeof value.status==='string'&&value.activeBusinessVerified===false&&value.generalBusinessOperatingStatusAsserted===false,'State-access temporal binding is invalid.');return value;}
function positiveAccessEvidence(item){return Number.isSafeInteger(item?.recordCount)&&item.recordCount>0&&(item.type??item.evidenceType)!=='retained-state-query-sample-count';}
async function enrolledReport(root){
  root=await realpath(path.resolve(root));const configFile=inside(root,CONFIG),configInfo=await lstat(configFile);check(configInfo.isFile()&&!configInfo.isSymbolicLink()&&configInfo.nlink===1,'State-access enrollment path is not an independent regular file.');const config=JSON.parse(await readFile(configFile,'utf8'));
  check(config.schemaVersion==='state-access-ui-enrollment@1.0.0'&&SHA.test(config.reportSha256??''));
  const reportFile=inside(root,config.reportPath),canonical=await realpath(reportFile),reportInfo=await lstat(reportFile);check(canonical===reportFile&&reportInfo.isFile()&&!reportInfo.isSymbolicLink()&&reportInfo.nlink===1,'State-access report path is not an independent canonical file.');
  const bytes=await readFile(reportFile);check(hash(bytes)===config.reportSha256,'State-access enrolled report hash changed.');const report=JSON.parse(bytes);
  check(report.schemaVersion===4&&report.evidence?.temporalBindingRequiredForPositiveCounts===true&&report.summary?.jurisdictions===51&&report.summary?.industryCells===459&&report.jurisdictions?.length===51,'State-access enrolled report schema is invalid.');
  return {report,config};
}

export async function stateAccessView({root=APP_ROOT,state,industry,caStatusReadinessLoader=readCaChildcareStatusReadiness}={}){
  check(STATE.test(state??''),'Invalid state selection.');check(INDUSTRY.test(industry??''),'Invalid industry selection.');
  const {report}=await enrolledReport(root);
  const jurisdiction=report.jurisdictions.find(row=>row?.state===state);check(jurisdiction,'State is outside the enrolled ledger.');const cell=jurisdiction.industries?.find(row=>row?.industry===industry);check(cell,'Industry is outside the enrolled ledger.');
  check(typeof cell.accessEvidenceStatus==='string'&&Array.isArray(cell.evidence)&&Array.isArray(cell.limitations));
  const temporalBindings=cell.evidence.filter(item=>item?.temporalEvidence).map(item=>({evidenceType:item.type,sourceId:item.sourceId??null,recordCount:item.recordCount??null,temporalEvidence:temporal(item.temporalEvidence)}));
  const exactBindings=temporalBindings.filter(positiveAccessEvidence);
  check(exactBindings.length===(cell.temporalStatus?.positiveEvidenceItems??0),'State-access positive evidence lacks an exact temporal binding.');
  check(typeof cell.temporalStatus?.status==='string'&&cell.temporalStatus.activeBusinessVerified===false&&cell.temporalStatus.generalBusinessOperatingStatusAsserted===false);
  let contextTemporalEvidence=null;
  if(cell.annualAggregateContext){
    check(cell.annualAggregateContext.categoryRelation==='context-only-not-equivalent'&&cell.annualAggregateContext.currentBusinessOperationsVerified===false&&cell.annualAggregateContext.collectionCompletenessPercent===null,'Annual aggregate context is not independently bounded.');
    contextTemporalEvidence=temporal(cell.annualAggregateContext.temporalEvidence);
  }
  const retainedDirectoryEvidence=cell.retainedDirectoryEvidence??[];check(Array.isArray(retainedDirectoryEvidence)&&retainedDirectoryEvidence.every(item=>item?.status==='verified-retained-directory-readiness'&&Number.isSafeInteger(item.directoryRows)&&item.directoryRows>=0&&item.namedBusinessCount===null&&item.uniqueBusinessCount===null&&item.physicalSiteCount===null&&item.currentOperatingCount===null&&item.nationalCompletenessPercent===null&&item.currentUspsAssignmentVerified===false&&item.zctaMembershipInferred===false&&item.countyAssignmentPerformed===false&&item.spatialAssignmentPerformed===false));
  let publisherStatusReadiness=null;if(state==='CA'&&industry==='childcare'){publisherStatusReadiness=await caStatusReadinessLoader({root});check(publisherStatusReadiness?.schema_version==='ca-childcare-status-readiness-view@1.1.0'&&publisherStatusReadiness.state==='CA'&&publisherStatusReadiness.industry==='childcare'&&publisherStatusReadiness.publisher_rows===39184&&publisherStatusReadiness.temporal?.publisher_file_date==='2025-05-25'&&publisherStatusReadiness.temporal.current_operation_verified===false&&publisherStatusReadiness.claims?.provider_rows_acquired===0&&publisherStatusReadiness.claims.current_operations_verified===false&&publisherStatusReadiness.claims.statewide_completeness===null&&publisherStatusReadiness.claims.business_count===null,'California childcare publisher readiness is invalid.');}
  return {accessEvidenceStatus:cell.accessEvidenceStatus,temporalStatus:cell.temporalStatus,exactBindings,...(cell.annualAggregateContext?{annualAggregateContext:cell.annualAggregateContext,contextTemporalEvidence}:{}),retainedDirectoryEvidence,...(publisherStatusReadiness?{publisherStatusReadiness}:{}),limitations:cell.limitations};
}

export async function stateAccessIndustrySummary({root=APP_ROOT,configLoader=loadIndustryConfig}={}){
  const [{report,config},industryConfig]=await Promise.all([enrolledReport(root),configLoader(path.join(root,'config','industry-segments.json'))]),expected=Object.keys(industryConfig.industries).sort();
  check(expected.length===9,'State-access operational industry taxonomy is invalid.');
  const rows=new Map(expected.map(id=>[id,{id,jurisdictions:0,access_status_counts:Object.fromEntries([...ACCESS_STATUSES].sort().map(status=>[status,0])),temporal_status_counts:Object.fromEntries([...TEMPORAL_STATUSES].sort().map(status=>[status,0])),states:[]}]))
  let cells=0;const states=new Set();
  for(const jurisdiction of report.jurisdictions){
    check(STATE.test(jurisdiction.state??'')&&!states.has(jurisdiction.state),'State-access jurisdiction identities are invalid.');states.add(jurisdiction.state);
    const actual=Array.isArray(jurisdiction.industries)?jurisdiction.industries.map(row=>row.industry).sort():[];
    check(actual.length===9&&new Set(actual).size===9&&actual.every((id,index)=>id===expected[index]),'State-access operational industry cells are invalid.');
    for(const cell of jurisdiction.industries){const row=rows.get(cell.industry);check(row&&ACCESS_STATUSES.has(cell.accessEvidenceStatus)&&TEMPORAL_STATUSES.has(cell.temporalStatus?.status),'State-access industry status vocabulary is invalid.');const sources=[],sourceKeys=new Set();for(const evidence of cell.evidence??[]){if(!evidence?.temporalEvidence)continue;const item=temporal(evidence.temporalEvidence);check(typeof item.sourceKey==='string'&&item.sourceKey.length>0&&(item.sourceReleaseId===null||typeof item.sourceReleaseId==='string')&&(item.sourceReferenceAt===null||typeof item.sourceReferenceAt==='string')&&(item.reviewDueDate===null||typeof item.reviewDueDate==='string')&&typeof item.evidenceScope==='string'&&(item.publisherCurrencyBasis===undefined||item.publisherCurrencyBasis===null||typeof item.publisherCurrencyBasis==='string')&&(item.retainedSourceObservedAt===undefined||item.retainedSourceObservedAt===null||typeof item.retainedSourceObservedAt==='string'),'State-access source provenance is invalid.');const publisherCurrencyBasis=item.publisherCurrencyBasis??null,retainedObservedAt=item.retainedSourceObservedAt??null,key=[item.sourceKey,item.sourceReleaseId,item.sourceReferenceAt,item.reviewDueDate,item.evidenceScope,publisherCurrencyBasis,retainedObservedAt].join('|');if(!sourceKeys.has(key)){sourceKeys.add(key);sources.push({source_key:item.sourceKey,source_release_id:item.sourceReleaseId,source_reference_at:item.sourceReferenceAt,review_due_date:item.reviewDueDate,evidence_scope:item.evidenceScope,publisher_currency_basis:publisherCurrencyBasis,retained_observed_at:retainedObservedAt});}}sources.sort((a,b)=>a.source_key.localeCompare(b.source_key)||String(a.source_release_id).localeCompare(String(b.source_release_id)));row.jurisdictions+=1;row.access_status_counts[cell.accessEvidenceStatus]+=1;row.temporal_status_counts[cell.temporalStatus.status]+=1;row.states.push({state:jurisdiction.state,access_status:cell.accessEvidenceStatus,temporal_status:cell.temporalStatus.status,source_keys:[...new Set(sources.map(item=>item.source_key))].sort(),sources});cells+=1;}
  }
  check(states.size===51&&cells===459&&[...rows.values()].every(row=>row.jurisdictions===51&&row.states.length===51&&new Set(row.states.map(item=>item.state)).size===51),'State-access industry-cell conservation failed.');
  for(const row of rows.values()){
    row.states.sort((a,b)=>a.state.localeCompare(b.state));
    row.jurisdictions_with_retained_access_evidence=(row.access_status_counts['direct-state-publisher']??0)+(row.access_status_counts['local-publisher-substate-evidence']??0)+(row.access_status_counts['national-dataset-state-evidence']??0);
    row.retained_access_evidence_percent=Number(((row.jurisdictions_with_retained_access_evidence/row.jurisdictions)*100).toFixed(1));
  }
  return {schema_version:'state-access-industry-summary@1.3.0',report_sha256:config.reportSha256,jurisdictions:51,industry_cells:459,industries:[...rows.values()],claims:{active_business_count:null,nationwide_industry_completeness:null,complete_geocodes:false,maintenance_selection_affects_evidence:false}};
}

export async function stateAccessMaintenanceBacklog({root=APP_ROOT,maintainedIndustries=[],maintenanceRevision=0,configLoader=loadIndustryConfig,automaticRefreshLoader=loadAutomaticRefreshAuthorizations,akChildcareDiscoveryLoader=readAkChildcareSourceDiscovery,alChildcareDiscoveryLoader=readAlChildcareSourceDiscovery,arChildcareDiscoveryLoader=readArChildcareSourceDiscovery,azChildcareDiscoveryLoader=readAzChildcareSourceDiscovery}={}){
  const [{report,config},industryConfig]=await Promise.all([enrolledReport(root),configLoader(path.join(root,'config','industry-segments.json'))]);
  check(Array.isArray(maintainedIndustries)&&Number.isSafeInteger(maintenanceRevision)&&maintenanceRevision>=0,'Maintained industry selection is invalid.');
  const allowed=Object.keys(industryConfig.industries),selected=[...new Set(maintainedIndustries)];
  check(selected.length===maintainedIndustries.length&&selected.every(id=>allowed.includes(id)),'Maintained industry selection is invalid.');
  const automaticRefresh=await automaticRefreshLoader(industryConfig),automaticBySource=new Map(automaticRefresh.map(item=>[item.sourceId,item]));
  check(automaticRefresh.length===Object.keys(industryConfig.sources).length&&automaticBySource.size===automaticRefresh.length,'Automatic-refresh posture is unavailable.');
  const severity={'unsupported-missing':0,'unsupported-evidence-not-measured':1,'review-due':2,'missing-source-reference':3},items=[];
  for(const jurisdiction of report.jurisdictions)for(const cell of jurisdiction.industries){
    if(!selected.includes(cell.industry))continue;
    const issue_codes=[];
    if(cell.accessEvidenceStatus==='unsupported-missing'||cell.accessEvidenceStatus==='unsupported-evidence-not-measured')issue_codes.push(cell.accessEvidenceStatus);
    if(cell.temporalStatus?.status==='review-due'||cell.temporalStatus?.status==='missing-source-reference')issue_codes.push(cell.temporalStatus.status);
    if(issue_codes.length){const source_keys=[...new Set(cell.evidence.map(item=>item?.temporalEvidence?.sourceKey).filter(value=>typeof value==='string'&&value.length>0))].sort();const applicable_collection_sources=industryConfig.industries[cell.industry].filter(id=>{const source=industryConfig.sources[id];return source.scope==='national'||source.states.includes(jurisdiction.state)}).sort().map(id=>{const source=industryConfig.sources[id],decision=automaticBySource.get(id);check(decision&&decision.script===source.script,'Automatic-refresh source binding is invalid.');return{source_id:id,scope:source.scope,manual_selection_required:source.manual_selection_required===true,automatic_refresh_authorized:decision.automaticRefreshAuthorized,automatic_refresh_reason_code:decision.reasonCode};});let source_discovery=null;if(cell.industry==='childcare'&&['AK','AL','AR','AZ'].includes(jurisdiction.state)){const loaders={AK:akChildcareDiscoveryLoader,AL:alChildcareDiscoveryLoader,AR:arChildcareDiscoveryLoader,AZ:azChildcareDiscoveryLoader},discovery=await loaders[jurisdiction.state]({root});check(discovery?.state===jurisdiction.state&&discovery.industry==='childcare'&&['official-search-identified-bulk-interface-unverified','official-monthly-table-metadata-validated-acquisition-disabled'].includes(discovery.decision)&&discovery.access?.public_search_available===true&&typeof discovery.access.supported_bulk_export_verified==='boolean'&&discovery.access.supported_api_verified===false&&discovery.access.portal_automation_authorized===false&&discovery.access.record_acquisition_authorized!==true&&discovery.claims?.provider_rows_acquired===0,`${jurisdiction.state} childcare discovery is invalid.`);source_discovery={discovery_id:discovery.discovery_id,status:discovery.decision,official_source_count:discovery.official_sources.length,supported_bulk_export_verified:discovery.access.supported_bulk_export_verified,supported_api_verified:false,portal_automation_authorized:false,record_acquisition_authorized:false,next_action:discovery.next_action};}items.push({state:jurisdiction.state,industry:cell.industry,action_kind:issue_codes.some(code=>code.startsWith('unsupported-'))?'source-discovery-review':'temporal-source-review',access_status:cell.accessEvidenceStatus,temporal_status:cell.temporalStatus.status,source_keys,issue_codes,source_discovery,refresh_posture:{applicable_collection_sources,manual_app_plan_available:applicable_collection_sources.length>0,automatic_refresh_authorized:applicable_collection_sources.length>0&&applicable_collection_sources.every(source=>source.automatic_refresh_authorized),newer_publisher_release_guaranteed:false,gap_resolution_guaranteed:false}});}
  }
  items.sort((a,b)=>Math.min(...a.issue_codes.map(code=>severity[code]))-Math.min(...b.issue_codes.map(code=>severity[code]))||a.industry.localeCompare(b.industry)||a.state.localeCompare(b.state));
  const view={schema_version:'state-access-maintenance-backlog@1.5.0',report_sha256:config.reportSha256,maintenance_revision:maintenanceRevision,maintained_industries:selected,total_attention_cells:items.length,batch_limit:10,next_batch:items.slice(0,10),remaining_after_batch:Math.max(0,items.length-10),claims:{acquisition_authorized:false,dispatch_performed:false,production_change:false,business_completeness:null}};
  return {...view,backlog_sha256:hash(Buffer.from(JSON.stringify(view)))};
}
