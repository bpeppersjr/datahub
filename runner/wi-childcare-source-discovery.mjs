import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import discovery from "../config/source-discoveries/wi-childcare-2026-10-07.json" with { type: "json" };
import { APP_ROOT } from "./paths.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function readWiChildcareSourceDiscovery({ root = APP_ROOT } = {}) {
  const base = await realpath(path.resolve(root)),
    file = path.resolve(
      base,
      discovery.retained_metadata_preflight.receipt_path,
    );
  if (
    !file.startsWith(`${base}${path.sep}`) ||
    discovery.state !== "WI" ||
    discovery.decision !==
      "official-licensed-group-arcgis-api-metadata-validated-use-decision-pending" ||
    discovery.access.supported_bulk_export_verified !== true ||
    discovery.access.supported_api_verified !== true ||
    discovery.access.record_acquisition_authorized !== false ||
    discovery.claims.provider_rows_acquired !== 0
  )
    throw Error("Wisconsin childcare source discovery rejected.");
  const bytes = await readFile(file),
    receipt = JSON.parse(bytes);
  if (
    bytes.length !== discovery.retained_metadata_preflight.receipt_bytes ||
    hash(bytes) !== discovery.retained_metadata_preflight.receipt_sha256 ||
    receipt.source?.source_record_count !==
      discovery.retained_metadata_preflight.source_record_count ||
    receipt.acquisition?.row_data_requests !== 0 ||
    receipt.acquisition?.acquisition_authorized !== false
  )
    throw Error("Wisconsin retained childcare preflight rejected.");
  return structuredClone(discovery);
}
