import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { readExactZipIndustryEvidenceV29 } from "./national-exact-zip-industry-evidence-matrix-v2-9-reader.mjs";

const RELEASE = "national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9";
const MANIFEST = "07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7";
const DIMENSION = "ny_retail_food_license_address_evidence_count";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const check = (value) => { if (!value) throw new Error("Exact-ZIP v3.0 bounded reader rejected."); };

export async function readExactZipIndustryEvidenceV30({ root = APP_ROOT, zip5, signal } = {}) {
  check(/^\d{5}$/.test(zip5 ?? ""));
  signal?.throwIfAborted();
  const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-0.json")));
  const pin = registration.retained_release;
  const manifestPath = path.join(root, pin.manifest);
  const manifestBytes = await readFile(manifestPath);
  check(registration.schema_version === "3.0.0" && registration.runtime_pointer === null && registration.production_enrollment === false
    && pin.release_id === RELEASE && pin.manifest_sha256 === MANIFEST && pin.dimension_count === 51 && pin.industry_cells === 2457894
    && hash(manifestBytes) === pin.manifest_sha256);
  const manifest = JSON.parse(manifestBytes);
  const artifact = manifest.artifacts.find((item) => item.path === `prefix=${zip5.slice(0, 2)}.json`);
  check(manifest.release_id === RELEASE && artifact && /^prefix=\d{2}\.json$/.test(artifact.path));
  const artifactBytes = await readFile(path.join(path.dirname(manifestPath), artifact.path));
  check(artifactBytes.length === artifact.bytes && hash(artifactBytes) === artifact.sha256);
  const rows = JSON.parse(artifactBytes);
  const row = rows.find((item) => item.zip5 === zip5) ?? null;
  check(rows.length === artifact.record_count && rows.every((item, index) => /^\d{5}$/.test(item.zip5)
    && (index === 0 || rows[index - 1].zip5 < item.zip5)
    && item.schema_version === "national-exact-zip-industry-evidence-row@3.0.0"
    && Object.keys(item.cells).length === 51 && Object.hasOwn(item.cells, DIMENSION)));
  const prior = await readExactZipIndustryEvidenceV29({ root, zip5, signal });
  check(prior.release_id === manifest.bindings.predecessor.release_id && prior.manifest_sha256 === manifest.bindings.predecessor.manifest_sha256);
  return { schema_version: "national-exact-zip-industry-evidence-row@3.0.0", status: row ? "present" : "absent", row,
    release_id: manifest.release_id, manifest_sha256: hash(manifestBytes), full_matrix_replay_performed: false,
    recursive_lineage_verified: true, gap_sidecars: prior.gap_sidecars, claims: manifest.claims };
}
