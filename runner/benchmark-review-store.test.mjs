import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { commitBenchmarkLabelImport, getBenchmarkReviewState, getBenchmarkWorkingLabels, previewBenchmarkLabelImport, saveBenchmarkLabel } from "./benchmark-review-store.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, values) {
  return `${prefix}:${sha256(values.map((value) => String(value ?? "")).join("\u001f")).slice(0, 32)}`;
}

function reviewProfile(profileId, sourceId) {
  return {
    profile_id: profileId,
    site_entity_id: `site:${sourceId}`,
    establishment_entity_id: `establishment:${sourceId}`,
    organization_entity_id: null,
    address: { street: "10 Main St", city: "Chicago", state: "IL", zip_code: "60601" },
    normalized_address: { kind: "street", street: "10 MAIN ST", unit: null, city: "CHICAGO", state: "IL", zip_code: "60601", complete: true, match_key: "street|10 MAIN ST||CHICAGO|IL|60601" },
    names: [{ raw: sourceId, strict: sourceId.toUpperCase(), comparison_tokens: [sourceId.toUpperCase()], generic: false }],
    location: null,
    external_identifiers: [],
    source_status: { value: "fixture-current" },
    observed_at: "2026-08-30T20:00:00.000Z",
    source: {
      source_id: sourceId,
      source_release_id: `${sourceId}-release`,
      source_record_id: `${sourceId}-record`,
      ingest_run_id: `${sourceId}-run`,
      transformation_version: `${sourceId}@1.0.0`,
      policy_id: `${sourceId}-policy`,
    },
    export_policy: "public",
  };
}

async function writeBenchmarkFixture(root) {
  const releaseId = "benchmark-review-fixture";
  const resolutionReleaseId = "resolution-review-fixture";
  const seed = "fixture-benchmark-seed-v1";
  const releaseDirectory = path.join(root, "releases", releaseId);
  const candidates = ["automatic-physical-site", "automatic-establishment", "review-candidate"].map((stratum, index) => {
    const samplingKey = `${stratum}|${index}`;
    const leftProfile = reviewProfile(`location-profile:${String(index + 1).padStart(32, "a")}`, `source-left-${index}`);
    const rightProfile = reviewProfile(`location-profile:${String(index + 1).padStart(32, "b")}`, `source-right-${index}`);
    return {
      schema_version: "1.0.0",
      candidate_id: stableId("benchmark-candidate", [resolutionReleaseId, stratum, samplingKey]),
      stratum,
      sampling_key: samplingKey,
      sample_priority_sha256: sha256(`${seed}\u001f${stratum}\u001f${samplingKey}`),
      source_decision_ids: [`resolution-decision:${String(index + 1).padStart(32, "c")}`],
      entity_type: stratum === "automatic-physical-site" ? "physical_site" : "establishment",
      rule_id: "fixture-rule@1.0.0",
      resolved_entity_id: stratum === "review-candidate" ? null : `resolved:${index}`,
      left_entity_id: stratum === "automatic-physical-site" ? leftProfile.site_entity_id : leftProfile.establishment_entity_id,
      right_entity_id: stratum === "automatic-physical-site" ? rightProfile.site_entity_id : rightProfile.establishment_entity_id,
      left_profile_id: leftProfile.profile_id,
      right_profile_id: rightProfile.profile_id,
      resolution_release_id: resolutionReleaseId,
      registry_release_id: "registry-review-fixture",
      source_pair: [
        `${leftProfile.source.source_id}|${leftProfile.source.source_release_id}`,
        `${rightProfile.source.source_id}|${rightProfile.source.source_release_id}`,
      ].sort(),
      left_profile: leftProfile,
      right_profile: rightProfile,
      label_question: "Are these the same entity?",
      allowed_labels: ["match", "non-match", "uncertain", "not-reviewable"],
      export_policy: "local-review-only",
    };
  });
  const labels = candidates.map((candidate) => ({
    schema_version: "1.0.0",
    candidate_id: candidate.candidate_id,
    label: null,
    reviewer_id: null,
    reviewed_at: null,
    evidence_note: null,
    evidence_references: [],
  }));
  const summary = {
    candidate_universe: { "automatic-physical-site": 1, "automatic-establishment": 1, "review-candidate": 1 },
    sampled_candidates: { "automatic-physical-site": 1, "automatic-establishment": 1, "review-candidate": 1 },
    total_sampled_candidates: 3,
    unique_profiles_in_review_packet: 6,
    submitted_labels: 0,
    benchmark_gate_passed: false,
  };
  const candidateBuffer = gzipSync(`${candidates.map(JSON.stringify).join("\n")}\n`);
  const labelBuffer = Buffer.from(`${labels.map(JSON.stringify).join("\n")}\n`);
  const summaryBuffer = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`);
  const artifacts = [
    { path: "review/benchmark-candidates.jsonl.gz", bytes: candidateBuffer.length, sha256: sha256(candidateBuffer), record_count: 3, artifact_type: "entity-resolution-benchmark-candidate-jsonl-gzip" },
    { path: "review/label-template.jsonl", bytes: labelBuffer.length, sha256: sha256(labelBuffer), record_count: 3, artifact_type: "entity-resolution-benchmark-label-template-jsonl" },
    { path: "derived/sample-summary.json", bytes: summaryBuffer.length, sha256: sha256(summaryBuffer), artifact_type: "entity-resolution-benchmark-sample-summary-json" },
  ];
  for (const [index, buffer] of [candidateBuffer, labelBuffer, summaryBuffer].entries()) {
    const destination = path.join(releaseDirectory, artifacts[index].path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
  }
  const manifest = {
    schema_version: "1.0.0",
    dataset_id: "national-business-entity-resolution-benchmark",
    publisher: { id: "national-business-entity-resolution-benchmark", version: "1.0.0" },
    release_id: releaseId,
    status: "awaiting-independent-labels",
    complete_labeled_benchmark: false,
    sampling_version: "business-entity-resolution-benchmark-sampling@1.0.0",
    dependencies: { resolution: { release_id: resolutionReleaseId }, registry: { release_id: "registry-review-fixture" } },
    sampling: { method: "deterministic-min-sha256-within-rule-stratum", seed, target_per_stratum: 1 },
    coverage: summary,
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return { pointerPath, candidates };
}

test("maintains an optimistic-concurrency working label copy and append-only audit journal", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-review-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { pointerPath, candidates } = await writeBenchmarkFixture(path.join(root, "benchmark"));
  const workRoot = path.join(root, "work");
  const initial = await getBenchmarkReviewState({ pointerPath, workRoot });
  assert.equal(initial.available, true);
  assert.equal(initial.pagination.total, 3);
  assert.equal(initial.assessment.automatic_precision_gate_passed, false);

  const saved = await saveBenchmarkLabel({
    pointerPath,
    workRoot,
    candidateId: candidates[0].candidate_id,
    label: "match",
    reviewerId: "reviewer-1",
    expectedRevision: initial.revision,
    now: () => new Date("2026-08-30T22:00:00.000Z"),
  });
  assert.notEqual(saved.revision, initial.revision);
  const labeled = await getBenchmarkReviewState({ pointerPath, workRoot, status: "labeled" });
  assert.equal(labeled.pagination.total, 1);
  assert.equal(labeled.candidates[0].review_label.label, "match");

  await assert.rejects(saveBenchmarkLabel({
    pointerPath,
    workRoot,
    candidateId: candidates[1].candidate_id,
    label: "match",
    reviewerId: "reviewer-2",
    expectedRevision: initial.revision,
  }), (error) => error.statusCode === 409);

  await assert.rejects(saveBenchmarkLabel({
    pointerPath,
    workRoot,
    candidateId: candidates[1].candidate_id,
    label: "non-match",
    reviewerId: "reviewer-2",
    expectedRevision: saved.revision,
  }), /requires an evidence note/);

  const working = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  assert.equal(working.labels.filter((label) => label.label).length, 1);
  const journal = (await readFile(path.join(workRoot, "benchmark-review-fixture.journal.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(journal.map((event) => event.phase), ["proposed", "committed"]);
  assert.equal(journal[0].event_id, journal[1].event_id);
});

function importRow(candidateId, labelValue = "match", overrides = {}) {
  return {
    schema_version: "1.0.0", candidate_id: candidateId, label: labelValue,
    reviewer_id: labelValue === null ? null : "reviewer-import-01",
    reviewed_at: labelValue === null ? null : "2026-10-03T12:00:00.000Z",
    evidence_note: labelValue === null || labelValue === "match" ? null : "Independent sources support the submitted judgment.",
    evidence_references: [], ...overrides,
  };
}

function upload(...rows) { return rows.map((row) => JSON.stringify(row)).join("\n"); }

test("import preview is read-only and explicit commit merges a partial upload as draft-only", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-import-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { pointerPath, candidates } = await writeBenchmarkFixture(path.join(root, "benchmark"));
  const workRoot = path.join(root, "work"), pointerBefore = await readFile(pointerPath);
  const current = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  const jsonl = upload(importRow(candidates[0].candidate_id), importRow(candidates[1].candidate_id, null));
  const options = { pointerPath, workRoot, jsonl, importingOperatorId: "operator-batch-01", expectedRevision: current.revision };
  const preview = await previewBenchmarkLabelImport(options);
  assert.equal(preview.ready, true); assert.equal(preview.draft_only, true); assert.equal(preview.export_authorized, false);
  assert.equal(preview.counts.added, 1); assert.equal(preview.counts.ignored_null_rows, 1);
  assert.equal(preview.before.strata["automatic-physical-site"].submitted, 0);
  assert.equal(preview.after.strata["automatic-physical-site"].submitted, 1);
  await assert.rejects(readdir(workRoot), { code: "ENOENT" }, "preview must not create a work directory");
  assert.deepEqual(await readFile(pointerPath), pointerBefore, "preview leaves the sample pointer unchanged");

  const committed = await commitBenchmarkLabelImport({ ...options, previewToken: preview.preview_token });
  assert.equal(committed.committed, true); assert.equal(committed.draft_only, true); assert.equal(committed.export_authorized, false);
  const working = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  assert.equal(working.labels[0].label, "match"); assert.equal(working.labels[1].label, null); assert.notEqual(working.revision, current.revision);
  const events = (await readFile(path.join(workRoot, "benchmark-review-fixture.journal.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map((event) => event.phase), ["proposed", "committed"]);
  assert.equal(events[0].event_kind, "batch-import"); assert.equal(events[0].event_id, events[1].event_id);
  assert.equal(events[0].importing_operator_id, "operator-batch-01"); assert.equal(events[0].changes[0].prior_label.label, null);
  assert.deepEqual(await readFile(pointerPath), pointerBefore, "draft merge never publishes or changes the immutable sample pointer");
});

test("conflicts require per-row resolution and replacement retains correction reason", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-import-conflicts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { pointerPath, candidates } = await writeBenchmarkFixture(path.join(root, "benchmark"));
  const workRoot = path.join(root, "work");
  const saved = await getBenchmarkReviewState({ pointerPath, workRoot });
  const original = await saveBenchmarkLabel({ pointerPath, workRoot, candidateId: candidates[0].candidate_id, label: "match", reviewerId: "reviewer-1", expectedRevision: saved.revision, now: () => new Date("2026-10-03T12:00:00.000Z") });
  const jsonl = upload(importRow(candidates[0].candidate_id, "non-match"));
  const base = { pointerPath, workRoot, jsonl, importingOperatorId: "operator-batch-01", expectedRevision: original.revision };
  const conflict = await previewBenchmarkLabelImport(base);
  assert.equal(conflict.ready, false); assert.equal(conflict.preview_token, null);
  assert.deepEqual(conflict.unresolved_conflicts, [candidates[0].candidate_id]);
  const keep = await previewBenchmarkLabelImport({ ...base, conflictResolutions: { [candidates[0].candidate_id]: { action: "keep-existing" } } });
  assert.equal(keep.ready, true); assert.equal(keep.counts.kept_existing, 1); assert.equal(keep.after.strata["automatic-physical-site"].labels.match, 1);
  const changedUpload = upload(importRow(candidates[0].candidate_id, "non-match", { evidence_note: "A changed, explicit reason." }));
  await assert.rejects(commitBenchmarkLabelImport({ ...base, jsonl: changedUpload, conflictResolutions: { [candidates[0].candidate_id]: { action: "keep-existing" } }, previewToken: keep.preview_token }), (error) => error.statusCode === 409);
  const replaceResolution = { [candidates[0].candidate_id]: { action: "replace", correction_reason: "Second-source review corrected the prior decision." } };
  const replacement = await previewBenchmarkLabelImport({ ...base, conflictResolutions: replaceResolution });
  const committed = await commitBenchmarkLabelImport({ ...base, conflictResolutions: replaceResolution, previewToken: replacement.preview_token });
  assert.equal(committed.counts.replaced, 1);
  const working = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  assert.equal(working.labels[0].label, "non-match");
  const events = (await readFile(path.join(workRoot, "benchmark-review-fixture.journal.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const batch = events.find((event) => event.event_kind === "batch-import" && event.phase === "proposed");
  assert.equal(batch.conflict_resolutions[0].correction_reason, replaceResolution[candidates[0].candidate_id].correction_reason);
  assert.equal(batch.changes[0].prior_label.label, "match");
});

test("same preview commits idempotently, and recovery completes a proposed batch after replacement", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-import-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { pointerPath, candidates } = await writeBenchmarkFixture(path.join(root, "benchmark"));
  const workRoot = path.join(root, "work"), initial = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  const firstOptions = { pointerPath, workRoot, jsonl: upload(importRow(candidates[0].candidate_id)), importingOperatorId: "operator-batch-01", expectedRevision: initial.revision };
  const firstPreview = await previewBenchmarkLabelImport(firstOptions);
  const concurrent = await Promise.all([
    commitBenchmarkLabelImport({ ...firstOptions, previewToken: firstPreview.preview_token }),
    commitBenchmarkLabelImport({ ...firstOptions, previewToken: firstPreview.preview_token }),
  ]);
  assert.equal(concurrent.filter((item) => item.committed).length, 2);
  assert.equal(concurrent.filter((item) => item.recovered).length, 1);

  const current = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  const secondOptions = { pointerPath, workRoot, jsonl: upload(importRow(candidates[1].candidate_id, "uncertain")), importingOperatorId: "operator-batch-02", expectedRevision: current.revision };
  const secondPreview = await previewBenchmarkLabelImport(secondOptions);
  await assert.rejects(commitBenchmarkLabelImport({ ...secondOptions, previewToken: secondPreview.preview_token, _testHooks: async (phase) => { if (phase === "after-replace-before-committed") throw new Error("injected audit failure"); } }), (error) => error.inspection_required === true);
  const afterReplace = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  assert.notEqual(afterReplace.revision, current.revision);
  const recovered = await commitBenchmarkLabelImport({ ...secondOptions, previewToken: secondPreview.preview_token });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.revision, afterReplace.revision);
  const events = (await readFile(path.join(workRoot, "benchmark-review-fixture.journal.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const second = events.filter((event) => event.preview_token === secondPreview.preview_token);
  assert.deepEqual(second.map((event) => event.phase), ["proposed", "committed"]);
  assert.equal(second[0].event_id, second[1].event_id);

  const replacementRow = importRow(candidates[1].candidate_id, "uncertain", { evidence_note: "Re-reviewed with additional source context." });
  const replacementOptions = {
    pointerPath, workRoot, jsonl: upload(replacementRow), importingOperatorId: "operator-batch-03",
    expectedRevision: afterReplace.revision,
    conflictResolutions: { [candidates[1].candidate_id]: { action: "replace", correction_reason: "The reviewer documented a correction." } },
  };
  const replacementPreview = await previewBenchmarkLabelImport(replacementOptions);
  await assert.rejects(commitBenchmarkLabelImport({ ...replacementOptions, previewToken: replacementPreview.preview_token, _testHooks: async (phase) => { if (phase === "after-replace-before-committed") throw new Error("injected replacement audit failure"); } }), (error) => error.inspection_required === true);
  const replacementRevision = (await getBenchmarkWorkingLabels({ pointerPath, workRoot })).revision;
  const replacementRecovered = await commitBenchmarkLabelImport({ ...replacementOptions, previewToken: replacementPreview.preview_token });
  assert.equal(replacementRecovered.recovered, true);
  assert.equal(replacementRecovered.revision, replacementRevision);
  assert.equal(replacementRecovered.assessment.strata["automatic-establishment"].labels.uncertain, 1);
});

test("preview rejects stale revisions, malformed uploads, and unknown candidates without mutation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-import-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { pointerPath, candidates } = await writeBenchmarkFixture(path.join(root, "benchmark"));
  const workRoot = path.join(root, "work"), current = await getBenchmarkWorkingLabels({ pointerPath, workRoot });
  const base = { pointerPath, workRoot, importingOperatorId: "operator-batch-01", expectedRevision: current.revision };
  await assert.rejects(previewBenchmarkLabelImport({ ...base, jsonl: upload(importRow("benchmark-candidate:" + "f".repeat(32))) }), /unknown candidate/);
  await assert.rejects(previewBenchmarkLabelImport({ ...base, jsonl: "{bad" }), /invalid JSON/);
  await assert.rejects(previewBenchmarkLabelImport({ ...base, jsonl: upload(importRow(candidates[0].candidate_id)), expectedRevision: "0".repeat(64) }), (error) => error.statusCode === 409);
  await assert.rejects(readdir(workRoot), { code: "ENOENT" });
});
