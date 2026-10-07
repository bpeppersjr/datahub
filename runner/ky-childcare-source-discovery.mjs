import discovery from "../config/source-discoveries/ky-childcare-2026-10-07.json" with { type: "json" };
export function readKyChildcareSourceDiscovery() {
  if (
    discovery.state !== "KY" ||
    discovery.decision !==
      "official-dynamic-download-control-identified-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== false ||
    discovery.scope.type_i_nonhome_predicate_required !== true ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Kentucky childcare source discovery rejected.");
  return structuredClone(discovery);
}
