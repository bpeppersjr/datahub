import discovery from "../config/source-discoveries/ri-childcare-2026-10-07.json" with { type: "json" };
export function readRiChildcareSourceDiscovery() {
  if (
    discovery.state !== "RI" ||
    discovery.decision !==
      "official-rises-statewide-licensed-program-search-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Rhode Island childcare source discovery rejected.");
  return structuredClone(discovery);
}
