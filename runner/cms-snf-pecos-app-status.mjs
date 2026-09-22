import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {PECOS_ACQUISITION_POLICY} from './cms-snf-pecos-acquisition.mjs';
import {CMS_SNF_PECOS_CURRENT_DOCUMENTS} from './cms-snf-pecos-metadata-prerequisite.mjs';

const policyPath=path.join(APP_ROOT,'config/source-policies/cms-snf-pecos-acquisition.json');
const documentFiles={enrollments:'enrollments.pdf',owners:'owners-current.pdf',guidance:'guidance-current.pdf'};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const sha=value=>createHash('sha256').update(value).digest('hex');

export async function getCmsSnfPecosAppStatus(){
  let policyMatches=false;
  try{policyMatches=same(JSON.parse(await readFile(policyPath,'utf8')),PECOS_ACQUISITION_POLICY);}catch{/* Report unavailable below. */}
  const documents=[];
  for(const [kind,pin] of Object.entries(CMS_SNF_PECOS_CURRENT_DOCUMENTS)){
    let ready=false;
    try{const value=await readFile(path.join(APP_ROOT,'data/tmp/pecos-docs',documentFiles[kind]));ready=value.length===pin.bytes&&sha(value)===pin.sha256;}catch{/* Missing or changed prerequisite. */}
    documents.push({kind,ready});
  }
  const prerequisitesReady=policyMatches&&documents.every(item=>item.ready);
  return Object.freeze({
    sourceId:'cms-snf-pecos',
    label:'CMS SNF PECOS enrollment and ownership',
    profile:PECOS_ACQUISITION_POLICY.profile,
    sourcePeriod:PECOS_ACQUISITION_POLICY.sourcePeriod,
    nativeExecutionAuthorized:PECOS_ACQUISITION_POLICY.nativeExecutionAuthorized,
    approvedDownloadBudgetBytes:PECOS_ACQUISITION_POLICY.approvedDownloadBudgetBytes,
    dispatchAvailable:false,
    prerequisitesReady,
    policyMatches,
    retainedDocuments:documents,
    acquisitionReceiptReady:false,
    acquisitionReceiptStatus:'not-created-native-execution-held',
    nextAction:'A separately reviewed policy/version decision must authorize native execution and a nonzero download budget before app dispatch can be enrolled.',
  });
}
