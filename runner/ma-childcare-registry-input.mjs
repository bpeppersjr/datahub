import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setImmediate as yieldLoop } from "node:timers/promises";
import path from "node:path";
import { assertInsideApp } from "./paths.mjs";
import { verifyMaChildcareRelease } from "./ma-childcare-release.mjs";
import { reconcileMaChildcareProgram } from "./ma-childcare-registry-adapter.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function readBounded(file, maximum, signal) {
  signal?.throwIfAborted();
  const absolute = assertInsideApp(path.resolve(file));
  if (path.resolve(await realpath(absolute)) !== absolute) throw new Error("MA registry input path is redirected.");
  const stream = createReadStream(absolute, { signal });
  const chunks = []; let length = 0;
  try {
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > maximum) throw new Error("MA registry input exceeds byte limit.");
      chunks.push(chunk);
    }
    signal?.throwIfAborted();
    return Buffer.concat(chunks, length);
  } finally { stream.destroy(); }
}

/** Local-only verified conversion. Does not acquire, publish, merge, or promote data. */
export async function loadMaChildcareRegistryInput(manifestPath, { signal } = {}) {
  const verification = await verifyMaChildcareRelease(manifestPath, { signal });
  const manifestBytes = await readBounded(verification.manifest_path, 100000, signal);
  if (sha(manifestBytes) !== verification.manifest_sha256) throw new Error("MA manifest changed after verification.");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artifact = manifest.artifacts.find((entry) => entry.path === "normalized.jsonl");
  if (!artifact || artifact.export_policy !== "local-review-only") throw new Error("MA normalized artifact policy is invalid.");
  const normalizedBytes = await readBounded(path.join(path.dirname(verification.manifest_path), artifact.path), 100000000, signal);
  if (normalizedBytes.length !== artifact.bytes || sha(normalizedBytes) !== artifact.sha256) throw new Error("MA normalized artifact changed after verification.");
  const text = normalizedBytes.toString("utf8");
  if (!text.endsWith("\n")) throw new Error("MA normalized artifact is not terminated JSONL.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== artifact.records || lines.length !== manifest.counts.accepted) throw new Error("MA normalized record count differs from verified release.");
  const contributions = [];
  for (const [index, line] of lines.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    contributions.push(reconcileMaChildcareProgram(JSON.parse(line), { manifest, manifestSha256: verification.manifest_sha256 }));
  }
  signal?.throwIfAborted();
  return {
    source: { manifestPath: verification.manifest_path, manifestSha256: verification.manifest_sha256,
      releaseId: manifest.release_id, sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at },
    counts: { ...manifest.counts }, exportPolicy: "local-review-only", contributions,
    nationalReportingIntegrated: false,
  };
}
