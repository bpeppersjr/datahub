import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  benchmarkImportPreviewToken,
  canonicalizeBenchmarkImportResolutions,
  deriveBenchmarkLabelMerge,
  parseBenchmarkLabelImport,
} from "./benchmark-label-import.mjs";
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
  let pointerBytes;
  try {
    pointerBytes = await readFile(pointerPath);
    pointer = JSON.parse(pointerBytes.toString("utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest ?? "");
  const relative = path.relative(path.dirname(pointerPath), manifestPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Benchmark pointer escapes its data root.");
  return { pointer, manifestPath, pointerSha256: sha256(pointerBytes) };
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
  const manifestBytes = await readFile(resolved.manifestPath);
  const verified = await verifyEntityResolutionBenchmarkSample(resolved.manifestPath);
  const working = await loadWorkingLabels(verified, workRoot);
  const [pointerAfter, manifestAfter] = await Promise.all([readFile(pointerPath), readFile(resolved.manifestPath)]);
  if (sha256(pointerAfter) !== resolved.pointerSha256 || sha256(manifestAfter) !== sha256(manifestBytes)) {
    throw requestError("Benchmark sample changed during review; refresh and retry.", 409);
  }
  return { verified, working, pointerPath, workRoot, pointerSha256: resolved.pointerSha256, manifestSha256: sha256(manifestBytes) };
}

async function withMutationLock(workRoot, action) {
  await mkdir(workRoot, { recursive: true });
  const lockDirectory = path.join(workRoot, ".benchmark-review.mutation.lock");
  try { await mkdir(lockDirectory); }
  catch (error) { if (error.code === "EEXIST") throw requestError("Benchmark review is being changed by another process; retry shortly.", 409); throw error; }
  const token = `${process.pid}:${randomUUID()}`;
  const ownerPath = path.join(lockDirectory, "owner.json");
  let ownerWritten = false;
  try {
    await writeFile(ownerPath, JSON.stringify({ token }), { flag: "wx" });
    ownerWritten = true;
    return await action();
  } finally {
    if (ownerWritten) {
      let owned = false;
      try { owned = JSON.parse(await readFile(ownerPath, "utf8")).token === token; } catch { /* retain uncertain ownership */ }
      if (!owned) throw Object.assign(new Error("Benchmark mutation lock ownership changed; inspection is required."), { statusCode: 503, inspection_required: true });
      await unlink(ownerPath);
      await rmdir(lockDirectory);
    } else {
      await rmdir(lockDirectory).catch(() => {});
    }
  }
}

function serializedMutation(workRoot, action) {
  const operation = writeQueue.then(() => withMutationLock(workRoot, action));
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function withBenchmarkReviewMutationLock(workRoot = DEFAULT_WORK_ROOT, action) {
  if (typeof action !== "function") throw requestError("A benchmark review mutation action is required.");
  return serializedMutation(workRoot, action);
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
    provenance: { benchmark_manifest_sha256: loaded.manifestSha256, pointer_sha256: loaded.pointerSha256 },
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
  const workRoot = options?.workRoot ?? DEFAULT_WORK_ROOT;
  return serializedMutation(workRoot, () => saveBenchmarkLabelInternal(options));
}

function importingOperator(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length < 2 || value.length > 100) throw requestError("Importing operator ID must contain 2 to 100 characters.");
  return value;
}

function importInput(options, now) {
  const operator = importingOperator(options.importingOperatorId);
  if (typeof options.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(options.expectedRevision)) throw requestError("A valid expected working revision is required.");
  const parsed = parseBenchmarkLabelImport(options.jsonl, { now });
  return { operator, parsed };
}

function analyzeImport(loaded, parsed, conflictResolutions, operator, expectedRevision) {
  const merged = deriveBenchmarkLabelMerge({ candidates: loaded.verified.candidates, currentLabels: loaded.working.labels, uploadedRows: parsed.rows, conflictResolutions });
  const currentAssessment = evaluateBenchmarkLabels(loaded.verified.candidates, loaded.working.labels);
  const nextContent = jsonLines(merged.merged);
  const nextRevision = sha256(nextContent);
  const canonicalMergeSha256 = sha256(nextContent);
  const resolutions = merged.resolutions;
  const previewToken = merged.unresolved.length ? null : benchmarkImportPreviewToken({
    benchmark_release_id: loaded.verified.release_id,
    benchmark_manifest_sha256: loaded.manifestSha256,
    pointer_sha256: loaded.pointerSha256,
    expected_revision: expectedRevision,
    raw_upload_sha256: parsed.raw_sha256,
    canonical_merge_sha256: canonicalMergeSha256,
    conflict_resolutions: resolutions,
    importing_operator_id: operator,
  });
  const changedIds = merged.merged.filter((row, index) => JSON.stringify(row) !== JSON.stringify(loaded.working.labels[index])).map((row) => row.candidate_id);
  return {
    ...merged,
    currentAssessment,
    nextAssessment: evaluateBenchmarkLabels(loaded.verified.candidates, merged.merged),
    nextContent,
    nextRevision,
    canonicalMergeSha256,
    previewToken,
    changedIds,
  };
}

function importConflictSummary(conflicts) {
  return conflicts.map(({ candidate_id, existing, incoming }) => ({
    candidate_id,
    existing_label: existing.label,
    incoming_label: incoming.label,
  }));
}

export async function previewBenchmarkLabelImport(options = {}) {
  const now = options.now?.() ?? new Date();
  const { operator, parsed } = importInput(options, now.getTime());
  const loaded = await loadReviewData(options);
  if (!loaded) throw requestError("No benchmark sample is available.", 404);
  if (options.expectedRevision !== loaded.working.revision) throw requestError("Benchmark labels changed; refresh before previewing the import.", 409);
  const analysis = analyzeImport(loaded, parsed, options.conflictResolutions ?? {}, operator, options.expectedRevision);
  return {
    available: true,
    ready: analysis.unresolved.length === 0,
    preview_token: analysis.previewToken,
    bindings: {
      benchmark_release_id: loaded.verified.release_id,
      benchmark_manifest_sha256: loaded.manifestSha256,
      pointer_sha256: loaded.pointerSha256,
      expected_working_revision: options.expectedRevision,
      raw_upload_sha256: parsed.raw_sha256,
      canonical_merge_sha256: analysis.canonicalMergeSha256,
      importing_operator_id: operator,
      conflict_resolutions: analysis.resolutions,
    },
    counts: analysis.counts,
    changed_candidate_ids: analysis.changedIds,
    conflicts: importConflictSummary(analysis.conflicts),
    unresolved_conflicts: analysis.unresolved,
    before: { revision: loaded.working.revision, strata: analysis.currentAssessment.strata },
    after: { revision: analysis.nextRevision, strata: analysis.nextAssessment.strata },
    draft_only: true,
    export_authorized: false,
    benchmark_gate_passed: analysis.nextAssessment.automatic_precision_gate_passed,
  };
}

async function readJournal(journalPath) {
  try {
    const text = await readFile(journalPath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function commitToken(loaded, parsed, operator, expectedRevision, resolutions, mergedContent) {
  return benchmarkImportPreviewToken({
    benchmark_release_id: loaded.verified.release_id,
    benchmark_manifest_sha256: loaded.manifestSha256,
    pointer_sha256: loaded.pointerSha256,
    expected_revision: expectedRevision,
    raw_upload_sha256: parsed.raw_sha256,
    canonical_merge_sha256: sha256(mergedContent),
    conflict_resolutions: resolutions,
    importing_operator_id: operator,
  });
}

export async function commitBenchmarkLabelImport(options = {}) {
  const workRoot = options.workRoot ?? DEFAULT_WORK_ROOT;
  if (options._testHooks !== undefined && (typeof options._testHooks !== "function" || workRoot === DEFAULT_WORK_ROOT)) throw requestError("Unsupported benchmark import options.");
  return serializedMutation(workRoot, async () => {
    const now = options.now?.() ?? new Date();
    const { operator, parsed } = importInput(options, now.getTime());
    if (typeof options.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(options.previewToken)) throw requestError("A valid import preview token is required.");
    const loaded = await loadReviewData(options);
    if (!loaded) throw requestError("No benchmark sample is available.", 404);
    const journal = await readJournal(loaded.working.journalPath);
    const prior = journal.find((event) => event.phase === "proposed" && event.event_kind === "batch-import" && event.preview_token === options.previewToken);
    if (prior) {
      const requestedResolutions = canonicalizeBenchmarkImportResolutions(options.conflictResolutions ?? {});
      const recomputedPriorToken = benchmarkImportPreviewToken({
        benchmark_release_id: prior.benchmark_release_id,
        benchmark_manifest_sha256: prior.benchmark_manifest_sha256,
        pointer_sha256: prior.pointer_sha256,
        expected_revision: prior.expected_revision,
        raw_upload_sha256: prior.raw_upload_sha256,
        canonical_merge_sha256: prior.canonical_merge_sha256,
        conflict_resolutions: prior.conflict_resolutions,
        importing_operator_id: prior.importing_operator_id,
      });
      const sameRequest = prior.expected_revision === options.expectedRevision
        && prior.raw_upload_sha256 === parsed.raw_sha256
        && prior.importing_operator_id === operator
        && JSON.stringify(prior.conflict_resolutions) === JSON.stringify(requestedResolutions)
        && prior.benchmark_release_id === loaded.verified.release_id
        && prior.benchmark_manifest_sha256 === loaded.manifestSha256
        && prior.pointer_sha256 === loaded.pointerSha256
        && recomputedPriorToken === options.previewToken;
      if (!sameRequest) throw requestError("Prior import receipt does not match the current sample or submitted upload.", 409);
      if (loaded.working.revision === prior.next_revision) {
        const committed = journal.some((event) => event.event_id === prior.event_id && event.phase === "committed");
        if (!committed) await appendFile(loaded.working.journalPath, `${JSON.stringify({ ...prior, phase: "committed", recovered_at: now.toISOString() })}\n`, "utf8");
        return { committed: true, recovered: true, audit_event_id: prior.event_id, revision: loaded.working.revision, assessment: evaluateBenchmarkLabels(loaded.verified.candidates, loaded.working.labels), draft_only: true, export_authorized: false };
      }
      if (loaded.working.revision !== options.expectedRevision) throw requestError("A proposed import is unresolved against the current working revision; inspection is required.", 503);
    }
    const analysis = analyzeImport(loaded, parsed, options.conflictResolutions ?? {}, operator, options.expectedRevision);
    if (analysis.unresolved.length) throw requestError("Every conflicting completed label requires an explicit resolution.", 409);
    const token = commitToken(loaded, parsed, operator, options.expectedRevision, analysis.resolutions, analysis.nextContent);
    if (token !== options.previewToken) throw requestError("Benchmark import preview no longer matches the submitted upload or resolutions.", 409);

    const baseEvent = prior ?? {
      schema_version: "1.0.0",
      event_id: randomUUID(),
      event_kind: "batch-import",
      benchmark_release_id: loaded.verified.release_id,
      benchmark_manifest_sha256: loaded.manifestSha256,
      pointer_sha256: loaded.pointerSha256,
      importing_operator_id: operator,
      at: now.toISOString(),
      expected_revision: options.expectedRevision,
      next_revision: analysis.nextRevision,
      raw_upload_sha256: parsed.raw_sha256,
      canonical_merge_sha256: analysis.canonicalMergeSha256,
      conflict_resolutions: analysis.resolutions,
      preview_token: token,
      counts: analysis.counts,
      changes: analysis.merged.flatMap((row, index) => JSON.stringify(row) !== JSON.stringify(loaded.working.labels[index])
        ? [{ candidate_id: row.candidate_id, prior_label: loaded.working.labels[index], next_label: row }] : []),
    };

    if (options.expectedRevision !== loaded.working.revision) throw requestError("Benchmark labels changed after preview; create a new preview.", 409);
    if (prior && prior.next_revision !== analysis.nextRevision) throw requestError("A prior proposed import conflicts with the current merge; inspection is required.", 503);

    const tempPath = `${loaded.working.labelsPath}.tmp-${baseEvent.event_id}`;
    let tempOwned = false;
    let replaced = false;
    try {
      if (!prior) await appendFile(loaded.working.journalPath, `${JSON.stringify({ ...baseEvent, phase: "proposed" })}\n`, { encoding: "utf8", flag: "a" });
      options.signal?.throwIfAborted();
      await writeFile(tempPath, analysis.nextContent, { encoding: "utf8", flag: "wx" });
      tempOwned = true;
      options.signal?.throwIfAborted();
      await rename(tempPath, loaded.working.labelsPath);
      tempOwned = false;
      replaced = true;
      await options._testHooks?.("after-replace-before-committed", { revision: analysis.nextRevision, eventId: baseEvent.event_id });
      await appendFile(loaded.working.journalPath, `${JSON.stringify({ ...baseEvent, phase: "committed" })}\n`, "utf8");
      return {
        committed: true,
        recovered: false,
        audit_event_id: baseEvent.event_id,
        revision: analysis.nextRevision,
        counts: analysis.counts,
        assessment: analysis.nextAssessment,
        draft_only: true,
        export_authorized: false,
      };
    } catch (error) {
      if (tempOwned) await rm(tempPath, { force: true }).catch(() => {});
      if (replaced) {
        error.statusCode = 503;
        error.inspection_required = true;
        error.message = "Benchmark labels were replaced but the committed audit event could not be confirmed; inspection is required.";
      }
      throw error;
    }
  });
}

export async function getBenchmarkWorkingLabels({ pointerPath = DEFAULT_POINTER, workRoot = DEFAULT_WORK_ROOT } = {}) {
  const loaded = await loadReviewData({ pointerPath, workRoot });
  if (!loaded) throw requestError("No benchmark sample is available.", 404);
  let journalContent = "";
  try { journalContent = await readFile(loaded.working.journalPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return {
    release_id: loaded.verified.release_id,
    labels: loaded.working.labels,
    content: loaded.working.content,
    revision: loaded.working.revision,
    journalContent,
    journalSha256: sha256(journalContent),
    pointerSha256: loaded.pointerSha256,
    manifestSha256: loaded.manifestSha256,
  };
}
