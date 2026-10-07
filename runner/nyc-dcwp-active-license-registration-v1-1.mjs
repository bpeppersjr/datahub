import { createHash } from "node:crypto";
import { readFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";

export const REGISTRATION_PATH = "config/datasets/nyc-dcwp-active-license-sites-v1-1.json";
const SHA = /^[a-f0-9]{64}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const reject = (message) => { throw new Error(`NYC DCWP v1.1 registration rejected: ${message}`); };

export function validateNycDcwpRegistrationV11(value) {
  if (!exact(value, ["schema_version", "dataset_id", "status", "predecessor_registration", "predecessor_registration_sha256", "retained_release", "claims", "runtime_pointer", "production_enrollment"])) reject("registration schema");
  if (value.schema_version !== "1.1.0" || value.dataset_id !== "nyc-dcwp-active-license-sites" || value.status !== "registered-immutable-local-review-only-successor") reject("registration identity");
  if (value.predecessor_registration !== "config/datasets/nyc-dcwp-active-license-sites.json" || !SHA.test(value.predecessor_registration_sha256)) reject("predecessor binding");
  const r = value.retained_release;
  if (!exact(r, ["release_id", "source_release_id", "manifest", "manifest_sha256", "manifest_bytes", "source_rows_updated_at", "artifact_count", "artifact_bytes", "source_active_premise_license_records", "accepted_active_premise_license_records", "normalized_licensed_sites", "unique_business_ids", "quarantined_source_records", "quarantined_business_groups", "source_geocoded_sites", "source_zip_codes", "zip_union_records"])) reject("release schema");
  if (r.release_id !== "nyc-dcwp-active-premises-20260903-004437783Z-a00056e7" || r.source_release_id !== "nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec" || r.manifest_sha256 !== "c8ad5ffeb5c970d07bc9a78e963a10e26003631b6303bd6e1eed4f004c5013d3" || r.manifest_bytes !== 8766 || r.source_rows_updated_at !== "2026-08-20T13:24:53.000Z") reject("release pin");
  if (r.artifact_count !== 21 || r.artifact_bytes !== 91531713 || r.source_active_premise_license_records !== 35245 || r.accepted_active_premise_license_records !== 34397 || r.normalized_licensed_sites !== 31163 || r.unique_business_ids !== 31163 || r.quarantined_source_records !== 848 || r.quarantined_business_groups !== 665 || r.source_geocoded_sites !== 26532 || r.source_zip_codes !== 1550 || r.zip_union_records !== 37828) reject("release conservation");
  const c = value.claims;
  if (!exact(c, ["publisher_membership", "current_operations_verified", "continuous_operation_verified", "public_access_verified", "complete_all_businesses", "record_export_policy", "aggregate_export_policy", "nonadditive_with_nyc_dcwp_license_location_profiles", "identity_merges", "parent_company_inferred", "production_enrollment", "network_requests", "current_pointer_written"])) reject("claims schema");
  if (c.publisher_membership !== "NYC DCWP source-defined Active Premises license snapshot" || c.current_operations_verified !== false || c.continuous_operation_verified !== false || c.public_access_verified !== false || c.complete_all_businesses !== false || c.record_export_policy !== "local-review-only" || c.aggregate_export_policy !== "public-with-provenance-and-semantic-limitations" || c.nonadditive_with_nyc_dcwp_license_location_profiles !== true || c.identity_merges !== false || c.parent_company_inferred !== false || c.production_enrollment !== false || c.network_requests !== 0 || c.current_pointer_written !== false || value.runtime_pointer !== null || value.production_enrollment !== false) reject("claim boundary");
  return value;
}

export async function verifyNycDcwpRegistrationV11({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted();
  const registrationPath = assertInsideApp(path.resolve(root, REGISTRATION_PATH));
  const registrationBytes = await readFile(registrationPath);
  const registration = validateNycDcwpRegistrationV11(JSON.parse(registrationBytes));
  const predecessorBytes = await readFile(assertInsideApp(path.resolve(root, registration.predecessor_registration)));
  if (hash(predecessorBytes) !== registration.predecessor_registration_sha256) reject("predecessor bytes");
  const manifestPath = assertInsideApp(path.resolve(root, registration.retained_release.manifest));
  const manifestReal = await realpath(manifestPath);
  if (manifestReal !== manifestPath || (await lstat(manifestPath)).nlink !== 1) reject("manifest filesystem identity");
  const manifestBytes = await readFile(manifestPath);
  if (manifestBytes.length !== registration.retained_release.manifest_bytes || hash(manifestBytes) !== registration.retained_release.manifest_sha256) reject("manifest bytes");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.release_id !== registration.retained_release.release_id || manifest.source_release_id !== registration.retained_release.source_release_id || manifest.status !== "complete" || manifest.complete_source_snapshot !== true || manifest.source?.rows_updated_at !== registration.retained_release.source_rows_updated_at || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== registration.retained_release.artifact_count || manifest.artifacts.reduce((sum, item) => sum + item.bytes, 0) !== registration.retained_release.artifact_bytes) reject("manifest identity or inventory");
  const coverage = manifest.coverage;
  for (const [key, expected] of Object.entries({ source_active_premise_license_records: 35245, accepted_active_premise_license_records: 34397, normalized_licensed_sites: 31163, unique_business_ids: 31163, quarantined_source_records: 848, quarantined_business_groups: 665, source_geocoded_sites: 26532, source_zip_codes: 1550, zip_union_records: 37828 })) if (coverage?.[key] !== expected || registration.retained_release[key] !== expected) reject(`coverage ${key}`);
  const releaseDirectory = path.dirname(manifestPath);
  for (const artifact of manifest.artifacts) {
    signal?.throwIfAborted();
    const artifactPath = assertInsideApp(path.resolve(releaseDirectory, artifact.path));
    const bytes = await readFile(artifactPath);
    if (bytes.length !== artifact.bytes || hash(bytes) !== artifact.sha256) reject(`artifact ${artifact.path}`);
  }
  return Object.freeze({ registration_path: REGISTRATION_PATH, registration_sha256: hash(registrationBytes), release_id: manifest.release_id, manifest_sha256: hash(manifestBytes), artifact_count: manifest.artifacts.length, artifact_bytes: registration.retained_release.artifact_bytes, normalized_licensed_sites: coverage.normalized_licensed_sites, source_zip_codes: coverage.source_zip_codes, network_requests: 0, production_enrollment: false });
}
