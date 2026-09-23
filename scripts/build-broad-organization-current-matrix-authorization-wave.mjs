import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCurrentMatrixAuthorizationWave, DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT } from "../runner/broad-organization-current-matrix-authorization-wave.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let outputRoot = DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== "--out" || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Usage: node scripts/build-broad-organization-current-matrix-authorization-wave.mjs [--out <data-directory>]");
  outputRoot = path.resolve(ROOT, args[++i]);
}
const result = await buildCurrentMatrixAuthorizationWave({ outputRoot });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), wave: 1, jurisdictions: result.manifest.jurisdiction_count, source_gap_count: result.manifest.source_gap_count, remaining_gap_count: result.manifest.remaining_gap_count, acquisition_authorized: false, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, reused_existing_release: result.reused_existing_release }, null, 2)}\n`);
