import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";

export const VERSION = "national-business-lifecycle-industry-zip-evidence@1.0.0";
const DATASET = "national-business-lifecycle-industry-zip-evidence";
const LIFE = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SHA = /^[a-f0-9]{64}$/;
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const fail = message => { throw Error(`Lifecycle industry ZIP evidence rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);
const zeros = keys => Object.fromEntries(keys.map(key => [key, 0]));
const add = (target, source) => { for (const key of Object.keys(target)) target[key] += source[key]; };
const inside = (root, file) => {
  const resolvedRoot = path.resolve(root), resolvedFile = path.resolve(resolvedRoot, file);
  check(resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`), "path outside root");
  return resolvedFile;
};
async function bytes(file, max = 20_000_000) {
  const handle = await fs.open(file, "r");
  try {
    const before = await handle.stat(); check(before.isFile() && !before.isSymbolicLink() && before.size <= max, "bounded regular file");
    const value = Buffer.alloc(before.size); let offset = 0;
    while (offset < value.length) { const read = await handle.read(value, offset, value.length - offset, offset); check(read.bytesRead > 0, "short read"); offset += read.bytesRead; }
    const after = await handle.stat(); check(before.size === after.size && before.mtimeMs === after.mtimeMs, "file changed while reading");
    return value;
  } finally { await handle.close(); }
}
async function json(file, max) { const buffer = await bytes(file, max); try { return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) }; } catch { fail("JSON syntax"); } }
const claims = () => ({
  record_unit: "registry-location-profile-lifecycle-membership",
  dense_governed_zip_cohort: true,
  exact_zip5_keys_preserved: true,
  cohort_classifications_preserved: true,
  source_relative_lifecycle_evidence: true,
  all_nine_operational_industries_present: true,
  unmapped_memberships_retained: true,
  source_memberships_additive_across_industries: false,
  cross_source_additivity: false,
  unique_business_count: null,
  active_business_count: null,
  current_operating_business_count: null,
  all_business_completeness: null,
  industry_completeness: null,
  current_operation_verified: false,
  active_business_eligible: false,
  identity_resolution_applied: false,
  authoritative_current_usps_zip_denominator: null,
  usps_zip_state_assignment: false,
  zip4_joined: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
});

function validateCrosswalk(value, sourceIds) {
  check(value.schema_version === "lifecycle-operational-industry-crosswalk@1.0.0", "crosswalk version");
  check(Array.isArray(value.operational_industries) && value.operational_industries.length === 9 && new Set(value.operational_industries).size === 9, "nine-industry roster");
  check(Array.isArray(value.sources) && value.sources.length === sourceIds.length && new Set(value.sources.map(row => row.source_id)).size === sourceIds.length, "closed source roster");
  check(value.sources.map(row => row.source_id).sort().join("|") === sourceIds.join("|"), "crosswalk source equality");
  for (const row of value.sources) {
    check(Array.isArray(row.industries) && new Set(row.industries).size === row.industries.length && row.industries.every(id => value.operational_industries.includes(id)), `source mapping ${row.source_id}`);
    check(row.industries.length > 0 ? row.unmapped_reason === undefined : typeof row.unmapped_reason === "string" && row.unmapped_reason.length > 20, `source disposition ${row.source_id}`);
  }
  check(value.claims?.closed_lifecycle_source_roster === true && value.claims?.source_memberships_additive_across_industries === false, "crosswalk boundary");
  return { industries: value.operational_industries, bySource: new Map(value.sources.map(row => [row.source_id, row])) };
}
const blank = () => ({ profile_membership_count: 0, lifecycle_evidence_counts: zeros(LIFE), review_status_counts: zeros(REVIEW) });
function accumulate(target, source) { target.profile_membership_count += source.profile_membership_count; add(target.lifecycle_evidence_counts, source.lifecycle_evidence_counts); add(target.review_status_counts, source.review_status_counts); }
function projectRow(row, mapping) {
  check(row.schema_version === "national-business-lifecycle-zip-evidence-row@1.0.0" && /^\d{5}$/.test(row.zip5) && Array.isArray(row.sources), "source ZIP row contract");
  check(sum(row.lifecycle_evidence_counts) === row.profile_membership_count && sum(row.review_status_counts) === row.profile_membership_count, `source row conservation ${row.zip5}`);
  const industries = mapping.industries.map(industry_id => ({ industry_id, ...blank(), sources: [] })), byIndustry = new Map(industries.map(item => [item.industry_id, item]));
  const unmapped_sources = [], seen = new Set();
  for (const source of row.sources) {
    check(mapping.bySource.has(source.source_id) && !seen.has(source.source_id), `closed source ${row.zip5}/${source.source_id}`); seen.add(source.source_id);
    check(sum(source.lifecycle_evidence_counts) === source.profile_membership_count && sum(source.review_status_counts) === source.profile_membership_count, `source conservation ${row.zip5}/${source.source_id}`);
    const route = mapping.bySource.get(source.source_id);
    if (route.industries.length === 0) unmapped_sources.push({ source_id: source.source_id, unmapped_reason: route.unmapped_reason, profile_membership_count: source.profile_membership_count, lifecycle_evidence_counts: source.lifecycle_evidence_counts, review_status_counts: source.review_status_counts });
    else for (const industryId of route.industries) { const target = byIndustry.get(industryId); accumulate(target, source); target.sources.push(source); }
  }
  const mapped_source_membership_count = row.sources.filter(source => mapping.bySource.get(source.source_id).industries.length > 0).reduce((total, source) => total + source.profile_membership_count, 0);
  const unmapped_source_membership_count = unmapped_sources.reduce((total, source) => total + source.profile_membership_count, 0);
  check(mapped_source_membership_count + unmapped_source_membership_count === row.profile_membership_count, `mapped/unmapped conservation ${row.zip5}`);
  for (const industry of industries) check(sum(industry.lifecycle_evidence_counts) === industry.profile_membership_count && sum(industry.review_status_counts) === industry.profile_membership_count, `industry conservation ${row.zip5}/${industry.industry_id}`);
  return { schema_version: "national-business-lifecycle-industry-zip-evidence-row@1.0.0", zip5: row.zip5, cohort_classification: row.cohort_classification, profile_membership_count: row.profile_membership_count, lifecycle_evidence_counts: row.lifecycle_evidence_counts, review_status_counts: row.review_status_counts, mapped_source_membership_count, unmapped_source_membership_count, industries, unmapped_sources };
}

export async function composeNationalBusinessLifecycleIndustryZipEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const registrationPath = inside(root, "config/datasets/national-business-lifecycle-zip-evidence.json"), registration = await json(registrationPath, 1_000_000), retained = registration.value.retained_release;
  check(registration.value.runtime_pointer === null && registration.value.production_enrollment === false && retained && SHA.test(retained.manifest_sha256), "lifecycle ZIP registration");
  const manifestPath = inside(root, retained.manifest), manifest = await json(manifestPath, 1_000_000);
  check(manifest.sha256 === retained.manifest_sha256 && manifest.value.release_id === retained.release_id && manifest.value.summary.zip5_rows === 48_194, "lifecycle ZIP manifest integrity");
  const sourceIds = Object.keys(manifest.value.summary.source_counts).sort();
  const crosswalkPath = inside(root, "config/lifecycle-operational-industry-crosswalk.json"), crosswalk = await json(crosswalkPath, 1_000_000), mapping = validateCrosswalk(crosswalk.value, sourceIds);
  const partitions = [], seen = new Set();
  for (const descriptor of manifest.value.artifacts.filter(item => /^zip2=\d{2}\.jsonl\.gz$/.test(item.path))) {
    const compressed = await bytes(inside(path.dirname(manifestPath), descriptor.path), 2_000_000); check(sha(compressed) === descriptor.sha256, `source partition integrity ${descriptor.path}`);
    const decoded = gunzipSync(compressed, { maxOutputLength: 3_000_000 }); check(decoded.length === descriptor.decoded_bytes, `source decoded bytes ${descriptor.path}`);
    const inputRows = decoded.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); check(inputRows.length === descriptor.record_count, `source row count ${descriptor.path}`);
    const rows = inputRows.map(row => { check(!seen.has(row.zip5) && row.zip5.startsWith(descriptor.path.slice(5, 7)), `ZIP partition identity ${row.zip5}`); seen.add(row.zip5); return projectRow(row, mapping); });
    partitions.push({ path: descriptor.path, rows });
  }
  check(partitions.length === 100 && seen.size === 48_194, "dense 100-partition ZIP cohort");
  const allRows = partitions.flatMap(partition => partition.rows);
  const mappedRoutes = crosswalk.value.sources.filter(row => row.industries.length > 0), unmappedRoutes = crosswalk.value.sources.filter(row => row.industries.length === 0);
  const totals = {
    zip5_rows: allRows.length,
    positive_zip5_rows: allRows.filter(row => row.profile_membership_count > 0).length,
    zero_profile_zip5_rows: allRows.filter(row => row.profile_membership_count === 0).length,
    outside_cohort_zip5_rows: 0,
    outside_cohort_profile_memberships: 0,
    profile_membership_count: allRows.reduce((total, row) => total + row.profile_membership_count, 0),
    lifecycle_evidence_counts: Object.fromEntries(LIFE.map(key => [key, allRows.reduce((total, row) => total + row.lifecycle_evidence_counts[key], 0)])),
    review_status_counts: Object.fromEntries(REVIEW.map(key => [key, allRows.reduce((total, row) => total + row.review_status_counts[key], 0)])),
    source_counts: manifest.value.summary.source_counts,
    cohort_classification_counts: manifest.value.summary.cohort_classification_counts,
    mapped_source_count: mappedRoutes.length,
    unmapped_source_count: unmappedRoutes.length,
    mapped_source_membership_count: mappedRoutes.reduce((total, route) => total + manifest.value.summary.source_counts[route.source_id], 0),
    unmapped_source_membership_count: unmappedRoutes.reduce((total, route) => total + manifest.value.summary.source_counts[route.source_id], 0),
    industry_membership_counts: Object.fromEntries(mapping.industries.map(id => [id, allRows.reduce((total, row) => total + row.industries.find(item => item.industry_id === id).profile_membership_count, 0)])),
  };
  check(totals.zip5_rows === 48_194 && totals.profile_membership_count === 8_011_213 && totals.mapped_source_count === 13 && totals.unmapped_source_count === 2 && totals.mapped_source_membership_count + totals.unmapped_source_membership_count === totals.profile_membership_count, "national conservation");
  for (const key of ["positive_zip5_rows", "zero_profile_zip5_rows", "profile_membership_count"]) check(totals[key] === manifest.value.summary[key], `source summary ${key}`);
  check(JSON.stringify(totals.lifecycle_evidence_counts) === JSON.stringify(manifest.value.summary.lifecycle_evidence_counts) && JSON.stringify(totals.review_status_counts) === JSON.stringify(manifest.value.summary.review_status_counts), "lifecycle/review summary conservation");
  return { root, retained, manifest, manifestPath, crosswalk, crosswalkPath, partitions, totals };
}

function makeManifest(result, artifacts) {
  const body = { schema_version: VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", publication_mode: "pointer-free", bindings: {
    lifecycle_zip_evidence: { release_id: result.retained.release_id, manifest_path: path.relative(result.root, result.manifestPath).replaceAll("\\", "/"), manifest_sha256: result.manifest.sha256 },
    lifecycle_operational_industry_crosswalk: { path: path.relative(result.root, result.crosswalkPath).replaceAll("\\", "/"), sha256: result.crosswalk.sha256 },
  }, summary: result.totals, claims: claims(), artifacts };
  return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}
function render(result) {
  const files = [], artifacts = [];
  for (const partition of result.partitions) {
    const decoded = Buffer.from(partition.rows.map(row => JSON.stringify(row)).join("\n") + "\n"), compressed = gzipSync(decoded, { level: 9, mtime: 0 });
    files.push([partition.path, compressed]); artifacts.push({ path: partition.path, artifact_type: "lifecycle-industry-zip-evidence-jsonl-gzip", record_count: partition.rows.length, bytes: compressed.length, decoded_bytes: decoded.length, sha256: sha(compressed) });
  }
  const outside = gzipSync(Buffer.alloc(0), { level: 9, mtime: 0 }); files.push(["outside-cohort.jsonl.gz", outside]); artifacts.push({ path: "outside-cohort.jsonl.gz", artifact_type: "lifecycle-industry-outside-cohort-jsonl-gzip", record_count: 0, bytes: outside.length, decoded_bytes: 0, sha256: sha(outside) });
  const summary = Buffer.from(stable(result.totals)); files.push(["summary.json", summary]); artifacts.push({ path: "summary.json", artifact_type: "lifecycle-industry-zip-evidence-summary-json", record_count: 1, bytes: summary.length, decoded_bytes: summary.length, sha256: sha(summary) });
  return { files, artifacts };
}

export async function buildNationalBusinessLifecycleIndustryZipEvidence({ root = APP_ROOT, outputRoot } = {}) {
  const result = await composeNationalBusinessLifecycleIndustryZipEvidence({ root }), rendered = render(result), manifest = makeManifest(result, rendered.artifacts);
  outputRoot = inside(result.root, outputRoot ?? path.join(result.root, "data", DATASET)); const directory = path.join(outputRoot, "releases", manifest.release_id);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, value] of [...rendered.files, ["manifest.json", Buffer.from(stable(manifest))]]) {
    const file = path.join(directory, name); await fs.writeFile(file, value, { flag: "wx" }).catch(async error => { if (error.code !== "EEXIST") throw error; check(sha(await bytes(file)) === sha(value), "immutable release drift"); });
  }
  return verifyNationalBusinessLifecycleIndustryZipEvidence(path.join(directory, "manifest.json"), { root: result.root });
}

export async function verifyNationalBusinessLifecycleIndustryZipEvidence(manifestPath, { root = APP_ROOT } = {}) {
  root = path.resolve(root); manifestPath = inside(root, manifestPath); const read = await json(manifestPath, 2_000_000), manifest = read.value, { release_id, ...body } = manifest;
  check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && manifest.status === "immutable-pointer-free-local-review-only" && manifest.publication_mode === "pointer-free", "manifest contract");
  check(release_id === `${DATASET}-${sha(JSON.stringify(body))}` && path.basename(path.dirname(manifestPath)) === release_id, "manifest identity"); check(JSON.stringify(manifest.claims) === JSON.stringify(claims()), "claims boundary");
  const result = await composeNationalBusinessLifecycleIndustryZipEvidence({ root }), rendered = render(result), expectedManifest = makeManifest(result, rendered.artifacts);
  check(manifest.bindings.lifecycle_zip_evidence.release_id === result.retained.release_id && manifest.bindings.lifecycle_zip_evidence.manifest_sha256 === result.manifest.sha256, "lifecycle ZIP binding");
  check(manifest.bindings.lifecycle_operational_industry_crosswalk.sha256 === result.crosswalk.sha256, "crosswalk binding");
  check(JSON.stringify(manifest) === JSON.stringify(expectedManifest), "manifest replay");
  for (const [name, expected] of rendered.files) { const actual = await bytes(inside(path.dirname(manifestPath), name), 20_000_000); check(actual.equals(expected), `artifact replay ${name}`); }
  check((await fs.readdir(path.dirname(manifestPath))).sort().join("|") === [...rendered.files.map(([name]) => name), "manifest.json"].sort().join("|"), "closed release inventory");
  return { verified: true, release_id, manifest_sha256: read.sha256, artifact_count: rendered.artifacts.length, compressed_bytes: rendered.artifacts.reduce((total, item) => total + item.bytes, 0), ...result.totals };
}

export async function verifyRegisteredNationalBusinessLifecycleIndustryZipEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root); const registration = await json(inside(root, `config/datasets/${DATASET}.json`), 1_000_000), value = registration.value;
  check(value.schema_version === `${DATASET}-registration@1.0.0` && value.dataset_id === DATASET && value.runtime_pointer === null && value.production_enrollment === false && JSON.stringify(value.claims) === JSON.stringify(claims()), "registration contract");
  const verified = await verifyNationalBusinessLifecycleIndustryZipEvidence(inside(root, value.retained_release.manifest), { root });
  check(verified.release_id === value.retained_release.release_id && verified.manifest_sha256 === value.retained_release.manifest_sha256 && verified.artifact_count === value.retained_release.artifact_count && verified.compressed_bytes === value.retained_release.compressed_bytes, "registered pins"); return verified;
}

export const lifecycleIndustryZipClaimsForTest = claims;
export function projectLifecycleIndustryZipRowForTest(row, crosswalk) { const sourceIds = crosswalk.sources.map(item => item.source_id).sort(); return projectRow(row, validateCrosswalk(crosswalk, sourceIds)); }
