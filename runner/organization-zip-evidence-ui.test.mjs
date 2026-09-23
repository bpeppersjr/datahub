import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('separate Heatmap panel is paged, minimized, policy explicit, and drops stale requests', async () => {
  const ui = await readFile(new URL('../app/organization-zip-evidence-panel.tsx', import.meta.url), 'utf8');
  const intelligence = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  assert.match(intelligence, /<OrganizationZipEvidencePanel zip5=\{inspectionZip\} \/>/);
  assert.match(ui, /AbortController/); assert.match(ui, /active = true/); assert.match(ui, /active = false; controller\.abort\(\)/);
  assert.match(ui, /value\.zip5 === zip5 && value\.policy_mode === policyMode && value\.publisher_state_filter === \(publisher \|\| null\)/);
  assert.match(ui, /policy_mode: policyMode/); assert.match(ui, /next_cursor/); assert.match(ui, /function previous\(\)/);
  assert.match(ui, /Public-only · omit Delaware records/); assert.match(ui, /Local review · includes restricted Delaware details/);
  assert.match(ui, /policy_excluded_row_count/); assert.match(ui, /not missing or zero evidence/);
  assert.match(ui, /publisher \{row\.publisher_jurisdiction\} · address state \{row\.address_state/);
  assert.match(ui, /not a physical-site or current-operation assertion/);
  assert.doesNotMatch(ui, /map.*source_record_count|business_count.*organization-zip/i);
});
