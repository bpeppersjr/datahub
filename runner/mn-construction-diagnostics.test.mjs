import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { processMnConstructionSelectedStream } from './mn-construction-selected-stream.mjs';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { mnConstructionFailure, mnConstructionDiagnostic, validMnConstructionDiagnostic } from './mn-construction-diagnostics.mjs';

const context={runId:'diagnostic-fixture',sourceReleaseId:'diagnostic-release',observedAt:'2026-09-08T12:00:00.000Z',cohort:'registrations'};
const row={...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Status:'Issued',Name:'Synthetic contractor',Lic_Number:'IR123456',St:'MN',Zip:'55001-1234'};
const prefix=Buffer.from(MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+MN_CONSTRUCTION_COLUMNS.map(k=>JSON.stringify(row[k])).join(',')+'\r\n');
test('MN diagnostics preserve trusted finite classifications without untrusted error details',()=>{
  const untrusted=Object.assign(new Error('PRIVATE parser row'),{code:'source-utf8-invalid',cause:'PRIVATE'});
  assert.equal(mnConstructionDiagnostic(untrusted),'app-finalization-failed');
  const tagged=mnConstructionFailure(untrusted,'source-csv-invalid');
  assert.equal(mnConstructionDiagnostic(mnConstructionFailure(tagged,'retained-selection-failed')),'source-csv-invalid');
  assert.equal(validMnConstructionDiagnostic('PRIVATE'),false);
  assert.doesNotMatch(JSON.stringify(tagged)+tagged.message,/PRIVATE/);
  assert.throws(()=>mnConstructionFailure(untrusted,'PRIVATE'));
});
for(const [name,suffix,expected] of [
  ['invalid UTF-8',Buffer.from([0xff]),'source-utf8-invalid'],
  ['unterminated CSV',Buffer.from('"PRIVATE unclosed'),'source-csv-invalid'],
])test(`MN diagnostic for ${name} retains no raw source in error`,async()=>{
  await assert.rejects(processMnConstructionSelectedStream(Readable.from([prefix,suffix]),{context,emit:async()=>{}}),error=>{
    assert.equal(mnConstructionDiagnostic(error),expected);assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE/);return true;
  });
});
test('MN selected sink failure is classified without leaking its message',async()=>{
  await assert.rejects(processMnConstructionSelectedStream(Readable.from([prefix]),{context,emit:async()=>{throw Error('PRIVATE filesystem detail');}}),error=>{
    assert.equal(mnConstructionDiagnostic(error),'selected-frame-failed');assert.doesNotMatch(error.message,/PRIVATE/);return true;
  });
});
