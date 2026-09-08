import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, readdir, open, rename, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { replayOhChildcareAcquisition } from "./oh-childcare-acquisition.mjs";
import { normalizeOhChildcareAcquisition, OH_NORMALIZATION_VERSION } from "./oh-childcare-normalization.mjs";
import { OH_LAYER, OH_WHERE } from "./oh-childcare-preflight.mjs";

const DATASET = "oh-dcy-publisher-open-childcare-centers";
const POLICY_SHA256 = "cedc3384cd0a2509d774ecec90f992e2828ea496bdbafaeeea448576a566bb76";
const POLICY_PATH = path.join(APP_ROOT, "config/source-policies/oh-childcare-local-review.json");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = (v) => JSON.stringify(v), sha = (v) => createHash("sha256").update(v).digest("hex");
const FILES = [
  ["selected-features.jsonl", "internal", 100_000_000], ["normalized.jsonl", "local-review-only", 100_000_000],
  ["quarantine.jsonl", "internal", 10_000_000], ["source-observation.json", "internal", 150_000_000],
];
function requireValue(ok, label) { if (!ok) throw new Error(`Ohio childcare release rejected: ${label}.`); }
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
    requireValue(after.size === identity.size && after.mtimeNs === identity.mtimeNs && after.ctimeNs === identity.ctimeNs && after.nlink === 1n
      && named.ino === identity.ino && named.dev === identity.dev && named.nlink === 1n && !named.isSymbolicLink(), "file changed during read");
    return Buffer.concat(chunks, bytes);
  } finally { await handle.close(); }
}
async function outputLocation(target, signal) {
  const absolute = await canonical(target, false, signal);
  requireValue(!path.relative(APP_ROOT, absolute).split(path.sep).some(segment => ["releases", ".staging"].includes(segment.toLowerCase())), "output cannot be inside immutable releases or staging");
  // Reject before mkdir: an existing bundle must never become a new build root.
  for (let ancestor = absolute; ancestor !== APP_ROOT; ancestor = path.dirname(ancestor)) {
    signal?.throwIfAborted();
    try { await lstat(path.join(ancestor, "manifest.json")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error("Ohio output cannot be inside an existing manifest-bearing bundle.");
  }
  return absolute;
}
export async function readOhChildcareEvidence(filename, options = {}) {
  strictOptions(options, ["signal"]);
  const bytes = await boundedRead(filename, 150_000_000, options.signal);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Ohio acquisition evidence must be valid bounded UTF-8 JSON."); }
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
  return { profile: "oh-childcare-local-review@1.0.0", configuration_sha256: POLICY_SHA256, ...policy };
}
async function lines(rows, signal) {
  const values = [];
  for (const [index, row] of rows.entries()) { if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } values.push(`${json(row)}\n`); }
  return values.join("");
}
async function derive(evidence, runId, processedAt, signal) {
  signal?.throwIfAborted(); await yieldLoop();
  const acquired = replayOhChildcareAcquisition(evidence, { signal });
  const sourceReleaseId = `oh-childcare-${sha(json({ layer_url: OH_LAYER, where: OH_WHERE,
    metadata: evidence.preflight_before.observations.slice(0, 5).map(({ kind, payload }) => ({ kind, payload })),
    features: acquired.features.map(feature => sha(json(feature))) }))}`;
  const result = normalizeOhChildcareAcquisition(evidence, { runId, sourceReleaseId, processedAt }, { signal });
  return { acquired, normalized: result.records, quarantine: result.quarantine, sourceReleaseId, quality: result.summary,
    counts: { selected: result.summary.source_records, accepted: result.summary.accepted_records, quarantined: result.summary.quarantined_records } };
}
async function contents(result, signal) {
  return [await lines(result.acquired.features, signal), await lines(result.normalized, signal), await lines(result.quarantine, signal),
    `${json(result.acquired.evidence)}\n`];
}
function descriptors(values, counts) {
  return FILES.map(([filename, exportPolicy, maximum], index) => {
    const bytes = Buffer.byteLength(values[index]); requireValue(bytes <= maximum, "artifact byte ceiling");
    return { path: filename, bytes, sha256: sha(values[index]), records: [counts.selected, counts.accepted, counts.quarantined, 1][index], export_policy: exportPolicy };
  });
}
function manifestFor(runId, result, artifacts, policy, processedAt) {
  return { schema_version: "1.0.0", dataset_id: DATASET, connector_id: DATASET, connector_version: "1.0.0", transformation_version: OH_NORMALIZATION_VERSION,
    run_id: runId, release_id: `oh-childcare-${runId}`, source_release_id: result.sourceReleaseId, status: "offline-review-only", observed_at: result.acquired.evidence.observed_at, processed_at: processedAt,
    source_url: OH_LAYER, source_filter: OH_WHERE, policy, counts: result.counts, quality: result.quality, quarantine_max_fraction: null,
    mode: "offline-retained-acquisition-release", acquisition_performed: false, normalization_policy_status: "development-scope-not-acquisition-approved",
    policy_status: "scoped-for-connector-development", nationalReportingIntegrated: false,
    evidence_verification_only: true, acquisition_authorized: false, export_authorized: false,
    scope: "Ohio publisher-open Child Care Center rows only; other care types/statuses excluded, operation and license dates unverified",
    claims: { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false, national_coverage_complete: false,
      current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false, acquisition_authorized: false,
      coordinate_reference_verified: false, governed_geographic_assignment_eligible: false, source_freshness_verified: false, source_authenticity_verified: false },
    evidence_limit: "Selected JSON payloads replay the acquisition contract offline. XML and linked notice completeness, provider authentication, transactional snapshot isolation, current source-use authorization and verified business operation are not established.", artifacts };
}
export async function verifyOhChildcareRelease(manifestPath, options = {}) {
  strictOptions(options, ["signal"]); const { signal } = options; signal?.throwIfAborted();
  const resolved = await canonical(manifestPath, false, signal); requireValue(path.basename(resolved) === "manifest.json", "immutable manifest required, not pointer");
  const rawManifest = await boundedRead(resolved, 100_000, signal), manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawManifest));
  requireValue(uuid.test(manifest.run_id) && manifest.release_id === `oh-childcare-${manifest.run_id}`, "release identity");
  const directory = path.dirname(resolved), parent = path.basename(path.dirname(directory));
  requireValue((parent === ".staging" && path.basename(directory) === manifest.run_id) || (parent === "releases" && path.basename(directory) === manifest.release_id), "release directory identity");
  requireValue(json((await readdir(directory)).sort()) === json([...FILES.map(([name]) => name), "manifest.json"].sort()), "exact artifact roster");
  const policy = await policyFor(signal), values = [];
  for (const [name, , maximum] of FILES) values.push(await boundedRead(path.join(directory, name), maximum, signal));
  const evidence = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(values[3]));
  requireValue(typeof manifest.processed_at === "string" && Number.isFinite(Date.parse(manifest.processed_at)) && new Date(manifest.processed_at).toISOString() === manifest.processed_at
    && manifest.processed_at >= evidence.observed_at, "processing clock");
  const result = await derive(evidence, manifest.run_id, manifest.processed_at, signal), expected = await contents(result, signal);
  requireValue(values.every((bytes, index) => bytes.equals(Buffer.from(expected[index]))), "artifact bytes differ from acquisition and normalization replay");
  requireValue(json(manifest) === json(manifestFor(manifest.run_id, result, descriptors(values, result.counts), policy, manifest.processed_at)), "manifest policy, counts or integrity");
  requireValue((await boundedRead(resolved, 100_000, signal)).equals(rawManifest)
    && json((await readdir(directory)).sort()) === json([...FILES.map(([name]) => name), "manifest.json"].sort()), "manifest or roster changed during replay");
  for (const [index, [name, , maximum]] of FILES.entries()) requireValue((await boundedRead(path.join(directory, name), maximum, signal)).equals(values[index]), "artifact changed during replay");
  signal?.throwIfAborted(); return { status: "verified", storage_state: parent === ".staging" ? "staged-not-published" : "immutable-release",
    policy_status: "scoped-for-connector-development", nationalReportingIntegrated: false,
    release_id: manifest.release_id, manifest_path: resolved, manifest_sha256: sha(rawManifest), counts: result.counts, artifact_count: FILES.length };
}
export async function buildOhChildcareRelease(options = {}) {
  strictOptions(options, ["evidence", "outputRoot", "signal", "now", "logger"]);
  const { evidence, outputRoot = path.join(APP_ROOT, "data/business-sources", DATASET, "offline"), logger = () => {}, now = () => new Date(), signal } = options;
  requireValue(typeof logger === "function" && typeof now === "function" && (signal === undefined || signal instanceof AbortSignal), "logger, clock or signal");
  signal?.throwIfAborted();
  const snapshot = structuredClone(evidence), acquired = replayOhChildcareAcquisition(snapshot, { signal });
  const processedAt = now().toISOString(); requireValue(processedAt >= acquired.evidence.observed_at, "processing clock precedes source observation");
  const policy = await policyFor(signal);
  await outputLocation(outputRoot, signal);
  const root = await canonical(outputRoot, true, signal), stagingRoot = await canonical(path.join(root, ".staging"), true, signal), releasesRoot = await canonical(path.join(root, "releases"), true, signal);
  const lockPath = path.join(root, ".publish.lock"); await canonical(lockPath, false, signal);
  const lock = await open(lockPath, "wx"), runId = randomUUID(); let lockIdentity, stagingIdentity, pointerIdentity, reportedFailure, committed = false;
  const stagingFiles = new Map();
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, `oh-childcare-${runId}`), pointerTemp = path.join(root, `.current-${runId}.tmp`);
  async function owned(filename, identity) {
    if (!identity) return false;
    try { await canonical(filename); const info = await lstat(filename, { bigint: true });
      return !info.isSymbolicLink() && info.dev === identity.dev && info.ino === identity.ino && (info.isDirectory() || info.nlink === 1n); }
    catch { return false; }
  }
  async function ownLock() {
    if (!await owned(lockPath, lockIdentity)) return false;
    try { const value = JSON.parse((await boundedRead(lockPath, 1000)).toString("utf8")); return json(value) === json({ run_id: runId, pid: process.pid }); } catch { return false; }
  }
  function inspection() { return Object.assign(new Error("Ohio childcare publication ownership changed; inspection required. Foreign paths and prior releases preserved."), { code: "OH_CHILDCARE_INSPECTION_REQUIRED" }); }
  const stageWrite = (name, bytes) => durableWrite(path.join(staging, name), bytes, signal, (identity) => stagingFiles.set(name, identity));
  try {
    lockIdentity = await lock.stat({ bigint: true }); requireValue(lockIdentity.nlink === 1n, "lock hardlink");
    await lock.writeFile(json({ run_id: runId, pid: process.pid })); await lock.sync();
    await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    await logger("retained-evidence"); signal?.throwIfAborted();
    // Completed selected source evidence survives normalization/quality failures.
    const selected = await lines(acquired.features, signal), observation = `${json(acquired.evidence)}\n`;
    requireValue(Buffer.byteLength(selected) <= FILES[0][2] && Buffer.byteLength(observation) <= FILES[3][2], "source evidence byte ceiling");
    for (const [name, bytes] of [[FILES[0][0], selected], [FILES[3][0], observation]]) await stageWrite(name, bytes);
    await logger("normalize"); signal?.throwIfAborted(); const result = await derive(acquired.evidence, runId, processedAt, signal), values = await contents(result, signal);
    const artifacts = descriptors(values, result.counts), manifest = manifestFor(runId, result, artifacts, policy, processedAt);
    for (const index of [1, 2]) await stageWrite(FILES[index][0], values[index]);
    await stageWrite("manifest.json", `${json(manifest)}\n`);
    await logger("verify"); await verifyOhChildcareRelease(path.join(staging, "manifest.json"), { signal });
    await logger("before-commit"); signal?.throwIfAborted();
    if (!await owned(staging, stagingIdentity) || !await ownLock()) throw inspection();
    await canonical(releasesRoot); await canonical(release);
    try { await lstat(release, { bigint: true }); throw new Error("Release destination already exists."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const pointer = path.join(root, "current.json"); await canonical(pointer);
    try {
      const prior = JSON.parse((await boundedRead(pointer, 10000, signal)).toString("utf8"));
      requireValue(json(Object.keys(prior).sort()) === json(["dataset_id", "release_id", "manifest", "manifest_sha256"].sort())
        && prior.dataset_id === DATASET && typeof prior.release_id === "string" && uuid.test(prior.release_id.slice("oh-childcare-".length))
        && prior.release_id.startsWith("oh-childcare-") && prior.manifest === `releases/${prior.release_id}/manifest.json`
        && /^[a-f0-9]{64}$/.test(prior.manifest_sha256), "foreign or malformed pointer");
      const priorBytes = await boundedRead(path.join(root, prior.manifest), 100_000, signal).catch((error) => { if (error.code === "ENOENT") throw new Error("Prior pointer references a missing manifest."); throw error; });
      const priorManifest = JSON.parse(priorBytes.toString("utf8"));
      requireValue(sha(priorBytes) === prior.manifest_sha256 && priorManifest.dataset_id === DATASET && priorManifest.release_id === prior.release_id
        && priorManifest.mode === "offline-retained-acquisition-release" && priorManifest.status === "offline-review-only" && priorManifest.claims?.acquisition_authorized === false, "prior pointer is not a compatible offline review release");
    }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    // Revalidate after all caller hooks and pointer checks; hooks must never create a
    // gap between evidence verification and publication. Recheck file identities too.
    const verification = await verifyOhChildcareRelease(path.join(staging, "manifest.json"), { signal });
    for (const [name, identity] of stagingFiles) if (!await owned(path.join(staging, name), identity)) throw inspection();
    if (!await ownLock() || !await owned(staging, stagingIdentity)) throw inspection();
    signal?.throwIfAborted();
    // Commit boundary: finish pointer/finalization without cancellation after rename.
    await rename(staging, release); committed = true;
    pointerIdentity = await durableWrite(pointerTemp, `${json({ dataset_id: DATASET, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, manifest_sha256: verification.manifest_sha256 })}\n`, undefined, (identity) => { pointerIdentity = identity; });
    if (!await ownLock() || !await owned(pointerTemp, pointerIdentity)) throw inspection();
    await canonical(pointer); await rename(pointerTemp, pointer);
    return { status: "complete", mode: "offline-review-only", acquisition_performed: false, acquisition_authorized: false, export_authorized: false, nationalReportingIntegrated: false,
      run_id: runId, release_id: manifest.release_id, manifest_path: path.join(release, "manifest.json"), manifest_sha256: verification.manifest_sha256, counts: result.counts };
  } catch (error) {
    reportedFailure = error;
    if (signal?.aborted && !committed && await owned(staging, stagingIdentity)) {
      for (const [name, identity] of stagingFiles) if (await owned(path.join(staging, name), identity)) await unlink(path.join(staging, name));
      if ((await readdir(staging)).length === 0 && await owned(staging, stagingIdentity)) await rmdir(staging);
    }
    throw error;
  }
  finally {
    await lock.close();
    const lockOwned = await ownLock(); if (lockOwned) await unlink(lockPath);
    if (await owned(pointerTemp, pointerIdentity)) await unlink(pointerTemp);
    if (!lockOwned && !reportedFailure) throw inspection();
    // Failed non-cancelled evidence remains for inspection. Cancellation removes only
    // this run's individually owned files, never a recursive directory deletion.
  }
}
