import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import {
  BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
  verifyBroadOrganizationAuthorizationProgram,
} from "./broad-organization-authorization-program.mjs";

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

export function projectBroadOrganizationAuthorizationProgram(program, manifest) {
  if (program?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID
      || manifest?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID
      || program.states?.length !== 43 || manifest.state_count !== 43
      || manifest.gate_item_count !== 371 || manifest.gate_key_count !== 28
      || program.scope?.source_actions_performed !== 0 || program.scope?.acquisition_authorized !== false) fail("identity, counts, or authority boundary invalid");
  return {
    schema_version: "broad-organization-authorization-program-management-view@1.0.0",
    available: true,
    metadata: {
      release_id: manifest.release_id,
      observed_at: program.observed_at,
      jurisdiction_count: 43,
      gate_item_count: 371,
      gate_key_count: 28,
      wave_state_abbreviations: program.wave_state_abbreviations.map((wave) => [...wave]),
    },
    source_lineage: {
      backlog_release_id: program.source_backlog.release_id,
      backlog_manifest_sha256: program.source_backlog.manifest_sha256,
      backlog_artifact_sha256: program.source_backlog.artifact_sha256,
      assessment_catalog_id: program.source_backlog.assessment_catalog_id,
      assessment_catalog_sha256: program.source_backlog.assessment_catalog_sha256,
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
          gate_kind: "external-explicit-authorization",
          document_closable: false,
          automatic_closure_permitted: false,
          closure_requires: "Separate authenticated scope-specific user authorization for an exact reviewed proposal.",
          no_document_or_evidence_upload_can_close: true,
        } : {
          gate_key: item.gate_key,
          gate_kind: "non-row-bearing-contract-evidence",
          document_closable: true,
          automatic_closure_permitted: false,
          row_bearing: false,
          required_evidence_type: item.required_evidence_type,
          acceptance_criterion: item.acceptance_criterion,
          grants_authority: false,
        }),
      };
    }),
  };
}

export async function loadBroadOrganizationAuthorizationProgramManagementView() {
  const releasesDirectory = path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT, "releases");
  const rootStat = await lstat(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT);
  const releasesStat = await lstat(releasesDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !releasesStat.isDirectory() || releasesStat.isSymbolicLink()) fail("canonical release ancestry is missing or linked");
  const entries = await readdir(releasesDirectory, { withFileTypes: true });
  const identity = new RegExp(`^${BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID}-20\\d{2}-\\d{2}-\\d{2}-[0-9a-f]{12}$`, "i");
  if (entries.length !== 1 || !entries[0].isDirectory() || entries[0].isSymbolicLink() || !identity.test(entries[0].name)) fail("expected exactly one canonical program release");
  const manifestPath = path.join(releasesDirectory, entries[0].name, "manifest.json");
  const verified = await verifyBroadOrganizationAuthorizationProgram(manifestPath);
  if (verified.manifest.release_id !== entries[0].name) fail("release directory and manifest identity differ");
  return projectBroadOrganizationAuthorizationProgram(verified.program, verified.manifest);
}
