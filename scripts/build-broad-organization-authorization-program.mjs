import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  buildBroadOrganizationAuthorizationProgram,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT,
  DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT,
} from "../runner/broad-organization-authorization-program.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let backlogManifestPath = null;
let outputRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT;
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if ((flag !== "--backlog-manifest" && flag !== "--out") || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("Usage: node scripts/build-broad-organization-authorization-program.mjs [--backlog-manifest <manifest.json>] [--out <directory>]");
  }
  if (flag === "--backlog-manifest") backlogManifestPath = path.resolve(ROOT, args[index + 1]);
  else outputRoot = path.resolve(ROOT, args[index + 1]);
  index += 1;
}
if (!backlogManifestPath) {
  const releases = await readdir(DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT, { withFileTypes: true });
  const candidates = [];
  for (const entry of releases) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith("broad-organization-acquisition-backlog-")) continue;
    const candidatePath = path.join(DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT, entry.name, "manifest.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
    if (candidate.schema_version === "broad-organization-acquisition-backlog-manifest@3.0.0") candidates.push(candidatePath);
  }
  if (candidates.length !== 1) throw new Error(`Specify --backlog-manifest; expected exactly one current v3 backlog release, found ${candidates.length}`);
  [backlogManifestPath] = candidates;
}
const result = await buildBroadOrganizationAuthorizationProgram({ backlogManifestPath, outputRoot });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), jurisdictions: result.manifest.state_count, gate_items: result.manifest.gate_item_count, gate_keys: result.manifest.gate_key_count, source_backlog_release_id: result.manifest.source_backlog_release_id, reused_existing_release: result.reused_existing_release, source_actions_performed: 0, current_pointer_changed: false }, null, 2)}\n`);
