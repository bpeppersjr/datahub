import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const VERSION = "national-business-lifecycle-industry-jurisdiction-evidence@1.0.0";
const DATASET = "national-business-lifecycle-industry-jurisdiction-evidence";
const LIFE = ["source-defined-current", "non-active-reporting", "unknown", "contradictory"];
const REVIEW = ["within-review-window", "stale", "unmeasured", "unmapped"];
const SHA = /^[a-f0-9]{64}$/;
const sha = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value)}\n`;
const fail = message => { throw Error(`Lifecycle industry jurisdiction evidence rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const sum = values => Object.values(values).reduce((total, value) => total + value, 0);
const zeros = keys => Object.fromEntries(keys.map(key => [key, 0]));
const add = (target, source) => { for (const key of Object.keys(target)) target[key] += source[key]; };
const inside = (root, file) => {
  const resolvedRoot = path.resolve(root), resolvedFile = path.resolve(resolvedRoot, file);
  check(resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`), "path outside root");
  return resolvedFile;
};
async function bytes(file, max = 10_000_000) {
  const handle = await fs.open(file, "r");
  try {
    const before = await handle.stat();
    check(before.isFile() && !before.isSymbolicLink() && before.size <= max, "bounded regular file");
    const value = Buffer.alloc(before.size); let offset = 0;
    while (offset < value.length) { const read = await handle.read(value, offset, value.length - offset, offset); check(read.bytesRead > 0, "short read"); offset += read.bytesRead; }
    const after = await handle.stat(); check(before.size === after.size && before.mtimeMs === after.mtimeMs, "file changed while reading");
    return value;
  } finally { await handle.close(); }
}
async function json(file, max) { const buffer = await bytes(file, max); try { return { buffer, value: JSON.parse(buffer), sha256: sha(buffer) }; } catch { fail("JSON syntax"); } }
const claims = () => ({
  record_unit: "registry-location-profile-lifecycle-membership",
  source_relative_lifecycle_evidence: true,
  governed_jurisdiction_disposition_reused: true,
  all_60_scopes_retained: true,
  special_scopes_separate: true,
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
  zip4_joined: false,
  network_requests: 0,
  source_acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
});

function validateCrosswalk(value, sourceIds) {
  check(value.schema_version === "lifecycle-operational-industry-crosswalk@1.0.0", "crosswalk version");
  const industries = value.operational_industries;
  check(Array.isArray(industries) && industries.length === 9 && new Set(industries).size === 9, "nine-industry roster");
  check(Array.isArray(value.sources) && value.sources.length === sourceIds.length, "closed crosswalk source count");
  const mappedIds = value.sources.map(row => row.source_id);
  check(new Set(mappedIds).size === sourceIds.length && [...mappedIds].sort().join("|") === [...sourceIds].sort().join("|"), "closed lifecycle source roster");
  for (const row of value.sources) {
    check(Array.isArray(row.industries) && new Set(row.industries).size === row.industries.length && row.industries.every(id => industries.includes(id)), `valid industry mapping ${row.source_id}`);
    check(row.industries.length > 0 ? row.unmapped_reason === undefined : typeof row.unmapped_reason === "string" && row.unmapped_reason.length > 20, `mapped or explained ${row.source_id}`);
  }
  check(value.claims?.closed_lifecycle_source_roster === true && value.claims?.source_memberships_additive_across_industries === false && value.claims?.unique_business_count === null && value.claims?.industry_completeness === null && value.claims?.current_operation_verified === false, "crosswalk claims");
  return { industries, bySource: new Map(value.sources.map(row => [row.source_id, row])) };
}
function blankCounts() { return { profile_membership_count: 0, lifecycle_evidence_counts: zeros(LIFE), review_status_counts: zeros(REVIEW) }; }
function accumulate(target, source) { target.profile_membership_count += source.profile_membership_count; add(target.lifecycle_evidence_counts, source.lifecycle_evidence_counts); add(target.review_status_counts, source.review_status_counts); }

export async function composeNationalBusinessLifecycleIndustryJurisdictionEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root);
  const registrationPath = inside(root, "config/datasets/national-business-lifecycle-jurisdiction-evidence.json");
  const registration = await json(registrationPath, 1_000_000), retained = registration.value.retained_release;
  check(registration.value.runtime_pointer === null && registration.value.production_enrollment === false && retained && SHA.test(retained.manifest_sha256), "lifecycle jurisdiction registration");
  const manifestPath = inside(root, retained.manifest), manifest = await json(manifestPath, 1_000_000);
  check(manifest.sha256 === retained.manifest_sha256 && manifest.value.release_id === retained.release_id && manifest.value.summary.scope_rows === 60, "lifecycle jurisdiction manifest integrity");
  const artifact = manifest.value.artifacts?.find(item => item.path === "jurisdictions.json");
  check(artifact && SHA.test(artifact.sha256), "lifecycle jurisdiction artifact descriptor");
  const jurisdiction = await json(inside(path.dirname(manifestPath), artifact.path), 5_000_000);
  check(jurisdiction.sha256 === artifact.sha256 && Array.isArray(jurisdiction.value) && jurisdiction.value.length === 60, "lifecycle jurisdiction artifact integrity");
  const sourceIds = Object.keys(manifest.value.summary.source_counts).sort();
  const crosswalkPath = inside(root, "config/lifecycle-operational-industry-crosswalk.json"), crosswalk = await json(crosswalkPath, 1_000_000);
  const mapping = validateCrosswalk(crosswalk.value, sourceIds);
  const rows = jurisdiction.value.map(scope => {
    check(scope.sources.length === sourceIds.length && scope.sources.map(row => row.source_id).sort().join("|") === sourceIds.join("|"), `scope source roster ${scope.scope_id}`);
    const industries = mapping.industries.map(industry_id => ({ industry_id, ...blankCounts(), sources: [] }));
    const byIndustry = new Map(industries.map(row => [row.industry_id, row]));
    const unmapped_sources = [];
    for (const source of scope.sources) {
      const route = mapping.bySource.get(source.source_id);
      if (route.industries.length === 0) unmapped_sources.push({ source_id: source.source_id, unmapped_reason: route.unmapped_reason, ...source });
      else for (const industryId of route.industries) { const target = byIndustry.get(industryId); accumulate(target, source); target.sources.push({ source_id: source.source_id, ...source }); }
    }
    const mapped_source_membership_count = scope.sources.filter(source => mapping.bySource.get(source.source_id).industries.length > 0).reduce((total, source) => total + source.profile_membership_count, 0);
    const unmapped_source_membership_count = unmapped_sources.reduce((total, source) => total + source.profile_membership_count, 0);
    check(mapped_source_membership_count + unmapped_source_membership_count === scope.profile_membership_count, `mapped/unmapped conservation ${scope.scope_id}`);
    for (const row of industries) check(sum(row.lifecycle_evidence_counts) === row.profile_membership_count && sum(row.review_status_counts) === row.profile_membership_count, `industry conservation ${scope.scope_id}/${row.industry_id}`);
    return {
      schema_version: "national-business-lifecycle-industry-jurisdiction-evidence-row@1.0.0",
      scope_id: scope.scope_id, scope_kind: scope.scope_kind, scope_label: scope.scope_label,
      state_geo_id: scope.state_geo_id, state_fips: scope.state_fips, state_name: scope.state_name, postal_abbreviation: scope.postal_abbreviation,
      zip5_rows: scope.zip5_rows, profile_membership_count: scope.profile_membership_count,
      mapped_source_membership_count, unmapped_source_membership_count, industries, unmapped_sources,
    };
  });
  const sourceDisposition = Object.fromEntries(crosswalk.value.sources.map(route => [route.source_id, {
    industries: route.industries,
    ...(route.unmapped_reason ? { unmapped_reason: route.unmapped_reason } : {}),
    profile_membership_count: manifest.value.summary.source_counts[route.source_id],
  }]));
  const mappedSources = crosswalk.value.sources.filter(row => row.industries.length > 0), unmappedSources = crosswalk.value.sources.filter(row => row.industries.length === 0);
  const totals = {
    scope_rows: rows.length,
    state_scope_rows: rows.filter(row => row.scope_kind === "state").length,
    territory_scope_rows: rows.filter(row => row.scope_kind === "territory").length,
    special_scope_rows: rows.filter(row => !["state", "territory"].includes(row.scope_kind)).length,
    zip5_rows: rows.reduce((total, row) => total + row.zip5_rows, 0),
    profile_membership_count: rows.reduce((total, row) => total + row.profile_membership_count, 0),
    mapped_source_count: mappedSources.length,
    unmapped_source_count: unmappedSources.length,
    mapped_source_membership_count: mappedSources.reduce((total, row) => total + manifest.value.summary.source_counts[row.source_id], 0),
    unmapped_source_membership_count: unmappedSources.reduce((total, row) => total + manifest.value.summary.source_counts[row.source_id], 0),
    industry_membership_counts: Object.fromEntries(mapping.industries.map(id => [id, rows.reduce((total, row) => total + row.industries.find(item => item.industry_id === id).profile_membership_count, 0)])),
    source_disposition: sourceDisposition,
  };
  check(totals.scope_rows === 60 && totals.state_scope_rows === 51 && totals.territory_scope_rows === 5 && totals.special_scope_rows === 4, "scope conservation");
  check(totals.zip5_rows === manifest.value.summary.zip5_rows && totals.profile_membership_count === manifest.value.summary.profile_membership_count && totals.mapped_source_membership_count + totals.unmapped_source_membership_count === totals.profile_membership_count, "national membership conservation");
  return { root, registration, retained, manifest, manifestPath, artifact, jurisdiction, crosswalk, crosswalkPath, rows, totals };
}

function makeManifest(result, artifact) {
  const body = {
    schema_version: VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only", publication_mode: "pointer-free",
    bindings: {
      lifecycle_jurisdiction_evidence: { release_id: result.retained.release_id, manifest_path: path.relative(result.root, result.manifestPath).replaceAll("\\", "/"), manifest_sha256: result.manifest.sha256, artifact_sha256: result.artifact.sha256 },
      lifecycle_operational_industry_crosswalk: { path: path.relative(result.root, result.crosswalkPath).replaceAll("\\", "/"), sha256: result.crosswalk.sha256 },
    },
    summary: result.totals, claims: claims(), artifacts: [artifact],
  };
  return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}

export async function buildNationalBusinessLifecycleIndustryJurisdictionEvidence({ root = APP_ROOT, outputRoot } = {}) {
  const result = await composeNationalBusinessLifecycleIndustryJurisdictionEvidence({ root });
  outputRoot = inside(result.root, outputRoot ?? path.join(result.root, "data", DATASET));
  const raw = stable(result.rows), artifact = { path: "jurisdictions.json", artifact_type: "lifecycle-industry-jurisdiction-evidence", record_count: 60, bytes: Buffer.byteLength(raw), sha256: sha(raw) };
  const manifest = makeManifest(result, artifact), directory = path.join(outputRoot, "releases", manifest.release_id);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, value] of [[artifact.path, raw], ["manifest.json", stable(manifest)]]) {
    const file = path.join(directory, name);
    await fs.writeFile(file, value, { flag: "wx" }).catch(async error => { if (error.code !== "EEXIST") throw error; check(sha(await bytes(file)) === sha(value), "immutable release drift"); });
  }
  return verifyNationalBusinessLifecycleIndustryJurisdictionEvidence(path.join(directory, "manifest.json"), { root: result.root });
}

export async function verifyNationalBusinessLifecycleIndustryJurisdictionEvidence(manifestPath, { root = APP_ROOT } = {}) {
  root = path.resolve(root); manifestPath = inside(root, manifestPath);
  const read = await json(manifestPath, 2_000_000), manifest = read.value, { release_id, ...body } = manifest;
  check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && manifest.status === "immutable-pointer-free-local-review-only" && manifest.publication_mode === "pointer-free", "manifest contract");
  check(release_id === `${DATASET}-${sha(JSON.stringify(body))}` && path.basename(path.dirname(manifestPath)) === release_id, "manifest identity");
  check(JSON.stringify(manifest.claims) === JSON.stringify(claims()), "claims boundary");
  const result = await composeNationalBusinessLifecycleIndustryJurisdictionEvidence({ root });
  check(manifest.bindings.lifecycle_jurisdiction_evidence.release_id === result.retained.release_id && manifest.bindings.lifecycle_jurisdiction_evidence.manifest_sha256 === result.manifest.sha256 && manifest.bindings.lifecycle_jurisdiction_evidence.artifact_sha256 === result.artifact.sha256, "lifecycle jurisdiction binding");
  check(manifest.bindings.lifecycle_operational_industry_crosswalk.sha256 === result.crosswalk.sha256, "crosswalk binding");
  const expected = stable(result.rows), artifact = manifest.artifacts?.[0];
  check(manifest.artifacts?.length === 1 && artifact.path === "jurisdictions.json" && artifact.record_count === 60 && artifact.bytes === Buffer.byteLength(expected) && artifact.sha256 === sha(expected), "artifact descriptor");
  const actual = await bytes(inside(path.dirname(manifestPath), artifact.path), 5_000_000); check(actual.equals(Buffer.from(expected)), "artifact replay");
  check(JSON.stringify(manifest.summary) === JSON.stringify(result.totals), "summary replay");
  check(JSON.stringify(manifest) === JSON.stringify(makeManifest(result, artifact)), "manifest replay");
  check((await fs.readdir(path.dirname(manifestPath))).sort().join("|") === "jurisdictions.json|manifest.json", "closed release inventory");
  return { verified: true, release_id, manifest_sha256: read.sha256, artifact_sha256: artifact.sha256, artifact_bytes: artifact.bytes, ...result.totals };
}

export async function verifyRegisteredNationalBusinessLifecycleIndustryJurisdictionEvidence({ root = APP_ROOT } = {}) {
  root = path.resolve(root); const registration = await json(inside(root, `config/datasets/${DATASET}.json`), 1_000_000), value = registration.value;
  check(value.schema_version === `${DATASET}-registration@1.0.0` && value.dataset_id === DATASET && value.runtime_pointer === null && value.production_enrollment === false && JSON.stringify(value.claims) === JSON.stringify(claims()), "registration contract");
  const verified = await verifyNationalBusinessLifecycleIndustryJurisdictionEvidence(inside(root, value.retained_release.manifest), { root });
  check(verified.release_id === value.retained_release.release_id && verified.manifest_sha256 === value.retained_release.manifest_sha256 && verified.artifact_sha256 === value.retained_release.artifact_sha256 && verified.artifact_bytes === value.retained_release.artifact_bytes, "registered release pins");
  return verified;
}

export const lifecycleIndustryJurisdictionClaimsForTest = claims;
