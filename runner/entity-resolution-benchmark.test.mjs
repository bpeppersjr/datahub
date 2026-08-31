import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { buildBusinessEntityResolution, createLocationMatchProfile } from "./business-entity-resolution.mjs";
import {
  buildEntityResolutionBenchmarkLabelRelease,
  verifyEntityResolutionBenchmarkLabelRelease,
} from "./entity-resolution-benchmark-labels.mjs";
import {
  buildEntityResolutionBenchmarkSample,
  evaluateBenchmarkLabels,
  verifyEntityResolutionBenchmarkSample,
  wilsonLowerBound,
} from "./entity-resolution-benchmark.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function profile({ sourceId, recordId, name, street, zipCode = "60601" }) {
  const siteId = `site:${sourceId}_${recordId}`;
  const establishmentId = `establishment:${sourceId}_${recordId}`;
  return createLocationMatchProfile({
    normalized_record_id: `${sourceId}:${recordId}`,
    observed_at: "2026-08-30T20:00:00.000Z",
    export_policy: "public",
    provenance: {
      source_id: sourceId,
      source_release_id: `${sourceId}-release`,
      source_record_id: recordId,
      ingest_run_id: `${sourceId}-run`,
      transformation_version: `${sourceId}@1.0.0`,
      policy_id: `${sourceId}-policy`,
    },
  }, {
    zipCode,
    entities: [
      { entity_id: siteId, entity_type: "physical_site" },
      { entity_id: establishmentId, entity_type: "establishment" },
    ],
    assertions: [
      {
        subject_entity_id: siteId,
        predicate: "site.address",
        value: { street, unit_or_additional: null, city: "Chicago", state: "IL", zip_code: zipCode, country: "US" },
      },
      { subject_entity_id: establishmentId, predicate: "establishment.name", value: name },
      { subject_entity_id: establishmentId, predicate: "establishment.source-status", value: { value: "fixture-current" } },
    ],
    relationships: [{ relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId }],
  });
}

async function writeFixtureRegistry(root, profiles) {
  const releaseId = "registry-benchmark-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  const artifacts = [];
  for (let prefix = 0; prefix < 100; prefix += 1) {
    const zip2 = String(prefix).padStart(2, "0");
    const records = profiles.filter((item) => item.zip_code.startsWith(zip2));
    const buffer = gzipSync(records.map((item) => JSON.stringify(item)).join("\n") + (records.length ? "\n" : ""));
    const relativePath = `resolution/location-profiles/zip2=${zip2}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      record_count: records.length,
      artifact_type: "entity-resolution-location-profile-jsonl-gzip",
    });
  }
  const manifest = {
    dataset_id: "national-business-registry",
    release_id: releaseId,
    status: "published-partial",
    complete_national_business_registry: false,
    publisher: { id: "national-business-registry", version: "1.3.0" },
    coverage: { physical_sites: profiles.length, resolution_location_profiles: profiles.length },
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await mkdir(root, { recursive: true });
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function completedLabel(candidate, label = "match") {
  return {
    schema_version: "1.0.0",
    candidate_id: candidate.candidate_id,
    label,
    reviewer_id: "fixture-reviewer",
    reviewed_at: "2026-08-30T22:00:00.000Z",
    evidence_note: label === "match" ? null : "Fixture evidence supports this non-match or exclusion.",
    evidence_references: [],
  };
}

test("computes a conservative Wilson lower bound", () => {
  assert(wilsonLowerBound(384, 384) >= 0.99);
  assert(wilsonLowerBound(383, 384) < 0.99);
});

test("requires complete independently labeled automatic strata before passing precision", () => {
  const candidates = ["automatic-physical-site", "automatic-establishment", "review-candidate"].flatMap(
    (stratum) => Array.from({ length: 425 }, (_, index) => ({ candidate_id: `${stratum}-${index}`, stratum })),
  );
  const passing = candidates.map((candidate) => completedLabel(candidate));
  const result = evaluateBenchmarkLabels(candidates, passing);
  assert.equal(result.automatic_precision_gate_passed, true);
  assert.equal(result.export_authorized, false);

  const oneError = passing.map((label, index) => index === 0 ? { ...label, label: "non-match", evidence_note: "Confirmed different sites." } : label);
  assert.equal(evaluateBenchmarkLabels(candidates, oneError).strata["automatic-physical-site"].precision_gate_passed, false);

  const incomplete = passing.slice(1);
  assert.equal(evaluateBenchmarkLabels(candidates, incomplete).automatic_precision_gate_passed, false);
});

test("builds and independently verifies a deterministic enriched benchmark sample", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "entity-resolution-benchmark-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profiles = [];
  for (let index = 0; index < 384; index += 1) {
    const street = `${1000 + index} Site Test Street`;
    profiles.push(profile({ sourceId: `site-a-${index}`, recordId: "1", name: `Alpha Market ${index}`, street }));
    profiles.push(profile({ sourceId: `site-b-${index}`, recordId: "2", name: `Beta Pharmacy ${index}`, street }));
  }
  for (let index = 0; index < 384; index += 1) {
    const street = `${2000 + index} Establishment Test Street`;
    profiles.push(profile({ sourceId: `exact-a-${index}`, recordId: "1", name: `Exact Health ${index}`, street }));
    profiles.push(profile({ sourceId: `exact-b-${index}`, recordId: "2", name: `Exact Health ${index}`, street }));
  }
  for (let index = 0; index < 384; index += 1) {
    const street = `${3000 + index} Review Test Street`;
    profiles.push(profile({ sourceId: `review-a-${index}`, recordId: "1", name: `Acme Health Clinic ${index}`, street }));
    profiles.push(profile({ sourceId: `review-b-${index}`, recordId: "2", name: `Acme Health Clinics ${index}`, street }));
  }
  const registryPointer = await writeFixtureRegistry(path.join(root, "registry"), profiles);
  const resolution = await buildBusinessEntityResolution({
    outputRoot: path.join(root, "resolution"),
    registryPointer,
    now: () => new Date("2026-08-30T21:00:00.000Z"),
    logger: () => {},
  });
  const benchmark = await buildEntityResolutionBenchmarkSample({
    outputRoot: path.join(root, "benchmark"),
    resolutionPointer: resolution.pointerPath,
    registryPointer,
    sampleSizePerStratum: 384,
    now: () => new Date("2026-08-30T22:00:00.000Z"),
    logger: () => {},
  });
  assert.deepEqual(benchmark.manifest.coverage.sampled_candidates, {
    "automatic-physical-site": 384,
    "automatic-establishment": 384,
    "review-candidate": 384,
  });
  const verified = await verifyEntityResolutionBenchmarkSample(path.join(benchmark.releaseDirectory, "manifest.json"));
  assert.equal(verified.candidates.length, 1152);
  assert(verified.candidates.every((candidate) => candidate.left_profile.source && candidate.right_profile.source));

  await assert.rejects(buildEntityResolutionBenchmarkLabelRelease({
    outputRoot: path.join(root, "empty-label-release"),
    benchmarkPointer: benchmark.pointerPath,
    workRoot: path.join(root, "empty-label-work"),
  }), /At least one independently completed label/);

  const completedLabelsPath = path.join(root, "completed-labels.jsonl");
  const completedLabels = verified.candidates.map((candidate) => completedLabel(candidate));
  await writeFile(completedLabelsPath, `${completedLabels.map((label) => JSON.stringify(label)).join("\n")}\n`);
  const labelRelease = await buildEntityResolutionBenchmarkLabelRelease({
    outputRoot: path.join(root, "label-release"),
    benchmarkPointer: benchmark.pointerPath,
    labelsPath: completedLabelsPath,
    now: () => new Date("2026-08-30T23:00:00.000Z"),
  });
  assert.equal(labelRelease.manifest.automatic_precision_gate_passed, true);
  assert.equal(labelRelease.manifest.export_authorized, false);
  const verifiedLabels = await verifyEntityResolutionBenchmarkLabelRelease(
    path.join(labelRelease.releaseDirectory, "manifest.json"),
    { benchmarkPointer: benchmark.pointerPath },
  );
  assert.equal(verifiedLabels.coverage.submitted_labels, 1152);
  assert.equal(verifiedLabels.export_authorized, false);

  const labelsArtifact = benchmark.manifest.artifacts.find(
    (artifact) => artifact.artifact_type === "entity-resolution-benchmark-label-template-jsonl",
  );
  const labelPath = path.join(benchmark.releaseDirectory, labelsArtifact.path);
  const labels = (await readFile(labelPath, "utf8")).trim().split("\n").map(JSON.parse);
  labels[0] = completedLabel(verified.candidates.find((candidate) => candidate.candidate_id === labels[0].candidate_id));
  const tampered = Buffer.from(`${labels.map((label) => JSON.stringify(label)).join("\n")}\n`);
  await writeFile(labelPath, tampered);
  labelsArtifact.bytes = tampered.length;
  labelsArtifact.sha256 = sha256(tampered);
  await writeFile(path.join(benchmark.releaseDirectory, "manifest.json"), `${JSON.stringify(benchmark.manifest)}\n`);
  await assert.rejects(
    verifyEntityResolutionBenchmarkSample(path.join(benchmark.releaseDirectory, "manifest.json")),
    /verification failed/,
  );

  const candidateArtifact = benchmark.manifest.artifacts.find(
    (artifact) => artifact.artifact_type === "entity-resolution-benchmark-candidate-jsonl-gzip",
  );
  const candidateRows = gunzipSync(await readFile(path.join(benchmark.releaseDirectory, candidateArtifact.path))).toString("utf8").trim().split("\n");
  assert.equal(candidateRows.length, 1152);
});
