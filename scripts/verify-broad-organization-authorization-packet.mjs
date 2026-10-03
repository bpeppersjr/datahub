import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
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
  const candidates = [];
  for (const entry of releases) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith("broad-organization-authorization-packet-")) continue;
    const candidatePath = path.join(releasesDirectory, entry.name, "manifest.json");
    try {
      const manifest = JSON.parse(await readFile(candidatePath, "utf8"));
      if (manifest.schema_version === "broad-organization-authorization-packet-manifest@2.0.0") candidates.push(candidatePath);
    } catch { /* Exact verification below remains authoritative. */ }
  }
  if (candidates.length !== 1) throw new Error(`Specify a manifest path; expected exactly one current v2 packet release, found ${candidates.length}`);
  [manifestPath] = candidates;
}
const result = await verifyBroadOrganizationAuthorizationPacket(manifestPath);
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, jurisdictions: result.manifest.state_count, request_items: result.manifest.request_item_count, source_backlog_release_id: result.packet.source_backlog.release_id, acquisition_authorized: false, network_requests: 0, current_pointer_changed: false }, null, 2)}\n`);
