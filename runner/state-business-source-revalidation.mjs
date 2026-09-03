import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const STATE_BUSINESS_SOURCE_REVALIDATION_SCHEMA_VERSION = "1.0.0";
export const STATE_BUSINESS_SOURCE_REVALIDATION_ID = "state-business-source-revalidation-2026-09-03";
export const STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID = "national-business-coverage-views-20260902-115337634Z-ba689784";
export const DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH = path.join(
  APP_ROOT,
  "config",
  "state-business-source-revalidation-2026-09-03.json",
);

const REQUIRED_ZERO_CONTROLS = Object.freeze([
  "accounts_created",
  "terms_accepted",
  "purchases_made",
  "complete_bulk_downloads",
  "record_enumerations",
  "portal_automations",
  "access_controls_bypassed",
  "source_releases_published",
  "production_pointers_changed",
]);

const ALLOWED_DECISIONS = new Set(["hold", "proceed-to-bounded-connector"]);
const ALLOWED_GATES = new Set([
  "source-scope",
  "schema",
  "stable-identifier",
  "status-codebook",
  "address-role",
  "change-contract",
  "automation",
  "rights",
  "privacy",
  "platform-migration",
  "large-acquisition-authorization",
]);
const EXPECTED_STATE_SCOPE = Object.freeze(["CA", "GA", "OK", "NE", "VT"]);
const EXPECTED_ASSIGNMENTS = Object.freeze([
  Object.freeze({ state_abbreviation: "CA", worker: "Mill", ran_in_parallel: true }),
  Object.freeze({ state_abbreviation: "GA", worker: "Gauss", ran_in_parallel: true }),
  Object.freeze({ state_abbreviation: "OK", worker: "root", ran_in_parallel: true }),
  Object.freeze({ state_abbreviation: "NE", worker: "Mill", ran_in_parallel: true }),
  Object.freeze({ state_abbreviation: "VT", worker: "Confucius", ran_in_parallel: true }),
]);
const EXPECTED_PARALLEL_WAVES = Object.freeze([
  Object.freeze({
    wave_id: "wave-1",
    concurrent_state_abbreviations: Object.freeze(["VT", "NE", "GA", "OK"]),
    overlap_evidence: "Vermont, Nebraska, and Georgia agents were active while the root Oklahoma workstream inspected the official pages.",
  }),
  Object.freeze({
    wave_id: "wave-2",
    concurrent_state_abbreviations: Object.freeze(["CA", "VT", "GA", "OK"]),
    overlap_evidence: "After Nebraska completed, California was dispatched while Vermont, Georgia, and the root Oklahoma workstream were still active.",
  }),
]);
const FORBIDDEN_OPERATIONS = Object.freeze([
  "account-creation",
  "terms-acceptance",
  "purchase",
  "record-level-request",
  "record-enumeration",
  "portal-automation",
  "complete-bulk-download",
  "connector-implementation",
  "source-release-publication",
  "registry-rebuild",
  "coverage-publication",
  "heatmap-admission",
  "production-pointer-change",
]);
const REQUIRED_EXCLUDED_DATA_CLASSES = Object.freeze([
  "registered-agent-and-service-address",
  "natural-person-name-role-and-address",
  "direct-contact-and-signature",
  "tax-payment-financial-and-government-identifiers",
  "filing-image-document-and-free-text",
]);
const EXPECTED_GATES = Object.freeze({
  CA: Object.freeze(["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"]),
  GA: Object.freeze(["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"]),
  OK: Object.freeze(["stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"]),
  NE: Object.freeze(["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy", "platform-migration"]),
  VT: Object.freeze(["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"]),
});
const EXPECTED_CANDIDATES = Object.freeze({
  CA: Object.freeze({ publisher: "California Secretary of State", product: "bizfile Business Entity Master Unload and Weekly Data", availability: "authenticated portal order; current public contract incomplete", price: "$100 master unload; weekly data listed at no charge" }),
  GA: Object.freeze({ publisher: "Georgia Secretary of State", product: "Georgia Corporations List", availability: "paid one-time or annual secure-FTP product; contract incomplete", price: "$500 one-time extract or $5,000 annual weekly subscription" }),
  OK: Object.freeze({ publisher: "Oklahoma Secretary of State", product: "Business Entities Bulk Orders", availability: "paid authenticated web download; public 19-record layout", price: "$500 monthly master; $150 weekly filing update" }),
  NE: Object.freeze({ publisher: "Nebraska Secretary of State through Nebraska.gov", product: "Corporate Records Batch", availability: "paid recurring full FTP set; replacement platform pending before end of 2026", price: "$300 weekly, $500 twice monthly, or $800 monthly plus $100 annual subscriber fee and six-month minimum" }),
  VT: Object.freeze({ publisher: "Vermont Secretary of State", product: "Business Services bulk download", availability: "current portal route exists; actual file access and contract undocumented", price: "Unknown under current post-2025 statutory authority" }),
});
const EXPECTED_COVERAGE = Object.freeze({
  CA: Object.freeze({ reported_profiles: 1762569, coordinate_profiles: 555130, nonemployer_baseline_2023: 3537469, baseline_minus_profiles: 1774900, diagnostic_profile_percent: 49.8, material_zctas: 1808, zctas_with_record_level_evidence: 1807 }),
  GA: Object.freeze({ reported_profiles: 235468, coordinate_profiles: 11900, nonemployer_baseline_2023: 1163944, baseline_minus_profiles: 928476, diagnostic_profile_percent: 20.2, material_zctas: 752, zctas_with_record_level_evidence: 751 }),
  OK: Object.freeze({ reported_profiles: 78908, coordinate_profiles: 5178, nonemployer_baseline_2023: 327441, baseline_minus_profiles: 248533, diagnostic_profile_percent: 24.1, material_zctas: 667, zctas_with_record_level_evidence: 665 }),
  NE: Object.freeze({ reported_profiles: 52111, coordinate_profiles: 2577, nonemployer_baseline_2023: 154971, baseline_minus_profiles: 102860, diagnostic_profile_percent: 33.6, material_zctas: 592, zctas_with_record_level_evidence: 590 }),
  VT: Object.freeze({ reported_profiles: 11833, coordinate_profiles: 885, nonemployer_baseline_2023: 65028, baseline_minus_profiles: 53195, diagnostic_profile_percent: 18.2, material_zctas: 266, zctas_with_record_level_evidence: 264 }),
});
const EXPECTED_OFFICIAL_URLS = Object.freeze({
  CA: Object.freeze([
    "https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records",
    "https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf",
    "https://bizfileonline.sos.ca.gov/",
    "https://www.sos.ca.gov/business-programs/bizfile/privacy-warning-terms-and-conditions-use",
    "https://www.sos.ca.gov/business-programs/business-entities/cbs-field-status-definitions",
  ]),
  GA: Object.freeze([
    "https://sos.ga.gov/index.php/corporations",
    "https://georgiasecretaryofstate.net/collections/corporations-list/products/annual-subscription-for-a-weekly-extract-of-the-georgia-corporations-list",
    "https://georgiasecretaryofstate.net/collections/corporations-list/products/idm",
    "https://sos.ga.gov/page/georgia-corporations-active-entities-report",
    "https://georgiasecretaryofstate.net/policies/terms-of-service",
  ]),
  OK: Object.freeze([
    "https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx",
    "https://www.sos.ok.gov/corp/bulkorder/BulkOrderFileLayoutLegalEntity.htm",
    "https://www.sos.ok.gov/corp/bulkorder/CORP_WKLY_070422.txt",
    "https://www.sos.ok.gov/feedback/disclaimer.aspx",
  ]),
  NE: Object.freeze([
    "https://www.nebraska.gov/subscriber/",
    "https://www.nebraska.gov/subscriber/pdf/corp-data-bulk-contract.pdf",
    "https://nebraskalegislature.gov/laws/statutes.php?statute=33-101",
    "https://sos.nebraska.gov/new-online-business-filing-system",
    "https://www.nebraska.gov/policies/",
  ]),
  VT: Object.freeze([
    "https://bizfilings.vermont.gov/bulk-download",
    "https://legislature.vermont.gov/Documents/2026/Workgroups/House%20Energy%20and%20Digital/Data/W~Lauren%20Hibbert~Transparency%20and%20Accessibility%20of%20SOS%20Data~4-29-2025.pdf",
    "https://legislature.vermont.gov/Documents/2026/Workgroups/Senate%20Institutions/State%20Agencies/Secretary%20of%20State/W~Sarah%20Copeland%20Hanzas~Senate%20Institutions%20Presentation%20-%20Secretary%20Of%20State%20Data~2-17-2026.pdf",
    "https://legislature.vermont.gov/statutes/section/03/005/00118",
    "https://legislature.vermont.gov/statutes/section/01/005/00316",
  ]),
});

function fail(message) {
  throw new Error(`State business-source revalidation is invalid: ${message}`);
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function exactDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function roundedPercent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

export function validateStateBusinessSourceRevalidation(document) {
  if (document?.schema_version !== STATE_BUSINESS_SOURCE_REVALIDATION_SCHEMA_VERSION) fail("unsupported schema version");
  if (document?.revalidation_id !== STATE_BUSINESS_SOURCE_REVALIDATION_ID) fail("invalid revalidation identity");
  if (!exactDate(document?.observed_at) || !document.revalidation_id.endsWith(document.observed_at)) fail("observation date is invalid or does not match the identity");
  if (document?.coverage_release_id !== STATE_BUSINESS_SOURCE_REVALIDATION_COVERAGE_RELEASE_ID) fail("coverage release is not pinned to the reviewed production release");
  if (document?.controls?.official_primary_sources_only !== true || document.controls.record_level_data_requested !== false) fail("official-source or no-record boundary is missing");
  for (const field of REQUIRED_ZERO_CONTROLS) if (document.controls?.[field] !== 0) fail(`${field} must remain zero`);
  if (JSON.stringify(document?.forbidden_operations) !== JSON.stringify(FORBIDDEN_OPERATIONS)) fail("forbidden operation boundary drifted");
  if (JSON.stringify(document?.required_excluded_data_classes) !== JSON.stringify(REQUIRED_EXCLUDED_DATA_CLASSES)) fail("machine-readable privacy boundary drifted");
  if (document?.parallel_execution?.non_overlapping_state_assignments !== true) fail("parallel state assignments must be non-overlapping");
  if (document.parallel_execution?.maximum_active_workstreams !== 4) fail("parallel workstream limit drifted");
  const assignments = document.parallel_execution?.assignments;
  if (JSON.stringify(assignments) !== JSON.stringify(EXPECTED_ASSIGNMENTS)) fail("parallel assignments drifted");
  const assignedStates = assignments.map((assignment) => assignment?.state_abbreviation);
  if (new Set(assignedStates).size !== assignedStates.length) fail("parallel assignments overlap a state");
  const waves = document.parallel_execution?.waves;
  if (!Array.isArray(waves) || waves.length !== EXPECTED_PARALLEL_WAVES.length) fail("parallel wave evidence is missing");
  for (const [index, wave] of waves.entries()) {
    const expected = EXPECTED_PARALLEL_WAVES[index];
    if (wave?.wave_id !== expected.wave_id
        || JSON.stringify(wave.concurrent_state_abbreviations) !== JSON.stringify(expected.concurrent_state_abbreviations)
        || wave.overlap_evidence !== expected.overlap_evidence
        || wave.concurrent_state_abbreviations.length > document.parallel_execution.maximum_active_workstreams) fail(`parallel ${expected.wave_id} evidence drifted`);
  }
  if (!Array.isArray(document?.states) || document.states.length !== assignedStates.length) fail("state count does not match parallel assignments");

  let previousGap = Number.POSITIVE_INFINITY;
  const seen = new Set();
  for (const [index, state] of document.states.entries()) {
    if (state.rank !== index + 1 || state.state_abbreviation !== EXPECTED_STATE_SCOPE[index] || !nonblank(state.state_name)) fail(`state rank ${index + 1} is invalid`);
    if (seen.has(state.state_abbreviation) || !assignedStates.includes(state.state_abbreviation)) fail(`state ${state.state_abbreviation} is duplicated or unassigned`);
    seen.add(state.state_abbreviation);
    if (!ALLOWED_DECISIONS.has(state.decision) || !ALLOWED_DECISIONS.has(state.prior_decision) || state.decision !== "hold" || state.prior_decision !== "hold") fail(`${state.state_abbreviation} decision is invalid`);
    if (state.changed_since_prior_review !== (state.decision !== state.prior_decision)) fail(`${state.state_abbreviation} change flag does not reconcile`);
    const bounded = state.decision === "proceed-to-bounded-connector";
    if (state.autonomous_acquisition_authorized !== false
        || state.paid_acquisition_authorized !== false
        || state.complete_source_acquisition_authorized !== false
        || state.row_bearing_preflight_authorized !== false
        || state.offline_fixture_connector_authorized !== false
        || state.production_ready !== false
        || state.bounded_connector_implementation_authorized !== bounded) fail(`${state.state_abbreviation} authorization boundary drifted`);
    if (JSON.stringify(state.candidate) !== JSON.stringify(EXPECTED_CANDIDATES[state.state_abbreviation])) fail(`${state.state_abbreviation} candidate identity drifted`);
    const coverage = state.current_coverage;
    for (const field of ["reported_profiles", "coordinate_profiles", "nonemployer_baseline_2023", "material_zctas", "zctas_with_record_level_evidence"]) {
      if (!Number.isSafeInteger(coverage?.[field]) || coverage[field] < 0) fail(`${state.state_abbreviation} ${field} is invalid`);
    }
    if (!Number.isSafeInteger(coverage?.baseline_minus_profiles) || coverage.baseline_minus_profiles !== coverage.nonemployer_baseline_2023 - coverage.reported_profiles) fail(`${state.state_abbreviation} diagnostic gap does not reconcile`);
    if (coverage.diagnostic_profile_percent !== roundedPercent(coverage.reported_profiles, coverage.nonemployer_baseline_2023)) fail(`${state.state_abbreviation} diagnostic percent does not reconcile`);
    if (coverage.coordinate_profiles > coverage.reported_profiles || coverage.zctas_with_record_level_evidence > coverage.material_zctas) fail(`${state.state_abbreviation} coverage subset exceeds its denominator`);
    if (coverage.baseline_minus_profiles > previousGap) fail("states are not ranked by descending diagnostic gap");
    previousGap = coverage.baseline_minus_profiles;
    if (JSON.stringify(coverage) !== JSON.stringify(EXPECTED_COVERAGE[state.state_abbreviation])) fail(`${state.state_abbreviation} pinned coverage evidence drifted`);
    if (JSON.stringify(state.official_urls) !== JSON.stringify(EXPECTED_OFFICIAL_URLS[state.state_abbreviation])) fail(`${state.state_abbreviation} official evidence URLs drifted`);
    if (!Array.isArray(state.observed_evidence) || state.observed_evidence.length < 4 || state.observed_evidence.some((value) => !nonblank(value))) fail(`${state.state_abbreviation} observed evidence is incomplete`);
    if (!Array.isArray(state.unresolved_gates) || state.unresolved_gates.some((gate) => !ALLOWED_GATES.has(gate)) || JSON.stringify(state.unresolved_gates) !== JSON.stringify(EXPECTED_GATES[state.state_abbreviation])) fail(`${state.state_abbreviation} unresolved gates are invalid`);
    if (!Array.isArray(state.required_exclusions) || state.required_exclusions.length < 4 || state.required_exclusions.some((value) => !nonblank(value))) fail(`${state.state_abbreviation} privacy exclusions are incomplete`);
    if (!nonblank(state.strongest_bounded_next_action) || !/^(Obtain|Request)\b/.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action is missing or not a written preflight`);
    if (!bounded && !/\bDo not\b.*\b(before|first)\b/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} hold boundary is not explicit`);
    if (bounded && !/explicit authorization/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} bounded decision omits the full-acquisition gate`);
  }
  return document;
}

export function indexStateBusinessSourceRevalidation(document) {
  const validated = validateStateBusinessSourceRevalidation(document);
  return new Map(validated.states.map((state) => [state.state_abbreviation, state]));
}

export function summarizeStateBusinessSourceRevalidation(document, currentCoverageReleaseId = null) {
  const validated = validateStateBusinessSourceRevalidation(document);
  return {
    schema_version: validated.schema_version,
    revalidation_id: validated.revalidation_id,
    observed_at: validated.observed_at,
    coverage_release_id: validated.coverage_release_id,
    current_coverage_release_id: currentCoverageReleaseId,
    coverage_release_matches_current: currentCoverageReleaseId ? validated.coverage_release_id === currentCoverageReleaseId : null,
    jurisdictions_revalidated: validated.states.length,
    hold_decisions: validated.states.filter((state) => state.decision === "hold").length,
    bounded_connector_decisions: validated.states.filter((state) => state.decision === "proceed-to-bounded-connector").length,
    changed_decisions: validated.states.filter((state) => state.changed_since_prior_review).length,
    autonomous_acquisitions_authorized: validated.states.filter((state) => state.autonomous_acquisition_authorized).length,
    production_ready_jurisdictions: validated.states.filter((state) => state.production_ready).length,
  };
}

export async function loadStateBusinessSourceRevalidation(filename = DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH) {
  if (filename === null) return null;
  return validateStateBusinessSourceRevalidation(JSON.parse(await readFile(filename, "utf8")));
}
