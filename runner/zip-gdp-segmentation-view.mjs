import { readZctaGdpExecutionReadiness } from "./zcta-gdp-execution-readiness-reader.mjs";
import { readZipIndustryDemographicCrossView } from "./zip-industry-demographic-cross-view.mjs";

const fail = (message = "ZIP GDP segmentation view is unavailable or incompatible.") => {
  throw Object.assign(Error(message), { statusCode: 503 });
};

const DIMENSIONS = Object.freeze(["race", "ancestry_lineage", "sex", "age"]);
const SHA256 = /^[a-f0-9]{64}$/;
const INDUSTRY_RELEASE = /^national-exact-zip-industry-evidence-matrix-([a-f0-9]{64})$/;
const TEMPORAL_QUALIFICATION_RELEASE="exact-zip-industry-temporal-qualification-d4c84e6c4665b66c9629d942764ab26904f8571e17c2c5a6cca56b89bfdaf4ee";
const TEMPORAL_QUALIFICATION_MANIFEST="c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409";

function validCurrentReadiness(view, zcta) {
  if (view?.schema_version !== "zcta-gdp-execution-readiness-view@1.0.0" || view.zcta !== zcta
      || !SHA256.test(view.provenance?.manifest_sha256 ?? "") || !SHA256.test(view.provenance?.artifact_sha256 ?? "")
      || typeof view.provenance?.release_id !== "string" || !view.provenance.release_id.startsWith("zcta-gdp-execution-readiness-")
      || view.claims?.model_approved !== false || view.claims?.output_authorized !== false || view.claims?.numeric_gdp !== false
      || view.claims?.industry_gdp !== false || view.claims?.official_usps_zip !== false) return false;
  if (view.available === false) return view.status === "not-found" && view.readiness === null;
  const row = view.readiness;
  if (view.available !== true || view.status !== "found" || row?.zcta !== zcta || row.decision_status !== "hold"
      || !["feasible-on-approval", "withheld"].includes(row.execution_status)
      || row.total_model?.approval_required !== true || row.total_model?.output_authorized !== false || row.total_model?.numeric_output !== false
      || row.industry_readiness?.status !== "unavailable" || row.industry_readiness?.numeric_output_authorized !== false
      || !Array.isArray(row.withhold_reasons) || row.withhold_reasons.some((reason) => typeof reason !== "string" || !reason)
      || !Number.isSafeInteger(row.material_relationship_count) || row.material_relationship_count < 0
      || !Array.isArray(row.county_geoids) || row.county_geoids.some((geoid) => !/^\d{5}$/.test(geoid))) return false;
  return row.execution_status === "feasible-on-approval" ? row.withhold_reasons.length === 0 : row.withhold_reasons.length > 0;
}

function withheldEstimate(reason) {
  return {
    status: "withheld",
    estimate_current_dollars: null,
    display_value: null,
    lower_method_sensitivity_dollars: null,
    upper_method_sensitivity_dollars: null,
    reason,
  };
}

function projectedIndustryValue(cell) {
  if (!cell || typeof cell !== "object") fail();
  if (cell.status === "positive" && Number.isSafeInteger(cell.count) && cell.count > 0) {
    return cell.count;
  }
  if (cell.status === "measured-zero" && cell.count === 0) return 0;
  if (cell.status === "outside-source-denominator" && cell.count === null) return null;
  if (cell.status === "absent-from-retained-source-rows" && cell.count === null) return null;
  fail();
}

function validatedIndustryEvidence(cross, zip5) {
  const evidence = cross?.industry_evidence;
  const releaseMatch = INDUSTRY_RELEASE.exec(evidence?.release_id ?? "");
  if (evidence?.schema_version !== "national-exact-zip-industry-evidence-matrix@1.9.0"
      || evidence.status !== "present"
      || !SHA256.test(evidence.manifest_sha256 ?? "")
      || !releaseMatch
      || !evidence.claims || evidence.claims.nonadditive !== true
      || evidence.claims.current_operations_verified !== false
      || evidence.claims.all_business_completeness_percent !== null
      || evidence.claims.physical_site_inference_permitted !== false
      || evidence.claims.production_enrollment !== false) fail();
  const temporal=evidence.temporal_qualification;
  if(temporal?.schema_version!=='exact-zip-industry-temporal-qualification-view@1.1.0'||temporal.zip5!==zip5||temporal.assessment_as_of!=='2026-10-02T16:30:00.000Z'||temporal.claims?.current_operations_verified!==false||temporal.claims?.acquisition_performed!==false||temporal.claims?.network_requests!==0||temporal.claims?.current_pointer_written!==false||temporal.claims?.production_enrollment!==false||temporal.rows?.length!==40||temporal.provenance?.release_id!==TEMPORAL_QUALIFICATION_RELEASE||temporal.provenance?.manifest_sha256!==TEMPORAL_QUALIFICATION_MANIFEST||!SHA256.test(temporal.provenance.artifact_sha256??''))fail();
  const row = evidence.row;
  if (row === null) return { evidence, cells: {} };
  if (row?.schema_version !== "national-exact-zip-industry-evidence-matrix-row@1.9.0"
      || row.zip5 !== zip5 || row.zip4 !== null || !row.cells
      || typeof row.cells !== "object" || Array.isArray(row.cells)) fail();
  for (const cell of Object.values(row.cells)) projectedIndustryValue(cell);
  return { evidence, cells: row.cells };
}

/**
 * Compose the app's ZIP-facing GDP contract without creating a GDP estimate.
 * ZIP5 is an operator lookup key; the modeled geography is a same-code Census
 * ZCTA. Numeric values remain withheld while the retained specification is on
 * HOLD or when any eligibility input is incomplete.
 */
export async function readZipGdpSegmentationView({
  zip5,
  root,
  signal,
  readGdpReadiness = readZctaGdpExecutionReadiness,
  readCrossView = readZipIndustryDemographicCrossView,
} = {}) {
  if (!/^\d{5}$/.test(zip5 ?? "")) {
    throw Object.assign(Error("ZIP5 must be exactly five digits."), { statusCode: 400 });
  }
  signal?.throwIfAborted();
  const [gdp, cross] = await Promise.all([
    readGdpReadiness({ zcta: zip5, root, signal }),
    readCrossView({ zip5, root, signal }),
  ]);
  signal?.throwIfAborted();
  if (!validCurrentReadiness(gdp, zip5)) fail();
  if (cross?.schema_version !== "zip-industry-demographic-cross-view@1.0.0" || cross.zip5 !== zip5) fail();
  const { evidence: industryEvidence, cells: industryCells } = validatedIndustryEvidence(cross, zip5);

  const sameCodeZcta = cross.zcta_geoid === zip5;
  const industries = Object.keys(industryCells).sort().map((industryId) => ({
    industry_id: industryId,
    source_evidence: industryCells[industryId],
    source_measure_value: projectedIndustryValue(industryCells[industryId]),
    temporal_qualification: industryEvidence.temporal_qualification.rows.find(row=>row.dimension_id===industryId)??null,
    gdp: withheldEstimate("industry-allocation-method-not-approved"),
  }));
  if(industries.some(row=>!row.temporal_qualification||row.temporal_qualification.current_operations_verified!==false))fail();
  const availability = cross.demographic_context?.availability ?? {};
  const demographics = DIMENSIONS.map((dimension) => ({
    dimension,
    source_input_available: availability[dimension] === true,
    role: "context-only-not-allocation-weight",
    groups: [],
    gdp: withheldEstimate("demographic-gdp-method-not-specified-or-approved"),
  }));
  const feasibleOnApproval = sameCodeZcta && gdp.available === true && gdp.readiness.execution_status === "feasible-on-approval";

  return {
    schema_version: "zip-gdp-segmentation-view@1.0.0",
    lookup: { zip5, zip4: null },
    modeled_geography: {
      type: "2020-census-zcta",
      geoid: sameCodeZcta ? zip5 : null,
      official_usps_zip: false,
      relationship: sameCodeZcta ? "same-code-only" : "not-established",
    },
    total_gdp: withheldEstimate(
      feasibleOnApproval ? "model-approval-and-output-authorization-required" : "zcta-input-eligibility-incomplete",
    ),
    industry_breakdown: industries,
    demographic_breakdown: demographics,
    methodology: {
      estimate_type: "modeled-not-observed",
      publisher_measure: "BEA county current-dollar GDP",
      proposed_allocation: "zbp-payroll-area-hybrid",
      sensitivity_methods: ["polygon-area", "zbp-establishment-area-fallback"],
      confidence: {
        kind: "method-sensitivity-not-statistical-confidence-interval",
        score: null,
        disclosure: "No statistical confidence percentage is asserted. Future bounds may describe proxy-method spread only.",
      },
      precision: {
        stored_unit: "integer-current-dollars-after-final-allocation",
        display_rule: "show-at-most-three-significant-digits-and-label-estimate",
        exactness_claimed: false,
      },
    },
    provenance: {
      gdp_readiness: { ...gdp.provenance },
      industry_evidence: {
        release_id: industryEvidence.release_id,
        manifest_sha256: industryEvidence.manifest_sha256,
      },
      industry_temporal_qualification: { ...industryEvidence.temporal_qualification.provenance },
      demographic_context: cross.demographic_context?.provenance ?? null,
    },
    claims: {
      model_approved: false,
      output_authorized: false,
      numeric_gdp_emitted: false,
      industry_gdp_emitted: false,
      demographic_gdp_emitted: false,
      observed_zip_gdp: false,
      official_usps_zip_gdp: false,
      demographic_attributes_are_allocation_weights: false,
      network_requests: 0,
      acquisition_performed: false,
    },
  };
}

