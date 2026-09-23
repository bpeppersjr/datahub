import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { APP_ROOT } from "./paths.mjs";
import { loadCmsHospitalReportingInput } from "./cms-hospital-reporting-input.mjs";
import { loadCmsNursingHomeReportingInput } from "./cms-nursing-home-reporting-input.mjs";
import { projectCmsHospitalReadiness, projectCmsNursingHomeReadiness } from "./state-access-ledger.mjs";

export const CMS_RETAINED_DIRECTORY_COVERAGE_DATASET = "cms-retained-directory-coverage-catalog";
export const CMS_RETAINED_DIRECTORY_COVERAGE_SCHEMA = "cms-retained-directory-coverage-catalog@1.0.0";
export const DEFAULT_CMS_RETAINED_DIRECTORY_COVERAGE_ROOT = path.join(APP_ROOT, "data", CMS_RETAINED_DIRECTORY_COVERAGE_DATASET);
export const CMS_RETAINED_DIRECTORY_COVERAGE_ARTIFACTS = Object.freeze({
  jurisdictions: "jurisdictions.jsonl",
  sources: "sources.json",
});

const STATES = Object.freeze("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MO MS MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const TERRITORIES = Object.freeze(["AS", "GU", "MP", "PR", "VI"]);
const JURISDICTIONS = Object.freeze([...STATES, ...TERRITORIES]);
const LIMIT_BYTES = 2_000_000;
const claims = () => ({
  named_business_count: null,
  unique_business_count: null,
  physical_site_count: null,
  current_operating_count: null,
  national_completeness_percent: null,
  identity_reconciliation_status: "not-yet-reconciled",
  geographic_assignment_performed: false,
  county_assignment_performed: false,
  zcta_membership_inferred: false,
  spatial_assignment_performed: false,
  publisher_coordinates_spatially_approved: false,
  zip4_aggregated: false,
  coordinates_retained: false,
  zip_values_retained: false,
  public_export_authorized: false,
  export_policy: "local-review-only",
});
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const jsonlBytes = (rows) => Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(`CMS retained directory coverage catalog rejected: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const cancelled = (signal) => { if (signal?.aborted) throw Object.assign(new Error("CMS retained directory coverage catalog build cancelled."), { name: "AbortError", code: "ABORT_ERR" }); };

function expectedSource(id, readiness, input, kind) {
  const hospital = kind === "hospital";
  const evidence = readiness;
  const expected = hospital
    ? { rows: 5419, stateDc: 5354, territories: 65 }
    : { rows: 14690, stateDc: 14680, territories: 10 };
  check(evidence.totalDirectoryRows === expected.rows, `${id} total row count drifted`);
  check([...evidence.states.values()].reduce((sum, row) => sum + row.directoryRows, 0) === expected.stateDc, `${id} state/DC conservation drifted`);
  check(evidence.territories.directoryRows === expected.territories, `${id} territory conservation drifted`);
  const sourceEvidence = hospital ? readiness.states.values().next().value : readiness.states.values().next().value;
  check(sourceEvidence?.sourceManifestSha256 && /^[a-f0-9]{64}$/.test(sourceEvidence.sourceManifestSha256), `${id} source manifest lineage is unavailable`);
  check(sourceEvidence?.selectedArtifactSha256 && /^[a-f0-9]{64}$/.test(sourceEvidence.selectedArtifactSha256), `${id} selected artifact lineage is unavailable`);
  const stateRows = Object.fromEntries([...evidence.states].map(([code, row]) => [code, row.directoryRows]));
  const territoryRows = Object.fromEntries(TERRITORIES.map((code) => [code, evidence.territories.byReportedAddressTerritory?.[code] ?? 0]));
  const zero = { ...claims() };
  return {
    source_id: id,
    release_id: sourceEvidence.sourceReleaseId,
    source_manifest_sha256: sourceEvidence.sourceManifestSha256,
    selected_artifact_sha256: sourceEvidence.selectedArtifactSha256,
    selection_sha256: input.evidence.selectionSha256,
    record_unit: sourceEvidence.recordUnit,
    source_dates: {
      issued: sourceEvidence.sourceIssued,
      modified: sourceEvidence.sourceModified,
      released: sourceEvidence.sourceReleased,
    },
    observed_at: sourceEvidence.observedAt,
    ...(hospital ? { acquisition_completed_at: sourceEvidence.acquisitionCompletedAt } : { recovery_created_at: sourceEvidence.recoveryCreatedAt }),
    directory_rows: expected.rows,
    state_dc_directory_rows: expected.stateDc,
    territory_directory_rows: expected.territories,
    state_rows: stateRows,
    territory_rows: territoryRows,
    export_policy: "local-review-only",
    claims: zero,
  };
}

async function loadRetainedSources(signal) {
  cancelled(signal);
  const hospitalInput = await loadCmsHospitalReportingInput({ signal });
  const hospitalReadiness = projectCmsHospitalReadiness(hospitalInput);
  const nursingInput = await loadCmsNursingHomeReportingInput({ signal });
  const nursingReadiness = projectCmsNursingHomeReadiness(nursingInput);
  check(hospitalReadiness && nursingReadiness, "both exact retained source cohorts must be verified");
  return {
    hospital: expectedSource("cms-hospital-general-information", hospitalReadiness, hospitalInput, "hospital"),
    nursing: expectedSource("cms-nursing-home-provider-information", nursingReadiness, nursingInput, "nursing"),
  };
}

function buildPayload(sources) {
  const bySource = [sources.hospital, sources.nursing];
  const jurisdictions = JURISDICTIONS.map((code) => {
    const scope = STATES.includes(code) ? "50-states-and-dc" : "territories-outside-50-states-and-dc";
    const hospitalRows = sources.hospital.state_rows[code] ?? sources.hospital.territory_rows[code] ?? 0;
    const nursingRows = sources.nursing.state_rows[code] ?? sources.nursing.territory_rows[code] ?? 0;
    return {
      jurisdiction_code: code,
      denominator_scope: scope,
      directory_row_counts: {
        hospital: hospitalRows,
        nursing_home: nursingRows,
        combined: hospitalRows + nursingRows,
      },
      export_policy: "local-review-only",
      claims: claims(),
    };
  });
  const hospitalRows = jurisdictions.reduce((sum, row) => sum + row.directory_row_counts.hospital, 0);
  const nursingRows = jurisdictions.reduce((sum, row) => sum + row.directory_row_counts.nursing_home, 0);
  check(hospitalRows === 5419 && nursingRows === 14690, "jurisdiction rows do not conserve source totals");
  check(jurisdictions.filter((row) => row.denominator_scope === "50-states-and-dc").reduce((sum, row) => sum + row.directory_row_counts.hospital, 0) === 5354, "hospital state/DC denominator drifted");
  check(jurisdictions.filter((row) => row.denominator_scope === "50-states-and-dc").reduce((sum, row) => sum + row.directory_row_counts.nursing_home, 0) === 14680, "nursing-home state/DC denominator drifted");
  check(jurisdictions.filter((row) => row.denominator_scope !== "50-states-and-dc").reduce((sum, row) => sum + row.directory_row_counts.combined, 0) === 75, "combined territory denominator drifted");
  check(bySource.length === 2, "exactly two selected sources are required");
  const sourcesArtifact = {
    schema_version: CMS_RETAINED_DIRECTORY_COVERAGE_SCHEMA,
    dataset_id: CMS_RETAINED_DIRECTORY_COVERAGE_DATASET,
    export_policy: "local-review-only",
    sources: bySource,
    combined_denominators: {
      all_retained_directory_rows: 20109,
      state_dc_retained_directory_rows: 20034,
      territory_retained_directory_rows: 75,
    },
    claims: claims(),
  };
  return { jurisdictions, sourcesArtifact };
}

function manifestFor(payload) {
  const jurisdictionBytes = jsonlBytes(payload.jurisdictions);
  const sourcesBytes = jsonBytes(payload.sourcesArtifact);
  const artifacts = [
    { path: CMS_RETAINED_DIRECTORY_COVERAGE_ARTIFACTS.jurisdictions, artifact_type: "cms-retained-directory-jurisdictions-jsonl", bytes: jurisdictionBytes.length, sha256: sha(jurisdictionBytes), record_count: 56, export_policy: "local-review-only" },
    { path: CMS_RETAINED_DIRECTORY_COVERAGE_ARTIFACTS.sources, artifact_type: "cms-retained-directory-sources-json", bytes: sourcesBytes.length, sha256: sha(sourcesBytes), record_count: 2, export_policy: "local-review-only" },
  ];
  const identity = sha(Buffer.concat([jurisdictionBytes, Buffer.from("\0"), sourcesBytes])).slice(0, 16);
  return {
    schema_version: CMS_RETAINED_DIRECTORY_COVERAGE_SCHEMA,
    dataset_id: CMS_RETAINED_DIRECTORY_COVERAGE_DATASET,
    release_id: `${CMS_RETAINED_DIRECTORY_COVERAGE_DATASET}-${identity}`,
    status: "published-pre-production-evidence",
    release_only: true,
    production_enrollment: false,
    national_reporting_denominator_enrollment: false,
    current_pointer_written: false,
    source_actions_performed: 0,
    network_requests_performed: 0,
    export_policy: "local-review-only",
    jurisdiction_count: 56,
    source_count: 2,
    denominators: { all_retained_directory_rows: 20109, state_dc_retained_directory_rows: 20034, territory_retained_directory_rows: 75 },
    source_denominators: {
      hospital: { all_retained_directory_rows: 5419, state_dc_retained_directory_rows: 5354, territory_retained_directory_rows: 65 },
      nursing_home: { all_retained_directory_rows: 14690, state_dc_retained_directory_rows: 14680, territory_retained_directory_rows: 10 },
    },
    claims: claims(),
    artifacts,
  };
}

function inside(base, target, message) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  check(relative && !relative.startsWith("..") && !path.isAbsolute(relative), message);
}

async function assertNoLinkedAncestry(base, target) {
  const resolvedBase = path.resolve(base), resolvedTarget = path.resolve(target);
  inside(resolvedBase, resolvedTarget, "output path escapes canonical data root");
  check(await (async () => { try { return (await lstat(resolvedBase)).isDirectory(); } catch { return false; } })(), "canonical data root is unavailable");
  let cursor = resolvedBase;
  check(await (await lstat(cursor)).isSymbolicLink() === false, "canonical data root is linked");
  for (const part of path.relative(resolvedBase, resolvedTarget).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { const stat = await lstat(cursor); check(!stat.isSymbolicLink(), "output path traverses a link or reparse point"); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
}

async function assertDataLocal(outputRoot, { create = false } = {}) {
  const dataRoot = path.join(APP_ROOT, "data");
  const absolute = path.resolve(outputRoot);
  check(await realpath(APP_ROOT) === path.resolve(APP_ROOT), "APP_ROOT traverses a link or reparse point");
  inside(dataRoot, absolute, "output root must remain under APP_ROOT/data");
  await assertNoLinkedAncestry(dataRoot, absolute);
  if (create) await mkdir(absolute, { recursive: true });
  const real = await (await import("node:fs/promises")).realpath(absolute);
  check(real === absolute, "output root resolves through a linked path");
  return absolute;
}

function decodeJson(bytes, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${label} is not strict UTF-8 JSON`); }
}

async function readArtifact(directory, entry) {
  const target = path.resolve(directory, entry.path);
  inside(directory, target, "artifact path escapes release");
  const stat = await lstat(target, { bigint: true });
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size <= BigInt(LIMIT_BYTES), `${entry.path} must be a bounded singly linked regular file`);
  const bytes = await readFile(target);
  check(bytes.length === entry.bytes && sha(bytes) === entry.sha256, `${entry.path} byte count or checksum mismatch`);
  return bytes;
}

async function verifyStagedContents(directory, jurisdictionBytes, sourcesBytes, manifest) {
  const entries = (await readdir(directory, { withFileTypes: true })).map((entry) => entry.name).sort();
  check(JSON.stringify(entries) === JSON.stringify(["jurisdictions.jsonl", "manifest.json", "sources.json"]), "staging output has an unexpected file set");
  for (const [name, expected] of [["jurisdictions.jsonl", jurisdictionBytes], ["sources.json", sourcesBytes], ["manifest.json", jsonBytes(manifest)]]) {
    const target = path.join(directory, name), stat = await lstat(target, { bigint: true });
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n, `staging ${name} is not a singly linked regular file`);
    check((await readFile(target)).equals(expected), `staging ${name} changed before publication`);
  }
}

export async function buildCmsRetainedDirectoryCoverageCatalog({ outputRoot = DEFAULT_CMS_RETAINED_DIRECTORY_COVERAGE_ROOT, signal } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "signal must be an AbortSignal");
  const root = await assertDataLocal(outputRoot, { create: true });
  const sources = await loadRetainedSources(signal);
  const payload = buildPayload(sources), manifest = manifestFor(payload);
  const jurisdictionBytes = jsonlBytes(payload.jurisdictions), sourcesBytes = jsonBytes(payload.sourcesArtifact);
  const releases = await assertDataLocal(path.join(root, "releases"), { create: true });
  const releaseDirectory = path.join(releases, manifest.release_id);
  const lock = path.join(releases, `.${manifest.release_id}.publish-lock`);
  try { await mkdir(lock); } catch (error) { if (error.code === "EEXIST") fail("release identity is locked"); throw error; }
  const staging = path.join(releases, `.${manifest.release_id}.staging-${randomUUID()}`);
  let ownsStaging = false;
  try {
    cancelled(signal);
    try {
      const stat = await lstat(releaseDirectory);
      check(stat.isDirectory() && !stat.isSymbolicLink(), "pre-existing release identity is not a regular directory");
      const verified = await verifyCmsRetainedDirectoryCoverageCatalog(path.join(releaseDirectory, "manifest.json"), { signal });
      check(verified.manifest.release_id === manifest.release_id, "pre-existing release content conflicts with the requested identity");
      return { manifest: verified.manifest, manifestSha256: verified.manifestSha256, releaseDirectory, reused_existing_release: true };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(staging); ownsStaging = true;
    await writeFile(path.join(staging, CMS_RETAINED_DIRECTORY_COVERAGE_ARTIFACTS.jurisdictions), jurisdictionBytes, { flag: "wx" });
    await writeFile(path.join(staging, CMS_RETAINED_DIRECTORY_COVERAGE_ARTIFACTS.sources), sourcesBytes, { flag: "wx" });
    cancelled(signal);
    await writeFile(path.join(staging, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    await verifyStagedContents(staging, jurisdictionBytes, sourcesBytes, manifest);
    try { await lstat(releaseDirectory); fail("release identity appeared during publication"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(staging, releaseDirectory); ownsStaging = false;
    const publishedStat = await lstat(releaseDirectory, { bigint: true });
    check(publishedStat.isDirectory() && !publishedStat.isSymbolicLink(), "published release directory identity changed");
    return { manifest, manifestSha256: sha(jsonBytes(manifest)), releaseDirectory, reused_existing_release: false };
  } finally {
    if (ownsStaging) await rm(staging, { recursive: true, force: true });
    await rmdir(lock).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { signal, allowOwnedStaging = false, expectedManifestSha256 } = {}) {
  check(signal === undefined || signal instanceof AbortSignal, "signal must be an AbortSignal");
  const root = await assertDataLocal(path.dirname(path.dirname(path.resolve(manifestPath))));
  void root;
  const absoluteManifest = path.resolve(manifestPath);
  check(path.basename(absoluteManifest) === "manifest.json", "manifest filename is invalid");
  const directory = path.dirname(absoluteManifest);
  await assertNoLinkedAncestry(path.join(APP_ROOT, "data"), directory);
  const directoryStat = await lstat(directory, { bigint: true });
  check(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), "release directory is invalid");
  const manifestStat = await lstat(absoluteManifest, { bigint: true });
  check(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.nlink === 1n && manifestStat.size <= BigInt(LIMIT_BYTES), "manifest must be a bounded singly linked file");
  if (expectedManifestSha256 !== undefined) check(/^[a-f0-9]{64}$/.test(expectedManifestSha256), "expected manifest SHA-256 is invalid");
  const manifestBytes = await readFile(absoluteManifest), manifestSha256 = sha(manifestBytes);
  if (expectedManifestSha256 !== undefined) check(manifestSha256 === expectedManifestSha256, "manifest SHA-256 does not match the expected pin");
  const manifest = decodeJson(manifestBytes, "manifest");
  const expectedKeys = ["schema_version", "dataset_id", "release_id", "status", "release_only", "production_enrollment", "national_reporting_denominator_enrollment", "current_pointer_written", "source_actions_performed", "network_requests_performed", "export_policy", "jurisdiction_count", "source_count", "denominators", "source_denominators", "claims", "artifacts"];
  check(manifest && Object.getPrototypeOf(manifest) === Object.prototype && JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(expectedKeys.sort()), "manifest fields drifted");
  check(manifest.schema_version === CMS_RETAINED_DIRECTORY_COVERAGE_SCHEMA && manifest.dataset_id === CMS_RETAINED_DIRECTORY_COVERAGE_DATASET && manifest.status === "published-pre-production-evidence"
    && manifest.release_only === true && manifest.production_enrollment === false && manifest.national_reporting_denominator_enrollment === false && manifest.current_pointer_written === false && manifest.source_actions_performed === 0 && manifest.network_requests_performed === 0
    && manifest.export_policy === "local-review-only" && manifest.jurisdiction_count === 56 && manifest.source_count === 2, "manifest identity or authority boundary drifted");
  check(JSON.stringify(manifest.claims) === JSON.stringify(claims()), "manifest claim boundary drifted");
  const names = (await readdir(directory, { withFileTypes: true })).map((entry) => entry.name).sort();
  check(JSON.stringify(names) === JSON.stringify(["jurisdictions.jsonl", "manifest.json", "sources.json"]), "release contains unexpected files or directories");
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 2, "artifact inventory is invalid");
  const jurisdictionArtifact = manifest.artifacts[0], sourcesArtifact = manifest.artifacts[1];
  check(jurisdictionArtifact.path === "jurisdictions.jsonl" && jurisdictionArtifact.artifact_type === "cms-retained-directory-jurisdictions-jsonl" && jurisdictionArtifact.record_count === 56 && jurisdictionArtifact.export_policy === "local-review-only"
    && sourcesArtifact.path === "sources.json" && sourcesArtifact.artifact_type === "cms-retained-directory-sources-json" && sourcesArtifact.record_count === 2 && sourcesArtifact.export_policy === "local-review-only", "artifact descriptors drifted");
  const jurisdictionBytes = await readArtifact(directory, jurisdictionArtifact), sourcesBytes = await readArtifact(directory, sourcesArtifact);
  const sourcesArtifactJson = decodeJson(sourcesBytes, "sources artifact");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(jurisdictionBytes).split("\n");
  check(lines.at(-1) === "" && lines.length === 57, "jurisdiction JSONL framing or row count drifted");
  const jurisdictions = lines.slice(0, -1).map((line) => decodeJson(Buffer.from(line), "jurisdiction row"));
  const codes = jurisdictions.map((row) => row.jurisdiction_code);
  check(JSON.stringify(codes) === JSON.stringify(JURISDICTIONS), "jurisdiction order or membership drifted");
  for (const [index, row] of jurisdictions.entries()) {
    const allowed = ["jurisdiction_code", "denominator_scope", "directory_row_counts", "export_policy", "claims"];
    check(JSON.stringify(Object.keys(row).sort()) === JSON.stringify(allowed.sort()), `jurisdiction row ${index} schema drifted`);
    check(row.denominator_scope === (index < 51 ? "50-states-and-dc" : "territories-outside-50-states-and-dc") && row.export_policy === "local-review-only", `jurisdiction row ${index} scope/policy drifted`);
    check(Object.keys(row.directory_row_counts).sort().join(",") === "combined,hospital,nursing_home" && Object.values(row.directory_row_counts).every(Number.isSafeInteger), `jurisdiction row ${index} counts are invalid`);
    check(row.directory_row_counts.combined === row.directory_row_counts.hospital + row.directory_row_counts.nursing_home, `jurisdiction row ${index} counts do not conserve`);
    check(JSON.stringify(row.claims) === JSON.stringify(claims()), `jurisdiction row ${index} claim boundary drifted`);
  }
  const sourceList = sourcesArtifactJson?.sources;
  check(sourcesArtifactJson?.schema_version === CMS_RETAINED_DIRECTORY_COVERAGE_SCHEMA && sourcesArtifactJson.dataset_id === CMS_RETAINED_DIRECTORY_COVERAGE_DATASET
    && sourcesArtifactJson.export_policy === "local-review-only" && Array.isArray(sourceList) && sourceList.length === 2
    && sourceList[0].source_id === "cms-hospital-general-information" && sourceList[1].source_id === "cms-nursing-home-provider-information", "source artifact identity or order drifted");
  const sourceFields = ["source_id", "release_id", "source_manifest_sha256", "selected_artifact_sha256", "selection_sha256", "record_unit", "source_dates", "observed_at", "directory_rows", "state_dc_directory_rows", "territory_directory_rows", "state_rows", "territory_rows", "export_policy", "claims"];
  for (const [index, source] of sourceList.entries()) {
    const allowed = [...sourceFields, ...(index === 0 ? ["acquisition_completed_at"] : ["recovery_created_at"] )];
    check(JSON.stringify(Object.keys(source).sort()) === JSON.stringify(allowed.sort()), `source ${index} schema drifted`);
    for (const key of ["source_manifest_sha256", "selected_artifact_sha256", "selection_sha256"]) check(/^[a-f0-9]{64}$/.test(source[key] ?? ""), `source ${index} lineage hash is invalid`);
    check(source.export_policy === "local-review-only" && JSON.stringify(source.claims) === JSON.stringify(claims()), `source ${index} claim/policy boundary drifted`);
  }
  check(JSON.stringify(sourcesArtifactJson.combined_denominators) === JSON.stringify({ all_retained_directory_rows: 20109, state_dc_retained_directory_rows: 20034, territory_retained_directory_rows: 75 }), "combined source denominators drifted");
  const digestIdentity = sha(Buffer.concat([jurisdictionBytes, Buffer.from("\0"), sourcesBytes])).slice(0, 16);
  check(manifest.release_id === `${CMS_RETAINED_DIRECTORY_COVERAGE_DATASET}-${digestIdentity}`, "release identity is not content-derived");
  const inputs = await loadRetainedSources(signal);
  const payload = buildPayload(inputs), expectedManifest = manifestFor(payload);
  check(jurisdictionBytes.equals(jsonlBytes(payload.jurisdictions)) && sourcesBytes.equals(jsonBytes(payload.sourcesArtifact)), "artifacts do not match replayed retained source projections");
  check(JSON.stringify(manifest) === JSON.stringify(expectedManifest), "manifest does not match replayed source lineage or conservation");
  const releaseName = path.basename(directory), staging = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(releaseName);
  check(releaseName === manifest.release_id || (allowOwnedStaging && staging), "release directory identity drifted");
  cancelled(signal);
  return { manifest, manifestSha256, jurisdictions, sources: sourcesArtifactJson };
}
