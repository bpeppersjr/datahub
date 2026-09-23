import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { APP_ROOT } from "./paths.mjs";
import { verifyNationalGeographyGoalStatus } from "./national-geography-goal-status.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fail() { throw new Error("National geography goal status view unavailable."); }

export async function loadNationalGeographyGoalStatusView({ root = APP_ROOT, verifier = verifyNationalGeographyGoalStatus } = {}) {
  root = await realpath(path.resolve(root));
  const configPath = path.join(root, "config", "datasets", "national-geography-goal-status.json");
  const configBytes = await readFile(configPath); let config;
  try { config = JSON.parse(configBytes); } catch { fail(); }
  const selected = config.selected_release;
  if (config.dataset_id !== "national-geography-goal-status" || config.schema_version !== "national-geography-goal-status@1.0.0" || config.current_pointer !== null || config.record_rows_exposed !== false || config.zip_lists_exposed !== false || config.production_pointer_changes !== false || typeof selected?.manifest_path !== "string") fail();
  const manifestPath = path.resolve(root, selected.manifest_path);
  if (!manifestPath.startsWith(path.join(root, "data", "national-geography-goal-status", "releases") + path.sep)) fail();
  const manifestBytes = await readFile(manifestPath);
  if (hash(manifestBytes) !== selected.manifest_sha256) fail();
  const verified = await verifier(manifestPath, { root });
  if (verified.release_id !== selected.release_id || verified.manifest_sha256 !== selected.manifest_sha256 || verified.artifact_sha256 !== selected.artifact_sha256) fail();
  const item = verified.artifact;
  return {
    schema_version: "national-geography-goal-status-management-view@1.0.0",
    available: true,
    release: { release_id: item.release_id, manifest_sha256: verified.manifest_sha256, artifact_sha256: verified.artifact_sha256, created_at: item.created_at },
    census_polygon_completeness: structuredClone(item.census_polygon_completeness),
    temporal_vintage: structuredClone(item.temporal_vintage),
    overlay_diagnostics: structuredClone(item.overlay_diagnostics),
    usps_operational_denominator: structuredClone(item.usps_operational_denominator),
    zip4: structuredClone(item.zip4),
    claim_boundaries: structuredClone(item.claim_boundaries),
    execution: { network_requests: item.network_requests, production_pointer_changes: item.production_pointer_changes, current_pointer_present: false, read_only: true },
  };
}
