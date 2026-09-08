/**
 * Pure, synchronous prerequisite; never decodes PDFs, fetches, writes, or publishes.
 * Input: {schema_version:'ut-childcare-decoded-glyphs@1.0.0', report_edition,
 * page_count, pages:[{page_number,width,height,column_boundaries,glyphs:[
 * {text,x0,x1,top,bottom}]}]}. Coordinates are PDF points, top-left origin.
 * Each glyph is ONE Unicode code point (including explicit source spaces).
 * The decoder must supply every page and glyph, in any glyph order, and actual
 * measured header-rule x coordinates; it must not manufacture expected rules,
 * headings or whitespace. Page count must come from the PDF page tree.
 * Source hash/length verification, PDF decoding safety and source-use policy are
 * separate prerequisites; this function cannot authenticate a decoded inventory.
 * Version 1 deliberately accepts only the observed landscape, single-line table
 * family. Changed layouts fail closed for review, not guessed extraction.
 */
export const UT_CHILDCARE_LAYOUT_VERSION = 'ut-childcare-pdf-layout@1.0.0';
export const UT_CHILDCARE_COLUMNS = Object.freeze([
  'Facility name', 'Facility ID', 'Phone number', 'Address line 1', 'Addres line 2',
  'City', 'State', 'County', 'ZIP code', 'License type', 'Capacity',
  'License expiration date', 'Initial regulation date',
]);
export const UT_CHILDCARE_GRID = Object.freeze([
  50.105, 186.398, 216.489, 265.46, 335.671, 405.883, 446.004,
  474.324, 502.94, 528.015, 612.682, 641.593, 693.514, 741.6,
]);
const CATEGORIES = new Set([
  'Child Care Exempt Program', 'Child Care Licensed Family',
  'Child Care Commercial Preschool', 'Child Care Center',
  "DWS Approved, FFN in Child's Home", 'DWS Approved, Exempt Center',
  'DWS Approved, Exempt School Age Program', "DWS Approved, FFN in Provider's Home",
  'Child Care Residential Certificate', 'Child Care Hourly Center',
  'Child Care Out of School Time Program',
]);
const MAX_PAGES = 100;
const MAX_GLYPHS = 1_000_000;
const MAX_PAGE_GLYPHS = 30_000;
const HEADER_TOP = 72.97;
const FIRST_ROW_TOP = 80.757;
const close = (a, b, tolerance = 0.1) => Math.abs(a - b) <= tolerance;
const clean = (value) => value.trim().replace(/ +/g, ' ');

function reject(code, page = null, row = null) {
  const error = new Error(`Utah childcare layout rejected: ${code}${page ? ` (page ${page}${row ? `, row ${row}` : ''})` : ''}`);
  error.code = `UT_LAYOUT_${code}`;
  throw error;
}

function cancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('Utah childcare layout validation cancelled');
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    throw error;
  }
}

function textOf(glyphs, page) {
  const sorted = [...glyphs].sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const overlap = previous.x1 - current.x0;
    // PDF glyph boxes include font advance widths; legitimate kerning overlaps
    // those boxes. The assessed unmodified 31-page source has 22,092 overlaps
    // above .015pt, maximum .442952pt / .421687 of the narrower glyph width.
    // Preserve characters; accept only bounded, forward-moving kerning. Equal
    // origins, contained/duplicate boxes and excessive overlaps stay ambiguous.
    const narrower = Math.min(previous.x1 - previous.x0, current.x1 - current.x0);
    if (current.x0 <= previous.x0 || current.x1 <= previous.x1
      || overlap > 0.45 || overlap / narrower > 0.43) reject('OVERLAPPING_GLYPHS', page);
  }
  return clean(sorted.map((glyph) => glyph.text).join(''));
}

function cellsOf(glyphs, grid, page) {
  const cells = Array.from({ length: 13 }, () => []);
  for (const glyph of glyphs) {
    const column = grid.findIndex((left, index) => index < 13 && glyph.x0 >= left && glyph.x1 <= grid[index + 1]);
    if (column < 0) reject('CROSS_COLUMN_GLYPH', page);
    cells[column].push(glyph);
  }
  return cells.map((cell) => textOf(cell, page));
}

function linesOf(glyphs) {
  const sorted = [...glyphs].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const lines = [];
  for (const glyph of sorted) {
    const last = lines.at(-1);
    if (!last || !close(last.top, glyph.top)) lines.push({ top: glyph.top, glyphs: [glyph] });
    else last.glyphs.push(glyph);
  }
  return lines;
}

function validDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return false;
  const [, month, day, year] = match.map(Number);
  if (year < 1900 || year > 2199) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Returns center-only source observations plus before-filter row/category counts.
 * No phone is returned. ZIP4 is separate; no point, physical-address role, current
 * operating status or national completeness is inferred. Cancellation is checked
 * at document/page/glyph/row boundaries; invoke in a worker for message-driven
 * cancellation since this synchronous CPU function does not yield the event loop.
 */
export function validateUtChildcarePdfLayout(document, { signal } = {}) {
  cancelled(signal);
  if (!document || document.schema_version !== 'ut-childcare-decoded-glyphs@1.0.0') reject('INPUT_SCHEMA');
  if (!/^(January|February|March|April|May|June|July|August|September|October|November|December) 20\d{2}$/.test(document.report_edition)) reject('EDITION');
  if (!Number.isInteger(document.page_count) || document.page_count < 1 || document.page_count > MAX_PAGES
    || !Array.isArray(document.pages) || document.pages.length !== document.page_count) reject('PAGE_INVENTORY');
  const observations = [];
  const ids = new Set();
  const licenseTypeCounts = Object.create(null);
  const rowsPerPage = [];
  let totalGlyphs = 0;
  let totalRows = 0;
  for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex++) {
    cancelled(signal);
    const page = document.pages[pageIndex];
    const number = pageIndex + 1;
    if (!page || page.page_number !== number) reject('PAGE_ORDER', number);
    if (!Number.isFinite(page.width) || !Number.isFinite(page.height)
      || !close(page.width, 792) || !close(page.height, 612)) reject('PAGE_GEOMETRY', number);
    const grid = page.column_boundaries;
    if (!Array.isArray(grid) || grid.length !== 14
      || grid.some((x, index) => !Number.isFinite(x) || !close(x, UT_CHILDCARE_GRID[index]))) reject('COLUMN_GRID', number);
    if (!Array.isArray(page.glyphs) || page.glyphs.length < 1 || page.glyphs.length > MAX_PAGE_GLYPHS) reject('GLYPH_BUDGET', number);
    totalGlyphs += page.glyphs.length;
    if (totalGlyphs > MAX_GLYPHS) reject('GLYPH_BUDGET', number);
    for (const glyph of page.glyphs) {
      cancelled(signal);
      if (!glyph || typeof glyph.text !== 'string' || [...glyph.text].length !== 1
        || /[\p{C}\p{Zl}\p{Zp}]/u.test(glyph.text)
        || ![glyph.x0, glyph.x1, glyph.top, glyph.bottom].every(Number.isFinite)
        || glyph.x0 < 0 || glyph.x1 > page.width || glyph.x1 <= glyph.x0
        || glyph.top < 0 || glyph.bottom > page.height || glyph.bottom <= glyph.top) reject('GLYPH_GEOMETRY', number);
    }
    const lines = linesOf(page.glyphs);
    const headings = lines.filter((line) => line.top < HEADER_TOP - 0.1).map((line) => textOf(line.glyphs, number));
    if (headings.length !== 2 || headings[0] !== 'All Regulated Child Care Facilities'
      || headings[1] !== `DATE: ${document.report_edition}`) reject('REPORT_HEADINGS', number);
    const headers = lines.filter((line) => close(line.top, HEADER_TOP));
    if (headers.length !== 1 || cellsOf(headers[0].glyphs, grid, number).some((text, index) => text !== UT_CHILDCARE_COLUMNS[index])) reject('HEADERS', number);
    const rows = lines.filter((line) => line.top > HEADER_TOP + 0.1);
    if (!rows.length || rows.length > 65 || !close(rows[0].top, FIRST_ROW_TOP)
      || rows.some((line, index) => line.top > 560 || (index > 0 && !close(line.top - rows[index - 1].top, 7.375, 0.15)))) reject('ROW_BASELINES', number);
    rowsPerPage.push(rows.length);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      cancelled(signal);
      const row = rowIndex + 1;
      const cells = cellsOf(rows[rowIndex].glyphs, grid, number);
      const id = cells[1];
      if (!/^F\d{2}-\d+$/.test(id)) reject('FACILITY_ID', number, row);
      if (ids.has(id)) reject('DUPLICATE_FACILITY_ID', number, row);
      ids.add(id);
      const category = cells[9];
      if (!CATEGORIES.has(category)) reject('UNKNOWN_LICENSE_TYPE', number, row);
      licenseTypeCounts[category] = (licenseTypeCounts[category] ?? 0) + 1;
      totalRows++;
      if (category !== 'Child Care Center') continue;
      if ([0, 3, 5, 7].some((index) => !cells[index]) || cells[6] !== 'UT') reject('CENTER_REQUIRED_FIELDS', number, row);
      const zip = /^(\d{5})(?:-(\d{4}))?$/.exec(cells[8]);
      if (!zip) reject('CENTER_ZIP_SHAPE', number, row);
      if (!/^\d+$/.test(cells[10]) || !Number.isSafeInteger(Number(cells[10]))) reject('CENTER_CAPACITY', number, row);
      if (!validDate(cells[11]) || !validDate(cells[12])) reject('CENTER_DATE', number, row);
      observations.push({
        source_page: number, source_row: row, facility_id: id, facility_name: cells[0],
        address_line_1: cells[3], address_line_2: cells[4] || null,
        city: cells[5], state: cells[6], county: cells[7], zip5: zip[1], zip4: zip[2] ?? null,
        license_type: category, capacity: Number(cells[10]),
        license_expiration_date_source: cells[11], initial_regulation_date_source: cells[12],
        operating_status: null, address_role: null, latitude: null, longitude: null,
      });
    }
  }
  cancelled(signal);
  return {
    schema_version: UT_CHILDCARE_LAYOUT_VERSION, report_edition: document.report_edition,
    page_count: document.page_count, rows_per_page: rowsPerPage, total_rows: totalRows,
    distinct_facility_ids: ids.size, license_type_counts: { ...licenseTypeCounts },
    selected_rows: observations.length, observations,
    claims: { source_bytes_verified: false, current_operations_verified: false,
      address_role_verified: false, zip_assignment_verified: false, national_coverage_verified: false },
  };
}
