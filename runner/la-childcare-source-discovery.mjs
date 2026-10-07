import discovery from "../config/source-discoveries/la-childcare-2026-10-07.json" with { type: "json" };
export function readLaChildcareSourceDiscovery() {
  if (
    discovery.state !== "LA" ||
    discovery.decision !==
      "official-statewide-center-finder-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Louisiana childcare source discovery rejected.");
  return structuredClone(discovery);
}
