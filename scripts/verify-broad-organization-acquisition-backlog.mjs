import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
  verifyBroadOrganizationAcquisitionBacklog,
} from "../runner/broad-organization-acquisition-backlog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: node scripts/verify-broad-organization-acquisition-backlog.mjs [manifest.json]");
const manifestPath = args[0]
  ? path.resolve(ROOT, args[0])
  : path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases");
let selectedManifest = manifestPath;
if (!args[0]) {
  const { readdir } = await import("node:fs/promises");
  const releases = await readdir(manifestPath, { withFileTypes: true });
  const candidates = releases.filter((entry) => entry.isDirectory() && entry.name.startsWith("broad-organization-acquisition-backlog-"));
  if (candidates.length !== 1) throw new Error(`Expected exactly one backlog release; found ${candidates.length}`);
  selectedManifest = path.join(manifestPath, candidates[0].name, "manifest.json");
}
const result = await verifyBroadOrganizationAcquisitionBacklog(selectedManifest);
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, state_count: result.backlog.states.length, first_wave: result.backlog.scope.first_wave_state_abbreviations, acquisition_authorized: false }, null, 2)}\n`);
