import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';

test('management geography presents point-assigned profile evidence separately from ZIP/ZCTA correspondence', async () => {
  const ui = await readFile(`${APP_ROOT}/app/business-intelligence.tsx`, 'utf8');
  assert.match(ui, /point_assigned_source_profile_evidence_rows_by_source\?: Record<string, number>/);
  assert.match(ui, /point_assignment_manifest_sha256\?: string/);
  assert.match(ui, /county point assignment \{record\.geography_relationship\.point_assignment\.status/);
  assert.match(ui, /ZIP\/ZCTA is code correspondence only, not polygon membership/);
  assert.match(ui, /USPS validity is unknown/);
  assert.match(ui, /Source-reported state remains separate/);
  assert.doesNotMatch(ui, /current_operation_verified:\s*true/);
});
