import { readZctaGdpExecutionReadiness } from "./zcta-gdp-execution-readiness-reader.mjs";
import { readZipIndustryDemographicCrossView } from "./zip-industry-demographic-cross-view.mjs";

const fail = (message = "ZIP GDP segmentation view is unavailable or incompatible.") => {
  throw Object.assign(Error(message), { statusCode: 503 });
};

const DIMENSIONS = Object.freeze(["race", "ancestry_lineage", "sex", "age"]);

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
  if (gdp?.schema_version !== "zcta-gdp-execution-readiness-view@1.0.0" || gdp.zcta !== zip5) fail();
  if (cross?.schema_version !== "zip-industry-demographic-cross-view@1.0.0" || cross.zip5 !== zip5) fail();
  if (gdp.claims?.model_approved !== false || gdp.claims?.output_authorized !== false || gdp.claims?.numeric_gdp !== false) fail();

  const sameCodeZcta = cross.zcta_geoid === zip5;
  const industryCells = cross.industry_evidence?.row?.cells ?? {};
  const industries = Object.keys(industryCells).sort().map((industryId) => ({
    industry_id: industryId,
    source_evidence: industryCells[industryId],
    gdp: withheldEstimate("industry-allocation-method-not-approved"),
  }));
  const availability = cross.demographic_context?.availability ?? {};
  const demographics = DIMENSIONS.map((dimension) => ({
    dimension,
    source_input_available: availability[dimension] === true,
    role: "context-only-not-allocation-weight",
    groups: [],
    gdp: withheldEstimate("demographic-gdp-method-not-specified-or-approved"),
  }));
  const eligible = sameCodeZcta && gdp.available === true && gdp.readiness?.status === "eligible";

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
      eligible ? "model-approval-and-output-authorization-required" : "zcta-input-eligibility-incomplete",
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
      industry_evidence: cross.industry_evidence?.provenance ?? cross.industry_evidence?.release ?? null,
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

