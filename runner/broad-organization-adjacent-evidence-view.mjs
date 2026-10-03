import { findAndVerifyBroadOrganizationAdjacentEvidenceIndex } from "./broad-organization-adjacent-evidence-index.mjs";

const STATE = /^[A-Z]{2}$/;

export async function loadBroadOrganizationAdjacentEvidenceView({ state, loader = findAndVerifyBroadOrganizationAdjacentEvidenceIndex } = {}) {
  if (state !== undefined && !STATE.test(state)) throw new Error("State must be a two-letter uppercase broad-gap jurisdiction code.");
  const verified = await loader();
  const selected = state ? verified.index.jurisdictions.find((row) => row.code === state) ?? null : null;
  if (state && !selected) throw new Error("State is not a current broad-layer gap jurisdiction.");
  const compact = (row) => ({ code: row.code, name: row.name, broad_layer_gap: true, broad_layer_status: "unmeasured", adjacent_evidence_status: row.adjacent_evidence_status, evidence_count: row.evidence_count,
    evidence: row.evidence.map((item) => ({ evidence_id: item.evidence_id, label: item.label, evidence_kind: item.evidence_kind, record_count: item.record_count, row_unit: item.row_unit, provenance: item.provenance, source_reference: item.source_reference,
      temporal_limitation: item.temporal_limitation, current_operation_verified: false, geography_scope: item.geography_scope, authority: item.authority, coverage_limitations: item.coverage_limitations })), limitations: row.limitations });
  return { schema_version: "broad-organization-adjacent-evidence-view@1.0.0", available: true, release_id: verified.index.release_id, manifest_sha256: verified.manifest_sha256, summary: verified.index.summary,
    selected: selected ? compact(selected) : null, jurisdictions: verified.index.jurisdictions.map((row) => ({ code: row.code, name: row.name, broad_layer_gap: true, adjacent_evidence_status: row.adjacent_evidence_status, evidence_count: row.evidence_count })),
    claims: verified.index.claims };
}
