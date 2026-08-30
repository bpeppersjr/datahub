import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const USPS_OPERATIONAL_ZIP_SCHEMA_VERSION = "1.0.0";
export const USPS_OPERATIONAL_ZIP_TRANSFORMATION_VERSION = "usps-operational-zip-assignments@1.0.0";
export const USPS_POSTALPRO_HOST = "postalpro.usps.com";
export const USPS_RESOURCE_PAGES = Object.freeze({
  areaDistrict: "https://postalpro.usps.com/areadist_ZIP5",
  aisuZips: "https://postalpro.usps.com/ais-viewer/aisuzips",
  aisuLayout: "https://postalpro.usps.com/ais-viewer/aisulout",
});

const FILE_PATTERNS = Object.freeze({
  areaDistrict: /^AREADIST_ZIP5(?:_\d+)?\.TXT$/i,
  aisuZips: /^AISUZIPS(?:_\d+)?\.TXT$/i,
  aisuLayout: /^AISULOUT(?:_\d+)?\.TXT$/i,
});

const USE_BASES = new Set(["personal-noncommercial-home-use", "usps-written-permission"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function lines(buffer, label) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
  if (text.includes("\u0000")) throw new Error(`${label} is not a plain UTF-8/ASCII text file.`);
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

export function normalizeUspsUseAuthorization(value = {}) {
  const basis = String(value.basis ?? "").trim();
  if (!USE_BASES.has(basis)) {
    throw new Error("USPS use authorization basis must be personal-noncommercial-home-use or usps-written-permission.");
  }
  const permissionReference = value.permissionReference == null ? null : String(value.permissionReference).trim();
  if (basis === "usps-written-permission" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/.test(permissionReference ?? "")) {
    throw new Error("A non-secret USPS written-permission reference is required for business, redistribution, or public use.");
  }
  if (basis === "personal-noncommercial-home-use" && permissionReference !== null && permissionReference !== "") {
    throw new Error("permissionReference is only valid with usps-written-permission.");
  }
  return {
    basis,
    permission_reference: basis === "usps-written-permission" ? permissionReference : null,
    redistribution_authorized: basis === "usps-written-permission",
  };
}

function assertSafeUspsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== USPS_POSTALPRO_HOST || url.username || url.password || url.port) {
    throw new Error(`${label} must use HTTPS on ${USPS_POSTALPRO_HOST}.`);
  }
  if (url.pathname.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`${label} contains an unsafe path.`);
  }
  return url;
}

export function discoverUspsFileUrl(html, pageUrl, expectedPattern) {
  const page = assertSafeUspsUrl(pageUrl, "USPS resource page URL");
  const urls = new Set();
  for (const match of String(html).matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const candidate = assertSafeUspsUrl(new URL(match[1], page).toString(), "USPS resource file URL");
    const filename = decodeURIComponent(candidate.pathname.split("/").at(-1) ?? "");
    if (expectedPattern.test(filename)) urls.add(candidate.toString());
  }
  if (urls.size !== 1) throw new Error(`Expected exactly one current USPS resource link; found ${urls.size}.`);
  return [...urls][0];
}

function sourceMonth(url) {
  const match = new URL(url).pathname.match(/\/storages\/(\d{4}-\d{2})\//);
  if (!match) throw new Error(`USPS resource URL has no versioned storage month: ${url}`);
  return match[1];
}

export function parseAisuLayout(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
  const marker = "FILE LAYOUT FOR AISUZIPS.TXT";
  const section = text.toUpperCase().slice(text.toUpperCase().indexOf(marker));
  if (!section.startsWith(marker)
    || !/^\s*1\s+5 DIGIT ZIP\s+0?5\s+0?1\s+0?5\s*$/m.test(section)
    || !/^\s*2\s+AISU\s+0?5\s+0?6\s+10\s*$/m.test(section)) {
    throw new Error("AISULOUT does not declare the expected AISUZIPS positions 1-5 and 6-10.");
  }
  return { zip_start: 1, zip_end: 5, aisu_start: 6, aisu_end: 10, record_length: 10 };
}

export function parseAisuZipFile(buffer) {
  const records = lines(buffer, "AISUZIPS").map((line, index) => {
    if (!/^\d{10}$/.test(line)) throw new Error(`AISUZIPS row ${index + 1} is not a 10-digit fixed-width record.`);
    return { zip_code: line.slice(0, 5), aisu: line.slice(5, 10) };
  });
  const zips = records.map((record) => record.zip_code);
  if (new Set(zips).size !== zips.length) throw new Error("AISUZIPS contains duplicate 5-digit ZIP rows.");
  return records.sort((a, b) => a.zip_code.localeCompare(b.zip_code));
}

export function parseAreaDistrictZipFile(buffer) {
  const records = lines(buffer, "AREADIST_ZIP5").map((line, index) => {
    if (line.length !== 54) throw new Error(`AREADIST_ZIP5 row ${index + 1} has length ${line.length}; expected 54.`);
    const record = {
      area_name: line.slice(0, 21).trim(),
      area_code: line.slice(21, 23),
      district_name: line.slice(24, 45).trim(),
      district_code: line.slice(45, 48).trim(),
      zip_code: line.slice(49, 54),
    };
    if (line[23] !== " " || line[48] !== " " || !record.area_name || !/^[A-Z0-9]{2}$/.test(record.area_code)
      || !record.district_name || !/^[A-Z0-9]{2,3}$/.test(record.district_code) || !/^\d{5}$/.test(record.zip_code)) {
      throw new Error(`AREADIST_ZIP5 row ${index + 1} violates the expected fixed-width field contract.`);
    }
    return record;
  });
  const zips = records.map((record) => record.zip_code);
  if (new Set(zips).size !== zips.length) throw new Error("AREADIST_ZIP5 contains duplicate 5-digit ZIP rows.");
  return records.sort((a, b) => a.zip_code.localeCompare(b.zip_code));
}

export function reconcileUspsZipSets(areaDistrictRecords, aisuRecords, { minimumAssignments = 1 } = {}) {
  if (!Number.isInteger(minimumAssignments) || minimumAssignments < 1) throw new Error("minimumAssignments must be a positive integer.");
  if (areaDistrictRecords.length < minimumAssignments) {
    throw new Error(`USPS Area/District file has ${areaDistrictRecords.length} assignments; expected at least ${minimumAssignments}.`);
  }
  const aisu = new Set(aisuRecords.map((record) => record.zip_code));
  const area = new Set(areaDistrictRecords.map((record) => record.zip_code));
  const missingFromAisu = [...area].filter((zipCode) => !aisu.has(zipCode)).sort();
  if (missingFromAisu.length > 0) {
    throw new Error(`USPS Area/District set has ${missingFromAisu.length} ZIP row(s) absent from AISUZIPS.`);
  }
  const routingOnly = [...aisu].filter((zipCode) => !area.has(zipCode)).sort();
  return {
    area_district_assignments: areaDistrictRecords.length,
    aisu_routing_rows: aisuRecords.length,
    routing_only_rows: routingOnly.length,
    routing_only_zip_codes: routingOnly,
  };
}

function normalizedZipRows(areaDistrictRecords, context) {
  return areaDistrictRecords.map((record) => ({
    schema_version: USPS_OPERATIONAL_ZIP_SCHEMA_VERSION,
    zip_code: record.zip_code,
    assignment_status: "listed-in-current-usps-area-district-file",
    evidence_scope: "operational-area-district-5-digit-zip-assignment",
    deliverability_status: "not-asserted",
    zcta_status: "not-asserted",
    area: { name: record.area_name, code: record.area_code },
    district: { name: record.district_name, code: record.district_code },
    source_month: context.sourceMonth,
    observed_at: context.retrievedAt,
    provenance: {
      source_id: "usps-postalpro-area-district-zip5",
      source_release_id: `usps-postalpro-area-district-zip5-${context.sourceMonth}`,
      source_record_id: record.zip_code,
      ingest_run_id: context.runId,
      transformation_version: USPS_OPERATIONAL_ZIP_TRANSFORMATION_VERSION,
      policy_id: "usps-operational-zip-assignments",
    },
    export_policy: context.redistributionAuthorized ? "permission-governed" : "local-restricted",
  }));
}

async function fetchBuffer(url, { fetchImpl, signal, maximumBytes, label }) {
  const safeUrl = assertSafeUspsUrl(url, label);
  const response = await fetchImpl(safeUrl, {
    method: "GET",
    redirect: "error",
    headers: { accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > maximumBytes) throw new Error(`${label} size ${buffer.length} is outside the allowed range.`);
  return buffer;
}

export async function acquireUspsOperationalZipFiles({ fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl is required.");
  const pageEntries = await Promise.all(Object.entries(USPS_RESOURCE_PAGES).map(async ([key, url]) => {
    const buffer = await fetchBuffer(url, { fetchImpl, signal, maximumBytes: 2_000_000, label: `${key} resource page` });
    return [key, { url, buffer }];
  }));
  const pages = Object.fromEntries(pageEntries);
  const fileUrls = Object.fromEntries(Object.keys(USPS_RESOURCE_PAGES).map((key) => [
    key,
    discoverUspsFileUrl(pages[key].buffer.toString("utf8"), pages[key].url, FILE_PATTERNS[key]),
  ]));
  const months = new Set(Object.values(fileUrls).map(sourceMonth));
  if (months.size !== 1) throw new Error("USPS resource files do not share one storage release month.");
  const limits = { areaDistrict: 5_000_000, aisuZips: 2_000_000, aisuLayout: 1_000_000 };
  const fileEntries = await Promise.all(Object.entries(fileUrls).map(async ([key, url]) => [
    key,
    await fetchBuffer(url, { fetchImpl, signal, maximumBytes: limits[key], label: `${key} data file` }),
  ]));
  return { pages, files: Object.fromEntries(fileEntries), fileUrls, sourceMonth: [...months][0] };
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildUspsOperationalZipAssignments({
  outputRoot,
  useAuthorization,
  fetchImpl = globalThis.fetch,
  signal,
  now = () => new Date(),
  qualityMinimumAssignments = 30_000,
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  const authorization = normalizeUspsUseAuthorization(useAuthorization);
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const acquired = await acquireUspsOperationalZipFiles({ fetchImpl, signal });
  const layout = parseAisuLayout(acquired.files.aisuLayout);
  const aisuRecords = parseAisuZipFile(acquired.files.aisuZips);
  const areaDistrictRecords = parseAreaDistrictZipFile(acquired.files.areaDistrict);
  const reconciliation = reconcileUspsZipSets(areaDistrictRecords, aisuRecords, { minimumAssignments: qualityMinimumAssignments });
  const normalized = normalizedZipRows(areaDistrictRecords, {
    runId,
    retrievedAt,
    sourceMonth: acquired.sourceMonth,
    redistributionAuthorized: authorization.redistribution_authorized,
  });

  const releaseId = `usps-operational-zips-${acquired.sourceMonth.replace("-", "")}-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  for (const [key, value] of Object.entries(acquired.pages)) {
    artifacts.push(await writeArtifact(stagingDirectory, `source/pages/${key}.html`, value.buffer, {
      artifact_type: "usps-resource-page-html",
      source_url: value.url,
      distribution_policy: "local-restricted",
    }));
  }
  for (const [key, buffer] of Object.entries(acquired.files)) {
    artifacts.push(await writeArtifact(stagingDirectory, `source/files/${key}.txt`, buffer, {
      artifact_type: `usps-${key}-text`,
      source_url: acquired.fileUrls[key],
      record_count: key === "areaDistrict" ? areaDistrictRecords.length : key === "aisuZips" ? aisuRecords.length : null,
      distribution_policy: "local-restricted",
    }));
  }
  artifacts.push(await writeArtifact(stagingDirectory, "derived/operational-zip-assignments.jsonl", jsonLines(normalized), {
    artifact_type: "usps-operational-zip-assignment-jsonl",
    record_count: normalized.length,
    distribution_policy: authorization.redistribution_authorized ? "permission-governed" : "local-restricted",
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/routing-only-summary.json", json({
    routing_only_count: reconciliation.routing_only_rows,
    interpretation: "AISU routing rows absent from AREADIST_ZIP5; excluded from the operational Area/District assignment denominator.",
  }), {
    artifact_type: "usps-routing-only-summary-json",
    record_count: reconciliation.routing_only_rows,
    distribution_policy: "aggregate-only",
  }));

  const manifest = {
    schema_version: USPS_OPERATIONAL_ZIP_SCHEMA_VERSION,
    dataset_id: "usps-operational-zip-assignments",
    connector: { id: "usps-operational-zip-assignments", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_month: acquired.sourceMonth,
    status: "published-local-restricted",
    complete_source_release: true,
    complete_current_area_district_assignment_file: true,
    complete_current_delivery_zip_registry: false,
    use_authorization: authorization,
    coverage: {
      current_area_district_zip_assignment_denominator: reconciliation.area_district_assignments,
      aisu_routing_rows: reconciliation.aisu_routing_rows,
      routing_only_rows_excluded_from_denominator: reconciliation.routing_only_rows,
    },
    source: {
      publisher: "United States Postal Service",
      source_pages: USPS_RESOURCE_PAGES,
      file_urls: acquired.fileUrls,
      terms_url: "https://about.usps.com/who/legal/terms-of-use.htm",
      policy_profile: "config/source-policies/usps-operational-zip-assignments.json",
    },
    record_layout: { aisu_zips: layout, area_district_record_length: 54 },
    coverage_semantics: {
      included: "ZIP appears in the current USPS-published AREADIST_ZIP5 Area/District assignment file.",
      excluded: "AISUZIPS-only routing rows are excluded from the denominator.",
      not_asserted: ["address-level deliverability", "delivery type", "city/state name", "ZIP+4 ranges", "Census ZCTA polygon"],
    },
    export_policy: authorization.redistribution_authorized
      ? "Permission-governed; apply the referenced USPS written permission before export."
      : "Local restricted use only; do not redistribute USPS rows or derived ZIP assignments.",
    limitations: [
      "The source proves presence in the current Area/District assignment file, not address-level deliverability.",
      "AISUZIPS includes routing rows that are not Area/District 5-digit assignments; those rows are preserved only as aggregate reconciliation evidence.",
      "USPS ZIP Codes are routing constructs and are not interchangeable with Census ZCTAs or polygon geography.",
      "The public PostalPro download does not itself grant public redistribution rights under the USPS site terms.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
    status: manifest.status,
  };
  await mkdir(outputRoot, { recursive: true });
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json(pointer), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published USPS operational ZIP release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyUspsOperationalZipRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "usps-operational-zip-assignments") failures.push({ path: "manifest.json", reason: "unexpected dataset ID" });
  if (manifest.status !== "published-local-restricted" || manifest.complete_source_release !== true
    || manifest.complete_current_area_district_assignment_file !== true || manifest.complete_current_delivery_zip_registry !== false) {
    failures.push({ path: "manifest.json", reason: "unsupported completeness or publication status" });
  }
  try {
    const normalizedAuthorization = normalizeUspsUseAuthorization({
      basis: manifest.use_authorization?.basis,
      permissionReference: manifest.use_authorization?.permission_reference,
    });
    if (normalizedAuthorization.redistribution_authorized !== manifest.use_authorization?.redistribution_authorized
      || normalizedAuthorization.permission_reference !== manifest.use_authorization?.permission_reference) {
      throw new Error("USPS use authorization fields are inconsistent.");
    }
  } catch (error) {
    failures.push({ path: "manifest.json", reason: error.message });
  }
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const actual = await hashFile(artifactPath);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  try {
    const artifact = manifest.artifacts.find((candidate) => candidate.artifact_type === "usps-operational-zip-assignment-jsonl");
    if (!artifact) throw new Error("missing normalized assignment artifact");
    const rows = (await readFile(path.join(releaseDirectory, artifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== artifact.record_count || rows.length !== manifest.coverage.current_area_district_zip_assignment_denominator) throw new Error("assignment count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate normalized ZIP assignment");
    if (rows.some((row) => row.assignment_status !== "listed-in-current-usps-area-district-file"
      || row.deliverability_status !== "not-asserted" || row.zcta_status !== "not-asserted")) {
      throw new Error("normalized row overstates source semantics");
    }
    const expectedExportPolicy = manifest.use_authorization.redistribution_authorized ? "permission-governed" : "local-restricted";
    if (rows.some((row) => row.export_policy !== expectedExportPolicy)) throw new Error("normalized row export policy mismatch");
  } catch (error) {
    failures.push({ path: "derived/operational-zip-assignments.jsonl", reason: error.message });
  }
  if (failures.length > 0) {
    const error = new Error(`USPS operational ZIP release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_month: manifest.source_month,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
    export_policy: manifest.export_policy,
  };
}
