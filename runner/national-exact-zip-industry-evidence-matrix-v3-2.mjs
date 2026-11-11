import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyRegisteredNationalExactZipIndustryEvidenceMatrixV30 } from "./national-exact-zip-industry-evidence-matrix-v3-0.mjs";

const DATASET = "national-exact-zip-industry-evidence-matrix";
const DIMENSION = "ny_retail_food_license_address_evidence_count";
const PREDECESSOR = "national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9";
const PREDECESSOR_MANIFEST = "07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7";
const CONFIG_SHA256 = "ca13462fc50c1f39f497b0f6c369f307e1a0762a80c7205235ee81100ad0bbd9";
const POINTER_SHA256 = "138e81d46aebeeab01cdc1f1555e3c2e46d52896b27ec08ede02a2e1c17292c3";
const RELEASE = "ny-retail-food-stores-20261111-232147684Z-a758a52c";
const SOURCE_RELEASE = "ny-retail-food-stores-2026-10-14-7f9dc6f0449f76e0";
const SOURCE_UPDATED_AT = "2026-10-14T19:08:34.000Z";
const SOURCE_REFERENCE_DATE = "2026-10-14";
const REVIEW_DUE_AT = "2027-02-11T19:08:34.000Z";
const MANIFEST_SHA256 = "f207c68e2427c0647c71b92b20dc95d32662c96a55d5d89e39bcc53349f0aadc";
const ZIP_SHA256 = "62a23d9c7f05a4e6de636eda1bf4337d3f51b7b7526f55a11f711bf58029196e";
const MEMBER_SHA256 = "d99311e495d8a3999d95067ff68c1a5f120753739d6df2f6adcd4a14f8851d16";
const WEIGHTED_SHA256 = "eca1b5af164c581fb0d0c2ed519f0a38898904a56ab88c759af116768f996612";
const PREFIX = /^prefix=\d{2}\.json$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const digest = (values) => hash(values.sort().join("\n") + "\n");
const check = (value, message) => { if (!value) throw new Error(`v3.2 rejected: ${message}`); };

const claims = () => ({
  publisher_membership: "New York Agriculture and Markets annual licensed retail-food-store snapshot",
  lifecycle_status: "non-active-reporting",
  publisher_scope: "New York State",
  current_operations_verified: false,
  continuous_operation_verified: false,
  site_occupancy_verified: false,
  public_access_verified: false,
  unique_business_count: null,
  complete_selected_official_view_snapshot: true,
  complete_all_businesses: false,
  source_coordinates_available: true,
  source_coordinates_are_verified_premises: false,
  usps_validity: null,
  zcta_is_zip_geometry: false,
  nonadditive_with_ny_retail_food_location_profiles: true,
  address_evidence_may_not_qualify_as_physical_site: true,
  record_export_policy: "local-review-only",
  aggregate_export_policy: "public-under-open-ny-terms-with-attribution-and-limitations",
  production_enrollment: false,
  network_requests: 0,
  current_pointer_written: false,
});

const replacementCell = (source) => ({
  status: source ? (source.licensed_location_address_count > 0 ? "positive" : "measured-zero") : "outside-source-denominator",
  count: source ? source.licensed_location_address_count : null,
  measure: "source_reported_retail_food_license_location_addresses",
  source_release_id: SOURCE_RELEASE,
  source_rows_updated_at: SOURCE_UPDATED_AT,
  source_filter_reference_date: SOURCE_REFERENCE_DATE,
  temporal_status: {
    status: "within-review-window",
    review_due_at: REVIEW_DUE_AT,
    source_status: "annual-current-snapshot-membership-not-current-operation",
    current_operations_verified: false,
  },
});

function validateSummary(summary) {
  check(summary.zip5_rows === 48194 && summary.dimension_count === 51 && summary.industry_cells === 2457894
    && summary.positive_zip5_rows === 1497 && summary.measured_zero_zip5_rows === 36339
    && summary.outside_denominator_zip5_rows === 10358 && summary.address_evidence_sum === 23663
    && summary.member_sha256 === MEMBER_SHA256 && summary.weighted_sha256 === WEIGHTED_SHA256
    && summary.source_license_records === 23664 && summary.organizations_published === 23664
    && summary.provisional_physical_sites === 23608 && summary.provisional_establishments === 23608
    && summary.organizations_without_complete_site_address === 56 && summary.zip_evidence_addresses === 23663
    && summary.usable_platform_geocodes === 22463 && summary.quarantined_source_records === 0
    && summary.source_zip_codes === 1497 && summary.zip_union_records === 37836
    && summary.rows_with_undocumented_establishment_codes === 19, `summary ${JSON.stringify(summary)}`);
}

async function inputs(root, signal) {
  const predecessor = await verifyRegisteredNationalExactZipIndustryEvidenceMatrixV30({ root, signal });
  check(predecessor.release_id === PREDECESSOR && predecessor.manifest_sha256 === PREDECESSOR_MANIFEST, "predecessor");
  const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-0.json")));
  const predecessorManifest = JSON.parse(await readFile(path.join(root, registration.retained_release.manifest)));
  const configBytes = await readFile(path.join(root, "config/datasets/ny-retail-food-store-license-sites-v20261111.json"));
  const pointerBytes = await readFile(path.join(root, "config/datasets/ny-retail-food-store-license-sites-pointer-v20261111.json"));
  check(hash(configBytes) === CONFIG_SHA256 && hash(pointerBytes) === POINTER_SHA256, "New York registration");
  const sourceRegistration = JSON.parse(configBytes), pointer = JSON.parse(pointerBytes);
  check(sourceRegistration.current_verified_release?.release_id === RELEASE
    && sourceRegistration.current_verified_release?.manifest_sha256 === MANIFEST_SHA256
    && pointer.release_id === RELEASE, "New York release registration");
  const sourceManifestPath = path.join(root, "data/business-sources/ny-retail-food-store-license-sites", pointer.manifest);
  const sourceManifestBytes = await readFile(sourceManifestPath);
  check(hash(sourceManifestBytes) === MANIFEST_SHA256, "New York manifest");
  const sourceManifest = JSON.parse(sourceManifestBytes);
  const zipArtifact = sourceManifest.artifacts.find((artifact) => artifact.path === "derived/zip-coverage.jsonl");
  const zipBytes = await readFile(path.join(path.dirname(sourceManifestPath), zipArtifact.path));
  check(sourceManifest.release_id === RELEASE && sourceManifest.source_release_id === SOURCE_RELEASE
    && sourceManifest.complete_selected_license_snapshot === true && sourceManifest.artifacts.length === 7
    && sourceManifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0) === 48577422
    && zipArtifact.sha256 === ZIP_SHA256 && hash(zipBytes) === ZIP_SHA256 && zipArtifact.record_count === 37836,
  "New York ZIP artifact");
  const sourceMap = new Map(zipBytes.toString().trim().split(/\r?\n/).map(JSON.parse)
    .map((row) => [row.zip_code, row.ny_retail_food_store_license_snapshot]));
  const coverage = sourceManifest.coverage;
  check(sourceMap.size === 37836 && coverage.source_license_records === 23664
    && coverage.organizations_published === 23664 && coverage.provisional_physical_sites === 23608
    && coverage.provisional_establishments === 23608 && coverage.organizations_without_complete_site_address === 56
    && coverage.zip_evidence_addresses === 23663 && coverage.usable_platform_geocodes === 22463
    && coverage.quarantined_source_records === 0 && coverage.source_zip_codes === 1497
    && coverage.zip_union_records === 37836 && coverage.rows_with_undocumented_establishment_codes === 19,
  "New York conservation");
  const artifactHash = (artifactPath) => sourceManifest.artifacts.find((artifact) => artifact.path === artifactPath)?.sha256;
  return {
    predecessorManifest,
    predecessorDirectory: path.dirname(path.join(root, registration.retained_release.manifest)),
    sourceMap,
    bindings: {
      predecessor: { release_id: PREDECESSOR, manifest_sha256: PREDECESSOR_MANIFEST },
      replaced_dimension: DIMENSION,
      ny_retail_food_license_snapshot: {
        config_sha256: CONFIG_SHA256, pointer_sha256: POINTER_SHA256, release_id: RELEASE,
        source_release_id: SOURCE_RELEASE, manifest_sha256: MANIFEST_SHA256,
        manifest_bytes: sourceManifestBytes.length,
        policy_sha256: hash(await readFile(path.join(root, "config/source-policies/ny-retail-food-stores.json"))),
        source_artifact_sha256: artifactHash("source/retail-food-stores-selected-fields.jsonl.gz"),
        metadata_sha256: artifactHash("source/release-metadata.json"), zip_coverage_sha256: ZIP_SHA256,
        source_summary_sha256: artifactHash("derived/source-summary.json"),
        quarantine_sha256: artifactHash("derived/quarantine/invalid-records.jsonl.gz"),
      },
    },
  };
}

async function compose(input, write) {
  const artifacts = [], members = [], weighted = [];
  let positive = 0, zero = 0, outside = 0, sum = 0;
  for (const artifact of input.predecessorManifest.artifacts) {
    const bytes = await readFile(path.join(input.predecessorDirectory, artifact.path));
    check(hash(bytes) === artifact.sha256, "predecessor artifact");
    if (!PREFIX.test(artifact.path)) { await write?.(artifact, bytes); artifacts.push(artifact); continue; }
    const rows = JSON.parse(bytes);
    for (const row of rows) {
      const source = input.sourceMap.get(row.zip5);
      check(Object.hasOwn(row.cells, DIMENSION), "predecessor New York dimension");
      row.schema_version = "national-exact-zip-industry-evidence-row@3.2.0";
      row.cells[DIMENSION] = replacementCell(source);
      if (!source) outside++;
      else if (source.licensed_location_address_count > 0) {
        positive++; sum += source.licensed_location_address_count; members.push(row.zip5);
        weighted.push(`${row.zip5}|${source.licensed_location_address_count}`);
      } else zero++;
    }
    const nextBytes = Buffer.from(JSON.stringify(rows) + "\n");
    const nextArtifact = { path: artifact.path, bytes: nextBytes.length, sha256: hash(nextBytes), record_count: rows.length };
    await write?.(nextArtifact, nextBytes); artifacts.push(nextArtifact);
  }
  const summary = {
    zip5_rows: 48194, dimension_count: 51, industry_cells: 2457894,
    positive_zip5_rows: positive, measured_zero_zip5_rows: zero, outside_denominator_zip5_rows: outside,
    address_evidence_sum: sum, member_sha256: digest(members), weighted_sha256: digest(weighted),
    source_license_records: 23664, organizations_published: 23664, provisional_physical_sites: 23608,
    provisional_establishments: 23608, organizations_without_complete_site_address: 56,
    zip_evidence_addresses: 23663, usable_platform_geocodes: 22463, quarantined_source_records: 0,
    source_zip_codes: 1497, zip_union_records: 37836, rows_with_undocumented_establishment_codes: 19,
  };
  validateSummary(summary);
  return { artifacts, summary };
}

const manifestBody = (artifacts, summary, bindings) => ({
  schema_version: "national-exact-zip-industry-evidence-matrix@3.2.0", dataset_id: DATASET,
  status: "immutable-pointer-free-local-review-only", claims: claims(), bindings, summary, artifacts,
});

export async function buildNationalExactZipIndustryEvidenceMatrixV32({
  root = APP_ROOT,
  outputRoot = path.join(APP_ROOT, "data/national-exact-zip-industry-evidence-matrix-v3-2"),
  signal,
} = {}) {
  const input = await inputs(root, signal), stage = path.join(outputRoot, `.staging-${randomUUID()}`);
  await mkdir(stage, { recursive: true });
  try {
    const result = await compose(input, async (artifact, bytes) => {
      const destination = path.join(stage, artifact.path); await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
    });
    const body = manifestBody(result.artifacts, result.summary, input.bindings);
    const releaseId = `${DATASET}-${hash(JSON.stringify(body))}`;
    await writeFile(path.join(stage, "manifest.json"), JSON.stringify({ release_id: releaseId, ...body }, null, 2) + "\n", { flag: "wx" });
    await mkdir(path.join(outputRoot, "releases"), { recursive: true });
    const releaseDirectory = path.join(outputRoot, "releases", releaseId);
    await rename(stage, releaseDirectory);
    return { release_id: releaseId, manifest: path.join(releaseDirectory, "manifest.json"), summary: result.summary };
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}

export async function verifyNationalExactZipIndustryEvidenceMatrixV32(manifestPath, { root = APP_ROOT, signal } = {}) {
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  const input = await inputs(root, signal), replay = await compose(input);
  check(JSON.stringify(manifest.summary) === JSON.stringify(replay.summary)
    && JSON.stringify(manifest.artifacts) === JSON.stringify(replay.artifacts)
    && JSON.stringify(manifest.bindings) === JSON.stringify(input.bindings)
    && JSON.stringify(manifest.claims) === JSON.stringify(claims())
    && manifest.release_id === `${DATASET}-${hash(JSON.stringify(manifestBody(manifest.artifacts, manifest.summary, manifest.bindings)))}`,
  "replay");
  for (const artifact of manifest.artifacts) check(hash(await readFile(path.join(path.dirname(manifestPath), artifact.path))) === artifact.sha256, "artifact");
  return { verified: true, release_id: manifest.release_id, manifest_sha256: hash(manifestBytes), manifest_bytes: manifestBytes.length, summary: manifest.summary };
}

export async function verifyRegisteredNationalExactZipIndustryEvidenceMatrixV32({ root = APP_ROOT, signal } = {}) {
  const registration = JSON.parse(await readFile(path.join(root, "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json")));
  const verified = await verifyNationalExactZipIndustryEvidenceMatrixV32(path.join(root, registration.retained_release.manifest), { root, signal });
  check(registration.schema_version === "3.2.0" && registration.runtime_pointer === null && registration.production_enrollment === false
    && verified.release_id === registration.retained_release.release_id
    && verified.manifest_sha256 === registration.retained_release.manifest_sha256
    && verified.manifest_bytes === registration.retained_release.manifest_bytes
    && verified.summary.zip5_rows === registration.retained_release.zip5_rows
    && verified.summary.dimension_count === registration.retained_release.dimension_count
    && verified.summary.industry_cells === registration.retained_release.industry_cells, "registration");
  return verified;
}

export const V32_TEST = { claims, replacementCell, validateSummary };
