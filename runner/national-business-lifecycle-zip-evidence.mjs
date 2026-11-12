import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { APP_ROOT } from "./paths.mjs";
import { readBusinessEntityLifecycleEligibilitySummary } from "./business-entity-lifecycle-eligibility.mjs";

export const DATASET = "national-business-lifecycle-zip-evidence";
export const VERSION = `${DATASET}@1.0.0`;
const ROW_VERSION = `${DATASET}-row@1.0.0`;
const SUMMARY_VERSION = `${DATASET}-summary@1.0.0`;
const RELEASE_VERSION = `${DATASET}-release@1.0.0`;
const REGISTRATION_VERSION = `${DATASET}-registration@1.0.0`;
const LIFECYCLE = {
  release_id: "business-entity-lifecycle-eligibility-a4b84f5cace847e888832a2efefd09efadb773463864b11bcfad89be3936087f",
  manifest_sha256: "d5477035d4cf9f248ecabac77de1a54ac5acf02bb5658ae591eb530e2ad925ac",
  profile_count: 8011213,
};
const COHORT = {
  release_id: "zip-denominator-gap-cohort-20261112095233801-71dcb2b90b6d",
  manifest_sha256: "30a5027eb2cce3c21ed5f01743419559eb8739bf0498c6b6cd9570a1ecafe2b1",
  artifact_sha256: "cb3ba83b13d3a7d91442c00fbbfb239d5de25e7116cec6f97c87aec82dcd3a3c",
  rows: 48194,
};
const MATRIX = {
  release_id: "national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629",
  manifest_sha256: "d4b2c8f50112fd16bea00769c3ac93b98b1ac2d14f334a3f9e448616931f01d1",
  rows: 48194,
};
const LIFECYCLE_CLASSES = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW_CLASSES = ["within-review-window", "stale", "unmeasured", "unmapped"];
const COHORT_CLASSES = ["same-code-census-zcta", "source-contributed-outside-zcta", "denominator-only-outside-zcta", "explicit-placeholder"];
const DECISION_KEYS = ["schema_version", "profile_id", "zip5", "source_id", "source_release_id", "source_record_lineage_sha256", "policy_id", "policy_sha256", "taxonomy_source_key", "source_status_value", "source_status_sha256", "profile_observed_at", "source_reference_at", "assessment_as_of", "source_membership_class", "review_status", "lifecycle_evidence", "current_operation_verified", "active_business_eligible", "reason_codes"];
const SHA = /^[a-f0-9]{64}$/;
const LIMITS = { compressed: 40_000_000, decoded: 600_000_000, line: 32_768, rows: 9_000_000, cohort_bytes: 100_000_000, output_decoded: 100_000_000 };
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const check = (value, message) => { if (!value) throw new Error(`Lifecycle ZIP evidence rejected: ${message}.`); };
const stop = signal => signal?.throwIfAborted();
const blank = keys => Object.fromEntries(keys.map(key => [key, 0]));
const sum = value => Object.values(value).reduce((total, count) => total + count, 0);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const relative = (root, file) => {
  const resolved = path.resolve(root, file), part = path.relative(root, resolved);
  check(part && !part.startsWith("..") && !path.isAbsolute(part), "path containment");
  return resolved;
};

async function canonical(root, filename) {
  const target = relative(root, filename), part = path.relative(root, target); let cursor = root;
  for (const segment of part.split(path.sep)) { cursor = path.join(cursor, segment); check(!(await fs.lstat(cursor)).isSymbolicLink(), "symlink ancestry"); }
  check(await fs.realpath(target) === target, "noncanonical path"); return target;
}

function aggregateRow(zip5, cohortClassification) {
  return { zip5, cohort_classification: cohortClassification, profile_membership_count: 0,
    lifecycle_evidence_counts: blank(LIFECYCLE_CLASSES), review_status_counts: blank(REVIEW_CLASSES), sources: new Map() };
}

function sourceRow(sourceId) {
  return { source_id: sourceId, profile_membership_count: 0,
    lifecycle_evidence_counts: blank(LIFECYCLE_CLASSES), review_status_counts: blank(REVIEW_CLASSES) };
}

function serialized(row) {
  return { schema_version: ROW_VERSION, zip5: row.zip5, cohort_classification: row.cohort_classification,
    profile_membership_count: row.profile_membership_count, lifecycle_evidence_counts: row.lifecycle_evidence_counts,
    review_status_counts: row.review_status_counts, sources: [...row.sources.values()].sort((a, b) => a.source_id.localeCompare(b.source_id)) };
}

export function validateLifecycleZipDecisionForTest(row) {
  check(exact(row, DECISION_KEYS) && row.schema_version === "business-entity-lifecycle-eligibility-row@1.0.0"
    && typeof row.profile_id === "string" && row.profile_id.startsWith("location-profile:") && /^\d{5}$/.test(row.zip5)
    && typeof row.source_id === "string" && row.source_id.length > 0 && typeof row.source_release_id === "string" && row.source_release_id.length > 0
    && SHA.test(row.source_record_lineage_sha256) && typeof row.policy_id === "string" && SHA.test(row.policy_sha256)
    && typeof row.taxonomy_source_key === "string" && (row.source_status_value === null || typeof row.source_status_value === "string")
    && SHA.test(row.source_status_sha256) && typeof row.profile_observed_at === "string" && !Number.isNaN(Date.parse(row.profile_observed_at))
    && (row.source_reference_at === null || typeof row.source_reference_at === "string" && !Number.isNaN(Date.parse(row.source_reference_at)))
    && row.assessment_as_of === "2026-10-02T16:30:00.000Z" && typeof row.source_membership_class === "string"
    && REVIEW_CLASSES.includes(row.review_status) && LIFECYCLE_CLASSES.includes(row.lifecycle_evidence)
    && row.current_operation_verified === false && row.active_business_eligible === false
    && Array.isArray(row.reason_codes) && row.reason_codes.length > 0 && row.reason_codes.every(reason => typeof reason === "string" && reason.length > 0), "lifecycle decision contract");
  return row;
}

export function aggregateLifecycleZipRowsForTest(cohortRows, decisions) {
  const cohort = new Map();
  for (const row of cohortRows) {
    check(/^\d{5}$/.test(row.zip5) && COHORT_CLASSES.includes(row.classification) && !cohort.has(row.zip5), "cohort fixture");
    cohort.set(row.zip5, aggregateRow(row.zip5, row.classification));
  }
  const outside = new Map(), totals = { profile_membership_count: 0, lifecycle_evidence_counts: blank(LIFECYCLE_CLASSES), review_status_counts: blank(REVIEW_CLASSES), source_counts: {} };
  for (const decisionValue of decisions) {
    const decision = validateLifecycleZipDecisionForTest(decisionValue), destination = cohort.get(decision.zip5) ?? (() => {
      if (!outside.has(decision.zip5)) outside.set(decision.zip5, aggregateRow(decision.zip5, "outside-governed-zip-cohort"));
      return outside.get(decision.zip5);
    })();
    let source = destination.sources.get(decision.source_id);
    if (!source) { source = sourceRow(decision.source_id); destination.sources.set(decision.source_id, source); }
    destination.profile_membership_count++; destination.lifecycle_evidence_counts[decision.lifecycle_evidence]++;
    destination.review_status_counts[decision.review_status]++; source.profile_membership_count++;
    source.lifecycle_evidence_counts[decision.lifecycle_evidence]++; source.review_status_counts[decision.review_status]++;
    totals.profile_membership_count++; totals.lifecycle_evidence_counts[decision.lifecycle_evidence]++; totals.review_status_counts[decision.review_status]++;
    totals.source_counts[decision.source_id] = (totals.source_counts[decision.source_id] ?? 0) + 1;
  }
  return { rows: [...cohort.values()].sort((a, b) => a.zip5.localeCompare(b.zip5)).map(serialized),
    outside_rows: [...outside.values()].sort((a, b) => a.zip5.localeCompare(b.zip5)).map(serialized), totals };
}

async function bytes(root, filename, maximum, signal) {
  stop(signal); const file = await canonical(root, filename), before = await fs.lstat(file), value = await fs.readFile(file), after = await fs.lstat(file);
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && value.length === before.size && value.length > 0 && value.length <= maximum, "bounded stable file"); return { value, sha256: sha(value) };
}

async function streamJsonl(root, base, artifact, signal, consume, maximum = LIMITS.compressed) {
  check(object(artifact) && typeof artifact.path === "string" && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes <= maximum
    && Number.isSafeInteger(artifact.record_count) && artifact.record_count >= 0 && artifact.record_count <= LIMITS.rows && SHA.test(artifact.sha256), "artifact declaration");
  const filename = await canonical(root, path.join(base, artifact.path)), before = await fs.lstat(filename), input = createReadStream(filename), digest = createHash("sha256");
  let compressed = 0, decoded = 0, records = 0, carry = Buffer.alloc(0);
  const meter = new Transform({ transform(chunk, encoding, callback) { compressed += chunk.length; digest.update(chunk); callback(compressed > maximum ? new Error("Lifecycle ZIP evidence rejected: compressed bound.") : null, chunk); } });
  const decodedMeter = new Transform({ transform(chunk, encoding, callback) { decoded += chunk.length; callback(decoded > LIMITS.decoded ? new Error("Lifecycle ZIP evidence rejected: decoded bound.") : null, chunk); } });
  const parse = async raw => { stop(signal); if (raw.at(-1) === 13) raw = raw.subarray(0, -1); check(raw.length > 0 && raw.length <= LIMITS.line, "line bound"); records++; check(records <= LIMITS.rows, "row bound"); await consume(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw))); };
  const sink = new Writable({ write(chunk, encoding, callback) { (async () => { const all = carry.length ? Buffer.concat([carry, chunk]) : chunk; let start = 0, end; while ((end = all.indexOf(10, start)) >= 0) { await parse(all.subarray(start, end)); start = end + 1; } carry = Buffer.from(all.subarray(start)); check(carry.length <= LIMITS.line, "line carry bound"); })().then(() => callback(), callback); }, final(callback) { (async () => { if (carry.length) await parse(carry); })().then(() => callback(), callback); } });
  try { await pipeline(input, meter, ...(artifact.path.endsWith(".gz") ? [zlib.createGunzip()] : []), decodedMeter, sink, { signal }); }
  finally { input.destroy(); meter.destroy(); decodedMeter.destroy(); sink.destroy(); }
  const after = await fs.lstat(filename);
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && compressed === artifact.bytes && records === artifact.record_count && digest.digest("hex") === artifact.sha256
    && (artifact.decoded_bytes === undefined || decoded === artifact.decoded_bytes), `artifact replay ${artifact.path}`);
}

async function loadInputs(root, signal) {
  root = path.resolve(root); const lifecycleSummary = await readBusinessEntityLifecycleEligibilitySummary({ root, signal });
  check(lifecycleSummary.release_id === LIFECYCLE.release_id && lifecycleSummary.manifest_sha256 === LIFECYCLE.manifest_sha256 && lifecycleSummary.artifact_record_count === LIFECYCLE.profile_count, "lifecycle pin");
  const lifecycleProof = await bytes(root, lifecycleSummary.manifest_path, 1_000_000, signal), lifecycleManifest = JSON.parse(lifecycleProof.value);
  check(lifecycleProof.sha256 === LIFECYCLE.manifest_sha256 && lifecycleManifest.artifacts.length === 100, "lifecycle manifest");
  const cohortRegistrationProof = await bytes(root, "config/datasets/zip-denominator-gap-cohort.json", 1_000_000, signal), cohortRegistration = JSON.parse(cohortRegistrationProof.value);
  check(cohortRegistration.retained_release.release_id === COHORT.release_id && cohortRegistration.retained_release.manifest_sha256 === COHORT.manifest_sha256 && cohortRegistration.retained_release.cohort_sha256 === COHORT.artifact_sha256 && cohortRegistration.retained_release.rows === COHORT.rows, "cohort registration");
  const cohortProof = await bytes(root, cohortRegistration.retained_release.manifest, 1_000_000, signal), cohortManifest = JSON.parse(cohortProof.value);
  const cohortArtifact = cohortManifest.artifacts.find(item => item.path === "cohort.jsonl");
  check(cohortProof.sha256 === COHORT.manifest_sha256 && cohortManifest.release_id === COHORT.release_id && cohortArtifact?.sha256 === COHORT.artifact_sha256 && cohortArtifact.record_count === COHORT.rows, "cohort manifest");
  const matrixRegistrationProof = await bytes(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json", 1_000_000, signal), matrixRegistration = JSON.parse(matrixRegistrationProof.value);
  check(matrixRegistration.retained_release.release_id === MATRIX.release_id && matrixRegistration.retained_release.manifest_sha256 === MATRIX.manifest_sha256 && matrixRegistration.retained_release.zip5_rows === MATRIX.rows, "matrix registration");
  const matrixProof = await bytes(root, matrixRegistration.retained_release.manifest, 1_000_000, signal), matrixManifest = JSON.parse(matrixProof.value);
  check(matrixProof.sha256 === MATRIX.manifest_sha256 && matrixManifest.release_id === MATRIX.release_id && matrixManifest.summary.zip5_rows === MATRIX.rows, "matrix manifest");
  return { root, lifecycleSummary, lifecycleManifest, lifecycleManifestPath: path.join(root, lifecycleSummary.manifest_path), cohortRegistrationProof, cohortRegistration, cohortManifest, cohortManifestPath: path.join(root, cohortRegistration.retained_release.manifest), cohortArtifact, matrixRegistrationProof, matrixRegistration, matrixProof };
}

async function derive(root, signal) {
  const input = await loadInputs(root, signal), cohortRows = [];
  await streamJsonl(input.root, path.dirname(input.cohortManifestPath), input.cohortArtifact, signal, row => {
    check(row.schema_version === "zip-denominator-gap-row@1.0.0" && /^\d{5}$/.test(row.zip5) && COHORT_CLASSES.includes(row.classification), "cohort row");
    cohortRows.push({ zip5: row.zip5, classification: row.classification });
  }, LIMITS.cohort_bytes);
  check(cohortRows.length === COHORT.rows && cohortRows.every((row, index) => index === 0 || cohortRows[index - 1].zip5 < row.zip5), "cohort order/count");
  const cohort = new Map(cohortRows.map(row => [row.zip5, aggregateRow(row.zip5, row.classification)])), outside = new Map();
  const totals = { profile_membership_count: 0, lifecycle_evidence_counts: blank(LIFECYCLE_CLASSES), review_status_counts: blank(REVIEW_CLASSES),
    source_counts: Object.fromEntries(Object.keys(input.lifecycleSummary.summary.source_counts).map(sourceId => [sourceId, 0])) };
  for (const artifact of input.lifecycleManifest.artifacts) {
    await streamJsonl(input.root, path.dirname(input.lifecycleManifestPath), artifact, signal, row => {
      const decision = validateLifecycleZipDecisionForTest(row); let destination = cohort.get(decision.zip5);
      if (!destination) { if (!outside.has(decision.zip5)) outside.set(decision.zip5, aggregateRow(decision.zip5, "outside-governed-zip-cohort")); destination = outside.get(decision.zip5); }
      let source = destination.sources.get(decision.source_id); if (!source) { source = sourceRow(decision.source_id); destination.sources.set(decision.source_id, source); }
      destination.profile_membership_count++; destination.lifecycle_evidence_counts[decision.lifecycle_evidence]++; destination.review_status_counts[decision.review_status]++;
      source.profile_membership_count++; source.lifecycle_evidence_counts[decision.lifecycle_evidence]++; source.review_status_counts[decision.review_status]++;
      totals.profile_membership_count++; totals.lifecycle_evidence_counts[decision.lifecycle_evidence]++; totals.review_status_counts[decision.review_status]++;
      check(Object.hasOwn(totals.source_counts, decision.source_id), "registered lifecycle source"); totals.source_counts[decision.source_id]++;
    });
  }
  check(totals.profile_membership_count === LIFECYCLE.profile_count && equal(totals.lifecycle_evidence_counts, input.lifecycleSummary.summary.lifecycle_evidence_counts)
    && equal(totals.review_status_counts, input.lifecycleSummary.summary.review_status_counts) && equal(totals.source_counts, input.lifecycleSummary.summary.source_counts), "lifecycle conservation");
  const rows = [...cohort.values()].sort((a, b) => a.zip5.localeCompare(b.zip5)).map(serialized), outsideRows = [...outside.values()].sort((a, b) => a.zip5.localeCompare(b.zip5)).map(serialized);
  const positive = rows.filter(row => row.profile_membership_count > 0).length, cohortClassCounts = blank(COHORT_CLASSES);
  for (const row of rows) { cohortClassCounts[row.cohort_classification]++; check(row.profile_membership_count === sum(row.lifecycle_evidence_counts) && row.profile_membership_count === sum(row.review_status_counts) && row.profile_membership_count === row.sources.reduce((total, source) => total + source.profile_membership_count, 0), "ZIP conservation"); }
  const bindings = { lifecycle: { release_id: input.lifecycleSummary.release_id, manifest_sha256: input.lifecycleSummary.manifest_sha256, registration_sha256: input.lifecycleSummary.registration_sha256, taxonomy_sha256: input.lifecycleSummary.taxonomy_sha256, assessment_as_of: input.lifecycleSummary.assessment_as_of },
    zip_cohort: { release_id: COHORT.release_id, manifest_sha256: COHORT.manifest_sha256, artifact_sha256: COHORT.artifact_sha256, registration_sha256: input.cohortRegistrationProof.sha256 },
    exact_zip_matrix: { release_id: MATRIX.release_id, manifest_sha256: MATRIX.manifest_sha256, registration_sha256: input.matrixRegistrationProof.sha256 } };
  const summary = { schema_version: SUMMARY_VERSION, dataset_id: DATASET, status: "retained-source-relative-lifecycle-membership-evidence", zip5_rows: rows.length, positive_zip5_rows: positive, zero_profile_zip5_rows: rows.length - positive,
    outside_cohort_zip5_rows: outsideRows.length, outside_cohort_profile_memberships: outsideRows.reduce((total, row) => total + row.profile_membership_count, 0), profile_membership_count: totals.profile_membership_count,
    lifecycle_evidence_counts: totals.lifecycle_evidence_counts, review_status_counts: totals.review_status_counts, source_counts: totals.source_counts, cohort_classification_counts: cohortClassCounts,
    bindings, claims: claims() };
  return { input, rows, outsideRows, summary, bindings };
}

function claims() {
  return { record_unit: "registry-location-profile-lifecycle-membership", dense_governed_zip_cohort: true, source_relative_lifecycle_evidence: true,
    non_numerator_sidecar: true, unique_business_count: null, active_business_count: null, current_operating_business_count: null,
    all_business_completeness: null, current_operation_verified: false, active_business_eligible: false, identity_resolution_applied: false,
    additive_across_sources: false, authoritative_current_usps_zip_denominator: null, zip4_joined: false, network_requests: 0,
    source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false };
}

async function writeArtifact(directory, name, value, type, gzip = false) {
  const plain = Buffer.isBuffer(value) ? value : Buffer.from(value), output = gzip ? zlib.gzipSync(plain, { level: 6 }) : plain;
  check(plain.length <= LIMITS.output_decoded, "output decoded bound"); const filename = path.join(directory, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, output, { flag: "wx" });
  return { path: name, artifact_type: type, record_count: gzip ? plain.toString("utf8").split("\n").filter(Boolean).length : 1, bytes: output.length, decoded_bytes: plain.length, sha256: sha(output) };
}

function releaseBody(bindings, summary, artifacts) {
  return { schema_version: RELEASE_VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", publication_mode: "pointer-free", bindings,
    summary: { zip5_rows: summary.zip5_rows, positive_zip5_rows: summary.positive_zip5_rows, zero_profile_zip5_rows: summary.zero_profile_zip5_rows,
      outside_cohort_zip5_rows: summary.outside_cohort_zip5_rows, outside_cohort_profile_memberships: summary.outside_cohort_profile_memberships,
      profile_membership_count: summary.profile_membership_count, lifecycle_evidence_counts: summary.lifecycle_evidence_counts,
      review_status_counts: summary.review_status_counts, source_counts: summary.source_counts, cohort_classification_counts: summary.cohort_classification_counts },
    claims: claims(), artifacts };
}

export async function buildNationalBusinessLifecycleZipEvidence({ root = APP_ROOT, outputRoot = path.join(APP_ROOT, `data/${DATASET}`), signal } = {}) {
  root = path.resolve(root); outputRoot = path.resolve(outputRoot); relative(root, outputRoot); const derived = await derive(root, signal);
  const staging = path.join(outputRoot, `.staging-${randomUUID()}`); await fs.mkdir(staging, { recursive: true });
  try {
    const artifacts = [], byPrefix = new Map(); for (const row of derived.rows) { const prefix = row.zip5.slice(0, 2); if (!byPrefix.has(prefix)) byPrefix.set(prefix, []); byPrefix.get(prefix).push(row); }
    for (let index = 0; index < 100; index++) { const prefix = String(index).padStart(2, "0"), rows = byPrefix.get(prefix) ?? [], body = Buffer.from(rows.map(stable).join("")); artifacts.push(await writeArtifact(staging, `zip2=${prefix}.jsonl.gz`, body, "lifecycle-zip-evidence-jsonl-gzip", true)); }
    const outsideBody = Buffer.from(derived.outsideRows.map(stable).join("")); artifacts.push(await writeArtifact(staging, "outside-cohort.jsonl.gz", outsideBody, "lifecycle-outside-cohort-jsonl-gzip", true));
    artifacts.push(await writeArtifact(staging, "summary.json", Buffer.from(stable(derived.summary)), "lifecycle-zip-evidence-summary-json"));
    const seed = releaseBody(derived.bindings, derived.summary, artifacts), releaseId = `${DATASET}-${sha(stable(seed))}`, manifest = { release_id: releaseId, ...seed }, manifestBytes = Buffer.from(stable(manifest));
    await fs.writeFile(path.join(staging, "manifest.json"), manifestBytes, { flag: "wx" }); const releaseDirectory = path.join(outputRoot, "releases", releaseId); await fs.mkdir(path.dirname(releaseDirectory), { recursive: true });
    try { await fs.rename(staging, releaseDirectory); } catch (error) {
      if (!["EEXIST", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error;
      const existing = await fs.readFile(path.join(releaseDirectory, "manifest.json")).catch(() => null);
      check(existing?.equals(manifestBytes), "existing release differs"); await fs.rm(staging, { recursive: true });
    }
    return { release_id: releaseId, manifest: path.relative(root, path.join(releaseDirectory, "manifest.json")).replaceAll("\\", "/"), manifest_sha256: sha(manifestBytes), manifest_bytes: manifestBytes.length,
      zip5_rows: derived.summary.zip5_rows, positive_zip5_rows: derived.summary.positive_zip5_rows, profile_membership_count: derived.summary.profile_membership_count, artifact_count: artifacts.length };
  } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
}

function validateOutputRow(row, expected) {
  check(exact(row, ["schema_version", "zip5", "cohort_classification", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts", "sources"])
    && row.schema_version === ROW_VERSION && equal(row, expected), `output row ${expected.zip5}`);
}

export async function verifyNationalBusinessLifecycleZipEvidence(manifestPath, { root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); const derived = await derive(root, signal), proof = await bytes(root, manifestPath, 1_000_000, signal), manifest = JSON.parse(proof.value);
  check(manifest.schema_version === RELEASE_VERSION && manifest.dataset_id === DATASET && manifest.status === "immutable-pointer-free-local-review-only" && manifest.publication_mode === "pointer-free"
    && equal(manifest.bindings, derived.bindings) && equal(manifest.claims, claims()) && manifest.release_id === `${DATASET}-${sha(stable(releaseBody(manifest.bindings, manifest.summary, manifest.artifacts)))}`
    && Array.isArray(manifest.artifacts) && manifest.artifacts.length === 102, "release manifest");
  const base = path.dirname(path.resolve(manifestPath)), expected = new Map(derived.rows.map(row => [row.zip5, row])), seen = new Set();
  for (let index = 0; index < 100; index++) { const prefix = String(index).padStart(2, "0"), artifact = manifest.artifacts.find(item => item.path === `zip2=${prefix}.jsonl.gz`); check(artifact, "ZIP artifact roster"); await streamJsonl(root, base, artifact, signal, row => { check(row.zip5.startsWith(prefix) && !seen.has(row.zip5) && expected.has(row.zip5), "ZIP output identity"); validateOutputRow(row, expected.get(row.zip5)); seen.add(row.zip5); }); }
  const outsideArtifact = manifest.artifacts.find(item => item.path === "outside-cohort.jsonl.gz"); check(outsideArtifact, "outside artifact"); const outside = [];
  await streamJsonl(root, base, outsideArtifact, signal, row => outside.push(row)); check(equal(outside, derived.outsideRows), "outside cohort replay");
  const summaryArtifact = manifest.artifacts.find(item => item.path === "summary.json"), summaryProof = await bytes(root, path.join(base, summaryArtifact.path), 1_000_000, signal);
  check(summaryProof.sha256 === summaryArtifact.sha256 && summaryProof.value.length === summaryArtifact.bytes && equal(JSON.parse(summaryProof.value), derived.summary) && seen.size === derived.rows.length
    && equal(manifest.summary, releaseBody(derived.bindings, derived.summary, []).summary), "summary/output conservation");
  return { release_id: manifest.release_id, manifest_sha256: proof.sha256, summary: derived.summary, artifact_count: manifest.artifacts.length, claims: manifest.claims };
}

export async function verifyRegisteredNationalBusinessLifecycleZipEvidence({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); const registrationProof = await bytes(root, `config/datasets/${DATASET}.json`, 1_000_000, signal), registration = JSON.parse(registrationProof.value);
  check(exact(registration, ["schema_version", "dataset_id", "status", "runtime_pointer", "production_enrollment", "retained_release", "claims", "documentation"])
    && registration.schema_version === REGISTRATION_VERSION && registration.dataset_id === DATASET && registration.status === "registered-pointer-free-local-review-only"
    && registration.runtime_pointer === null && registration.production_enrollment === false && registration.documentation === "docs/NATIONAL-BUSINESS-LIFECYCLE-ZIP-EVIDENCE.md"
    && exact(registration.retained_release, ["release_id", "manifest", "manifest_sha256", "manifest_bytes", "zip5_rows", "positive_zip5_rows", "profile_membership_count", "artifact_count"])
    && registration.retained_release.release_id.startsWith(`${DATASET}-`) && registration.retained_release.manifest === `data/${DATASET}/releases/${registration.retained_release.release_id}/manifest.json`
    && SHA.test(registration.retained_release.manifest_sha256) && Number.isSafeInteger(registration.retained_release.manifest_bytes) && registration.retained_release.manifest_bytes > 0
    && equal(registration.claims, claims()), "registration");
  const verified = await verifyNationalBusinessLifecycleZipEvidence(path.join(root, registration.retained_release.manifest), { root, signal });
  check(verified.release_id === registration.retained_release.release_id && verified.manifest_sha256 === registration.retained_release.manifest_sha256
    && (await fs.stat(path.join(root, registration.retained_release.manifest))).size === registration.retained_release.manifest_bytes
    && verified.summary.zip5_rows === registration.retained_release.zip5_rows && verified.summary.profile_membership_count === registration.retained_release.profile_membership_count
    && verified.artifact_count === registration.retained_release.artifact_count, "registered release pin");
  return { ...verified, registration_sha256: registrationProof.sha256 };
}

export { claims as lifecycleZipEvidenceClaimsForTest };
