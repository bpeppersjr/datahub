import discovery from "../config/source-discoveries/nm-childcare-2026-10-07.json" with { type: "json" };
export function readNmChildcareSourceDiscovery() {
  if (
    discovery.state !== "NM" ||
    discovery.decision !==
      "official-provider-database-backed-finder-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("New Mexico childcare source discovery rejected.");
  return structuredClone(discovery);
}
