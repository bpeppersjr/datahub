import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";
import { composeNationalBusinessLifecycleJurisdictionEvidence } from "./national-business-lifecycle-jurisdiction-evidence.mjs";

export const VERSION = "national-irs-eo-supplemental-industry-evidence@1.0.0";
const DATASET = "national-irs-eo-supplemental-industry-evidence";
const OVERLAY_RELEASE = "national-irs-eo-registry-industry-overlay-61f2ddfb76bee49f47b32b6609cf6004a1bd686f51d50a19e2449b2d750e694c";
const OVERLAY_MANIFEST = `data/national-irs-eo-registry-industry-overlay/releases/${OVERLAY_RELEASE}/manifest.json`;
const OVERLAY_SHA = "3fadc44772bcf2166d5e777d268028f3427342f7bfd0aab0a7706b92058581ce";
const ASSESSMENT = "config/governed-source-refresh-assessments/irs-eo-bmf-2026-11-12.json";
const POSTING_DATE = "2026-08-11", RETRIEVED_DATE = "2026-09-03", ASSESSMENT_DATE = "2026-11-12";
const EXPECTED = 1_955_841, ZIP_ROWS = 48_194, POSITIVE_ZIPS = 36_950;
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const fail = message => { throw Error(`IRS EO supplemental industry evidence rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const inside = (root, file) => { const r = path.resolve(root), f = path.resolve(r, file); check(f === r || f.startsWith(`${r}${path.sep}`), "path outside root"); return f; };
const samePath = (left, right) => process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
async function rejectLinkedComponents(file) {
  const resolved = path.resolve(file), parsed = path.parse(resolved), relative = resolved.slice(parsed.root.length), parts = relative.split(path.sep).filter(Boolean); let current = parsed.root;
  for (const part of parts) { current = path.join(current, part); const stat = await fs.lstat(current); check(!stat.isSymbolicLink(), "symbolic-link path component"); }
  const canonical = await fs.realpath(resolved); check(samePath(path.resolve(canonical), resolved), "non-canonical path identity");
}
async function bytes(file, max = 25_000_000) {
  file = path.resolve(file); await rejectLinkedComponents(file); const beforePath = await fs.lstat(file); check(beforePath.isFile() && !beforePath.isSymbolicLink() && beforePath.nlink === 1 && beforePath.size <= max, "bounded canonical single-link regular file");
  const h = await fs.open(file, "r"); try { const a = await h.stat(); check(a.isFile() && a.nlink === 1 && a.dev === beforePath.dev && a.ino === beforePath.ino && a.size === beforePath.size, "opened file identity"); const b = Buffer.alloc(a.size); let o = 0; while (o < b.length) { const r = await h.read(b, o, b.length - o, o); check(r.bytesRead > 0, "short read"); o += r.bytesRead; } const z = await h.stat(), afterPath = await fs.lstat(file); check(a.dev === z.dev && a.ino === z.ino && a.size === z.size && a.mtimeMs === z.mtimeMs && z.nlink === 1 && afterPath.dev === a.dev && afterPath.ino === a.ino && afterPath.size === a.size && afterPath.mtimeMs === a.mtimeMs && afterPath.nlink === 1, "file changed while reading"); check(samePath(path.resolve(await fs.realpath(file)), file), "canonical identity changed while reading"); return b; } finally { await h.close(); }
}
async function json(file, max) { const buffer = await bytes(file, max); try { return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) }; } catch { fail("JSON syntax"); } }
function jsonl(buffer, { maxLines, maxLineBytes }) { let decoded; try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { fail("JSONL UTF-8"); } const lines = decoded.trim().split(/\r?\n/).filter(Boolean); check(lines.length <= maxLines, "JSONL line count"); return lines.map(line => { check(Buffer.byteLength(line) <= maxLineBytes, "JSONL line length"); try { return JSON.parse(line); } catch { fail("JSONL syntax"); } }); }
const claims = () => ({ evidence_kind: "supplemental-non-active-reporting-membership", industry: "tax-exempt-organizations", filing_address_only: true, lifecycle_base_denominator_changed: false, lifecycle_base_assignments_changed: false, unique_business_count: null, current_operation_verified: false, physical_site_verified: false, complete_all_nonprofits: false, all_business_completeness: null, additive_to_business_or_industry_totals: false, authoritative_current_usps_zip_validity: null, zip4_joined: false, geography_disposition_and_reported_jurisdiction_are_separate: true, state_inferred_from_zip_prefix: false, reported_jurisdiction_overwrites_geography_disposition: false, network_requests: 0, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false });
const review = () => ({ source_posting_date: POSTING_DATE, retrieved_date: RETRIEVED_DATE, assessment_as_of: ASSESSMENT_DATE, internal_review_window_days: 75, posting_age_days_at_assessment: 93, review_status: "stale", refresh_context: { status: "refresh-available-not-collected", observed_posting_date: "2026-10-13", source_page_claimed_records: 1_975_975, records_downloaded: 0 } });

export async function composeNationalIrsEoSupplementalIndustryEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const manifestPath = inside(root, OVERLAY_MANIFEST), overlay = await json(manifestPath, 300_000);
  check(overlay.sha256 === OVERLAY_SHA && overlay.value.release_id === OVERLAY_RELEASE, "overlay binding");
  check(overlay.value.summary.exact_ein_organization_membership_matches === EXPECTED && overlay.value.summary.zip5_denominator_rows === ZIP_ROWS && overlay.value.summary.positive_zip5_rows === POSITIVE_ZIPS, "overlay summary");
  const sourceInput = overlay.value.inputs.irs_eo_manifest, sourceManifest = await json(inside(root, sourceInput.path), 2_000_000);
  check(sourceManifest.sha256 === sourceInput.sha256 && sourceManifest.value.release_id === sourceInput.release_id && sourceManifest.value.source_posting_date === POSTING_DATE && sourceManifest.value.retrieved_at === "2026-09-03T00:34:47.217Z" && sourceManifest.value.complete_current_eo_bmf_snapshot === true, "IRS source posting and retrieval binding");
  const artifacts = new Map(overlay.value.artifacts.map(item => [item.path, item]));
  const zipDescriptor = artifacts.get("zip5-overlay.jsonl"), reportedDescriptor = artifacts.get("jurisdictions.jsonl");
  check(zipDescriptor?.record_count === ZIP_ROWS && reportedDescriptor?.record_count === 56, "overlay artifacts");
  const overlayDir = path.dirname(manifestPath), zipRaw = await bytes(inside(overlayDir, zipDescriptor.path), 25_000_000), reportedRaw = await bytes(inside(overlayDir, reportedDescriptor.path), 100_000);
  check(sha(zipRaw) === zipDescriptor.sha256 && sha(reportedRaw) === reportedDescriptor.sha256, "overlay artifact hashes");
  const zipInput = jsonl(zipRaw, { maxLines: ZIP_ROWS, maxLineBytes: 2_000 }), reportedInput = jsonl(reportedRaw, { maxLines: 56, maxLineBytes: 1_000 });
  check(zipInput.length === ZIP_ROWS && new Set(zipInput.map(row => row.zip5)).size === ZIP_ROWS, "exact ZIP key conservation");
  check(zipInput.reduce((n, row) => n + row.organization_count, 0) === EXPECTED && zipInput.filter(row => row.organization_count > 0).length === POSITIVE_ZIPS, "ZIP membership conservation");
  check(reportedInput.length === 56 && new Set(reportedInput.map(row => row.code)).size === 56 && reportedInput.reduce((n, row) => n + row.organization_count, 0) === EXPECTED, "reported jurisdiction conservation");
  const assessment = await json(inside(root, ASSESSMENT), 100_000);
  check(assessment.value.assessment_id === "irs-eo-bmf-2026-11-12" && assessment.value.observation.source_posting_date === "2026-10-13" && assessment.value.observation.aggregate_records === 1_975_975 && assessment.value.controls.records_downloaded === 0, "refresh assessment binding");
  const governed = await composeNationalBusinessLifecycleJurisdictionEvidence({ root });
  check(governed.rows.length === 60 && governed.governed.mapping.size === ZIP_ROWS, "60-scope disposition binding");
  const scopeCounts = new Map(governed.rows.map(row => [row.scope_id, { zip5_rows: 0, positive_zip5_rows: 0, organization_membership_count: 0 }]));
  const zipRows = zipInput.map(row => {
    const scope_id = governed.governed.mapping.get(row.zip5), bucket = scopeCounts.get(scope_id); check(bucket, `governed ZIP disposition ${row.zip5}`);
    bucket.zip5_rows++; bucket.positive_zip5_rows += row.organization_count > 0 ? 1 : 0; bucket.organization_membership_count += row.organization_count;
    return { schema_version: "national-irs-eo-supplemental-industry-evidence-zip@1.0.0", zip5: row.zip5, zip4: null, denominator_classification: row.denominator_classification, geography_disposition_scope_id: scope_id, evidence_kind: "supplemental-non-active-reporting-membership", industry: "tax-exempt-organizations", organization_membership_count: row.organization_count, review_status: "stale", filing_address_only: true };
  });
  const scopeRows = governed.rows.map(base => { const count = scopeCounts.get(base.scope_id); check(count.zip5_rows === base.zip5_rows, `scope ZIP conservation ${base.scope_id}`); return { schema_version: "national-irs-eo-supplemental-industry-evidence-scope@1.0.0", scope_id: base.scope_id, scope_kind: base.scope_kind, scope_label: base.scope_label, state_geo_id: base.state_geo_id, state_fips: base.state_fips, state_name: base.state_name, postal_abbreviation: base.postal_abbreviation, ...count, evidence_kind: "supplemental-non-active-reporting-membership", industry: "tax-exempt-organizations", review_status: "stale" }; });
  check(scopeRows.reduce((n, row) => n + row.zip5_rows, 0) === ZIP_ROWS && scopeRows.reduce((n, row) => n + row.organization_membership_count, 0) === EXPECTED, "60-scope national conservation");
  check(scopeRows.filter(row => row.scope_kind === "state").length === 51 && scopeRows.filter(row => row.scope_kind === "territory").length === 5 && scopeRows.filter(row => !["state", "territory"].includes(row.scope_kind)).length === 4, "scope-kind conservation");
  const reportedRows = reportedInput.map(row => ({ schema_version: "national-irs-eo-supplemental-industry-evidence-reported-jurisdiction@1.0.0", reported_filing_address_jurisdiction: row.code, organization_membership_count: row.organization_count, evidence_kind: "supplemental-non-active-reporting-membership", industry: "tax-exempt-organizations", review_status: "stale", comparison_only: true, geography_disposition_scope_id: null }));
  const summary = { zip5_rows: ZIP_ROWS, positive_zip5_rows: POSITIVE_ZIPS, organization_membership_count: EXPECTED, geography_disposition_scope_rows: 60, state_scope_rows: 51, territory_scope_rows: 5, special_scope_rows: 4, reported_filing_address_jurisdiction_rows: 56, evidence_kind: "supplemental-non-active-reporting-membership", industry: "tax-exempt-organizations", review_status: "stale", lifecycle_base_profile_membership_count: 8_011_213, lifecycle_base_industry_assignment_count: 6_782_745, lifecycle_base_changed: false };
  return { root, overlay, sourceManifest, sourceInput, assessment, governed, zipRows, scopeRows, reportedRows, summary };
}

function descriptor(pathname, type, raw, count, decodedBytes = null) { const value = { path: pathname, artifact_type: type, record_count: count, bytes: raw.length, sha256: sha(raw) }; if (decodedBytes !== null) value.decoded_bytes = decodedBytes; return value; }
function manifestBody(result, artifacts) { return { schema_version: VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", publication_mode: "pointer-free", bindings: { irs_eo_registry_overlay: { release_id: OVERLAY_RELEASE, manifest_path: OVERLAY_MANIFEST, manifest_sha256: OVERLAY_SHA }, irs_eo_source_release: { release_id: result.sourceInput.release_id, manifest_path: result.sourceInput.path, manifest_sha256: result.sourceInput.sha256 }, jurisdiction_disposition: { release_id: result.governed.disposition.manifest.value.release_id, manifest_path: path.relative(result.root, result.governed.disposition.manifestPath).replaceAll("\\", "/"), manifest_sha256: result.governed.disposition.manifest.sha256, artifact_sha256: result.governed.governed.artifact.sha256 }, refresh_assessment: { assessment_id: result.assessment.value.assessment_id, path: ASSESSMENT, sha256: result.assessment.sha256 } }, review: review(), summary: result.summary, claims: claims(), artifacts }; }

export async function buildNationalIrsEoSupplementalIndustryEvidence({ root = APP_ROOT, outputRoot } = {}) {
  const result = await composeNationalIrsEoSupplementalIndustryEvidence({ root });
  const payloads = [];
  for (let prefix = 0; prefix < 100; prefix++) { const key = String(prefix).padStart(2, "0"), rows = result.zipRows.filter(row => row.zip5.startsWith(key)), plain = Buffer.from(rows.map(stable).join("")), compressed = gzipSync(plain, { level: 9, mtime: 0 }); payloads.push({ name: `zip2=${key}.jsonl.gz`, raw: compressed, descriptor: descriptor(`zip2=${key}.jsonl.gz`, "irs-eo-supplemental-exact-zip-jsonl-gzip", compressed, rows.length, plain.length) }); }
  for (const [name, type, rows] of [["geography-disposition-scopes.json", "irs-eo-supplemental-geography-disposition-scopes", result.scopeRows], ["reported-jurisdictions.json", "irs-eo-supplemental-reported-filing-address-jurisdictions", result.reportedRows]]) { const raw = Buffer.from(stable(rows)); payloads.push({ name, raw, descriptor: descriptor(name, type, raw, rows.length) }); }
  const nationalRaw = Buffer.from(stable({ schema_version: "national-irs-eo-supplemental-industry-evidence-summary@1.0.0", ...result.summary, review: review(), claims: claims() })); payloads.push({ name: "national-summary.json", raw: nationalRaw, descriptor: descriptor("national-summary.json", "irs-eo-supplemental-national-summary", nationalRaw, 1) });
  const body = manifestBody(result, payloads.map(item => item.descriptor)), manifest = { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
  outputRoot = inside(result.root, outputRoot ?? path.join(result.root, "data", DATASET)); const directory = path.join(outputRoot, "releases", manifest.release_id); await fs.mkdir(directory, { recursive: true });
  for (const item of [...payloads, { name: "manifest.json", raw: Buffer.from(stable(manifest)) }]) { const file = path.join(directory, item.name); await fs.writeFile(file, item.raw, { flag: "wx" }).catch(async error => { if (error.code !== "EEXIST") throw error; check(sha(await bytes(file)) === sha(item.raw), "immutable release drift"); }); }
  return verifyNationalIrsEoSupplementalIndustryEvidence(path.join(directory, "manifest.json"), { root: result.root });
}

export async function verifyNationalIrsEoSupplementalIndustryEvidence(manifestPath, { root = APP_ROOT } = {}) {
  root = path.resolve(root); manifestPath = inside(root, manifestPath); const read = await json(manifestPath, 500_000), manifest = read.value, { release_id, ...body } = manifest;
  check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && release_id === `${DATASET}-${sha(JSON.stringify(body))}` && path.basename(path.dirname(manifestPath)) === release_id, "manifest identity");
  check(JSON.stringify(manifest.claims) === JSON.stringify(claims()) && JSON.stringify(manifest.review) === JSON.stringify(review()), "closed claims and review");
  const result = await composeNationalIrsEoSupplementalIndustryEvidence({ root }), expected = new Map();
  for (let prefix = 0; prefix < 100; prefix++) { const key = String(prefix).padStart(2, "0"), plain = Buffer.from(result.zipRows.filter(row => row.zip5.startsWith(key)).map(stable).join("")), compressed = gzipSync(plain, { level: 9, mtime: 0 }); expected.set(`zip2=${key}.jsonl.gz`, { raw: compressed, count: result.zipRows.filter(row => row.zip5.startsWith(key)).length, decoded: plain.length }); }
  expected.set("geography-disposition-scopes.json", { raw: Buffer.from(stable(result.scopeRows)), count: 60 }); expected.set("reported-jurisdictions.json", { raw: Buffer.from(stable(result.reportedRows)), count: 56 }); expected.set("national-summary.json", { raw: Buffer.from(stable({ schema_version: "national-irs-eo-supplemental-industry-evidence-summary@1.0.0", ...result.summary, review: review(), claims: claims() })), count: 1 });
  check(manifest.artifacts.length === 103 && expected.size === 103, "closed artifact count");
  for (const artifact of manifest.artifacts) { const item = expected.get(artifact.path); check(item && artifact.record_count === item.count && artifact.bytes === item.raw.length && artifact.sha256 === sha(item.raw) && (item.decoded === undefined || artifact.decoded_bytes === item.decoded), `artifact descriptor ${artifact.path}`); const actual = await bytes(inside(path.dirname(manifestPath), artifact.path), 25_000_000); check(actual.equals(item.raw), `artifact replay ${artifact.path}`); if (item.decoded !== undefined) check(gunzipSync(actual).length === item.decoded, `gzip replay ${artifact.path}`); }
  const expectedBody = manifestBody(result, manifest.artifacts); check(JSON.stringify(body) === JSON.stringify(expectedBody), "manifest replay");
  check((await fs.readdir(path.dirname(manifestPath))).sort().join("|") === [...expected.keys(), "manifest.json"].sort().join("|"), "closed release inventory");
  return { verified: true, release_id, manifest_sha256: read.sha256, ...result.summary };
}

export async function verifyRegisteredNationalIrsEoSupplementalIndustryEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root); const registration = await json(inside(root, `config/datasets/${DATASET}.json`), 100_000), value = registration.value;
  check(value.schema_version === `${DATASET}-registration@1.0.0` && value.runtime_pointer === null && value.production_enrollment === false && JSON.stringify(value.claims) === JSON.stringify(claims()), "registration contract");
  const r = value.retained_release, verified = await verifyNationalIrsEoSupplementalIndustryEvidence(inside(root, r.manifest), { root });
  const manifest = await json(inside(root, r.manifest), 500_000);
  check(verified.release_id === r.release_id && verified.manifest_sha256 === r.manifest_sha256 && manifest.buffer.length === r.manifest_bytes && manifest.value.artifacts.length === r.artifact_count && verified.organization_membership_count === r.organization_membership_count && verified.zip5_rows === r.zip5_rows && verified.positive_zip5_rows === r.positive_zip5_rows && verified.geography_disposition_scope_rows === r.geography_disposition_scope_rows && verified.reported_filing_address_jurisdiction_rows === r.reported_filing_address_jurisdiction_rows, "registration pins"); return verified;
}

export const nationalIrsEoSupplementalClaimsForTest = claims;
export const nationalIrsEoSupplementalReadForTest = (file, max) => bytes(file, max);
export const nationalIrsEoSupplementalJsonlForTest = (buffer, limits) => jsonl(buffer, limits);
