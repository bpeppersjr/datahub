import discovery from "../config/source-discoveries/sc-childcare-2026-10-07.json" with { type: "json" };

export function readScChildcareSourceDiscovery() {
  if (
    discovery.state !== "SC" ||
    discovery.decision !==
      "official-manual-excel-export-identified-automated-bulk-contract-unverified" ||
    discovery.scope.home_provider_privacy_review_required !== true ||
    discovery.access.manual_ui_export_identified !== true ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("South Carolina childcare source discovery rejected.");
  return structuredClone(discovery);
}
