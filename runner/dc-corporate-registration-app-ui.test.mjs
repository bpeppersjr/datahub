import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Data Operations exposes a bounded D.C. offline package handoff', async () => {
  const ui = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.match(ui, /D\.C\. Corporate Registration package selection/);
  assert.match(ui, /data\/imports\/dc-corporate-registration\/packages\/package-id\/selection\.json/);
  assert.match(ui, /\/dc-corporate-registration/);
  assert.match(ui, /\{selection:dcCorporateSelection\}/);
  assert.match(ui, /Zero-network, offline processing/i);
  assert.match(ui, /local-review-only/i);
  assert.match(ui, /creates no current pointer/i);
  assert.match(ui, /not admitted to national coverage/i);
  assert.match(ui, /Operation history below/i);
  assert.doesNotMatch(ui, /D\.C\..*(?:token|password|secret)/i);
});

test('D.C. start remains guarded by the exact package selection shape', async () => {
  const ui = await readFile(new URL('../app/data-operations.tsx', import.meta.url), 'utf8');
  assert.ok(ui.includes("/^data\\/imports\\/dc-corporate-registration\\/packages\\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\\/selection\\.json$/"));
  assert.match(ui, /disabled=\{!catalog\|\|!/);
  assert.match(ui, /locked\|\|busy\|\|!!connectionError/);
});
