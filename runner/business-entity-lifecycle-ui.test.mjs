import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('business-name drilldown presents lifecycle evidence without implying verified operations', async () => {
  const source = await readFile(new URL('../app/business-intelligence.tsx', import.meta.url), 'utf8');
  assert.match(source, /lifecycle_release\?: \{ release_id: string; manifest_sha256: string; taxonomy_sha256: string \} \| null/);
  assert.match(source, /lifecycle_eligibility: null \| \{/);
  assert.match(source, /Current operation is unverified; not eligible as an active business\./);
  assert.match(source, /not applicable to reporting-only evidence/);
});
