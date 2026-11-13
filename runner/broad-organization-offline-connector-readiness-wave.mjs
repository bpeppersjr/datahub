import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_OFFLINE_WAVE_SHA256 = "fd01ace8b08452f2d41d0c1f466c9f39cc5723e3c68ed6ba6a63fa90d8135353";
const WAVE_PATH = "config/state-business-source-assessments/broad-organization-offline-connector-readiness-wave-2026-11-12.json";
const STATES = Object.freeze(["IL", "KY", "MS", "OK", "UT"]);
const REQUIRED_FILES = Object.freeze({ IL: 5, KY: 1, MS: 2, OK: 1, UT: 3 });
const KEYS = Object.freeze(["state", "connector_path", "connector_sha256", "policy_path", "policy_sha256", "assessment_path", "assessment_sha256", "required_source_files", "unresolved_gates"]);
const CONTROL_KEYS = Object.freeze(["source_rows_read", "network_requests", "downloads", "contacts", "payments", "terms_acceptances", "operations", "production_changes", "acquisition_authorized", "row_bearing_preflight_authorized", "publication_authorized", "national_admission_authorized"]);
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === "object" && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("Broad offline connector-readiness wave is invalid."); };

export function validateBroadOfflineConnectorReadinessWave(wave, bindings) {
  if (!exact(wave, ["schema_version", "wave_id", "observed_at", "decision", "states", "controls", "broad_layer_gaps_resolved", "scope"])
    || wave.schema_version !== "broad-organization-offline-connector-readiness-wave@1.0.0"
    || wave.wave_id !== "broad-organization-offline-connector-readiness-wave-2026-11-12" || wave.observed_at !== "2026-11-12" || wave.decision !== "hold"
    || !Array.isArray(wave.states) || JSON.stringify(wave.states.map(row => row.state)) !== JSON.stringify(STATES)
    || !exact(wave.controls, CONTROL_KEYS) || Object.entries(wave.controls).some(([key, value]) => key.endsWith("authorized") ? value !== false : value !== 0)
    || wave.broad_layer_gaps_resolved !== 0 || !wave.scope.includes("excludes admitted states and narrow sector-only sources")) fail();
  for (const row of wave.states) {
    const bound = bindings[row.state];
    if (!exact(row, KEYS) || !bound || row.connector_sha256 !== bound.connector_sha256 || row.policy_sha256 !== bound.policy_sha256 || row.assessment_sha256 !== bound.assessment_sha256
      || row.connector_path !== bound.connector_path || row.policy_path !== bound.policy_path || row.assessment_path !== bound.assessment_path
      || row.required_source_files !== REQUIRED_FILES[row.state]
      || JSON.stringify(row.unresolved_gates) !== JSON.stringify(bound.assessment.unresolved_gates)
      || bound.connector.allowed_hosts?.length !== 0
      || ![0, undefined].includes(bound.connector.execution_limits?.max_parallel_requests)
      || bound.connector.source_policy !== row.policy_path
      || bound.policy.policy_id === undefined || bound.assessment.state?.abbreviation !== row.state) fail();
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
  }
  return validateBroadOfflineConnectorReadinessWave(wave, bindings);
}

