import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual as same } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { assertOhChildcareSourceUseConfiguration } from "./oh-childcare-source-use.mjs";
import { buildOhChildcareAcquiredReleaseWithTransport, readOhChildcareAcquiredEvidence } from "./oh-childcare-acquired-release.mjs";
import { buildOhChildcareRelease, verifyOhChildcareRelease, ohioCanonicalPath as canonical, ohioBoundedRead as read, ohioDurableWrite as write, ohioOutputLocation as outputLocation } from "./oh-childcare-release.mjs";

const VERSION = "oh-childcare-app@1.0.0";
const ENROLLMENT_HASH = "1af0cb57ba235bc04a3bce33061708af7449a011b6e6b116e877f73b433ce9a2";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const encode = (v) => Buffer.from(`${JSON.stringify(v)}\n`);
const parse = (raw) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
const check = (ok, reason) => { if (!ok) throw new Error(`Ohio app job rejected: ${reason}.`); };
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const relative = (root, filename) => path.relative(root, filename).replaceAll("\\", "/");
function optionsOnly(options, keys) { check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => keys.includes(key)), "unsupported options"); }

export function validateOhChildcareAppEnrollment(value) {
  check(hash(JSON.stringify(value)) === ENROLLMENT_HASH, "runtime enrollment drift");
  return structuredClone(value);
}
async function enrollment(signal) {
  assertOhChildcareSourceUseConfiguration();
  const profile = validateOhChildcareAppEnrollment(parse(await read(path.join(APP_ROOT, "config/oh-childcare-app-enrollment.json"), 30_000, signal)));
  for (const [filename, expected] of [[profile.source_use_policy, profile.source_use_policy_sha256], [profile.source_use_decision, profile.source_use_decision_sha256]]) {
    check(hash(JSON.stringify(parse(await read(path.join(APP_ROOT, filename), 100_000, signal)))) === expected, "retained policy or decision drift");
  }
  return profile;
}
function acquisitionDescriptor(root, verification) {
  return { manifest: relative(root, verification.manifest_path), sha256: verification.manifest_sha256, source_record_count: verification.source_record_count };
}
function normalizedDescriptor(root, verification) {
  return { manifest: relative(root, verification.manifest_path), sha256: verification.manifest_sha256, counts: verification.counts };
}
function completion(start, startRaw, checkpointRaw, acquisition, normalized, finishedAt) {
  return { schema_version: VERSION, run_id: start.run_id, status: "SUCCEEDED", execution_mode: start.execution_mode,
    started_at: start.started_at, finished_at: finishedAt, enrollment_sha256: ENROLLMENT_HASH,
    start_sha256: hash(startRaw), acquisition_checkpoint_sha256: hash(checkpointRaw), acquisition, normalized,
    source_use_authorized: true, native_execution_independently_verified: false, source_authenticity_verified: false,
    public_export_authorized: false, nationalReportingIntegrated: false,
    limitations: "The app wrapper records execution mode; offline evidence does not independently authenticate network execution or prove operating businesses. Normalization remains local-review-only; promotion and new refresh authorization are separate." };
}

async function inspectJob(receiptPath, options = {}, candidate = false, onPhase = () => {}) {
  optionsOnly(options, ["signal"]); const { signal } = options; signal?.throwIfAborted(); await enrollment(signal);
  const filename = await canonical(receiptPath, false, signal), directory = path.dirname(filename), root = path.dirname(path.dirname(directory));
  const receiptName = candidate ? ".receipt-candidate.json" : "receipt.json";
  check(path.basename(filename) === receiptName && path.basename(path.dirname(directory)) === "jobs" && uuid.test(path.basename(directory)), "immutable app job receipt required");
  const startRaw = await read(path.join(directory, "start.json"), 10_000, signal), start = parse(startRaw);
  check(exact(start, ["schema_version", "run_id", "execution_mode", "started_at", "enrollment_sha256", "industry_run_id"])
    && start.schema_version === VERSION && start.run_id === path.basename(directory) && time(start.started_at)
    && ["fixed-native-fetch", "injected-test-transport"].includes(start.execution_mode) && start.enrollment_sha256 === ENROLLMENT_HASH
    && (start.industry_run_id === null || /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(start.industry_run_id)), "start receipt");
  const checkpointRaw = await read(path.join(directory, "acquisition-receipt.json"), 10_000, signal), checkpoint = parse(checkpointRaw);
  check(exact(checkpoint, ["schema_version", "run_id", "acquisition"]) && checkpoint.schema_version === VERSION && checkpoint.run_id === start.run_id, "acquisition checkpoint");
  const raw = await read(filename, 20_000, signal), receipt = parse(raw);
  check(typeof receipt.acquisition?.manifest === "string" && /^acquired\/releases\/oh-acquisition-[a-f0-9-]{36}\/manifest\.json$/.test(receipt.acquisition.manifest)
    && typeof receipt.normalized?.manifest === "string" && /^normalized\/releases\/oh-childcare-[a-f0-9-]{36}\/manifest\.json$/.test(receipt.normalized.manifest), "manifest paths");
  const acquired = await readOhChildcareAcquiredEvidence(path.join(root, receipt.acquisition.manifest), { signal });
  const normalizedPath = path.join(root, receipt.normalized.manifest), normalized = await verifyOhChildcareRelease(normalizedPath, { signal });
  await onPhase("dependencies-verified"); signal?.throwIfAborted();
  const acqDescriptor = acquisitionDescriptor(root, acquired.verification), normDescriptor = normalizedDescriptor(root, normalized);
  check(same(checkpoint.acquisition, acqDescriptor), "acquisition checkpoint linkage");
  check((await read(path.join(path.dirname(normalizedPath), "source-observation.json"), 150_000_000, signal)).equals(encode(acquired.evidence))
    && normalized.counts.selected === acquired.verification.source_record_count, "normalized source evidence linkage");
  const normalizedRaw = await read(normalizedPath, 100_000, signal), normalizedManifest = parse(normalizedRaw);
  check(hash(normalizedRaw) === normalized.manifest_sha256, "normalized manifest changed after verification");
  check(time(receipt.finished_at) && receipt.finished_at >= normalizedManifest.processed_at
    && normalizedManifest.processed_at >= acquired.evidence.observed_at && acquired.evidence.started_at >= start.started_at, "app job chronology");
  check(same(receipt, completion(start, startRaw, checkpointRaw, acqDescriptor, normDescriptor, receipt.finished_at)), "terminal claims or linkage");
  // Recheck the entire dependency set after all linkage reads; no unverified
  // reread is allowed to substitute a different source or normalized snapshot.
  const finalAcquired = await readOhChildcareAcquiredEvidence(acquired.verification.manifest_path, { signal });
  const finalNormalized = await verifyOhChildcareRelease(normalizedPath, { signal });
  check(same(acquisitionDescriptor(root, finalAcquired.verification), acqDescriptor)
    && same(normalizedDescriptor(root, finalNormalized), normDescriptor), "dependency snapshot changed during app verification");
  check(same((await readdir(directory)).sort(), ["acquisition-receipt.json", receiptName, "start.json"].sort()), "job artifact roster");
  for (const [name, expected, maximum] of [["start.json", startRaw, 10_000], ["acquisition-receipt.json", checkpointRaw, 10_000], [receiptName, raw, 20_000]]) {
    check((await read(path.join(directory, name), maximum, signal)).equals(expected), "job receipt changed during verification");
  }
  signal?.throwIfAborted();
  return { status: "SUCCEEDED", run_id: start.run_id, execution_mode: start.execution_mode, receipt_path: filename, receipt_sha256: hash(raw),
    acquisition: acqDescriptor, normalized: normDescriptor, nationalReportingIntegrated: false, public_export_authorized: false };
}

export async function verifyOhChildcareAppJob(receiptPath, options = {}) {
  return inspectJob(receiptPath, options);
}

async function runJob(options, mode) {
  const { signal, outputRoot = path.join(APP_ROOT, "data/business-sources/oh-dcy-publisher-open-childcare-centers/app"), now = () => new Date(), logger = () => {} } = options;
  check(typeof now === "function" && typeof logger === "function" && typeof options.fetchImpl === "function" && (signal === undefined || signal instanceof AbortSignal), "runtime options");
  signal?.throwIfAborted(); await enrollment(signal); await outputLocation(outputRoot, signal);
  check(!path.relative(APP_ROOT, outputRoot).split(path.sep).some((part) => part.toLowerCase() === "jobs"), "output cannot nest in immutable app history");
  const industryRunId = options.industryRunId ?? null;
  check(industryRunId === null || typeof industryRunId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(industryRunId), "industry run identity");
  const root = await canonical(outputRoot, true, signal), jobs = await canonical(path.join(root, "jobs"), true, signal);
  const lockPath = path.join(root, ".app.lock"); await canonical(lockPath, false, signal);
  const lock = await open(lockPath, "wx"), runId = randomUUID(), identity = await lock.stat({ bigint: true });
  const lockBytes = encode({ run_id: runId, pid: process.pid }), directory = path.join(jobs, runId), identities = new Map(); let directoryIdentity, failure;
  async function own(filename, expected) {
    if (!expected) return false;
    try { await canonical(filename); const info = await lstat(filename, { bigint: true }); return info.ino === expected.ino && info.dev === expected.dev && (info.isDirectory() || info.nlink === 1n); } catch { return false; }
  }
  async function assertOwned() { check(await own(lockPath, identity) && (await read(lockPath, 1000)).equals(lockBytes) && await own(directory, directoryIdentity), "app job ownership changed; inspect retained evidence"); }
  async function store(name, value, cancellable = true) { await assertOwned(); await write(path.join(directory, name), encode(value), cancellable ? signal : undefined, (owned) => identities.set(name, owned)); }
  try {
    check(identity.nlink === 1n, "lock ownership"); await lock.writeFile(lockBytes); await lock.sync();
    await mkdir(directory); directoryIdentity = await lstat(directory, { bigint: true });
    const start = { schema_version: VERSION, run_id: runId, execution_mode: mode, started_at: now().toISOString(), enrollment_sha256: ENROLLMENT_HASH, industry_run_id: industryRunId };
    await store("start.json", start); await logger("job-started"); signal?.throwIfAborted(); await assertOwned();
    // The acquired evidence describes the dependency-injected transport engine;
    // this separate app receipt records whether its fixed native wrapper ran.
    const acquisition = await buildOhChildcareAcquiredReleaseWithTransport({ fetchImpl: options.fetchImpl, sleep: options.sleep, now, signal,
      outputRoot: path.join(root, "acquired"), logger: async (phase) => { await assertOwned(); await logger(phase); } });
    const checkpoint = { schema_version: VERSION, run_id: runId, acquisition: acquisitionDescriptor(root, acquisition) };
    // After acquisition commit, persist its recovery reference even if cancelled.
    await store("acquisition-receipt.json", checkpoint, false); await logger("acquisition-published"); signal?.throwIfAborted();
    const retained = await readOhChildcareAcquiredEvidence(acquisition.manifest_path, { signal });
    await logger("normalize"); signal?.throwIfAborted();
    const normalized = await buildOhChildcareRelease({ evidence: retained.evidence, outputRoot: path.join(root, "normalized"), signal, now });
    const verifiedNormalization = await verifyOhChildcareRelease(normalized.manifest_path, { signal });
    await logger("before-complete"); signal?.throwIfAborted(); await assertOwned();
    const receipt = completion(start, encode(start), encode(checkpoint), checkpoint.acquisition, normalizedDescriptor(root, verifiedNormalization), now().toISOString());
    const candidate = path.join(directory, ".receipt-candidate.json"), terminal = path.join(directory, "receipt.json");
    await store(".receipt-candidate.json", receipt);
    const verified = await inspectJob(candidate, { signal }, true, logger);
    await assertOwned();
    for (const [name, owned] of identities) check(await own(path.join(directory, name), owned), "job file ownership changed before completion");
    check(hash(await read(candidate, 20_000, signal)) === verified.receipt_sha256, "candidate changed before completion");
    await canonical(terminal);
    try { await lstat(terminal); throw new Error("Ohio app job rejected: existing terminal receipt."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    // Commit boundary: completion is already independently verified. Do not
    // honour cancellation after this atomic terminal publication.
    signal?.throwIfAborted(); await rename(candidate, terminal);
    return { ...verified, receipt_path: terminal };
  } catch (error) {
    failure = error;
    const candidate = path.join(directory, ".receipt-candidate.json");
    if (await own(directory, directoryIdentity) && await own(candidate, identities.get(".receipt-candidate.json"))) await unlink(candidate);
    try { await store("receipt.json", { schema_version: VERSION, run_id: runId, status: signal?.aborted ? "CANCELLED" : "FAILED",
      execution_mode: mode, reason: "Inspect retained job and release evidence. Do not automatically reacquire; use verified retained acquisition when available." }, false); } catch { /* Never overwrite an existing or foreign receipt. */ }
    throw error;
  } finally {
    await lock.close();
    const ownsLock = await own(lockPath, identity) && (await read(lockPath, 1000).catch(() => Buffer.alloc(0))).equals(lockBytes);
    if (ownsLock) await unlink(lockPath);
    if (!ownsLock && !failure) throw new Error("Ohio app job ownership changed; inspect retained evidence before another run.");
  }
}

export async function runOhChildcareAppJob(options = {}) {
  optionsOnly(options, ["outputRoot", "signal", "industryRunId"]);
  return runJob({ ...options, fetchImpl: globalThis.fetch }, "fixed-native-fetch");
}
/** Trusted synthetic seam; cannot label its output as native execution. */
export async function runOhChildcareAppJobWithTransport(options = {}) {
  optionsOnly(options, ["outputRoot", "signal", "industryRunId", "fetchImpl", "sleep", "now", "logger"]);
  return runJob(options, "injected-test-transport");
}
