import discovery from "../config/source-discoveries/oh-childcare-2026-10-07.json" with { type: "json" };
export function readOhChildcareSourceDiscovery() {
  if (
    discovery.state !== "OH" ||
    discovery.decision !==
      "official-daily-email-gated-csv-export-identified-acquisition-disabled" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.manual_email_access_code_required !== true ||
    discovery.access.download_limit_per_email_per_day !== 5 ||
    discovery.access.download_limit_per_email_per_month !== 10 ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Ohio childcare source discovery rejected.");
  return structuredClone(discovery);
}
