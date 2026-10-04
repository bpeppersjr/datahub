import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_LABEL_IMPORT_LIMITS,
  benchmarkImportPreviewToken,
  deriveBenchmarkLabelMerge,
  parseBenchmarkLabelImport,
} from "./benchmark-label-import.mjs";

const id = (n) => `benchmark-candidate:${String(n).padStart(32, "0")}`;
const label = (n, overrides = {}) => ({
  schema_version: "1.0.0", candidate_id: id(n), label: null, reviewer_id: null,
  reviewed_at: null, evidence_note: null, evidence_references: [], ...overrides,
});
const completed = (n, value = "match", overrides = {}) => label(n, {
  label: value, reviewer_id: "reviewer-01", reviewed_at: "2026-10-03T12:00:00.000Z",
  evidence_note: value === "match" ? null : "Reviewed evidence supports this judgment.", ...overrides,
});
const sample = { candidates: [id(1), id(2), id(3)].map((candidate_id) => ({ candidate_id })), currentLabels: [label(1), label(2), label(3)] };
const jsonl = (...rows) => rows.map((row) => JSON.stringify(row)).join("\n");

test("strict JSONL parser accepts UTF-8 CRLF, canonicalizes row fields, and binds raw bytes", () => {
  const row = completed(1);
  const reversed = Object.fromEntries(Object.entries(row).reverse());
  const source = `${JSON.stringify(reversed)}\r\n`;
  const parsed = parseBenchmarkLabelImport(source, { now: Date.parse("2026-10-04T00:00:00.000Z") });
  assert.deepEqual(Object.keys(parsed.rows[0]), ["schema_version", "candidate_id", "label", "reviewer_id", "reviewed_at", "evidence_note", "evidence_references"]);
  assert.equal(parsed.raw_sha256.length, 64);
  assert.equal(parsed.byte_length, Buffer.byteLength(source));
  assert.deepEqual(parseBenchmarkLabelImport("", { now: Date.now() }).rows, []);
});

test("parser rejects duplicate/foreign-shaped keys, malformed UTF-8/JSON, blank lines, and bounded overflows", () => {
  const row = completed(1);
  assert.throws(() => parseBenchmarkLabelImport(Buffer.from([0xc3, 0x28])), /UTF-8/);
  assert.throws(() => parseBenchmarkLabelImport(`${JSON.stringify({ ...row, extra: true })}`), /shape/);
  assert.throws(() => parseBenchmarkLabelImport(`${JSON.stringify(row)}\n\n`), /empty/);
  assert.throws(() => parseBenchmarkLabelImport("{"), /invalid JSON/);
  assert.throws(() => parseBenchmarkLabelImport(`${jsonl(row, row)}`), /duplicate/);
  assert.throws(() => parseBenchmarkLabelImport("x".repeat(BENCHMARK_LABEL_IMPORT_LIMITS.bytes + 1)), /4 MiB/);
  const hugeRow = completed(1, "match", { evidence_note: "x".repeat(16 * 1024) });
  assert.throws(() => parseBenchmarkLabelImport(JSON.stringify(hugeRow)), /oversized row/);
  const tooMany = Array.from({ length: 1_276 }, (_, n) => JSON.stringify(label(n))).join("\n");
  assert.throws(() => parseBenchmarkLabelImport(tooMany), /1,275 rows/);
});

test("row schema enforces null-row attribution, timestamps, reviewer, notes, and reference bounds", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  for (const bad of [
    label(1, { reviewer_id: "operator" }),
    completed(1, "uncertain", { evidence_note: "   " }),
    completed(1, "not-reviewable", { evidence_note: null }),
    completed(1, "match", { reviewed_at: "2026-10-05T00:00:00.000Z" }),
    completed(1, "match", { reviewed_at: "2026-10-03" }),
    completed(1, "match", { reviewer_id: "x" }),
    completed(1, "match", { evidence_references: ["x".repeat(501)] }),
    completed(1, "match", { evidence_references: Array(21).fill("ref") }),
    completed(1, "match", { evidence_note: "x".repeat(2_001) }),
  ]) assert.throws(() => parseBenchmarkLabelImport(JSON.stringify(bad), { now }), /Benchmark|attribution|requires a nonblank/);
});

test("partial merge adds completed labels, preserves omitted/null rows, and is idempotent", () => {
  const incoming = [completed(1), label(2)];
  const first = deriveBenchmarkLabelMerge({ ...sample, uploadedRows: incoming });
  assert.equal(first.merged[0].label, "match");
  assert.equal(first.merged[1].label, null);
  assert.equal(first.counts.added, 1);
  assert.equal(first.counts.ignored_null_rows, 1);
  const second = deriveBenchmarkLabelMerge({ ...sample, currentLabels: first.merged, uploadedRows: [completed(1), label(2)] });
  assert.equal(second.merged[0].label, "match");
  assert.equal(second.counts.added, 0);
  assert.equal(second.counts.unchanged, 1);
  assert.equal(second.counts.ignored_null_rows, 1);
});

test("differing completed rows require an explicit keep or corrected replacement", () => {
  const currentLabels = [completed(1), label(2), label(3)];
  const incoming = [completed(1, "non-match"), completed(2, "uncertain")];
  const unresolved = deriveBenchmarkLabelMerge({ ...sample, currentLabels, uploadedRows: incoming });
  assert.deepEqual(unresolved.unresolved, [id(1)]);
  assert.equal(unresolved.conflicts.length, 1);
  const kept = deriveBenchmarkLabelMerge({ ...sample, currentLabels, uploadedRows: incoming, conflictResolutions: { [id(1)]: { action: "keep-existing" } } });
  assert.equal(kept.merged[0].label, "match");
  assert.equal(kept.counts.kept_existing, 1);
  assert.equal(kept.merged[1].label, "uncertain");
  const replaced = deriveBenchmarkLabelMerge({ ...sample, currentLabels, uploadedRows: incoming, conflictResolutions: { [id(1)]: { action: "replace", correction_reason: "Corrected after a second-source review." } } });
  assert.equal(replaced.merged[0].label, "non-match");
  assert.equal(replaced.counts.replaced, 1);
  assert.throws(() => deriveBenchmarkLabelMerge({ ...sample, currentLabels, uploadedRows: incoming, conflictResolutions: { [id(1)]: { action: "replace", correction_reason: " " } } }), /correction reason/);
  assert.throws(() => deriveBenchmarkLabelMerge({ ...sample, currentLabels, uploadedRows: incoming, conflictResolutions: { [id(3)]: { action: "keep-existing" } } }), /without a conflict/);
});

test("unknown candidate IDs reject and preview bindings change with each governed input", () => {
  assert.throws(() => deriveBenchmarkLabelMerge({ ...sample, uploadedRows: [completed(99)] }), /unknown candidate/);
  const base = { benchmark_release_id: "sample", benchmark_manifest_sha256: "a".repeat(64), pointer_sha256: "b".repeat(64), expected_revision: "c".repeat(64), raw_upload_sha256: "d".repeat(64), canonical_merge_sha256: "e".repeat(64), conflict_resolutions: [], importing_operator_id: "operator-01" };
  const token = benchmarkImportPreviewToken(base);
  assert.notEqual(token, benchmarkImportPreviewToken({ ...base, expected_revision: "f".repeat(64) }));
  assert.notEqual(token, benchmarkImportPreviewToken({ ...base, raw_upload_sha256: "f".repeat(64) }));
  assert.notEqual(token, benchmarkImportPreviewToken({ ...base, conflict_resolutions: [{ candidate_id: id(1), action: "keep-existing" }] }));
});
