import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pageUrl=new URL('../app/data-operations.tsx',import.meta.url);

test('Data Operations exposes bounded Utah and Oklahoma offline package controls',async()=>{
  const ui=await readFile(pageUrl,'utf8');
  for(const expected of[
    'Process a Utah Business List package',
    'Utah Business List package selection',
    'data/imports/utah-business-list/packages/package-id/selection.json',
    "post<Operation>('/ut-business-list',{selection:utahBusinessSelection})",
    'Process an Oklahoma Business Bulk package',
    'Oklahoma Business Bulk package selection',
    'data/imports/oklahoma-business-bulk/packages/package-id/selection.json',
    "post<Operation>('/ok-business-bulk',{selection:oklahomaBusinessSelection})",
  ]) assert.ok(ui.includes(expected),`missing UI contract: ${expected}`);
  assert.match(ui,/\^data\\\/imports\\\/utah-business-list\\\/packages\\\//);
  assert.match(ui,/\^data\\\/imports\\\/oklahoma-business-bulk\\\/packages\\\//);
  assert.doesNotMatch(ui,/Utah[^\n]*(?:URL|token|password|secret)/i);
  assert.doesNotMatch(ui,/Oklahoma[^\n]*(?:URL|token|password|secret)/i);
});

test('Utah and Oklahoma cards state hold boundaries and use shared durable history',async()=>{
  const ui=await readFile(pageUrl,'utf8');
  const utah=ui.slice(ui.indexOf('<section aria-labelledby="utah-business-list-title"'),ui.indexOf('<section aria-labelledby="oklahoma-business-bulk-title"'));
  const oklahoma=ui.slice(ui.indexOf('<section aria-labelledby="oklahoma-business-bulk-title"'),ui.indexOf('<BroadOrganizationAuthorizationPacket'));
  for(const expected of['Zero-network','operator-supplied','local-review-only','on HOLD','not source-native','authenticity','reproducible extraction','not admitted','no acquisition','terminal receipts','restart-persistent history','not offered as downloadable artifacts']) assert.match(utah,new RegExp(expected,'i'));
  for(const expected of['Zero-network','operator-supplied','administrative organization-address evidence only','not a physical-site list','proof of current operation','local-review-only','on HOLD','not admitted','no acquisition','purchase','account action','terminal receipts','restart-persistent history','not offered as downloadable artifacts']) assert.match(oklahoma,new RegExp(expected,'i'));
  assert.match(ui,/\['RUNNING', 'QUEUED'\]\.includes\(operation\.status\)[^\n]+\/cancel/);
  assert.match(ui,/operation\.artifacts\.map[^\n]+Download/);
});
