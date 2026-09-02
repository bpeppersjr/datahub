import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildIrsEoBmf,
  discoverIrsEoBmf,
  IRS_EO_BMF_HEADERS,
  IRS_EO_BMF_SCHEMA_FINGERPRINT,
  normalizeIrsEoOrganization,
  verifyIrsEoBmf,
} from "./irs-eo-bmf.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function csv(headers, rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))].map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

function organization(overrides = {}) {
  return {
    EIN: "123456789",
    NAME: "Fixture Community Foundation",
    ICO: "Jane Private Contact",
    STREET: "10 Main St",
    CITY: "Chicago",
    STATE: "IL",
    ZIP: "60601-1234",
    GROUP: "0000",
    SUBSECTION: "03",
    AFFILIATION: "3",
    CLASSIFICATION: "1200",
    RULING: "200101",
    DEDUCTIBILITY: "1",
    FOUNDATION: "15",
    ACTIVITY: "123456789",
    ORGANIZATION: "1",
    STATUS: "01",
    TAX_PERIOD: "202512",
    ASSET_CD: "7",
    INCOME_CD: "6",
    FILING_REQ_CD: "01",
    PF_FILING_REQ_CD: "0",
    ACCT_PD: "12",
    ASSET_AMT: "2500000",
    INCOME_AMT: "900000",
    REVENUE_AMT: "850000",
    NTEE_CD: "T30",
    SORT_NAME: "Fixture Foundation",
    ...overrides,
  };
}

function discoveryHtml(recordCount) {
  return `<!doctype html><html><body>
    <p>Updated data posting date: Aug. 11, 2026</p>
    <p>Record count: ${recordCount.toLocaleString("en-US")}</p>
    <a href="https://www.irs.gov/pub/irs-soi/eo1.csv">Region 1</a>
    <a href="/pub/irs-soi/eo2.csv">Region 2</a>
    <a href="/pub/irs-soi/eo3.csv">Region 3</a>
    <a href="/pub/irs-soi/eo4.csv">Region 4</a>
  </body></html>`;
}

function context() {
  return {
    runId: "irs-eo-fixture-run",
    retrievedAt: "2026-08-30T18:00:00.000Z",
    sourcePostingDate: "2026-08-11",
    sourceReleaseId: "irs-eo-fixture-source",
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00956", "10001", "60601", "73301", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline",
    release_id: "zbp-fixture",
    complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

async function writeRegions(root, rowsByRegion, headers = IRS_EO_BMF_HEADERS) {
  await mkdir(root, { recursive: true });
  const metadata = {};
  for (let index = 1; index <= 4; index += 1) {
    const name = `eo${index}.csv`;
    const buffer = Buffer.from(csv(headers, rowsByRegion[index - 1] ?? []));
    await writeFile(path.join(root, name), buffer);
    metadata[name] = {
      content_length: buffer.length,
      last_modified: `Mon, 10 Aug 2026 17:11:0${index} GMT`,
      etag: `fixture-${index}`,
      content_type: "text/csv",
    };
  }
  return metadata;
}

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the documented 28-column IRS EO BMF schema", () => {
  assert.equal(IRS_EO_BMF_HEADERS.length, 28);
  assert.equal(sha256(IRS_EO_BMF_HEADERS.join("\u0000")), IRS_EO_BMF_SCHEMA_FINGERPRINT);
});

test("discovers the posting date, claimed count, and four exact regional files", () => {
  const result = discoverIrsEoBmf(discoveryHtml(1_957_340));
  assert.equal(result.sourcePostingDate, "2026-08-11");
  assert.equal(result.recordCount, 1_957_340);
  assert.deepEqual(result.regions.map((region) => region.name), ["eo1.csv", "eo2.csv", "eo3.csv", "eo4.csv"]);
  assert.throws(() => discoverIrsEoBmf(discoveryHtml(1).replace("eo4.csv", "eo5.csv")), /four required regional CSVs/);
});

test("normalizes an IRS exempt organization without inferring a physical site or exporting personal and financial fields", () => {
  const normalized = normalizeIrsEoOrganization(organization(), context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:irs_ein_123456789");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.reported_filing_address.postal_code, "60601");
  assert.equal(normalized.reported_filing_address.zip4, "1234");
  assert.equal(normalized.reported_filing_address.address_scope, "irs-filing-or-headquarters-address-not-verified-physical-operating-site");
  assert.equal(normalized.tax_exempt_profile.exempt_status.code, "01");
  assert.deepEqual(normalized.other_names, [{ name: "Fixture Foundation", name_type: "irs-sort-name-secondary-name-line" }]);
  const serialized = JSON.stringify(normalized);
  assert.equal(serialized.includes("Jane Private Contact"), false);
  assert.equal(serialized.includes("2500000"), false);
  const sentinelCodes = normalizeIrsEoOrganization(organization({ ORGANIZATION: "6", AFFILIATION: "0", DEDUCTIBILITY: "0", RULING: "000000", ACCT_PD: "00" }), context());
  assert.equal(sentinelCodes.tax_exempt_profile.organization_type.description, "source-code-not-defined-in-current-published-data-dictionary");
  assert.equal(sentinelCodes.tax_exempt_profile.affiliation.description, "source-code-not-defined-in-current-published-data-dictionary");
  assert.equal(sentinelCodes.tax_exempt_profile.deductibility.description, "source-code-not-defined-in-current-published-data-dictionary");
  assert.equal(sentinelCodes.tax_exempt_profile.ruling_year_month, null);
  assert.equal(sentinelCodes.tax_exempt_profile.accounting_period_month, null);
  assert.throws(() => normalizeIrsEoOrganization(organization({ STATE: "" }), context()), /outside-supported-us-scope/);
  assert.throws(() => normalizeIrsEoOrganization(organization({ STATUS: "99" }), context()), /unexpected-exempt-status/);
});

test("builds and independently verifies a governed IRS EO BMF organization release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-irs-eo-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rowsByRegion = [
    [organization({ SORT_NAME: "ICO" }), organization({ EIN: "223456789", NAME: "New York Arts Trust", CITY: "New York", STATE: "NY", ZIP: "10001", ORGANIZATION: "2", STATUS: "02" })],
    [organization({ EIN: "323456789", NAME: "Texas Education Association", CITY: "Austin", STATE: "TX", ZIP: "73301", ORGANIZATION: "5", STATUS: "12" })],
    [organization({ EIN: "423456789", NAME: "Puerto Rico Community Fund", CITY: "Bayamon", STATE: "PR", ZIP: "00956", STATUS: "25" })],
    [organization({ EIN: "523456789", NAME: "Foreign Organization", STREET: "1 International Rd", CITY: "London", STATE: "", ZIP: "00000" }), organization({ EIN: "623456789", NAME: "Missing Domestic Address", STREET: "", CITY: "Chicago", STATE: "IL", ZIP: "60601" })],
  ];
  const sourceDirectory = path.join(root, "source");
  const result = await buildIrsEoBmf({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    sourceDirectory,
    discoveryHtml: discoveryHtml(6),
    sourceMetadata: await writeRegions(sourceDirectory, rowsByRegion),
    minimumOrganizations: 1,
    maximumQuarantineRate: 0.5,
    logger: () => {},
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_records, 6);
  assert.equal(result.manifest.coverage.accepted_current_exempt_organizations, 4);
  assert.equal(result.manifest.coverage.excluded_outside_supported_us_scope, 1);
  assert.equal(result.manifest.coverage.quarantined_records, 1);
  assert.equal(result.manifest.coverage.states_and_territories, 4);
  const verified = await verifyIrsEoBmf(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 5);
  const partition = result.manifest.artifacts.find((artifact) => artifact.path === "derived/organizations/ein-prefix=1.jsonl.gz");
  const records = await gunzipRecords(path.join(result.releaseDirectory, partition.path));
  assert.equal(records.length, 1);
  assert.equal(records[0].entity_candidates.physical_site_id, undefined);
  assert.equal(JSON.stringify(records[0]).includes("Jane Private Contact"), false);
  const sourceArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "irs-eo-bmf-source-region-csv");
  assert.equal(sourceArtifacts.length, 4);
  assert.equal(sourceArtifacts.every((artifact) => artifact.export_policy === "internal"), true);
});

test("blocks unpinned IRS EO BMF schema drift", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-irs-eo-drift-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourceDirectory = path.join(root, "source");
  const headers = [...IRS_EO_BMF_HEADERS, "UNEXPECTED"];
  const sourceMetadata = await writeRegions(sourceDirectory, [[organization()], [], [], []], headers);
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  await assert.rejects(() => buildIrsEoBmf({
    outputRoot: path.join(root, "output"),
    zbpPointer,
    sourceDirectory,
    discoveryHtml: discoveryHtml(1),
    sourceMetadata,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-08-30T18:00:00.000Z"),
  }), /schema changed/);
});
