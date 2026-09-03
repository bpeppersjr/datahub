import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATH = path.join(ROOT, "config", "state-business-source-discovery-queue-4.json");
const EXPECTED_SCOPE = ["ID", "NM", "ME", "WY"];
const REQUIRED_GATES = ["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"];
const ZERO_ACTION_CONTROLS = ["accounts_created", "terms_accepted", "purchases_made", "bulk_record_downloads", "broad_portal_queries", "access_controls_bypassed", "production_pointers_changed"];

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
  if (queue?.queue_id !== "state-business-source-discovery-queue-4-wave-1-2026-09-03") fail("unexpected queue identity");
  if (!/^national-business-coverage-views-/.test(queue?.coverage_release_id ?? "")) fail("coverage release is not pinned");
  if (JSON.stringify(queue?.scope) !== JSON.stringify(EXPECTED_SCOPE)) fail("scope must preserve the ranked four-state wave");
  if (queue?.controls?.official_primary_sources_only !== true) fail("official-source boundary is missing");
  for (const field of ZERO_ACTION_CONTROLS) if (queue?.controls?.[field] !== 0) fail(`${field} must remain zero`);
  if (!Array.isArray(queue?.states) || queue.states.length !== EXPECTED_SCOPE.length) fail("state count does not match scope");

  const seen = new Set();
  let previousGap = Number.POSITIVE_INFINITY;
  for (const [index, state] of queue.states.entries()) {
    if (state.rank !== index + 1 || state.state_abbreviation !== EXPECTED_SCOPE[index]) fail(`state rank ${index + 1} drifted`);
    if (seen.has(state.state_abbreviation)) fail(`duplicate state ${state.state_abbreviation}`);
    seen.add(state.state_abbreviation);
    if (!nonblank(state.state_name) || !nonblank(state.candidate?.publisher) || !nonblank(state.candidate?.product) || !nonblank(state.candidate?.availability)) fail(`${state.state_abbreviation} candidate identity is incomplete`);
    if (state.decision !== "hold" || state.autonomous_acquisition_authorized !== false || state.paid_acquisition_authorized !== false || state.broad_layer_production_ready !== false) fail(`${state.state_abbreviation} authorization boundary drifted`);
    const coverage = state.current_coverage;
    for (const field of ["reported_profiles", "coordinate_profiles", "nonemployer_baseline_2023", "baseline_minus_profiles", "material_zctas"]) {
      if (!Number.isSafeInteger(coverage?.[field]) || coverage[field] < 0) fail(`${state.state_abbreviation} ${field} is invalid`);
    }
    if (coverage.baseline_minus_profiles !== coverage.nonemployer_baseline_2023 - coverage.reported_profiles) fail(`${state.state_abbreviation} diagnostic gap does not reconcile`);
    if (coverage.diagnostic_profile_percent !== roundedPercent(coverage.reported_profiles, coverage.nonemployer_baseline_2023)) fail(`${state.state_abbreviation} diagnostic percent does not reconcile`);
    if (coverage.baseline_minus_profiles > previousGap) fail("states are not ranked by descending diagnostic gap");
    previousGap = coverage.baseline_minus_profiles;
    if (!Array.isArray(state.official_urls) || state.official_urls.length < 2 || state.official_urls.some((url) => !/^https:\/\//.test(url))) fail(`${state.state_abbreviation} official evidence is incomplete`);
    if (JSON.stringify(state.unresolved_gates) !== JSON.stringify(REQUIRED_GATES)) fail(`${state.state_abbreviation} unresolved gates drifted`);
    if (!Array.isArray(state.required_exclusions) || state.required_exclusions.length < 4) fail(`${state.state_abbreviation} privacy exclusions are incomplete`);
    if (!nonblank(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action is missing`);
  }
  return queue;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const queue = validateStateBusinessSourceDiscoveryQueue(JSON.parse(await readFile(QUEUE_PATH, "utf8")));
  console.log(`State-source discovery ${queue.queue_id}: PASS`);
  console.log(`States: ${queue.states.length}; autonomous acquisitions authorized: ${queue.states.filter((state) => state.autonomous_acquisition_authorized).length}; production-ready broad layers: ${queue.states.filter((state) => state.broad_layer_production_ready).length}`);
}
