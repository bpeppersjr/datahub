import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, readdir, open, rename, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { acquireTnChildcare, replayTnChildcareAcquisition } from "./tn-childcare-acquisition.mjs";
import { normalizeTnChildcareFeature, TN_CHILDCARE_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

const DATASET = "tn-dhs-active-childcare-centers";
const POLICY_SHA256 = "a5f642f28fba1a3ba80cf31b3b080011c96cc7bc201a043c981bea46090cee2f";
const POLICY_PATH = path.join(APP_ROOT, "config/source-policies/tn-childcare-local-review.json");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = (v) => JSON.stringify(v), sha = (v) => createHash("sha256").update(v).digest("hex");
const FILES = [
  ["selected-features.jsonl", "internal", 100_000_000], ["normalized.jsonl", "local-review-only", 100_000_000],
  ["quarantine.jsonl", "internal", 10_000_000], ["source-observation.json", "internal", 150_000_000], ["publisher-metadata.xml", "internal", 1_000_000],
];
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee childcare release rejected: ${label}.`); }
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
async function derive(evidence, runId, signal) {
  signal?.throwIfAborted(); await yieldLoop(); const acquired = replayTnChildcareAcquisition(evidence, { signal });
  const { features, source } = acquired;
  const sourceReleaseId = `tn-childcare-${sha(json({ layer_url: source.layer_url, where: source.where, editing_info: source.editing_info,
    item_modified_epoch_ms: source.item_modified_epoch_ms, publisher_xml_sha256: acquired.publisher_metadata.before.sha256,
    features: features.map((feature) => sha(json(feature))) }))}`;
  const normalized = [], quarantine = [];
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    try { normalized.push(normalizeTnChildcareFeature(feature, { runId, sourceReleaseId, observedAt: source.observed_at, outputWkid: 4326,
      editingInfo: source.editing_info, itemModifiedEpochMs: source.item_modified_epoch_ms })); }
    catch (error) {
      if (error.code !== "TN_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: feature.attributes.OBJECTID, input_feature_sha256: sha(json(feature)), reason: error.reason });
    }
  }
  requireValue(normalized.length > 0 && quarantine.length / features.length <= 0.05, "quarantine exceeds 5% or no accepted records");
  return { acquired, normalized, quarantine, sourceReleaseId, counts: { selected: features.length, accepted: normalized.length, quarantined: quarantine.length } };
}
async function contents(result, signal) {
  return [await lines(result.acquired.features, signal), await lines(result.normalized, signal), await lines(result.quarantine, signal),
    `${json(result.acquired.evidence)}\n`, result.acquired.publisher_metadata.before.raw];
}
function descriptors(values, counts) {
  return FILES.map(([filename, exportPolicy, maximum], index) => {
    const bytes = Buffer.byteLength(values[index]); requireValue(bytes <= maximum, "artifact byte ceiling");
    return { path: filename, bytes, sha256: sha(values[index]), records: [counts.selected, counts.accepted, counts.quarantined, 1, 1][index], export_policy: exportPolicy };
  });
}
function manifestFor(runId, result, artifacts, policy) {
  return { schema_version: "1.0.0", dataset_id: DATASET, connector_id: DATASET, connector_version: "1.0.0", transformation_version: TN_CHILDCARE_TRANSFORMATION,
    run_id: runId, release_id: `tn-childcare-${runId}`, source_release_id: result.sourceReleaseId, status: "complete", observed_at: result.acquired.source.observed_at,
    source_url: TN_CHILDCARE_LAYER, source_filter: TN_CHILDCARE_WHERE, policy, counts: result.counts, quarantine_max_fraction: 0.05,
    scope: "Tennessee DHS-derived Active Child Care Center source records; family/group homes, drop-in, authorized providers and TDOE facilities excluded",
    claims: { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false, national_coverage_complete: false,
      current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false },
    evidence_limit: "Selected JSON payloads and complete opaque publisher XML replay the acquisition contract offline; not provider authentication, transactional snapshot isolation, XML parser/schema validation or verified current business operation.", artifacts };
}
export async function verifyTnChildcareRelease(manifestPath, options = {}) {
  strictOptions(options, ["signal"]); const { signal } = options; signal?.throwIfAborted();
  const resolved = await canonical(manifestPath, false, signal); requireValue(path.basename(resolved) === "manifest.json", "immutable manifest required, not pointer");
  const rawManifest = await boundedRead(resolved, 100_000, signal), manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawManifest));
  requireValue(uuid.test(manifest.run_id) && manifest.release_id === `tn-childcare-${manifest.run_id}`, "release identity");
  const directory = path.dirname(resolved), parent = path.basename(path.dirname(directory));
  requireValue((parent === ".staging" && path.basename(directory) === manifest.run_id) || (parent === "releases" && path.basename(directory) === manifest.release_id), "release directory identity");
  requireValue(json((await readdir(directory)).sort()) === json([...FILES.map(([name]) => name), "manifest.json"].sort()), "exact artifact roster");
  const policy = await policyFor(signal), values = [];
  for (const [name, , maximum] of FILES) values.push(await boundedRead(path.join(directory, name), maximum, signal));
  const evidence = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(values[3]));
  const result = await derive(evidence, manifest.run_id, signal), expected = await contents(result, signal);
  requireValue(values.every((bytes, index) => bytes.equals(Buffer.from(expected[index]))), "artifact bytes differ from acquisition and normalization replay");
  requireValue(json(manifest) === json(manifestFor(manifest.run_id, result, descriptors(values, result.counts), policy)), "manifest policy, counts or integrity");
  signal?.throwIfAborted(); return { status: "verified", release_id: manifest.release_id, manifest_path: resolved, manifest_sha256: sha(rawManifest), counts: result.counts, artifact_count: FILES.length };
}
export async function buildTnChildcareRelease(options = {}) {
  strictOptions(options, ["outputRoot", "fetchImpl", "signal", "sleep", "timeoutMs", "now", "logger"]);
  const { outputRoot = path.join(APP_ROOT, "data/business-sources", DATASET), logger = () => {}, ...transport } = options, { signal } = transport;
  requireValue(typeof logger === "function", "logger"); signal?.throwIfAborted(); const policy = await policyFor(signal);
  const root = await canonical(outputRoot, true, signal), stagingRoot = await canonical(path.join(root, ".staging"), true, signal), releasesRoot = await canonical(path.join(root, "releases"), true, signal);
  const lockPath = path.join(root, ".publish.lock"); await canonical(lockPath, false, signal);
  const lock = await open(lockPath, "wx"), runId = randomUUID(); let lockIdentity, stagingIdentity, pointerIdentity, reportedFailure, committed = false;
  const stagingFiles = new Map();
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, `tn-childcare-${runId}`), pointerTemp = path.join(root, `.current-${runId}.tmp`);
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
  function inspection() { return Object.assign(new Error("Tennessee childcare publication ownership changed; inspection required. Foreign paths and prior releases preserved."), { code: "TN_CHILDCARE_INSPECTION_REQUIRED" }); }
  const stageWrite = (name, bytes) => durableWrite(path.join(staging, name), bytes, signal, (identity) => stagingFiles.set(name, identity));
  try {
    lockIdentity = await lock.stat({ bigint: true }); requireValue(lockIdentity.nlink === 1n, "lock hardlink");
    await lock.writeFile(json({ run_id: runId, pid: process.pid })); await lock.sync();
    await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    await logger("acquire"); signal?.throwIfAborted();
    const acquired = await acquireTnChildcare(transport);
    // Completed selected source evidence survives normalization/quality failures.
    const selected = await lines(acquired.features, signal), observation = `${json(acquired.evidence)}\n`, xml = acquired.publisher_metadata.before.raw;
    requireValue(Buffer.byteLength(selected) <= FILES[0][2] && Buffer.byteLength(observation) <= FILES[3][2] && xml.length <= FILES[4][2], "source evidence byte ceiling");
    for (const [name, bytes] of [[FILES[0][0], selected], [FILES[3][0], observation], [FILES[4][0], xml]]) await stageWrite(name, bytes);
    await logger("normalize"); signal?.throwIfAborted(); const result = await derive(acquired.evidence, runId, signal), values = await contents(result, signal);
    const artifacts = descriptors(values, result.counts), manifest = manifestFor(runId, result, artifacts, policy);
    for (const index of [1, 2]) await stageWrite(FILES[index][0], values[index]);
    await stageWrite("manifest.json", `${json(manifest)}\n`);
    await logger("verify"); await verifyTnChildcareRelease(path.join(staging, "manifest.json"), { signal });
    await logger("before-commit"); signal?.throwIfAborted();
    if (!await owned(staging, stagingIdentity) || !await ownLock()) throw inspection();
    await canonical(releasesRoot); await canonical(release);
    try { await lstat(release, { bigint: true }); throw new Error("Release destination already exists."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const pointer = path.join(root, "current.json"); await canonical(pointer);
    try {
      const prior = JSON.parse((await boundedRead(pointer, 10000, signal)).toString("utf8"));
      requireValue(json(Object.keys(prior).sort()) === json(["dataset_id", "release_id", "manifest", "manifest_sha256"].sort())
        && prior.dataset_id === DATASET && typeof prior.release_id === "string" && uuid.test(prior.release_id.slice("tn-childcare-".length))
        && prior.release_id.startsWith("tn-childcare-") && prior.manifest === `releases/${prior.release_id}/manifest.json`
        && /^[a-f0-9]{64}$/.test(prior.manifest_sha256), "foreign or malformed pointer");
      const priorBytes = await boundedRead(path.join(root, prior.manifest), 100_000, signal).catch((error) => { if (error.code === "ENOENT") throw new Error("Prior pointer references a missing manifest."); throw error; });
      const priorManifest = JSON.parse(priorBytes.toString("utf8"));
      requireValue(sha(priorBytes) === prior.manifest_sha256 && priorManifest.dataset_id === DATASET && priorManifest.release_id === prior.release_id, "prior pointer manifest integrity");
    }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    // Revalidate after all caller hooks and pointer checks; hooks must never create a
    // gap between evidence verification and publication. Recheck file identities too.
    const verification = await verifyTnChildcareRelease(path.join(staging, "manifest.json"), { signal });
    for (const [name, identity] of stagingFiles) if (!await owned(path.join(staging, name), identity)) throw inspection();
    if (!await ownLock() || !await owned(staging, stagingIdentity)) throw inspection();
    signal?.throwIfAborted();
    // Commit boundary: finish pointer/finalization without cancellation after rename.
    await rename(staging, release); committed = true;
    pointerIdentity = await durableWrite(pointerTemp, `${json({ dataset_id: DATASET, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, manifest_sha256: verification.manifest_sha256 })}\n`, undefined, (identity) => { pointerIdentity = identity; });
    if (!await ownLock() || !await owned(pointerTemp, pointerIdentity)) throw inspection();
    await canonical(pointer); await rename(pointerTemp, pointer);
    return { status: "complete", run_id: runId, release_id: manifest.release_id, manifest_path: path.join(release, "manifest.json"), manifest_sha256: verification.manifest_sha256, counts: result.counts };
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
