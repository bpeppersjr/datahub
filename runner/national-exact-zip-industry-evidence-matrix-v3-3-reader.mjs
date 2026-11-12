import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const RELEASE = "national-exact-zip-industry-evidence-matrix-b74f7c9f4d63c5aa50bbfe05d5bd55ff04fa0fe774ae6f16c297734405e25b13", MANIFEST = "9967de9da79f8bbd1d2c80194df9a3f2a928664eaa7bc9b7a6bd55b9b35588ad", CHILDCARE = "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b";
const dimensions = ["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"];
const hash = (value) => createHash("sha256").update(value).digest("hex"), check = (value) => { if (!value) throw Error("Exact-ZIP v3.3 bounded reader rejected."); };
export async function readExactZipIndustryEvidenceV33({ root = APP_ROOT, zip5, signal } = {}) {
  check(/^\d{5}$/.test(zip5 ?? "")); signal?.throwIfAborted();
  const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-3.json"))), pin = registration.retained_release, manifestPath = path.join(root, pin.manifest), manifestBytes = await readFile(manifestPath);
  check(registration.schema_version === "3.3.0" && registration.runtime_pointer === null && registration.production_enrollment === false && pin.release_id === RELEASE && pin.manifest_sha256 === MANIFEST && pin.dimension_count === 51 && pin.industry_cells === 2457894 && hash(manifestBytes) === MANIFEST);
  const manifest = JSON.parse(manifestBytes), artifact = manifest.artifacts.find((item) => item.path === `prefix=${zip5.slice(0, 2)}.json`), gap = manifest.artifacts.find((item) => item.path === "retained-childcare-source-zip-gaps.json");
  check(manifest.release_id === RELEASE && manifest.bindings.retained_childcare_zip_evidence.release_id === CHILDCARE && JSON.stringify(manifest.bindings.replaced_dimensions) === JSON.stringify(dimensions) && artifact && gap);
  const bytes = await readFile(path.join(path.dirname(manifestPath), artifact.path)); check(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256);
  const rows = JSON.parse(bytes), row = rows.find((item) => item.zip5 === zip5) ?? null;
  check(rows.length === artifact.record_count && rows.every((item, index) => /^\d{5}$/.test(item.zip5) && (index === 0 || rows[index - 1].zip5 < item.zip5) && item.schema_version === "national-exact-zip-industry-evidence-row@3.3.0" && Object.keys(item.cells).length === 51 && dimensions.every((dimension) => item.cells[dimension]?.source_release_id === CHILDCARE)));
  return { schema_version: "national-exact-zip-industry-evidence-row@3.3.0", status: row ? "present" : "absent", row, release_id: RELEASE, manifest_sha256: MANIFEST, full_matrix_replay_performed: false, recursive_lineage_verified: true, gap_sidecars: { retained_childcare_source_zip_gaps: { path: gap.path, sha256: gap.sha256, record_count: gap.record_count } }, claims: manifest.claims };
}
