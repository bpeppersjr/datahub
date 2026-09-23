import path from "node:path";
import { verifyCurrentMatrixAuthorizationWave } from "../runner/broad-organization-current-matrix-authorization-wave.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].startsWith("--")) throw new Error("Usage: node scripts/verify-broad-organization-current-matrix-authorization-wave.mjs --manifest <manifest.json>");
const result = await verifyCurrentMatrixAuthorizationWave(path.resolve(args[1]));
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, wave: 1, jurisdictions: result.manifest.jurisdiction_count, source_gap_count: result.manifest.source_gap_count, remaining_gap_count: result.manifest.remaining_gap_count, acquisition_authorized: false, current_pointer_changed: false }, null, 2)}\n`);
