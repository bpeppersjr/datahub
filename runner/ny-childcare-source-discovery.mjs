import discovery from "../config/source-discoveries/ny-childcare-2026-10-07.json" with { type: "json" };
export function readNyChildcareSourceDiscovery() {
  if (
    discovery.state !== "NY" ||
    discovery.decision !==
      "official-daily-program-api-identified-nyc-center-boundary-unresolved" ||
    discovery.scope.nyc_center_based_programs_included !== false ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.temporal.publisher_cadence !== "daily" ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("New York childcare source discovery rejected.");
  return structuredClone(discovery);
}
