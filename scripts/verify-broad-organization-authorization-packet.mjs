import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT,
  verifyBroadOrganizationAuthorizationPacket,
} from "../runner/broad-organization-authorization-packet.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: node scripts/verify-broad-organization-authorization-packet.mjs [manifest.json]");
let manifestPath = args[0] ? path.resolve(ROOT, args[0]) : null;
if (!manifestPath) {
  const releasesDirectory = path.join(DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT, "releases");
  const releases = await readdir(releasesDirectory, { withFileTypes: true });
  const candidates = releases.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-authorization-packet-"));
  if (candidates.length !== 1) throw new Error(`Specify a manifest path; expected exactly one packet release, found ${candidates.length}`);
  manifestPath = path.join(releasesDirectory, candidates[0].name, "manifest.json");
}
const result = await verifyBroadOrganizationAuthorizationPacket(manifestPath);
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, jurisdictions: result.manifest.state_count, request_items: result.manifest.request_item_count, source_backlog_release_id: result.packet.source_backlog.release_id, acquisition_authorized: false, current_pointer_changed: false }, null, 2)}\n`);
