import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getCmsSnfPecosAppStatus} from './cms-snf-pecos-app-status.mjs';

test('PECOS app handoff exposes the production hold without a dispatch route',async()=>{
  const status=await getCmsSnfPecosAppStatus();
  assert.equal(status.nativeExecutionAuthorized,false);
  assert.equal(status.approvedDownloadBudgetBytes,0);
  assert.equal(status.dispatchAvailable,false);
  assert.equal(status.acquisitionReceiptReady,false);
  assert.equal(status.acquisitionReceiptStatus,'not-created-native-execution-held');
  assert.equal(status.policyMatches,true);
  assert.equal(status.retainedDocuments.length,3);
  const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(server,/pecos-acquisitions/);
});

test('PECOS management card is read-only and names both authorization gates',async()=>{
  const [page,operations]=await Promise.all([
    readFile(new URL('../app/cms-snf-pecos-status.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/data-operations.tsx',import.meta.url),'utf8'),
  ]);
  assert.match(page,/nativeExecutionAuthorized/);
  assert.match(page,/approvedDownloadBudgetBytes/);
  assert.match(page,/<button[^>]+disabled/);
  assert.doesNotMatch(page,/runnerJson|post<|fetch\(/);
  assert.match(operations,/<CmsSnfPecosStatusCard status=\{catalog\?\.governedSourceServices/);
});
