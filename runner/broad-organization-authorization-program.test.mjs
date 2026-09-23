import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildBroadOrganizationAcquisitionBacklog } from "./broad-organization-acquisition-backlog.mjs";
import {
  AUTHORIZATION_PROGRAM_WAVES,
  buildBroadOrganizationAuthorizationProgram,
  buildBroadOrganizationAuthorizationProgramManifest,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
  deriveBroadOrganizationAuthorizationProgram,
  verifyBroadOrganizationAuthorizationProgram,
} from "./broad-organization-authorization-program.mjs";
import { DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT, verifyBroadOrganizationAuthorizationPacket } from "./broad-organization-authorization-packet.mjs";
import { DATA_DIR } from "./paths.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function tempDirectory() { return mkdtemp(path.join(DATA_DIR, ".tmp-broad-org-auth-program-")); }
async function sourceBacklog() {
  const built = await buildBroadOrganizationAcquisitionBacklog();
  const manifestPath = path.join(built.releaseDirectory, "manifest.json");
  return { ...built, manifestPath, manifestBytes: await readFile(manifestPath) };
}

test("derives exact five contiguous waves, 43 jurisdictions, 371 items and 28 gate contracts", async () => {
  const source = await sourceBacklog();
  const program = deriveBroadOrganizationAuthorizationProgram(source.backlog, source.manifestBytes, source.manifest);
  assert.deepEqual(program.states.map((row) => row.state_abbreviation), AUTHORIZATION_PROGRAM_WAVES.flat());
  assert.deepEqual(program.wave_state_abbreviations, AUTHORIZATION_PROGRAM_WAVES.map((wave) => [...wave]));
  assert.deepEqual(AUTHORIZATION_PROGRAM_WAVES.map((wave) => wave.length), [10, 10, 10, 10, 3]);
  assert.equal(program.scope.jurisdictions, 43);
  assert.equal(program.scope.gate_items, 371);
  assert.equal(program.scope.gate_key_count, 28);
  assert.equal(new Set(program.states.flatMap((row) => row.unresolved_gates)).size, 28);
  assert.equal(program.states.reduce((n, row) => n + row.gate_items.length, 0), 371);
  for (const state of program.states) {
    assert.deepEqual(state.unresolved_gates, state.gate_items.map((item) => item.gate_key));
    assert.deepEqual(state.required_exclusions, state.assessment_snapshot.required_exclusions);
    assert.deepEqual(state.assessment_status_and_address_narrative.candidate, state.assessment_snapshot.candidate);
    assert.deepEqual(state.assessment_provenance.official_urls, state.assessment_snapshot.official_urls);
  }
  assert.equal(program.scope.source_actions_performed, 0);
  assert.equal(program.scope.current_pointer_changed, false);
  assert.equal(program.scope.acquisition_authorized, false);
});

test("pins new gate boundaries and separates approval-only acquisition gates", async () => {
  const source = await sourceBacklog();
  const program = deriveBroadOrganizationAuthorizationProgram(source.backlog, source.manifestBytes, source.manifest);
  const byGate = new Map(program.states.flatMap((state) => state.gate_items.map((item) => [item.gate_key, item])));
  for (const key of ["complete-snapshot-route", "csv-schema", "current-product", "platform-migration"]) {
    assert.ok(byGate.get(key)?.required_evidence_type);
    assert.ok(byGate.get(key)?.acceptance_criterion);
    assert.equal(byGate.get(key).row_bearing, false);
    assert.equal(byGate.get(key).grants_authority, false);
  }
  const approvalItems = program.states.flatMap((state) => state.gate_items).filter((item) => item.gate_key === "large-acquisition-authorization");
  assert.deepEqual(approvalItems.map((item) => item.item_id), ["ak-large-acquisition-authorization", "dc-large-acquisition-authorization"]);
  for (const item of approvalItems) {
    assert.equal(item.gate_kind, "external-explicit-authorization");
    assert.equal(item.document_closable, false);
    assert.equal(item.automatic_closure_permitted, false);
    assert.equal(item.no_document_or_evidence_upload_can_close, true);
    assert.equal(item.publisher_document_is_user_approval, false);
    assert.equal(item.program_can_grant_authority, false);
    assert.match(item.closure_requires, /separate authenticated scope-specific user authorization/i);
    assert.equal("required_evidence_type" in item, false);
    assert.equal(item.action_boundary.contact_authorized, false);
  }
  assert.ok(program.states.flatMap((state) => state.gate_items).filter((item) => item.gate_key !== "large-acquisition-authorization").every((item) => item.gate_kind === "non-row-bearing-contract-evidence" && item.document_review_can_establish === "contract-evidence-sufficiency-only" && item.grants_authority === false));
});

test("preserves the existing first-wave packet release and verifier byte-for-byte", async () => {
  const releaseRoot = path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT, "releases");
  const releaseNames = (await readdir(releaseRoot)).filter((name) => name.startsWith("broad-organization-authorization-packet-"));
  assert.equal(releaseNames.length, 1);
  const manifestPath = path.join(releaseRoot, releaseNames[0], "manifest.json");
  const manifestBefore = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBefore.toString("utf8"));
  const artifactPath = path.join(path.dirname(manifestPath), manifest.artifacts[0].path);
  const artifactBefore = await readFile(artifactPath);
  const verified = await verifyBroadOrganizationAuthorizationPacket(manifestPath);
  assert.equal(verified.packet.states.length, 10);
  assert.equal(verified.packet.scope.request_items, 74);
  assert.equal(hash(artifactBefore), manifest.artifacts[0].sha256);
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  assert.deepEqual(await readFile(artifactPath), artifactBefore);
  const source = await sourceBacklog();
  const program = deriveBroadOrganizationAuthorizationProgram(source.backlog, source.manifestBytes, source.manifest);
  assert.deepEqual(program.states.slice(0, 10).map((state) => state.state_abbreviation), verified.packet.states.map((state) => state.state_abbreviation));
  for (let index = 0; index < 10; index += 1) {
    assert.deepEqual(program.states[index].unresolved_gates, verified.packet.states[index].unresolved_gates);
    assert.deepEqual(program.states[index].required_exclusions, verified.packet.states[index].privacy_exclusions);
  }
});

test("publishes and independently verifies an immutable manifest-last release", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const outputRoot = path.join(root, "program");
    const built = await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot });
    const verified = await verifyBroadOrganizationAuthorizationProgram(path.join(built.releaseDirectory, "manifest.json"));
    assert.equal(verified.manifest.release_id, built.manifest.release_id);
    assert.equal(verified.manifest.source_backlog_manifest_sha256, hash(source.manifestBytes));
    assert.equal(verified.manifest.source_backlog_artifact_sha256, source.manifest.artifacts[0].sha256);
    assert.equal(verified.manifest.state_count, 43);
    assert.equal(verified.manifest.gate_item_count, 371);
    assert.equal(verified.manifest.gate_key_count, 28);
    assert.deepEqual((await readdir(built.releaseDirectory)).sort(), ["authorization-program.json", "manifest.json"]);
    assert.equal((await readdir(outputRoot)).includes("current.json"), false);
    assert.equal((await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot })).reused_existing_release, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects backlog omission, duplication, order, gate substitution, and unknown gates", async () => {
  const source = await sourceBacklog();
  const invalid = [
    (b) => { b.states.pop(); },
    (b) => { b.states[1] = structuredClone(b.states[0]); },
    (b) => { [b.states[0], b.states[1]] = [b.states[1], b.states[0]]; },
    (b) => { b.states[10].assessment.unresolved_gates[0] = "csv-schema"; },
    (b) => { b.states[0].assessment.unresolved_gates.push("unknown-gate"); },
  ];
  for (const mutate of invalid) {
    const changed = structuredClone(source.backlog);
    mutate(changed);
    assert.throws(() => deriveBroadOrganizationAuthorizationProgram(changed, source.manifestBytes, source.manifest), /invalid/);
  }
});

test("strict verifier rejects a rehashed authority widening and unexpected files", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const built = await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "program") });
    const oldDirectory = built.releaseDirectory;
    const artifactPath = path.join(oldDirectory, "authorization-program.json");
    const manifestPath = path.join(oldDirectory, "manifest.json");
    const program = JSON.parse(await readFile(artifactPath, "utf8"));
    program.states[0].authority.acquisition_authorized = true;
    const bytes = Buffer.from(`${JSON.stringify(program, null, 2)}\n`);
    await writeFile(artifactPath, bytes);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts[0].bytes = bytes.length;
    manifest.artifacts[0].sha256 = hash(bytes);
    manifest.release_id = `${manifest.dataset_id}-${program.observed_at}-${manifest.artifacts[0].sha256.slice(0, 12)}`;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const tamperedDirectory = path.join(path.dirname(oldDirectory), manifest.release_id);
    await rename(oldDirectory, tamperedDirectory);
    await assert.rejects(verifyBroadOrganizationAuthorizationProgram(path.join(tamperedDirectory, "manifest.json")), /scope, waves, or authority boundary/);
    const clean = await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "clean") });
    await writeFile(path.join(clean.releaseDirectory, "unexpected.json"), "{}");
    await assert.rejects(verifyBroadOrganizationAuthorizationProgram(path.join(clean.releaseDirectory, "manifest.json")), /unexpected files or directories/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cancellation cleans owned staging, and a concurrent publisher lock is not stolen", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const outputRoot = path.join(root, "program");
    const signal = { checks: 0, throwIfAborted() { this.checks += 1; if (this.checks === 2) throw new Error("cancel program"); } };
    await assert.rejects(buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot, signal }), /cancel program/);
    const releases = path.join(outputRoot, "releases");
    assert.deepEqual(await readdir(releases), []);
    const packet = deriveBroadOrganizationAuthorizationProgram(source.backlog, source.manifestBytes, source.manifest);
    const expected = buildBroadOrganizationAuthorizationProgramManifest(packet);
    await mkdir(path.join(releases, `.${expected.release_id}.publish-lock`));
    await assert.rejects(buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot }), /EEXIST/);
    assert.deepEqual(await readdir(releases), [`.${expected.release_id}.publish-lock`]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects source actions and output outside canonical data", async () => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    await assert.rejects(buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot: path.join(os.tmpdir(), "broad-org-program-outside") }), /canonical APP_ROOT\/data/);
    const program = deriveBroadOrganizationAuthorizationProgram(source.backlog, source.manifestBytes, source.manifest);
    assert.equal(program.scope.source_actions_performed, 0);
    assert.equal(program.scope.action_boundary.records_requested, 0);
    assert.equal(program.scope.action_boundary.contact_performed, false);
    assert.equal(program.scope.action_boundary.download_performed, false);
    assert.equal(program.scope.action_boundary.payment_performed, false);
    assert.equal(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT.startsWith(DATA_DIR), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects hard-linked manifest or artifact bytes", async (t) => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const built = await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot: path.join(root, "program") });
    for (const name of ["manifest.json", "authorization-program.json"]) {
      const original = path.join(built.releaseDirectory, name);
      const alias = path.join(root, `alias-${name}`);
      try { await link(original, alias); } catch (error) {
        if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error.code)) { t.skip(`hard links unavailable: ${error.code}`); return; }
        throw error;
      }
      await assert.rejects(verifyBroadOrganizationAuthorizationProgram(path.join(built.releaseDirectory, "manifest.json")), /singly linked regular file/);
      await unlink(alias);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects linked output ancestry", async (t) => {
  const root = await tempDirectory();
  try {
    const source = await sourceBacklog();
    const target = path.join(root, "target");
    const linked = path.join(root, "linked");
    await mkdir(target);
    try { await symlink(target, linked, "junction"); } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error.code)) { t.skip(`junction creation unavailable: ${error.code}`); return; }
      throw error;
    }
    await assert.rejects(buildBroadOrganizationAuthorizationProgram({ backlogManifestPath: source.manifestPath, outputRoot: path.join(linked, "program") }), /linked or non-directory output ancestry/);
    assert.deepEqual(await readdir(target), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
