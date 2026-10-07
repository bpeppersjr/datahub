import test from "node:test";
import assert from "node:assert/strict";
import { readExactZipIndustrySummaryV31 as summary } from "./exact-zip-industry-summary-v3-1.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV31 as read } from "./exact-zip-industry-temporal-qualification-v3-1.mjs";
import { TEMPORAL_MAPPINGS_V31 } from "./exact-zip-industry-temporal-mappings-v3-1.mjs";
import { readExactZipIndustrySummaryV30 } from "./exact-zip-industry-summary-v3-0.mjs";
import { readExactZipIndustryEvidenceV30 } from "./national-exact-zip-industry-evidence-matrix-v3-0-reader.mjs";
import { readFile } from "node:fs/promises";

test("v3.1 maps all retained temporal placeholders without changing matrix counts", async () => {
  const [value, previous, matrix] = await Promise.all([summary(), readExactZipIndustrySummaryV30(), readExactZipIndustryEvidenceV30({zip5:"00000"})]);
  assert.equal(value.schema_version, "national-exact-zip-industry-summary-view@3.1.0");
  assert.deepEqual([value.source_dimensions, value.industry_cells, value.dimensions.length], [51, 2457894, 51]);
  assert.equal(value.temporal_qualification.dimension_counts.unmapped, 0);
  assert.equal(value.temporal_qualification.dimension_counts.unmeasured, 20);
  assert.equal(value.temporal_qualification.semantic_dimension_counts.unmapped, 0);
  assert.equal(value.temporal_qualification.semantic_dimension_counts["non-active-reporting"], 20);
  assert.equal(value.evidence_disposition_counts.by_lifecycle_status.unmapped, undefined);
  assert.equal(value.evidence_disposition_counts.by_lifecycle_status.unmeasured, 722910);
  assert.equal(value.evidence_disposition_counts.joined.reduce((sum, row) => sum + row.count, 0), value.industry_cells);
  assert.equal(value.release_id, previous.release_id);
  assert.equal(value.manifest_sha256, previous.manifest_sha256);
  assert.deepEqual(value.status_counts, previous.status_counts);
  assert.deepEqual(value.raw_status_counts, previous.raw_status_counts);
  assert.equal(value.zip5_rows,48194);
  assert.deepEqual(value.temporal_qualification.dimension_counts,{"within-review-window":29,stale:2,unmeasured:20,unmapped:0});
  assert.deepEqual(value.temporal_qualification.semantic_dimension_counts,{"source-defined-current":25,"non-active-reporting":20,unmapped:0,"annual-aggregate":1,"linkage-readiness":1,"publisher-active-snapshot":3,"unknown-source-status":1});
  for (const mapping of TEMPORAL_MAPPINGS_V31) {
    const dimension = value.dimensions.find((row) => row.id === mapping.dimension_id);
    assert.equal(dimension.temporal_qualification.source_key, mapping.source_key);
    assert.equal(dimension.temporal_qualification.semantic_class, "non-active-reporting");
    assert.equal(dimension.temporal_qualification.review_qualification, "unmeasured");
    const cell=matrix.row.cells[mapping.dimension_id];
    assert.match(dimension.temporal_qualification.source_release_id,/\S/);
    assert.equal(dimension.temporal_qualification.source_release_id,cell.source_release_id);
    assert.equal(dimension.temporal_qualification.source_reference_at,cell.temporal_status.source_reference_date??cell.temporal_status.source_reference_at??null);
    assert.deepEqual(dimension.status_counts,previous.dimensions.find(row=>row.id===mapping.dimension_id).status_counts);
    assert.equal(dimension.evidence_disposition_counts.joined.reduce((sum,row)=>sum+row.count,0),48194);
    assert.ok(dimension.evidence_disposition_counts.joined.every(row=>row.lifecycle_status==="unmeasured"&&row.current_operations_verified===false&&row.additive===false&&row.identity_merge_applied===false));
  }
  for(const id of ["childcare_ut_candidates","childcare_ia_candidates"])assert.equal(value.dimensions.find(row=>row.id===id).temporal_qualification.source_reference_at,null);
  assert.equal(value.claims.current_operation_verified, false);
  assert.equal(value.claims.all_business_completeness, false);
});

test("server serves v3.1 national summary with its existing read-only query boundary",async()=>{
  const source=await readFile(new URL("./server.mjs",import.meta.url),"utf8");
  assert.match(source,/import \{ readExactZipIndustrySummaryV31 as readExactZipIndustrySummary \} from '\.\/exact-zip-industry-summary-v3-1\.mjs'/);
  assert.match(source,/if\(request.method==='GET'&&url.pathname==='\/api\/business-map\/exact-zip-industry-summary'\)\{\s*if\(\[\.\.\.url.searchParams.keys\(\)\]\.length\)\{json\(response,400,\{error:'Exact-ZIP industry summary does not accept options\.'\}\);return;\}\s*json\(response,200,await readExactZipIndustrySummary\(\)\)/);
});

test("v3.1 exact ZIP response exposes source release and conservative temporal semantics", async () => {
  const value = await read({ zip5: "10001" });
  assert.equal(value.temporal_qualification.schema_version, "exact-zip-industry-temporal-qualification-view@3.1.0");
  assert.equal(value.temporal_qualification.rows.length, 51);
  assert.equal(value.temporal_qualification.summary.unmapped_dimension_count, 0);
  for (const mapping of TEMPORAL_MAPPINGS_V31) {
    const row = value.temporal_qualification.rows.find((item) => item.dimension_id === mapping.dimension_id);
    assert.equal(row.source_key, mapping.source_key);
    assert.match(row.source_release_id, /\S/);
    assert.equal(row.semantic_class, "non-active-reporting");
    assert.equal(row.review_qualification, "unmeasured");
    assert.equal(row.current_operations_verified, false);
    assert.equal(row.evidence_disposition.lifecycle_status, "unmeasured");
  }
  assert.equal(value.row.cells.cms_hospital_directory.count, 0);
  assert.equal(value.row.cells.mn_residential_construction_credential_reported_address_rows.count, null);
});
