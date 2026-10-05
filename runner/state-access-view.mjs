import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { loadIndustryConfig } from './industry-segments.mjs';

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

export async function stateAccessView({root=APP_ROOT,state,industry}={}){
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
  return {accessEvidenceStatus:cell.accessEvidenceStatus,temporalStatus:cell.temporalStatus,exactBindings,...(cell.annualAggregateContext?{annualAggregateContext:cell.annualAggregateContext,contextTemporalEvidence}:{}),retainedDirectoryEvidence,limitations:cell.limitations};
}

export async function stateAccessIndustrySummary({root=APP_ROOT,configLoader=loadIndustryConfig}={}){
  const [{report,config},industryConfig]=await Promise.all([enrolledReport(root),configLoader(path.join(root,'config','industry-segments.json'))]),expected=Object.keys(industryConfig.industries).sort();
  check(expected.length===9,'State-access operational industry taxonomy is invalid.');
  const rows=new Map(expected.map(id=>[id,{id,jurisdictions:0,access_status_counts:{},temporal_status_counts:{}}]));
  let cells=0;const states=new Set();
  for(const jurisdiction of report.jurisdictions){
    check(STATE.test(jurisdiction.state??'')&&!states.has(jurisdiction.state),'State-access jurisdiction identities are invalid.');states.add(jurisdiction.state);
    const actual=Array.isArray(jurisdiction.industries)?jurisdiction.industries.map(row=>row.industry).sort():[];
    check(actual.length===9&&new Set(actual).size===9&&actual.every((id,index)=>id===expected[index]),'State-access operational industry cells are invalid.');
    for(const cell of jurisdiction.industries){const row=rows.get(cell.industry);check(row&&ACCESS_STATUSES.has(cell.accessEvidenceStatus)&&TEMPORAL_STATUSES.has(cell.temporalStatus?.status),'State-access industry status vocabulary is invalid.');row.jurisdictions+=1;row.access_status_counts[cell.accessEvidenceStatus]=(row.access_status_counts[cell.accessEvidenceStatus]??0)+1;row.temporal_status_counts[cell.temporalStatus.status]=(row.temporal_status_counts[cell.temporalStatus.status]??0)+1;cells+=1;}
  }
  check(states.size===51&&cells===459&&[...rows.values()].every(row=>row.jurisdictions===51),'State-access industry-cell conservation failed.');
  for(const row of rows.values()){
    row.jurisdictions_with_retained_access_evidence=(row.access_status_counts['direct-state-publisher']??0)+(row.access_status_counts['local-publisher-substate-evidence']??0)+(row.access_status_counts['national-dataset-state-evidence']??0);
    row.retained_access_evidence_percent=Number(((row.jurisdictions_with_retained_access_evidence/row.jurisdictions)*100).toFixed(1));
  }
  return {schema_version:'state-access-industry-summary@1.1.0',report_sha256:config.reportSha256,jurisdictions:51,industry_cells:459,industries:[...rows.values()],claims:{active_business_count:null,nationwide_industry_completeness:null,complete_geocodes:false,maintenance_selection_affects_evidence:false}};
}
