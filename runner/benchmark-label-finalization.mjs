import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, lstat, realpath, readFile, readdir, writeFile, rename, rm, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { TextDecoder } from "node:util";
import { evaluateBenchmarkLabels, verifyEntityResolutionBenchmarkSample } from "./entity-resolution-benchmark.mjs";
import { withBenchmarkReviewMutationLock, getBenchmarkWorkingLabels } from "./benchmark-review-store.mjs";
import { parseBenchmarkLabelImport } from "./benchmark-label-import.mjs";
import { APP_ROOT } from "./paths.mjs";

const DEFAULT_WORK_ROOT = path.join(APP_ROOT, "data", "business-entity-resolution-benchmark", "review-work");
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_POINTER_BYTES = 64 * 1024;
const MAX_GZIP_BYTES = 2 * 1024 * 1024;
const MAX_DECODED_BYTES = 16 * 1024 * 1024;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function jsonLines(rows) { return rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : ""; }
function fail(message, statusCode = 400, extra = {}) { throw Object.assign(new Error(message), { statusCode, ...extra }); }
function contained(parent, child) { const rel = path.relative(parent, child); return !rel.startsWith("..") && !path.isAbsolute(rel); }
function tokenFor(bindings) { return sha256(JSON.stringify({ schema: "benchmark-label-finalization-preview@1.0.0", ...bindings })); }

async function readBounded(filePath, maxBytes, { optional = false } = {}) {
  const absolute = path.resolve(filePath);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch((error) => {
      if (optional && error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return null;
    if (info.isSymbolicLink() || (current === absolute ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) fail("Finalization input must be a regular file with unlinked ancestors.", 409);
  }
  const handle = await open(absolute, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) fail("Finalization input exceeds its bounded regular-file contract.", before.size > maxBytes ? 413 : 409);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || bytes.length !== after.size
      || await realpath(absolute) !== absolute) fail("Finalization input changed during its bounded read.", 409);
    return bytes;
  } finally { await handle.close(); }
}

async function readJson(filePath, maxBytes = MAX_CONFIG_BYTES) {
  const bytes = await readBounded(filePath, maxBytes);
  try { return { value: JSON.parse(bytes.toString("utf8")), bytes, sha256: sha256(bytes) }; }
  catch { fail("A registered finalization contract is invalid JSON.", 409); }
}

function validateOperator(operatorId) {
  if (typeof operatorId !== "string" || operatorId.trim() !== operatorId || operatorId.length < 2 || operatorId.length > 100) fail("Operator ID must contain 2 to 100 characters.");
  return operatorId;
}

function parseStrictLabels(content) {
  const parsed = parseBenchmarkLabelImport(content);
  const canonical = jsonLines(parsed.rows);
  if (canonical !== content) fail("Working labels are not in canonical JSONL form.", 409);
  return parsed.rows;
}

function summarizeAssessment(candidates, labels) {
  const assessment = evaluateBenchmarkLabels(candidates, labels);
  return {
    assessment,
    strata: assessment.strata,
    submitted: labels.filter((row) => row.label !== null).length,
    unlabeled: labels.filter((row) => row.label === null).length,
    reviewers: new Set(labels.filter((row) => row.label !== null).map((row) => row.reviewer_id)).size,
  };
}

function applyJournalEvent(state, event) {
  const changes = event.event_kind === "batch-import"
    ? event.changes
    : [{ candidate_id: event.candidate_id, prior_label: event.prior_label, next_label: event.next_label }];
  if (!Array.isArray(changes) || !changes.length && event.event_kind !== "batch-import") fail("Draft journal event has no replayable changes.", 409);
  const byId = new Map(state.map((row, index) => [row.candidate_id, index]));
  for (const change of changes) {
    const index = byId.get(change?.candidate_id);
    if (index === undefined || JSON.stringify(state[index]) !== JSON.stringify(change.prior_label)
      || change.next_label?.candidate_id !== change.candidate_id) fail("Draft journal history does not match the working label chain.", 409);
    state[index] = change.next_label;
  }
  return state;
}

function inspectJournal(template, journalContent, currentContent, releaseId) {
  if (Buffer.byteLength(journalContent) > MAX_JOURNAL_BYTES) fail("Working-label audit journal exceeds the bounded limit.", 413);
  const state = structuredClone(template);
  const events = [];
  const byId = new Map();
  for (const line of journalContent.split(/\r?\n/).filter(Boolean)) {
    if (Buffer.byteLength(line) > MAX_JOURNAL_BYTES) fail("Working-label audit journal contains an oversized event.", 413);
    let event;
    try { event = JSON.parse(line); } catch { fail("Working-label audit journal contains invalid JSON.", 409); }
    if (!event || event.schema_version !== "1.0.0" || !/^[0-9a-f-]{36}$/i.test(event.event_id ?? "")
      || !["proposed", "committed"].includes(event.phase) || event.benchmark_release_id !== releaseId) fail("Working-label audit journal has an invalid event contract or sample binding.", 409);
    if (!byId.has(event.event_id)) byId.set(event.event_id, {});
    const pair = byId.get(event.event_id);
    if (pair[event.phase]) fail("Working-label audit journal repeats a phase.", 409);
    pair[event.phase] = event;
    if (event.phase === "proposed") events.push(pair);
  }
  if ([...byId.values()].some((pair) => !pair.proposed)) fail("Working-label audit journal contains an orphaned phase.", 409);
  let pending = false;
  let replayContent = jsonLines(state);
  for (const pair of events) {
    const proposed = pair.proposed;
    const committed = pair.committed;
    if (!committed) { pending = true; break; }
    if (proposed.event_kind !== committed.event_kind || proposed.expected_revision !== committed.expected_revision
      || proposed.next_revision !== committed.next_revision || proposed.candidate_id !== committed.candidate_id
      || JSON.stringify(proposed.changes ?? null) !== JSON.stringify(committed.changes ?? null)
      || proposed.importing_operator_id !== committed.importing_operator_id || proposed.reviewer_id !== committed.reviewer_id) {
      fail("Working-label audit phases disagree.", 409);
    }
    if (proposed.expected_revision !== sha256(replayContent)) fail("Working-label audit revision chain is broken.", 409);
    applyJournalEvent(state, proposed);
    replayContent = jsonLines(state);
    if (proposed.next_revision !== sha256(replayContent)) fail("Working-label audit next revision is invalid.", 409);
  }
  return { pending, consistent: replayContent === currentContent && !pending, replayContent };
}

async function loadRegisteredSample(options, { requirePointer = true } = {}) {
  const appRoot = options.appRoot ?? APP_ROOT;
  const benchmarkRegistrationPath = options.benchmarkRegistrationPath ?? path.join(appRoot, "config", "datasets", "national-business-entity-resolution-benchmark.json");
  const labelRegistrationPath = options.labelRegistrationPath ?? path.join(appRoot, "config", "datasets", "national-business-entity-resolution-benchmark-labels.json");
  const labelSchemaPath = options.labelSchemaPath ?? path.join(appRoot, "config", "schemas", "business-entity-resolution-benchmark-label.schema.json");
  const policyPath = options.policyPath ?? path.join(appRoot, "config", "source-policies", "national-business-entity-resolution-benchmark.json");
  const [benchmarkReg, labelReg, labelSchema, policy] = await Promise.all([
    readJson(benchmarkRegistrationPath), readJson(labelRegistrationPath), readJson(labelSchemaPath), readJson(policyPath),
  ]);
  const current = benchmarkReg.value.current_verified_sample;
  if (benchmarkReg.value.dataset_id !== "national-business-entity-resolution-benchmark"
    || typeof benchmarkReg.value.runtime_pointer !== "string"
    || !current?.manifest || !/^[a-f0-9]{64}$/.test(current.manifest_sha256 ?? "") || !current.release_id) fail("Registered benchmark sample is unavailable or malformed.", 503);
  if (labelReg.value.dataset_id !== "national-business-entity-resolution-benchmark-labels"
    || labelReg.value.export_authorized !== false
    || labelReg.value.required_datasets?.length !== 1
    || labelReg.value.required_datasets[0] !== "national-business-entity-resolution-benchmark"
    || labelReg.value.label_schema !== path.relative(appRoot, labelSchemaPath).replaceAll("\\", "/")
    || typeof labelReg.value.runtime_pointer !== "string"
    || labelSchema.value?.additionalProperties !== false
    || labelSchema.value?.properties?.schema_version?.const !== "1.0.0"
    || policy.value?.policy_id !== "national-business-entity-resolution-benchmark"
    || policy.value?.contains_personal_data !== true
    || !Array.isArray(policy.value?.prohibited_use)) fail("Label schema, registration, or policy is incompatible with governed review finalization.", 503);
  const pointerPath = options.benchmarkPointerPath ?? path.resolve(appRoot, benchmarkReg.value.runtime_pointer);
  const pointerBytes = requirePointer ? await readBounded(pointerPath, MAX_POINTER_BYTES) : null;
  let pointer = null;
  if (pointerBytes) {
    try { pointer = JSON.parse(pointerBytes.toString("utf8")); } catch { fail("Registered benchmark pointer is invalid.", 503); }
  if (pointer.release_id !== current.release_id || pointer.manifest !== path.relative(path.dirname(pointerPath), path.resolve(appRoot, current.manifest)).replaceAll("\\", "/")) fail("Live benchmark pointer does not match the registered verified sample.", 503);
  }
  const selected = options.sampleDependency ?? current;
  if (typeof selected?.release_id !== "string" || !/^[a-z0-9][A-Za-z0-9-]{2,127}$/.test(selected.release_id)
    || !/^[a-f0-9]{64}$/.test(selected.manifest_sha256 ?? "")) fail("Selected immutable benchmark dependency is malformed.", 503);
  const manifestPath = options.sampleDependency
    ? path.resolve(path.dirname(pointerPath), "releases", selected.release_id, "manifest.json")
    : path.resolve(appRoot, selected.manifest);
  if (!contained(path.dirname(pointerPath), manifestPath)) fail("Registered benchmark manifest escapes its data root.", 503);
  const manifestBytes = await readBounded(manifestPath, 2 * 1024 * 1024);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== selected.manifest_sha256) fail("Registered benchmark manifest hash changed.", 503);
  // Enforce the review-packet budgets before the general-purpose sample verifier
  // opens any candidate/template artifact. The manifest is already hash-pinned,
  // and the verifier independently checks each artifact hash and replay contract.
  const sampleManifest = JSON.parse(manifestBytes.toString("utf8"));
  for (const artifact of sampleManifest.artifacts ?? []) {
    const candidate = artifact.artifact_type === "entity-resolution-benchmark-candidate-jsonl-gzip";
    const template = artifact.artifact_type === "entity-resolution-benchmark-label-template-jsonl";
    if (!candidate && !template) continue;
    const limit = candidate ? MAX_GZIP_BYTES : 4 * 1024 * 1024;
    const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
    if (!contained(path.dirname(manifestPath), artifactPath)) fail("Registered benchmark review artifact escapes its immutable release.", 503);
    const info = await lstat(artifactPath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > limit || info.size !== artifact.bytes) {
      fail("Registered benchmark review artifact exceeds its bounded regular-file contract.", 503);
    }
  }
  const verified = await verifyEntityResolutionBenchmarkSample(manifestPath);
  if (verified.release_id !== selected.release_id) fail("Verified sample release differs from its registration.", 503);
  const stableBenchmarkRegistration = { ...benchmarkReg.value };
  delete stableBenchmarkRegistration.current_verified_sample;
  return {
    verified,
    manifestPath,
    manifestSha256,
    pointerPath,
    pointerSha256: pointerBytes ? sha256(pointerBytes) : null,
    registrations: {
      benchmark: sha256(Buffer.from(JSON.stringify(stableBenchmarkRegistration))),
      labels: labelReg.sha256,
      schema: labelSchema.sha256,
      policy: policy.sha256,
    },
    labelRegistration: labelReg.value,
  };
}

async function loadPriorPointer(outputRoot, sample) {
  const pointerPath = path.join(outputRoot, "current.json");
  const bytes = await readBounded(pointerPath, MAX_POINTER_BYTES, { optional: true });
  if (!bytes) return { pointerPath, bytes: null, sha256: null, value: null };
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("Existing label pointer is invalid; publication requires inspection.", 503); }
  if (value.dataset_id !== "national-business-entity-resolution-benchmark-labels"
    || !/^business-entity-resolution-benchmark-labels-[A-Za-z0-9-]+$/.test(value.release_id ?? "")
    || !/^[a-f0-9]{64}$/.test(value.manifest_sha256 ?? "")
    || value.manifest !== `releases/${value.release_id}/manifest.json`) fail("Existing label pointer is incompatible; publication requires inspection.", 503);
  const manifestPath = path.resolve(outputRoot, value.manifest);
  if (!contained(path.join(outputRoot, "releases"), manifestPath) || !manifestPath.endsWith(`${path.sep}manifest.json`)) fail("Existing label pointer escapes its immutable releases directory.", 503);
  if (sample) {
    const prior = await verifyLabelRelease(manifestPath, sample, value.manifest_sha256);
    if (prior.manifest.release_id !== value.release_id) fail("Existing label pointer and immutable release disagree.", 503);
  }
  return { pointerPath, bytes, sha256: sha256(bytes), value };
}

async function loadDraft(options, sample) {
  const appRoot = options.appRoot ?? APP_ROOT;
  const workRoot = options.workRoot ?? path.join(appRoot, "data", "business-entity-resolution-benchmark", "review-work");
  const current = await getBenchmarkWorkingLabels({ pointerPath: sample.pointerPath, workRoot });
  if (current.release_id !== sample.verified.release_id || current.pointerSha256 !== sample.pointerSha256 || current.manifestSha256 !== sample.manifestSha256) fail("Working draft is not bound to the registered sample.", 409);
  const parsed = parseStrictLabels(current.content);
  const template = sample.verified.labels;
  const candidates = sample.verified.candidates;
  if (parsed.length !== candidates.length || template.length !== candidates.length
    || parsed.some((row, index) => row.candidate_id !== candidates[index].candidate_id || template[index].candidate_id !== candidates[index].candidate_id)) {
    fail("Working labels are not a complete template-order sample.", 409);
  }
  const journal = inspectJournal(template, current.journalContent, current.content, sample.verified.release_id);
  const registeredOutputRoot = path.dirname(path.resolve(appRoot, sample.labelRegistration.runtime_pointer));
  const outputRoot = options.outputRoot ?? registeredOutputRoot;
  if (path.resolve(outputRoot) !== registeredOutputRoot) fail("Label output root must match the governed registration.", 409);
  const priorPointer = await loadPriorPointer(outputRoot, sample);
  return { ...current, parsed, candidates, template, journal, workRoot, outputRoot, priorPointer };
}

function previewBindings(sample, draft, operatorId) {
  const summary = summarizeAssessment(draft.candidates, draft.parsed);
  const hasJudgment = summary.submitted > 0;
  const blockers = [];
  if (!hasJudgment) blockers.push("At least one independently completed label is required.");
  if (draft.journal.pending) blockers.push("A proposed working-label mutation requires explicit recovery before finalization.");
  if (!draft.journal.consistent) blockers.push("Working-label audit history does not reconcile with the current draft.");
  const bindings = {
    sample_release_id: sample.verified.release_id,
    sample_manifest_sha256: sample.manifestSha256,
    sample_pointer_sha256: sample.pointerSha256,
    draft_revision: draft.revision,
    draft_content_sha256: sha256(draft.content),
    audit_journal_sha256: draft.journalSha256,
    registrations: sample.registrations,
    prior_label_pointer_sha256: draft.priorPointer.sha256,
    importing_operator_id: operatorId,
    submitted_label_count: summary.submitted,
    assessment_sha256: sha256(JSON.stringify(summary.assessment)),
  };
  return { bindings, summary, blockers, ready: blockers.length === 0 };
}

function committedReceiptMatches(receipt, token, operatorId, sample, draft) {
  const bindings = receipt?.preview_bindings;
  return receipt?.phase === "committed"
    && receipt.preview_token === token
    && tokenFor(bindings ?? {}) === token
    && receipt.operator_id === operatorId
    && receipt.sample_manifest_sha256 === sample.manifestSha256
    && receipt.sample_release_id === sample.verified.release_id
    && bindings?.draft_revision === draft.revision
    && bindings?.draft_content_sha256 === sha256(draft.content)
    && bindings?.audit_journal_sha256 === draft.journalSha256
    && JSON.stringify(bindings?.registrations) === JSON.stringify(sample.registrations)
    && bindings?.sample_pointer_sha256 === sample.pointerSha256;
}

export async function previewBenchmarkLabelFinalization(options = {}) {
  const operatorId = validateOperator(options.operatorId);
  const sample = await loadRegisteredSample(options);
  const draft = await loadDraft(options, sample);
  if (options.expectedRevision !== draft.revision) fail("Working labels changed; refresh before previewing finalization.", 409);
  const result = previewBindings(sample, draft, operatorId);
  const token = result.ready ? tokenFor(result.bindings) : null;
  return {
    available: true,
    ready: result.ready,
    preview_token: token,
    blockers: result.blockers,
    bindings: result.bindings,
    submitted_label_count: result.summary.submitted,
    unlabeled_count: result.summary.unlabeled,
    reviewer_count: result.summary.reviewers,
    strata: result.summary.strata,
    prior_snapshot: draft.priorPointer.value ? { release_id: draft.priorPointer.value.release_id, manifest_sha256: draft.priorPointer.value.manifest_sha256 ?? null } : null,
    label_diff: { added: result.summary.submitted, removed: 0, unchanged: draft.template.filter((row) => row.label === null).length - result.summary.submitted },
    benchmark_gate_passed: result.summary.assessment.automatic_precision_gate_passed,
    complete_labeled_benchmark: result.summary.unlabeled === 0,
    export_authorized: false,
    ready_to_publish: result.ready,
  };
}

async function readGzipLabels(filePath) {
  const compressed = await readBounded(filePath, MAX_GZIP_BYTES);
  let decoded;
  try { decoded = gunzipSync(compressed, { maxOutputLength: MAX_DECODED_BYTES }); }
  catch { fail("Submitted-label artifact is malformed or exceeds its decoded byte limit.", 413); }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(decoded); }
  catch { fail("Submitted-label artifact is not valid UTF-8.", 409); }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > 1_275) fail("Submitted-label artifact exceeds its row limit.", 413);
  const rows = lines.map((line) => {
    if (!line) fail("Submitted-label artifact contains an empty row.", 409);
    if (Buffer.byteLength(line) > 16 * 1024) fail("Submitted-label artifact contains an oversized row.", 413);
    try { return JSON.parse(line); } catch { fail("Submitted-label artifact contains malformed JSON.", 409); }
  });
  return rows;
}

function sourcePairDiagnostics(candidates, labels) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const groups = new Map();
  for (const label of labels) {
    const candidate = candidateById.get(label.candidate_id);
    const key = `${candidate.stratum}|${candidate.source_pair.join(" ↔ ")}`;
    if (!groups.has(key)) groups.set(key, { stratum: candidate.stratum, source_pair: candidate.source_pair, submitted: 0, match: 0, "non-match": 0, uncertain: 0, "not-reviewable": 0 });
    const group = groups.get(key); group.submitted += 1; group[label.label] += 1;
  }
  return [...groups.values()].sort((a, b) => a.stratum.localeCompare(b.stratum) || a.source_pair.join("|").localeCompare(b.source_pair.join("|")));
}

function releaseTimestamp(instant) { return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z"); }

async function writeOwnedFile(filePath, content) {
  const temporary = `${filePath}.tmp-${randomUUID()}`;
  let owned = false;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    owned = true;
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, filePath);
    owned = false;
  } finally {
    await handle?.close().catch(() => {});
    if (owned) await rm(temporary, { force: true }).catch(() => {});
  }
}

async function verifyLabelRelease(manifestPath, sample, expectedManifestSha256) {
  const manifestBytes = await readBounded(manifestPath, 2 * 1024 * 1024);
  if (sha256(manifestBytes) !== expectedManifestSha256) fail("Installed label manifest differs from the verified preview receipt.", 503, { inspection_required: true });
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const directory = path.dirname(manifestPath);
  if (manifest.dataset_id !== "national-business-entity-resolution-benchmark-labels" || manifest.export_authorized !== false
    || manifest.schema_version !== "1.0.0" || manifest.publisher?.id !== manifest.dataset_id || manifest.publisher?.version !== "1.0.0"
    || (path.basename(path.dirname(directory)) === ".staging" ? manifest.run_id !== path.basename(directory) : manifest.release_id !== path.basename(directory))
    || !/^business-entity-resolution-benchmark-labels-[A-Za-z0-9-]+$/.test(manifest.release_id ?? "")
    || typeof manifest.created_at !== "string" || Number.isNaN(Date.parse(manifest.created_at))
    || manifest.dependency?.release_id !== sample.verified.release_id || manifest.dependency?.manifest_sha256 !== sample.manifestSha256
    || manifest.dependency?.dataset_id !== "national-business-entity-resolution-benchmark") fail("Label release manifest has an invalid registered dependency or policy status.", 503, { inspection_required: true });
  const inventory = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    if (!artifact.path || inventory.has(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) fail("Label release artifact inventory is not closed.", 503, { inspection_required: true });
    inventory.add(artifact.path);
    const artifactPath = path.resolve(directory, artifact.path);
    if (!contained(directory, artifactPath)) fail("Label release artifact escapes its release.", 503, { inspection_required: true });
    const maximum = artifact.path === "labels/submitted-labels.jsonl.gz" ? MAX_GZIP_BYTES : 2 * 1024 * 1024;
    const artifactBytes = await readBounded(artifactPath, maximum);
    if (sha256(artifactBytes) !== artifact.sha256 || artifactBytes.length !== artifact.bytes) fail("Label release artifact hash or size differs.", 503, { inspection_required: true });
  }
  if (inventory.size !== 2 || !inventory.has("labels/submitted-labels.jsonl.gz") || !inventory.has("derived/benchmark-assessment.json")) fail("Label release inventory is not the required two-artifact contract.", 503, { inspection_required: true });
  const physicalFiles = new Set();
  const physicalDirectories = new Set();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, entry.name);
      const info = await lstat(itemPath);
      if (info.isSymbolicLink()) fail("Label release contains a linked artifact path.", 503, { inspection_required: true });
      if (info.isDirectory()) {
        physicalDirectories.add(path.relative(directoryRoot, itemPath).replaceAll("\\", "/"));
        await walk(itemPath);
      }
      else if (info.isFile() && info.nlink === 1) physicalFiles.add(path.relative(directoryRoot, itemPath).replaceAll("\\", "/"));
      else fail("Label release contains an unsupported filesystem entry.", 503, { inspection_required: true });
    }
  }
  const directoryRoot = path.resolve(directory);
  await walk(directoryRoot);
  const expectedPhysicalFiles = new Set([...inventory, "manifest.json"]);
  if (physicalFiles.size !== expectedPhysicalFiles.size || [...physicalFiles].some((file) => !expectedPhysicalFiles.has(file))
    || physicalDirectories.size !== 2 || !physicalDirectories.has("labels") || !physicalDirectories.has("derived")) fail("Label release contains unregistered filesystem entries or is missing a declared artifact.", 503, { inspection_required: true });
  const submittedArtifact = manifest.artifacts.find((item) => item.path === "labels/submitted-labels.jsonl.gz");
  const assessmentArtifact = manifest.artifacts.find((item) => item.path === "derived/benchmark-assessment.json");
  const labels = await readGzipLabels(path.join(directory, submittedArtifact.path));
  const parsed = parseBenchmarkLabelImport(jsonLines(labels)).rows;
  const expected = sample.verified.candidates.filter((candidate) => labels.some((row) => row.candidate_id === candidate.candidate_id));
  if (labels.length !== submittedArtifact.record_count || labels.some((row) => row.label === null)
    || labels.some((row, index) => row.candidate_id !== expected[index]?.candidate_id)) fail("Submitted labels are not template ordered or include invalid records.", 503, { inspection_required: true });
  const assessment = evaluateBenchmarkLabels(sample.verified.candidates, parsed);
  const pairs = sourcePairDiagnostics(sample.verified.candidates, parsed);
  const assessmentBytes = await readBounded(path.join(directory, assessmentArtifact.path), 2 * 1024 * 1024);
  const stored = JSON.parse(assessmentBytes.toString("utf8"));
  const completeAutomatic = assessment.strata["automatic-physical-site"].complete && assessment.strata["automatic-establishment"].complete;
  const completeLabeled = parsed.length === sample.verified.candidates.length;
  if (JSON.stringify(stored.automatic_precision) !== JSON.stringify(assessment)
    || JSON.stringify(stored.source_pair_diagnostics) !== JSON.stringify(pairs) || stored.export_authorized !== false
    || stored.submitted_label_count !== parsed.length || manifest.coverage?.submitted_labels !== parsed.length
    || manifest.automatic_precision_gate_passed !== assessment.automatic_precision_gate_passed
    || manifest.complete_labeled_benchmark !== completeLabeled || manifest.complete_automatic_benchmark !== completeAutomatic
    || manifest.coverage?.sampled_candidates !== sample.verified.candidates.length
    || manifest.coverage?.reviewer_count !== new Set(parsed.map((row) => row.reviewer_id)).size
    || manifest.coverage?.source_pair_diagnostic_groups !== pairs.length
    || manifest.finalization?.registration_hashes?.benchmark !== sample.registrations.benchmark
    || manifest.finalization?.registration_hashes?.labels !== sample.registrations.labels
    || manifest.finalization?.registration_hashes?.schema !== sample.registrations.schema
    || manifest.finalization?.registration_hashes?.policy !== sample.registrations.policy
    || manifest.finalization?.preview_token == null || manifest.finalization?.operator_id == null
    || !/^[a-f0-9]{64}$/.test(manifest.finalization.preview_token)
    || typeof manifest.finalization.operator_id !== "string" || manifest.finalization.operator_id.length < 2 || manifest.finalization.operator_id.length > 100
    || manifest.finalization?.sample_pointer_sha256 != null && !/^[a-f0-9]{64}$/.test(manifest.finalization.sample_pointer_sha256)
    || manifest.status !== (assessment.automatic_precision_gate_passed ? "published-precision-gate-passed-policy-review-required" : "published-label-snapshot-incomplete-or-gate-failed")
    || manifest.complete_automatic_benchmark !== completeAutomatic || manifest.export_authorization_note == null
    || manifest.policy_profile !== "config/source-policies/national-business-entity-resolution-benchmark.json"
    || JSON.stringify(manifest.coverage?.sampled_by_stratum) !== JSON.stringify(sample.verified.coverage.sampled_candidates)
    || manifest.working_label_set_sha256 !== sha256(jsonLines(sample.verified.labels.map((template) => parsed.find((row) => row.candidate_id === template.candidate_id)).filter(Boolean)))) {
    fail("Label release assessment or submitted-label digest does not reconcile.", 503, { inspection_required: true });
  }
  return { manifest, labels: parsed };
}

async function withPublicationLock(outputRoot, action) {
  await mkdir(outputRoot, { recursive: true });
  const lockDirectory = path.join(outputRoot, ".publish.lock");
  try { await mkdir(lockDirectory); } catch (error) { if (error.code === "EEXIST") fail("Another label publication owns the lock; retry after inspection.", 409); throw error; }
  const token = randomUUID(); const ownerPath = path.join(lockDirectory, "owner.json"); let ownerWritten = false;
  try { await writeFile(ownerPath, JSON.stringify({ token }), { flag: "wx" }); ownerWritten = true; return await action(); }
  finally {
    if (ownerWritten) {
      let owner; try { owner = JSON.parse(await readFile(ownerPath, "utf8")); } catch { fail("Publication lock ownership is uncertain; inspection is required.", 503, { inspection_required: true }); }
      if (owner.token !== token) fail("Publication lock ownership changed; inspection is required.", 503, { inspection_required: true });
      await unlink(ownerPath); await rmdir(lockDirectory);
    } else await rmdir(lockDirectory).catch(() => {});
  }
}

async function atomicWriteReceipt(filePath, receipt) {
  const parent = path.dirname(filePath); await mkdir(parent, { recursive: true });
  await writeOwnedFile(filePath, json(receipt));
}

function buildReleaseMaterial(sample, draft, preview, operatorId, previewToken, createdAt, releaseId, runId) {
  const labelsContent = jsonLines(draft.parsed.filter((row) => row.label !== null));
  const labelsBuffer = gzipSync(labelsContent, { level: 9 });
  const assessment = preview.summary.assessment;
  const sourcePairs = sourcePairDiagnostics(sample.verified.candidates, draft.parsed.filter((row) => row.label !== null));
  const assessmentObject = {
    schema_version: "1.0.0", benchmark_release_id: sample.verified.release_id, evaluated_at: createdAt,
    submitted_label_count: preview.summary.submitted, reviewer_count: preview.summary.reviewers,
    automatic_precision: assessment, source_pair_diagnostics: sourcePairs, export_authorized: false,
  };
  const assessmentBuffer = Buffer.from(json(assessmentObject));
  const artifacts = [
    { path: "labels/submitted-labels.jsonl.gz", bytes: labelsBuffer.length, sha256: sha256(labelsBuffer), artifact_type: "entity-resolution-benchmark-submitted-label-jsonl-gzip", record_count: preview.summary.submitted, distribution_policy: "local-review-only" },
    { path: "derived/benchmark-assessment.json", bytes: assessmentBuffer.length, sha256: sha256(assessmentBuffer), artifact_type: "entity-resolution-benchmark-assessment-json", distribution_policy: "aggregate-local-review" },
  ];
  const automaticComplete = assessment.strata["automatic-physical-site"].complete && assessment.strata["automatic-establishment"].complete;
  const manifest = {
    schema_version: "1.0.0", dataset_id: "national-business-entity-resolution-benchmark-labels",
    publisher: { id: "national-business-entity-resolution-benchmark-labels", version: "1.0.0" },
    release_id: releaseId, run_id: runId, created_at: createdAt,
    status: assessment.automatic_precision_gate_passed ? "published-precision-gate-passed-policy-review-required" : "published-label-snapshot-incomplete-or-gate-failed",
    complete_automatic_benchmark: automaticComplete, complete_labeled_benchmark: preview.summary.unlabeled === 0,
    automatic_precision_gate_passed: assessment.automatic_precision_gate_passed, export_authorized: false,
    export_authorization_note: "Statistical precision never overrides privacy review or any contributing source policy.",
    dependency: { dataset_id: "national-business-entity-resolution-benchmark", release_id: sample.verified.release_id, manifest_sha256: sample.manifestSha256 },
    working_label_set_sha256: sha256(labelsContent),
    finalization: {
      sample_pointer_sha256: sample.pointerSha256, draft_revision: draft.revision,
      draft_content_sha256: sha256(draft.content), audit_journal_sha256: draft.journalSha256,
      registration_hashes: sample.registrations, operator_id: operatorId,
      preview_token: previewToken, submitted_labels_sha256: sha256(labelsContent),
    },
    coverage: { sampled_candidates: sample.verified.candidates.length, sampled_by_stratum: sample.verified.coverage.sampled_candidates, submitted_labels: preview.summary.submitted, reviewer_count: preview.summary.reviewers, source_pair_diagnostic_groups: sourcePairs.length },
    policy_profile: "config/source-policies/national-business-entity-resolution-benchmark.json",
    artifacts,
  };
  const manifestBuffer = Buffer.from(json(manifest));
  return { manifest, manifestBuffer, labelsBuffer, assessmentBuffer, artifacts };
}

async function materializeOwnedStage({ stageRoot, stagingDirectory, ownerPath, owner, material, sample }) {
  const existingStage = await lstat(stagingDirectory).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (existingStage) {
    if (!existingStage.isDirectory() || existingStage.isSymbolicLink()) fail("Existing publication staging path is unsafe; inspection is required.", 503, { inspection_required: true });
    let actualOwner;
    try { actualOwner = JSON.parse((await readBounded(ownerPath, 4096)).toString("utf8")); }
    catch { fail("Existing publication staging ownership is uncertain; inspection is required.", 503, { inspection_required: true }); }
    if (JSON.stringify(actualOwner) !== JSON.stringify(owner)) fail("Existing publication staging belongs to another operation; inspection is required.", 503, { inspection_required: true });
    try {
      await verifyLabelRelease(path.join(stagingDirectory, "manifest.json"), sample, sha256(material.manifestBuffer));
      return;
    } catch {
      // The exact run-owned stage is disposable and uniquely bound by its owner
      // record. Preserve every other operation/release path untouched.
      await rm(stagingDirectory, { recursive: true });
      await unlink(ownerPath);
    }
  }
  await mkdir(stageRoot, { recursive: true });
  await writeFile(ownerPath, json(owner), { flag: "wx" });
  await mkdir(stagingDirectory);
  for (const artifact of material.artifacts) {
    const artifactPath = path.join(stagingDirectory, artifact.path);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    const bytes = artifact.path === "labels/submitted-labels.jsonl.gz" ? material.labelsBuffer : material.assessmentBuffer;
    await writeFile(artifactPath, bytes, { flag: "wx" });
  }
  await writeFile(path.join(stagingDirectory, "manifest.json"), material.manifestBuffer, { flag: "wx" });
  await verifyLabelRelease(path.join(stagingDirectory, "manifest.json"), sample, sha256(material.manifestBuffer));
}

async function publishUnderLocks(options, sample, draft, preview, operatorId) {
  const outputRoot = draft.outputRoot;
  return withPublicationLock(outputRoot, async () => {
    const operationsRoot = path.join(outputRoot, "operations");
    const receiptPath = path.join(operationsRoot, `${preview.token}.json`);
    const receiptBytes = await readBounded(receiptPath, 128 * 1024, { optional: true });
    let receipt = receiptBytes ? JSON.parse(receiptBytes.toString("utf8")) : null;
    if (receipt) {
      if (receipt.preview_token !== preview.token || receipt.sample_manifest_sha256 !== sample.manifestSha256 || receipt.operator_id !== operatorId) fail("Publication receipt does not match this preview.", 409);
      if (receipt.phase === "committed") {
        const pointer = await loadPriorPointer(outputRoot, sample);
        if (pointer.value?.release_id !== receipt.release_id || pointer.value?.manifest_sha256 !== receipt.release_manifest_sha256) fail("Committed label receipt and live pointer disagree; inspection is required.", 503, { inspection_required: true });
        await verifyLabelRelease(path.join(outputRoot, pointer.value.manifest), sample, receipt.release_manifest_sha256);
        return { published: true, recovered: true, release_id: receipt.release_id, status: receipt.status, automatic_precision_gate_passed: receipt.automatic_precision_gate_passed, export_authorized: false };
      }
    }
    if (!receipt) {
      const createdAt = new Date().toISOString();
      const runId = `finalize-${preview.token.slice(0, 24)}`;
      const releaseId = `business-entity-resolution-benchmark-labels-${releaseTimestamp(createdAt)}-${preview.token.slice(0, 8)}`;
      const material = buildReleaseMaterial(sample, draft, preview, operatorId, preview.token, createdAt, releaseId, runId);
      receipt = {
        schema_version: "1.0.0", phase: "prepared", preview_token: preview.token, operator_id: operatorId,
        sample_release_id: sample.verified.release_id, sample_manifest_sha256: sample.manifestSha256,
        draft_revision: draft.revision, audit_journal_sha256: draft.journalSha256,
        prior_pointer_sha256: draft.priorPointer.sha256, release_id: releaseId, run_id: runId,
        release_manifest_sha256: sha256(material.manifestBuffer), status: material.manifest.status,
        automatic_precision_gate_passed: material.manifest.automatic_precision_gate_passed, created_at: createdAt,
        preview_bindings: preview.bindings,
      };
      options.signal?.throwIfAborted();
      await atomicWriteReceipt(receiptPath, receipt);
    }
    const releaseDirectory = path.join(outputRoot, "releases", receipt.release_id);
    let installed = await lstat(releaseDirectory).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (receipt.phase === "prepared" && !installed) {
      const material = buildReleaseMaterial(sample, draft, preview, operatorId, preview.token, receipt.created_at, receipt.release_id, receipt.run_id);
      if (sha256(material.manifestBuffer) !== receipt.release_manifest_sha256) fail("Prepared publication receipt no longer reproduces; inspection is required.", 503, { inspection_required: true });
      const stageRoot = path.join(outputRoot, ".staging");
      const stagingDirectory = path.join(stageRoot, receipt.run_id);
      const ownerPath = path.join(stageRoot, `${receipt.run_id}.owner.json`);
      const owner = { schema_version: "1.0.0", preview_token: preview.token, run_id: receipt.run_id, manifest_sha256: receipt.release_manifest_sha256 };
      await materializeOwnedStage({ stageRoot, stagingDirectory, ownerPath, owner, material, sample });
      try { options.signal?.throwIfAborted(); }
      catch (error) {
        const actualOwner = JSON.parse((await readBounded(ownerPath, 4096)).toString("utf8"));
        if (JSON.stringify(actualOwner) !== JSON.stringify(owner)) fail("Cancelled publication staging ownership is uncertain; inspection is required.", 503, { inspection_required: true });
        await rm(stagingDirectory, { recursive: true });
        await unlink(ownerPath);
        throw error;
      }
      await mkdir(path.dirname(releaseDirectory), { recursive: true });
      await rename(stagingDirectory, releaseDirectory);
      await unlink(ownerPath).catch(() => {});
      installed = await lstat(releaseDirectory);
      receipt = { ...receipt, phase: "release-installed" };
      await atomicWriteReceipt(receiptPath, receipt);
    }
    if (!installed?.isDirectory() || installed.isSymbolicLink()) fail("Installed label release path is unsafe; inspection is required.", 503, { inspection_required: true });
    await verifyLabelRelease(path.join(releaseDirectory, "manifest.json"), sample, receipt.release_manifest_sha256);
    const livePointer = await loadPriorPointer(outputRoot, sample);
    if (livePointer.value?.release_id !== receipt.release_id) {
      if (livePointer.sha256 !== receipt.prior_pointer_sha256) fail("Label pointer changed after preview/publication; installed immutable release is retained for inspection.", 503, { inspection_required: true });
      const manifestRelative = `releases/${receipt.release_id}/manifest.json`;
      const pointer = { dataset_id: "national-business-entity-resolution-benchmark-labels", release_id: receipt.release_id, manifest: manifestRelative, manifest_sha256: receipt.release_manifest_sha256, updated_at: receipt.created_at, status: receipt.status };
      const temporary = `${livePointer.pointerPath}.tmp-${receipt.run_id}`;
      await writeOwnedFile(temporary, json(pointer));
      const beforeReplace = await loadPriorPointer(outputRoot, sample);
      if (beforeReplace.sha256 !== receipt.prior_pointer_sha256) { await rm(temporary, { force: true }); fail("Label pointer changed at compare-and-swap; immutable release is retained for inspection.", 503, { inspection_required: true }); }
      try { options.signal?.throwIfAborted(); }
      catch (error) { await rm(temporary, { force: true }); throw error; }
      await rename(temporary, livePointer.pointerPath);
    } else if (livePointer.value.manifest_sha256 !== receipt.release_manifest_sha256) fail("Current pointer names the release with a different manifest hash.", 503, { inspection_required: true });
    receipt = { ...receipt, phase: "pointer-installed" };
    await atomicWriteReceipt(receiptPath, receipt);
    receipt = { ...receipt, phase: "committed", committed_at: new Date().toISOString() };
    await atomicWriteReceipt(receiptPath, receipt);
    return { published: true, recovered: false, release_id: receipt.release_id, status: receipt.status, automatic_precision_gate_passed: receipt.automatic_precision_gate_passed, export_authorized: false };
  });
}

export async function publishBenchmarkLabelFinalization(options = {}) {
  if (options.confirmation !== "PUBLISH LABEL SNAPSHOT") fail("Explicit publication confirmation is required.");
  const operatorId = validateOperator(options.operatorId);
  if (!/^[a-f0-9]{64}$/.test(options.expectedRevision ?? "") || !/^[a-f0-9]{64}$/.test(options.previewToken ?? "")) fail("A valid draft revision and preview token are required.");
  if (options._testHooks !== undefined) fail("Test hooks are not accepted by the publication API.");
  options.signal?.throwIfAborted();
  const workRoot = options.workRoot ?? DEFAULT_WORK_ROOT;
  // A blocked empty/invalid draft must not even create lock or output directories.
  const initialSample = await loadRegisteredSample(options);
  const initialDraft = await loadDraft({ ...options, workRoot }, initialSample);
  if (initialDraft.revision !== options.expectedRevision) fail("Working labels changed after preview.", 409);
  const existingReceiptPath = path.join(initialDraft.outputRoot, "operations", `${options.previewToken}.json`);
  const existingReceiptBytes = await readBounded(existingReceiptPath, 128 * 1024, { optional: true });
  if (existingReceiptBytes) {
    let existingReceipt;
    try { existingReceipt = JSON.parse(existingReceiptBytes.toString("utf8")); } catch { fail("Publication receipt is invalid; inspection is required.", 503, { inspection_required: true }); }
    const originalBindings = existingReceipt.preview_bindings;
    if (!committedReceiptMatches(existingReceipt, options.previewToken, operatorId, initialSample, initialDraft)) fail("A prior publication receipt does not reconcile with the requested preview.", 409);
    return withBenchmarkReviewMutationLock(workRoot, async () => {
      const sample = await loadRegisteredSample(options);
      const draft = await loadDraft({ ...options, workRoot }, sample);
      if (draft.revision !== options.expectedRevision || sha256(draft.content) !== originalBindings.draft_content_sha256
        || draft.journalSha256 !== originalBindings.audit_journal_sha256) fail("Draft changed while reconciling a prior publication.", 409);
      return publishUnderLocks(options, sample, draft, { token: options.previewToken }, operatorId);
    });
  }
  const initialPreview = previewBindings(initialSample, initialDraft, operatorId);
  if (!initialPreview.ready) fail(initialPreview.blockers.join(" "), 409, { blockers: initialPreview.blockers });
  if (tokenFor(initialPreview.bindings) !== options.previewToken) fail("Finalization preview no longer matches the current registered sample, draft, audit, and pointer.", 409);
  return withBenchmarkReviewMutationLock(workRoot, async () => {
    const sample = await loadRegisteredSample(options);
    const draft = await loadDraft({ ...options, workRoot }, sample);
    if (draft.revision !== options.expectedRevision) fail("Working labels changed after preview.", 409);
    const racedReceiptBytes = await readBounded(path.join(draft.outputRoot, "operations", `${options.previewToken}.json`), 128 * 1024, { optional: true });
    if (racedReceiptBytes) {
      let racedReceipt;
      try { racedReceipt = JSON.parse(racedReceiptBytes.toString("utf8")); } catch { fail("Publication receipt is invalid; inspection is required.", 503, { inspection_required: true }); }
      if (committedReceiptMatches(racedReceipt, options.previewToken, operatorId, sample, draft)) {
        return publishUnderLocks(options, sample, draft, { token: options.previewToken }, operatorId);
      }
    }
    const preview = previewBindings(sample, draft, operatorId);
    if (!preview.ready) fail(preview.blockers.join(" "), 409, { blockers: preview.blockers });
    const token = tokenFor(preview.bindings);
    if (token !== options.previewToken) fail("Finalization preview no longer matches the current registered sample, draft, audit, and pointer.", 409);
    return publishUnderLocks(options, sample, draft, { ...preview, token }, operatorId);
  });
}

export async function verifyBenchmarkLabelSnapshot(manifestPath, { appRoot = APP_ROOT } = {}) {
  if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath)) fail("An absolute immutable label manifest path is required.");
  const labelRegistrationPath = path.join(appRoot, "config", "datasets", "national-business-entity-resolution-benchmark-labels.json");
  const labelRegistration = await readJson(labelRegistrationPath);
  const outputRoot = path.dirname(path.resolve(appRoot, labelRegistration.value.runtime_pointer));
  const absoluteManifest = path.resolve(manifestPath);
  if (!contained(path.join(outputRoot, "releases"), absoluteManifest) || !absoluteManifest.endsWith(`${path.sep}manifest.json`)) fail("Label manifest is outside the registered immutable releases directory.", 409);
  const bytes = await readBounded(absoluteManifest, 2 * 1024 * 1024);
  let preliminary;
  try { preliminary = JSON.parse(bytes.toString("utf8")); } catch { fail("Label release manifest is invalid JSON.", 409); }
  const dependency = preliminary.dependency;
  if (dependency?.dataset_id !== "national-business-entity-resolution-benchmark"
    || !dependency.release_id || !/^[a-f0-9]{64}$/.test(dependency.manifest_sha256 ?? "")) fail("Label release has no exact immutable benchmark dependency.", 409);
  const sample = await loadRegisteredSample({ appRoot, sampleDependency: dependency }, { requirePointer: false });
  const verified = await verifyLabelRelease(absoluteManifest, sample, sha256(bytes));
  return {
    dataset_id: verified.manifest.dataset_id,
    release_id: verified.manifest.release_id,
    status: verified.manifest.status,
    coverage: verified.manifest.coverage,
    automatic_precision_gate_passed: verified.manifest.automatic_precision_gate_passed,
    complete_labeled_benchmark: verified.manifest.complete_labeled_benchmark,
    export_authorized: false,
  };
}
