import { createHash } from "node:crypto";
import path from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { verifyOhChildcareAppJob } from "./oh-childcare-app.mjs";
import { ohioBoundedRead as read } from "./oh-childcare-release.mjs";

export const OH_REGISTRY_INPUT_VERSION = "oh-childcare-registry-input@1.0.0";
const sha = value => createHash("sha256").update(value).digest("hex");
const check = (ok, label) => { if (!ok) throw new Error(`Ohio registry input rejected: ${label}.`); };
function decode(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Ohio registry input rejected: invalid UTF-8."); }
}
function parse(value) {
  try { return JSON.parse(value); }
  catch { throw new Error("Ohio registry input rejected: invalid JSON."); }
}

/** Read-only, network-free import boundary. Full app verification replays source
 * evidence and normalization and binds authorization separately from the offline
 * normalization policy. This does not enroll, match, geospatially assign or publish.
 * Injected fixtures remain explicitly labeled; they are not live acquisitions. */
export async function loadOhChildcareRegistryInput(receiptPath, options = {}) {
  check(options && typeof options === "object" && !Array.isArray(options)
    && Object.keys(options).every(key => key === "signal"), "unsupported options");
  const { signal } = options;
  check(signal === undefined || signal instanceof AbortSignal, "invalid cancellation signal");
  signal?.throwIfAborted();
  const verified = await verifyOhChildcareAppJob(receiptPath, { signal });
  const root = path.dirname(path.dirname(path.dirname(verified.receipt_path)));
  const manifestPath = path.join(root, verified.normalized.manifest);
  const manifestRaw = await read(manifestPath, 100_000, signal);
  check(sha(manifestRaw) === verified.normalized.sha256, "manifest changed after verification");
  const manifest = parse(decode(manifestRaw));
  const artifact = manifest.artifacts.find(entry => entry.path === "normalized.jsonl");
  check(artifact?.export_policy === "local-review-only" && manifest.status === "offline-review-only"
    && manifest.claims.governed_geographic_assignment_eligible === false, "reporting policy");
  const normalizedPath = path.join(path.dirname(manifestPath), "normalized.jsonl");
  const normalizedRaw = await read(normalizedPath, 100_000_000, signal);
  check(normalizedRaw.length === artifact.bytes && sha(normalizedRaw) === artifact.sha256, "normalized integrity");
  const text = decode(normalizedRaw);
  check(text === "" || text.endsWith("\n"), "unterminated records");
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  check(lines.length === artifact.records && lines.length === manifest.counts.accepted, "accepted membership");
  const records = [];
  for (const [index, line] of lines.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    records.push(parse(line));
  }
  // Retain actual page observations, ZIP missing reasons and all source lineage.
  // Do not re-create raw features from lossy normalized postal/text fields.
  const final = await verifyOhChildcareAppJob(receiptPath, { signal });
  check(isDeepStrictEqual(final, verified)
    && (await read(manifestPath, 100_000, signal)).equals(manifestRaw)
    && (await read(normalizedPath, 100_000_000, signal)).equals(normalizedRaw), "input snapshot changed");
  signal?.throwIfAborted();
  return {
    inputVersion: OH_REGISTRY_INPUT_VERSION,
    source: { receiptPath: verified.receipt_path, receiptSha256: verified.receipt_sha256,
      appRunId: verified.run_id, executionMode: verified.execution_mode,
      acquisitionManifestPath: path.join(root, verified.acquisition.manifest), acquisitionManifestSha256: verified.acquisition.sha256,
      manifestPath, manifestSha256: verified.normalized.sha256, normalizedSha256: artifact.sha256,
      releaseId: manifest.release_id, sourceReleaseId: manifest.source_release_id,
      observedAt: manifest.observed_at, processedAt: manifest.processed_at,
      transformationVersion: manifest.transformation_version, policy: structuredClone(manifest.policy) },
    counts: structuredClone(manifest.counts), quality: structuredClone(manifest.quality),
    claims: structuredClone(manifest.claims), records, exportPolicy: "local-review-only",
    nationalReportingIntegrated: false, identityMatchingApplied: false,
    governedGeographicAssignmentEligible: false, publicExportAuthorized: false,
  };
}
