import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { setImmediate as yieldLoop } from "node:timers/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { verifyTnChildcareRelease } from "./tn-childcare-release.mjs";
import { reconcileFreshTnChildcareCenter } from "./tn-childcare-registry-adapter.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const requireValue = (value, label) => { if (!value) throw new Error(`TN registry input rejected: ${label}.`); };
async function noAlias(file, signal) {
  requireValue(typeof file === "string" && file.length <= 1024 && path.resolve(file) === file, "canonical absolute path required");
  assertInsideApp(file);
  let current = APP_ROOT;
  for (const segment of ["", ...path.relative(APP_ROOT, file).split(path.sep)]) {
    signal?.throwIfAborted(); current = path.join(current, segment);
    const stat = await lstat(current, { bigint: true });
    requireValue(!stat.isSymbolicLink() && await realpath(current) === current, "path alias");
    requireValue(current === file ? stat.isFile() && stat.nlink === 1n : stat.isDirectory(), "file type or hard link");
  }
}
async function readBounded(file, maximum, signal) {
  await noAlias(file, signal); const before = await lstat(file, { bigint: true });
  requireValue(before.size <= BigInt(maximum), "byte ceiling");
  const handle = await open(file, "r");
  try {
    const initial = await handle.stat({ bigint: true });
    requireValue(initial.ino === before.ino && initial.dev === before.dev && initial.size === before.size && initial.nlink === 1n, "file changed before read");
    const chunks = []; let size = 0;
    for (;;) {
      signal?.throwIfAborted(); const buffer = Buffer.alloc(Math.min(1_000_000, maximum + 1 - size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
      size += bytesRead; requireValue(size <= maximum, "byte ceiling"); chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true }), named = await lstat(file, { bigint: true });
    requireValue(after.size === initial.size && after.mtimeNs === initial.mtimeNs && after.ctimeNs === initial.ctimeNs && after.nlink === 1n
      && named.ino === initial.ino && named.dev === initial.dev && named.nlink === 1n && !named.isSymbolicLink(), "file changed during read");
    await noAlias(file, signal); return Buffer.concat(chunks, size);
  } finally { await handle.close(); }
}
const decode = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

/** Fresh connector 1.1 local-review candidates only. Recovered input is deliberately separate.
 * No matching, acquisition, national enrollment or publication. */
export async function loadFreshTnChildcareRegistryInput(manifestPath, options = {}) {
  requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => key === "signal"), "unsupported options");
  const { signal } = options;
  requireValue(signal === undefined || signal instanceof AbortSignal, "invalid cancellation signal"); signal?.throwIfAborted();
  await noAlias(manifestPath, signal);
  requireValue(path.basename(manifestPath) === "manifest.json" && path.basename(path.dirname(path.dirname(manifestPath))) === "releases", "immutable released manifest required");
  const verification = await verifyTnChildcareRelease(manifestPath, { signal });
  const bytes = await readBounded(manifestPath, 100_000, signal);
  requireValue(sha(bytes) === verification.manifest_sha256, "manifest changed after verification");
  const manifest = JSON.parse(decode(bytes));
  requireValue(manifest.connector_version === "1.1.0" && !Object.hasOwn(manifest, "recovery_version") && manifest.transformation_version === "tn-childcare-normalization@1.0.1" && manifest.policy.profile === "tn-childcare-local-review@1.0.0"
    && manifest.policy.export_policy === "local-review-only", "fresh transformation or policy");
  const artifacts = manifest.artifacts.filter(entry => entry.path === "normalized.jsonl");
  requireValue(artifacts.length === 1 && artifacts[0].export_policy === "local-review-only", "normalized membership or policy");
  const artifact = artifacts[0], normalizedPath = path.join(path.dirname(manifestPath), artifact.path);
  const normalized = await readBounded(normalizedPath, 100_000_000, signal);
  requireValue(normalized.length === artifact.bytes && sha(normalized) === artifact.sha256, "normalized integrity changed");
  const text = decode(normalized); requireValue(text.endsWith("\n"), "terminated JSONL required");
  const lines = text.slice(0, -1).split("\n");
  requireValue(lines.length === artifact.records && lines.length === manifest.counts.accepted, "accepted membership count");
  const contributions = [];
  for (const [index, line] of lines.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    contributions.push(reconcileFreshTnChildcareCenter(JSON.parse(line), { manifest, manifestSha256: verification.manifest_sha256 }));
  }
  // Repeat the complete evidence proof after cooperative processing; never return a mixed snapshot.
  const final = await verifyTnChildcareRelease(manifestPath, { signal });
  requireValue(final.manifest_sha256 === verification.manifest_sha256
    && sha(await readBounded(manifestPath, 100_000, signal)) === verification.manifest_sha256
    && sha(await readBounded(normalizedPath, 100_000_000, signal)) === artifact.sha256, "release changed during conversion");
  signal?.throwIfAborted();
  return { source: { manifestPath, manifestSha256: verification.manifest_sha256, releaseId: manifest.release_id,
    sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, processedAt: null,
    transformationVersion: manifest.transformation_version, recoveryVersion: null,
    failedRunId: null, acquisitionKind: "ordinary-verified-local-release", parentManifestSha256: null },
  counts: { ...manifest.counts }, acceptedRecordQuality: structuredClone(manifest.accepted_record_quality), exportPolicy: "local-review-only", contributions, nationalReportingIntegrated: false };
}
