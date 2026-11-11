import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { readExactZipIndustryEvidenceV30 } from "./national-exact-zip-industry-evidence-matrix-v3-0-reader.mjs";

const RELEASE = "national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629";
const MANIFEST = "d4b2c8f50112fd16bea00769c3ac93b98b1ac2d14f334a3f9e448616931f01d1";
const DIMENSION = "ny_retail_food_license_address_evidence_count";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const check = (value) => { if (!value) throw new Error("Exact-ZIP v3.2 bounded reader rejected."); };

export async function readExactZipIndustryEvidenceV32({ root = APP_ROOT, zip5, signal } = {}) {
  check(/^\d{5}$/.test(zip5 ?? "")); signal?.throwIfAborted();
  const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json")));
  const pin = registration.retained_release, manifestPath = path.join(root, pin.manifest);
  const manifestBytes = await readFile(manifestPath);
  check(registration.schema_version === "3.2.0" && registration.runtime_pointer === null && registration.production_enrollment === false
    && registration.replaced_dimension === DIMENSION && pin.release_id === RELEASE && pin.manifest_sha256 === MANIFEST
    && pin.dimension_count === 51 && pin.industry_cells === 2457894 && hash(manifestBytes) === pin.manifest_sha256);
  const manifest = JSON.parse(manifestBytes);
  const artifact = manifest.artifacts.find((item) => item.path === `prefix=${zip5.slice(0, 2)}.json`);
  check(manifest.release_id === RELEASE && manifest.bindings.replaced_dimension === DIMENSION
    && artifact && /^prefix=\d{2}\.json$/.test(artifact.path));
  const artifactBytes = await readFile(path.join(path.dirname(manifestPath), artifact.path));
  check(artifactBytes.length === artifact.bytes && hash(artifactBytes) === artifact.sha256);
  const rows = JSON.parse(artifactBytes), row = rows.find((item) => item.zip5 === zip5) ?? null;
  check(rows.length === artifact.record_count && rows.every((item, index) => /^\d{5}$/.test(item.zip5)
    && (index === 0 || rows[index - 1].zip5 < item.zip5)
    && item.schema_version === "national-exact-zip-industry-evidence-row@3.2.0"
    && Object.keys(item.cells).length === 51 && Object.hasOwn(item.cells, DIMENSION)));
  const predecessor = await readExactZipIndustryEvidenceV30({ root, zip5, signal });
  check(predecessor.release_id === manifest.bindings.predecessor.release_id
    && predecessor.manifest_sha256 === manifest.bindings.predecessor.manifest_sha256);
  return { schema_version: "national-exact-zip-industry-evidence-row@3.2.0", status: row ? "present" : "absent", row,
    release_id: manifest.release_id, manifest_sha256: hash(manifestBytes), full_matrix_replay_performed: false,
    recursive_lineage_verified: true, gap_sidecars: predecessor.gap_sidecars, claims: manifest.claims };
}
