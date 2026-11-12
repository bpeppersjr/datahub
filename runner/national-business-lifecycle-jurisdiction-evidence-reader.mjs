import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const DATASET = "national-business-lifecycle-jurisdiction-evidence";
const REGISTRATION = `config/datasets/${DATASET}.json`;
const SHA = /^[a-f0-9]{64}$/;
const PIN = {
  release_id: "national-business-lifecycle-jurisdiction-evidence-65d0c4b1f2a6d10ea0c5b031dfc3251e1b87510a88d7c3efeacd8cc0dd37910b",
  registration_sha256: "f662743bd8efc1747b28d10e7994322ce84927f33bb50c0875861e37ee3835cc",
  manifest_sha256: "42adf92bfb9d9d3a6a9df8728d71c9a1938b787147212269d58c9d077b7499be",
  artifact_sha256: "40cbf61ddd0a860b7c70dc8defb3fcd8c1bdfe45fe073df4fe9e0b213de3dbd4",
};
const LIFE = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SPECIAL = ["multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"];
const ROW_KEYS = ["schema_version", "scope_id", "scope_kind", "scope_label", "state_geo_id", "state_fips", "state_name", "postal_abbreviation", "zip5_rows", "positive_zip5_rows", "zero_profile_zip5_rows", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts", "sources"];
const SOURCE_KEYS = ["source_id", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts"];
const CLAIMS = {
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
};
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hash = value => createHash("sha256").update(value).digest("hex");
const sum = value => Object.values(value).reduce((total, count) => total + count, 0);
const fail = () => { throw Error("Lifecycle jurisdiction runtime evidence rejected."); };
function parse(value) { try { return JSON.parse(value); } catch { fail(); } }

async function stableBytes(root, filename, maximum, expectedHash) {
  const resolvedRoot = path.resolve(root), target = path.resolve(resolvedRoot, filename), relative = path.relative(resolvedRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail();
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if ((await fs.lstat(cursor)).isSymbolicLink()) fail();
  }
  if (await fs.realpath(target) !== target) fail();
  const before = await fs.lstat(target), value = await fs.readFile(target), after = await fs.lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || value.length !== before.size || value.length <= 0 || value.length > maximum || expectedHash && hash(value) !== expectedHash) fail();
  return { value, sha256: hash(value) };
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function counts(value, keys, expected) { return exact(value, keys) && keys.every(key => integer(value[key])) && sum(value) === expected; }
function scopeKind(scopeId) { return scopeId.startsWith("state:") ? "state" : scopeId.startsWith("territory:") ? "territory" : scopeId; }

function validateRow(row, sourceIds) {
  if (!exact(row, ROW_KEYS) || row.schema_version !== `${DATASET}-row@1.0.0` || typeof row.scope_id !== "string" || row.scope_kind !== scopeKind(row.scope_id) || typeof row.scope_label !== "string" || !row.scope_label || !integer(row.zip5_rows) || !integer(row.positive_zip5_rows) || !integer(row.zero_profile_zip5_rows) || row.positive_zip5_rows + row.zero_profile_zip5_rows !== row.zip5_rows || !integer(row.profile_membership_count) || !counts(row.lifecycle_evidence_counts, LIFE, row.profile_membership_count) || !counts(row.review_status_counts, REVIEW, row.profile_membership_count)) fail();
  const stateLike = /^(state|territory):\d{2}$/.test(row.scope_id);
  if (stateLike !== (typeof row.state_geo_id === "string" && /^state:\d{2}$/.test(row.state_geo_id) && /^\d{2}$/.test(row.state_fips) && typeof row.state_name === "string" && row.state_name.length > 0 && /^[A-Z]{2}$/.test(row.postal_abbreviation))) fail();
  if (!stateLike && [row.state_geo_id, row.state_fips, row.state_name, row.postal_abbreviation].some(value => value !== null)) fail();
  if (!Array.isArray(row.sources) || row.sources.length !== sourceIds.length || row.sources.some((source, index) => !exact(source, SOURCE_KEYS) || source.source_id !== sourceIds[index] || !integer(source.profile_membership_count) || !counts(source.lifecycle_evidence_counts, LIFE, source.profile_membership_count) || !counts(source.review_status_counts, REVIEW, source.profile_membership_count)) || row.sources.reduce((total, source) => total + source.profile_membership_count, 0) !== row.profile_membership_count) fail();
  return structuredClone(row);
}

function validateSummary(summary) {
  const keys = ["scope_rows", "state_scope_rows", "territory_scope_rows", "special_scope_rows", "zip5_rows", "positive_zip5_rows", "zero_profile_zip5_rows", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts", "source_counts", "geography_scope_counts"];
  const geography = ["state", "territory", ...SPECIAL];
  if (!exact(summary, keys) || summary.scope_rows !== 60 || summary.state_scope_rows !== 51 || summary.territory_scope_rows !== 5 || summary.special_scope_rows !== 4 || summary.zip5_rows !== 48_194 || summary.positive_zip5_rows + summary.zero_profile_zip5_rows !== summary.zip5_rows || summary.profile_membership_count !== 8_011_213 || !counts(summary.lifecycle_evidence_counts, LIFE, summary.profile_membership_count) || !counts(summary.review_status_counts, REVIEW, summary.profile_membership_count) || !exact(summary.source_counts, Object.keys(summary.source_counts)) || Object.keys(summary.source_counts).length !== 15 || Object.values(summary.source_counts).some(value => !integer(value) || value <= 0) || sum(summary.source_counts) !== summary.profile_membership_count || !counts(summary.geography_scope_counts, geography, summary.zip5_rows)) fail();
  return structuredClone(summary);
}

async function contract(root) {
  const registrationProof = await stableBytes(root, REGISTRATION, 100_000), registration = parse(registrationProof.value);
  const retainedKeys = ["release_id", "manifest", "manifest_sha256", "manifest_bytes", "artifact_sha256", "artifact_bytes", "scope_rows", "zip5_rows", "profile_membership_count"];
  if (!exact(registration, ["schema_version", "dataset_id", "status", "runtime_pointer", "production_enrollment", "retained_release", "claims", "documentation"]) || registration.schema_version !== `${DATASET}-registration@1.0.0` || registration.dataset_id !== DATASET || registration.status !== "registered-pointer-free-local-review-only" || registration.runtime_pointer !== null || registration.production_enrollment !== false || registration.documentation !== "docs/NATIONAL-BUSINESS-LIFECYCLE-JURISDICTION-EVIDENCE.md" || !same(registration.claims, CLAIMS) || !exact(registration.retained_release, retainedKeys)) fail();
  if (registrationProof.sha256 !== PIN.registration_sha256) fail();
  const retained = registration.retained_release;
  if (retained.release_id !== PIN.release_id || retained.manifest !== `data/${DATASET}/releases/${retained.release_id}/manifest.json` || retained.manifest_sha256 !== PIN.manifest_sha256 || retained.artifact_sha256 !== PIN.artifact_sha256 || retained.manifest_bytes !== 3645 || retained.artifact_bytes !== 295020 || retained.scope_rows !== 60 || retained.zip5_rows !== 48_194 || retained.profile_membership_count !== 8_011_213) fail();
  const manifestProof = await stableBytes(root, retained.manifest, 10_000, retained.manifest_sha256), manifest = parse(manifestProof.value);
  if (manifestProof.value.length !== retained.manifest_bytes || !exact(manifest, ["release_id", "schema_version", "dataset_id", "status", "publication_mode", "bindings", "summary", "claims", "artifacts"]) || manifest.release_id !== retained.release_id || manifest.schema_version !== `${DATASET}-release@1.0.0` || manifest.dataset_id !== DATASET || manifest.status !== "immutable-pointer-free-local-review-only" || manifest.publication_mode !== "pointer-free" || !same(manifest.claims, CLAIMS) || !exact(manifest.bindings, ["lifecycle_zip_evidence", "jurisdiction_disposition"]) || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1) fail();
  if (!exact(manifest.bindings.lifecycle_zip_evidence, ["release_id", "manifest_path", "manifest_sha256"]) || !exact(manifest.bindings.jurisdiction_disposition, ["release_id", "manifest_path", "manifest_sha256", "artifact_sha256"]) || !SHA.test(manifest.bindings.lifecycle_zip_evidence.manifest_sha256) || !SHA.test(manifest.bindings.jurisdiction_disposition.manifest_sha256) || !SHA.test(manifest.bindings.jurisdiction_disposition.artifact_sha256)) fail();
  const summary = validateSummary(manifest.summary), artifact = manifest.artifacts[0];
  if (!exact(artifact, ["path", "artifact_type", "record_count", "bytes", "sha256"]) || artifact.path !== "jurisdictions.json" || artifact.artifact_type !== "lifecycle-jurisdiction-evidence" || artifact.record_count !== 60 || artifact.bytes !== retained.artifact_bytes || artifact.sha256 !== retained.artifact_sha256) fail();
  const artifactProof = await stableBytes(root, path.join(path.dirname(retained.manifest), artifact.path), 500_000, retained.artifact_sha256);
  if (artifactProof.value.length !== retained.artifact_bytes) fail();
  const rawRows = parse(artifactProof.value), sourceIds = Object.keys(summary.source_counts);
  if (!Array.isArray(rawRows) || rawRows.length !== 60) fail();
  const rows = rawRows.map(row => validateRow(row, sourceIds)), byId = new Map(rows.map(row => [row.scope_id, row]));
  const states = rows.filter(row => row.scope_kind === "state").sort((a, b) => a.state_fips.localeCompare(b.state_fips));
  const territories = rows.filter(row => row.scope_kind === "territory").sort((a, b) => a.state_fips.localeCompare(b.state_fips));
  const special = SPECIAL.map(id => byId.get(id));
  if (byId.size !== 60 || states.length !== 51 || territories.length !== 5 || special.some(row => !row) || new Set([...states, ...territories].map(row => row.postal_abbreviation)).size !== 56) fail();
  const all = [...states, ...territories, ...special], aggregate = key => all.reduce((total, row) => total + row[key], 0);
  if (aggregate("zip5_rows") !== summary.zip5_rows || aggregate("positive_zip5_rows") !== summary.positive_zip5_rows || aggregate("zero_profile_zip5_rows") !== summary.zero_profile_zip5_rows || aggregate("profile_membership_count") !== summary.profile_membership_count) fail();
  for (const key of LIFE) if (all.reduce((total, row) => total + row.lifecycle_evidence_counts[key], 0) !== summary.lifecycle_evidence_counts[key]) fail();
  for (const key of REVIEW) if (all.reduce((total, row) => total + row.review_status_counts[key], 0) !== summary.review_status_counts[key]) fail();
  for (const sourceId of sourceIds) if (all.reduce((total, row) => total + row.sources.find(source => source.source_id === sourceId).profile_membership_count, 0) !== summary.source_counts[sourceId]) fail();
  for (const kind of ["state", "territory", ...SPECIAL]) if (all.filter(row => row.scope_kind === kind).reduce((total, row) => total + row.zip5_rows, 0) !== summary.geography_scope_counts[kind]) fail();
  return { registration, manifest, summary, states, territories, special, byId, registration_sha256: registrationProof.sha256, manifest_sha256: manifestProof.sha256, artifact_sha256: artifactProof.sha256 };
}

const release = value => ({ release_id: value.manifest.release_id, registration_sha256: value.registration_sha256, manifest_sha256: value.manifest_sha256, artifact_sha256: value.artifact_sha256 });
export async function readNationalBusinessLifecycleJurisdictionSummary({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted(); const value = await contract(path.resolve(root)); signal?.throwIfAborted();
  return { schema_version: `${DATASET}-runtime-summary@1.0.0`, release: release(value), summary: value.summary, scopes: { states: value.states.map(row => ({ scope_id: row.scope_id, state_fips: row.state_fips, state_name: row.state_name, postal_abbreviation: row.postal_abbreviation })), territories: value.territories.map(row => ({ scope_id: row.scope_id, state_fips: row.state_fips, state_name: row.state_name, postal_abbreviation: row.postal_abbreviation })), special: value.special.map(row => ({ scope_id: row.scope_id, scope_label: row.scope_label })) }, claims: CLAIMS };
}
export async function readNationalBusinessLifecycleJurisdictionEvidence({ root = APP_ROOT, state, scopeId, signal } = {}) {
  const stateQuery = typeof state === "string" && /^[A-Z]{2}$/.test(state), scopeQuery = typeof scopeId === "string" && (/^(state|territory):\d{2}$/.test(scopeId) || SPECIAL.includes(scopeId));
  if (stateQuery === scopeQuery) fail();
  signal?.throwIfAborted(); const value = await contract(path.resolve(root));
  const row = stateQuery ? value.states.find(candidate => candidate.postal_abbreviation === state) : value.byId.get(scopeId);
  if (!row || stateQuery && row.scope_kind !== "state") fail();
  signal?.throwIfAborted();
  return { schema_version: `${DATASET}-runtime-lookup@1.0.0`, release: release(value), status: "governed-source-relative-memberships", scope: structuredClone(row), claims: CLAIMS };
}

export { validateRow as validateNationalBusinessLifecycleJurisdictionRowForTest };
