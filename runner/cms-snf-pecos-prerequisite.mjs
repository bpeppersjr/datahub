import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {parse} from 'csv-parse';

const VERSION='cms-snf-pecos-offline@1.0.0';
const fail=()=>{throw Error('CMS SNF PECOS offline contract rejected.');};
const check=v=>{if(!v)fail();};
const sha=v=>createHash('sha256').update(v).digest('hex');
const snapshots=new WeakSet(),directories=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const claims=()=>({verificationMode:'dictionary-driven-caller-supplied-conformance',sourceTransportVerified:false,nativeSchemaObserved:false,acquisitionReady:false,publicExportAuthorized:false,currentOperationsVerified:false,uniqueBusinessCount:null,physicalSiteCount:null,canonicalParent:null});
export const CMS_SNF_PECOS_HEADERS=freeze({
 enrollments:['ENROLLMENT ID','ASSOCIATE ID','CCN','NPI','MULTIPLE NPI FLAG','PROVIDER TYPE CODE','INCORPORATION DATE','AFFILIATION ENTITY ID','AFFILIATION ENTITY NAME'],
 owners:['ENROLLMENT ID','ASSOCIATE ID','ASSOCIATE ID - OWNER','TYPE - OWNER','ROLE CODE - OWNER','ROLE TEXT - OWNER','ASSOCIATION DATE - OWNER','ORGANIZATION NAME - OWNER','DOING BUSINESS AS NAME - OWNER','PERCENTAGE OWNERSHIP','PARENT COMPANY - OWNER','OWNED BY ANOTHER ORG OR IND - OWNER'],
 additionalNpis:['ENROLLMENT ID','NPI'],
});
export const CMS_SNF_PECOS_OFFLINE_POLICY=freeze({profile:VERSION,source:'CMS PECOS SNF public-use documentation',mode:'offline-only',networkRequests:0,approvedDownloadBudgetBytes:0,acquisitionReady:false,nativeDistributionPins:null,nativeSchemaObserved:false,rawExportPolicy:'internal',selectedExportPolicy:'local-review-only',publicExportAuthorized:false,individualOwnerFieldsSelected:false,ownerAddressesSelected:false,attribution:'Centers for Medicare & Medicaid Services (CMS)',governmentEndorsement:false,limits:{csvBytesPerInput:8388608,rowsPerInput:10000,directoryRows:25000,headerColumns:128,recordCharacters:65536,linkReferences:100000},dictionarySha256:{enrollments:'7f46e9e96daa6100f45853bdc34562cf69b12a3aa88a71862a5c615a7793b8ee',owners:'e118657f67562954010214357da361298e0f7bccf33105983050e7d3f769bb37',guidance:'02215a54a5af76be484f18e53d8ba54b56463073543d4f2ebc3e01916959e1fd'}});
function object(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));}
function opts(v,keys){object(v,keys);check(v.signal===undefined||v.signal instanceof AbortSignal);v.signal?.throwIfAborted();}
function dense(v,max){check(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1);for(let i=0;i<v.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'));}
function text(v,max=512){check(typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v));return v;}
function identifier(raw,type,pattern,max,required=false){text(raw,max);const valid=pattern.test(raw);check(!required||valid);return {type,raw,value:valid?raw:null,status:raw===''?'missing':valid?'syntax-only':'unresolved-source-format'};}
const enrollment=raw=>identifier(raw,'pecos-enrollment-id',/^[A-Za-z0-9]{15}$/,15,true);
const pac=raw=>identifier(raw,'pecos-associate-control-id',/^\d{10}$/,10);
const npi=raw=>identifier(raw,'npi',/^\d{10}$/,10);
const ccn=raw=>identifier(raw,'cms-certification-number',/^[A-Za-z0-9]{6}$/,15);
function flag(raw,allowed=['Y','N']){text(raw,16);return {raw,value:allowed.includes(raw)?raw==='Y':null,status:raw===''?'not-reported':allowed.includes(raw)?'reported':'unresolved-source-format'};}
function date(raw){text(raw,128);return {raw,parsed:null,status:raw===''?'missing':'unverified-source-date-format'};}
function project(kind,get,sourceRecordId,sourceRow){const base={sourceRecordId,sourceRow,enrollmentId:enrollment(get('ENROLLMENT ID'))};
 if(kind==='enrollments')return {...base,associateId:pac(get('ASSOCIATE ID')),ccn:ccn(get('CCN')),npi:npi(get('NPI')),multipleNpi:flag(get('MULTIPLE NPI FLAG')),providerTypeRaw:text(get('PROVIDER TYPE CODE'),32),incorporationDate:date(get('INCORPORATION DATE')),affiliation:{type:'pecos-publisher-affiliation-id',raw:text(get('AFFILIATION ENTITY ID'),64),nameRaw:text(get('AFFILIATION ENTITY NAME'))}};
 if(kind==='additionalNpis')return {...base,npi:npi(get('NPI'))};
 const ownerType=text(get('TYPE - OWNER'),16);
 // Never project personal names/titles, addresses, or even opaque individual PACs.
 if(ownerType!=='O')return {sourceRecordId,sourceRow,projection:'excluded-owner-row',reason:ownerType==='I'?'individual-owner':'unknown-owner-type',ownerTypeRaw:ownerType};
 const percentageRaw=text(get('PERCENTAGE OWNERSHIP'),128),percentage=/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(percentageRaw)?Number(percentageRaw):null;
 return {...base,projection:'organization-owner-relation',associateId:pac(get('ASSOCIATE ID')),ownerAssociateId:pac(get('ASSOCIATE ID - OWNER')),ownerTypeRaw:ownerType,roleCodeRaw:text(get('ROLE CODE - OWNER'),16),roleTextRaw:text(get('ROLE TEXT - OWNER')),associationDate:date(get('ASSOCIATION DATE - OWNER')),organizationNameRaw:text(get('ORGANIZATION NAME - OWNER')),doingBusinessAsNameRaw:text(get('DOING BUSINESS AS NAME - OWNER')),percentage:{raw:percentageRaw,value:percentage!==null&&percentage>=0&&percentage<=100?percentage:null,status:percentageRaw===''?'missing':percentage!==null&&percentage>=0&&percentage<=100?'reported-unverified':'unresolved-source-format'},parentCompanyFlag:flag(get('PARENT COMPANY - OWNER')),ownedByAnotherFlag:flag(get('OWNED BY ANOTHER ORG OR IND - OWNER')),canonicalParent:null};
}

/** Bytes are caller supplied. No fetch, metadata inference, native issuance or artifact publication. */
export async function inspectCmsSnfPecosCsv(kind,value,options={}){
 opts(options,['signal','referencePeriodRaw']);check(Object.hasOwn(CMS_SNF_PECOS_HEADERS,kind));text(options.referencePeriodRaw,128);check(Buffer.isBuffer(value)&&value.length>0&&value.length<=CMS_SNF_PECOS_OFFLINE_POLICY.limits.csvBytesPerInput);
 const raw=Buffer.from(value),hash=sha(raw),{signal}=options,decoder=new TextDecoder('utf-8',{fatal:true});let content='';
 for(let i=0;i<raw.length;i+=65536){content+=decoder.decode(raw.subarray(i,i+65536),{stream:true});await yieldTurn(undefined,{signal});}content+=decoder.decode();
 const parser=Readable.from([content]).pipe(parse({bom:true,relax_column_count:false,skip_empty_lines:false,max_record_size:65536})),abort=()=>parser.destroy(signal.reason),rows=[];let header=null;
 signal?.addEventListener('abort',abort,{once:true});
 try{for await(const values of parser){signal?.throwIfAborted();if(!header){check(values.length<=128&&new Set(values).size===values.length);values.forEach(v=>{text(v,256);check(v.length>0);});header=new Map(values.map((v,i)=>[v,i]));check(CMS_SNF_PECOS_HEADERS[kind].every(h=>header.has(h)));continue;}
   check(rows.length<10000);const sourceRow=rows.length+2,get=k=>values[header.get(k)];rows.push(project(kind,get,`cms-pecos:${kind}:${hash}:row:${sourceRow}`,sourceRow));if(rows.length%128===0)await yieldTurn(undefined,{signal});}
  check(header);signal?.throwIfAborted();
 }catch{signal?.throwIfAborted();fail();}finally{signal?.removeEventListener('abort',abort);parser.destroy();}
 const result=freeze({schemaVersion:VERSION,kind,referencePeriodRaw:options.referencePeriodRaw,sourceArtifactSha256:hash,sourceBytes:raw.length,sourceRows:rows.length,selectedHeaderCount:CMS_SNF_PECOS_HEADERS[kind].length,unselectedHeaderCount:header.size-CMS_SNF_PECOS_HEADERS[kind].length,rows,...claims()});snapshots.add(result);return result;
}

/** Directory projection is explicitly caller-supplied, not the native recovery verifier. */
export function inspectCmsSnfDirectoryLinkRows(rows,options){opts(options,['sourceArtifactSha256','referencePeriodRaw','signal']);check(typeof options.sourceArtifactSha256==='string'&&/^[a-f0-9]{64}$/.test(options.sourceArtifactSha256));text(options.referencePeriodRaw,128);dense(rows,25000);const seen=new Set();const selected=rows.map(r=>{object(r,['sourceRow','ccnRaw']);check(Number.isSafeInteger(r.sourceRow)&&r.sourceRow>=2&&!seen.has(r.sourceRow));seen.add(r.sourceRow);return {sourceRecordId:`cms-directory:${options.sourceArtifactSha256}:row:${r.sourceRow}`,sourceRow:r.sourceRow,ccn:ccn(r.ccnRaw)};});const result=freeze({schemaVersion:VERSION,sourceArtifactSha256:options.sourceArtifactSha256,referencePeriodRaw:options.referencePeriodRaw,rows:selected,...claims()});directories.add(result);return result;}

/** Links only exact CCNs and enrollment IDs. Relationship rows are never collapsed. */
export async function linkCmsSnfPecos(directory,enrollments,owners,additionalNpis=null,options={}){
 opts(options,['signal']);const {signal}=options;check(directories.has(directory)&&snapshots.has(enrollments)&&enrollments.kind==='enrollments'&&snapshots.has(owners)&&owners.kind==='owners'&&(additionalNpis===null||snapshots.has(additionalNpis)&&additionalNpis.kind==='additionalNpis'));
 const byCcn=new Map(),byEnrollment=new Map();let refs=0;const add=(map,key,row)=>{if(key===null)return;const list=map.get(key)??[];list.push(row);map.set(key,list);};
 for(const r of enrollments.rows){add(byCcn,r.ccn.value,r);add(byEnrollment,r.enrollmentId.value,r);}
 const directoryLinks=[],linkedEnrollment=new Set();for(const r of directory.rows){const matches=r.ccn.value===null?[]:byCcn.get(r.ccn.value)??[];refs+=matches.length;check(refs<=100000);for(const e of matches)linkedEnrollment.add(e.sourceRecordId);directoryLinks.push({directoryRecordId:r.sourceRecordId,ccn:r.ccn,enrollmentRecordIds:matches.map(e=>e.sourceRecordId),status:matches.length===0?'unlinked':matches.length===1?'single-enrollment':'multiple-enrollments'});if(directoryLinks.length%128===0)await yieldTurn(undefined,{signal});}
 const ownerLinks=[],npis=[],excludedOwnerCounts={individual:0,unknownType:0};let duplicateOwnerRows=0;const relationKeys=new Set();
 for(const r of owners.rows){if(r.projection==='excluded-owner-row'){excludedOwnerCounts[r.reason==='individual-owner'?'individual':'unknownType']++;continue;}const matches=byEnrollment.get(r.enrollmentId.value)??[];refs+=matches.length;check(refs<=100000);const signature=JSON.stringify({...r,sourceRecordId:null,sourceRow:null});if(relationKeys.has(signature))duplicateOwnerRows++;relationKeys.add(signature);ownerLinks.push({relation:r,enrollmentRecordIds:matches.map(e=>e.sourceRecordId),status:matches.length===0?'orphan':matches.length===1?'linked':'ambiguous-enrollment-id',providerPacStatus:matches.length===0?'unresolved':r.associateId.value===null||matches.some(e=>e.associateId.value===null)?'unknown':matches.every(e=>e.associateId.value===r.associateId.value)?'agrees':'contradiction'});if(ownerLinks.length%128===0)await yieldTurn(undefined,{signal});}
 const additionalByEnrollment=new Map();for(const r of additionalNpis?.rows??[]){add(additionalByEnrollment,r.enrollmentId.value,r);const matches=byEnrollment.get(r.enrollmentId.value)??[];refs+=matches.length;check(refs<=100000);npis.push({source:r,origin:'additional-npi-file',enrollmentRecordIds:matches.map(e=>e.sourceRecordId),status:matches.length===0?'orphan':matches.length===1?'linked':'ambiguous-enrollment-id'});if(npis.length%128===0)await yieldTurn(undefined,{signal});}
 const npiCoverage=enrollments.rows.map(r=>{const extra=additionalByEnrollment.get(r.enrollmentId.value)??[];return {enrollmentRecordId:r.sourceRecordId,baseNpi:r.npi,additionalNpiRecordIds:extra.map(x=>x.sourceRecordId),status:additionalNpis===null?'companion-not-supplied':r.multipleNpi.raw==='Y'&&!extra.length?'flag-without-companion-rows':r.multipleNpi.raw==='N'&&extra.length?'flag-contradiction':r.multipleNpi.value===null?'unknown-multiple-npi-flag':'companion-replayed-syntactically',allNativeNpisVerified:false};});
 signal?.throwIfAborted();const linked=directoryLinks.filter(r=>r.enrollmentRecordIds.length>0).length,periods=[directory,enrollments,owners,...(additionalNpis?[additionalNpis]:[])].map(s=>s.referencePeriodRaw);
 return freeze({schemaVersion:VERSION,sourcePins:{directory:directory.sourceArtifactSha256,enrollments:enrollments.sourceArtifactSha256,owners:owners.sourceArtifactSha256,additionalNpis:additionalNpis?.sourceArtifactSha256??null},referencePeriodsRaw:periods,dateAlignment:periods.some(p=>p==='')?'unknown':new Set(periods).size===1?'equal-raw-labels-not-date-verification':'different-raw-labels',directoryLinks,organizationOwnerLinks:ownerLinks,additionalNpiLinks:npis,npiCoverage,counts:{directoryRows:directory.rows.length,linkedDirectoryRows:linked,unlinkedDirectoryRows:directory.rows.length-linked,multiEnrollmentDirectoryRows:directoryLinks.filter(r=>r.enrollmentRecordIds.length>1).length,enrollmentRows:enrollments.sourceRows,distinctEnrollmentIds:byEnrollment.size,duplicateEnrollmentIdRows:enrollments.sourceRows-byEnrollment.size,pecosOnlyEnrollmentRows:enrollments.sourceRows-linkedEnrollment.size,ownerRows:owners.sourceRows,organizationOwnerRows:ownerLinks.length,individualOwnerRows:excludedOwnerCounts.individual,unknownTypeOwnerRows:excludedOwnerCounts.unknownType,duplicateOrganizationRelationRows:duplicateOwnerRows,orphanOrganizationRelationRows:ownerLinks.filter(r=>r.status==='orphan').length,additionalNpiRows:additionalNpis?.sourceRows??null,linkReferences:refs},...claims()});
}
