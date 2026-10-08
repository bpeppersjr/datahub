import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import unzipper from 'unzipper';
import { APP_ROOT } from './paths.mjs';
import { DATASET, SOURCES, acquireNaicsSource, parseNaicsText, parseNaicsWorkbook, buildNaicsReference, verifyNaicsReference } from './us-census-naics-reference.mjs';

const RELEASE=`data/${DATASET}/releases/${DATASET}-9133b65c6b503247c69e4615378ec3c7d71336aeaba1b256d175fc22a5551427`;
const MANIFEST=`${RELEASE}/manifest.json`;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const encoded=value=>Buffer.from(`${JSON.stringify(value)}\n`);
async function fixture(t) {
  const tmp=path.join(APP_ROOT,'data/tmp');await fs.mkdir(tmp,{recursive:true});
  const root=await fs.mkdtemp(path.join(tmp,'naics-reference-'));
  t.after(async()=> { assert(path.relative(tmp,root)&&!path.relative(tmp,root).startsWith('..'));await fs.rm(root,{recursive:true,force:true}); });
  for(const file of [`config/connectors/${DATASET}.json`,`config/source-policies/${DATASET}.json`,`config/schemas/${DATASET}.schema.json`]) {
    await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.copyFile(path.join(APP_ROOT,file),path.join(root,file));
  }
  await fs.mkdir(path.dirname(path.join(root,RELEASE)),{recursive:true});await fs.cp(path.join(APP_ROOT,RELEASE),path.join(root,RELEASE),{recursive:true});
  return root;
}
function storedZip(entries) {
  const local=[],central=[];let offset=0;
  for(const [name,raw]of entries) {
    const filename=Buffer.from(name),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(crc32(raw),14);header.writeUInt32LE(raw.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(filename.length,26);
    local.push(header,filename,raw);const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt32LE(crc32(raw),16);directory.writeUInt32LE(raw.length,20);directory.writeUInt32LE(raw.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);central.push(directory,filename);offset+=header.length+filename.length+raw.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
async function modifiedWorkbook(source,edit) {
  const raw=await fs.readFile(path.join(APP_ROOT,RELEASE,`source-${source.edition}.xlsx`)),archive=await unzipper.Open.buffer(raw),entries=[];
  for(const item of archive.files)entries.push([item.path,edit(item.path,await item.buffer())]);
  return storedZip(entries);
}

test('official retained six-edition reference replays every source and reconciles counts',async()=> {
  const result=await verifyNaicsReference(MANIFEST); assert.equal(result.manifest.code_count,12743);
  assert.deepEqual(result.summaries.map(s=>[s.edition,s.code_count]),[[1997,2126],[2002,2147],[2007,2134],[2012,2015],[2017,2196],[2022,2125]]);
  assert(result.summaries.every(s=>s.combined_sector_count===3&&!s.absence_proves_invalid_code&&!s.source_edition_inference&&!s.concordance_applied&&!s.operational_mapping_applied));
  assert.deepEqual(result.summaries.filter(s=>s.complete_us_naics_structure).map(s=>s.edition),[2017,2022]);
  assert.deepEqual(result.summaries.map(s=>s.source_program_unclassified_count),[1,1,1,1,0,0]);
  assert(result.summaries.every(s=>s.code_count===s.exact_code_count+s.combined_sector_count+s.source_program_unclassified_count));
});
test('historical TXT binds explicit edition, preserves exact ranges, and rejects unknown or duplicate rows',()=> {
  const source=SOURCES[0],raw=Buffer.from('1997\nNAICS\nCODE     1997 NAICS DESCRIPTION\n-- Total\n31-33 Manufacturing\n621111 Offices of physicians\n','latin1');
  const records=parseNaicsText(raw,source);assert.equal(records[0].naics_code,'31-33');assert.equal(records[0].digit_count,null);assert.equal(records[1].edition,1997);
  assert.throws(()=>parseNaicsText(Buffer.from(raw.toString().replaceAll('1997','2002')),source),/header/);
  assert.throws(()=>parseNaicsText(Buffer.concat([raw,Buffer.from('621111 Duplicate\n')]),source),/duplicate/);
  assert.throws(()=>parseNaicsText(Buffer.concat([raw,Buffer.from('9999999 Invalid\n')]),source),/unrecognized/);
});
test('XLSX extracts superscript trilateral marker without title contamination',async()=> {
  const source=SOURCES.at(-1),raw=await fs.readFile(path.join(APP_ROOT,RELEASE,'source-2022.xlsx'));
  const rows=await parseNaicsWorkbook(raw,source),sector=rows.find(row=>row.naics_code==='11');
  assert.equal(sector.title,'Agriculture, Forestry, Fishing and Hunting');assert.equal(sector.trilateral_marker,true);
  assert(rows.some(row=>row.change_indicator!==null));assert.equal(rows.length,2125);
});
test('workbook rejects formulas, hidden extra values, and edition header drift',async()=> {
  const source=SOURCES.at(-1);
  for(const [change,message]of [
    [xml=>xml.replace('<v>11</v>','<f>1+1</f><v>11</v>'),/formulas/],
    [xml=>xml.replace('<c r="B4"','<c r="D4"'),/unexpected value column|code\/title/],
  ]) {
    const raw=await modifiedWorkbook(source,(name,value)=>name==='xl/worksheets/sheet1.xml'?Buffer.from(change(value.toString())):value);
    await assert.rejects(parseNaicsWorkbook(raw,source),message);
  }
  const raw=await modifiedWorkbook(source,(name,value)=>name==='xl/sharedStrings.xml'?Buffer.from(value.toString().replace('2022 NAICS Structure','2017 NAICS Structure')):value);
  await assert.rejects(parseNaicsWorkbook(raw,source),/edition\/header/);
});
test('acquisition rejects redirects, changed URL, wrong media type, oversized stream, and cancellation',async()=> {
  const source=SOURCES[0];
  for(const response of [new Response('x',{status:302}),new Response('x',{headers:{'content-type':'text/html'}}),new Response('x',{headers:{'content-type':'text/plain','content-length':'1000001'}}),new Response(new Uint8Array(1000001),{headers:{'content-type':'text/plain'}})]) {
    await assert.rejects(acquireNaicsSource(source,{fetchImpl:async()=>response}),/rejected/);
  }
  const response=new Response('x',{headers:{'content-type':'text/plain'}});Object.defineProperty(response,'url',{value:'https://example.com/x'});
  await assert.rejects(acquireNaicsSource(source,{fetchImpl:async()=>response}),/redirect/);
  await assert.rejects(acquireNaicsSource({...source,url:'https://example.com'},{fetchImpl:()=>assert.fail('network called')}),/unapproved/);
  const controller=new AbortController();controller.abort();await assert.rejects(acquireNaicsSource(source,{signal:controller.signal,fetchImpl:()=>assert.fail('network called')}),{name:'AbortError'});
});
test('zero-network replay is deterministic, idempotent, and safe under concurrent operations',async t=> {
  const root=await fixture(t);
  const results=await Promise.all(['replay-a','replay-b'].map(runId=>buildNaicsReference({root,replayManifest:MANIFEST,runId,fetchImpl:()=>assert.fail('network called')})));
  assert(results.every(result=>result.reused&&result.manifest.code_count===12743));
  for(const runId of ['replay-a','replay-b']) {
    const receipt=JSON.parse(await fs.readFile(path.join(root,`data/${DATASET}/runs/${runId}/receipt.json`)));
    assert.equal(receipt.stage,'finalize');assert(receipt.source_receipts.every(source=>!source.acquired));
  }
});
test('verification rejects source mutation and a self-consistent manifest with inconsistent normalized output',async t=> {
  const root=await fixture(t),file=path.join(root,RELEASE,'codes.jsonl'),raw=await fs.readFile(file),manifest=JSON.parse(await fs.readFile(path.join(root,MANIFEST)));
  const changed=Buffer.from(raw.toString().replace('Manufacturing','Fakefacturing'));
  await fs.writeFile(file,changed);manifest.artifacts.find(a=>a.path==='codes.jsonl').sha256=sha(changed);
  const {release_id:unused,...envelope}=manifest;assert(unused);manifest.release_id=`${DATASET}-${sha(encoded(envelope))}`;
  await fs.writeFile(path.join(root,MANIFEST),encoded(manifest));
  await assert.rejects(verifyNaicsReference(MANIFEST,{root}),/source replay/);
});
test('recovery validates terminal receipt and refuses changed retained acquisition',async t=> {
  const root=await fixture(t),prior=path.join(root,`data/${DATASET}/runs/failed-a`);await fs.mkdir(prior,{recursive:true});
  const raw=await fs.readFile(path.join(root,RELEASE,'source-1997.txt'));
  await fs.writeFile(path.join(prior,'source-1997.txt'),Buffer.concat([raw,Buffer.from(' ')]));
  await fs.writeFile(path.join(prior,'receipt.json'),encoded({operation_id:'failed-a',dataset_id:DATASET,stage:'failed',source_receipts:[{edition:1997,url:SOURCES[0].url,bytes:raw.length,sha256:sha(raw)}]}));
  await assert.rejects(buildNaicsReference({root,acquire:true,retainedRunId:'failed-a',runId:'recovery-a',fetchImpl:()=>assert.fail('network called')}),/receipt binding/);
  const receipt=JSON.parse(await fs.readFile(path.join(root,`data/${DATASET}/runs/recovery-a/receipt.json`)));assert.equal(receipt.stage,'failed');
});
test('cancellation leaves a terminal run receipt and no published manifest',async t=> {
  const root=await fixture(t),controller=new AbortController();
  await assert.rejects(buildNaicsReference({root,acquire:true,runId:'cancel-a',signal:controller.signal,fetchImpl:async()=> {controller.abort();return new Response('x',{headers:{'content-type':'text/plain'}});}}),{name:'AbortError'});
  const receipt=JSON.parse(await fs.readFile(path.join(root,`data/${DATASET}/runs/cancel-a/receipt.json`)));assert.equal(receipt.stage,'cancelled');
  await assert.rejects(fs.stat(path.join(root,`data/${DATASET}/runs/cancel-a/manifest.json`)),{code:'ENOENT'});
  await assert.rejects(buildNaicsReference({root,acquire:true,runId:'../escape'}),/run identifier/);
});
test('explicit contract rebind replays retained bytes and emits a new release without changing the old release',async t=> {
  const root=await fixture(t),file=path.join(root,`config/source-policies/${DATASET}.json`),original=await fs.readFile(path.join(root,MANIFEST));
  await fs.appendFile(file,'\n');
  await assert.rejects(verifyNaicsReference(MANIFEST,{root}),/contract drift/);
  await assert.rejects(buildNaicsReference({root,replayManifest:MANIFEST,runId:'strict-replay'}),/contract drift/);
  const result=await buildNaicsReference({root,replayManifest:MANIFEST,rebindContracts:true,runId:'rebind-a',fetchImpl:()=>assert.fail('network called')});
  assert.notEqual(result.manifest.release_id,JSON.parse(original).release_id);assert.equal(result.manifest.code_count,12743);
  assert((await fs.readFile(path.join(root,MANIFEST))).equals(original));await verifyNaicsReference(result.manifestPath,{root});
});
