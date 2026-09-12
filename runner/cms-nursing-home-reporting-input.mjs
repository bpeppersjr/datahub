import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {verifyCmsNursingHomeRecovery} from './cms-nursing-home-recovery.mjs';

const VERSION='cms-nursing-home-reporting-input@1.0.0';
const PIN=Object.freeze({schemaVersion:VERSION,manifestPath:'data/business-sources/cms-nursing-home-provider-information/recoveries/9fe3aa54-dd38-42be-b28e-b1d363300a45/manifest.json',manifestSha256:'89ee608067aa5b97833957b753be61003dc2efcfa22cfaedbb3b78f020396d7e'});
const ARTIFACT=Object.freeze({path:'selected.jsonl',bytes:30397131,sha256:'677b1dc7b294f72feb0d6a0803d27c9f0f074887e5b9c5a59a6837c87a2320d8',rows:14690,exportPolicy:'local-review-only'});
const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const TERRITORIES=['AS','GU','MP','PR','VI'];
const snapshots=new WeakSet();
const check=v=>{if(!v)throw Error('CMS nursing-home reporting input rejected.');};
function object(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));}
function dense(v,max){check(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1);for(let i=0;i<v.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'));}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function opts(v,keys){object(v,keys);check(v.signal===undefined||v.signal instanceof AbortSignal);v.signal?.throwIfAborted();}
export function validateCmsNursingHomeRetainedSelection(value){object(value,Object.keys(PIN));check(same(value,PIN));return {...PIN};}
function snapshot(input,evidence,native){dense(input,25000);check(input.length>0);const rows=structuredClone(input),ids=new Set(),sourceIds=new Set();for(const [i,r] of rows.entries()){
 check(r&&r.identifier?.type==='cms-certification-number'&&typeof r.identifier.value==='string'&&/^[A-Za-z0-9]{6}$/.test(r.identifier.value)&&r.identifier.raw===r.identifier.value&&!ids.has(r.identifier.value));ids.add(r.identifier.value);
 check(typeof r.sourceRecordId==='string'&&/^cms-pdc:4pq5-n9py:[a-f0-9]{64}:row:\d+$/.test(r.sourceRecordId)&&!sourceIds.has(r.sourceRecordId)&&r.provenance?.sourceRow===i+2&&r.sourceRecordId===`cms-pdc:4pq5-n9py:${r.provenance.csvSha256}:row:${i+2}`);sourceIds.add(r.sourceRecordId);
 const p=r.reportedAddress?.postal;check(r.reportedAddress?.addressVerified===false&&(r.reportedAddress.state===null||typeof r.reportedAddress.state==='string')&&p&&(p.zip5===null||(typeof p.zip5==='string'&&/^\d{5}$/.test(p.zip5)&&p.zip5!=='00000'))&&(p.zip4===null||(p.zip5!==null&&typeof p.zip4==='string'&&/^\d{4}$/.test(p.zip4))));
 check(r.npi===null&&r.parentCompany===null&&r.currentOperatingStatus===null&&r.sourceGeocode?.facilityPointEligible===false&&r.sourceGeocode.independentlyVerified===false&&r.sourceGeocode.coordinateReferenceSystem===null&&same(r.claims,{recordUnit:'publisher-nursing-home-directory-row',uniqueBusinessIdentityVerified:false,physicalCampusIdentityVerified:false,currentOperationsVerified:false,exportPolicy:'local-review-only'}));
 check(r.provenance.datasetId==='4pq5-n9py'&&r.provenance.policyProfile==='cms-nursing-home-acquisition@1.0.0'&&r.provenance.sourceProjectionVersion==='cms-nursing-home-prerequisite@1.0.1');
 check(same(r.publisherStatusAssertion,{value:'currently-active',basis:'publisher-dataset-description',sourceModified:r.provenance.sourceModified,sourceReleased:r.provenance.sourceReleased}));
 const tab=r.reportedAddress.street?.includes('\t')===true;check(same(r.reportedAddress.textQuality,{status:tab?'source-tab-preserved':'no-controls-observed',controlCodePoints:tab?['U+0009']:[],normalizationPerformed:false}));
 check(['publisher-estimate-quality-unspecified','publisher-zip-based-estimate','unresolved-footnote','missing-coordinates','invalid-coordinate-pair'].includes(r.sourceGeocode.status));
 }
 const result=freeze({schemaVersion:VERSION,evidence,verificationMode:native?'native-retained-recovery-replayed':'synthetic-fixture-only',nativeSourceVerified:native,rows});snapshots.add(result);return result;
}

/** Exact retained native source only: no fetch, acquisition, output or mutable source override. */
export async function loadCmsNursingHomeReportingInput(options={}){
 opts(options,['signal']);const {signal}=options,selectionPath=path.join(APP_ROOT,'config/cms-nursing-home-retained-selection.json'),selectionMeter={};
 validateCmsNursingHomeRetainedSelection(await readJson(selectionPath,10000,signal,selectionMeter));const manifestPath=path.join(APP_ROOT,PIN.manifestPath);
 const manifest=await verifyCmsNursingHomeRecovery(manifestPath,PIN.manifestSha256,{signal});check(manifest.claims.verificationMode==='retained-native-source-recovery'&&manifest.claims.nativeSourceRetainedEvidenceVerified===true&&manifest.claims.nativeTransportThisRun===false&&manifest.claims.historicalFailureRewritten===false&&manifest.source.runId==='ffb1fac4-4eb4-4ea4-b11c-875ebff4de41'&&manifest.source.rows===14690&&same(manifest.artifact,ARTIFACT));
 const file=path.join(path.dirname(manifestPath),'selected.jsonl'),meter={},rows=[];for await(const row of readLines(file,ARTIFACT.bytes,signal,meter)){check(rows.length<14690);rows.push(row);}check(rows.length===14690&&meter.bytes===ARTIFACT.bytes&&meter.sha256===ARTIFACT.sha256);
 const result=snapshot(rows,{...PIN,selectedArtifact:ARTIFACT,selectionSha256:selectionMeter.sha256,sourceDates:manifest.source.sourceDates,observedAt:manifest.source.sourceObservedAt,sourceFailedAt:manifest.source.failedAt,recoveryCreatedAt:manifest.createdAt,recoveryProjectionVersion:manifest.projectionVersion,failedSource:manifest.source,sourceReplayThisRead:true,nativeTransportThisRead:false,historicalFailureRewritten:false},true);
 await verifyCmsNursingHomeRecovery(manifestPath,PIN.manifestSha256,{signal});const finalMeter={};validateCmsNursingHomeRetainedSelection(await readJson(selectionPath,10000,signal,finalMeter));check(finalMeter.sha256===selectionMeter.sha256);signal?.throwIfAborted();return result;
}

/** Pure synthetic tests only; cannot produce a native evidence snapshot. */
export function cmsNursingHomeReportingFixture(input){return snapshot(input,{sourceReplayThisRead:false},false);}

/** Percentages are retained directory-cohort shares, never collection completeness. */
export function summarizeCmsNursingHomeReporting(input,options={}){
 check(snapshots.has(input));opts(options,['states','zip5s','signal']);for(const [key,pattern,max] of [['states',/^[A-Z]{2}$/,56],['zip5s',/^\d{5}$/,25000]])if(options[key]!==undefined){dense(options[key],max);check(options[key].every(v=>typeof v==='string'&&pattern.test(v)&&(key!=='zip5s'||v!=='00000'))&&new Set(options[key]).size===options[key].length);if(key==='states')check(options[key].every(v=>STATES.includes(v)||TERRITORIES.includes(v)));}
 const all=input.rows.length,stateDC=input.rows.filter(r=>STATES.includes(r.reportedAddress.state)).length,territory=input.rows.filter(r=>TERRITORIES.includes(r.reportedAddress.state)).length;
 const selected=input.rows.filter(r=>(options.states===undefined||options.states.includes(r.reportedAddress.state))&&(options.zip5s===undefined||options.zip5s.includes(r.reportedAddress.postal.zip5)));
 const groups=new Map(),coordinateQuality={};let missingZip=0,tabRows=0;for(const r of selected){options.signal?.throwIfAborted();coordinateQuality[r.sourceGeocode.status]=(coordinateQuality[r.sourceGeocode.status]??0)+1;if(r.reportedAddress.textQuality.status==='source-tab-preserved')tabRows++;const state=r.reportedAddress.state,zip5=r.reportedAddress.postal.zip5,key=JSON.stringify([state,zip5]);if(zip5===null)missingZip++;const g=groups.get(key)??{reportedState:state,reportedZip5:zip5,directoryRows:0};g.directoryRows++;groups.set(key,g);}
 const share=(n,d)=>d===0?null:n/d*100;
 const decorate=g=>({...g,percentOfAllRetainedDirectoryRows:share(g.directoryRows,all),percentOfRetainedStateDCDirectoryRows:STATES.includes(g.reportedState)?share(g.directoryRows,stateDC):null});
 const byState=new Map();for(const g of groups.values()){const entry=byState.get(g.reportedState)??{reportedState:g.reportedState,directoryRows:0};entry.directoryRows+=g.directoryRows;byState.set(g.reportedState,entry);}
 return freeze({schemaVersion:VERSION,verificationMode:input.verificationMode,nativeSourceVerified:input.nativeSourceVerified,evidence:input.evidence,recordUnit:'publisher-nursing-home-directory-row',denominators:{allRetainedDirectoryRows:all,stateDCRetainedDirectoryRows:stateDC,territoryRetainedDirectoryRows:territory,unknownReportedStateRows:all-stateDC-territory},filteredDirectoryRows:selected.length,filteredRowsMissingZip5:missingZip,filteredSourceTabRows:tabRows,filteredCoordinateQuality:coordinateQuality,eligibleFacilityPoints:0,states:[...byState.values()].map(decorate).sort((a,b)=>String(a.reportedState).localeCompare(String(b.reportedState))),stateZips:[...groups.values()].map(decorate).sort((a,b)=>JSON.stringify([a.reportedState,a.reportedZip5]).localeCompare(JSON.stringify([b.reportedState,b.reportedZip5]))),claims:{businessCount:null,physicalSiteCount:null,currentOperatingCount:null,nationalCompletenessPercent:null,geographicAssignmentPerformed:false,zip4Aggregated:false,publicExportAuthorized:false,exportPolicy:'local-review-only'}});
}
