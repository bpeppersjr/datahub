import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const HUD_USPS_SCHEMA_VERSION = "1.0.0";
export const HUD_USPS_API_URL = "https://www.huduser.gov/hudapi/public/usps";

function integer(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

export function normalizeHudUspsConfig(config = {}) {
  const year = integer(config.year, "year");
  const quarter = integer(config.quarter, "quarter");
  if (year < 2021 || year > 2100) throw new Error("year must be from 2021 through 2100.");
  if (quarter < 1 || quarter > 4) throw new Error("quarter must be from 1 through 4.");
  return { year, quarter };
}

function zip5(value) {
  const result = String(value ?? "").padStart(5, "0");
  if (!/^\d{5}$/.test(result)) throw new Error(`Invalid HUD ZIP ${value}.`);
  return result;
}

function countyFips(value) {
  const result = String(value ?? "").padStart(5, "0");
  if (!/^\d{5}$/.test(result)) throw new Error(`Invalid HUD county GEOID ${value}.`);
  return result;
}

function ratio(value, name) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be null or a number from 0 through 1.`);
  }
  return parsed;
}

function valueFrom(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return null;
}

function responseEnvelopes(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  return data && typeof data === "object" ? [data] : [];
}

function requireHudToken(token) {
  if (typeof token !== "string" || token.trim().length < 8) {
    throw new Error("HUD_USPS_API_TOKEN is required; create one in the HUD USER account portal and provide it through the environment or local secret store.");
  }
  return token.trim();
}

export function normalizeHudUspsResponse(payload, expectedConfig) {
  const config = normalizeHudUspsConfig(expectedConfig);
  const normalized = [];
  let sourceYear = null;
  for (const envelope of responseEnvelopes(payload)) {
    const year = integer(envelope.year ?? config.year, "response year");
    const quarterText = String(envelope.quarter ?? `Q${config.quarter}`).toUpperCase();
    const quarter = Number(quarterText.replace(/^Q/, ""));
    if (year !== config.year || quarter !== config.quarter) {
      throw new Error(`HUD returned ${year} ${quarterText}; expected ${config.year} Q${config.quarter}.`);
    }
    if (envelope.crosswalk_type && envelope.crosswalk_type !== "zip-county") {
      throw new Error(`HUD returned unexpected crosswalk type ${envelope.crosswalk_type}.`);
    }
    sourceYear = year;
    const results = envelope.results;
    if (!Array.isArray(results)) throw new Error("HUD response has no results array.");
    for (const row of results) {
      const inputZip = /^\d{5}$/.test(String(envelope.input ?? envelope.query ?? ""))
        ? envelope.input ?? envelope.query
        : null;
      normalized.push({
        zip_code: zip5(valueFrom(row, "zip", "ZIP", "Zip") ?? inputZip),
        county_fips: countyFips(valueFrom(row, "county", "COUNTY", "geoid", "GEOID")),
        residential_ratio: ratio(valueFrom(row, "res_ratio", "RES_RATIO"), "res_ratio"),
        business_ratio: ratio(valueFrom(row, "bus_ratio", "BUS_RATIO"), "bus_ratio"),
        other_ratio: ratio(valueFrom(row, "oth_ratio", "OTH_RATIO"), "oth_ratio"),
        total_ratio: ratio(valueFrom(row, "tot_ratio", "TOT_RATIO", "total_ratio", "TOTAL_RATIO"), "tot_ratio"),
        preferred_city: valueFrom(row, "city", "CITY", "usps_zip_pref_city", "USPS_ZIP_PREF_CITY"),
        preferred_state: valueFrom(row, "state", "STATE", "usps_zip_pref_state", "USPS_ZIP_PREF_STATE"),
        source_year: year,
        source_quarter: quarter,
      });
    }
  }
  if (sourceYear === null || normalized.length === 0) throw new Error("HUD response contains no ZIP-county rows.");
  const keys = normalized.map((row) => `${row.zip_code}:${row.county_fips}`);
  if (new Set(keys).size !== keys.length) throw new Error("HUD response contains duplicate ZIP-county rows.");
  return normalized.sort((a, b) => a.zip_code.localeCompare(b.zip_code) || a.county_fips.localeCompare(b.county_fips));
}

function quarterPeriod(year, quarter) {
  const startMonth = String(((quarter - 1) * 3) + 1).padStart(2, "0");
  const endDates = ["03-31", "06-30", "09-30", "12-31"];
  return { from: `${year}-${startMonth}-01`, to: `${year}-${endDates[quarter - 1]}` };
}

function provenanceFor(row, context) {
  return {
    source_id: "hud-usps-zip-county",
    source_release_id: `hud-usps-${row.source_year}-q${row.source_quarter}`,
    source_record_id: `${row.zip_code}:${row.county_fips}`,
    ingest_run_id: context.runId,
    transformation_version: "hud-usps-zip-crosswalk@1.0.0",
    policy_id: "hud-usps-zip-crosswalk",
  };
}

export function buildHudZipEvidence(rows, context) {
  const byZip = Map.groupBy(rows, (row) => row.zip_code);
  const zipEvidence = [];
  const crosswalk = [];
  for (const [zipCode, zipRows] of [...byZip].sort(([a], [b]) => a.localeCompare(b))) {
    const preferred = [...zipRows].sort(
      (a, b) => (b.business_ratio ?? b.total_ratio ?? -1) - (a.business_ratio ?? a.total_ratio ?? -1),
    )[0];
    const period = quarterPeriod(preferred.source_year, preferred.source_quarter);
    zipEvidence.push({
      schema_version: HUD_USPS_SCHEMA_VERSION,
      zip_code: zipCode,
      observation_status: "observed-in-quarterly-address-crosswalk",
      authoritative_master_status: "incomplete-source",
      limitation: "HUD excludes PO Box-only ZIPs and may omit a small number of ungeocoded active ZIPs.",
      preferred_city: preferred.preferred_city,
      preferred_state: preferred.preferred_state,
      primary_county_fips: preferred.county_fips,
      county_count: zipRows.length,
      source_year: preferred.source_year,
      source_quarter: preferred.source_quarter,
      observation_period: period,
      observed_at: context.retrievedAt,
      provenance: provenanceFor(preferred, context),
    });
    for (const row of zipRows) {
      crosswalk.push({
        schema_version: HUD_USPS_SCHEMA_VERSION,
        ...row,
        observation_period: period,
        observed_at: context.retrievedAt,
        provenance: provenanceFor(row, context),
      });
    }
  }
  return { zipEvidence, crosswalk };
}

export async function fetchHudUsps(config, token, { fetchImpl = globalThis.fetch, retries = 3 } = {}) {
  const authorizedToken = requireHudToken(token);
  const url = new URL(HUD_USPS_API_URL);
  url.searchParams.set("type", "2");
  url.searchParams.set("query", "All");
  url.searchParams.set("year", String(config.year));
  url.searchParams.set("quarter", String(config.quarter));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${authorizedToken}`,
        },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status === 401) throw new Error("HUD authentication failed; replace or refresh HUD_USPS_API_TOKEN.");
      if (response.status === 403) throw new Error("HUD account is not registered for the USPS ZIP Crosswalk API.");
      if (response.status === 404) throw new Error(`HUD has no ZIP-county data for ${config.year} Q${config.quarter}.`);
      if (!response.ok) throw new Error(`HUD API returned HTTP ${response.status}.`);
      return { payload: await response.json(), requestUrl: url.toString() };
    } catch (error) {
      lastError = error;
      if (attempt === retries || /authentication|not registered|has no ZIP-county/.test(error.message)) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function loadCountyDependency(geographyPointer) {
  const pointer = JSON.parse(await readFile(geographyPointer, "utf8"));
  const manifestPath = path.resolve(path.dirname(geographyPointer), pointer.manifest);
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "us-census-geography" || !manifest.complete_national_release) {
    throw new Error("A complete us-census-geography release is required.");
  }
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/index/counties.jsonl");
  if (!artifact) throw new Error("Geography release has no county index.");
  const buffer = await readFile(path.join(path.dirname(manifestPath), artifact.path));
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) {
    throw new Error("Geography county index failed checksum verification.");
  }
  return {
    countyFips: new Set(buffer.toString("utf8").trim().split("\n").map((line) => JSON.parse(line).geoid)),
    releaseId: manifest.release_id,
    manifestSha256: sha256(manifestBuffer),
  };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildHudUspsCrosswalk({
  outputRoot,
  geographyPointer,
  config,
  token,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!geographyPointer) throw new Error("geographyPointer is required.");
  const normalizedConfig = normalizeHudUspsConfig(config);
  const authorizedToken = requireHudToken(token);
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const geography = await loadCountyDependency(geographyPointer);
  const response = await fetchHudUsps(normalizedConfig, authorizedToken, { fetchImpl });
  const rows = normalizeHudUspsResponse(response.payload, normalizedConfig);
  const evidence = buildHudZipEvidence(rows, { runId, retrievedAt });
  const unmatchedCounties = [...new Set(rows.filter((row) => !geography.countyFips.has(row.county_fips)).map((row) => row.county_fips))];
  if (unmatchedCounties.length > 0) {
    throw new Error(`HUD response contains ${unmatchedCounties.length} county GEOID(s) absent from the current Census geography release.`);
  }

  const releaseId = `hud-usps-${normalizedConfig.year}-q${normalizedConfig.quarter}-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  artifacts.push(await writeArtifact(stagingDirectory, "source/response.json", json(response.payload), {
    artifact_type: "source-json",
    record_count: rows.length,
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-county-crosswalk.jsonl", jsonLines(evidence.crosswalk), {
    artifact_type: "zip-county-crosswalk-jsonl",
    record_count: evidence.crosswalk.length,
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-validity-evidence.jsonl", jsonLines(evidence.zipEvidence), {
    artifact_type: "zip-validity-evidence-jsonl",
    record_count: evidence.zipEvidence.length,
  }));

  const manifest = {
    schema_version: HUD_USPS_SCHEMA_VERSION,
    dataset_id: "hud-usps-zip-crosswalk",
    connector: { id: "hud-usps-zip-crosswalk", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_year: normalizedConfig.year,
    source_quarter: normalizedConfig.quarter,
    status: "published",
    complete_source_release: true,
    complete_authoritative_zip_registry: false,
    coverage: {
      observed_zip_codes: evidence.zipEvidence.length,
      zip_county_rows: evidence.crosswalk.length,
      matched_county_geoids: new Set(rows.map((row) => row.county_fips)).size,
      unmatched_county_geoids: 0,
      po_box_only_zip_codes: null,
      hud_ungeocoded_active_zip_codes: null,
    },
    geography_dependency: {
      dataset_id: "us-census-geography",
      release_id: geography.releaseId,
      manifest_sha256: geography.manifestSha256,
    },
    source: {
      source_id: "hud-usps-zip-county",
      publisher: "U.S. Department of Housing and Urban Development, derived from USPS Vacancy Data",
      request_url: response.requestUrl,
      authorization_recorded: false,
      policy_profile: "config/source-policies/hud-usps-zip-crosswalk.json",
    },
    limitations: [
      "HUD-USPS crosswalk records originate from address-based USPS Vacancy Data and are not the complete USPS ZIP master list.",
      "PO Box-only ZIP Codes are excluded.",
      "HUD documents that less than one percent of active ZIP Codes can be omitted when address records cannot be geocoded.",
      "ZIP Codes can cross county and state boundaries; ratios must be retained rather than selecting a county without a documented purpose-specific rule.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseId);
  await mkdir(releasesDirectory, { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  };
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json(pointer), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published HUD-USPS release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyHudUspsRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "hud-usps-zip-crosswalk") throw new Error("Unexpected HUD-USPS dataset manifest.");
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const digest = await hashFile(artifactPath);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) {
        failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
      }
      const text = await readFile(artifactPath, "utf8");
      if (/Bearer\s+[A-Za-z0-9._~-]+/i.test(text) || /authorization/i.test(text)) {
        failures.push({ path: artifact.path, reason: "possible authorization material in artifact" });
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const validityArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/zip-validity-evidence.jsonl");
  const crosswalkArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/zip-county-crosswalk.jsonl");
  try {
    const validity = (await readFile(path.join(releaseDirectory, validityArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
    const crosswalk = (await readFile(path.join(releaseDirectory, crosswalkArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
    if (new Set(validity.map((row) => row.zip_code)).size !== validity.length) failures.push({ path: validityArtifact.path, reason: "duplicate ZIP evidence" });
    if (new Set(crosswalk.map((row) => `${row.zip_code}:${row.county_fips}`)).size !== crosswalk.length) failures.push({ path: crosswalkArtifact.path, reason: "duplicate ZIP-county records" });
    if (validity.length !== manifest.coverage.observed_zip_codes || crosswalk.length !== manifest.coverage.zip_county_rows) {
      failures.push({ path: "manifest.json", reason: "coverage counts do not match artifacts" });
    }
    if (validity.some((row) => row.authoritative_master_status !== "incomplete-source")) {
      failures.push({ path: validityArtifact.path, reason: "unsupported complete-master assertion" });
    }
  } catch (error) {
    failures.push({ path: "derived", reason: `structural validation failed: ${error.message}` });
  }
  if (failures.length > 0) {
    const error = new Error(`HUD-USPS release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_period: `${manifest.source_year} Q${manifest.source_quarter}`,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
  };
}
