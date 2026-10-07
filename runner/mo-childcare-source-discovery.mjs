import discovery from "../config/source-discoveries/mo-childcare-2026-10-07.json" with { type: "json" };
export function readMoChildcareSourceDiscovery() {
  if (
    discovery.state !== "MO" ||
    discovery.decision !==
      "official-dated-licensed-and-exempt-provider-listing-identified-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Missouri childcare source discovery rejected.");
  return structuredClone(discovery);
}
