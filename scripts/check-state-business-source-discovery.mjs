import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATHS = [
  path.join(ROOT, "config", "state-business-source-discovery-queue-4.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json"),
];
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

function fail(message) {
  throw new Error(`State-source discovery queue is invalid: ${message}`);
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function roundedPercent(numerator, denominator) {
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function validateStateBusinessSourceDiscoveryQueue(queue) {
  if (queue?.schema_version !== "1.0.0") fail("unsupported schema version");
  const queueSpec = QUEUE_SCOPES.get(queue?.queue_id);
  if (!queueSpec) fail("unexpected queue identity");
  const expectedScope = queueSpec.scope;
  if (!/^national-business-coverage-views-/.test(queue?.coverage_release_id ?? "")) fail("coverage release is not pinned");
  if (JSON.stringify(queue?.scope) !== JSON.stringify(expectedScope)) fail("scope must preserve the ranked state wave");
  if (queue?.controls?.official_primary_sources_only !== true) fail("official-source boundary is missing");
  for (const field of ZERO_ACTION_CONTROLS) if (queue?.controls?.[field] !== 0) fail(`${field} must remain zero`);
  if (queue.queue_id.endsWith("wave-3-2026-09-03")) {
    if (queue.controls.bounded_source_streams_opened !== 1 || queue.controls.bounded_source_stream_byte_cap !== 81616 || queue.controls.bounded_source_stream_bytes_read !== 81616 || queue.controls.bounded_source_streams_saved !== 0 || queue.controls.individual_source_records_persisted !== 0) fail("bounded source-stream accounting drifted");
    if (JSON.stringify(queue.allowed_operations) !== JSON.stringify(WAVE_3_ALLOWED_OPERATIONS) || JSON.stringify(queue.forbidden_operations) !== JSON.stringify(WAVE_3_FORBIDDEN_OPERATIONS)) fail("wave 3 operation boundary drifted");
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
    const coverage = state.current_coverage;
    for (const field of ["reported_profiles", "coordinate_profiles", "nonemployer_baseline_2023", "material_zctas"]) {
      if (!Number.isSafeInteger(coverage?.[field]) || coverage[field] < 0) fail(`${state.state_abbreviation} ${field} is invalid`);
    }
    if (!Number.isSafeInteger(coverage?.baseline_minus_profiles)) fail(`${state.state_abbreviation} baseline_minus_profiles is invalid`);
    if (coverage.baseline_minus_profiles !== coverage.nonemployer_baseline_2023 - coverage.reported_profiles) fail(`${state.state_abbreviation} diagnostic gap does not reconcile`);
    if (coverage.diagnostic_profile_percent !== roundedPercent(coverage.reported_profiles, coverage.nonemployer_baseline_2023)) fail(`${state.state_abbreviation} diagnostic percent does not reconcile`);
    if (coverage.baseline_minus_profiles > previousGap) fail("states are not ranked by descending diagnostic gap");
    previousGap = coverage.baseline_minus_profiles;
    if (!Array.isArray(state.official_urls) || state.official_urls.length < 2 || state.official_urls.some((url) => !/^https:\/\//.test(url))) fail(`${state.state_abbreviation} official evidence is incomplete`);
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
}
