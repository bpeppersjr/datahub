import {
  inspectAcsZctaDemographicPrerequisites,
  TABLES,
  VERSION as INSPECTION_VERSION,
} from "./acs-zcta-demographic-admission.mjs";

export const ACS_ZCTA_NETWORK_READINESS_VERSION =
  "acs-zcta-demographic-network-readiness-view@1.0.0";

const EXPECTED_BLOCKERS = Object.freeze([
  "missing-trusted-retained-official-acs-group-metadata",
  "missing-approved-structured-authorization-receipt",
  "missing-immutable-governed-acs-source-release",
  "unresolved-official-sentinel-and-annotation-semantics",
  "network-acquisition-plan-awaiting-explicit-authorization",
]);

const fail = (message) => {
  throw new Error(`ACS ZCTA network readiness rejected: ${message}.`);
};
const check = (value, message) => value || fail(message);

export async function readAcsZctaDemographicNetworkReadiness(options = {}) {
  const inspected = await inspectAcsZctaDemographicPrerequisites(options);
  check(inspected.schema_version === INSPECTION_VERSION, "inspection version");
  check(
    JSON.stringify(inspected.blockers) === JSON.stringify(EXPECTED_BLOCKERS),
    "closed blocker roster",
  );
  check(
    inspected.prerequisites.reviewed_network_acquisition_plan_available === true &&
      inspected.prerequisites.network_acquisition_authorized === false &&
      inspected.prerequisites.trusted_official_metadata_release_available === false &&
      inspected.prerequisites.approved_structured_authorization_receipt_available === false &&
      inspected.prerequisites.immutable_governed_acs_source_release_available === false,
    "closed prerequisite state",
  );
  check(
    inspected.claims.network_requests === 0 &&
      inspected.claims.current_pointer_written === false &&
      inspected.claims.production_enrollment === false &&
      inspected.claims.source_ingestion_performed === false &&
      inspected.claims.staging_created === false &&
      inspected.claims.release_created === false &&
      inspected.claims.percentages_emitted === false,
    "zero-execution claims",
  );
  const plan = inspected.network_acquisition_plan;
  check(
    plan.maximum_total_requests === 8 &&
      plan.maximum_metadata_response_bytes === 5_000_000 &&
      plan.maximum_group_response_bytes === 536_870_912 &&
      plan.maximum_total_source_bytes === 1_073_741_824 &&
      plan.minimum_free_disk_bytes === 2_147_483_648 &&
      JSON.stringify(plan.tables) === JSON.stringify(TABLES) &&
      plan.non_zcta_space_blocks_map === false,
    "network plan boundary",
  );
  return Object.freeze({
    schema_version: ACS_ZCTA_NETWORK_READINESS_VERSION,
    status: "reviewed-plan-awaiting-explicit-network-authorization",
    source: Object.freeze({
      publisher: "United States Census Bureau",
      vintage: plan.vintage,
      period: plan.period,
      product: plan.product,
      public_release_date: plan.public_release_date,
      geography: plan.geography,
    }),
    request_budget: Object.freeze({
      metadata_requests: 4,
      data_requests: 4,
      maximum_total_requests: plan.maximum_total_requests,
      maximum_metadata_response_bytes: plan.maximum_metadata_response_bytes,
      maximum_group_response_bytes: plan.maximum_group_response_bytes,
      maximum_total_source_bytes: plan.maximum_total_source_bytes,
      minimum_free_disk_bytes: plan.minimum_free_disk_bytes,
      maximum_parallel_requests: 1,
    }),
    tables: Object.freeze([...TABLES]),
    prerequisites: Object.freeze({
      plan_verified: true,
      network_acquisition_authorized: false,
      trusted_official_metadata_release_available: false,
      approved_structured_authorization_receipt_available: false,
      immutable_governed_acs_source_release_available: false,
    }),
    blockers: Object.freeze([...EXPECTED_BLOCKERS]),
    geography: Object.freeze({
      governed_zctas: inspected.governed_zctas,
      private_unique_or_po_box_zip_without_zcta:
        plan.private_unique_or_po_box_zip_without_zcta,
      non_zcta_space_blocks_map: false,
    }),
    claims: Object.freeze({
      network_requests: 0,
      acquisition_performed: false,
      current_pointer_written: false,
      production_enrollment: false,
      demographic_percentages: false,
      demographic_gdp_allocation: false,
    }),
    provenance: Object.freeze({
      plan_sha256: inspected.pins.network_acquisition_plan_sha256,
      admission_config_sha256: inspected.pins.admission_config_sha256,
    }),
  });
}
