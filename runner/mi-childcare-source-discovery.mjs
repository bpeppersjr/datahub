import discovery from "../config/source-discoveries/mi-childcare-2026-10-07.json" with { type: "json" };
export function readMiChildcareSourceDiscovery() {
  if (
    discovery.state !== "MI" ||
    discovery.decision !==
      "official-current-facilities-report-identified-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Michigan childcare source discovery rejected.");
  return structuredClone(discovery);
}
