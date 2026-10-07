import discovery from "../config/source-discoveries/pa-childcare-2026-10-07.json" with { type: "json" };
export function readPaChildcareSourceDiscovery() {
  if (
    discovery.state !== "PA" ||
    discovery.decision !==
      "official-monthly-open-certified-program-odata-identified-acquisition-disabled" ||
    discovery.scope.regulated_childcare_predicate_required !== true ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.access.public_domain_verified !== true ||
    discovery.temporal.snapshot_date !== "2026-08-31" ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Pennsylvania childcare source discovery rejected.");
  return structuredClone(discovery);
}
