import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const DATASET = "national-exact-zip-industry-evidence-matrix";
const PREDECESSOR = "national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629";
const PREDECESSOR_MANIFEST = "d4b2c8f50112fd16bea00769c3ac93b98b1ac2d14f334a3f9e448616931f01d1";
const PREDECESSOR_REGISTRATION = "c1eac60e55c380183f167f3660a1be7bcf69dbc5a617b74213665c133756ea5d";
const CHILDCARE_RELEASE = "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b";
const CHILDCARE_MANIFEST = "9997dc9dcad2f3a35cd49a76244527ecd6bf6b13a4a6000db8a28f7651bf123a";
const PREFIX = /^prefix=\d{2}\.json$/, CHILDCARE_PREFIX = /^zip-\d{2}\.json$/;
const dimensions = Object.freeze({ PA: "childcare_pa_candidates", CT: "childcare_ct_candidates", MD: "childcare_md_candidates", VT: "childcare_vt_candidates", CO: "childcare_co_candidates", UT: "childcare_ut_candidates", IA: "childcare_ia_candidates" });
const expected = Object.freeze({
  childcare_pa_candidates: { positive: 819, absent: 47375, count: 4995 }, childcare_ct_candidates: { positive: 230, absent: 47964, count: 1390 },
  childcare_md_candidates: { positive: 299, absent: 47895, count: 1770 }, childcare_vt_candidates: { positive: 172, absent: 48022, count: 506 },
  childcare_co_candidates: { positive: 321, absent: 47873, count: 1648 }, childcare_ut_candidates: { positive: 113, absent: 48081, count: 422 },
  childcare_ia_candidates: { positive: 404, absent: 47790, count: 1476 },
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const check = (value, message) => { if (!value) throw new Error(`v3.3 rejected: ${message}`); };
const claims = () => ({ replaced_dimensions: Object.values(dimensions), replacement_semantics: "retained-source-candidate-row-by-exact-source-ZIP5", source_separated: true, out_of_cohort_zip_retained_in_gap_sidecar: true, missing_zip_allocated: false, invalid_zip_allocated: false, publisher_scope_assigns_address_state: false, zip4_aggregated: false, unique_business_count: null, physical_site_count: null, current_operating_count: null, national_completeness_percent: null, current_usps_assignment_verified: false, production_enrollment: false, network_requests: 0, current_pointer_written: false });

function cell(source, cohort) {
  const reference = cohort.provenance.source_updated_at ?? null;
  return { status: source ? "positive" : "absent-from-retained-source-rows", count: source?.candidate_rows ?? null, measure: "candidate_rows", source_release_id: CHILDCARE_RELEASE, temporal_status: { status: reference ? "source-referenced-current-operation-unverified" : "source-reference-unresolved", source_reference_date: reference } };
}

async function inputs(root, signal) {
  signal?.throwIfAborted();
  const predecessorRegistrationBytes = await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json")), predecessorRegistration = JSON.parse(predecessorRegistrationBytes);
  check(hash(predecessorRegistrationBytes) === PREDECESSOR_REGISTRATION && predecessorRegistration.schema_version === "3.2.0" && predecessorRegistration.runtime_pointer === null && predecessorRegistration.production_enrollment === false && predecessorRegistration.retained_release.release_id === PREDECESSOR && predecessorRegistration.retained_release.manifest_sha256 === PREDECESSOR_MANIFEST, "predecessor registration pin");
  const predecessorPath = path.join(root, predecessorRegistration.retained_release.manifest), predecessorManifestBytes = await readFile(predecessorPath), predecessorManifest = JSON.parse(predecessorManifestBytes);
  check(hash(predecessorManifestBytes) === PREDECESSOR_MANIFEST && predecessorManifest.release_id === PREDECESSOR && predecessorManifest.schema_version === "national-exact-zip-industry-evidence-matrix@3.2.0" && predecessorManifest.summary.zip5_rows === 48194 && predecessorManifest.summary.dimension_count === 51 && predecessorManifest.summary.industry_cells === 2457894, "predecessor manifest pin");
  const registrationBytes = await readFile(path.join(root, "config/datasets/retained-childcare-zip-evidence.json")), registration = JSON.parse(registrationBytes);
  const manifestPath = path.join(root, registration.retained_release.manifest), manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  check(registration.retained_release.release_id === CHILDCARE_RELEASE && registration.retained_release.manifest_sha256 === CHILDCARE_MANIFEST && hash(manifestBytes) === CHILDCARE_MANIFEST && manifest.release_id === CHILDCARE_RELEASE && manifest.schema_version === "retained-childcare-zip-evidence@1.2.0", "childcare pin");
  check(manifest.summary.accepted_candidate_rows === 12210 && manifest.summary.zip_present_candidate_rows === 12208 && manifest.summary.missing_zip_candidate_rows === 1 && manifest.summary.invalid_zip_candidate_rows === 1 && manifest.summary.indexed_zip_count === 2359, "childcare summary");
  const sourceMap = new Map();
  for (const artifact of manifest.artifacts.filter(({ path: artifactPath }) => CHILDCARE_PREFIX.test(artifactPath))) {
    const bytes = await readFile(path.join(path.dirname(manifestPath), artifact.path)); check(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256, `childcare artifact ${artifact.path}`);
    const rows = JSON.parse(bytes); check(rows.length === artifact.record_count, `childcare row count ${artifact.path}`);
    for (const row of rows) { check(!sourceMap.has(row.zip5) && row.zip4 === null, "childcare ZIP uniqueness"); sourceMap.set(row.zip5, row); }
  }
  check(sourceMap.size === 2359 && Object.keys(manifest.sources).join("|") === Object.keys(dimensions).join("|"), "childcare source inventory");
  return { predecessorManifest, predecessorDirectory: path.dirname(predecessorPath), sourceMap, cohorts: manifest.sources, bindings: { predecessor: { release_id: PREDECESSOR, manifest_sha256: PREDECESSOR_MANIFEST, registration_sha256: PREDECESSOR_REGISTRATION, recursive_source_replay_performed: false, immutable_artifacts_verified: true }, replaced_dimensions: Object.values(dimensions), retained_childcare_zip_evidence: { release_id: CHILDCARE_RELEASE, manifest_sha256: CHILDCARE_MANIFEST, registration_sha256: hash(registrationBytes), root_view_sha256: manifest.root_view_sha256, accepted_candidate_rows: 12210, zip_present_candidate_rows: 12208, missing_zip_candidate_rows: 1, invalid_zip_candidate_rows: 1 } } };
}

async function compose(input, write) {
  const artifacts = [], governedZip = new Set(), summary = Object.fromEntries(Object.values(dimensions).map((dimension) => [dimension, { positive_zip5_rows: 0, absent_zip5_rows: 0, candidate_rows: 0 }])); let rowsSeen = 0;
  for (const artifact of input.predecessorManifest.artifacts) {
    const bytes = await readFile(path.join(input.predecessorDirectory, artifact.path)); check(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256, `predecessor artifact ${artifact.path}`);
    if (!PREFIX.test(artifact.path)) { await write?.(artifact, bytes); artifacts.push(artifact); continue; }
    const rows = JSON.parse(bytes); rowsSeen += rows.length;
    for (const row of rows) {
      governedZip.add(row.zip5);
      row.schema_version = "national-exact-zip-industry-evidence-row@3.3.0"; const sourceRow = input.sourceMap.get(row.zip5), byScope = new Map((sourceRow?.sources ?? []).map((source) => [source.publisher_scope, source]));
      for (const [scope, dimension] of Object.entries(dimensions)) { check(Object.hasOwn(row.cells, dimension), `missing predecessor ${dimension}`); const replacement = cell(byScope.get(scope), input.cohorts[scope]); row.cells[dimension] = replacement; const totals = summary[dimension]; if (replacement.status === "positive") { totals.positive_zip5_rows++; totals.candidate_rows += replacement.count; } else totals.absent_zip5_rows++; }
    }
    const nextBytes = Buffer.from(JSON.stringify(rows) + "\n"), nextArtifact = { path: artifact.path, bytes: nextBytes.length, sha256: hash(nextBytes), record_count: rows.length }; await write?.(nextArtifact, nextBytes); artifacts.push(nextArtifact);
  }
  check(rowsSeen === 48194, "ZIP row count");
  for (const [dimension, totals] of Object.entries(summary)) { const e = expected[dimension]; check(totals.positive_zip5_rows === e.positive && totals.absent_zip5_rows === e.absent && totals.candidate_rows === e.count && totals.positive_zip5_rows + totals.absent_zip5_rows === 48194, `dimension conservation ${dimension}`); }
  const outside = [...input.sourceMap.values()].filter((row) => !governedZip.has(row.zip5));
  check(outside.length === 1 && outside[0].zip5 === "21708" && outside[0].sources.length === 1 && outside[0].sources[0].publisher_scope === "MD" && outside[0].sources[0].candidate_rows === 1, "out-of-cohort childcare ZIP");
  const gap = { schema_version: "retained-childcare-exact-zip-gap@1.0.0", out_of_governed_zip_cohort: outside, missing_zip_buckets: [{ publisher_scope: "VT", source_id: "vt-cdd-childcare-centers", reason: "missing-source-zip", candidate_rows: 1 }], invalid_zip_buckets: [{ publisher_scope: "MD", source_id: "md-msde-childcare-centers", reason: "invalid-source-zip-range", candidate_rows: 1 }] }, gapBytes = Buffer.from(JSON.stringify(gap) + "\n"), gapArtifact = { path: "retained-childcare-source-zip-gaps.json", bytes: gapBytes.length, sha256: hash(gapBytes), record_count: 3 };
  await write?.(gapArtifact, gapBytes); artifacts.push(gapArtifact);
  const result = { zip5_rows: 48194, dimension_count: 51, industry_cells: 2457894, replaced_dimension_count: 7, represented_candidate_rows: Object.values(summary).reduce((n, item) => n + item.candidate_rows, 0), out_of_cohort_candidate_rows: 1, missing_zip_candidate_rows: 1, invalid_zip_candidate_rows: 1, accepted_candidate_rows: 12210, dimensions: summary };
  check(result.represented_candidate_rows === 12207 && result.represented_candidate_rows + result.out_of_cohort_candidate_rows + result.missing_zip_candidate_rows + result.invalid_zip_candidate_rows === result.accepted_candidate_rows, "candidate conservation"); return { artifacts, summary: result };
}

const body = (artifacts, summary, bindings) => ({ schema_version: "national-exact-zip-industry-evidence-matrix@3.3.0", dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", claims: claims(), bindings, summary, artifacts });
export async function buildNationalExactZipIndustryEvidenceMatrixV33({ root = APP_ROOT, outputRoot = path.join(APP_ROOT, "data/national-exact-zip-industry-evidence-matrix-v3-3"), signal } = {}) {
  const input = await inputs(root, signal), stage = path.join(outputRoot, `.staging-${randomUUID()}`); await mkdir(stage, { recursive: true });
  try { const result = await compose(input, async (artifact, bytes) => { const destination = path.join(stage, artifact.path); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: "wx" }); }); const manifestBody = body(result.artifacts, result.summary, input.bindings), releaseId = `${DATASET}-${hash(JSON.stringify(manifestBody))}`, manifest = { release_id: releaseId, ...manifestBody }; await writeFile(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); await mkdir(path.join(outputRoot, "releases"), { recursive: true }); const directory = path.join(outputRoot, "releases", releaseId); await rename(stage, directory); return { release_id: releaseId, manifest: path.join(directory, "manifest.json"), summary: result.summary }; } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}
export async function verifyNationalExactZipIndustryEvidenceMatrixV33(manifestPath, { root = APP_ROOT, signal } = {}) { const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes), input = await inputs(root, signal), replay = await compose(input); check(JSON.stringify(manifest.summary) === JSON.stringify(replay.summary) && JSON.stringify(manifest.artifacts) === JSON.stringify(replay.artifacts) && JSON.stringify(manifest.bindings) === JSON.stringify(input.bindings) && JSON.stringify(manifest.claims) === JSON.stringify(claims()) && manifest.release_id === `${DATASET}-${hash(JSON.stringify(body(manifest.artifacts, manifest.summary, manifest.bindings)))}`, "replay"); for (const artifact of manifest.artifacts) check(hash(await readFile(path.join(path.dirname(manifestPath), artifact.path))) === artifact.sha256, `release artifact ${artifact.path}`); return { verified: true, release_id: manifest.release_id, manifest_sha256: hash(manifestBytes), manifest_bytes: manifestBytes.length, summary: manifest.summary }; }
export async function verifyRegisteredNationalExactZipIndustryEvidenceMatrixV33({ root = APP_ROOT, signal } = {}) { const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-3.json"))), verified = await verifyNationalExactZipIndustryEvidenceMatrixV33(path.join(root, registration.retained_release.manifest), { root, signal }); check(registration.schema_version === "3.3.0" && registration.runtime_pointer === null && registration.production_enrollment === false && verified.release_id === registration.retained_release.release_id && verified.manifest_sha256 === registration.retained_release.manifest_sha256 && verified.manifest_bytes === registration.retained_release.manifest_bytes && verified.summary.zip5_rows === registration.retained_release.zip5_rows && verified.summary.dimension_count === registration.retained_release.dimension_count && verified.summary.industry_cells === registration.retained_release.industry_cells, "registration"); return verified; }
export const V33_TEST = { cell, claims, dimensions, expected };
