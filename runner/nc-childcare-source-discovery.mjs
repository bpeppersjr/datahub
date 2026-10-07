import discovery from "../config/source-discoveries/nc-childcare-2026-10-07.json" with { type: "json" };
export function readNcChildcareSourceDiscovery() {
  if (
    discovery.state !== "NC" ||
    discovery.decision !==
      "official-facility-search-and-data-request-path-identified-acquisition-disabled" ||
    discovery.access.provider_level_data_request_path_available !== true ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.temporal.maximum_described_facility_record_age_days !== 364 ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("North Carolina childcare source discovery rejected.");
  return structuredClone(discovery);
}
