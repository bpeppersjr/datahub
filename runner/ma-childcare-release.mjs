import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, readFile, open, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { acquireMaChildcare, MA_CHILDCARE_BATCH_SIZE } from "./ma-childcare-acquisition.mjs";
import { normalizeMaChildcareFeature, MA_CHILDCARE_TRANSFORMATION } from "./ma-childcare-normalization.mjs";
import { MA_CHILDCARE_LAYER, MA_CHILDCARE_ITEM, MA_CHILDCARE_SCHEMA } from "./ma-childcare-preflight.mjs";

const DATASET = "ma-licensed-center-based-childcare";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
const policy = { profile: "massgis-eec-childcare-local-review@1.0.0", export: "local-review-only",
  owner: "Commonwealth of Massachusetts MassGIS/EEC", terms_url: "https://www.mass.gov/info-details/about-massgis",
  allowed_use: "local governed business-source review", redistribution: "not-authorized-by-this-release",
  retention: "immutable local source evidence; operator-governed deletion", private_fields: "PHONE excluded",
  attribution: "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS; Massachusetts Department of Early Education and Care (EEC)" };
const files = [["selected-features.jsonl", "internal"], ["normalized.jsonl", "local-review-only"], ["quarantine.jsonl", "internal"], ["source-observation.json", "internal"]];
function requireValue(ok, label) { if (!ok) throw new Error(`Massachusetts childcare release rejected: ${label}.`); }
async function canonical(target, create = false) {
  const absolute = path.resolve(target); assertInsideApp(absolute);
  requireValue(absolute !== path.resolve(APP_ROOT), "workspace root is not an output");
  let ancestor = absolute;
  while (true) {
    try { requireValue(path.resolve(await realpath(ancestor)) === ancestor, "path alias"); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
  }
  if (create) await mkdir(absolute, { recursive: true });
  if (create) requireValue(path.resolve(await realpath(absolute)) === absolute, "path alias");
  return absolute;
}
function utc(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function validateSource(source, features, batchSize) {
  const keys = ["layer_url", "item_id", "schema_sha256", "editing", "max_record_count", "native_wkid", "output_wkid", "record_count", "object_ids_sha256", "selected_fields", "started_at", "observed_at", "observations", "consistency"];
  requireValue(source && json(Object.keys(source).sort()) === json(keys.sort()), "source evidence fields");
  requireValue(source.layer_url === MA_CHILDCARE_LAYER && source.item_id === MA_CHILDCARE_ITEM && source.native_wkid === 26986 && source.output_wkid === 4326, "source identity/CRS");
  requireValue(hex.test(source.schema_sha256) && Number.isSafeInteger(source.max_record_count) && source.max_record_count > 0, "source schema");
  requireValue(json(Object.keys(source.editing ?? {}).sort()) === json(["lastEditDate", "schemaLastEditDate", "dataLastEditDate"].sort()) && Object.values(source.editing).every((v) => Number.isSafeInteger(v) && v > 0 && Number.isFinite(new Date(v).getTime())), "edit evidence");
  requireValue(json(source.selected_fields) === json(MA_CHILDCARE_SCHEMA.map(([name]) => name)), "selected fields");
  requireValue(features.length > 0 && features.length <= 20000 && source.record_count === features.length, "source count");
  const ids = features.map((f) => f?.attributes?.OBJECTID);
  requireValue(ids.every((id, i) => Number.isSafeInteger(id) && id > 0 && (!i || id > ids[i - 1])) && source.object_ids_sha256 === sha(json(ids)), "source IDs");
  requireValue(utc(source.started_at) && utc(source.observed_at) && source.started_at <= source.observed_at, "observation interval");
  requireValue(source.consistency === "metadata-count-id-inventory-stable-not-transactional-snapshot", "consistency claim");
  const kinds = ["metadata", "count", "inventory", ...Array(Math.ceil(features.length / Math.min(batchSize, source.max_record_count))).fill("features"), "inventory", "count", "metadata"];
  requireValue(Array.isArray(source.observations) && source.observations.length === kinds.length, "observation count");
  let previous = source.started_at;
  source.observations.forEach((o, i) => {
    requireValue(json(Object.keys(o).sort()) === json(["kind", "observed_at", "payload_sha256"]) && o.kind === kinds[i] && hex.test(o.payload_sha256) && utc(o.observed_at) && o.observed_at >= previous && o.observed_at <= source.observed_at, "observation evidence");
    previous = o.observed_at;
  });
}
async function derive(features, source, runId, signal, batchSize = MA_CHILDCARE_BATCH_SIZE) {
  validateSource(source, features, batchSize);
  const { observations } = source;
  const stableSource = Object.fromEntries(Object.entries(source).filter(([key]) => !["started_at", "observed_at", "observations"].includes(key)));
  const featureHashes = [];
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    featureHashes.push(sha(json(feature)));
  }
  const sourceReleaseId = `ma-childcare-${sha(json({ source: stableSource, payloads: observations.map((o) => ({ kind: o.kind, payload_sha256: o.payload_sha256 })), features: featureHashes }))}`;
  const normalized = [], quarantine = [];
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    // Scope/privacy violations are whole-source failures, even if another field is invalid first.
    requireValue(feature?.attributes?.PROG_TYPE === "Center-based Care" && feature.attributes.LICENSED_FUNDED === "Licensed", "source scope drift");
    requireValue(json(Object.keys(feature.attributes).sort()) === json(MA_CHILDCARE_SCHEMA.map(([n]) => n).sort()) && Object.keys(feature).every((k) => ["attributes", "geometry"].includes(k)), "private/selected field drift");
    requireValue(!feature.geometry || (Object.keys(feature.geometry).every((key) => ["x", "y", "spatialReference"].includes(key))
      && (!feature.geometry.spatialReference || Object.keys(feature.geometry.spatialReference).every((key) => ["wkid", "latestWkid"].includes(key)))), "private geometry field drift");
    try { normalized.push(normalizeMaChildcareFeature(feature, { runId, sourceReleaseId, observedAt: source.observed_at, outputWkid: 4326 })); }
    catch (error) {
      if (error.code !== "MA_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: feature.attributes.OBJECTID, input_feature_sha256: sha(json(feature)), reason: error.reason });
    }
  }
  requireValue(normalized.length > 0 && quarantine.length / features.length <= 0.05, "quarantine gate exceeds 5% or no accepted records");
  return { sourceReleaseId, normalized, quarantine, counts: { selected: features.length, accepted: normalized.length, quarantined: quarantine.length } };
}
function manifestFor(runId, source, result, artifacts, connectorVersion = "1.0.1") {
  return { schema_version: "1.0.0", dataset_id: DATASET, connector_id: DATASET, connector_version: connectorVersion, transformation_version: MA_CHILDCARE_TRANSFORMATION,
    run_id: runId, release_id: `ma-childcare-${runId}`, source_release_id: result.sourceReleaseId, status: "complete", observed_at: source.observed_at,
    source_url: MA_CHILDCARE_LAYER, policy, counts: result.counts, quarantine_max_fraction: 0.05,
    scope: "MassGIS/EEC licensed center-based childcare source records, Massachusetts",
    claims: { active_business_verified: false, unique_business_identity_verified: false, national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false },
    evidence_limit: "Parsed response digests are acquisition observations, not independently retained full response payloads; metadata/count/inventory stability is not transactional snapshot isolation.", artifacts };
}
async function contents(features, source, result, signal) {
  const values = [];
  for (const rows of [features, result.normalized, result.quarantine]) {
    const lines = [];
    for (const [index, row] of rows.entries()) {
      if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } lines.push(`${json(row)}\n`);
    }
    values.push(lines.join(""));
  }
  return [...values, `${json(source)}\n`];
}
function descriptors(values, result) {
  return files.map(([filename, exportPolicy], i) => ({ path: filename, sha256: sha(values[i]), bytes: Buffer.byteLength(values[i]), records: [result.counts.selected, result.counts.accepted, result.counts.quarantined, 1][i], export_policy: exportPolicy }));
}
async function boundedRead(filename, maximum, signal) {
  await canonical(filename); const info = await lstat(filename, { bigint: true });
  requireValue(info.isFile() && info.size <= maximum, "artifact type/size"); return readFile(filename, { encoding: "utf8", signal });
}
async function durableWrite(filename, value, signal) {
  signal?.throwIfAborted(); const handle = await open(filename, "wx");
  try { await handle.writeFile(value, { signal }); signal?.throwIfAborted(); await handle.sync(); }
  finally { await handle.close(); }
}
export async function verifyMaChildcareRelease(manifestPath, { signal } = {}) {
  signal?.throwIfAborted(); const resolved = await canonical(manifestPath);
  requireValue(path.basename(resolved) === "manifest.json", "manifest filename");
  const directory = path.dirname(resolved), rawManifest = await boundedRead(resolved, 100000, signal), manifest = JSON.parse(rawManifest);
  requireValue(uuid.test(manifest.run_id) && manifest.release_id === `ma-childcare-${manifest.run_id}`, "run/release identity");
  requireValue(["1.0.0", "1.0.1"].includes(manifest.connector_version), "connector version");
  const parent = path.basename(path.dirname(directory));
  requireValue((parent === ".staging" && path.basename(directory) === manifest.run_id) || (parent === "releases" && path.basename(directory) === manifest.release_id), "manifest directory identity");
  requireValue(json((await readdir(directory)).sort()) === json([...files.map(([f]) => f), "manifest.json"].sort()), "missing/extra artifacts");
  const values = [];
  for (const [filename] of files) { signal?.throwIfAborted(); values.push(await boundedRead(path.join(directory, filename), 100_000_000, signal)); }
  const parseLines = async (text) => {
    requireValue(text === "" || text.endsWith("\n"), "JSONL termination"); const rows = [];
    for (const [index, line] of (text ? text.slice(0, -1).split("\n") : []).entries()) {
      if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } rows.push(JSON.parse(line));
    } return rows;
  };
  const features = await parseLines(values[0]), source = JSON.parse(values[3]), result = await derive(features, source, manifest.run_id, signal, manifest.connector_version === "1.0.0" ? 500 : MA_CHILDCARE_BATCH_SIZE);
  const reproduced = await contents(features, source, result, signal);
  requireValue(values.every((value, index) => value === reproduced[index]), "normalized/quarantine/source bytes differ from reproduction");
  const expected = manifestFor(manifest.run_id, source, result, descriptors(values, result), manifest.connector_version);
  requireValue(json(manifest) === json(expected), "manifest identity, counts, policy or artifact integrity");
  signal?.throwIfAborted();
  return { status: "verified", release_id: manifest.release_id, manifest_path: resolved, manifest_sha256: sha(rawManifest), counts: result.counts, artifact_count: 4 };
}
export async function buildMaChildcareRelease(options = {}) {
  requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["outputRoot", "fetchImpl", "signal", "sleep", "timeoutMs", "now", "logger"].includes(key)), "unsupported options");
  const { outputRoot = path.join(APP_ROOT, "data/business-sources", DATASET), logger = () => {}, ...transport } = options;
  delete transport.logger;
  requireValue(typeof logger === "function", "logger"); const { signal } = transport; signal?.throwIfAborted();
  const root = await canonical(outputRoot, true), stagingRoot = await canonical(path.join(root, ".staging"), true), releasesRoot = await canonical(path.join(root, "releases"), true);
  // Windows file identities can exceed Number's exact integer range.
  const lockPath = path.join(root, ".publish.lock"), lock = await open(lockPath, "wx"), runId = randomUUID(), lockIdentity = await lock.stat({ bigint: true });
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, `ma-childcare-${runId}`), pointerTemp = path.join(root, `.current-${runId}.tmp`);
  let committed = false, stagingIdentity, pointerIdentity, reportedFailure;
  async function owned(filename, identity) {
    if (!identity) return false;
    try { await canonical(filename); const current = await lstat(filename, { bigint: true }); return !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino; }
    catch { return false; }
  }
  async function ownLock() {
    if (!await owned(lockPath, lockIdentity)) return false;
    try { const owner = JSON.parse(await readFile(lockPath, "utf8")); return owner.run_id === runId && owner.pid === process.pid; }
    catch { return false; }
  }
  function inspection(errors) {
    return Object.assign(new AggregateError(errors, "Massachusetts childcare ownership changed; inspection required. Foreign paths were preserved."), { code: "MA_CHILDCARE_INSPECTION_REQUIRED" });
  }
  try {
    await lock.writeFile(json({ run_id: runId, pid: process.pid })); await lock.sync(); await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    logger("acquire"); const { features, source } = await acquireMaChildcare(transport);
    logger("normalize"); signal?.throwIfAborted(); const result = await derive(features, source, runId, signal), values = await contents(features, source, result, signal);
    for (let i = 0; i < files.length; i++) { signal?.throwIfAborted(); await durableWrite(path.join(staging, files[i][0]), values[i], signal); }
    const manifest = manifestFor(runId, source, result, descriptors(values, result));
    await durableWrite(path.join(staging, "manifest.tmp"), `${json(manifest)}\n`, signal);
    await rename(path.join(staging, "manifest.tmp"), path.join(staging, "manifest.json"));
    logger("verify"); const verification = await verifyMaChildcareRelease(path.join(staging, "manifest.json"), { signal });
    await logger("before-commit"); signal?.throwIfAborted();
    if (!await owned(staging, stagingIdentity) || !await ownLock()) throw inspection([new Error("Publication ownership lost before commit.")]);
    signal?.throwIfAborted();
    // Commit boundary: after the release rename, finish the pointer without cancellation.
    await rename(staging, release); committed = true;
    const manifestPath = path.join(release, "manifest.json");
    await canonical(path.join(root, "current.json"));
    const pointerHandle = await open(pointerTemp, "wx");
    try {
      pointerIdentity = await pointerHandle.stat({ bigint: true });
      await pointerHandle.writeFile(`${json({ dataset_id: DATASET, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, manifest_sha256: verification.manifest_sha256 })}\n`);
      await pointerHandle.sync();
    } finally { await pointerHandle.close(); }
    await rename(pointerTemp, path.join(root, "current.json"));
    return { status: "complete", run_id: runId, release_id: manifest.release_id, manifest_path: manifestPath, manifest_sha256: verification.manifest_sha256, counts: result.counts };
  } catch (error) {
    const failures = [error];
    if (!await ownLock()) failures.push(new Error("Lock ownership lost."));
    if (!committed && stagingIdentity && !await owned(staging, stagingIdentity)) failures.push(new Error("Staging ownership lost."));
    if (signal?.aborted && !committed && await owned(staging, stagingIdentity)) {
      try { await rm(staging, { recursive: true, force: true }); } catch (cleanupError) { failures.push(cleanupError); }
    }
    reportedFailure = failures.length > 1 ? inspection(failures) : error;
    throw reportedFailure;
  } finally {
    await lock.close();
    const lockOwned = await ownLock();
    if (lockOwned) await rm(lockPath, { force: true });
    if (await owned(pointerTemp, pointerIdentity)) await rm(pointerTemp, { force: true });
    if (!lockOwned && !reportedFailure) throw inspection([new Error("Lock ownership lost during finalization.")]);
  }
}
