import discovery from "../config/source-discoveries/nv-childcare-2026-10-07.json" with { type: "json" };
export function readNvChildcareSourceDiscovery() {
  if (
    discovery.state !== "NV" ||
    discovery.decision !==
      "official-licensure-search-identified-jurisdiction-boundary-unresolved" ||
    discovery.scope.washoe_county_boundary_resolved !== false ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Nevada childcare source discovery rejected.");
  return structuredClone(discovery);
}
