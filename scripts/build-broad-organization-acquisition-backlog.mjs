import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBroadOrganizationAcquisitionBacklog,
  DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
} from "../runner/broad-organization-acquisition-backlog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let outputRoot = DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== "--out" || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Usage: node scripts/build-broad-organization-acquisition-backlog.mjs [--out <directory>]");
  outputRoot = path.resolve(ROOT, args[index + 1]);
  index += 1;
}
const result = await buildBroadOrganizationAcquisitionBacklog({ outputRoot });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), state_count: result.manifest.state_count, first_wave: result.manifest.first_wave_state_abbreviations, reused_existing_release: result.reused_existing_release, source_actions_performed: 0, current_pointer_changed: false }, null, 2)}\n`);
