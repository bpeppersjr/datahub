import discovery from "../config/source-discoveries/va-childcare-2026-10-07.json" with { type: "json" };

export function readVaChildcareSourceDiscovery() {
  if (
    discovery.state !== "VA" ||
    discovery.decision !==
      "official-annual-quality-workbooks-identified-use-permission-unresolved" ||
    discovery.scope.family_home_and_contact_privacy_review_required !== true ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Virginia childcare source discovery rejected.");
  return structuredClone(discovery);
}
