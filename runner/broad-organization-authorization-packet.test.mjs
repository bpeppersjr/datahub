import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildBroadOrganizationAcquisitionBacklog } from "./broad-organization-acquisition-backlog.mjs";
import {
  buildBroadOrganizationAuthorizationPacket,
  DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT,
  deriveBroadOrganizationAuthorizationPacket,
  verifyBroadOrganizationAuthorizationPacket,
} from "./broad-organization-authorization-packet.mjs";
import { DATA_DIR } from "./paths.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function tempDirectory() { return mkdtemp(path.join(DATA_DIR, ".tmp-broad-org-auth-packet-")); }

async function sourceBacklog() {
  const built = await buildBroadOrganizationAcquisitionBacklog();
  return { backlog: built, manifestPath: path.join(built.releaseDirectory, "manifest.json") };
}

test("packet derives exactly ten verified first-wave jurisdictions and one bounded item per open gate", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const manifestBytes = await readFile(source.manifestPath);
    const packet = deriveBroadOrganizationAuthorizationPacket(source.backlog.backlog, manifestBytes, source.backlog.manifest);
    assert.equal(packet.states.length, 10);
    assert.deepEqual(packet.states.map((state) => state.state_abbreviation), source.backlog.manifest.first_wave_state_abbreviations);
    assert.equal(packet.scope.jurisdictions, 10);
    assert.equal(packet.states.reduce((count, state) => count + state.request_items.length, 0), packet.scope.request_items);
    for (const state of packet.states) {
      assert.deepEqual(state.unresolved_gates, state.request_items.map((item) => item.unresolved_gate));
      assert.equal(state.privacy_exclusions.length > 0, true);
      assert.equal(state.legal_status_limitations.length > 0, true);
      assert.equal(state.address_limitations.length > 0, true);
      assert.equal(state.assessment_snapshot.assessment_id, state.assessment_provenance.assessment_id);
      assert.equal(Array.isArray(state.assessment_evidence_and_limitations), true);
      for (const item of state.request_items) {
        assert.ok(item.required_evidence_type);
        assert.ok(item.acceptance_criterion);
        assert.equal(item.request_item_type, "non-row-bearing-evidence-specification");
        assert.equal(item.row_bearing, false);
        assert.equal(item.action_boundary.no_contact_no_download_no_payment_no_record_request, true);
        assert.equal(item.action_boundary.no_contact && item.action_boundary.no_download && item.action_boundary.no_payment && item.action_boundary.no_record_request, true);
        assert.equal(item.action_boundary.contact_authorized, false);
        assert.equal(item.action_boundary.download_authorized, false);
        assert.equal(item.action_boundary.payment_authorized, false);
        assert.equal(item.action_boundary.record_request_authorized, false);
        assert.equal(item.action_boundary.records_requested, 0);
      }
    }
    assert.equal(packet.scope.acquisition_authorized, false);
    assert.equal(packet.scope.source_actions_performed, 0);
    assert.equal(packet.source_backlog.manifest_sha256, hash(manifestBytes));
    assert.equal(packet.source_backlog.artifact_sha256, source.backlog.manifest.artifacts[0].sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes a content-derived packet release and verifies backlog and assessment lineage", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const result = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "packet") });
    const verified = await verifyBroadOrganizationAuthorizationPacket(path.join(result.releaseDirectory, "manifest.json"));
    assert.equal(verified.manifest.release_id, result.manifest.release_id);
    assert.equal(verified.manifest.source_backlog_release_id, source.backlog.manifest.release_id);
    assert.equal(verified.packet.source_backlog.manifest_sha256, hash(await readFile(source.manifestPath)));
    assert.equal(verified.packet.scope.current_pointer_changed, false);
    assert.equal(result.manifest.source_actions_performed, 0);
    const repeated = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "packet") });
    assert.equal(repeated.reused_existing_release, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a rehashed packet whose gate boundary widens authority", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const built = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "packet") });
    const oldDirectory = built.releaseDirectory;
    const packetPath = path.join(oldDirectory, "authorization-packet.json");
    const manifestPath = path.join(oldDirectory, "manifest.json");
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    packet.states[0].request_items[0].action_boundary.contact_authorized = true;
    const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`);
    await writeFile(packetPath, packetBytes);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts[0].bytes = packetBytes.length;
    manifest.artifacts[0].sha256 = hash(packetBytes);
    manifest.release_id = `${manifest.dataset_id}-${packet.observed_at}-${manifest.artifacts[0].sha256.slice(0, 12)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const newDirectory = path.join(path.dirname(oldDirectory), manifest.release_id);
    await rename(oldDirectory, newDirectory);
    await assert.rejects(verifyBroadOrganizationAuthorizationPacket(path.join(newDirectory, "manifest.json")), /exact verified backlog-derived/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects changed source backlog lineage and unexpected packet files", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const built = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "packet") });
    const packetPath = path.join(built.releaseDirectory, "authorization-packet.json");
    const manifestPath = path.join(built.releaseDirectory, "manifest.json");
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    packet.source_backlog.manifest_sha256 = "0".repeat(64);
    const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`);
    await writeFile(packetPath, packetBytes);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts[0].bytes = packetBytes.length;
    manifest.artifacts[0].sha256 = hash(packetBytes);
    manifest.release_id = `${manifest.dataset_id}-${packet.observed_at}-${manifest.artifacts[0].sha256.slice(0, 12)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const tamperedDirectory = path.join(path.dirname(built.releaseDirectory), manifest.release_id);
    await rename(built.releaseDirectory, tamperedDirectory);
    await assert.rejects(verifyBroadOrganizationAuthorizationPacket(path.join(tamperedDirectory, "manifest.json")), /source backlog manifest lineage checksum mismatch/);

    const clean = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "packet-clean") });
    await writeFile(path.join(clean.releaseDirectory, "extra.txt"), "unexpected");
    await assert.rejects(verifyBroadOrganizationAuthorizationPacket(path.join(clean.releaseDirectory, "manifest.json")), /unexpected files or directories/);
    assert.ok(DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT.endsWith(path.join("broad-organization-acquisition-backlog", "releases")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelled build cleans only its owned staging directory", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const outputRoot = path.join(root, "packet");
    const controller = new AbortController();
    controller.abort(new Error("packet test cancellation"));
    await assert.rejects(buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot, signal: controller.signal }), /packet test cancellation/);
    assert.deepEqual(await readdir(path.join(outputRoot, "releases")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects packet output roots outside datahub/data", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    await assert.rejects(buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(os.tmpdir(), "packet-outside-datahub") }), /canonical APP_ROOT\/data/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlink or junction output ancestry where supported", async (t) => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog(root);
    const target = path.join(root, "target");
    const linked = path.join(root, "linked");
    await mkdir(target);
    try {
      await symlink(target, linked, "junction");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error.code)) {
        t.skip(`junction creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(buildBroadOrganizationAuthorizationPacket({ backlogManifestPath: source.manifestPath, outputRoot: path.join(linked, "packet") }), /linked or non-directory output ancestry/);
    assert.deepEqual(await readdir(target), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
