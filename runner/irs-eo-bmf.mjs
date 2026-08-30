import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";

export const IRS_EO_BMF_SCHEMA_VERSION = "1.0.0";
export const IRS_EO_BMF_TRANSFORMATION_VERSION = "irs-eo-bmf@1.0.0";
export const IRS_EO_BMF_PAGE_URL = "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf";
export const IRS_EO_BMF_DICTIONARY_URL = "https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf";

export const IRS_EO_BMF_HEADERS = [
  "EIN", "NAME", "ICO", "STREET", "CITY", "STATE", "ZIP", "GROUP", "SUBSECTION", "AFFILIATION", "CLASSIFICATION", "RULING",
  "DEDUCTIBILITY", "FOUNDATION", "ACTIVITY", "ORGANIZATION", "STATUS", "TAX_PERIOD", "ASSET_CD", "INCOME_CD", "FILING_REQ_CD",
  "PF_FILING_REQ_CD", "ACCT_PD", "ASSET_AMT", "INCOME_AMT", "REVENUE_AMT", "NTEE_CD", "SORT_NAME",
];

export const IRS_EO_BMF_SCHEMA_FINGERPRINT = "a38b3d54a090793c40283f3fe8abfcc1bd5e14f5c245537e0ecab6ff956d0b18";

const REGION_FILES = ["eo1.csv", "eo2.csv", "eo3.csv", "eo4.csv"];
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const EXEMPT_STATUS = new Map([
  ["01", "unconditional-exemption"],
  ["02", "conditional-exemption"],
  ["12", "section-4947-a-2-trust"],
  ["25", "terminating-private-foundation-status-under-section-507-b-1-b"],
]);

const ORGANIZATION_TYPES = new Map([
  ["0", "source-code-not-defined-in-current-published-data-dictionary"],
  ["1", "corporation"],
  ["2", "trust"],
  ["3", "co-operative"],
  ["4", "partnership"],
  ["5", "association"],
  ["6", "source-code-not-defined-in-current-published-data-dictionary"],
]);

const AFFILIATIONS = new Map([
  ["0", "source-code-not-defined-in-current-published-data-dictionary"],
  ["1", "central-no-group-exemption"],
  ["2", "intermediate-no-group-exemption"],
  ["3", "independent"],
  ["6", "central-parent-group-ruling-not-church-or-501-c-1"],
  ["7", "intermediate-group-exemption"],
  ["8", "central-parent-group-ruling-church-or-501-c-1"],
  ["9", "subordinate-group-ruling"],
]);

const DEDUCTIBILITY = new Map([
  ["0", "source-code-not-defined-in-current-published-data-dictionary"],
  ["1", "contributions-deductible"],
  ["2", "contributions-not-deductible"],
  ["4", "contributions-deductible-by-treaty-foreign-organization"],
]);

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function postalCode(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{5})(?:-(\d{4}))?$/);
  if (!match || match[1] === "00000") return null;
  return { zip_code: match[1], postal_code: match[2] ? `${match[1]}-${match[2]}` : match[1], zip4: match[2] ?? null };
}

function yearMonth(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "000000") return null;
  const match = raw.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if (!match) throw new Error("invalid-year-month");
  return `${match[1]}-${match[2]}`;
}

function classificationCodes(value) {
  return [...new Set(String(value ?? "").split("").filter((code) => /^[1-9]$/.test(code)))];
}

function activityCodes(value) {
  const raw = String(value ?? "").replace(/\D/g, "").padEnd(9, "0").slice(0, 9);
  const codes = [raw.slice(0, 3), raw.slice(3, 6), raw.slice(6, 9)].filter((code) => code !== "000");
  return [...new Set(codes)];
}

function geography(zipCode, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, sourceRecordId) {
  return {
    source_id: "irs-eo-business-master-file-current-extract",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: IRS_EO_BMF_TRANSFORMATION_VERSION,
    policy_id: "irs-eo-bmf",
  };
}

export function normalizeIrsEoOrganization(source, context) {
  const ein = String(source.EIN ?? "").trim();
  const legalName = text(source.NAME);
  if (!/^\d{9}$/.test(ein) || !legalName) throw new Error("missing-organization-identity");
  const statusCode = String(source.STATUS ?? "").trim().padStart(2, "0");
  const statusDescription = EXEMPT_STATUS.get(statusCode);
  if (!statusDescription) throw new Error(`unexpected-exempt-status:${statusCode || "blank"}`);
  const state = text(source.STATE)?.toUpperCase() ?? null;
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("filing-address-outside-supported-us-scope");
  const postal = postalCode(source.ZIP);
  const street = text(source.STREET);
  const city = text(source.CITY);
  if (!postal || !street || !city) throw new Error("invalid-domestic-filing-address");
  const organizationCode = text(source.ORGANIZATION);
  if (organizationCode && !ORGANIZATION_TYPES.has(organizationCode)) throw new Error(`unexpected-organization-code:${organizationCode}`);
  const affiliationCode = text(source.AFFILIATION);
  if (affiliationCode && !AFFILIATIONS.has(affiliationCode)) throw new Error(`unexpected-affiliation-code:${affiliationCode}`);
  const deductibilityCode = text(source.DEDUCTIBILITY);
  if (deductibilityCode && !DEDUCTIBILITY.has(deductibilityCode)) throw new Error(`unexpected-deductibility-code:${deductibilityCode}`);
  const rulingMonth = yearMonth(source.RULING);
  const latestTaxPeriod = yearMonth(source.TAX_PERIOD);
  const accountingPeriodSource = text(source.ACCT_PD);
  const accountingPeriod = accountingPeriodSource === "00" ? null : accountingPeriodSource;
  if (accountingPeriod && !/^(0[1-9]|1[0-2])$/.test(accountingPeriod)) throw new Error("invalid-accounting-period");
  const sortName = text(source.SORT_NAME);
  const sourceRecordId = `organization:${ein}`;
  return {
    schema_version: IRS_EO_BMF_SCHEMA_VERSION,
    normalized_record_id: `irs-eo-bmf:${sourceRecordId}`,
    entity_candidates: { organization_id: `organization:irs_ein_${ein}`, identity_status: "provisional" },
    external_identifiers: [{ type: "ein", value: ein, source_field: "EIN", disclosure_scope: "irs-exempt-organization-public-record" }],
    legal_name: legalName,
    other_names: sortName && sortName.toUpperCase() !== legalName.toUpperCase() ? [{ name: sortName, name_type: "irs-sort-name-secondary-name-line" }] : [],
    reported_filing_address: {
      street,
      unit_or_additional: null,
      city,
      state,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      country: "US",
      address_scope: "irs-filing-or-headquarters-address-not-verified-physical-operating-site",
    },
    geography: geography(postal.zip_code, context.baselineByZip),
    tax_exempt_profile: {
      exempt_status: { code: statusCode, description: statusDescription },
      subsection_code: text(source.SUBSECTION),
      classification_codes: classificationCodes(source.CLASSIFICATION),
      organization_type: organizationCode ? { code: organizationCode, description: ORGANIZATION_TYPES.get(organizationCode) } : null,
      affiliation: affiliationCode ? { code: affiliationCode, description: AFFILIATIONS.get(affiliationCode) } : null,
      group_exemption_number: text(source.GROUP) && text(source.GROUP) !== "0000" ? text(source.GROUP) : null,
      ruling_year_month: rulingMonth,
      deductibility: deductibilityCode ? { code: deductibilityCode, description: DEDUCTIBILITY.get(deductibilityCode) } : null,
      foundation_code: text(source.FOUNDATION),
      activity_codes: activityCodes(source.ACTIVITY),
      ntee_code: text(source.NTEE_CD),
      latest_return_tax_period: latestTaxPeriod,
      filing_requirement_code: text(source.FILING_REQ_CD),
      private_foundation_filing_requirement_code: text(source.PF_FILING_REQ_CD),
      accounting_period_month: accountingPeriod,
    },
    source_status: {
      value: "listed-in-current-irs-eo-bmf-extract-as-of-source-posting",
      scope: "Present in the current cumulative IRS EO BMF extract, whose exempt-status codes are current and whose revoked organizations are removed; not proof of current operations, a public storefront, the current physical location, or contribution deductibility beyond the reported deductibility code",
      source_posting_date: context.sourcePostingDate,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function decodeHtmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function postingDate(value) {
  const match = String(value).match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s+(\d{4})$/i);
  if (!match) return null;
  const months = new Map([
    ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"], ["may", "05"], ["jun", "06"],
    ["jul", "07"], ["aug", "08"], ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
  ]);
  return `${match[3]}-${months.get(match[1].toLowerCase())}-${match[2].padStart(2, "0")}`;
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  const allowedPath = type === "page"
    ? url.pathname === "/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf"
    : /^\/pub\/irs-soi\/eo[1-4]\.csv$/i.test(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "www.irs.gov" || !allowedPath || url.search || url.hash) {
    throw new Error(`Disallowed IRS EO BMF ${type} URL ${url.origin}${url.pathname}.`);
  }
  return url;
}

export function discoverIrsEoBmf(html, pageUrl = IRS_EO_BMF_PAGE_URL) {
  const plain = decodeHtmlText(html);
  const dateMatch = plain.match(/Updated data posting date:\s*([A-Z][a-z]{2}\.? ?\s*\d{1,2},\s*\d{4})/i);
  const sourcePostingDate = dateMatch ? postingDate(dateMatch[1].replace(/\s+/g, " ").trim()) : null;
  if (!sourcePostingDate) throw new Error("IRS EO BMF source posting date was not discovered.");
  const countMatch = plain.match(/Record count:\s*([\d,]+)/i);
  const recordCount = countMatch ? Number(countMatch[1].replaceAll(",", "")) : NaN;
  if (!Number.isInteger(recordCount) || recordCount < 1) throw new Error("IRS EO BMF claimed record count was not discovered.");
  const regions = new Map();
  for (const match of html.matchAll(/href=["']([^"']*\/eo([1-4])\.csv)["']/gi)) {
    const url = assertAllowedUrl(new URL(match[1], pageUrl), "csv");
    regions.set(`eo${match[2]}.csv`, url.toString());
  }
  if (regions.size !== 4 || REGION_FILES.some((name) => !regions.has(name))) throw new Error("IRS EO BMF page does not expose the four required regional CSVs.");
  return { sourcePostingDate, recordCount, regions: REGION_FILES.map((name) => ({ name, url: regions.get(name) })) };
}

async function request(urlValue, { fetchImpl, type, method = "GET", accept }) {
  const url = assertAllowedUrl(urlValue, type);
  const response = await fetchImpl(url, {
    method,
    headers: { Accept: accept, "Accept-Encoding": "identity", "User-Agent": "CoTive-Collector/0.1" },
    redirect: "error",
    signal: AbortSignal.timeout(method === "HEAD" || type === "page" ? 60_000 : 30 * 60_000),
  });
  if (!response.ok) throw new Error(`IRS EO BMF ${method} ${url.pathname} failed with HTTP ${response.status} ${response.statusText}.`);
  return response;
}

function responseMetadata(response) {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  return {
    content_length: Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null,
    content_encoding: text(response.headers.get("content-encoding")),
    last_modified: text(response.headers.get("last-modified")),
    etag: text(response.headers.get("etag")),
    content_type: text(response.headers.get("content-type")),
  };
}

async function validateSourceFile(filename, maximumBytes = 800_000_000) {
  const fileStat = await stat(filename);
  if (!fileStat.isFile() || fileStat.size < 100 || fileStat.size > maximumBytes) throw new Error(`IRS EO BMF source file size ${fileStat.size} is outside the allowed range.`);
  return fileStat.size;
}

async function acquireRegion({ region, destination, sourceDirectory, metadata, fetchImpl }) {
  if (sourceDirectory) {
    const source = path.join(sourceDirectory, region.name);
    const inputBytes = await validateSourceFile(source);
    let sourceMetadata = metadata?.[region.name] ?? null;
    if (!sourceMetadata) sourceMetadata = responseMetadata(await request(region.url, { fetchImpl, type: "csv", method: "HEAD", accept: "text/csv" }));
    if (!sourceMetadata.content_encoding && sourceMetadata.content_length !== null && sourceMetadata.content_length !== inputBytes) throw new Error(`${region.name} local size does not match official metadata.`);
    const temporary = `${destination}.tmp-${randomUUID()}`;
    await copyFile(source, temporary);
    await rename(temporary, destination);
    return { ...sourceMetadata, access_method: "explicit-local-copy-validated-against-official-metadata" };
  }
  const response = await request(region.url, { fetchImpl, type: "csv", accept: "text/csv" });
  if (!response.body) throw new Error(`${region.name} response has no body.`);
  const sourceMetadata = responseMetadata(response);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > 800_000_000) callback(new Error(`${region.name} exceeds the 800 MB acquisition limit.`));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(temporary, { flags: "wx" }));
  if (!sourceMetadata.content_encoding && sourceMetadata.content_length !== null && sourceMetadata.content_length !== bytes) throw new Error(`${region.name} size does not match Content-Length.`);
  await validateSourceFile(temporary);
  await rename(temporary, destination);
  return { ...sourceMetadata, access_method: "streamed-official-https-download" };
}

async function forEachCsvRow(filename, expectedFingerprint, consume) {
  let schemaFingerprint = null;
  const parser = parse({
    bom: true,
    columns: (headers) => {
      schemaFingerprint = sha256(headers.join("\u0000"));
      if (headers.length !== IRS_EO_BMF_HEADERS.length || headers.some((header, index) => header !== IRS_EO_BMF_HEADERS[index])) {
        throw new Error(`IRS EO BMF schema changed (${schemaFingerprint}).`);
      }
      if (schemaFingerprint !== expectedFingerprint) throw new Error(`IRS EO BMF schema fingerprint is not pinned (${schemaFingerprint}).`);
      return headers;
    },
    skip_empty_lines: true,
    max_record_size: 100_000,
  });
  const source = createReadStream(filename);
  source.on("error", (error) => parser.destroy(error));
  source.pipe(parser);
  let records = 0;
  for await (const row of parser) {
    await consume(row);
    records += 1;
  }
  if (!schemaFingerprint) throw new Error(`${path.basename(filename)} has no header row.`);
  return { records, schemaFingerprint };
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

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriters(writers, artifactType) {
  const completion = writers.map((writer) => finished(writer.output));
  for (const writer of writers) writer.gzip.end();
  await Promise.all(completion);
  const artifacts = [];
  for (const writer of writers) {
    await rename(writer.temporary, writer.destination);
    artifacts.push({ path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType });
  }
  return artifacts;
}

function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.on("error", () => {});
    writer.output.on("error", () => {});
    writer.gzip.destroy();
    writer.output.destroy();
  }
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const base = path.dirname(pointerPath);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP baseline has no ZIP coverage artifact.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const buffer = await readFile(artifactPath);
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error("Census ZBP coverage checksum failed.");
  const rows = buffer.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: IRS_EO_BMF_SCHEMA_VERSION,
      zip_code: zipCode,
      irs_eo_bmf_current_snapshot: {
        status: count ? "published-current-exempt-organizations-with-filing-address" : "no-organization-filing-address-in-current-source-snapshot",
        organization_filing_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_posting_date: context.sourcePostingDate,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in an IRS EO filing address but is outside the current ZBP/ZCTA union." },
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildIrsEoBmf({
  outputRoot,
  zbpPointer,
  sourceDirectory = null,
  discoveryHtml = null,
  sourceMetadata = null,
  minimumOrganizations = 1_500_000,
  maximumQuarantineRate = 0.005,
  schemaFingerprint = IRS_EO_BMF_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `irs-eo-bmf-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  let sourcePageMetadata = null;
  if (!discoveryHtml) {
    const pageResponse = await request(IRS_EO_BMF_PAGE_URL, { fetchImpl, type: "page", accept: "text/html" });
    sourcePageMetadata = responseMetadata(pageResponse);
    discoveryHtml = await pageResponse.text();
  }
  const discovery = discoverIrsEoBmf(discoveryHtml);
  if (discovery.sourcePostingDate > retrievedAt.slice(0, 10)) throw new Error("IRS EO BMF source posting date is after retrieval date.");
  const acquisitions = [];
  for (const region of discovery.regions) {
    const destination = path.join(stagingDirectory, "source", region.name);
    const metadata = await acquireRegion({ region, destination, sourceDirectory, metadata: sourceMetadata, fetchImpl });
    acquisitions.push({ ...region, ...metadata, ...(await hashFile(destination)) });
  }
  const sourceDigest = sha256(`${discovery.sourcePostingDate}\u0000${acquisitions.map((item) => item.sha256).join("\u0000")}`);
  const sourceReleaseId = `irs-eo-bmf-${discovery.sourcePostingDate}-${sourceDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourcePostingDate: discovery.sourcePostingDate, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/ein-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const eins = new Set();
  const countsByZip = new Map();
  const stateCounts = new Map();
  const statusCounts = new Map();
  const subsectionCounts = new Map();
  const quarantineReasonCounts = new Map();
  const observedSourceCodeCounts = new Map([
    ["ORGANIZATION", new Map()],
    ["AFFILIATION", new Map()],
    ["DEDUCTIBILITY", new Map()],
  ]);
  const regionCounts = {};
  let sourceRecords = 0;
  let accepted = 0;
  let excludedOutsideUsScope = 0;
  let quarantined = 0;
  let unknownRulingDateSentinelRecords = 0;
  let unknownAccountingPeriodSentinelRecords = 0;
  try {
    for (const acquisition of acquisitions) {
      const filename = path.join(stagingDirectory, "source", acquisition.name);
      const table = await forEachCsvRow(filename, schemaFingerprint, async (source) => {
        sourceRecords += 1;
        for (const [field, counts] of observedSourceCodeCounts) {
          const value = String(source[field] ?? "").trim() || "(blank)";
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        if (String(source.RULING ?? "").trim() === "000000") unknownRulingDateSentinelRecords += 1;
        if (String(source.ACCT_PD ?? "").trim() === "00") unknownAccountingPeriodSentinelRecords += 1;
        const ein = String(source.EIN ?? "").trim();
        if (/^\d{9}$/.test(ein)) {
          if (eins.has(ein)) throw new Error(`IRS EO BMF contains duplicate EIN ${ein}.`);
          eins.add(ein);
        }
        const state = text(source.STATE)?.toUpperCase() ?? null;
        if (!US_STATE_AND_TERRITORY_CODES.has(state)) {
          excludedOutsideUsScope += 1;
          return;
        }
        try {
          const normalized = normalizeIrsEoOrganization(source, context);
          await writeGzipRecord(writers.get(ein[0]), normalized);
          const zipCode = normalized.reported_filing_address.zip_code;
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
          const statusCode = normalized.tax_exempt_profile.exempt_status.code;
          statusCounts.set(statusCode, (statusCounts.get(statusCode) ?? 0) + 1);
          const subsection = normalized.tax_exempt_profile.subsection_code ?? "unknown";
          subsectionCounts.set(subsection, (subsectionCounts.get(subsection) ?? 0) + 1);
          accepted += 1;
        } catch (error) {
          quarantineReasonCounts.set(error.message, (quarantineReasonCounts.get(error.message) ?? 0) + 1);
          await writeGzipRecord(quarantineWriter, { source_type: "organization", source_id: /^\d{9}$/.test(ein) ? ein : null, reason: error.message });
          quarantined += 1;
        }
      });
      regionCounts[acquisition.name] = table.records;
      acquisition.schema_fingerprint = table.schemaFingerprint;
      acquisition.record_count = table.records;
      logger(`Processed ${sourceRecords.toLocaleString("en-US")} IRS EO BMF source records.`);
    }
    if (sourceRecords !== discovery.recordCount) throw new Error(`IRS EO BMF parsed ${sourceRecords} records; source page claims ${discovery.recordCount}.`);
    if (accepted + excludedOutsideUsScope + quarantined !== sourceRecords) throw new Error("IRS EO BMF source records are not fully accounted.");
    if (accepted < minimumOrganizations) throw new Error(`IRS EO BMF accepted organization count ${accepted} is below the ${minimumOrganizations} quality floor.`);
    if (quarantined / Math.max(1, accepted + quarantined) > maximumQuarantineRate) {
      throw new Error(`IRS EO BMF quarantine rate exceeds ${maximumQuarantineRate * 100}%; reasons=${JSON.stringify(Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])))}`);
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  const artifacts = acquisitions.map((item) => ({
    path: `source/${item.name}`,
    bytes: item.bytes,
    sha256: item.sha256,
    record_count: item.record_count,
    artifact_type: "irs-eo-bmf-source-region-csv",
    export_policy: "internal",
  }));
  artifacts.push(...await closeGzipWriters([...writers.values()], "normalized-irs-eo-organization-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  const observedSourceCodes = Object.fromEntries([...observedSourceCodeCounts].map(([field, counts]) => [
    field,
    Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right))),
  ]));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "irs-eo-bmf-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    region_records: regionCounts,
    accepted_organizations: accepted,
    excluded_outside_supported_us_scope: excludedOutsideUsScope,
    quarantined_records: quarantined,
    quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    observed_source_code_values: observedSourceCodes,
    unknown_ruling_date_000000_records: unknownRulingDateSentinelRecords,
    unknown_accounting_period_00_records: unknownAccountingPeriodSentinelRecords,
    exempt_status_codes: Object.fromEntries([...statusCounts].sort(([left], [right]) => left.localeCompare(right))),
    subsection_codes: Object.fromEntries([...subsectionCounts].sort(([left], [right]) => left.localeCompare(right))),
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
  }), { artifact_type: "irs-eo-bmf-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_page: IRS_EO_BMF_PAGE_URL,
    data_dictionary_url: IRS_EO_BMF_DICTIONARY_URL,
    source_posting_date: discovery.sourcePostingDate,
    source_page_claimed_record_count: discovery.recordCount,
    source_page_metadata: sourcePageMetadata,
    regions: acquisitions.map((item) => ({
      name: item.name,
      url: item.url,
      bytes: item.bytes,
      sha256: item.sha256,
      record_count: item.record_count,
      schema_fingerprint: item.schema_fingerprint,
      content_length: item.content_length,
      content_encoding: item.content_encoding,
      content_type: item.content_type,
      etag: item.etag,
      last_modified: item.last_modified,
      access_method: item.access_method,
    })),
  }), { artifact_type: "irs-eo-bmf-source-release-metadata" }));
  const manifest = {
    schema_version: IRS_EO_BMF_SCHEMA_VERSION,
    dataset_id: "irs-eo-bmf-organizations",
    connector: { id: "irs-eo-bmf", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_posting_date: discovery.sourcePostingDate,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_current_eo_bmf_snapshot: true,
    coverage: {
      source_records: sourceRecords,
      source_page_claimed_records: discovery.recordCount,
      accepted_current_exempt_organizations: accepted,
      excluded_outside_supported_us_scope: excludedOutsideUsScope,
      quarantined_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
      unknown_ruling_date_000000_records: unknownRulingDateSentinelRecords,
      unknown_accounting_period_00_records: unknownAccountingPeriodSentinelRecords,
    },
    observed_source_code_values: observedSourceCodes,
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      maximum_quarantine_rate: maximumQuarantineRate,
      actual_quarantine_rate: quarantined / Math.max(1, accepted + quarantined),
      quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "United States Internal Revenue Service",
      source_page: IRS_EO_BMF_PAGE_URL,
      data_dictionary_url: IRS_EO_BMF_DICTIONARY_URL,
      access_method: sourceDirectory ? "explicit local copies of the four official regional CSVs" : "streamed public official regional CSVs over HTTPS",
      api_key_used: false,
      policy_profile: "config/source-policies/irs-eo-bmf.json",
    },
    limitations: [
      "EO BMF covers organizations recognized by the IRS under included exempt-status codes, not every nonprofit, exempt organization, U.S. business, employer, or operating establishment.",
      "The IRS filing address generally represents headquarters but may be a mailing address or P.O. box and may not represent any operating location; no physical site or establishment is created from it.",
      "Current-extract membership and an EO status code are federal tax-status evidence, not independent proof of current operations, public access, licensure, or a physical location.",
      "The current extract excludes self-declared organizations, churches and other organizations that were not required to apply and did not apply, and split-interest trusts.",
      "The ICO in-care-of personal-contact field is retained only in internal source CSVs and excluded from normalized and registry records.",
      "Asset, income, and revenue amounts are retained only in internal source CSVs and excluded pending a separate time-aware financial-data contract.",
      "Group exemption and affiliation codes are preserved as source classifications; no canonical parent, subordinate, or ownership relationship is inferred.",
      "International and unsupported address rows are counted exclusions; current USPS ZIP validity remains unverified until an authoritative denominator is integrated.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(temporaryPointer, json({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json`, updated_at: retrievedAt }));
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published IRS EO BMF release is not a directory.");
  logger(`Published ${accepted.toLocaleString("en-US")} current IRS exempt organizations.`);
  return { manifest, releaseDirectory, pointerPath };
}

async function forEachGzipRecord(filename, consume) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    await consume(JSON.parse(line));
    count += 1;
  }
  return count;
}

function containsExcludedSourceField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedSourceField);
  if (!value || typeof value !== "object") return false;
  const excludedKeys = new Set(["ico", "in_care_of", "asset_amt", "income_amt", "revenue_amt"]);
  return Object.entries(value).some(([key, child]) => excludedKeys.has(key.toLowerCase()) || containsExcludedSourceField(child));
}

export async function verifyIrsEoBmf(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "irs-eo-bmf-organizations" || manifest.status !== "published" || !manifest.complete_current_eo_bmf_snapshot) {
    failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  }
  for (const artifact of manifest.artifacts ?? []) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const sourceArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "irs-eo-bmf-source-region-csv") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-irs-eo-organization-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 4 || sourceArtifacts.some((artifact) => artifact.export_policy !== "internal")) failures.push({ path: "manifest.json", reason: "expected four internal regional source CSVs" });
  if (normalizedArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized IRS EIN partitions" });
  if (quarantineArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one quarantine artifact" });
  if (sourceArtifacts.length === 4) {
    const ordered = [...sourceArtifacts].sort((left, right) => left.path.localeCompare(right.path));
    const digest = sha256(`${manifest.source_posting_date}\u0000${ordered.map((item) => item.sha256).join("\u0000")}`);
    if (manifest.source_release_id !== `irs-eo-bmf-${manifest.source_posting_date}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to posting date and four source checksums" });
    if (ordered.reduce((sum, item) => sum + item.record_count, 0) !== manifest.coverage?.source_records) failures.push({ path: "manifest.json", reason: "regional source counts do not reconcile" });
  }
  if (manifest.coverage?.source_records !== manifest.coverage?.source_page_claimed_records) failures.push({ path: "manifest.json", reason: "parsed and source-page record counts differ" });
  if ((manifest.coverage?.accepted_current_exempt_organizations ?? 0) + (manifest.coverage?.excluded_outside_supported_us_scope ?? 0) + (manifest.coverage?.quarantined_records ?? 0) !== manifest.coverage?.source_records) {
    failures.push({ path: "manifest.json", reason: "source records are not fully accounted" });
  }
  const quarantineReasonTotal = Object.values(manifest.quality_gates?.quarantine_reasons ?? {}).reduce((sum, count) => sum + count, 0);
  if (quarantineReasonTotal !== manifest.coverage?.quarantined_records) failures.push({ path: "manifest.json", reason: "quarantine reasons do not reconcile" });
  if ((manifest.quality_gates?.actual_quarantine_rate ?? 1) > (manifest.quality_gates?.maximum_quarantine_rate ?? 0)) failures.push({ path: "manifest.json", reason: "published release exceeds quarantine quality gate" });
  const eins = new Set();
  const countsByZip = new Map();
  let accepted = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const partition = artifact.path.match(/ein-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const ein = record.external_identifiers?.find((item) => item.type === "ein")?.value;
        if (!/^\d{9}$/.test(ein ?? "") || eins.has(ein)) throw new Error(`duplicate or missing EIN ${ein}`);
        if (ein[0] !== partition || record.entity_candidates?.organization_id !== `organization:irs_ein_${ein}`) throw new Error(`invalid EIN partition or organization identity for ${ein}`);
        if (!/^\d{5}$/.test(record.reported_filing_address?.zip_code ?? "")) throw new Error(`invalid filing ZIP for ${ein}`);
        if (record.source_status?.value !== "listed-in-current-irs-eo-bmf-extract-as-of-source-posting" || record.source_status.source_posting_date !== manifest.source_posting_date) throw new Error(`invalid source status for ${ein}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "irs-eo-bmf" || record.export_policy !== "public") throw new Error(`invalid provenance for ${ein}`);
        if (record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`physical entity inferred for ${ein}`);
        if (containsExcludedSourceField(record)) throw new Error(`excluded field leaked for ${ein}`);
        eins.add(ein);
        const zipCode = record.reported_filing_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual normalized line count mismatch" });
      accepted += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (accepted !== manifest.coverage?.accepted_current_exempt_organizations) failures.push({ path: "manifest.json", reason: "accepted organization count does not reconcile" });
  if (quarantineArtifacts.length === 1) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, quarantineArtifacts[0].path), () => {});
      if (count !== quarantineArtifacts[0].record_count || count !== manifest.coverage?.quarantined_records) throw new Error("quarantine count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "irs-eo-bmf-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      if (rows.reduce((sum, row) => sum + row.irs_eo_bmf_current_snapshot.organization_filing_address_count, 0) !== accepted) throw new Error("ZIP organization counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.irs_eo_bmf_current_snapshot.organization_filing_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`IRS EO BMF release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
