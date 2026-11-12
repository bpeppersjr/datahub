import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { APP_ROOT } from "./paths.mjs";

export const VERSION = "national-business-lifecycle-jurisdiction-evidence-release@1.0.0";
const DATASET = "national-business-lifecycle-jurisdiction-evidence";
const LIFE = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SPECIAL = ["multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"];
const TERRITORY = new Set(["60", "66", "69", "72", "78"]);
const SHA = /^[a-f0-9]{64}$/;
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const fail = message => { throw Error(`Lifecycle jurisdiction evidence rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const inside = (root, file) => {
  const resolvedRoot = path.resolve(root), resolvedFile = path.resolve(resolvedRoot, file);
  check(resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`), "path outside root");
  return resolvedFile;
};

async function bytes(file, max = 100_000_000) {
  const handle = await fs.open(file, "r");
  try {
    const before = await handle.stat();
    check(before.isFile() && !before.isSymbolicLink() && before.size <= max, "bounded regular file");
    const value = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < value.length) {
      const read = await handle.read(value, offset, value.length - offset, offset);
      check(read.bytesRead > 0, "short read"); offset += read.bytesRead;
    }
    const after = await handle.stat();
    check(after.size === before.size && after.mtimeMs === before.mtimeMs, "file changed while reading");
    return value;
  } finally { await handle.close(); }
}
async function json(file, max) {
  const buffer = await bytes(file, max);
  try { return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) }; }
  catch { fail("JSON syntax"); }
}
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);
const zeros = keys => Object.fromEntries(keys.map(key => [key, 0]));
const scopeKind = id => id.startsWith("state:") ? "state" : id.startsWith("territory:") ? "territory" : id;
const claims = () => ({
  record_unit: "registry-location-profile-lifecycle-membership",
  governed_jurisdiction_disposition_reused: true,
  source_relative_lifecycle_evidence: true,
  non_numerator_sidecar: true,
  unique_business_count: null,
  active_business_count: null,
  current_operating_business_count: null,
  all_business_completeness: null,
  current_operation_verified: false,
  active_business_eligible: false,
  identity_resolution_applied: false,
  additive_across_sources: false,
  cross_source_additivity: false,
  authoritative_current_usps_zip_denominator: null,
  usps_zip_state_assignment: false,
  multi_state_evidence_allocated: false,
  fractional_allocation: false,
  zip4_joined: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
});

async function registered(root, name, maxManifest = 2_000_000) {
  const registrationPath = inside(root, `config/datasets/${name}.json`);
  const registration = await json(registrationPath, 1_000_000);
  const retained = registration.value.retained_release;
  check(registration.value.dataset_id === name && registration.value.runtime_pointer === null && registration.value.production_enrollment === false, `${name} registration policy`);
  check(retained && SHA.test(retained.manifest_sha256), `${name} retained release`);
  const manifestPath = inside(root, retained.manifest), manifest = await json(manifestPath, maxManifest);
  check(manifest.sha256 === retained.manifest_sha256 && manifest.value.release_id === retained.release_id, `${name} registered manifest integrity`);
  return { registration, retained, manifest, manifestPath };
}

async function dispositionMapping(root, disposition) {
  const manifest = disposition.manifest.value;
  const artifact = manifest.artifacts?.find(item => item.path === "state-dispositions.json");
  check(artifact && SHA.test(artifact.sha256), "disposition artifact descriptor");
  const artifactRead = await json(inside(path.dirname(disposition.manifestPath), artifact.path), 20_000_000);
  check(artifactRead.sha256 === artifact.sha256 && artifactRead.value.length === 60, "disposition artifact integrity");
  const rowsById = new Map(artifactRead.value.map(row => [row.scope_id, row]));
  check(rowsById.size === 60 && SPECIAL.every(id => rowsById.has(id)), "closed 60-scope roster");

  const matrixPath = inside(root, manifest.bindings.matrix.manifest_path);
  const matrix = await json(matrixPath, 2_000_000);
  check(matrix.sha256 === manifest.bindings.matrix.manifest_sha256 && matrix.value.release_id === manifest.bindings.matrix.release_id, "disposition matrix binding");
  const crosswalkPath = inside(root, manifest.bindings.crosswalk.manifest_path);
  const crosswalk = await json(crosswalkPath, 2_000_000);
  check(crosswalk.sha256 === manifest.bindings.crosswalk.manifest_sha256 && crosswalk.value.release_id === manifest.bindings.crosswalk.release_id, "disposition crosswalk binding");
  const zctaArtifact = crosswalk.value.artifacts.find(item => item.artifact_type === "zcta-overlay-summary");
  const zctaBytes = await bytes(inside(path.dirname(crosswalkPath), zctaArtifact.path), 40_000_000);
  check(sha(zctaBytes) === zctaArtifact.sha256, "crosswalk ZCTA artifact integrity");
  const zcta = new Map(zctaBytes.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line)).map(row => [row.zcta, row]));
  const mapping = new Map(), derivedCounts = new Map([...rowsById].map(([id]) => [id, 0]));
  for (const artifactRow of matrix.value.artifacts.filter(item => /^prefix=\d{2}\.json$/.test(item.path))) {
    const part = await json(inside(path.dirname(matrixPath), artifactRow.path), 25_000_000);
    check(part.sha256 === artifactRow.sha256 && part.value.length === artifactRow.record_count, "disposition matrix partition integrity");
    for (const row of part.value) {
      const zctaId = /^\d{5}$/.test(row.zcta_geoid ?? "") ? row.zcta_geoid : null;
      const overlay = zctaId ? zcta.get(zctaId) : null;
      let scopeId;
      if (row.cohort_classification === "explicit-placeholder") scopeId = "explicit-placeholder";
      else if (!zctaId) scopeId = "non-zcta-unassigned";
      else if (!overlay || overlay.overlay_status !== "complete-within-tolerance") scopeId = "zcta-overlay-unresolved";
      else if (overlay.crosses_state_boundary_materially) scopeId = "multi-state-material";
      else {
        const fips = overlay.dominant_state_geo_id.slice(-2);
        scopeId = `${TERRITORY.has(fips) ? "territory" : "state"}:${fips}`;
      }
      check(rowsById.has(scopeId) && /^\d{5}$/.test(row.zip5) && !mapping.has(row.zip5), "governed ZIP scope mapping");
      mapping.set(row.zip5, scopeId); derivedCounts.set(scopeId, derivedCounts.get(scopeId) + 1);
    }
  }
  check(mapping.size === 48_194, "48,194 governed ZIP mappings");
  for (const [id, row] of rowsById) check(derivedCounts.get(id) === row.zip5_rows, `disposition scope replay ${id}`);
  return { rowsById, mapping, artifactRead, artifact, matrix, matrixPath, crosswalk, crosswalkPath };
}

function blankScope(dispositionRow, sourceIds) {
  return {
    schema_version: "national-business-lifecycle-jurisdiction-evidence-row@1.0.0",
    scope_id: dispositionRow.scope_id,
    scope_kind: scopeKind(dispositionRow.scope_id),
    scope_label: dispositionRow.scope_label,
    state_geo_id: dispositionRow.state_geo_id,
    state_fips: dispositionRow.state_fips,
    state_name: dispositionRow.state_name,
    postal_abbreviation: dispositionRow.postal_abbreviation,
    zip5_rows: 0,
    positive_zip5_rows: 0,
    zero_profile_zip5_rows: 0,
    profile_membership_count: 0,
    lifecycle_evidence_counts: zeros(LIFE),
    review_status_counts: zeros(REVIEW),
    sources: sourceIds.map(source_id => ({ source_id, profile_membership_count: 0, lifecycle_evidence_counts: zeros(LIFE), review_status_counts: zeros(REVIEW) })),
  };
}
function addCounts(target, source) { for (const key of Object.keys(target)) target[key] += source[key]; }

export async function composeNationalBusinessLifecycleJurisdictionEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const lifecycle = await registered(root, "national-business-lifecycle-zip-evidence", 100_000);
  const disposition = await registered(root, "state-exact-zip-industry-evidence-disposition");
  check(lifecycle.manifest.value.summary.zip5_rows === 48_194 && lifecycle.manifest.value.summary.profile_membership_count === 8_011_213, "lifecycle national pins");
  check(disposition.manifest.value.summary.scope_rows === 60 && disposition.manifest.value.summary.zip5_rows === 48_194, "disposition national pins");
  const governed = await dispositionMapping(root, disposition);
  const sourceIds = Object.keys(lifecycle.manifest.value.summary.source_counts).sort();
  const buckets = new Map([...governed.rowsById].map(([id, row]) => [id, blankScope(row, sourceIds)]));
  const seen = new Set();
  for (const artifact of lifecycle.manifest.value.artifacts.filter(item => /^zip2=\d{2}\.jsonl\.gz$/.test(item.path))) {
    const compressed = await bytes(inside(path.dirname(lifecycle.manifestPath), artifact.path), 2_000_000);
    check(sha(compressed) === artifact.sha256, "lifecycle partition integrity");
    const decoded = gunzipSync(compressed, { maxOutputLength: 3_000_000 });
    check(decoded.length === artifact.decoded_bytes, "lifecycle decoded bytes");
    const rows = decoded.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    check(rows.length === artifact.record_count, "lifecycle partition row count");
    for (const row of rows) {
      const scopeId = governed.mapping.get(row.zip5), bucket = buckets.get(scopeId);
      check(scopeId && bucket && !seen.has(row.zip5), "lifecycle ZIP joined exactly once"); seen.add(row.zip5);
      bucket.zip5_rows++;
      if (row.profile_membership_count > 0) bucket.positive_zip5_rows++; else bucket.zero_profile_zip5_rows++;
      bucket.profile_membership_count += row.profile_membership_count;
      addCounts(bucket.lifecycle_evidence_counts, row.lifecycle_evidence_counts);
      addCounts(bucket.review_status_counts, row.review_status_counts);
      const bySource = new Map(bucket.sources.map(source => [source.source_id, source]));
      for (const source of row.sources) {
        const target = bySource.get(source.source_id); check(target, "closed lifecycle source roster");
        target.profile_membership_count += source.profile_membership_count;
        addCounts(target.lifecycle_evidence_counts, source.lifecycle_evidence_counts);
        addCounts(target.review_status_counts, source.review_status_counts);
      }
    }
  }
  check(seen.size === 48_194 && [...governed.mapping.keys()].every(zip5 => seen.has(zip5)), "ZIP cohort equality");
  const rows = [...buckets.values()].sort((a, b) => a.scope_id.localeCompare(b.scope_id));
  for (const row of rows) {
    check(row.zip5_rows === governed.rowsById.get(row.scope_id).zip5_rows, `scope ZIP conservation ${row.scope_id}`);
    check(row.positive_zip5_rows + row.zero_profile_zip5_rows === row.zip5_rows, `scope row conservation ${row.scope_id}`);
    check(sum(row.lifecycle_evidence_counts) === row.profile_membership_count && sum(row.review_status_counts) === row.profile_membership_count, `scope lifecycle conservation ${row.scope_id}`);
    check(row.sources.reduce((total, source) => total + source.profile_membership_count, 0) === row.profile_membership_count, `scope source conservation ${row.scope_id}`);
    for (const source of row.sources) check(sum(source.lifecycle_evidence_counts) === source.profile_membership_count && sum(source.review_status_counts) === source.profile_membership_count, `scope source lifecycle conservation ${row.scope_id}/${source.source_id}`);
  }
  const totals = {
    scope_rows: rows.length,
    state_scope_rows: rows.filter(row => row.scope_kind === "state").length,
    territory_scope_rows: rows.filter(row => row.scope_kind === "territory").length,
    special_scope_rows: rows.filter(row => SPECIAL.includes(row.scope_kind)).length,
    zip5_rows: rows.reduce((total, row) => total + row.zip5_rows, 0),
    positive_zip5_rows: rows.reduce((total, row) => total + row.positive_zip5_rows, 0),
    zero_profile_zip5_rows: rows.reduce((total, row) => total + row.zero_profile_zip5_rows, 0),
    profile_membership_count: rows.reduce((total, row) => total + row.profile_membership_count, 0),
    lifecycle_evidence_counts: Object.fromEntries(LIFE.map(key => [key, rows.reduce((total, row) => total + row.lifecycle_evidence_counts[key], 0)])),
    review_status_counts: Object.fromEntries(REVIEW.map(key => [key, rows.reduce((total, row) => total + row.review_status_counts[key], 0)])),
    source_counts: Object.fromEntries(sourceIds.map(id => [id, rows.reduce((total, row) => total + row.sources.find(source => source.source_id === id).profile_membership_count, 0)])),
    geography_scope_counts: Object.fromEntries(["state", "territory", ...SPECIAL].map(kind => [kind, rows.filter(row => row.scope_kind === kind).reduce((total, row) => total + row.zip5_rows, 0)])),
  };
  check(totals.scope_rows === 60 && totals.state_scope_rows === 51 && totals.territory_scope_rows === 5 && totals.special_scope_rows === 4, "60 governed scopes");
  check(totals.zip5_rows === 48_194 && totals.profile_membership_count === 8_011_213, "national conservation");
  check(JSON.stringify(totals.lifecycle_evidence_counts) === JSON.stringify(lifecycle.manifest.value.summary.lifecycle_evidence_counts) && JSON.stringify(totals.review_status_counts) === JSON.stringify(lifecycle.manifest.value.summary.review_status_counts) && JSON.stringify(totals.source_counts) === JSON.stringify(lifecycle.manifest.value.summary.source_counts), "lifecycle summary conservation");
  check(JSON.stringify(totals.geography_scope_counts) === JSON.stringify(disposition.manifest.value.summary.geography_scope_counts), "geography conservation");
  return { root, lifecycle, disposition, governed, rows, totals };
}

function makeManifest(result, artifact) {
  const body = {
    schema_version: VERSION,
    dataset_id: DATASET,
    status: "immutable-pointer-free-local-review-only",
    publication_mode: "pointer-free",
    bindings: {
      lifecycle_zip_evidence: { release_id: result.lifecycle.manifest.value.release_id, manifest_path: path.relative(result.root, result.lifecycle.manifestPath).replaceAll("\\", "/"), manifest_sha256: result.lifecycle.manifest.sha256 },
      jurisdiction_disposition: { release_id: result.disposition.manifest.value.release_id, manifest_path: path.relative(result.root, result.disposition.manifestPath).replaceAll("\\", "/"), manifest_sha256: result.disposition.manifest.sha256, artifact_sha256: result.governed.artifact.sha256 },
    },
    summary: result.totals,
    claims: claims(),
    artifacts: [artifact],
  };
  return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}

export async function buildNationalBusinessLifecycleJurisdictionEvidence({ root = APP_ROOT, outputRoot } = {}) {
  const result = await composeNationalBusinessLifecycleJurisdictionEvidence({ root });
  outputRoot = inside(result.root, outputRoot ?? path.join(result.root, "data", DATASET));
  const raw = stable(result.rows);
  const artifact = { path: "jurisdictions.json", artifact_type: "lifecycle-jurisdiction-evidence", record_count: 60, bytes: Buffer.byteLength(raw), sha256: sha(raw) };
  const manifest = makeManifest(result, artifact), directory = path.join(outputRoot, "releases", manifest.release_id);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, value] of [[artifact.path, raw], ["manifest.json", stable(manifest)]]) {
    const file = path.join(directory, name);
    await fs.writeFile(file, value, { flag: "wx" }).catch(async error => { if (error.code !== "EEXIST") throw error; check(sha(await bytes(file)) === sha(value), "immutable release drift"); });
  }
  return verifyNationalBusinessLifecycleJurisdictionEvidence(path.join(directory, "manifest.json"), { root: result.root });
}

export async function verifyNationalBusinessLifecycleJurisdictionEvidence(manifestPath, { root = APP_ROOT } = {}) {
  root = path.resolve(root); manifestPath = inside(root, manifestPath);
  const read = await json(manifestPath, 1_000_000), manifest = read.value, { release_id, ...body } = manifest;
  check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && manifest.status === "immutable-pointer-free-local-review-only" && manifest.publication_mode === "pointer-free", "manifest contract");
  check(release_id === `${DATASET}-${sha(JSON.stringify(body))}` && path.basename(path.dirname(manifestPath)) === release_id, "manifest identity");
  check(JSON.stringify(manifest.claims) === JSON.stringify(claims()), "claims boundary");
  const result = await composeNationalBusinessLifecycleJurisdictionEvidence({ root });
  check(manifest.bindings.lifecycle_zip_evidence.release_id === result.lifecycle.manifest.value.release_id && manifest.bindings.lifecycle_zip_evidence.manifest_sha256 === result.lifecycle.manifest.sha256, "lifecycle binding");
  check(manifest.bindings.jurisdiction_disposition.release_id === result.disposition.manifest.value.release_id && manifest.bindings.jurisdiction_disposition.manifest_sha256 === result.disposition.manifest.sha256 && manifest.bindings.jurisdiction_disposition.artifact_sha256 === result.governed.artifact.sha256, "disposition binding");
  const expected = stable(result.rows), artifact = manifest.artifacts?.[0];
  check(manifest.artifacts.length === 1 && artifact.path === "jurisdictions.json" && artifact.record_count === 60 && artifact.bytes === Buffer.byteLength(expected) && artifact.sha256 === sha(expected), "artifact descriptor");
  const actual = await bytes(inside(path.dirname(manifestPath), artifact.path), 5_000_000);
  check(actual.equals(Buffer.from(expected)), "artifact replay");
  check(JSON.stringify(manifest.summary) === JSON.stringify(result.totals), "summary replay");
  check(JSON.stringify(manifest) === JSON.stringify(makeManifest(result, artifact)), "manifest replay");
  check((await fs.readdir(path.dirname(manifestPath))).sort().join("|") === "jurisdictions.json|manifest.json", "closed release inventory");
  return { verified: true, release_id, manifest_sha256: read.sha256, artifact_sha256: artifact.sha256, artifact_bytes: artifact.bytes, ...result.totals };
}

export async function verifyRegisteredNationalBusinessLifecycleJurisdictionEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const registration = await json(inside(root, `config/datasets/${DATASET}.json`), 1_000_000), value = registration.value;
  check(value.schema_version === `${DATASET}-registration@1.0.0` && value.dataset_id === DATASET && value.runtime_pointer === null && value.production_enrollment === false && JSON.stringify(value.claims) === JSON.stringify(claims()), "registration contract");
  const verified = await verifyNationalBusinessLifecycleJurisdictionEvidence(inside(root, value.retained_release.manifest), { root });
  check(verified.release_id === value.retained_release.release_id && verified.manifest_sha256 === value.retained_release.manifest_sha256 && verified.artifact_sha256 === value.retained_release.artifact_sha256 && verified.artifact_bytes === value.retained_release.artifact_bytes, "registered release pins");
  return verified;
}

export const lifecycleJurisdictionClaimsForTest = claims;
export function aggregateLifecycleJurisdictionRowsForTest(scopeRows, zipScopes, lifecycleRows, sourceIds) {
  const buckets = new Map(scopeRows.map(row => [row.scope_id, blankScope(row, sourceIds)]));
  for (const row of lifecycleRows) {
    const target = buckets.get(zipScopes.get(row.zip5)); check(target, "fixture scope");
    target.zip5_rows++; target.profile_membership_count += row.profile_membership_count;
    if (row.profile_membership_count) target.positive_zip5_rows++; else target.zero_profile_zip5_rows++;
    addCounts(target.lifecycle_evidence_counts, row.lifecycle_evidence_counts); addCounts(target.review_status_counts, row.review_status_counts);
  }
  return [...buckets.values()].sort((a, b) => a.scope_id.localeCompare(b.scope_id));
}
