import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

export const BENCHMARK_LABEL_IMPORT_LIMITS = Object.freeze({
  bytes: 4 * 1024 * 1024,
  rowBytes: 16 * 1024,
  rows: 1_275,
});

const KEYS = ["schema_version", "candidate_id", "label", "reviewer_id", "reviewed_at", "evidence_note", "evidence_references"];
const LABELS = new Set(["match", "non-match", "uncertain", "not-reviewable"]);
const ID = /^benchmark-candidate:[a-f0-9]{32}$/;

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function timestamp(value, now) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value && parsed <= now;
}

export function validateBenchmarkLabelImportRow(row, now = Date.now()) {
  if (!plainObject(row) || Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key))) fail("Benchmark import row has an unsupported shape.");
  if (row.schema_version !== "1.0.0" || typeof row.candidate_id !== "string" || !ID.test(row.candidate_id)) fail("Benchmark import row has an invalid version or candidate ID.");
  if (!Array.isArray(row.evidence_references) || row.evidence_references.length > 20
    || row.evidence_references.some((reference) => typeof reference !== "string" || !reference.trim() || reference.length > 500)) fail("Benchmark import evidence references are invalid.");
  if (row.label === null) {
    if (row.reviewer_id !== null || row.reviewed_at !== null || row.evidence_note !== null || row.evidence_references.length !== 0) fail("Unlabeled rows must have null attribution and note with no evidence references.");
    return row;
  }
  if (typeof row.label !== "string" || !LABELS.has(row.label)) fail("Benchmark import label is unsupported.");
  if (typeof row.reviewer_id !== "string" || row.reviewer_id.trim() !== row.reviewer_id || row.reviewer_id.length < 2 || row.reviewer_id.length > 100) fail("Benchmark reviewer ID must contain 2 to 100 characters.");
  if (!timestamp(row.reviewed_at, now)) fail("Benchmark review timestamp is invalid or in the future.");
  if (row.evidence_note !== null && (typeof row.evidence_note !== "string" || row.evidence_note.length > 2_000)) fail("Benchmark evidence note is invalid.");
  if (["non-match", "uncertain", "not-reviewable"].includes(row.label) && !row.evidence_note?.trim()) fail(`${row.label} requires a nonblank evidence note.`);
  return row;
}

export function parseBenchmarkLabelImport(input, { now = Date.now() } = {}) {
  let bytes;
  if (Buffer.isBuffer(input)) bytes = input;
  else if (typeof input === "string") bytes = Buffer.from(input, "utf8");
  else fail("Benchmark label upload must be UTF-8 JSONL.");
  if (bytes.length > BENCHMARK_LABEL_IMPORT_LIMITS.bytes) fail("Benchmark label upload exceeds 4 MiB.", 413);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("Benchmark label upload is not valid UTF-8."); }
  if (text.startsWith("\uFEFF")) fail("Benchmark label upload must not contain a byte-order mark.");
  if (!text.length) return { rows: [], raw_sha256: sha256(bytes), byte_length: bytes.length };
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > BENCHMARK_LABEL_IMPORT_LIMITS.rows) fail("Benchmark label upload exceeds 1,275 rows.", 413);
  const rows = [];
  for (const sourceLine of lines) {
    const line = sourceLine.endsWith("\r") ? sourceLine.slice(0, -1) : sourceLine;
    if (!line || Buffer.byteLength(line, "utf8") > BENCHMARK_LABEL_IMPORT_LIMITS.rowBytes) fail("Benchmark label upload contains an empty or oversized row.", line ? 413 : 400);
    let row;
    try { row = JSON.parse(line); } catch { fail("Benchmark label upload contains invalid JSON."); }
    validateBenchmarkLabelImportRow(row, now);
    rows.push(Object.fromEntries(KEYS.map((key) => [key, row[key]])));
  }
  if (new Set(rows.map((row) => row.candidate_id)).size !== rows.length) fail("Benchmark label upload contains duplicate candidate IDs.");
  return { rows, raw_sha256: sha256(bytes), byte_length: bytes.length };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canonicalResolutions(value, conflicts) {
  if (!plainObject(value)) fail("Conflict resolutions must be an object.");
  const conflictIds = new Set(conflicts.map((conflict) => conflict.candidate_id));
  for (const id of Object.keys(value)) if (!conflictIds.has(id)) fail("Conflict resolution references a candidate without a conflict.");
  const resolutions = [];
  for (const id of [...conflictIds].sort()) {
    const resolution = value[id];
    if (resolution === undefined) continue;
    if (!plainObject(resolution)) fail("Conflict resolution has an invalid shape.");
    if (resolution.action === "keep-existing" && Object.keys(resolution).length === 1) resolutions.push({ candidate_id: id, action: "keep-existing" });
    else if (resolution.action === "replace" && Object.keys(resolution).length === 2
      && typeof resolution.correction_reason === "string" && resolution.correction_reason.trim()
      && resolution.correction_reason.length <= 2_000) resolutions.push({ candidate_id: id, action: "replace", correction_reason: resolution.correction_reason.trim() });
    else fail("Conflict resolution must explicitly keep the existing row or provide a replacement correction reason.");
  }
  return resolutions;
}

export function canonicalizeBenchmarkImportResolutions(value = {}) {
  if (!plainObject(value)) fail("Conflict resolutions must be an object.");
  const entries = [];
  for (const [candidate_id, resolution] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!ID.test(candidate_id) || !plainObject(resolution)) fail("Conflict resolution has an invalid shape.");
    if (resolution.action === "keep-existing" && Object.keys(resolution).length === 1) entries.push({ candidate_id, action: "keep-existing" });
    else if (resolution.action === "replace" && Object.keys(resolution).length === 2
      && typeof resolution.correction_reason === "string" && resolution.correction_reason.trim()
      && resolution.correction_reason.length <= 2_000) entries.push({ candidate_id, action: "replace", correction_reason: resolution.correction_reason.trim() });
    else fail("Conflict resolution must explicitly keep the existing row or provide a replacement correction reason.");
  }
  return entries;
}

export function deriveBenchmarkLabelMerge({ candidates, currentLabels, uploadedRows, conflictResolutions = {} } = {}) {
  if (!Array.isArray(candidates) || !Array.isArray(currentLabels) || !Array.isArray(uploadedRows)) fail("Benchmark merge inputs are invalid.");
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidate_id));
  const currentById = new Map(currentLabels.map((row) => [row.candidate_id, row]));
  if (candidateIds.size !== candidates.length || currentById.size !== currentLabels.length || currentLabels.length !== candidates.length) fail("Current benchmark labels do not match the verified sample.");
  const uploadById = new Map();
  for (const row of uploadedRows) {
    if (!candidateIds.has(row.candidate_id)) fail("Benchmark upload contains an unknown candidate ID.");
    if (uploadById.has(row.candidate_id)) fail("Benchmark upload contains duplicate candidate IDs.");
    uploadById.set(row.candidate_id, row);
  }
  const conflicts = [];
  for (const row of uploadedRows) {
    if (row.label === null) continue;
    const current = currentById.get(row.candidate_id);
    if (current.label !== null && !same(current, row)) conflicts.push({ candidate_id: row.candidate_id, existing: current, incoming: row });
  }
  const resolutions = canonicalResolutions(conflictResolutions, conflicts);
  const resolutionById = new Map(resolutions.map((resolution) => [resolution.candidate_id, resolution]));
  const unresolved = conflicts.filter((conflict) => !resolutionById.has(conflict.candidate_id)).map((conflict) => conflict.candidate_id);
  const merged = currentLabels.map((current) => {
    const incoming = uploadById.get(current.candidate_id);
    if (!incoming || incoming.label === null || same(current, incoming)) return current;
    if (current.label === null) return incoming;
    return resolutionById.get(current.candidate_id)?.action === "replace" ? incoming : current;
  });
  const changed = merged.filter((row, index) => !same(row, currentLabels[index]));
  const importedNullRows = uploadedRows.filter((row) => row.label === null).length;
  const unchanged = uploadedRows.length - importedNullRows - changed.length;
  return {
    merged,
    conflicts,
    unresolved,
    resolutions,
    counts: {
      uploaded_rows: uploadedRows.length,
      added: merged.filter((row, index) => currentLabels[index].label === null && row.label !== null).length,
      replaced: resolutions.filter((resolution) => resolution.action === "replace").length,
      kept_existing: resolutions.filter((resolution) => resolution.action === "keep-existing").length,
      unchanged,
      ignored_null_rows: importedNullRows,
    },
  };
}

export function benchmarkImportPreviewToken(bindings) {
  return sha256(JSON.stringify({
    schema_version: "benchmark-label-import-preview@1.0.0",
    benchmark_release_id: bindings.benchmark_release_id,
    benchmark_manifest_sha256: bindings.benchmark_manifest_sha256,
    pointer_sha256: bindings.pointer_sha256,
    expected_revision: bindings.expected_revision,
    raw_upload_sha256: bindings.raw_upload_sha256,
    canonical_merge_sha256: bindings.canonical_merge_sha256,
    conflict_resolutions: bindings.conflict_resolutions,
    importing_operator_id: bindings.importing_operator_id,
  }));
}
