import { setImmediate as yieldTurn } from 'node:timers/promises';
import { validateMnConstructionCredentialReporting } from './mn-construction-credential-reporting.mjs';

export const CREDENTIAL_COVERAGE_VERSION = 'credential-coverage@1.0.0';
export const CREDENTIAL_COVERAGE_STATES = Object.freeze('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
export const CREDENTIAL_COVERAGE_CATEGORIES = Object.freeze([
  'construction-contractor-registration',
  'residential-building-contractor',
  'residential-remodeler',
  'residential-roofer',
  'manufactured-home-installer',
]);
const fail=()=>{throw new Error('Credential coverage input rejected.');};
const percent=(numerator,denominator)=>denominator===0?null:numerator/denominator*100;
const bucket=()=>({credentialRows:0,missingZip5Rows:0,categories:new Map(CREDENTIAL_COVERAGE_CATEGORIES.map(category=>[category,0]))});

/** Local aggregation only. The caller must verify retained membership and source
 * policy; structural row validation is not source authentication or publication.
 * "National" below means the 50-state/DC subset of the supplied cohort only. */
export async function aggregateCredentialCoverage(reportingRows,options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(key=>key!=='signal'||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))fail();
  const {signal}=options;
  if(signal!==undefined&&!(signal instanceof AbortSignal))fail();
  signal?.throwIfAborted();
  if(!reportingRows||typeof reportingRows==='string'||typeof reportingRows[Symbol.asyncIterator]!=='function'&&typeof reportingRows[Symbol.iterator]!=='function')fail();
  const states=new Map(CREDENTIAL_COVERAGE_STATES.map(state=>[state,bucket()]));
  const outside=bucket(),national=bucket(),seen=new Set();let total=0,missing=0;
  for await(const reporting of reportingRows) {
    signal?.throwIfAborted();
    validateMnConstructionCredentialReporting(reporting);
    if(seen.has(reporting.reporting_id)||total>=250000)fail();
    seen.add(reporting.reporting_id);total++;
    const record=reporting.record,category=record.credential.category;
    if(!national.categories.has(category))fail();
    const state=states.get(record.reported_address.state),destination=state??outside;
    destination.credentialRows++;
    destination.categories.set(category,destination.categories.get(category)+1);
    if(state){national.credentialRows++;national.categories.set(category,national.categories.get(category)+1);}
    if(record.reported_address.zip_code===null){missing++;destination.missingZip5Rows++;if(state)national.missingZip5Rows++;}
    if(total%128===0)await yieldTurn(undefined,{signal});
  }
  signal?.throwIfAborted();
  return {
    schemaVersion:CREDENTIAL_COVERAGE_VERSION,recordUnit:'publisher-business-credential-row',
    allAcceptedCohortRows:total,national50DcRows:national.credentialRows,outside50DcOrUnresolvedRows:outside.credentialRows,
    missingZip5Rows:missing,nationalMissingZip5Rows:national.missingZip5Rows,outsideMissingZip5Rows:outside.missingZip5Rows,
    nationalCompletenessPercent:null,uniqueBusinessCount:null,physicalSiteCount:null,
    geographicAssignmentInferred:false,publicExportAuthorized:false,nationalReportingIntegrated:false,
    percentageDenominators:{categoryWithinState:'all supplied credential rows reporting this state',stateShareOfCategory:'all supplied credential rows in this category reporting one of the 50 states or DC',stateShareOfNationalCohort:'all supplied credential rows reporting one of the 50 states or DC',zeroDenominator:null},
    categories:CREDENTIAL_COVERAGE_CATEGORIES.map(category=>({category,credentialRows:national.categories.get(category)})),
    states:[...states].map(([state,value])=>({state,credentialRows:value.credentialRows,missingZip5Rows:value.missingZip5Rows,
      stateShareOfNationalCohort:percent(value.credentialRows,national.credentialRows),
      cohortObservation:value.credentialRows?'observed-positive':'observed-zero',businessCoverage:'unknown',
      categories:CREDENTIAL_COVERAGE_CATEGORIES.map(category=>({category,credentialRows:value.categories.get(category),
        categoryWithinState:percent(value.categories.get(category),value.credentialRows),
        stateShareOfCategory:percent(value.categories.get(category),national.categories.get(category))}))})),
    outside50DcOrUnresolved:{credentialRows:outside.credentialRows,missingZip5Rows:outside.missingZip5Rows,
      categories:CREDENTIAL_COVERAGE_CATEGORIES.map(category=>({category,credentialRows:outside.categories.get(category)}))},
  };
}
