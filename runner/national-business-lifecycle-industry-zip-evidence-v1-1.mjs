import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";

export const VERSION = "national-business-lifecycle-industry-zip-evidence@1.1.0";
const DATASET = "national-business-lifecycle-industry-zip-evidence";
const V1_RELEASE = "national-business-lifecycle-industry-zip-evidence-8a9763b1079338e092dddad0dd7fbabd2b20918faf9daee9976373371438f208";
const V1_MANIFEST = `data/${DATASET}/releases/${V1_RELEASE}/manifest.json`;
const V1_SHA = "cf0f8c24b1ddaf0e798eaf080b39281d51268e389b0cb0511d83dc397f3e8be3";
const EPA_RELEASE = "national-epa-echo-operational-segment-evidence-220a9369300ff5f74e3958278ca60519e29b1c49759f27808174923284520461";
const EPA_MANIFEST = `data/national-epa-echo-operational-segment-evidence/releases/${EPA_RELEASE}/manifest.json`;
const EPA_SHA = "bb154192843c65ccb7723259c6fda50725a2c7c9e4999477608b61f1fd716dc7";
const EPA_ARTIFACT_SHA = "f47b129512c75389897c44b849ca89da0926d4269aad39ae67d80008cb4fa266";
const EPA_SOURCE = "epa-echo-exporter-active-facility";
const FSIS_SOURCE = "usda-fsis-active-mpi-directory";
const EXPECTED_EPA = Object.freeze({ source_record_count: 1517826, records_with_segment: 294477, segment_assignments: 296595, multisegment_records: 2107, records_partially_unmapped: 25035, unresolved_source_records: 1223349 });
const EXPECTED_INDUSTRIES = Object.freeze({ "retail-consumer": 484508, "health-care": 2118021, "financial-services": 101618, transportation: 2242612, construction: 93917, "tax-exempt-organizations": 0, "sales-tax-outlets": 885097, "local-business-licenses": 856795, childcare: 177 });
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const fail = message => { throw Error(`Lifecycle industry ZIP v1.1 rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const inside = (root, file) => { const r = path.resolve(root), f = path.resolve(r, file); check(f === r || f.startsWith(`${r}${path.sep}`), "path outside root"); return f; };
async function bytes(file, max = 100_000_000) {
  const handle = await fs.open(file, "r");
  try { const before = await handle.stat(); check(before.isFile() && !before.isSymbolicLink() && before.size <= max, "bounded regular file"); const value = Buffer.alloc(before.size); let offset = 0; while (offset < value.length) { const read = await handle.read(value, offset, value.length - offset, offset); check(read.bytesRead > 0, "short read"); offset += read.bytesRead; } const after = await handle.stat(); check(before.size === after.size && before.mtimeMs === after.mtimeMs, "file changed while reading"); return value; }
  finally { await handle.close(); }
}
async function json(file, max) { const buffer = await bytes(file, max); try { return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) }; } catch { fail("JSON syntax"); } }
const claims = () => ({
  record_unit: "registry-location-profile-lifecycle-membership",
  dense_governed_zip_cohort: true, exact_zip5_keys_preserved: true, cohort_classifications_preserved: true,
  source_relative_lifecycle_evidence: true, epa_operational_segment_refinement: true,
  mapped_source_record_union_separate_from_industry_assignments: true,
  industry_assignments_additive: false, source_memberships_additive_across_industries: false, cross_source_additivity: false,
  unique_business_count: null, active_business_count: null, current_operating_business_count: null,
  all_business_completeness: null, industry_completeness: null, current_operation_verified: false,
  active_business_eligible: false, identity_resolution_applied: false,
  authoritative_current_usps_zip_denominator: null, usps_zip_state_assignment: false, zip4_joined: false,
  network_requests: 0, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false,
});
const life = count => ({ "source-defined-current": count, "non-active-reporting": 0, unknown: 0, contradictory: 0 });
const review = count => ({ "within-review-window": count, stale: 0, unmeasured: 0, unmapped: 0 });

function refineRow(row, epa) {
  check(row.schema_version === "national-business-lifecycle-industry-zip-evidence-row@1.0.0" && row.zip5 === epa.zip5 && row.cohort_classification === epa.denominator_classification, `ZIP lineage ${row.zip5}`);
  const source = row.unmapped_sources.find(item => item.source_id === EPA_SOURCE) ?? { source_id: EPA_SOURCE, profile_membership_count: 0, lifecycle_evidence_counts: life(0), review_status_counts: review(0) }, fsis = row.unmapped_sources.filter(item => item.source_id === FSIS_SOURCE);
  check(fsis.length <= 1 && source.profile_membership_count === epa.source_record_count, `EPA source conservation ${row.zip5}`);
  check(source.lifecycle_evidence_counts["source-defined-current"] === source.profile_membership_count && source.review_status_counts["within-review-window"] === source.profile_membership_count, `EPA lifecycle status ${row.zip5}`);
  const unresolved = epa.source_record_count - epa.records_with_segment;
  check(unresolved >= 0 && epa.segment_counts.length === 6 && epa.segment_counts.reduce((total, item) => total + item.source_record_count, 0) === epa.segment_assignments, `EPA segment counts ${row.zip5}`);
  const industries = row.industries.map(prior => {
    const segment = epa.segment_counts.find(item => item.segment === prior.industry_id), added = segment?.source_record_count ?? 0;
    const lifecycle_evidence_counts = structuredClone(prior.lifecycle_evidence_counts), review_status_counts = structuredClone(prior.review_status_counts);
    lifecycle_evidence_counts["source-defined-current"] += added; review_status_counts["within-review-window"] += added;
    return { industry_id: prior.industry_id, source_assignment_count: prior.profile_membership_count + added, lifecycle_evidence_assignment_counts: lifecycle_evidence_counts, review_status_assignment_counts: review_status_counts, sources: [...prior.sources.map(item => ({ source_id: item.source_id, source_assignment_count: item.profile_membership_count, lifecycle_evidence_assignment_counts: item.lifecycle_evidence_counts, review_status_assignment_counts: item.review_status_counts })), ...(added ? [{ source_id: EPA_SOURCE, source_assignment_count: added, lifecycle_evidence_assignment_counts: life(added), review_status_assignment_counts: review(added) }] : [])] };
  });
  const assignmentTotal = industries.reduce((total, item) => total + item.source_assignment_count, 0);
  return {
    schema_version: "national-business-lifecycle-industry-zip-evidence-row@1.1.0", zip5: row.zip5, cohort_classification: row.cohort_classification,
    source_membership_count: row.profile_membership_count, lifecycle_evidence_counts: row.lifecycle_evidence_counts, review_status_counts: row.review_status_counts,
    mapped_source_record_union_count: row.mapped_source_membership_count + epa.records_with_segment,
    unresolved_source_record_count: row.unmapped_source_membership_count - epa.source_record_count + unresolved,
    industry_assignment_count: assignmentTotal, industries,
    epa_refinement: { source_id: EPA_SOURCE, source_record_count: epa.source_record_count, mapped_source_record_union_count: epa.records_with_segment, industry_assignment_count: epa.segment_assignments, multisegment_record_count: epa.status_counts.multisegment, partially_unmapped_record_count: epa.records_partially_unmapped, unresolved_source_record_count: unresolved, segment_assignment_counts: Object.fromEntries(epa.segment_counts.map(item => [item.segment, item.source_record_count])), lifecycle_evidence_counts: source.lifecycle_evidence_counts, review_status_counts: source.review_status_counts },
    unmapped_sources: fsis,
  };
}

export async function composeNationalBusinessLifecycleIndustryZipEvidenceV11({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const v1 = await json(inside(root, V1_MANIFEST), 2_000_000); check(v1.sha256 === V1_SHA && v1.value.release_id === V1_RELEASE && v1.value.summary.profile_membership_count === 8_011_213, "v1 binding");
  const epaManifest = await json(inside(root, EPA_MANIFEST), 2_000_000); check(epaManifest.sha256 === EPA_SHA && epaManifest.value.release_id === EPA_RELEASE, "EPA manifest binding");
  const epaDescriptor = epaManifest.value.artifacts.find(item => item.path === "zip5-evidence.jsonl.gz"); check(epaDescriptor?.sha256 === EPA_ARTIFACT_SHA && epaDescriptor.record_count === 48_194, "EPA artifact descriptor");
  const epaCompressed = await bytes(inside(path.dirname(inside(root, EPA_MANIFEST)), epaDescriptor.path), 5_000_000); check(sha(epaCompressed) === EPA_ARTIFACT_SHA, "EPA artifact integrity");
  const epaDecoded = gunzipSync(epaCompressed, { maxOutputLength: 50_000_000 }); check(epaDecoded.length === epaDescriptor.decoded_bytes, "EPA decoded bytes");
  const epaRows = epaDecoded.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line)), epaByZip = new Map(epaRows.map(row => [row.zip5, row])); check(epaByZip.size === 48_194, "EPA dense ZIP roster");
  const partitions = [], seen = new Set();
  for (const descriptor of v1.value.artifacts.filter(item => /^zip2=\d{2}\.jsonl\.gz$/.test(item.path))) {
    const compressed = await bytes(inside(path.dirname(inside(root, V1_MANIFEST)), descriptor.path), 20_000_000); check(sha(compressed) === descriptor.sha256, `v1 partition ${descriptor.path}`);
    const decoded = gunzipSync(compressed, { maxOutputLength: 10_000_000 }); check(decoded.length === descriptor.decoded_bytes, `v1 decoded ${descriptor.path}`);
    const input = decoded.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); check(input.length === descriptor.record_count, `v1 rows ${descriptor.path}`);
    const rows = input.map(row => { check(!seen.has(row.zip5) && epaByZip.has(row.zip5), `joined ZIP ${row.zip5}`); seen.add(row.zip5); return refineRow(row, epaByZip.get(row.zip5)); }); partitions.push({ path: descriptor.path, rows });
  }
  check(partitions.length === 100 && seen.size === 48_194 && [...epaByZip.keys()].every(zip => seen.has(zip)), "ZIP cohort equality");
  const rows = partitions.flatMap(item => item.rows), epaTotals = { source_record_count: 0, records_with_segment: 0, segment_assignments: 0, multisegment_records: 0, records_partially_unmapped: 0, unresolved_source_records: 0 };
  for (const row of rows) { const e = row.epa_refinement; epaTotals.source_record_count += e.source_record_count; epaTotals.records_with_segment += e.mapped_source_record_union_count; epaTotals.segment_assignments += e.industry_assignment_count; epaTotals.multisegment_records += e.multisegment_record_count; epaTotals.records_partially_unmapped += e.partially_unmapped_record_count; epaTotals.unresolved_source_records += e.unresolved_source_record_count; check(row.mapped_source_record_union_count + row.unresolved_source_record_count === row.source_membership_count, `row source union ${row.zip5}`); }
  check(JSON.stringify(epaTotals) === JSON.stringify(EXPECTED_EPA), "EPA national conservation");
  const industryAssignmentCounts = Object.fromEntries(rows[0].industries.map(item => [item.industry_id, rows.reduce((total, row) => total + row.industries.find(industry => industry.industry_id === item.industry_id).source_assignment_count, 0)])); check(JSON.stringify(industryAssignmentCounts) === JSON.stringify(EXPECTED_INDUSTRIES), "industry assignment totals");
  const summary = { zip5_rows: rows.length, positive_zip5_rows: v1.value.summary.positive_zip5_rows, zero_profile_zip5_rows: v1.value.summary.zero_profile_zip5_rows, source_membership_count: rows.reduce((total, row) => total + row.source_membership_count, 0), lifecycle_evidence_counts: v1.value.summary.lifecycle_evidence_counts, review_status_counts: v1.value.summary.review_status_counts, source_counts: v1.value.summary.source_counts, cohort_classification_counts: v1.value.summary.cohort_classification_counts, mapped_source_record_union_count: rows.reduce((total, row) => total + row.mapped_source_record_union_count, 0), unresolved_source_record_count: rows.reduce((total, row) => total + row.unresolved_source_record_count, 0), industry_assignment_count: Object.values(industryAssignmentCounts).reduce((a, b) => a + b, 0), industry_assignment_counts: industryAssignmentCounts, epa_refinement: epaTotals, fully_mapped_source_count: 13, partially_mapped_source_count: 1, fully_unmapped_source_count: 1 };
  check(summary.source_membership_count === 8_011_213 && summary.mapped_source_record_union_count + summary.unresolved_source_record_count === summary.source_membership_count, "national source membership conservation");
  return { root, v1, epaManifest, epaDescriptor, partitions, summary };
}

function render(result) {
  const files = [], artifacts = [];
  for (const partition of result.partitions) { const decoded = Buffer.from(partition.rows.map(row => JSON.stringify(row)).join("\n") + "\n"), compressed = gzipSync(decoded, { level: 9, mtime: 0 }); files.push([partition.path, compressed]); artifacts.push({ path: partition.path, artifact_type: "lifecycle-industry-zip-evidence-v1-1-jsonl-gzip", record_count: partition.rows.length, bytes: compressed.length, decoded_bytes: decoded.length, sha256: sha(compressed) }); }
  const outside = gzipSync(Buffer.alloc(0), { level: 9, mtime: 0 }); files.push(["outside-cohort.jsonl.gz", outside]); artifacts.push({ path: "outside-cohort.jsonl.gz", artifact_type: "lifecycle-industry-outside-cohort-v1-1-jsonl-gzip", record_count: 0, bytes: outside.length, decoded_bytes: 0, sha256: sha(outside) });
  const summary = Buffer.from(stable(result.summary)); files.push(["summary.json", summary]); artifacts.push({ path: "summary.json", artifact_type: "lifecycle-industry-zip-evidence-v1-1-summary-json", record_count: 1, bytes: summary.length, decoded_bytes: summary.length, sha256: sha(summary) }); return { files, artifacts };
}
function makeManifest(result, artifacts) { const body = { schema_version: VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", publication_mode: "pointer-free", predecessor: { release_id: V1_RELEASE, manifest_path: V1_MANIFEST, manifest_sha256: V1_SHA }, bindings: { epa_operational_segment_evidence: { release_id: EPA_RELEASE, manifest_path: EPA_MANIFEST, manifest_sha256: EPA_SHA, zip_artifact_path: result.epaDescriptor.path, zip_artifact_sha256: EPA_ARTIFACT_SHA, source_release_id: "epa-echo-2026-08-30-382d612a42041dc0" } }, summary: result.summary, claims: claims(), artifacts }; return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body }; }

export async function buildNationalBusinessLifecycleIndustryZipEvidenceV11({ root = APP_ROOT, outputRoot } = {}) { const result = await composeNationalBusinessLifecycleIndustryZipEvidenceV11({ root }), rendered = render(result), manifest = makeManifest(result, rendered.artifacts); outputRoot = inside(result.root, outputRoot ?? path.join(result.root, "data", DATASET)); const directory = path.join(outputRoot, "releases", manifest.release_id); await fs.mkdir(directory, { recursive: true }); for (const [name, value] of [...rendered.files, ["manifest.json", Buffer.from(stable(manifest))]]) { const file = path.join(directory, name); await fs.writeFile(file, value, { flag: "wx" }).catch(async error => { if (error.code !== "EEXIST") throw error; check(sha(await bytes(file)) === sha(value), "immutable release drift"); }); } return verifyNationalBusinessLifecycleIndustryZipEvidenceV11(path.join(directory, "manifest.json"), { root: result.root }); }
export async function verifyNationalBusinessLifecycleIndustryZipEvidenceV11(manifestPath, { root = APP_ROOT } = {}) { root = path.resolve(root); manifestPath = inside(root, manifestPath); const read = await json(manifestPath, 2_000_000), manifest = read.value, { release_id, ...body } = manifest; check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && release_id === `${DATASET}-${sha(JSON.stringify(body))}` && path.basename(path.dirname(manifestPath)) === release_id && JSON.stringify(manifest.claims) === JSON.stringify(claims()), "manifest identity/claims"); const result = await composeNationalBusinessLifecycleIndustryZipEvidenceV11({ root }), rendered = render(result), expected = makeManifest(result, rendered.artifacts); check(JSON.stringify(manifest) === JSON.stringify(expected), "manifest replay"); for (const [name, value] of rendered.files) check((await bytes(inside(path.dirname(manifestPath), name), 20_000_000)).equals(value), `artifact replay ${name}`); check((await fs.readdir(path.dirname(manifestPath))).sort().join("|") === [...rendered.files.map(([name]) => name), "manifest.json"].sort().join("|"), "closed inventory"); return { verified: true, release_id, manifest_sha256: read.sha256, artifact_count: rendered.artifacts.length, compressed_bytes: rendered.artifacts.reduce((total, item) => total + item.bytes, 0), ...result.summary }; }
export async function verifyRegisteredNationalBusinessLifecycleIndustryZipEvidenceV11({ root = APP_ROOT } = {}) { root = path.resolve(root); const registration = await json(inside(root, `config/datasets/${DATASET}.json`), 1_000_000), value = registration.value; check(value.schema_version === `${DATASET}-registration@1.1.0` && value.runtime_pointer === null && value.production_enrollment === false && JSON.stringify(value.claims) === JSON.stringify(claims()), "registration contract"); const retained = value.retained_releases.find(item => item.selected); check(retained && retained.release_id === value.retained_release.release_id, "selected release"); const verified = await verifyNationalBusinessLifecycleIndustryZipEvidenceV11(inside(root, retained.manifest), { root }); check(verified.release_id === retained.release_id && verified.manifest_sha256 === retained.manifest_sha256 && verified.artifact_count === retained.artifact_count && verified.compressed_bytes === retained.compressed_bytes, "registration pins"); return verified; }
export const lifecycleIndustryZipV11ClaimsForTest = claims;
