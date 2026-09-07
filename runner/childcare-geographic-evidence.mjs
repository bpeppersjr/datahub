import { createHash } from "node:crypto";
import { assertNormalizedUsPostalFields } from "./normalized-us-postal-code.mjs";

export const CHILDCARE_GEOGRAPHIC_ARTIFACT_TYPE = "business-reporting-location-evidence-jsonl-gzip";
const sources = { "ma-licensed-center-based-childcare": ["ma", "MA", "massgis-eec-childcare-local-review"],
  "nj-licensed-childcare-centers": ["nj", "NJ", "njdep-childcare-local-review"] };
const hex = /^[a-f0-9]{64}$/;
const utc = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function check(value) { if (!value) throw new Error("Invalid reporting-only childcare geographic evidence."); }
function fields(value, allowed) { check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key))); }
function scalarText(value, maximum = 2000) { return value === null || (typeof value === "string" && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value)); }
export function validateChildcareGeographicEvidence(row) {
  const scope = sources[row?.source?.source_id]; check(scope);
  check(Object.keys(row).sort().join("|") === ["schema_version", "site_entity_id", "establishment_entity_id", "zip_code", "address", "location", "source", "observed_at", "identity_matching_eligible", "export_policy", "category", "evidence", "names", "source_status"].sort().join("|"));
  check(row.schema_version === "1.0.0" && row.identity_matching_eligible === false && row.export_policy === "local-review-only" && row.category === "childcare");
  check(new RegExp(`^site:${scope[0]}_childcare_[a-f0-9]{32}$`).test(row.site_entity_id)
    && row.establishment_entity_id === row.site_entity_id.replace(/^site:/, "establishment:")
    && utc(row.observed_at) && row.address?.state === scope[1] && row.address?.country === "US" && row.address.zip_code === row.zip_code);
  assertNormalizedUsPostalFields(row.address, "childcare geographic address");
  fields(row.address, ["street", "street2", "city", "county_source", "state", "country", "state_country_basis", "zip_code", "postal_code", "zip4"]);
  check(Object.values(row.address).every((value) => scalarText(value, 500)) && typeof row.address.street === "string" && row.address.street.trim() && typeof row.address.city === "string" && row.address.city.trim());
  check(Object.keys(row.location ?? {}).sort().join("|") === "latitude|longitude");
  const { latitude, longitude } = row.location;
  check((latitude === null && longitude === null) || (Number.isFinite(latitude) && Number.isFinite(longitude)
    && (scope[0] === "ma" ? latitude >= 41 && latitude <= 43 && longitude >= -74 && longitude <= -69
      : latitude >= 38 && latitude <= 42 && longitude >= -76 && longitude <= -73)));
  check(Array.isArray(row.names) && row.names.length === 1 && Object.keys(row.names[0]).join("|") === "raw"
    && typeof row.names[0].raw === "string" && row.names[0].raw.length <= 255 && row.names[0].raw.trim() && !/[\u0000-\u001f\u007f]/u.test(row.names[0].raw));
  check(row.source.policy_id === scope[2] && typeof row.source.source_release_id === "string"
    && new RegExp(`^${scope[0]}-childcare-[a-f0-9]{64}$`).test(row.source.source_release_id)
    && row.source.source_record_id.startsWith(`${row.source.source_release_id}:object:`)
    && typeof row.source.ingest_run_id === "string" && typeof row.source.transformation_version === "string"
    && Object.keys(row.source).sort().join("|") === ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "transformation_version", "policy_id"].sort().join("|"));
  check(hex.test(row.evidence?.manifest_sha256) && row.evidence.policy_profile === `${scope[2]}@1.0.0`
    && row.source_status?.active_business_verified === false);
  fields(row.source_status, ["status_source", "status_interpretation", "active_business_verified", "licensed_capacity", ...(scope[0] === "nj" ? ["approval_date_epoch_ms", "renewal_date_epoch_ms"] : [])]);
  check(scalarText(row.source_status.status_source, 50) && scalarText(row.source_status.status_interpretation, 100)
    && (row.source_status.licensed_capacity === null || (Number.isSafeInteger(row.source_status.licensed_capacity) && row.source_status.licensed_capacity >= 0)));
  for (const key of ["approval_date_epoch_ms", "renewal_date_epoch_ms"]) if (Object.hasOwn(row.source_status, key)) check(row.source_status[key] === null || (Number.isSafeInteger(row.source_status[key]) && Number.isFinite(new Date(row.source_status[key]).getTime())));
  fields(row.evidence, ["manifest_sha256", "policy_profile", "release_id", "input_feature_sha256", "attribution", "assertion_status_semantics", "confidence_semantics", "temporal_scope", "identity_scope", "transformation_version", "publisher_download_date_epoch_ms", "normalized_provenance", "publisher_metadata_required", "derived_publication_notice_required", "processed_at", "reprocessing", "assertions_sha256"]);
  for (const [key, value] of Object.entries(row.evidence)) {
    if (["normalized_provenance", "reprocessing"].includes(key)) continue;
    if (["publisher_metadata_required", "derived_publication_notice_required"].includes(key)) check(value === true);
    else if (key === "publisher_download_date_epoch_ms") check(Number.isSafeInteger(value) && value > 0);
    else check(scalarText(value));
  }
  for (const key of ["input_feature_sha256", "assertions_sha256"]) if (Object.hasOwn(row.evidence, key)) check(hex.test(row.evidence[key]));
  if (row.evidence.normalized_provenance !== undefined) {
    const p = row.evidence.normalized_provenance;
    fields(p, ["source_url", "source_object_id", "source_release_id", "ingest_run_id", "observed_at", "publisher_download_date_epoch_ms", "publisher_download_date_at", "transformation_version", "input_feature_sha256", "attribution", "publisher_metadata_required", "derived_publication_notice_required"]);
    for (const [key, value] of Object.entries(p)) {
      if (["source_object_id", "publisher_download_date_epoch_ms"].includes(key)) check(Number.isSafeInteger(value) && value > 0);
      else if (["publisher_metadata_required", "derived_publication_notice_required"].includes(key)) check(value === true);
      else check(scalarText(value));
    }
  }
  if (row.evidence.reprocessing !== undefined) {
    const p = row.evidence.reprocessing;
    fields(p, ["mode", "network_requests", "parent_release_id", "parent_source_release_id", "parent_manifest_sha256", "parent_manifest_artifact", "parent_transformation_version"]);
    check(p.mode === "local-retained-evidence" && p.network_requests === 0 && p.parent_manifest_artifact === "reprocessing-parent-manifest.json"
      && hex.test(p.parent_manifest_sha256) && p.parent_source_release_id === row.source.source_release_id && utc(row.evidence.processed_at));
    for (const [key, value] of Object.entries(p)) if (key !== "network_requests") check(scalarText(value));
  }
  if (scope[0] === "nj") check(row.source_status.status_source === null && row.source_status.status_interpretation === "active-licensed-center-layer-membership-only");
  else check(["missing-source-status", "source-status-preserved", "unmapped-source-status"].includes(row.source_status.status_interpretation));
  return row;
}
export function createChildcareGeographicEvidence(contribution) {
  const by = (predicate) => contribution.assertions.find((assertion) => assertion.predicate === predicate);
  const address = by("site.address"), point = by("site.reported-location"), name = by("establishment.name"), status = by("establishment.source-status");
  check(address && point && name && status && contribution.matchProfiles.length === 0 && contribution.exportPolicy === "local-review-only");
  const source = { ...address.source }; delete source.source_field;
  return validateChildcareGeographicEvidence({ schema_version: "1.0.0", site_entity_id: address.subject_entity_id,
    establishment_entity_id: name.subject_entity_id, zip_code: contribution.zipCode, address: structuredClone(address.value),
    location: { latitude: point.value.latitude, longitude: point.value.longitude }, source, observed_at: address.observed_at,
    identity_matching_eligible: false, export_policy: "local-review-only", category: "childcare", names: [{ raw: name.value }],
    source_status: structuredClone(status.value), evidence: { ...structuredClone(contribution.evidence),
      assertions_sha256: createHash("sha256").update(JSON.stringify([...contribution.assertions].sort((a, b) => a.assertion_id.localeCompare(b.assertion_id)))).digest("hex") } });
}
