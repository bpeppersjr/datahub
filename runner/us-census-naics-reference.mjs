import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { crc32 } from 'node:zlib';
import unzipper from 'unzipper';
import { APP_ROOT } from './paths.mjs';

export const DATASET = 'us-census-naics-reference';
export const VERSION = `${DATASET}@1.0.0`;
const SUSB_PAGE = 'https://www.census.gov/programs-surveys/susb/technical-documentation/reference-files/industry-reference-files.html';
export const SOURCES = Object.freeze([
  ...[[1997,'1998_to_2002'],[2002,'2003_to_2007'],[2007,'2008_to_2011'],[2012,'2012_to_2016']].map(([edition, period]) => Object.freeze({ edition, format:'txt', url:`https://www2.census.gov/programs-surveys/susb/technical-documentation/naics_codes_${period}.txt`, authority_page:SUSB_PAGE, authority_scope:'census-susb-published-industry-vocabulary', encoding:'windows-1252' })),
  ...[2017,2022].map(edition => Object.freeze({ edition, format:'xlsx', url:`https://www.census.gov/naics/${edition}NAICS/${edition}_NAICS_Structure.xlsx`, authority_page:'https://www.census.gov/naics/', authority_scope:'census-naics-united-states-structure', encoding:'ooxml-utf8' })),
]);
const CONTRACTS = [`config/connectors/${DATASET}.json`,`config/source-policies/${DATASET}.json`,`config/schemas/${DATASET}.schema.json`];
const MAX = 1_000_000;
const sha = raw => createHash('sha256').update(raw).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value)}\n`);
const check = (condition, message) => { if (!condition) throw new Error(`Census NAICS reference rejected: ${message}.`); };
const stop = signal => signal?.throwIfAborted();
const exactCode = code => /^\d{2,6}$/.test(code) || ['31-33','44-45','48-49'].includes(code);
const contained = (root, file) => { const full=path.resolve(root,file), relative=path.relative(root,full); check(relative && !relative.startsWith('..') && !path.isAbsolute(relative),'path outside root'); return full; };
const identity = (a,b) => a.isFile() && !a.isSymbolicLink() && a.nlink===1n && ['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);

async function ancestry(root, filename) {
  let current=filename;
  while(current!==root) { check(!(await fs.lstat(current)).isSymbolicLink(),'symlink path'); current=path.dirname(current); }
}
async function readBounded(root,file,maximum=MAX,signal) {
  stop(signal); const filename=contained(root,file); await ancestry(root,filename);
  const named=await fs.lstat(filename,{bigint:true}), handle=await fs.open(filename,'r');
  try {
    check(identity(named,await handle.stat({bigint:true})) && named.size<=BigInt(maximum),'unsafe/oversized file');
    const chunks=[]; let bytes=0;
    for (;;) { stop(signal); const chunk=Buffer.alloc(65536), {bytesRead}=await handle.read(chunk); if(!bytesRead)break; bytes+=bytesRead; check(bytes<=maximum,'file byte bound'); chunks.push(chunk.subarray(0,bytesRead)); }
    check(identity(named,await handle.stat({bigint:true})) && identity(named,await fs.lstat(filename,{bigint:true})),'file changed');
    return Buffer.concat(chunks,bytes);
  } finally { await handle.close(); }
}

export async function acquireNaicsSource(source, { signal, fetchImpl=fetch }={}) {
  check(SOURCES.includes(source),'unapproved source'); stop(signal);
  const requestSignal=AbortSignal.any([AbortSignal.timeout(60_000),...(signal?[signal]:[])]);
  // Fixed URLs only: there is no operator URL, cookie, credential, or redirect input.
  const response=await fetchImpl(source.url,{redirect:'manual',signal:requestSignal,headers:{Accept:source.format==='txt'?'text/plain':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  try {
    check(response.status===200 && !response.redirected && (!response.url || response.url===source.url),'HTTP status/redirect');
    const expected=source.format==='txt'?'text/plain':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    check(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()===expected,'content type');
    const declared=response.headers.get('content-length');
    check(declared===null || /^\d+$/.test(declared) && Number(declared)<=MAX,'declared source byte bound');
    check(response.body,'missing response body');
    const reader=response.body.getReader(), chunks=[]; let bytes=0;
    try { for(;;) { requestSignal.throwIfAborted(); const next=await reader.read(); if(next.done)break; bytes+=next.value.byteLength; check(bytes<=MAX,'source byte bound'); chunks.push(Buffer.from(next.value)); } }
    finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    check(bytes>0,'empty source');
    return Buffer.concat(chunks,bytes);
  } catch(error) { await response.body?.cancel().catch(()=>{}); throw error; }
}

function record(source,code,title,sourceRow,trilateral=null,indicator=null) {
  check(exactCode(code) && typeof title==='string' && title.trim().length>0 && title.length<512 && !/[\x00-\x1f\x7f]/.test(title),'code/title');
  const kind=source.format==='txt'&&code==='99'?'source-program-unclassified':code.includes('-')?'combined-sector':'exact-code';
  return { schema_version:'1.0.0', edition:source.edition, naics_code:code, code_kind:kind, digit_count:code.includes('-')?null:code.length, title:title.trim(), trilateral_marker:trilateral, change_indicator:indicator, source_row:sourceRow, source_url:source.url, authority_scope:source.authority_scope, transformation_version:VERSION, policy_id:DATASET };
}
export function parseNaicsText(raw,source) {
  check(source.format==='txt' && raw.length<=MAX,'TXT format/size');
  const text=new TextDecoder('windows-1252',{fatal:true}).decode(raw), lines=text.split(/\r?\n/);
  check(lines.length<5000 && lines.some(line=>new RegExp(`^CODE\\s+${source.edition} NAICS DESCRIPTION\\s*$`).test(line)) && lines.some(line=>line.trim()===String(source.edition)),'TXT edition/header');
  const records=[]; let started=false, totalRows=0;
  lines.forEach((line,index)=> {
    check(line.length<1024,'TXT line bound');
    if(/^CODE\s/.test(line)) { check(!started,'duplicate TXT header'); started=true; return; }
    if(!started || !line.trim())return;
    if(/^--\s+Total\s*$/.test(line)){totalRows++;return;}
    const match=line.match(/^(\d{2,6}|31-33|44-45|48-49)\s+(.+?)\s*$/);
    check(match,'unrecognized TXT row'); records.push(record(source,match[1],match[2],index+1));
  });
  check(totalRows===1,'TXT aggregate marker'); return finish(records);
}
function xmlDecode(text) {
  check(!/<!DOCTYPE|<!ENTITY/i.test(text),'XML declarations');
  return text.replace(/&#x([a-f\d]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v))).replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&amp;','&');
}
function texts(xml) { return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>xmlDecode(match[1])).join(''); }
function stringValue(xml) {
  let trilateral=false;
  const cleaned=xml.replace(/<r>([\s\S]*?)<\/r>/g,(whole,body)=> {
    if(/<vertAlign\s+val="superscript"\s*\/>/.test(body)) { check(texts(body)==='T','unknown superscript'); trilateral=true; return ''; }
    return whole;
  });
  return {text:texts(cleaned),trilateral};
}
export async function parseNaicsWorkbook(raw,source,signal) {
  stop(signal); check(source.format==='xlsx' && raw.length<=MAX && raw.subarray(0,4).equals(Buffer.from([80,75,3,4])),'XLSX format/size');
  const archive=await unzipper.Open.buffer(raw); check(archive.files.length<=64,'XLSX part count');
  let expanded=0; const parts=new Map();
  for(const entry of archive.files) {
    stop(signal); check(!parts.has(entry.path) && !entry.path.startsWith('/') && !entry.path.split('/').includes('..') && !entry.path.includes('\\'),'XLSX duplicate/path');
    check(!/vbaProject|externalLinks|embeddings|activeX|connections\.xml/i.test(entry.path) && !(entry.flags&1),'XLSX active/encrypted content');
    expanded+=entry.uncompressedSize; check(entry.uncompressedSize<=3_000_000 && expanded<=8_000_000,'XLSX expanded byte bound');
    const chunks=[]; let bytes=0;
    for await(const chunk of entry.stream()) { stop(signal); bytes+=chunk.length; check(bytes<=3_000_000,'XLSX streamed part byte bound'); chunks.push(chunk); }
    const value=Buffer.concat(chunks,bytes); check(bytes===entry.uncompressedSize && crc32(value)===(entry.crc32>>>0),'XLSX size/CRC');
    parts.set(entry.path,value);
  }
  const xml=part=> { check(parts.has(part),'XLSX required part'); const value=new TextDecoder('utf-8',{fatal:true}).decode(parts.get(part)); check(!/<!DOCTYPE|<!ENTITY/i.test(value),'XML declaration'); return value; };
  for(const [part,value] of parts) if(part.endsWith('.rels'))check(!/TargetMode\s*=\s*["']External/i.test(value.toString('utf8')),'XLSX external relationship');
  const workbook=xml('xl/workbook.xml'), relations=xml('xl/_rels/workbook.xml.rels');
  const expectedSheets=source.edition===2017?3:1;
  check([...workbook.matchAll(/<sheet\b/g)].length===expectedSheets && /Id="rId1"[^>]*Target="worksheets\/sheet1.xml"/.test(relations) && [...parts.keys()].filter(key=>/^xl\/worksheets\/sheet\d+\.xml$/.test(key)).length===expectedSheets,'XLSX worksheet roster');
  for(let index=2;index<=expectedSheets;index++)check(!/<c\b|<f\b/.test(xml(`xl/worksheets/sheet${index}.xml`)),'XLSX extra worksheet must be empty');
  const shared=[...xml('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match=>stringValue(match[1]));
  const sheet=xml('xl/worksheets/sheet1.xml'); check(!/<f(?:\s|>)/i.test(sheet),'XLSX formulas');
  const rows=[]; let previousRow=0;
  for(const row of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const number=Number(row[1].match(/\br="(\d+)"/)?.[1]); check(number>previousRow && number<5000,'XLSX row order/bound'); previousRow=number;
    const cells=new Map();
    for(const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference=cell[1].match(/\br="([A-Z]+)(\d+)"/), column=reference?.[1]; check(reference && Number(reference[2])===number && !cells.has(column),'XLSX cell identity');
      const type=cell[1].match(/\bt="([^"]+)"/)?.[1]??'n', body=cell[2]??'', value=body.match(/<v>([\s\S]*?)<\/v>/)?.[1]??'';
      check(['s','n','inlineStr'].includes(type),'XLSX cell type');
      let parsed={text:xmlDecode(value),trilateral:false};
      if(type==='s') { check(/^\d+$/.test(value) && Number(value)<shared.length,'XLSX shared string'); parsed=shared[Number(value)]; }
      if(type==='inlineStr')parsed=stringValue(body);
      cells.set(column,parsed);
    }
    rows.push({number,cells});
  }
  check(rows[0]?.cells.get('A')?.text===`${source.edition} NAICS Structure` && rows.find(row=>row.number===3)?.cells.get('B')?.text===`${source.edition} NAICS Code` && rows.find(row=>row.number===3)?.cells.get('C')?.text===`${source.edition} NAICS Title`,'XLSX edition/header');
  const records=[];
  for(const {number,cells} of rows) {
    if(number<=3)continue; const code=cells.get('B')?.text.trim()??'', title=cells.get('C');
    if(!code && !title?.text.trim())continue;
    check([...cells].every(([column,value])=>['A','B','C'].includes(column) || !value.text.trim()),'XLSX unexpected value column');
    const indicator=cells.get('A')?.text.trim()||null; check(indicator===null || /^\*{1,4}$/.test(indicator),'XLSX change indicator');
    records.push(record(source,code,title?.text,number,title?.trilateral??false,indicator));
  }
  return finish(records);
}
function finish(records) {
  check(records.length>0 && records.length<=3000,'code count bound'); const seen=new Set();
  for(const row of records) { check(!seen.has(row.naics_code),'duplicate code'); seen.add(row.naics_code); }
  return records.sort((a,b)=>a.naics_code.localeCompare(b.naics_code,'en'));
}
async function normalize(raw,source,signal) { return source.format==='txt'?parseNaicsText(raw,source):parseNaicsWorkbook(raw,source,signal); }
function summary(source,rows,artifact) {
  return { ...source, source_artifact:artifact, code_count:rows.length, exact_code_count:rows.filter(row=>row.code_kind==='exact-code').length, combined_sector_count:rows.filter(row=>row.code_kind==='combined-sector').length, source_program_unclassified_count:rows.filter(row=>row.code_kind==='source-program-unclassified').length, counts_by_digits:Object.fromEntries([2,3,4,5,6].map(d=>[d,rows.filter(row=>row.digit_count===d&&row.code_kind==='exact-code').length])), complete_us_naics_structure:source.format==='xlsx', absence_proves_invalid_code:false, source_edition_inference:false, concordance_applied:false, operational_mapping_applied:false };
}

export async function buildNaicsReference({ root=APP_ROOT, acquire=false, replayManifest=null, rebindContracts=false, retainedRunId=null, signal, fetchImpl=fetch, runId=randomUUID() }={}) {
  root=await fs.realpath(root); check(/^[a-zA-Z0-9-]{1,80}$/.test(runId),'run identifier');
  check(typeof acquire==='boolean' && (acquire!==Boolean(replayManifest)),'choose acquisition or retained replay');
  check(typeof rebindContracts==='boolean' && (!rebindContracts || replayManifest && !acquire),'contract rebind requires retained replay');
  const staging=contained(root,`data/${DATASET}/runs/${runId}`); await fs.mkdir(path.dirname(staging),{recursive:true}); await ancestry(root,path.dirname(staging)); await fs.mkdir(staging);
  const receipts=[], startedAt=new Date().toISOString(); let prior,inputPin=null;
  const journal=async stage=> {
    const temporary=path.join(staging,`receipt-${randomUUID()}.tmp`);
    await fs.writeFile(temporary,encode({schema_version:'1.0.0',operation_id:runId,dataset_id:DATASET,stage,started_at:startedAt,updated_at:new Date().toISOString(),acquisition:acquire,retained_run_id:retainedRunId,input_manifest:inputPin,source_receipts:receipts}),{flag:'wx'});
    await fs.rename(temporary,path.join(staging,'receipt.json'));
  };
  try {
    if(replayManifest) {
      const input=await verifyNaicsReference(replayManifest,{root,signal,requireCurrentContracts:!rebindContracts,replayDerived:!rebindContracts});
      inputPin={path:path.relative(root,input.manifestPath).replaceAll('\\','/'),manifest_sha256:input.manifestSha256,release_id:input.manifest.release_id,verification_scope:input.verification_scope};
    }
    if(retainedRunId) {
      check(acquire && /^[a-zA-Z0-9-]{1,80}$/.test(retainedRunId) && retainedRunId!==runId,'retained run identifier');
      prior=JSON.parse(await readBounded(root,`data/${DATASET}/runs/${retainedRunId}/receipt.json`,100_000,signal));
      check(prior.operation_id===retainedRunId && prior.dataset_id===DATASET && ['failed','cancelled'].includes(prior.stage),'retained terminal run receipt');
    }
    await journal('preflight'); const contractHashes={};
    for(const file of CONTRACTS)contractHashes[file]=sha(await readBounded(root,file,200_000,signal));
    const artifacts=[], allRows=[], summaries=[];
    await journal('plan');
    for(const source of SOURCES) {
      stop(signal); await journal('acquire');
      const artifact=`source-${source.edition}.${source.format}`;
      let raw, downloaded=false;
      if(retainedRunId) {
        try { raw=await readBounded(root,`data/${DATASET}/runs/${retainedRunId}/${artifact}`,MAX,signal); }
        catch(error) { if(error.code!=='ENOENT')throw error; }
        if(raw) { const binding=prior.source_receipts?.find(item=>item.edition===source.edition);check(binding?.url===source.url && binding.bytes===raw.length && binding.sha256===sha(raw),'retained acquisition receipt binding'); }
      }
      if(!raw) {
        if(acquire){raw=await acquireNaicsSource(source,{signal,fetchImpl});downloaded=true;}
        else raw=await readBounded(root,path.join(path.dirname(path.resolve(root,replayManifest)),artifact),MAX,signal);
      }
      await fs.writeFile(path.join(staging,artifact),raw,{flag:'wx'});
      receipts.push({edition:source.edition,url:source.url,bytes:raw.length,sha256:sha(raw),acquired:downloaded,retained_acquisition_run:raw && retainedRunId && !downloaded?retainedRunId:null});
      await journal('validate'); const rows=await normalize(raw,source,signal);
      check(rows.length>=1900 && rows.filter(row=>row.code_kind==='combined-sector').length===3,'official vocabulary quality floor/sectors');
      artifacts.push({path:artifact,bytes:raw.length,sha256:sha(raw),artifact_type:'source-native-reference'});
      allRows.push(...rows.map(row=>({...row,source_artifact_sha256:sha(raw)}))); summaries.push(summary(source,rows,artifact)); await journal('normalize');
    }
    await journal('reconcile');
    const outputs={'codes.jsonl':Buffer.concat(allRows.map(encode)),'edition-summaries.json':encode(summaries)};
    for(const [name,raw]of Object.entries(outputs)) { stop(signal); await fs.writeFile(path.join(staging,name),raw,{flag:'wx'}); artifacts.push({path:name,bytes:raw.length,sha256:sha(raw),artifact_type:name.endsWith('.jsonl')?'exact-edition-code-title-jsonl':'edition-summary-json'}); }
    const envelope={schema_version:'1.0.0',dataset_id:DATASET,transformation_version:VERSION,status:'published',policy_id:DATASET,contracts:contractHashes,sources:SOURCES,artifacts,code_count:allRows.length,editions:SOURCES.map(s=>s.edition),runtime_pointer:null,source_edition_inference:false,operational_mapping_applied:false,concordance_applied:false,additive_to_business_totals:false};
    const releaseId=`${DATASET}-${sha(encode(envelope))}`, manifest={...envelope,release_id:releaseId};
    await journal('quality gate'); await fs.writeFile(path.join(staging,'manifest.json'),encode(manifest),{flag:'wx'});
    await verifyNaicsReference(path.join(staging,'manifest.json'),{root,signal}); stop(signal);
    const release=contained(root,`data/${DATASET}/releases/${releaseId}`); await fs.mkdir(path.dirname(release),{recursive:true}); await ancestry(root,path.dirname(release));
    await journal('publish');
    try { await fs.mkdir(release); }
    catch(error) { if(error.code!=='EEXIST')throw error; await verifyNaicsReference(path.join(release,'manifest.json'),{root,signal}); await journal('finalize'); return {manifest,manifestPath:path.join(release,'manifest.json'),operationId:runId,reused:true}; }
    // Native and normalized artifacts precede the atomic manifest publication.
    for(const artifact of artifacts)await fs.rename(path.join(staging,artifact.path),path.join(release,artifact.path));
    await fs.rename(path.join(staging,'manifest.json'),path.join(release,'manifest.json'));
    await journal('finalize'); return {manifest,manifestPath:path.join(release,'manifest.json'),operationId:runId,reused:false};
  } catch(error) { await journal(signal?.aborted?'cancelled':'failed'); throw error; }
}

export async function verifyNaicsReference(manifestPath,{root=APP_ROOT,signal,requireCurrentContracts=true,replayDerived=true}={}) {
  check(typeof requireCurrentContracts==='boolean' && typeof replayDerived==='boolean' && (replayDerived || !requireCurrentContracts),'verification scope options');
  root=await fs.realpath(root); const full=contained(root,manifestPath), base=path.dirname(full), manifest=JSON.parse(await readBounded(root,full,200_000,signal));
  const {release_id,...envelope}=manifest;
  const keys=['schema_version','dataset_id','transformation_version','status','policy_id','contracts','sources','artifacts','code_count','editions','runtime_pointer','source_edition_inference','operational_mapping_applied','concordance_applied','additive_to_business_totals','release_id'];
  check(Object.keys(manifest).length===keys.length && keys.every(key=>Object.hasOwn(manifest,key)),'manifest shape');
  check(release_id===`${DATASET}-${sha(encode(envelope))}` && manifest.dataset_id===DATASET && manifest.transformation_version===VERSION && manifest.status==='published' && manifest.schema_version==='1.0.0' && manifest.policy_id===DATASET,'manifest identity');
  check(manifest.runtime_pointer===null && ['source_edition_inference','operational_mapping_applied','concordance_applied','additive_to_business_totals'].every(key=>manifest[key]===false),'claim boundaries');
  check(JSON.stringify(manifest.sources)===JSON.stringify(SOURCES) && JSON.stringify(manifest.editions)===JSON.stringify(SOURCES.map(s=>s.edition)),'source roster');
  check(JSON.stringify(Object.keys(manifest.contracts??{}))===JSON.stringify(CONTRACTS),'contract roster');
  for(const file of CONTRACTS) {
    check(/^[a-f\d]{64}$/.test(manifest.contracts[file]),'contract digest');
    if(requireCurrentContracts)check(sha(await readBounded(root,file,200_000,signal))===manifest.contracts[file],'contract drift');
  }
  const names=[...SOURCES.map(source=>`source-${source.edition}.${source.format}`),'codes.jsonl','edition-summaries.json'];
  check(JSON.stringify(manifest.artifacts?.map(a=>a.path))===JSON.stringify(names),'artifact roster');
  const rawFiles=new Map();
  for(const artifact of manifest.artifacts) {
    check(Object.keys(artifact).length===4 && ['path','bytes','sha256','artifact_type'].every(key=>Object.hasOwn(artifact,key)) && artifact.artifact_type===(artifact.path==='codes.jsonl'?'exact-edition-code-title-jsonl':artifact.path==='edition-summaries.json'?'edition-summary-json':'source-native-reference'),'artifact shape/type');
    check(Number.isSafeInteger(artifact.bytes)&&artifact.bytes>0&&/^[a-f\d]{64}$/.test(artifact.sha256),'artifact declaration');
    const raw=await readBounded(root,path.join(base,artifact.path),artifact.path==='codes.jsonl'?12_000_000:MAX,signal);
    check(raw.length===artifact.bytes && sha(raw)===artifact.sha256,'artifact bytes/digest');rawFiles.set(artifact.path,raw);
  }
  const records=[], summaries=[];
  for(const source of SOURCES) { const artifact=`source-${source.edition}.${source.format}`, raw=rawFiles.get(artifact), rows=await normalize(raw,source,signal); check(rows.length>=1900&&rows.filter(row=>row.code_kind==='combined-sector').length===3,'source quality'); records.push(...rows.map(row=>({...row,source_artifact_sha256:sha(raw)})));summaries.push(summary(source,rows,artifact)); }
  check(manifest.code_count===records.length,'source row count');
  if(replayDerived)check(rawFiles.get('codes.jsonl').equals(Buffer.concat(records.map(encode))) && rawFiles.get('edition-summaries.json').equals(encode(summaries)),'deterministic source replay');
  return {manifest,manifestPath:full,manifestSha256:sha(await readBounded(root,full,200_000,signal)),summaries,verification_scope:replayDerived?'complete-derived-replay':'native-artifact-bindings-and-current-source-quality'};
}
