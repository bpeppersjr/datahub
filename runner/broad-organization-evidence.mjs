import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { assessBusinessSourceTemporalStatus } from "./business-source-temporal-status.mjs";
import { APP_ROOT } from "./paths.mjs";
import { BROAD_ORGANIZATION_ZIP_SOURCES } from "./broad-organization-zip-descriptors.mjs";

export const BROAD_ORGANIZATION_EVIDENCE_VERSION = "1.0.0";
export const BROAD_ORGANIZATION_SOURCES = Object.freeze({
  ...Object.fromEntries(Object.entries(BROAD_ORGANIZATION_ZIP_SOURCES).map(([state, spec]) => [state, Object.freeze({ sourceKey: spec.registryKey, policy: spec.policy })])),
});

const POLICY_IDS = Object.freeze(Object.fromEntries(Object.entries(BROAD_ORGANIZATION_SOURCES).map(([state, value]) => [state, value.policy.replace(/\.json$/, "")])));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(`Broad organization evidence rejected: ${message}`); };

export async function buildBroadOrganizationEvidence({ state, source, root = APP_ROOT, asOf = new Date() }) {
  const spec = BROAD_ORGANIZATION_SOURCES[state];
  if (!spec) return null;
  check(source?.source_key === spec.sourceKey, `${state} source identity drifted`);
  check(source.complete_source_for_all_businesses === false, `${state} completeness boundary drifted`);
  check(Number.isSafeInteger(source.zip_rows_with_contribution) && source.zip_rows_with_contribution >= 0, `${state} ZIP contribution is invalid`);
  const policyPath = path.join(root, "config", "source-policies", spec.policy);
  const policyBytes = await readFile(policyPath);
  const policy = JSON.parse(policyBytes);
  check(policy.policy_id === POLICY_IDS[state] && /^\d+\.\d+\.\d+$/.test(policy.version ?? ""), `${state} policy identity drifted`);
  check(/^20\d{2}-\d{2}-\d{2}$/.test(policy.reviewed_at ?? ""), `${state} policy review date is invalid`);
  check(typeof policy.redistribution === "string" && policy.redistribution.length > 20 && Array.isArray(policy.prohibited_use) && policy.prohibited_use.length, `${state} policy semantics are incomplete`);
  const temporal = assessBusinessSourceTemporalStatus(source, { asOf });
  check(temporal.policy_configured && temporal.source_reference_at && temporal.general_business_operating_status_asserted === false, `${state} temporal policy is incomplete`);
  const addressCounts = source.zip_level_counts ?? {};
  check(Object.values(addressCounts).every((value) => Number.isSafeInteger(value) && value >= 0), `${state} address counts are invalid`);
  return {
    schema_version: BROAD_ORGANIZATION_EVIDENCE_VERSION,
    state,
    source_key: spec.sourceKey,
    source_release_id: source.release_metadata?.source_release_id ?? null,
    source_reference: {
      field: temporal.source_reference_field,
      value: temporal.source_reference_value,
      at: temporal.source_reference_at,
    },
    temporal_status: temporal,
    status_semantics: temporal.evidence_scope,
    general_business_operating_status_asserted: false,
    complete_all_businesses: false,
    zip_contribution: { rows: source.zip_rows_with_contribution, address_counts: structuredClone(addressCounts), scope: "source-release" },
    geocode: { status: "unmeasured-at-source-level", assigned: null, eligible: null, percent: null, scope: "selected-broad-organization-source" },
    policy: {
      id: policy.policy_id,
      version: policy.version,
      sha256: sha256(policyBytes),
      reviewed_at: policy.reviewed_at,
      field_export_policy: structuredClone(policy.field_export_policy ?? null),
      redistribution: policy.redistribution,
    },
    authorization: {
      acquisition_authorized: false,
      acquisition_authority_inferred: false,
      production_pointer_change_authorized: false,
      basis: "retained production evidence and pinned source policy; no new acquisition authority inferred",
    },
  };
}
