import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {verifyCmsHospitalAcquisition} from './cms-hospital-acquisition.mjs';

const VERSION='cms-hospital-reporting-input@1.0.0';
const PIN=Object.freeze({schemaVersion:VERSION,manifestPath:'data/business-sources/cms-hospital-general-information/jobs/7140acea-6dfb-478e-8769-5dd991bc1875/manifest.json',manifestSha256:'856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239'});
const ARTIFACT=Object.freeze({path:'selected.jsonl',bytes:7651883,sha256:'30cb62fac6c3c9a52e9cdba31423a138b65945beb8321cb48f3825f8506bb979',exportPolicy:'local-review-only'});
const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const TERRITORIES=['AS','GU','MP','PR','VI'];
const snapshots=new WeakSet();
const check=v=>{if(!v)throw Error('CMS hospital reporting input rejected.');};
function object(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));}
function dense(v,max){check(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1);for(let i=0;i<v.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'));}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function opts(v,keys){object(v,keys);check(v.signal===undefined||v.signal instanceof AbortSignal);v.signal?.throwIfAborted();}
export function validateCmsHospitalRetainedSelection(value){object(value,Object.keys(PIN));check(same(value,PIN));return {...PIN};}
function snapshot(input,evidence,native){dense(input,25000);check(input.length>0);const rows=structuredClone(input),ids=new Set(),sourceIds=new Set();for(const [i,r] of rows.entries()){
 check(r&&r.identifier?.type==='cms-pdc-hospital-facility-id'&&typeof r.identifier.value==='string'&&/^[A-Za-z0-9]{6}$/.test(r.identifier.value)&&r.identifier.raw===r.identifier.value&&!ids.has(r.identifier.value));ids.add(r.identifier.value);
 check(typeof r.sourceRecordId==='string'&&/^cms-pdc:xubh-q36u:[a-f0-9]{64}:row:\d+$/.test(r.sourceRecordId)&&!sourceIds.has(r.sourceRecordId)&&r.provenance?.sourceRow===i+2&&r.sourceRecordId===`cms-pdc:xubh-q36u:${r.provenance.csvSha256}:row:${i+2}`);sourceIds.add(r.sourceRecordId);
 const p=r.reportedAddress?.postal;check(r.reportedAddress?.addressVerified===false&&(r.reportedAddress.state===null||typeof r.reportedAddress.state==='string')&&p&&(p.zip5===null||(typeof p.zip5==='string'&&/^\d{5}$/.test(p.zip5)&&p.zip5!=='00000'))&&(p.zip4===null||(p.zip5!==null&&typeof p.zip4==='string'&&/^\d{4}$/.test(p.zip4))));
 check(r.npi===null&&r.parentCompany===null&&r.currentOperatingStatus===null&&same(r.geocode,{latitude:null,longitude:null})&&same(r.claims,{recordUnit:'publisher-hospital-facility-directory-row',uniqueBusinessIdentityVerified:false,physicalCampusIdentityVerified:false,currentOperationsVerified:false,exportPolicy:'local-review-only'}));
 check(r.provenance.datasetId==='xubh-q36u'&&r.provenance.policyProfile==='cms-hospital-acquisition@1.0.0');
 }
 const result=freeze({schemaVersion:VERSION,evidence,verificationMode:native?'native-retained-source-replayed':'synthetic-fixture-only',nativeSourceVerified:native,rows});snapshots.add(result);return result;
}

/** Exact retained native source only: no fetch, acquisition, output or mutable source override. */
export async function loadCmsHospitalReportingInput(options={}){
 opts(options,['signal']);const {signal}=options,selectionPath=path.join(APP_ROOT,'config/cms-hospital-retained-selection.json'),selectionMeter={};
 validateCmsHospitalRetainedSelection(await readJson(selectionPath,10000,signal,selectionMeter));const manifestPath=path.join(APP_ROOT,PIN.manifestPath);
 const manifest=await verifyCmsHospitalAcquisition(manifestPath,PIN.manifestSha256,{signal});check(manifest.executionMode==='native-fixed-fetch'&&manifest.sourceRows===5419&&same(manifest.artifacts.find(a=>a.path==='selected.jsonl'),ARTIFACT));
 const file=path.join(path.dirname(manifestPath),'selected.jsonl'),meter={},rows=[];for await(const row of readLines(file,ARTIFACT.bytes,signal,meter)){check(rows.length<5419);rows.push(row);}check(rows.length===5419&&meter.bytes===ARTIFACT.bytes&&meter.sha256===ARTIFACT.sha256);
 const result=snapshot(rows,{...PIN,selectedArtifact:ARTIFACT,selectionSha256:selectionMeter.sha256,sourceDates:manifest.sourceDates,observedAt:manifest.createdAt,acquisitionCompletedAt:manifest.completedAt,sourceReplayThisRead:true},true);
 await verifyCmsHospitalAcquisition(manifestPath,PIN.manifestSha256,{signal});const finalMeter={};validateCmsHospitalRetainedSelection(await readJson(selectionPath,10000,signal,finalMeter));check(finalMeter.sha256===selectionMeter.sha256);signal?.throwIfAborted();return result;
}

/** Pure synthetic tests only; cannot produce a native evidence snapshot. */
export function cmsHospitalReportingFixture(input){return snapshot(input,{sourceReplayThisRead:false},false);}

/** Percentages are retained directory-cohort shares, never collection completeness. */
export function summarizeCmsHospitalReporting(input,options={}){
 check(snapshots.has(input));opts(options,['states','zip5s','signal']);for(const [key,pattern,max] of [['states',/^[A-Z]{2}$/,56],['zip5s',/^\d{5}$/,25000]])if(options[key]!==undefined){dense(options[key],max);check(options[key].every(v=>typeof v==='string'&&pattern.test(v)&&(key!=='zip5s'||v!=='00000'))&&new Set(options[key]).size===options[key].length);if(key==='states')check(options[key].every(v=>STATES.includes(v)||TERRITORIES.includes(v)));}
 const all=input.rows.length,stateDC=input.rows.filter(r=>STATES.includes(r.reportedAddress.state)).length,territory=input.rows.filter(r=>TERRITORIES.includes(r.reportedAddress.state)).length;
 const selected=input.rows.filter(r=>(options.states===undefined||options.states.includes(r.reportedAddress.state))&&(options.zip5s===undefined||options.zip5s.includes(r.reportedAddress.postal.zip5)));
 const groups=new Map();let missingZip=0;for(const r of selected){options.signal?.throwIfAborted();const state=r.reportedAddress.state,zip5=r.reportedAddress.postal.zip5,key=JSON.stringify([state,zip5]);if(zip5===null)missingZip++;const g=groups.get(key)??{reportedState:state,reportedZip5:zip5,directoryRows:0};g.directoryRows++;groups.set(key,g);}
 const share=(n,d)=>d===0?null:n/d*100;
 const decorate=g=>({...g,percentOfAllRetainedDirectoryRows:share(g.directoryRows,all),percentOfRetainedStateDCDirectoryRows:STATES.includes(g.reportedState)?share(g.directoryRows,stateDC):null});
 const byState=new Map();for(const g of groups.values()){const entry=byState.get(g.reportedState)??{reportedState:g.reportedState,directoryRows:0};entry.directoryRows+=g.directoryRows;byState.set(g.reportedState,entry);}
 return freeze({schemaVersion:VERSION,verificationMode:input.verificationMode,nativeSourceVerified:input.nativeSourceVerified,evidence:input.evidence,recordUnit:'publisher-hospital-facility-directory-row',denominators:{allRetainedDirectoryRows:all,stateDCRetainedDirectoryRows:stateDC,territoryRetainedDirectoryRows:territory,unknownReportedStateRows:all-stateDC-territory},filteredDirectoryRows:selected.length,filteredRowsMissingZip5:missingZip,states:[...byState.values()].map(decorate).sort((a,b)=>String(a.reportedState).localeCompare(String(b.reportedState))),stateZips:[...groups.values()].map(decorate).sort((a,b)=>JSON.stringify([a.reportedState,a.reportedZip5]).localeCompare(JSON.stringify([b.reportedState,b.reportedZip5]))),claims:{businessCount:null,physicalSiteCount:null,currentOperatingCount:null,nationalCompletenessPercent:null,geographicAssignmentPerformed:false,zip4Aggregated:false,publicExportAuthorized:false,exportPolicy:'local-review-only'}});
}
