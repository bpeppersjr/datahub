import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { evaluateBenchmarkLabels, verifyEntityResolutionBenchmarkSample } from "./entity-resolution-benchmark.mjs";
import { getBenchmarkWorkingLabels } from "./benchmark-review-store.mjs";

export const BENCHMARK_LABEL_RELEASE_SCHEMA_VERSION = "1.0.0";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function readGzipRecords(filePath) {
  const records = [];
  const lines = createInterface({ input: createReadStream(filePath).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) records.push(JSON.parse(line));
  return records;
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function resolveBenchmark(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest ?? "");
  assertContained(path.dirname(pointerPath), manifestPath, "Benchmark manifest path");
  const buffer = await readFile(manifestPath);
  const verified = await verifyEntityResolutionBenchmarkSample(manifestPath);
  return { pointer, manifestPath, manifestSha256: sha256(buffer), verified };
}

function parseLabels(content) {
  return content.trim().split("\n").filter(Boolean).map(JSON.parse);
}

function sourcePairAssessment(candidates, labels) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const groups = new Map();
  for (const label of labels) {
    if (!label.label) continue;
    const candidate = candidateById.get(label.candidate_id);
    const key = `${candidate.stratum}|${candidate.source_pair.join(" ↔ ")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        stratum: candidate.stratum,
        source_pair: candidate.source_pair,
        submitted: 0,
        match: 0,
        "non-match": 0,
        uncertain: 0,
        "not-reviewable": 0,
      });
    }
    const group = groups.get(key);
    group.submitted += 1;
    group[label.label] += 1;
  }
  return [...groups.values()].sort((left, right) => left.stratum.localeCompare(right.stratum)
    || left.source_pair.join("|").localeCompare(right.source_pair.join("|")));
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

async function loadLabels({ benchmarkPointer, labelsPath, workRoot }) {
  if (labelsPath) {
    const content = await readFile(labelsPath, "utf8");
    return { labels: parseLabels(content), content };
  }
  const working = await getBenchmarkWorkingLabels({ pointerPath: benchmarkPointer, workRoot });
  return { labels: working.labels, content: working.content };
}

export async function buildEntityResolutionBenchmarkLabelRelease({
  outputRoot,
  benchmarkPointer,
  labelsPath = null,
  workRoot,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !benchmarkPointer) throw new Error("outputRoot and benchmarkPointer are required.");
  const benchmark = await resolveBenchmark(benchmarkPointer);
  const loaded = await loadLabels({ benchmarkPointer, labelsPath, workRoot });
  const assessment = evaluateBenchmarkLabels(benchmark.verified.candidates, loaded.labels);
  const submittedLabels = loaded.labels.filter((label) => label.label !== null);
  if (submittedLabels.length === 0) throw new Error("At least one independently completed label is required before publishing a label snapshot.");
  const sourcePairs = sourcePairAssessment(benchmark.verified.candidates, submittedLabels);
  const reviewerCount = new Set(submittedLabels.map((label) => label.reviewer_id)).size;
  const assessmentArtifact = {
    schema_version: BENCHMARK_LABEL_RELEASE_SCHEMA_VERSION,
    benchmark_release_id: benchmark.verified.release_id,
    evaluated_at: now().toISOString(),
    submitted_label_count: submittedLabels.length,
    reviewer_count: reviewerCount,
    automatic_precision: assessment,
    source_pair_diagnostics: sourcePairs,
    export_authorized: false,
  };
  const createdAt = assessmentArtifact.evaluated_at;
  const runId = randomUUID();
  const releaseId = `business-entity-resolution-benchmark-labels-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  artifacts.push(await writeArtifact(stagingDirectory, "labels/submitted-labels.jsonl.gz", gzipSync(jsonLines(submittedLabels), { level: 9 }), {
    artifact_type: "entity-resolution-benchmark-submitted-label-jsonl-gzip",
    record_count: submittedLabels.length,
    distribution_policy: "local-review-only",
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/benchmark-assessment.json", json(assessmentArtifact), {
    artifact_type: "entity-resolution-benchmark-assessment-json",
    distribution_policy: "aggregate-local-review",
  }));
  const automaticComplete = assessment.strata["automatic-physical-site"].complete
    && assessment.strata["automatic-establishment"].complete;
  const manifest = {
    schema_version: BENCHMARK_LABEL_RELEASE_SCHEMA_VERSION,
    dataset_id: "national-business-entity-resolution-benchmark-labels",
    publisher: { id: "national-business-entity-resolution-benchmark-labels", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: assessment.automatic_precision_gate_passed
      ? "published-precision-gate-passed-policy-review-required"
      : "published-label-snapshot-incomplete-or-gate-failed",
    complete_automatic_benchmark: automaticComplete,
    automatic_precision_gate_passed: assessment.automatic_precision_gate_passed,
    export_authorized: false,
    export_authorization_note: "Statistical precision never overrides privacy review or any contributing source policy.",
    dependency: {
      dataset_id: benchmark.verified.dataset_id,
      release_id: benchmark.verified.release_id,
      manifest_sha256: benchmark.manifestSha256,
    },
    working_label_set_sha256: sha256(loaded.content),
    coverage: {
      sampled_candidates: benchmark.verified.candidates.length,
      submitted_labels: submittedLabels.length,
      reviewer_count: reviewerCount,
      source_pair_diagnostic_groups: sourcePairs.length,
    },
    policy_profile: "config/source-policies/national-business-entity-resolution-benchmark.json",
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  await mkdir(outputRoot, { recursive: true });
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: createdAt,
    status: manifest.status,
  }));
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published benchmark label release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyEntityResolutionBenchmarkLabelRelease(manifestPath, { benchmarkPointer } = {}) {
  if (!benchmarkPointer) throw new Error("benchmarkPointer is required to verify label dependencies.");
  const benchmark = await resolveBenchmark(benchmarkPointer);
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "national-business-entity-resolution-benchmark-labels" || manifest.publisher?.version !== "1.0.0"
    || manifest.dependency?.release_id !== benchmark.verified.release_id || manifest.dependency?.manifest_sha256 !== benchmark.manifestSha256
    || manifest.export_authorized !== false) {
    failures.push({ path: "manifest.json", reason: "unexpected dataset, dependency, or export authorization" });
  }
  const artifactPaths = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    try {
      if (artifactPaths.has(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) throw new Error("invalid or duplicate artifact metadata");
      artifactPaths.add(artifact.path);
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Label artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error("size or SHA-256 mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  try {
    const labelArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "entity-resolution-benchmark-submitted-label-jsonl-gzip");
    const assessmentArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "entity-resolution-benchmark-assessment-json");
    if (!labelArtifact || !assessmentArtifact || manifest.artifacts.length !== 2) throw new Error("expected exactly two label-release artifacts");
    const labels = await readGzipRecords(path.join(releaseDirectory, labelArtifact.path));
    if (labels.length === 0 || labels.length !== labelArtifact.record_count || labels.some((label) => label.label === null)) {
      throw new Error("submitted labels are empty or invalid");
    }
    const assessment = evaluateBenchmarkLabels(benchmark.verified.candidates, labels);
    const sourcePairs = sourcePairAssessment(benchmark.verified.candidates, labels);
    const storedAssessment = JSON.parse(await readFile(path.join(releaseDirectory, assessmentArtifact.path), "utf8"));
    if (JSON.stringify(storedAssessment.automatic_precision) !== JSON.stringify(assessment)
      || JSON.stringify(storedAssessment.source_pair_diagnostics) !== JSON.stringify(sourcePairs)
      || storedAssessment.export_authorized !== false || storedAssessment.submitted_label_count !== labels.length
      || manifest.coverage?.submitted_labels !== labels.length
      || manifest.automatic_precision_gate_passed !== assessment.automatic_precision_gate_passed) {
      throw new Error("label assessment does not reconcile");
    }
  } catch (error) {
    failures.push({ path: "label-release-artifacts", reason: error.message });
  }
  if (failures.length > 0) {
    const error = new Error(`Entity-resolution benchmark label verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    status: manifest.status,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
    automatic_precision_gate_passed: manifest.automatic_precision_gate_passed,
    export_authorized: manifest.export_authorized,
  };
}
