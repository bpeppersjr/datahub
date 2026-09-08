import path from "node:path";
import { createHash } from "node:crypto";
import { lstat, open, realpath, readdir } from "node:fs/promises";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { replayTnChildcareAcquisition } from "./tn-childcare-acquisition.mjs";
import { normalizeTnChildcareFeature, TN_CHILDCARE_TRANSFORMATION } from "./tn-childcare-normalization.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).sort().join("|") === [...keys].sort().join("|");
const utc = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const files = { selectedFeatures: ["selected-features.jsonl", 100_000_000], sourceObservation: ["source-observation.json", 150_000_000], publisherMetadata: ["publisher-metadata.xml", 1_000_000] };
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee recovery inspection rejected: ${label}.`); }
async function canonical(root, file, signal) {
  const relative = path.relative(root, file); requireValue(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "path boundary");
  let cursor = APP_ROOT;
  requireValue(await realpath(APP_ROOT) === APP_ROOT, "application root alias");
  for (const part of path.relative(APP_ROOT, file).split(path.sep).filter(Boolean)) {
    signal?.throwIfAborted(); cursor = path.join(cursor, part);
    const stat = await lstat(cursor, { bigint: true });
    requireValue(!stat.isSymbolicLink() && await realpath(cursor) === cursor && (cursor === file || stat.isDirectory()), "path alias or ancestor");
  }
}
async function readBounded(root, file, maximum, signal) {
  await canonical(root, file, signal); signal?.throwIfAborted();
  const before = await lstat(file, { bigint: true });
  requireValue(before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum), "file type or byte ceiling");
  const handle = await open(file, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(opened.ino === before.ino && opened.dev === before.dev && opened.nlink === 1n && opened.size === before.size, "read ownership");
    const chunks = []; let total = 0;
    for (;;) {
      signal?.throwIfAborted(); const buffer = Buffer.alloc(Math.min(1_000_000, maximum + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
      total += bytesRead; requireValue(total <= maximum, "read ceiling"); chunks.push(buffer.subarray(0, bytesRead)); await yieldLoop();
    }
    const after = await handle.stat({ bigint: true }), named = await lstat(file, { bigint: true });
    requireValue(after.size === opened.size && after.mtimeNs === opened.mtimeNs && after.nlink === 1n && named.ino === opened.ino && named.dev === opened.dev && named.nlink === 1n && !named.isSymbolicLink(), "file changed during read");
    return Buffer.concat(chunks, total);
  } finally { await handle.close(); }
}
function postalShape(value) {
  if (value === null || typeof value === "string" && !value.trim()) return "missing-or-blank";
  if (typeof value !== "string") return "non-string";
  const text = value.trim();
  if (text === "0") return "placeholder-string-zero";
  if (/^\d{5}$/.test(text)) return "five-digit";
  if (/^\d{5}-\d{4}$/.test(text)) return "hyphenated-zip-plus-four";
  if (/^\d{9}$/.test(text)) return "nine-contiguous-digits";
  return "other-string-format";
}

/** Read-only inspection. Recovery/publication needs a separately implemented workflow. */
export async function inspectTnChildcareRecovery(options = {}) {
  try {
    requireValue(object(options) && Object.keys(options).every(key => ["receiptPath", "stagingPath", "expectedHashes", "signal", "root"].includes(key)), "options");
    const { signal, expectedHashes } = options; signal?.throwIfAborted();
    requireValue(exact(expectedHashes, ["receipt", ...Object.keys(files)]) && Object.values(expectedHashes).every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)), "operator provenance pins required");
    requireValue(typeof options.receiptPath === "string" && typeof options.stagingPath === "string", "explicit receipt and staging paths required");
    const root = assertInsideApp(path.resolve(options.root ?? APP_ROOT)), receiptPath = path.resolve(root, options.receiptPath), stagingPath = path.resolve(root, options.stagingPath);
    const receiptBytes = await readBounded(root, receiptPath, 1_000_000, signal);
    requireValue(sha(receiptBytes) === expectedHashes.receipt, "receipt pin mismatch");
    const receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(receiptBytes));
    requireValue(object(receipt) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(receipt.run_id ?? "") && receipt.status === "failed"
      && utc(receipt.started_at) && utc(receipt.finished_at) && receipt.finished_at >= receipt.started_at, "terminal failed run required");
    const runRoot = path.join(root, "data/industry-segments/runs", receipt.run_id), outputRoot = path.join(runRoot, "state-tn-childcare-TN");
    requireValue(receiptPath === path.join(runRoot, "receipt.json") && path.dirname(stagingPath) === path.join(outputRoot, ".staging")
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path.basename(stagingPath)), "receipt/task/staging path binding");
    requireValue(Array.isArray(receipt.tasks) && receipt.tasks.length === 1 && JSON.stringify(receipt.plan?.industries) === '["childcare"]' && JSON.stringify(receipt.plan?.states) === '["TN"]', "single TN task plan required");
    const task = receipt.tasks[0], logRelative = `data/industry-segments/runs/${receipt.run_id}/logs/state-tn-childcare-TN.log`;
    requireValue(task.task_id === "state-tn-childcare:TN" && task.source_id === "state-tn-childcare" && task.state === "TN" && task.status === "failed" && task.code === 1 && task.signal === null
      && utc(task.started_at) && utc(task.finished_at) && task.started_at >= receipt.started_at && task.finished_at >= task.started_at && task.finished_at <= receipt.finished_at && task.log === logRelative
      && /^[a-f0-9]{64}$/.test(receipt.log_sha256?.[task.task_id] ?? ""), "failed task/log lineage");
    const logPath = path.join(root, logRelative), log = await readBounded(root, logPath, 8_000_000, signal);
    requireValue(sha(log) === receipt.log_sha256[task.task_id] && log.toString("utf8").trim() === "acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.", "normalization quality-gate failure log");
    async function assertRetainedOnly() {
      await canonical(root, stagingPath, signal);
      requireValue(JSON.stringify((await readdir(stagingPath)).sort()) === JSON.stringify(Object.values(files).map(([file]) => file).sort()), "exact three-file evidence roster");
      for (const name of [".publish.lock", "current.json"]) {
        try { await lstat(path.join(outputRoot, name)); throw new Error("Source has a publication pointer or unresolved lock."); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      const releaseRoot = path.join(outputRoot, "releases");
      try { await lstat(releaseRoot); await canonical(root, releaseRoot, signal); requireValue((await readdir(releaseRoot)).length === 0, "unpointed release requires inspection"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await assertRetainedOnly();
    const captured = {}, pins = { receipt: { path: path.relative(root, receiptPath).replaceAll("\\", "/"), bytes: receiptBytes.length, sha256: expectedHashes.receipt },
      log: { path: logRelative, bytes: log.length, sha256: sha(log) } };
    for (const [key, [filename, maximum]] of Object.entries(files)) {
      const file = path.join(stagingPath, filename), bytes = await readBounded(root, file, maximum, signal);
      requireValue(sha(bytes) === expectedHashes[key], "retained evidence pin mismatch"); captured[key] = bytes;
      pins[key] = { path: path.relative(root, file).replaceAll("\\", "/"), bytes: bytes.length, sha256: expectedHashes[key] };
    }
    const acquired = replayTnChildcareAcquisition(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(captured.sourceObservation)), { signal });
    requireValue(acquired.source.started_at >= task.started_at && acquired.source.observed_at <= task.finished_at, "acquisition chronology");
    requireValue(captured.selectedFeatures.equals(Buffer.from(acquired.features.map(row => `${JSON.stringify(row)}\n`).join(""))) && captured.publisherMetadata.equals(acquired.publisher_metadata.before.raw), "retained bytes differ from offline replay");
    const reasons = {}, zipFormats = {}, missingRequiredFields = {}; let accepted = 0;
    for (const [index, feature] of acquired.features.entries()) {
      if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
      const shape = postalShape(feature.attributes.Zip); zipFormats[shape] = (zipFormats[shape] ?? 0) + 1;
      for (const key of ["Provider_Name", "Street_Address", "City", "State", "Zip"]) if (feature.attributes[key] === null || typeof feature.attributes[key] === "string" && !feature.attributes[key].trim()) missingRequiredFields[key] = (missingRequiredFields[key] ?? 0) + 1;
      try { normalizeTnChildcareFeature(feature, { runId: path.basename(stagingPath), sourceReleaseId: "recovery-inspection-only", observedAt: acquired.source.observed_at, outputWkid: 4326,
        editingInfo: acquired.source.editing_info, itemModifiedEpochMs: acquired.source.item_modified_epoch_ms, transformationVersion: TN_CHILDCARE_TRANSFORMATION }); accepted++; }
      catch (error) { if (error.code !== "TN_CHILDCARE_RECORD_REJECTED") throw error; reasons[error.reason] = (reasons[error.reason] ?? 0) + 1; }
    }
    const selected = acquired.features.length, quarantined = selected - accepted;
    requireValue(!accepted || quarantined / selected > 0.05, "legacy normalization no longer reproduces the quality failure");
    // Recheck every provenance pin after replay, before returning a successful inspection.
    for (const [key, pin] of Object.entries(pins)) requireValue(sha(await readBounded(root, path.resolve(root, pin.path), key === "receipt" ? 1_000_000 : key === "log" ? 8_000_000 : files[key][1], signal)) === pin.sha256, "evidence changed during inspection");
    await assertRetainedOnly(); signal?.throwIfAborted();
    return { schema_version: "1.0.0", status: "eligible-for-recovery-review", failed_run_id: receipt.run_id, failed_staging_id: path.basename(stagingPath),
      pins, acquisition: { selected_records: selected, observed_at: acquired.source.observed_at, replay_verified: true, retained_bytes_match: true },
      legacy_normalization: { transformation_version: TN_CHILDCARE_TRANSFORMATION, accepted, quarantined, reasons, zip_format_counts: zipFormats, missing_required_field_counts: missingRequiredFields, quality_gate_passed: false, maximum_quarantine_fraction: 0.05 },
      network_requests: 0, writes_performed: false, recovery_published: false, export_authorized: false, source_policy_revalidated: false,
      limitation: "Read-only acquisition evidence review, not a published source release or authority to relax normalization. Original failed receipt and bytes remain unchanged." };
  } catch (error) {
    if (options?.signal?.aborted || error.name === "AbortError") throw error;
    throw new Error("Tennessee recovery inspection failed: provenance, path, evidence or legacy quality-gate validation rejected the input.");
  }
}
