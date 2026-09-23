import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";
import { deriveCurrentMatrixAuthorizationWave, buildCurrentMatrixAuthorizationWave, verifyCurrentMatrixAuthorizationWave } from "./broad-organization-current-matrix-authorization-wave.mjs";
import { DATA_DIR } from "./paths.mjs";

const temp = path.join(DATA_DIR, `.tmp-current-matrix-wave-${process.pid}`);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function sourceProjection() {
  const root = path.join(DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, "releases");
  const entries = await readdir(root, { withFileTypes: true });
  const latest = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-matrix-gap-projection-")).map((entry) => entry.name).sort().reverse()[0];
  assert.ok(latest, "expected a verified matrix-gap projection release");
  const directory = path.join(root, latest), manifestPath = path.join(directory, "manifest.json");
  const verified = await verifyBroadOrganizationMatrixGapProjection(manifestPath);
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifactBytes = await readFile(path.join(directory, "gap-projection.json"));
  return { projection: verified.projection, manifest, manifestBytes, artifactSha: digest(artifactBytes) };
}

test("selects exactly the ten highest historical priorities still in the current gap set", async () => {
  const source = await sourceProjection();
  const wave = deriveCurrentMatrixAuthorizationWave(source.projection, source.manifestBytes, source.manifest, source.artifactSha);
  const expected = ["IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT", "WA", "OK"];
  assert.deepEqual(wave.wave_state_abbreviations, expected);
  assert.equal(wave.scope.matrix_gap_jurisdictions, 40);
  assert.equal(wave.scope.selected_jurisdictions, 10);
  assert.equal(wave.scope.remaining_current_gaps, 30);
  assert.equal(wave.scope.conservation_total, 40);
  assert.ok(["AK", "DC", "TX"].every((code) => !wave.wave_state_abbreviations.includes(code)));
  assert.ok(wave.states.every((row, index) => row.wave_position === index + 1 && row.approval_status === "HOLD" && row.item_kind === "approval-only" && row.acquisition_authorized === false));
  assert.ok(wave.states.every((row) => row.assessment_snapshot.state_abbreviation === row.state_abbreviation && row.unresolved_gates.length === row.assessment_snapshot.unresolved_gates.length && JSON.stringify(row.required_exclusions) === JSON.stringify(row.assessment_snapshot.required_exclusions)));
  assert.ok(wave.states.every((row) => row.gate_items.every((item) => item.item_kind === "approval-only" && item.status === "HOLD" && item.acquisition_authorized === false && item.source_action_authorized === false)));
  assert.equal(wave.scope.source_actions_performed, 0);
  assert.equal(wave.scope.network_requests, 0);
  assert.equal(wave.scope.current_pointer_changed, false);
});

test("rejects projection and source-hash drift rather than widening or reordering the wave", async () => {
  const source = await sourceProjection();
  const alteredRoster = structuredClone(source.projection);
  alteredRoster.gaps[0].backlog_priority = 0;
  assert.throws(() => deriveCurrentMatrixAuthorizationWave(alteredRoster, source.manifestBytes, source.manifest, source.artifactSha), /manifest\/artifact binding drifted/);
  assert.throws(() => deriveCurrentMatrixAuthorizationWave(source.projection, source.manifestBytes, source.manifest, "0".repeat(64)), /manifest\/artifact binding drifted/);
});

test("publishes immutable packet, rejects rehashed authority widening, cancellation and unsafe output", async (t) => {
  await rm(temp, { recursive: true, force: true });
  t.after(() => rm(temp, { recursive: true, force: true }));
  const built = await buildCurrentMatrixAuthorizationWave({ outputRoot: path.join(temp, "release-root") });
  const manifestPath = path.join(built.releaseDirectory, "manifest.json"), artifactPath = path.join(built.releaseDirectory, "authorization-wave.json");
  assert.equal(built.manifest.jurisdiction_count, 10);
  assert.equal(built.manifest.source_gap_count, 40);
  assert.equal(built.manifest.remaining_gap_count, 30);
  assert.equal((await verifyCurrentMatrixAuthorizationWave(manifestPath)).wave.states.length, 10);
  const altered = JSON.parse(await readFile(artifactPath, "utf8"));
  altered.states[0].acquisition_authorized = true;
  const alteredBytes = Buffer.from(`${JSON.stringify(altered, null, 2)}\n`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].bytes = alteredBytes.length;
  manifest.artifacts[0].sha256 = digest(alteredBytes);
  await writeFile(artifactPath, alteredBytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(verifyCurrentMatrixAuthorizationWave(manifestPath), /differs from exact current projection|widens authority/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildCurrentMatrixAuthorizationWave({ outputRoot: path.join(temp, "cancelled"), signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(buildCurrentMatrixAuthorizationWave({ outputRoot: os.tmpdir() }), /canonical APP_ROOT\/data/);
});
