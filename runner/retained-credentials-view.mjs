import { loadMnConstructionReportingEnrollment } from './mn-construction-reporting-enrollment.mjs';
import { loadCredentialCoverageEnrollment } from './credential-coverage-enrollment.mjs';
import { CREDENTIAL_COVERAGE_CATEGORIES } from './credential-coverage.mjs';
const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const invalid=()=>{throw Object.assign(Error('Invalid retained credential filters.'),{statusCode:400});};
export function createRetainedCredentialsView({loader=loadMnConstructionReportingEnrollment,coverageLoader=loadCredentialCoverageEnrollment}={}) {
  let pending,coveragePending;
  return {async get(params=new URLSearchParams()) {
    for(const key of params.keys())if(!['state','offset','limit','view','category'].includes(key)||params.getAll(key).length!==1)invalid();
    const mode=params.get('view')??'postal',category=params.get('category')??'';
    if(!['postal','categories'].includes(mode) || category && !CREDENTIAL_COVERAGE_CATEGORIES.includes(category) || mode==='postal' && params.has('category'))invalid();
    const state=params.get('state')??'',offsetText=params.get('offset')??'0',limitText=params.get('limit')??'25';
    if(state && !STATES.includes(state) || !/^\d{1,7}$/.test(offsetText) || !/^\d{1,3}$/.test(limitText))invalid();
    const offset=Number(offsetText),limit=Number(limitText);if(limit<1||limit>100)invalid();
    if(mode==='categories'){
      coveragePending??=Promise.resolve().then(()=>coverageLoader()).finally(()=>{coveragePending=null;});let enrollment;
      try{enrollment=await coveragePending;}catch{throw Object.assign(Error('Retained credential reporting could not be verified. No source request was made.'),{statusCode:503});}
      if(enrollment.status!=='available')return {available:false,status:enrollment.status,view:mode,category,records:[],state,offset,limit};
      const {coverage,summary,evidence}=enrollment;
      const selected=coverage.states.filter(row=>!state || row.state===state).sort((a,b)=>b.credentialRows-a.credentialRows||a.state.localeCompare(b.state));
      const records=selected.flatMap(row=>row.categories.filter(cell=>!category || cell.category===category).map(cell=>({
        state:row.state,category:cell.category,credentialRows:cell.credentialRows,categoryWithinState:cell.categoryWithinState,
        stateShareOfCategory:cell.stateShareOfCategory,stateShareOfNationalCohort:row.stateShareOfNationalCohort,
        cohortObservation:row.cohortObservation,businessCoverage:row.businessCoverage})));
      return {available:true,status:'verified-retained-credential-coverage',view:mode,category,
        sourceLabel:'Minnesota residential contractor credentials',publisherJurisdiction:'MN',
        acceptedCohortRows:coverage.allAcceptedCohortRows,sourceRows:summary.source_row_dispositions.source_records,
        rejectedRows:summary.source_row_dispositions.rejected_records,missingZip5Rows:coverage.missingZip5Rows,
        national50DcRows:coverage.national50DcRows,outside50DcOrUnresolvedRows:coverage.outside50DcOrUnresolvedRows,
        stateRows:state?selected[0]?.credentialRows??0:null,observedAt:summary.provenance.observed_at,
        sourceReleaseId:summary.provenance.source_release_id,receiptSha256:summary.provenance.app_receipt_sha256,
        reportingReleaseId:evidence.reportingReleaseId,reportingManifestSha256:evidence.reportingManifestSha256,
        nationalReportingIntegrated:false,uniqueActiveBusinessCount:null,physicalSiteCount:null,nationalCompletenessPercent:null,registrationsCohortIncluded:false,
        percentageDenominators:coverage.percentageDenominators,availableStates:[...STATES],availableCategories:[...CREDENTIAL_COVERAGE_CATEGORIES],
        state,offset,limit,total:records.length,records:records.slice(offset,offset+limit)};
    }
    // Coalesce concurrent local verification only; do not cache stale evidence.
    pending??=Promise.resolve().then(()=>loader()).finally(()=>{pending=null;});let enrollment;
    try{enrollment=await pending;}catch{throw Object.assign(Error('Retained credential evidence could not be verified. No source request was made.'),{statusCode:503});}
    if(enrollment.status!=='available')return {available:false,status:enrollment.status,records:[],state,offset,limit};
    const summary=enrollment.summary;
    const stateEntry=summary.by_reported_state.find(x=>x.state===state);
    const records=state?summary.by_reported_zip5.filter(x=>x.state===state).map(x=>({state:x.state,zip5:x.zip5,credentialRows:x.credential_rows,percentOfCohort:summary.accepted_credential_rows?x.credential_rows/summary.accepted_credential_rows*100:null}))
      :summary.by_reported_state.map(x=>({state:x.state,zip5:null,credentialRows:x.credential_rows,percentOfCohort:x.percent_of_this_accepted_cohort}));
    return {available:true,status:'verified-retained-cohort',sourceLabel:'Minnesota residential contractor credentials',publisherJurisdiction:'MN',
      acceptedCohortRows:summary.accepted_credential_rows,sourceRows:summary.source_row_dispositions.source_records,
      rejectedRows:summary.source_row_dispositions.rejected_records,missingZip5Rows:summary.rows_without_reported_zip5,
      stateRows:state?stateEntry?.credential_rows??0:null,observedAt:summary.provenance.observed_at,
      sourceReleaseId:summary.provenance.source_release_id,receiptSha256:summary.provenance.app_receipt_sha256,
      nationalReportingIntegrated:false,uniqueActiveBusinessCount:null,physicalSiteCount:null,registrationsCohortIncluded:false,
      percentageDenominator:'All accepted credential rows in this retained cohort, not all US businesses',
      availableStates:[...STATES],state,offset,limit,total:records.length,records:records.slice(offset,offset+limit)};
  }};
}
