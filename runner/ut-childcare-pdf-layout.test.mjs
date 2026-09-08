import test from 'node:test';
import assert from 'node:assert/strict';
import { UT_CHILDCARE_COLUMNS, UT_CHILDCARE_GRID, validateUtChildcarePdfLayout } from './ut-childcare-pdf-layout.mjs';

const row = (id = 'F26-1', category = 'Child Care Center') => [
  'Synthetic Center', id, '555-0100', '10 Test Road', '', 'Test City', 'UT', 'Test County',
  '00100', category, '20', '02/28/2027', '02/29/2024',
];
const glyphs = (text, x0, top, width = 1) => [...text].map((character, index) => ({
  text: character, x0: x0 + index * width, x1: x0 + (index + 1) * width, top, bottom: top + 3,
}));
function line(cells, top) {
  return cells.flatMap((text, index) => glyphs(text, UT_CHILDCARE_GRID[index] + 0.5, top, 0.7));
}
function fixture(rows = [row()], pages = 1) {
  return {
    schema_version: 'ut-childcare-decoded-glyphs@1.0.0', report_edition: 'September 2026', page_count: pages,
    pages: Array.from({ length: pages }, (_, index) => ({
      page_number: index + 1, width: 792, height: 612, column_boundaries: [...UT_CHILDCARE_GRID],
      glyphs: [...glyphs('All Regulated Child Care Facilities', 50, 40), ...glyphs('DATE: September 2026', 50, 55),
        ...line(UT_CHILDCARE_COLUMNS, 72.97), ...rows.flatMap((cells, ri) => line(
          cells.map((value, ci) => ci === 1 ? `${value}${index}` : value), 80.757 + ri * 7.375))],
    })),
  };
}
function rejects(mutator, code) {
  const input = fixture();
  mutator(input);
  assert.throws(() => validateUtChildcarePdfLayout(input), (error) => error.code === `UT_LAYOUT_${code}`);
}

test('conserves all source rows before exact category selection; excludes phone and inferred status', () => {
  const selected = row(); selected[8] = '00100-1234';
  const input = fixture([selected, row('F26-2', 'Child Care Hourly Center')], 2);
  for (const page of input.pages) page.glyphs.reverse();
  const result = validateUtChildcarePdfLayout(input);
  assert.equal(result.total_rows, 4);
  assert.equal(result.distinct_facility_ids, 4);
  assert.equal(result.selected_rows, 2);
  assert.deepEqual(result.rows_per_page, [2, 2]);
  assert.deepEqual(result.license_type_counts, { 'Child Care Center': 2, 'Child Care Hourly Center': 2 });
  assert.equal(result.observations[0].zip5, '00100');
  assert.equal(result.observations[0].zip4, '1234');
  assert.equal(result.observations[0].operating_status, null);
  assert.equal(result.observations[0].address_role, null);
  assert.equal(result.observations[0].latitude, null);
  assert.equal(result.observations[0].longitude, null);
  assert.equal(JSON.stringify(result).includes('555-0100'), false);
  assert.deepEqual(result.observations[0].source_page, 1);
});

test('does not hardcode observed release counts, IDs, month or ZIP4 presence', () => {
  const input = fixture();
  input.report_edition = 'October 2026';
  input.pages[0].glyphs = input.pages[0].glyphs.filter((glyph) => glyph.top !== 55);
  input.pages[0].glyphs.push(...glyphs('DATE: October 2026', 50, 55));
  const result = validateUtChildcarePdfLayout(input);
  assert.equal(result.total_rows, 1);
  assert.equal(result.observations[0].zip4, null);
});

test('rejects page omissions, repeats, dimensions and shifted measured grid', () => {
  rejects((d) => d.page_count++, 'PAGE_INVENTORY');
  rejects((d) => d.pages[0].page_number++, 'PAGE_ORDER');
  rejects((d) => d.pages[0].width = 612, 'PAGE_GEOMETRY');
  rejects((d) => d.pages[0].column_boundaries[2]++, 'COLUMN_GRID');
  rejects((d) => d.pages[0].column_boundaries[2] = NaN, 'COLUMN_GRID');
});

test('rejects missing, duplicated, changed or misplaced headings and headers', () => {
  rejects((d) => d.pages[0].glyphs = d.pages[0].glyphs.filter((g) => g.top !== 72.97), 'HEADERS');
  rejects((d) => d.pages[0].glyphs.push(...line(UT_CHILDCARE_COLUMNS, 73.5)), 'ROW_BASELINES');
  rejects((d) => d.pages[0].glyphs.find((g) => g.top === 72.97).text = 'X', 'HEADERS');
  rejects((d) => d.pages[0].glyphs.push(...glyphs('unexpected notice', 50, 60)), 'REPORT_HEADINGS');
});

test('rejects glyph merges, crossing, overlaps, invalid dimensions and unconsumed footer', () => {
  rejects((d) => d.pages[0].glyphs[0].text = 'AB', 'GLYPH_GEOMETRY');
  rejects((d) => d.pages[0].glyphs[0].x0 = -1, 'GLYPH_GEOMETRY');
  rejects((d) => d.pages[0].glyphs.push({ ...d.pages[0].glyphs[0] }), 'OVERLAPPING_GLYPHS');
  rejects((d) => d.pages[0].glyphs.push({ text: 'X', x0: 186, x1: 187, top: 80.757, bottom: 84 }), 'CROSS_COLUMN_GLYPH');
  rejects((d) => d.pages[0].glyphs.push(...glyphs('footer', 50, 590)), 'ROW_BASELINES');
  rejects((d) => d.pages[0].glyphs.find((g) => g.top === 80.757).top += 1, 'ROW_BASELINES');
});

test('allows measured forward kerning but rejects excessive or contained glyph overlaps', () => {
  const input = fixture();
  const heading = input.pages[0].glyphs.filter((g) => g.top === 40);
  heading[0].x1 += 0.4;
  assert.equal(validateUtChildcarePdfLayout(input).selected_rows, 1);
  heading[0].x1 += 0.1;
  assert.throws(() => validateUtChildcarePdfLayout(input), { code: 'UT_LAYOUT_OVERLAPPING_GLYPHS' });
  heading[0].x1 = heading[1].x1;
  assert.throws(() => validateUtChildcarePdfLayout(input), { code: 'UT_LAYOUT_OVERLAPPING_GLYPHS' });
});

test('rejects malformed and duplicate identifiers and unknown categories before filtering', () => {
  const bad = row('not-an-id', 'Child Care Hourly Center');
  assert.throws(() => validateUtChildcarePdfLayout(fixture([bad])), { code: 'UT_LAYOUT_FACILITY_ID' });
  assert.throws(() => validateUtChildcarePdfLayout(fixture([row(), row()])), { code: 'UT_LAYOUT_DUPLICATE_FACILITY_ID' });
  assert.throws(() => validateUtChildcarePdfLayout(fixture([row('F26-2', 'New Category')])) , { code: 'UT_LAYOUT_UNKNOWN_LICENSE_TYPE' });
});

test('rejects missing center fields, wrong state, joined ZIP, capacity and invalid calendar dates', () => {
  for (const [index, value, code] of [[0, '', 'CENTER_REQUIRED_FIELDS'], [3, '', 'CENTER_REQUIRED_FIELDS'],
    [6, 'CO', 'CENTER_REQUIRED_FIELDS'], [8, '001001234', 'CENTER_ZIP_SHAPE'],
    [10, '-1', 'CENTER_CAPACITY'], [11, '02/30/2027', 'CENTER_DATE'], [12, '02/29/2025', 'CENTER_DATE']]) {
    const cells = row(); cells[index] = value;
    assert.throws(() => validateUtChildcarePdfLayout(fixture([cells])), { code: `UT_LAYOUT_${code}` });
  }
});

test('fails resource limits and cancellation without partial observations or source data in errors', () => {
  rejects((d) => { d.page_count = 101; d.pages = Array(101).fill(d.pages[0]); }, 'PAGE_INVENTORY');
  rejects((d) => d.pages[0].glyphs = Array(30_001).fill(d.pages[0].glyphs[0]), 'GLYPH_BUDGET');
  assert.throws(() => validateUtChildcarePdfLayout(fixture(), { signal: AbortSignal.abort() }), { name: 'AbortError' });
  let calls = 0;
  assert.throws(() => validateUtChildcarePdfLayout(fixture(), { signal: { get aborted() { return ++calls > 25; } } }), { name: 'AbortError' });
  const cells = row(); cells[1] = 'private bad value';
  assert.throws(() => validateUtChildcarePdfLayout(fixture([cells])), (error) => !error.message.includes('private bad value'));
});
