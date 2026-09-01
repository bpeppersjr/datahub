import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";
import { verifyBusinessEntityResolution } from "./business-entity-resolution.mjs";

export const BENCHMARK_SCHEMA_VERSION = "1.0.0";
export const BENCHMARK_SAMPLING_VERSION = "business-entity-resolution-benchmark-sampling@1.0.0";
export const DEFAULT_BENCHMARK_SEED = "cotive-national-business-entity-resolution-benchmark-v1";
export const DEFAULT_SAMPLE_SIZE_PER_STRATUM = 425;
export const DEFAULT_PRECISION_GATE = Object.freeze({
  confidence_z: 1.96,
  minimum_conclusive_labels: 384,
  minimum_wilson_lower_bound: 0.99,
  maximum_exclusion_rate: 0.1,
});

const STRATA = Object.freeze([
  "automatic-physical-site",
  "automatic-establishment",
  "review-candidate",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, values) {
  return `${prefix}:${sha256(values.map((value) => String(value ?? "")).join("\u001f")).slice(0, 32)}`;
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
  const input = createReadStream(filePath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) records.push(JSON.parse(line));
  }
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

async function loadPointer(pointerPath, expectedDatasetId) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const pointerDirectory = path.dirname(pointerPath);
  const manifestPath = path.resolve(pointerDirectory, pointer.manifest ?? "");
  assertContained(pointerDirectory, manifestPath, `${expectedDatasetId} manifest path`);
  const buffer = await readFile(manifestPath);
  const manifest = JSON.parse(buffer.toString("utf8"));
  if (manifest.dataset_id !== expectedDatasetId || manifest.release_id !== pointer.release_id) {
    throw new Error(`${expectedDatasetId} pointer does not identify a coherent release.`);
  }
  return {
    pointer,
    manifest,
    manifestPath,
    manifestSha256: sha256(buffer),
    releaseDirectory: path.dirname(manifestPath),
  };
}

async function loadDependencies(resolutionPointer, registryPointer) {
  const resolution = await loadPointer(resolutionPointer, "national-business-entity-resolution");
  await verifyBusinessEntityResolution(resolution.manifestPath);
  const registry = await loadPointer(registryPointer, "national-business-registry");
  if (registry.manifest.status !== "published-partial" || !["1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0", "1.7.0", "1.8.0", "1.9.0", "2.0.0", "2.1.0", "2.2.0", "2.3.0", "2.4.0", "2.5.0", "2.6.0"].includes(registry.manifest.publisher?.version)
    || registry.manifest.complete_national_business_registry !== false) {
    throw new Error("A verified partial National Business Registry 1.2.0 through 2.6.0 release is required.");
  }
  if (resolution.manifest.dependency?.release_id !== registry.manifest.release_id
    || resolution.manifest.dependency?.manifest_sha256 !== registry.manifestSha256) {
    throw new Error("The resolution release does not depend on the selected registry release.");
  }
  const profileArtifacts = registry.manifest.artifacts?.filter(
    (artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip",
  ).sort((left, right) => left.path.localeCompare(right.path)) ?? [];
  if (profileArtifacts.length !== 100) throw new Error(`Expected 100 registry profile artifacts; found ${profileArtifacts.length}.`);
  return { resolution, registry: { ...registry, profileArtifacts } };
}

function comparePriority(left, right) {
  return left.sample_priority_sha256.localeCompare(right.sample_priority_sha256)
    || left.sampling_key.localeCompare(right.sampling_key);
}

class FixedMinHashSample {
  constructor(limit) {
    this.limit = limit;
    this.heap = [];
  }

  push(candidate) {
    if (this.heap.length < this.limit) {
      this.heap.push(candidate);
      this.#bubbleUp(this.heap.length - 1);
      return;
    }
    if (comparePriority(candidate, this.heap[0]) >= 0) return;
    this.heap[0] = candidate;
    this.#bubbleDown(0);
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (comparePriority(this.heap[index], this.heap[parent]) <= 0) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
      index = parent;
    }
  }

  #bubbleDown(index) {
    while (true) {
      const left = (index * 2) + 1;
      const right = left + 1;
      let worst = index;
      if (left < this.heap.length && comparePriority(this.heap[left], this.heap[worst]) > 0) worst = left;
      if (right < this.heap.length && comparePriority(this.heap[right], this.heap[worst]) > 0) worst = right;
      if (worst === index) break;
      [this.heap[index], this.heap[worst]] = [this.heap[worst], this.heap[index]];
      index = worst;
    }
  }

  values() {
    return [...this.heap].sort(comparePriority);
  }
}

function candidateSkeleton({ resolutionReleaseId, seed, stratum, samplingKey, sourceDecisionIds, entityType, ruleId,
  resolvedEntityId = null, leftEntityId, rightEntityId, leftProfileId, rightProfileId }) {
  const samplePriority = sha256(`${seed}\u001f${stratum}\u001f${samplingKey}`);
  return {
    schema_version: BENCHMARK_SCHEMA_VERSION,
    candidate_id: stableId("benchmark-candidate", [resolutionReleaseId, stratum, samplingKey]),
    stratum,
    sampling_key: samplingKey,
    sample_priority_sha256: samplePriority,
    source_decision_ids: sourceDecisionIds,
    entity_type: entityType,
    rule_id: ruleId,
    resolved_entity_id: resolvedEntityId,
    left_entity_id: leftEntityId,
    right_entity_id: rightEntityId,
    left_profile_id: leftProfileId,
    right_profile_id: rightProfileId,
  };
}

function automaticCandidates(records, resolutionReleaseId, seed, buckets, universe) {
  const groups = new Map();
  for (const decision of records) {
    if (decision.decision_type !== "automatic-link") continue;
    const key = `${decision.entity_type}|${decision.resolved_entity_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(decision);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.subject_entity_id.localeCompare(right.subject_entity_id));
    const anchor = group[0];
    const stratum = anchor.entity_type === "physical_site" ? "automatic-physical-site" : "automatic-establishment";
    for (const member of group.slice(1)) {
      const samplingKey = [anchor.resolved_entity_id, anchor.subject_entity_id, member.subject_entity_id].join("|");
      const candidate = candidateSkeleton({
        resolutionReleaseId,
        seed,
        stratum,
        samplingKey,
        sourceDecisionIds: [anchor.decision_id, member.decision_id].sort(),
        entityType: anchor.entity_type,
        ruleId: anchor.rule_id,
        resolvedEntityId: anchor.resolved_entity_id,
        leftEntityId: anchor.subject_entity_id,
        rightEntityId: member.subject_entity_id,
        leftProfileId: anchor.source_profile_id,
        rightProfileId: member.source_profile_id,
      });
      buckets.get(stratum).push(candidate);
      universe[stratum] += 1;
    }
  }
}

function reviewCandidates(records, resolutionReleaseId, seed, buckets, universe) {
  for (const decision of records) {
    if (decision.decision_type !== "review-candidate") continue;
    const stratum = "review-candidate";
    const candidate = candidateSkeleton({
      resolutionReleaseId,
      seed,
      stratum,
      samplingKey: decision.decision_id,
      sourceDecisionIds: [decision.decision_id],
      entityType: decision.entity_type,
      ruleId: decision.rule_id,
      leftEntityId: decision.left_entity_id,
      rightEntityId: decision.right_entity_id,
      leftProfileId: decision.left_profile_id,
      rightProfileId: decision.right_profile_id,
    });
    buckets.get(stratum).push(candidate);
    universe[stratum] += 1;
  }
}

async function selectCandidates(resolution, { seed, sampleSizePerStratum, logger }) {
  const buckets = new Map(STRATA.map((stratum) => [stratum, new FixedMinHashSample(sampleSizePerStratum)]));
  const universe = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
  const artifacts = resolution.manifest.artifacts.filter(
    (artifact) => artifact.artifact_type === "entity-resolution-decision-jsonl-gzip",
  ).sort((left, right) => left.path.localeCompare(right.path));
  for (const artifact of artifacts) {
    const records = await readGzipRecords(path.join(resolution.releaseDirectory, artifact.path));
    if (records.length !== artifact.record_count) throw new Error(`Decision count mismatch in ${artifact.path}.`);
    automaticCandidates(records, resolution.manifest.release_id, seed, buckets, universe);
    reviewCandidates(records, resolution.manifest.release_id, seed, buckets, universe);
    logger(`Sampled ${artifact.path}.`);
  }
  const selected = STRATA.flatMap((stratum) => buckets.get(stratum).values());
  return { selected, universe };
}

async function collectProfiles(registry, profileIds, logger = () => {}) {
  const selected = new Map();
  for (const artifact of registry.profileArtifacts) {
    const filename = path.resolve(registry.releaseDirectory, artifact.path);
    assertContained(registry.releaseDirectory, filename, `Registry profile artifact ${artifact.path}`);
    const hash = createHash("sha256");
    let bytes = 0;
    let records = 0;
    const raw = createReadStream(filename);
    raw.on("data", (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    const lines = createInterface({ input: raw.pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      records += 1;
      const profile = JSON.parse(line);
      if (profileIds.has(profile.profile_id)) selected.set(profile.profile_id, profile);
    }
    if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256 || records !== artifact.record_count) {
      throw new Error(`Registry profile artifact ${artifact.path} failed checksum or count validation.`);
    }
    logger(`Scanned ${artifact.path}; found ${selected.size.toLocaleString("en-US")} requested profiles.`);
  }
  if (selected.size !== profileIds.size) {
    const missing = [...profileIds].filter((profileId) => !selected.has(profileId));
    throw new Error(`Missing ${missing.length} selected registry profiles; first missing ${missing[0] ?? "<unknown>"}.`);
  }
  return selected;
}

function reviewProfile(profile) {
  return {
    profile_id: profile.profile_id,
    site_entity_id: profile.site_entity_id,
    establishment_entity_id: profile.establishment_entity_id,
    organization_entity_id: profile.organization_entity_id,
    address: profile.address,
    normalized_address: profile.normalized_address,
    names: profile.names,
    location: profile.location,
    external_identifiers: profile.external_identifiers,
    source_status: profile.source_status,
    observed_at: profile.observed_at,
    source: profile.source,
    export_policy: profile.export_policy,
  };
}

function enrichCandidate(candidate, profiles, dependencies) {
  const left = profiles.get(candidate.left_profile_id);
  const right = profiles.get(candidate.right_profile_id);
  const sourcePair = [left, right].map(
    (profile) => `${profile.source.source_id}|${profile.source.source_release_id}`,
  ).sort();
  return {
    ...candidate,
    resolution_release_id: dependencies.resolution.manifest.release_id,
    registry_release_id: dependencies.registry.manifest.release_id,
    source_pair: sourcePair,
    left_profile: reviewProfile(left),
    right_profile: reviewProfile(right),
    label_question: candidate.entity_type === "physical_site"
      ? "Do both source records refer to the same real-world physical site at the observation times shown?"
      : "Do both source records refer to the same operating establishment at the same site, rather than merely co-located activities?",
    allowed_labels: ["match", "non-match", "uncertain", "not-reviewable"],
    export_policy: "local-review-only",
  };
}

function labelTemplate(candidate) {
  return {
    schema_version: BENCHMARK_SCHEMA_VERSION,
    candidate_id: candidate.candidate_id,
    label: null,
    reviewer_id: null,
    reviewed_at: null,
    evidence_note: null,
    evidence_references: [],
  };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildEntityResolutionBenchmarkSample({
  outputRoot,
  resolutionPointer,
  registryPointer,
  seed = DEFAULT_BENCHMARK_SEED,
  sampleSizePerStratum = DEFAULT_SAMPLE_SIZE_PER_STRATUM,
  now = () => new Date(),
  logger = console.log,
} = {}) {
  if (!outputRoot || !resolutionPointer || !registryPointer) throw new Error("outputRoot, resolutionPointer, and registryPointer are required.");
  if (typeof seed !== "string" || seed.length < 16) throw new Error("A stable benchmark seed of at least 16 characters is required.");
  if (!Number.isInteger(sampleSizePerStratum) || sampleSizePerStratum < DEFAULT_PRECISION_GATE.minimum_conclusive_labels) {
    throw new Error(`sampleSizePerStratum must be at least ${DEFAULT_PRECISION_GATE.minimum_conclusive_labels}.`);
  }
  const dependencies = await loadDependencies(resolutionPointer, registryPointer);
  const { selected, universe } = await selectCandidates(dependencies.resolution, { seed, sampleSizePerStratum, logger });
  const profileIds = new Set(selected.flatMap((candidate) => [candidate.left_profile_id, candidate.right_profile_id]));
  const profiles = await collectProfiles(dependencies.registry, profileIds, logger);
  const candidates = selected.map((candidate) => enrichCandidate(candidate, profiles, dependencies))
    .sort((left, right) => left.stratum.localeCompare(right.stratum) || comparePriority(left, right));
  const templates = candidates.map(labelTemplate);
  const sampleCounts = Object.fromEntries(STRATA.map((stratum) => [stratum, candidates.filter((candidate) => candidate.stratum === stratum).length]));
  const summary = {
    candidate_universe: universe,
    sampled_candidates: sampleCounts,
    total_sampled_candidates: candidates.length,
    unique_profiles_in_review_packet: profileIds.size,
    submitted_labels: 0,
    benchmark_gate_passed: false,
  };
  const createdAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `business-entity-resolution-benchmark-sample-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  artifacts.push(await writeArtifact(stagingDirectory, "review/benchmark-candidates.jsonl.gz", gzipSync(jsonLines(candidates), { level: 9 }), {
    artifact_type: "entity-resolution-benchmark-candidate-jsonl-gzip",
    record_count: candidates.length,
    distribution_policy: "local-review-only",
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "review/label-template.jsonl", jsonLines(templates), {
    artifact_type: "entity-resolution-benchmark-label-template-jsonl",
    record_count: templates.length,
    distribution_policy: "local-review-only",
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/sample-summary.json", json(summary), {
    artifact_type: "entity-resolution-benchmark-sample-summary-json",
    distribution_policy: "aggregate",
  }));
  const manifest = {
    schema_version: BENCHMARK_SCHEMA_VERSION,
    dataset_id: "national-business-entity-resolution-benchmark",
    publisher: { id: "national-business-entity-resolution-benchmark", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: "awaiting-independent-labels",
    complete_labeled_benchmark: false,
    sampling_version: BENCHMARK_SAMPLING_VERSION,
    dependencies: {
      resolution: {
        dataset_id: dependencies.resolution.manifest.dataset_id,
        release_id: dependencies.resolution.manifest.release_id,
        manifest_sha256: dependencies.resolution.manifestSha256,
      },
      registry: {
        dataset_id: dependencies.registry.manifest.dataset_id,
        release_id: dependencies.registry.manifest.release_id,
        manifest_sha256: dependencies.registry.manifestSha256,
      },
    },
    sampling: {
      method: "deterministic-min-sha256-within-rule-stratum",
      seed,
      target_per_stratum: sampleSizePerStratum,
      strata: STRATA,
    },
    proposed_precision_gate: DEFAULT_PRECISION_GATE,
    coverage: summary,
    label_semantics: {
      match: "The pair refers to the same real-world entity at the observation times shown.",
      "non-match": "The pair refers to distinct real-world entities.",
      uncertain: "Available evidence does not support a defensible match or non-match label.",
      "not-reviewable": "The packet is invalid, inaccessible, or inappropriate for the assigned reviewer.",
    },
    limitations: [
      "No candidate is labeled by this publisher; independent human review is required.",
      "The automatic-link strata estimate precision, not recall or national-business completeness.",
      "Overall rule precision can conceal source-pair-specific error rates; source-pair diagnostics remain required.",
      "A precision pass does not override any contributing source policy or authorize export.",
    ],
    export_policy: "Local review only; packets can contain source-reported home-based addresses and linkage evidence.",
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published benchmark sample release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export function wilsonLowerBound(successes, trials, z = DEFAULT_PRECISION_GATE.confidence_z) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials <= 0 || successes > trials || !Number.isFinite(z) || z <= 0) {
    throw new Error("Wilson inputs are invalid.");
  }
  const observed = successes / trials;
  const zSquared = z ** 2;
  const denominator = 1 + (zSquared / trials);
  const center = observed + (zSquared / (2 * trials));
  const margin = z * Math.sqrt(((observed * (1 - observed)) / trials) + (zSquared / (4 * trials ** 2)));
  return Number(((center - margin) / denominator).toFixed(6));
}

export function evaluateBenchmarkLabels(candidates, labels, gate = DEFAULT_PRECISION_GATE) {
  if (!Array.isArray(candidates) || !Array.isArray(labels)) throw new Error("candidates and labels must be arrays.");
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  if (candidateById.size !== candidates.length) throw new Error("Benchmark candidates contain duplicate IDs.");
  const labelsById = new Map();
  for (const label of labels) {
    if (!candidateById.has(label.candidate_id) || labelsById.has(label.candidate_id)) throw new Error(`Unexpected or duplicate label ${label.candidate_id}.`);
    if (label.label !== null && !["match", "non-match", "uncertain", "not-reviewable"].includes(label.label)) {
      throw new Error(`Unsupported label for ${label.candidate_id}.`);
    }
    if (label.label !== null && (!label.reviewer_id || !label.reviewed_at || Number.isNaN(Date.parse(label.reviewed_at)))) {
      throw new Error(`Completed label ${label.candidate_id} lacks reviewer identity or time.`);
    }
    if (["non-match", "uncertain", "not-reviewable"].includes(label.label) && !String(label.evidence_note ?? "").trim()) {
      throw new Error(`Label ${label.candidate_id} requires an evidence note.`);
    }
    labelsById.set(label.candidate_id, label);
  }
  const results = {};
  for (const stratum of STRATA) {
    const stratumCandidates = candidates.filter((candidate) => candidate.stratum === stratum);
    const submitted = stratumCandidates.map((candidate) => labelsById.get(candidate.candidate_id)).filter((label) => label?.label !== null && label?.label !== undefined);
    const counts = Object.fromEntries(["match", "non-match", "uncertain", "not-reviewable"].map(
      (label) => [label, submitted.filter((item) => item.label === label).length],
    ));
    const conclusive = counts.match + counts["non-match"];
    const excluded = counts.uncertain + counts["not-reviewable"];
    const precision = conclusive > 0 ? Number((counts.match / conclusive).toFixed(6)) : null;
    const lowerBound = conclusive > 0 ? wilsonLowerBound(counts.match, conclusive, gate.confidence_z) : null;
    const automatic = stratum.startsWith("automatic-");
    const passed = automatic && submitted.length === stratumCandidates.length
      && conclusive >= gate.minimum_conclusive_labels
      && excluded / stratumCandidates.length <= gate.maximum_exclusion_rate
      && lowerBound >= gate.minimum_wilson_lower_bound;
    results[stratum] = {
      sampled: stratumCandidates.length,
      submitted: submitted.length,
      complete: submitted.length === stratumCandidates.length,
      labels: counts,
      conclusive,
      excluded,
      exclusion_rate: stratumCandidates.length > 0 ? Number((excluded / stratumCandidates.length).toFixed(6)) : null,
      observed_precision: precision,
      wilson_lower_bound_95: lowerBound,
      precision_gate_passed: passed,
    };
  }
  return {
    schema_version: BENCHMARK_SCHEMA_VERSION,
    gate,
    strata: results,
    automatic_precision_gate_passed: results["automatic-physical-site"].precision_gate_passed
      && results["automatic-establishment"].precision_gate_passed,
    export_authorized: false,
    export_authorization_note: "A precision result never overrides contributing source policies or authorizes export.",
  };
}

export async function verifyEntityResolutionBenchmarkSample(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "national-business-entity-resolution-benchmark" || manifest.publisher?.version !== "1.0.0"
    || manifest.status !== "awaiting-independent-labels" || manifest.complete_labeled_benchmark !== false
    || manifest.sampling_version !== BENCHMARK_SAMPLING_VERSION || manifest.sampling?.method !== "deterministic-min-sha256-within-rule-stratum") {
    failures.push({ path: "manifest.json", reason: "unexpected dataset, publisher, status, or sampling contract" });
  }
  const artifactPaths = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    try {
      if (artifactPaths.has(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "") || !Number.isInteger(artifact.bytes)) {
        throw new Error("invalid or duplicate artifact metadata");
      }
      artifactPaths.add(artifact.path);
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Benchmark artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error("size or SHA-256 mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  const candidateArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "entity-resolution-benchmark-candidate-jsonl-gzip");
  const labelArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "entity-resolution-benchmark-label-template-jsonl");
  const summaryArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "entity-resolution-benchmark-sample-summary-json");
  let candidates = [];
  let labels = [];
  try {
    if (!candidateArtifact || !labelArtifact || !summaryArtifact || manifest.artifacts.length !== 3) throw new Error("expected exactly three benchmark artifacts");
    candidates = await readGzipRecords(path.join(releaseDirectory, candidateArtifact.path));
    labels = (await readFile(path.join(releaseDirectory, labelArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (candidates.length !== candidateArtifact.record_count || labels.length !== labelArtifact.record_count || candidates.length !== labels.length) {
      throw new Error("candidate or label-template counts do not reconcile");
    }
    const candidateIds = new Set();
    const labelIds = new Set();
    const counts = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
    for (const candidate of candidates) {
      const expectedPriority = sha256(`${manifest.sampling.seed}\u001f${candidate.stratum}\u001f${candidate.sampling_key}`);
      const expectedId = stableId("benchmark-candidate", [manifest.dependencies.resolution.release_id, candidate.stratum, candidate.sampling_key]);
      const expectedPair = [candidate.left_profile, candidate.right_profile].map(
        (profile) => `${profile?.source?.source_id}|${profile?.source?.source_release_id}`,
      ).sort();
      if (candidateIds.has(candidate.candidate_id) || !STRATA.includes(candidate.stratum) || candidate.sample_priority_sha256 !== expectedPriority
        || candidate.candidate_id !== expectedId || candidate.left_profile_id !== candidate.left_profile?.profile_id
        || candidate.right_profile_id !== candidate.right_profile?.profile_id || candidate.left_profile_id === candidate.right_profile_id
        || JSON.stringify(candidate.source_pair) !== JSON.stringify(expectedPair) || candidate.export_policy !== "local-review-only") {
        throw new Error(`invalid or duplicate candidate ${candidate.candidate_id ?? "<unknown>"}`);
      }
      candidateIds.add(candidate.candidate_id);
      counts[candidate.stratum] += 1;
    }
    for (const label of labels) {
      if (labelIds.has(label.candidate_id) || !candidateIds.has(label.candidate_id) || label.label !== null
        || label.reviewer_id !== null || label.reviewed_at !== null || label.evidence_note !== null
        || !Array.isArray(label.evidence_references) || label.evidence_references.length !== 0) {
        throw new Error(`invalid label template ${label.candidate_id ?? "<unknown>"}`);
      }
      labelIds.add(label.candidate_id);
    }
    const summary = JSON.parse(await readFile(path.join(releaseDirectory, summaryArtifact.path), "utf8"));
    if (JSON.stringify(counts) !== JSON.stringify(summary.sampled_candidates)
      || candidates.length !== summary.total_sampled_candidates || summary.submitted_labels !== 0 || summary.benchmark_gate_passed !== false
      || JSON.stringify(summary) !== JSON.stringify(manifest.coverage)) {
      throw new Error("sample summary does not reconcile");
    }
  } catch (error) {
    failures.push({ path: "benchmark-artifacts", reason: error.message });
  }
  if (failures.length > 0) {
    const error = new Error(`Entity-resolution benchmark sample verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    status: manifest.status,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
    candidates,
    labels,
  };
}
