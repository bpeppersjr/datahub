import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadCurrentBroadOrganizationAcquisitionBacklog,
  verifyBroadOrganizationAcquisitionBacklog,
} from "../runner/broad-organization-acquisition-backlog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: node scripts/verify-broad-organization-acquisition-backlog.mjs [manifest.json]");
const result = args[0]
  ? await verifyBroadOrganizationAcquisitionBacklog(path.resolve(ROOT, args[0]))
  : await loadCurrentBroadOrganizationAcquisitionBacklog();
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, state_count: result.backlog.states.length, first_wave: result.backlog.scope.first_wave_state_abbreviations, acquisition_authorized: false }, null, 2)}\n`);
