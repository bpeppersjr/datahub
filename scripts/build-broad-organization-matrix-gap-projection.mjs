import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBroadOrganizationMatrixGapProjection, DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT } from "../runner/broad-organization-matrix-gap-projection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let outputRoot = DEFAULT_BROAD_ORGANIZATION_MATRIX_GAP_PROJECTION_ROOT;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== "--out" || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Usage: node scripts/build-broad-organization-matrix-gap-projection.mjs [--out <data-directory>]");
  outputRoot = path.resolve(ROOT, args[++i]);
}
const result = await buildBroadOrganizationMatrixGapProjection({ outputRoot });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), jurisdictions: result.manifest.jurisdiction_count, admitted_broad_layers: result.manifest.admitted_broad_layer_count, current_gaps: result.manifest.current_gap_count, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, reused_existing_release: result.reused_existing_release }, null, 2)}\n`);
