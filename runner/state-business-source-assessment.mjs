import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateStateBusinessSourceDiscoveryQueue } from "../scripts/check-state-business-source-discovery.mjs";
import { APP_ROOT } from "./paths.mjs";
import {
  DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
  STATE_BUSINESS_SOURCE_REVALIDATION_ID,
  validateStateBusinessSourceRevalidation,
} from "./state-business-source-revalidation.mjs";

export const STATE_BUSINESS_SOURCE_ASSESSMENT_SCHEMA_VERSION = "1.0.0";
export const STATE_BUSINESS_SOURCE_ASSESSMENT_CATALOG_ID = "state-business-source-assessment-catalog-queue-7-2026-09-03";
const STATE_BUSINESS_SOURCE_ASSESSMENT_CONTENT_DIGEST = "703121d5e2ac4f2343406cdfb2f5683cc98f03411ed378730a465ade123d1d45";
export const DEFAULT_STATE_BUSINESS_SOURCE_DISCOVERY_QUEUE_PATHS = Object.freeze([
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-4.json"),
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json"),
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json"),
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-5.json"),
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-6.json"),
  path.join(APP_ROOT, "config", "state-business-source-discovery-queue-7.json"),
]);

const SOURCE_ARTIFACT_SPECS = Object.freeze([
  Object.freeze({
    artifact_id: STATE_BUSINESS_SOURCE_REVALIDATION_ID,
    artifact_kind: "revalidation",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["CA", "GA", "OK", "NE", "VT"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-4-wave-1-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["ID", "NM", "ME", "WY"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-4-wave-2-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["NH", "MT", "RI", "SD"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-4-wave-3-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["WV", "ND", "DC", "AK"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-5-wave-1-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["OH", "NC", "NJ", "VA"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-6-wave-1-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["MI", "TN", "MA", "AZ"]),
  }),
  Object.freeze({
    artifact_id: "state-business-source-discovery-queue-7-wave-1-2026-09-03",
    artifact_kind: "source-discovery",
    observed_at: "2026-09-03",
    coverage_release_id: STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID,
    state_abbreviations: Object.freeze(["MD", "MO", "IN", "SC"]),
  }),
]);
const EXPECTED_SOURCE_ARTIFACTS = Object.freeze(SOURCE_ARTIFACT_SPECS.map((artifact) => Object.freeze({
  artifact_id: artifact.artifact_id,
  artifact_kind: artifact.artifact_kind,
  observed_at: artifact.observed_at,
  coverage_release_id: artifact.coverage_release_id,
})));
const EXPECTED_STATE_SCOPE = Object.freeze(SOURCE_ARTIFACT_SPECS.flatMap((artifact) => artifact.state_abbreviations));
const EXPECTED_STATE_PROVENANCE = Object.freeze(Object.fromEntries(SOURCE_ARTIFACT_SPECS.flatMap((artifact) => artifact.state_abbreviations.map((stateAbbreviation) => [
  stateAbbreviation,
  Object.freeze({
    assessment_id: artifact.artifact_id,
    assessment_kind: artifact.artifact_kind,
    observed_at: artifact.observed_at,
    coverage_release_id: artifact.coverage_release_id,
  }),
]))));
const BOUNDED_CONNECTOR_STATES = new Set(["DC", "AK"]);
const EXPECTED_AUTHORITY_BY_STATE = Object.freeze(Object.fromEntries(EXPECTED_STATE_SCOPE.map((stateAbbreviation) => {
  const boundedConnectorAuthorized = BOUNDED_CONNECTOR_STATES.has(stateAbbreviation);
  return [stateAbbreviation, Object.freeze({
    authorized_next_action_type: boundedConnectorAuthorized ? "bounded-connector-implementation" : "written-preflight-inquiry",
    bounded_connector_implementation_authorized: boundedConnectorAuthorized,
    autonomous_acquisition_authorized: false,
    paid_acquisition_authorized: false,
    complete_source_acquisition_authorized: false,
    row_bearing_preflight_authorized: false,
    offline_fixture_connector_authorized: boundedConnectorAuthorized,
    production_ready: false,
    broad_layer_production_ready: false,
  })];
})));

function fail(message) {
  throw new Error(`State business-source assessment catalog is invalid: ${message}`);
}

function exactDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeAuthorityFields(state) {
  const boundedConnectorAuthorized = BOUNDED_CONNECTOR_STATES.has(state.state_abbreviation);
  return {
    ...structuredClone(state),
    authorized_next_action_type: state.authorized_next_action_type ?? (boundedConnectorAuthorized ? "bounded-connector-implementation" : "written-preflight-inquiry"),
    bounded_connector_implementation_authorized: state.bounded_connector_implementation_authorized ?? boundedConnectorAuthorized,
    autonomous_acquisition_authorized: state.autonomous_acquisition_authorized ?? false,
    paid_acquisition_authorized: state.paid_acquisition_authorized ?? false,
    complete_source_acquisition_authorized: state.complete_source_acquisition_authorized ?? false,
    row_bearing_preflight_authorized: state.row_bearing_preflight_authorized ?? false,
    offline_fixture_connector_authorized: state.offline_fixture_connector_authorized ?? boundedConnectorAuthorized,
    production_ready: state.production_ready ?? false,
    broad_layer_production_ready: state.broad_layer_production_ready ?? false,
    candidate: {
      ...structuredClone(state.candidate),
      price: state.candidate?.price ?? state.candidate?.published_price ?? "Unknown; no price is published",
    },
  };
}

function normalizeRevalidation(document) {
  return document.states.map((state) => ({
    ...normalizeAuthorityFields(state),
    assessment_id: document.revalidation_id,
    assessment_kind: "revalidation",
    observed_at: document.observed_at,
    coverage_release_id: document.coverage_release_id,
  }));
}

function normalizeDiscovery(queue) {
  return queue.states.map((state) => ({
    ...normalizeAuthorityFields(state),
    assessment_id: queue.queue_id,
    assessment_kind: "source-discovery",
    observed_at: queue.observed_at,
    coverage_release_id: queue.coverage_release_id,
    prior_decision: null,
    changed_since_prior_review: false,
  }));
}

export function validateStateBusinessSourceAssessmentCatalog(catalog) {
  if (catalog?.schema_version !== STATE_BUSINESS_SOURCE_ASSESSMENT_SCHEMA_VERSION) fail("unsupported schema version");
  if (catalog?.assessment_catalog_id !== STATE_BUSINESS_SOURCE_ASSESSMENT_CATALOG_ID) fail("catalog identity drifted");
  if (!exactDate(catalog?.observed_at) || !catalog.assessment_catalog_id.endsWith(catalog.observed_at)) fail("catalog date is invalid");
  if (catalog?.coverage_release_id !== STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID) fail("coverage release is not pinned");
  if (!Array.isArray(catalog?.source_artifacts) || JSON.stringify(catalog.source_artifacts) !== JSON.stringify(EXPECTED_SOURCE_ARTIFACTS)) fail("source artifact descriptors drifted");
  if (!Array.isArray(catalog?.states) || JSON.stringify(catalog.states.map((state) => state.state_abbreviation)) !== JSON.stringify(EXPECTED_STATE_SCOPE)) fail("state scope or order drifted");
  if (new Set(catalog.states.map((state) => state.state_abbreviation)).size !== catalog.states.length) fail("state assessments overlap");

  for (const state of catalog.states) {
    const expectedProvenance = EXPECTED_STATE_PROVENANCE[state.state_abbreviation];
    if (state.assessment_id !== expectedProvenance?.assessment_id || state.assessment_kind !== expectedProvenance?.assessment_kind) fail(`${state.state_abbreviation} assessment provenance is invalid`);
    if (state.observed_at !== expectedProvenance.observed_at || state.coverage_release_id !== expectedProvenance.coverage_release_id) fail(`${state.state_abbreviation} assessment date or coverage pin is invalid`);
    const expectedAuthority = EXPECTED_AUTHORITY_BY_STATE[state.state_abbreviation];
    const boundedConnectorAuthorized = expectedAuthority.bounded_connector_implementation_authorized;
    const expectedDecision = boundedConnectorAuthorized ? "proceed-to-bounded-connector" : "hold";
    if (state.decision !== expectedDecision || Object.entries(expectedAuthority).some(([field, value]) => state[field] !== value)) fail(`${state.state_abbreviation} authorization boundary drifted`);
    if (!state.candidate?.publisher || !state.candidate?.product || !state.candidate?.availability || !state.candidate?.price) fail(`${state.state_abbreviation} candidate is incomplete`);
    if (!Array.isArray(state.unresolved_gates) || state.unresolved_gates.length === 0 || !Array.isArray(state.official_urls) || state.official_urls.length < 2 || !state.strongest_bounded_next_action) fail(`${state.state_abbreviation} decision evidence is incomplete`);
  }
  const contentDigest = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
  if (contentDigest !== STATE_BUSINESS_SOURCE_ASSESSMENT_CONTENT_DIGEST) fail("catalog content digest drifted");
  return catalog;
}

export async function loadStateBusinessSourceAssessmentCatalog(
  revalidationPath = DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  discoveryQueuePaths = DEFAULT_STATE_BUSINESS_SOURCE_DISCOVERY_QUEUE_PATHS,
) {
  const [revalidationText, ...queueTexts] = await Promise.all([
    readFile(revalidationPath, "utf8"),
    ...discoveryQueuePaths.map((queuePath) => readFile(queuePath, "utf8")),
  ]);
  const revalidation = validateStateBusinessSourceRevalidation(JSON.parse(revalidationText));
  const discoveryQueues = queueTexts.map((text) => validateStateBusinessSourceDiscoveryQueue(JSON.parse(text)));
  const sourceArtifacts = [
    {
      artifact_id: revalidation.revalidation_id,
      artifact_kind: "revalidation",
      observed_at: revalidation.observed_at,
      coverage_release_id: revalidation.coverage_release_id,
    },
    ...discoveryQueues.map((queue) => ({
      artifact_id: queue.queue_id,
      artifact_kind: "source-discovery",
      observed_at: queue.observed_at,
      coverage_release_id: queue.coverage_release_id,
    })),
  ];
  const catalog = {
    schema_version: STATE_BUSINESS_SOURCE_ASSESSMENT_SCHEMA_VERSION,
    assessment_catalog_id: STATE_BUSINESS_SOURCE_ASSESSMENT_CATALOG_ID,
    observed_at: sourceArtifacts.map((artifact) => artifact.observed_at).sort().at(-1),
    coverage_release_id: revalidation.coverage_release_id,
    source_artifacts: sourceArtifacts,
    states: (() => {
      const states = normalizeRevalidation(revalidation);
      const seen = new Set(states.map((state) => state.state_abbreviation));
      for (const queue of discoveryQueues) {
        for (const state of normalizeDiscovery(queue)) {
          if (seen.has(state.state_abbreviation)) continue;
          seen.add(state.state_abbreviation);
          states.push(state);
        }
      }
      return states;
    })(),
  };
  return validateStateBusinessSourceAssessmentCatalog(catalog);
}

export function indexStateBusinessSourceAssessments(catalog) {
  const validated = validateStateBusinessSourceAssessmentCatalog(catalog);
  return new Map(validated.states.map((state) => [state.state_abbreviation, structuredClone(state)]));
}

export function summarizeStateBusinessSourceAssessments(catalog, currentCoverageReleaseId = null) {
  const validated = validateStateBusinessSourceAssessmentCatalog(catalog);
  return {
    schema_version: validated.schema_version,
    assessment_catalog_id: validated.assessment_catalog_id,
    revalidation_id: STATE_BUSINESS_SOURCE_REVALIDATION_ID,
    observed_at: validated.observed_at,
    coverage_release_id: validated.coverage_release_id,
    current_coverage_release_id: currentCoverageReleaseId,
    coverage_release_matches_current: currentCoverageReleaseId ? validated.coverage_release_id === currentCoverageReleaseId : null,
    source_artifact_ids: validated.source_artifacts.map((artifact) => artifact.artifact_id),
    jurisdictions_assessed: validated.states.length,
    jurisdictions_revalidated: validated.states.filter((state) => state.assessment_kind === "revalidation").length,
    jurisdictions_discovered: validated.states.filter((state) => state.assessment_kind === "source-discovery").length,
    hold_decisions: validated.states.filter((state) => state.decision === "hold").length,
    bounded_connector_decisions: validated.states.filter((state) => state.decision === "proceed-to-bounded-connector").length,
    changed_decisions: validated.states.filter((state) => state.changed_since_prior_review).length,
    autonomous_acquisitions_authorized: validated.states.filter((state) => state.autonomous_acquisition_authorized).length,
    production_ready_jurisdictions: validated.states.filter((state) => state.production_ready).length,
  };
}

export function summarizeLegacyStateBusinessSourceRevalidation(catalog, currentCoverageReleaseId = null) {
  const validated = validateStateBusinessSourceAssessmentCatalog(catalog);
  const artifact = validated.source_artifacts.find((candidate) => candidate.artifact_id === STATE_BUSINESS_SOURCE_REVALIDATION_ID);
  const states = validated.states.filter((state) => state.assessment_kind === "revalidation");
  return {
    schema_version: validated.schema_version,
    revalidation_id: artifact.artifact_id,
    observed_at: artifact.observed_at,
    coverage_release_id: artifact.coverage_release_id,
    current_coverage_release_id: currentCoverageReleaseId,
    coverage_release_matches_current: currentCoverageReleaseId ? artifact.coverage_release_id === currentCoverageReleaseId : null,
    jurisdictions_revalidated: states.length,
    hold_decisions: states.filter((state) => state.decision === "hold").length,
    bounded_connector_decisions: states.filter((state) => state.decision === "proceed-to-bounded-connector").length,
    changed_decisions: states.filter((state) => state.changed_since_prior_review).length,
    autonomous_acquisitions_authorized: states.filter((state) => state.autonomous_acquisition_authorized).length,
    production_ready_jurisdictions: states.filter((state) => state.production_ready).length,
  };
}
