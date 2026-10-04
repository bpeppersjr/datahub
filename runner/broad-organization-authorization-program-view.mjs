import { createHash } from "node:crypto";
import {readAuthorizationViewReleases,newestAuthorizationCohort} from './authorization-view-release-selection.mjs';

import {
  BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
  verifyBroadOrganizationAuthorizationProgram,
} from "./broad-organization-authorization-program.mjs";
import { loadStateBusinessSourceAssessmentCatalog, validateStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";
import {
  BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY_VERSION,
  classifyBroadOrganizationGateReadiness,
  validateBroadOrganizationGateReadinessTaxonomyKeys,
} from "./broad-organization-gate-readiness.mjs";

const DENIED_NARRATIVE = /https?:\/\/|\b(candidate|contact|request|download|purchase|payment|account|enroll|source action|acquisition)\b/i;
const MAX_LIMITATION_LENGTH = 260;

function fail(message) { throw new Error(`Verified authorization program view unavailable: ${message}`); }

function boundedNarrative(values, pattern, fallback) {
  const result = [];
  let total = 0;
  for (const value of values) {
    if (typeof value !== "string" || value.length > MAX_LIMITATION_LENGTH || !pattern.test(value) || DENIED_NARRATIVE.test(value)) continue;
    if (total + value.length > 520) continue;
    result.push(value);
    total += value.length;
    if (result.length === 2) break;
  }
  return result.length ? result : [fallback];
}

function limitations(state) {
  const narrative = state.assessment_status_and_address_narrative;
  const evidence = Array.isArray(narrative?.observed_evidence) ? narrative.observed_evidence : [];
  const statusFallback = state.unresolved_gates.includes("status-codebook")
    ? "Status semantics remain an unresolved assessment gate; registration status alone does not establish current operation."
    : "Assessment status evidence is not independent proof of current operation.";
  const addressFallback = state.unresolved_gates.some((gate) => ["address-role", "eligible-address-role", "csv-schema"].includes(gate))
    ? "Address-role or ZIP field semantics remain unresolved; reported administrative or registration addresses are not confirmed operating sites."
    : "Reported administrative or registration addresses are not independently confirmed operating sites.";
  return {
    status: boundedNarrative(evidence, /status|active|inactive|operation|registration/i, statusFallback),
    address: boundedNarrative(evidence, /address|zip|physical|site|location|premises/i, addressFallback),
  };
}

export function projectBroadOrganizationAuthorizationProgram(program, manifest, programManifestSha256) {
  const allGateKeys = program?.states?.flatMap((state) => state.gate_items?.map((item) => item.gate_key) ?? []) ?? [];
  let taxonomyCounts;
  try { taxonomyCounts = validateBroadOrganizationGateReadinessTaxonomyKeys(allGateKeys); } catch (error) { fail(error.message); }
  if (program?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID
      || manifest?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID
      || program.schema_version !== "2.0.0" || manifest.schema_version !== "broad-organization-authorization-program-manifest@2.0.0"
      || program.states?.length !== 40 || manifest.state_count !== 40
      || !Number.isSafeInteger(manifest.gate_item_count) || manifest.gate_item_count <= 0
      || !Number.isSafeInteger(manifest.gate_key_count) || manifest.gate_key_count <= 0 || manifest.gate_key_count > manifest.gate_item_count
      || program.scope?.jurisdictions !== manifest.state_count || program.scope?.gate_items !== manifest.gate_item_count
      || program.scope?.gate_key_count !== manifest.gate_key_count
      || program.wave_state_abbreviations?.length !== 4 || program.wave_state_abbreviations.some((wave) => !Array.isArray(wave) || wave.length !== 10)
      || program.source_backlog?.source_matrix_release_id !== manifest.source_matrix_release_id
      || program.source_backlog?.source_matrix_manifest_sha256 !== manifest.source_matrix_manifest_sha256
      || program.source_backlog?.source_matrix_artifact_sha256 !== manifest.source_matrix_artifact_sha256
      || program.source_backlog?.release_id !== manifest.source_backlog_release_id
      || program.source_backlog?.manifest_sha256 !== manifest.source_backlog_manifest_sha256
      || program.source_backlog?.artifact_sha256 !== manifest.source_backlog_artifact_sha256
      || program.source_backlog?.assessment_catalog_id == null || !/^[a-f0-9]{64}$/.test(program.source_backlog?.assessment_catalog_sha256 ?? "")
      || !/^[a-f0-9]{64}$/.test(programManifestSha256 ?? "")
      || program.scope?.source_actions_performed !== 0 || program.scope?.network_requests !== 0
      || program.scope?.acquisition_authorized !== false || program.scope?.current_pointer_changed !== false) fail("identity, counts, lineage, or authority boundary invalid");
  return {
    schema_version: "broad-organization-authorization-program-management-view@3.0.0",
    available: true,
    metadata: {
      release_id: manifest.release_id,
      observed_at: program.observed_at,
      jurisdiction_count: manifest.state_count,
      gate_item_count: manifest.gate_item_count,
      gate_key_count: manifest.gate_key_count,
      gate_readiness: {
        taxonomy_version: BROAD_ORGANIZATION_GATE_READINESS_TAXONOMY_VERSION,
        distinct_keys_classified: taxonomyCounts.distinct_gate_key_count,
        taxonomy_exhaustive: taxonomyCounts.exhaustive,
        unresolved_gate_item_count: manifest.gate_item_count,
        readiness_uplift: false,
      },
      wave_state_abbreviations: program.wave_state_abbreviations.map((wave) => [...wave]),
    },
    source_lineage: {
      program_manifest_sha256: programManifestSha256,
      program_artifact_sha256: manifest.artifacts[0].sha256,
      backlog_release_id: program.source_backlog.release_id,
      backlog_manifest_sha256: program.source_backlog.manifest_sha256,
      backlog_artifact_sha256: program.source_backlog.artifact_sha256,
      assessment_catalog_id: program.source_backlog.assessment_catalog_id,
      assessment_catalog_sha256: program.source_backlog.assessment_catalog_sha256,
      source_matrix_release_id: program.source_backlog.source_matrix_release_id,
      source_matrix_manifest_sha256: program.source_backlog.source_matrix_manifest_sha256,
      source_matrix_artifact_sha256: program.source_backlog.source_matrix_artifact_sha256,
    },
    authority: {
      approval_granted: false,
      acquisition_authorized: false,
      evidence_request_authorized: false,
      contact_authorized: false,
      download_authorized: false,
      payment_authorized: false,
      record_request_authorized: false,
      row_bearing_evidence_authorized: false,
      production_change_authorized: false,
      source_actions_performed: 0,
      network_requests: 0,
      current_pointer_changed: false,
      evidence_specification_is_approval: false,
    },
    states: program.states.map((state) => {
      const bounded = limitations(state);
      return {
        priority: state.priority,
        wave: state.wave,
        state_abbreviation: state.state_abbreviation,
        state_name: state.state_name,
        unresolved_gates: [...state.unresolved_gates],
        required_exclusions: [...state.required_exclusions],
        status_limitations: bounded.status,
        address_limitations: bounded.address,
        gate_items: state.gate_items.map((item) => item.gate_kind === "external-explicit-authorization" ? {
          gate_key: item.gate_key,
          original_gate_kind: item.gate_kind,
          gate_kind: "external-explicit-authorization",
          ...classifyBroadOrganizationGateReadiness(item.gate_key),
          document_closable: false,
          automatic_closure_permitted: false,
          closure_requires: "Separate authenticated scope-specific user authorization for an exact reviewed proposal.",
          no_document_or_evidence_upload_can_close: true,
        } : {
          gate_key: item.gate_key,
          original_gate_kind: item.gate_kind,
          gate_kind: "non-row-bearing-contract-evidence",
          ...classifyBroadOrganizationGateReadiness(item.gate_key),
          automatic_closure_permitted: false,
          original_required_evidence_type: item.required_evidence_type,
          required_evidence_type: classifyBroadOrganizationGateReadiness(item.gate_key).evidence_requirement,
          acceptance_criterion: item.acceptance_criterion,
          grants_authority: false,
        }),
      };
    }),
  };
}

export async function loadBroadOrganizationAuthorizationProgramManagementView({ programRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT } = {}) {
  const catalog = validateStateBusinessSourceAssessmentCatalog(await loadStateBusinessSourceAssessmentCatalog());
  const catalogSha256 = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
  const releases=await readAuthorizationViewReleases(programRoot,BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,'authorization-program.json');
  if(releases.some(row=>!['broad-organization-authorization-program-manifest@1.0.0','broad-organization-authorization-program-manifest@2.0.0'].includes(row.manifest.schema_version)))fail('unsupported retained program version');
  const current=newestAuthorizationCohort(releases.filter(row=>row.manifest.schema_version==='broad-organization-authorization-program-manifest@2.0.0'
    && row.artifact.source_backlog?.assessment_catalog_id === catalog.assessment_catalog_id
    && row.artifact.source_backlog?.assessment_catalog_sha256 === catalogSha256),row=>row.manifest.release_id);
  if(current.length!==1)fail('ambiguous newest program');
  const verified=await verifyBroadOrganizationAuthorizationProgram(current[0].manifestPath);
  if(JSON.stringify(verified.manifest)!==JSON.stringify(current[0].manifest)||JSON.stringify(verified.program)!==JSON.stringify(current[0].artifact))fail('selected program changed during verification');
  return projectBroadOrganizationAuthorizationProgram(verified.program,verified.manifest,current[0].manifestSha256);
}
