import discovery from "../config/source-discoveries/co-childcare-2026-10-07.json" with { type: "json" };
export function readCoChildcareSourceDiscovery() {
  if (discovery.state !== "CO" || discovery.industry !== "childcare" || discovery.decision !== "official-monthly-socrata-api-metadata-validated-acquisition-disabled" || discovery.official_sources.length !== 4 || discovery.access.supported_bulk_export_verified !== true || discovery.access.supported_api_verified !== true || discovery.access.portal_automation_authorized !== false || discovery.access.record_acquisition_authorized !== false || discovery.scope.residential_provider_privacy_review_required !== true || discovery.claims.provider_rows_acquired !== 0 || discovery.claims.production_admission !== false) throw Error("Colorado childcare source discovery rejected.");
  return structuredClone(discovery);
}
