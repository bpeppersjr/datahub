import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCurrentMatrixAuthorizationWave, DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT } from "../runner/broad-organization-current-matrix-authorization-wave.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let outputRoot = DEFAULT_CURRENT_MATRIX_AUTHORIZATION_WAVE_ROOT;
let waveNumber = 1;
const seen = new Set();
for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];
  if (!new Set(["--out", "--wave"]).has(flag) || seen.has(flag) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Usage: node scripts/build-broad-organization-current-matrix-authorization-wave.mjs [--wave 1|2] [--out <data-directory>]");
  seen.add(flag);
  const value = args[++i];
  if (flag === "--out") outputRoot = path.resolve(ROOT, value);
  else if (["1", "2"].includes(value)) waveNumber = Number(value);
  else throw new Error("--wave must be 1 or 2.");
}
const result = await buildCurrentMatrixAuthorizationWave({ outputRoot, waveNumber });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), wave: result.wave.scope.wave_number, jurisdictions: result.manifest.jurisdiction_count, source_gap_count: result.manifest.source_gap_count, prior_wave_release_id: result.wave.prior_wave?.release_id ?? null, remaining_gap_count: result.manifest.remaining_gap_count, acquisition_authorized: false, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false, reused_existing_release: result.reused_existing_release }, null, 2)}\n`);
