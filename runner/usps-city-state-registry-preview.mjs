import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { verifyCityStateDenominatorCandidate } from "./usps-city-state-denominator-candidate.mjs";

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_UNIVERSE_BYTES = 4 * 1024 * 1024;
const MAX_ZIP_UNIVERSE_ROWS = 100_000;
const ZIP_CLASSES = ["standard", "po-box", "unique", "military"];
const LISTED_STATUS = "listed-in-reviewed-usps-city-state-operational-candidate";
const NOT_LISTED_STATUS = "not-listed-in-reviewed-usps-city-state-operational-candidate";
const SOURCE_KIND = "usps-city-state-operational-candidate";
const EVIDENCE_SCOPE = "usps-city-state-source-reported-zip5-assignment";

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function localFile(candidate, label) {
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${label} path is required.`);
  return assertInsideApp(path.resolve(APP_ROOT, candidate));
}

function identity(info) { return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs ?? info.mtimeMs}`; }

async function stableRead(filePath, label, maximum) {
  const absolute = localFile(filePath, label);
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maximum)) {
    throw new Error(`${label} must be one bounded regular, non-linked file.`);
  }
  if (await realpath(absolute) !== absolute) throw new Error(`${label} path must be canonical.`);
  const handle = await open(absolute, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (identity(before) !== identity(opened) || opened.nlink !== 1n) throw new Error(`${label} changed before the read.`);
    const bytes = await handle.readFile();
    const afterHandle = await handle.stat({ bigint: true });
    const afterPath = await lstat(absolute, { bigint: true });
    if (identity(before) !== identity(afterHandle) || identity(before) !== identity(afterPath) || BigInt(bytes.length) !== opened.size) {
      throw new Error(`${label} changed during the read.`);
    }
    return { absolute, bytes, sha256: sha256(bytes) };
  } finally { await handle.close(); }
}

async function readJson(filePath, label, maximum) {
  const read = await stableRead(filePath, label, maximum);
  try { return { ...read, value: JSON.parse(read.bytes.toString("utf8")) }; }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function boundedInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label} is required.`);
  }
  if (!/^(?:0|[1-9]\d*)$/.test(String(value))) throw new Error(`${label} must be a non-negative integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} is outside its allowed range.`);
  return parsed;
}

function zipList(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error("zip5Universe must be an array of five-digit strings.");
  if (value.length > MAX_ZIP_UNIVERSE_ROWS) throw new Error(`zip5Universe may contain at most ${MAX_ZIP_UNIVERSE_ROWS} ZIP5 rows.`);
  const result = [...new Set(value.map((zip) => {
    if (typeof zip !== "string" || !/^\d{5}$/.test(zip)) throw new Error("zip5Universe contains an invalid ZIP5.");
    return zip;
  }))].sort();
  return result;
}

export async function readZip5UniverseFile(filePath) {
  const read = await readJson(filePath, "ZIP5 universe", MAX_ZIP_UNIVERSE_BYTES);
  return zipList(read.value);
}

function optionalPrefix(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) throw new Error("zipPrefix must contain one to five digits.");
  return value;
}

function optionalClass(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!ZIP_CLASSES.includes(value)) throw new Error(`zipClass must be one of ${ZIP_CLASSES.join(", ")}.`);
  return value;
}

function optionalToken(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(value)) throw new Error(`${label} is not a valid status token.`);
  return value;
}

function optionalMembership(value) {
  if (value === undefined || value === null || value === "") return null;
  if (![LISTED_STATUS, NOT_LISTED_STATUS].includes(value)) throw new Error("membershipStatus is not a supported candidate membership status.");
  return value;
}

function candidateRow(row, manifest, manifestSha256) {
  const expectedKeys = ["assignment_status", "created_at", "deliverability_status", "evidence_scope", "export_policy", "observed_at", "postal_code", "provenance", "schema_version", "source_month", "source_status", "source_version", "zip4", "zip_class", "zip_code", "zcta_status"].sort();
  if (!row || typeof row !== "object" || Array.isArray(row) || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expectedKeys)
    || row.schema_version !== "usps-city-state-operational-denominator-row@1.0.0"
    || !/^\d{5}$/.test(row.zip_code ?? "") || row.postal_code !== row.zip_code || row.zip4 !== null
    || !ZIP_CLASSES.includes(row.zip_class) || typeof row.source_status !== "string"
    || !/^[a-z][a-z0-9-]{1,39}$/.test(row.source_status)
    || row.assignment_status !== "usps-city-state-included"
    || row.evidence_scope !== EVIDENCE_SCOPE || row.deliverability_status !== "not-asserted"
    || row.zcta_status !== "not-asserted" || row.export_policy !== "local-restricted"
    || typeof row.source_month !== "string" || typeof row.source_version !== "string"
    || !row.provenance || typeof row.provenance !== "object" || Array.isArray(row.provenance)) {
    throw new Error("Candidate artifact row is invalid or has incomplete temporal/provenance fields.");
  }
  return {
    zip5: row.zip_code,
    postal_code: row.postal_code,
    zip4: null,
    membership_status: LISTED_STATUS,
    source_kind: SOURCE_KIND,
    evidence_scope: EVIDENCE_SCOPE,
    source_month: row.source_month,
    source_version: row.source_version,
    source_status: row.source_status,
    zip_class: row.zip_class,
    assignment_status: row.assignment_status,
    observed_at: row.observed_at,
    created_at: row.created_at,
    source_release_id: manifest.release_id,
    candidate_release_id: manifest.release_id,
    candidate_manifest_sha256: manifestSha256,
    provenance: row.provenance,
    export_policy: "local-restricted",
    deliverability_status: "not-asserted",
    zcta_geometry: "not-included",
  };
}

function summarize(rows, candidateConservation, universe, manifest) {
  const listed = rows.filter((row) => row.membership_status === LISTED_STATUS);
  const notListed = rows.filter((row) => row.membership_status === NOT_LISTED_STATUS);
  const statusCounts = {};
  const classCounts = Object.fromEntries(ZIP_CLASSES.map((zipClass) => [zipClass, 0]));
  for (const row of listed) {
    statusCounts[row.source_status] = (statusCounts[row.source_status] ?? 0) + 1;
    classCounts[row.zip_class] += 1;
  }
  return {
    source_kind: SOURCE_KIND,
    dataset_id: manifest.dataset_id,
    candidate_release_id: manifest.release_id,
    source_month: manifest.source.source_month,
    source_version: manifest.source.source_version,
    evidence_scope: EVIDENCE_SCOPE,
    export_policy: "local-restricted",
    candidate_conservation: structuredClone(candidateConservation),
    candidate_row_count: candidateConservation.row_count,
    universe_listed_row_count: listed.length,
    universe_not_listed_row_count: notListed.length,
    returned_row_count: rows.length,
    source_status_counts: statusCounts,
    listed_zip_class_counts: classCounts,
    universe: universe === null
      ? { supplied: false, meaning: "No external ZIP universe was supplied; absence rows were not evaluated." }
      : { supplied: true, zip5_count: universe.length, universe_listed_row_count: listed.length, universe_not_listed_row_count: notListed.length,
        absence_meaning: "not-listed-in-selected-candidate-only; not invalid, undeliverable, or non-operational" },
  };
}

export async function previewUspsCityStateCandidate({
  candidateManifestPath,
  admissionManifestPath,
  inputPath,
  statusMappingPath,
  zip5Universe,
  zip5UniversePath,
  zipPrefix,
  zipClass,
  sourceStatus,
  membershipStatus,
  offset = 0,
  limit = 100,
} = {}) {
  if (zip5Universe !== undefined && zip5UniversePath !== undefined) throw new Error("Provide zip5Universe or zip5UniversePath, not both.");
  const normalizedPrefix = optionalPrefix(zipPrefix);
  const normalizedClass = optionalClass(zipClass);
  const normalizedSourceStatus = optionalToken(sourceStatus, "sourceStatus");
  const normalizedMembership = optionalMembership(membershipStatus);
  const pageOffset = boundedInteger(offset, "offset", { maximum: Number.MAX_SAFE_INTEGER, fallback: 0 });
  const pageLimit = boundedInteger(limit, "limit", { minimum: 1, maximum: 500, fallback: 100 });
  const universe = zip5UniversePath !== undefined ? await readZip5UniverseFile(zip5UniversePath) : zipList(zip5Universe);
  const manifestPath = localFile(candidateManifestPath, "Candidate manifest");
  const admissionPath = localFile(admissionManifestPath, "Admission manifest");
  const sourcePath = localFile(inputPath, "Operator-managed City State input");
  const mappingPath = localFile(statusMappingPath, "Status mapping");
  const manifestBefore = await readJson(manifestPath, "Candidate manifest", MAX_MANIFEST_BYTES);
  const manifestBeforeValue = manifestBefore.value;
  const manifestBeforeArtifact = Array.isArray(manifestBeforeValue.artifacts)
    ? manifestBeforeValue.artifacts.find((entry) => entry && entry.path === "zip5-operational-denominator.jsonl")
    : null;
  if (!manifestBeforeArtifact) throw new Error("Candidate artifact is missing.");
  const artifactPath = localFile(path.join(path.dirname(manifestPath), manifestBeforeArtifact.path), "Candidate artifact");
  const artifactBefore = await stableRead(artifactPath, "Candidate artifact", MAX_ARTIFACT_BYTES);
  await verifyCityStateDenominatorCandidate(manifestPath, {
    admissionManifestPath: admissionPath,
    inputPath: sourcePath,
    statusMappingPath: mappingPath,
  });
  const manifestRead = await readJson(manifestPath, "Candidate manifest", MAX_MANIFEST_BYTES);
  if (manifestRead.sha256 !== manifestBefore.sha256 || manifestRead.bytes.length !== manifestBefore.bytes.length) throw new Error("Candidate manifest changed during preview verification.");
  const manifest = manifestRead.value;
  if (manifest.status !== "candidate-local-restricted" || manifest.export_policy !== "local-restricted"
    || manifest.production_admitted !== false || manifest.current_pointer_written !== false
    || manifest.redistribution_authorized !== false || manifest.network_requests !== 0 || manifest.downloaded_bytes !== 0) {
    throw new Error("Candidate publication boundary is invalid for read-only preview.");
  }
  const artifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((entry) => entry && entry.path === "zip5-operational-denominator.jsonl")
    : null;
  if (!artifact || typeof artifact.bytes !== "number" || !/^\w[\w./-]*\.jsonl$/.test(artifact.path)
    || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new Error("Candidate artifact metadata is invalid.");
  }
  const artifactAfter = await stableRead(artifactPath, "Candidate artifact", MAX_ARTIFACT_BYTES);
  if (artifactAfter.sha256 !== artifactBefore.sha256 || artifactAfter.bytes.length !== artifactBefore.bytes.length
    || artifactAfter.bytes.length !== artifact.bytes || artifactAfter.sha256 !== artifact.sha256) {
    throw new Error("Candidate artifact changed during preview verification or failed integrity validation.");
  }
  const manifestSha256 = manifestRead.sha256;
  const listedRows = artifactAfter.bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => candidateRow(JSON.parse(line), manifest, manifestSha256));
  if (listedRows.length !== manifest.candidate_conservation.row_count || new Set(listedRows.map((row) => row.zip5)).size !== listedRows.length) throw new Error("Candidate row conservation or uniqueness failed in preview.");
  const byZip = new Map(listedRows.map((row) => [row.zip5, row]));
  const allRows = universe === null ? listedRows : universe.map((zip5) => byZip.get(zip5) ?? {
    zip5,
    postal_code: zip5,
    zip4: null,
    membership_status: NOT_LISTED_STATUS,
    source_kind: SOURCE_KIND,
    evidence_scope: EVIDENCE_SCOPE,
    source_month: manifest.source.source_month,
    source_version: manifest.source.source_version,
    source_status: null,
    zip_class: null,
    assignment_status: null,
    observed_at: manifest.created_at,
    created_at: manifest.created_at,
    source_release_id: manifest.release_id,
    candidate_release_id: manifest.release_id,
    candidate_manifest_sha256: manifestSha256,
    provenance: null,
    export_policy: "local-restricted",
    deliverability_status: "not-asserted",
    zcta_geometry: "not-included",
  });
  const filtered = allRows.filter((row) => (!normalizedPrefix || row.zip5.startsWith(normalizedPrefix))
    && (!normalizedClass || row.zip_class === normalizedClass)
    && (!normalizedSourceStatus || row.source_status === normalizedSourceStatus)
    && (!normalizedMembership || row.membership_status === normalizedMembership));
  const rows = filtered.slice(pageOffset, pageOffset + pageLimit);
  return {
    schema_version: "usps-city-state-registry-preview@1.0.0",
    read_only: true,
    writes_performed: 0,
    network_requests: 0,
    production_admitted: false,
    current_pointer_written: false,
    operational_status_asserted: false,
    completeness_claimed: false,
    zcta_geometry: "not-included",
    candidate: summarize(allRows, manifest.candidate_conservation, universe, manifest),
    pagination: { offset: pageOffset, limit: pageLimit, total: filtered.length, returned: rows.length },
    filters: { zip_prefix: normalizedPrefix, zip_class: normalizedClass, source_status: normalizedSourceStatus, membership_status: normalizedMembership },
    rows,
  };
}
