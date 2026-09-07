import path from "node:path";
import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { APP_ROOT } from "./paths.mjs";
import { publishNyRetailFoodStoresStaging, verifyNyRetailFoodStores } from "./ny-retail-food-stores.mjs";
import { publishCaAbcActiveLicenseSitesStaging, verifyCaAbcActiveLicenseSites } from "./ca-abc-active-license-sites.mjs";
import { publishWaLniActiveContractorStaging, verifyWaLniActiveContractors } from "./wa-lni-active-contractor-licenses.mjs";

const DEFINITION = "config/migrations/normalized-us-postal-fields-v1.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SOURCES = Object.freeze({
  nyRetailFoodStores: { datasetId: "ny-retail-food-store-license-sites", verify: verifyNyRetailFoodStores, publish: publishNyRetailFoodStoresStaging },
  caAbcActiveLicenses: { datasetId: "ca-abc-active-license-sites", verify: verifyCaAbcActiveLicenseSites, publish: publishCaAbcActiveLicenseSitesStaging },
  waLniActiveContractors: { datasetId: "wa-lni-active-contractor-organizations", verify: verifyWaLniActiveContractors, publish: publishWaLniActiveContractorStaging },
});

function inside(root, candidate, label) { const resolved = path.resolve(root, candidate); const relative = path.relative(path.resolve(root), resolved); if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the datahub root.`); return resolved; }
async function existingInside(root, candidate, label) { const resolved = inside(root, candidate, label); const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(resolved)]); const relative = path.relative(realRoot, realCandidate); if (relative.startsWith("..") || path.isAbsolute(relative) || path.resolve(realCandidate) !== path.resolve(resolved)) throw new Error(`${label} crosses a link or junction.`); return resolved; }
function artifactPath(value) { if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) throw new Error("Manifest artifact path is invalid."); const normalized = path.posix.normalize(value); if (normalized !== value || normalized === ".." || normalized.startsWith("../")) throw new Error("Manifest artifact path escapes its release."); return value; }
async function hashFile(file) { const hash = createHash("sha256"); let bytes = 0; for await (const chunk of createReadStream(file)) { bytes += chunk.length; hash.update(chunk); } return { bytes, sha256: hash.digest("hex") }; }
async function optionalHash(file) { try { return { exists: true, ...(await hashFile(file)) }; } catch (error) { if (error.code === "ENOENT") return { exists: false, bytes: null, sha256: null }; throw error; } }
function abort(signal) { if (signal?.aborted) { const error = new Error("Candidate import cancelled before publication."); error.name = "AbortError"; throw error; } }
async function exclusiveJson(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); }
async function rejectLinkedAncestors(root, target, label) { let current = path.resolve(target); const stop = path.resolve(root); while (current !== stop) { try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`${label} contains a forbidden link or junction.`); } catch (error) { if (error.code !== "ENOENT") throw error; } current = path.dirname(current); } }

export async function importIndustryCandidate({ root = APP_ROOT, sourceKey, sourcePointer, expectedReleaseId, expectedManifestSha256, signal, dependencies = {} } = {}) {
  const resolvedRoot = await realpath(path.resolve(root)); const source = SOURCES[sourceKey];
  if (!source) throw new Error(`Unsupported industry candidate source: ${sourceKey ?? "(missing)"}.`);
  if (typeof sourcePointer !== "string" || !sourcePointer) throw new Error("sourcePointer is required.");
  if (!RELEASE.test(expectedReleaseId ?? "")) throw new Error("expectedReleaseId is invalid.");
  if (!SHA256.test(expectedManifestSha256 ?? "")) throw new Error("expectedManifestSha256 must be a lowercase SHA-256.");
  const definition = JSON.parse(await readFile(await existingInside(resolvedRoot, DEFINITION, "Migration definition"), "utf8"));
  const definitionSource = definition.sources?.find((item) => item.source_key === sourceKey);
  if (!definitionSource || definitionSource.dataset_id !== source.datasetId || definition.candidate_root !== "data/migrations/normalized-us-postal-fields-v1") throw new Error("Migration definition does not contain the expected fixed candidate contract.");
  const candidateRoot = inside(resolvedRoot, path.join(definition.candidate_root, "sources", sourceKey), "Candidate root");
  const receiptRoot = inside(resolvedRoot, path.join(definition.candidate_root, "import-receipts", sourceKey), "Receipt root");
  await rejectLinkedAncestors(resolvedRoot, candidateRoot, "Candidate root"); await rejectLinkedAncestors(resolvedRoot, receiptRoot, "Receipt root"); await mkdir(candidateRoot, { recursive: true }); await mkdir(receiptRoot, { recursive: true });
  const receipt = { schema_version: 1, import_id: randomUUID(), source_key: sourceKey, dataset_id: source.datasetId, expected_release_id: expectedReleaseId, expected_manifest_sha256: expectedManifestSha256, status: "running", started_at: new Date().toISOString() };
  const receiptPath = path.join(receiptRoot, `${receipt.import_id}.json`);
  const lockPath = path.join(candidateRoot, ".import.lock"); let lock; let publicationAttempted = false; let published = null;
  try {
    try { lock = await open(lockPath, "wx"); await lock.writeFile(`${JSON.stringify({ import_id: receipt.import_id, pid: process.pid, started_at: receipt.started_at })}\n`); } catch (error) { if (error.code === "EEXIST") throw new Error("Another candidate import owner holds the source lock."); throw error; }
    abort(signal);
    const pointerPath = await existingInside(resolvedRoot, sourcePointer, "Source pointer"); const pointerLink = await lstat(pointerPath); if (!pointerLink.isFile() || pointerLink.isSymbolicLink()) throw new Error("Source pointer must be a regular file.");
    if (path.resolve(pointerPath) === path.resolve(resolvedRoot, definitionSource.pointer)) throw new Error("Production source pointers cannot be imported by this command.");
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    if (pointer.dataset_id !== source.datasetId || pointer.release_id !== expectedReleaseId || typeof pointer.manifest !== "string") throw new Error("Source pointer identity does not match the expected release.");
    const manifestPath = await existingInside(resolvedRoot, path.resolve(path.dirname(pointerPath), pointer.manifest), "Source manifest");
    const manifestLink = await lstat(manifestPath); if (!manifestLink.isFile() || manifestLink.isSymbolicLink()) throw new Error("Source manifest must be a regular file.");
    const manifestBytes = await readFile(manifestPath); const manifestHash = { bytes: manifestBytes.length, sha256: createHash("sha256").update(manifestBytes).digest("hex") }; if (manifestHash.sha256 !== expectedManifestSha256) throw new Error("Source manifest SHA-256 does not match the expected hash.");
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (manifest.dataset_id !== source.datasetId || manifest.release_id !== expectedReleaseId || manifest.status !== "published" || !UUID.test(manifest.run_id ?? "") || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw new Error("Source manifest is not a complete expected published release.");
    for (const artifact of manifest.artifacts) artifactPath(artifact.path);
    const verify = dependencies.verifiers?.[sourceKey] ?? source.verify; const publish = dependencies.publishers?.[sourceKey] ?? source.publish;
    const candidatePointer = path.join(candidateRoot, "current.json");
    for (const [target, label] of [[path.join(candidateRoot, ".staging"), "Candidate staging root"], [path.join(candidateRoot, "releases"), "Candidate releases root"], [candidatePointer, "Candidate pointer"]]) await rejectLinkedAncestors(resolvedRoot, target, label);
    const pointerBefore = await optionalHash(candidatePointer); receipt.pointer_before_sha256 = pointerBefore.sha256;
    await verify(manifestPath); abort(signal);
    const staging = path.join(candidateRoot, ".staging", manifest.run_id); const release = path.join(candidateRoot, "releases", manifest.release_id); receipt.staging = path.relative(resolvedRoot, staging).replaceAll("\\", "/"); receipt.release = path.relative(resolvedRoot, release).replaceAll("\\", "/");
    for (const [destination, label] of [[staging, "staging run"], [release, "release"]]) { try { await stat(destination); throw new Error(`Candidate ${label} already exists.`); } catch (error) { if (error.code !== "ENOENT") throw error; } }
    await mkdir(path.dirname(staging), { recursive: true }); await mkdir(staging, { recursive: false });
    await writeFile(path.join(staging, "manifest.json"), manifestBytes, { flag: "wx" });
    for (const artifact of manifest.artifacts) {
      abort(signal); const relative = artifactPath(artifact.path);
      if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || !SHA256.test(artifact.sha256 ?? "")) throw new Error(`Manifest artifact metadata is invalid: ${relative}.`);
      const input = await existingInside(path.dirname(manifestPath), relative, `Artifact ${relative}`); const link = await lstat(input); if (!link.isFile() || link.isSymbolicLink()) throw new Error(`Artifact must be a regular file: ${relative}.`);
      const actual = await hashFile(input); if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Artifact integrity check failed: ${relative}.`);
      const output = inside(staging, relative, `Staged artifact ${relative}`); await mkdir(path.dirname(output), { recursive: true }); await copyFile(input, output, constants.COPYFILE_EXCL);
      const copied = await hashFile(output); if (copied.bytes !== actual.bytes || copied.sha256 !== actual.sha256) throw new Error(`Staged artifact changed while copying: ${relative}.`);
    }
    if ((await hashFile(path.join(staging, "manifest.json"))).sha256 !== expectedManifestSha256) throw new Error("Staged manifest changed while copying.");
    await verify(path.join(staging, "manifest.json")); abort(signal);
    await dependencies.beforePublish?.({ sourceKey, candidateRoot, candidatePointer, pointerBefore }); abort(signal);
    if ((await hashFile(path.join(staging, "manifest.json"))).sha256 !== expectedManifestSha256) throw new Error("Staged manifest changed before publication.");
    const pointerRecheck = await optionalHash(candidatePointer); if (JSON.stringify(pointerRecheck) !== JSON.stringify(pointerBefore)) throw new Error("Candidate pointer changed before publication.");
    publicationAttempted = true; published = await publish({ outputRoot: candidateRoot, stagingRunId: manifest.run_id, expectedReleaseId });
    const publishedManifestHash = await hashFile(path.join(published.releaseDirectory, "manifest.json")); if (publishedManifestHash.sha256 !== expectedManifestSha256) throw new Error("Published candidate manifest bytes changed.");
    await verify(path.join(published.releaseDirectory, "manifest.json"));
    Object.assign(receipt, { status: "succeeded", finished_at: new Date().toISOString(), source_pointer: path.relative(resolvedRoot, pointerPath).replaceAll("\\", "/"), candidate_pointer: path.relative(resolvedRoot, published.pointerPath).replaceAll("\\", "/"), release_id: manifest.release_id, run_id: manifest.run_id, manifest_sha256: publishedManifestHash.sha256, artifact_count: manifest.artifacts.length, pointer_before_sha256: pointerBefore.sha256, pointer_after_sha256: (await hashFile(published.pointerPath)).sha256 });
    await exclusiveJson(receiptPath, receipt); return { receiptPath, receipt, pointerPath: published.pointerPath, releaseDirectory: published.releaseDirectory };
  } catch (error) {
    const pointerNow = await optionalHash(path.join(candidateRoot, "current.json")).catch(() => ({ sha256: null }));
    Object.assign(receipt, { status: publicationAttempted ? "published-unverified" : error.name === "AbortError" ? "cancelled" : "failed", publication_attempted: publicationAttempted, published_release_exists: await stat(path.join(candidateRoot, "releases", expectedReleaseId)).then((x) => x.isDirectory()).catch(() => false), finished_at: new Date().toISOString(), pointer_after_sha256: pointerNow.sha256, error: String(error.message).replace(/[\r\n\t]+/g, " ").slice(0, 500) });
    await exclusiveJson(receiptPath, receipt); error.receiptPath = receiptPath; throw error;
  } finally { await lock?.close().catch(() => {}); if (lock) await unlink(lockPath).catch(() => {}); }
}

export const INDUSTRY_CANDIDATE_SOURCE_KEYS = Object.freeze(Object.keys(SOURCES));
