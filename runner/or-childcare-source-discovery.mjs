import discovery from "../config/source-discoveries/or-childcare-2026-10-07.json" with { type: "json" };
export function readOrChildcareSourceDiscovery() {
  if (
    discovery.state !== "OR" ||
    discovery.decision !==
      "official-daily-child-care-safety-portal-identified-bulk-contract-unverified" ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.temporal.publisher_cadence !==
      "daily-portal-quarterly-aggregate-dashboard" ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Oregon childcare source discovery rejected.");
  return structuredClone(discovery);
}
