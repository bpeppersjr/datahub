// Synthetic consumer fixture, not a publisher record or a verified source release.
export function childcareReportingRow(zipCode = "02536") {
  const sourceRelease = `ma-childcare-${"a".repeat(64)}`;
  return {
    schema_version: "1.0.0", site_entity_id: `site:ma_childcare_${"b".repeat(32)}`,
    establishment_entity_id: `establishment:ma_childcare_${"b".repeat(32)}`,
    zip_code: zipCode,
    address: { street: "10 Main Street", city: "Falmouth", state: "MA", country: "US", zip_code: zipCode, postal_code: zipCode, zip4: "5023" },
    location: { latitude: 41.57, longitude: -70.6 },
    source: { source_id: "ma-licensed-center-based-childcare", source_release_id: sourceRelease,
      source_record_id: `${sourceRelease}:object:1`, ingest_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      transformation_version: "ma-childcare-normalization@1.0.0 -> ma-childcare-registry-adapter@1.0.0", policy_id: "massgis-eec-childcare-local-review" },
    observed_at: "2026-09-07T12:00:00.000Z", identity_matching_eligible: false,
    export_policy: "local-review-only", category: "childcare", names: [{ raw: "Fixture Childcare" }],
    source_status: { active_business_verified: false, status_source: "Current", status_interpretation: "source-status-preserved", licensed_capacity: null },
    evidence: { manifest_sha256: "c".repeat(64), policy_profile: "massgis-eec-childcare-local-review@1.0.0", assertions_sha256: "d".repeat(64) },
  };
}
