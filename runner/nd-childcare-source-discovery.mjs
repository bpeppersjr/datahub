import discovery from "../config/source-discoveries/nd-childcare-2026-10-07.json" with { type: "json" };
export function readNdChildcareSourceDiscovery() {
  if (
    discovery.state !== "ND" ||
    discovery.decision !==
      "official-licensed-and-self-declared-search-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("North Dakota childcare source discovery rejected.");
  return structuredClone(discovery);
}
