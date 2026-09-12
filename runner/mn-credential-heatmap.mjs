import path from 'node:path';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {APP_ROOT} from './paths.mjs';
import {loadMnCredentialRegistryInput} from './mn-credential-registry-input.mjs';
import {aggregateCredentialCoverage,CREDENTIAL_COVERAGE_CATEGORIES as categories,CREDENTIAL_COVERAGE_STATES as states} from './credential-coverage.mjs';

const fail=()=>{throw Error('Minnesota credential heatmap input rejected.');};
const percent=(n,d)=>d?n/d*100:null;
const snapshots=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function options(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
    ||Reflect.ownKeys(value).some(key=>!keys.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))fail();
  if(value.signal!==undefined&&!(value.signal instanceof AbortSignal))fail();
}

/** Structural validation only. Does not authenticate retained source membership. */
export async function aggregateMnCredentialHeatmap(records,opts={}){
  options(opts,['signal']);const {signal}=opts;signal?.throwIfAborted();
  if(!Array.isArray(records)||Object.getPrototypeOf(records)!==Array.prototype||records.length>250000||Reflect.ownKeys(records).length!==records.length+1)fail();
  for(let i=0;i<records.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(records,String(i))??{},'value'))fail();
  const coverage=await aggregateCredentialCoverage(records,{signal}),groups=new Map();
  for(let i=0;i<records.length;i++){
    signal?.throwIfAborted();const {reported_address:address,credential}=records[i].record;
    // Only recognized display states escape into labels; arbitrary source strings do not.
    const state=states.includes(address.state)?address.state:null,key=JSON.stringify([state,address.zip_code]);
    if(!groups.has(key))groups.set(key,{state,zip5:address.zip_code,credentialRows:0,counts:new Map(categories.map(c=>[c,0]))});
    const group=groups.get(key);group.credentialRows++;group.counts.set(credential.category,group.counts.get(credential.category)+1);
    if(i%128===127)await yieldTurn(undefined,{signal});
  }
  const zips=[...groups.values()].sort((a,b)=>(a.state??'').localeCompare(b.state??'')||(a.zip5??'').localeCompare(b.zip5??'')).map(group=>{
    const stateRows=group.state===null?coverage.outside50DcOrUnresolvedRows:coverage.states.find(s=>s.state===group.state).credentialRows;
    return {state:group.state,zip5:group.zip5,credentialRows:group.credentialRows,
      percentOfAcceptedCohort:percent(group.credentialRows,coverage.allAcceptedCohortRows),percentOfReportedState:percent(group.credentialRows,stateRows),
      categories:categories.map(category=>({category,credentialRows:group.counts.get(category),
        categoryWithinZipGroup:percent(group.counts.get(category),group.credentialRows),
        percentOfAcceptedCohort:percent(group.counts.get(category),coverage.allAcceptedCohortRows)}))};
  });
  signal?.throwIfAborted();
  const result={schemaVersion:'mn-credential-heatmap@1.0.0',verificationMode:'structural-input-only',pins:null,
    recordUnit:coverage.recordUnit,acceptedCohortRows:coverage.allAcceptedCohortRows,national50DcRows:coverage.national50DcRows,
    outside50DcOrUnresolvedRows:coverage.outside50DcOrUnresolvedRows,missingZip5Rows:coverage.missingZip5Rows,
    existingZipViewMembership:'not-evaluated',rowsWithoutExistingZipView:null,
    states:coverage.states,zips,percentageDenominators:{...coverage.percentageDenominators,
      percentOfAcceptedCohort:'all accepted credential rows, including outside 50 states/DC or unresolved reported states',
      percentOfReportedState:'all accepted rows reporting this state; null-state uses the combined outside-50-states/DC-or-unresolved bucket',
      categoryWithinZipGroup:'all accepted rows in this reported-state and reported-ZIP5 group'},
    claims:{exportPolicy:'local-review-only',publicExportAuthorized:false,uniqueBusinessCount:null,physicalSiteCount:null,
      geographicAssignmentPerformed:false,zipPolygonMembershipEstablished:false,nationalCompletenessPercent:null,historicalSourceNationalReportingIntegrated:false}};
  snapshots.add(result);return freeze(result);
}

/** One explicit full retained verification per build. No cache, writes or network. */
export async function buildMnCredentialHeatmap(opts={}){
  options(opts,['selection','signal']);
  if(opts.selection!=='config/mn-credential-registry-selection.json')fail();
  opts.signal?.throwIfAborted();
  const input=await loadMnCredentialRegistryInput(path.join(APP_ROOT,opts.selection),{signal:opts.signal});
  const aggregate=await aggregateMnCredentialHeatmap(input.records,{signal:opts.signal});
  const result={...aggregate,verificationMode:'verified-retained-snapshot',pins:{selectionPath:input.selection.path,selectionSha256:input.selection.sha256,
    reportingReleaseId:input.source.release_id,reportingManifestSha256:input.source.manifest_sha256,credentialArtifactSha256:input.source.artifact_sha256,
    reportingCreatedAt:input.source.created_at,sourceObservedAt:input.records[0]?.record.provenance.observed_at??null}};
  opts.signal?.throwIfAborted();snapshots.add(result);return freeze(result);
}

/** Reuse only a same-process immutable snapshot. Filters never recompute denominators. */
export function selectMnCredentialHeatmap(snapshot,filters={}){
  options(filters,['state','category']);if(!snapshots.has(snapshot))fail();
  const {state,category}=filters;
  if(state!==undefined&&!states.includes(state)||category!==undefined&&!categories.includes(category))fail();
  const stateRows=snapshot.states.filter(row=>state===undefined||row.state===state).map(row=>({...row,categories:row.categories.filter(cell=>category===undefined||cell.category===category),heatValue:category===undefined?row.credentialRows:row.categories.find(c=>c.category===category).credentialRows}));
  const zipRows=snapshot.zips.filter(row=>state===undefined||row.state===state).map(row=>({...row,categories:row.categories.filter(cell=>category===undefined||cell.category===category),heatValue:category===undefined?row.credentialRows:row.categories.find(c=>c.category===category).credentialRows}));
  return freeze({...snapshot,selection:{state:state??null,category:category??null},states:stateRows,zips:zipRows,
    selectedCredentialRows:zipRows.reduce((n,row)=>n+row.heatValue,0),filteredOutCredentialRows:snapshot.acceptedCohortRows-zipRows.reduce((n,row)=>n+row.heatValue,0)});
}
