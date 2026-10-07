import discovery from "../config/source-discoveries/me-childcare-2026-10-07.json" with { type: "json" };
export function readMeChildcareSourceDiscovery() {
  if (
    discovery.state !== "ME" ||
    discovery.decision !==
      "official-regulated-provider-search-and-monthly-list-path-identified-acquisition-disabled" ||
    discovery.access.monthly_list_contact_path_available !== true ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Maine childcare source discovery rejected.");
  return structuredClone(discovery);
}
