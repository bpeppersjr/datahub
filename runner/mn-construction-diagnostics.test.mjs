import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { processMnConstructionSelectedStream } from './mn-construction-selected-stream.mjs';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { mnConstructionFailure, mnConstructionDiagnostic, validMnConstructionDiagnostic, mnConstructionCsvFailure } from './mn-construction-diagnostics.mjs';

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
  assert.equal(mnConstructionDiagnostic(mnConstructionCsvFailure(Object.assign(Error('PRIVATE'),{code:'CSV_QUOTE_NOT_CLOSED'}))),'source-stream-failed');
  assert.equal(validMnConstructionDiagnostic('source-csv-invalid'),true); // Historical sidecars remain valid.
});
for(const [name,suffix,expected] of [
  ['malformed one-column byte tail',Buffer.from([0xff]),'source-csv-column-count'],
  ['unterminated CSV',Buffer.from('"PRIVATE unclosed'),'source-csv-unclosed-quote'],
  ['opening quote in an unquoted field',Buffer.from('PRIVATE"bad\r\n'),'source-csv-opening-quote'],
  ['invalid closing quote',Buffer.from('"PRIVATE"bad\r\n'),'source-csv-closing-quote'],
  ['oversized record',Buffer.from('"PRIVATE'+ 'x'.repeat(65537)+'"\r\n'),'source-csv-record-limit'],
])test(`MN diagnostic for ${name} retains no raw source in error`,async()=>{
  await assert.rejects(processMnConstructionSelectedStream(Readable.from([prefix,suffix]),{context,emit:async()=>{}}),error=>{
    assert.equal(mnConstructionDiagnostic(error),expected);
    assert.equal(mnConstructionDiagnostic(mnConstructionFailure(error,'acquisition-selection-failed')),expected);
    assert.doesNotMatch(error.message+JSON.stringify(error)+error.stack,/PRIVATE/);assert.equal(error.cause,undefined);return true;
  });
});
test('MN header mismatch is distinguished without exposing the unexpected header',async()=>{
  await assert.rejects(processMnConstructionSelectedStream(Readable.from([Buffer.from('PRIVATE,unexpected\r\n')]),{context,emit:async()=>{}}),error=>{
    assert.equal(mnConstructionDiagnostic(error),'source-csv-header-mismatch');assert.doesNotMatch(error.message+JSON.stringify(error),/PRIVATE/);return true;
  });
});
test('MN selected sink failure is classified without leaking its message',async()=>{
  await assert.rejects(processMnConstructionSelectedStream(Readable.from([prefix]),{context,emit:async()=>{throw Error('PRIVATE filesystem detail');}}),error=>{
    assert.equal(mnConstructionDiagnostic(error),'selected-frame-failed');assert.doesNotMatch(error.message,/PRIVATE/);return true;
  });
});
