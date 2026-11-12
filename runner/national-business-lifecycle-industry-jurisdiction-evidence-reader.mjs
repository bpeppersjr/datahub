import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const DATASET = "national-business-lifecycle-industry-jurisdiction-evidence";
const INDUSTRIES = ["retail-consumer", "health-care", "financial-services", "transportation", "construction", "tax-exempt-organizations", "sales-tax-outlets", "local-business-licenses", "childcare"];
const LIFE = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SPECIAL = ["multi-state-material", "zcta-overlay-unresolved", "non-zcta-unassigned", "explicit-placeholder"];
const PIN = { release_id: `${DATASET}-a1c2f181ccef283559dd8a1ec1223deb731cc18d44b4bcda33bec579815bceb1`, registration_sha256: "da0c192ca8b0a3a686e84f3a54f270905361ce183e50ebb937c81b65c6e43144", manifest_sha256: "c9535617ee521c6a54b3539d125c4427f9f30d1e469afe515eeeb6275a701f86", artifact_sha256: "e416e18c84d232cb6676eadfa2c0e108fa2492e0447ae7513f29719485a4c373", crosswalk_sha256: "2577f5b93186ab32276e62a0da2f5d6eeb53d5ee9c8bb52c6b55b19e907b52be" };
const EXPECTED_LIFE = { "source-defined-current": 5240481, "non-active-reporting": 2134833, unknown: 633232, contradictory: 2667 };
const EXPECTED_REVIEW = { "within-review-window": 7987605, stale: 0, unmeasured: 23608, unmapped: 0 };
const CLAIMS = { record_unit: "registry-location-profile-lifecycle-membership", source_relative_lifecycle_evidence: true, governed_jurisdiction_disposition_reused: true, all_60_scopes_retained: true, special_scopes_separate: true, unmapped_memberships_retained: true, source_memberships_additive_across_industries: false, cross_source_additivity: false, unique_business_count: null, active_business_count: null, current_operating_business_count: null, all_business_completeness: null, industry_completeness: null, current_operation_verified: false, active_business_eligible: false, identity_resolution_applied: false, zip4_joined: false, network_requests: 0, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false };
const ROW_KEYS = ["schema_version", "scope_id", "scope_kind", "scope_label", "state_geo_id", "state_fips", "state_name", "postal_abbreviation", "zip5_rows", "profile_membership_count", "mapped_source_membership_count", "unmapped_source_membership_count", "industries", "unmapped_sources"];
const COUNTS_KEYS = ["source_id", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), hash = value => createHash("sha256").update(value).digest("hex"), sum = value => Object.values(value).reduce((n, count) => n + count, 0);
const fail = () => { throw Error("Lifecycle industry jurisdiction runtime evidence rejected."); };
const parse = value => { try { return JSON.parse(value); } catch { fail(); } };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const counts = (value, keys, expected) => exact(value, keys) && keys.every(key => integer(value[key])) && sum(value) === expected;
const scopeKind = id => id.startsWith("state:") ? "state" : id.startsWith("territory:") ? "territory" : id;

async function stableBytes(root, filename, maximum, expectedHash) {
  const resolvedRoot = path.resolve(root), target = path.resolve(resolvedRoot, filename), relative = path.relative(resolvedRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail();
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep)) { cursor = path.join(cursor, segment); if ((await fs.lstat(cursor)).isSymbolicLink()) fail(); }
  if (await fs.realpath(target) !== target) fail();
  const before = await fs.lstat(target), value = await fs.readFile(target), after = await fs.lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || value.length !== before.size || value.length <= 0 || value.length > maximum || expectedHash && hash(value) !== expectedHash) fail();
  return { value, sha256: hash(value) };
}
function validateCountRow(row, expectedSource) {
  if (!exact(row, COUNTS_KEYS) || row.source_id !== expectedSource || !integer(row.profile_membership_count) || !counts(row.lifecycle_evidence_counts, LIFE, row.profile_membership_count) || !counts(row.review_status_counts, REVIEW, row.profile_membership_count)) fail();
}
function validateRow(row, crosswalk) {
  if (!exact(row, ROW_KEYS) || row.schema_version !== `${DATASET}-row@1.0.0` || row.scope_kind !== scopeKind(row.scope_id) || typeof row.scope_label !== "string" || !row.scope_label || !integer(row.zip5_rows) || !integer(row.profile_membership_count) || !integer(row.mapped_source_membership_count) || !integer(row.unmapped_source_membership_count) || row.mapped_source_membership_count + row.unmapped_source_membership_count !== row.profile_membership_count) fail();
  const stateLike = /^(state|territory):\d{2}$/.test(row.scope_id);
  if (stateLike !== (typeof row.state_geo_id === "string" && /^state:\d{2}$/.test(row.state_geo_id) && /^\d{2}$/.test(row.state_fips) && typeof row.state_name === "string" && /^[A-Z]{2}$/.test(row.postal_abbreviation))) fail();
  if (!stateLike && [row.state_geo_id, row.state_fips, row.state_name, row.postal_abbreviation].some(value => value !== null)) fail();
  if (!Array.isArray(row.industries) || row.industries.length !== 9 || row.industries.some((industry, index) => {
    if (!exact(industry, ["industry_id", "profile_membership_count", "lifecycle_evidence_counts", "review_status_counts", "sources"]) || industry.industry_id !== INDUSTRIES[index] || !integer(industry.profile_membership_count) || !counts(industry.lifecycle_evidence_counts, LIFE, industry.profile_membership_count) || !counts(industry.review_status_counts, REVIEW, industry.profile_membership_count)) return true;
    const sourceIds = crosswalk.sources.filter(source => source.industries.includes(industry.industry_id)).map(source => source.source_id);
    if (!Array.isArray(industry.sources) || industry.sources.length !== sourceIds.length) return true;
    industry.sources.forEach((source, sourceIndex) => validateCountRow(source, sourceIds[sourceIndex]));
    return industry.sources.reduce((n, source) => n + source.profile_membership_count, 0) !== industry.profile_membership_count;
  }) || row.industries.reduce((n, industry) => n + industry.profile_membership_count, 0) !== row.mapped_source_membership_count) fail();
  const unmapped = crosswalk.sources.filter(source => source.industries.length === 0);
  if (!Array.isArray(row.unmapped_sources) || row.unmapped_sources.length !== unmapped.length || row.unmapped_sources.some((source, index) => { const expected = unmapped[index]; if (!exact(source, [...COUNTS_KEYS, "unmapped_reason"]) || source.unmapped_reason !== expected.unmapped_reason) return true; validateCountRow({ source_id: source.source_id, profile_membership_count: source.profile_membership_count, lifecycle_evidence_counts: source.lifecycle_evidence_counts, review_status_counts: source.review_status_counts }, expected.source_id); return false; }) || row.unmapped_sources.reduce((n, source) => n + source.profile_membership_count, 0) !== row.unmapped_source_membership_count) fail();
  return structuredClone(row);
}
function validateCrosswalk(value) {
  if (!exact(value, ["schema_version", "operational_industries", "sources", "claims"]) || value.schema_version !== "lifecycle-operational-industry-crosswalk@1.0.0" || !same(value.operational_industries, INDUSTRIES) || !Array.isArray(value.sources) || value.sources.length !== 15 || new Set(value.sources.map(source => source.source_id)).size !== 15 || value.sources.some(source => !exact(source, source.industries.length ? ["source_id", "industries"] : ["source_id", "industries", "unmapped_reason"]) || !Array.isArray(source.industries) || source.industries.some(id => !INDUSTRIES.includes(id))) || !exact(value.claims, ["closed_lifecycle_source_roster", "multi_industry_mapping_allowed", "source_memberships_additive_across_industries", "unique_business_count", "industry_completeness", "current_operation_verified"])) fail();
  return value;
}
function validateSummary(value, crosswalk) {
  const keys = ["scope_rows", "state_scope_rows", "territory_scope_rows", "special_scope_rows", "zip5_rows", "profile_membership_count", "mapped_source_count", "unmapped_source_count", "mapped_source_membership_count", "unmapped_source_membership_count", "industry_membership_counts", "source_disposition"];
  if (!exact(value, keys) || value.scope_rows !== 60 || value.state_scope_rows !== 51 || value.territory_scope_rows !== 5 || value.special_scope_rows !== 4 || value.zip5_rows !== 48194 || value.profile_membership_count !== 8011213 || value.mapped_source_count !== 13 || value.unmapped_source_count !== 2 || value.mapped_source_membership_count !== 6486150 || value.unmapped_source_membership_count !== 1525063 || value.mapped_source_membership_count + value.unmapped_source_membership_count !== value.profile_membership_count || !exact(value.industry_membership_counts, INDUSTRIES) || sum(value.industry_membership_counts) !== value.mapped_source_membership_count || !exact(value.source_disposition, crosswalk.sources.map(source => source.source_id))) fail();
  for (const source of crosswalk.sources) { const disposition = value.source_disposition[source.source_id], keysForSource = source.industries.length ? ["industries", "profile_membership_count"] : ["industries", "unmapped_reason", "profile_membership_count"]; if (!exact(disposition, keysForSource) || !same(disposition.industries, source.industries) || disposition.unmapped_reason !== source.unmapped_reason || !integer(disposition.profile_membership_count)) fail(); }
  return structuredClone(value);
}
async function contract(root) {
  const registrationProof = await stableBytes(root, `config/datasets/${DATASET}.json`, 100000, PIN.registration_sha256), registration = parse(registrationProof.value);
  const retainedKeys = ["release_id", "manifest", "manifest_sha256", "artifact_sha256", "artifact_bytes", "scope_rows", "zip5_rows", "profile_membership_count"];
  if (!exact(registration, ["schema_version", "dataset_id", "status", "runtime_pointer", "production_enrollment", "retained_release", "claims", "documentation"]) || registration.schema_version !== `${DATASET}-registration@1.0.0` || registration.dataset_id !== DATASET || registration.status !== "registered-pointer-free-local-review-only" || registration.runtime_pointer !== null || registration.production_enrollment !== false || !exact(registration.retained_release, retainedKeys) || !same(registration.claims, CLAIMS) || registration.documentation !== `docs/NATIONAL-BUSINESS-LIFECYCLE-INDUSTRY-JURISDICTION-EVIDENCE.md`) fail();
  const retained = registration.retained_release;
  if (retained.release_id !== PIN.release_id || retained.manifest !== `data/${DATASET}/releases/${PIN.release_id}/manifest.json` || retained.manifest_sha256 !== PIN.manifest_sha256 || retained.artifact_sha256 !== PIN.artifact_sha256 || retained.artifact_bytes !== 454365 || retained.scope_rows !== 60 || retained.zip5_rows !== 48194 || retained.profile_membership_count !== 8011213) fail();
  const crosswalkProof = await stableBytes(root, "config/lifecycle-operational-industry-crosswalk.json", 10000, PIN.crosswalk_sha256), crosswalk = validateCrosswalk(parse(crosswalkProof.value));
  const manifestProof = await stableBytes(root, retained.manifest, 10000, PIN.manifest_sha256), manifest = parse(manifestProof.value);
  if (!exact(manifest, ["release_id", "schema_version", "dataset_id", "status", "publication_mode", "bindings", "summary", "claims", "artifacts"]) || manifest.release_id !== PIN.release_id || manifest.schema_version !== `${DATASET}@1.0.0` || manifest.dataset_id !== DATASET || manifest.status !== "immutable-pointer-free-local-review-only" || manifest.publication_mode !== "pointer-free" || !same(manifest.claims, CLAIMS) || !exact(manifest.bindings, ["lifecycle_jurisdiction_evidence", "lifecycle_operational_industry_crosswalk"]) || !exact(manifest.bindings.lifecycle_operational_industry_crosswalk, ["path", "sha256"]) || manifest.bindings.lifecycle_operational_industry_crosswalk.path !== "config/lifecycle-operational-industry-crosswalk.json" || manifest.bindings.lifecycle_operational_industry_crosswalk.sha256 !== PIN.crosswalk_sha256 || !exact(manifest.bindings.lifecycle_jurisdiction_evidence, ["release_id", "manifest_path", "manifest_sha256", "artifact_sha256"]) || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1) fail();
  const summary = validateSummary(manifest.summary, crosswalk), artifact = manifest.artifacts[0];
  if (!exact(artifact, ["path", "artifact_type", "record_count", "bytes", "sha256"]) || artifact.path !== "jurisdictions.json" || artifact.artifact_type !== "lifecycle-industry-jurisdiction-evidence" || artifact.record_count !== 60 || artifact.bytes !== retained.artifact_bytes || artifact.sha256 !== PIN.artifact_sha256) fail();
  const artifactProof = await stableBytes(root, path.join(path.dirname(retained.manifest), artifact.path), 600000, PIN.artifact_sha256), raw = parse(artifactProof.value);
  if (!Array.isArray(raw) || raw.length !== 60) fail();
  const rows = raw.map(row => validateRow(row, crosswalk)), byId = new Map(rows.map(row => [row.scope_id, row])), states = rows.filter(row => row.scope_kind === "state").sort((a, b) => a.state_fips.localeCompare(b.state_fips)), territories = rows.filter(row => row.scope_kind === "territory").sort((a, b) => a.state_fips.localeCompare(b.state_fips)), special = SPECIAL.map(id => byId.get(id)), ordered = [...states, ...territories, ...special];
  if (byId.size !== 60 || states.length !== 51 || territories.length !== 5 || special.some(row => !row) || ordered.reduce((n, row) => n + row.zip5_rows, 0) !== 48194 || ordered.reduce((n, row) => n + row.profile_membership_count, 0) !== 8011213 || ordered.reduce((n, row) => n + row.mapped_source_membership_count, 0) !== summary.mapped_source_membership_count || ordered.reduce((n, row) => n + row.unmapped_source_membership_count, 0) !== summary.unmapped_source_membership_count) fail();
  for (const industryId of INDUSTRIES) if (ordered.reduce((n, row) => n + row.industries.find(industry => industry.industry_id === industryId).profile_membership_count, 0) !== summary.industry_membership_counts[industryId]) fail();
  const everySource = row => [...row.industries.flatMap(industry => industry.sources), ...row.unmapped_sources];
  for (const source of crosswalk.sources) if (ordered.reduce((n, row) => n + everySource(row).find(item => item.source_id === source.source_id).profile_membership_count, 0) !== summary.source_disposition[source.source_id].profile_membership_count) fail();
  for (const key of LIFE) if (ordered.reduce((n, row) => n + everySource(row).reduce((m, source) => m + source.lifecycle_evidence_counts[key], 0), 0) !== EXPECTED_LIFE[key]) fail();
  for (const key of REVIEW) if (ordered.reduce((n, row) => n + everySource(row).reduce((m, source) => m + source.review_status_counts[key], 0), 0) !== EXPECTED_REVIEW[key]) fail();
  return { manifest, summary, states, territories, special, byId, registration_sha256: registrationProof.sha256, manifest_sha256: manifestProof.sha256, artifact_sha256: artifactProof.sha256, crosswalk_sha256: crosswalkProof.sha256 };
}
const release = value => ({ release_id: value.manifest.release_id, registration_sha256: value.registration_sha256, manifest_sha256: value.manifest_sha256, artifact_sha256: value.artifact_sha256, crosswalk_sha256: value.crosswalk_sha256 });
export async function readNationalBusinessLifecycleIndustryJurisdictionSummary({ root = APP_ROOT, signal } = {}) { signal?.throwIfAborted(); const value = await contract(path.resolve(root)); signal?.throwIfAborted(); return { schema_version: `${DATASET}-runtime-summary@1.0.0`, release: release(value), summary: value.summary, scopes: { states: value.states.map(({ scope_id, state_fips, state_name, postal_abbreviation }) => ({ scope_id, state_fips, state_name, postal_abbreviation })), territories: value.territories.map(({ scope_id, state_fips, state_name, postal_abbreviation }) => ({ scope_id, state_fips, state_name, postal_abbreviation })), special: value.special.map(({ scope_id, scope_label }) => ({ scope_id, scope_label })) }, claims: CLAIMS }; }
export async function readNationalBusinessLifecycleIndustryJurisdiction({ root = APP_ROOT, state, scopeId, signal } = {}) { const stateQuery = typeof state === "string" && /^[A-Z]{2}$/.test(state), scopeQuery = typeof scopeId === "string" && (/^(state|territory):\d{2}$/.test(scopeId) || SPECIAL.includes(scopeId)); if (stateQuery === scopeQuery) fail(); signal?.throwIfAborted(); const value = await contract(path.resolve(root)), row = stateQuery ? value.states.find(candidate => candidate.postal_abbreviation === state) : value.byId.get(scopeId); if (!row || stateQuery && row.scope_kind !== "state") fail(); signal?.throwIfAborted(); return { schema_version: `${DATASET}-runtime-lookup@1.0.0`, release: release(value), status: "governed-source-relative-industry-memberships", scope: structuredClone(row), claims: CLAIMS }; }
export { validateRow as validateNationalBusinessLifecycleIndustryJurisdictionRowForTest };
