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
  const { readFile, readdir } = await import("node:fs/promises");
  const releases = await readdir(manifestPath, { withFileTypes: true });
  const candidates = [];
  for (const entry of releases) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith("broad-organization-acquisition-backlog-")) continue;
    try {
      const candidate = JSON.parse(await readFile(path.join(manifestPath, entry.name, "manifest.json"), "utf8"));
      if (candidate.schema_version === "broad-organization-acquisition-backlog-manifest@2.0.0") candidates.push(entry);
    } catch { /* The verifier below remains authoritative; ignore non-current unreadable historical entries. */ }
  }
  if (candidates.length !== 1) throw new Error(`Expected exactly one current backlog release; found ${candidates.length}`);
  selectedManifest = path.join(manifestPath, candidates[0].name, "manifest.json");
}
const result = await verifyBroadOrganizationAcquisitionBacklog(selectedManifest);
process.stdout.write(`${JSON.stringify({ status: "verified", release_id: result.manifest.release_id, state_count: result.backlog.states.length, first_wave: result.backlog.scope.first_wave_state_abbreviations, acquisition_authorized: false }, null, 2)}\n`);
