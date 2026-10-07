import discovery from "../config/source-discoveries/wa-childcare-2026-10-07.json" with { type: "json" };

export function readWaChildcareSourceDiscovery() {
  if (
    discovery.state !== "WA" ||
    discovery.decision !==
      "official-active-center-and-school-age-socrata-api-metadata-validated-acquisition-disabled" ||
    discovery.scope.personal_contact_fields_excluded !== true ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.retained_metadata_observation.provider_rows_acquired !== 0 ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Washington childcare source discovery rejected.");
  return structuredClone(discovery);
}
