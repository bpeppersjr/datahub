import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, rename, rmdir, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual as same } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { acquireOhChildcareWithTransport } from "./oh-childcare-transport.mjs";
import { bindOhChildcareSourceUse, assertOhChildcareSourceUseConfiguration } from "./oh-childcare-source-use.mjs";
import { replayOhChildcareAcquisition } from "./oh-childcare-acquisition.mjs";
import { ohioCanonicalPath as canonical, ohioBoundedRead as read, ohioOutputLocation as outputLocation, ohioDurableWrite as write } from "./oh-childcare-release.mjs";

const DATASET = "oh-dcy-publisher-open-childcare-centers";
const VERSION = "oh-childcare-acquired-release@1.0.0";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const bytes = (v) => Buffer.from(`${JSON.stringify(v)}\n`);
const check = (v, message) => { if (!v) throw new Error(`Ohio acquired release rejected: ${message}.`); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && same(Object.keys(v).sort(), [...keys].sort());
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function optionsOnly(options, keys) { check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((k) => keys.includes(k)), "unsupported options"); }
function parse(raw) { try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { throw new Error("Ohio acquired release rejected: invalid bounded JSON."); } }
const journalName = (i) => `observation-${String(i).padStart(4, "0")}.json`;
function validatePackage(value, preflight) {
  check(exact(value, ["preflight", "availability", "binding"]) && same(value.preflight, preflight), "source-use preflight linkage");
  check(same(value.binding, bindOhChildcareSourceUse(preflight, value.availability, { checkedAt: value.binding?.checked_at })), "source-use binding replay");
  check(value.availability[0].observed_at >= preflight.finished_at, "notice chronology");
}
function derive(prerequisite, ready, result, journal, runId) {
  check(exact(result, ["evidence", "source_use_evidence", "transport"]), "result envelope");
  const acquired = replayOhChildcareAcquisition(result.evidence);
  check(exact(result.source_use_evidence, ["before", "after"]), "paired source-use evidence");
  validatePackage(prerequisite, result.evidence.preflight_before);
  check(same(prerequisite, result.source_use_evidence.before), "retained before-row prerequisite substitution");
  validatePackage(result.source_use_evidence.after, result.evidence.preflight_after);
  check(exact(ready, ["schema_version", "run_id", "prerequisite_sha256", "retained_at"])
    && ready.schema_version === VERSION && ready.run_id === runId && ready.prerequisite_sha256 === hash(bytes(prerequisite))
    && time(ready.retained_at) && ready.retained_at >= prerequisite.binding.checked_at, "retention checkpoint");
  // Replay at recorded times, never at today's clock: old verified evidence remains reusable.
  bindOhChildcareSourceUse(prerequisite.preflight, prerequisite.availability, { checkedAt: ready.retained_at });
  const observations = result.evidence.observations;
  check(journal.length === observations.length, "journal count");
  let prior = ready.retained_at;
  for (const [index, entry] of journal.entries()) {
    check(exact(entry, ["sequence", "observation", "retained_at"]) && entry.sequence === index
      && same(entry.observation, observations[index]) && time(entry.retained_at)
      && entry.observation.observed_at >= prior && entry.retained_at >= entry.observation.observed_at, "journal sequence, content or chronology");
    bindOhChildcareSourceUse(prerequisite.preflight, prerequisite.availability, { checkedAt: entry.observation.observed_at });
    prior = entry.retained_at;
  }
  check(result.evidence.preflight_after.started_at >= prior
    && result.evidence.observed_at >= result.source_use_evidence.after.binding.checked_at, "completion chronology");
  const meter = result.transport;
  check(exact(meter, ["requests", "consumed_body_bytes", "maximum_body_bytes", "mode", "source_authenticity_verified", "accounting"])
    && meter.mode === "injected-transport" && meter.source_authenticity_verified === false
    && meter.accounting === "decoded-consumed-body-bytes-including-preflights-and-failed-attempts-not-wire-bytes"
    && Number.isSafeInteger(meter.requests) && meter.requests >= 28 + observations.length && meter.requests <= 3 * (28 + observations.length)
    && Number.isSafeInteger(meter.maximum_body_bytes) && meter.maximum_body_bytes >= 1024 && meter.maximum_body_bytes <= 100_000_000
    && Number.isSafeInteger(meter.consumed_body_bytes) && meter.consumed_body_bytes >= acquired.source.reported_successful_response_bytes
    && meter.consumed_body_bytes <= meter.maximum_body_bytes, "reported transport accounting");
  return acquired;
}
function manifestFor(runId, acquired, result, artifacts) {
  return { schema_version: VERSION, dataset_id: DATASET, run_id: runId, release_id: `oh-acquisition-${runId}`,
    status: "verified-retained-acquisition-evidence", execution_mode: "injected-transport",
    observed_at: result.evidence.observed_at, source_record_count: acquired.features.length,
    policy_sha256: result.source_use_evidence.before.binding.policy_sha256,
    decision_sha256: result.source_use_evidence.before.binding.decision_sha256,
    source_use_authorized: true, native_acquisition_verified: false, transport_accounting_independently_verified: false,
    source_authenticity_verified: false, export_authorized: false, nationalReportingIntegrated: false,
    limitations: "Internal retained evidence, not native execution proof, legal approval, verified business activity or automatic restart eligibility. Historical prerequisite replay does not authorize a new acquisition.", artifacts };
}
const descriptor = (name, raw) => ({ path: name, bytes: raw.length, sha256: hash(raw), export_policy: "internal" });

async function inspectOhChildcareAcquiredRelease(manifestPath, options = {}) {
  optionsOnly(options, ["signal"]); const { signal } = options; signal?.throwIfAborted();
  const filename = await canonical(manifestPath, false, signal), directory = path.dirname(filename);
  check(path.basename(filename) === "manifest.json", "immutable manifest required");
  const raw = await read(filename, 250_000, signal), manifest = parse(raw), runId = manifest.run_id;
  check(UUID.test(runId), "run identity");
  const parent = path.basename(path.dirname(directory));
  check(parent === ".staging" && path.basename(directory) === runId || parent === "releases" && path.basename(directory) === `oh-acquisition-${runId}`, "directory identity");
  const retained = new Map();
  async function artifact(name, maximum) { const value = await read(path.join(directory, name), maximum, signal); retained.set(name, value); return parse(value); }
  const prerequisite = await artifact("prerequisite.json", 2_000_000), ready = await artifact("ready.json", 10_000);
  const result = await artifact("acquisition.json", 150_000_000);
  check(ready.prerequisite_sha256 === hash(retained.get("prerequisite.json")), "retention checkpoint file hash");
  // Validate membership and source response ceilings before trusting any journal
  // count. Then bound each file by its exact expected canonical envelope size.
  replayOhChildcareAcquisition(result.evidence, { signal });
  check(Array.isArray(result.evidence?.observations) && result.evidence.observations.length <= 502, "bounded journal roster");
  const journal = []; let journalBytes = 0;
  for (const [i, observation] of result.evidence.observations.entries()) {
    const maximum = bytes({ sequence: i, observation, retained_at: "2026-09-08T00:00:00.000Z" }).length;
    journalBytes += maximum; check(journalBytes <= 101_000_000, "cumulative journal byte ceiling");
    const entry = await artifact(journalName(i), maximum);
    check(bytes(entry).equals(retained.get(journalName(i))) && same(entry.observation, observation), "canonical journal content");
    journal.push(entry);
  }
  const expectedRoster = [...retained.keys(), "manifest.json"].sort();
  check(same((await readdir(directory)).sort(), expectedRoster), "exact artifact roster");
  const acquired = derive(prerequisite, ready, result, journal, runId);
  const artifacts = [...retained].map(([name, value]) => descriptor(name, value));
  check(same(manifest, manifestFor(runId, acquired, result, artifacts)), "manifest claims, counts or hashes");
  for (const [name, value] of retained) check((await read(path.join(directory, name), value.length, signal)).equals(value), "artifact changed during verification");
  check((await read(filename, 250_000, signal)).equals(raw) && same((await readdir(directory)).sort(), expectedRoster), "manifest or roster changed during verification");
  signal?.throwIfAborted();
  return { evidence: acquired.evidence, verification: { status: "verified", storage_state: parent === ".staging" ? "staged-not-published" : "immutable-release",
    run_id: runId, manifest_path: filename, manifest_sha256: hash(raw), source_record_count: acquired.features.length,
    execution_mode: manifest.execution_mode, source_authenticity_verified: false, export_authorized: false, nationalReportingIntegrated: false } };
}

export async function verifyOhChildcareAcquiredRelease(manifestPath, options = {}) {
  return (await inspectOhChildcareAcquiredRelease(manifestPath, options)).verification;
}

/** Returns the verified in-memory snapshot, never a fresh unverified path read. */
export async function readOhChildcareAcquiredEvidence(manifestPath, options = {}) {
  const result = await inspectOhChildcareAcquiredRelease(manifestPath, options);
  check(result.verification.storage_state === "immutable-release", "published acquisition required for reuse");
  return result;
}

/** Trusted offline test seam. No default network; native app enrollment is separate. */
export async function buildOhChildcareAcquiredReleaseWithTransport(options = {}) {
  optionsOnly(options, ["fetchImpl", "sleep", "now", "signal", "outputRoot", "logger", "timeoutMs", "maximumBytes"]);
  const { signal, now = () => new Date(), logger = () => {}, outputRoot = path.join(APP_ROOT, "data/business-sources", DATASET, "acquired") } = options;
  check(typeof options.fetchImpl === "function" && typeof now === "function" && typeof logger === "function" && (signal === undefined || signal instanceof AbortSignal), "injected transport, clock, logger or signal");
  signal?.throwIfAborted(); assertOhChildcareSourceUseConfiguration();
  await outputLocation(outputRoot, signal);
  const root = await canonical(outputRoot, true, signal), free = await statfs(root, { bigint: true });
  check(free.bavail * free.bsize >= 400_000_000n, "400 MB free disk prerequisite");
  const stagingRoot = await canonical(path.join(root, ".staging"), true, signal), releasesRoot = await canonical(path.join(root, "releases"), true, signal);
  const lockPath = path.join(root, ".acquire.lock"); await canonical(lockPath, false, signal);
  const lock = await open(lockPath, "wx"), lockIdentity = await lock.stat({ bigint: true }), runId = randomUUID();
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, `oh-acquisition-${runId}`), ownedFiles = new Map();
  let stagingIdentity, committed = false, failure, prerequisite, ready; const journal = [];
  async function owned(filename, identity) {
    if (!identity) return false;
    try { await canonical(filename); const named = await lstat(filename, { bigint: true }); return named.ino === identity.ino && named.dev === identity.dev && (named.isDirectory() || named.nlink === 1n); } catch { return false; }
  }
  const inspection = () => Object.assign(new Error("Ohio acquisition ownership changed; inspection required. Prior evidence preserved."), { code: "OH_CHILDCARE_INSPECTION_REQUIRED" });
  const lockBytes = bytes({ run_id: runId, pid: process.pid });
  async function ownLock() { return await owned(lockPath, lockIdentity) && (await read(lockPath, 1000)).equals(lockBytes); }
  async function stage(name, value, maximum) {
    check(await owned(staging, stagingIdentity) && await ownLock(), "staging or lock ownership");
    const raw = bytes(value); check(raw.length <= maximum, "artifact byte ceiling");
    await write(path.join(staging, name), raw, signal, (identity) => ownedFiles.set(name, identity));
  }
  try {
    check(lockIdentity.nlink === 1n, "lock ownership"); await lock.writeFile(lockBytes); await lock.sync();
    await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    await logger("preflight"); signal?.throwIfAborted();
    const acquired = await acquireOhChildcareWithTransport({ fetchImpl: options.fetchImpl, sleep: options.sleep, now, signal,
      timeoutMs: options.timeoutMs, maximumBytes: options.maximumBytes, sourceUseRequired: true,
      onSourceUseBound: async (value) => {
        prerequisite = value; await stage("prerequisite.json", value, 2_000_000);
        ready = { schema_version: VERSION, run_id: runId, prerequisite_sha256: hash(bytes(value)), retained_at: now().toISOString() };
        check(ready.retained_at >= value.binding.checked_at, "retention clock reversal");
        await stage("ready.json", ready, 10_000); await logger("prerequisites-retained"); signal?.throwIfAborted();
        check((await read(path.join(staging, "prerequisite.json"), 2_000_000, signal)).equals(bytes(value))
          && (await read(path.join(staging, "ready.json"), 10_000, signal)).equals(bytes(ready)), "prerequisite changed before records");
        check(await owned(staging, stagingIdentity) && await ownLock(), "ownership changed before records");
      },
      onObservation: async (observation) => {
        const entry = { sequence: journal.length, observation, retained_at: now().toISOString() };
        check(time(entry.retained_at) && entry.retained_at >= observation.observed_at, "journal retention clock");
        await stage(journalName(entry.sequence), entry, 9_000_000); journal.push(entry);
        await logger("observation-retained");
      },
    });
    const result = { evidence: acquired.evidence, source_use_evidence: acquired.source_use_evidence, transport: acquired.transport };
    await stage("acquisition.json", result, 150_000_000);
    const replayed = derive(prerequisite, ready, result, journal, runId);
    const artifacts = [descriptor("prerequisite.json", bytes(prerequisite)), descriptor("ready.json", bytes(ready)), descriptor("acquisition.json", bytes(result)),
      ...journal.map((entry, i) => descriptor(journalName(i), bytes(entry)))];
    await stage("manifest.json", manifestFor(runId, replayed, result, artifacts), 250_000);
    await logger("verify"); await verifyOhChildcareAcquiredRelease(path.join(staging, "manifest.json"), { signal });
    await logger("before-commit"); signal?.throwIfAborted();
    const verification = await verifyOhChildcareAcquiredRelease(path.join(staging, "manifest.json"), { signal });
    for (const [name, identity] of ownedFiles) if (!await owned(path.join(staging, name), identity)) throw inspection();
    if (!await owned(staging, stagingIdentity) || !await ownLock()) throw inspection();
    await canonical(releasesRoot); await canonical(release);
    try { await lstat(release); throw inspection(); } catch (error) { if (error.code !== "ENOENT") throw error; }
    signal?.throwIfAborted(); await rename(staging, release); committed = true;
    // No mutable pointer: the caller persists this immutable manifest in its job receipt.
    return { ...verification, storage_state: "immutable-release", manifest_path: path.join(release, "manifest.json") };
  } catch (error) {
    failure = error;
    if (signal?.aborted && !committed && await owned(staging, stagingIdentity)) {
      for (const [name, identity] of ownedFiles) if (await owned(path.join(staging, name), identity)) await unlink(path.join(staging, name));
      if ((await readdir(staging)).length === 0 && await owned(staging, stagingIdentity)) await rmdir(staging);
    }
    throw error;
  } finally {
    await lock.close(); const lockOwned = await ownLock().catch(() => false);
    if (lockOwned) await unlink(lockPath);
    if (!lockOwned && !failure) throw inspection();
  }
}
