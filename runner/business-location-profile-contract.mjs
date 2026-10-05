import { createHash } from "node:crypto";

export const BUSINESS_LOCATION_PROFILE_VERSION = "business-location-match-profile@1.1.0";
export const LEGACY_PROFILE_VERSION = "business-location-match-profile@1.0.0";
export const LEGACY_PROFILE_REGISTRY_BINDING = Object.freeze({
  dataset_id: "national-business-registry",
  release_id: "national-business-registry-20260911-022652067Z-1ec656c3",
  manifest_sha256: "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76",
});

const CURRENT_KEYS = ["schema_version", "profile_version", "profile_id", "zip_code", "site_entity_id", "establishment_entity_id", "organization_entity_id", "address", "normalized_address", "address_match_key_sha256", "names", "primary_name_match_key_sha256", "geocode", "external_identifiers", "source_status", "observed_at", "source", "export_policy"];
const LEGACY_KEYS = CURRENT_KEYS.map(key => key === "geocode" ? "location" : key).sort();
const ADDRESS_KEYS = ["street", "unit_or_additional", "city", "state", "zip_code", "postal_code", "zip4", "county_name"];
const NORMALIZED_ADDRESS_KEYS = ["kind", "street", "unit", "city", "state", "zip_code", "complete", "match_key"];
const SOURCE_KEYS = ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "transformation_version", "policy_id"];
const SOURCE_OPTIONAL_KEYS = ["source_record_ids", "observed_at", "retrieved_at"];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
const textOrNull = value => value === null || typeof value === "string";
function assertNoPolygonKeys(value, depth = 0) {
  if (depth > 10) throw new Error("Profile nesting exceeds its contract limit.");
  if (Array.isArray(value)) { for (const item of value) assertNoPolygonKeys(item, depth + 1); return; }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (["geometry", "polygon", "coordinates", "geography", "spatial_geometry"].includes(key.toLowerCase())) throw new Error("Profile contains a forbidden geometry or polygon field.");
    assertNoPolygonKeys(item, depth + 1);
  }
}

function validatePostalAddress(address) {
  if (!exactKeys(address, ADDRESS_KEYS)) throw new Error("Profile address keys do not match its versioned contract.");
  if (address.zip_code !== null && !/^\d{5}$/.test(address.zip_code ?? "")) throw new Error("Profile address ZIP must be exact ZIP5.");
  if (address.postal_code !== address.zip_code) throw new Error("Profile postal_code must equal the exact ZIP5 value.");
  if (address.zip4 !== null && !/^\d{4}$/.test(address.zip4 ?? "")) throw new Error("Profile ZIP4 must be a separate exact four-digit value or null.");
  for (const key of ADDRESS_KEYS.filter(key => !["zip_code", "postal_code", "zip4"].includes(key))) {
    if (address[key] !== undefined && !textOrNull(address[key])) throw new Error(`Profile address ${key} must be text or null.`);
  }
  if (!Object.hasOwn(address, "zip_code") || !Object.hasOwn(address, "postal_code") || !Object.hasOwn(address, "zip4")) throw new Error("Profile address requires split ZIP5, postal_code, and ZIP4 fields.");
}

function validPair(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function normalizeLegacyLocation(location) {
  if (location === null) return null;
  if (!isRecord(location)) throw new Error("Legacy profile location is malformed.");
  if (location.type === "Point") {
    if (Object.keys(location).sort().join("\u0000") !== ["coordinates", "coordinate_reference_system", "type"].sort().join("\u0000")
      || location.coordinate_reference_system !== "EPSG:4326" || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) throw new Error("Legacy point location is not a closed EPSG:4326 point.");
    const [longitude, latitude] = location.coordinates;
    if (!validPair(latitude, longitude)) throw new Error("Legacy point coordinates are invalid or ambiguous.");
    return { latitude, longitude };
  }
  if (exactKeys(location, ["latitude", "longitude"])) {
    const { latitude, longitude } = location;
    if (latitude === null && longitude === null) return null;
    if (!validPair(latitude, longitude)) throw new Error("Legacy latitude/longitude values are invalid or incomplete.");
    return { latitude, longitude };
  }
  throw new Error("Legacy geometry compatibility accepts only a Point or explicit latitude/longitude pair.");
}

export function normalizeCoordinateGeocode(value) {
  if (value === null || value === undefined) return null;
  if (isRecord(value) && value.type === "Point") return normalizeLegacyLocation(value);
  if (isRecord(value) && exactKeys(value, ["latitude", "longitude"])) return normalizeLegacyLocation(value);
  throw new Error("Coordinate evidence must be null, an exact EPSG:4326 Point, or an explicit latitude/longitude pair.");
}

export function validateLegacyGeometryAssertion(value, registryBinding) {
  if (!registryBinding || Object.entries(LEGACY_PROFILE_REGISTRY_BINDING).some(([key, expected]) => registryBinding[key] !== expected)) {
    throw new Error("Legacy geometry assertion requires the exact retained registry release and manifest binding.");
  }
  return normalizeCoordinateGeocode(value);
}

function validateGeocode(geocode) {
  if (geocode === null) return;
  if (!exactKeys(geocode, ["latitude", "longitude"]) || !validPair(geocode.latitude, geocode.longitude)) throw new Error("Profile geocode must be a bounded latitude/longitude pair or null.");
}

export function normalizeBusinessLocationProfile(profile, registryBinding = null) {
  if (!isRecord(profile) || profile.schema_version !== "1.0.0") throw new Error("Location profile schema version is unsupported.");
  const legacy = profile.profile_version === LEGACY_PROFILE_VERSION;
  const current = profile.profile_version === BUSINESS_LOCATION_PROFILE_VERSION;
  if (!legacy && !current) throw new Error("Location profile version is unsupported.");
  if (!exactKeys(profile, legacy ? LEGACY_KEYS : CURRENT_KEYS)) throw new Error("Location profile keys do not match their versioned contract.");
  if (legacy && (!registryBinding || Object.entries(LEGACY_PROFILE_REGISTRY_BINDING).some(([key, value]) => registryBinding[key] !== value))) {
    throw new Error("Legacy profile compatibility requires the exact retained registry release and manifest binding.");
  }
  if (!/^location-profile:[a-f0-9]{32}$/.test(profile.profile_id ?? "") || !/^\d{5}$/.test(profile.zip_code ?? "")
    || !/^site:[A-Za-z0-9_-]+$/.test(profile.site_entity_id ?? "") || !/^establishment:[A-Za-z0-9_-]+$/.test(profile.establishment_entity_id ?? "")
    || (profile.organization_entity_id !== null && !/^organization:[A-Za-z0-9_-]+$/.test(profile.organization_entity_id ?? ""))) throw new Error("Location profile identity or ZIP is malformed.");
  validatePostalAddress(profile.address);
  if (profile.address.zip_code !== profile.zip_code) throw new Error("Profile ZIP does not match its split address ZIP5.");
  if (!exactKeys(profile.normalized_address, NORMALIZED_ADDRESS_KEYS) || profile.normalized_address.zip_code !== profile.zip_code
    || !["street", "po-box", "route", "unknown"].includes(profile.normalized_address.kind)
    || ["street", "unit", "city", "state"].some(key => !textOrNull(profile.normalized_address[key]))
    || typeof profile.normalized_address.complete !== "boolean" || (profile.normalized_address.match_key !== null && typeof profile.normalized_address.match_key !== "string")
    || profile.normalized_address.complete !== (typeof profile.normalized_address.match_key === "string" && profile.normalized_address.match_key.length > 0)
    || profile.normalized_address.complete !== Boolean(profile.normalized_address.street && profile.normalized_address.city && /^[A-Z]{2}$/.test(profile.normalized_address.state ?? ""))
    || (profile.normalized_address.complete && profile.normalized_address.match_key !== [profile.normalized_address.kind, profile.normalized_address.street, profile.normalized_address.unit ?? "", profile.normalized_address.city, profile.normalized_address.state, profile.zip_code].join("|"))
    || (profile.normalized_address.complete ? sha256(profile.normalized_address.match_key) !== profile.address_match_key_sha256 : profile.address_match_key_sha256 !== null)) throw new Error("Normalized profile address is malformed.");
  const validSourceKeys = isRecord(profile.source) && SOURCE_KEYS.every(key => Object.hasOwn(profile.source, key))
    && Object.keys(profile.source).every(key => [...SOURCE_KEYS, ...SOURCE_OPTIONAL_KEYS].includes(key));
  if (!Array.isArray(profile.names) || !Array.isArray(profile.external_identifiers)) throw new Error("Profile name or identifier collections are malformed.");
  if (!isRecord(profile.source) || !validSourceKeys || SOURCE_KEYS.some(key => typeof profile.source[key] !== "string" || !profile.source[key])) throw new Error(`Profile source lineage keys are malformed (${Object.keys(profile.source ?? {}).sort().join(",")}).`);
  if (Object.hasOwn(profile.source, "source_record_ids") && (!Array.isArray(profile.source.source_record_ids)
    || profile.source.source_record_ids.length < 1 || profile.source.source_record_ids.some(value => typeof value !== "string" || !value)
    || new Set(profile.source.source_record_ids).size !== profile.source.source_record_ids.length)) throw new Error("Grouped profile source-record lineage is malformed.");
  for (const key of ["observed_at", "retrieved_at"]) if (Object.hasOwn(profile.source, key)
    && (typeof profile.source[key] !== "string" || !Number.isFinite(Date.parse(profile.source[key])))) throw new Error("Profile source observation lineage is malformed.");
  if (profile.primary_name_match_key_sha256 !== null && !/^[a-f0-9]{64}$/.test(profile.primary_name_match_key_sha256)) throw new Error("Profile primary-name digest is malformed.");
  if (typeof profile.observed_at !== "string" || !Number.isFinite(Date.parse(profile.observed_at)) || typeof profile.export_policy !== "string" || !profile.export_policy) throw new Error("Profile observation or policy is malformed.");
  const { location: legacyLocation, ...fieldsWithoutLegacyLocation } = profile;
  assertNoPolygonKeys(fieldsWithoutLegacyLocation);
  const geocode = legacy ? normalizeLegacyLocation(legacyLocation) : profile.geocode;
  validateGeocode(geocode);
  const address = Object.fromEntries(ADDRESS_KEYS.map(key => [key, profile.address[key] ?? null]));
  const normalized = { ...profile, profile_version: BUSINESS_LOCATION_PROFILE_VERSION, address, geocode };
  delete normalized.location;
  assertNoPolygonKeys(normalized);
  return normalized;
}

export function registryProfileCompatibilityBinding(manifest, manifestSha256) {
  if (!manifest || typeof manifest.dataset_id !== "string" || typeof manifest.release_id !== "string" || !/^[a-f0-9]{64}$/.test(manifestSha256 ?? "")) throw new Error("Registry profile compatibility binding is malformed.");
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest_sha256: manifestSha256 };
}

