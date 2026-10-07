import discovery from "../config/source-discoveries/nh-childcare-2026-10-07.json" with { type: "json" };
export function readNhChildcareSourceDiscovery() {
  if (
    discovery.state !== "NH" ||
    discovery.decision !==
      "official-child-care-search-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("New Hampshire childcare source discovery rejected.");
  return structuredClone(discovery);
}
