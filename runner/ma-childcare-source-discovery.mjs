import discovery from "../config/source-discoveries/ma-childcare-2026-10-07.json" with { type: "json" };
export function readMaChildcareSourceDiscovery() {
  if (
    discovery.state !== "MA" ||
    discovery.decision !==
      "official-current-and-history-downloads-identified-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Massachusetts childcare source discovery rejected.");
  return structuredClone(discovery);
}
