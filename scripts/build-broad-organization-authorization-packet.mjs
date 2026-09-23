import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  buildBroadOrganizationAuthorizationPacket,
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT,
  DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT,
} from "../runner/broad-organization-authorization-packet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let backlogManifestPath = null;
let outputRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT;
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if ((flag !== "--backlog-manifest" && flag !== "--out") || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("Usage: node scripts/build-broad-organization-authorization-packet.mjs [--backlog-manifest <manifest.json>] [--out <directory>]");
  }
  if (flag === "--backlog-manifest") backlogManifestPath = path.resolve(ROOT, args[index + 1]);
  else outputRoot = path.resolve(ROOT, args[index + 1]);
  index += 1;
}
if (!backlogManifestPath) {
  const releases = await readdir(DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT, { withFileTypes: true });
  const candidates = releases.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-acquisition-backlog-"));
  if (candidates.length !== 1) throw new Error(`Specify --backlog-manifest; expected exactly one backlog release, found ${candidates.length}`);
  backlogManifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT, candidates[0].name, "manifest.json");
}
const result = await buildBroadOrganizationAuthorizationPacket({ backlogManifestPath, outputRoot });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), jurisdictions: result.manifest.state_count, request_items: result.manifest.request_item_count, source_backlog_release_id: result.manifest.source_backlog_release_id, reused_existing_release: result.reused_existing_release, source_actions_performed: 0, current_pointer_changed: false }, null, 2)}\n`);
