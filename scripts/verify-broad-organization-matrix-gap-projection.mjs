import path from "node:path";
import { DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, verifyBroadOrganizationMatrixGapProjection } from "../runner/broad-organization-matrix-gap-projection.mjs";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].startsWith("--"))) throw new Error("Usage: node scripts/verify-broad-organization-matrix-gap-projection.mjs [--manifest <manifest.json>]");
let manifestPath = args.length ? path.resolve(args[1]) : null;
if (!manifestPath) {
  const { readdir } = await import("node:fs/promises");
  const releases = await readdir(path.join(DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, "releases"), { withFileTypes: true });
  const candidates = releases.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.startsWith("broad-organization-matrix-gap-projection-")).map((entry) => entry.name);
  if (candidates.length !== 1) throw new Error(`Expected exactly one pinned matrix-gap projection; found ${candidates.length}`);
  manifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT, "releases", candidates[0], "manifest.json");
}
const result = await verifyBroadOrganizationMatrixGapProjection(manifestPath);
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, jurisdictions: result.manifest.jurisdiction_count, admitted_broad_layers: result.manifest.admitted_broad_layer_count, current_gaps: result.manifest.current_gap_count, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false }, null, 2)}\n`);
