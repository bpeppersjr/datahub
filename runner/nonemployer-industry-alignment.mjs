import path from 'node:path';
import {open,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';

const RELEASE='census-nonemployer-2023-20260830-230249716Z-78268f89';
const MANIFEST=`data/business-baselines/census-nonemployer/releases/${RELEASE}/manifest.json`;
const HASH='7ebdba43630506d1c6bf859fdc91fe57566c0d0b95c4b8f872c40c2c71670f06';
const FIPS='01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split(' ');
const check=v=>{if(!v)throw Error('Nonemployer industry alignment rejected.');};
const sha=v=>createHash('sha256').update(v).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const code=v=>typeof v==='string'&&/^(?:\d{2,6}|31-33|44-45|48-49)$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function object(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));}
function selection(v){object(v,['naics','referenceYear','states','signal']);check(code(v.naics)&&v.referenceYear===2023);check(v.signal===undefined||v.signal instanceof AbortSignal);
 const states=v.states??FIPS;check(Array.isArray(states)&&Object.getPrototypeOf(states)===Array.prototype&&states.length<=51&&Reflect.ownKeys(states).length===states.length+1);
 for(let i=0;i<states.length;i++)check(Object.hasOwn(Object.getOwnPropertyDescriptor(states,String(i))??{},'value')&&FIPS.includes(states[i]));
 check(new Set(states).size===states.length);return {...v,states:[...states].sort()};}
const stable=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&a.ino===b.ino&&a.dev===b.dev&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function read(file,max,signal){await canonical(path.dirname(file),{signal});signal?.throwIfAborted();const before=await lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max));const h=await open(file,'r');const chunks=[];let size=0;
 try{check(stable(before,await h.stat({bigint:true})));for(;;){signal?.throwIfAborted();const buffer=Buffer.alloc(65536),r=await h.read(buffer);if(!r.bytesRead)break;size+=r.bytesRead;check(size<=max);chunks.push(buffer.subarray(0,r.bytesRead));}check(stable(before,await h.stat({bigint:true}))&&stable(before,await lstat(file,{bigint:true}))&&BigInt(size)===before.size);}finally{await h.close();}
 const data=Buffer.concat(chunks);return {data,bytes:size,sha256:sha(data),identity:before,file};}
function validateRow(row,kind,release){check(row&&row.schema_version==='1.0.0'&&row.geography_type===kind&&row.reference_year===2023&&code(row.naics?.code)&&/^\d{3,4}$/.test(row.legal_form?.code)&&/^\d{3,4}$/.test(row.receipt_size?.code));
 check(kind==='national'?row.geoid==='US'&&row.state_fips===null&&row.county_fips===null:FIPS.includes(row.state_fips)&&row.geoid===row.state_fips&&row.county_fips===null);
 check(row.record_id===[kind,row.geoid,row.naics.code,row.legal_form.code,row.receipt_size.code].join(':'));
 const p=row.provenance;check(p?.policy_id==='us-census-nonemployer'&&p.transformation_version==='us-census-nonemployer@1.0.0'&&p.source_id==='census-nonemployer-2023'&&p.source_release_id===release&&p.source_record_id===row.record_id);
 const n=row.measures?.nonemployer_establishments;check(n===null||Number.isSafeInteger(n)&&n>=0);
 for(const flag of [row.measures.nonemployer_establishments_flag,row.naics.footnote,row.geography_footnote])check(flag===null||typeof flag==='string'&&flag.length<=1000);
 check(row.measures.flags_preserved_without_reinterpretation===true);
}
async function cells(raw,kind,release,expected,naics,signal){const stream=Readable.from([raw]).pipe(createGunzip()),decoder=new TextDecoder('utf-8',{fatal:true});const seen=new Set(),kept=new Map();let tail='',bytes=0,count=0;
 function consume(line){check(line&&Buffer.byteLength(line)<=16384);const row=JSON.parse(line);validateRow(row,kind,release);check(!seen.has(row.record_id));seen.add(row.record_id);count++;check(count<=100000);
  if(row.naics.code===naics&&row.legal_form.code==='001'&&row.receipt_size.code==='001')kept.set(row.geoid,row);}
 const abort=()=>stream.destroy(signal.reason);signal?.addEventListener('abort',abort,{once:true});
 try{signal?.throwIfAborted();for await(const chunk of stream){signal?.throwIfAborted();bytes+=chunk.length;check(bytes<=(kind==='national'?20000000:180000000));tail+=decoder.decode(chunk,{stream:true});let end;while((end=tail.indexOf('\n'))!==-1){consume(tail.slice(0,end));tail=tail.slice(end+1);}check(Buffer.byteLength(tail)<=16384);await yieldTurn(undefined,{signal});}tail+=decoder.decode();check(tail===''&&count===expected);}finally{signal?.removeEventListener('abort',abort);stream.destroy();}
 return kept;}
function cell(row){if(!row)return {count:null,status:'not-published',flags:null};const flags={measure:row.measures.nonemployer_establishments_flag,industry:row.naics.footnote,geography:row.geography_footnote};const flagged=Object.values(flags).some(v=>v!==null&&v!=='');return {count:flagged?null:row.measures.nonemployer_establishments,status:flagged?'flagged-uninterpreted':row.measures.nonemployer_establishments===null?'missing-measure':'published',flags};}
async function build(manifestPath,manifestHash,opts,synthetic){const selected=selection(opts),{signal}=selected;signal?.throwIfAborted();const saved=[],load=async(file,max)=>{const r=await read(file,max,signal);saved.push(r);return r;};
 const raw=await load(manifestPath,1000000);check(raw.sha256===manifestHash);const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.data));
 check(m.schema_version==='1.0.0'&&m.dataset_id==='census-nonemployer-baseline'&&m.reference_year===2023&&m.status==='published-annual-aggregate'&&m.complete_source_release===true&&m.geography_scope==='50-states-and-district-of-columbia'&&typeof m.release_id==='string');
 check(Array.isArray(m.artifacts));const paths=new Set();for(const a of m.artifacts){check(typeof a.path==='string'&&!paths.has(a.path));paths.add(a.path);}
 const data={},evidence=[];
 for(const kind of ['national','state']){const matches=m.artifacts.filter(a=>a.path===`derived/industry/${kind}.jsonl.gz`);check(matches.length===1);const a=matches[0];check(a.artifact_type==='normalized-nonemployer-industry-jsonl-gzip'&&a.geography_type===kind&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=4000000&&digest(a.sha256)&&Number.isSafeInteger(a.record_count)&&a.record_count>0&&a.record_count<=100000&&a.record_count===m.coverage?.[`normalized_${kind}_industry_rows`]);
  const r=await load(path.join(path.dirname(manifestPath),a.path),4000000);check(r.bytes===a.bytes&&r.sha256===a.sha256);data[kind]=await cells(r.data,kind,m.release_id,a.record_count,selected.naics,signal);evidence.push({path:a.path,sha256:r.sha256,bytes:r.bytes,records:a.record_count});}
 // Reverse reread keeps the manifest last. No pointer or source archive replay.
 for(const r of [...saved].reverse()){const after=await read(r.file,r.bytes,signal);check(after.sha256===r.sha256&&stable(r.identity,after.identity));}
 const national=cell(data.national.get('US'));const allStates=FIPS.map(state=>{const value=cell(data.state.get(state));return {stateFips:state,...value,percentOfNationalSameIndustry:value.count!==null&&national.count>0?100*value.count/national.count:null};});
 const known=allStates.filter(s=>s.count!==null),sum=known.reduce((n,s)=>n+s.count,0);check(Number.isSafeInteger(sum));
 return freeze({schemaVersion:'nonemployer-industry-alignment@1.0.0',verificationMode:synthetic?'synthetic-test-input':'verified-retained-artifacts',referenceYear:2023,naicsVersion:'2022',naics:selected.naics,legalForm:'001',receiptSize:'001',recordUnit:'annual-nonemployer-establishments',national,states:allStates.filter(s=>selected.states.includes(s.stateFips)),stateReconciliation:{knownStateCount:known.length,missingOrFlaggedStateCount:51-known.length,knownStateEstablishments:sum,nationalMinusStateSum:known.length===51&&national.count!==null?national.count-sum:null},denominator:'Official national Census NES row for this reference year, NAICS, all legal forms and all receipt sizes; 50 states and DC. Display filters do not change it.',evidence:{manifestPath:path.relative(APP_ROOT,manifestPath).replaceAll('\\','/'),manifestSha256:raw.sha256,releaseId:m.release_id,artifacts:evidence,sourceArchiveReplayed:false},claims:{currentBusinessOperationsVerified:false,collectionCompletenessPercent:null,uniqueBusinessCount:null,employerUniverseIncluded:false,zipAllocationPerformed:false,exportPolicy:'local-review-only'}});
}
export async function readNonemployerIndustryAlignment(options){return build(path.join(APP_ROOT,MANIFEST),HASH,options,false);}
export async function readNonemployerIndustryAlignmentWithTestInput(input,options){object(input,['manifestPath','manifestSha256']);check(typeof input.manifestPath==='string'&&input.manifestPath===path.resolve(input.manifestPath)&&digest(input.manifestSha256));const rel=path.relative(path.join(APP_ROOT,'data/tmp'),input.manifestPath);check(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)&&path.basename(input.manifestPath)==='manifest.json');return build(input.manifestPath,input.manifestSha256,options,true);}
