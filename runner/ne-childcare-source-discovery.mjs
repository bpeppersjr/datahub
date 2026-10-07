import discovery from "../config/source-discoveries/ne-childcare-2026-10-07.json" with { type: "json" };
export function readNeChildcareSourceDiscovery() {
  if (
    discovery.state !== "NE" ||
    discovery.decision !==
      "official-weekly-zip-organized-roster-identified-acquisition-disabled" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.direct_download_endpoint_verified !== true ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Nebraska childcare source discovery rejected.");
  return structuredClone(discovery);
}
