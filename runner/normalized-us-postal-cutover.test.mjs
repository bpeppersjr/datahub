import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNoNormalizedUsPostalCutoverInProgress,
  executeNormalizedUsPostalCutover,
  inspectNormalizedUsPostalCutoverControl,
  prepareNormalizedUsPostalCutover,
  readNormalizedUsPostalCutover,
  recoverNormalizedUsPostalCutover,
  rollbackNormalizedUsPostalCutover,
} from "./normalized-us-postal-cutover.mjs";

const migrationRoot = "data/migrations/normalized-us-postal-fields-v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function sourceDefinition(key) {
  return {
    source_key: key,
    dataset_id: `${key}-dataset`,
    pointer: `data/business-sources/${key}/current.json`,
    connector_config: `config/connectors/${key}.json`,
    minimum_connector_version: "1.0.1",
    build_commands: [`npm run ${key}:build`],
    verify_command: `npm run ${key}:verify`,
  };
}

async function writeRelease(root, key, { candidate, version, releaseId, body }) {
  const sourceRoot = candidate
    ? path.join(root, migrationRoot, "sources", key)
    : path.join(root, "data/business-sources", key);
  const releaseRoot = path.join(sourceRoot, "releases", releaseId);
  const artifactPath = path.join(releaseRoot, "derived/rows.jsonl");
  const artifact = Buffer.from(body);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, artifact);
  await writeFile(path.join(releaseRoot, "manifest.json"), json({
    dataset_id: `${key}-dataset`,
    release_id: releaseId,
    status: "published",
    connector: { id: `${key}-connector`, version },
    artifacts: [{
      path: "derived/rows.jsonl",
      bytes: artifact.byteLength,
      sha256: sha256(artifact),
      artifact_type: "fixture-jsonl",
    }],
  }));
  const pointer = json({
    dataset_id: `${key}-dataset`,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: "2026-09-03T00:00:00.000Z",
  });
  await writeFile(path.join(sourceRoot, "current.json"), pointer);
  return { sourceRoot, releaseRoot, pointer };
}

async function fixture(sourceKeys = ["alpha"]) {
  const root = await mkdtemp(path.join(tmpdir(), "postal-cutover-"));
  const sources = sourceKeys.map(sourceDefinition);
  await mkdir(path.join(root, "config/connectors"), { recursive: true });
  await mkdir(path.join(root, "config/migrations"), { recursive: true });
  for (const key of sourceKeys) {
    await writeFile(path.join(root, "config/connectors", `${key}.json`), json({ connector_id: `${key}-connector`, version: "1.0.1" }));
  }
  const definition = {
    migration_id: "normalized-us-postal-fields-v1",
    contract_version: "1.0.0",
    candidate_root: migrationRoot,
    execution_order: sourceKeys,
    sources,
    downstream_order: ["npm run registry:build"],
  };
  await writeFile(path.join(root, "config/migrations/normalized-us-postal-fields-v1.json"), json(definition));
  return { root, definition };
}

test("cutover planning requires every source to have an isolated ready candidate", async () => {
  const { root, definition } = await fixture();
  try {
    await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    await assert.rejects(
      prepareNormalizedUsPostalCutover({ appRoot: root, definition }),
      /requires every source to use a ready isolated candidate/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cutover planning rejects candidate artifact tampering", async () => {
  const { root, definition } = await fixture();
  try {
    await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    const candidate = await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    await writeFile(path.join(candidate.releaseRoot, "derived/rows.jsonl"), "tampered\n");
    await assert.rejects(prepareNormalizedUsPostalCutover({ appRoot: root, definition }), /byte count differs|SHA-256 differs/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cutover copies verified immutable releases, promotes with CAS, and rolls back pointers only", async () => {
  const { root, definition } = await fixture();
  try {
    const production = await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    const candidate = await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    const result = await executeNormalizedUsPostalCutover({
      appRoot: root,
      definition,
      plan,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    });
    assert.equal(result.state.status, "COMMITTED");
    assert.equal(JSON.parse(await readFile(path.join(production.sourceRoot, "current.json"), "utf8")).release_id, "alpha-new");
    assert.equal(await readFile(path.join(production.sourceRoot, "releases/alpha-new/derived/rows.jsonl"), "utf8"), "new\n");
    assert.equal(await readFile(path.join(candidate.releaseRoot, "derived/rows.jsonl"), "utf8"), "new\n");
    await assert.rejects(access(path.join(root, migrationRoot, "cutover.lock")));

    const rolledBack = await rollbackNormalizedUsPostalCutover({
      appRoot: root,
      cutoverId: result.state.cutover_id,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    });
    assert.equal(rolledBack.status, "ROLLED_BACK");
    assert.deepEqual(await readFile(path.join(production.sourceRoot, "current.json")), Buffer.from(production.pointer));
    assert.equal(await readFile(path.join(production.sourceRoot, "releases/alpha-new/derived/rows.jsonl"), "utf8"), "new\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cutover rejects production pointer drift before any pointer is promoted", async () => {
  const { root, definition } = await fixture();
  try {
    const production = await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    await writeFile(path.join(production.sourceRoot, "current.json"), `${production.pointer.trimEnd()} `);
    await assert.rejects(executeNormalizedUsPostalCutover({
      appRoot: root,
      definition,
      plan,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    }), /changed after the cutover plan was prepared/i);
    assert.equal(JSON.parse(await readFile(path.join(production.sourceRoot, "current.json"), "utf8")).release_id, "alpha-old");
    await assert.rejects(access(path.join(root, migrationRoot, "cutover.lock")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registry gate rejects any extant cutover lock", async () => {
  const { root } = await fixture();
  try {
    await mkdir(path.join(root, migrationRoot), { recursive: true });
    await writeFile(path.join(root, migrationRoot, "cutover.lock"), "locked\n");
    await assert.rejects(assertNoNormalizedUsPostalCutoverInProgress({ appRoot: root }), /blocked while a postal migration cutover lock exists/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an active cutover lock rejects overlapping execution before copying or promotion", async () => {
  const { root, definition } = await fixture();
  try {
    const production = await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    await writeFile(path.join(root, migrationRoot, "cutover.lock"), json({
      schema_version: 1,
      cutover_id: "active-cutover",
      pid: process.pid,
      hostname: hostname(),
      token: "active-owner",
      operation: "execute",
      acquired_at: new Date().toISOString(),
    }));
    await assert.rejects(executeNormalizedUsPostalCutover({
      appRoot: root,
      definition,
      plan,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    }), /lock is held by cutover active-cutover/i);
    assert.deepEqual(await readFile(path.join(production.sourceRoot, "current.json")), Buffer.from(production.pointer));
    await assert.rejects(access(path.join(production.sourceRoot, "releases/alpha-new")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("management status exposes safe lock metadata without its ownership token", async () => {
  const { root } = await fixture();
  try {
    await mkdir(path.join(root, migrationRoot), { recursive: true });
    await writeFile(path.join(root, migrationRoot, "cutover.lock"), json({
      schema_version: 1,
      cutover_id: "visible-cutover",
      pid: 2147483647,
      hostname: hostname(),
      token: "must-not-be-exposed",
      operation: "execute",
      acquired_at: "2026-09-03T00:00:00.000Z",
    }));
    const status = await inspectNormalizedUsPostalCutoverControl({ appRoot: root });
    assert.equal(status.lock_present, true);
    assert.equal(status.lock.cutover_id, "visible-cutover");
    assert.equal(status.lock.owner_alive, false);
    assert.equal(status.lock.token, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary promotion failure rolls back already-promoted pointers and releases the lock", async () => {
  const { root, definition } = await fixture(["alpha", "beta"]);
  try {
    const originals = new Map();
    for (const key of ["alpha", "beta"]) {
      originals.set(key, await writeRelease(root, key, { candidate: false, version: "1.0.0", releaseId: `${key}-old`, body: `old-${key}\n` }));
      await writeRelease(root, key, { candidate: true, version: "1.0.1", releaseId: `${key}-new`, body: `new-${key}\n` });
    }
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    let failure;
    try {
      await executeNormalizedUsPostalCutover({
        appRoot: root,
        definition,
        plan,
        expectedPlanSha256: plan.plan_sha256,
        confirm: true,
        testHooks: { afterPointerPromoted: ({ index }) => { if (index === 0) throw new Error("injected promotion failure"); } },
      });
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message ?? "", /rolled back/i);
    const state = await readNormalizedUsPostalCutover({ appRoot: root, cutoverId: failure.cutover_id });
    assert.equal(state.status, "ROLLED_BACK");
    for (const [key, original] of originals) {
      assert.deepEqual(await readFile(path.join(root, `data/business-sources/${key}/current.json`)), Buffer.from(original.pointer));
    }
    await assert.rejects(access(path.join(root, migrationRoot, "cutover.lock")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery reclaims a dead-owner lock and restores a pointer left at the candidate hash", async () => {
  const { root, definition } = await fixture();
  try {
    const production = await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    const candidate = await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    const cutoverId = "fixture-interrupted-cutover";
    const runRoot = path.join(root, migrationRoot, "cutovers", cutoverId);
    await mkdir(path.join(runRoot, "backups"), { recursive: true });
    await writeFile(path.join(runRoot, "plan.json"), json(plan));
    await writeFile(path.join(runRoot, "backups/alpha.current.json"), production.pointer);
    await writeFile(path.join(runRoot, "state.json"), json({
      schema_version: 1,
      cutover_id: cutoverId,
      migration_id: plan.migration_id,
      plan_sha256: plan.plan_sha256,
      status: "PROMOTING_POINTERS",
      state_revision: 3,
      created_at: "2026-09-03T00:00:00.000Z",
      updated_at: "2026-09-03T00:00:01.000Z",
      prepared_sources: ["alpha"],
      promoted_sources: [],
    }));
    await writeFile(path.join(production.sourceRoot, "current.json"), candidate.pointer);
    await writeFile(path.join(root, migrationRoot, "cutover.lock"), json({
      schema_version: 1,
      cutover_id: cutoverId,
      pid: 2147483647,
      hostname: hostname(),
      token: "fixture-dead-owner",
      operation: "execute",
      acquired_at: "2026-09-03T00:00:00.000Z",
    }));

    const recovered = await recoverNormalizedUsPostalCutover({
      appRoot: root,
      cutoverId,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    });
    assert.equal(recovered.status, "ROLLED_BACK");
    assert.deepEqual(await readFile(path.join(production.sourceRoot, "current.json")), Buffer.from(production.pointer));
    await assert.rejects(access(path.join(root, migrationRoot, "cutover.lock")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("committed rollback refuses to overwrite an independently changed production pointer", async () => {
  const { root, definition } = await fixture();
  try {
    const production = await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    const result = await executeNormalizedUsPostalCutover({ appRoot: root, definition, plan, expectedPlanSha256: plan.plan_sha256, confirm: true });
    const independent = json({ dataset_id: "alpha-dataset", release_id: "independent", manifest: "releases/independent/manifest.json" });
    await writeFile(path.join(production.sourceRoot, "current.json"), independent);
    await assert.rejects(rollbackNormalizedUsPostalCutover({
      appRoot: root,
      cutoverId: result.state.cutover_id,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    }), /independently changed pointer/i);
    assert.equal(await readFile(path.join(production.sourceRoot, "current.json"), "utf8"), independent);
    assert.equal((await readNormalizedUsPostalCutover({ appRoot: root, cutoverId: result.state.cutover_id })).status, "COMMITTED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery clears a dead-owner lock left after the committed state was persisted", async () => {
  const { root, definition } = await fixture();
  try {
    await writeRelease(root, "alpha", { candidate: false, version: "1.0.0", releaseId: "alpha-old", body: "old\n" });
    await writeRelease(root, "alpha", { candidate: true, version: "1.0.1", releaseId: "alpha-new", body: "new\n" });
    const plan = await prepareNormalizedUsPostalCutover({ appRoot: root, definition });
    const result = await executeNormalizedUsPostalCutover({ appRoot: root, definition, plan, expectedPlanSha256: plan.plan_sha256, confirm: true });
    await writeFile(path.join(root, migrationRoot, "cutover.lock"), json({
      schema_version: 1,
      cutover_id: result.state.cutover_id,
      pid: 2147483647,
      hostname: hostname(),
      token: "fixture-dead-owner-after-commit",
      operation: "execute",
      acquired_at: "2026-09-03T00:00:00.000Z",
    }));
    const recovered = await recoverNormalizedUsPostalCutover({
      appRoot: root,
      cutoverId: result.state.cutover_id,
      expectedPlanSha256: plan.plan_sha256,
      confirm: true,
    });
    assert.equal(recovered.status, "COMMITTED");
    await assert.rejects(access(path.join(root, migrationRoot, "cutover.lock")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
