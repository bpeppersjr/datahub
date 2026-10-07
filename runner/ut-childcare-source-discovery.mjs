import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import discovery from "../config/source-discoveries/ut-childcare-2026-10-07.json" with { type: "json" };
import { APP_ROOT } from "./paths.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function readUtChildcareSourceDiscovery({ root = APP_ROOT } = {}) {
  const base = await realpath(path.resolve(root));
  const file = path.resolve(base, discovery.retained_release.manifest_path);
  if (
    !file.startsWith(`${base}${path.sep}`) ||
    discovery.state !== "UT" ||
    discovery.decision !==
      "official-current-regulated-program-report-and-retained-center-release-validated" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== false ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Utah childcare source discovery rejected.");
  const bytes = await readFile(file);
  const manifest = JSON.parse(bytes);
  if (
    hash(bytes) !== discovery.retained_release.manifest_sha256 ||
    manifest.run_id !== discovery.retained_release.run_id ||
    manifest.source_release_id !==
      discovery.retained_release.source_release_id ||
    manifest.summary?.accepted_records !==
      discovery.retained_release.accepted_rows ||
    manifest.summary?.accepted_with_zip5 !==
      discovery.retained_release.zip5_available_rows ||
    manifest.summary?.accepted_with_points !==
      discovery.retained_release.geocoded_rows ||
    manifest.claims?.current_operations_verified !== false ||
    manifest.claims?.public_export_authorized !== false
  )
    throw Error("Utah retained childcare release rejected.");
  return structuredClone(discovery);
}
