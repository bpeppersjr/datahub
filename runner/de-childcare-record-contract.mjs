import {createHash} from "node:crypto";

export const VERSION = "de-childcare-provider-record-contract@1.0.0";
export const DATASET_ID = "iuzd-3dbt";
export const RECORD_API = `https://data.delaware.gov/resource/${DATASET_ID}.json`;
export const PAGE_SIZE = 5000;
export const SELECTED_FIELDS = Object.freeze([
  "resource_id",
  "resource_name",
  "resource_type",
  "enforcement_action",
  "intent_to_revoke",
  "site_street_address",
  "site_city",
  "site_state",
  "site_zip_code",
  "capacity",
  "geocoded_location",
]);

const fail = (message) => {
  throw new Error(`Delaware childcare record contract rejected: ${message}.`);
};
const check = (value, message) => value || fail(message);
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const text = (value, maximum = 4096) =>
  value === null ||
  (typeof value === "string" &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value));
const requiredText = (value, maximum = 4096) => text(value, maximum) && value.length > 0;
const numeric = (value) =>
  value === null ||
  (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value));
const sha = (value) => createHash("sha256").update(value).digest("hex");

export function buildDeChildcareRecordRequest({afterResourceId = null} = {}) {
  check(
    afterResourceId === null || /^\d+$/.test(afterResourceId),
    "pagination cursor",
  );
  const query = new URLSearchParams({
    "$select": SELECTED_FIELDS.join(","),
    "$order": "resource_id ASC",
    "$limit": String(PAGE_SIZE),
  });
  if (afterResourceId !== null)
    query.set("$where", `resource_id > ${afterResourceId}`);
  return Object.freeze({
    schema_version: "de-childcare-record-request@1.0.0",
    method: "GET",
    url: `${RECORD_API}?${query.toString()}`,
    allowed_host: "data.delaware.gov",
    redirect_policy: "deny",
    maximum_response_bytes: 25_000_000,
    timeout_ms: 30_000,
    retries: 0,
    page_size: PAGE_SIZE,
    cursor: afterResourceId,
    claims: Object.freeze({
      request_performed: false,
      acquisition_authorized: false,
      production_enrollment: false,
    }),
  });
}

function point(value) {
  if (value === null) return null;
  check(exact(value, ["type", "coordinates"]), "point envelope");
  check(
    value.type === "Point" &&
      Array.isArray(value.coordinates) &&
      value.coordinates.length === 2 &&
      value.coordinates.every((item) => typeof item === "number" && Number.isFinite(item)),
    "point coordinates",
  );
  const [longitude, latitude] = value.coordinates;
  check(
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90,
    "point range",
  );
  return Object.freeze({latitude, longitude});
}

function postal(value) {
  if (value === null || value === "")
    return Object.freeze({zip_code: null, zip4: null, source: value});
  check(typeof value === "string", "postal type");
  const match = value.match(/^(\d{5})(?:-(\d{4}))?$/);
  check(match, "postal format");
  return Object.freeze({zip_code: match[1], zip4: match[2] ?? null, source: value});
}

export function validateDeChildcareSourceRow(row) {
  check(exact(row, SELECTED_FIELDS), "selected field roster");
  check(/^\d+$/.test(row.resource_id), "resource identity");
  check(requiredText(row.resource_name, 1000), "resource name");
  for (const key of [
    "resource_type",
    "enforcement_action",
    "intent_to_revoke",
    "site_street_address",
    "site_city",
  ]) check(text(row[key], 1000), key);
  check(row.site_state === "DE", "reported state");
  check(text(row.site_zip_code, 10), "postal text");
  check(numeric(row.capacity), "capacity");
  point(row.geocoded_location);
  postal(row.site_zip_code);
  return row;
}

export function normalizeDeChildcarePage(
  document,
  {sourceReleaseId, sourceUpdatedAt},
) {
  check(Array.isArray(document) && document.length <= PAGE_SIZE, "page envelope");
  check(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sourceReleaseId ?? "") &&
      new Date(sourceUpdatedAt).toISOString() === sourceUpdatedAt,
    "source provenance",
  );
  const records = [];
  let prior = null;
  const seen = new Set();
  for (const source of document) {
    validateDeChildcareSourceRow(source);
    check(!seen.has(source.resource_id), "duplicate resource identity");
    check(
      prior === null || BigInt(source.resource_id) > BigInt(prior),
      "resource order",
    );
    seen.add(source.resource_id);
    prior = source.resource_id;
    const location = point(source.geocoded_location),
      postalFields = postal(source.site_zip_code),
      sourceRecordId = sha(
        Buffer.from(`${DATASET_ID}\0${sourceReleaseId}\0${source.resource_id}`),
      );
    records.push(Object.freeze({
      schema_version: "1.0.0",
      dataset_id: "de-childcare-providers",
      source_record_id: sourceRecordId,
      publisher_scope: "DE",
      business_name: source.resource_name,
      dba_name: null,
      external_identifiers: Object.freeze([Object.freeze({
        type: "delaware_childcare_resource_id",
        value: source.resource_id,
        source_field: "resource_id",
        identity_verified: false,
        stability_verified: false,
      })]),
      reported_address: Object.freeze({
        street: source.site_street_address || null,
        street2: null,
        city: source.site_city || null,
        state: "DE",
        state_source: source.site_state,
        country: null,
        zip_code: postalFields.zip_code,
        postal_code: postalFields.source || null,
        zip4: postalFields.zip4,
        address_role: "reported-address-unverified",
      }),
      geocode: Object.freeze({
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        crs: location ? "EPSG:4326" : null,
        status: location ? "publisher-point" : "not-reported",
        inferred: false,
      }),
      industry: Object.freeze({
        category: "childcare",
        childcare_type_source: source.resource_type || null,
      }),
      source_status: Object.freeze({
        enforcement_action_source: source.enforcement_action || null,
        intent_to_revoke_source: source.intent_to_revoke || null,
        source_membership_updated_at: sourceUpdatedAt,
        status_interpretation: "publisher-current-dataset-membership-not-current-operation",
        active_business_verified: false,
      }),
      capacity_source: source.capacity,
      source: Object.freeze({
        dataset_id: DATASET_ID,
        source_release_id: sourceReleaseId,
        source_updated_at: sourceUpdatedAt,
        selected_attributes: Object.freeze({...source}),
      }),
      claims: Object.freeze({
        current_operation_verified: false,
        licensed_status_interpreted: false,
        physical_site_verified: false,
        usps_zip_validity_verified: false,
        statewide_completeness: null,
        unique_business: false,
        production_enrollment: false,
      }),
    }));
  }
  return Object.freeze({
    schema_version: VERSION,
    source_release_id: sourceReleaseId,
    source_updated_at: sourceUpdatedAt,
    source_rows: document.length,
    normalized_rows: records.length,
    next_cursor: document.length === PAGE_SIZE ? prior : null,
    records: Object.freeze(records),
    claims: Object.freeze({
      network_requests: 0,
      acquisition_performed: false,
      complete_source_snapshot: false,
      current_operations_verified: false,
      production_enrollment: false,
      current_pointer_written: false,
    }),
  });
}
