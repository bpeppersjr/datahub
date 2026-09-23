import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { APP_ROOT } from "./paths.mjs";

export const ZIP_BUSINESS_ALIGNMENT_SCHEMA = "national-zip-business-evidence-alignment@1.0.0";
const DATASET = "national-zip-business-evidence-alignment";
const RELEASE_ID = /^national-zip-business-alignment-\d{14}-[a-f0-9]{8}$/;
const ZIP_SUMMARY_RELEASE_ID = /^national-zip-coverage-\d{14}-[a-f0-9]{8}$/;
const DEFAULT_ENROLLMENT = "config/national-zip-business-evidence-alignment.json";
const hash = value => createHash("sha256").update(value).digest("hex");
const stable = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = values => hash(values.length ? `${[...values].sort().join("\n")}\n` : "");
const check = (value, message) => { if (!value) throw new Error(message); };
const iso = value => { try { return typeof value === "string" && new Date(value).toISOString() === value; } catch { return false; } };
const validIso = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const safeRelative = (parent, child) => { const relative = path.relative(parent, child); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };
const evidence = values => ({ count: values.length, member_set_sha256: digest(values) });
const hasArray = value => Array.isArray(value) || Boolean(value && typeof value === "object" && Object.values(value).some(hasArray));
function failure(code, message) { const error = new Error(message); error.code = code; return error; }

async function jsonDocument(file, root, label) {
  const candidate = path.resolve(root, file), real = await realpath(candidate);
  check(safeRelative(root, real), `${label} escapes the governed root.`);
  check(real === candidate, `${label} uses a symlink or non-canonical path.`);
  const [linkInfo, fileInfo] = await Promise.all([lstat(candidate), stat(candidate)]);
  check(linkInfo.isFile() && !linkInfo.isSymbolicLink() && fileInfo.nlink === 1, `${label} is not a unique regular file.`);
  const bytes = await readFile(real); return { value: JSON.parse(bytes), bytes: bytes.length, sha256: hash(bytes), path: real };
}

async function selectedManifest(root, pointerPath, pointerSha, manifestSha, dataset, contract) {
  const pointer = await jsonDocument(pointerPath, root, `${dataset} pointer`);
  check(pointer.sha256 === pointerSha, `${dataset} pointer drifted.`);
  const manifestRelative = path.join(path.dirname(pointerPath), pointer.value.manifest ?? "");
  const manifest = await jsonDocument(manifestRelative, root, `${dataset} manifest`);
  check(manifest.sha256 === manifestSha && pointer.value.dataset_id === dataset && manifest.value.dataset_id === dataset
    && manifest.value.release_id === pointer.value.release_id && pointer.value.manifest === `releases/${pointer.value.release_id}/manifest.json`
    && validIso(pointer.value.updated_at) && manifest.value.schema_version === contract.schema && manifest.value.status === contract.status
    && (!contract.publisher || manifest.value.publisher?.id === dataset && manifest.value.publisher?.version === contract.publisher)
    && (contract.complete === undefined || manifest.value.complete_national_release === contract.complete), `${dataset} manifest drifted or mismatches its exact pointer contract.`);
  return { pointer, manifest };
}

async function streamRows(root, manifestDocument, artifactType, visitor, expectedPath = null) {
  const matches = manifestDocument.value.artifacts?.filter(row => row.artifact_type === artifactType && (!expectedPath || row.path === expectedPath)) ?? [];
  check(matches.length === 1, `Expected exactly one ${artifactType} artifact.`);
  const artifact = matches[0];
  check(artifact, `Missing ${artifactType} artifact.`);
  const candidate = path.resolve(path.dirname(manifestDocument.path), artifact.path), real = await realpath(candidate);
  check(safeRelative(path.dirname(manifestDocument.path), real) && real === candidate, `${artifactType} artifact escapes its release or uses a symlink.`);
  const info = await stat(real); check(info.isFile() && info.nlink === 1, `${artifactType} artifact is not a unique regular file.`);
  const stream = createReadStream(real), hasher = createHash("sha256"); let bytes = 0, rows = 0;
  stream.on("data", chunk => { bytes += chunk.length; hasher.update(chunk); });
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) { if (!line.trim()) continue; rows += 1; visitor(JSON.parse(line)); }
  check(bytes === artifact.bytes && rows === artifact.record_count && hasher.digest("hex") === artifact.sha256, `${artifactType} artifact bytes, count, or digest drifted.`);
  return artifact;
}

export async function buildNationalZipBusinessEvidenceAlignment({ root = APP_ROOT, enrollmentPath = DEFAULT_ENROLLMENT,
  releaseId, createdAt, enrollment: suppliedEnrollment } = {}) {
  root = await realpath(path.resolve(root));
  check(RELEASE_ID.test(releaseId ?? ""), "A canonical alignment release ID is required.");
  check(iso(createdAt), "Alignment created_at must be canonical ISO-8601 UTC.");
  const enrollmentDoc = suppliedEnrollment ? null : await jsonDocument(enrollmentPath, root, "alignment enrollment");
  const enrollment = suppliedEnrollment ?? enrollmentDoc.value;
  check(enrollment?.schema_version === "national-zip-business-evidence-alignment-enrollment@1.0.0", "Alignment enrollment is invalid.");
  const zipManifest = await jsonDocument(enrollment.zip_summary_manifest_path, root, "ZIP summary manifest");
  check(zipManifest.sha256 === enrollment.zip_summary_manifest_sha256 && zipManifest.value.schema_version === "national-zip-coverage-summary@1.0.0"
    && zipManifest.value.dataset_id === "national-zip-coverage-summary" && zipManifest.value.status === "published-local-derived-report"
    && zipManifest.value.network_requests === 0 && zipManifest.value.production_pointers_changed === false
    && ZIP_SUMMARY_RELEASE_ID.test(zipManifest.value.release_id ?? "") && iso(zipManifest.value.created_at)
    && path.dirname(zipManifest.path) === path.join(root, "data", "national-zip-coverage-summary", "releases", zipManifest.value.release_id)
    && zipManifest.value.artifacts?.length === 1, "ZIP summary enrollment drifted.");
  const zipArtifact = zipManifest.value.artifacts[0];
  check(zipArtifact.path === "zip-coverage-summary.json" && zipArtifact.record_count === 1
    && zipArtifact.artifact_type === "national-zip-coverage-summary-json", "ZIP summary artifact declaration is invalid.");
  check(JSON.stringify((await readdir(path.dirname(zipManifest.path))).sort()) === JSON.stringify(["manifest.json", "zip-coverage-summary.json"]), "ZIP summary release contains unexpected entries.");
  const zipSummary = await jsonDocument(path.join(path.dirname(enrollment.zip_summary_manifest_path), zipArtifact.path), root, "ZIP summary artifact");
  check(zipSummary.sha256 === enrollment.zip_summary_artifact_sha256 && zipSummary.sha256 === zipArtifact.sha256 && zipSummary.bytes === zipArtifact.bytes
    && zipArtifact.distribution_policy === "local-review-only"
    && zipSummary.value.release_id === zipManifest.value.release_id && zipSummary.value.projection_mode === "immutable-release"
    && zipSummary.value.schema_version === zipManifest.value.schema_version && zipSummary.value.dataset_id === zipManifest.value.dataset_id
    && zipSummary.value.created_at === zipManifest.value.created_at && stable(zipSummary.value.bindings) === stable(zipManifest.value.evidence)
    && zipSummary.value.claim_boundary?.all_business_completion_percentage === null
    && zipSummary.value.claim_boundary?.active_business_completion_percentage === null && !hasArray(zipSummary.value)
    && zipSummary.value.usps_assignment.governed_dependency_present === false
    && zipSummary.value.usps_assignment.registry_unverified_members.count === zipSummary.value.registry_zip5.members.count,
  "ZIP summary artifact is invalid or does not preserve the unverified-USPS boundary.");
  const coverage = await selectedManifest(root, enrollment.coverage_pointer_path, enrollment.coverage_pointer_sha256,
    enrollment.coverage_manifest_sha256, "national-business-coverage-views", { schema: "1.0.0", status: "published-partial-local-aggregate", publisher: "2.11.0" });
  const registryDependencies = coverage.manifest.value.dependencies?.filter(row => row.dataset_id === "national-business-registry") ?? [];
  check(registryDependencies.length === 1, "Coverage manifest must declare exactly one national business registry dependency.");
  const registryDependency = registryDependencies[0];
  check(registryDependency.dataset_id === zipSummary.value.bindings.registry_dataset_id
    && registryDependency.release_id === zipSummary.value.bindings.registry_release_id
    && registryDependency.manifest_sha256 === zipSummary.value.bindings.registry_manifest_sha256
    && registryDependency.publisher_version === zipSummary.value.bindings.registry_publisher_version,
  "Coverage registry dependency does not exactly match ZIP-summary registry bindings.");
  const zbp = await selectedManifest(root, enrollment.zbp_pointer_path, enrollment.zbp_pointer_sha256,
    enrollment.zbp_manifest_sha256, "census-zbp-baseline", { schema: "1.0.0", status: "published", complete: true });
  const geography = await selectedManifest(root, enrollment.geography_pointer_path, enrollment.geography_pointer_sha256,
    enrollment.geography_manifest_sha256, "us-census-geography", { schema: "1.0.0", status: "published", complete: true });
  check(zbp.manifest.value.complete_national_release === true && zbp.manifest.value.geography_dependency?.release_id === zipSummary.value.bindings.census_zcta_source_release_id,
    "ZBP geography evidence does not match the ZIP summary.");
  check(zbp.manifest.value.geography_dependency.dataset_id === "us-census-geography"
    && zbp.manifest.value.geography_dependency.manifest_sha256 === geography.manifest.sha256
    && zbp.manifest.value.geography_dependency.release_id === geography.manifest.value.release_id, "ZBP geography dependency is not the enrolled Census release.");
  const geographyZctas = [];
  const geographyArtifact = await streamRows(root, geography.manifest, "normalized-index", row => {
    if (row.geo_type !== "zcta") return;
    check(/^\d{5}$/.test(row.geoid) && row.zcta === row.geoid && row.geo_id === `zcta:${row.geoid}`, "Census ZCTA index row is invalid."); geographyZctas.push(row.geoid);
  }, "derived/index/zctas.jsonl");
  check(geographyArtifact.path === "derived/index/zctas.jsonl" && geographyArtifact.record_count === geographyZctas.length
    && evidence(geographyZctas).member_set_sha256 === zipSummary.value.bindings.census_zcta_member_set_sha256,
  "Census ZCTA index does not match the governed ZIP summary.");
  const zbpMembers = [], zbpRows = new Map();
  const zbpArtifact = await streamRows(root, zbp.manifest, "zip-coverage-union-jsonl", row => {
    check(/^\d{5}$/.test(row.zip_code) && !zbpRows.has(row.zip_code)
      && ["zbp-and-zcta", "zbp-without-zcta", "zcta-without-published-zbp"].includes(row.coverage_status), "ZBP ZIP evidence is invalid, duplicated, or has an unknown status.");
    const zctaStatus = row.geography?.status === "2020-zcta-polygon-available", publishedStatus = row.employer_baseline?.status === "published";
    check((row.coverage_status === "zbp-and-zcta" && zctaStatus && publishedStatus)
      || (row.coverage_status === "zbp-without-zcta" && !zctaStatus && publishedStatus)
      || (row.coverage_status === "zcta-without-published-zbp" && zctaStatus && row.employer_baseline?.status === "not-published-for-zip"),
    "ZBP status, ZCTA membership, and employer baseline mapping is inconsistent.");
    zbpMembers.push(row.zip_code); zbpRows.set(row.zip_code, row);
  });
  const all = [], source = [], denominator = [], published = [], notPublished = [], outside = [], zcta = [], noZcta = [];
  const cross = { zcta_published: [], zcta_not_published: [], zcta_outside_union: [], non_zcta_published: [], non_zcta_not_published: [], non_zcta_outside_union: [] };
  const seen = new Set();
  const coverageArtifact = await streamRows(root, coverage.manifest, "zip-coverage-view-jsonl", row => {
    const zip = row.zip_code; check(/^\d{5}$/.test(zip) && !seen.has(zip), "Coverage ZIP evidence is invalid or duplicated."); seen.add(zip); all.push(zip);
    check(row.complete_all_businesses === false && row.registry_coverage?.complete_all_businesses === false, "Coverage row makes an unsupported all-business claim.");
    const sourceRow = row.registry_coverage?.status === "record-level-source-contribution";
    check(sourceRow || row.registry_coverage?.status === "denominator-only-no-record-level-contribution", "Coverage source-contribution class is invalid.");
    (sourceRow ? source : denominator).push(zip);
    const hasZcta = row.spatial_zip_polygon_membership?.status === "included";
    check(hasZcta || row.spatial_zip_polygon_membership?.status === "not-in-denominator", "Coverage ZCTA status is invalid.");
    check(row.spatial_zip_polygon_membership.geography_release_id === zipSummary.value.bindings.census_zcta_source_release_id, "Coverage geography release drifted.");
    (hasZcta ? zcta : noZcta).push(zip);
    let baselineClass;
    const zbpRow = zbpRows.get(zip);
    if (row.employer_baseline?.status === "published") {
      published.push(zip); baselineClass = "published";
      check(Number.isSafeInteger(row.employer_baseline.establishments) && row.employer_baseline.establishments >= 0
        && row.employer_baseline.reference_year === 2023 && row.employer_baseline.provenance?.source_release_id === "census-zbp-2023"
        && ["zbp-and-zcta", "zbp-without-zcta"].includes(zbpRow?.coverage_status)
        && stable(row.employer_baseline) === stable(zbpRow.employer_baseline), "Published employer baseline measure or provenance mismatches ZBP evidence.");
    } else if (row.employer_baseline?.status === "not-published-for-zip") {
      notPublished.push(zip); baselineClass = "not_published";
      check(row.employer_baseline.reference_year === 2023 && row.employer_baseline.establishments === null
        && row.employer_baseline.employment === null && row.employer_baseline.annual_payroll_thousands_usd === null
        && row.employer_baseline.first_quarter_payroll_thousands_usd === null
        && row.employer_baseline.provenance?.source_release_id === "census-zbp-2023"
        && zbpRow?.coverage_status === "zcta-without-published-zbp"
        && stable(row.employer_baseline) === stable(zbpRow.employer_baseline), "Not-published employer measures must remain null with exact ZBP provenance.");
    } else {
      outside.push(zip); baselineClass = "outside_union";
      check(row.employer_baseline === null && !zbpRow
        && ["outside-zbp-zcta-union", "not-observed-in-integrated-census-coverage-union"].includes(row.baseline_coverage_status)
        && !hasZcta, "Outside-union employer evidence mismatches the closed ZBP/ZCTA mapping.");
    }
    check((zbpRow?.coverage_status ?? row.baseline_coverage_status) === row.baseline_coverage_status,
      "Coverage baseline status differs from retained ZBP evidence.");
    cross[`${hasZcta ? "zcta" : "non_zcta"}_${baselineClass}`].push(zip);
  });
  check(coverageArtifact.export_policy === "local-review-only", "Coverage ZIP artifact is not local-review-only.");
  check(zbp.manifest.value.reference_year === 2023 && zbpArtifact.record_count === zbp.manifest.value.coverage?.union_zip_codes,
    "ZBP release year or ZIP coverage total is invalid.");
  check(all.length === zipSummary.value.registry_zip5.members.count && digest(all) === zipSummary.value.registry_zip5.members.member_set_sha256,
    "Coverage ZIP member set does not exactly equal the governed ZIP summary.");
  check(digest(source) === zipSummary.value.registry_zip5.record_level_source_contribution.member_set_sha256
    && digest(denominator) === zipSummary.value.registry_zip5.denominator_only_no_record_level_contribution.member_set_sha256,
  "Coverage contribution member sets differ from the governed ZIP summary.");
  check(digest(zcta) === zipSummary.value.census_zcta.same_code_governed_zcta_members.member_set_sha256
    && zbpMembers.length === zbpArtifact.record_count && [...zbpMembers].every(zip => seen.has(zip)), "Census ZIP/ZCTA evidence does not conserve.");
  const result = { schema_version: ZIP_BUSINESS_ALIGNMENT_SCHEMA, dataset_id: DATASET, release_id: releaseId, created_at: createdAt,
    bindings: { enrollment_sha256: enrollmentDoc?.sha256 ?? hash(stable(enrollment)), zip_summary_release_id: zipSummary.value.release_id,
      zip_summary_manifest_path: path.relative(root, zipManifest.path).replaceAll("\\", "/"), zip_summary_manifest_sha256: zipManifest.sha256,
      zip_summary_artifact_path: zipArtifact.path, zip_summary_artifact_bytes: zipArtifact.bytes, zip_summary_artifact_record_count: zipArtifact.record_count,
      zip_summary_artifact_distribution_policy: zipArtifact.distribution_policy, zip_summary_artifact_sha256: zipSummary.sha256,
      coverage_pointer_path: path.relative(root, coverage.pointer.path).replaceAll("\\", "/"), coverage_pointer_sha256: coverage.pointer.sha256,
      coverage_release_id: coverage.manifest.value.release_id, coverage_manifest_path: path.relative(root, coverage.manifest.path).replaceAll("\\", "/"),
      coverage_manifest_schema_version: coverage.manifest.value.schema_version, coverage_manifest_status: coverage.manifest.value.status,
      coverage_publisher_version: coverage.manifest.value.publisher.version, coverage_manifest_sha256: coverage.manifest.sha256,
      registry_dataset_id: registryDependency.dataset_id, registry_release_id: registryDependency.release_id,
      registry_manifest_sha256: registryDependency.manifest_sha256, registry_publisher_version: registryDependency.publisher_version,
      coverage_zip_artifact_path: coverageArtifact.path, coverage_zip_artifact_bytes: coverageArtifact.bytes,
      coverage_zip_artifact_record_count: coverageArtifact.record_count, coverage_zip_artifact_policy: coverageArtifact.export_policy,
      coverage_zip_artifact_sha256: coverageArtifact.sha256,
      zbp_release_id: zbp.manifest.value.release_id, zbp_pointer_path: path.relative(root, zbp.pointer.path).replaceAll("\\", "/"), zbp_pointer_sha256: zbp.pointer.sha256,
      zbp_manifest_path: path.relative(root, zbp.manifest.path).replaceAll("\\", "/"), zbp_manifest_schema_version: zbp.manifest.value.schema_version,
      zbp_manifest_status: zbp.manifest.value.status, zbp_complete_national_release: zbp.manifest.value.complete_national_release,
      zbp_manifest_sha256: zbp.manifest.sha256, zbp_zip_artifact_path: zbpArtifact.path, zbp_zip_artifact_bytes: zbpArtifact.bytes,
      zbp_zip_artifact_record_count: zbpArtifact.record_count, zbp_zip_artifact_sha256: zbpArtifact.sha256,
      census_geography_release_id: zbp.manifest.value.geography_dependency.release_id,
      census_geography_pointer_path: path.relative(root, geography.pointer.path).replaceAll("\\", "/"), census_geography_pointer_sha256: geography.pointer.sha256,
      census_geography_manifest_path: path.relative(root, geography.manifest.path).replaceAll("\\", "/"), census_geography_manifest_sha256: zbp.manifest.value.geography_dependency.manifest_sha256,
      census_zcta_index_artifact_path: geographyArtifact.path, census_zcta_index_artifact_bytes: geographyArtifact.bytes,
      census_zcta_index_artifact_record_count: geographyArtifact.record_count, census_zcta_index_artifact_sha256: geographyArtifact.sha256,
      census_zcta_member_set_sha256: evidence(geographyZctas).member_set_sha256 },
    zip_member_alignment: { exact_match: true, governed_zip_summary: evidence(all), selected_business_coverage: evidence(all) },
    registry_coverage: { record_level_source_contribution: evidence(source), denominator_only_no_record_level_contribution: evidence(denominator), conservation: { classified: source.length + denominator.length, total: all.length, status: "passed" } },
    employer_baseline: { semantics: "2023 Census employer establishments; historical aggregate, not current named active businesses", published: evidence(published), not_published_for_zip: evidence(notPublished), outside_zbp_zcta_union: evidence(outside), conservation: { classified: published.length + notPublished.length + outside.length, total: all.length, status: "passed" } },
    census_zcta_cross_classes: { classes: Object.fromEntries(Object.entries(cross).map(([key, values]) => [key, evidence(values)])),
      conservation: { classified: Object.values(cross).reduce((sum, values) => sum + values.length, 0), total: all.length, status: "passed" } },
    usps_assignment: { governed_dependency_present: false, unverified_members: evidence(all), complete_current_assignment_denominator_verified: false },
    claim_boundary: { all_business_completion_percentage: null, active_business_completion_percentage: null, zcta_is_usps_boundary: false, zip4_is_geometric: false } };
  check(!hasArray(result), "Alignment artifact cannot contain arrays."); return result;
}

export async function publishNationalZipBusinessEvidenceAlignment({ root = APP_ROOT, releaseId = `national-zip-business-alignment-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`, createdAt = new Date().toISOString(), ...options } = {}) {
  root = await realpath(path.resolve(root)); const report = await buildNationalZipBusinessEvidenceAlignment({ root, releaseId, createdAt, ...options });
  const directory = path.join(root, "data", DATASET, "releases", releaseId), base = path.dirname(directory); check(safeRelative(root, directory), "Alignment release escapes root.");
  await mkdir(base, { recursive: true }); check(await realpath(base) === base, "Alignment release root is not canonical."); await mkdir(directory); check(await realpath(directory) === directory, "Alignment release directory is not canonical.");
  const bytes = Buffer.from(stable(report)), artifact = { path: "alignment.json", bytes: bytes.length, sha256: hash(bytes), record_count: 1, artifact_type: "national-zip-business-evidence-alignment-json", distribution_policy: "local-review-only" };
  await writeFile(path.join(directory, artifact.path), bytes, { flag: "wx" });
  const manifest = { schema_version: ZIP_BUSINESS_ALIGNMENT_SCHEMA, dataset_id: DATASET, release_id: releaseId, created_at: createdAt, status: "published-local-derived-report", network_requests: 0, production_pointers_changed: false, artifacts: [artifact], evidence: report.bindings };
  await writeFile(path.join(directory, "manifest.json"), stable(manifest), { flag: "wx" }); return { directory, report, manifest };
}

async function verifyAlignment(manifestPath, options = {}) {
  const root = await realpath(path.resolve(options.root ?? APP_ROOT)), realManifest = await realpath(path.resolve(manifestPath));
  let manifest; try { manifest = JSON.parse(await readFile(realManifest, "utf8")); } catch (error) { throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", error.message); }
  const expectedDirectory = path.join(root, "data", DATASET, "releases", manifest.release_id);
  if (!RELEASE_ID.test(manifest.release_id ?? "") || path.dirname(realManifest) !== expectedDirectory || path.basename(realManifest) !== "manifest.json" || !iso(manifest.created_at)) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment release path, ID, or time is not canonical.");
  const artifact = manifest.artifacts?.[0];
  if (manifest.schema_version !== ZIP_BUSINESS_ALIGNMENT_SCHEMA || manifest.dataset_id !== DATASET || manifest.status !== "published-local-derived-report" || manifest.artifacts?.length !== 1
    || artifact?.path !== "alignment.json" || artifact.artifact_type !== "national-zip-business-evidence-alignment-json"
    || artifact.record_count !== 1 || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0
    || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)
    || artifact.distribution_policy !== "local-review-only" || manifest.network_requests !== 0 || manifest.production_pointers_changed !== false) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment manifest semantics are invalid.");
  if (JSON.stringify((await readdir(expectedDirectory)).sort()) !== JSON.stringify(["alignment.json", "manifest.json"])) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment release contains unexpected entries.");
  const manifestInfo = await stat(realManifest); if (!manifestInfo.isFile() || manifestInfo.nlink !== 1) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment manifest is not a unique regular file.");
  const artifactPath = await realpath(path.join(expectedDirectory, artifact.path)); if (artifactPath !== path.join(expectedDirectory, artifact.path)) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment artifact uses a symlink.");
  const artifactInfo = await stat(artifactPath); if (!artifactInfo.isFile() || artifactInfo.nlink !== 1) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment artifact is not a unique regular file.");
  const bytes = await readFile(artifactPath); if (bytes.length !== artifact.bytes || hash(bytes) !== artifact.sha256) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment artifact bytes or digest drifted.");
  let report; try { report = JSON.parse(bytes); } catch (error) { throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", error.message); }
  if (report.release_id !== manifest.release_id || report.created_at !== manifest.created_at || report.schema_version !== ZIP_BUSINESS_ALIGNMENT_SCHEMA || hasArray(report) || stable(report.bindings) !== stable(manifest.evidence)) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment report semantics differ from its manifest.");
  let expected; try { expected = await buildNationalZipBusinessEvidenceAlignment({ ...options, root, releaseId: manifest.release_id, createdAt: manifest.created_at }); } catch (error) { throw failure("ZIP_BUSINESS_ALIGNMENT_EVIDENCE_REBUILD_REQUIRED", error.message); }
  if (stable(report) !== stable(expected)) throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", "Alignment report differs even though all enrolled retained evidence reproduced successfully.");
  return { status: "verified", release_id: manifest.release_id, artifact_sha256: artifact.sha256, report };
}

export async function verifyNationalZipBusinessEvidenceAlignment(manifestPath, options = {}) {
  try { return await verifyAlignment(manifestPath, options); }
  catch (error) {
    if (error?.code === "ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER" || error?.code === "ZIP_BUSINESS_ALIGNMENT_EVIDENCE_REBUILD_REQUIRED") throw error;
    throw failure("ZIP_BUSINESS_ALIGNMENT_SEMANTIC_TAMPER", `Alignment verification could not read its immutable release safely: ${error.message}`);
  }
}
