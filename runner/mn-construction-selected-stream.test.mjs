import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { processMnConstructionSelectedStream as processSource, replayMnConstructionSelectedStream as replay } from './mn-construction-selected-stream.mjs';
const context={runId:'fixture-run',sourceReleaseId:'fixture-release',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential'};
const row=overrides=>({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Status:'Issued',Lic_Number:'BC123456',Name:'Fixture École',St:'MN',Zip:'00501-0012',Phone_No:'SECRET CONTACT',Email_Address:'SECRET EMAIL',...overrides});
const csvRow=r=>MN_CONSTRUCTION_COLUMNS.map(k=>`"${r[k].replaceAll('"','""')}"`).join(',')+'\r\n';
const csv=rows=>Buffer.from('\ufeff'+MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+rows.map(csvRow).join(''));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('MN 1.1 byte framing excludes unresolved selected text but never interprets discarded contact bytes',async()=>{
  const text='\ufeff'+MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+[
    row({Name:'VALID École',Phone_No:'BYTE_MARKER, "quoted"\ncontact'}),row({Name:'BYTE_MARKER PRIVATE'}),row({Bus_Pers:'Person',Name:'BYTE_MARKER PRIVATE'}),row()
  ].map(csvRow).join('');
  const bytes=Buffer.concat(text.split('BYTE_MARKER').flatMap((part,i)=>i?[Buffer.from([0xa4]),Buffer.from(part)]:[Buffer.from(part)]));
  const frames=[];const receipt=await processSource(Readable.from(Array.from(bytes,b=>Buffer.from([b]))),{context,emit:f=>frames.push(f)});
  assert.equal(receipt.schema_version,'mn-construction-selected-stream@1.1.0');assert.equal(receipt.source_file_sha256,sha(bytes));
  assert.deepEqual([receipt.counts.source_records,receipt.counts.accepted_records,receipt.counts.rejected_records],[4,2,2]);
  assert.deepEqual(frames[1],{sequence:2,disposition:'rejected',reason:'invalid-selected-utf8'});assert.equal(frames[2].reason,'not-literal-business-marker');
  assert.equal(frames[0].selected_fields.Name,'VALID École');assert.doesNotMatch(JSON.stringify(frames),/PRIVATE|contact|BYTE_MARKER|¤/);
  const records=[];await replay(frames,receipt,{emit:r=>records.push(r)});assert.equal(records.length,2);assert.equal(records[1].reported_address.zip4,'0012');
});

test('MN replay retains exact 1.0 reason roster and rejects cross-version or invalid scalar text',async()=>{
  const {frames,receipt}=await collect(csv([row()]));const legacy=structuredClone(receipt);
  legacy.schema_version='mn-construction-selected-stream@1.0.0';delete legacy.counts.rejected_by_reason['invalid-selected-utf8'];
  await replay(frames,legacy,{emit:()=>{}});
  const changed=structuredClone(legacy);changed.counts.rejected_by_reason['invalid-selected-utf8']=0;await assert.rejects(replay(frames,changed,{emit:()=>{}}));
  const invalid=structuredClone(frames);invalid[0].selected_fields.Name='\ud800';const rehashed=structuredClone(receipt);
  rehashed.canonical_frames_sha256=sha(invalid.map(f=>JSON.stringify(f)+'\n').join(''));await assert.rejects(replay(invalid,rehashed,{emit:()=>{}}));
});

test('MN byte framing only strips an absolute leading BOM, not BOMs inside quoted headers or values',async()=>{
  const quotedHeader='"\ufeffBus_Pers",'+MN_CONSTRUCTION_COLUMNS.slice(1).join(',')+'\r\n';
  await assert.rejects(collect(Buffer.from(quotedHeader+csvRow(row()))));
  const {frames}=await collect(csv([row({Name:'A\ufeffB'})]));assert.equal(frames[0].selected_fields.Name,'A\ufeffB');
});

async function collect(bytes){const frames=[];const receipt=await processSource(Readable.from([bytes]),{context,emit:f=>{frames.push(f);}});return {frames,receipt};}
test('MN stream measures source bytes and preserves every row disposition without contacts',async()=>{
  const bytes=csv([row(),row({Bus_Pers:'Person',Name:'SECRET PERSON'}),row({Status:'Expired',Name:'SECRET INACTIVE'}),row({Name:''}),row({Name:'Second fixture',Lic_Number:'RR123456'})]);
  const {frames,receipt}=await collect(bytes);assert.equal(receipt.source_bytes,bytes.length);assert.equal(receipt.source_file_sha256,sha(bytes));
  assert.deepEqual([receipt.counts.source_records,receipt.counts.accepted_records,receipt.counts.rejected_records],[5,2,3]);
  assert.ok(!JSON.stringify({frames,receipt}).includes('SECRET'));assert.equal(frames[1].reason,'not-literal-business-marker');
  const records=[];const result=await replay(frames,receipt,{emit:r=>{records.push(r);}});
  assert.equal(result.accepted_records_replayed,true);assert.equal(result.discarded_rejection_values_replayed,false);assert.equal(records.length,2);
  assert.equal(records[0].provenance.source_file_sha256,sha(bytes));assert.equal(records[1].provenance.source_row_number,5);assert.equal(records[0].reported_address.zip4,'0012');
});
test('MN chunk framing handles split UTF-8, quotes and embedded newlines without splitting rows',async()=>{
  const bytes=csv([row({Name:'Fixture "quoted" École'}),row({Name:'Rejected\nmultiline'}),row()]);const frames=[];
  const receipt=await processSource(Readable.from(Array.from(bytes,b=>Buffer.from([b]))),{context,emit:f=>{frames.push(f);}});
  assert.equal(receipt.counts.source_records,3);assert.equal(receipt.counts.accepted_records,2);assert.equal(frames[1].reason,'invalid-selected-text');
  await replay(frames,receipt,{emit:()=>{}});
});
test('MN invalid CSV, UTF-8, headers and parser budgets never produce a completed receipt or raw error',async()=>{
  const header=Buffer.from(MN_CONSTRUCTION_COLUMNS.join(',')+'\n');
  for(const bytes of [Buffer.alloc(0),Buffer.from('wrong,header\n'),Buffer.concat([header,Buffer.from('SECRET,"unfinished')]),Buffer.concat([csv([row()]),Buffer.from([0xc3])]),csv([row({Name:'SECRET'+ 'x'.repeat(66000)})]),Buffer.alloc(50_000_001)]){
    await assert.rejects(collect(bytes),e=>e.message==='Minnesota selected stream failed; no completed receipt.');
  }
  const result=await collect(csv([]));assert.equal(result.receipt.counts.source_records,0);await replay([],result.receipt,{emit:()=>assert.fail('No records')});
});
test('MN replay rejects frame omissions, duplication, added private fields, altered values and false claims',async()=>{
  const original=await collect(csv([row(),row({Status:'Expired'})]));
  for(const change of [x=>x.frames.pop(),x=>x.frames.push(x.frames[0]),x=>{x.frames[0].selected_fields.Phone_No='SECRET';},x=>{x.frames[0].selected_fields.Name='Changed';},x=>{x.frames[1].reason='invented';},x=>{x.receipt.counts.accepted_records++;},x=>{x.receipt.claims.source_authenticity_verified=true;},x=>{x.receipt.source_file_sha256=['a'.repeat(64)];}]){
    const changed=structuredClone(original);change(changed);await assert.rejects(replay(changed.frames,changed.receipt,{emit:()=>{}}));
  }
});
test('MN cancellation stops stalled input and pre-aborted work without a completed receipt',async()=>{
  const source=new Readable({read(){}});const signal=AbortSignal.timeout(30);
  await assert.rejects(processSource(source,{context,signal,emit:()=>assert.fail('No rows')}),e=>e.name==='TimeoutError');assert.equal(source.destroyed,true);
  const controller=new AbortController();controller.abort();let touched=false;
  await assert.rejects(processSource(new Readable({read(){touched=true;}}),{context,signal:controller.signal,emit:()=>{}}));assert.equal(touched,false);
  const data=await collect(csv([row()]));await assert.rejects(replay(data.frames,data.receipt,{signal:controller.signal,emit:()=>assert.fail('No replay')}));
  const stalled=new Readable({objectMode:true,read(){}});
  await assert.rejects(replay(stalled,data.receipt,{signal:AbortSignal.timeout(30),emit:()=>assert.fail('No stalled frame')}),e=>e.name==='TimeoutError');assert.equal(stalled.destroyed,true);
  await assert.rejects(replay({async *[Symbol.asyncIterator](){assert.fail('Unbounded iterables not accepted');}},data.receipt,{emit:()=>{}}));
});
test('MN sink failure is redacted and context/frame mutation cannot rewrite evidence silently',async()=>{
  await assert.rejects(processSource(Readable.from([csv([row()])]),{context,emit:()=>{throw new Error('SECRET DISK ERROR');}}),e=>!e.message.includes('SECRET'));
  const mutable={...context},frames=[];
  const receipt=await processSource(Readable.from([csv([row(),row()])]),{context:mutable,emit:async f=>{mutable.runId='changed';frames.push(structuredClone(f));f.selected_fields.Name='mutated';await new Promise(resolve=>setImmediate(resolve));}});
  assert.equal(receipt.context.runId,context.runId);await replay(frames,receipt,{emit:()=>{}});
  const external=structuredClone(receipt);let seen=0;await replay(frames,external,{emit:r=>{external.context.runId='changed';seen++;assert.equal(r.provenance.ingest_run_id,context.runId);}});assert.equal(seen,2);
});
test('MN awaits each sink write, rejects invalid context before reading, and respects registration scope',async()=>{
  let active=0,max=0;await processSource(Readable.from([csv([row(),row(),row()])]),{context,emit:async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));active--;}});assert.equal(max,1);
  const source=new Readable({read(){assert.fail('Invalid metadata must not read');}});await assert.rejects(processSource(source,{context:{...context,observedAt:'today'},emit:()=>{}}));source.destroy();
  const frames=[];const receipt=await processSource(Readable.from([csv([row({Lic_Number:'IR123456'}),row()])]),{context:{...context,cohort:'registrations'},emit:f=>{frames.push(f);}});
  assert.equal(receipt.counts.accepted_records,1);assert.equal(frames[1].reason,'credential-cohort-mismatch');await replay(frames,receipt,{emit:r=>assert.equal(r.credential.kind,'registration')});
});
test('MN source row ceiling stops before emitting an excess frame',async()=>{
  let emitted=0;const minimal={...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Person'};
  const bytes=Buffer.from(MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+csvRow(minimal).repeat(250001));
  await assert.rejects(processSource(Readable.from([bytes]),{context,emit:()=>{emitted++;}}),/no completed receipt/);
  assert.equal(emitted,250000);
});
