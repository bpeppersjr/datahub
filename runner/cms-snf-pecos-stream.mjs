import {parse} from 'csv-parse';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {CMS_SNF_PECOS_HEADERS as HEADERS} from './cms-snf-pecos-prerequisite.mjs';

export const PECOS_STREAM_VERSION='cms-snf-pecos-august-projection@1.0.0';
export const PECOS_ROW_LIMITS=Object.freeze({enrollments:50000,owners:500000,additionalNpis:50000});
const check=v=>{if(!v)throw Error('PECOS full-cohort projection rejected.');};
const text=(v,max=512)=>{check(typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v));return v;};
const id=(raw,type,re,max)=>{text(raw,max);return {type,raw,value:re.test(raw)?raw:null,status:raw===''?'missing':re.test(raw)?'syntax-only':'unresolved-source-format'};};
const date=raw=>({raw:text(raw,128),parsed:null,status:raw===''?'missing':'unverified-source-date-format'});
const flag=raw=>({raw:text(raw,16),value:raw==='Y'?true:raw==='N'?false:null,status:raw===''?'not-reported':['Y','N'].includes(raw)?'reported':'unresolved-source-format'});
/** Full bounded stream, one selected line per source row; no row arrays or Cartesian joins. */
export async function projectPecosStream(kind,readable,{sourceSha256,signal,onRow}){
 check(Object.hasOwn(HEADERS,kind)&&/^[a-f0-9]{64}$/.test(sourceSha256)&&typeof onRow==='function');signal?.throwIfAborted();
 const parser=parse({bom:true,relax_column_count:false,skip_empty_lines:false,max_record_size:65536});const abort=()=>{parser.destroy(signal.reason);readable.destroy(signal.reason);};signal?.addEventListener('abort',abort,{once:true});
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const pumping=(async()=>{try{for await(const raw of readable){signal?.throwIfAborted();const chunk=decoder.decode(raw,{stream:true});if(!parser.write(chunk))await new Promise((resolve,reject)=>{const drain=()=>{off();resolve();},error=e=>{off();reject(e);},closed=()=>error(Error('PECOS parser closed.')),off=()=>{parser.off('drain',drain);parser.off('error',error);parser.off('close',closed);};parser.once('drain',drain);parser.once('error',error);parser.once('close',closed);});}parser.end(decoder.decode());}catch(e){parser.destroy(e);throw e;}})();pumping.catch(()=>{});
 let index,rows=0;const counts={sourceRows:0,selectedRows:0,organizationOwnerRows:0,individualOwnerRows:0,unknownOwnerTypeRows:0,unselectedHeaderCount:null};
 try{for await(const values of parser){signal?.throwIfAborted();if(!index){check(values.length<=128&&new Set(values).size===values.length);values.forEach(v=>{text(v,256);check(v.length>0);});index=new Map(values.map((v,i)=>[v,i]));check(HEADERS[kind].every(k=>index.has(k)));counts.unselectedHeaderCount=values.length-HEADERS[kind].length;continue;}check(++rows<=PECOS_ROW_LIMITS[kind]);const get=k=>values[index.get(k)],sourceRow=rows+1,record={schemaVersion:PECOS_STREAM_VERSION,sourceRecordId:`cms-pecos:${kind}:${sourceSha256}:row:${sourceRow}`,sourceRow,sourceSha256,referencePeriod:'2026-08-01/2026-08-31',recordUnit:'publisher-pecos-source-row',currentOperationsVerified:false,exportPolicy:'local-review-only'};
   // Personal owner fields, including individual PAC, are never selected.
   if(kind==='owners'&&get('TYPE - OWNER')!=='O'){const type=text(get('TYPE - OWNER'),16);record.projection='excluded-owner-row';record.ownerTypeRaw=type;record.reason=type==='I'?'individual-owner':'unknown-owner-type';counts[type==='I'?'individualOwnerRows':'unknownOwnerTypeRows']++;}
   else{record.enrollmentId=id(get('ENROLLMENT ID'),'pecos-enrollment-id',/^[A-Za-z0-9]{15}$/,15);check(record.enrollmentId.value!==null);if(kind==='additionalNpis')record.npi=id(get('NPI'),'npi',/^\d{10}$/,10);
    else{record.associateId=id(get('ASSOCIATE ID'),'pecos-associate-control-id',/^\d{10}$/,10);if(kind==='enrollments'){record.ccn=id(get('CCN'),'cms-certification-number',/^[A-Za-z0-9]{6}$/,15);record.npi=id(get('NPI'),'npi',/^\d{10}$/,10);record.multipleNpi=flag(get('MULTIPLE NPI FLAG'));record.providerTypeRaw=text(get('PROVIDER TYPE CODE'),32);check(record.providerTypeRaw==='00-18');record.incorporationDate=date(get('INCORPORATION DATE'));record.affiliation={type:'pecos-publisher-affiliation-id',raw:text(get('AFFILIATION ENTITY ID'),64),nameRaw:text(get('AFFILIATION ENTITY NAME'))};record.publisherStatusAssertion={value:'approved-to-bill-at-source-snapshot',basis:'July2026-PECOS-guidance',referencePeriod:record.referencePeriod};}
     else{counts.organizationOwnerRows++;record.projection='organization-owner-relation';record.ownerAssociateId=id(get('ASSOCIATE ID - OWNER'),'pecos-associate-control-id',/^\d{10}$/,10);record.roleCodeRaw=text(get('ROLE CODE - OWNER'),16);record.roleTextRaw=text(get('ROLE TEXT - OWNER'));record.associationDate=date(get('ASSOCIATION DATE - OWNER'));record.organizationNameRaw=text(get('ORGANIZATION NAME - OWNER'));record.doingBusinessAsNameRaw=text(get('DOING BUSINESS AS NAME - OWNER'));record.percentageRaw=text(get('PERCENTAGE OWNERSHIP'),128);record.parentCompanyFlag=flag(get('PARENT COMPANY - OWNER'));record.ownedByAnotherFlag=flag(get('OWNED BY ANOTHER ORG OR IND - OWNER'));record.canonicalParent=null;}}
   }await onRow(record);counts.sourceRows++;counts.selectedRows++;if(rows%128===0)await yieldTurn(undefined,{signal});}
  await pumping;check(index);signal?.throwIfAborted();return counts;
 }finally{signal?.removeEventListener('abort',abort);parser.destroy();readable.destroy();await pumping.catch(()=>{});}
}
