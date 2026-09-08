import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, readdir, open, rename, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { inspectTnChildcareRecovery } from "./tn-childcare-recovery-inspection.mjs";
import { replayTnChildcareAcquisition } from "./tn-childcare-acquisition.mjs";
import { normalizeTnChildcareFeature, TN_CHILDCARE_TRANSFORMATION, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

const DATASET = "tn-dhs-active-childcare-centers";
const POLICY_SHA256 = "a5f642f28fba1a3ba80cf31b3b080011c96cc7bc201a043c981bea46090cee2f";
const POLICY_PATH = path.join(APP_ROOT, "config/source-policies/tn-childcare-local-review.json");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = (v) => JSON.stringify(v), sha = (v) => createHash("sha256").update(v).digest("hex");
const utc = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && json(Object.keys(v).sort()) === json([...keys].sort());
const FILES = [
  ["selected-features.jsonl", "internal", 100_000_000], ["normalized.jsonl", "local-review-only", 100_000_000],
  ["quarantine.jsonl", "internal", 10_000_000], ["source-observation.json", "internal", 150_000_000], ["publisher-metadata.xml", "internal", 1_000_000],
  ["failed-run-receipt.json", "internal", 1_000_000], ["failed-task.log", "internal", 8_000_000],
];
const pinFiles = { receipt: 5, log: 6, selectedFeatures: 0, sourceObservation: 3, publisherMetadata: 4 };
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee recovered release rejected: ${label}.`); }
function strictOptions(options, keys) { requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => keys.includes(key)), "unsupported options"); }
async function canonical(target, create = false, signal) {
  requireValue(typeof target === "string" && target.length <= 1024 && path.resolve(target) === target, "absolute canonical path");
  const absolute = assertInsideApp(target); requireValue(absolute !== APP_ROOT, "application root is not an output");
  requireValue(await realpath(APP_ROOT) === APP_ROOT && !(await lstat(APP_ROOT, { bigint: true })).isSymbolicLink(), "application root alias");
  let current = APP_ROOT;
  for (const segment of path.relative(APP_ROOT, absolute).split(path.sep)) {
    signal?.throwIfAborted(); current = path.join(current, segment);
    let info;
    try { info = await lstat(current, { bigint: true }); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) continue;
      try { await mkdir(current); } catch (mkdirError) { if (mkdirError.code !== "EEXIST") throw mkdirError; }
      info = await lstat(current, { bigint: true });
    }
    requireValue(!info.isSymbolicLink() && await realpath(current) === current, "path alias");
    if (current !== absolute || create) requireValue(info.isDirectory(), "path ancestor is not a directory");
    if (info.isFile()) requireValue(info.nlink === 1n, "hard-linked file");
  }
  return absolute;
}
async function boundedRead(filename, maximum, signal) {
  await canonical(filename, false, signal); signal?.throwIfAborted();
  const initial = await lstat(filename, { bigint: true });
  requireValue(initial.isFile() && !initial.isSymbolicLink() && initial.nlink === 1n && initial.size <= BigInt(maximum), "file type, alias or byte ceiling");
  const handle = await open(filename, "r");
  try {
    const identity = await handle.stat({ bigint: true });
    requireValue(identity.ino === initial.ino && identity.dev === initial.dev && identity.nlink === 1n && identity.size === initial.size, "read ownership");
    const chunks = []; let bytes = 0;
    for (;;) {
      signal?.throwIfAborted(); const buffer = Buffer.alloc(Math.min(1_000_000, maximum + 1 - bytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
      bytes += bytesRead; requireValue(bytes <= maximum, "read byte ceiling"); chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    requireValue(after.size === identity.size && after.mtimeNs === identity.mtimeNs && after.nlink === 1n
      && named.ino === identity.ino && named.dev === identity.dev && named.nlink === 1n && !named.isSymbolicLink(), "file changed during read");
    return Buffer.concat(chunks, bytes);
  } finally { await handle.close(); }
}
async function durableWrite(filename, bytes, signal, capture) {
  await canonical(path.dirname(filename), false, signal); signal?.throwIfAborted();
  const handle = await open(filename, "wx");
  try {
    const identity = await handle.stat({ bigint: true }); requireValue(identity.isFile() && identity.nlink === 1n, "new file ownership");
    capture?.(identity);
    await handle.writeFile(bytes, { signal }); signal?.throwIfAborted(); await handle.sync();
    const named = await lstat(filename, { bigint: true }); requireValue(named.ino === identity.ino && named.dev === identity.dev && named.nlink === 1n && !named.isSymbolicLink(), "written file ownership");
    return identity;
  } finally { await handle.close(); }
}
async function policyFor(signal) {
  const policy = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedRead(POLICY_PATH, 100_000, signal)));
  requireValue(sha(json(policy)) === POLICY_SHA256, "versioned source policy configuration drift");
  return { profile: "tn-childcare-local-review@1.0.0", configuration_sha256: POLICY_SHA256, ...policy };
}
async function lines(rows, signal) {
  const values = [];
  for (const [index, row] of rows.entries()) { if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } values.push(`${json(row)}\n`); }
  return values.join("");
}

async function derive(values, runId, processedAt, pins, signal) {
  requireValue(uuid.test(runId) && utc(processedAt) && exact(pins, Object.keys(pinFiles)), "recovery identity or pins");
  for (const [key, index] of Object.entries(pinFiles)) {
    requireValue(exact(pins[key], ["path", "bytes", "sha256"]) && typeof pins[key].path === "string" && pins[key].path.length <= 1024
      && pins[key].bytes === values[index].length && pins[key].sha256 === sha(values[index]), "parent provenance digest");
  }
  const receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(values[5]));
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(receipt.run_id ?? "") && receipt.status === "failed" && utc(receipt.started_at) && utc(receipt.finished_at)
    && receipt.finished_at >= receipt.started_at && processedAt >= receipt.finished_at
    && json(receipt.plan?.industries) === '["childcare"]' && json(receipt.plan?.states) === '["TN"]' && Array.isArray(receipt.tasks) && receipt.tasks.length === 1, "terminal original failed run");
  const task = receipt.tasks[0], runRelative = `data/industry-segments/runs/${receipt.run_id}`, logRelative = `${runRelative}/logs/state-tn-childcare-TN.log`;
  requireValue(task.task_id === "state-tn-childcare:TN" && task.source_id === "state-tn-childcare" && task.state === "TN" && task.status === "failed"
    && task.code === 1 && task.signal === null && utc(task.started_at) && utc(task.finished_at) && task.started_at >= receipt.started_at
    && task.finished_at >= task.started_at && task.finished_at <= receipt.finished_at && task.log === logRelative
    && receipt.log_sha256?.[task.task_id] === sha(values[6]), "original task/log lineage");
  requireValue(values[6].toString("utf8").trim() === "acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.", "original quality-gate log");
  const stagingPrefix = `${runRelative}/state-tn-childcare-TN/.staging/`;
  requireValue(pins.receipt.path === `${runRelative}/receipt.json` && pins.log.path === logRelative && pins.selectedFeatures.path.startsWith(stagingPrefix), "original path binding");
  const originalId = pins.selectedFeatures.path.slice(stagingPrefix.length).split("/")[0]; requireValue(uuid.test(originalId) && originalId !== runId, "original staging identity must differ from new recovery run");
  for (const key of ["selectedFeatures", "sourceObservation", "publisherMetadata"]) requireValue(pins[key].path === `${stagingPrefix}${originalId}/${FILES[pinFiles[key]][0]}`, "original artifact path binding");
  signal?.throwIfAborted(); await yieldLoop();
  const acquired = replayTnChildcareAcquisition(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(values[3])), { signal });
  requireValue(acquired.source.started_at >= task.started_at && acquired.source.observed_at <= task.finished_at
    && values[0].equals(Buffer.from(await lines(acquired.features, signal))) && values[4].equals(acquired.publisher_metadata.before.raw), "source replay or original chronology");
  const { features, source } = acquired;
  // Identical source identity formula to the original 1.0.0 release implementation.
  const sourceReleaseId = `tn-childcare-${sha(json({ layer_url: source.layer_url, where: source.where, editing_info: source.editing_info,
    item_modified_epoch_ms: source.item_modified_epoch_ms, publisher_xml_sha256: acquired.publisher_metadata.before.sha256,
    features: features.map((feature) => sha(json(feature))) }))}`;
  const normalized = [], quarantine = [], legacyReasons = {}; let legacyAccepted = 0;
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    const context = { runId, sourceReleaseId, observedAt: source.observed_at, outputWkid: 4326, editingInfo: source.editing_info, itemModifiedEpochMs: source.item_modified_epoch_ms };
    try { normalizeTnChildcareFeature(feature, { ...context, runId: originalId, transformationVersion: TN_CHILDCARE_TRANSFORMATION }); legacyAccepted++; }
    catch (error) { if (error.code !== "TN_CHILDCARE_RECORD_REJECTED") throw error; legacyReasons[error.reason] = (legacyReasons[error.reason] ?? 0) + 1; }
    try { normalized.push(normalizeTnChildcareFeature(feature, { ...context, transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION })); }
    catch (error) { if (error.code !== "TN_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: feature.attributes.OBJECTID, input_feature_sha256: sha(json(feature)), reason: error.reason }); }
  }
  requireValue(legacyAccepted === 0 || (features.length - legacyAccepted) / features.length > 0.05, "legacy quality failure not reproduced");
  requireValue(normalized.length > 0 && quarantine.length / features.length <= 0.05, "recovered quarantine exceeds 5% or no accepted records");
  const zipCounts = { available: 0, missing_source_zip: 0, invalid_source_zip_placeholder: 0 };
  for (const record of normalized) {
    const reason = record.quality.zip_unavailable_reason;
    if (reason === null) zipCounts.available++; else zipCounts[reason.replaceAll("-", "_")]++;
  }
  return { acquired, sourceReleaseId, normalized, quarantine, counts: { selected: features.length, accepted: normalized.length, quarantined: quarantine.length }, zipCounts,
    lineage: { mode: "offline-failed-acquisition-recovery", network_requests: 0, failed_run_id: receipt.run_id, failed_staging_id: originalId, original_pins: pins,
      legacy_normalization: { transformation_version: TN_CHILDCARE_TRANSFORMATION, accepted: legacyAccepted, quarantined: features.length - legacyAccepted,
        reasons: legacyReasons, quality_gate_passed: false, maximum_quarantine_fraction: 0.05 } } };
}
async function completeValues(values, result, signal) { const output = [...values]; output[1] = Buffer.from(await lines(result.normalized, signal)); output[2] = Buffer.from(await lines(result.quarantine, signal)); return output; }
function descriptors(values, counts) {
  return FILES.map(([filename, exportPolicy, maximum], index) => {
    requireValue(values[index].length <= maximum, "artifact byte ceiling");
    return { path: filename, bytes: values[index].length, sha256: sha(values[index]), records: [counts.selected, counts.accepted, counts.quarantined, 1, 1, 1, 1][index], export_policy: exportPolicy };
  });
}
function manifestFor(runId, processedAt, result, values, policy) {
  return { schema_version: "1.0.0", dataset_id: DATASET, connector_id: DATASET, connector_version: "1.0.1", transformation_version: TN_CHILDCARE_REPROCESS_TRANSFORMATION,
    recovery_version: "tn-childcare-failed-acquisition-recovery@1.0.0", run_id: runId, release_id: `tn-childcare-recovered-${runId}`, source_release_id: result.sourceReleaseId,
    status: "complete", observed_at: result.acquired.source.observed_at, processed_at: processedAt, source_url: TN_CHILDCARE_LAYER, source_filter: TN_CHILDCARE_WHERE,
    policy, counts: result.counts, postal_coverage: result.zipCounts, quarantine_max_fraction: 0.05, recovery: result.lineage,
    claims: { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false, national_coverage_complete: false,
      current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false, zip_inferred_from_geometry: false },
    evidence_limit: "Self-contained replay of copied failed receipt/log and retained acquisition evidence. No original staging dependency, provider authentication, transactional snapshot isolation, XML parser/schema validation, or ZIP enrichment.",
    artifacts: descriptors(values, result.counts) };
}
export async function verifyTnChildcareRecoveredRelease(manifestPath, options = {}) {
  strictOptions(options, ["signal"]); const { signal } = options; signal?.throwIfAborted();
  const resolved = await canonical(manifestPath, false, signal); requireValue(path.basename(resolved) === "manifest.json", "immutable manifest required");
  const rawManifest = await boundedRead(resolved, 100_000, signal), manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawManifest));
  requireValue(uuid.test(manifest.run_id) && manifest.release_id === `tn-childcare-recovered-${manifest.run_id}`, "release identity");
  const directory = path.dirname(resolved), parent = path.basename(path.dirname(directory));
  requireValue((parent === ".staging" && path.basename(directory) === manifest.run_id) || (parent === "releases" && path.basename(directory) === manifest.release_id), "release directory identity");
  requireValue(json((await readdir(directory)).sort()) === json([...FILES.map(([name]) => name), "manifest.json"].sort()), "artifact roster");
  const values = []; for (const [name, , maximum] of FILES) values.push(await boundedRead(path.join(directory, name), maximum, signal));
  const result = await derive(values, manifest.run_id, manifest.processed_at, manifest.recovery?.original_pins, signal);
  const reproduced = await completeValues(values, result, signal);
  requireValue(values.every((value, index) => value.equals(reproduced[index])), "normalization/quarantine replay mismatch");
  requireValue(json(manifest) === json(manifestFor(manifest.run_id, manifest.processed_at, result, values, await policyFor(signal))), "manifest policy, lineage, counts or integrity");
  signal?.throwIfAborted(); return { status: "verified", release_id: manifest.release_id, manifest_path: resolved, manifest_sha256: sha(rawManifest), counts: result.counts, artifact_count: 7 };
}
export async function recoverTnChildcareRelease(options = {}) {
  strictOptions(options, ["receiptPath", "stagingPath", "expectedHashes", "outputRoot", "signal", "logger", "now"]);
  const { receiptPath, stagingPath, expectedHashes, signal, logger = () => {}, now = () => new Date(),
    outputRoot = path.join(APP_ROOT, "data/business-sources/tn-dhs-active-childcare-centers-recovered") } = options;
  requireValue(typeof logger === "function" && typeof now === "function", "logger/clock"); signal?.throwIfAborted();
  await logger("inspect-retained");
  const inspection = await inspectTnChildcareRecovery({ receiptPath, stagingPath, expectedHashes, signal });
  const processedAt = now().toISOString(), policy = await policyFor(signal), originalRoot = path.dirname(path.join(APP_ROOT, inspection.pins.receipt.path));
  const root = await canonical(outputRoot, false, signal);
  const disjoint = (a, b) => { const relative = path.relative(a, b); return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative); };
  requireValue(disjoint(root, originalRoot) && disjoint(originalRoot, root), "recovery output must be disjoint from original failed run");
  const values = Array(FILES.length).fill(null);
  for (const [key, index] of Object.entries(pinFiles)) {
    const pin = inspection.pins[key]; values[index] = await boundedRead(path.join(APP_ROOT, pin.path), FILES[index][2], signal); requireValue(sha(values[index]) === pin.sha256, "input changed after inspection");
  }
  const runId = randomUUID(), result = await derive(values, runId, processedAt, inspection.pins, signal), complete = await completeValues(values, result, signal);
  const manifest = manifestFor(runId, processedAt, result, complete, policy);
  await canonical(root, true, signal); const stagingRoot = await canonical(path.join(root, ".staging"), true, signal), releasesRoot = await canonical(path.join(root, "releases"), true, signal);
  const lockPath = path.join(root, ".publish.lock"); await canonical(lockPath, false, signal); const lock = await open(lockPath, "wx");
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, manifest.release_id), pointerTemp = path.join(root, `.current-${runId}.tmp`), tracked = new Map();
  let lockIdentity, stagingIdentity, pointerIdentity, committed = false, failed;
  async function owned(file, identity) {
    if (!identity) return false;
    try { await canonical(file); const stat = await lstat(file, { bigint: true }); return !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino && (stat.isDirectory() || stat.nlink === 1n); } catch { return false; }
  }
  async function ownLock() {
    if (!await owned(lockPath, lockIdentity)) return false;
    try { return json(JSON.parse((await boundedRead(lockPath, 1000)).toString("utf8"))) === json({ run_id: runId, pid: process.pid }); } catch { return false; }
  }
  const ownershipError = () => Object.assign(new Error("Tennessee recovered release ownership changed; inspection required. Foreign paths preserved."), { code: "TN_CHILDCARE_RECOVERY_INSPECTION_REQUIRED" });
  try {
    lockIdentity = await lock.stat({ bigint: true }); requireValue(lockIdentity.nlink === 1n, "lock alias");
    await lock.writeFile(json({ run_id: runId, pid: process.pid })); await lock.sync();
    await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    await logger("write-recovered");
    for (const [index, [name]] of FILES.entries()) await durableWrite(path.join(staging, name), complete[index], signal, (identity) => tracked.set(name, identity));
    await durableWrite(path.join(staging, "manifest.json"), `${json(manifest)}\n`, signal, (identity) => tracked.set("manifest.json", identity));
    await logger("verify"); await verifyTnChildcareRecoveredRelease(path.join(staging, "manifest.json"), { signal });
    await logger("before-commit"); signal?.throwIfAborted();
    const pointer = path.join(root, "current.json"); await canonical(pointer);
    let prior, pointerExists = false;
    try { prior = JSON.parse((await boundedRead(pointer, 10000, signal)).toString("utf8")); pointerExists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (pointerExists) {
      requireValue(exact(prior, ["dataset_id", "release_id", "manifest", "manifest_sha256"]) && prior.dataset_id === DATASET && typeof prior.release_id === "string"
        && prior.release_id.startsWith("tn-childcare-recovered-") && uuid.test(prior.release_id.slice("tn-childcare-recovered-".length))
        && prior.manifest === `releases/${prior.release_id}/manifest.json` && /^[a-f0-9]{64}$/.test(prior.manifest_sha256), "invalid prior recovered pointer");
      const bytes = await boundedRead(path.join(root, prior.manifest), 100000, signal), old = JSON.parse(bytes.toString("utf8"));
      requireValue(sha(bytes) === prior.manifest_sha256 && old.dataset_id === DATASET && old.release_id === prior.release_id, "prior recovered manifest integrity");
    }
    const verification = await verifyTnChildcareRecoveredRelease(path.join(staging, "manifest.json"), { signal });
    for (const [name, identity] of tracked) if (!await owned(path.join(staging, name), identity)) throw ownershipError();
    if (!await ownLock() || !await owned(staging, stagingIdentity)) throw ownershipError();
    await canonical(releasesRoot); await canonical(release);
    try { await lstat(release, { bigint: true }); throw new Error("Recovered destination exists."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    signal?.throwIfAborted(); await rename(staging, release); committed = true;
    pointerIdentity = await durableWrite(pointerTemp, `${json({ dataset_id: DATASET, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, manifest_sha256: verification.manifest_sha256 })}\n`, undefined, (identity) => { pointerIdentity = identity; });
    if (!await ownLock() || !await owned(pointerTemp, pointerIdentity)) throw ownershipError();
    await canonical(pointer); await rename(pointerTemp, pointer);
    return { status: "complete", run_id: runId, release_id: manifest.release_id, manifest_path: path.join(release, "manifest.json"), manifest_sha256: verification.manifest_sha256, counts: result.counts };
  } catch (error) {
    failed = error;
    if (signal?.aborted && !committed && await owned(staging, stagingIdentity)) {
      for (const [name, identity] of tracked) if (await owned(path.join(staging, name), identity)) await unlink(path.join(staging, name));
      if ((await readdir(staging)).length === 0 && await owned(staging, stagingIdentity)) await rmdir(staging);
    }
    throw error;
  } finally {
    await lock.close(); const lockOwned = await ownLock(); if (lockOwned) await unlink(lockPath);
    if (await owned(pointerTemp, pointerIdentity)) await unlink(pointerTemp);
    if (!lockOwned && !failed) throw ownershipError();
  }
}
