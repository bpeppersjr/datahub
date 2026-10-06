import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');
const administration = await readFile(new URL('../app/administration.tsx', import.meta.url), 'utf8');

test('industry status keeps maintenance intent separate from retained evidence', () => {
  assert.match(source, /nine operational maintenance segments and governed source dimensions are separate taxonomies/);
  assert.match(source, /unavailable or unresolved evidence remains unknown rather than zero/);
  assert.match(source, /<OperationalMaintenanceIntent\/>/);
  assert.match(source, /<ExactZipIndustryNationalSummary \/>/);
  assert.doesNotMatch(source, /nine operational maintenance segments and 39 governed source dimensions/);
});

test('nonblocking geography states remain visible without unsupported classification', () => {
  for (const phrase of ['Census ZCTA', 'Private or special-purpose ZIP evidence', 'Park or protected land',
    'Tribal or Native territory', 'Unresolved land outside selected ZCTAs',
    'No classification is inferred', 'state plus cardinal/central fallback partitions remain unavailable']) {
    assert.match(source.toLowerCase(), new RegExp(phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /never block retained source evidence/);
  assert.match(source, /not business completeness or ZIP-validity decisions/);
});

test('Administration retains explicit persisted maintenance controls', () => {
  assert.match(administration, /Choose which industry programs Co\*Tive should maintain/);
  assert.match(administration, /Select all/);
  assert.match(administration, /Select none/);
  assert.match(administration, /expectedRevision/);
  assert.match(administration, /maintenance intent/i);
});
