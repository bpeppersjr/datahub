import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 64 * 1024;
const INPUTS = Object.freeze([
  Object.freeze({ key: "documentation", relative: "config/source-documentation/mn-active-business-data-guide-2025-08-01.json", sha256: "cbff6d8f1a5b5873a331dbb782ecd6059dbb9a193bdf3d1251f3fea0c736de5b" }),
  Object.freeze({ key: "assessment", relative: "config/state-business-source-assessments/mn-2026-10-03.json", sha256: "4a5eb48bd386a971a573a2cb8efddbc0c91e47dd70bfbdeab51d384d001ed065" }),
  Object.freeze({ key: "discovery", relative: "config/state-business-source-discovery-queue-8.json", sha256: "29ef195e51757538628dfdaabcdd10785b09f6d81d8ffd0b8343fd746a78888f" }),
  Object.freeze({ key: "connector", relative: "config/connectors/mn-active-business-data-zero-row.json", sha256: "0bc61a740f39d661b134de5019c92d8be644a067a6eda91778200300ea6803bf" }),
  Object.freeze({ key: "policy", relative: "config/source-policies/mn-active-business-data-zero-row.json", sha256: "fb73c5174ad47b55f596273558ec20e869e69bed0d1531c856c9153b1b3ad69c" }),
  Object.freeze({ key: "readiness", relative: "config/state-business-source-assessments/mn-active-business-data-zero-row-2026-11-13.json", sha256: "7cbce556dc16f8bb70609567056daae08bc1560a6012cc0c27b8180e825343e0" }),
]);
export const MN_ACTIVE_HEADERS = Object.freeze(["Business Filing Type", "Business Name", "File Number", "Filing Date", "Status", "Business Address Type", "Address 1", "Address 2", "City", "Region Code", "Zip Code", "Zip Code Ext", "Country Name", "Business Party Name Type", "Party Full Name", "Next Renewal Due Date"]);
export const MN_ACTIVE_GATES = Object.freeze(["active-product-controlling-license", "active-file-number-lifecycle", "active-address-domain", "population-discrepancy", "current-delivery-counts", "active-deletion-and-replay", "supported-automation", "derived-rights", "privacy-exclusions"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = () => new Error("Minnesota Active zero-row evidence is unavailable.");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const same = (value, expected) => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);

async function readPinned(root, input) {
  const base = await realpath(root).catch(() => { throw fail(); });
  const filename = path.resolve(base, input.relative);
  if (path.relative(base, filename).startsWith("..")) throw fail();
  const handle = await open(filename, "r").catch(() => { throw fail(); });
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 2 || before.size > MAX_BYTES) throw fail();
    const buffer = Buffer.alloc(before.size);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (bytesRead !== buffer.length || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || await realpath(filename) !== filename || sha256(buffer) !== input.sha256) throw fail();
    return JSON.parse(buffer.toString("utf8"));
  } catch { throw fail(); } finally { await handle.close(); }
}

export function validateMnActiveBusinessDataZeroRow({ documentation, assessment, discovery, connector, policy, readiness, fixture }) {
  const expectedAuthority = ["source_access", "contact", "account", "payment", "terms_acceptance", "acquisition", "publication", "national_admission", "pointer_change", "production"];
  if (!exact(fixture, ["product", "header", "rows", "zip_projection", "requested_fields", "authority"])
    || fixture.product !== "Business Data (Active)" || !same(fixture.header, MN_ACTIVE_HEADERS) || !same(fixture.rows, [])
    || !exact(fixture.zip_projection, ["zip5_field", "zip4_field", "joined"]) || fixture.zip_projection.zip5_field !== "Zip Code" || fixture.zip_projection.zip4_field !== "Zip Code Ext" || fixture.zip_projection.joined !== false
    || !same(fixture.requested_fields, MN_ACTIVE_HEADERS.filter(name => !["Business Party Name Type", "Party Full Name"].includes(name)))
    || !exact(fixture.authority, expectedAuthority) || Object.values(fixture.authority).some(Boolean)
    || !exact(documentation, ["schema_version", "evidence_id", "publisher", "product", "document", "observed_at", "format", "semantics", "controls", "authority"])
    || documentation.schema_version !== "official-source-documentation-evidence@1.0.0" || documentation.evidence_id !== "mn-active-business-data-guide-2025-08-01" || documentation.product !== "Business Data (Active)" || documentation.observed_at !== "2026-11-13T06:17:39.090Z"
    || !exact(documentation.document, ["title", "effective_date", "url", "bytes", "sha256", "media_type"]) || documentation.document?.bytes !== 1083174 || documentation.document?.sha256 !== "ea9178afdde6833b337e09d426a1f6d08972f746973f36be7311525aa0e64e75"
    || !same(documentation.format?.ordered_columns, MN_ACTIVE_HEADERS) || documentation.format?.record_file !== "csv" || documentation.format?.container !== "zip"
    || !same(documentation.semantics?.composite_key_evidence, ["File Number", "Business Filing Type"]) || documentation.semantics?.file_number_lifecycle_verified !== false
    || !same(documentation.semantics?.person_bearing_fields, ["Business Party Name Type", "Party Full Name"]) || documentation.semantics?.person_bearing_fields_admissible !== false
    || documentation.semantics?.full_bulk_master_id_semantics_inherited !== false || documentation.semantics?.zip4_joined !== false
    || Object.values(documentation.authority ?? {}).some(Boolean) || documentation.controls?.business_rows_acquired !== 0 || documentation.controls?.source_connector_executed !== false
    || assessment.state?.abbreviation !== "MN" || !same(assessment.unresolved_gates, MN_ACTIVE_GATES) || assessment.authority?.acquisition !== false || assessment.authority?.network_execution !== false || assessment.authority?.national_admission !== false
    || !discovery.states?.some(row => row.state_abbreviation === "MN" && row.candidate?.product === "Active Business Data" && row.row_bearing_preflight_authorized === false)
    || !exact(connector, ["connector_id", "version", "implementation_status", "description", "lifecycle", "product", "product_substitution_forbidden", "documentation_evidence", "named_secret_references", "input_artifact_types", "configuration_schema", "allowed_hosts", "redirect_policy", "provider_budget_key", "resource_class", "execution_limits", "source_policy", "output_artifact_types", "retention_profile", "retry", "checkpoint", "idempotency", "cancellation", "produced_entities", "produced_identifiers", "authority"])
    || connector.connector_id !== "mn-active-business-data-zero-row" || connector.version !== "1.0.0" || connector.product !== "Business Data (Active)" || connector.execution_limits?.source_rows !== 0 || connector.execution_limits?.network_requests !== 0 || connector.execution_limits?.required_source_files !== 0 || connector.allowed_hosts?.length !== 0
    || connector.source_policy !== "config/source-policies/mn-active-business-data-zero-row.json" || Object.values(connector.authority ?? {}).some(Boolean)
    || !same(connector.product_substitution_forbidden, ["Business Bulk Data", "Master ID", "full-bulk address domains"])
    || !exact(policy, ["policy_id", "version", "publisher", "product", "ownership", "allowed_use", "prohibited_use", "person_bearing_fields", "person_bearing_fields_admissible", "zip5_field", "zip4_field", "zip4_joined", "redistribution", "attribution", "retention", "contains_personal_data", "contains_secrets"])
    || policy.policy_id !== "mn-active-business-data-zero-row" || policy.version !== "1.0.0" || policy.product !== "Business Data (Active)" || !same(policy.person_bearing_fields, ["Business Party Name Type", "Party Full Name"]) || policy.person_bearing_fields_admissible !== false || policy.zip5_field !== "Zip Code" || policy.zip4_field !== "Zip Code Ext" || policy.zip4_joined !== false || policy.redistribution !== "not-authorized"
    || !exact(readiness, ["schema_version", "evidence_id", "observed_at", "state", "product", "documentation", "connector", "policy", "source_rows_read", "network_requests", "actions_performed", "broad_layer_gap_resolved", "unresolved_gates", "authority"])
    || readiness.schema_version !== "state-business-source-zero-row-readiness@1.0.0" || readiness.state !== "MN" || readiness.product !== "Business Data (Active)"
    || readiness.documentation?.sha256 !== INPUTS[0].sha256 || readiness.connector?.sha256 !== INPUTS[3].sha256 || readiness.policy?.sha256 !== INPUTS[4].sha256
    || readiness.source_rows_read !== 0 || readiness.network_requests !== 0 || readiness.actions_performed !== 0 || readiness.broad_layer_gap_resolved !== false || !same(readiness.unresolved_gates, MN_ACTIVE_GATES) || !exact(readiness.authority, expectedAuthority) || Object.values(readiness.authority).some(Boolean)) throw fail();
  return Object.freeze({ schema_version: "mn-active-business-data-zero-row-result@1.0.0", state: "MN", product: "Business Data (Active)", status: "zero-row-ready-gap-unresolved", source_rows_read: 0, network_requests: 0, actions_performed: 0, header: MN_ACTIVE_HEADERS, composite_identifier_evidence: Object.freeze({ fields: Object.freeze(["File Number", "Business Filing Type"]), lifecycle_verified: false }), zip_projection: Object.freeze({ zip5_field: "Zip Code", zip4_field: "Zip Code Ext", joined: false }), excluded_fields: Object.freeze(["Business Party Name Type", "Party Full Name"]), unresolved_gates: MN_ACTIVE_GATES, broad_layer_gap_resolved: false, authority: Object.freeze(Object.fromEntries(expectedAuthority.map(key => [key, false]))) });
}

export async function readMnActiveBusinessDataZeroRow({ root = APP_ROOT, fixture } = {}) {
  const values = Object.fromEntries(await Promise.all(INPUTS.map(async input => [input.key, await readPinned(root, input)])));
  return validateMnActiveBusinessDataZeroRow({ ...values, fixture });
}
