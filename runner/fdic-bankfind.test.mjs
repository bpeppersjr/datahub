import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildFdicBankfind, normalizeFdicInstitution, normalizeFdicLocation, verifyFdicBankfind } from "./fdic-bankfind.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const context = {
  runId: "fdic-fixture-run",
  retrievedAt: "2026-08-30T15:00:00.000Z",
  sourceUpdatedAt: "2026-08-28T11:57:32.000Z",
  sourceReleaseId: "fdic-bankfind-fixture",
  baselineByZip: new Map([["00100", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:00100", geoid: "00100" } }]]),
  activeCertificates: new Set(["100"]),
};

const institution = {
  CERT: 100,
  UNINUM: 500,
  NAME: "FIXTURE BANK",
  ACTIVE: 1,
  INACTIVE: 0,
  ADDRESS: "10 MAIN ST",
  ADDRESS2: "",
  CITY: "FIXTURE",
  STALP: "NY",
  STNAME: "New York",
  ZIP: "00100",
  COUNTY: "FIXTURE",
  STCNTY: "36001",
  LATITUDE: 42,
  LONGITUDE: -73,
  DATEUPDT: "08/28/2026",
  RUNDATE: "08/28/2026",
  ESTYMD: "01/01/2000",
  INSDATE: "01/01/2000",
  ENDEFYMD: "12/31/9999",
  WEBADDR: "www.fixture.test",
  LEI: "LEI-FIXTURE",
  FED_RSSD: "12345",
  BKCLASS: "NM",
  CHRTAGNT: "STATE",
  REGAGNT: "FDIC",
  OFFICES: 2,
  MDI_STATUS_CODE: "",
  MDI_STATUS_DESC: "NONE",
};

const location = {
  CERT: 100,
  FI_UNINUM: 500,
  UNINUM: 501,
  NAME: "FIXTURE BANK",
  OFFNAME: "FIXTURE BRANCH",
  OFFNUM: 1,
  MAINOFF: 0,
  ADDRESS: "20 OAK AVE",
  ADDRESS2: "",
  CITY: "FIXTURE",
  STALP: "NY",
  STNAME: "New York",
  ZIP: "00100",
  COUNTY: "FIXTURE",
  STCNTY: "36001",
  LATITUDE: 42.1,
  LONGITUDE: -73.1,
  ESTYMD: "01/01/2001",
  RUNDATE: "08/28/2026",
  SERVTYPE: 11,
  SERVTYPE_DESC: "FULL SERVICE - BRICK AND MORTAR",
  BKCLASS: "NM",
};

test("normalizes active FDIC institutions and current locations with scoped status", () => {
  const normalizedInstitution = normalizeFdicInstitution(institution, context);
  assert.equal(normalizedInstitution.entity_candidates.organization_id, "organization:fdic_cert_100");
  assert.equal(normalizedInstitution.source_status.value, "fdic-active-insured-institution-as-of-index");
  assert.match(normalizedInstitution.source_status.scope, /not a general statement/);
  assert.deepEqual(normalizedInstitution.headquarters.location.coordinates, [-73, 42]);
  assert.equal(normalizedInstitution.headquarters.address.zip_code, "00100");
  assert.equal(normalizedInstitution.headquarters.address.postal_code, "00100");
  assert.equal(normalizedInstitution.headquarters.address.zip4, null);
  assert.equal(normalizeFdicInstitution({ ...institution, LATITUDE: null, LONGITUDE: "" }, context).headquarters.location, null);
  const normalizedLocation = normalizeFdicLocation(location, context);
  assert.equal(normalizedLocation.entity_candidates.physical_site_id, "site:fdic_location_501");
  assert.equal(normalizedLocation.service_type.code, 11);
  assert.equal(normalizedLocation.address.zip_code, "00100");
  assert.equal(normalizedLocation.address.postal_code, "00100");
  assert.equal(normalizedLocation.address.zip4, null);
  assert.match(normalizedLocation.source_status.scope, /not independent confirmation of public access/);
});

test("rejects a location that cannot be joined to an active institution", () => {
  assert.throws(() => normalizeFdicLocation({ ...location, CERT: 999 }, context), /location-institution-not-active/);
});

test("classifies FDIC foreign offices as outside the U.S. scope", () => {
  const foreign = { ...location, ZIP: "0EC4R", STALP: "", STNAME: "", STCNTY: "00", CITY: "London", ADDRESS: "34 Moorgate" };
  assert.throws(() => normalizeFdicLocation(foreign, context), /location-outside-us/);
});

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["00100", "00200"].map((zipCode) => ({
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

function fdicFetch() {
  const institutions = [
    institution,
    { ...institution, CERT: 200, UNINUM: 600, NAME: "SECOND BANK", ZIP: "00200", ADDRESS: "30 ELM ST", OFFICES: 1 },
  ];
  const locations = [
    { ...location, MAINOFF: 1, UNINUM: 500, OFFNAME: "FIXTURE BANK", OFFNUM: 0 },
    { ...location, UNINUM: 501 },
    { ...location, CERT: 200, FI_UNINUM: 600, UNINUM: 600, NAME: "SECOND BANK", OFFNAME: "SECOND BANK", MAINOFF: 1, ZIP: "99998", ADDRESS: "30 ELM ST" },
    { ...location, CERT: 999, FI_UNINUM: 999, UNINUM: 999, NAME: "INACTIVE BANK", ZIP: "00200" },
  ];
  const indexes = {
    institutions: { name: "institutions_fixture", createTimestamp: "2026-08-28T11:57:32Z" },
    locations: { name: "locations_fixture", createTimestamp: "2026-08-28T11:46:40Z" },
  };
  return async (urlValue) => {
    const url = new URL(urlValue);
    const endpoint = url.pathname.endsWith("/institutions") ? "institutions" : "locations";
    const source = endpoint === "institutions" ? institutions : locations;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    return new Response(JSON.stringify({
      meta: { total: source.length, parameters: {}, index: indexes[endpoint] },
      data: source.slice(offset, offset + limit).map((data) => ({ data, score: 0 })),
      totals: { count: source.length },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("builds and verifies a coherent FDIC institution/location snapshot", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-fdic-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const result = await buildFdicBankfind({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    pageSize: 2,
    minimumInstitutions: 1,
    minimumLocations: 1,
    fetchImpl: fdicFetch(),
    logger: () => {},
    now: () => new Date("2026-08-30T16:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.accepted_active_institutions, 2);
  assert.equal(result.manifest.coverage.accepted_current_locations, 3);
  assert.equal(result.manifest.coverage.excluded_locations_without_active_institution, 1);
  assert.equal(result.manifest.coverage.excluded_locations_outside_united_states, 0);
  assert.equal(result.manifest.coverage.quarantined_records, 0);
  assert.equal(result.manifest.coverage.zip_union_records, 3);
  const verification = await verifyFdicBankfind(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verification.coverage.source_zip_codes, 2);
  const zipArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "fdic-zip-coverage-jsonl");
  const rows = (await readFile(path.join(result.releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(rows.find((row) => row.zip_code === "99998").baseline_coverage_status, "outside-zbp-zcta-union");
});
