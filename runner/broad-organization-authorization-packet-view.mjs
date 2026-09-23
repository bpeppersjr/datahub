import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import {
  BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT,
  verifyBroadOrganizationAuthorizationPacket,
} from "./broad-organization-authorization-packet.mjs";

function fail(message) {
  throw new Error(`Verified authorization packet view unavailable: ${message}`);
}

const boundaryFields = [
  "contact_authorized", "contact_performed", "download_authorized", "download_performed",
  "payment_authorized", "payment_performed", "record_request_authorized", "records_requested",
  "row_bearing_evidence_authorized", "production_change_authorized", "no_contact", "no_download",
  "no_payment", "no_record_request", "no_contact_no_download_no_payment_no_record_request",
];

function projectBoundary(boundary) {
  return Object.fromEntries(boundaryFields.map((field) => [field, boundary[field]]));
}

export function projectBroadOrganizationAuthorizationPacket(packet, manifest) {
  if (packet?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID
      || manifest?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID
      || packet.states?.length !== 10 || manifest.state_count !== 10 || manifest.request_item_count !== packet.scope?.request_items) fail("identity or bounded selection is invalid");
  return {
    schema_version: "broad-organization-authorization-packet-management-view@1.0.0",
    available: true,
    metadata: {
      release_id: manifest.release_id,
      observed_at: packet.observed_at,
      jurisdiction_count: 10,
      request_item_count: manifest.request_item_count,
      first_wave_state_abbreviations: [...manifest.first_wave_state_abbreviations],
    },
    source_lineage: {
      backlog_release_id: manifest.source_backlog_release_id,
      backlog_manifest_sha256: manifest.source_backlog_manifest_sha256,
      backlog_artifact_sha256: manifest.source_backlog_artifact_sha256,
      assessment_catalog_id: packet.source_backlog.assessment_catalog_id,
      assessment_catalog_sha256: packet.source_backlog.assessment_catalog_sha256,
    },
    authority: {
      approval_granted: false,
      acquisition_authorized: false,
      contact_authorized: false,
      download_authorized: false,
      payment_authorized: false,
      record_request_authorized: false,
      row_bearing_evidence_authorized: false,
      production_change_authorized: false,
      source_actions_performed: 0,
      contact_performed: false,
      download_performed: false,
      payment_performed: false,
      records_requested: 0,
      current_pointer_changed: false,
      evidence_specification_is_approval: false,
    },
    states: packet.states.map((state) => ({
      state_abbreviation: state.state_abbreviation,
      state_name: state.state_name,
      assessment_provenance: {
        assessment_id: state.assessment_provenance.assessment_id,
        assessment_kind: state.assessment_provenance.assessment_kind,
        observed_at: state.assessment_provenance.observed_at,
      },
      unresolved_gates: [...state.unresolved_gates],
      privacy_exclusions: [...state.privacy_exclusions],
      legal_status_limitations: [...state.legal_status_limitations],
      address_limitations: [...state.address_limitations],
      request_items: state.request_items.map((item) => ({
        request_item_id: item.request_item_id,
        unresolved_gate: item.unresolved_gate,
        request_item_type: item.request_item_type,
        row_bearing: false,
        request_item: item.request_item,
        required_evidence_type: item.required_evidence_type,
        acceptance_criterion: item.acceptance_criterion,
        action_boundary: projectBoundary(item.action_boundary),
      })),
    })),
  };
}

export async function loadBroadOrganizationAuthorizationPacketManagementView() {
  const releasesDirectory = path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT, "releases");
  const parentStat = await lstat(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT);
  const releasesStat = await lstat(releasesDirectory);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || !releasesStat.isDirectory() || releasesStat.isSymbolicLink()) fail("canonical release ancestry is missing or linked");
  const entries = await readdir(releasesDirectory, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory() || entries[0].isSymbolicLink()
      || !new RegExp(`^${BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID}-20\\d{2}-\\d{2}-\\d{2}-[0-9a-f]{12}$`, "i").test(entries[0].name)) fail("expected exactly one canonical packet release");
  const manifestPath = path.join(releasesDirectory, entries[0].name, "manifest.json");
  const verified = await verifyBroadOrganizationAuthorizationPacket(manifestPath);
  if (verified.manifest.release_id !== entries[0].name) fail("release directory and manifest identity differ");
  return projectBroadOrganizationAuthorizationPacket(verified.packet, verified.manifest);
}
