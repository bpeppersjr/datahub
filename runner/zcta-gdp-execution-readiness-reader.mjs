import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import { verifyZctaGdpExecutionReadiness } from "./zcta-gdp-execution-readiness.mjs";
const fail = () => {
  throw Object.assign(
    Error("ZCTA GDP execution readiness is unavailable or incompatible."),
    { statusCode: 503 },
  );
};
const same = (a, b) =>
  a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() &&
  a.nlink === 1n && b.nlink === 1n &&
  ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);
async function stableBytes(file, maximum, signal) {
  signal?.throwIfAborted();
  const before = await fs.lstat(file, { bigint: true }), handle = await fs.open(file, "r");
  try {
    if (!same(before, await handle.stat({ bigint: true })) || before.size > BigInt(maximum)) fail();
    const bytes = await handle.readFile(); signal?.throwIfAborted();
    if (!same(before, await handle.stat({ bigint: true })) || !same(before, await fs.lstat(file, { bigint: true }))) fail();
    return bytes;
  } finally { await handle.close(); }
}
export async function readZctaGdpExecutionReadiness({
  zcta,
  root = APP_ROOT,
  signal,
} = {}) {
  if (!/^\d{5}$/.test(zcta ?? ""))
    throw Object.assign(Error("ZCTA must be exactly five digits."), {
      statusCode: 400,
    });
  root = path.resolve(root);
  signal?.throwIfAborted();
  const registration = JSON.parse(await stableBytes(path.join(root, "config/datasets/zcta-gdp-execution-readiness.json"), 100000, signal)),
    pin = registration.retained_release;
  if (
    registration.dataset_id !== "zcta-gdp-execution-readiness" ||
    registration.status !== "published-execution-readiness-hold" ||
    registration.runtime_pointer !== null ||
    registration.current_pointer_written !== false ||
    registration.production_enrollment !== false ||
    !pin
  )
    fail();
  const verified = await verifyZctaGdpExecutionReadiness(pin.manifest, {
    root,
    signal,
  });
  if (
    verified.release_id !== pin.release_id ||
    verified.manifest_sha256 !== pin.manifest_sha256 ||
    verified.created_at !== pin.created_at ||
    JSON.stringify(verified.artifact) !== JSON.stringify(pin.artifact)
  ) fail();
  const file = path.join(root, path.dirname(pin.manifest), pin.artifact.path),
    raw = await stableBytes(file, 40000000, signal);
  if (raw.length !== pin.artifact.bytes || createHash("sha256").update(raw).digest("hex") !== pin.artifact.sha256) fail();
  let found = null,
    tail = "";
  {
    for (let offset=0;offset<raw.length;offset+=65536) {
      signal?.throwIfAborted();
      const lines = (tail + raw.subarray(offset,Math.min(raw.length,offset+65536)).toString("utf8")).split("\n");
      tail = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const row = JSON.parse(line);
        if (row.zcta === zcta) found = row;
      }
    }
    if (tail) fail();
  }
  return {
    schema_version: "zcta-gdp-execution-readiness-view@1.0.0",
    zcta,
    available: found !== null,
    status: found ? "found" : "not-found",
    readiness: found,
    summary: verified.summary,
    provenance: {
      release_id: pin.release_id,
      manifest_sha256: pin.manifest_sha256,
      artifact_sha256: pin.artifact.sha256,
      created_at: pin.created_at,
    },
    claims: {
      model_approved: false,
      output_authorized: false,
      numeric_gdp: false,
      industry_gdp: false,
      official_usps_zip: false,
    },
  };
}
