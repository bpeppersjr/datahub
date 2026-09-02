import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGunzip } from "node:zlib";
import {
  buildWaLniActiveContractors,
  normalizeWaLniActiveContractorOrganization,
  requestWaLniJson,
  schemaFingerprint,
  verifyWaLniActiveContractors,
  WA_LNI_CONTRACTOR_FIELDS,
  WA_LNI_CONTRACTOR_SCHEMA,
  WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT,
} from "./wa-lni-active-contractor-licenses.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function metadata(overrides = {}) {
  return {
    id: "m8qx-ubtq",
    name: "L&I Contractor License Data - General",
    attribution: "Labor & Industries",
    license: "Public Domain",
    licenseId: "PDDL",
    provenance: "official",
    publicationStage: "published",
    rowsUpdatedAt: 1_788_301_741,
    selectedRecordCount: 5,
    columns: WA_LNI_CONTRACTOR_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })),
    ...overrides,
  };
}

function contractor(overrides = {}) {
  return {
    businessname: "Alpha Builders LLC",
    contractorlicensenumber: "ALPHABL001Q1",
    contractorlicensetypecode: "G",
    contractorlicensetypecodedesc: "GENERAL",
    address1: "100 Pine St",
    address2: "Suite 200",
    city: "Seattle",
    state: "WA",
    zip: "98101-1234",
    licenseeffectivedate: "2020-01-02T00:00:00.000",
    licenseexpirationdate: "2027-01-02T00:00:00.000",
    businesstypecode: "LLC",
    businesstypecodedesc: "LIMITED LIABILITY COMPANY",
    specialtycode1: "01",
    specialtycode1desc: "GENERAL CONTRACTOR",
    specialtycode2: null,
    specialtycode2desc: null,
    ubi: "601000001",
    statuscode: "A",
    contractorlicensestatus: "ACTIVE",
    contractorlicensesuspenddate: null,
    ...overrides,
  };
}

function context() {
  return {
    runId: "wa-lni-fixture-run",
    retrievedAt: "2026-09-01T20:00:00.000Z",
    sourceRowsUpdatedAt: "2026-09-01T19:35:41.000Z",
    sourceReleaseId: "wa-lni-fixture-source",
    baselineByZip: new Map([["98101", { geography: { status: "2020-zcta-polygon-available", geo_id: "zcta:98101", geoid: "98101" } }]]),
  };
}

async function writeBaseline(root) {
  const releaseDirectory = path.join(root, "releases", "zbp-fixture");
  await mkdir(path.join(releaseDirectory, "derived"), { recursive: true });
  const rows = ["98101", "98102", "99201", "99999"].map((zipCode) => ({
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

async function gunzipRecords(filename) {
  const compressed = await readFile(filename);
  const chunks = [];
  const stream = createGunzip();
  stream.on("data", (chunk) => chunks.push(chunk));
  stream.end(compressed);
  await new Promise((resolve, reject) => stream.on("end", resolve).on("error", reject));
  return Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
}

test("pins the 21 selected Washington L&I fields and excludes personal-data fields", () => {
  assert.equal(WA_LNI_CONTRACTOR_FIELDS.length, 21);
  assert.equal(sha256(WA_LNI_CONTRACTOR_SCHEMA.map(([field, type]) => `${field}:${type}`).join("\u0000")), WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT);
  assert.equal(schemaFingerprint(metadata().columns), WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT);
  assert.equal(WA_LNI_CONTRACTOR_FIELDS.includes("phonenumber"), false);
  assert.equal(WA_LNI_CONTRACTOR_FIELDS.includes("primaryprincipalname"), false);
});

test("groups active licenses by UBI without inferring sites, legal names, or operations", () => {
  const normalized = normalizeWaLniActiveContractorOrganization([
    contractor({ phonenumber: "206-555-0100", primaryprincipalname: "Private Person" }),
    contractor({ contractorlicensenumber: "ALPHABL002Q2", businessname: "Alpha Builders", address1: "200 Lake Ave", address2: null, zip: "98102" }),
  ], context());
  assert.equal(normalized.entity_candidates.organization_id, "organization:wa_ubi_601000001");
  assert.equal(normalized.entity_candidates.physical_site_id, undefined);
  assert.equal(normalized.entity_candidates.establishment_id, undefined);
  assert.deepEqual(normalized.reported_business_names, ["Alpha Builders", "Alpha Builders LLC"]);
  assert.equal(normalized.reported_mailing_addresses.length, 2);
  assert.equal(normalized.active_contractor_license_activities.length, 2);
  assert.equal(normalized.source_status.general_operating_status_inferred, false);
  assert.equal(normalized.export_policy, "local-review-only");
  assert.equal(JSON.stringify(normalized).includes("Private Person"), false);
  assert.equal(JSON.stringify(normalized).includes("206-555"), false);
  const leadingZero = normalizeWaLniActiveContractorOrganization([contractor({ ubi: "34003739", contractorlicensenumber: "HBPAI**379N9" })], context());
  assert.equal(leadingZero.entity_candidates.organization_id, "organization:wa_ubi_034003739");
  assert.throws(() => normalizeWaLniActiveContractorOrganization([contractor({ contractorlicensestatus: "EXPIRED", statuscode: "E" })], context()), /outside-selected/);
  assert.throws(() => normalizeWaLniActiveContractorOrganization([contractor({ ubi: "bad" })], context()), /invalid-organization/);
  assert.throws(() => normalizeWaLniActiveContractorOrganization([contractor(), contractor()], context()), /duplicate-or-missing/);
});

test("retries transient source responses and rejects redirects", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const result = await requestWaLniJson("https://data.wa.gov/api/views/m8qx-ubtq", { fetchImpl, type: "metadata", sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  await assert.rejects(() => requestWaLniJson("https://data.wa.gov/api/views/m8qx-ubtq", {
    type: "metadata",
    fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://example.invalid" } }),
  }), /redirect rejected/);
});

test("builds and independently verifies a grouped Washington L&I release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-wa-lni-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const rows = [
    contractor(),
    contractor({ contractorlicensenumber: "ALPHABL002Q2", businessname: "Alpha Builders", address1: "200 Lake Ave", address2: null, zip: "98102" }),
    contractor({ ubi: "601000002", contractorlicensenumber: "BETA001Q1", businessname: "Beta Construction", address1: "1 Main St", address2: null, city: "Spokane", zip: "99201" }),
    contractor({ ubi: "601000003", contractorlicensenumber: "EMPTY001Q1", businessname: null, address1: "2 Main St", address2: null, city: "Spokane", zip: "99201" }),
    contractor({ ubi: "601000004", contractorlicensenumber: "GAMMA001Q1", businessname: "Gamma Contracting", address1: "3 North Rd", address2: null, city: "Vancouver", state: "BC", zip: "V6B 1A1" }),
  ];
  const result = await buildWaLniActiveContractors({
    outputRoot: path.join(root, "output"),
    zbpPointer: await writeBaseline(path.join(root, "zbp")),
    catalogMetadata: metadata(),
    sourceRecords: rows,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date("2026-09-01T20:00:00.000Z"),
  });
  assert.equal(result.manifest.coverage.source_active_contractor_license_rows, 5);
  assert.equal(result.manifest.coverage.organizations_published, 3);
  assert.equal(result.manifest.coverage.active_contractor_license_activities, 4);
  assert.equal(result.manifest.coverage.grouped_multi_license_organizations, 1);
  assert.equal(result.manifest.coverage.reported_business_names, 4);
  assert.equal(result.manifest.coverage.reported_mailing_addresses, 4);
  assert.equal(result.manifest.coverage.eligible_reported_us_mailing_addresses, 3);
  assert.equal(result.manifest.coverage.organizations_without_eligible_us_zip_address, 1);
  assert.equal(result.manifest.coverage.quarantined_organization_groups, 1);
  assert.equal(result.manifest.coverage.quarantined_source_rows, 1);
  assert.equal(result.manifest.coverage.physical_sites, null);
  const verified = await verifyWaLniActiveContractors(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(verified.coverage.zip_union_records, 4);
  const normalizedArtifacts = result.manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-wa-lni-active-contractor-organization-jsonl-gzip");
  const normalized = (await Promise.all(normalizedArtifacts.map((artifact) => gunzipRecords(path.join(result.releaseDirectory, artifact.path))))).flat();
  assert.equal(normalized.length, 3);
  assert.equal(normalized.every((record) => record.entity_candidates.physical_site_id === undefined && record.export_policy === "local-review-only"), true);
  const sourceArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === "wa-lni-active-contractor-licenses-source-jsonl-gzip");
  assert.equal(sourceArtifact.export_policy, "internal");
  const source = await gunzipRecords(path.join(result.releaseDirectory, sourceArtifact.path));
  assert.equal(source.every((record) => !("phonenumber" in record) && !("primaryprincipalname" in record)), true);
  const current = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(current.release_id, result.manifest.release_id);
});

test("blocks schema drift, duplicate source keys, and pre-cancelled runs", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "datahub-wa-lni-invalid-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const zbpPointer = await writeBaseline(path.join(root, "zbp"));
  const drift = metadata({ columns: metadata().columns.map((column) => column.fieldName === "statuscode" ? { ...column, dataTypeName: "number" } : column), selectedRecordCount: 1 });
  await assert.rejects(() => buildWaLniActiveContractors({ outputRoot: path.join(root, "drift"), zbpPointer, catalogMetadata: drift, sourceRecords: [contractor()], minimumOrganizations: 1, logger: () => {} }), /selected schema changed/);
  await assert.rejects(() => buildWaLniActiveContractors({
    outputRoot: path.join(root, "duplicate"), zbpPointer, catalogMetadata: metadata({ selectedRecordCount: 2 }), sourceRecords: [contractor(), contractor()], minimumOrganizations: 1, logger: () => {},
  }), /strictly increasing/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => buildWaLniActiveContractors({
    outputRoot: path.join(root, "cancelled"), zbpPointer, catalogMetadata: metadata({ selectedRecordCount: 1 }), sourceRecords: [contractor()], minimumOrganizations: 1, signal: controller.signal, logger: () => {},
  }), { name: "AbortError" });
});
