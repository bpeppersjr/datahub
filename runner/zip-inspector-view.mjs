/** Exact ZIP5 factual detail joining verified selected coverage and registry evidence. */
export function createZipInspectorView({ businessCoverageViews, businessMap, zipQualityView, pharmacyCoverage = null, snapRetailerCoverage = null }) {
  return async function zipInspectorView({ zip, categoryId = "all" } = {}) {
    if (!/^\d{5}$/.test(zip ?? "")) throw Object.assign(new Error("ZIP inspection requires exactly five digits."), { statusCode: 400 });
    const catalog = await businessMap.getCatalog();
    if (!catalog?.available) throw new Error("Selected ZIP evidence is unavailable.");
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(categoryId)) throw Object.assign(new Error("Invalid business category."), { statusCode: 400 });
    const categories = catalog.categories ?? [];
    const category = categories.find((item) => item.id === categoryId);
    if (!category) throw Object.assign(new Error("Unsupported business category."), { statusCode: 400 });
    const categorySourceIds = categoryId === "all"
      ? new Set(categories.filter((item) => item.id !== "all").flatMap((item) => item.source_ids ?? []))
      : new Set(category.source_ids ?? []);
    const [quality, coverage, pharmacyEvidence, snapRetailerEvidence] = await Promise.all([
      zipQualityView({ zip }),
      businessCoverageViews.listDimension("zips", { query: zip, offset: 0, limit: 100 }),
      pharmacyCoverage ? pharmacyCoverage({ zip }) : null,
      snapRetailerCoverage ? snapRetailerCoverage({ zip }) : null,
    ]);
    if (!coverage?.available || !quality?.bindings) throw new Error("Selected ZIP evidence is unavailable.");
    if (coverage.release_id !== catalog.coverage_release_id) throw new Error("ZIP coverage release changed during inspection.");
    if (!catalog.registry_release_id || quality.bindings.release_id !== catalog.registry_release_id
      || quality.bindings.manifest_sha256 !== catalog.registry_manifest_sha256 || quality.found && quality.zip5 !== zip) {
      throw new Error("ZIP-quality registry release does not match the selected coverage lineage.");
    }
    const rows = coverage.records.filter((row) => row.zip_code === zip);
    if (rows.length > 1) throw new Error("Selected coverage contains duplicate ZIP5 rows.");
    const selected = rows[0] ?? null;
    const qualityRow = quality.found ? quality : null;
    const categoryContributions = (qualityRow?.positive_source_contributions ?? []).filter((item) => categorySourceIds.has(item.source_id));
    if (selected && qualityRow && selected.coverage_status !== quality.registry_coverage_status) {
      throw new Error("ZIP registry coverage semantics differ between selected releases.");
    }
    const employer = selected?.employer_establishments ?? null;
    const numerator = selected?.physical_site_count ?? null;
    if (pharmacyEvidence !== null && (typeof pharmacyEvidence !== "object" || Array.isArray(pharmacyEvidence))) {
      throw new Error("Pharmacy ZIP evidence loader returned an invalid aggregate.");
    }
    if (pharmacyEvidence?.zip_code !== undefined && pharmacyEvidence.zip_code !== zip) {
      throw new Error("Pharmacy ZIP evidence does not match the requested ZIP5.");
    }
    if (snapRetailerEvidence !== null && (typeof snapRetailerEvidence !== "object" || Array.isArray(snapRetailerEvidence))) {
      throw new Error("SNAP retailer ZIP evidence loader returned an invalid aggregate.");
    }
    if (snapRetailerEvidence !== null && snapRetailerEvidence.zip_code !== zip) {
      throw new Error("SNAP retailer ZIP evidence does not match the requested ZIP5.");
    }
    return {
      schema_version: "1.0.0",
      zip5: zip,
      evidence_status: selected || qualityRow ? "selected-evidence-present" : "absent-from-selected-evidence",
      coverage_status: selected?.coverage_status ?? null,
      classification: qualityRow?.classification ?? null,
      bindings: {
        coverage_release_id: catalog.coverage_release_id,
        registry_release_id: catalog.registry_release_id,
        registry_pointer_sha256: quality.bindings.pointer_sha256,
        registry_manifest_sha256: quality.bindings.manifest_sha256,
        registry_zip_artifact_sha256: quality.bindings.zip_artifact_sha256,
        zip_quality_audit_id: quality.bindings.audit_id,
        geography_release_id: catalog.geography_release_id,
        zcta_source_release_id: qualityRow?.governed_zcta_membership?.source_release_id ?? null,
      },
      governed_zcta: qualityRow?.governed_zcta_membership ?? { status: "not-in-denominator", geo_id: null, geoid: null, source_release_id: null },
      selected_coverage_geography: selected ? {
        zcta_status: selected.zcta_status,
        zcta_geoid: selected.zcta_geoid,
        spatial_zip_polygon_membership_status: selected.spatial_zip_polygon_membership_status,
        material_county_count: selected.material_county_count,
        county_assignment: selected.material_county_count === 1 ? "one-material-intersection" : "not-uniquely-assigned",
      } : null,
      zip_quality: qualityRow ? {
        postal_fields: qualityRow.postal_fields,
        split_postal_contract: qualityRow.split_postal_contract,
        usps_operational_evidence: qualityRow.usps_operational_evidence,
        unresolved_proof_gap_codes: qualityRow.limitations,
      } : { status: "not-present-in-selected-registry-zip-evidence", usps_operational_status: "not-asserted" },
      counts: selected ? {
        physical_sites: selected.physical_site_count,
        establishments: selected.establishment_count,
        organization_primary_locations: selected.organization_primary_location_count,
        employer_establishments: selected.employer_establishments,
        employer_baseline_status: selected.employer_baseline_status,
      } : null,
      contributions: qualityRow?.positive_source_contributions ?? [],
      category_evidence: {
        category_id: categoryId,
        category_label: category.label,
        status: categoryContributions.length ? "positive-source-contribution" : "no-selected-positive-evidence",
        positive_source_contributions: categoryContributions,
        completeness_percent: null,
        bindings: {
          coverage_release_id: catalog.coverage_release_id,
          registry_release_id: catalog.registry_release_id,
          registry_manifest_sha256: catalog.registry_manifest_sha256,
          zip_quality_audit_id: quality.bindings.audit_id,
        },
        semantics: "Positive source contributions for the selected map category only. No matching contribution means no selected positive evidence, not a measured zero, missing business, or completeness result.",
      },
      pharmacy_evidence: pharmacyEvidence,
      snap_retailer_evidence: snapRetailerEvidence,
      coverage_gap_codes: selected?.coverage_gap_codes ?? qualityRow?.limitations ?? [],
      employer_alignment: {
        numerator: numerator,
        denominator: employer,
        percent: numerator !== null && employer !== null && employer > 0 ? numerator / employer * 100 : null,
        basis: "physical-site evidence divided by direct ZIP Business Patterns employer establishments; null when either value is unavailable or denominator is zero",
      },
      denominator_semantics: "The selected coverage ZIP dimension is the governed ZIP evidence view; Census ZCTA polygon membership is independently reported. An outside-denominator ZIP has no inferred state or polygon.",
      limitations: [
        "ZIP is a source postal value and is not proof of current USPS operation, delivery, a physical pharmacy, or a complete business universe.",
        "Source contributions are positive selected registry evidence only; an absent row is not an invalid-USPS finding.",
      ],
    };
  };
}
