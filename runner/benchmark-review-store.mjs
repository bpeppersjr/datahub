import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateBenchmarkLabels,
  verifyEntityResolutionBenchmarkSample,
} from "./entity-resolution-benchmark.mjs";
import { APP_ROOT } from "./paths.mjs";

const DEFAULT_POINTER = path.join(APP_ROOT, "data", "business-entity-resolution-benchmark", "current.json");
const DEFAULT_WORK_ROOT = path.join(APP_ROOT, "data", "business-entity-resolution-benchmark", "review-work");
const ALLOWED_STRATA = new Set(["automatic-physical-site", "automatic-establishment", "review-candidate"]);
const ALLOWED_LABELS = new Set(["match", "non-match", "uncertain", "not-reviewable"]);

let writeQueue = Promise.resolve();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function requestError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function resolveManifest(pointerPath) {
  let pointer;
  try {
    pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest ?? "");
  const relative = path.relative(path.dirname(pointerPath), manifestPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Benchmark pointer escapes its data root.");
  return { pointer, manifestPath };
}

async function loadWorkingLabels(verified, workRoot) {
  const labelsPath = path.join(workRoot, `${verified.release_id}.labels.jsonl`);
  let labels = verified.labels;
  try {
    const content = await readFile(labelsPath, "utf8");
    labels = content.trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  evaluateBenchmarkLabels(verified.candidates, labels);
  const content = jsonLines(labels);
  return {
    labels,
    content,
    revision: sha256(content),
    labelsPath,
    journalPath: path.join(workRoot, `${verified.release_id}.journal.jsonl`),
  };
}

async function loadReviewData({ pointerPath = DEFAULT_POINTER, workRoot = DEFAULT_WORK_ROOT } = {}) {
  const resolved = await resolveManifest(pointerPath);
  if (!resolved) return null;
  const verified = await verifyEntityResolutionBenchmarkSample(resolved.manifestPath);
  const working = await loadWorkingLabels(verified, workRoot);
  return { verified, working, pointerPath, workRoot };
}

function labelStatus(label) {
  return label?.label ? "labeled" : "unlabeled";
}

export async function getBenchmarkReviewState({
  pointerPath = DEFAULT_POINTER,
  workRoot = DEFAULT_WORK_ROOT,
  stratum = "all",
  status = "all",
  offset = 0,
  limit = 12,
} = {}) {
  if (stratum !== "all" && !ALLOWED_STRATA.has(stratum)) throw requestError("Unsupported benchmark stratum.");
  if (!new Set(["all", "labeled", "unlabeled"]).has(status)) throw requestError("Unsupported label status.");
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw requestError("Benchmark pagination is invalid.");
  }
  const loaded = await loadReviewData({ pointerPath, workRoot });
  if (!loaded) return { available: false, reason: "No benchmark sample has been published." };
  const { verified, working } = loaded;
  const labelById = new Map(working.labels.map((label) => [label.candidate_id, label]));
  const joined = verified.candidates.map((candidate) => ({ ...candidate, review_label: labelById.get(candidate.candidate_id) }));
  const filtered = joined.filter((candidate) => (stratum === "all" || candidate.stratum === stratum)
    && (status === "all" || labelStatus(candidate.review_label) === status));
  const assessment = evaluateBenchmarkLabels(verified.candidates, working.labels);
  return {
    available: true,
    release_id: verified.release_id,
    status: verified.status,
    revision: working.revision,
    assessment,
    coverage: verified.coverage,
    filters: { stratum, status },
    pagination: { offset, limit, total: filtered.length, has_more: offset + limit < filtered.length },
    candidates: filtered.slice(offset, offset + limit),
  };
}

async function saveBenchmarkLabelInternal({
  candidateId,
  label,
  reviewerId,
  evidenceNote = null,
  evidenceReferences = [],
  expectedRevision,
  pointerPath = DEFAULT_POINTER,
  workRoot = DEFAULT_WORK_ROOT,
  now = () => new Date(),
} = {}) {
  if (!candidateId || !ALLOWED_LABELS.has(label)) throw requestError("A valid candidate and label are required.");
  if (typeof reviewerId !== "string" || reviewerId.trim().length < 2 || reviewerId.trim().length > 100) {
    throw requestError("Reviewer ID must contain 2 to 100 characters.");
  }
  const note = typeof evidenceNote === "string" && evidenceNote.trim() ? evidenceNote.trim() : null;
  if (["non-match", "uncertain", "not-reviewable"].includes(label) && !note) {
    throw requestError(`${label} requires an evidence note.`);
  }
  if (!Array.isArray(evidenceReferences) || evidenceReferences.length > 20
    || evidenceReferences.some((reference) => typeof reference !== "string" || reference.length > 500)) {
    throw requestError("Evidence references must be an array of at most 20 short strings.");
  }
  const loaded = await loadReviewData({ pointerPath, workRoot });
  if (!loaded) throw requestError("No benchmark sample is available.", 404);
  const { verified, working } = loaded;
  if (expectedRevision !== working.revision) throw requestError("Benchmark labels changed; refresh before saving.", 409);
  const candidate = verified.candidates.find((item) => item.candidate_id === candidateId);
  if (!candidate) throw requestError("Benchmark candidate not found.", 404);
  const labelIndex = working.labels.findIndex((item) => item.candidate_id === candidateId);
  if (labelIndex < 0) throw new Error("Benchmark label template is missing the selected candidate.");
  const reviewedAt = now().toISOString();
  const nextLabel = {
    schema_version: "1.0.0",
    candidate_id: candidateId,
    label,
    reviewer_id: reviewerId.trim(),
    reviewed_at: reviewedAt,
    evidence_note: note,
    evidence_references: evidenceReferences,
  };
  const priorLabel = working.labels[labelIndex];
  const nextLabels = [...working.labels];
  nextLabels[labelIndex] = nextLabel;
  const assessment = evaluateBenchmarkLabels(verified.candidates, nextLabels);
  const nextContent = jsonLines(nextLabels);
  const nextRevision = sha256(nextContent);
  const eventId = randomUUID();
  const eventBase = {
    schema_version: "1.0.0",
    event_id: eventId,
    benchmark_release_id: verified.release_id,
    candidate_id: candidateId,
    reviewer_id: reviewerId.trim(),
    at: reviewedAt,
    prior_label: priorLabel,
    next_label: nextLabel,
    expected_revision: expectedRevision,
    next_revision: nextRevision,
  };
  await mkdir(workRoot, { recursive: true });
  await appendFile(working.journalPath, `${JSON.stringify({ ...eventBase, phase: "proposed" })}\n`, "utf8");
  const temporary = `${working.labelsPath}.tmp-${eventId}`;
  await writeFile(temporary, nextContent, "utf8");
  await rename(temporary, working.labelsPath);
  await appendFile(working.journalPath, `${JSON.stringify({ ...eventBase, phase: "committed" })}\n`, "utf8");
  return {
    candidate_id: candidateId,
    label: nextLabel,
    revision: nextRevision,
    assessment,
    audit_event_id: eventId,
  };
}

export function saveBenchmarkLabel(options) {
  const operation = writeQueue.then(() => saveBenchmarkLabelInternal(options));
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function getBenchmarkWorkingLabels({ pointerPath = DEFAULT_POINTER, workRoot = DEFAULT_WORK_ROOT } = {}) {
  const loaded = await loadReviewData({ pointerPath, workRoot });
  if (!loaded) throw requestError("No benchmark sample is available.", 404);
  return {
    release_id: loaded.verified.release_id,
    labels: loaded.working.labels,
    content: loaded.working.content,
    revision: loaded.working.revision,
  };
}
