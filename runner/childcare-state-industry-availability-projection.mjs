import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const DATASET = "childcare-state-industry-availability-projection";
export const SCHEMA = `${DATASET}@1.1.0`;
export const SUCCESSOR_SCHEMA = `${DATASET}@1.2.0`;
export const DEFAULT_ROOT = path.join(APP_ROOT, "data", DATASET);
const SUCCESSOR_SOURCE_RELEASE = "retained-childcare-zip-evidence-fff67989bf590fe4c4c878c6fd5dffdbaeb612a10deeed8ac049997716da2e0e";
const SUCCESSOR_SOURCE_MANIFEST_SHA256 = "4fa7e65399c3a123a723fab8aa2fa9919594db61fa34c0883c581e6cf01c14f0";
const CODES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const MEASURED = new Set(["PA", "CT", "MD", "VT", "CO", "UT", "IA"]);
const HASH = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`Childcare state-industry availability projection rejected: ${message}.`); };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (root, file) => { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
const sameStat = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

async function regularRead(file, signal) {
  signal?.throwIfAborted(); const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail("input is not a singly linked regular file");
  const value = await readFile(file, { signal }); signal?.throwIfAborted(); const after = await lstat(file);
  if (!sameStat(before, after) || value.length !== before.size) fail("input changed while read"); return value;
}
async function canonicalChild(root, file) {
  const canonicalRoot = await realpath(root), canonicalFile = await realpath(file);
  if (!within(canonicalRoot, canonicalFile)) fail("path escapes canonical root"); return canonicalFile;
}
async function safeOutput(root, outputRoot) {
  const data = await realpath(path.join(root, "data")), resolved = path.resolve(outputRoot);
  if (!within(data, resolved)) fail("output must be below canonical repository data");
  let cursor = data; for (const part of path.relative(data, resolved).split(path.sep)) { cursor = path.join(cursor, part); try { const s = await lstat(cursor); if (!s.isDirectory() || s.isSymbolicLink()) fail("output ancestry contains a link or non-directory"); } catch (error) { if (error.code !== "ENOENT") throw error; await mkdir(cursor); } }
  if (!within(data, await realpath(resolved))) fail("output canonical path escapes repository data"); return resolved;
}

async function source(root = APP_ROOT, signal, successor = false) {
  if (successor) {
    const manifestPath = path.join(root, "data/retained-childcare-zip-evidence/releases", SUCCESSOR_SOURCE_RELEASE, "manifest.json");
    await canonicalChild(root, manifestPath); const manifestBytes = await regularRead(manifestPath, signal), manifest = JSON.parse(manifestBytes);
    if (sha(manifestBytes) !== SUCCESSOR_SOURCE_MANIFEST_SHA256 || manifest.release_id !== SUCCESSOR_SOURCE_RELEASE || manifest.schema_version !== "retained-childcare-zip-evidence@1.3.0" || manifest.publication_mode !== "immutable-pointer-free" || manifest.claims?.network_requests !== 0 || manifest.claims?.current_pointer_written !== false || manifest.claims?.production_enrollment !== false || manifest.claims?.national_denominator_enrollment !== false) fail("successor source identity or boundary drifted");
    return { registrationPath: null, registrationBytes: null, manifestPath, manifestBytes, manifest };
  }
  const registrationPath = path.join(root, "config/datasets/retained-childcare-zip-evidence.json");
  await canonicalChild(root, registrationPath); const registrationBytes = await regularRead(registrationPath, signal), registration = JSON.parse(registrationBytes);
  if (registration.dataset_id !== "retained-childcare-zip-evidence" || registration.release_only !== true || registration.runtime_pointer !== null || registration.production_enrollment !== false || registration.national_denominator_enrollment !== false) fail("source registration authority widened");
  const manifestPath = path.join(root, registration.retained_release.manifest);
  await canonicalChild(root, manifestPath); const manifestBytes = await regularRead(manifestPath, signal), manifest = JSON.parse(manifestBytes);
  if (sha(manifestBytes) !== registration.retained_release.manifest_sha256 || manifest.release_id !== registration.retained_release.release_id || manifest.publication_mode !== "immutable-pointer-free" || manifest.claims?.network_requests !== 0 || manifest.claims?.current_pointer_written !== false || manifest.claims?.production_enrollment !== false || manifest.claims?.national_denominator_enrollment !== false) fail("registered source identity or boundary drifted");
  if (!equal(manifest.summary, registration.retained_release.summary) || !equal(manifest.sources, registration.retained_release.sources)) fail("registered source counts drifted");
  return { registrationPath, registrationBytes, manifestPath, manifestBytes, manifest };
}

export function deriveChildcareStateIndustryAvailabilityProjection(manifest, sourceManifestSha256, successor = false) {
  const expected = successor ? { source_schema: "retained-childcare-zip-evidence@1.3.0", accepted: 12234, zip: 12232, missing: 1, invalid: 1, projection_schema: SUCCESSOR_SCHEMA } : { source_schema: "retained-childcare-zip-evidence@1.2.0", accepted: 12210, zip: 12208, missing: 1, invalid: 1, projection_schema: SCHEMA };
  if (manifest?.dataset_id !== "retained-childcare-zip-evidence" || manifest.schema_version !== expected.source_schema || !HASH.test(sourceManifestSha256) || manifest.summary?.accepted_candidate_rows !== expected.accepted || manifest.summary?.zip_present_candidate_rows !== expected.zip || manifest.summary?.missing_zip_candidate_rows !== expected.missing || manifest.summary?.invalid_zip_candidate_rows !== expected.invalid || Object.keys(manifest.sources ?? {}).length !== 7) fail("source release is not the selected retained seven-cohort evidence");
  const jurisdictions = CODES.map((code) => {
    if (!MEASURED.has(code)) return { code, industry: "childcare", measurement_status: "unmeasured", retained_candidate_rows: null, zip_present_candidate_rows: null, missing_zip_candidate_rows: null, invalid_zip_candidate_rows: null, source_id: null, source_release_id: null };
    const cohort = manifest.sources[code];
    if (!cohort || cohort.publisher_scope !== code || cohort.status !== "available") fail(`measured cohort ${code} is absent`);
    const reasons = cohort.quality?.zip_unavailable_reasons ?? {}, missing = reasons["missing-source-zip"] ?? 0;
    const invalid = Object.entries(reasons).filter(([key]) => key !== "missing-source-zip").reduce((sum, [, count]) => sum + count, 0);
    if (cohort.accepted_candidate_rows !== cohort.quality.with_zip5 + missing + invalid) fail(`${code} row/ZIP/invalid conservation failed`);
    return { code, industry: "childcare", measurement_status: "measured-retained-candidate-cohort", retained_candidate_rows: cohort.accepted_candidate_rows, zip_present_candidate_rows: cohort.quality.with_zip5, missing_zip_candidate_rows: missing, invalid_zip_candidate_rows: invalid, source_id: cohort.source_id, source_release_id: manifest.release_id };
  });
  const totals = jurisdictions.filter((row) => row.measurement_status !== "unmeasured").reduce((sum, row) => ({ retained_candidate_rows: sum.retained_candidate_rows + row.retained_candidate_rows, zip_present_candidate_rows: sum.zip_present_candidate_rows + row.zip_present_candidate_rows, missing_zip_candidate_rows: sum.missing_zip_candidate_rows + row.missing_zip_candidate_rows, invalid_zip_candidate_rows: sum.invalid_zip_candidate_rows + row.invalid_zip_candidate_rows }), { retained_candidate_rows: 0, zip_present_candidate_rows: 0, missing_zip_candidate_rows: 0, invalid_zip_candidate_rows: 0 });
  if (!equal(totals, { retained_candidate_rows: expected.accepted, zip_present_candidate_rows: expected.zip, missing_zip_candidate_rows: expected.missing, invalid_zip_candidate_rows: expected.invalid }) || totals.retained_candidate_rows !== totals.zip_present_candidate_rows + totals.missing_zip_candidate_rows + totals.invalid_zip_candidate_rows) fail("national candidate conservation failed");
  return { schema_version: expected.projection_schema, dataset_id: DATASET, industry: "childcare", projection_kind: "pointer-free-non-denominator-state-industry-evidence", source: { dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest_sha256: sourceManifestSha256, created_at: manifest.created_at }, derivative_time_policy: { derivative_created_at: null, rule: "No derivative clock is invented; source.created_at is retained source metadata only." }, scope: { jurisdictions: 51, measured_retained_candidate_cohorts: 7, unmeasured_jurisdictions: 44 }, totals, jurisdictions, claims: { count_unit: "retained-source-candidate-row", availability_semantics: "evidence-availability-only", denominator: null, business_count: null, physical_site_count: null, current_operating_count: null, completeness_percent: null, current_usps_validity_verified: false, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false } };
}
export function deriveChildcareStateIndustryAvailabilityProjectionSuccessor(manifest, sourceManifestSha256) { return deriveChildcareStateIndustryAvailabilityProjection(manifest, sourceManifestSha256, true); }

function manifestFor(projection) {
  const artifact = bytes(projection), digest = sha(artifact), releaseId = `${DATASET}-${digest}`;
  return { schema_version: `${DATASET}-manifest@${projection.schema_version === SUCCESSOR_SCHEMA ? "1.2.0" : "1.1.0"}`, dataset_id: DATASET, release_id: releaseId, status: "immutable-local-derived-release", publication_mode: "pointer-free", source_release_id: projection.source.release_id, source_manifest_sha256: projection.source.manifest_sha256, measured_jurisdictions: 7, unmeasured_jurisdictions: 44, retained_candidate_rows: projection.totals.retained_candidate_rows, zip_present_candidate_rows: projection.totals.zip_present_candidate_rows, missing_zip_candidate_rows: projection.totals.missing_zip_candidate_rows, invalid_zip_candidate_rows: projection.totals.invalid_zip_candidate_rows, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, artifacts: [{ path: "projection.json", bytes: artifact.length, sha256: digest }] };
}

async function expected(root = APP_ROOT, signal, successor = false) { const s = await source(root, signal, successor), projection = deriveChildcareStateIndustryAvailabilityProjection(s.manifest, sha(s.manifestBytes), successor); return { s, projection, manifest: manifestFor(projection) }; }

async function buildProjection({ outputRoot = DEFAULT_ROOT, root = APP_ROOT, signal } = {}, successor = false) {
  signal?.throwIfAborted();
  const safeRoot = await safeOutput(root, outputRoot), e = await expected(root, signal, successor), releases = path.join(safeRoot, "releases"), directory = path.join(releases, e.manifest.release_id);
  await mkdir(releases, { recursive: true }); signal?.throwIfAborted();
  try { await verifyProjection(path.join(directory, "manifest.json"), { root, signal }, successor); return { ...e, releaseDirectory: directory, reused_existing_release: true }; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = path.join(releases, `.${e.manifest.release_id}.lock`), staging = path.join(releases, `.${e.manifest.release_id}.staging-${randomUUID()}`);
  await mkdir(lock); let owns = false, primary;
  try { signal?.throwIfAborted(); await mkdir(staging); owns = true; await writeFile(path.join(staging, "projection.json"), bytes(e.projection), { flag: "wx", signal }); signal?.throwIfAborted(); await writeFile(path.join(staging, "manifest.json"), bytes(e.manifest), { flag: "wx", signal }); signal?.throwIfAborted(); await verifyProjection(path.join(staging, "manifest.json"), { root, allowStaging: true, signal }, successor); signal?.throwIfAborted(); await rename(staging, directory); owns = false; signal?.throwIfAborted(); await verifyProjection(path.join(directory, "manifest.json"), { root, signal }, successor); }
  catch (error) { primary = error; throw error; }
  finally { try { if (owns) await rm(staging, { recursive: true, force: true }); await rmdir(lock); } catch (cleanup) { if (primary) primary.cleanup_error = cleanup.message; else throw cleanup; } }
  return { ...e, releaseDirectory: directory, reused_existing_release: false };
}
export async function buildChildcareStateIndustryAvailabilityProjection(options = {}) { return buildProjection(options, false); }
export async function buildChildcareStateIndustryAvailabilityProjectionSuccessor(options = {}) { return buildProjection(options, true); }

async function verifyProjection(manifestPath, { root = APP_ROOT, allowStaging = false, signal } = {}, successor = false) {
  signal?.throwIfAborted(); await canonicalChild(path.join(root, "data"), path.dirname(manifestPath));
  const stat = await lstat(manifestPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail("manifest is not a singly linked file");
  const directory = path.dirname(manifestPath), entries = await readdir(directory, { withFileTypes: true }); if (entries.length !== 2 || entries.some((entry) => !entry.isFile() || entry.isSymbolicLink() || !["manifest.json", "projection.json"].includes(entry.name))) fail("release inventory is not closed");
  const artifactPath = path.join(directory, "projection.json"), artifactStat = await lstat(artifactPath); if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.nlink !== 1) fail("artifact is not a singly linked regular file");
  const manifestBytes = await regularRead(manifestPath, signal), manifest = JSON.parse(manifestBytes), projectionBytes = await regularRead(artifactPath, signal), e = await expected(root, signal, successor);
  if (!equal(manifest, e.manifest) || !manifest.artifacts?.[0] || projectionBytes.length !== manifest.artifacts[0].bytes || sha(projectionBytes) !== manifest.artifacts[0].sha256 || !projectionBytes.equals(bytes(e.projection))) fail("release does not independently replay from retained ZIP evidence");
  const name = path.basename(directory), staged = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(name); if (name !== manifest.release_id && !(allowStaging && staged)) fail("release path does not match content identity");
  signal?.throwIfAborted(); const finalEntries = await readdir(directory); if (!equal(finalEntries.sort(), ["manifest.json", "projection.json"])) fail("release inventory changed during verification");
  return { verified: true, manifest, manifest_sha256: sha(manifestBytes), projection: e.projection };
}
export async function verifyChildcareStateIndustryAvailabilityProjection(manifestPath, options = {}) { return verifyProjection(manifestPath, options, false); }
export async function verifyChildcareStateIndustryAvailabilityProjectionSuccessor(manifestPath, options = {}) { return verifyProjection(manifestPath, options, true); }
