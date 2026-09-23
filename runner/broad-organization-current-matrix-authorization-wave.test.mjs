import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";
import { DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT, deriveCurrentMatrixAuthorizationWave, buildCurrentMatrixAuthorizationWave, verifyCurrentMatrixAuthorizationWave } from "./broad-organization-current-matrix-authorization-wave.mjs";
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
async function buildThroughWave(outputRoot, waveNumber) {
  let current;
  for (let number = 1; number <= waveNumber; number += 1) current = await buildCurrentMatrixAuthorizationWave({ waveNumber: number, outputRoot });
  return current;
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

test("publishes wave two as the next exact ten with 10 + 10 + 20 gap conservation", async (t) => {
  await rm(temp, { recursive: true, force: true });
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outputRoot = path.join(temp, "wave-two-root");
  await buildCurrentMatrixAuthorizationWave({ waveNumber: 1, outputRoot });
  const built = await buildCurrentMatrixAuthorizationWave({ waveNumber: 2, outputRoot });
  const expected = ["AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME"];
  assert.deepEqual(built.wave.wave_state_abbreviations, expected);
  assert.equal(built.wave.scope.wave_number, 2);
  assert.equal(built.wave.scope.prior_wave_jurisdictions, 10);
  assert.equal(built.wave.scope.selected_jurisdictions, 10);
  assert.equal(built.wave.scope.remaining_current_gaps, 20);
  assert.equal(built.wave.scope.conservation_total, 40);
  assert.equal(built.wave.scope.wave_number, 2);
  assert.equal(built.manifest.remaining_gap_count, 20);
  assert.match(built.wave.prior_wave.release_id, /^broad-organization-current-matrix-authorization-wave-/);
  assert.equal(built.wave.prior_wave.wave_state_abbreviations.join(","), "IL,MS,AR,KY,HI,KS,NV,UT,WA,OK");
  assert.equal(new Set([...built.wave.prior_wave.wave_state_abbreviations, ...built.wave.wave_state_abbreviations]).size, 20);
  assert.ok(built.wave.states.every((row, index) => row.wave_position === index + 1 && row.approval_status === "HOLD" && row.item_kind === "approval-only" && row.acquisition_authorized === false));
  assert.ok(built.wave.states.every((row) => row.assessment_snapshot.state_abbreviation === row.state_abbreviation && JSON.stringify(row.unresolved_gates) === JSON.stringify(row.assessment_snapshot.unresolved_gates) && JSON.stringify(row.required_exclusions) === JSON.stringify(row.assessment_snapshot.required_exclusions)));
  const manifestPath = path.join(built.releaseDirectory, "manifest.json");
  assert.deepEqual((await verifyCurrentMatrixAuthorizationWave(manifestPath)).wave.wave_state_abbreviations, expected);
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

test("wave-two verifier rejects a rehashed overlap with wave one and authority widening", async (t) => {
  await rm(temp, { recursive: true, force: true });
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outputRoot = path.join(temp, "overlap-root");
  await buildCurrentMatrixAuthorizationWave({ waveNumber: 1, outputRoot });
  const built = await buildCurrentMatrixAuthorizationWave({ waveNumber: 2, outputRoot });
  const manifestPath = path.join(built.releaseDirectory, "manifest.json"), artifactPath = path.join(built.releaseDirectory, "authorization-wave.json");
  const altered = JSON.parse(await readFile(artifactPath, "utf8"));
  const priorDirectory = path.join(DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT, "releases", built.wave.prior_wave.release_id);
  const prior = JSON.parse(await readFile(path.join(priorDirectory, "authorization-wave.json"), "utf8"));
  altered.states[0] = prior.states[0];
  altered.wave_state_abbreviations[0] = prior.states[0].state_abbreviation;
  altered.states[0].acquisition_authorized = true;
  const bytes = Buffer.from(`${JSON.stringify(altered, null, 2)}\n`), manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].bytes = bytes.length;
  manifest.artifacts[0].sha256 = digest(bytes);
  await writeFile(artifactPath, bytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(verifyCurrentMatrixAuthorizationWave(manifestPath), /differs from exact current projection|widens authority/);
});

test("publishes waves three and four as exact chained priority slices with cumulative conservation", async (t) => {
  await rm(temp, { recursive: true, force: true });
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outputRoot = path.join(temp, "four-wave-chain");
  const missingRoot = path.join(temp, "missing-prior-chain");
  await assert.rejects(buildCurrentMatrixAuthorizationWave({ waveNumber: 3, outputRoot: missingRoot }));
  const wave3 = await buildThroughWave(outputRoot, 3);
  assert.deepEqual(wave3.wave.wave_state_abbreviations, ["MI", "MN", "MO", "MT", "NC", "ND", "NH", "NJ", "NM", "OH"]);
  assert.equal(wave3.wave.scope.prior_wave_jurisdictions, 20);
  assert.equal(wave3.wave.scope.selected_jurisdictions, 10);
  assert.equal(wave3.wave.scope.remaining_current_gaps, 10);
  assert.equal(wave3.wave.scope.conservation_total, 40);
  assert.equal(wave3.wave.prior_wave.wave_state_abbreviations.join(","), "AL,AZ,CA,GA,ID,IN,LA,MA,MD,ME");
  const wave4 = await buildCurrentMatrixAuthorizationWave({ waveNumber: 4, outputRoot });
  assert.deepEqual(wave4.wave.wave_state_abbreviations, ["RI", "SC", "SD", "TN", "VA", "VT", "WI", "WV", "WY", "NE"]);
  assert.equal(wave4.wave.scope.prior_wave_jurisdictions, 30);
  assert.equal(wave4.wave.scope.selected_jurisdictions, 10);
  assert.equal(wave4.wave.scope.remaining_current_gaps, 0);
  assert.equal(wave4.wave.scope.conservation_total, 40);
  assert.equal(wave3.wave.scope.acquisition_authorized, false);
  assert.equal(wave3.wave.scope.source_actions_performed, 0);
  assert.equal(wave3.wave.scope.network_requests, 0);
  assert.equal(wave3.wave.scope.current_pointer_changed, false);
  assert.equal(wave4.wave.scope.acquisition_authorized, false);
  assert.equal(wave4.wave.scope.source_actions_performed, 0);
  assert.equal(wave4.wave.scope.network_requests, 0);
  assert.equal(wave4.wave.scope.current_pointer_changed, false);
  assert.equal(wave4.wave.prior_wave.wave_state_abbreviations.join(","), "MI,MN,MO,MT,NC,ND,NH,NJ,NM,OH");
  assert.equal((await verifyCurrentMatrixAuthorizationWave(path.join(wave3.releaseDirectory, "manifest.json"))).wave.scope.wave_number, 3);
  assert.equal((await verifyCurrentMatrixAuthorizationWave(path.join(wave4.releaseDirectory, "manifest.json"))).wave.scope.wave_number, 4);
  const all = ["IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT", "WA", "OK", "AL", "AZ", "CA", "GA", "ID", "IN", "LA", "MA", "MD", "ME", ...wave3.wave.wave_state_abbreviations, ...wave4.wave.wave_state_abbreviations];
  assert.equal(new Set(all).size, 40);
  assert.ok([...wave3.wave.states, ...wave4.wave.states].every((row) => row.item_kind === "approval-only" && row.approval_status === "HOLD" && row.acquisition_authorized === false && row.gate_items.every((item) => item.status === "HOLD" && item.acquisition_authorized === false)));
});

test("a tampered prior published wave blocks the next wave", async (t) => {
  await rm(temp, { recursive: true, force: true });
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outputRoot = path.join(temp, "tampered-prior-chain");
  await buildThroughWave(outputRoot, 2);
  const releases = path.join(outputRoot, "releases"), entries = await readdir(releases, { withFileTypes: true });
  let wave2Directory = null;
  for (const entry of entries.filter((row) => row.isDirectory())) {
    const artifactPath = path.join(releases, entry.name, "authorization-wave.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    if (artifact.scope.wave_number === 2) wave2Directory = path.join(releases, entry.name);
  }
  assert.ok(wave2Directory);
  const artifactPath = path.join(wave2Directory, "authorization-wave.json"), artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  artifact.states[0].acquisition_authorized = true;
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  await assert.rejects(buildCurrentMatrixAuthorizationWave({ waveNumber: 3, outputRoot }), /checksum mismatch/);
});

test("wave build CLI rejects invalid, repeated, and unknown flags without publication", () => {
  const script = fileURLToPath(new URL("../scripts/build-broad-organization-current-matrix-authorization-wave.mjs", import.meta.url));
  for (const args of [["--wave", "5"], ["--wave", "3", "--wave", "4"], ["--unknown", "value"], ["--wave"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `expected CLI arguments to fail: ${args.join(" ")}`);
  }
});
