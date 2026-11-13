import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_OFFLINE_WAVE_SHA256 = "ba5cbd7facef65b159905e595d7f7602fed68de5508965d5fa5b547840a2aced";
const WAVE_PATH = "config/state-business-source-assessments/broad-organization-offline-connector-readiness-wave-2026-11-13.json";
const STATES = Object.freeze(["IL", "KY", "MS", "OK", "UT", "MN"]);
const REQUIRED_FILES = Object.freeze({ IL: 5, KY: 1, MS: 2, OK: 1, UT: 3, MN: 0 });
const KEYS = Object.freeze(["state", "readiness_kind", "connector_path", "connector_sha256", "policy_path", "policy_sha256", "assessment_path", "assessment_sha256", "required_source_files", "unresolved_gates"]);
const MN_KEYS = Object.freeze([...KEYS, "readiness_path", "readiness_sha256", "documentation_path", "documentation_sha256", "validator_path", "validator_sha256"]);
const CONTROL_KEYS = Object.freeze(["source_rows_read", "network_requests", "downloads", "contacts", "payments", "terms_acceptances", "operations", "production_changes", "acquisition_authorized", "row_bearing_preflight_authorized", "publication_authorized", "national_admission_authorized"]);
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === "object" && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("Broad offline connector-readiness wave is invalid."); };

export function validateBroadOfflineConnectorReadinessWave(wave, bindings) {
  if (!exact(wave, ["schema_version", "wave_id", "predecessor_wave", "observed_at", "decision", "states", "controls", "broad_layer_gaps_resolved", "scope"])
    || wave.schema_version !== "broad-organization-offline-connector-readiness-wave@1.1.0"
    || wave.wave_id !== "broad-organization-offline-connector-readiness-wave-2026-11-13" || wave.observed_at !== "2026-11-13" || wave.decision !== "hold"
    || wave.predecessor_wave?.path !== "config/state-business-source-assessments/broad-organization-offline-connector-readiness-wave-2026-11-12.json" || wave.predecessor_wave?.sha256 !== "fd01ace8b08452f2d41d0c1f466c9f39cc5723e3c68ed6ba6a63fa90d8135353"
    || !Array.isArray(wave.states) || JSON.stringify(wave.states.map(row => row.state)) !== JSON.stringify(STATES)
    || !exact(wave.controls, CONTROL_KEYS) || Object.entries(wave.controls).some(([key, value]) => key.endsWith("authorized") ? value !== false : value !== 0)
    || wave.broad_layer_gaps_resolved !== 0 || !wave.scope.includes("excludes admitted states and narrow sector-only sources")) fail();
  for (const row of wave.states) {
    const bound = bindings[row.state];
    if (!exact(row, row.state === "MN" ? MN_KEYS : KEYS) || !bound || row.connector_sha256 !== bound.connector_sha256 || row.policy_sha256 !== bound.policy_sha256 || row.assessment_sha256 !== bound.assessment_sha256
      || row.connector_path !== bound.connector_path || row.policy_path !== bound.policy_path || row.assessment_path !== bound.assessment_path
      || row.required_source_files !== REQUIRED_FILES[row.state]
      || row.readiness_kind !== (row.state === "MN" ? "documentation-header-only-zero-row" : "operator-package-offline-connector")
      || JSON.stringify(row.unresolved_gates) !== JSON.stringify(bound.assessment.unresolved_gates)
      || bound.connector.allowed_hosts?.length !== 0
      || ![0, undefined].includes(bound.connector.execution_limits?.max_parallel_requests)
      || bound.connector.source_policy !== row.policy_path
      || bound.policy.policy_id === undefined || bound.assessment.state?.abbreviation !== row.state) fail();
    if (row.state === "MN" && (bound.readinessSha256 !== row.readiness_sha256 || bound.documentationSha256 !== row.documentation_sha256 || bound.validatorSha256 !== row.validator_sha256
      || bound.readiness?.source_rows_read !== 0 || bound.readiness?.broad_layer_gap_resolved !== false || bound.documentation?.authority?.row_bearing_preflight_authorized !== false)) fail();
  }
  return structuredClone(wave);
}

export async function loadBroadOfflineConnectorReadinessWave(root = APP_ROOT) {
  const waveBytes = await readFile(path.join(root, WAVE_PATH));
  if (hash(waveBytes) !== BROAD_OFFLINE_WAVE_SHA256) fail();
  const wave = JSON.parse(waveBytes);
  const bindings = {};
  for (const row of wave.states ?? []) {
    const load = async (relative, expected) => { const bytes = await readFile(path.join(root, relative)); if (hash(bytes) !== expected) fail(); return JSON.parse(bytes); };
    bindings[row.state] = {
      connector_path: row.connector_path, connector_sha256: row.connector_sha256, connector: await load(row.connector_path, row.connector_sha256),
      policy_path: row.policy_path, policy_sha256: row.policy_sha256, policy: await load(row.policy_path, row.policy_sha256),
      assessment_path: row.assessment_path, assessment_sha256: row.assessment_sha256, assessment: await load(row.assessment_path, row.assessment_sha256),
    };
    if (row.state === "MN") Object.assign(bindings[row.state], {
      readinessSha256: row.readiness_sha256, readiness: await load(row.readiness_path, row.readiness_sha256),
      documentationSha256: row.documentation_sha256, documentation: await load(row.documentation_path, row.documentation_sha256),
      validatorSha256: row.validator_sha256, validator: await readFile(path.join(root, row.validator_path)).then(bytes => { if (hash(bytes) !== row.validator_sha256) fail(); return bytes; }),
    });
  }
  return validateBroadOfflineConnectorReadinessWave(wave, bindings);
}

