import path from "node:path";
import { createHash } from "node:crypto";
import {readAuthorizationViewReleases,newestAuthorizationCohort} from './authorization-view-release-selection.mjs';

import {
  BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT,
  verifyBroadOrganizationAuthorizationPacket,
} from "./broad-organization-authorization-packet.mjs";
import {
  DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
  verifyBroadOrganizationAcquisitionBacklog,
} from "./broad-organization-acquisition-backlog.mjs";
import { loadStateBusinessSourceAssessmentCatalog, validateStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";

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

export function projectBroadOrganizationAuthorizationPacket(packet, manifest, backlogManifest) {
  if (packet?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID
      || manifest?.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID
      || packet.schema_version !== "2.0.0" || manifest.schema_version !== "broad-organization-authorization-packet-manifest@2.0.0"
      || packet.states?.length !== 10 || manifest.state_count !== 10 || !Number.isSafeInteger(manifest.request_item_count) || manifest.request_item_count <= 0
      || manifest.request_item_count !== packet.states.reduce((sum,state)=>sum+(state.request_items?.length??0),0)
      || manifest.request_item_count !== packet.scope?.request_items || packet.scope?.jurisdictions !== manifest.state_count
      || packet.scope?.source_actions_performed !== 0 || packet.scope?.network_requests !== 0
      || packet.scope?.acquisition_authorized !== false || packet.scope?.contact_authorized !== false
      || packet.scope?.row_bearing_evidence_authorized !== false || packet.scope?.current_pointer_changed !== false
      || !["broad-organization-acquisition-backlog-manifest@2.0.0", "broad-organization-acquisition-backlog-manifest@3.0.0"].includes(backlogManifest?.schema_version)
      || backlogManifest.release_id !== manifest.source_backlog_release_id
      || backlogManifest.source_matrix_release_id === undefined
      || JSON.stringify(manifest.first_wave_state_abbreviations) !== JSON.stringify(["CA", "ID", "IL", "OH", "KY", "NC", "NH", "OK", "HI", "MA"])) fail("identity, bounded selection, lineage, or authority boundary is invalid");
  return {
    schema_version: "broad-organization-authorization-packet-management-view@2.0.0",
    available: true,
    metadata: {
      release_id: manifest.release_id,
      observed_at: packet.observed_at,
      jurisdiction_count: manifest.state_count,
      request_item_count: manifest.request_item_count,
      first_wave_state_abbreviations: [...manifest.first_wave_state_abbreviations],
    },
    source_lineage: {
      backlog_release_id: manifest.source_backlog_release_id,
      backlog_manifest_sha256: manifest.source_backlog_manifest_sha256,
      backlog_artifact_sha256: manifest.source_backlog_artifact_sha256,
      assessment_catalog_id: packet.source_backlog.assessment_catalog_id,
      assessment_catalog_sha256: packet.source_backlog.assessment_catalog_sha256,
      source_matrix_release_id: backlogManifest.source_matrix_release_id,
      source_matrix_manifest_sha256: backlogManifest.source_matrix_manifest_sha256,
      source_matrix_artifact_sha256: backlogManifest.source_matrix_artifact_sha256,
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
      network_requests: 0,
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

export async function loadBroadOrganizationAuthorizationPacketManagementView({ packetRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT } = {}) {
  const catalog = validateStateBusinessSourceAssessmentCatalog(await loadStateBusinessSourceAssessmentCatalog());
  const catalogSha256 = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
  const releases=await readAuthorizationViewReleases(packetRoot,BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID,'authorization-packet.json');
  if(releases.some(row=>!['broad-organization-authorization-packet-manifest@1.0.0','broad-organization-authorization-packet-manifest@2.0.0'].includes(row.manifest.schema_version)))fail('unsupported retained packet version');
  const current=newestAuthorizationCohort(releases.filter(row=>row.manifest.schema_version==='broad-organization-authorization-packet-manifest@2.0.0'
    && row.artifact.source_backlog?.assessment_catalog_id === catalog.assessment_catalog_id
    && row.artifact.source_backlog?.assessment_catalog_sha256 === catalogSha256),row=>row.manifest.release_id);
  if(current.length!==1)fail('ambiguous newest packet');
  const verified=await verifyBroadOrganizationAuthorizationPacket(current[0].manifestPath);
  if(JSON.stringify(verified.manifest)!==JSON.stringify(current[0].manifest)||JSON.stringify(verified.packet)!==JSON.stringify(current[0].artifact))fail('selected packet changed during verification');
  const backlogManifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases", verified.manifest.source_backlog_release_id, "manifest.json");
  const backlog = await verifyBroadOrganizationAcquisitionBacklog(backlogManifestPath);
  if (backlog.manifest.source_matrix_release_id === undefined) fail("current packet backlog lacks matrix lineage");
  return projectBroadOrganizationAuthorizationPacket(verified.packet, verified.manifest, backlog.manifest);
}
