import discovery from "../config/source-discoveries/mn-childcare-2026-10-07.json" with { type: "json" };
export function readMnChildcareSourceDiscovery() {
  if (
    discovery.state !== "MN" ||
    discovery.decision !==
      "official-daily-licensing-lookup-csv-export-identified-acquisition-disabled" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.csv_export_control_verified !== true ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Minnesota childcare source discovery rejected.");
  return structuredClone(discovery);
}
