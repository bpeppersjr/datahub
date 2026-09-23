import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
  verifyBroadOrganizationAuthorizationProgram,
} from "../runner/broad-organization-authorization-program.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0].startsWith("--"))) throw new Error("Usage: node scripts/verify-broad-organization-authorization-program.mjs [manifest.json]");
let manifestPath = args[0] ? path.resolve(ROOT, args[0]) : null;
if (!manifestPath) {
  const releases = await readdir(path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT, "releases"), { withFileTypes: true });
  const candidates = releases.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-authorization-program-"));
  if (candidates.length !== 1) throw new Error(`Specify a manifest; expected exactly one program release, found ${candidates.length}`);
  manifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT, "releases", candidates[0].name, "manifest.json");
}
const result = await verifyBroadOrganizationAuthorizationProgram(manifestPath);
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, jurisdictions: result.manifest.state_count, gate_items: result.manifest.gate_item_count, gate_keys: result.manifest.gate_key_count, source_backlog_release_id: result.manifest.source_backlog_release_id, source_actions_performed: 0, current_pointer_changed: false, valid: true }, null, 2)}\n`);
