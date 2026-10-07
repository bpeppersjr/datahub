import discovery from "../config/source-discoveries/ks-childcare-2026-10-07.json" with { type: "json" };
export function readKsChildcareSourceDiscovery() {
  if (
    discovery.state !== "KS" ||
    discovery.decision !==
      "official-search-and-data-request-path-identified-acquisition-disabled" ||
    discovery.access.data_request_path_available !== true ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Kansas childcare source discovery rejected.");
  return structuredClone(discovery);
}
