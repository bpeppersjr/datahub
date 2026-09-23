import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { verifyCensusGeographyRelease } from "./census-geography.mjs";
import { verifyZctaJurisdictionCrosswalkRelease } from "./zcta-jurisdiction-crosswalk.mjs";

export const NATIONAL_GEOGRAPHY_GOAL_STATUS_SCHEMA = "national-geography-goal-status@1.0.0";
const DATASET_ID = "national-geography-goal-status";
const GEOGRAPHY_RELEASE = "us-census-geography-20260830-132803990Z-3629abc0";
const CROSSWALK_RELEASE = "us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8";
const ZIP_RELEASE = "national-zip-coverage-20260923121929-ffe55c41";
const ZIP_MANIFEST_SHA256 = "68a798db3acc507d7634bdfe97b11fab61d4bff21585d19518828e96502d8e3b";
const ZIP_ARTIFACT_SHA256 = "772e48a2261f89e8e401de467fc8cd2e60734fa3542dfc7071320c5bf901893a";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); };
function check(value, message) { if (!value) throw new Error(`National geography goal status unavailable: ${message}`); }

async function regularCanonical(file, parent) {
  const stat = await lstat(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && await realpath(file) === file && inside(parent, file), "evidence file is linked or noncanonical");
}

async function filesBelow(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) check(false, "evidence tree contains a symbolic link");
    if (entry.isDirectory()) found.push(...await filesBelow(target, relative));
    else if (entry.isFile()) found.push(relative);
    else check(false, "evidence tree contains an unsupported entry");
  }
  return found.sort();
}

async function readJsonFile(file, parent) {
  await regularCanonical(file, parent);
  const bytes = await readFile(file);
  let value; try { value = JSON.parse(bytes); } catch { check(false, "evidence JSON is invalid"); }
  return { bytes, sha256: hash(bytes), value };
}

async function verifyReleaseInventory(manifestPath, expectedDataset, semanticVerifier) {
  const releaseDirectory = path.dirname(manifestPath);
  check(await realpath(releaseDirectory) === releaseDirectory, "release directory is linked or noncanonical");
  const manifestFile = await readJsonFile(manifestPath, releaseDirectory);
  const manifest = manifestFile.value;
  check(manifest.dataset_id === expectedDataset && Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "input manifest identity or artifacts are invalid");
  const expectedFiles = ["manifest.json", ...manifest.artifacts.map((item) => item.path)].sort();
  check(new Set(expectedFiles).size === expectedFiles.length && JSON.stringify(await filesBelow(releaseDirectory)) === JSON.stringify(expectedFiles), "input release has missing, duplicate, or extra artifacts");
  const artifactSha256s = {};
  let artifactBytes = 0;
  for (const artifact of manifest.artifacts) {
    check(typeof artifact.path === "string" && !path.isAbsolute(artifact.path), "input artifact path is invalid");
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    await regularCanonical(artifactPath, releaseDirectory);
    const bytes = await readFile(artifactPath);
    check(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256, "input artifact bytes or hash drifted");
    artifactSha256s[artifact.path] = artifact.sha256;
    artifactBytes += artifact.bytes;
  }
  await semanticVerifier(manifestPath);
  return { manifest, manifest_sha256: manifestFile.sha256, artifact_sha256s: artifactSha256s, artifact_count: manifest.artifacts.length, artifact_bytes: artifactBytes };
}

async function resolvePointer(root, relative, dataset, releaseId) {
  const pointerPath = path.join(root, relative);
  const pointer = await readJsonFile(pointerPath, root);
  check(pointer.value.dataset_id === dataset && pointer.value.release_id === releaseId && typeof pointer.value.manifest === "string", "current pointer identity drifted");
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.value.manifest);
  check(inside(path.dirname(pointerPath), manifestPath), "current pointer manifest escapes its dataset");
  return { pointerPath, pointer_sha256: pointer.sha256, manifestPath };
}

async function fixedZipSummary(root) {
  const directory = path.join(root, "data", "national-zip-coverage-summary", "releases", ZIP_RELEASE);
  const manifestPath = path.join(directory, "manifest.json");
  const verified = await verifyReleaseInventory(manifestPath, "national-zip-coverage-summary", async () => {});
  check(verified.manifest_sha256 === ZIP_MANIFEST_SHA256 && verified.manifest.release_id === ZIP_RELEASE && verified.manifest.status === "published-local-derived-report" && verified.manifest.network_requests === 0 && verified.manifest.production_pointers_changed === false && verified.manifest.artifacts.length === 1 && verified.manifest.artifacts[0].sha256 === ZIP_ARTIFACT_SHA256, "fixed ZIP summary lineage drifted");
  const artifact = await readJsonFile(path.join(directory, "zip-coverage-summary.json"), directory);
  const summary = artifact.value;
  check(summary.release_id === ZIP_RELEASE && summary.registry_zip5?.members?.count === 48194 && summary.registry_zip5?.explicit_placeholder?.count === 1 && summary.census_zcta?.same_code_governed_zcta_members?.count === 33791 && summary.census_zcta?.source_reported_zip5_without_same_code_zcta?.count === 14361 && summary.census_zcta?.denominator_only_zip5_without_same_code_zcta?.count === 41 && summary.usps_assignment?.governed_dependency_present === false && summary.usps_assignment?.registry_unverified_members?.count === 48194 && summary.usps_assignment?.complete_current_assignment_denominator_verified === false && summary.zip4_policy?.stored_separately_from_zip5 === true && summary.zip4_policy?.geometric === false, "fixed ZIP summary claims drifted");
  return { ...verified, summary };
}

export async function buildNationalGeographyGoalStatus({ root = APP_ROOT, releaseId, createdAt = new Date().toISOString() } = {}) {
  root = await realpath(path.resolve(root));
  const geographyPointer = await resolvePointer(root, "data/geography/current.json", "us-census-geography", GEOGRAPHY_RELEASE);
  const crosswalkPointer = await resolvePointer(root, "data/zcta-jurisdiction-crosswalk/current.json", "us-census-zcta-jurisdiction-crosswalk", CROSSWALK_RELEASE);
  const geography = await verifyReleaseInventory(geographyPointer.manifestPath, "us-census-geography", verifyCensusGeographyRelease);
  const crosswalk = await verifyReleaseInventory(crosswalkPointer.manifestPath, "us-census-zcta-jurisdiction-crosswalk", verifyZctaJurisdictionCrosswalkRelease);
  const zip = await fixedZipSummary(root);
  check(geography.manifest.release_id === GEOGRAPHY_RELEASE && geography.manifest.complete_national_release === true && geography.manifest.coordinate_reference_system === "EPSG:4326" && geography.manifest.coverage?.state_equivalents === 56 && geography.manifest.coverage?.states_and_district_of_columbia === 51 && geography.manifest.coverage?.county_equivalents === 3235 && geography.manifest.coverage?.zctas === 33791, "geography completeness claims drifted");
  const coverage = crosswalk.manifest.coverage;
  check(crosswalk.manifest.release_id === CROSSWALK_RELEASE && crosswalk.manifest.complete_national_release === true && crosswalk.manifest.upstream?.release_id === GEOGRAPHY_RELEASE && crosswalk.manifest.upstream?.manifest_sha256 === geography.manifest_sha256 && coverage?.zcta_count_complete_within_tolerance === 33788 && coverage?.zcta_count_partial_or_overlapping === 3 && coverage?.zcta_count_unmatched === 0 && coverage?.county_equivalents - coverage?.counties_with_zcta_intersections === 2 && coverage?.zctas_crossing_state_boundaries_materially === 184 && coverage?.zctas_crossing_county_boundaries_materially === 10277, "crosswalk overlay claims or geography lineage drifted");
  releaseId ??= `national-geography-goal-status-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  check(/^national-geography-goal-status-\d{14}-[a-f0-9]{8}$/.test(releaseId) && Number.isFinite(Date.parse(createdAt)), "release identity or timestamp is invalid");
  return {
    schema_version: NATIONAL_GEOGRAPHY_GOAL_STATUS_SCHEMA,
    dataset_id: DATASET_ID,
    release_id: releaseId,
    created_at: createdAt,
    status: "published-immutable-aggregate-only",
    network_requests: 0,
    production_pointer_changes: false,
    input_bindings: {
      geography: { pointer_sha256: geographyPointer.pointer_sha256, release_id: geography.manifest.release_id, manifest_sha256: geography.manifest_sha256, artifact_count: geography.artifact_count, artifact_bytes: geography.artifact_bytes, artifact_sha256s: geography.artifact_sha256s },
      zcta_jurisdiction_crosswalk: { pointer_sha256: crosswalkPointer.pointer_sha256, release_id: crosswalk.manifest.release_id, manifest_sha256: crosswalk.manifest_sha256, artifact_count: crosswalk.artifact_count, artifact_bytes: crosswalk.artifact_bytes, artifact_sha256s: crosswalk.artifact_sha256s },
      national_zip_summary: { release_id: zip.manifest.release_id, manifest_sha256: zip.manifest_sha256, artifact_count: zip.artifact_count, artifact_bytes: zip.artifact_bytes, artifact_sha256s: zip.artifact_sha256s },
    },
    census_polygon_completeness: {
      complete_for_declared_layers_and_vintages: true,
      coordinate_reference_system: "EPSG:4326",
      generalized_geometry: true,
      nation_polygon_products: 2,
      state_equivalents: 56,
      states_and_district_of_columbia: 51,
      county_equivalents: 3235,
      zcta_2020_polygons: 33791,
    },
    temporal_vintage: { aligned: false, state_and_county_vintage: "TIGERweb Current at retrieval", zcta_vintage: "2020 Census", limitation: "Current state/county boundaries and 2020 ZCTA boundaries have different temporal vintages." },
    overlay_diagnostics: { zctas_complete_within_tolerance: 33788, zctas_partial_or_overlapping: 3, zctas_unmatched: 0, counties_without_zcta_intersection: 2, zctas_materially_crossing_state_boundaries: 184, zctas_materially_crossing_county_boundaries: 10277 },
    usps_operational_denominator: { complete: false, verified: false, registry_zip5_keys: 48194, unverified_registry_zip5_keys: 48194, same_code_census_zcta: 33791, source_reported_without_same_code_zcta: 14361, denominator_only_without_same_code_zcta: 41, explicit_00000_placeholder_count: 1, limitation: "Census statistical polygons and registry ZIP5 keys do not establish a complete current USPS operational denominator." },
    zip4: { stored_separately_from_zip5: true, geometric: false, limitation: "ZIP+4 is address-level postal evidence and has no polygon in this dataset." },
    claim_boundaries: { one_overall_completion_measure_available: false, business_completeness_claimed: false, zcta_is_usps_delivery_boundary: false, overlay_weights_allocate_businesses_people_or_addresses: false },
  };
}

export async function publishNationalGeographyGoalStatus(options = {}) {
  const root = await realpath(path.resolve(options.root ?? APP_ROOT));
  const artifact = await buildNationalGeographyGoalStatus({ ...options, root });
  const directory = path.join(root, "data", DATASET_ID, "releases", artifact.release_id);
  const releases = path.dirname(directory);
  await mkdir(releases, { recursive: true });
  check(await realpath(releases) === releases && inside(root, releases), "output release root is linked or escaping");
  await mkdir(directory);
  check(await realpath(directory) === directory, "output release directory is linked");
  const bytes = Buffer.from(stable(artifact));
  const declaration = { path: "national-geography-goal-status.json", bytes: bytes.length, sha256: hash(bytes), record_count: 1, artifact_type: "national-geography-goal-status-json", distribution_policy: "local-review-aggregate-only" };
  await writeFile(path.join(directory, declaration.path), bytes, { flag: "wx" });
  const manifest = { schema_version: NATIONAL_GEOGRAPHY_GOAL_STATUS_SCHEMA, dataset_id: DATASET_ID, release_id: artifact.release_id, created_at: artifact.created_at, status: artifact.status, network_requests: 0, production_pointer_changes: false, input_bindings: artifact.input_bindings, artifacts: [declaration] };
  await writeFile(path.join(directory, "manifest.json"), stable(manifest), { flag: "wx" });
  return { directory, manifest, artifact };
}

export async function verifyNationalGeographyGoalStatus(manifestPath, { root = APP_ROOT } = {}) {
  root = await realpath(path.resolve(root));
  const resolved = await realpath(path.resolve(manifestPath));
  const expectedBase = path.join(root, "data", DATASET_ID, "releases");
  check(inside(expectedBase, resolved) && path.basename(resolved) === "manifest.json", "status manifest path is outside the governed dataset");
  const manifestFile = await readJsonFile(resolved, path.dirname(resolved));
  const manifest = manifestFile.value;
  check(manifest.schema_version === NATIONAL_GEOGRAPHY_GOAL_STATUS_SCHEMA && manifest.dataset_id === DATASET_ID && manifest.status === "published-immutable-aggregate-only" && manifest.network_requests === 0 && manifest.production_pointer_changes === false && manifest.artifacts?.length === 1, "status manifest is invalid");
  check(path.dirname(resolved) === path.join(expectedBase, manifest.release_id), "status release path and manifest identity differ");
  check(JSON.stringify(await filesBelow(path.dirname(resolved))) === JSON.stringify(["manifest.json", "national-geography-goal-status.json"]), "status release has missing or extra artifacts");
  const declaration = manifest.artifacts[0];
  check(declaration.path === "national-geography-goal-status.json" && declaration.record_count === 1 && declaration.artifact_type === "national-geography-goal-status-json" && declaration.distribution_policy === "local-review-aggregate-only", "status artifact declaration is invalid");
  const artifactFile = await readJsonFile(path.join(path.dirname(resolved), declaration.path), path.dirname(resolved));
  check(artifactFile.bytes.length === declaration.bytes && artifactFile.sha256 === declaration.sha256, "status artifact bytes drifted");
  const artifact = artifactFile.value;
  check(artifact.release_id === manifest.release_id && artifact.created_at === manifest.created_at && stable(artifact.input_bindings) === stable(manifest.input_bindings), "status artifact and manifest differ");
  const expected = await buildNationalGeographyGoalStatus({ root, releaseId: manifest.release_id, createdAt: manifest.created_at });
  check(stable(expected) === stable(artifact), "status artifact no longer exactly matches verified retained evidence");
  const serialized = JSON.stringify(artifact);
  check(!serialized.includes("zip_list") && !serialized.includes("records") && !serialized.includes("overall_percent"), "status artifact contains forbidden row/list/overall-percent content");
  return { status: "verified", release_id: manifest.release_id, manifest_sha256: manifestFile.sha256, artifact_sha256: declaration.sha256, artifact };
}
