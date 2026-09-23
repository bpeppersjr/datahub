import path from "node:path";
import { verifyBroadOrganizationMatrixGapProjection } from "../runner/broad-organization-matrix-gap-projection.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].startsWith("--")) throw new Error("Usage: node scripts/verify-broad-organization-matrix-gap-projection.mjs --manifest <manifest.json>");
const result = await verifyBroadOrganizationMatrixGapProjection(path.resolve(args[1]));
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, jurisdictions: result.manifest.jurisdiction_count, admitted_broad_layers: result.manifest.admitted_broad_layer_count, current_gaps: result.manifest.current_gap_count, source_actions_performed: 0, network_requests: 0, current_pointer_changed: false }, null, 2)}\n`);
