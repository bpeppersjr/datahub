import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  loadStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceRevalidation,
} from "../runner/state-business-source-revalidation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATHS = [
  path.join(ROOT, "config", "state-business-source-discovery-queue-4.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-5.json"),
];
const CURRENT_COVERAGE_POINTER_PATH = path.join(ROOT, "data", "business-coverage-views", "current.json");
const EXPECTED_COVERAGE_RELEASE_ID = "national-business-coverage-views-20260902-115337634Z-ba689784";
const QUEUE_SCOPES = new Map([
  ["state-business-source-discovery-queue-4-wave-1-2026-09-03", { scope: ["ID", "NM", "ME", "WY"] }],
  ["state-business-source-discovery-queue-4-wave-2-2026-09-03", { scope: ["NH", "MT", "RI", "SD"] }],
  ["state-business-source-discovery-queue-4-wave-3-2026-09-03", {
    scope: ["VT", "WV", "ND", "DC", "AK"],
    decisions: ["hold", "hold", "hold", "proceed-to-bounded-connector", "proceed-to-bounded-connector"],
    gates: {
      DC: ["stable-identifier", "address-role", "change-contract", "large-acquisition-authorization"],
      AK: ["source-scope", "stable-identifier", "status-codebook", "change-contract", "rights", "large-acquisition-authorization"],
    },
  }],
]);
const REQUIRED_GATES = ["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"];
const ZERO_ACTION_CONTROLS = ["accounts_created", "terms_accepted", "purchases_made", "completed_bulk_record_downloads", "broad_portal_queries", "access_controls_bypassed", "production_pointers_changed"];
const WAVE_3_ALLOWED_OPERATIONS = ["metadata-and-aggregate-preflight", "bounded-header-preflight", "offline-fixture-validation-and-local-review-release"];
const WAVE_3_FORBIDDEN_OPERATIONS = ["complete-source-acquisition", "paid-acquisition", "live-source-release-publication", "production-registry-rebuild", "coverage-publication", "heatmap-admission", "production-pointer-change"];
const QUEUE_5_FORBIDDEN_OPERATIONS = ["account-creation", "terms-acceptance", "purchase", "record-level-request", "record-enumeration", "portal-automation", "complete-bulk-download", "connector-implementation", "source-release-publication", "registry-rebuild", "coverage-publication", "heatmap-admission", "production-pointer-change"];
const QUEUE_5_EXCLUDED_DATA_CLASSES = ["registered-agent-and-service-address", "natural-person-name-role-and-address", "direct-contact-and-signature", "tax-payment-financial-and-government-identifiers", "filing-image-document-and-free-text"];
const QUEUE_5_ASSIGNMENTS = [
  { state_abbreviation: "OH", worker: "Confucius", ran_in_parallel: true },
  { state_abbreviation: "NC", worker: "Mill", ran_in_parallel: true },
  { state_abbreviation: "NJ", worker: "Gauss", ran_in_parallel: true },
  { state_abbreviation: "VA", worker: "root", ran_in_parallel: true },
];
const QUEUE_5_WAVES = [{
  wave_id: "queue-5-wave-1",
  concurrent_state_abbreviations: ["OH", "NC", "NJ", "VA"],
  overlap_evidence: "Ohio, North Carolina, and New Jersey agents were active while the root Virginia workstream inspected official sources.",
}];
const QUEUE_5_CANDIDATES = {
  OH: { publisher: "Ohio Secretary of State", product: "Business Filing Data", availability: "paid one-time FTP order; recurring delivery requires a separate unpublished contract", price: "$62.50 one-time FTP; weekly or monthly price is unpublished" },
  NC: { publisher: "North Carolina Secretary of State", product: "Business Registration Division Master Files Subscription — Core export", availability: "paid weekly relational CSV snapshot over FTP; current contract and data contract are unpublished", price: "$750 setup plus $2,000 per North Carolina state fiscal year" },
  NJ: { publisher: "New Jersey Division of Revenue and Enterprise Services", product: "Bulk Access Status Reports — line item 01000000", availability: "written paid bulk request with quoted FTP, email, disk, or paper delivery and optional ongoing updates", price: "$0.0185 per record plus any quoted media or payment charges" },
  VA: { publisher: "Virginia State Corporation Commission Office of the Clerk", product: "requested business-entity structured-data extract", availability: "discretionary structured-data request with reasonable fees; no documented recurring product or public bulk file", price: "Unknown; reasonable database or structured-data fees may be quoted" },
};
const QUEUE_5_COVERAGE = {
  OH: { reported_profiles: 163604, coordinate_profiles: 12926, nonemployer_baseline_2023: 909227, baseline_minus_profiles: 745623, diagnostic_profile_percent: 18, material_zctas: 1234, zctas_with_record_level_evidence: 1220 },
  NC: { reported_profiles: 175876, coordinate_profiles: 11346, nonemployer_baseline_2023: 920236, baseline_minus_profiles: 744360, diagnostic_profile_percent: 19.1, material_zctas: 853, zctas_with_record_level_evidence: 849 },
  NJ: { reported_profiles: 156337, coordinate_profiles: 8251, nonemployer_baseline_2023: 883628, baseline_minus_profiles: 727291, diagnostic_profile_percent: 17.7, material_zctas: 603, zctas_with_record_level_evidence: 603 },
  VA: { reported_profiles: 116537, coordinate_profiles: 8316, nonemployer_baseline_2023: 740321, baseline_minus_profiles: 623784, diagnostic_profile_percent: 15.7, material_zctas: 908, zctas_with_record_level_evidence: 902 },
};
const QUEUE_5_URLS = {
  OH: ["https://www.ohiosos.gov/business/business-filing-forms", "https://www.ohiosos.gov/assets/200.pdf", "https://www.ohiosos.gov/business/business-reports", "https://www.ohiosos.gov/business/ohio-business-roadmap/frequently-asked-questions", "https://codes.ohio.gov/ohio-revised-code/section-1706.161", "https://codes.ohio.gov/ohio-revised-code/section-149.43/9-30-2025", "https://www.ohiosos.gov/privacy-statement"],
  NC: ["https://www.sosnc.gov/online_services/data_subscriptions/about_the_data", "https://www.sosnc.gov/manual/assets/sos/pdf/data_subscriptions.pdf", "https://www.sosnc.gov/documents/forms/Data_Subcriptions/Business_Registration_layout.pdf", "https://www.sosnc.gov/fees/by_title/_data_subscriptions?area=Divisions", "https://www.sosnc.gov/manual/launching_a_business/register_your_business", "https://www.sosnc.gov/manual/General_Counsel/Page21", "https://www.sosnc.gov/divisions/business_registration", "https://www.ncleg.gov/enactedlegislation/statutes/html/bysection/chapter_132/gs_132-1.html", "https://www.ncleg.gov/enactedlegislation/statutes/html/bysection/chapter_132/gs_132-6.html", "https://www.nc.gov/terms"],
  NJ: ["https://www.nj.gov/treasury/revenue/fees.shtml", "https://nj.gov/treasury/proposed_rules/PRN%202015-154%20(47%20NJR%202912(a)).pdf", "https://www.nj.gov/treasury/proposed_rules/NoR17_3455NJR1741a.pdf", "https://www.nj.gov/treasury/revenue/guiderequest.shtml", "https://www.njportal.com/dor/businessrecords/EntityDocs/BusinessStatCopies.aspx", "https://www.njportal.com/DOR/businessrecords/Samples/SampleStatusReports.pdf", "https://www1.nj.gov/TYTR_BRC/jsp/BRCLoginJsp.jsp", "https://www.njportal.com/dor/businessrecords/EntityDocs/BusinessList.aspx", "https://www.njportal.com/errorpages/disclaimer.aspx", "https://www.nj.gov/treasury/revenue/revgencode.shtml"],
  VA: ["https://www.scc.virginia.gov/businesses/about-the-clerks-office/", "https://law.lis.virginia.gov/vacode/title12.1/chapter4/section12.1-19/", "https://law.lis.virginia.gov/vacode/title12.1/chapter4/section12.1-21.2/", "https://law.lis.virginia.gov/admincode/title5/agency5/chapter40/section10/", "https://www.scc.virginia.gov/accessibility-and-web-policy/", "https://appspre.scc.virginia.gov/procure/rfp_scc12020_scc.pdf", "https://appspre.scc.virginia.gov/clk/files/cismanual.pdf", "https://cis.scc.virginia.gov/EntitySearch/Index", "https://www.scc.virginia.gov/about-the-scc/contact-us/"],
};

QUEUE_SCOPES.set("state-business-source-discovery-queue-5-wave-1-2026-09-03", {
  scope: ["OH", "NC", "NJ", "VA"],
  candidates: QUEUE_5_CANDIDATES,
  coverage: QUEUE_5_COVERAGE,
  urls: QUEUE_5_URLS,
  parallel: true,
});

function fail(message) {
  throw new Error(`State-source discovery queue is invalid: ${message}`);
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
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function validateStateBusinessSourceDiscoveryQueue(queue) {
  if (queue?.schema_version !== "1.0.0") fail("unsupported schema version");
  const queueSpec = QUEUE_SCOPES.get(queue?.queue_id);
  if (!queueSpec) fail("unexpected queue identity");
  const expectedScope = queueSpec.scope;
  if (!exactDate(queue?.observed_at) || !queue.queue_id.endsWith(queue.observed_at)) fail("observation date is invalid or does not match the queue identity");
  if (queue?.coverage_release_id !== EXPECTED_COVERAGE_RELEASE_ID) fail("coverage release is not pinned");
  if (JSON.stringify(queue?.scope) !== JSON.stringify(expectedScope)) fail("scope must preserve the ranked state wave");
  if (queue?.controls?.official_primary_sources_only !== true) fail("official-source boundary is missing");
  for (const field of ZERO_ACTION_CONTROLS) if (queue?.controls?.[field] !== 0) fail(`${field} must remain zero`);
  if (queue.queue_id.endsWith("wave-3-2026-09-03")) {
    if (queue.controls.bounded_source_streams_opened !== 1 || queue.controls.bounded_source_stream_byte_cap !== 81616 || queue.controls.bounded_source_stream_bytes_read !== 81616 || queue.controls.bounded_source_streams_saved !== 0 || queue.controls.individual_source_records_persisted !== 0) fail("bounded source-stream accounting drifted");
    if (JSON.stringify(queue.allowed_operations) !== JSON.stringify(WAVE_3_ALLOWED_OPERATIONS) || JSON.stringify(queue.forbidden_operations) !== JSON.stringify(WAVE_3_FORBIDDEN_OPERATIONS)) fail("wave 3 operation boundary drifted");
  }
  if (queueSpec.parallel) {
    if (queue.controls.record_level_data_requested !== false) fail("Queue 5 record-level request boundary drifted");
    if (JSON.stringify(queue.forbidden_operations) !== JSON.stringify(QUEUE_5_FORBIDDEN_OPERATIONS)) fail("Queue 5 forbidden operation boundary drifted");
    if (JSON.stringify(queue.required_excluded_data_classes) !== JSON.stringify(QUEUE_5_EXCLUDED_DATA_CLASSES)) fail("Queue 5 excluded data classes drifted");
    if (queue.parallel_execution?.non_overlapping_state_assignments !== true || queue.parallel_execution?.maximum_active_workstreams !== 4) fail("Queue 5 parallel workstream controls drifted");
    if (JSON.stringify(queue.parallel_execution.assignments) !== JSON.stringify(QUEUE_5_ASSIGNMENTS) || JSON.stringify(queue.parallel_execution.waves) !== JSON.stringify(QUEUE_5_WAVES)) fail("Queue 5 parallel evidence drifted");
    const assigned = queue.parallel_execution.assignments.map((assignment) => assignment.state_abbreviation);
    if (new Set(assigned).size !== assigned.length || JSON.stringify(assigned) !== JSON.stringify(expectedScope) || queue.parallel_execution.waves.some((wave) => wave.concurrent_state_abbreviations.length > queue.parallel_execution.maximum_active_workstreams)) fail("Queue 5 assignments overlap or exceed the workstream limit");
  }
  if (!Array.isArray(queue?.states) || queue.states.length !== expectedScope.length) fail("state count does not match scope");

  const seen = new Set();
  let previousGap = Number.POSITIVE_INFINITY;
  for (const [index, state] of queue.states.entries()) {
    if (state.rank !== index + 1 || state.state_abbreviation !== expectedScope[index]) fail(`state rank ${index + 1} drifted`);
    if (seen.has(state.state_abbreviation)) fail(`duplicate state ${state.state_abbreviation}`);
    seen.add(state.state_abbreviation);
    if (!nonblank(state.state_name) || !nonblank(state.candidate?.publisher) || !nonblank(state.candidate?.product) || !nonblank(state.candidate?.availability)) fail(`${state.state_abbreviation} candidate identity is incomplete`);
    const expectedDecision = queueSpec.decisions?.[index] ?? "hold";
    const implementationAuthorized = expectedDecision === "proceed-to-bounded-connector";
    const expectedNextActionType = implementationAuthorized ? "bounded-connector-implementation" : "written-preflight-inquiry";
    if (state.decision !== expectedDecision || (state.bounded_connector_implementation_authorized ?? false) !== implementationAuthorized || (state.authorized_next_action_type ?? expectedNextActionType) !== expectedNextActionType || state.autonomous_acquisition_authorized !== false || state.paid_acquisition_authorized !== false || state.broad_layer_production_ready !== false) fail(`${state.state_abbreviation} authorization boundary drifted`);
    if (queueSpec.parallel && (state.complete_source_acquisition_authorized !== false || state.row_bearing_preflight_authorized !== false || state.offline_fixture_connector_authorized !== false || state.production_ready !== false)) fail(`${state.state_abbreviation} extended authorization boundary drifted`);
    const coverage = state.current_coverage;
    for (const field of ["reported_profiles", "coordinate_profiles", "nonemployer_baseline_2023", "material_zctas"]) {
      if (!Number.isSafeInteger(coverage?.[field]) || coverage[field] < 0) fail(`${state.state_abbreviation} ${field} is invalid`);
    }
    if (!Number.isSafeInteger(coverage?.baseline_minus_profiles)) fail(`${state.state_abbreviation} baseline_minus_profiles is invalid`);
    if (coverage.baseline_minus_profiles !== coverage.nonemployer_baseline_2023 - coverage.reported_profiles) fail(`${state.state_abbreviation} diagnostic gap does not reconcile`);
    if (coverage.diagnostic_profile_percent !== roundedPercent(coverage.reported_profiles, coverage.nonemployer_baseline_2023)) fail(`${state.state_abbreviation} diagnostic percent does not reconcile`);
    if (coverage.baseline_minus_profiles > previousGap) fail("states are not ranked by descending diagnostic gap");
    previousGap = coverage.baseline_minus_profiles;
    if (queueSpec.coverage && JSON.stringify(coverage) !== JSON.stringify(queueSpec.coverage[state.state_abbreviation])) fail(`${state.state_abbreviation} pinned coverage evidence drifted`);
    if (queueSpec.candidates && JSON.stringify(state.candidate) !== JSON.stringify(queueSpec.candidates[state.state_abbreviation])) fail(`${state.state_abbreviation} candidate identity drifted`);
    if (!Array.isArray(state.official_urls) || state.official_urls.length < 2 || state.official_urls.some((url) => !/^https:\/\//.test(url))) fail(`${state.state_abbreviation} official evidence is incomplete`);
    if (queueSpec.urls && JSON.stringify(state.official_urls) !== JSON.stringify(queueSpec.urls[state.state_abbreviation])) fail(`${state.state_abbreviation} official evidence URLs drifted`);
    if (queueSpec.parallel && (!Array.isArray(state.observed_evidence) || state.observed_evidence.length < 4 || state.observed_evidence.some((item) => !nonblank(item)))) fail(`${state.state_abbreviation} observed evidence is incomplete`);
    const expectedGates = queueSpec.gates?.[state.state_abbreviation] ?? REQUIRED_GATES;
    if (JSON.stringify(state.unresolved_gates) !== JSON.stringify(expectedGates)) fail(`${state.state_abbreviation} unresolved gates drifted`);
    if (!Array.isArray(state.required_exclusions) || state.required_exclusions.length < 4) fail(`${state.state_abbreviation} privacy exclusions are incomplete`);
    if (!nonblank(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action is missing`);
    if (implementationAuthorized && !/require explicit authorization before/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action omits the full-acquisition authorization boundary`);
    if (!implementationAuthorized && !/\bdo not\b/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action omits the hold boundary`);
  }
  return queue;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const queues = [];
  for (const queuePath of QUEUE_PATHS) queues.push(validateStateBusinessSourceDiscoveryQueue(JSON.parse(await readFile(queuePath, "utf8"))));
  for (const queue of queues) console.log(`State-source discovery ${queue.queue_id}: PASS`);
  const states = queues.flatMap((queue) => queue.states);
  console.log(`Waves: ${queues.length}; states: ${states.length}; autonomous acquisitions authorized: ${states.filter((state) => state.autonomous_acquisition_authorized).length}; production-ready broad layers: ${states.filter((state) => state.broad_layer_production_ready).length}`);
  const revalidation = await loadStateBusinessSourceRevalidation(DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH);
  const currentCoveragePointer = JSON.parse(await readFile(CURRENT_COVERAGE_POINTER_PATH, "utf8"));
  if (currentCoveragePointer.dataset_id !== "national-business-coverage-views" || !/^national-business-coverage-views-/.test(currentCoveragePointer.release_id ?? "")) fail("current coverage pointer is invalid");
  if (currentCoveragePointer.release_id !== EXPECTED_COVERAGE_RELEASE_ID || queues.some((queue) => queue.coverage_release_id !== currentCoveragePointer.release_id)) fail("discovery queue coverage release does not match the current production pointer");
  const summary = summarizeStateBusinessSourceRevalidation(revalidation, currentCoveragePointer.release_id);
  if (summary.coverage_release_matches_current !== true) fail("revalidation coverage release does not match the current production pointer");
  console.log(`State-source revalidation ${summary.revalidation_id}: PASS`);
  console.log(`Revalidated: ${summary.jurisdictions_revalidated}; holds: ${summary.hold_decisions}; bounded connectors: ${summary.bounded_connector_decisions}; autonomous acquisitions authorized: ${summary.autonomous_acquisitions_authorized}; production-ready: ${summary.production_ready_jurisdictions}`);
}
