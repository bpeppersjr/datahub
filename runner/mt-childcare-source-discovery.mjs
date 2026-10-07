import discovery from "../config/source-discoveries/mt-childcare-2026-10-07.json" with { type: "json" };
export function readMtChildcareSourceDiscovery() {
  if (
    discovery.state !== "MT" ||
    discovery.decision !==
      "official-licensed-provider-dashboard-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Montana childcare source discovery rejected.");
  return structuredClone(discovery);
}
