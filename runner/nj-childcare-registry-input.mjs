import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setImmediate as yieldLoop } from "node:timers/promises";
import path from "node:path";
import { assertInsideApp } from "./paths.mjs";
import { verifyNjChildcareRelease } from "./nj-childcare-release.mjs";
import { reconcileNjChildcareCenter } from "./nj-childcare-registry-adapter.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function readBounded(file, maximum, signal) {
  signal?.throwIfAborted();
  const absolute = assertInsideApp(path.resolve(file));
  if (path.resolve(await realpath(absolute)) !== absolute) throw new Error("NJ registry input path is redirected.");
  const stream = createReadStream(absolute, { signal });
  const chunks = []; let length = 0;
  try {
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > maximum) throw new Error("NJ registry input exceeds byte limit.");
      chunks.push(chunk);
    }
    signal?.throwIfAborted();
    return Buffer.concat(chunks, length);
  } finally { stream.destroy(); }
}

/** Local-only verified conversion. No acquisition, publication, matching or promotion. */
export async function loadNjChildcareRegistryInput(manifestPath, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => key !== "signal")) {
    throw new Error("Unsupported NJ registry input options.");
  }
  const { signal } = options;
  const verification = await verifyNjChildcareRelease(manifestPath, { signal });
  const manifestBytes = await readBounded(verification.manifest_path, 100000, signal);
  if (sha(manifestBytes) !== verification.manifest_sha256) throw new Error("NJ manifest changed after verification.");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifact = manifest.artifacts.find((entry) => entry.path === "normalized.jsonl");
  if (!artifact || artifact.export_policy !== "local-review-only") throw new Error("NJ normalized artifact policy is invalid.");
  const normalizedBytes = await readBounded(path.join(path.dirname(verification.manifest_path), artifact.path), 100000000, signal);
  if (normalizedBytes.length !== artifact.bytes || sha(normalizedBytes) !== artifact.sha256) throw new Error("NJ normalized artifact changed after verification.");
  const text = normalizedBytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error("NJ normalized artifact is not terminated JSONL.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== artifact.records || lines.length !== manifest.counts.accepted) throw new Error("NJ normalized record count differs from verified release.");
  const contributions = [];
  for (const [index, line] of lines.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    contributions.push(reconcileNjChildcareCenter(JSON.parse(line), { manifest, manifestSha256: verification.manifest_sha256 }));
  }
  signal?.throwIfAborted();
  return { source: { manifestPath: verification.manifest_path, manifestSha256: verification.manifest_sha256,
    releaseId: manifest.release_id, sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at,
    transformationVersion: manifest.transformation_version, processedAt: manifest.processed_at ?? null,
    parentManifestSha256: manifest.reprocessing?.parent_manifest_sha256 ?? null },
  counts: { ...manifest.counts }, exportPolicy: "local-review-only", contributions, nationalReportingIntegrated: false };
}
