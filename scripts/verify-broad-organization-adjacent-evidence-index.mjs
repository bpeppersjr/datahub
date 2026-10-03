import path from "node:path";
import { findAndVerifyBroadOrganizationAdjacentEvidenceIndex, verifyBroadOrganizationAdjacentEvidenceIndex } from "../runner/broad-organization-adjacent-evidence-index.mjs";

const args = process.argv.slice(2);
if (args.length !== 0 && !(args.length === 2 && args[0] === "--manifest")) throw new Error("Usage: node scripts/verify-broad-organization-adjacent-evidence-index.mjs [--manifest <path>]");
const result = args.length ? await verifyBroadOrganizationAdjacentEvidenceIndex(path.resolve(args[1])) : await findAndVerifyBroadOrganizationAdjacentEvidenceIndex();
process.stdout.write(`${JSON.stringify({ release_id: result.index.release_id, manifest_sha256: result.manifest_sha256, summary: result.index.summary }, null, 2)}\n`);
