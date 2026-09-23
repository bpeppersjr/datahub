import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadStateBusinessSourceAssessmentCatalog } from "./state-business-source-assessment.mjs";
import { DATA_DIR } from "./paths.mjs";
import {
  buildBroadOrganizationAcquisitionBacklog,
  deriveBroadOrganizationAcquisitionBacklog,
  verifyBroadOrganizationAcquisitionBacklog,
} from "./broad-organization-acquisition-backlog.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function tempDirectory() {
  return mkdtemp(path.join(DATA_DIR, ".tmp-broad-org-acquisition-backlog-"));
}

test("derives exactly the 43 non-production-ready jurisdictions and a disclosed first wave", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  const backlog = deriveBroadOrganizationAcquisitionBacklog(catalog);
  assert.equal(backlog.states.length, 43);
  assert.equal(backlog.scope.total_assessed_jurisdictions, 51);
  assert.equal(backlog.scope.not_broad_layer_production_ready, 43);
  assert.deepEqual(backlog.scope.first_wave_state_abbreviations, backlog.states.slice(0, 10).map(({ assessment }) => assessment.state_abbreviation));
  assert.deepEqual(backlog.scope.first_wave_state_abbreviations.slice(0, 2), ["AK", "DC"]);
  assert.equal(backlog.states.every(({ assessment }) => assessment.broad_layer_production_ready === false), true);
  assert.equal(backlog.states.every(({ assessment }) => assessment.autonomous_acquisition_authorized === false
    && assessment.paid_acquisition_authorized === false
    && assessment.complete_source_acquisition_authorized === false
    && assessment.row_bearing_preflight_authorized === false), true);
  assert.equal(backlog.states.every(({ assessment }) => assessment.candidate.publisher && assessment.candidate.product
    && assessment.candidate.availability && assessment.candidate.price
    && assessment.unresolved_gates.length > 0 && assessment.official_urls.length >= 2
    && assessment.strongest_bounded_next_action), true);
  assert.deepEqual(deriveBroadOrganizationAcquisitionBacklog(catalog), backlog);
});

test("builds a manifest-last immutable release locally and verifies it without changing pointers", async () => {
  const root = await tempDirectory();
  try {
    const built = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    assert.equal(built.manifest.source_actions_performed, 0);
    assert.equal(built.manifest.current_pointer_changed, false);
    assert.equal(built.reused_existing_release, false);
    assert.equal((await readFile(path.join(built.releaseDirectory, "manifest.json"), "utf8")).endsWith("\n"), true);
    const verified = await verifyBroadOrganizationAcquisitionBacklog(path.join(built.releaseDirectory, "manifest.json"));
    assert.equal(verified.manifest.release_id, built.manifest.release_id);
    const repeated = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    assert.equal(repeated.reused_existing_release, true);
    assert.deepEqual(await readFile(path.join(root, "output", "current.json")).catch((error) => error.code), "ENOENT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifier rejects byte tampering even when artifact and manifest checksums are recomputed", async () => {
  const root = await tempDirectory();
  try {
    const built = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    const oldDirectory = built.releaseDirectory;
    const artifactPath = path.join(oldDirectory, "backlog.json");
    const manifestPath = path.join(oldDirectory, "manifest.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.states[0].assessment.candidate.price = "tampered price";
    const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(artifactPath, artifactBytes);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts[0].bytes = artifactBytes.length;
    manifest.artifacts[0].sha256 = hash(artifactBytes);
    const forgedReleaseId = `${manifest.dataset_id}-${artifact.observed_at}-${manifest.artifacts[0].sha256.slice(0, 12)}`;
    manifest.release_id = forgedReleaseId;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const newDirectory = path.join(path.dirname(oldDirectory), forgedReleaseId);
    await rename(oldDirectory, newDirectory);
    await assert.rejects(verifyBroadOrganizationAcquisitionBacklog(path.join(newDirectory, "manifest.json")), /manifest does not match|exact validated assessment-derived projection/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifier rejects rehashed authority widening", async () => {
  const root = await tempDirectory();
  try {
    const built = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    const oldDirectory = built.releaseDirectory;
    const artifactPath = path.join(oldDirectory, "backlog.json");
    const manifestPath = path.join(oldDirectory, "manifest.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.states[0].assessment.autonomous_acquisition_authorized = true;
    const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(artifactPath, artifactBytes);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts[0].bytes = artifactBytes.length;
    manifest.artifacts[0].sha256 = hash(artifactBytes);
    const forgedReleaseId = `${manifest.dataset_id}-${artifact.observed_at}-${manifest.artifacts[0].sha256.slice(0, 12)}`;
    manifest.release_id = forgedReleaseId;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const newDirectory = path.join(path.dirname(oldDirectory), forgedReleaseId);
    await rename(oldDirectory, newDirectory);
    await assert.rejects(verifyBroadOrganizationAcquisitionBacklog(path.join(newDirectory, "manifest.json")), /manifest does not match|exact validated assessment-derived projection/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects source catalog drift and missing release artifacts", async () => {
  const catalog = await loadStateBusinessSourceAssessmentCatalog();
  catalog.states[0].autonomous_acquisition_authorized = true;
  assert.throws(() => deriveBroadOrganizationAcquisitionBacklog(catalog), /authorization boundary drifted|content digest drifted/);
  const root = await tempDirectory();
  try {
    const releaseDirectory = path.join(root, "release");
    await mkdir(releaseDirectory);
    await writeFile(path.join(releaseDirectory, "manifest.json"), "{}\n");
    await assert.rejects(verifyBroadOrganizationAcquisitionBacklog(path.join(releaseDirectory, "manifest.json")), /manifest schema drifted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects manifest metadata tampering and mutable-pointer claims", async () => {
  const root = await tempDirectory();
  try {
    const built = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    const manifestPath = path.join(built.releaseDirectory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.current_pointer_changed = true;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(verifyBroadOrganizationAcquisitionBacklog(manifestPath), /manifest identity or authority boundary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects output roots outside canonical APP_ROOT/data without creating them", async () => {
  const outsideRoot = path.join(os.tmpdir(), `broad-org-backlog-outside-${randomUUID()}`);
  await assert.rejects(buildBroadOrganizationAcquisitionBacklog({ outputRoot: outsideRoot }), /canonical APP_ROOT\/data/);
  await assert.rejects(readFile(path.join(outsideRoot, "sentinel")), { code: "ENOENT" });
});

test("rejects symlink or junction ancestry where the platform supports it", async (t) => {
  const root = await tempDirectory();
  try {
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
    await assert.rejects(buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(linked, "backlog") }), /linked or non-directory output ancestry/);
    await assert.deepEqual(await readdir(target), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed staging is cleaned without leaving a deterministic release identity", async () => {
  const root = await tempDirectory();
  const outputRoot = path.join(root, "output");
  const controller = new AbortController();
  controller.abort(new Error("test cancellation after staging"));
  try {
    await assert.rejects(buildBroadOrganizationAcquisitionBacklog({ outputRoot, signal: controller.signal }), /test cancellation after staging/);
    const releases = path.join(outputRoot, "releases");
    assert.deepEqual(await readdir(releases), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifier rejects unexpected release files", async () => {
  const root = await tempDirectory();
  try {
    const built = await buildBroadOrganizationAcquisitionBacklog({ outputRoot: path.join(root, "output") });
    await writeFile(path.join(built.releaseDirectory, "unexpected.txt"), "not part of the release");
    await assert.rejects(verifyBroadOrganizationAcquisitionBacklog(path.join(built.releaseDirectory, "manifest.json")), /unexpected files or directories/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
