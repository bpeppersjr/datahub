import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import {
  echoReplay as r,
  STATE_DC_CODES,
} from "./national-epa-echo-naics-zip-industry-evidence.mjs";
import { readExactZipIndustrySummaryV33 } from "./exact-zip-industry-summary-v3-3.mjs";
import { readExactZipIndustrySummaryV34 } from "./exact-zip-industry-summary-v3-4.mjs";
import { projectOperationalIndustryEvidence } from "./operational-industry-evidence-summary.mjs";
import { verifyBusinessEntityGeographyRelationship } from "./business-entity-geography-relationship.mjs";
import { readBusinessEntitySourcePolicyProvenance } from "./business-entity-source-policy-provenance.mjs";
import { verifyNationalBusinessTemporalLifecycleReconciliationV11 } from "./national-business-temporal-lifecycle-reconciliation-v1-1.mjs";

export const DATASET = "national-goal-evidence-federation";
export const VERSION = `${DATASET}@1.0.0`;
export const CLAIMS = Object.freeze({
  all_business_denominator: null,
  business_completeness: null,
  industry_completeness: null,
  unique_business_count: null,
  current_operating_business_count: null,
  current_operation_verified: false,
  cross_industry_counts_additive: false,
  epa_memberships_additive_to_business_totals: false,
  usps_validity_verified: false,
  zcta_membership_is_usps_validity: false,
  zip4_joined: false,
  business_geometry_required: false,
  missing_population_blocks_map: false,
  unresolved_geography_blocks_map: false,
  raw_business_rows_exported: false,
  network_requests: 0,
  acquisition_performed: false,
  current_pointer_written: false,
  production_enrollment: false,
});
const INPUT_NAMES = [
  "goal",
  "matrix",
  "disposition",
  "epa",
  "geography",
  "cohort",
  "non_zcta",
  "crosswalk",
  "lifecycle",
  "entity_geography_registration",
  "entity_geography",
  "source_policy_registration",
  "source_policy_manifest",
  "temporal_lifecycle_reconciliation_registration",
  "state_registration_license_registration",
  "state_registration_license_manifest",
  "irs_eo_supplemental_registration",
  "irs_eo_supplemental_manifest",
  "lifecycle_industry_zip_registration",
  "lifecycle_industry_zip_manifest",
  "lifecycle_industry_jurisdiction_registration",
  "lifecycle_industry_jurisdiction_manifest",
  "broad_gap_authorization_manifest",
  "census_zbp_zip_profile_registration",
  "census_zbp_zip_profile_manifest",
  "entity_resolution_registration",
  "entity_resolution_pointer",
  "entity_resolution_manifest",
  "entity_resolution_benchmark_registration",
  "entity_resolution_benchmark_pointer",
  "entity_resolution_benchmark_manifest",
  "access",
  "industries",
  "operational_crosswalk",
  "summary_implementation",
  "temporal_mapping",
  "ny_retail_food_snapshot_manifest",
];
const CONTRACTS = ["connectors", "schemas", "source-policies"].map(
  (part) =>
    `config/${part}/${DATASET}${part === "schemas" ? ".schema" : ""}.json`,
);
const count = (n) => Number.isSafeInteger(n) && n >= 0;
const EVIDENCE_BY_RAW = {
  positive: "evidence-present",
  "measured-positive": "evidence-present",
  "retained-linkage-evidence": "evidence-present",
  "measured-zero": "measured-zero",
  "not-published-for-zip": "source-did-not-publish-for-zip",
  "outside-zbp-zcta-evidence-union": "outside-source-evidence-union",
  "outside-source-denominator": "outside-source-denominator",
  "absent-from-retained-source-rows": "absent-from-retained-source-rows",
  unavailable: "unavailable",
  "no-resolution-decision": "unavailable",
};
const ACCESS_STATUSES = new Set([
  "direct-state-publisher",
  "local-publisher-substate-evidence",
  "national-dataset-state-evidence",
  "restricted-query-sample-evidence",
  "unsupported-evidence-not-measured",
  "unsupported-missing",
]);
const percent = (n, d) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : null);
const sorted = (values) => [...values].sort();
const check = (value, message) => {
  if (!value) throw Error(`Goal federation rejected: ${message}.`);
};
const json = (root, p, max, signal) =>
  r
    .secureBuffer(root, r.contained(root, p), max, signal)
    .then((proof) => ({
      ...proof,
      value: JSON.parse(proof.raw),
      filename: r.contained(root, p),
    }));

async function load(root, configPath, signal) {
  const configRead = await json(
    root,
    configPath ?? `config/${DATASET}.json`,
    100_000,
    signal,
  );
  let config = configRead.value;
  if (config.schema_version === `${DATASET}-successor-config@1.0.0`) {
    check(
      r.exact(config, ["schema_version", "base", "overrides"]) &&
        r.exact(config.base, ["path", "sha256"]) &&
        r.exact(config.overrides, [
          "matrix",
          "disposition",
          "summary_implementation",
          "operational_crosswalk",
        ]),
      "successor overlay config",
    );
    const base = await json(root, config.base.path, 100_000, signal);
    check(
      base.sha256 === config.base.sha256,
      "successor base config hash drift",
    );
    config = {
      schema_version: `${DATASET}-config@1.0.0`,
      inputs: { ...base.value.inputs, ...config.overrides },
    };
  }
  check(
    r.exact(config, ["schema_version", "inputs"]) &&
      config.schema_version === `${DATASET}-config@1.0.0` &&
      r.exact(config.inputs, INPUT_NAMES),
    "closed config",
  );
  const inputs = {};
  for (const name of INPUT_NAMES) {
    const pin = config.inputs[name],
      manifest = Object.hasOwn(pin, "release_id");
    check(
      r.exact(
        pin,
        manifest
          ? ["path", "sha256", "release_id", "schema_version"]
          : ["path", "sha256"],
      ) && /^[a-f0-9]{64}$/.test(pin.sha256),
      "pin schema",
    );
    const proof = await r.secureBuffer(
      root,
      r.contained(root, pin.path),
      name === "access"
        ? 10_000_000
        : name === "entity_geography"
          ? 1_000_000
          : 200_000,
      signal,
    );
    check(proof.sha256 === pin.sha256, `${name} hash drift`);
    const value = ["summary_implementation", "temporal_mapping"].includes(name)
      ? null
      : JSON.parse(proof.raw);
    if (manifest)
      check(
        value.release_id === pin.release_id &&
          value.schema_version === pin.schema_version,
        `${name} release identity`,
      );
    inputs[name] = { filename: r.contained(root, pin.path), proof, value };
  }
  if (
    inputs.operational_crosswalk.value.schema_version ===
    "exact-zip-operational-industry-crosswalk-overlay@1.2.0"
  ) {
    const overlay = inputs.operational_crosswalk.value;
    check(
      r.exact(overlay, ["schema_version", "base", "matrix_schema_version"]) &&
        r.exact(overlay.base, ["path", "sha256"]),
      "operational crosswalk overlay",
    );
    const base = await json(root, overlay.base.path, 200_000, signal);
    check(
      base.sha256 === overlay.base.sha256 &&
        base.value.schema_version ===
          "exact-zip-operational-industry-crosswalk@1.1.0",
      "operational crosswalk base",
    );
    inputs.operational_crosswalk.value = {
      ...base.value,
      schema_version: "exact-zip-operational-industry-crosswalk@1.2.0",
      matrix_schema_version: overlay.matrix_schema_version,
    };
  }
  const contractHashes = {};
  for (const p of CONTRACTS)
    contractHashes[p] = (
      await r.secureBuffer(root, r.contained(root, p), 200_000, signal)
    ).sha256;
  const successor =
      config.inputs.summary_implementation.path ===
      "runner/exact-zip-industry-summary-v3-4.mjs",
    version = successor ? "3.4" : "3.3";
  check(
    inputs.goal.value.schema_version ===
      "national-goal-completion-matrix@1.3.0" &&
      inputs.matrix.value.schema_version ===
        `national-exact-zip-industry-evidence-matrix@${version}.0`,
    "required versions",
  );
  check(
    inputs.disposition.value.bindings.matrix.release_id ===
      inputs.matrix.value.release_id &&
      inputs.disposition.value.bindings.matrix.manifest_sha256 ===
        inputs.matrix.proof.sha256,
    "disposition matrix pin",
  );
  check(
    [
      "runner/exact-zip-industry-summary-v3-3.mjs",
      "runner/exact-zip-industry-summary-v3-4.mjs",
    ].includes(config.inputs.summary_implementation.path),
    "summary implementation path",
  );
  const summary = successor
    ? await readExactZipIndustrySummaryV34({ root, signal })
    : await readExactZipIndustrySummaryV33({ root, signal });
  check(
    summary.schema_version ===
      `national-exact-zip-industry-summary-view@${version}.0` &&
      summary.release_id === inputs.matrix.value.release_id &&
      summary.manifest_sha256 === inputs.matrix.proof.sha256 &&
      summary.source_dimensions === 51 &&
      summary.zip5_rows === 48194 &&
      summary.industry_cells === 2457894,
    "summary binding/conservation",
  );
  check(
    summary.dimensions.length === 51 &&
      new Set(summary.dimensions.map((d) => d.id)).size === 51,
    "summary dimensions",
  );
  const temporal = summary.temporal_qualification,
    matrix = inputs.matrix.value;
  check(
    temporal.schema_version ===
      `exact-zip-industry-temporal-summary-projection@${version}.0` &&
      temporal.matrix_release_id === matrix.release_id &&
      temporal.matrix_manifest_sha256 === inputs.matrix.proof.sha256 &&
      temporal.source_dimensions === matrix.summary.dimension_count &&
      /^[a-f0-9]{64}$/.test(temporal.projection_sha256) &&
      [
        temporal.dimension_counts,
        temporal.semantic_dimension_counts,
        temporal.retained_assessment_dimension_counts,
      ].every(
        (tally) =>
          Object.values(tally).every(count) &&
          Object.values(tally).reduce((sum, n) => sum + n, 0) === 51,
      ),
    `${version} temporal projection binding/conservation`,
  );
  const snapshot = inputs.ny_retail_food_snapshot_manifest;
  check(
    snapshot.proof.sha256 ===
      config.inputs.ny_retail_food_snapshot_manifest.sha256 &&
      snapshot.value.release_id ===
        config.inputs.ny_retail_food_snapshot_manifest.release_id &&
      [
        "ny_retail_food_location_profiles",
        "ny_retail_food_license_address_evidence_count",
      ].every((id) => {
        const qualification = summary.dimensions.find(
          (row) => row.id === id,
        )?.temporal_qualification;
        return (
          qualification?.source_release_id ===
            snapshot.value.source_release_id &&
          qualification.source_reference_at ===
            snapshot.value.source_rows_updated_at &&
          qualification.assessment_as_of === snapshot.value.retrieved_at
        );
      }),
    "New York temporal projection source and assessment pin",
  );
  return { root, configRead, config, inputs, contractHashes, summary, version };
}

async function stream(input, name, artifact, signal, consume) {
  await r.streamArtifact(
    input.root,
    path.dirname(input.inputs[name].filename),
    r.declaration(input.inputs[name], artifact),
    signal,
    consume,
  );
}
async function artifact(input, name, artifact, max, signal) {
  return r.jsonArtifact(input.root, input.inputs[name], artifact, max, signal);
}

export function federationGeographyScope(row, overlay) {
  if (row.classification === "explicit-placeholder")
    return "explicit-placeholder";
  if (row.zcta_geoid === null) return "non-zcta-unassigned";
  if (!overlay || overlay.overlay_status !== "complete-within-tolerance")
    return "zcta-overlay-unresolved";
  if (overlay.crosses_state_boundary_materially) return "multi-state-material";
  const fips = overlay.dominant_state_geo_id.slice(-2);
  return `${["60", "66", "69", "72", "78"].includes(fips) ? "territory" : "state"}:${fips}`;
}

async function derive(input, output, signal, hooks, verifyRelationship = true) {
  const { root, inputs, summary } = input;
  const disposition = await artifact(
      input,
      "disposition",
      "state-dispositions.json",
      4_000_000,
      signal,
    ),
    scopes = new Map(disposition.map((row) => [row.scope_id, row]));
  check(
    scopes.size === 60 &&
      disposition.filter((row) => row.scope_id.startsWith("state:")).length ===
        51 &&
      disposition.reduce((n, row) => n + row.zip5_rows, 0) === 48194,
    "closed geography scopes",
  );
  const crosswalk = inputs.operational_crosswalk.value,
    industries = crosswalk.operational_industries;
  check(
    industries.length === 9 &&
      new Set(industries).size === 9 &&
      r.equal(
        sorted(Object.keys(inputs.industries.value.industries)),
        sorted(industries),
      ),
    "industry roster",
  );
  const states = disposition
    .filter((row) => row.scope_id.startsWith("state:"))
    .sort((a, b) => a.postal_abbreviation.localeCompare(b.postal_abbreviation));
  check(
    r.equal(
      sorted(states.map((row) => row.postal_abbreviation)),
      sorted(STATE_DC_CODES),
    ),
    "51 state/DC roster",
  );
  const stateIndustry = states.flatMap((state) =>
    projectOperationalIndustryEvidence({
      crosswalk,
      summary,
      disposition: state,
      state: state.postal_abbreviation,
    }).industries.map((industry) => ({
      schema_version: `${DATASET}-state-industry@1.0.0`,
      state: state.postal_abbreviation,
      scope_id: state.scope_id,
      scope_semantics:
        "dominant Census ZCTA polygon overlay; excludes material cross-state, unresolved and non-ZCTA cohorts",
      zip5_rows: state.zip5_rows,
      ...industry,
    })),
  );
  check(
    stateIndustry.length === 459 &&
      states.reduce((n, row) => n + row.zip5_rows, 0) === 33455,
    "state-industry conservation",
  );
  check(
    r.equal(
      stateIndustry.slice(0, 9).map((row) => row.mapped_dimensions),
      [7, 5, 2, 1, 2, 1, 2, 10, 11],
    ),
    "industry association counts",
  );
  const overlays = new Map(),
    cohort = new Map(),
    nonZcta = new Map(),
    epaZips = new Map();
  await stream(
    input,
    "crosswalk",
    "derived/zcta-overlay-summary.jsonl",
    signal,
    (row) => {
      check(
        /^\d{5}$/.test(row.zcta) && !overlays.has(row.zcta),
        "overlay identity",
      );
      overlays.set(row.zcta, row);
    },
  );
  await stream(input, "cohort", "cohort.jsonl", signal, (row) => {
    check(
      /^\d{5}$/.test(row.zip5) &&
        !cohort.has(row.zip5) &&
        r.CLASSIFICATIONS.includes(row.classification) &&
        row.usps_validity === null,
      "cohort identity/claim",
    );
    cohort.set(row.zip5, {
      zip5: row.zip5,
      classification: row.classification,
      zcta_geoid: row.zcta_geoid,
    });
  });
  check(overlays.size === 33791 && cohort.size === 48194, "cohort/ZCTA count");
  for (const a of inputs.non_zcta.value.artifacts.filter((a) =>
    a.path.endsWith(".jsonl"),
  ))
    await r.streamArtifact(
      root,
      path.dirname(inputs.non_zcta.filename),
      a,
      signal,
      (row) => {
        check(
          cohort.has(row.zip5) &&
            cohort.get(row.zip5).zcta_geoid === null &&
            !nonZcta.has(row.zip5) &&
            row.state_assignment === null,
          "non-ZCTA context identity",
        );
        nonZcta.set(row.zip5, {
          source_reported_code_context: row.source_reported_code_context,
          point_context: row.point_context,
        });
      },
    );
  check(nonZcta.size === 14402, "non-ZCTA context cohort");
  await stream(input, "epa", "zip5-evidence.jsonl.gz", signal, (row) => {
    check(
      cohort.has(row.zip5) && !epaZips.has(row.zip5),
      "EPA cohort identity",
    );
    epaZips.set(row.zip5, {
      source_record_count: row.source_record_count,
      segment_counts: row.segment_counts,
    });
  });
  check(epaZips.size === 48194, "EPA cohort conservation");
  const epaRecordTotal = [...epaZips.values()].reduce(
      (n, row) => n + row.source_record_count,
      0,
    ),
    epaMembershipTotal = [...epaZips.values()].reduce(
      (n, row) =>
        n +
        row.segment_counts.reduce(
          (sum, item) => sum + item.source_record_count,
          0,
        ),
      0,
    );
  check(
    epaRecordTotal === inputs.epa.value.summary.source_record_count &&
      epaMembershipTotal === inputs.epa.value.summary.segment_assignments &&
      inputs.epa.value.claims.unique_business_count === null &&
      inputs.epa.value.claims.business_completeness === null,
    "EPA sidecar conservation/claim boundary",
  );
  const dimensions = summary.dimensions.map((row) => row.id);
  const scopeCounts = Object.fromEntries(
    disposition.map((row) => [row.scope_id, 0]),
  );
  const observed = new Map(
    disposition.map((scope) => [
      scope.scope_id,
      Object.fromEntries(dimensions.map((id) => [id, {}])),
    ]),
  );
  const artifacts = [];
  let zipRows = 0,
    cells = 0;
  for (let prefix = 0; prefix < 100; prefix++) {
    r.stop(signal);
    const name = `prefix=${String(prefix).padStart(2, "0")}.json`,
      rows = await artifact(input, "matrix", name, 30_000_000, signal),
      part = [];
    check(
      rows.length === r.declaration(inputs.matrix, name).record_count,
      "matrix partition rows",
    );
    for (const row of rows) {
      const base = cohort.get(row.zip5);
      check(
        base &&
          row.zip4 === null &&
          row.usps_validity === null &&
          row.cohort_classification === base.classification &&
          row.zcta_geoid === base.zcta_geoid &&
          r.equal(sorted(Object.keys(row.cells)), sorted(dimensions)),
        "matrix row/cohort/dimensions",
      );
      check(
        row.zip5.startsWith(String(prefix).padStart(2, "0")) &&
          (part.length === 0 || part.at(-1).zip5 < row.zip5),
        "matrix order/prefix",
      );
      const overlay = overlays.get(base.zcta_geoid),
        scope = federationGeographyScope(base, overlay);
      check(scopes.has(scope), "scope roster");
      scopeCounts[scope]++;
      const statuses = dimensions.map((id) => {
        const evidence = EVIDENCE_BY_RAW[row.cells[id].status];
        check(typeof evidence === "string", "derived disposition");
        const counts = observed.get(scope)[id];
        counts[evidence] = (counts[evidence] ?? 0) + 1;
        cells++;
        return evidence;
      });
      part.push({
        schema_version: `${DATASET}-zip@1.0.0`,
        zip5: row.zip5,
        zip4: null,
        cohort_classification: base.classification,
        zcta_geoid: base.zcta_geoid,
        usps_validity: null,
        geography_scope: scope,
        overlay: overlay
          ? {
              overlay_status: overlay.overlay_status,
              dominant_state_geo_id: overlay.dominant_state_geo_id,
              crosses_state_boundary_materially:
                overlay.crosses_state_boundary_materially,
            }
          : null,
        dimension_evidence_statuses: statuses,
        non_zcta_context: nonZcta.get(row.zip5) ?? null,
        epa_supplemental: epaZips.get(row.zip5),
      });
      zipRows++;
      r.stop(signal);
    }
    artifacts.push(
      await r.writeRows(
        root,
        output,
        `zip-status/prefix=${String(prefix).padStart(2, "0")}.jsonl.gz`,
        "national-goal-zip-evidence-status-jsonl-gzip",
        part,
        signal,
        hooks,
      ),
    );
    await hooks?.("matrix-partition", { prefix, zipRows });
  }
  check(
    zipRows === 48194 && cells === 2457894,
    "matrix full cell conservation",
  );
  for (const scope of disposition) {
    check(scopeCounts[scope.scope_id] === scope.zip5_rows, "scope ZIP count");
    for (const id of dimensions) {
      const declared = scope.dimensions[id].derived_evidence_status_counts,
        actual = observed.get(scope.scope_id)[id];
      check(
        Object.entries(declared).every(
          ([s, n]) => count(n) && (actual[s] ?? 0) === n,
        ) && Object.keys(actual).every((s) => Object.hasOwn(declared, s)),
        "state disposition independent matrix replay",
      );
    }
  }
  const goal = await artifact(input, "goal", "report.json", 2_000_000, signal),
    access = inputs.access.value;
  const missingBroad = goal.jurisdictions
    .filter(
      (state) =>
        state.categories.find((c) => c.category_id === "general-business")
          ?.datasets[0]?.availability_status === "unmeasured",
    )
    .map((state) => state.code)
    .sort();
  check(
    missingBroad.length === 40 && goal.all_business_completion_percent === null,
    "broad business gap",
  );
  const accessCells = access.jurisdictions.flatMap((state) =>
    state.industries.map((industry) => ({
      state: state.state,
      industry: industry.industry,
      access_evidence_status: industry.accessEvidenceStatus,
      app_handoff_status: industry.appHandoff.status,
      authority_evidence: industry.evidence.filter(
        (row) => row.type === "historical-state-publisher-assessment-hold",
      ),
      action_class:
        industry.accessEvidenceStatus.startsWith("unsupported-") ||
        industry.accessEvidenceStatus === "restricted-query-sample-evidence"
          ? "admission-review"
          : "retained-reprocessing",
      acquisition_authorization: "not-asserted-by-this-federation",
    })),
  );
  const accessCounts = {};
  for (const row of accessCells)
    accessCounts[row.access_evidence_status] =
      (accessCounts[row.access_evidence_status] ?? 0) + 1;
  check(
    accessCells.length === 459 &&
      new Set(accessCells.map((row) => `${row.state}:${row.industry}`)).size ===
        459 &&
      accessCells.every(
        (row) =>
          STATE_DC_CODES.includes(row.state) &&
          industries.includes(row.industry) &&
          ACCESS_STATUSES.has(row.access_evidence_status),
      ) &&
      r.equal(accessCounts, access.summary.accessEvidenceStatusCounts) &&
      Object.values(accessCounts).reduce((total, value) => total + value, 0) ===
        459,
    "access sidecar conservation",
  );
  const temporalGaps = summary.dimensions
    .filter((row) =>
      ["stale", "unmeasured"].includes(
        row.temporal_qualification.review_qualification,
      ),
    )
    .map((row) => ({
      dimension: row.id,
      ...row.temporal_qualification,
      action_class:
        row.temporal_qualification.review_qualification === "stale"
          ? "acquisition-required"
          : "retained-reprocessing",
    }));
  check(
    temporalGaps.filter((row) => row.review_qualification === "stale")
      .length === 0 &&
      temporalGaps.filter((row) => row.review_qualification === "unmeasured")
        .length === 20,
    "temporal gaps",
  );
  const geography = await artifact(
    input,
    "geography",
    "national-geography-goal-status.json",
    100_000,
    signal,
  );
  const lifecycleSummary = inputs.lifecycle.value.summary;
  check(
    lifecycleSummary.profile_count === 8011213 &&
      Object.values(lifecycleSummary.lifecycle_evidence_counts).reduce(
        (n, v) => n + v,
        0,
      ) === lifecycleSummary.profile_count,
    "lifecycle manifest summary conservation",
  );
  const relationshipRegistration = inputs.entity_geography_registration.value,
    relationshipManifest = inputs.entity_geography.value;
  check(
    relationshipRegistration.selected_release_id ===
      relationshipManifest.release_id &&
      relationshipRegistration.retained_releases.filter((row) => row.selected)
        .length === 1 &&
      relationshipRegistration.retained_releases.find((row) => row.selected)
        ?.manifest_sha256 === inputs.entity_geography.proof.sha256,
    "geography relationship registration selection",
  );
  const relationship = verifyRelationship
    ? await verifyBusinessEntityGeographyRelationship({
        root,
        release_id: relationshipManifest.release_id,
        expectedManifestSha256: inputs.entity_geography.proof.sha256,
        signal,
        requireRegistered: true,
        acceptPinnedHistoricalBindings: true,
      })
    : {
        release_id: relationshipManifest.release_id,
        manifest_sha256: inputs.entity_geography.proof.sha256,
        summary: relationshipManifest.summary,
      };
  const quality = relationship.summary;
  check(
    quality.profiles === 8011213 &&
      quality.profiles === lifecycleSummary.profile_count &&
      Object.values(quality.postal).reduce((n, v) => n + v, 0) ===
        quality.profiles &&
      Object.values(quality.point).reduce((n, v) => n + v, 0) ===
        quality.profiles &&
      quality.reported_state_conflict === 50 &&
      Object.values(quality.source_counts).reduce((n, v) => n + v, 0) ===
        quality.profiles,
    "geography relationship/lifecycle/registry conservation",
  );
  const geographyQuality = {
    schema_version: `${DATASET}-geography-relationship-quality@1.0.0`,
    relationship_release_id: relationship.release_id,
    relationship_manifest_sha256: relationship.manifest_sha256,
    profile_count: quality.profiles,
    postal_relationship_counts: quality.postal,
    point_relationship_counts: quality.point,
    reported_state_conflict_count: quality.reported_state_conflict,
    source_profile_counts: quality.source_counts,
    scope:
      "Aggregate relationship quality for the registry profile cohort; non-numerator and separate from ZIP5 evidence dimensions.",
    claims: {
      numerator: false,
      denominator: false,
      entity_assignment: false,
      polygon_assignment: false,
      usps_validity_verified: false,
      current_operation_verified: false,
      geocode_verified: false,
      business_completeness: null,
      acquisition_performed: false,
      production_enrollment: false,
      current_pointer_written: false,
      network_requests: 0,
    },
  };
  const policyRegistration = inputs.source_policy_registration.value,
    policyManifest = inputs.source_policy_manifest.value;
  check(
    policyRegistration.selected_release_id === policyManifest.release_id &&
      policyManifest.release_id ===
        "business-entity-source-policy-provenance-ffd0c199435fbe1447774f149cf6eaba7f502a0c96da7851ef6b2354f934510f" &&
      inputs.source_policy_manifest.proof.sha256 ===
        "5809e881502f503b410c05f104234de31574b2e62a48effb276b311fb063401b" &&
      policyManifest.artifact.sha256 ===
        "abe3f83ff6d54e64ab78d1e7a1aa5bdebf252121c640238bef4d6cf99b37b0b4" &&
      policyManifest.summary.source_count === 15 &&
      policyManifest.summary.profile_count === 8011213,
    "source policy compact pin",
  );
  const policy = verifyRelationship
    ? await readBusinessEntitySourcePolicyProvenance({ root, signal })
    : null;
  if (policy)
    check(
      policy.release_id === policyManifest.release_id &&
        policy.registration_sha256 ===
          inputs.source_policy_registration.proof.sha256 &&
        policy.manifest_sha256 === inputs.source_policy_manifest.proof.sha256 &&
        policy.artifact_sha256 === policyManifest.artifact.sha256 &&
        policy.summary.profile_export_policy_counts.public === 6161216 &&
        policy.summary.profile_export_policy_counts["local-review-only"] ===
          1849997 &&
        policy.summary.profile_export_policy_counts.public +
          policy.summary.profile_export_policy_counts["local-review-only"] ===
          8011213 &&
        policy.source_by_id.get(
          "los-angeles-office-of-finance-active-businesses",
        )?.profile_count === 633232,
      "source policy independent verification",
    );
  const policySidecar = {
    schema_version: `${DATASET}-source-policy-provenance@1.0.0`,
    release_id: policyManifest.release_id,
    registration_sha256: inputs.source_policy_registration.proof.sha256,
    manifest_sha256: inputs.source_policy_manifest.proof.sha256,
    artifact_sha256: policyManifest.artifact.sha256,
    assessment_as_of: "2026-10-02T16:30:00.000Z",
    source_count: 15,
    profile_count: 8011213,
    export_profile_counts: { public: 6161216, "local-review-only": 1849997 },
    policy_coverage: { covered_sources: 15, total_sources: 15 },
    scope:
      "Selected source-policy provenance for the registry profile cohort; non-numerator and separate from lifecycle reconciliation.",
    boundaries: {
      authorization: "not-granted-by-this-sidecar",
      acquisition: "not-performed-by-this-sidecar",
      current_operation: "not-verified-by-this-sidecar",
      export: "field-level source policy remains controlling",
    },
    claims: {
      numerator: false,
      denominator: false,
      authorization_granted: false,
      acquisition_performed: false,
      current_operation_verified: false,
      active_business_eligible: false,
      production_enrollment: false,
      current_pointer_written: false,
      network_requests: 0,
    },
  };
  const reconciliationRegistration =
    inputs.temporal_lifecycle_reconciliation_registration.value;
  check(
    inputs.temporal_lifecycle_reconciliation_registration.proof.sha256 ===
      "8bb9d80ddd7192e76f1a48a75e83b03afd8e91170eafb646193adde2b8961d75" &&
      reconciliationRegistration.dataset_id ===
        "national-business-temporal-lifecycle-reconciliation-v1-1",
    "reconciliation registration pin",
  );
  const reconciliation = verifyRelationship
    ? await verifyNationalBusinessTemporalLifecycleReconciliationV11({
        root,
        signal,
      })
    : null;
  if (reconciliation)
    check(
      reconciliation.registration.sha256 ===
        inputs.temporal_lifecycle_reconciliation_registration.proof.sha256,
      "reconciliation independent verification",
    );
  const publisherMembership = {
    schema_version: `${DATASET}-publisher-membership-reconciliation@1.0.0`,
    registration_sha256:
      inputs.temporal_lifecycle_reconciliation_registration.proof.sha256,
    source_rows: 633782,
    normalized_profiles: 633232,
    quarantined_rows: 550,
    quarantine_reasons: { invalid_or_unmapped_zip: 465, missing_address: 85 },
    effective_source_classification_counts: {
      "source-defined-current-membership": 21,
      "non-active-reporting-membership": 7,
      "annual-aggregate": 1,
      "unknown-source-status": 1,
    },
    publisher_assertion: "active-list-membership-without-row-status",
    row_status: null,
    lifecycle_evidence: "unknown",
    active_business_eligible_count: 0,
    current_operations_verified: false,
    active_business_count: null,
    completeness_percentage: null,
    upstream_hashes: {
      prior_reconciliation_registration_sha256:
        reconciliationRegistration.bindings.reconciliation_registration.sha256,
      la_pointer_sha256: reconciliationRegistration.bindings.la_pointer.sha256,
      la_manifest_sha256:
        reconciliationRegistration.bindings.la_manifest.sha256,
      source_artifact_sha256:
        reconciliationRegistration.bindings.source_artifact.sha256,
      source_summary_sha256:
        reconciliationRegistration.bindings.source_summary.sha256,
    },
    scope:
      "Los Angeles publisher-membership reconciliation; 21/7/1/1 are source-row classifications, never profile counts; non-numerator and distinct from source-policy provenance.",
    claims: {
      numerator: false,
      denominator: false,
      inference_performed: false,
      network_requests: 0,
      production_enrollment: false,
      current_pointer_written: false,
    },
  };
  const supplementalRegistration =
      inputs.state_registration_license_registration.value,
    supplementalManifest = inputs.state_registration_license_manifest.value;
  check(
    supplementalRegistration.dataset_id ===
      "national-state-registration-license-supplemental-evidence" &&
      supplementalRegistration.runtime_pointer === null &&
      supplementalRegistration.production_enrollment === false &&
      supplementalRegistration.retained_release.release_id ===
        supplementalManifest.release_id &&
      supplementalRegistration.retained_release.manifest_sha256 ===
        inputs.state_registration_license_manifest.proof.sha256,
    "state registration/license selected release pin",
  );
  const supplementalSummary = await artifact(
      input,
      "state_registration_license_manifest",
      "national-summary.json",
      10_000,
      signal,
    ),
    supplementalScopes = await artifact(
      input,
      "state_registration_license_manifest",
      "geography-disposition-scopes.json",
      500_000,
      signal,
    ),
    supplementalIssuers = await artifact(
      input,
      "state_registration_license_manifest",
      "issuer-state-marginals.json",
      50_000,
      signal,
    );
  check(
    supplementalSummary.zip5_rows === 48194 &&
      supplementalSummary.positive_zip5_rows === 31050 &&
      supplementalSummary.zero_zip5_rows === 17144 &&
      supplementalSummary.geography_disposition_scope_rows === 60 &&
      supplementalSummary.state_scope_rows === 51 &&
      supplementalSummary.territory_scope_rows === 5 &&
      supplementalSummary.special_scope_rows === 4 &&
      supplementalSummary.issuer_state_marginal_rows === 9 &&
      supplementalSummary.dimension_rows === 10 &&
      supplementalSummary.source_address_row_count === 14414724 &&
      supplementalSummary.eligible_address_membership_count === 10014807 &&
      supplementalSummary.missing_or_ineligible_address_membership_count ===
        4399917 &&
      supplementalScopes.length === 60 &&
      supplementalIssuers.length === 9,
    "state registration/license compact conservation",
  );
  check(
    supplementalSummary.source_address_row_count ===
      supplementalSummary.eligible_address_membership_count +
        supplementalSummary.missing_or_ineligible_address_membership_count &&
      supplementalScopes.reduce((n, row) => n + row.zip5_rows, 0) === 48194 &&
      supplementalIssuers.reduce(
        (n, row) => n + row.source_address_row_count,
        0,
      ) === supplementalSummary.source_address_row_count &&
      supplementalIssuers.reduce(
        (n, row) => n + row.eligible_address_membership_count,
        0,
      ) === supplementalSummary.eligible_address_membership_count,
    "state registration/license cross-artifact conservation",
  );
  const supplementalClaims = supplementalSummary.claims;
  check(
    supplementalClaims.cross_source_additivity_asserted === false &&
      supplementalClaims.additive_business_count_asserted === false &&
      supplementalClaims.unique_business_count === null &&
      supplementalClaims.current_operation_verified === false &&
      supplementalClaims.all_business_completeness === null &&
      supplementalClaims.network_requests === 0 &&
      supplementalClaims.source_acquisition_performed === false &&
      supplementalClaims.current_pointer_written === false &&
      supplementalClaims.production_enrollment === false,
    "state registration/license claim boundary",
  );
  const stateRegistrationLicenseSidecar = {
    schema_version: `${DATASET}-state-registration-license-supplemental@1.0.0`,
    release_id: supplementalManifest.release_id,
    registration_sha256:
      inputs.state_registration_license_registration.proof.sha256,
    manifest_sha256: inputs.state_registration_license_manifest.proof.sha256,
    summary_artifact_sha256: r.declaration(
      inputs.state_registration_license_manifest,
      "national-summary.json",
    ).sha256,
    scope_artifact_sha256: r.declaration(
      inputs.state_registration_license_manifest,
      "geography-disposition-scopes.json",
    ).sha256,
    issuer_marginals_artifact_sha256: r.declaration(
      inputs.state_registration_license_manifest,
      "issuer-state-marginals.json",
    ).sha256,
    summary: {
      zip5_rows: supplementalSummary.zip5_rows,
      positive_zip5_rows: supplementalSummary.positive_zip5_rows,
      zero_zip5_rows: supplementalSummary.zero_zip5_rows,
      geography_disposition_scope_rows:
        supplementalSummary.geography_disposition_scope_rows,
      issuer_state_marginal_rows:
        supplementalSummary.issuer_state_marginal_rows,
      dimension_rows: supplementalSummary.dimension_rows,
      evidence_class_rows: 5,
      source_address_row_count: supplementalSummary.source_address_row_count,
      eligible_address_membership_count:
        supplementalSummary.eligible_address_membership_count,
      missing_or_ineligible_address_membership_count:
        supplementalSummary.missing_or_ineligible_address_membership_count,
    },
    scope:
      "Supplemental source-reported registration/license address memberships; separate from federation evidence-cell numerators and percentages.",
    claims: supplementalClaims,
  };
  const irsRegistration = inputs.irs_eo_supplemental_registration.value,
    irsManifest = inputs.irs_eo_supplemental_manifest.value;
  check(
    irsRegistration.dataset_id ===
      "national-irs-eo-supplemental-industry-evidence" &&
      irsRegistration.runtime_pointer === null &&
      irsRegistration.production_enrollment === false &&
      irsRegistration.retained_release.release_id === irsManifest.release_id &&
      irsRegistration.retained_release.manifest_sha256 ===
        inputs.irs_eo_supplemental_manifest.proof.sha256,
    "IRS EO supplemental selected release pin",
  );
  const irsSummary = await artifact(
      input,
      "irs_eo_supplemental_manifest",
      "national-summary.json",
      10_000,
      signal,
    ),
    irsScopes = await artifact(
      input,
      "irs_eo_supplemental_manifest",
      "geography-disposition-scopes.json",
      100_000,
      signal,
    ),
    irsReported = await artifact(
      input,
      "irs_eo_supplemental_manifest",
      "reported-jurisdictions.json",
      100_000,
      signal,
    );
  check(
    irsSummary.zip5_rows === 48194 &&
      irsSummary.positive_zip5_rows === 36950 &&
      irsSummary.organization_membership_count === 1955841 &&
      irsSummary.geography_disposition_scope_rows === 60 &&
      irsSummary.state_scope_rows === 51 &&
      irsSummary.territory_scope_rows === 5 &&
      irsSummary.special_scope_rows === 4 &&
      irsSummary.reported_filing_address_jurisdiction_rows === 56 &&
      irsScopes.length === 60 &&
      irsReported.length === 56 &&
      irsScopes.reduce(
        (total, row) => total + row.organization_membership_count,
        0,
      ) === irsSummary.organization_membership_count &&
      irsReported.reduce(
        (total, row) => total + row.organization_membership_count,
        0,
      ) === irsSummary.organization_membership_count,
    "IRS EO supplemental compact conservation",
  );
  const irsClaims = irsSummary.claims;
  check(
    irsClaims.unique_business_count === null &&
      irsClaims.current_operation_verified === false &&
      irsClaims.all_business_completeness === null &&
      irsClaims.additive_to_business_or_industry_totals === false &&
      irsClaims.geography_disposition_and_reported_jurisdiction_are_separate ===
        true &&
      irsClaims.network_requests === 0 &&
      irsClaims.source_acquisition_performed === false &&
      irsClaims.current_pointer_written === false &&
      irsClaims.production_enrollment === false,
    "IRS EO supplemental claim boundary",
  );
  const irsEoSupplementalSidecar = {
    schema_version: `${DATASET}-irs-eo-supplemental@1.0.0`,
    release_id: irsManifest.release_id,
    registration_sha256: inputs.irs_eo_supplemental_registration.proof.sha256,
    manifest_sha256: inputs.irs_eo_supplemental_manifest.proof.sha256,
    summary_artifact_sha256: r.declaration(
      inputs.irs_eo_supplemental_manifest,
      "national-summary.json",
    ).sha256,
    scope_artifact_sha256: r.declaration(
      inputs.irs_eo_supplemental_manifest,
      "geography-disposition-scopes.json",
    ).sha256,
    reported_jurisdictions_artifact_sha256: r.declaration(
      inputs.irs_eo_supplemental_manifest,
      "reported-jurisdictions.json",
    ).sha256,
    summary: {
      zip5_rows: irsSummary.zip5_rows,
      positive_zip5_rows: irsSummary.positive_zip5_rows,
      organization_membership_count: irsSummary.organization_membership_count,
      geography_disposition_scope_rows:
        irsSummary.geography_disposition_scope_rows,
      reported_filing_address_jurisdiction_rows:
        irsSummary.reported_filing_address_jurisdiction_rows,
      evidence_kind: irsSummary.evidence_kind,
      industry: irsSummary.industry,
      review_status: irsSummary.review_status,
    },
    review: irsSummary.review,
    scope:
      "Supplemental filing-address organization memberships; geography disposition and reported filing-address jurisdictions remain separate, nonadditive marginals.",
    claims: irsClaims,
  };
  const lifecycleIndustryRegistration =
      inputs.lifecycle_industry_zip_registration.value,
    lifecycleIndustryManifest = inputs.lifecycle_industry_zip_manifest.value;
  check(
    lifecycleIndustryRegistration.dataset_id ===
      "national-business-lifecycle-industry-zip-evidence" &&
      lifecycleIndustryRegistration.runtime_pointer === null &&
      lifecycleIndustryRegistration.production_enrollment === false &&
      lifecycleIndustryRegistration.retained_release.release_id ===
        lifecycleIndustryManifest.release_id &&
      lifecycleIndustryRegistration.retained_release.manifest_sha256 ===
        inputs.lifecycle_industry_zip_manifest.proof.sha256,
    "lifecycle-industry ZIP selected release pin",
  );
  const lifecycleIndustrySummary = await artifact(
      input,
      "lifecycle_industry_zip_manifest",
      "summary.json",
      10_000,
      signal,
    ),
    outsideDeclaration = r.declaration(
      inputs.lifecycle_industry_zip_manifest,
      "outside-cohort.jsonl.gz",
    );
  check(
    lifecycleIndustrySummary.zip5_rows === 48194 &&
      lifecycleIndustrySummary.positive_zip5_rows === 42267 &&
      lifecycleIndustrySummary.zero_profile_zip5_rows === 5927 &&
      lifecycleIndustrySummary.source_membership_count === 8011213 &&
      Object.values(lifecycleIndustrySummary.lifecycle_evidence_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 8011213 &&
      Object.values(lifecycleIndustrySummary.review_status_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 8011213 &&
      Object.values(lifecycleIndustrySummary.source_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 8011213 &&
      Object.values(lifecycleIndustrySummary.cohort_classification_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 48194 &&
      lifecycleIndustrySummary.mapped_source_record_union_count === 6780627 &&
      lifecycleIndustrySummary.unresolved_source_record_count === 1230586 &&
      lifecycleIndustrySummary.industry_assignment_count === 6782745 &&
      Object.values(lifecycleIndustrySummary.industry_assignment_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 6782745 &&
      lifecycleIndustrySummary.epa_refinement.source_record_count === 1517826 &&
      lifecycleIndustrySummary.epa_refinement.records_with_segment === 294477 &&
      lifecycleIndustrySummary.epa_refinement.segment_assignments === 296595 &&
      lifecycleIndustrySummary.epa_refinement.multisegment_records === 2107 &&
      lifecycleIndustrySummary.epa_refinement.records_partially_unmapped ===
        25035 &&
      lifecycleIndustrySummary.epa_refinement.unresolved_source_records ===
        1223349 &&
      lifecycleIndustrySummary.fully_mapped_source_count === 13 &&
      lifecycleIndustrySummary.partially_mapped_source_count === 1 &&
      lifecycleIndustrySummary.fully_unmapped_source_count === 1 &&
      outsideDeclaration.record_count === 0 &&
      outsideDeclaration.decoded_bytes === 0 &&
      outsideDeclaration.bytes === 20,
    "lifecycle-industry ZIP compact conservation",
  );
  const lifecycleIndustryClaims = lifecycleIndustryManifest.claims;
  check(
    lifecycleIndustryClaims.mapped_source_record_union_separate_from_industry_assignments ===
      true &&
      lifecycleIndustryClaims.industry_assignments_additive === false &&
      lifecycleIndustryClaims.source_memberships_additive_across_industries ===
        false &&
      lifecycleIndustryClaims.cross_source_additivity === false &&
      lifecycleIndustryClaims.unique_business_count === null &&
      lifecycleIndustryClaims.active_business_count === null &&
      lifecycleIndustryClaims.current_operating_business_count === null &&
      lifecycleIndustryClaims.all_business_completeness === null &&
      lifecycleIndustryClaims.industry_completeness === null &&
      lifecycleIndustryClaims.current_operation_verified === false &&
      lifecycleIndustryClaims.network_requests === 0 &&
      lifecycleIndustryClaims.source_acquisition_performed === false &&
      lifecycleIndustryClaims.current_pointer_written === false &&
      lifecycleIndustryClaims.production_enrollment === false,
    "lifecycle-industry ZIP claim boundary",
  );
  const lifecycleIndustryZipSidecar = {
    schema_version: `${DATASET}-lifecycle-industry-zip@1.0.0`,
    release_id: lifecycleIndustryManifest.release_id,
    registration_sha256:
      inputs.lifecycle_industry_zip_registration.proof.sha256,
    manifest_sha256: inputs.lifecycle_industry_zip_manifest.proof.sha256,
    summary_artifact_sha256: r.declaration(
      inputs.lifecycle_industry_zip_manifest,
      "summary.json",
    ).sha256,
    outside_cohort_artifact_sha256: outsideDeclaration.sha256,
    summary: lifecycleIndustrySummary,
    scope:
      "Source-relative lifecycle memberships with mapped source-record union distinct from nonadditive operational-industry assignments; separate from federation evidence-cell numerators and percentages.",
    claims: lifecycleIndustryClaims,
  };
  const jurisdictionRegistration =
      inputs.lifecycle_industry_jurisdiction_registration.value,
    jurisdictionManifest = inputs.lifecycle_industry_jurisdiction_manifest.value;
  check(
    jurisdictionRegistration.runtime_pointer === null &&
      jurisdictionRegistration.production_enrollment === false &&
      jurisdictionRegistration.retained_release.release_id ===
        jurisdictionManifest.release_id &&
      jurisdictionRegistration.retained_release.manifest_sha256 ===
        inputs.lifecycle_industry_jurisdiction_manifest.proof.sha256,
    "lifecycle-industry jurisdiction selected release pin",
  );
  const jurisdictionRows = await artifact(
      input,
      "lifecycle_industry_jurisdiction_manifest",
      "jurisdictions.json",
      1_000_000,
      signal,
    ),
    jurisdictionSummary = jurisdictionManifest.summary;
  check(
    jurisdictionRows.length === 60 &&
      jurisdictionRows.filter((row) => row.scope_kind === "state").length === 51 &&
      jurisdictionRows.filter((row) => row.scope_kind === "territory").length === 5 &&
      jurisdictionRows.filter(
        (row) => !["state", "territory"].includes(row.scope_kind),
      ).length === 4 &&
      jurisdictionRows.reduce((total, row) => total + row.zip5_rows, 0) === 48194 &&
      jurisdictionRows.reduce(
        (total, row) => total + row.source_membership_count,
        0,
      ) === 8011213 &&
      jurisdictionRows.every((row) => row.industries.length === 9) &&
      jurisdictionSummary.scope_rows === 60 &&
      jurisdictionSummary.state_scope_rows === 51 &&
      jurisdictionSummary.territory_scope_rows === 5 &&
      jurisdictionSummary.special_scope_rows === 4 &&
      jurisdictionSummary.zip5_rows === 48194 &&
      jurisdictionSummary.source_membership_count === 8011213 &&
      Object.values(jurisdictionSummary.lifecycle_evidence_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 8011213 &&
      Object.values(jurisdictionSummary.review_status_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 8011213 &&
      jurisdictionSummary.mapped_source_record_union_count === 6780627 &&
      jurisdictionSummary.unresolved_source_record_count === 1230586 &&
      jurisdictionSummary.industry_assignment_count === 6782745 &&
      Object.values(jurisdictionSummary.industry_assignment_counts).reduce(
        (total, value) => total + value,
        0,
      ) === 6782745 &&
      jurisdictionSummary.epa_refinement.source_record_count === 1517826 &&
      jurisdictionSummary.epa_refinement.industry_assignment_count === 296595,
    "lifecycle-industry jurisdiction compact conservation",
  );
  const jurisdictionClaims = jurisdictionManifest.claims;
  check(
    jurisdictionClaims.special_scopes_separate === true &&
      jurisdictionClaims.multi_state_evidence_allocated === false &&
      jurisdictionClaims.usps_zip_state_assignment === false &&
      jurisdictionClaims.industry_assignments_additive === false &&
      jurisdictionClaims.unique_business_count === null &&
      jurisdictionClaims.all_business_completeness === null &&
      jurisdictionClaims.current_operation_verified === false,
    "lifecycle-industry jurisdiction claim boundary",
  );
  const lifecycleIndustryJurisdictionSidecar = {
    schema_version: `${DATASET}-lifecycle-industry-jurisdiction@1.0.0`,
    release_id: jurisdictionManifest.release_id,
    registration_sha256:
      inputs.lifecycle_industry_jurisdiction_registration.proof.sha256,
    manifest_sha256:
      inputs.lifecycle_industry_jurisdiction_manifest.proof.sha256,
    jurisdictions_artifact_sha256: r.declaration(
      inputs.lifecycle_industry_jurisdiction_manifest,
      "jurisdictions.json",
    ).sha256,
    summary: jurisdictionSummary,
    scope:
      "Governed lifecycle-industry jurisdiction disposition; state/DC rows are selectable, while territories and special scopes remain separate and unassigned.",
    claims: jurisdictionClaims,
  };
  const broadAuthorizationManifest = inputs.broad_gap_authorization_manifest.value,
    broadAuthorizationProgram = await artifact(
      input,
      "broad_gap_authorization_manifest",
      "authorization-program.json",
      1_100_000,
      signal,
    ),
    broadAuthorizationStates = broadAuthorizationProgram.states.map((row) => ({
      state: row.state_abbreviation,
      wave: row.wave,
      decision: row.assessment_snapshot.decision,
      assessment_id: row.assessment_snapshot.assessment_id,
      observed_at: row.assessment_snapshot.observed_at,
      gate_count: row.unresolved_gates.length,
      gate_keys: row.unresolved_gates,
      required_exclusions: row.required_exclusions,
      strongest_bounded_next_action:
        row.assessment_snapshot.strongest_bounded_next_action,
      authority: row.authority,
    }));
  check(
    broadAuthorizationManifest.state_count === 40 &&
      broadAuthorizationManifest.gate_item_count === 371 &&
      broadAuthorizationManifest.gate_key_count === 121 &&
      broadAuthorizationManifest.artifacts.length === 1 &&
      broadAuthorizationManifest.artifacts[0].path === "authorization-program.json" &&
      broadAuthorizationManifest.artifacts[0].sha256 ===
        "640d543ed1b6472b76df09d53c4f75f325bf8dee49ae32b9c624f805804e38a6" &&
      broadAuthorizationProgram.scope.jurisdictions === 40 &&
      broadAuthorizationProgram.scope.gate_items === 371 &&
      broadAuthorizationProgram.scope.gate_key_count === 121 &&
      broadAuthorizationProgram.wave_state_abbreviations.length === 4 &&
      broadAuthorizationStates.length === 40 &&
      broadAuthorizationStates.reduce((n, row) => n + row.gate_count, 0) === 371 &&
      new Set(broadAuthorizationStates.flatMap((row) => row.gate_keys)).size === 121 &&
      r.equal(
        broadAuthorizationStates.map((row) => row.state).sort(),
        [...missingBroad].sort(),
      ) &&
      broadAuthorizationStates.every(
        (row) =>
          row.decision === "hold" &&
          row.gate_count === row.gate_keys.length &&
          row.required_exclusions.length > 0 &&
          typeof row.strongest_bounded_next_action === "string" &&
          row.strongest_bounded_next_action.length > 0 &&
          Object.values(row.authority).every((value) => value === false),
      ) &&
      broadAuthorizationProgram.scope.acquisition_authorized === false &&
      broadAuthorizationProgram.scope.evidence_request_authorized === false &&
      broadAuthorizationProgram.scope.source_actions_performed === 0 &&
      broadAuthorizationProgram.scope.network_requests === 0 &&
      broadAuthorizationProgram.scope.current_pointer_changed === false,
    "broad-gap authorization conservation and authority boundary",
  );
  const broadGapAuthorizationSidecar = {
    schema_version: `${DATASET}-broad-gap-authorization@1.0.0`,
    release_id: broadAuthorizationManifest.release_id,
    manifest_sha256: inputs.broad_gap_authorization_manifest.proof.sha256,
    artifact_sha256: r.declaration(
      inputs.broad_gap_authorization_manifest,
      "authorization-program.json",
    ).sha256,
    observed_at: broadAuthorizationProgram.observed_at,
    state_count: 40,
    wave_count: 4,
    gate_item_count: 371,
    distinct_gate_key_count: 121,
    states: broadAuthorizationStates,
    authority: {
      acquisition_authorized: false,
      evidence_request_authorized: false,
      contact_authorized: false,
      download_authorized: false,
      payment_authorized: false,
      row_bearing_evidence_authorized: false,
      production_change_authorized: false,
    },
    scope:
      "Governed readiness taxonomy for the exact 40 current broad-organization gaps; review evidence only and no source-action authority.",
  };
  const zbpRegistration = inputs.census_zbp_zip_profile_registration.value,
    zbpManifest = inputs.census_zbp_zip_profile_manifest.value,
    zbpInventorySha256 = createHash("sha256")
      .update(JSON.stringify(zbpManifest.artifacts))
      .digest("hex");
  check(
    zbpRegistration.dataset_id === "census-zbp-zip-profile-index" &&
      zbpRegistration.status === "registered-local-lookup-index" &&
      zbpRegistration.runtime_pointer === null &&
      zbpRegistration.production_enrollment === false &&
      zbpRegistration.national_reporting_denominator_enrollment === false &&
      zbpRegistration.export_policy === "local-review-only" &&
      zbpRegistration.retained_release.release_id === zbpManifest.release_id &&
      zbpRegistration.retained_release.manifest_sha256 ===
        inputs.census_zbp_zip_profile_manifest.proof.sha256 &&
      zbpRegistration.retained_release.source_rows === 2974116 &&
      zbpRegistration.retained_release.indexed_zip_count === 37828 &&
      zbpRegistration.retained_release.artifact_count === 20 &&
      zbpRegistration.retained_release.artifact_bytes === 2015507248 &&
      zbpRegistration.retained_release.artifact_inventory_sha256 ===
        "5b5561ad3064c4da28b8dcb4dbe72aa746ea47178752cd95cd05963d0d262c2c" &&
      zbpInventorySha256 ===
        zbpRegistration.retained_release.artifact_inventory_sha256 &&
      zbpManifest.source_rows === 2974116 &&
      zbpManifest.indexed_zip_count === 37828 &&
      zbpManifest.artifacts.length === 20 &&
      zbpManifest.artifacts.reduce((total, item) => total + item.bytes, 0) ===
        2015507248 &&
      zbpManifest.bindings.reference_year === 2023 &&
      zbpManifest.claims.export_policy === "local-review-only" &&
      zbpManifest.claims.reference_year === 2023 &&
      zbpManifest.claims.zip4 === null &&
      zbpManifest.claims.current_operations_verified === false &&
      zbpManifest.claims.current_operating_business_count === null &&
      zbpManifest.claims.all_business_completion_percent === null &&
      zbpManifest.claims.network_requests === 0 &&
      zbpManifest.claims.current_pointer_written === false &&
      zbpManifest.claims.production_enrollment === false,
    "Census ZBP ZIP profile index metadata conservation",
  );
  const censusZbpZipProfileSidecar = {
    schema_version: `${DATASET}-census-zbp-zip-profile-index@1.0.0`,
    release_id: zbpManifest.release_id,
    registration_sha256:
      inputs.census_zbp_zip_profile_registration.proof.sha256,
    manifest_sha256: inputs.census_zbp_zip_profile_manifest.proof.sha256,
    reference_year: 2023,
    source_rows: 2974116,
    indexed_zip_count: 37828,
    artifact_count: 20,
    artifact_bytes: 2015507248,
    artifact_inventory_sha256: zbpInventorySha256,
    scope:
      "Local-review-only Census 2023 employer-establishment ZIP aggregates; compact index inventory only, with no profile replay in federation build.",
    claims: zbpManifest.claims,
  };
  const resolutionRegistration = inputs.entity_resolution_registration.value,
    resolutionPointer = inputs.entity_resolution_pointer.value,
    resolutionManifest = inputs.entity_resolution_manifest.value,
    benchmarkRegistration =
      inputs.entity_resolution_benchmark_registration.value,
    benchmarkPointer = inputs.entity_resolution_benchmark_pointer.value,
    benchmarkManifest = inputs.entity_resolution_benchmark_manifest.value,
    resolutionCoverage = resolutionManifest.coverage,
    benchmarkCoverage = benchmarkManifest.coverage;
  check(
    resolutionRegistration.dataset_id ===
      "national-business-entity-resolution" &&
      resolutionRegistration.runtime_pointer ===
        "data/business-entity-resolution/current.json" &&
      resolutionRegistration.current_verified_release.release_id ===
        resolutionManifest.release_id &&
      resolutionRegistration.current_verified_release.manifest_sha256 ===
        inputs.entity_resolution_manifest.proof.sha256 &&
      resolutionPointer.release_id === resolutionManifest.release_id &&
      resolutionPointer.manifest ===
        `releases/${resolutionManifest.release_id}/manifest.json` &&
      resolutionPointer.status === "published-reviewable-partial" &&
      resolutionManifest.complete_entity_resolution === false &&
      resolutionManifest.artifacts.length === 101 &&
      resolutionManifest.artifacts.reduce(
        (total, item) => total + item.bytes,
        0,
      ) === 412615462 &&
      resolutionCoverage.profiles === 8011213 &&
      resolutionCoverage.address_groups === 6505053 &&
      resolutionCoverage.multi_member_street_address_groups === 876076 &&
      resolutionCoverage.site_alias_decisions === 2325053 &&
      resolutionCoverage.establishment_alias_decisions === 146828 &&
      resolutionCoverage.review_candidate_decisions === 106431 &&
      resolutionCoverage.review_groups_skipped_for_size === 2 &&
      r.equal(resolutionManifest.decision_semantics.not_inferred, [
        "ownership",
        "parent company",
        "general operating status",
        "co-location as establishment identity",
        "name-only identity",
      ]) &&
      benchmarkRegistration.dataset_id ===
        "national-business-entity-resolution-benchmark" &&
      benchmarkRegistration.runtime_pointer ===
        "data/business-entity-resolution-benchmark/current.json" &&
      benchmarkRegistration.current_verified_sample.release_id ===
        benchmarkManifest.release_id &&
      benchmarkRegistration.current_verified_sample.manifest_sha256 ===
        inputs.entity_resolution_benchmark_manifest.proof.sha256 &&
      benchmarkPointer.release_id === benchmarkManifest.release_id &&
      benchmarkPointer.manifest ===
        `releases/${benchmarkManifest.release_id}/manifest.json` &&
      benchmarkPointer.status === "awaiting-independent-labels" &&
      benchmarkManifest.status === "awaiting-independent-labels" &&
      benchmarkManifest.complete_labeled_benchmark === false &&
      benchmarkManifest.dependencies.resolution.release_id ===
        resolutionManifest.release_id &&
      benchmarkManifest.dependencies.resolution.manifest_sha256 ===
        inputs.entity_resolution_manifest.proof.sha256 &&
      benchmarkManifest.artifacts.length === 3 &&
      benchmarkManifest.artifacts.reduce(
        (total, item) => total + item.bytes,
        0,
      ) === 899732 &&
      benchmarkCoverage.total_sampled_candidates === 1275 &&
      benchmarkCoverage.submitted_labels === 0 &&
      benchmarkCoverage.benchmark_gate_passed === false,
    "entity-resolution and benchmark metadata conservation",
  );
  const entityResolutionSidecar = {
    schema_version: `${DATASET}-entity-resolution@1.0.0`,
    release_id: resolutionManifest.release_id,
    registration_sha256: inputs.entity_resolution_registration.proof.sha256,
    pointer_sha256: inputs.entity_resolution_pointer.proof.sha256,
    manifest_sha256: inputs.entity_resolution_manifest.proof.sha256,
    status: resolutionManifest.status,
    artifact_count: 101,
    artifact_bytes: 412615462,
    coverage: resolutionCoverage,
    benchmark: {
      release_id: benchmarkManifest.release_id,
      registration_sha256:
        inputs.entity_resolution_benchmark_registration.proof.sha256,
      pointer_sha256: inputs.entity_resolution_benchmark_pointer.proof.sha256,
      manifest_sha256:
        inputs.entity_resolution_benchmark_manifest.proof.sha256,
      status: benchmarkManifest.status,
      artifact_count: 3,
      artifact_bytes: 899732,
      total_sampled_candidates: 1275,
      submitted_labels: 0,
      benchmark_gate_passed: false,
      complete_labeled_benchmark: false,
      automatic_precision_gate_passed: false,
      export_authorized: false,
    },
    scope:
      "Reversible site/establishment alias decisions and unapplied review candidates; metadata only and separate from federation numerators.",
    claims: {
      unique_businesses: null,
      verified_active_businesses: null,
      current_operation_verified: false,
      ownership_inferred: false,
      parent_relationships_inferred: false,
      complete_entity_resolution: false,
      benchmark_accepted: false,
      export_authorized: false,
      network_requests: 0,
      acquisition_performed: false,
      current_pointer_written: false,
      production_enrollment: false,
    },
  };
  const summaryResult = {
    schema_version: VERSION,
    scope:
      "50 states and District of Columbia; territories reported separately",
    zip5_cohort_rows: zipRows,
    source_dimensions: 51,
    matrix_evidence_cells: cells,
    state_industry_rows: 459,
    operational_industries: industries,
    dimension_order: dimensions,
    temporal_assessment: summary.temporal_qualification,
    geography_scope_counts: scopeCounts,
    industry_evidence_metrics: industries.map((industry) => {
      const rows = stateIndustry.filter((row) => row.id === industry),
        numerator = rows.reduce(
          (n, row) => n + row.measured_zip_dimension_cells,
          0,
        ),
        denominator = rows.reduce(
          (n, row) => n + row.zip_dimension_cell_denominator,
          0,
        );
      return {
        industry,
        mapped_dimensions: rows[0].mapped_dimensions,
        measured_zip_dimension_cells: numerator,
        zip_dimension_cell_denominator: denominator,
        exact_zip_measurement_reach_percent: percent(numerator, denominator),
        scope: "33455 governed dominant-state Census ZCTA cohort rows",
      };
    }),
    gaps: {
      broad_business_missing_states: missingBroad.length,
      unsupported_industry_access_cells:
        accessCounts["unsupported-missing"] ?? 0,
      unmeasured_industry_access_cells:
        accessCounts["unsupported-evidence-not-measured"] ?? 0,
      restricted_sample_industry_access_cells:
        accessCounts["restricted-query-sample-evidence"] ?? 0,
      stale_temporal_dimensions: temporalGaps.filter(
        (row) => row.review_qualification === "stale",
      ).length,
      unmeasured_temporal_dimensions: temporalGaps.filter(
        (row) => row.review_qualification === "unmeasured",
      ).length,
    },
    sidecars: {
      goal_matrix: {
        schema_version: goal.schema_version,
        denominator: goal.denominator,
        missing_broad_states: missingBroad,
      },
      state_access: {
        generated_at: access.generatedAt,
        summary: access.summary,
        scope:
          "source-reported jurisdiction evidence; separate from Census overlay scopes",
      },
      epa: {
        summary: inputs.epa.value.summary,
        scope:
          "nonadditive retained environmental-program facility memberships",
      },
      geography: { status: geography },
      lifecycle: {
        assessment_as_of: inputs.lifecycle.value.assessment_as_of,
        summary: lifecycleSummary,
        scope:
          "source-profile lifecycle decisions; overlapping evidence units; separate from matrix dimensions",
      },
      entity_geography_relationship: geographyQuality,
      source_policy_provenance: policySidecar,
      publisher_membership_reconciliation: publisherMembership,
      state_registration_license_supplemental: stateRegistrationLicenseSidecar,
      irs_eo_supplemental: irsEoSupplementalSidecar,
      lifecycle_industry_zip: lifecycleIndustryZipSidecar,
      lifecycle_industry_jurisdiction: lifecycleIndustryJurisdictionSidecar,
      broad_gap_authorization: broadGapAuthorizationSidecar,
      census_zbp_zip_profile_index: censusZbpZipProfileSidecar,
      entity_resolution: entityResolutionSidecar,
    },
    claims: CLAIMS,
  };
  const gapLedger = {
    schema_version: `${DATASET}-gaps@1.0.0`,
    broad_business: missingBroad.map((state) => ({
      state,
      status: "missing-retained-broad-organization-layer",
      action_class: "admission-review",
      authorization_status: "not-asserted-by-this-federation",
      authority_evidence: goal.jurisdictions
        .find((row) => row.code === state)
        .categories.find((row) => row.category_id === "general-business")
        .datasets[0].authorization,
    })),
    industry_access: accessCells.filter(
      (row) =>
        row.access_evidence_status.startsWith("unsupported-") ||
        row.access_evidence_status === "restricted-query-sample-evidence",
    ),
    temporal: temporalGaps,
    special_geography: disposition
      .filter(
        (row) =>
          !row.scope_id.startsWith("state:") &&
          !row.scope_id.startsWith("territory:"),
      )
      .map((row) => ({
        scope_id: row.scope_id,
        zip5_rows: row.zip5_rows,
        action_class: "retained-reprocessing",
        map_blocked: false,
      })),
    claim_gaps: [
      { id: "all-business-denominator", value: null, blocking: false },
      {
        id: "current-general-business-operation",
        value: false,
        blocking: false,
      },
    ],
    claims: CLAIMS,
  };
  const territories = {
    schema_version: `${DATASET}-territories@1.0.0`,
    included_in_51_state_denominator: false,
    geography: disposition
      .filter((row) => row.scope_id.startsWith("territory:"))
      .map((row) => ({
        scope_id: row.scope_id,
        code: row.postal_abbreviation,
        zip5_rows: row.zip5_rows,
        dimensions: row.dimensions,
      })),
    epa: [],
    claims: CLAIMS,
  };
  await stream(input, "epa", "territories.jsonl", signal, (row) =>
    territories.epa.push(row),
  );
  check(
    territories.geography.length === 5 &&
      territories.geography.reduce((n, row) => n + row.zip5_rows, 0) === 149 &&
      territories.epa.length === 5,
    "territories",
  );
  for (const [name, type, rows] of [
    [
      "national-summary.json",
      "national-goal-evidence-summary-json",
      [summaryResult],
    ],
    [
      "state-industry-status.jsonl",
      "national-goal-state-industry-status-jsonl",
      stateIndustry,
    ],
    ["gap-ledger.json", "national-goal-gap-ledger-json", [gapLedger]],
    [
      "territories.json",
      "national-goal-territory-evidence-json",
      [territories],
    ],
  ])
    artifacts.push(
      await r.writeRows(root, output, name, type, rows, signal, hooks),
    );
  return {
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
    summary: summaryResult,
  };
}

function manifestFor(input, result, createdAt) {
  check(
    typeof createdAt === "string" &&
      new Date(createdAt).toISOString() === createdAt,
    "timestamp",
  );
  const body = {
    schema_version: VERSION,
    dataset_id: DATASET,
    status: "immutable-local-review-only",
    publication_mode: "pointer-free",
    created_at: createdAt,
    inputs: input.config.inputs,
    config_sha256: input.configRead.sha256,
    contract_sha256: input.contractHashes,
    summary: {
      zip5_cohort_rows: 48194,
      source_dimensions: 51,
      matrix_evidence_cells: 2457894,
      state_industry_rows: 459,
      gaps: result.summary.gaps,
      temporal_assessment: result.summary.temporal_assessment,
    },
    claims: CLAIMS,
    verification_scope:
      "Replays every checksum-bound retained matrix cell and joins pinned aggregate evidence. Upstream record normalization, publisher authentication and current operation are not reverified.",
    artifacts: result.artifacts,
  };
  return { release_id: `${DATASET}-${r.sha(JSON.stringify(body))}`, ...body };
}
async function inventory(directory) {
  const names = await fs.readdir(directory),
    nested = names.includes("zip-status")
      ? (await fs.readdir(path.join(directory, "zip-status"))).map(
          (name) => `zip-status/${name}`,
        )
      : [];
  return sorted([...names.filter((n) => n !== "zip-status"), ...nested]);
}

export async function buildNationalGoalEvidenceFederation(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT));
  r.stop(options.signal);
  const input = await load(root, options.configPath, options.signal),
    base = r.contained(root, `data/${DATASET}`),
    releases = path.join(base, "releases"),
    lock = path.join(base, ".build.lock");
  await fs.mkdir(releases, { recursive: true });
  await r.canonical(root, releases);
  let locked = false,
    stage;
  try {
    await fs.mkdir(lock);
    locked = true;
    stage = path.join(base, `.stage-${randomUUID()}`);
    await fs.mkdir(stage);
    const result = await derive(
        input,
        stage,
        options.signal,
        options.hooks,
        false,
      ),
      manifest = manifestFor(
        input,
        result,
        options.createdAt ?? new Date().toISOString(),
      );
    await fs.writeFile(path.join(stage, "manifest.json"), r.encoded(manifest), {
      flag: "wx",
    });
    await options.hooks?.("after-manifest-before-verification", {
      stage,
      manifest,
    });
    r.stop(options.signal);
    await verifyNationalGoalEvidenceFederation(
      path.join(stage, "manifest.json"),
      {
        root,
        configPath: options.configPath,
        signal: options.signal,
        allowStaging: true,
        expectedReleaseId: manifest.release_id,
      },
    );
    await options.hooks?.("after-verification-before-publication", {
      stage,
      manifest,
    });
    r.stop(options.signal);
    // Recheck pins and every output after hooks and before rename.
    check(
      (
        await r.secureBuffer(
          root,
          input.configRead.filename,
          100_000,
          options.signal,
        )
      ).sha256 === input.configRead.sha256,
      "publication config mutation",
    );
    for (const [name, pin] of Object.entries(input.config.inputs))
      check(
        (
          await r.secureBuffer(
            root,
            inputsPath(input, pin),
            name === "access"
              ? 10_000_000
              : name === "entity_geography"
                ? 1_000_000
                : 200_000,
            options.signal,
          )
        ).sha256 === pin.sha256,
        "publication input mutation",
      );
    for (const [p, hash] of Object.entries(input.contractHashes))
      check(
        (
          await r.secureBuffer(
            root,
            r.contained(root, p),
            200_000,
            options.signal,
          )
        ).sha256 === hash,
        "publication contract mutation",
      );
    check(
      r.equal(
        await inventory(stage),
        sorted(["manifest.json", ...manifest.artifacts.map((a) => a.path)]),
      ),
      "publication inventory mutation",
    );
    for (const a of manifest.artifacts) {
      const proof = await r.secureBuffer(
        root,
        r.contained(stage, a.path),
        100_000_000,
        options.signal,
      );
      check(
        proof.sha256 === a.sha256 && proof.bytes === a.bytes,
        "publication output mutation",
      );
    }
    check(
      (
        await r.secureBuffer(
          root,
          path.join(stage, "manifest.json"),
          200_000,
          options.signal,
        )
      ).sha256 === r.sha(r.encoded(manifest)),
      "publication manifest mutation",
    );
    const destination = path.join(releases, manifest.release_id);
    try {
      await fs.lstat(destination);
      check(false, "immutable destination already exists");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.rename(stage, destination);
    stage = null;
    return {
      releaseDirectory: destination,
      manifest,
      manifest_sha256: r.sha(r.encoded(manifest)),
    };
  } finally {
    if (stage) {
      r.contained(base, stage);
      await fs.rm(stage, { recursive: true, force: true });
    }
    if (locked) await fs.rmdir(lock);
  }
}

function inputsPath(input, pin) {
  return r.contained(input.root, pin.path);
}

export async function verifyNationalGoalEvidenceFederation(
  manifestPath,
  options = {},
) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)),
    filename = r.contained(root, manifestPath),
    proof = await json(root, filename, 200_000, options.signal),
    m = proof.value,
    directory = path.dirname(filename);
  check(
    m.schema_version === VERSION &&
      m.dataset_id === DATASET &&
      m.publication_mode === "pointer-free" &&
      r.equal(m.claims, CLAIMS),
    "manifest identity/claims",
  );
  check(
    path.basename(directory) === m.release_id ||
      (options.allowStaging === true &&
        options.expectedReleaseId === m.release_id &&
        /^\.stage-[a-f0-9-]+$/.test(path.basename(directory))),
    "immutable/staging location",
  );
  const expectedInventory = sorted([
    "manifest.json",
    "national-summary.json",
    "state-industry-status.jsonl",
    "gap-ledger.json",
    "territories.json",
    ...Array.from(
      { length: 100 },
      (_, i) => `zip-status/prefix=${String(i).padStart(2, "0")}.jsonl.gz`,
    ),
  ]);
  check(
    r.equal(await inventory(directory), expectedInventory),
    "closed output inventory",
  );
  const input = await load(root, options.configPath, options.signal);
  check(
    r.equal(
      m.summary?.temporal_assessment,
      input.summary.temporal_qualification,
    ),
    `${input.version} temporal projection manifest pin`,
  );
  const replay = await fs.mkdtemp(
    path.join(path.dirname(directory), ".verify-"),
  );
  try {
    const result = await derive(input, replay, options.signal),
      expected = manifestFor(input, result, m.created_at);
    check(r.equal(m, expected), "independent semantic reconstruction");
    for (const a of expected.artifacts) {
      const actual = await r.secureBuffer(
        root,
        r.contained(directory, a.path),
        100_000_000,
        options.signal,
      );
      check(
        actual.sha256 === a.sha256 && actual.bytes === a.bytes,
        `artifact replay ${a.path}`,
      );
    }
    check(
      (await r.secureBuffer(root, filename, 200_000, options.signal)).sha256 ===
        proof.sha256,
      "manifest changed",
    );
    return {
      verified: true,
      release_id: m.release_id,
      manifest_sha256: proof.sha256,
      ...m.summary,
      claims: m.claims,
    };
  } finally {
    r.contained(root, replay);
    await fs.rm(replay, { recursive: true, force: true });
  }
}
