import discovery from "../config/source-discoveries/sd-childcare-2026-10-07.json" with { type: "json" };

export function readSdChildcareSourceDiscovery() {
  if (
    discovery.state !== "SD" ||
    discovery.decision !==
      "official-mixed-cohort-provider-search-identified-bulk-contract-unverified" ||
    discovery.scope.voluntary_registration_denominator_limit !== true ||
    discovery.scope.home_provider_privacy_review_required !== true ||
    discovery.access.supported_bulk_export_verified !== false ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.portal_automation_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("South Dakota childcare source discovery rejected.");
  return structuredClone(discovery);
}
