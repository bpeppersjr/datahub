import discovery from "../config/source-discoveries/ms-childcare-2026-10-07.json" with { type: "json" };
export function readMsChildcareSourceDiscovery() {
  if (
    discovery.state !== "MS" ||
    discovery.decision !==
      "official-licensed-facility-search-and-records-request-path-identified-acquisition-disabled" ||
    discovery.access.public_records_request_path_available !== true ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Mississippi childcare source discovery rejected.");
  return structuredClone(discovery);
}
