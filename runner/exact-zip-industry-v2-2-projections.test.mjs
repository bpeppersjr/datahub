import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readExactZipIndustryEvidenceWithTemporalQualificationV22 as temporal } from './exact-zip-industry-temporal-qualification-v2-2.mjs';
import { readExactZipIndustrySummaryV22 as summary } from './exact-zip-industry-summary-v2-2.mjs';

const ZBP = 'census_zbp_2023_all_industry_employer_establishments';

test('43-dimension temporal projection keeps annual aggregate non-current', async () => {
  const x = await temporal({ zip5: '00501' });
  const q = x.temporal_qualification.rows.at(-1);
  assert.equal(x.temporal_qualification.rows.length, 43);
  assert.equal(q.dimension_id, ZBP);
  assert.equal(q.semantic_class, 'annual-aggregate');
  assert.equal(q.current_operations_verified, false);
  assert.equal(q.evidence_disposition.raw_status, 'measured-positive');
});

test('national summary exposes a closed 43-row roster and separately conserves raw and derived states', async () => {
  const x = await summary();
  assert.equal(x.source_dimensions, 43);
  assert.equal(x.dimensions.length, 43);
  assert.equal(new Set(x.dimensions.map(row => row.id)).size, 43);
  assert.equal(x.industry_cells, 2_072_342);
  assert.equal(x.evidence_disposition_counts.total_cells, 2_072_342);
  assert.equal(x.evidence_disposition_counts.joined.reduce((sum, row) => sum + row.count, 0), 2_072_342);
  assert.equal(x.raw_status_counts['measured-positive'], 34_954);
  assert.equal(x.raw_status_counts['not-published-for-zip'], 2_874);
  assert.equal(x.raw_status_counts['outside-zbp-zcta-evidence-union'], 10_366);
  assert.equal(34_954 + 2_874 + 10_366, 48_194);
  assert.equal(x.evidence_state_counts['annual-aggregate-evidence-present'], 34_954);
  assert.equal(x.evidence_state_counts['annual-aggregate-source-unmeasured'], 13_240);
  const zbp = x.dimensions.find(row => row.id === ZBP);
  assert.ok(zbp);
  assert.deepEqual(zbp.raw_status_counts, {
    'measured-positive': 34_954,
    'not-published-for-zip': 2_874,
    'outside-zbp-zcta-evidence-union': 10_366,
  });
  assert.equal(zbp.temporal_qualification.semantic_class, 'annual-aggregate');
  assert.equal(zbp.temporal_qualification.review_qualification, 'unmeasured');
  assert.equal(x.claims.current_operation_verified, false);
  assert.equal(x.claims.all_business_completeness, false);
});

test('ZIP and national table rosters share the same explicit v2.2 header and row source', async () => {
  const source = await readFile(new URL('../app/workspace-views.tsx', import.meta.url), 'utf8');
  assert.match(source, /const EXACT_ZIP_V22_SOURCES=\[\.\.\.EXACT_ZIP_V21_SOURCES,"census_zbp_2023_all_industry_employer_establishments"\]/);
  assert.equal((source.match(/view\.schema_version==="national-exact-zip-industry-evidence-row@2\.2\.0"\?EXACT_ZIP_V22_SOURCES:EXACT_ZIP_SOURCES/g) ?? []).length, 1);
  assert.equal((source.match(/view\.industry_evidence\.schema_version==="national-exact-zip-industry-evidence-row@2\.2\.0"\?EXACT_ZIP_V22_SOURCES:EXACT_ZIP_SOURCES/g) ?? []).length, 1);
  assert.match(source, /view\.dimensions\.map\(row=>/);
  assert.match(source, /input\.dimensions\.length!==43/);
});
