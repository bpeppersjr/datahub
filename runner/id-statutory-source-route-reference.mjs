import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const ID_REFERENCE_ID = "id-statutory-source-route-reference-2026-11-13";
export const ID_REFERENCE_PATH = "config/state-business-source-assessments/id-statutory-source-route-reference-2026-11-13.json";
export const ID_REFERENCE_SHA256 = "3104916fe6760f27577403fc69aaf87bdb0c793744eb0e23d71755b5d99d3401";
const CONTENT_SHA256 = "e9ce32339898a32ae44d0bca6d1689b105a38bb35b92a218d954a26d35e4f66a";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`ID statutory source-route reference rejected: ${message}`); };

// Documentary evidence only; neither a source contract nor acquisition authority.
export function validateIdStatutorySourceRouteReference(value) {
  if (value?.schema_version !== "id-statutory-source-route-reference@1.0.0"
      || value.reference_id !== ID_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "ID" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_product_verified !== false || value.current_schema_compatibility_verified !== false
      || value.connector_ready !== false || value.acquisition_authorized !== false
      || value.required_source_files !== 0 || value.source_records_acquired !== 0
      || value.broad_layer_gaps_resolved !== 0 || !value.authority
      || Object.values(value.authority).some(entry => entry !== false) || !value.controls
      || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) fail("authority or zero-record boundary drifted");
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyIdStatutorySourceRouteReferenceBytes(bytes) {
  if (digest(bytes) !== ID_REFERENCE_SHA256) fail("file bytes drifted");
  return validateIdStatutorySourceRouteReference(JSON.parse(bytes));
}

export async function loadIdStatutorySourceRouteReference({ root = APP_ROOT } = {}) {
  return verifyIdStatutorySourceRouteReferenceBytes(await readFile(path.join(root, ID_REFERENCE_PATH)));
}
