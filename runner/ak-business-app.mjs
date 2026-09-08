import { createHash, randomUUID } from "node:crypto";
import { lstat, realpath, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { buildAkActiveBusinessLicenses, verifyAkActiveBusinessLicenses } from "./ak-active-business-licenses.mjs";

// Parsed JSON serialization pins are line-ending portable; source/start hashes bind raw bytes.
export const AK_APP_CONTRACT_SHA256 = "ce5b8e425cb17d2362709ee40446fa9d943704a6d2d762cf10007df9379f96ed";
const POLICY = "e5444e478e878f49c1f71f12dfefdfc1ed873e7af0b48a692108d488f2b50d38";
const VERSION = "ak-business-app@1.0.0";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = () => Object.assign(new Error("Alaska app evidence or execution rejected."), { code: "AK_APP_JOB" });
const check = (value) => { if (!value) throw fail(); };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => Buffer.from(JSON.stringify(value) + "\n");
const parse = (bytes) => JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
const rel = (filename) => path.relative(APP_ROOT, filename).replaceAll("\\", "/");
const time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function exact(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...keys].sort()); }
function optionsOnly(value, keys) { check(value && typeof value === "object" && !Array.isArray(value) && Reflect.ownKeys(value).every((key) => keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"))); }

async function canonical(value, create = false, signal) {
  check(typeof value === "string" && value.length > 0 && value.length < 2048);
  const target = path.resolve(APP_ROOT, value), relative = path.relative(APP_ROOT, target);
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  check(path.relative(APP_ROOT, await realpath(APP_ROOT)) === "");
  let current = APP_ROOT;
  for (const part of relative.split(path.sep)) {
    signal?.throwIfAborted(); current = path.join(current, part);
    let info;
    try { info = await lstat(current, { bigint: true }); }
    catch (error) {
      if (!create || error.code !== "ENOENT") throw error;
      await mkdir(current); info = await lstat(current, { bigint: true });
    }
    check(!info.isSymbolicLink() && path.relative(current, await realpath(current)) === "");
    if (current !== target || create) check(info.isDirectory());
    if (info.isFile()) check(info.nlink === 1n);
  }
  return target;
}
async function read(filename, maximum, signal) {
  await canonical(filename, false, signal);
  const named = await lstat(filename, { bigint: true });
  check(named.isFile() && named.nlink === 1n && named.size <= BigInt(maximum));
  const handle = await open(filename, "r");
  try {
    const info = await handle.stat({ bigint: true }); check(info.ino === named.ino && info.dev === named.dev && info.size === named.size);
    const chunks = []; let bytes = 0;
    for (;;) {
      signal?.throwIfAborted(); const buffer = Buffer.alloc(Math.min(65536, maximum + 1 - bytes));
      const { bytesRead } = await handle.read(buffer); if (!bytesRead) break;
      bytes += bytesRead; check(bytes <= maximum); chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true }), final = await lstat(filename, { bigint: true });
    check(after.size === info.size && after.mtimeNs === info.mtimeNs && after.ctimeNs === info.ctimeNs && final.ino === info.ino && final.dev === info.dev && final.nlink === 1n && !final.isSymbolicLink());
    return Buffer.concat(chunks, bytes);
  } finally { await handle.close(); }
}
async function absent(filename) { try { await lstat(filename); } catch (error) { if (error.code === "ENOENT") return; throw error; } throw fail(); }
async function write(filename, value) {
  await canonical(path.dirname(filename)); await absent(filename);
  const temporary = `${filename}.tmp-${randomUUID()}`;
  const handle = await open(temporary, "wx"); let identity;
  try { identity = await handle.stat({ bigint: true }); await handle.writeFile(encode(value)); await handle.sync(); }
  finally { await handle.close(); }
  const actual = await lstat(temporary, { bigint: true });
  check(actual.ino === identity.ino && actual.dev === identity.dev && actual.nlink === 1n && !actual.isSymbolicLink());
  await absent(filename); await rename(temporary, filename);
}
async function configuration(signal) {
  check(sha(JSON.stringify(parse(await read(path.join(APP_ROOT, "config/connectors/ak-active-business-licenses-app.json"), 100000, signal)))) === AK_APP_CONTRACT_SHA256);
  check(sha(JSON.stringify(parse(await read(path.join(APP_ROOT, "config/source-policies/ak-active-business-licenses.json"), 100000, signal)))) === POLICY);
}
async function sourceDescriptor(filename, signal) {
  filename = await canonical(filename, false, signal);
  check(path.basename(filename) === "manifest.json" && path.basename(path.dirname(path.dirname(filename))) === "releases" && !rel(filename).split("/").includes(".staging"));
  const raw = await read(filename, 2000000, signal), manifest = parse(raw);
  check(/^ak-active-business-licenses-[0-9TZ-]+-[0-9a-f]{8}$/.test(manifest.release_id) && path.basename(path.dirname(filename)) === manifest.release_id && time(manifest.retrieved_at));
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length <= 64);
  let total = 0; const paths = new Set();
  for (const artifact of manifest.artifacts) {
    check(typeof artifact.path === "string" && !artifact.path.includes("\\") && !artifact.path.split("/").some((part) => !part || part === "." || part === "..") && !paths.has(artifact.path));
    paths.add(artifact.path);
    const file = path.resolve(path.dirname(filename), artifact.path); check(path.relative(path.dirname(filename), file) && !path.relative(path.dirname(filename), file).startsWith(".."));
    await canonical(file, false, signal); const info = await lstat(file, { bigint: true });
    check(info.isFile() && info.size <= 1_000_000_000n); total += Number(info.size); check(total <= 1_000_000_000);
  }
  const verified = await verifyAkActiveBusinessLicenses(filename, { signal });
  check(sha(await read(filename, 2000000, signal)) === sha(raw));
  return { manifest: rel(filename), manifest_sha256: sha(raw), release_id: verified.release_id, source_release_id: verified.source_release_id, observed_at: manifest.retrieved_at, counts: verified.coverage, record_level_distribution: "local-review-only", site_semantics: "license-based-provisional-sites-not-confirmed-operating-businesses" };
}
function createAkAppDeadline(signal) {
  check(signal === undefined || signal instanceof AbortSignal);
  const controller = new AbortController(), expires = performance.now() + 1_800_000;
  const expire = () => controller.abort(Object.assign(new Error("Alaska app execution deadline exceeded."), { code: "AK_APP_DEADLINE" }));
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(expire, 1_800_000);
  return { signal: controller.signal, check() { if (performance.now() >= expires) expire(); controller.signal.throwIfAborted(); }, dispose() { clearTimeout(timer); signal?.removeEventListener("abort", abort); } };
}
function terminal(start, startHash, source, finishedAt) {
  return { schema_version: VERSION, run_id: start.run_id, industry_run_id: start.industry_run_id, status: "SUCCEEDED", execution_mode: start.execution_mode, started_at: start.started_at, finished_at: finishedAt, start_sha256: startHash, contract_sha256: AK_APP_CONTRACT_SHA256, policy_sha256: POLICY, source, native_execution_independently_verified: false, national_reporting_integrated: false, public_export_authorized: false };
}
async function inspect(receiptPath, signal, candidate = false) {
  await configuration(signal);
  const filename = await canonical(receiptPath, false, signal), directory = path.dirname(filename);
  check(path.basename(filename) === (candidate ? ".candidate.json" : "receipt.json") && UUID.test(path.basename(directory)) && path.basename(path.dirname(directory)) === "jobs");
  const startPath = path.join(directory, "start.json"), startRaw = await read(startPath, 20000, signal), start = parse(startRaw);
  check(exact(start, ["schema_version", "run_id", "industry_run_id", "execution_mode", "started_at", "contract_sha256", "policy_sha256", "retained_manifest"]));
  check(start.schema_version === VERSION && start.run_id === path.basename(directory) && time(start.started_at) && start.contract_sha256 === AK_APP_CONTRACT_SHA256 && start.policy_sha256 === POLICY && (start.industry_run_id === null || /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(start.industry_run_id)));
  const raw = await read(filename, 100000, signal), receipt = parse(raw);
  check(time(receipt.finished_at) && receipt.finished_at >= start.started_at && typeof receipt.source?.manifest === "string");
  if (start.execution_mode === "retained-local-verification") check(start.retained_manifest === receipt.source.manifest);
  else { check(start.execution_mode === "fixed-native-fetch" && start.retained_manifest === null); check(receipt.source.manifest.startsWith(`${rel(directory)}/acquired/releases/`)); }
  const source = await sourceDescriptor(path.resolve(APP_ROOT, receipt.source.manifest), signal);
  if (start.execution_mode === "fixed-native-fetch") check(source.observed_at >= start.started_at && source.observed_at <= receipt.finished_at);
  check(isDeepStrictEqual(receipt, terminal(start, sha(startRaw), source, receipt.finished_at)));
  check((await read(startPath, 20000, signal)).equals(startRaw) && (await read(filename, 100000, signal)).equals(raw));
  return { receipt_path: filename, receipt_sha256: sha(raw), receipt };
}
export async function verifyAkBusinessAppJob(receiptPath, options = {}) {
  optionsOnly(options, ["signal"]);
  try { return await inspect(receiptPath, options.signal); }
  catch { if (options.signal?.aborted) throw options.signal.reason; throw fail(); }
}
export async function runAkBusinessAppJob(options = {}) {
  optionsOnly(options, ["outputRoot", "signal", "industryRunId", "retainedManifest"]);
  check(options.industryRunId === undefined || options.industryRunId === null || typeof options.industryRunId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(options.industryRunId));
  const deadline = createAkAppDeadline(options.signal);
  let lock, lockIdentity, lockPath, job, jobIdentity, start, source = null, receiptCommitted = false, primaryError = null;
  const ownedJob = async () => {
    await canonical(job);
    const info = await lstat(job, { bigint: true }), lockInfo = await lstat(lockPath, { bigint: true });
    check(info.ino === jobIdentity.ino && info.dev === jobIdentity.dev && lockInfo.ino === lockIdentity.ino && lockInfo.dev === lockIdentity.dev && lockInfo.nlink === 1n && !lockInfo.isSymbolicLink());
  };
  try {
    deadline.check(); await configuration(deadline.signal);
    check(typeof options.outputRoot === "string" && !path.relative(APP_ROOT, path.resolve(APP_ROOT, options.outputRoot)).split(path.sep).some((part) => ["releases", ".staging", "jobs"].includes(part)));
    for (let ancestor = path.resolve(APP_ROOT, options.outputRoot); ancestor !== APP_ROOT; ancestor = path.dirname(ancestor)) {
      check(path.relative(APP_ROOT, ancestor) && !path.relative(APP_ROOT, ancestor).startsWith(".."));
      await absent(path.join(ancestor, "manifest.json"));
    }
    const root = await canonical(options.outputRoot, true, deadline.signal);
    await absent(path.join(root, "manifest.json"));
    lockPath = path.join(root, ".app.lock"); lock = await open(lockPath, "wx"); lockIdentity = await lock.stat({ bigint: true });
    await canonical(path.join(root, "jobs"), true, deadline.signal);
    const id = randomUUID(); job = path.join(root, "jobs", id); await mkdir(job); jobIdentity = await lstat(job, { bigint: true });
    const retained = options.retainedManifest === undefined ? null : rel(await canonical(options.retainedManifest, false, deadline.signal));
    start = { schema_version: VERSION, run_id: id, industry_run_id: options.industryRunId ?? null, execution_mode: retained === null ? "fixed-native-fetch" : "retained-local-verification", started_at: new Date().toISOString(), contract_sha256: AK_APP_CONTRACT_SHA256, policy_sha256: POLICY, retained_manifest: retained };
    await write(path.join(job, "start.json"), start);
    if (retained !== null) source = await sourceDescriptor(path.resolve(APP_ROOT, retained), deadline.signal);
    else {
      const built = await buildAkActiveBusinessLicenses({ outputRoot: path.join(job, "acquired"), zbpPointer: path.join(APP_ROOT, "data/business-baselines/census-zbp/current.json"), signal: deadline.signal });
      source = await sourceDescriptor(path.join(built.releaseDirectory, "manifest.json"), deadline.signal);
    }
    deadline.check();
    const startRaw = await read(path.join(job, "start.json"), 20000, deadline.signal);
    check(isDeepStrictEqual(parse(startRaw), start));
    const receipt = terminal(start, sha(startRaw), source, new Date().toISOString());
    await ownedJob();
    await write(path.join(job, ".candidate.json"), receipt);
    await inspect(path.join(job, ".candidate.json"), deadline.signal, true); deadline.check();
    await ownedJob();
    await absent(path.join(job, "receipt.json"));
    await rename(path.join(job, ".candidate.json"), path.join(job, "receipt.json")); receiptCommitted = true;
    return { receiptPath: path.join(job, "receipt.json"), receipt };
  } catch (failure) {
    primaryError = failure;
    if (job && start && !receiptCommitted) {
      try { await ownedJob(); await write(path.join(job, "receipt.json"), { schema_version: VERSION, run_id: start.run_id, execution_mode: start.execution_mode, start_sha256: sha(encode(start)), contract_sha256: AK_APP_CONTRACT_SHA256, policy_sha256: POLICY, status: failure.code === "AK_PUBLICATION_INCOMPLETE" ? "FAILED" : deadline.signal.aborted ? "CANCELLED" : "FAILED", finished_at: new Date().toISOString(), error_code: failure.code === "AK_PUBLICATION_INCOMPLETE" ? "AK_PUBLICATION_INCOMPLETE" : "AK_APP_JOB", output_state: "inspection-required", source }); } catch { /* Preserve original failure; start and candidate remain diagnostic evidence. */ }
    }
    if (deadline.signal.aborted && failure.code !== "AK_PUBLICATION_INCOMPLETE") throw deadline.signal.reason;
    if (failure.code === "AK_PUBLICATION_INCOMPLETE") throw Object.assign(fail(), { code: "AK_PUBLICATION_INCOMPLETE", phase: ["release-rename", "pointer-write", "pointer-rename", "post-publication"].includes(failure.phase) ? failure.phase : "post-publication", releaseId: /^ak-active-business-licenses-[0-9TZ-]+-[0-9a-f]{8}$/.test(failure.releaseId) ? failure.releaseId : null });
    throw fail();
  } finally {
    deadline.dispose();
    if (lock) {
      try {
        await lock.close();
        await canonical(path.dirname(lockPath));
        const named = await lstat(lockPath, { bigint: true }).catch(() => null);
        check(named?.ino === lockIdentity.ino && named?.dev === lockIdentity.dev && named?.nlink === 1n && !named.isSymbolicLink());
        await rm(lockPath);
      } catch { if (!primaryError) throw Object.assign(fail(), { code: "AK_PUBLICATION_INCOMPLETE", phase: "post-publication", releaseId: source?.release_id ?? null }); }
    }
  }
}
