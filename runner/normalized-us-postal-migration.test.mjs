import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNormalizedUsPostalMigrationReady,
  compareSemanticVersions,
  formatNormalizedUsPostalMigrationReport,
  inspectNormalizedUsPostalMigration,
  manifestVersionCandidates,
} from "./normalized-us-postal-migration.mjs";

const definition = {
  migration_id: "normalized-us-postal-fields-v1",
  contract_version: "1.0.0",
  candidate_root: "data/migrations/normalized-us-postal-fields-v1",
  sources: [{
    source_key: "fixture",
    dataset_id: "fixture-businesses",
    pointer: "data/fixture/current.json",
    connector_config: "config/connectors/fixture.json",
    minimum_connector_version: "1.0.1",
    build_commands: ["npm run fixture:build"],
    verify_command: "npm run fixture:verify",
  }],
  downstream_order: ["npm run registry:build"],
};

async function writeFixture(root, { version = "1.0.1", evidence = "connector", connectorConfigVersion = "1.0.1", sourcePath = "data/fixture" } = {}) {
  const releaseId = "fixture-release";
  const sourceRoot = path.join(root, sourcePath);
  await mkdir(path.join(root, "config/connectors"), { recursive: true });
  await mkdir(path.join(sourceRoot, "releases", releaseId), { recursive: true });
  await writeFile(path.join(root, "config/connectors/fixture.json"), `${JSON.stringify({ connector_id: "fixture-connector", version: connectorConfigVersion })}\n`);
  const manifest = { dataset_id: "fixture-businesses", release_id: releaseId, status: "published" };
  if (evidence === "connector") manifest.connector = { id: "fixture-connector", version };
  if (evidence === "publisher") manifest.publisher = { id: "fixture-connector", version };
  if (evidence === "transformation") manifest.transformation_version = `fixture-connector@${version}`;
  await writeFile(path.join(sourceRoot, "releases", releaseId, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(path.join(sourceRoot, "current.json"), `${JSON.stringify({
    dataset_id: "fixture-businesses",
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
  })}\n`);
}

test("semantic migration version comparison is numeric", () => {
  assert.equal(compareSemanticVersions("1.0.1", "1.0.1"), 0);
  assert.equal(compareSemanticVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareSemanticVersions("2.0.0", "10.0.0"), -1);
  assert.throws(() => compareSemanticVersions("1.0", "1.0.0"), /major\.minor\.patch/);
});

test("manifest version evidence supports legacy publisher and transformation locations", () => {
  assert.deepEqual(manifestVersionCandidates({
    connector: { id: "a", version: "1.0.1" },
    publisher: { id: "b", version: "2.0.0" },
    transformation_version: "c@3.0.0",
    transformation: { id: "d@4.0.0" },
  }), [
    { id: "a", version: "1.0.1", location: "manifest.connector" },
    { id: "b", version: "2.0.0", location: "manifest.publisher" },
    { id: "c", version: "3.0.0", location: "manifest.transformation_version" },
    { id: "d", version: "4.0.0", location: "manifest.transformation.id" },
  ]);
});

test("migration inspector accepts a current release at or above the correction floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-ready-"));
  try {
    await writeFixture(root, { version: "1.1.0" });
    const report = await inspectNormalizedUsPostalMigration({ appRoot: root, definition });
    assert.equal(report.ready_for_registry_2_10, true);
    assert.deepEqual(report.counts, { total: 1, ready: 1, rebuild_required: 0, blocked: 0, candidate_pointers_used: 0 });
    assert.equal(report.sources[0].version_evidence, "manifest.connector");
    await assertNormalizedUsPostalMigrationReady({ appRoot: root, definition });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration inspector gives an ordered rebuild plan for a stale release", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-stale-"));
  try {
    await writeFixture(root, { version: "1.0.0", evidence: "transformation" });
    const report = await inspectNormalizedUsPostalMigration({ appRoot: root, definition });
    assert.equal(report.ready_for_registry_2_10, false);
    assert.equal(report.sources[0].status, "rebuild-required");
    assert.match(formatNormalizedUsPostalMigrationReport(report, { appRoot: root }), /npm run fixture:build/);
    await assert.rejects(
      assertNormalizedUsPostalMigrationReady({ appRoot: root, definition }),
      (error) => error.code === "ERR_NORMALIZED_US_POSTAL_MIGRATION_REQUIRED" && error.report.counts.rebuild_required === 1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration inspector blocks malformed identity and paths outside datahub", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-blocked-"));
  try {
    await writeFixture(root);
    const mismatched = structuredClone(definition);
    mismatched.sources[0].dataset_id = "different-dataset";
    const identityReport = await inspectNormalizedUsPostalMigration({ appRoot: root, definition: mismatched });
    assert.equal(identityReport.sources[0].status, "blocked");
    assert.match(identityReport.sources[0].reason, /expected dataset/);

    const escaped = structuredClone(definition);
    escaped.sources[0].pointer = "../outside/current.json";
    const pathReport = await inspectNormalizedUsPostalMigration({ appRoot: root, definition: escaped });
    assert.equal(pathReport.sources[0].status, "blocked");
    assert.match(pathReport.sources[0].reason, /escapes the datahub root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration inspector blocks a connector configuration below the declared floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-config-"));
  try {
    await writeFixture(root, { connectorConfigVersion: "1.0.0" });
    const report = await inspectNormalizedUsPostalMigration({ appRoot: root, definition });
    assert.equal(report.sources[0].status, "blocked");
    assert.match(report.sources[0].reason, /older than migration minimum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration inspector reports missing rebuild secrets without exposing values", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-secret-"));
  try {
    await writeFixture(root, { version: "1.0.0" });
    const gated = structuredClone(definition);
    gated.sources[0].rebuild_prerequisites = { required_environment: ["FIXTURE_SECRET"], note: "Supply through the process environment." };
    const report = await inspectNormalizedUsPostalMigration({ appRoot: root, definition: gated, environment: {} });
    assert.equal(report.sources[0].status, "blocked");
    assert.match(report.sources[0].reason, /FIXTURE_SECRET/);
    assert.doesNotMatch(JSON.stringify(report), /secret-value/);
    const readyToRebuild = await inspectNormalizedUsPostalMigration({ appRoot: root, definition: gated, environment: { FIXTURE_SECRET: "secret-value" } });
    assert.equal(readyToRebuild.sources[0].status, "rebuild-required");
    assert.doesNotMatch(JSON.stringify(readyToRebuild), /secret-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration inspector prefers an isolated candidate without changing production readiness", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "postal-migration-candidate-"));
  try {
    await writeFixture(root, { version: "1.0.0" });
    await writeFixture(root, {
      version: "1.0.1",
      sourcePath: "data/migrations/normalized-us-postal-fields-v1/sources/fixture",
    });
    const production = await inspectNormalizedUsPostalMigration({ appRoot: root, definition });
    const candidates = await inspectNormalizedUsPostalMigration({ appRoot: root, definition, useCandidatePointers: true });
    assert.equal(production.counts.ready, 0);
    assert.equal(production.sources[0].pointer_scope, "production");
    assert.equal(candidates.counts.ready, 1);
    assert.equal(candidates.counts.candidate_pointers_used, 1);
    assert.equal(candidates.sources[0].pointer_scope, "candidate");
    assert.notEqual(candidates.plan_sha256, production.plan_sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
