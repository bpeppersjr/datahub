import discovery from "../config/source-discoveries/md-childcare-2026-10-07.json" with { type: "json" };
export function readMdChildcareSourceDiscovery() {
  if (
    discovery.state !== "MD" ||
    discovery.decision !==
      "official-open-provider-search-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Maryland childcare source discovery rejected.");
  return structuredClone(discovery);
}
