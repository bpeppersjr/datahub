import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {validateUtChildcarePdfLayout} from './ut-childcare-pdf-layout.mjs';

// Opt-in local integration: CI does not acquire publisher data or install Python.
// This is a test interpreter override, not a production runtime configuration.
const python = process.env.DATAHUB_TEST_PDF_PYTHON;
const digest = '85af831248bac41ffae8eef23145ce8935d58d31c66ce92caa3c99519358e8fa';
const source = path.join(APP_ROOT, 'data/business-sources/ut-childcare/assessments', digest, 'source.pdf');
const decoder = path.join(APP_ROOT, 'scripts/decode-ut-childcare-pdf.py');
const run = args => spawnSync(python, ['-B', decoder, ...args], {
  cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64_000_000, timeout: 60_000,
  windowsHide: true,
});

test('UT retained PDF decoder conserves the observed document without refetching', {skip: !python}, async () => {
  const before = createHash('sha256').update(readFileSync(source)).digest('hex');
  assert.equal(before, digest);
  const result = run([source, digest, 'September 2026']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, 'decoder failed (source contents deliberately omitted)');
  assert.equal(result.stderr, '');
  const decoded = JSON.parse(result.stdout);
  assert.equal(decoded.page_count, 31);
  assert.equal(decoded.pages.reduce((n, page) => n + page.glyphs.length, 0), 259855);
  const assessed = validateUtChildcarePdfLayout(decoded);
  assert.equal(assessed.total_rows, 1961);
  assert.equal(assessed.distinct_facility_ids, 1961);
  assert.equal(assessed.selected_rows, 422);
  assert.deepEqual(assessed.rows_per_page, [65, ...Array(29).fill(64), 40]);
  assert.equal(assessed.observations.length, 422);
  const reference = JSON.parse(readFileSync(path.join(APP_ROOT, 'docs/states/UT-CHILDCARE-LAYOUT-2026-09-08.json')));
  assert.deepEqual(assessed.license_type_counts, reference.license_type_counts);
  assert.equal(assessed.observations.filter(row => row.address_line_2 === null).length, 367);
  for (const row of assessed.observations) {
    assert.equal(row.zip4, null);
    assert.match(row.zip5, /^\d{5}$/);
    assert.equal(row.operating_status, null);
    assert.equal(row.latitude, null);
    assert.equal(row.longitude, null);
    assert.equal(Object.keys(row).some(key => /phone/i.test(key)), false);
  }
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), before);
});

test('UT PDF decoder rejects malformed invocation and hash with redacted errors', {skip: !python}, () => {
  for (const args of [[], [source, '0'.repeat(64), 'September 2026'],
    [source, digest, 'not-an-edition'], [path.join(APP_ROOT, 'package.json'), digest, 'September 2026']]) {
    const result = run(args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.replaceAll('\r\n', '\n'), 'Utah PDF decoding prerequisite rejected.\n');
  }
});

test('UT PDF decoder refuses oversized and non-PDF input before parsing', {skip: !python}, async () => {
  const parent = path.join(APP_ROOT, 'data/tmp');
  await mkdir(parent, {recursive: true});
  const temporary = await mkdtemp(path.join(parent, 'ut-decoder-test-'));
  try {
    for (const bytes of [Buffer.from('not a PDF'), Buffer.from('%PDF-' + 'x'.repeat(500_000))]) {
      const input = path.join(temporary, 'invalid.bin');
      await writeFile(input, bytes);
      const result = run([input, createHash('sha256').update(bytes).digest('hex'), 'September 2026']);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr.replaceAll('\r\n', '\n'), 'Utah PDF decoding prerequisite rejected.\n');
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});
