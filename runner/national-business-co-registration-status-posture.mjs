import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireTrue = (condition, detail) => { if (!condition) throw new Error(`Colorado registration-status posture rejected: ${detail}`); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
async function read(root, relativePath) { const bytes = await fs.readFile(path.join(root, relativePath)); return { value: JSON.parse(bytes), sha256: sha(bytes) }; }

export async function verifyNationalBusinessCoRegistrationStatusPosture({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted();
  root = path.resolve(root);
  const registrationPath = "config/datasets/national-business-co-registration-status-posture.json";
  const registration = (await read(root, registrationPath)).value;
  requireTrue(exactKeys(registration, ["schema_version", "dataset_id", "status", "scope", "runtime_pointer", "production_enrollment", "bindings", "expected", "claims"]), "registration keys");
  requireTrue(registration.schema_version === "1.0.0" && registration.status === "registered-pointer-pinned-local-review-only" && registration.scope === "separate-organization-assertion-cohort" && registration.runtime_pointer === null && registration.production_enrollment === false, "registration semantics");
  const bindingNames = ["pointer", "manifest", "source_summary", "dataset_registration", "source_policy", "record_schema", "lifecycle_taxonomy"];
  requireTrue(exactKeys(registration.bindings, bindingNames), "binding keys");
  const loaded = Object.fromEntries(await Promise.all(bindingNames.map(async (name) => { const binding = registration.bindings[name]; requireTrue(exactKeys(binding, ["path", "sha256"]) && /^[a-f0-9]{64}$/.test(binding.sha256), `${name} binding`); const file = await read(root, binding.path); requireTrue(file.sha256 === binding.sha256, `${name} pin`); return [name, file.value]; })));
  signal?.throwIfAborted();
  const expected = registration.expected, coverage = loaded.manifest.coverage, summary = loaded.source_summary;
  requireTrue(loaded.pointer.release_id === loaded.manifest.release_id && loaded.manifest.release_id === "co-business-registry-20260903-002916547Z-ed08beca" && loaded.manifest.source_release_id === "co-business-registry-2026-09-02-42884e178198747a", "release identity");
  requireTrue(coverage.source_good_standing_or_delinquent_records === expected.source_rows && coverage.organizations_published === expected.published_organizations && coverage.quarantined_source_records === expected.quarantined_rows && coverage.good_standing_organizations === expected.good_standing && coverage.delinquent_organizations === expected.delinquent && coverage.eligible_reported_us_business_addresses === expected.eligible_us_address && coverage.organizations_without_eligible_us_zip_address === expected.without_eligible_us_zip, "manifest counts");
  requireTrue(summary.good_standing_organizations === expected.good_standing && summary.delinquent_organizations === expected.delinquent && summary.quarantined_source_records === expected.quarantined_rows && summary.status_values?.["Good Standing"] === expected.good_standing && summary.status_values?.Delinquent === expected.delinquent, "summary counts");
  requireTrue(expected.published_organizations + expected.quarantined_rows === expected.source_rows && expected.good_standing + expected.delinquent === expected.published_organizations && expected.eligible_us_address + expected.without_eligible_us_zip === expected.published_organizations && loaded.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-co-business-organization-jsonl-gzip").reduce((sum, artifact) => sum + artifact.record_count, 0) === expected.published_organizations, "count conservation");
  const separate = loaded.lifecycle_taxonomy.separate_scopes?.find((row) => row.source_id === "co-business-registry");
  requireTrue(separate?.reported_status_semantics?.["Good Standing"] === "source-defined-current registry standing only" && separate.reported_status_semantics.Delinquent === "non-active-reporting" && separate.operation_verified === false, "taxonomy semantics");
  requireTrue(loaded.record_schema.properties?.source_status?.properties?.status?.enum?.join("|") === "Good Standing|Delinquent", "closed status schema");
  const claims = registration.claims;
  requireTrue(exactKeys(claims, ["current_operations_verified", "active_business_eligible", "active_business_count", "completeness_percentage", "location_profile_cohort_affected", "network_requests", "production_enrollment"]) && claims.current_operations_verified === false && claims.active_business_eligible === false && claims.active_business_count === null && claims.completeness_percentage === null && claims.location_profile_cohort_affected === false && claims.network_requests === 0 && claims.production_enrollment === false, "claims");
  return { schema_version: "national-business-co-registration-status-posture@1.0.0", verified: true, registration_path: registrationPath, scope: registration.scope, posture: { source_id: "co-business-registry", good_standing: { status: "source-defined-current-registry-standing", organization_count: expected.good_standing }, delinquent: { status: "non-active-reporting", organization_count: expected.delinquent } }, conservation: { ...expected }, provenance: { pointer_sha256: registration.bindings.pointer.sha256, manifest_sha256: registration.bindings.manifest.sha256, source_summary_sha256: registration.bindings.source_summary.sha256, taxonomy_sha256: registration.bindings.lifecycle_taxonomy.sha256, release_id: loaded.manifest.release_id, source_release_id: loaded.manifest.source_release_id }, claims };
}
