import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { crc32 } from "node:zlib";
import {
  buildNcuaQuarterly,
  discoverNcuaQuarterlySource,
  normalizeNcuaBranch,
  normalizeNcuaInstitution,
  normalizeNcuaTradeName,
  verifyNcuaQuarterly,
} from "./ncua-quarterly.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const cycle = "3/31/2026 0:00:00";
const institutionHeaders = [
  "CU_NUMBER", "CYCLE_DATE", "JOIN_NUMBER", "RSSD", "CU_TYPE", "CU_NAME", "CITY", "STATE", "CharterState", "STATE_CODE", "ZIP_CODE",
  "COUNTY_CODE", "CONG_DIST", "SMSA", "ATTENTION_OF", "STREET", "REGION", "SE", "DISTRICT", "YEAR_OPENED", "TOM_CODE", "LIMITED_INC",
  "ISSUE_DATE", "Peer_Group", "Quarter_Flag", "IsMDI", "INSURED_DATE", "AM_DateHeld",
];
const branchHeaders = [
  "CU_NUMBER", "CYCLE_DATE", "JOIN_NUMBER", "SiteId", "CU_NAME", "SiteName", "SiteTypeName", "MainOffice", "PhysicalAddressLine1",
  "PhysicalAddressLine2", "PhysicalAddressCity", "PhysicalAddressStateCode", "PhysicalAddressPostalCode", "PhysicalAddressCountyName2",
  "PhysicalAddressCountry", "MailingAddressLine1", "MailingAddressLine2", "MailingAddressCity", "MailingAddressStateCode", "MailingAddressStateName",
  "MailingAddressPostalCode", "PhoneNumber", "HoursOfOperation", "MemberServices", "ATM", "DriveThru", "Shrd_Serv_Cntr_Net",
];
const tradeNameHeaders = ["CU_NUMBER", "CycleDate", "JoinNumber", "CU_NAME", "TradeNamesId", "TradeName"];

function institution(overrides = {}) {
  return {
    CU_NUMBER: "100", CYCLE_DATE: cycle, JOIN_NUMBER: "500", RSSD: "12345", CU_TYPE: "1", CU_NAME: "FIXTURE CREDIT UNION",
    CITY: "CHICAGO", STATE: "IL", CharterState: "IL", STATE_CODE: "17", ZIP_CODE: "60601", COUNTY_CODE: "31", CONG_DIST: "1",
    SMSA: "0", ATTENTION_OF: "", STREET: "10 MAIN ST", REGION: "1", SE: "A", DISTRICT: "1", YEAR_OPENED: "2000", TOM_CODE: "00",
    LIMITED_INC: "1", ISSUE_DATE: "1/1/2000 0:00:00", Peer_Group: "4", Quarter_Flag: "0", IsMDI: "True",
    INSURED_DATE: "1/1/2000 0:00:00", AM_DateHeld: "3/1/2026 0:00:00", ...overrides,
  };
}

function branch(overrides = {}) {
  return {
    CU_NUMBER: "100", CYCLE_DATE: cycle, JOIN_NUMBER: "500", SiteId: "700", CU_NAME: "FIXTURE CREDIT UNION", SiteName: "FIXTURE MAIN",
    SiteTypeName: "Corporate Office", MainOffice: "Yes", PhysicalAddressLine1: "10 MAIN ST", PhysicalAddressLine2: "",
    PhysicalAddressCity: "CHICAGO", PhysicalAddressStateCode: "IL", PhysicalAddressPostalCode: "60601-1234", PhysicalAddressCountyName2: "Cook",
    PhysicalAddressCountry: "United States", MailingAddressLine1: "PO BOX 1", MailingAddressLine2: "", MailingAddressCity: "CHICAGO",
    MailingAddressStateCode: "IL", MailingAddressStateName: "Illinois", MailingAddressPostalCode: "60601", PhoneNumber: "3125550100",
    HoursOfOperation: "M-F 9-5", MemberServices: "1", ATM: "1", DriveThru: "0", Shrd_Serv_Cntr_Net: "1", ...overrides,
  };
}

function context() {
  return {
    runId: "ncua-fixture-run",
    retrievedAt: "2026-08-30T16:00:00.000Z",
    cycleDate: "2026-03-31",
    sourceReleaseId: "ncua-fixture-source",
    insuredCharters: new Set(["100", "200"]),
    baselineByZip: new Map([["60601", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:60601", geoid: "60601" } }]]),
  };
}

function csv(headers, rows) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return Buffer.from(`${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))].map((row) => row.map(quote).join(",")).join("\n")}\n`);
}

function storeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, contentValue] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const content = Buffer.isBuffer(contentValue) ? contentValue : Buffer.from(contentValue);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function fixtureArchive() {
  const institutions = [
    institution(),
    institution({ CU_NUMBER: "200", JOIN_NUMBER: "600", CU_TYPE: "2", CU_NAME: "SECOND CREDIT UNION", RSSD: "", ZIP_CODE: "01760", STATE: "MA", CharterState: "MA" }),
    institution({ CU_NUMBER: "300", JOIN_NUMBER: "900", CU_TYPE: "3", CU_NAME: "NOT FEDERALLY INSURED" }),
  ];
  const branches = [
    branch(),
    branch({ CU_NUMBER: "200", JOIN_NUMBER: "600", SiteId: "700", CU_NAME: "SECOND CREDIT UNION", SiteName: "SECOND BRANCH", MainOffice: "No", SiteTypeName: "Branch Office", PhysicalAddressPostalCode: "01760", PhysicalAddressStateCode: "MA", PhysicalAddressCity: "NATICK" }),
    branch({ SiteId: "701", PhysicalAddressCountry: "Germany", PhysicalAddressStateCode: "", PhysicalAddressPostalCode: "00000" }),
    branch({ CU_NUMBER: "300", JOIN_NUMBER: "900", SiteId: "702" }),
    branch({ SiteId: "703", PhysicalAddressPostalCode: "BAD" }),
  ];
  const names = [
    { CU_NUMBER: "100", CycleDate: cycle, JoinNumber: "500", CU_NAME: "FIXTURE CREDIT UNION", TradeNamesId: "1", TradeName: "FIXTURE CU" },
    { CU_NUMBER: "200", CycleDate: cycle, JoinNumber: "600", CU_NAME: "SECOND CREDIT UNION", TradeNamesId: "2", TradeName: "SECOND CU" },
    { CU_NUMBER: "300", CycleDate: cycle, JoinNumber: "900", CU_NAME: "NOT FEDERALLY INSURED", TradeNamesId: "3", TradeName: "EXCLUDED CU" },
  ];
  return storeZip({
    "FOICU.txt": csv(institutionHeaders, institutions),
    "FOICUDES.txt": "fixture descriptions\n",
    "Credit Union Branch Information.txt": csv(branchHeaders, branches),
    "TradeNames.txt": csv(tradeNameHeaders, names),
    "Report1.txt": "fixture report\n",
    "Readme.txt": "fixture readme\n",
  });
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["01760", "60601", "99999"].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: "zbp-and-zcta",
    current_usps_validity: { status: "unverified" },
    geography: { status: "2020-zcta-polygon-available", geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: "published", establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await writeFile(path.join(releaseDirectory, "derived", "zip-coverage.jsonl"), buffer);
  const manifest = {
    dataset_id: "census-zbp-baseline", release_id: "zbp-fixture", complete_national_release: true,
    geography_dependency: { dataset_id: "us-census-geography", release_id: "geo-fixture" },
    artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: buffer.length, sha256: sha256(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, "current.json");
  await writeFile(pointer, `${JSON.stringify({ manifest: "releases/zbp-fixture/manifest.json" })}\n`);
  return pointer;
}

test("discovers the newest final NCUA quarterly bulk archive", () => {
  const html = '<a href="/files/publications/analysis/call-report-data-2025-12.zip">Q4</a><a href="/files/publications/analysis/call-report-data-2026-03.zip">Q1</a>';
  assert.equal(discoverNcuaQuarterlySource(html).url, "https://ncua.gov/files/publications/analysis/call-report-data-2026-03.zip");
  assert.throws(() => discoverNcuaQuarterlySource('<a href="https://evil.test/call-report-data-2027-03.zip">bad</a>'), /Disallowed NCUA/);
});

test("normalizes federally insured institutions, composite branch identities, and trade names", () => {
  const organization = normalizeNcuaInstitution(institution(), context());
  assert.equal(organization.entity_candidates.organization_id, "organization:ncua_charter_100");
  assert.equal(organization.source_status.value, "ncua-federally-insured-credit-union-in-final-quarterly-call-report");
  const location = normalizeNcuaBranch(branch(), context());
  assert.equal(location.entity_candidates.physical_site_id, "site:ncua_charter_100_site_700");
  assert.equal(location.address.zip_code, "60601");
  assert.equal(location.address.postal_code, "60601");
  assert.equal(location.address.zip4, "1234");
  assert.deepEqual(location.reported_services, { member_services: true, atm: true, drive_through: false, shared_service_center_network: true });
  const otherName = normalizeNcuaTradeName({ CU_NUMBER: "100", CycleDate: cycle, TradeNamesId: "1", TradeName: "FIXTURE CU" }, context());
  assert.equal(otherName.organization_id, "organization:ncua_charter_100");
  assert.throws(() => normalizeNcuaInstitution(institution({ CU_TYPE: "3" }), context()), /not-federally-insured/);
  assert.throws(() => normalizeNcuaBranch(branch({ PhysicalAddressCountry: "Germany" }), context()), /branch-outside-us/);
});

test("builds and verifies a governed NCUA quarterly release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-ncua-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const archive = fixtureArchive();
  const fetchImpl = async (urlValue) => {
    const url = new URL(urlValue);
    if (url.pathname.endsWith("/quarterly-data")) return new Response('<a href="/files/publications/analysis/call-report-data-2026-03.zip">Select</a>', { status: 200 });
    return new Response(archive, { status: 200, headers: { "content-length": String(archive.length), etag: '"fixture"' } });
  };
  const result = await buildNcuaQuarterly({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    minimumInstitutions: 1,
    minimumLocations: 1,
    maximumQuarantineRate: 0.2,
    fetchImpl,
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.accepted_federally_insured_institutions, 2);
  assert.equal(result.manifest.coverage.excluded_non_federally_insured_institutions, 1);
  assert.equal(result.manifest.coverage.accepted_us_locations, 2);
  assert.equal(result.manifest.coverage.excluded_non_federally_insured_locations, 1);
  assert.equal(result.manifest.coverage.excluded_locations_outside_united_states, 1);
  assert.equal(result.manifest.coverage.accepted_trade_names, 2);
  assert.equal(result.manifest.coverage.quarantined_records, 1);
  const verified = await verifyNcuaQuarterly(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 3);
  const archiveArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "ncua-source-quarterly-zip");
  assert.equal((await readFile(path.join(result.releaseDirectory, archiveArtifact.path))).length, archive.length);
});
