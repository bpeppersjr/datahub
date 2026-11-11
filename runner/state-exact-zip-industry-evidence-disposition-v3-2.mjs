import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyRegisteredNationalExactZipIndustryEvidenceMatrixV32 } from "./national-exact-zip-industry-evidence-matrix-v3-2.mjs";

const DATASET = "state-exact-zip-industry-evidence-disposition";
const VERSION = `${DATASET}@3.2.0`;
const DIMENSION = "ny_retail_food_license_address_evidence_count";
const MATRIX_RELEASE = "national-exact-zip-industry-evidence-matrix-761d2ac95b7f954a0bd2c55039649030ce360f8c5bc6187f82c834241490b629";
const MATRIX_MANIFEST = "d4b2c8f50112fd16bea00769c3ac93b98b1ac2d14f334a3f9e448616931f01d1";
const PREDECESSOR_RELEASE = "state-exact-zip-industry-evidence-disposition-62e4ced49cfb1c0d41628864f1b867c8b89a9f58bec66de1e146568f777f544a";
const PREDECESSOR_MANIFEST = "1678f94007155d602dd9d803093c1efd368aa862498da8d0108a969b3b0d4f6e";
const PREDECESSOR_ARTIFACT = "647da886fc5dceec381b787d2309f593dcb4db6bc8dedb87c8774e2d405fe888";
const TERRITORIES = new Set(["60", "66", "69", "72", "78"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value) + "\n";
const check = (value, message) => { if (!value) throw new Error(`State v3.2 rejected: ${message}`); };

async function json(file, maximum = 100_000_000) {
  const bytes = await fs.readFile(file); check(bytes.length > 0 && bytes.length <= maximum, "bounded input");
  return { bytes, sha256: hash(bytes), value: JSON.parse(bytes) };
}

function blank(template) {
  return {
    dimension_id: DIMENSION,
    raw_status_counts: Object.fromEntries(Object.keys(template.raw_status_counts).map((key) => [key, 0])),
    derived_evidence_status_counts: Object.fromEntries(Object.keys(template.derived_evidence_status_counts).map((key) => [key, 0])),
    lifecycle_status_counts: Object.fromEntries(Object.keys(template.lifecycle_status_counts).map((key) => [key, 0])),
    count_sum: 0,
  };
}

function scope(row, zctaMap) {
  if (row.cohort_classification === "explicit-placeholder") return "explicit-placeholder";
  if (!row.zcta_geoid) return "non-zcta-unassigned";
  const overlay = zctaMap.get(row.zcta_geoid);
  if (!overlay || overlay.overlay_status !== "complete-within-tolerance") return "zcta-overlay-unresolved";
  if (overlay.crosses_state_boundary_materially) return "multi-state-material";
  const fips = overlay.dominant_state_geo_id.slice(-2);
  return `${TERRITORIES.has(fips) ? "territory" : "state"}:${fips}`;
}

async function inputs(root, signal) {
  const matrixVerified = await verifyRegisteredNationalExactZipIndustryEvidenceMatrixV32({ root, signal });
  check(matrixVerified.release_id === MATRIX_RELEASE && matrixVerified.manifest_sha256 === MATRIX_MANIFEST, "matrix verifier");
  const matrixRegistration = (await json(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json"))).value;
  const matrixPath = path.join(root, matrixRegistration.retained_release.manifest);
  const matrixRead = await json(matrixPath, 100_000), matrix = matrixRead.value;
  check(matrixRead.sha256 === MATRIX_MANIFEST && matrix.release_id === MATRIX_RELEASE, "matrix pin");

  const predecessorRegistration = (await json(path.join(root, "config/datasets/state-exact-zip-industry-evidence-disposition-v3-0.json"))).value;
  const predecessorPath = path.join(root, predecessorRegistration.retained_release.manifest);
  const predecessorRead = await json(predecessorPath, 100_000), predecessor = predecessorRead.value;
  const predecessorArtifact = predecessor.artifacts[0];
  const predecessorRowsRead = await json(path.join(path.dirname(predecessorPath), predecessorArtifact.path), 4_000_000);
  check(predecessor.release_id === PREDECESSOR_RELEASE && predecessorRead.sha256 === PREDECESSOR_MANIFEST
    && predecessorRowsRead.sha256 === PREDECESSOR_ARTIFACT && predecessorRowsRead.value.length === 60, "predecessor state pin");

  const crosswalkPointer = (await json(path.join(root, "data/zcta-jurisdiction-crosswalk/current.json"))).value;
  const crosswalkPath = path.join(root, "data/zcta-jurisdiction-crosswalk", crosswalkPointer.manifest);
  const crosswalkRead = await json(crosswalkPath, 1_000_000), crosswalk = crosswalkRead.value;
  const zctaArtifact = crosswalk.artifacts.find((artifact) => artifact.artifact_type === "zcta-overlay-summary");
  const zctaBytes = await fs.readFile(path.join(path.dirname(crosswalkPath), zctaArtifact.path));
  check(crosswalkRead.sha256 === predecessor.bindings.crosswalk.manifest_sha256
    && hash(zctaBytes) === predecessor.bindings.crosswalk.zcta_artifact_sha256, "crosswalk pin");
  const zctaMap = new Map(zctaBytes.toString().trim().split(/\r?\n/).map(JSON.parse).map((row) => [row.zcta, row]));
  check(zctaMap.size === 33791, "crosswalk roster");
  return { root, matrix, matrixPath, predecessor, predecessorRead, predecessorArtifact,
    predecessorRows: predecessorRowsRead.value, zctaMap, crosswalk: predecessor.bindings.crosswalk };
}

async function compose(input) {
  const rows = new Map(input.predecessorRows.map((row) => {
    const template = row.dimensions[DIMENSION];
    return [row.scope_id, { ...row, dimensions: { ...row.dimensions, [DIMENSION]: blank(template) } }];
  }));
  for (const artifact of input.matrix.artifacts.filter((item) => /^prefix=\d{2}\.json$/.test(item.path))) {
    const read = await json(path.join(path.dirname(input.matrixPath), artifact.path), 30_000_000);
    check(read.sha256 === artifact.sha256 && read.value.length === artifact.record_count, "matrix partition pin");
    for (const row of read.value) {
      const destination = rows.get(scope(row, input.zctaMap)); check(destination, "scope assignment");
      const cell = row.cells[DIMENSION], dimension = destination.dimensions[DIMENSION];
      check(["positive", "measured-zero", "outside-source-denominator"].includes(cell.status), "New York status");
      dimension.raw_status_counts[cell.status]++;
      dimension.derived_evidence_status_counts[cell.status === "positive" ? "evidence-present" : cell.status]++;
      dimension.lifecycle_status_counts[cell.status === "positive"
        ? "non-active-reporting-positive" : "non-active-reporting-without-positive-evidence"]++;
      if (cell.count !== null) dimension.count_sum += cell.count;
    }
  }
  const output = [...rows.values()].sort((left, right) => left.scope_id.localeCompare(right.scope_id));
  check(output.length === 60 && output.reduce((total, row) => total + row.zip5_rows, 0) === 48194, "scope conservation");
  const sum = (status, group = "raw_status_counts") => output.reduce((total, row) => total + row.dimensions[DIMENSION][group][status], 0);
  check(sum("positive") === 1497 && sum("measured-zero") === 36339 && sum("outside-source-denominator") === 10358
    && sum("non-active-reporting-positive", "lifecycle_status_counts") === 1497
    && sum("non-active-reporting-without-positive-evidence", "lifecycle_status_counts") === 46697
    && output.reduce((total, row) => total + row.dimensions[DIMENSION].count_sum, 0) === 23663, "New York conservation");
  for (const row of output) {
    check(Object.keys(row.dimensions).length === 51, "dimension count");
    for (const dimension of Object.values(row.dimensions)) for (const group of ["raw_status_counts", "derived_evidence_status_counts", "lifecycle_status_counts"])
      check(Object.values(dimension[group]).reduce((total, count) => total + count, 0) === row.zip5_rows, "dimension conservation");
  }
  return output;
}

const claims = () => ({
  predecessor_dimensions_preserved: true, ny_retail_food_address_raw_states_preserved: true,
  derived_readiness_separate: true, publisher_membership: "New York Agriculture and Markets annual licensed retail-food-store snapshot",
  lifecycle_status: "non-active-reporting", review_qualification: "within-review-window", publisher_scope: "New York State",
  complete_selected_official_view_snapshot: true, current_operations_verified: false, continuous_operation_verified: false,
  complete_all_businesses: false, site_occupancy_verified: false, public_access_verified: false,
  source_coordinates_available: true, nonadditive_with_ny_retail_food_location_profiles: true,
  address_evidence_may_not_qualify_as_physical_site: true, source_coordinates_are_verified_premises: false,
  record_export_policy: "local-review-only", aggregate_export_policy: "public-under-open-ny-terms-with-attribution-and-limitations",
  identity_merges: false, entity_resolution_applied: false, unique_business_count: null,
  current_operating_business_count: null, production_enrollment: false, network_requests: 0, current_pointer_written: false,
});

function body(input, artifact) {
  return { schema_version: VERSION, dataset_id: DATASET, status: "immutable-pointer-free-local-review-only",
    publication_mode: "pointer-free", bindings: {
      matrix: { release_id: input.matrix.release_id, manifest_sha256: MATRIX_MANIFEST },
      predecessor_state: { release_id: input.predecessor.release_id, manifest_sha256: input.predecessorRead.sha256,
        artifact_sha256: input.predecessorArtifact.sha256 }, crosswalk: input.crosswalk,
      ny_retail_food_license_snapshot: input.matrix.bindings.ny_retail_food_license_snapshot,
    }, summary: { scope_rows: 60, state_scope_rows: 51, territory_scope_rows: 5, special_scope_rows: 4,
      zip5_rows: 48194, dimension_count: 51, industry_cells: 2457894,
      raw_status_vocabulary: input.predecessor.summary.raw_status_vocabulary,
      derived_evidence_status_vocabulary: input.predecessor.summary.derived_evidence_status_vocabulary,
      lifecycle_status_vocabulary: input.predecessor.summary.lifecycle_status_vocabulary,
    }, claims: claims(), artifacts: [artifact] };
}

export async function buildStateExactZipIndustryEvidenceDispositionV32({ root = APP_ROOT,
  outputRoot = path.join(APP_ROOT, "data/state-exact-zip-industry-evidence-disposition-v3-2"), signal } = {}) {
  const input = await inputs(path.resolve(root), signal), rows = await compose(input), bytes = Buffer.from(stable(rows));
  const artifact = { path: "state-dispositions.json", artifact_type: "state-exact-zip-industry-evidence-dispositions-v3-2",
    record_count: 60, bytes: bytes.length, sha256: hash(bytes) };
  const manifestBody = body(input, artifact), releaseId = `${DATASET}-${hash(JSON.stringify(manifestBody))}`;
  const manifest = { release_id: releaseId, ...manifestBody }, directory = path.join(outputRoot, "releases", releaseId);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, content] of [[artifact.path, bytes], ["manifest.json", Buffer.from(stable(manifest))]]) {
    const destination = path.join(directory, name);
    await fs.writeFile(destination, content, { flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error; check(hash(await fs.readFile(destination)) === hash(content), "immutable drift");
    });
  }
  return verifyStateExactZipIndustryEvidenceDispositionV32(path.join(directory, "manifest.json"), { root, signal });
}

export async function verifyStateExactZipIndustryEvidenceDispositionV32(manifestPath, { root = APP_ROOT, signal } = {}) {
  const input = await inputs(path.resolve(root), signal), rows = await compose(input), expectedBytes = Buffer.from(stable(rows));
  const manifestRead = await json(path.resolve(manifestPath), 100_000), manifest = manifestRead.value, artifact = manifest.artifacts?.[0];
  check(artifact?.sha256 === hash(expectedBytes) && artifact.bytes === expectedBytes.length && artifact.record_count === 60
    && hash(await fs.readFile(path.join(path.dirname(manifestPath), artifact.path))) === artifact.sha256, "artifact");
  const expectedBody = body(input, artifact);
  check(manifest.release_id === `${DATASET}-${hash(JSON.stringify(expectedBody))}`
    && JSON.stringify(manifest) === JSON.stringify({ release_id: manifest.release_id, ...expectedBody }), "manifest");
  return { verified: true, release_id: manifest.release_id, manifest_sha256: manifestRead.sha256,
    manifest_bytes: manifestRead.bytes.length, artifact_sha256: artifact.sha256, artifact_bytes: artifact.bytes,
    scope_rows: 60, dimension_count: 51, industry_cells: 2457894 };
}

export async function verifyRegisteredStateExactZipIndustryEvidenceDispositionV32({ root = APP_ROOT, signal } = {}) {
  const registration = (await json(path.join(root, "config/datasets/state-exact-zip-industry-evidence-disposition-v3-2.json"))).value;
  const pin = registration.retained_release;
  const verified = await verifyStateExactZipIndustryEvidenceDispositionV32(path.join(root, pin.manifest), { root, signal });
  check(registration.schema_version === "3.2.0" && registration.runtime_pointer === null && registration.production_enrollment === false
    && verified.release_id === pin.release_id && verified.manifest_sha256 === pin.manifest_sha256
    && verified.manifest_bytes === pin.manifest_bytes && verified.artifact_sha256 === pin.artifact_sha256
    && verified.artifact_bytes === pin.artifact_bytes && verified.scope_rows === pin.scope_rows
    && verified.dimension_count === pin.dimension_count && verified.industry_cells === pin.industry_cells, "registration");
  return verified;
}
