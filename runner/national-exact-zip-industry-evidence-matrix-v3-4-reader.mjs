import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const RELEASE = "national-exact-zip-industry-evidence-matrix-384004fd1ea98f4c938194fdb425c747f9c7b5d9c1c1e0b3e051f3fffc21cdb1";
const MANIFEST = "684696094db7e73753ef73f6301543306fbd0c130e7300ab5600268bde1352b3";
const CHILDCARE = "retained-childcare-zip-evidence-fff67989bf590fe4c4c878c6fd5dffdbaeb612a10deeed8ac049997716da2e0e";
const dimensions = ["childcare_pa_candidates", "childcare_ct_candidates", "childcare_md_candidates", "childcare_vt_candidates", "childcare_co_candidates", "childcare_ut_candidates", "childcare_ia_candidates"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const check = (value) => { if (!value) throw Error("Exact-ZIP v3.4 bounded reader rejected."); };

export async function readExactZipIndustryEvidenceV34({ root = APP_ROOT, zip5, signal } = {}) {
  check(/^\d{5}$/.test(zip5 ?? "")); signal?.throwIfAborted();
  const manifestPath = path.join(root, "data/national-exact-zip-industry-evidence-matrix-v3-4/releases", RELEASE, "manifest.json");
  const manifestBytes = await readFile(manifestPath); check(hash(manifestBytes) === MANIFEST);
  const manifest = JSON.parse(manifestBytes), artifact = manifest.artifacts.find((item) => item.path === `prefix=${zip5.slice(0, 2)}.json`), gap = manifest.artifacts.find((item) => item.path === "retained-childcare-source-zip-gaps.json");
  check(manifest.release_id === RELEASE && manifest.schema_version === "national-exact-zip-industry-evidence-matrix@3.4.0" && manifest.status === "immutable-pointer-free-local-review-only" && manifest.bindings.retained_childcare_zip_evidence.release_id === CHILDCARE && JSON.stringify(manifest.bindings.replaced_dimensions) === JSON.stringify(dimensions) && artifact && gap);
  const bytes = await readFile(path.join(path.dirname(manifestPath), artifact.path)); check(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256);
  const rows = JSON.parse(bytes), row = rows.find((item) => item.zip5 === zip5) ?? null;
  check(rows.length === artifact.record_count && rows.every((item, index) => /^\d{5}$/.test(item.zip5) && (index === 0 || rows[index - 1].zip5 < item.zip5) && item.schema_version === "national-exact-zip-industry-evidence-row@3.4.0" && Object.keys(item.cells).length === 51 && dimensions.every((dimension) => item.cells[dimension]?.source_release_id === CHILDCARE)));
  return { schema_version: "national-exact-zip-industry-evidence-row@3.4.0", status: row ? "present" : "absent", row, release_id: RELEASE, manifest_sha256: MANIFEST, full_matrix_replay_performed: false, recursive_lineage_verified: true, gap_sidecars: { retained_childcare_source_zip_gaps: { path: gap.path, sha256: gap.sha256, record_count: gap.record_count } }, claims: manifest.claims };
}
