import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import discovery from "../config/source-discoveries/tn-childcare-2026-10-07.json" with { type: "json" };
import { APP_ROOT } from "./paths.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function readTnChildcareSourceDiscovery({ root = APP_ROOT } = {}) {
  const base = await realpath(path.resolve(root));
  const file = path.resolve(base, discovery.retained_release.manifest_path);
  if (
    !file.startsWith(`${base}${path.sep}`) ||
    discovery.state !== "TN" ||
    discovery.decision !==
      "official-center-only-arcgis-api-and-retained-release-validated" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Tennessee childcare source discovery rejected.");
  const bytes = await readFile(file);
  const manifest = JSON.parse(bytes);
  if (
    hash(bytes) !== discovery.retained_release.manifest_sha256 ||
    manifest.release_id !== discovery.retained_release.release_id ||
    manifest.counts?.selected !== discovery.retained_release.selected_rows ||
    manifest.counts?.accepted !== discovery.retained_release.accepted_rows ||
    manifest.postal_coverage?.available !==
      discovery.retained_release.zip5_available_rows ||
    manifest.postal_coverage.missing_source_zip +
      manifest.postal_coverage.invalid_source_zip_placeholder !==
      discovery.retained_release.zip5_unavailable_rows ||
    manifest.claims?.active_business_verified !== false ||
    manifest.claims?.export_authorized !== false
  )
    throw Error("Tennessee retained childcare release rejected.");
  return structuredClone(discovery);
}
