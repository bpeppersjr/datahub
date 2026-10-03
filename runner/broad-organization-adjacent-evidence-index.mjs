import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const ADJACENT_EVIDENCE_INDEX_VERSION = "broad-organization-adjacent-evidence-index@1.0.0";
export const ADJACENT_EVIDENCE_INDEX_DATASET_ID = "broad-organization-adjacent-evidence-index";
export const DEFAULT_ADJACENT_EVIDENCE_SELECTION = path.join(APP_ROOT, "config", "broad-organization-adjacent-evidence-selection.json");
export const DEFAULT_ADJACENT_EVIDENCE_ROOT = path.join(APP_ROOT, "data", ADJACENT_EVIDENCE_INDEX_DATASET_ID);

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isSha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const check = (value, message) => { if (!value) throw new Error(`Adjacent retained evidence rejected: ${message}`); };
const cleanText = (value, label) => { check(typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 500, `${label} is invalid`); return value; };

function at(object, dottedPath) {
  if (dottedPath === null) return null;
  check(typeof dottedPath === "string" && /^[a-zA-Z0-9_.]+$/.test(dottedPath), "selection path is invalid");
  return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function selectedCount(manifest, item) {
  const value = at(manifest, item.count_path);
  if (item.count_match) {
    check(Array.isArray(value), `${item.evidence_id} count-match target is not an array`);
    const matches = value.filter((row) => row?.[item.count_match.field] === item.count_match.value);
    check(matches.length === 1, `${item.evidence_id} count-match is not unique`);
    return matches[0]?.[item.count_match.count_field];
  }
  return value;
}

async function boundedFile(root, relativePath, expectedSha256, label) {
  check(typeof relativePath === "string" && relativePath.includes("/") && !path.isAbsolute(relativePath), `${label} path is invalid`);
  check(isSha(expectedSha256), `${label} SHA-256 is invalid`);
  const absolute = path.resolve(root, ...relativePath.split("/"));
  check(!path.relative(root, absolute).startsWith(".."), `${label} leaves the repository`);
  const resolved = await realpath(absolute);
  check(!path.relative(root, resolved).startsWith(".."), `${label} resolves outside the repository`);
  const info = await stat(resolved);
  check(info.isFile() && info.size > 0 && info.size <= 64 * 1024 * 1024, `${label} size is invalid`);
  const bytes = await readFile(resolved);
  check(sha256(bytes) === expectedSha256, `${label} hash drifted`);
  return { bytes, json: JSON.parse(bytes), relativePath };
}

async function loadInputs({ root, selectionPath }) {
  root = await realpath(path.resolve(root));
  const resolvedSelection = await realpath(path.resolve(selectionPath));
  check(!path.relative(root, resolvedSelection).startsWith(".."), "selection is outside the repository");
  const selectionBytes = await readFile(resolvedSelection);
  check(selectionBytes.length <= 2 * 1024 * 1024, "selection is too large");
  const selection = JSON.parse(selectionBytes);
  check(selection.schema_version === "broad-organization-adjacent-evidence-selection@1.0.0", "selection schema is unsupported");
  check(/^20\d{2}-\d{2}-\d{2}T/.test(selection.observed_at), "selection observation time is invalid");
  check(selection.claims?.network_requests === 0 && selection.claims?.acquisition_authorized === false
    && selection.claims?.production_pointer_change_authorized === false && selection.claims?.broad_layer_admission_authorized === false
    && selection.claims?.all_business_completeness_percent === null, "selection authority boundary is invalid");
  check(Array.isArray(selection.evidence) && selection.evidence.length <= 100, "selection evidence is invalid");
  const gap = await boundedFile(root, selection.gap_projection?.manifest_path, selection.gap_projection?.manifest_sha256, "gap manifest");
  const gapManifest = gap.json;
  check(gapManifest.dataset_id === "broad-organization-matrix-gap-projection" && gapManifest.current_gap_count === 40
    && gapManifest.admitted_broad_layer_count === 11 && gapManifest.network_requests === 0 && gapManifest.current_pointer_changed === false,
  "gap manifest boundary is invalid");
  check(gapManifest.artifacts?.length === 1 && isSha(gapManifest.artifacts[0].sha256), "gap artifact declaration is invalid");
  const gapArtifactPath = path.posix.join(path.posix.dirname(selection.gap_projection.manifest_path), gapManifest.artifacts[0].path);
  const projection = await boundedFile(root, gapArtifactPath, gapManifest.artifacts[0].sha256, "gap projection");
  check(projection.bytes.length === gapManifest.artifacts[0].bytes, "gap projection byte count drifted");
  const gaps = projection.json.gaps;
  check(Array.isArray(gaps) && gaps.length === 40, "gap projection does not contain exactly 40 gaps");
  const gapMap = new Map(gaps.map((row) => [row.state_abbreviation, row]));
  check(gapMap.size === 40 && [...gapMap.values()].every((row) => row.matrix_availability_status === "unmeasured" && row.matrix_gap_reason === "broad jurisdiction organization layer is missing"), "broad gap semantics drifted");
  return { root, selection, selectionSha256: sha256(selectionBytes), gapManifest, gapMap };
}

export async function buildBroadOrganizationAdjacentEvidenceIndex({ root = APP_ROOT, selectionPath = DEFAULT_ADJACENT_EVIDENCE_SELECTION } = {}) {
  const inputs = await loadInputs({ root, selectionPath });
  const byState = new Map([...inputs.gapMap].map(([code]) => [code, []]));
  const evidenceIds = new Set();
  for (const item of inputs.selection.evidence) {
    check(/^[A-Z]{2}$/.test(item.state) && byState.has(item.state), `${item.evidence_id ?? "evidence"} is not assigned to a current broad gap`);
    cleanText(item.evidence_id, "evidence ID"); check(/^[a-z0-9][a-z0-9-]+$/.test(item.evidence_id) && !evidenceIds.has(item.evidence_id), "evidence ID is invalid or duplicated"); evidenceIds.add(item.evidence_id);
    cleanText(item.label, `${item.evidence_id} label`); cleanText(item.evidence_kind, `${item.evidence_id} kind`);
    cleanText(item.row_unit, `${item.evidence_id} row unit`); cleanText(item.geography_scope, `${item.evidence_id} geography scope`); cleanText(item.temporal_limitation, `${item.evidence_id} temporal limitation`);
    check(Array.isArray(item.coverage_limitations) && item.coverage_limitations.length >= 1 && item.coverage_limitations.length <= 10, `${item.evidence_id} limitations are invalid`);
    item.coverage_limitations.forEach((value) => cleanText(value, `${item.evidence_id} limitation`));
    check(["internal", "local-review-only"].includes(item.export_policy), `${item.evidence_id} export policy is too broad`);
    const source = await boundedFile(inputs.root, item.manifest_path, item.manifest_sha256, `${item.evidence_id} manifest`);
    const count = selectedCount(source.json, item);
    check(Number.isSafeInteger(count) && count > 0, `${item.evidence_id} count is invalid`);
    const releaseId = at(source.json, item.release_id_path), sourceReleaseId = at(source.json, item.source_release_id_path);
    cleanText(releaseId, `${item.evidence_id} release ID`); cleanText(sourceReleaseId, `${item.evidence_id} source release ID`);
    const referenceValue = item.source_reference_path === null ? null : at(source.json, item.source_reference_path) ?? null;
    check(referenceValue === null || typeof referenceValue === "string" || Number.isSafeInteger(referenceValue), `${item.evidence_id} source reference is invalid`);
    byState.get(item.state).push({
      evidence_id: item.evidence_id, label: item.label, evidence_kind: item.evidence_kind, record_count: count, row_unit: item.row_unit,
      provenance: { release_id: releaseId, source_release_id: sourceReleaseId, manifest_sha256: item.manifest_sha256 },
      source_reference: { status: referenceValue === null ? "unknown" : "reported", field: referenceValue === null ? null : item.source_reference_field, value: referenceValue },
      temporal_limitation: item.temporal_limitation, current_operation_verified: false, geography_scope: item.geography_scope,
      authority: { retained_offline_use_authorized: true, acquisition_authorized: false, broad_layer_admission_authorized: false, production_pointer_change_authorized: false, export_policy: item.export_policy },
      coverage_limitations: [...item.coverage_limitations],
    });
  }
  const jurisdictions = [...inputs.gapMap].sort(([a], [b]) => a.localeCompare(b)).map(([code, gap]) => {
    const evidence = byState.get(code).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    return { code, name: gap.state_name, broad_layer_gap: true, broad_layer_status: "unmeasured", adjacent_evidence_status: evidence.length ? "retained-adjacent-evidence" : "no-retained-adjacent-evidence", evidence_count: evidence.length, evidence,
      limitations: ["Adjacent evidence is not a broad organization layer and does not change this jurisdiction's gap.", "Counts are source-cohort rows or source-defined entities, not an all-business completeness numerator."] };
  });
  const body = { schema_version: ADJACENT_EVIDENCE_INDEX_VERSION, dataset_id: ADJACENT_EVIDENCE_INDEX_DATASET_ID, created_at: inputs.selection.observed_at,
    source: { gap_projection_release_id: inputs.gapManifest.release_id, gap_projection_manifest_sha256: inputs.selection.gap_projection.manifest_sha256, selection_sha256: inputs.selectionSha256 },
    summary: { broad_layer_gap_jurisdictions: 40, jurisdictions_with_retained_adjacent_evidence: jurisdictions.filter((row) => row.evidence_count > 0).length, jurisdictions_without_retained_adjacent_evidence: jurisdictions.filter((row) => row.evidence_count === 0).length, retained_evidence_items: evidenceIds.size, broad_layer_gaps_closed: 0 },
    jurisdictions, claims: { network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, broad_layer_gap_preserved: true, active_business_count: null, all_business_completeness_percent: null } };
  const contentSha256 = sha256(stable(body));
  return { ...body, release_id: `${ADJACENT_EVIDENCE_INDEX_DATASET_ID}-${contentSha256.slice(0, 24)}` };
}

export async function publishBroadOrganizationAdjacentEvidenceIndex(options = {}) {
  const root = await realpath(path.resolve(options.root ?? APP_ROOT));
  const index = await buildBroadOrganizationAdjacentEvidenceIndex({ ...options, root });
  const releaseRoot = path.join(root, "data", ADJACENT_EVIDENCE_INDEX_DATASET_ID, "releases");
  const directory = path.join(releaseRoot, index.release_id), staging = `${directory}.staging-${process.pid}`;
  check(!path.relative(root, directory).startsWith(".."), "output leaves the repository");
  await mkdir(releaseRoot, { recursive: true });
  try {
    await mkdir(staging);
    const bytes = Buffer.from(stable(index));
    await writeFile(path.join(staging, "index.json"), bytes, { flag: "wx" });
    const manifest = { schema_version: "broad-organization-adjacent-evidence-index-manifest@1.0.0", dataset_id: ADJACENT_EVIDENCE_INDEX_DATASET_ID, release_id: index.release_id, status: "published-local-derived-index", created_at: index.created_at, network_requests: 0, current_pointer_written: false, production_enrollment: false, artifacts: [{ path: "index.json", bytes: bytes.length, sha256: sha256(bytes), record_count: 40, artifact_type: "adjacent-retained-evidence-index-json", export_policy: "local-review-only" }], source: index.source };
    await writeFile(path.join(staging, "manifest.json"), stable(manifest), { flag: "wx" });
    await rename(staging, directory);
    return { directory, index, manifest };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error?.code === "EEXIST") return verifyBroadOrganizationAdjacentEvidenceIndex(path.join(directory, "manifest.json"), options);
    throw error;
  }
}

export async function verifyBroadOrganizationAdjacentEvidenceIndex(manifestPath, options = {}) {
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes), directory = path.dirname(manifestPath);
  check(manifest.schema_version === "broad-organization-adjacent-evidence-index-manifest@1.0.0" && manifest.dataset_id === ADJACENT_EVIDENCE_INDEX_DATASET_ID
    && manifest.status === "published-local-derived-index" && manifest.network_requests === 0 && manifest.current_pointer_written === false && manifest.production_enrollment === false
    && manifest.artifacts?.length === 1 && manifest.artifacts[0].record_count === 40, "manifest contract is invalid");
  const indexBytes = await readFile(path.join(directory, manifest.artifacts[0].path));
  check(indexBytes.length === manifest.artifacts[0].bytes && sha256(indexBytes) === manifest.artifacts[0].sha256, "index artifact drifted");
  const actual = JSON.parse(indexBytes), expected = await buildBroadOrganizationAdjacentEvidenceIndex(options);
  check(stable(actual) === stable(expected), "index replay differs from retained inputs");
  check(actual.release_id === manifest.release_id && stable(actual.source) === stable(manifest.source), "manifest lineage differs from index");
  return { directory, index: actual, manifest, manifest_sha256: sha256(manifestBytes) };
}

export async function findAndVerifyBroadOrganizationAdjacentEvidenceIndex({ root = APP_ROOT, ...options } = {}) {
  const releases = path.join(root, "data", ADJACENT_EVIDENCE_INDEX_DATASET_ID, "releases");
  const entries = (await readdir(releases, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.includes(".staging-") && entry.name.startsWith(`${ADJACENT_EVIDENCE_INDEX_DATASET_ID}-`));
  check(entries.length === 1, "expected exactly one canonical pointer-free release");
  return verifyBroadOrganizationAdjacentEvidenceIndex(path.join(releases, entries[0].name, "manifest.json"), { root, ...options });
}
