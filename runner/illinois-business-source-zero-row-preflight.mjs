import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 64 * 1024;
const INPUTS = Object.freeze([
  Object.freeze({ key: "assessment", relative: "config/state-business-source-assessments/il-2026-11-12.json", sha256: "6878f1269fb50aba834bcc0fbd1b67672920519802f4e53d59fe5807b37d80a9" }),
  Object.freeze({ key: "connector", relative: "config/connectors/il-business-registry.json", sha256: "af068da74c95ef81d5e79fb4bd9b5670f1cc9b17c54da22b06f2996667b6777c" }),
  Object.freeze({ key: "policy", relative: "config/source-policies/il-business-registry.json", sha256: "b5c71332111005c3c78829bb0672adefa5e651312abb3673d101beaeee505be8" }),
  Object.freeze({ key: "predecessor", relative: "config/state-business-source-assessments/il-2026-10-03.json", sha256: "58905b77a08494fd381654805bff0e70f73d08307355ef3b61ab94ef1264f323" }),
]);

const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = () => new Error("Illinois zero-row preflight evidence is unavailable.");
const exactKeys = (value, keys) => value && !Array.isArray(value) && typeof value === "object"
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const exactArray = (value, expected) => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
const ASSESSMENT_KEYS = Object.freeze(["schema_version", "assessment_id", "observed_at", "state", "supersedes_assessment_id", "decision", "evidence_kind", "connector_binding", "policy_binding", "predecessor_binding", "verified_contract", "established_metadata", "unresolved_gates", "strongest_bounded_next_action", "broad_layer_gap_resolved"]);
const CONTRACT_KEYS = Object.freeze(["source_rows_read", "network_requests", "downloads", "contacts_made", "accounts_created", "terms_accepted", "fees_paid", "operations_started", "releases_created", "production_changes", "row_bearing_preflight_authorized", "acquisition_authorized", "publication_authorized", "national_admission_authorized"]);
const GATES = Object.freeze(["automated-retrieval-authorization", "retention-and-downstream-use-rights", "operator-supplied-complete-same-run-package", "independent-package-verification", "actual-package-freshness", "archive-and-replay-guarantees", "separate-national-admission"]);
const ESTABLISHED_METADATA = Object.freeze([
  "The retained connector is offline-only and has no allowed network hosts or request concurrency.",
  "The connector requires exactly five operator-supplied official files from one common run date.",
  "All record-level and aggregate outputs remain local-review-only; redistribution is not authorized.",
  "Goodstanding and Reinstated are registration assertions, not independent evidence of current operation.",
  "LLC records-office addresses are administrative organization evidence, not verified operating sites.",
]);
const STRONGEST_ACTION = "Preserve the existing offline connector and require separate authority plus one complete official same-run five-file package before any row-bearing verification. This zero-row preflight authorizes no acquisition, contact, account, payment, terms acceptance, automation, processing operation, publication, admission, or production change.";

async function readPinnedJson(root, input) {
  const rootReal = await realpath(root).catch(() => { throw fail(); });
  const filename = path.resolve(rootReal, input.relative);
  if (path.relative(rootReal, filename).startsWith("..")) throw fail();
  const handle = await open(filename, "r").catch(() => { throw fail(); });
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size <= 0 || before.size > MAX_BYTES) throw fail();
    const buffer = Buffer.alloc(before.size);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (bytesRead !== buffer.length || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw fail();
    const actualReal = await realpath(filename);
    if (actualReal !== filename || sha256(buffer) !== input.sha256) throw fail();
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw fail();
  } finally {
    await handle.close();
  }
}

export function validateIllinoisBusinessSourceZeroRowPreflight(values, pins = Object.fromEntries(INPUTS.map(input => [input.key, input.sha256]))) {
  const { assessment, connector, policy, predecessor } = values;
  const contract = assessment.verified_contract;
  if (!exactKeys(assessment, ASSESSMENT_KEYS)
    || !exactKeys(assessment.state, ["abbreviation", "name"])
    || !exactKeys(assessment.connector_binding, ["path", "sha256", "connector_id", "version", "implementation_status", "allowed_hosts", "max_parallel_requests", "required_source_files"])
    || !exactKeys(assessment.policy_binding, ["path", "sha256", "policy_id", "version", "redistribution"])
    || !exactKeys(assessment.predecessor_binding, ["path", "sha256"])
    || !exactKeys(contract, CONTRACT_KEYS)
    || assessment.schema_version !== "state-business-source-zero-row-preflight@1.0.0"
    || assessment.assessment_id !== "il-business-source-zero-row-preflight-2026-11-12"
    || assessment.observed_at !== "2026-11-12" || assessment.evidence_kind !== "governed-local-metadata-only"
    || assessment.state.abbreviation !== "IL" || assessment.state.name !== "Illinois"
    || assessment.decision !== "hold" || assessment.broad_layer_gap_resolved !== false
    || assessment.supersedes_assessment_id !== predecessor.assessment_id
    || assessment.connector_binding.path !== INPUTS[1].relative || assessment.connector_binding.sha256 !== pins.connector
    || assessment.connector_binding.connector_id !== connector.connector_id || assessment.connector_binding.version !== connector.version
    || assessment.connector_binding.implementation_status !== connector.implementation_status
    || !exactArray(assessment.connector_binding.allowed_hosts, connector.allowed_hosts)
    || assessment.connector_binding.max_parallel_requests !== connector.execution_limits?.max_parallel_requests
    || assessment.connector_binding.required_source_files !== connector.execution_limits?.required_source_files
    || assessment.policy_binding.path !== INPUTS[2].relative || assessment.policy_binding.sha256 !== pins.policy
    || assessment.policy_binding.policy_id !== policy.policy_id || assessment.policy_binding.version !== policy.version
    || assessment.policy_binding.redistribution !== "not-authorized"
    || assessment.predecessor_binding.path !== INPUTS[3].relative || assessment.predecessor_binding.sha256 !== pins.predecessor
    || !exactKeys(connector, ["connector_id", "version", "implementation_status", "description", "lifecycle", "configuration_schema", "named_secret_references", "input_artifact_types", "output_artifact_types", "output_schemas", "allowed_hosts", "redirect_policy", "provider_budget_key", "resource_class", "execution_limits", "retry", "checkpoint", "idempotency", "cancellation", "source_policy", "retention_profile", "produced_entities", "produced_identifiers"])
    || connector.connector_id !== "il-business-registry" || connector.version !== "1.0.0"
    || connector.implementation_status !== "implemented-offline-awaiting-operator-supplied-official-files"
    || connector.allowed_hosts?.length !== 0 || connector.execution_limits?.max_parallel_requests !== 0
    || connector.execution_limits?.required_source_files !== 5
    || connector.source_policy !== "config/source-policies/il-business-registry.json"
    || !exactKeys(policy, ["policy_id", "version", "publisher", "ownership", "source_home", "source_access", "allowed_use", "prohibited_use", "field_export_policy", "attribution", "retention", "redistribution", "contains_personal_data", "personal_data_handling", "contains_secrets", "reviewed_at"])
    || policy.policy_id !== "il-business-registry" || policy.version !== "1.0.0"
    || policy.redistribution?.startsWith("No redistribution is authorized") !== true
    || Object.entries(contract).some(([key, value]) => key.endsWith("_authorized") ? value !== false : value !== 0)
    || !exactArray(assessment.established_metadata, ESTABLISHED_METADATA)
    || !exactArray(assessment.unresolved_gates, GATES)
    || assessment.strongest_bounded_next_action !== STRONGEST_ACTION) throw fail();
  return Object.freeze({
    schema_version: "illinois-business-source-zero-row-preflight-result@1.0.0",
    state: "IL",
    status: "hold",
    source_rows_read: 0,
    network_requests: 0,
    required_offline_source_files: 5,
    unresolved_gates: Object.freeze([...assessment.unresolved_gates]),
    broad_layer_gap_resolved: false,
    authority: Object.freeze({ acquisition: false, contact: false, account: false, payment: false, terms_acceptance: false, automation: false, processing: false, publication: false, admission: false, production: false }),
    evidence: Object.freeze({ assessment_sha256: pins.assessment, connector_sha256: pins.connector, policy_sha256: pins.policy, predecessor_sha256: pins.predecessor }),
  });
}

export async function readIllinoisBusinessSourceZeroRowPreflight({ root = APP_ROOT } = {}) {
  const values = Object.fromEntries(await Promise.all(INPUTS.map(async input => [input.key, await readPinnedJson(root, input)])));
  return validateIllinoisBusinessSourceZeroRowPreflight(values);
}

