import discovery from "../config/source-discoveries/ct-childcare-2026-10-07.json" with { type: "json" };
export function readCtChildcareSourceDiscovery() {
  if (discovery.state !== "CT" || discovery.industry !== "childcare" || discovery.decision !== "official-active-childcare-rosters-identified-export-contract-unverified" || discovery.official_sources.length !== 4 || discovery.access.supported_bulk_export_verified !== true || discovery.access.supported_api_verified !== false || discovery.access.portal_automation_authorized !== false || discovery.access.record_acquisition_authorized !== false || discovery.scope.residential_provider_privacy_review_required !== true || discovery.claims.provider_rows_acquired !== 0 || discovery.claims.production_admission !== false) throw Error("Connecticut childcare source discovery rejected.");
  return structuredClone(discovery);
}
