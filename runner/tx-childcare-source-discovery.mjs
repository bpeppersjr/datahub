import discovery from "../config/source-discoveries/tx-childcare-2026-10-07.json" with { type: "json" };

export function readTxChildcareSourceDiscovery() {
  if (
    discovery.state !== "TX" ||
    discovery.decision !==
      "official-regulated-provider-search-identified-bulk-contract-unverified" ||
    discovery.scope.residential_provider_privacy_review_required !== true ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Texas childcare source discovery rejected.");
  return structuredClone(discovery);
}
