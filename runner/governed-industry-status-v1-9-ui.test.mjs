import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');
const administration = await readFile(new URL('../app/administration.tsx', import.meta.url), 'utf8');

test('industry status keeps maintenance intent separate from retained evidence', () => {
  assert.match(source, /governed crosswalk below relates compatible retained source dimensions/);
  assert.match(source, /Unavailable or unresolved evidence remains unknown rather than zero/i);
  assert.match(source, /<OperationalMaintenanceIntent\/>/);
  assert.match(source, /<OperationalIndustryCrosswalkStatus state=\{state\}\/>/);
  assert.match(source, /<ExactZipIndustryNationalSummary \/>/);
  assert.doesNotMatch(source, /nine operational maintenance segments and 39 governed source dimensions/);
});

test('selected-state crosswalk is abortable, state-keyed, and labels its nonadditive percentages', () => {
  assert.match(source, /operational-industry-evidence\?state=/);
  assert.match(source, /result\?\.state===state/);
  assert.match(source, /controller\.signal\.aborted/);
  assert.match(source, /return\(\)=>controller\.abort\(\)/);
  assert.match(source, /Exact-ZIP measurement reach/);
  assert.match(source, /ZIP5-by-source-dimension cells/);
  assert.match(source, /not businesses or industry completeness/);
  assert.match(source, /Non-ZCTA, materially cross-state, unresolved, and placeholder ZIP evidence stays outside the state denominator/);
  assert.match(source, /ZIP\+4 remains separate/);
});

test('nonblocking geography states remain visible without unsupported classification', () => {
  for (const phrase of ['Census ZCTA', 'Private or special-purpose ZIP evidence', 'Park or protected land',
    'Tribal or Native territory', 'Unresolved land outside selected ZCTAs',
    'No classification is inferred', 'topology-verified residual artifact is retained separately']) {
    assert.match(source.toLowerCase(), new RegExp(phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /never block retained source evidence/);
  assert.match(source, /not business completeness or ZIP-validity decisions/);
  assert.match(source, /does not infer a ZIP, population, park, tribal\/Native, private-land, or business status/);
});

test('Administration retains explicit persisted maintenance controls', () => {
  assert.match(administration, /Choose which industry programs Co\*Tive should maintain/);
  assert.match(administration, /Select all/);
  assert.match(administration, /Select none/);
  assert.match(administration, /expectedRevision/);
  assert.match(administration, /maintenance intent/i);
});
