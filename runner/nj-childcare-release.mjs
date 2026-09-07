import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, readFile, open, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { acquireNjChildcare } from "./nj-childcare-acquisition.mjs";
import { normalizeNjChildcareFeature, NJ_CHILDCARE_TRANSFORMATION, NJ_CHILDCARE_REPROCESS_TRANSFORMATION } from "./nj-childcare-normalization.mjs";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM_URL, NJ_CHILDCARE_SCHEMA } from "./nj-childcare-preflight.mjs";
import { NJ_CHILDCARE_METADATA_URL } from "./nj-childcare-metadata.mjs";

const DATASET = "nj-licensed-childcare-centers";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const policy = { profile: "njdep-childcare-local-review@1.0.0", export: "local-review-only",
  owner: "New Jersey Department of Environmental Protection / Department of Children and Families",
  terms_url: NJ_CHILDCARE_ITEM_URL, allowed_use: "local governed business-source review",
  redistribution: "not-authorized-by-this-release", retention: "immutable local evidence; operator-governed deletion",
  private_fields: "owner, director, center_phone and center_email excluded",
  attribution: "New Jersey Department of Environmental Protection; New Jersey Department of Children and Families",
  publisher_notices: "Complete distribution terms are retained in source-observation.json item payloads and publisher-metadata.xml; authorized publication must carry prescribed publisher credit/disclaimers and accompanying metadata.",
  legal_approval: false };
const files = [["selected-features.jsonl", "internal"], ["normalized.jsonl", "local-review-only"],
  ["quarantine.jsonl", "internal"], ["source-observation.json", "internal"], ["publisher-metadata.xml", "internal"]];
const parentFile = ["reprocessing-parent-manifest.json", "internal"];
const filesFor = (version) => version === "1.0.1" ? [...files, parentFile] : files;
function requireValue(ok, label) { if (!ok) throw new Error(`New Jersey childcare release rejected: ${label}.`); }
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
async function replay(source, xml, signal) {
  requireValue(source && utc(source.started_at) && utc(source.observed_at)
    && Array.isArray(source.observations) && source.observations.length >= 13
    && source.observations.length <= 20012, "acquisition observation envelope");
  const clocks = [source.started_at, ...source.observations.map((entry) => entry.observed_at), source.observed_at];
  requireValue(clocks.every(utc), "observation clocks");
  let index = 0, clock = 0;
  const result = await acquireNjChildcare({ signal, sleep: async () => { await yieldLoop(); signal?.throwIfAborted(); },
    now: () => { requireValue(clock < clocks.length, "replay clock exhausted"); return new Date(clocks[clock++]); },
    fetchImpl: async (url) => {
      signal?.throwIfAborted();
      const entry = source.observations[index++];
      requireValue(entry && json(Object.keys(entry).sort()) === json(["kind", "observed_at", "payload_sha256", "payload"].sort()), "observation fields");
      const parsed = new URL(url), params = parsed.searchParams;
      const kind = url === NJ_CHILDCARE_METADATA_URL ? "xml" : url === `${NJ_CHILDCARE_ITEM_URL}?f=json` ? "item"
        : url === `${NJ_CHILDCARE_LAYER}?f=json` ? "metadata"
          : parsed.pathname.endsWith("/query") && params.has("returnCountOnly") ? "count"
            : params.has("outStatistics") ? "dates" : params.has("returnIdsOnly") ? "inventory" : "features";
      requireValue(entry.kind === kind, "observation sequence");
      if (kind === "xml") {
        requireValue(entry.payload_sha256 === sha(xml), "XML observation digest");
        return new Response(xml, { headers: { "content-type": "application/xml" } });
      }
      requireValue(entry.payload_sha256 === sha(json(entry.payload)), "retained JSON observation digest");
      return new Response(json(entry.payload));
    } });
  requireValue(index === source.observations.length && clock === clocks.length, "unused acquisition evidence");
  requireValue(json(result.source) === json(source), "acquisition replay differs from retained source");
  return result.features;
}
async function derive(features, source, runId, signal, xml, transformationVersion = NJ_CHILDCARE_TRANSFORMATION) {
  requireValue(json(features) === json(await replay(source, xml, signal)), "selected features differ from acquisition replay");
  const stableSource = Object.fromEntries(Object.entries(source).filter(([key]) => !["started_at", "observed_at", "observations"].includes(key)));
  const featureHashes = [];
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    featureHashes.push(sha(json(feature)));
  }
  const sourceReleaseId = `nj-childcare-${sha(json({ source: stableSource, publisher_xml_sha256: sha(xml), features: featureHashes }))}`;
  const normalized = [], quarantine = [];
  for (const [index, feature] of features.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    // Scope/privacy violations are whole-source failures, even if another field is invalid first.
    requireValue(feature?.attributes?.state === "NJ", "source scope drift");
    requireValue(json(Object.keys(feature.attributes).sort()) === json(NJ_CHILDCARE_SCHEMA.map(([n]) => n).sort()) && Object.keys(feature).every((k) => ["attributes", "geometry"].includes(k)), "private/selected field drift");
    requireValue(!feature.geometry || (Object.keys(feature.geometry).every((key) => ["x", "y", "spatialReference"].includes(key))
      && (!feature.geometry.spatialReference || Object.keys(feature.geometry.spatialReference).every((key) => ["wkid", "latestWkid"].includes(key)))), "private geometry field drift");
    try { normalized.push(normalizeNjChildcareFeature(feature, { runId, sourceReleaseId, observedAt: source.observed_at, outputWkid: 4326, downloadDateEpochMs: source.download_date_epoch_ms, transformationVersion })); }
    catch (error) {
      if (error.code !== "NJ_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: feature.attributes.OBJECTID, input_feature_sha256: sha(json(feature)), reason: error.reason });
    }
  }
  requireValue(normalized.length > 0 && quarantine.length / features.length <= 0.05, "quarantine gate exceeds 5% or no accepted records");
  return { sourceReleaseId, normalized, quarantine, counts: { selected: features.length, accepted: normalized.length, quarantined: quarantine.length } };
}
function manifestFor(runId, source, result, artifacts, connectorVersion = "1.0.0", processing) {
  return { schema_version: "1.0.0", dataset_id: DATASET, connector_id: DATASET, connector_version: connectorVersion,
    transformation_version: connectorVersion === "1.0.1" ? NJ_CHILDCARE_REPROCESS_TRANSFORMATION : NJ_CHILDCARE_TRANSFORMATION,
    run_id: runId, release_id: `nj-childcare-${runId}`, source_release_id: result.sourceReleaseId, status: "complete", observed_at: source.observed_at,
    source_url: NJ_CHILDCARE_LAYER, policy, counts: result.counts, quarantine_max_fraction: 0.05,
    scope: "NJDEP/DCF licensed childcare center source records, New Jersey; public-school facilities included, not all childcare businesses",
    claims: { active_business_verified: false, unique_business_identity_verified: false, national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false },
    evidence_limit: "Full parsed JSON responses and raw XML replay the acquisition contract offline. This is not provider authenticity, transactional snapshot isolation, XML schema validation or proof of current business operation.", artifacts,
    ...(connectorVersion === "1.0.1" ? { processed_at: processing.processed_at, reprocessing: processing.reprocessing } : {}) };
}
async function contents(features, source, result, signal, xml) {
  const values = [];
  for (const rows of [features, result.normalized, result.quarantine]) {
    values.push(await linesFor(rows, signal));
  }
  return [...values, `${json(source)}\n`, xml];
}
async function linesFor(rows, signal) {
  const lines = [];
  for (const [index, row] of rows.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } lines.push(`${json(row)}\n`);
  }
  return lines.join("");
}
function descriptors(values, result, version = "1.0.0") {
  return filesFor(version).map(([filename, exportPolicy], i) => ({ path: filename, sha256: sha(values[i]), bytes: Buffer.byteLength(values[i]), records: [result.counts.selected, result.counts.accepted, result.counts.quarantined, 1, 1, 1][i], export_policy: exportPolicy }));
}
async function boundedRead(filename, maximum, signal) {
  await canonical(filename); const info = await lstat(filename, { bigint: true });
  requireValue(info.isFile() && info.size <= maximum, "artifact type/size");
  const handle = await open(filename, "r");
  try {
    const identity = await handle.stat({ bigint: true });
    requireValue(identity.dev === info.dev && identity.ino === info.ino, "artifact read ownership");
    const chunks = []; let bytes = 0;
    while (true) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(1_000_000, maximum + 1 - bytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      bytes += bytesRead; requireValue(bytes <= maximum, "artifact type/size"); chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, bytes);
  } finally { await handle.close(); }
}
async function durableWrite(filename, value, signal) {
  signal?.throwIfAborted(); const handle = await open(filename, "wx");
  try { await handle.writeFile(value, { signal }); signal?.throwIfAborted(); await handle.sync(); }
  finally { await handle.close(); }
}
async function verifiedParent(parentBytes, features, source, xml, signal) {
  requireValue(parentBytes.length <= 100000, "parent manifest size");
  const parent = JSON.parse(parentBytes.toString("utf8"));
  requireValue(parent.connector_version === "1.0.0" && uuid.test(parent.run_id)
    && parent.release_id === `nj-childcare-${parent.run_id}`, "parent must be an original 1.0.0 release");
  const original = await derive(features, source, parent.run_id, signal, xml, NJ_CHILDCARE_TRANSFORMATION);
  const originalValues = await contents(features, source, original, signal, xml);
  requireValue(json(parent) === json(manifestFor(parent.run_id, source, original, descriptors(originalValues, original))), "parent lineage differs from original evidence replay");
  return parent;
}
function processingFor(parentBytes, parent, processedAt) {
  requireValue(utc(processedAt) && processedAt >= parent.observed_at, "reprocessing clock");
  return { processed_at: processedAt, reprocessing: { mode: "local-retained-evidence", network_requests: 0,
    parent_release_id: parent.release_id, parent_source_release_id: parent.source_release_id,
    parent_manifest_sha256: sha(parentBytes), parent_manifest_artifact: parentFile[0],
    parent_transformation_version: NJ_CHILDCARE_TRANSFORMATION } };
}
async function readVerifiedRelease(manifestPath, { signal } = {}) {
  signal?.throwIfAborted(); const resolved = await canonical(manifestPath);
  requireValue(path.basename(resolved) === "manifest.json", "manifest filename");
  const directory = path.dirname(resolved), rawManifest = await boundedRead(resolved, 100000, signal), manifest = JSON.parse(rawManifest.toString("utf8"));
  requireValue(uuid.test(manifest.run_id) && manifest.release_id === `nj-childcare-${manifest.run_id}`, "run/release identity");
  requireValue(["1.0.0", "1.0.1"].includes(manifest.connector_version), "connector version");
  const releaseFiles = filesFor(manifest.connector_version);
  const parent = path.basename(path.dirname(directory));
  requireValue((parent === ".staging" && path.basename(directory) === manifest.run_id) || (parent === "releases" && path.basename(directory) === manifest.release_id), "manifest directory identity");
  requireValue(json((await readdir(directory)).sort()) === json([...releaseFiles.map(([f]) => f), "manifest.json"].sort()), "missing/extra artifacts");
  const values = [];
  for (const [filename] of releaseFiles) { signal?.throwIfAborted(); values.push(await boundedRead(path.join(directory, filename), filename === parentFile[0] ? 100000 : filename === "publisher-metadata.xml" ? 1_000_000 : filename === "source-observation.json" ? 150_000_000 : 100_000_000, signal)); }
  const parseLines = async (bytes) => {
    const text = bytes.toString("utf8");
    requireValue(text === "" || text.endsWith("\n"), "JSONL termination"); const rows = [];
    for (const [index, line] of (text ? text.slice(0, -1).split("\n") : []).entries()) {
      if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); } rows.push(JSON.parse(line));
    } return rows;
  };
  const features = await parseLines(values[0]), source = JSON.parse(values[3].toString("utf8"));
  let processing;
  if (manifest.connector_version === "1.0.1") {
    const parentManifest = await verifiedParent(values[5], features, source, values[4], signal);
    requireValue(parentManifest.run_id !== manifest.run_id, "reprocessing must have a new run identity");
    processing = processingFor(values[5], parentManifest, manifest.processed_at);
  }
  const result = await derive(features, source, manifest.run_id, signal, values[4], manifest.connector_version === "1.0.1" ? NJ_CHILDCARE_REPROCESS_TRANSFORMATION : NJ_CHILDCARE_TRANSFORMATION);
  const reproduced = await contents(features, source, result, signal, values[4]);
  if (processing) reproduced.push(values[5]);
  requireValue(values.every((value, index) => value.equals(Buffer.from(reproduced[index]))), "normalized/quarantine/source bytes differ from reproduction");
  const expected = manifestFor(manifest.run_id, source, result, descriptors(values, result, manifest.connector_version), manifest.connector_version, processing);
  requireValue(json(manifest) === json(expected), "manifest identity, counts, policy or artifact integrity");
  signal?.throwIfAborted();
  return { verification: { status: "verified", release_id: manifest.release_id, manifest_path: resolved, manifest_sha256: sha(rawManifest), counts: result.counts, artifact_count: releaseFiles.length },
    manifest, rawManifest, values, features, source };
}
export async function verifyNjChildcareRelease(manifestPath, { signal } = {}) {
  return (await readVerifiedRelease(manifestPath, { signal })).verification;
}
export async function buildNjChildcareRelease(options = {}) {
  requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["outputRoot", "fetchImpl", "signal", "sleep", "timeoutMs", "now", "logger"].includes(key)), "unsupported options");
  const { outputRoot = path.join(APP_ROOT, "data/business-sources", DATASET), logger = () => {}, ...transport } = options;
  return publishRelease({ outputRoot, logger, signal: transport.signal }, async () => {
    const { features, source, publisher_metadata } = await acquireNjChildcare(transport);
    return { features, source, xml: publisher_metadata.before.raw, version: "1.0.0" };
  });
}
export async function reprocessNjChildcareRelease(inputManifestPath, options = {}) {
  requireValue(options && typeof options === "object" && !Array.isArray(options)
    && Object.keys(options).every((key) => ["outputRoot", "signal", "logger", "now"].includes(key)), "unsupported reprocessing options");
  const { outputRoot = path.join(APP_ROOT, "data/business-sources", `${DATASET}-reprocessed`), signal, logger = () => {}, now = () => new Date() } = options;
  requireValue(typeof logger === "function" && typeof now === "function", "reprocessing logger/clock");
  signal?.throwIfAborted();
  await logger("verify-parent");
  const captured = await readVerifiedRelease(inputManifestPath, { signal });
  requireValue(captured.manifest.connector_version === "1.0.0", "parent must be an original 1.0.0 release");
  const inputRoot = path.dirname(path.dirname(path.dirname(captured.verification.manifest_path)));
  const destination = await canonical(outputRoot);
  const relative = path.relative(inputRoot, destination);
  requireValue(relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative), "reprocessing output must be outside the parent source tree");
  const processing = processingFor(captured.rawManifest, captured.manifest, now().toISOString());
  return publishRelease({ outputRoot: destination, signal, logger, acquirePhase: "reuse" }, async () => ({
    features: captured.features, source: captured.source, xml: captured.values[4], parentBytes: captured.rawManifest,
    version: "1.0.1", processing,
  }));
}
async function publishRelease({ outputRoot, logger, signal, acquirePhase = "acquire" }, loadEvidence) {
  requireValue(typeof logger === "function", "logger"); signal?.throwIfAborted();
  const root = await canonical(outputRoot, true), stagingRoot = await canonical(path.join(root, ".staging"), true), releasesRoot = await canonical(path.join(root, "releases"), true);
  const lockPath = path.join(root, ".publish.lock"), lock = await open(lockPath, "wx"), runId = randomUUID(), lockIdentity = await lock.stat({ bigint: true });
  const staging = path.join(stagingRoot, runId), release = path.join(releasesRoot, `nj-childcare-${runId}`), pointerTemp = path.join(root, `.current-${runId}.tmp`);
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
    return Object.assign(new AggregateError(errors, "New Jersey childcare ownership changed; inspection required. Foreign paths were preserved."), { code: "NJ_CHILDCARE_INSPECTION_REQUIRED" });
  }
  try {
    await lock.writeFile(json({ run_id: runId, pid: process.pid })); await lock.sync(); await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    await logger(acquirePhase); signal?.throwIfAborted();
    const { features, source, xml, parentBytes, version, processing } = await loadEvidence();
    // Preserve completed acquisition evidence even when later normalization fails.
    await durableWrite(path.join(staging, files[0][0]), await linesFor(features, signal), signal);
    await durableWrite(path.join(staging, files[3][0]), `${json(source)}\n`, signal);
    await durableWrite(path.join(staging, files[4][0]), xml, signal);
    if (parentBytes) await durableWrite(path.join(staging, parentFile[0]), parentBytes, signal);
    await logger("normalize"); signal?.throwIfAborted();
    const result = await derive(features, source, runId, signal, xml, version === "1.0.1" ? NJ_CHILDCARE_REPROCESS_TRANSFORMATION : NJ_CHILDCARE_TRANSFORMATION);
    const values = await contents(features, source, result, signal, xml);
    if (parentBytes) values.push(parentBytes);
    for (const i of [1, 2]) { signal?.throwIfAborted(); await durableWrite(path.join(staging, files[i][0]), values[i], signal); }
    const manifest = manifestFor(runId, source, result, descriptors(values, result, version), version, processing);
    await durableWrite(path.join(staging, "manifest.tmp"), `${json(manifest)}\n`, signal);
    await rename(path.join(staging, "manifest.tmp"), path.join(staging, "manifest.json"));
    await logger("verify"); const verification = await verifyNjChildcareRelease(path.join(staging, "manifest.json"), { signal });
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
