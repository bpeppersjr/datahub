import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';

const STATE=/^[A-Z]{2}$/;
const INDUSTRY=/^[a-z][a-z0-9-]{1,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const TEMPORAL='state-access-temporal-evidence@1.0.0';
const CONFIG='config/state-access-ui-enrollment.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
function check(value,message='State-access evidence is unavailable.'){if(!value)throw Error(message);}
function inside(root,value){const file=path.resolve(root,value),relative=path.relative(root,file);check(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return file;}
function temporal(value){check(value?.schemaVersion===TEMPORAL&&typeof value.binding==='string'&&typeof value.status==='string'&&value.activeBusinessVerified===false&&value.generalBusinessOperatingStatusAsserted===false,'State-access temporal binding is invalid.');return value;}

export async function stateAccessView({root=APP_ROOT,state,industry}={}){
  check(STATE.test(state??''),'Invalid state selection.');check(INDUSTRY.test(industry??''),'Invalid industry selection.');
  root=await realpath(path.resolve(root));const configFile=inside(root,CONFIG),configInfo=await lstat(configFile);check(configInfo.isFile()&&!configInfo.isSymbolicLink()&&configInfo.nlink===1,'State-access enrollment path is not an independent regular file.');const config=JSON.parse(await readFile(configFile,'utf8'));
  check(config.schemaVersion==='state-access-ui-enrollment@1.0.0'&&SHA.test(config.reportSha256??''));
  const reportFile=inside(root,config.reportPath),canonical=await realpath(reportFile),reportInfo=await lstat(reportFile);check(canonical===reportFile&&reportInfo.isFile()&&!reportInfo.isSymbolicLink()&&reportInfo.nlink===1,'State-access report path is not an independent canonical file.');
  const bytes=await readFile(reportFile);check(hash(bytes)===config.reportSha256,'State-access enrolled report hash changed.');const report=JSON.parse(bytes);
  check(report.schemaVersion===4&&report.evidence?.temporalBindingRequiredForPositiveCounts===true&&report.summary?.jurisdictions===51&&report.jurisdictions?.length===51,'State-access enrolled report schema is invalid.');
  const jurisdiction=report.jurisdictions.find(row=>row?.state===state);check(jurisdiction,'State is outside the enrolled ledger.');const cell=jurisdiction.industries?.find(row=>row?.industry===industry);check(cell,'Industry is outside the enrolled ledger.');
  check(typeof cell.accessEvidenceStatus==='string'&&Array.isArray(cell.evidence)&&Array.isArray(cell.limitations));
  const exactBindings=cell.evidence.filter(item=>item?.temporalEvidence).map(item=>({evidenceType:item.type,sourceId:item.sourceId??null,recordCount:item.recordCount??null,temporalEvidence:temporal(item.temporalEvidence)}));
  if(cell.annualAggregateContext)exactBindings.push({evidenceType:'annual-aggregate-context',sourceId:cell.annualAggregateContext.sourceId??null,recordCount:cell.annualAggregateContext.nonemployerEstablishments??null,temporalEvidence:temporal(cell.annualAggregateContext.temporalEvidence)});
  check(exactBindings.length===(cell.temporalStatus?.positiveEvidenceItems??0),'State-access positive evidence lacks an exact temporal binding.');
  check(typeof cell.temporalStatus?.status==='string'&&cell.temporalStatus.activeBusinessVerified===false&&cell.temporalStatus.generalBusinessOperatingStatusAsserted===false);
  const retainedDirectoryEvidence=cell.retainedDirectoryEvidence??[];check(Array.isArray(retainedDirectoryEvidence)&&retainedDirectoryEvidence.every(item=>item?.status==='verified-retained-directory-readiness'&&Number.isSafeInteger(item.directoryRows)&&item.directoryRows>=0&&item.namedBusinessCount===null&&item.uniqueBusinessCount===null&&item.physicalSiteCount===null&&item.currentOperatingCount===null&&item.nationalCompletenessPercent===null&&item.currentUspsAssignmentVerified===false&&item.zctaMembershipInferred===false&&item.countyAssignmentPerformed===false&&item.spatialAssignmentPerformed===false));
  return {accessEvidenceStatus:cell.accessEvidenceStatus,temporalStatus:cell.temporalStatus,exactBindings,...(cell.annualAggregateContext?{annualAggregateContext:cell.annualAggregateContext}:{}),retainedDirectoryEvidence,limitations:cell.limitations};
}
