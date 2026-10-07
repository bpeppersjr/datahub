import discovery from "../config/source-discoveries/nj-childcare-2026-10-07.json" with { type: "json" };
export function readNjChildcareSourceDiscovery() {
  if (
    discovery.state !== "NJ" ||
    discovery.decision !==
      "official-dated-licensed-center-roster-and-open-data-api-identified-acquisition-disabled" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== true ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.temporal.snapshot_date !== "2026-10-01" ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("New Jersey childcare source discovery rejected.");
  return structuredClone(discovery);
}
