import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, link, unlink, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { normalizeNhVisibleResults as normalize, readNhRetainedVisible, buildNhVisibleNormalization, inspectNhVisibleNormalization, NH_RETAINED_VISIBLE } from './nh-childcare-visible-normalization.mjs';
import { profileNhVisibleResults as original, NH_VISIBLE_SCOPE as S } from './nh-childcare-visible-results.mjs';
const sample = (line = 'Hanover, New Hampshire 03755-0123', street = '1 Example Street,') => ({ programType: S.programType,
  zip5: S.zip5, completed: true, displayedRows: 1, visibleRows: 1, rows: [{ name: 'Example Center',
    detail_url: 'https://new-hampshire.my.site.com/nhccis/NH_childcaresearchaccountdetail?id=fixture1', address_lines: [street, line] }] });
test('NH offline normalization recognizes observed full state without changing v1 or source lines', () => {
  const input = sample(), copy = structuredClone(input), old = original(input), result = normalize(input);
  assert.equal(old.candidates[0].address.parsed, false); assert.deepEqual(original(input), old); assert.deepEqual(input, copy);
  assert.equal(result.schema_version, 'nh-visible-results@1.1.0'); assert.deepEqual(result.selected, input);
  assert.deepEqual(result.candidates[0].address.source_lines, input.rows[0].address_lines);
  assert.equal(result.candidates[0].address.state, 'NH'); assert.equal(result.candidates[0].address.zip5, '03755');
  assert.equal(result.candidates[0].address.zip4, '0123'); assert.equal(result.candidates[0].latitude, null);
  assert.equal(result.candidates[0].current_operations_verified, false); assert.equal(result.public_export_authorized, false);
});
test('NH normalization preserves off-query ZIP and unresolved/redacted address boundaries', () => {
  const other = normalize(sample('Lebanon, New Hampshire 03766')).candidates[0];
  assert.equal(other.address.zip5, '03766'); assert.equal(other.address.zip4, null); assert.equal(other.query_zip_relation, 'differs');
  for (const input of [sample('Hanover, New Hampshire'), sample('Hanover, New Hampshire 00000'), sample('Hanover, New Hampshre 03755'), sample(undefined, 'Hidden,')]) {
    const row = normalize(input).candidates[0]; assert.equal(row.address.parsed, false); assert.equal(row.address.zip5, null);
  }
  assert.equal(normalize(sample('Hanover, NH 03755')).candidates[0].address.state, 'NH');
});
test('NH normalization keeps settled zero and rejects invalid selected evidence', () => {
  assert.equal(normalize({ ...sample(), displayedRows: 0, visibleRows: 0, rows: [] }).source_rows, 0);
  assert.throws(() => normalize({ ...sample(), zip5: '03766' }));
  const extra = sample(); extra.rows[0].phone = 'PRIVATE'; assert.throws(() => normalize(extra));
});
test('NH retained builder and inspector reject pre-abort and unsafe targets before output work', async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(buildNhVisibleNormalization({ signal })); await assert.rejects(readNhRetainedVisible({ signal }));
  for (const target of ['manifest.json', 'C:\\manifest.json', null]) await assert.rejects(inspectNhVisibleNormalization(target));
});
test('NH native retained evidence replays offline into six full-state addresses', { skip: process.env.DATAHUB_TEST_NH_RETAINED !== '1' }, async () => {
  const source = await readNhRetainedVisible(); const result = normalize(source.observation.selected);
  assert.equal(result.source_rows, 6); assert.equal(result.candidates.filter(row => row.address.parsed).length, 6);
  assert.equal(result.candidates.filter(row => row.address.zip5 === '03755' && row.address.zip4 === null).length, 6);
  assert.equal(source.observed_at, '2026-09-10T17:57:56.067Z');
});
test('NH published normalization survives independent repeated reads without treating access time as mutation', {
  skip: !process.env.DATAHUB_TEST_NH_NORMALIZED_MANIFEST,
}, async () => {
  const first = await inspectNhVisibleNormalization(process.env.DATAHUB_TEST_NH_NORMALIZED_MANIFEST);
  const second = await inspectNhVisibleNormalization(first.manifest, { expectedSha256: first.sha256 });
  assert.deepEqual(second, first); assert.equal(first.counts.parsed_addresses, 6); assert.equal(first.counts.source_rows, 6);
  assert.equal(first.source_requests_this_build, 0); assert.equal(first.source_observed_at, '2026-09-10T17:57:56.067Z');
});
test('NH isolated retained fixture rejects pending publication and modified normalized content', {
  skip: !process.env.DATAHUB_TEST_NH_NORMALIZED_MANIFEST,
}, async () => {
  const descriptor = await inspectNhVisibleNormalization(process.env.DATAHUB_TEST_NH_NORMALIZED_MANIFEST);
  const root = path.join(APP_ROOT, 'data/tmp/nh-normalization-recovery-tests', randomUUID());
  const source = path.join(root, NH_RETAINED_VISIBLE.manifest);
  const manifest = path.join(root, 'data/business-sources/nh-childcare/visible-normalizations', descriptor.run_id, 'manifest.json');
  await mkdir(path.dirname(source), { recursive: true }); await mkdir(path.dirname(manifest), { recursive: true });
  await copyFile(path.join(APP_ROOT, NH_RETAINED_VISIBLE.manifest), source);
  await copyFile(descriptor.manifest, manifest);
  const execute = () => promisify(execFile)(process.execPath, ['scripts/normalize-nh-childcare-visible.mjs', 'inspect', '--manifest', manifest], {
    cwd: APP_ROOT, env: { ...process.env, DATAHUB_ROOT: root }, timeout: 15000,
  });
  await execute();
  const pending = path.join(path.dirname(manifest), 'manifest.pending'); await link(manifest, pending);
  await assert.rejects(execute(), error => error.code === 1);
  await unlink(pending); await execute();
  const altered = JSON.parse(await readFile(manifest, 'utf8')); altered.counts.parsed_addresses = 999;
  await writeFile(manifest, JSON.stringify(altered)); await assert.rejects(execute(), error => error.code === 1);
  assert.deepEqual(await readFile(source), await readFile(path.join(APP_ROOT, NH_RETAINED_VISIBLE.manifest)));
});
