import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, verifyBroadOrganizationAcquisitionBacklog } from "./broad-organization-acquisition-backlog.mjs";
import { readNewestNationalGoalCompletionMatrix } from "./national-goal-completion-view.mjs";
import { verifyBroadOrganizationMatrixGapProjection, buildBroadOrganizationMatrixGapProjection, deriveBroadOrganizationMatrixGapProjection } from "./broad-organization-matrix-gap-projection.mjs";
import { DATA_DIR } from "./paths.mjs";

const temporaryRoot = path.join(DATA_DIR, `.tmp-broad-org-matrix-gap-${process.pid}`);
async function currentBacklog() {
  const entries = await readdir(path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases"), { withFileTypes: true });
  const latest = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-acquisition-backlog-")).map((entry) => entry.name).sort().reverse()[0];
  assert.ok(latest, "expected an existing immutable backlog release");
  const manifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases", latest, "manifest.json");
  return { path: manifestPath, ...(await verifyBroadOrganizationAcquisitionBacklog(manifestPath)) };
}

test("matrix-aligned projection preserves 43-state history while isolating exactly the current 40 broad-layer gaps", async () => {
  const backlog = await currentBacklog();
  const backlogPath = backlog.path;
  const matrix = await readNewestNationalGoalCompletionMatrix();
  assert.ok(matrix);
  const manifestBytes = await readFile(backlogPath);
  const matrixManifestBytes = await readFile(matrix.manifestPath);
  const matrixManifest = JSON.parse(matrixManifestBytes);
  const matrixArtifactBytes = await readFile(path.join(path.dirname(matrix.manifestPath), "report.json"));
  const artifactSha = createHash("sha256").update(matrixArtifactBytes).digest("hex");
  const projection = deriveBroadOrganizationMatrixGapProjection(backlog.backlog, manifestBytes, backlog.manifest, matrix.report, matrixManifestBytes, matrixManifest, artifactSha);
  const gaps = new Set(projection.gaps.map((row) => row.state_abbreviation));
  const admitted = new Map(projection.admitted_jurisdictions.map((row) => [row.state_abbreviation, row]));
  assert.equal(projection.scope.historical_backlog_jurisdictions, 43);
  assert.equal(projection.scope.current_broad_layer_gaps, 40);
  assert.equal(projection.scope.jurisdictions, 51);
  assert.equal(admitted.size, 11);
  for (const code of ["TX", "DC", "AK"]) { assert.equal(gaps.has(code), false); assert.equal(admitted.get(code)?.historical_backlog_member, true); }
  assert.ok(projection.gaps.every((row) => row.assessment_snapshot.state_abbreviation === row.state_abbreviation && row.assessment_snapshot.unresolved_gates.length === row.unresolved_gates.length));
  assert.ok(projection.gaps.every((row) => row.authority.acquisition_authorized === false));
});

test("current matrix and backlog roster drift fail closed", async () => {
  const backlog = await currentBacklog();
  const backlogPath = backlog.path;
  const matrix = await readNewestNationalGoalCompletionMatrix();
  const backlogBytes = await readFile(backlogPath), matrixBytes = await readFile(matrix.manifestPath), matrixManifest = JSON.parse(matrixBytes);
  const artifactSha = createHash("sha256").update(await readFile(path.join(path.dirname(matrix.manifestPath), "report.json"))).digest("hex");
  assert.throws(() => deriveBroadOrganizationMatrixGapProjection(backlog.backlog, backlogBytes, backlog.manifest, { ...matrix.report, jurisdictions: matrix.report.jurisdictions.slice(1) }, matrixBytes, matrixManifest, artifactSha), /matrix identity|roster/);
  const driftedMatrix = structuredClone(matrix.report);
  driftedMatrix.jurisdictions.find((row) => row.code === "AK").categories.find((row) => row.category_id === "general-business").datasets[0].availability_status = "unmeasured";
  const driftedMatrixManifest = structuredClone(matrixManifest);
  const driftedArtifactBytes = Buffer.from(`${JSON.stringify(driftedMatrix, null, 2)}\n`);
  driftedMatrixManifest.artifacts[0].bytes = driftedArtifactBytes.length;
  driftedMatrixManifest.artifacts[0].sha256 = createHash("sha256").update(driftedArtifactBytes).digest("hex");
  assert.throws(() => deriveBroadOrganizationMatrixGapProjection(backlog.backlog, backlogBytes, backlog.manifest, driftedMatrix, Buffer.from(`${JSON.stringify(driftedMatrixManifest, null, 2)}\n`), driftedMatrixManifest, driftedMatrixManifest.artifacts[0].sha256), /40 gaps/);
  const alteredBacklog = structuredClone(backlog.backlog);
  alteredBacklog.states[0].assessment.unresolved_gates = [];
  assert.throws(() => deriveBroadOrganizationMatrixGapProjection(alteredBacklog, backlogBytes, backlog.manifest, matrix.report, matrixBytes, matrixManifest, artifactSha), /source bytes or artifact binding/);
});

test("publishes immutable, source-replayed projection and rejects artifact tampering", async (t) => {
  await rm(temporaryRoot, { recursive: true, force: true });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const built = await buildBroadOrganizationMatrixGapProjection({ outputRoot: path.join(temporaryRoot, "release-root") });
  assert.equal(built.manifest.current_gap_count, 40);
  assert.equal(built.manifest.admitted_broad_layer_count, 11);
  assert.equal(built.manifest.source_actions_performed, 0);
  assert.equal(built.manifest.network_requests, 0);
  assert.equal(built.manifest.current_pointer_changed, false);
  const pathToManifest = path.join(built.releaseDirectory, "manifest.json");
  assert.equal((await verifyBroadOrganizationMatrixGapProjection(pathToManifest)).projection.gaps.length, 40);
  const artifactPath = path.join(built.releaseDirectory, "gap-projection.json");
  const altered = JSON.parse(await readFile(artifactPath, "utf8"));
  altered.gaps[0].authority.acquisition_authorized = true;
  const alteredBytes = Buffer.from(`${JSON.stringify(altered, null, 2)}\n`);
  const manifestPathBytes = JSON.parse(await readFile(pathToManifest, "utf8"));
  manifestPathBytes.artifacts[0].bytes = alteredBytes.length;
  manifestPathBytes.artifacts[0].sha256 = createHash("sha256").update(alteredBytes).digest("hex");
  await writeFile(artifactPath, alteredBytes);
  await writeFile(pathToManifest, `${JSON.stringify(manifestPathBytes, null, 2)}\n`);
  await assert.rejects(verifyBroadOrganizationMatrixGapProjection(pathToManifest), /differs from the independently verified/);
  await writeFile(artifactPath, "tampered\n");
  await assert.rejects(verifyBroadOrganizationMatrixGapProjection(pathToManifest), /checksum mismatch/);
});
