import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { readExactZipIndustrySummaryV32 as prior } from "./exact-zip-industry-summary-v3-2.mjs";

const RELEASE = "national-exact-zip-industry-evidence-matrix-b74f7c9f4d63c5aa50bbfe05d5bd55ff04fa0fe774ae6f16c297734405e25b13", MANIFEST = "9967de9da79f8bbd1d2c80194df9a3f2a928664eaa7bc9b7a6bd55b9b35588ad", CHILDCARE = "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b", CHILDCARE_MANIFEST = "9997dc9dcad2f3a35cd49a76244527ecd6bf6b13a4a6000db8a28f7651bf123a", ASSESSED = "2026-11-12T19:21:14.719Z";
const scopes = { childcare_pa_candidates: "PA", childcare_ct_candidates: "CT", childcare_md_candidates: "MD", childcare_vt_candidates: "VT", childcare_co_candidates: "CO", childcare_ut_candidates: "UT", childcare_ia_candidates: "IA" };
const hash = (value) => createHash("sha256").update(value).digest("hex"), check = (value) => { if (!value) throw Error("Exact-ZIP v3.3 summary rejected."); };
export async function readExactZipIndustrySummaryV33(options = {}) {
  const previous = await prior(options), root = options.root ?? APP_ROOT, registration = JSON.parse(await readFile(path.join(root, "config/datasets/retained-childcare-zip-evidence.json"))), manifestBytes = await readFile(path.join(root, registration.retained_release.manifest)), manifest = JSON.parse(manifestBytes);
  check(registration.retained_release.release_id === CHILDCARE && registration.retained_release.manifest_sha256 === CHILDCARE_MANIFEST && hash(manifestBytes) === CHILDCARE_MANIFEST && manifest.summary.accepted_candidate_rows === 12210);
  const dimensions = previous.dimensions.map((dimension) => {
    const scope = scopes[dimension.id]; if (!scope) return dimension; const cohort = manifest.sources[scope], reference = cohort.provenance.source_updated_at ?? null;
    return { ...dimension, temporal_qualification: { ...dimension.temporal_qualification, source_release_id: CHILDCARE, source_reference_at: reference, assessment_as_of: ASSESSED, review_qualification: "unmeasured", review_due_at: null, current_operations_verified: false } };
  });
  const rows = dimensions.map(({ id, temporal_qualification }) => ({ dimension_id: id, ...temporal_qualification })), temporal = { ...previous.temporal_qualification, schema_version: "exact-zip-industry-temporal-summary-projection@3.3.0", matrix_release_id: RELEASE, matrix_manifest_sha256: MANIFEST, retained_assessment_dimension_counts: rows.reduce((out, row) => { out[row.assessment_as_of] = (out[row.assessment_as_of] ?? 0) + 1; return out; }, {}) };
  const body = { ...temporal, projection_sha256: undefined }; delete body.projection_sha256; temporal.projection_sha256 = hash(JSON.stringify({ ...body, dimensions: rows }));
  return { ...previous, schema_version: "national-exact-zip-industry-summary-view@3.3.0", release_id: RELEASE, manifest_sha256: MANIFEST, dimensions, temporal_qualification: temporal, retained_childcare_refresh: { source_release_id: CHILDCARE, source_manifest_sha256: CHILDCARE_MANIFEST, accepted_candidate_rows: 12210, represented_candidate_rows: 12207, out_of_cohort_candidate_rows: 1, missing_zip_candidate_rows: 1, invalid_zip_candidate_rows: 1 }, verification_scope: "Bounded v3.3 replacement projection over the hash-pinned 51-dimension matrix. Seven retained-childcare dimensions bind v1.2; missing, invalid and out-of-cohort ZIP evidence remains separate. No childcare row is treated as a unique business, verified physical site or current operation." };
}
